/**
 * @file server/core/localAuth.ts
 * Enterprise Local-First Owner Authentication, Bootstrap & Scrypt Engine
 *
 * Guarantees:
 * 1. Zero cloud dependencies: Works 100% offline without Firebase, Auth0, or external auth providers.
 * 2. Secure Password Hashing: Memory-hard scrypt key derivation (RFC 7914 / OWASP recommended:
 *    N=131072, r=8, p=1, keyLen=64) with 32-byte CSPRNG salt and automatic legacy upgrade path.
 * 3. Safe First-Run Bootstrap: Generates a cryptographically random, one-time bootstrap token
 *    in `.owner_bootstrap_token` (readable only by the local operator) when no Owner exists.
 * 4. Constant-Time Verification: Prevents timing attacks via length pre-check & `crypto.timingSafeEqual`.
 * 5. Persistent Brute-Force Rate Limiting with Fail-Secure Storage Integrity:
 *    Persisted across process restarts in `.rate_limit_state.json` with `.rate_limit_state.json.bak`.
 *    Corrupted state files are automatically quarantined (.corrupt.<timestamp>) and recovered from .bak.
 *    If storage cannot be safely loaded or written, authentication enters Fail-Secure (HTTP 503)
 *    to prevent in-memory brute force bypass while keeping non-auth operations available.
 * 6. Explicit fail-closed design: Incomplete or corrupted auth files refuse authentication.
 * 7. Scrypt Resource Governance: Bounded concurrency (max 2 parallel scrypt operations) running on
 *    Node.js libuv threadpool with strict finally-block slot release and memory capping.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { db } from '../db/store.ts';
import { AuditLogger } from './audit.ts';
import { issueSessionToken, formatSessionCookie } from './identity.ts';
import type { Request, Response } from 'express';

export interface LocalOwnerRecord {
  version: number;
  ownerUserId: string;
  username: string;
  email: string;
  fullName: string;
  saltHex: string;
  hashHex: string;
  scryptParams: {
    N: number;
    r: number;
    p: number;
    keyLen: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface LocalAuthStatus {
  configured: boolean;
  status: 'BOOTSTRAP_PENDING' | 'CONFIGURED';
  ownerUserId?: string;
  username?: string;
  email?: string;
  createdAt?: string;
}

export const SCRYPT_RECOMMENDED = {
  N: 131072, // OWASP Recommended for scrypt (2^17)
  r: 8,
  p: 1,
  keyLen: 64,
};

export const SCRYPT_FAST = {
  N: 16384, // RFC 7914 / fast baseline (2^14)
  r: 8,
  p: 1,
  keyLen: 64,
};

// Default for new provisioning conforms to OWASP recommendation
export const SCRYPT_DEFAULTS = SCRYPT_RECOMMENDED;

// Persistent rate limiting store interface
export interface RateLimitEntry {
  attempts: number;
  firstAttemptAt: number;
  blockedUntil: number;
}

export interface PersistentRateLimitStore {
  version: 1;
  updatedAt: string;
  entries: Record<string, RateLimitEntry>;
}

export type RateLimitStorageHealth =
  | 'HEALTHY'
  | 'CORRUPTED_RECOVERED'
  | 'CORRUPTED_UNRECOVERABLE'
  | 'STORAGE_UNWRITABLE';

export interface RateLimitStorageReport {
  health: RateLimitStorageHealth;
  lastError: string | null;
  corruptFilesCount: number;
  backupExists: boolean;
  primaryExists: boolean;
  entryCount: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const MAX_FAILED_ATTEMPTS = 5;
const GLOBAL_MAX_FAILED_ATTEMPTS = 20;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

let currentStorageHealth: RateLimitStorageHealth = 'HEALTHY';
let lastStorageError: string | null = null;

export function getRateLimitFilePath(dataDir: string): string {
  return path.join(dataDir, '.rate_limit_state.json');
}

export function getRateLimitBackupFilePath(dataDir: string): string {
  return path.join(dataDir, '.rate_limit_state.json.bak');
}

export function getRateLimitStorageHealth(dataDir?: string): RateLimitStorageReport {
  let corruptFilesCount = 0;
  let backupExists = false;
  let primaryExists = false;

  if (dataDir && fs.existsSync(dataDir)) {
    try {
      const files = fs.readdirSync(dataDir);
      corruptFilesCount = files.filter((f) => f.startsWith('.rate_limit_state.json.corrupt.')).length;
      backupExists = fs.existsSync(getRateLimitBackupFilePath(dataDir));
      primaryExists = fs.existsSync(getRateLimitFilePath(dataDir));
    } catch {}
  }

  return {
    health: currentStorageHealth,
    lastError: lastStorageError,
    corruptFilesCount,
    backupExists,
    primaryExists,
    entryCount: rateLimitMap.size,
  };
}

export function resetRateLimitStorageHealth(health: RateLimitStorageHealth = 'HEALTHY'): void {
  currentStorageHealth = health;
  lastStorageError = null;
}

export function isRateLimitStorageHealthy(): boolean {
  return currentStorageHealth === 'HEALTHY' || currentStorageHealth === 'CORRUPTED_RECOVERED';
}

function populateRateLimitMap(entries: Record<string, RateLimitEntry>): void {
  const now = Date.now();
  for (const [key, entry] of Object.entries(entries)) {
    if (
      entry &&
      typeof entry.attempts === 'number' &&
      Number.isFinite(entry.attempts) &&
      typeof entry.blockedUntil === 'number' &&
      Number.isFinite(entry.blockedUntil)
    ) {
      let firstAttemptAt = Number.isFinite(entry.firstAttemptAt) ? entry.firstAttemptAt : now;
      if (firstAttemptAt > now + 60000) {
        firstAttemptAt = now;
      }
      if (entry.blockedUntil <= now && now - firstAttemptAt > RATE_LIMIT_WINDOW_MS) {
        continue;
      }
      let blockedUntil = entry.blockedUntil;
      if (blockedUntil > now + BLOCK_DURATION_MS * 2) {
        blockedUntil = now + BLOCK_DURATION_MS;
      }
      const existing = rateLimitMap.get(key);
      const mergedAttempts = existing ? Math.max(existing.attempts, Math.floor(entry.attempts)) : Math.floor(entry.attempts);
      const mergedBlockedUntil = existing ? Math.max(existing.blockedUntil, blockedUntil) : blockedUntil;
      const mergedFirst = existing ? Math.min(existing.firstAttemptAt, firstAttemptAt) : firstAttemptAt;

      rateLimitMap.set(key, {
        attempts: Math.max(1, mergedAttempts),
        firstAttemptAt: mergedFirst,
        blockedUntil: mergedBlockedUntil,
      });
    }
  }
}

function cleanupStaleTmpFiles(dataDir: string, filePath: string): void {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    const now = Date.now();
    const prefix = path.basename(filePath) + '.';
    for (const f of files) {
      if (f.startsWith(prefix) && f.endsWith('.tmp')) {
        const full = path.join(dir, f);
        try {
          const stat = fs.statSync(full);
          if (now - stat.mtimeMs > 60000) {
            fs.unlinkSync(full);
          }
        } catch {}
      }
    }
  } catch {}
}

function writeStateFile(filePath: string, bakPath: string, payload: PersistentRateLimitStore): void {
  const dataDir = path.dirname(filePath);
  cleanupStaleTmpFiles(dataDir, filePath);

  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const serialized = JSON.stringify(payload, null, 2);

  const fd = fs.openSync(tmpPath, 'w', 0o600);
  try {
    fs.writeSync(fd, serialized, 0, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  // If primary currently exists and is healthy, replicate to .bak before overwriting
  if (fs.existsSync(filePath)) {
    try {
      fs.copyFileSync(filePath, bakPath);
    } catch {}
  }

  fs.renameSync(tmpPath, filePath);
}

export function loadRateLimitStateFromDisk(dataDir: string): void {
  const filePath = getRateLimitFilePath(dataDir);
  const bakPath = getRateLimitBackupFilePath(dataDir);

  if (!fs.existsSync(filePath)) {
    if (fs.existsSync(bakPath)) {
      try {
        const bakRaw = fs.readFileSync(bakPath, 'utf8');
        const parsed: PersistentRateLimitStore = JSON.parse(bakRaw);
        if (parsed && typeof parsed.entries === 'object') {
          populateRateLimitMap(parsed.entries);
          writeStateFile(filePath, bakPath, parsed);
          currentStorageHealth = 'CORRUPTED_RECOVERED';
          lastStorageError = 'Primary state missing; restored restrictive state from .bak';
          return;
        }
      } catch {}
    }
    if (currentStorageHealth !== 'STORAGE_UNWRITABLE' && currentStorageHealth !== 'CORRUPTED_UNRECOVERABLE') {
      currentStorageHealth = 'HEALTHY';
      lastStorageError = null;
    }
    return;
  }

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (readErr: any) {
    currentStorageHealth = 'STORAGE_UNWRITABLE';
    lastStorageError = `Cannot read rate limit state file: ${readErr?.message}`;
    return;
  }

  let parsed: PersistentRateLimitStore | null = null;
  try {
    parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.entries !== 'object' || parsed.version !== 1) {
      parsed = null;
    }
  } catch {
    parsed = null;
  }

  if (parsed) {
    populateRateLimitMap(parsed.entries);
    if (currentStorageHealth !== 'CORRUPTED_RECOVERED') {
      currentStorageHealth = 'HEALTHY';
      lastStorageError = null;
    }
    if (!fs.existsSync(bakPath)) {
      try {
        fs.copyFileSync(filePath, bakPath);
      } catch {}
    }
    return;
  }

  // === CORRUPTION DETECTED ===
  // 1. Quarantine corrupted file as forensic evidence
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const corruptPath = `${filePath}.corrupt.${timestamp}`;
  try {
    fs.renameSync(filePath, corruptPath);
    console.warn(`[RateLimit Security] Corrupt state file quarantined to: ${corruptPath}`);
  } catch (qErr: any) {
    console.error(`[RateLimit Security] Failed to quarantine corrupt state file: ${qErr?.message}`);
  }

  // 2. Attempt recovery from backup (.bak)
  if (fs.existsSync(bakPath)) {
    try {
      const bakRaw = fs.readFileSync(bakPath, 'utf8');
      const bakParsed: PersistentRateLimitStore = JSON.parse(bakRaw);
      if (bakParsed && typeof bakParsed.entries === 'object' && bakParsed.version === 1) {
        populateRateLimitMap(bakParsed.entries);
        writeStateFile(filePath, bakPath, bakParsed);
        currentStorageHealth = 'CORRUPTED_RECOVERED';
        lastStorageError = `Corrupt primary state quarantined to ${path.basename(corruptPath)}; restored restrictive state from .bak`;
        console.warn(`[RateLimit Security] ${lastStorageError}`);
        return;
      } else {
        const corruptBakPath = `${bakPath}.corrupt.${timestamp}`;
        try { fs.renameSync(bakPath, corruptBakPath); } catch {}
      }
    } catch {
      const corruptBakPath = `${bakPath}.corrupt.${timestamp}`;
      try { fs.renameSync(bakPath, corruptBakPath); } catch {}
    }
  }

  // 3. Unrecoverable: No valid backup exists
  currentStorageHealth = 'CORRUPTED_UNRECOVERABLE';
  lastStorageError = `Corrupted state file quarantined to ${path.basename(corruptPath)}; no valid backup available. Halting authentication fail-secure.`;
  console.error(`[RateLimit CRITICAL] ${lastStorageError}`);
}

export function saveRateLimitStateToDisk(dataDir: string): void {
  const filePath = getRateLimitFilePath(dataDir);
  const bakPath = getRateLimitBackupFilePath(dataDir);

  if (currentStorageHealth === 'CORRUPTED_UNRECOVERABLE') {
    return;
  }

  try {
    const now = Date.now();
    const entries: Record<string, RateLimitEntry> = {};

    for (const [key, entry] of rateLimitMap.entries()) {
      if (entry.blockedUntil <= now && now - entry.firstAttemptAt > RATE_LIMIT_WINDOW_MS) {
        rateLimitMap.delete(key);
      } else {
        entries[key] = entry;
      }
    }

    // Limit key count to 500 to prevent unbounded disk/memory growth
    const allKeys = Object.keys(entries);
    if (allKeys.length > 500) {
      allKeys
        .filter((k) => entries[k].blockedUntil <= now)
        .slice(0, allKeys.length - 500)
        .forEach((k) => {
          delete entries[k];
          rateLimitMap.delete(k);
        });
    }

    const payload: PersistentRateLimitStore = {
      version: 1,
      updatedAt: new Date().toISOString(),
      entries,
    };

    writeStateFile(filePath, bakPath, payload);
    if (currentStorageHealth === 'STORAGE_UNWRITABLE') {
      currentStorageHealth = 'HEALTHY';
      lastStorageError = null;
    }
  } catch (err: any) {
    currentStorageHealth = 'STORAGE_UNWRITABLE';
    lastStorageError = err?.message || 'Storage write failed';
    console.error(`[RateLimit Storage Error] Failed to write rate limit state to disk: ${lastStorageError}`);
  }
}

export function checkRateLimit(
  key: string,
  dataDir?: string,
  maxAttempts = MAX_FAILED_ATTEMPTS
): {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSec?: number;
  storageDegraded?: boolean;
  storageHealth?: RateLimitStorageHealth;
} {
  if (dataDir) {
    loadRateLimitStateFromDisk(dataDir);
  }

  if (!isRateLimitStorageHealthy()) {
    return {
      allowed: false,
      remainingAttempts: 0,
      storageDegraded: true,
      storageHealth: currentStorageHealth,
    };
  }

  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry) {
    return { allowed: true, remainingAttempts: maxAttempts, storageHealth: currentStorageHealth };
  }

  if (entry.blockedUntil > now) {
    const retryAfterSec = Math.ceil((entry.blockedUntil - now) / 1000);
    return { allowed: false, remainingAttempts: 0, retryAfterSec, storageHealth: currentStorageHealth };
  }

  if (now - entry.firstAttemptAt > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.delete(key);
    if (dataDir) saveRateLimitStateToDisk(dataDir);
    return { allowed: true, remainingAttempts: maxAttempts, storageHealth: currentStorageHealth };
  }

  const remaining = Math.max(0, maxAttempts - entry.attempts);
  return { allowed: entry.attempts < maxAttempts, remainingAttempts: remaining, storageHealth: currentStorageHealth };
}

export function recordFailedAttempt(
  key: string,
  dataDir?: string,
  maxAttempts = MAX_FAILED_ATTEMPTS
): void {
  if (dataDir) {
    loadRateLimitStateFromDisk(dataDir);
  }
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now - entry.firstAttemptAt > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(key, { attempts: 1, firstAttemptAt: now, blockedUntil: 0 });
  } else {
    entry.attempts += 1;
    if (entry.attempts >= maxAttempts) {
      entry.blockedUntil = now + BLOCK_DURATION_MS;
    }
  }
  if (dataDir) {
    saveRateLimitStateToDisk(dataDir);
  }
}

export function resetRateLimit(key: string, dataDir?: string): void {
  rateLimitMap.delete(key);
  if (dataDir) {
    saveRateLimitStateToDisk(dataDir);
  }
}

export function clearAllRateLimits(dataDir?: string): void {
  rateLimitMap.clear();
  resetRateLimitStorageHealth('HEALTHY');
  if (dataDir) {
    const filePath = getRateLimitFilePath(dataDir);
    const bakPath = getRateLimitBackupFilePath(dataDir);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (_) {}
    try {
      if (fs.existsSync(bakPath)) fs.unlinkSync(bakPath);
    } catch (_) {}
  }
}

export function deriveScryptHash(
  password: string,
  salt: Buffer,
  params: { N: number; r: number; p: number; keyLen: number } = SCRYPT_DEFAULTS
): Buffer {
  const maxmem = Math.max(64 * 1024 * 1024, 128 * params.N * params.r * 2);
  return crypto.scryptSync(password, salt, params.keyLen, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem,
  });
}

interface ScryptTask {
  password: string;
  salt: Buffer;
  params: { N: number; r: number; p: number; keyLen: number };
  resolve: (value: Buffer) => void;
  reject: (reason: any) => void;
  enqueuedAt: number;
}

/**
 * Scrypt Concurrency Controller & Resource Governor
 *
 * Concurrency Model:
 * Node.js executes asynchronous `crypto.scrypt` via the native C++ libuv threadpool
 * (governed by UV_THREADPOOL_SIZE, default 4). It DOES NOT spawn separate V8 Worker Threads.
 * To prevent threadpool starvation (which would stall disk I/O, DNS, and compression)
 * and enforce strict memory bounds, this controller limits concurrent scrypt executions to 2.
 *
 * Memory Accounting:
 * - Parameter specification: N=131072 (2^17), r=8, p=1, keyLen=64 (OWASP Recommended)
 * - RFC 7914 Memory Requirement: 128 * N * r = 128 * 131072 * 8 = 134,217,728 bytes (~128 MiB)
 * - OpenSSL maxmem ceiling passed per operation: 128 * N * r * 2 = 268,435,456 bytes (~256 MiB)
 * - Concurrency Limit: maxConcurrent = 2
 * - Active Working Memory (2 active operations): ~256 MiB
 * - Theoretical Maximum Memory Ceiling (2 * maxmem allowance): 512 MiB
 *
 * Invariant:
 * activeCount decrement and processNext() dispatch are guaranteed by a finally block,
 * preventing any thread/slot leakage regardless of whether crypto.scrypt succeeds, rejects,
 * or throws synchronously.
 */
class ScryptConcurrencyController {
  private activeCount = 0;
  private readonly maxConcurrent = 2; // Strict bound on parallel memory usage (max 2 * 128 MiB = 256 MiB working)
  private readonly maxQueueDepth = 10; // Cap pending requests to prevent memory bloat under flood
  private readonly queueTimeoutMs = 10000; // 10s max wait in queue
  private queue: ScryptTask[] = [];

  public getStats() {
    return {
      activeCount: this.activeCount,
      queuedCount: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      maxQueueDepth: this.maxQueueDepth,
    };
  }

  public enqueue(
    password: string,
    salt: Buffer,
    params: { N: number; r: number; p: number; keyLen: number } = SCRYPT_DEFAULTS
  ): Promise<Buffer> {
    if (this.queue.length >= this.maxQueueDepth) {
      return Promise.reject(new Error('SCRYPT_QUEUE_SATURATED'));
    }

    return new Promise<Buffer>((resolve, reject) => {
      this.queue.push({
        password,
        salt,
        params,
        resolve,
        reject,
        enqueuedAt: Date.now(),
      });
      this.processNext();
    });
  }

  private processNext(): void {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    if (Date.now() - task.enqueuedAt > this.queueTimeoutMs) {
      task.reject(new Error('SCRYPT_QUEUE_TIMEOUT'));
      this.processNext();
      return;
    }

    this.activeCount++;
    const maxmem = Math.max(64 * 1024 * 1024, 128 * task.params.N * task.params.r * 2);

    try {
      crypto.scrypt(
        task.password,
        task.salt,
        task.params.keyLen,
        {
          N: task.params.N,
          r: task.params.r,
          p: task.params.p,
          maxmem,
        },
        (err, derivedKey) => {
          try {
            if (err) {
              task.reject(err);
            } else {
              task.resolve(derivedKey);
            }
          } finally {
            this.activeCount--;
            setImmediate(() => this.processNext());
          }
        }
      );
    } catch (syncErr) {
      this.activeCount--;
      task.reject(syncErr);
      setImmediate(() => this.processNext());
    }
  }
}

export const scryptController = new ScryptConcurrencyController();

export function getScryptQueueStats() {
  return scryptController.getStats();
}

export async function deriveScryptHashAsync(
  password: string,
  salt: Buffer,
  params: { N: number; r: number; p: number; keyLen: number } = SCRYPT_DEFAULTS
): Promise<Buffer> {
  return scryptController.enqueue(password, salt, params);
}

export function getLocalAuthFilePath(dataDir: string): string {
  return path.join(dataDir, '.local_owner_auth.json');
}

export function getBootstrapTokenFilePath(dataDir: string): string {
  return path.join(dataDir, '.owner_bootstrap_token');
}

/**
 * Initializes or inspects local owner state.
 * If `.local_owner_auth.json` does not exist, provisions a random one-time bootstrap token.
 */
export function initLocalOwnerAuth(dataDir: string): LocalAuthStatus {
  loadRateLimitStateFromDisk(dataDir);
  const authFile = getLocalAuthFilePath(dataDir);
  const tokenFile = getBootstrapTokenFilePath(dataDir);

  if (fs.existsSync(authFile)) {
    try {
      const parsed: LocalOwnerRecord = JSON.parse(fs.readFileSync(authFile, 'utf8'));
      if (parsed && parsed.ownerUserId && parsed.hashHex && parsed.saltHex) {
        return {
          configured: true,
          status: 'CONFIGURED',
          ownerUserId: parsed.ownerUserId,
          username: parsed.username,
          email: parsed.email,
          createdAt: parsed.createdAt,
        };
      }
    } catch (_) {
      // Corrupt auth file handled by authenticate fail-closed
    }
  }

  // Provision fresh one-time bootstrap token if not already present
  if (!fs.existsSync(tokenFile)) {
    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
      }
      const token = crypto.randomBytes(32).toString('hex');
      const payload = {
        token,
        createdAt: new Date().toISOString(),
        instructions:
          'Use this one-time bootstrap token to activate your local Owner account. This token will be deleted immediately upon activation.',
      };
      const tmpToken = tokenFile + '.' + process.pid + '.' + Date.now() + '.tmp';
      fs.writeFileSync(tmpToken, JSON.stringify(payload, null, 2), { mode: 0o600, flag: 'wx' });
      fs.renameSync(tmpToken, tokenFile);
      console.log(`[Local Auth Bootstrap] ⚠️ No local Owner configured.`);
      console.log(`[Local Auth Bootstrap] Generated one-time bootstrap token in: ${tokenFile}`);
    } catch (e: any) {
      console.error(`[Local Auth Bootstrap Error] Could not generate bootstrap token: ${e?.message}`);
    }
  }

  return {
    configured: false,
    status: 'BOOTSTRAP_PENDING',
  };
}

/**
 * Validates password complexity against local-first security standards:
 * - Minimum 10 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one special symbol
 */
export function validatePasswordStrength(password: string): { valid: boolean; reason?: string } {
  if (!password || typeof password !== 'string') {
    return { valid: false, reason: 'Password is required.' };
  }
  if (password.length < 10) {
    return { valid: false, reason: 'Password must be at least 10 characters long.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one uppercase letter (A-Z).' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one lowercase letter (a-z).' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one digit (0-9).' };
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one special character.' };
  }
  return { valid: true };
}

/**
 * Completes the one-time Owner bootstrap.
 */
export function completeLocalOwnerBootstrap(
  dataDir: string,
  params: {
    bootstrapToken: string;
    username: string;
    password: string;
    email?: string;
    fullName?: string;
    ip?: string;
    scryptParams?: { N: number; r: number; p: number; keyLen: number };
  }
): { ok: boolean; errorCode?: string; errorMessage?: string } {
  const ip = params.ip || '127.0.0.1';
  const bootstrapKey = `bootstrap:${ip}`;
  const rateLimit = checkRateLimit(bootstrapKey, dataDir);
  if (!rateLimit.allowed) {
    if (rateLimit.storageDegraded) {
      return {
        ok: false,
        errorCode: 'AUTH_SUBSYSTEM_UNAVAILABLE',
        errorMessage: 'Authentication subsystem is unavailable due to security storage integrity failure. Please contact administrator.',
      };
    }
    return {
      ok: false,
      errorCode: 'TOO_MANY_FAILED_ATTEMPTS',
      errorMessage: `Too many failed bootstrap attempts. Please retry after ${rateLimit.retryAfterSec} seconds.`,
    };
  }

  const tokenFile = getBootstrapTokenFilePath(dataDir);
  const authFile = getLocalAuthFilePath(dataDir);

  if (fs.existsSync(authFile)) {
    return { ok: false, errorCode: 'OWNER_ALREADY_CONFIGURED', errorMessage: 'Local Owner account is already configured.' };
  }

  if (!fs.existsSync(tokenFile)) {
    return { ok: false, errorCode: 'BOOTSTRAP_TOKEN_MISSING', errorMessage: 'Bootstrap token file does not exist.' };
  }

  let storedToken: string;
  try {
    const parsed = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
    storedToken = String(parsed?.token || '').trim();
  } catch (_) {
    return { ok: false, errorCode: 'BOOTSTRAP_TOKEN_CORRUPT', errorMessage: 'Bootstrap token file is corrupted.' };
  }

  const providedToken = String(params.bootstrapToken || '').trim();
  const providedBuf = Buffer.from(providedToken, 'utf-8');
  const storedBuf = Buffer.from(storedToken, 'utf-8');
  if (providedBuf.length !== storedBuf.length || !crypto.timingSafeEqual(providedBuf, storedBuf)) {
    recordFailedAttempt(bootstrapKey, dataDir);
    return { ok: false, errorCode: 'INVALID_BOOTSTRAP_TOKEN', errorMessage: 'Bootstrap token verification failed.' };
  }

  resetRateLimit(bootstrapKey, dataDir);

  const pwCheck = validatePasswordStrength(params.password);
  if (!pwCheck.valid) {
    return { ok: false, errorCode: 'WEAK_PASSWORD', errorMessage: pwCheck.reason };
  }

  const cleanUsername = String(params.username || 'owner').trim();
  if (cleanUsername.length < 3) {
    return { ok: false, errorCode: 'INVALID_USERNAME', errorMessage: 'Username must be at least 3 characters.' };
  }

  const cleanEmail = String(params.email || 'owner@omniflow.local').trim().toLowerCase();
  const cleanFullName = String(params.fullName || 'System Owner').trim();
  const ownerUserId = 'usr-owner-01';

  // Generate salt and derive scrypt hash with OWASP recommended or custom parameters
  const scryptConfig = params.scryptParams || SCRYPT_DEFAULTS;
  const salt = crypto.randomBytes(32);
  const hash = deriveScryptHash(params.password, salt, scryptConfig);

  const nowIso = new Date().toISOString();
  const record: LocalOwnerRecord = {
    version: 1,
    ownerUserId,
    username: cleanUsername,
    email: cleanEmail,
    fullName: cleanFullName,
    saltHex: salt.toString('hex'),
    hashHex: hash.toString('hex'),
    scryptParams: scryptConfig,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  // Atomic write to auth file
  const tmpAuth = authFile + '.' + process.pid + '.' + Date.now() + '.tmp';
  try {
    fs.writeFileSync(tmpAuth, JSON.stringify(record, null, 2), { mode: 0o600, flag: 'wx' });
    fs.renameSync(tmpAuth, authFile);
  } catch (err: any) {
    try { if (fs.existsSync(tmpAuth)) fs.unlinkSync(tmpAuth); } catch (_) {}
    return { ok: false, errorCode: 'WRITE_AUTH_FAILED', errorMessage: err?.message || 'Failed to save owner credentials.' };
  }

  // Destroy the one-time bootstrap token file
  try {
    fs.unlinkSync(tokenFile);
  } catch (_) {}

  // Ensure owner user exists in database with authoritative Owner role
  const existingOrg = Array.from(db.organizations.values())[0];
  const orgId = existingOrg?.id || 'org-default';

  db.users.set(ownerUserId, {
    id: ownerUserId,
    organizationId: orgId,
    email: cleanEmail,
    fullName: cleanFullName,
    role: 'Owner',
    isActive: true,
    mfaEnabled: false,
    phoneNumber: '01018108979',
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  db.saveToDisk();

  AuditLogger.log({
    organizationId: orgId,
    actorId: ownerUserId,
    actorType: 'user',
    action: 'auth.local_owner_bootstrapped',
    entityType: 'user',
    entityId: ownerUserId,
    afterState: {
      username: cleanUsername,
      email: cleanEmail,
      role: 'Owner',
    },
  });

  return { ok: true };
}

/**
 * Authenticates local Owner with username and password.
 * Supports persistent per-account and global IP rate limiting,
 * length pre-checked constant-time hash comparison,
 * and automatic transparent re-hash upgrade to OWASP recommended N=131072.
 */
export function authenticateLocalOwner(
  dataDir: string,
  credentials: {
    username: string;
    password: string;
    ip?: string;
  }
): { ok: boolean; errorCode?: string; errorMessage?: string; user?: any } {
  const ip = credentials.ip || '127.0.0.1';
  const candidateUsername = String(credentials.username || '').trim().toLowerCase();
  const accountKey = `login:${candidateUsername}:${ip}`;
  const globalIpKey = `global_login:${ip}`;

  // Check account-specific lockout
  const accountLimit = checkRateLimit(accountKey, dataDir);
  if (!accountLimit.allowed) {
    if (accountLimit.storageDegraded) {
      return {
        ok: false,
        errorCode: 'AUTH_SUBSYSTEM_UNAVAILABLE',
        errorMessage: 'Authentication subsystem is unavailable due to security storage integrity failure. Please contact administrator.',
      };
    }
    return {
      ok: false,
      errorCode: 'TOO_MANY_FAILED_ATTEMPTS',
      errorMessage: `Too many failed authentication attempts for this account. Please retry after ${accountLimit.retryAfterSec} seconds.`,
    };
  }

  // Check global IP lockout
  const globalLimit = checkRateLimit(globalIpKey, dataDir, GLOBAL_MAX_FAILED_ATTEMPTS);
  if (!globalLimit.allowed) {
    if (globalLimit.storageDegraded) {
      return {
        ok: false,
        errorCode: 'AUTH_SUBSYSTEM_UNAVAILABLE',
        errorMessage: 'Authentication subsystem is unavailable due to security storage integrity failure. Please contact administrator.',
      };
    }
    return {
      ok: false,
      errorCode: 'TOO_MANY_FAILED_ATTEMPTS',
      errorMessage: `Too many failed authentication attempts from this IP. Please retry after ${globalLimit.retryAfterSec} seconds.`,
    };
  }

  const authFile = getLocalAuthFilePath(dataDir);
  if (!fs.existsSync(authFile)) {
    recordFailedAttempt(accountKey, dataDir);
    recordFailedAttempt(globalIpKey, dataDir, GLOBAL_MAX_FAILED_ATTEMPTS);
    return {
      ok: false,
      errorCode: 'OWNER_NOT_PROVISIONED',
      errorMessage: 'Local Owner account has not been provisioned. Complete bootstrap first.',
    };
  }

  let record: LocalOwnerRecord;
  try {
    record = JSON.parse(fs.readFileSync(authFile, 'utf8'));
  } catch (_) {
    recordFailedAttempt(accountKey, dataDir);
    recordFailedAttempt(globalIpKey, dataDir, GLOBAL_MAX_FAILED_ATTEMPTS);
    return {
      ok: false,
      errorCode: 'AUTH_FILE_CORRUPTED',
      errorMessage: 'Local Owner credential store is corrupted.',
    };
  }

  const storedUsername = record.username.toLowerCase();
  const storedEmail = record.email.toLowerCase();

  const isUserMatch = candidateUsername === storedUsername || candidateUsername === storedEmail;
  if (!isUserMatch) {
    recordFailedAttempt(accountKey, dataDir);
    recordFailedAttempt(globalIpKey, dataDir, GLOBAL_MAX_FAILED_ATTEMPTS);
    return { ok: false, errorCode: 'INVALID_CREDENTIALS', errorMessage: 'Invalid username or password.' };
  }

  const salt = Buffer.from(record.saltHex, 'hex');
  const expectedHash = Buffer.from(record.hashHex, 'hex');
  const candidateHash = deriveScryptHash(credentials.password, salt, record.scryptParams);

  if (candidateHash.length !== expectedHash.length || !crypto.timingSafeEqual(candidateHash, expectedHash)) {
    recordFailedAttempt(accountKey, dataDir);
    recordFailedAttempt(globalIpKey, dataDir, GLOBAL_MAX_FAILED_ATTEMPTS);
    AuditLogger.log({
      organizationId: 'org-default',
      actorId: 'anonymous',
      actorType: 'user',
      action: 'auth.local_owner_failed',
      entityType: 'session',
      entityId: ip,
      afterState: { attemptedUsername: credentials.username, reason: 'INVALID_PASSWORD' },
    });
    return { ok: false, errorCode: 'INVALID_CREDENTIALS', errorMessage: 'Invalid username or password.' };
  }

  // Password verified: reset rate limits
  resetRateLimit(accountKey, dataDir);
  resetRateLimit(globalIpKey, dataDir);

  // Transparent automatic upgrade to OWASP recommended N=131072 if hashed with legacy parameters
  if (record.scryptParams.N < SCRYPT_RECOMMENDED.N) {
    try {
      const upgradedSalt = crypto.randomBytes(32);
      const upgradedHash = deriveScryptHash(credentials.password, upgradedSalt, SCRYPT_RECOMMENDED);
      const upgradedRecord: LocalOwnerRecord = {
        ...record,
        saltHex: upgradedSalt.toString('hex'),
        hashHex: upgradedHash.toString('hex'),
        scryptParams: SCRYPT_RECOMMENDED,
        updatedAt: new Date().toISOString(),
      };
      const tmpAuth = authFile + '.' + process.pid + '.' + Date.now() + '.tmp';
      fs.writeFileSync(tmpAuth, JSON.stringify(upgradedRecord, null, 2), { mode: 0o600, flag: 'w' });
      fs.renameSync(tmpAuth, authFile);
    } catch (_) {
      // Non-fatal
    }
  }

  let user = db.users.get(record.ownerUserId);
  if (!user || !user.isActive) {
    // Re-provision if user record was missing or inactive
    const existingOrg = Array.from(db.organizations.values())[0];
    const orgId = existingOrg?.id || 'org-default';
    user = {
      id: record.ownerUserId,
      organizationId: orgId,
      email: record.email,
      fullName: record.fullName,
      role: 'Owner',
      isActive: true,
      mfaEnabled: false,
      phoneNumber: '01018108979',
      createdAt: record.createdAt,
      updatedAt: new Date().toISOString(),
    };
    db.users.set(record.ownerUserId, user);
    db.saveToDisk();
  }

  AuditLogger.log({
    organizationId: user.organizationId,
    actorId: user.id,
    actorType: 'user',
    action: 'auth.local_owner_login',
    entityType: 'session',
    entityId: ip,
    afterState: { userId: user.id, username: record.username, role: user.role },
  });

  return { ok: true, user };
}

/**
 * Asynchronously completes the one-time Owner bootstrap with bounded Scrypt concurrency.
 */
export async function completeLocalOwnerBootstrapAsync(
  dataDir: string,
  params: {
    bootstrapToken: string;
    username: string;
    password: string;
    email?: string;
    fullName?: string;
    ip?: string;
    scryptParams?: { N: number; r: number; p: number; keyLen: number };
  }
): Promise<{ ok: boolean; errorCode?: string; errorMessage?: string }> {
  const ip = params.ip || '127.0.0.1';
  const bootstrapKey = `bootstrap:${ip}`;
  const rateLimit = checkRateLimit(bootstrapKey, dataDir);
  if (!rateLimit.allowed) {
    if (rateLimit.storageDegraded) {
      return {
        ok: false,
        errorCode: 'AUTH_SUBSYSTEM_UNAVAILABLE',
        errorMessage: 'Authentication subsystem is unavailable due to security storage integrity failure. Please contact administrator.',
      };
    }
    return {
      ok: false,
      errorCode: 'TOO_MANY_FAILED_ATTEMPTS',
      errorMessage: `Too many failed bootstrap attempts. Please retry after ${rateLimit.retryAfterSec} seconds.`,
    };
  }

  const tokenFile = getBootstrapTokenFilePath(dataDir);
  const authFile = getLocalAuthFilePath(dataDir);

  if (fs.existsSync(authFile)) {
    return { ok: false, errorCode: 'OWNER_ALREADY_CONFIGURED', errorMessage: 'Local Owner account is already configured.' };
  }

  if (!fs.existsSync(tokenFile)) {
    return { ok: false, errorCode: 'BOOTSTRAP_TOKEN_MISSING', errorMessage: 'Bootstrap token file does not exist.' };
  }

  let storedToken: string;
  try {
    const parsed = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
    storedToken = String(parsed?.token || '').trim();
  } catch (_) {
    return { ok: false, errorCode: 'BOOTSTRAP_TOKEN_CORRUPT', errorMessage: 'Bootstrap token file is corrupted.' };
  }

  const providedToken = String(params.bootstrapToken || '').trim();
  const providedBuf = Buffer.from(providedToken, 'utf-8');
  const storedBuf = Buffer.from(storedToken, 'utf-8');
  if (providedBuf.length !== storedBuf.length || !crypto.timingSafeEqual(providedBuf, storedBuf)) {
    recordFailedAttempt(bootstrapKey, dataDir);
    return { ok: false, errorCode: 'INVALID_BOOTSTRAP_TOKEN', errorMessage: 'Bootstrap token verification failed.' };
  }

  resetRateLimit(bootstrapKey, dataDir);

  const pwCheck = validatePasswordStrength(params.password);
  if (!pwCheck.valid) {
    return { ok: false, errorCode: 'WEAK_PASSWORD', errorMessage: pwCheck.reason };
  }

  const cleanUsername = String(params.username || 'owner').trim();
  if (cleanUsername.length < 3) {
    return { ok: false, errorCode: 'INVALID_USERNAME', errorMessage: 'Username must be at least 3 characters.' };
  }

  const cleanEmail = String(params.email || 'owner@omniflow.local').trim().toLowerCase();
  const cleanFullName = String(params.fullName || 'System Owner').trim();
  const ownerUserId = 'usr-owner-01';

  const scryptConfig = params.scryptParams || SCRYPT_DEFAULTS;
  const salt = crypto.randomBytes(32);
  let hash: Buffer;
  try {
    hash = await deriveScryptHashAsync(params.password, salt, scryptConfig);
  } catch (err: any) {
    if (err?.message === 'SCRYPT_QUEUE_SATURATED' || err?.message === 'SCRYPT_QUEUE_TIMEOUT') {
      return { ok: false, errorCode: 'AUTH_SUBSYSTEM_BUSY', errorMessage: 'Authentication subsystem is currently busy. Please retry in a few moments.' };
    }
    throw err;
  }

  const nowIso = new Date().toISOString();
  const record: LocalOwnerRecord = {
    version: 1,
    ownerUserId,
    username: cleanUsername,
    email: cleanEmail,
    fullName: cleanFullName,
    saltHex: salt.toString('hex'),
    hashHex: hash.toString('hex'),
    scryptParams: scryptConfig,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const tmpAuth = `${authFile}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmpAuth, JSON.stringify(record, null, 2), { mode: 0o600, flag: 'wx' });
    fs.renameSync(tmpAuth, authFile);
  } catch (err: any) {
    try { if (fs.existsSync(tmpAuth)) fs.unlinkSync(tmpAuth); } catch (_) {}
    return { ok: false, errorCode: 'WRITE_AUTH_FAILED', errorMessage: err?.message || 'Failed to save owner credentials.' };
  }

  try {
    fs.unlinkSync(tokenFile);
  } catch (_) {}

  const existingOrg = Array.from(db.organizations.values())[0];
  const orgId = existingOrg?.id || 'org-default';

  db.users.set(ownerUserId, {
    id: ownerUserId,
    organizationId: orgId,
    email: cleanEmail,
    fullName: cleanFullName,
    role: 'Owner',
    isActive: true,
    mfaEnabled: false,
    phoneNumber: '01018108979',
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  db.saveToDisk();

  AuditLogger.log({
    organizationId: orgId,
    actorId: ownerUserId,
    actorType: 'user',
    action: 'auth.local_owner_bootstrapped',
    entityType: 'user',
    entityId: ownerUserId,
    afterState: {
      username: cleanUsername,
      email: cleanEmail,
      role: 'Owner',
    },
  });

  return { ok: true };
}

/**
 * Asynchronously authenticates local Owner with username and password,
 * executing Scrypt derivation in non-blocking libuv worker threads via a bounded queue.
 */
export async function authenticateLocalOwnerAsync(
  dataDir: string,
  credentials: {
    username: string;
    password: string;
    ip?: string;
  }
): Promise<{ ok: boolean; errorCode?: string; errorMessage?: string; user?: any }> {
  const ip = credentials.ip || '127.0.0.1';
  const candidateUsername = String(credentials.username || '').trim().toLowerCase();
  const accountKey = `login:${candidateUsername}:${ip}`;
  const globalIpKey = `global_login:${ip}`;

  // Check account-specific lockout
  const accountLimit = checkRateLimit(accountKey, dataDir);
  if (!accountLimit.allowed) {
    if (accountLimit.storageDegraded) {
      return {
        ok: false,
        errorCode: 'AUTH_SUBSYSTEM_UNAVAILABLE',
        errorMessage: 'Authentication subsystem is unavailable due to security storage integrity failure. Please contact administrator.',
      };
    }
    return {
      ok: false,
      errorCode: 'TOO_MANY_FAILED_ATTEMPTS',
      errorMessage: `Too many failed authentication attempts for this account. Please retry after ${accountLimit.retryAfterSec} seconds.`,
    };
  }

  // Check global IP lockout
  const globalLimit = checkRateLimit(globalIpKey, dataDir, GLOBAL_MAX_FAILED_ATTEMPTS);
  if (!globalLimit.allowed) {
    if (globalLimit.storageDegraded) {
      return {
        ok: false,
        errorCode: 'AUTH_SUBSYSTEM_UNAVAILABLE',
        errorMessage: 'Authentication subsystem is unavailable due to security storage integrity failure. Please contact administrator.',
      };
    }
    return {
      ok: false,
      errorCode: 'TOO_MANY_FAILED_ATTEMPTS',
      errorMessage: `Too many failed authentication attempts from this IP. Please retry after ${globalLimit.retryAfterSec} seconds.`,
    };
  }

  const authFile = getLocalAuthFilePath(dataDir);
  if (!fs.existsSync(authFile)) {
    recordFailedAttempt(accountKey, dataDir);
    recordFailedAttempt(globalIpKey, dataDir, GLOBAL_MAX_FAILED_ATTEMPTS);
    return {
      ok: false,
      errorCode: 'OWNER_NOT_PROVISIONED',
      errorMessage: 'Local Owner account has not been provisioned. Complete bootstrap first.',
    };
  }

  let record: LocalOwnerRecord;
  try {
    record = JSON.parse(fs.readFileSync(authFile, 'utf8'));
  } catch (_) {
    recordFailedAttempt(accountKey, dataDir);
    recordFailedAttempt(globalIpKey, dataDir, GLOBAL_MAX_FAILED_ATTEMPTS);
    return {
      ok: false,
      errorCode: 'AUTH_FILE_CORRUPTED',
      errorMessage: 'Local Owner credential store is corrupted.',
    };
  }

  const storedUsername = record.username.toLowerCase();
  const storedEmail = record.email.toLowerCase();

  const isUserMatch = candidateUsername === storedUsername || candidateUsername === storedEmail;
  if (!isUserMatch) {
    recordFailedAttempt(accountKey, dataDir);
    recordFailedAttempt(globalIpKey, dataDir, GLOBAL_MAX_FAILED_ATTEMPTS);
    return { ok: false, errorCode: 'INVALID_CREDENTIALS', errorMessage: 'Invalid username or password.' };
  }

  const salt = Buffer.from(record.saltHex, 'hex');
  const expectedHash = Buffer.from(record.hashHex, 'hex');

  let candidateHash: Buffer;
  try {
    candidateHash = await deriveScryptHashAsync(credentials.password, salt, record.scryptParams);
  } catch (err: any) {
    if (err?.message === 'SCRYPT_QUEUE_SATURATED' || err?.message === 'SCRYPT_QUEUE_TIMEOUT') {
      return {
        ok: false,
        errorCode: 'AUTH_SUBSYSTEM_BUSY',
        errorMessage: 'Authentication subsystem is currently busy. Please retry in a few moments.',
      };
    }
    throw err;
  }

  if (candidateHash.length !== expectedHash.length || !crypto.timingSafeEqual(candidateHash, expectedHash)) {
    recordFailedAttempt(accountKey, dataDir);
    recordFailedAttempt(globalIpKey, dataDir, GLOBAL_MAX_FAILED_ATTEMPTS);
    AuditLogger.log({
      organizationId: 'org-default',
      actorId: 'anonymous',
      actorType: 'user',
      action: 'auth.local_owner_failed',
      entityType: 'session',
      entityId: ip,
      afterState: { attemptedUsername: credentials.username, reason: 'INVALID_PASSWORD' },
    });
    return { ok: false, errorCode: 'INVALID_CREDENTIALS', errorMessage: 'Invalid username or password.' };
  }

  // Password verified: reset rate limits
  resetRateLimit(accountKey, dataDir);
  resetRateLimit(globalIpKey, dataDir);

  // Transparent automatic upgrade to OWASP recommended N=131072 if hashed with legacy parameters
  if (record.scryptParams.N < SCRYPT_RECOMMENDED.N) {
    try {
      const upgradedSalt = crypto.randomBytes(32);
      const upgradedHash = await deriveScryptHashAsync(credentials.password, upgradedSalt, SCRYPT_RECOMMENDED);
      const upgradedRecord: LocalOwnerRecord = {
        ...record,
        saltHex: upgradedSalt.toString('hex'),
        hashHex: upgradedHash.toString('hex'),
        scryptParams: SCRYPT_RECOMMENDED,
        updatedAt: new Date().toISOString(),
      };
      const tmpAuth = `${authFile}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      fs.writeFileSync(tmpAuth, JSON.stringify(upgradedRecord, null, 2), { mode: 0o600, flag: 'w' });
      fs.renameSync(tmpAuth, authFile);
    } catch (_) {
      // Non-fatal
    }
  }

  let user = db.users.get(record.ownerUserId);
  if (!user || !user.isActive) {
    const existingOrg = Array.from(db.organizations.values())[0];
    const orgId = existingOrg?.id || 'org-default';
    user = {
      id: record.ownerUserId,
      organizationId: orgId,
      email: record.email,
      fullName: record.fullName,
      role: 'Owner',
      isActive: true,
      mfaEnabled: false,
      phoneNumber: '01018108979',
      createdAt: record.createdAt,
      updatedAt: new Date().toISOString(),
    };
    db.users.set(record.ownerUserId, user);
    db.saveToDisk();
  }

  AuditLogger.log({
    organizationId: user.organizationId,
    actorId: user.id,
    actorType: 'user',
    action: 'auth.local_owner_login',
    entityType: 'session',
    entityId: ip,
    afterState: { userId: user.id, username: record.username, role: user.role },
  });

  return { ok: true, user };
}

/**
 * Express Middleware: Mounts local owner authentication endpoints:
 * - GET  /api/v1/auth/local-owner/status
 * - POST /api/v1/auth/local-owner/bootstrap
 * - POST /api/v1/auth/local-owner/login
 */
export function mountLocalOwnerRoutes(router: any, dataDir: string): void {
  router.get('/auth/local-owner/status', (_req: Request, res: Response) => {
    const status = initLocalOwnerAuth(dataDir);
    res.json({
      success: true,
      data: status,
    });
  });

  router.post('/auth/local-owner/bootstrap', async (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const rateCheck = checkRateLimit(`bootstrap:${ip}`, dataDir);
    if (!rateCheck.allowed) {
      if (rateCheck.storageDegraded) {
        res.status(503).json({
          success: false,
          error: {
            code: 'AUTH_SUBSYSTEM_UNAVAILABLE',
            message: 'Authentication subsystem is unavailable due to security storage integrity failure.',
          },
        });
        return;
      }
      res.status(429).json({
        success: false,
        error: {
          code: 'TOO_MANY_FAILED_ATTEMPTS',
          message: `Too many failed bootstrap attempts. Retry after ${rateCheck.retryAfterSec} seconds.`,
        },
      });
      return;
    }

    const { bootstrapToken, username, password, email, fullName } = req.body || {};
    const outcome = await completeLocalOwnerBootstrapAsync(dataDir, {
      bootstrapToken,
      username,
      password,
      email,
      fullName,
      ip,
    });

    if (!outcome.ok) {
      const statusCode =
        outcome.errorCode === 'TOO_MANY_FAILED_ATTEMPTS'
          ? 429
          : outcome.errorCode === 'AUTH_SUBSYSTEM_BUSY' || outcome.errorCode === 'AUTH_SUBSYSTEM_UNAVAILABLE'
          ? 503
          : outcome.errorCode === 'WEAK_PASSWORD'
          ? 400
          : 403;
      res.status(statusCode).json({
        success: false,
        error: {
          code: outcome.errorCode,
          message: outcome.errorMessage,
        },
      });
      return;
    }

    res.json({
      success: true,
      message: 'Local Owner account successfully initialized.',
    });
  });

  router.post('/auth/local-owner/login', async (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const { username, password } = req.body || {};

    const outcome = await authenticateLocalOwnerAsync(dataDir, { username, password, ip });
    if (!outcome.ok) {
      const statusCode =
        outcome.errorCode === 'TOO_MANY_FAILED_ATTEMPTS'
          ? 429
          : outcome.errorCode === 'AUTH_SUBSYSTEM_BUSY' || outcome.errorCode === 'AUTH_SUBSYSTEM_UNAVAILABLE'
          ? 503
          : 401;
      res.status(statusCode).json({
        success: false,
        error: {
          code: outcome.errorCode,
          message: outcome.errorMessage,
        },
      });
      return;
    }

    const session = issueSessionToken({ userId: outcome.user.id });
    res.setHeader('Set-Cookie', formatSessionCookie(req, session.token));
    res.setHeader('X-CSRF-Token', session.csrfToken);

    res.json({
      success: true,
      data: {
        token: session.token,
        csrfToken: session.csrfToken,
        user: outcome.user,
      },
    });
  });
}
