/**
 * @file server/core/sessionStore.ts
 * Durable Session Storage Contract & Local-First Atomic Persistence Engine (R2.1C)
 *
 * Guarantees:
 * - Abstracted behind `ISessionStore` so local-first JSON persistence can be swapped
 *   for PostgreSQL/Drizzle or Redis in future shared-DB/SaaS deployments without
 *   changing `server/core/identity.ts` auth contracts.
 * - Persists every session creation, rotation, and revocation atomically to disk
 *   via `writeVerifiedAtomicFileSync`.
 * - Fails closed if the persisted session store file is corrupted/unparseable.
 * - Preserves non-expired revoked sessions until `expiresAt` so replay attempts are
 *   explicitly rejected as `SESSION_REVOKED_OR_UNKNOWN`, while safely pruning expired records.
 */

import fs from 'fs';
import path from 'path';
import { writeVerifiedAtomicFileSync } from '../db/localPersistenceEngine.ts';
import { db } from '../db/store.ts';

export interface ServerSessionRecord {
  jti: string;
  userId: string;
  organizationId: string;
  baseRole: string;
  activeRole: string;
  csrfToken: string;
  credentialVersion: number;
  issuedAt: number;
  expiresAt: number;
  revoked: boolean;
  revokedAt?: number;
  revokedReason?: string;
  lastRotatedAt?: number;
}

export interface ISessionStore {
  loadFromDisk(): void;
  get(jti: string): ServerSessionRecord | undefined;
  set(record: ServerSessionRecord): void;
  revoke(jti: string, reason?: string): boolean;
  revokeAllForUser(userId: string, reason?: string): number;
  revokeAllForOrganization(organizationId: string, reason?: string): number;
  listForUser(userId: string, organizationId: string, includeRevoked?: boolean): ServerSessionRecord[];
  listForOrganization(organizationId: string, includeRevoked?: boolean): ServerSessionRecord[];
  cleanupExpired(now?: number): number;
  getStoreFilePath(): string;
  simulateProcessRestartForTesting(): void;
}

interface SessionStoreFile {
  schemaVersion: 1;
  updatedAt: string;
  sessions: Record<string, ServerSessionRecord>;
}

const MAX_SESSIONS = 50_000;

export class DurableSessionStore implements ISessionStore {
  private sessions = new Map<string, ServerSessionRecord>();
  private loaded = false;
  private loadedFromPath: string | null = null;
  private overrideFilePath: string | null = null;
  private pinnedDefaultFilePath: string | null = null;

  public setFilePathForTesting(filePath: string | null): void {
    this.overrideFilePath = filePath;
    this.pinnedDefaultFilePath = null;
    this.sessions.clear();
    this.loaded = false;
    this.loadedFromPath = null;
  }

  public getStoreFilePath(): string {
    if (this.overrideFilePath) {
      return this.overrideFilePath;
    }
    if (!this.pinnedDefaultFilePath) {
      const dbPath = db.getPersistFilePath();
      this.pinnedDefaultFilePath = path.join(path.dirname(dbPath), '.omniflow_sessions.json');
    }
    return this.pinnedDefaultFilePath;
  }

  private ensureLoaded(): void {
    const targetPath = this.getStoreFilePath();
    if (!this.loaded || this.loadedFromPath !== targetPath) {
      this.loadFromDisk();
    }
  }

  public loadFromDisk(): void {
    const filePath = this.getStoreFilePath();
    this.sessions.clear();
    this.loaded = true;
    this.loadedFromPath = filePath;

    if (!fs.existsSync(filePath)) {
      return;
    }

    let raw: string;
    try {
      raw = fs.readFileSync(filePath, 'utf-8');
    } catch (err: any) {
      throw Object.assign(
        new Error(`Durable session store is unreadable at ${filePath}: ${err?.message || err}`),
        { status: 503, code: 'SESSION_STORE_CORRUPTED' }
      );
    }

    if (!raw || raw.trim().length === 0) {
      throw Object.assign(
        new Error(`Durable session store file at ${filePath} is empty/corrupted`),
        { status: 503, code: 'SESSION_STORE_CORRUPTED' }
      );
    }

    let parsed: SessionStoreFile;
    try {
      parsed = JSON.parse(raw);
    } catch (err: any) {
      throw Object.assign(
        new Error(`Durable session store JSON is corrupted at ${filePath}: ${err?.message || err}`),
        { status: 503, code: 'SESSION_STORE_CORRUPTED' }
      );
    }

    if (!parsed || parsed.schemaVersion !== 1 || !parsed.sessions || typeof parsed.sessions !== 'object') {
      throw Object.assign(
        new Error(`Durable session store schema is invalid at ${filePath}`),
        { status: 503, code: 'SESSION_STORE_CORRUPTED' }
      );
    }

    for (const [jti, rec] of Object.entries(parsed.sessions)) {
      if (
        !rec ||
        typeof rec !== 'object' ||
        typeof rec.jti !== 'string' ||
        typeof rec.userId !== 'string' ||
        typeof rec.organizationId !== 'string' ||
        typeof rec.expiresAt !== 'number' ||
        typeof rec.revoked !== 'boolean'
      ) {
        throw Object.assign(
          new Error(`Corrupted session record [${jti}] in ${filePath}`),
          { status: 503, code: 'SESSION_STORE_CORRUPTED' }
        );
      }
      this.sessions.set(jti, {
        ...rec,
        credentialVersion: typeof rec.credentialVersion === 'number' ? rec.credentialVersion : 1,
      });
    }
  }

  private persistToDisk(): void {
    const filePath = this.getStoreFilePath();
    // Prune only expired sessions when approaching cap
    if (this.sessions.size > MAX_SESSIONS) {
      const now = Date.now();
      for (const [k, v] of this.sessions.entries()) {
        if (now > v.expiresAt) {
          this.sessions.delete(k);
        }
      }
    }

    const payload: SessionStoreFile = {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      sessions: Object.fromEntries(this.sessions.entries()),
    };

    try {
      writeVerifiedAtomicFileSync(filePath, JSON.stringify(payload, null, 2));
    } catch (err: any) {
      throw Object.assign(
        new Error(`Failed to persist durable session store: ${err?.message || err}`),
        { status: 503, code: 'SESSION_STORE_WRITE_FAILED' }
      );
    }
    this.loaded = true;
    this.loadedFromPath = filePath;
  }

  public get(jti: string): ServerSessionRecord | undefined {
    this.ensureLoaded();
    const rec = this.sessions.get(jti);
    return rec ? { ...rec } : undefined;
  }

  public set(record: ServerSessionRecord): void {
    this.ensureLoaded();
    this.sessions.set(record.jti, { ...record });
    this.persistToDisk();
  }

  public revoke(jti: string, reason = 'manual_revoke'): boolean {
    this.ensureLoaded();
    const rec = this.sessions.get(jti);
    if (!rec) return false;
    if (rec.revoked) return false;
    rec.revoked = true;
    rec.revokedAt = Date.now();
    rec.revokedReason = reason;
    this.sessions.set(jti, rec);
    this.persistToDisk();
    return true;
  }

  public revokeAllForUser(userId: string, reason = 'revoke_all_user_sessions'): number {
    this.ensureLoaded();
    let count = 0;
    const now = Date.now();
    for (const [jti, rec] of this.sessions.entries()) {
      if (rec.userId === userId && !rec.revoked) {
        rec.revoked = true;
        rec.revokedAt = now;
        rec.revokedReason = reason;
        this.sessions.set(jti, rec);
        count++;
      }
    }
    if (count > 0) {
      this.persistToDisk();
    }
    return count;
  }

  public revokeAllForOrganization(organizationId: string, reason = 'organization_revoked'): number {
    this.ensureLoaded();
    let count = 0;
    const now = Date.now();
    for (const [jti, rec] of this.sessions.entries()) {
      if (rec.organizationId === organizationId && !rec.revoked) {
        rec.revoked = true;
        rec.revokedAt = now;
        rec.revokedReason = reason;
        this.sessions.set(jti, rec);
        count++;
      }
    }
    if (count > 0) {
      this.persistToDisk();
    }
    return count;
  }

  public listForUser(userId: string, organizationId: string, includeRevoked = false): ServerSessionRecord[] {
    this.ensureLoaded();
    const now = Date.now();
    const out: ServerSessionRecord[] = [];
    for (const rec of this.sessions.values()) {
      if (rec.userId !== userId || rec.organizationId !== organizationId) continue;
      if (now > rec.expiresAt) continue;
      if (!includeRevoked && rec.revoked) continue;
      out.push({ ...rec });
    }
    return out;
  }

  public listForOrganization(organizationId: string, includeRevoked = false): ServerSessionRecord[] {
    this.ensureLoaded();
    const now = Date.now();
    const out: ServerSessionRecord[] = [];
    for (const rec of this.sessions.values()) {
      if (rec.organizationId !== organizationId) continue;
      if (now > rec.expiresAt) continue;
      if (!includeRevoked && rec.revoked) continue;
      out.push({ ...rec });
    }
    return out;
  }

  public cleanupExpired(now: number = Date.now()): number {
    this.ensureLoaded();
    let removed = 0;
    for (const [jti, rec] of this.sessions.entries()) {
      // Only remove sessions that have actually expired (keep non-expired revoked sessions so replays are rejected)
      if (now > rec.expiresAt) {
        this.sessions.delete(jti);
        removed++;
      }
    }
    if (removed > 0) {
      this.persistToDisk();
    }
    return removed;
  }

  public simulateProcessRestartForTesting(): void {
    this.sessions.clear();
    this.loaded = false;
    this.loadedFromPath = null;
    this.loadFromDisk();
  }
}

export const defaultSessionStore = new DurableSessionStore();
let activeSessionStore: ISessionStore = defaultSessionStore;

export function getSessionStore(): ISessionStore {
  return activeSessionStore;
}

export function setSessionStore(store: ISessionStore): void {
  activeSessionStore = store;
}
