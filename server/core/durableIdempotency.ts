/**
 * @file server/core/durableIdempotency.ts
 * Durable, Tenant-Scoped Idempotency & Webhook Replay Protection Store
 *
 * - Persists keys atomically to disk alongside the primary database state file.
 * - Namespaces keys by organization, provider, and account.
 * - Enforces in-flight concurrency locks to prevent race-condition duplicates.
 * - Fails closed when durable storage is corrupted or unwritable.
 * - Supports retention TTL expiry and two-phase reserve/commit/release so
 *   persistence failures never silently drop unprocessed events.
 */

import fs from 'fs';
import path from 'path';
import { writeVerifiedAtomicFileSync } from '../db/localPersistenceEngine.ts';
import { db } from '../db/store.ts';

export const DEFAULT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_IDEMPOTENCY_ENTRIES = 50000;

export interface DurableIdempotencyEntry {
  expiresAt: number;
  createdAt: number;
  metadata?: Record<string, string | boolean | number>;
}

interface DurableIdempotencyFile {
  schemaVersion: 1;
  entries: Record<string, DurableIdempotencyEntry>;
}

export interface ReserveResult {
  ok: boolean;
  reason?: 'DUPLICATE_EVENT' | 'CONCURRENT_IN_FLIGHT' | 'STORAGE_UNTRUSTED';
  message?: string;
  existingMetadata?: Record<string, any>;
}

const inFlightKeys = new Set<string>();
let overrideIdempotencyFilePath: string | null = null;

/**
 * Allows tests to override the durable idempotency file path explicitly.
 */
export function setIdempotencyFilePathForTesting(filePath: string | null): void {
  overrideIdempotencyFilePath = filePath;
  inFlightKeys.clear();
}

/**
 * Resolves the durable idempotency file path co-located with the DB persistence file.
 */
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

function loadDurableStoreSync(filePath: string, now: number): DurableIdempotencyFile {
  if (!fs.existsSync(filePath)) {
    // Verify parent directory is writable before trusting empty initial state
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const probe = path.join(dir, `.idem-probe-${process.pid}-${Date.now()}.tmp`);
    fs.writeFileSync(probe, 'ok', 'utf8');
    fs.unlinkSync(probe);
    return { schemaVersion: 1, entries: {} };
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as DurableIdempotencyFile;
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    parsed.schemaVersion !== 1 ||
    !parsed.entries ||
    typeof parsed.entries !== 'object' ||
    Array.isArray(parsed.entries)
  ) {
    throw new Error('IDEMPOTENCY_STORAGE_CORRUPT: Invalid idempotency store schema.');
  }

  // Prune expired entries on load
  const pruned: Record<string, DurableIdempotencyEntry> = Object.create(null);
  for (const [k, v] of Object.entries(parsed.entries)) {
    if (v && typeof v.expiresAt === 'number' && v.expiresAt > now) {
      pruned[k] = v;
    }
  }
  return { schemaVersion: 1, entries: pruned };
}

function saveDurableStoreSync(filePath: string, data: DurableIdempotencyFile): void {
  const keys = Object.keys(data.entries);
  if (keys.length > MAX_IDEMPOTENCY_ENTRIES) {
    // Evict oldest entries by createdAt
    keys.sort((a, b) => (data.entries[a]?.createdAt || 0) - (data.entries[b]?.createdAt || 0));
    const toRemove = keys.length - MAX_IDEMPOTENCY_ENTRIES;
    for (let i = 0; i < toRemove; i++) {
      delete data.entries[keys[i]];
    }
  }
  writeVerifiedAtomicFileSync(filePath, JSON.stringify(data));
}

/**
 * Phase 1: Checks durable storage and in-flight locks, reserving the given keys in memory.
 * Fails closed if durable storage is corrupted or unwritable.
 */
export function reserveDurableIdempotencyKeys(
  keys: string[],
  customTtlMs?: number
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

  let filePath: string;
  let store: DurableIdempotencyFile;
  const now = Date.now();
  try {
    filePath = getIdempotencyFilePath();
    store = loadDurableStoreSync(filePath, now);
  } catch (err: any) {
    return {
      ok: false,
      reason: 'STORAGE_UNTRUSTED',
      message: `Fail-closed: durable idempotency storage unavailable (${err?.message || 'unknown error'}).`,
    };
  }

  for (const key of keys) {
    const existing = store.entries[key];
    if (existing && existing.expiresAt > now) {
      return {
        ok: false,
        reason: 'DUPLICATE_EVENT',
        message: 'Duplicate or replayed event rejected.',
        existingMetadata: existing.metadata,
      };
    }
  }

  // Reserve in memory while processing proceeds
  for (const key of keys) {
    inFlightKeys.add(key);
  }
  // Ensure unused param lint doesn't complain; ttl used on commit
  void getEffectiveTtlMs(customTtlMs);
  return { ok: true };
}

/**
 * Phase 2: Atomically commits reserved keys to durable storage and releases in-flight locks.
 * Throws if durable persistence fails so the caller can fail closed.
 */
export function commitDurableIdempotencyKeys(
  keys: string[],
  options?: { ttlMs?: number; metadata?: Record<string, string | boolean | number> }
): void {
  if (keys.length === 0) return;

  const now = Date.now();
  const ttlMs = getEffectiveTtlMs(options?.ttlMs);

  try {
    const filePath = getIdempotencyFilePath();
    const store = loadDurableStoreSync(filePath, now);
    for (const key of keys) {
      store.entries[key] = {
        createdAt: now,
        expiresAt: now + ttlMs,
        metadata: options?.metadata,
      };
    }
    saveDurableStoreSync(filePath, store);
  } finally {
    for (const key of keys) {
      inFlightKeys.delete(key);
    }
  }
}

/**
 * Releases in-flight locks without committing when processing fails before completion,
 * allowing safe retries without losing events.
 */
export function releaseDurableIdempotencyKeys(keys: string[]): void {
  for (const key of keys) {
    inFlightKeys.delete(key);
  }
}

/**
 * Reads a durable idempotency record if present and unexpired.
 * Throws if durable storage is corrupted or unreadable (fail-closed).
 */
export function lookupDurableIdempotencyKey(key: string): DurableIdempotencyEntry | null {
  const now = Date.now();
  const filePath = getIdempotencyFilePath();
  const store = loadDurableStoreSync(filePath, now);
  const entry = store.entries[key];
  if (entry && entry.expiresAt > now) {
    return entry;
  }
  return null;
}
