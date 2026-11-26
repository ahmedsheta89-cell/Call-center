/**
 * @file server/core/durableIdempotency.ts
 * Crash-Consistent Durable Idempotency & Side-Effect Intent State Machine
 *
 * Lifecycle:
 *   RESERVED -> PROCESSING / SENDING -> COMMITTED / RELAY_ACCEPTED
 *   Failure / Crash States: FAILED_SAFE_TO_RETRY | AMBIGUOUS | RECONCILIATION_REQUIRED
 *
 * Guarantees:
 * - Every reservation is persisted atomically to disk BEFORE side effects.
 * - Unresolved reservations (RESERVED, PROCESSING, SENDING, AMBIGUOUS, RECONCILIATION_REQUIRED)
 *   NEVER expire merely because normal TTL elapsed.
 * - Startup/load reconciliation checks db.hasCommittedWebhookTx(txId) for webhooks/SIP
 *   and blocks automatic resend for interrupted SMTP SENDING intents.
 * - Fails closed if durable storage is corrupted or unwritable.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { writeVerifiedAtomicFileSync } from '../db/localPersistenceEngine.ts';
import { db } from '../db/store.ts';

export const DEFAULT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_IDEMPOTENCY_ENTRIES = 50000;

export type DurableIdempotencyState =
  | 'RESERVED'
  | 'PROCESSING'
  | 'SENDING'
  | 'COMMITTED'
  | 'RELAY_ACCEPTED'
  | 'AMBIGUOUS'
  | 'FAILED_SAFE_TO_RETRY'
  | 'RECONCILIATION_REQUIRED';

export type IdempotencyKind = 'webhook' | 'smtp' | 'sip_confirm';

export interface DurableIdempotencyEntry {
  state: DurableIdempotencyState;
  kind: IdempotencyKind;
  txId: string;
  bootId: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  metadata?: Record<string, string | boolean | number>;
}

interface DurableIdempotencyFile {
  schemaVersion: 2;
  entries: Record<string, DurableIdempotencyEntry>;
}

export interface ReserveResult {
  ok: boolean;
  reason?: 'DUPLICATE_EVENT' | 'CONCURRENT_IN_FLIGHT' | 'STORAGE_UNTRUSTED' | 'RECONCILIATION_REQUIRED';
  message?: string;
  existingMetadata?: Record<string, any>;
  existingState?: DurableIdempotencyState;
}

const VALID_STATES = new Set<DurableIdempotencyState>([
  'RESERVED',
  'PROCESSING',
  'SENDING',
  'COMMITTED',
  'RELAY_ACCEPTED',
  'AMBIGUOUS',
  'FAILED_SAFE_TO_RETRY',
  'RECONCILIATION_REQUIRED',
]);

const EXPIRABLE_STATES = new Set<DurableIdempotencyState>([
  'COMMITTED',
  'RELAY_ACCEPTED',
  'FAILED_SAFE_TO_RETRY',
]);

let currentBootId = crypto.randomUUID();
const inFlightKeys = new Set<string>();
let overrideIdempotencyFilePath: string | null = null;

/**
 * Simulates a fresh process boot (used by crash-recovery tests without spawning a new OS process).
 */
export function simulateProcessRestartForTesting(): void {
  currentBootId = crypto.randomUUID();
  inFlightKeys.clear();
}

export function setIdempotencyFilePathForTesting(filePath: string | null): void {
  overrideIdempotencyFilePath = filePath;
  inFlightKeys.clear();
}

export function getIdempotencyFilePath(): string {
  if (overrideIdempotencyFilePath) {
    return overrideIdempotencyFilePath;
  }
  const dbPath = db.getPersistFilePath();
  if (!dbPath) {
    throw new Error('IDEMPOTENCY_STORAGE_UNTRUSTED: No persistence path configured.');
  }
  return path.join(path.dirname(path.resolve(dbPath)), '.omniflow_idempotency.json');
}

function getEffectiveTtlMs(customTtlMs?: number): number {
  if (typeof customTtlMs === 'number' && Number.isFinite(customTtlMs) && customTtlMs > 0) {
    return customTtlMs;
  }
  const envVal = Number(process.env.OMNIFLOW_IDEMPOTENCY_TTL_MS);
  if (Number.isFinite(envVal) && envVal > 0) {
    return envVal;
  }
  return DEFAULT_IDEMPOTENCY_TTL_MS;
}

function isValidEntry(v: any): v is DurableIdempotencyEntry {
  return (
    v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    VALID_STATES.has(v.state) &&
    (v.kind === 'webhook' || v.kind === 'smtp' || v.kind === 'sip_confirm') &&
    typeof v.txId === 'string' &&
    v.txId.length > 0 &&
    typeof v.bootId === 'string' &&
    typeof v.createdAt === 'number' &&
    typeof v.expiresAt === 'number'
  );
}

function loadDurableStoreSync(filePath: string, now: number): { store: DurableIdempotencyFile; dirty: boolean } {
  if (!fs.existsSync(filePath)) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const probe = path.join(dir, `.idem-probe-${process.pid}-${Date.now()}.tmp`);
    fs.writeFileSync(probe, 'ok', 'utf8');
    fs.unlinkSync(probe);
    return { store: { schemaVersion: 2, entries: Object.create(null) }, dirty: false };
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as any;
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    parsed.schemaVersion !== 2 ||
    !parsed.entries ||
    typeof parsed.entries !== 'object' ||
    Array.isArray(parsed.entries)
  ) {
    throw new Error('IDEMPOTENCY_STORAGE_CORRUPT: Invalid idempotency store schema.');
  }

  let dirty = false;
  const pruned: Record<string, DurableIdempotencyEntry> = Object.create(null);

  for (const [k, rawEntry] of Object.entries(parsed.entries)) {
    if (!isValidEntry(rawEntry)) {
      throw new Error(`IDEMPOTENCY_STORAGE_CORRUPT: Malformed entry '${k}'.`);
    }

    const entry = { ...rawEntry };

    // Startup reconciliation for unfinished entries from a prior process/boot
    if (entry.bootId !== currentBootId) {
      if (entry.kind === 'smtp') {
        if (entry.state === 'RESERVED') {
          entry.state = 'FAILED_SAFE_TO_RETRY';
          entry.updatedAt = now;
          entry.bootId = currentBootId;
          dirty = true;
        } else if (entry.state === 'SENDING') {
          // Process crashed mid-SMTP send: must NOT automatically resend!
          entry.state = 'RECONCILIATION_REQUIRED';
          entry.updatedAt = now;
          entry.bootId = currentBootId;
          entry.metadata = { ...(entry.metadata || {}), interruptedInSending: true };
          dirty = true;
        }
      } else if (entry.kind === 'webhook' || entry.kind === 'sip_confirm') {
        if (entry.state === 'RESERVED' || entry.state === 'PROCESSING') {
          if (db.hasCommittedWebhookTx(entry.txId)) {
            // DB snapshot already durably contains this transaction! Promote to COMMITTED.
            entry.state = 'COMMITTED';
            entry.updatedAt = now;
            entry.bootId = currentBootId;
            entry.metadata = { ...(entry.metadata || {}), reconciledFromDb: true };
            dirty = true;
          } else {
            // DB snapshot does NOT contain this transaction -> never applied, safe for retry.
            entry.state = 'FAILED_SAFE_TO_RETRY';
            entry.updatedAt = now;
            entry.bootId = currentBootId;
            dirty = true;
          }
        }
      }
    }

    // NEVER expire unresolved external side-effect reservations merely because TTL elapsed
    if (EXPIRABLE_STATES.has(entry.state) && entry.expiresAt <= now) {
      dirty = true;
      continue;
    }

    pruned[k] = entry;
  }

  return { store: { schemaVersion: 2, entries: pruned }, dirty };
}

function saveDurableStoreSync(filePath: string, data: DurableIdempotencyFile): void {
  const keys = Object.keys(data.entries);
  if (keys.length > MAX_IDEMPOTENCY_ENTRIES) {
    // Only evict oldest COMPLETED/EXPIRABLE entries; preserve unresolved reservations
    const expirableKeys = keys
      .filter((k) => EXPIRABLE_STATES.has(data.entries[k].state))
      .sort((a, b) => (data.entries[a]?.createdAt || 0) - (data.entries[b]?.createdAt || 0));
    const overflow = keys.length - MAX_IDEMPOTENCY_ENTRIES;
    for (let i = 0; i < Math.min(overflow, expirableKeys.length); i++) {
      delete data.entries[expirableKeys[i]];
    }
  }
  writeVerifiedAtomicFileSync(filePath, JSON.stringify(data));
}

/**
 * Reconciles any unfinished reservations on startup against the durable DB snapshot.
 * Fails closed if idempotency storage is corrupted or unreadable.
 */
export function reconcileDurableIdempotencyOnStartup(): {
  ok: boolean;
  reconciledEntries: number;
  error?: string;
} {
  try {
    const filePath = getIdempotencyFilePath();
    const now = Date.now();
    const { store, dirty } = loadDurableStoreSync(filePath, now);
    if (dirty) {
      saveDurableStoreSync(filePath, store);
    }
    return { ok: true, reconciledEntries: Object.keys(store.entries).length };
  } catch (err: any) {
    return { ok: false, reconciledEntries: 0, error: err?.message || 'Reconciliation failed' };
  }
}

/**
 * Phase 1: Durably persists a RESERVED entry to disk BEFORE any side effects occur.
 */
export function reserveDurableIdempotencyKeys(
  keys: string[],
  options?: { kind?: IdempotencyKind; txId?: string; ttlMs?: number; metadata?: Record<string, string | boolean | number> }
): ReserveResult {
  if (keys.length === 0) {
    return { ok: true };
  }

  for (const key of keys) {
    if (inFlightKeys.has(key)) {
      return {
        ok: false,
        reason: 'CONCURRENT_IN_FLIGHT',
        message: 'Concurrent duplicate request in flight.',
      };
    }
  }

  const now = Date.now();
  const ttlMs = getEffectiveTtlMs(options?.ttlMs);
  const kind: IdempotencyKind = options?.kind || 'webhook';
  const txId = options?.txId || crypto.randomUUID();

  let filePath: string;
  let loaded: { store: DurableIdempotencyFile; dirty: boolean };
  try {
    filePath = getIdempotencyFilePath();
    loaded = loadDurableStoreSync(filePath, now);
  } catch (err: any) {
    return {
      ok: false,
      reason: 'STORAGE_UNTRUSTED',
      message: `Fail-closed: durable idempotency storage unavailable (${err?.message || 'unknown error'}).`,
    };
  }

  for (const key of keys) {
    const existing = loaded.store.entries[key];
    if (!existing) continue;

    if (existing.state === 'AMBIGUOUS' || existing.state === 'RECONCILIATION_REQUIRED') {
      return {
        ok: false,
        reason: 'RECONCILIATION_REQUIRED',
        message: `Operation '${key}' is in state '${existing.state}'; automatic retry is blocked pending reconciliation.`,
        existingMetadata: existing.metadata,
        existingState: existing.state,
      };
    }

    if (existing.state === 'RESERVED' || existing.state === 'PROCESSING' || existing.state === 'SENDING') {
      return {
        ok: false,
        reason: 'CONCURRENT_IN_FLIGHT',
        message: `Operation '${key}' is already '${existing.state}'.`,
        existingMetadata: existing.metadata,
        existingState: existing.state,
      };
    }

    if ((existing.state === 'COMMITTED' || existing.state === 'RELAY_ACCEPTED') && existing.expiresAt > now) {
      return {
        ok: false,
        reason: 'DUPLICATE_EVENT',
        message: 'Duplicate or replayed event rejected.',
        existingMetadata: existing.metadata,
        existingState: existing.state,
      };
    }
  }

  try {
    for (const key of keys) {
      loaded.store.entries[key] = {
        state: 'RESERVED',
        kind,
        txId,
        bootId: currentBootId,
        createdAt: now,
        updatedAt: now,
        expiresAt: now + ttlMs,
        metadata: options?.metadata,
      };
    }
    saveDurableStoreSync(filePath, loaded.store);
  } catch (err: any) {
    return {
      ok: false,
      reason: 'STORAGE_UNTRUSTED',
      message: `Fail-closed: could not persist durable reservation (${err?.message || 'write error'}).`,
    };
  }

  for (const key of keys) {
    inFlightKeys.add(key);
  }
  return { ok: true };
}

/**
 * Transitions reserved keys to a new durable state on disk (`PROCESSING`, `SENDING`, `COMMITTED`, `RELAY_ACCEPTED`, `AMBIGUOUS`, `FAILED_SAFE_TO_RETRY`, `RECONCILIATION_REQUIRED`).
 */
export function transitionDurableIdempotencyState(
  keys: string[],
  nextState: DurableIdempotencyState,
  options?: { ttlMs?: number; metadata?: Record<string, string | boolean | number> }
): void {
  if (keys.length === 0) return;

  const now = Date.now();
  const ttlMs = getEffectiveTtlMs(options?.ttlMs);
  const shouldReleaseInFlight =
    nextState === 'COMMITTED' ||
    nextState === 'RELAY_ACCEPTED' ||
    nextState === 'AMBIGUOUS' ||
    nextState === 'FAILED_SAFE_TO_RETRY' ||
    nextState === 'RECONCILIATION_REQUIRED';

  try {
    const filePath = getIdempotencyFilePath();
    const { store } = loadDurableStoreSync(filePath, now);
    for (const key of keys) {
      const existing = store.entries[key];
      if (!existing) {
        throw new Error(`IDEMPOTENCY_TRANSITION_ERROR: Missing reservation for '${key}'.`);
      }
      store.entries[key] = {
        ...existing,
        state: nextState,
        bootId: currentBootId,
        updatedAt: now,
        expiresAt: EXPIRABLE_STATES.has(nextState) ? now + ttlMs : existing.expiresAt,
        metadata: options?.metadata ? { ...(existing.metadata || {}), ...options.metadata } : existing.metadata,
      };
    }
    saveDurableStoreSync(filePath, store);
  } finally {
    if (shouldReleaseInFlight) {
      for (const key of keys) {
        inFlightKeys.delete(key);
      }
    }
  }
}

export function commitDurableIdempotencyKeys(
  keys: string[],
  options?: { ttlMs?: number; metadata?: Record<string, string | boolean | number> }
): void {
  transitionDurableIdempotencyState(keys, 'COMMITTED', options);
}

export function releaseDurableIdempotencyKeys(keys: string[]): void {
  try {
    transitionDurableIdempotencyState(keys, 'FAILED_SAFE_TO_RETRY');
  } catch {
    for (const key of keys) {
      inFlightKeys.delete(key);
    }
  }
}

export function lookupDurableIdempotencyKey(key: string): DurableIdempotencyEntry | null {
  const now = Date.now();
  const filePath = getIdempotencyFilePath();
  const { store, dirty } = loadDurableStoreSync(filePath, now);
  if (dirty) {
    saveDurableStoreSync(filePath, store);
  }
  const entry = store.entries[key];
  if (!entry) return null;
  if (EXPIRABLE_STATES.has(entry.state) && entry.expiresAt <= now) {
    return null;
  }
  return entry;
}
