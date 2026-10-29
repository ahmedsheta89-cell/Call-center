/**
 * @file server/core/audit.ts
 * Immutable Audit Logging Engine for Enterprise Compliance (Phase P.1.3.2 Hardened)
 * Enforces PII/Secret Redaction, Deep Object.freeze Immutability, Deterministic Canonical Serialization,
 * Schema v3 Full-Field SHA-256 Hash Chaining, HMAC-SHA-256 Authenticated Integrity Manifests,
 * and Atomic Verify-Before-Mutate State Transitions.
 */

import crypto from 'crypto';
import { AuditEvent, UUID } from './types.ts';
import { CHANNEL_SECRET_KEY_REGEX, isChannelSecretField, isEncryptedSecretEnvelope } from './channelCrypto.ts';

export interface AuditParams {
  organizationId: UUID;
  actorId?: UUID;
  actorType: 'user' | 'agent' | 'ai' | 'system';
  action: string;
  entityType: string;
  entityId: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  reason?: string;
}

const SENSITIVE_KEY_PATTERN = CHANNEL_SECRET_KEY_REGEX;
const CARD_NUMBER_REGEX = /\b(?:\d[ -]*?){13,16}\b/g;
const HEX_64_REGEX = /^[0-9a-f]{64}$/;

export const AUDIT_GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
export const DEFAULT_AUDIT_RETENTION_LIMIT = 2000;
export const AUDIT_MANIFEST_CONTRACT_VERSION = '1.3.2-p1-3-2' as const;
export const DEFAULT_AUDIT_HMAC_KEY_ID = 'audit-hmac-v1';

export function redactSensitiveValue(val: unknown): unknown {
  if (typeof val === 'string') {
    return val.replace(CARD_NUMBER_REGEX, '[REDACTED_CARD]');
  }
  if (Array.isArray(val)) {
    return val.map(redactSensitiveValue);
  }
  if (val && typeof val === 'object') {
    if (isEncryptedSecretEnvelope(val)) {
      return '[REDACTED_SECRET]';
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (isChannelSecretField(k) || SENSITIVE_KEY_PATTERN.test(k)) {
        out[k] = '[REDACTED_SECRET]';
      } else {
        out[k] = redactSensitiveValue(v);
      }
    }
    return out;
  }
  return val;
}

/**
 * Recursively clones and deep-freezes an object/array hierarchy so that no caller
 * can mutate top-level or nested properties of an AuditEvent in memory.
 */
export function deepFreezeAuditValue<T>(val: T): T {
  if (val === null || val === undefined || typeof val !== 'object') {
    return val;
  }
  if (Array.isArray(val)) {
    const clonedArr = val.map((item) => deepFreezeAuditValue(item));
    return Object.freeze(clonedArr) as unknown as T;
  }
  const clonedObj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    if (v !== undefined) {
      clonedObj[k] = deepFreezeAuditValue(v);
    }
  }
  return Object.freeze(clonedObj) as unknown as T;
}

/**
 * Recursively normalizes a value by sorting object keys lexicographically at all depths
 * while preserving array element order. Ensures 100% deterministic JSON serialization.
 */
export function canonicalizeAuditValue(val: unknown): unknown {
  if (val === null || val === undefined || typeof val !== 'object') {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map((item) => (item === undefined ? null : canonicalizeAuditValue(item)));
  }
  const sortedKeys = Object.keys(val as Record<string, unknown>).sort();
  const out: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    const v = (val as Record<string, unknown>)[k];
    if (v !== undefined) {
      out[k] = canonicalizeAuditValue(v);
    }
  }
  return out;
}

export function canonicalSerialize(val: unknown): string {
  return JSON.stringify(canonicalizeAuditValue(val));
}

export type AuditErrorCode =
  | 'VERIFIED'
  | 'CHAIN_VALID'
  | 'CHAIN_VALID_EMPTY'
  | 'AUDIT_KEY_UNAVAILABLE'
  | 'AUDIT_KEY_INVALID'
  | 'AUDIT_KEY_REUSE_FORBIDDEN'
  | 'AUDIT_KEY_ID_UNKNOWN'
  | 'AUDIT_MANIFEST_MISSING'
  | 'AUDIT_MANIFEST_INVALID'
  | 'AUDIT_SIGNATURE_INVALID'
  | 'UNSUPPORTED_AUDIT_SCHEMA_VERSION'
  | 'CROSS_TENANT_RESTORE_FORBIDDEN'
  | 'TAMPERED_AUDIT_CHAIN'
  | 'CORRUPTED_BACKUP_PAYLOAD'
  | 'MALFORMED_AUDIT_EVENT'
  | 'DUPLICATE_AUDIT_EVENT_ID'
  | 'BROKEN_ANCHOR_LINK'
  | 'BROKEN_GENESIS_LINK'
  | 'MISSING_RETENTION_CHECKPOINT'
  | 'BROKEN_PREV_HASH_LINK'
  | 'PAYLOAD_HASH_MISMATCH'
  | 'BROKEN_GLOBAL_SEQUENCE'
  | 'MALFORMED_TENANT_CHAIN_FIELDS'
  | 'BROKEN_TENANT_PREV_HASH_LINK'
  | 'BROKEN_TENANT_SEQUENCE'
  | 'INVALID_RETENTION_CHECKPOINT'
  | 'INVALID_SNAPSHOT';

export interface AuditHmacKeyValidationResult {
  valid: boolean;
  status: number;
  code: 'VERIFIED' | 'AUDIT_KEY_UNAVAILABLE' | 'AUDIT_KEY_INVALID' | 'AUDIT_KEY_REUSE_FORBIDDEN' | 'AUDIT_KEY_ID_UNKNOWN';
  keyId?: string;
  keyBuffer?: Buffer;
  reason?: string;
}

/**
 * Validates the dedicated `AUDIT_CHECKPOINT_HMAC_KEY` and `AUDIT_CHECKPOINT_HMAC_KEY_ID`.
 * Enforces strict cryptographic key separation: reusing `CHANNEL_SECRET_ENCRYPTION_KEY`
 * or `SESSION_SECRET` is explicitly rejected with `AUDIT_KEY_REUSE_FORBIDDEN`.
 * Never logs or echoes raw key material.
 */
export function validateAuditHmacKey(): AuditHmacKeyValidationResult {
  const rawKey = process.env.AUDIT_CHECKPOINT_HMAC_KEY;
  if (rawKey === undefined || rawKey === null || rawKey.trim().length === 0) {
    return {
      valid: false,
      status: 503,
      code: 'AUDIT_KEY_UNAVAILABLE',
      reason:
        'AUDIT_CHECKPOINT_HMAC_KEY is not configured. A dedicated 32-byte (64 lowercase hex characters) HMAC key is required.',
    };
  }

  if (rawKey !== rawKey.trim() || !HEX_64_REGEX.test(rawKey)) {
    return {
      valid: false,
      status: 503,
      code: 'AUDIT_KEY_INVALID',
      reason:
        'AUDIT_CHECKPOINT_HMAC_KEY must be an exact 64-character lowercase hexadecimal string (32 bytes = 256 bits) matching ^[0-9a-f]{64}$.',
    };
  }

  const rawChannelKey = process.env.CHANNEL_SECRET_ENCRYPTION_KEY;
  if (typeof rawChannelKey === 'string' && rawChannelKey.trim().length > 0) {
    if (rawKey.toLowerCase() === rawChannelKey.trim().toLowerCase()) {
      return {
        valid: false,
        status: 503,
        code: 'AUDIT_KEY_REUSE_FORBIDDEN',
        reason:
          'Cryptographic key separation violation: AUDIT_CHECKPOINT_HMAC_KEY must be independent and must not reuse CHANNEL_SECRET_ENCRYPTION_KEY.',
      };
    }
  }

  const rawSessionSecret = process.env.SESSION_SECRET;
  if (typeof rawSessionSecret === 'string' && rawSessionSecret.trim().length > 0) {
    if (rawKey.toLowerCase() === rawSessionSecret.trim().toLowerCase()) {
      return {
        valid: false,
        status: 503,
        code: 'AUDIT_KEY_REUSE_FORBIDDEN',
        reason:
          'Cryptographic key separation violation: AUDIT_CHECKPOINT_HMAC_KEY must be independent and must not reuse SESSION_SECRET.',
      };
    }
  }

  const rawKeyId = process.env.AUDIT_CHECKPOINT_HMAC_KEY_ID;
  const keyId =
    rawKeyId === undefined ? DEFAULT_AUDIT_HMAC_KEY_ID : rawKeyId.trim();
  if (!keyId || keyId.length > 128 || !/^[a-zA-Z0-9._:-]+$/.test(keyId)) {
    return {
      valid: false,
      status: 503,
      code: 'AUDIT_KEY_INVALID',
      reason:
        'AUDIT_CHECKPOINT_HMAC_KEY_ID must be a non-empty identifier matching ^[a-zA-Z0-9._:-]+$.',
    };
  }

  const keyBuffer = Buffer.from(rawKey, 'hex');
  if (keyBuffer.length !== 32) {
    return {
      valid: false,
      status: 503,
      code: 'AUDIT_KEY_INVALID',
      reason: 'AUDIT_CHECKPOINT_HMAC_KEY decoded length must be exactly 32 bytes.',
    };
  }

  return {
    valid: true,
    status: 200,
    code: 'VERIFIED',
    keyId,
    keyBuffer,
  };
}

/**
 * Resolves an HMAC verification key by `requestedKeyId`.
 * Checks the active `AUDIT_CHECKPOINT_HMAC_KEY_ID` first, then optional historical
 * verification-only keys in `AUDIT_CHECKPOINT_HMAC_VERIFY_KEYS` (`keyId1:64hex,keyId2:64hex`).
 */
export function resolveAuditHmacVerificationKey(requestedKeyId: unknown): AuditHmacKeyValidationResult {
  const primary = validateAuditHmacKey();
  if (!primary.valid) {
    return primary;
  }

  if (typeof requestedKeyId !== 'string' || requestedKeyId.trim().length === 0) {
    return {
      valid: false,
      status: 400,
      code: 'AUDIT_KEY_ID_UNKNOWN',
      reason: 'Manifest keyId is missing or empty.',
    };
  }

  const cleanRequestedId = requestedKeyId.trim();
  if (cleanRequestedId === primary.keyId) {
    return primary;
  }

  const rawVerifyRing = process.env.AUDIT_CHECKPOINT_HMAC_VERIFY_KEYS;
  if (typeof rawVerifyRing === 'string' && rawVerifyRing.trim().length > 0) {
    const entries = rawVerifyRing
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const entry of entries) {
      const sepIdx = entry.indexOf(':');
      if (sepIdx <= 0) continue;
      const candidateId = entry.slice(0, sepIdx).trim();
      const candidateHex = entry.slice(sepIdx + 1).trim();
      if (candidateId === cleanRequestedId) {
        if (!HEX_64_REGEX.test(candidateHex)) {
          return {
            valid: false,
            status: 503,
            code: 'AUDIT_KEY_INVALID',
            reason: `Configured verification key for keyId [${cleanRequestedId}] in AUDIT_CHECKPOINT_HMAC_VERIFY_KEYS is not valid 64-char lowercase hex.`,
          };
        }
        const rawChannelKey = process.env.CHANNEL_SECRET_ENCRYPTION_KEY;
        if (
          typeof rawChannelKey === 'string' &&
          rawChannelKey.trim().length > 0 &&
          candidateHex.toLowerCase() === rawChannelKey.trim().toLowerCase()
        ) {
          return {
            valid: false,
            status: 503,
            code: 'AUDIT_KEY_REUSE_FORBIDDEN',
            reason: `Verification key [${cleanRequestedId}] must not reuse CHANNEL_SECRET_ENCRYPTION_KEY.`,
          };
        }
        return {
          valid: true,
          status: 200,
          code: 'VERIFIED',
          keyId: candidateId,
          keyBuffer: Buffer.from(candidateHex, 'hex'),
        };
      }
    }
  }

  return {
    valid: false,
    status: 400,
    code: 'AUDIT_KEY_ID_UNKNOWN',
    reason: `Unknown audit manifest HMAC keyId [${cleanRequestedId}]; not found in active AUDIT_CHECKPOINT_HMAC_KEY_ID or AUDIT_CHECKPOINT_HMAC_VERIFY_KEYS.`,
  };
}

export interface TenantRetentionEntry {
  evictedCount: number;
  evictedTenantEventCount: number;
  lastEvictedTenantSeq: number;
  lastEvictedIntegrityHash: string;
  lastEvictedCreatedAt: string | null;
}

export interface TenantAuditCheckpoint extends TenantRetentionEntry {
  organizationId: UUID;
  contractVersion: '1.3.0-p1-3';
  activeTenantEventCount: number;
  latestTenantSeq: number;
  latestTenantIntegrityHash: string;
}

export interface AuditRetentionCheckpoint {
  contractVersion: '1.3.0-p1-3';
  maxRetentionLimit: number;
  maxHotWindowEvents: number;
  totalEvictedCount: number;
  lastEvictedGlobalSeq: number;
  lastEvictedIntegrityHash: string;
  lastEvictedCreatedAt: string | null;
  cumulativeArchiveChainHash: string;
  tenantCheckpoints: Record<UUID, TenantRetentionEntry>;
}

export type AuditArtifactType = 'FULL_BACKUP' | 'TENANT_BACKUP' | 'DISK_SNAPSHOT';

export interface AuditManifestTenantSummary {
  organizationId: UUID;
  activeCount: number;
  evictedCount: number;
  latestTenantSeq: number;
  latestTenantIntegrityHash: string;
  lastEvictedTenantSeq: number;
  lastEvictedIntegrityHash: string;
}

export interface AuditIntegrityManifest {
  manifestVersion: typeof AUDIT_MANIFEST_CONTRACT_VERSION;
  algorithm: 'HMAC-SHA256';
  keyId: string;
  artifactType: AuditArtifactType;
  scopeOrgId: string | null;
  issuedAt: string;
  eventCount: number;
  v1Count: number;
  v2Count: number;
  v3Count: number;
  oldestEventId: string | null;
  latestEventId: string | null;
  oldestGlobalSeq: number | null;
  latestGlobalSeq: number | null;
  oldestPrevHash: string;
  latestIntegrityHash: string;
  eventsDigest: string;
  checkpointDigest: string;
  perTenantSummaries: Record<UUID, AuditManifestTenantSummary>;
  signature: string;
}

export interface AuditSnapshotState {
  events: AuditEvent[];
  checkpoint: AuditRetentionCheckpoint;
}

export interface ChainIntegrityResult {
  valid: boolean;
  checkedCount: number;
  v1Count?: number;
  v2Count?: number;
  v3Count?: number;
  code?: AuditErrorCode | string;
  failureReason?: string;
  anchorType?: 'GENESIS' | 'RETENTION_CHECKPOINT';
  latestIntegrityHash?: string;
}

export interface TenantBackupAuditVerificationResult {
  valid: boolean;
  status: number;
  code: AuditErrorCode;
  checkedCount: number;
  failureReason?: string;
}

export interface ManifestVerificationResult {
  valid: boolean;
  status: number;
  code: AuditErrorCode;
  failureReason?: string;
}

function createEmptyRetentionCheckpoint(maxLimit = DEFAULT_AUDIT_RETENTION_LIMIT): AuditRetentionCheckpoint {
  return {
    contractVersion: '1.3.0-p1-3',
    maxRetentionLimit: maxLimit,
    maxHotWindowEvents: maxLimit,
    totalEvictedCount: 0,
    lastEvictedGlobalSeq: 0,
    lastEvictedIntegrityHash: AUDIT_GENESIS_HASH,
    lastEvictedCreatedAt: null,
    cumulativeArchiveChainHash: AUDIT_GENESIS_HASH,
    tenantCheckpoints: {},
  };
}

function cloneCheckpoint(ckpt: AuditRetentionCheckpoint): AuditRetentionCheckpoint {
  const tenantCheckpoints: Record<UUID, TenantRetentionEntry> = {};
  for (const [orgId, entry] of Object.entries(ckpt.tenantCheckpoints || {})) {
    tenantCheckpoints[orgId] = {
      ...entry,
      evictedTenantEventCount: entry.evictedTenantEventCount ?? entry.evictedCount ?? 0,
    };
  }
  return {
    ...ckpt,
    maxHotWindowEvents: ckpt.maxHotWindowEvents ?? ckpt.maxRetentionLimit ?? DEFAULT_AUDIT_RETENTION_LIMIT,
    tenantCheckpoints,
  };
}

function isNonNegativeInteger(val: unknown): val is number {
  return typeof val === 'number' && Number.isInteger(val) && val >= 0;
}

/**
 * Strictly validates `AuditRetentionCheckpoint` structure, counters, and 64-char hex hashes,
 * even when `candidateEvents` is empty (`CHAIN_VALID_EMPTY` hardening, Gate G9 / AC-28).
 */
function validateGlobalRetentionCheckpoint(
  ckpt: AuditRetentionCheckpoint,
  chronologicalEvents: AuditEvent[]
): { valid: boolean; code?: AuditErrorCode; failureReason?: string } {
  if (!ckpt || typeof ckpt !== 'object' || Array.isArray(ckpt)) {
    return {
      valid: false,
      code: 'INVALID_RETENTION_CHECKPOINT',
      failureReason: 'Retention checkpoint must be a valid object.',
    };
  }

  if (
    !isNonNegativeInteger(ckpt.totalEvictedCount) ||
    !isNonNegativeInteger(ckpt.lastEvictedGlobalSeq) ||
    typeof ckpt.lastEvictedIntegrityHash !== 'string' ||
    !HEX_64_REGEX.test(ckpt.lastEvictedIntegrityHash) ||
    typeof ckpt.cumulativeArchiveChainHash !== 'string' ||
    !HEX_64_REGEX.test(ckpt.cumulativeArchiveChainHash) ||
    !ckpt.tenantCheckpoints ||
    typeof ckpt.tenantCheckpoints !== 'object' ||
    Array.isArray(ckpt.tenantCheckpoints)
  ) {
    return {
      valid: false,
      code: 'INVALID_RETENTION_CHECKPOINT',
      failureReason:
        'Malformed global retention checkpoint fields: counters must be non-negative integers and hashes must be 64-char lowercase hex.',
    };
  }

  if (ckpt.totalEvictedCount === 0) {
    if (
      ckpt.lastEvictedGlobalSeq !== 0 ||
      ckpt.lastEvictedIntegrityHash !== AUDIT_GENESIS_HASH ||
      ckpt.cumulativeArchiveChainHash !== AUDIT_GENESIS_HASH
    ) {
      return {
        valid: false,
        code: 'INVALID_RETENTION_CHECKPOINT',
        failureReason:
          'Inconsistent retention checkpoint: totalEvictedCount is 0 but evicted sequence or hash is non-genesis.',
      };
    }
  } else {
    if (
      ckpt.lastEvictedGlobalSeq < ckpt.totalEvictedCount ||
      ckpt.lastEvictedIntegrityHash === AUDIT_GENESIS_HASH ||
      ckpt.cumulativeArchiveChainHash === AUDIT_GENESIS_HASH
    ) {
      return {
        valid: false,
        code: 'INVALID_RETENTION_CHECKPOINT',
        failureReason:
          'Inconsistent retention checkpoint: totalEvictedCount > 0 requires valid non-genesis lastEvictedIntegrityHash, cumulativeArchiveChainHash, and lastEvictedGlobalSeq >= totalEvictedCount.',
      };
    }
  }

  let sumTenantEvicted = 0;
  for (const [orgId, tEntry] of Object.entries(ckpt.tenantCheckpoints)) {
    if (!orgId || typeof orgId !== 'string' || !tEntry || typeof tEntry !== 'object') {
      return {
        valid: false,
        code: 'INVALID_RETENTION_CHECKPOINT',
        failureReason: `Malformed tenantCheckpoint entry for organization [${orgId}].`,
      };
    }
    const evCount = tEntry.evictedCount;
    const evTenantCount = tEntry.evictedTenantEventCount ?? tEntry.evictedCount;
    if (
      !isNonNegativeInteger(evCount) ||
      !isNonNegativeInteger(evTenantCount) ||
      evCount !== evTenantCount ||
      !isNonNegativeInteger(tEntry.lastEvictedTenantSeq) ||
      typeof tEntry.lastEvictedIntegrityHash !== 'string' ||
      !HEX_64_REGEX.test(tEntry.lastEvictedIntegrityHash)
    ) {
      return {
        valid: false,
        code: 'INVALID_RETENTION_CHECKPOINT',
        failureReason: `Invalid counters or hash in tenantCheckpoints[${orgId}].`,
      };
    }
    if (evCount === 0) {
      if (tEntry.lastEvictedTenantSeq !== 0 || tEntry.lastEvictedIntegrityHash !== AUDIT_GENESIS_HASH) {
        return {
          valid: false,
          code: 'INVALID_RETENTION_CHECKPOINT',
          failureReason: `Inconsistent tenantCheckpoints[${orgId}]: evictedCount is 0 but sequence/hash is non-genesis.`,
        };
      }
    } else {
      if (
        tEntry.lastEvictedTenantSeq < evCount ||
        tEntry.lastEvictedIntegrityHash === AUDIT_GENESIS_HASH
      ) {
        return {
          valid: false,
          code: 'INVALID_RETENTION_CHECKPOINT',
          failureReason: `Inconsistent tenantCheckpoints[${orgId}]: evictedCount > 0 requires non-genesis hash and lastEvictedTenantSeq >= evictedCount.`,
        };
      }
    }
    sumTenantEvicted += evCount;
  }

  if (sumTenantEvicted !== ckpt.totalEvictedCount) {
    return {
      valid: false,
      code: 'INVALID_RETENTION_CHECKPOINT',
      failureReason: `Retention checkpoint sum of tenant evictedCount (${sumTenantEvicted}) does not match totalEvictedCount (${ckpt.totalEvictedCount}).`,
    };
  }

  // Verify that any tenant with active v2/v3 events starting at tenantSeq > 1 has a matching tenantCheckpoint entry
  const seenTenantsFirstEvent = new Set<string>();
  for (const ev of chronologicalEvents) {
    if (!ev || typeof ev.organizationId !== 'string') continue;
    if (seenTenantsFirstEvent.has(ev.organizationId)) continue;
    seenTenantsFirstEvent.add(ev.organizationId);
    if ((ev.schemaVersion === 2 || ev.schemaVersion === 3) && typeof ev.tenantSeq === 'number' && ev.tenantSeq > 1) {
      const tCkpt = ckpt.tenantCheckpoints[ev.organizationId];
      if (!tCkpt || tCkpt.evictedCount === 0 || tCkpt.lastEvictedTenantSeq + 1 !== ev.tenantSeq) {
        return {
          valid: false,
          code: 'INVALID_RETENTION_CHECKPOINT',
          failureReason: `Tenant [${ev.organizationId}] starts at tenantSeq=${ev.tenantSeq} without matching tenantCheckpoints anchor.`,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Validates a `TenantAuditCheckpoint` structure and its consistency with `chronologicalEvents`,
 * including when `chronologicalEvents` is empty (`AC-28`).
 */
function validateTenantCheckpointConsistency(
  cleanOrgId: UUID,
  tenantCheckpoint: Partial<TenantAuditCheckpoint>,
  chronologicalEvents: AuditEvent[]
): { valid: boolean; status: number; code: AuditErrorCode; failureReason?: string } {
  if (typeof tenantCheckpoint !== 'object' || Array.isArray(tenantCheckpoint)) {
    return {
      valid: false,
      status: 400,
      code: 'TAMPERED_AUDIT_CHAIN',
      failureReason: 'auditTenantCheckpoint must be a valid object.',
    };
  }

  if (
    tenantCheckpoint.organizationId !== undefined &&
    tenantCheckpoint.organizationId !== cleanOrgId
  ) {
    return {
      valid: false,
      status: 403,
      code: 'CROSS_TENANT_RESTORE_FORBIDDEN',
      failureReason: `Cross-tenant audit checkpoint forbidden: checkpoint belongs to [${tenantCheckpoint.organizationId}], expected [${cleanOrgId}]`,
    };
  }

  const evictedCount = tenantCheckpoint.evictedCount ?? 0;
  const evictedTenantEventCount =
    tenantCheckpoint.evictedTenantEventCount ?? tenantCheckpoint.evictedCount ?? 0;
  const lastEvictedTenantSeq = tenantCheckpoint.lastEvictedTenantSeq ?? 0;
  const lastEvictedIntegrityHash =
    tenantCheckpoint.lastEvictedIntegrityHash ?? AUDIT_GENESIS_HASH;

  if (
    !isNonNegativeInteger(evictedCount) ||
    !isNonNegativeInteger(evictedTenantEventCount) ||
    evictedCount !== evictedTenantEventCount ||
    !isNonNegativeInteger(lastEvictedTenantSeq) ||
    typeof lastEvictedIntegrityHash !== 'string' ||
    !HEX_64_REGEX.test(lastEvictedIntegrityHash)
  ) {
    return {
      valid: false,
      status: 400,
      code: 'TAMPERED_AUDIT_CHAIN',
      failureReason:
        'Malformed auditTenantCheckpoint: evicted counters must be non-negative integers and lastEvictedIntegrityHash must be 64-char hex.',
    };
  }

  if (evictedCount === 0) {
    if (lastEvictedTenantSeq !== 0 || lastEvictedIntegrityHash !== AUDIT_GENESIS_HASH) {
      return {
        valid: false,
        status: 400,
        code: 'TAMPERED_AUDIT_CHAIN',
        failureReason:
          'Inconsistent auditTenantCheckpoint: evictedCount is 0 but lastEvictedTenantSeq or lastEvictedIntegrityHash is non-genesis.',
      };
    }
  } else {
    if (lastEvictedTenantSeq < evictedCount || lastEvictedIntegrityHash === AUDIT_GENESIS_HASH) {
      return {
        valid: false,
        status: 400,
        code: 'TAMPERED_AUDIT_CHAIN',
        failureReason:
          'Inconsistent auditTenantCheckpoint: evictedCount > 0 requires non-genesis lastEvictedIntegrityHash and lastEvictedTenantSeq >= evictedCount.',
      };
    }
  }

  if (tenantCheckpoint.activeTenantEventCount !== undefined) {
    if (!isNonNegativeInteger(tenantCheckpoint.activeTenantEventCount)) {
      return {
        valid: false,
        status: 400,
        code: 'TAMPERED_AUDIT_CHAIN',
        failureReason: 'auditTenantCheckpoint.activeTenantEventCount must be a non-negative integer.',
      };
    }
    if (chronologicalEvents.length !== tenantCheckpoint.activeTenantEventCount) {
      return {
        valid: false,
        status: 400,
        code: 'TAMPERED_AUDIT_CHAIN',
        failureReason: `Tenant audit event count mismatch against tenantCheckpoint: expected ${tenantCheckpoint.activeTenantEventCount}, got ${chronologicalEvents.length}`,
      };
    }
  }

  if (tenantCheckpoint.latestTenantSeq !== undefined) {
    if (!isNonNegativeInteger(tenantCheckpoint.latestTenantSeq)) {
      return {
        valid: false,
        status: 400,
        code: 'TAMPERED_AUDIT_CHAIN',
        failureReason: 'auditTenantCheckpoint.latestTenantSeq must be a non-negative integer.',
      };
    }
    const expectedLatestSeq =
      chronologicalEvents.length > 0
        ? (chronologicalEvents[chronologicalEvents.length - 1].tenantSeq ??
            lastEvictedTenantSeq + chronologicalEvents.length)
        : lastEvictedTenantSeq;
    if (tenantCheckpoint.latestTenantSeq !== expectedLatestSeq) {
      return {
        valid: false,
        status: 400,
        code: 'TAMPERED_AUDIT_CHAIN',
        failureReason: `Tenant latestTenantSeq mismatch against tenantCheckpoint: expected ${expectedLatestSeq}, got ${tenantCheckpoint.latestTenantSeq}`,
      };
    }
  }

  if (tenantCheckpoint.latestTenantIntegrityHash !== undefined) {
    if (
      typeof tenantCheckpoint.latestTenantIntegrityHash !== 'string' ||
      !HEX_64_REGEX.test(tenantCheckpoint.latestTenantIntegrityHash)
    ) {
      return {
        valid: false,
        status: 400,
        code: 'TAMPERED_AUDIT_CHAIN',
        failureReason: 'auditTenantCheckpoint.latestTenantIntegrityHash must be a 64-char lowercase hex hash.',
      };
    }
    const expectedLatestHash =
      chronologicalEvents.length > 0
        ? chronologicalEvents[chronologicalEvents.length - 1].integrityHash
        : lastEvictedIntegrityHash;
    if (tenantCheckpoint.latestTenantIntegrityHash !== expectedLatestHash) {
      return {
        valid: false,
        status: 400,
        code: 'TAMPERED_AUDIT_CHAIN',
        failureReason: `Latest tenant audit event hash mismatch against tenantCheckpoint: expected ${tenantCheckpoint.latestTenantIntegrityHash}, got ${expectedLatestHash}`,
      };
    }
  }

  return { valid: true, status: 200, code: 'VERIFIED' };
}

export class AuditLogger {
  private static inMemoryStore: AuditEvent[] = [];
  private static maxRetentionLimit: number = DEFAULT_AUDIT_RETENTION_LIMIT;
  private static retentionCheckpoint: AuditRetentionCheckpoint = createEmptyRetentionCheckpoint(
    DEFAULT_AUDIT_RETENTION_LIMIT
  );
  private static lastVerifiedRestoreManifest: AuditIntegrityManifest | null = null;

  public static async log(params: AuditParams): Promise<AuditEvent> {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const prevEvent = this.inMemoryStore[0];
    const prevHash =
      prevEvent?.integrityHash ||
      (this.retentionCheckpoint.totalEvictedCount > 0
        ? this.retentionCheckpoint.lastEvictedIntegrityHash
        : AUDIT_GENESIS_HASH);
    const globalSeq =
      (prevEvent?.globalSeq ??
        (this.inMemoryStore.length + this.retentionCheckpoint.totalEvictedCount)) + 1;

    const prevTenantEvent = this.inMemoryStore.find(
      (e) => e.organizationId === params.organizationId
    );
    const tenantCkpt = this.retentionCheckpoint.tenantCheckpoints[params.organizationId];
    const tenantPrevHash =
      prevTenantEvent?.integrityHash ||
      (tenantCkpt && tenantCkpt.evictedCount > 0
        ? tenantCkpt.lastEvictedIntegrityHash
        : AUDIT_GENESIS_HASH);
    const tenantSeq =
      (prevTenantEvent?.tenantSeq ??
        (tenantCkpt?.lastEvictedTenantSeq ??
          this.inMemoryStore.filter((e) => e.organizationId === params.organizationId).length)) + 1;

    const sanitizedBefore = params.beforeState
      ? (canonicalizeAuditValue(
          redactSensitiveValue(JSON.parse(JSON.stringify(params.beforeState)))
        ) as Record<string, unknown>)
      : undefined;
    const sanitizedAfter = params.afterState
      ? (canonicalizeAuditValue(
          redactSensitiveValue(JSON.parse(JSON.stringify(params.afterState)))
        ) as Record<string, unknown>)
      : undefined;

    const ipAddress = params.ipAddress || '127.0.0.1';
    const userAgent = params.userAgent || 'system';
    const requestId = params.requestId || crypto.randomUUID();
    const reason = params.reason;

    const integrityHash = this.computeEventHash({
      schemaVersion: 3,
      id,
      organizationId: params.organizationId,
      actorId: params.actorId || 'anonymous',
      actorType: params.actorType,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      beforeState: sanitizedBefore,
      afterState: sanitizedAfter,
      ipAddress,
      userAgent,
      requestId,
      reason,
      globalSeq,
      prevHash,
      tenantSeq,
      tenantPrevHash,
      createdAt,
    });

    const event: AuditEvent = deepFreezeAuditValue<AuditEvent>({
      id,
      organizationId: params.organizationId,
      actorId: params.actorId,
      actorType: params.actorType,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      beforeState: sanitizedBefore,
      afterState: sanitizedAfter,
      ipAddress,
      userAgent,
      requestId,
      reason,
      schemaVersion: 3,
      globalSeq,
      prevHash,
      tenantSeq,
      tenantPrevHash,
      integrityHash,
      createdAt,
    });

    this.inMemoryStore.unshift(event);
    while (this.inMemoryStore.length > this.maxRetentionLimit) {
      const evicted = this.inMemoryStore.pop()!;
      this.recordEvictedEventInCheckpoint(evicted);
    }

    return event;
  }

  private static recordEvictedEventInCheckpoint(evicted: AuditEvent): void {
    const evictedHash = evicted.integrityHash || AUDIT_GENESIS_HASH;
    this.retentionCheckpoint.totalEvictedCount += 1;
    this.retentionCheckpoint.lastEvictedGlobalSeq =
      evicted.globalSeq ?? this.retentionCheckpoint.totalEvictedCount;
    this.retentionCheckpoint.lastEvictedIntegrityHash = evictedHash;
    this.retentionCheckpoint.lastEvictedCreatedAt = evicted.createdAt;
    this.retentionCheckpoint.cumulativeArchiveChainHash = crypto
      .createHash('sha256')
      .update(`${this.retentionCheckpoint.cumulativeArchiveChainHash}:${evictedHash}`)
      .digest('hex');

    const prevTenantEntry = this.retentionCheckpoint.tenantCheckpoints[evicted.organizationId] || {
      evictedCount: 0,
      evictedTenantEventCount: 0,
      lastEvictedTenantSeq: 0,
      lastEvictedIntegrityHash: AUDIT_GENESIS_HASH,
      lastEvictedCreatedAt: null,
    };
    const nextEvictedCount = prevTenantEntry.evictedCount + 1;
    this.retentionCheckpoint.tenantCheckpoints[evicted.organizationId] = {
      evictedCount: nextEvictedCount,
      evictedTenantEventCount: nextEvictedCount,
      lastEvictedTenantSeq: evicted.tenantSeq ?? nextEvictedCount,
      lastEvictedIntegrityHash: evictedHash,
      lastEvictedCreatedAt: evicted.createdAt,
    };
  }

  public static recordVerifiedRestoreMetadata(manifest: AuditIntegrityManifest): void {
    this.lastVerifiedRestoreManifest = deepFreezeAuditValue({ ...manifest });
  }

  public static getLastVerifiedRestoreManifest(): AuditIntegrityManifest | null {
    return this.lastVerifiedRestoreManifest;
  }

  public static getMaxRetentionLimit(): number {
    return this.maxRetentionLimit;
  }

  public static setMaxRetentionLimitForTesting(limit: number): void {
    if (process.env.NODE_ENV === 'production') return;
    const validLimit = Math.max(1, Math.floor(limit));
    this.maxRetentionLimit = validLimit;
    this.retentionCheckpoint.maxRetentionLimit = validLimit;
    this.retentionCheckpoint.maxHotWindowEvents = validLimit;
    while (this.inMemoryStore.length > this.maxRetentionLimit) {
      const evicted = this.inMemoryStore.pop()!;
      this.recordEvictedEventInCheckpoint(evicted);
    }
  }

  public static resetForTesting(): void {
    if (process.env.NODE_ENV === 'production') return;
    this.inMemoryStore = [];
    this.retentionCheckpoint = createEmptyRetentionCheckpoint(this.maxRetentionLimit);
  }

  public static exportCheckpoint(): AuditRetentionCheckpoint {
    return cloneCheckpoint(this.retentionCheckpoint);
  }

  public static getRetentionCheckpoint(): AuditRetentionCheckpoint {
    return cloneCheckpoint(this.retentionCheckpoint);
  }

  public static exportTenantCheckpoint(organizationId: UUID): TenantAuditCheckpoint {
    const tenantEvents = this.inMemoryStore.filter((e) => e.organizationId === organizationId);
    const baseEntry = this.retentionCheckpoint.tenantCheckpoints[organizationId] || {
      evictedCount: 0,
      evictedTenantEventCount: 0,
      lastEvictedTenantSeq: 0,
      lastEvictedIntegrityHash: AUDIT_GENESIS_HASH,
      lastEvictedCreatedAt: null,
    };
    const newestTenantEvent = tenantEvents[0];
    return {
      organizationId,
      contractVersion: '1.3.0-p1-3',
      evictedCount: baseEntry.evictedCount,
      evictedTenantEventCount: baseEntry.evictedTenantEventCount ?? baseEntry.evictedCount,
      lastEvictedTenantSeq: baseEntry.lastEvictedTenantSeq,
      lastEvictedIntegrityHash: baseEntry.lastEvictedIntegrityHash,
      lastEvictedCreatedAt: baseEntry.lastEvictedCreatedAt,
      activeTenantEventCount: tenantEvents.length,
      latestTenantSeq:
        newestTenantEvent?.tenantSeq ?? baseEntry.lastEvictedTenantSeq + tenantEvents.length,
      latestTenantIntegrityHash:
        newestTenantEvent?.integrityHash ?? baseEntry.lastEvictedIntegrityHash,
    };
  }

  /**
   * Computes deterministic manifest claims over a set of audit events and their checkpoint.
   */
  public static computeManifestClaims(params: {
    artifactType: AuditArtifactType;
    scopeOrgId?: UUID | null;
    events?: AuditEvent[];
    checkpoint?: AuditRetentionCheckpoint;
    tenantCheckpoint?: TenantAuditCheckpoint;
  }): Omit<AuditIntegrityManifest, 'manifestVersion' | 'algorithm' | 'keyId' | 'issuedAt' | 'signature'> {
    const scopeOrgId = params.scopeOrgId ? params.scopeOrgId.trim() : null;
    const rawEvents = params.events
      ? [...params.events]
      : scopeOrgId
        ? this.inMemoryStore.filter((e) => e.organizationId === scopeOrgId)
        : [...this.inMemoryStore];

    // rawEvents is in export order (newest-first); chronological is oldest-first
    const chronological = [...rawEvents].reverse();
    let v1Count = 0;
    let v2Count = 0;
    let v3Count = 0;
    for (const ev of chronological) {
      if (ev.schemaVersion === 3) v3Count += 1;
      else if (ev.schemaVersion === 2) v2Count += 1;
      else v1Count += 1;
    }

    const oldestEvent = chronological[0] || null;
    const latestEvent = chronological[chronological.length - 1] || null;

    const eventsDigest = crypto
      .createHash('sha256')
      .update(
        canonicalSerialize(
          chronological.map((e) => ({
            id: e.id,
            organizationId: e.organizationId,
            schemaVersion: e.schemaVersion ?? 1,
            globalSeq: e.globalSeq ?? null,
            prevHash: e.prevHash ?? AUDIT_GENESIS_HASH,
            tenantSeq: e.tenantSeq ?? null,
            tenantPrevHash: e.tenantPrevHash ?? null,
            integrityHash: e.integrityHash ?? '',
            createdAt: e.createdAt,
          }))
        )
      )
      .digest('hex');

    const perTenantSummaries: Record<UUID, AuditManifestTenantSummary> = {};

    if (scopeOrgId) {
      const tCkpt = params.tenantCheckpoint || this.exportTenantCheckpoint(scopeOrgId);
      const checkpointDigest = crypto
        .createHash('sha256')
        .update(canonicalSerialize(tCkpt))
        .digest('hex');

      const oldestPrevHash = oldestEvent
        ? (oldestEvent.tenantPrevHash || oldestEvent.prevHash || AUDIT_GENESIS_HASH)
        : tCkpt.lastEvictedIntegrityHash || AUDIT_GENESIS_HASH;
      const latestIntegrityHash = latestEvent
        ? (latestEvent.integrityHash || AUDIT_GENESIS_HASH)
        : tCkpt.lastEvictedIntegrityHash || AUDIT_GENESIS_HASH;

      perTenantSummaries[scopeOrgId] = {
        organizationId: scopeOrgId,
        activeCount: chronological.length,
        evictedCount: tCkpt.evictedCount,
        latestTenantSeq:
          latestEvent?.tenantSeq ?? tCkpt.lastEvictedTenantSeq + chronological.length,
        latestTenantIntegrityHash: latestIntegrityHash,
        lastEvictedTenantSeq: tCkpt.lastEvictedTenantSeq,
        lastEvictedIntegrityHash: tCkpt.lastEvictedIntegrityHash,
      };

      return {
        artifactType: params.artifactType,
        scopeOrgId,
        eventCount: chronological.length,
        v1Count,
        v2Count,
        v3Count,
        oldestEventId: oldestEvent ? oldestEvent.id : null,
        latestEventId: latestEvent ? latestEvent.id : null,
        oldestGlobalSeq: oldestEvent && typeof oldestEvent.globalSeq === 'number' ? oldestEvent.globalSeq : null,
        latestGlobalSeq: latestEvent && typeof latestEvent.globalSeq === 'number' ? latestEvent.globalSeq : null,
        oldestPrevHash,
        latestIntegrityHash,
        eventsDigest,
        checkpointDigest,
        perTenantSummaries,
      };
    }

    const globalCkpt = params.checkpoint || this.exportCheckpoint();
    const checkpointDigest = crypto
      .createHash('sha256')
      .update(canonicalSerialize(globalCkpt))
      .digest('hex');

    const tenantIds = new Set<string>(Object.keys(globalCkpt.tenantCheckpoints || {}));
    for (const ev of chronological) {
      if (ev && typeof ev.organizationId === 'string') {
        tenantIds.add(ev.organizationId);
      }
    }

    for (const orgId of Array.from(tenantIds).sort()) {
      const orgEvents = chronological.filter((e) => e.organizationId === orgId);
      const latestOrgEvent = orgEvents[orgEvents.length - 1];
      const baseEntry = globalCkpt.tenantCheckpoints?.[orgId] || {
        evictedCount: 0,
        evictedTenantEventCount: 0,
        lastEvictedTenantSeq: 0,
        lastEvictedIntegrityHash: AUDIT_GENESIS_HASH,
        lastEvictedCreatedAt: null,
      };
      perTenantSummaries[orgId] = {
        organizationId: orgId,
        activeCount: orgEvents.length,
        evictedCount: baseEntry.evictedCount,
        latestTenantSeq:
          latestOrgEvent?.tenantSeq ?? baseEntry.lastEvictedTenantSeq + orgEvents.length,
        latestTenantIntegrityHash:
          latestOrgEvent?.integrityHash ?? baseEntry.lastEvictedIntegrityHash,
        lastEvictedTenantSeq: baseEntry.lastEvictedTenantSeq,
        lastEvictedIntegrityHash: baseEntry.lastEvictedIntegrityHash,
      };
    }

    const oldestPrevHash = oldestEvent
      ? (oldestEvent.prevHash || AUDIT_GENESIS_HASH)
      : globalCkpt.totalEvictedCount > 0
        ? globalCkpt.lastEvictedIntegrityHash
        : AUDIT_GENESIS_HASH;
    const latestIntegrityHash = latestEvent
      ? (latestEvent.integrityHash || AUDIT_GENESIS_HASH)
      : globalCkpt.totalEvictedCount > 0
        ? globalCkpt.lastEvictedIntegrityHash
        : AUDIT_GENESIS_HASH;

    return {
      artifactType: params.artifactType,
      scopeOrgId: null,
      eventCount: chronological.length,
      v1Count,
      v2Count,
      v3Count,
      oldestEventId: oldestEvent ? oldestEvent.id : null,
      latestEventId: latestEvent ? latestEvent.id : null,
      oldestGlobalSeq: oldestEvent && typeof oldestEvent.globalSeq === 'number' ? oldestEvent.globalSeq : null,
      latestGlobalSeq: latestEvent && typeof latestEvent.globalSeq === 'number' ? latestEvent.globalSeq : null,
      oldestPrevHash,
      latestIntegrityHash,
      eventsDigest,
      checkpointDigest,
      perTenantSummaries,
    };
  }

  /**
   * Signs and exports an `AuditIntegrityManifest` using `HMAC-SHA256` with `AUDIT_CHECKPOINT_HMAC_KEY`.
   * Fails closed (`503 AUDIT_KEY_UNAVAILABLE` / `AUDIT_KEY_INVALID` / `AUDIT_KEY_REUSE_FORBIDDEN`)
   * if the HMAC key is missing, malformed, or reuses `CHANNEL_SECRET_ENCRYPTION_KEY`.
   */
  public static exportIntegrityManifest(options: {
    artifactType: AuditArtifactType;
    scopeOrgId?: UUID | null;
    events?: AuditEvent[];
    checkpoint?: AuditRetentionCheckpoint;
    tenantCheckpoint?: TenantAuditCheckpoint;
    issuedAt?: string;
  }): AuditIntegrityManifest {
    const keyCheck = validateAuditHmacKey();
    if (!keyCheck.valid || !keyCheck.keyBuffer || !keyCheck.keyId) {
      throw Object.assign(
        new Error(keyCheck.reason || 'Audit checkpoint HMAC key validation failed.'),
        {
          status: keyCheck.status,
          code: keyCheck.code,
        }
      );
    }

    const claims = this.computeManifestClaims(options);
    const issuedAt = options.issuedAt || new Date().toISOString();

    const unsignedManifest = {
      manifestVersion: AUDIT_MANIFEST_CONTRACT_VERSION,
      algorithm: 'HMAC-SHA256' as const,
      keyId: keyCheck.keyId,
      ...claims,
      issuedAt,
    };

    const signature = crypto
      .createHmac('sha256', keyCheck.keyBuffer)
      .update(canonicalSerialize(unsignedManifest))
      .digest('hex');

    return deepFreezeAuditValue({
      ...unsignedManifest,
      signature,
    });
  }

  /**
   * Verifies an `AuditIntegrityManifest` against candidate events, checkpoint, scope, and HMAC-SHA-256 key.
   * Uses constant-time `crypto.timingSafeEqual` over 32-byte digest buffers.
   */
  public static verifyIntegrityManifest(
    manifest: unknown,
    expectedContext: {
      allowedArtifactTypes?: AuditArtifactType[];
      scopeOrgId?: UUID | null;
      events: AuditEvent[];
      checkpoint?: AuditRetentionCheckpoint;
      tenantCheckpoint?: Partial<TenantAuditCheckpoint>;
    }
  ): ManifestVerificationResult {
    if (manifest === undefined || manifest === null) {
      return {
        valid: false,
        status: 400,
        code: 'AUDIT_MANIFEST_MISSING',
        failureReason:
          'Backup or persistence payload is missing required auditIntegrityManifest. Unsigned audit artifacts are rejected.',
      };
    }

    if (typeof manifest !== 'object' || Array.isArray(manifest)) {
      return {
        valid: false,
        status: 400,
        code: 'AUDIT_MANIFEST_INVALID',
        failureReason: 'auditIntegrityManifest must be a valid JSON object.',
      };
    }

    const m = manifest as Record<string, unknown>;
    const expectedScopeOrgId = expectedContext.scopeOrgId ? expectedContext.scopeOrgId.trim() : null;

    if (expectedScopeOrgId) {
      if (typeof m.scopeOrgId === 'string' && m.scopeOrgId.trim().length > 0 && m.scopeOrgId.trim() !== expectedScopeOrgId) {
        return {
          valid: false,
          status: 403,
          code: 'CROSS_TENANT_RESTORE_FORBIDDEN',
          failureReason: `Cross-tenant auditIntegrityManifest forbidden: manifest belongs to [${m.scopeOrgId}], expected [${expectedScopeOrgId}].`,
        };
      }
      if (m.scopeOrgId !== expectedScopeOrgId || m.artifactType !== 'TENANT_BACKUP') {
        return {
          valid: false,
          status: 400,
          code: 'AUDIT_MANIFEST_INVALID',
          failureReason: `Tenant restore requires a TENANT_BACKUP auditIntegrityManifest scoped to [${expectedScopeOrgId}].`,
        };
      }
    } else {
      if (m.scopeOrgId !== null) {
        return {
          valid: false,
          status: 400,
          code: 'AUDIT_MANIFEST_INVALID',
          failureReason: 'Full backup or disk snapshot auditIntegrityManifest must have scopeOrgId: null.',
        };
      }
      if (
        expectedContext.allowedArtifactTypes &&
        !expectedContext.allowedArtifactTypes.includes(m.artifactType as AuditArtifactType)
      ) {
        return {
          valid: false,
          status: 400,
          code: 'AUDIT_MANIFEST_INVALID',
          failureReason: `Unexpected manifest artifactType [${String(m.artifactType)}].`,
        };
      }
    }

    if (
      m.manifestVersion !== AUDIT_MANIFEST_CONTRACT_VERSION ||
      m.algorithm !== 'HMAC-SHA256' ||
      typeof m.issuedAt !== 'string' ||
      !m.issuedAt.trim() ||
      typeof m.signature !== 'string' ||
      !HEX_64_REGEX.test(m.signature) ||
      typeof m.eventsDigest !== 'string' ||
      !HEX_64_REGEX.test(m.eventsDigest) ||
      typeof m.checkpointDigest !== 'string' ||
      !HEX_64_REGEX.test(m.checkpointDigest) ||
      typeof m.oldestPrevHash !== 'string' ||
      !HEX_64_REGEX.test(m.oldestPrevHash) ||
      typeof m.latestIntegrityHash !== 'string' ||
      !HEX_64_REGEX.test(m.latestIntegrityHash) ||
      !isNonNegativeInteger(m.eventCount) ||
      !isNonNegativeInteger(m.v1Count) ||
      !isNonNegativeInteger(m.v2Count) ||
      !isNonNegativeInteger(m.v3Count) ||
      !m.perTenantSummaries ||
      typeof m.perTenantSummaries !== 'object' ||
      Array.isArray(m.perTenantSummaries)
    ) {
      return {
        valid: false,
        status: 400,
        code: 'AUDIT_MANIFEST_INVALID',
        failureReason:
          'Malformed auditIntegrityManifest structure, version, algorithm, counters, or digest format.',
      };
    }

    const keyResolution = resolveAuditHmacVerificationKey(m.keyId);
    if (!keyResolution.valid || !keyResolution.keyBuffer || !keyResolution.keyId) {
      return {
        valid: false,
        status: keyResolution.status,
        code: keyResolution.code,
        failureReason: keyResolution.reason || 'Audit manifest HMAC key resolution failed.',
      };
    }

    const unsignedCandidate = {
      manifestVersion: m.manifestVersion,
      algorithm: m.algorithm,
      keyId: m.keyId,
      artifactType: m.artifactType,
      scopeOrgId: m.scopeOrgId,
      eventCount: m.eventCount,
      v1Count: m.v1Count,
      v2Count: m.v2Count,
      v3Count: m.v3Count,
      oldestEventId: m.oldestEventId,
      latestEventId: m.latestEventId,
      oldestGlobalSeq: m.oldestGlobalSeq,
      latestGlobalSeq: m.latestGlobalSeq,
      oldestPrevHash: m.oldestPrevHash,
      latestIntegrityHash: m.latestIntegrityHash,
      eventsDigest: m.eventsDigest,
      checkpointDigest: m.checkpointDigest,
      perTenantSummaries: m.perTenantSummaries,
      issuedAt: m.issuedAt,
    };

    const expectedSigHex = crypto
      .createHmac('sha256', keyResolution.keyBuffer)
      .update(canonicalSerialize(unsignedCandidate))
      .digest('hex');

    const actualSigBuf = Buffer.from(m.signature, 'hex');
    const expectedSigBuf = Buffer.from(expectedSigHex, 'hex');
    if (
      actualSigBuf.length !== 32 ||
      expectedSigBuf.length !== 32 ||
      !crypto.timingSafeEqual(actualSigBuf, expectedSigBuf)
    ) {
      return {
        valid: false,
        status: 400,
        code: 'AUDIT_SIGNATURE_INVALID',
        failureReason:
          'Audit integrity manifest HMAC-SHA256 signature verification failed (forged or tampered manifest/checkpoint/chain).',
      };
    }

    // Recompute claims over the actual candidate events and checkpoint to detect any divergence
    const normalizedTenantCkpt: TenantAuditCheckpoint | undefined = expectedScopeOrgId
      ? {
          organizationId: expectedScopeOrgId,
          contractVersion: '1.3.0-p1-3',
          evictedCount: expectedContext.tenantCheckpoint?.evictedCount ?? 0,
          evictedTenantEventCount:
            expectedContext.tenantCheckpoint?.evictedTenantEventCount ??
            expectedContext.tenantCheckpoint?.evictedCount ??
            0,
          lastEvictedTenantSeq: expectedContext.tenantCheckpoint?.lastEvictedTenantSeq ?? 0,
          lastEvictedIntegrityHash:
            expectedContext.tenantCheckpoint?.lastEvictedIntegrityHash ?? AUDIT_GENESIS_HASH,
          lastEvictedCreatedAt: expectedContext.tenantCheckpoint?.lastEvictedCreatedAt ?? null,
          activeTenantEventCount:
            expectedContext.tenantCheckpoint?.activeTenantEventCount ?? expectedContext.events.length,
          latestTenantSeq:
            expectedContext.tenantCheckpoint?.latestTenantSeq ??
            (expectedContext.events[0]?.tenantSeq ??
              (expectedContext.tenantCheckpoint?.lastEvictedTenantSeq ?? 0) +
                expectedContext.events.length),
          latestTenantIntegrityHash:
            expectedContext.tenantCheckpoint?.latestTenantIntegrityHash ??
            (expectedContext.events[0]?.integrityHash ??
              expectedContext.tenantCheckpoint?.lastEvictedIntegrityHash ??
              AUDIT_GENESIS_HASH),
        }
      : undefined;

    const recomputedClaims = this.computeManifestClaims({
      artifactType: m.artifactType as AuditArtifactType,
      scopeOrgId: expectedScopeOrgId,
      events: expectedContext.events,
      checkpoint: expectedContext.checkpoint || createEmptyRetentionCheckpoint(this.maxRetentionLimit),
      tenantCheckpoint: normalizedTenantCkpt,
    });

    const manifestClaims = {
      artifactType: m.artifactType,
      scopeOrgId: m.scopeOrgId,
      eventCount: m.eventCount,
      v1Count: m.v1Count,
      v2Count: m.v2Count,
      v3Count: m.v3Count,
      oldestEventId: m.oldestEventId,
      latestEventId: m.latestEventId,
      oldestGlobalSeq: m.oldestGlobalSeq,
      latestGlobalSeq: m.latestGlobalSeq,
      oldestPrevHash: m.oldestPrevHash,
      latestIntegrityHash: m.latestIntegrityHash,
      eventsDigest: m.eventsDigest,
      checkpointDigest: m.checkpointDigest,
      perTenantSummaries: m.perTenantSummaries,
    };

    if (canonicalSerialize(recomputedClaims) !== canonicalSerialize(manifestClaims)) {
      return {
        valid: false,
        status: 400,
        code: 'AUDIT_SIGNATURE_INVALID',
        failureReason:
          'Audit integrity manifest claims do not match the candidate audit events or checkpoint.',
      };
    }

    return {
      valid: true,
      status: 200,
      code: 'VERIFIED',
    };
  }

  /**
   * Captures a complete, deep-frozen snapshot of both the in-memory audit event chain
   * and its retention checkpoint so test suites and atomic rollbacks can restore exact state.
   */
  public static captureSnapshot(): AuditSnapshotState {
    return {
      events: this.inMemoryStore.map((ev) => deepFreezeAuditValue(ev)),
      checkpoint: cloneCheckpoint(this.retentionCheckpoint),
    };
  }

  /**
   * Atomically restores a previously captured `AuditSnapshotState` ONLY AFTER verifying
   * `verifyChainIntegrity(snapshot.events, snapshot.checkpoint)` in staging first (Gate G3 & G4).
   * If verification fails, live `inMemoryStore` and `retentionCheckpoint` remain 100% untouched.
   */
  public static restoreSnapshot(snapshot: AuditSnapshotState): ChainIntegrityResult {
    if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.events)) {
      return {
        valid: false,
        checkedCount: 0,
        code: 'INVALID_SNAPSHOT',
        failureReason: 'Invalid audit snapshot provided to restoreSnapshot',
      };
    }

    const stagedCheckpoint = snapshot.checkpoint
      ? cloneCheckpoint(snapshot.checkpoint)
      : createEmptyRetentionCheckpoint(this.maxRetentionLimit);

    // Verify in staging BEFORE mutating live state!
    const stagedVerification = this.verifyChainIntegrity(snapshot.events, stagedCheckpoint);
    if (!stagedVerification.valid) {
      return stagedVerification;
    }

    this.inMemoryStore = snapshot.events.map((ev) => deepFreezeAuditValue(ev));
    this.retentionCheckpoint = stagedCheckpoint;
    return stagedVerification;
  }

  public static getEvents(organizationId: UUID, limit = 100): AuditEvent[] {
    return this.inMemoryStore
      .filter((e) => e.organizationId === organizationId)
      .slice(0, limit)
      .map((ev) => deepFreezeAuditValue(ev));
  }

  public static exportAllEvents(): AuditEvent[] {
    return this.inMemoryStore.map((ev) => deepFreezeAuditValue(ev));
  }

  /**
   * Validates candidate events and checkpoint in staging BEFORE mutating `inMemoryStore`
   * or `retentionCheckpoint` (Gate G3, G4, G5 / AC-22).
   * Throws an error with `code` and `status: 400` if candidate chain or checkpoint is invalid,
   * leaving live memory 100% unchanged.
   */
  public static importEvents(
    events: AuditEvent[],
    checkpoint?: AuditRetentionCheckpoint | null
  ): ChainIntegrityResult {
    if (!Array.isArray(events)) {
      throw Object.assign(new Error('AuditLogger.importEvents requires an array of events.'), {
        status: 400,
        code: 'CORRUPTED_BACKUP_PAYLOAD',
      });
    }

    let stagedCheckpoint: AuditRetentionCheckpoint;
    if (checkpoint) {
      stagedCheckpoint = cloneCheckpoint(checkpoint);
    } else if (checkpoint === null || events.length === 0) {
      stagedCheckpoint = createEmptyRetentionCheckpoint(this.maxRetentionLimit);
    } else {
      const oldest = events[events.length - 1];
      if (!oldest?.prevHash || oldest.prevHash === AUDIT_GENESIS_HASH) {
        stagedCheckpoint = createEmptyRetentionCheckpoint(this.maxRetentionLimit);
      } else {
        stagedCheckpoint = cloneCheckpoint(this.retentionCheckpoint);
      }
    }

    const verification = this.verifyChainIntegrity(events, stagedCheckpoint);
    if (!verification.valid) {
      throw Object.assign(
        new Error(
          `AuditLogger.importEvents rejected invalid audit chain/checkpoint (${verification.code}): ${verification.failureReason}`
        ),
        {
          status: 400,
          code: verification.code || 'TAMPERED_AUDIT_CHAIN',
        }
      );
    }

    this.inMemoryStore = events.map((ev) => deepFreezeAuditValue(ev));
    this.retentionCheckpoint = stagedCheckpoint;
    return verification;
  }

  /**
   * Computes the canonical SHA-256 `integrityHash` for an `AuditEvent`.
   * - `v1` (`schemaVersion === undefined || schemaVersion === 1`): Legacy 11-field payload (100% backward compatible).
   * - `v2` (`schemaVersion === 2`): Dual-chain 15-field payload (100% backward compatible).
   * - `v3` (`schemaVersion === 3`): Full-field 19-property forensic payload with recursive lexicographical key canonicalization.
   * - Any other `schemaVersion`: Explicitly throws `UNSUPPORTED_AUDIT_SCHEMA_VERSION`.
   */
  public static computeEventHash(ev: {
    schemaVersion?: number;
    id: string;
    organizationId: string;
    actorId?: string;
    actorType: string;
    action: string;
    entityType: string;
    entityId: string;
    beforeState?: Record<string, unknown>;
    afterState?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
    reason?: string;
    globalSeq?: number;
    prevHash?: string;
    tenantSeq?: number;
    tenantPrevHash?: string;
    createdAt: string;
  }): string {
    const ver = ev.schemaVersion;
    if (ver !== undefined && ver !== 1 && ver !== 2 && ver !== 3) {
      throw Object.assign(
        new Error(`Unsupported audit event schemaVersion: ${String(ver)}. Allowed versions: 1, 2, 3.`),
        {
          status: 400,
          code: 'UNSUPPORTED_AUDIT_SCHEMA_VERSION',
        }
      );
    }

    if (ver === 3) {
      const canonicalPayloadV3 = canonicalSerialize({
        schemaVersion: 3,
        id: ev.id,
        organizationId: ev.organizationId,
        actorId: ev.actorId || 'anonymous',
        actorType: ev.actorType,
        action: ev.action,
        entityType: ev.entityType,
        entityId: ev.entityId,
        beforeState: ev.beforeState !== undefined ? canonicalizeAuditValue(ev.beforeState) : null,
        afterState: ev.afterState !== undefined ? canonicalizeAuditValue(ev.afterState) : null,
        ipAddress: ev.ipAddress ?? null,
        userAgent: ev.userAgent ?? null,
        requestId: ev.requestId ?? null,
        reason: ev.reason ?? null,
        globalSeq: ev.globalSeq,
        prevHash: ev.prevHash || AUDIT_GENESIS_HASH,
        tenantSeq: ev.tenantSeq,
        tenantPrevHash: ev.tenantPrevHash || AUDIT_GENESIS_HASH,
        createdAt: ev.createdAt,
      });
      return crypto.createHash('sha256').update(canonicalPayloadV3).digest('hex');
    }

    if (ver === 2) {
      const canonicalPayloadV2 = JSON.stringify({
        schemaVersion: 2,
        id: ev.id,
        organizationId: ev.organizationId,
        actorId: ev.actorId || 'anonymous',
        actorType: ev.actorType,
        action: ev.action,
        entityType: ev.entityType,
        entityId: ev.entityId,
        beforeState: ev.beforeState,
        afterState: ev.afterState,
        globalSeq: ev.globalSeq,
        prevHash: ev.prevHash || AUDIT_GENESIS_HASH,
        tenantSeq: ev.tenantSeq,
        tenantPrevHash: ev.tenantPrevHash || AUDIT_GENESIS_HASH,
        createdAt: ev.createdAt,
      });
      return crypto.createHash('sha256').update(canonicalPayloadV2).digest('hex');
    }

    // Legacy v1 canonical payload (historical compatibility — zero silent rewrite)
    const canonicalPayloadV1 = JSON.stringify({
      id: ev.id,
      organizationId: ev.organizationId,
      actorId: ev.actorId || 'anonymous',
      actorType: ev.actorType,
      action: ev.action,
      entityType: ev.entityType,
      entityId: ev.entityId,
      beforeState: ev.beforeState,
      afterState: ev.afterState,
      prevHash: ev.prevHash || AUDIT_GENESIS_HASH,
      createdAt: ev.createdAt,
    });
    return crypto.createHash('sha256').update(canonicalPayloadV1).digest('hex');
  }

  /**
   * Verifies the complete global audit chain (`v1`, `v2`, and `v3` events),
   * strict checkpoint structure/counter/hash validity (even when `events.length === 0`),
   * per-tenant `(tenantPrevHash, tenantSeq)` continuity, and optional `AuditIntegrityManifest`.
   */
  public static verifyChainIntegrity(
    candidateEvents?: AuditEvent[],
    candidateCheckpoint?: AuditRetentionCheckpoint,
    candidateManifest?: AuditIntegrityManifest
  ): ChainIntegrityResult {
    if (candidateEvents !== undefined && !Array.isArray(candidateEvents)) {
      return {
        valid: false,
        checkedCount: 0,
        code: 'MALFORMED_AUDIT_EVENT',
        failureReason: 'candidateEvents must be an array.',
      };
    }

    const source = candidateEvents ? [...candidateEvents] : [...this.inMemoryStore];
    const ckpt =
      candidateCheckpoint !== undefined
        ? candidateCheckpoint
        : candidateEvents
          ? undefined
          : this.retentionCheckpoint;
    const events = [...source].reverse();

    if (ckpt !== undefined) {
      const ckptValidation = validateGlobalRetentionCheckpoint(ckpt, events);
      if (!ckptValidation.valid) {
        return {
          valid: false,
          checkedCount: 0,
          v1Count: 0,
          v2Count: 0,
          v3Count: 0,
          code: ckptValidation.code || 'INVALID_RETENTION_CHECKPOINT',
          failureReason: ckptValidation.failureReason,
        };
      }
    }

    const hasEvictions = Boolean(ckpt && ckpt.totalEvictedCount > 0);
    const anchorType: 'GENESIS' | 'RETENTION_CHECKPOINT' = hasEvictions
      ? 'RETENTION_CHECKPOINT'
      : 'GENESIS';

    if (events.length === 0) {
      if (candidateManifest !== undefined) {
        const manifestCheck = this.verifyIntegrityManifest(candidateManifest, {
          allowedArtifactTypes: ['FULL_BACKUP', 'DISK_SNAPSHOT'],
          scopeOrgId: null,
          events: source,
          checkpoint: ckpt || createEmptyRetentionCheckpoint(this.maxRetentionLimit),
        });
        if (!manifestCheck.valid) {
          return {
            valid: false,
            checkedCount: 0,
            v1Count: 0,
            v2Count: 0,
            v3Count: 0,
            code: manifestCheck.code,
            failureReason: manifestCheck.failureReason,
          };
        }
      }
      return {
        valid: true,
        checkedCount: 0,
        v1Count: 0,
        v2Count: 0,
        v3Count: 0,
        code: 'CHAIN_VALID_EMPTY',
        anchorType,
        latestIntegrityHash: hasEvictions ? ckpt!.lastEvictedIntegrityHash : AUDIT_GENESIS_HASH,
      };
    }

    let expectedPrev = hasEvictions ? ckpt!.lastEvictedIntegrityHash : AUDIT_GENESIS_HASH;
    let expectedGlobalSeq = hasEvictions ? ckpt!.lastEvictedGlobalSeq + 1 : 1;

    const tenantTracker = new Map<UUID, { lastHash: string; lastSeq: number }>();
    if (ckpt?.tenantCheckpoints) {
      for (const [orgId, tCkpt] of Object.entries(ckpt.tenantCheckpoints)) {
        if (tCkpt && tCkpt.evictedCount > 0) {
          tenantTracker.set(orgId, {
            lastHash: tCkpt.lastEvictedIntegrityHash,
            lastSeq: tCkpt.lastEvictedTenantSeq,
          });
        }
      }
    }

    const seenIds = new Set<string>();
    let v1Count = 0;
    let v2Count = 0;
    let v3Count = 0;

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (!ev || typeof ev !== 'object') {
        return {
          valid: false,
          checkedCount: i,
          v1Count,
          v2Count,
          v3Count,
          code: 'MALFORMED_AUDIT_EVENT',
          failureReason: `Audit event at index ${i} is not an object`,
        };
      }

      const ver = ev.schemaVersion;
      if (ver !== undefined && ver !== 1 && ver !== 2 && ver !== 3) {
        return {
          valid: false,
          checkedCount: i,
          v1Count,
          v2Count,
          v3Count,
          code: 'UNSUPPORTED_AUDIT_SCHEMA_VERSION',
          failureReason: `Unsupported audit event schemaVersion [${String(ver)}] at index ${i}. Allowed versions: 1, 2, 3.`,
        };
      }

      if (
        typeof ev.id !== 'string' ||
        !ev.id.trim() ||
        typeof ev.organizationId !== 'string' ||
        !ev.organizationId.trim() ||
        typeof ev.actorType !== 'string' ||
        !ev.actorType.trim() ||
        typeof ev.action !== 'string' ||
        !ev.action.trim() ||
        typeof ev.entityType !== 'string' ||
        !ev.entityType.trim() ||
        typeof ev.entityId !== 'string' ||
        !ev.entityId.trim() ||
        typeof ev.integrityHash !== 'string' ||
        !HEX_64_REGEX.test(ev.integrityHash) ||
        typeof ev.prevHash !== 'string' ||
        !HEX_64_REGEX.test(ev.prevHash) ||
        typeof ev.createdAt !== 'string' ||
        !ev.createdAt.trim() ||
        ((ev as any).timestamp !== undefined && (ev as any).timestamp !== ev.createdAt)
      ) {
        return {
          valid: false,
          checkedCount: i,
          v1Count,
          v2Count,
          v3Count,
          code: 'MALFORMED_AUDIT_EVENT',
          failureReason: `Missing or malformed required fields (id, organizationId, actorType, action, entityType, entityId, prevHash, integrityHash, or createdAt) at index ${i}`,
        };
      }

      if (seenIds.has(ev.id)) {
        return {
          valid: false,
          checkedCount: i,
          v1Count,
          v2Count,
          v3Count,
          code: 'DUPLICATE_AUDIT_EVENT_ID',
          failureReason: `Duplicate audit event id [${ev.id}] at index ${i}`,
        };
      }
      seenIds.add(ev.id);

      const isModernVersion = ver === 2 || ver === 3;

      if (i === 0) {
        if (ckpt !== undefined && ev.prevHash !== expectedPrev) {
          return {
            valid: false,
            checkedCount: 0,
            v1Count,
            v2Count,
            v3Count,
            code: 'BROKEN_ANCHOR_LINK',
            failureReason: `Broken anchor prevHash at index 0: expected ${expectedPrev} (${anchorType}), got ${ev.prevHash}`,
          };
        }
        if (ckpt === undefined && isModernVersion && ev.globalSeq === 1 && ev.prevHash !== AUDIT_GENESIS_HASH) {
          return {
            valid: false,
            checkedCount: 0,
            v1Count,
            v2Count,
            v3Count,
            code: 'BROKEN_GENESIS_LINK',
            failureReason: `Broken genesis prevHash at index 0: expected ${AUDIT_GENESIS_HASH}, got ${ev.prevHash}`,
          };
        }
        if (ckpt === undefined && isModernVersion && typeof ev.globalSeq === 'number' && ev.globalSeq > 1) {
          return {
            valid: false,
            checkedCount: 0,
            v1Count,
            v2Count,
            v3Count,
            code: 'MISSING_RETENTION_CHECKPOINT',
            failureReason: `Chain starts at globalSeq=${ev.globalSeq} (>1) without a retention checkpoint anchor at index 0`,
          };
        }
      } else if (ev.prevHash !== expectedPrev) {
        return {
          valid: false,
          checkedCount: i,
          v1Count,
          v2Count,
          v3Count,
          code: 'BROKEN_PREV_HASH_LINK',
          failureReason: `Broken prevHash chain link at index ${i}: expected ${expectedPrev}, got ${ev.prevHash}`,
        };
      }

      const recomputed = this.computeEventHash(ev);
      if (recomputed !== ev.integrityHash) {
        return {
          valid: false,
          checkedCount: i,
          v1Count,
          v2Count,
          v3Count,
          code: 'PAYLOAD_HASH_MISMATCH',
          failureReason: `Payload integrityHash mismatch at index ${i}`,
        };
      }

      const prevTenantState = tenantTracker.get(ev.organizationId) || {
        lastHash: AUDIT_GENESIS_HASH,
        lastSeq: 0,
      };

      if (isModernVersion) {
        if (
          typeof ev.globalSeq !== 'number' ||
          !Number.isInteger(ev.globalSeq) ||
          ev.globalSeq < 1 ||
          (i > 0 && ev.globalSeq !== expectedGlobalSeq) ||
          (i === 0 && ckpt !== undefined && ev.globalSeq !== expectedGlobalSeq)
        ) {
          return {
            valid: false,
            checkedCount: i,
            v1Count,
            v2Count,
            v3Count,
            code: 'BROKEN_GLOBAL_SEQUENCE',
            failureReason: `Broken globalSeq at index ${i}: expected ${expectedGlobalSeq}, got ${ev.globalSeq}`,
          };
        }

        if (
          typeof ev.tenantPrevHash !== 'string' ||
          !HEX_64_REGEX.test(ev.tenantPrevHash) ||
          typeof ev.tenantSeq !== 'number' ||
          !Number.isInteger(ev.tenantSeq) ||
          ev.tenantSeq < 1
        ) {
          return {
            valid: false,
            checkedCount: i,
            v1Count,
            v2Count,
            v3Count,
            code: 'MALFORMED_TENANT_CHAIN_FIELDS',
            failureReason: `Malformed tenantPrevHash or tenantSeq on v${ver} event at index ${i}`,
          };
        }

        if (ev.tenantPrevHash !== prevTenantState.lastHash) {
          return {
            valid: false,
            checkedCount: i,
            v1Count,
            v2Count,
            v3Count,
            code: 'BROKEN_TENANT_PREV_HASH_LINK',
            failureReason: `Broken tenantPrevHash link for organization [${ev.organizationId}] at index ${i}: expected ${prevTenantState.lastHash}, got ${ev.tenantPrevHash}`,
          };
        }

        if (ev.tenantSeq !== prevTenantState.lastSeq + 1) {
          return {
            valid: false,
            checkedCount: i,
            v1Count,
            v2Count,
            v3Count,
            code: 'BROKEN_TENANT_SEQUENCE',
            failureReason: `Broken tenantSeq for organization [${ev.organizationId}] at index ${i}: expected ${prevTenantState.lastSeq + 1}, got ${ev.tenantSeq}`,
          };
        }

        tenantTracker.set(ev.organizationId, {
          lastHash: ev.integrityHash,
          lastSeq: ev.tenantSeq,
        });
        expectedGlobalSeq = ev.globalSeq + 1;
        if (ver === 3) v3Count += 1;
        else v2Count += 1;
      } else {
        // Legacy v1 event: advance tenant tracker so subsequent v2/v3 events for this tenant chain cleanly
        tenantTracker.set(ev.organizationId, {
          lastHash: ev.integrityHash,
          lastSeq: prevTenantState.lastSeq + 1,
        });
        expectedGlobalSeq += 1;
        v1Count += 1;
      }

      expectedPrev = ev.integrityHash;
    }

    if (candidateManifest !== undefined) {
      const manifestCheck = this.verifyIntegrityManifest(candidateManifest, {
        allowedArtifactTypes: ['FULL_BACKUP', 'DISK_SNAPSHOT'],
        scopeOrgId: null,
        events: source,
        checkpoint: ckpt || createEmptyRetentionCheckpoint(this.maxRetentionLimit),
      });
      if (!manifestCheck.valid) {
        return {
          valid: false,
          checkedCount: events.length,
          v1Count,
          v2Count,
          v3Count,
          code: manifestCheck.code,
          failureReason: manifestCheck.failureReason,
        };
      }
    }

    return {
      valid: true,
      checkedCount: events.length,
      v1Count,
      v2Count,
      v3Count,
      code: 'CHAIN_VALID',
      anchorType,
      latestIntegrityHash: expectedPrev,
    };
  }

  /**
   * Verifies the cryptographic integrity, completeness, and optional HMAC-SHA-256 `AuditIntegrityManifest`
   * of a tenant-scoped backup's `auditEvents` (`exportTenantBackup(scopeOrgId)`).
   */
  public static verifyTenantBackupIntegrity(
    scopeOrgId: UUID,
    candidateEvents: unknown,
    tenantCheckpoint?: Partial<TenantAuditCheckpoint>,
    candidateManifest?: unknown,
    options?: { requireManifest?: boolean }
  ): TenantBackupAuditVerificationResult {
    if (!scopeOrgId || typeof scopeOrgId !== 'string' || !scopeOrgId.trim()) {
      return {
        valid: false,
        status: 400,
        code: 'CORRUPTED_BACKUP_PAYLOAD',
        checkedCount: 0,
        failureReason: 'Missing valid scopeOrgId for tenant backup audit verification',
      };
    }
    if (!Array.isArray(candidateEvents)) {
      return {
        valid: false,
        status: 400,
        code: 'CORRUPTED_BACKUP_PAYLOAD',
        checkedCount: 0,
        failureReason: 'Backup validation failed: auditEvents must be an array.',
      };
    }

    const cleanOrgId = scopeOrgId.trim();

    if (
      tenantCheckpoint !== undefined &&
      tenantCheckpoint !== null &&
      (typeof tenantCheckpoint !== 'object' || Array.isArray(tenantCheckpoint))
    ) {
      return {
        valid: false,
        status: 400,
        code: 'TAMPERED_AUDIT_CHAIN',
        checkedCount: 0,
        failureReason: 'auditTenantCheckpoint must be a valid object.',
      };
    }

    if (
      tenantCheckpoint &&
      typeof tenantCheckpoint === 'object' &&
      tenantCheckpoint.organizationId !== undefined &&
      tenantCheckpoint.organizationId !== cleanOrgId
    ) {
      return {
        valid: false,
        status: 403,
        code: 'CROSS_TENANT_RESTORE_FORBIDDEN',
        checkedCount: 0,
        failureReason: `Cross-tenant audit checkpoint forbidden: checkpoint belongs to [${tenantCheckpoint.organizationId}], expected [${cleanOrgId}]`,
      };
    }

    // 1. Strict Tenant Ownership & Schema Version Check across all events before reversing
    for (let idx = 0; idx < candidateEvents.length; idx++) {
      const rawEvt = candidateEvents[idx] as AuditEvent;
      if (!rawEvt || typeof rawEvt !== 'object' || Array.isArray(rawEvt)) {
        return {
          valid: false,
          status: 400,
          code: 'CORRUPTED_BACKUP_PAYLOAD',
          checkedCount: idx,
          failureReason: `Malformed audit event object at index ${idx}`,
        };
      }
      if (typeof rawEvt.organizationId !== 'string' || rawEvt.organizationId.trim() !== cleanOrgId) {
        return {
          valid: false,
          status: 403,
          code: 'CROSS_TENANT_RESTORE_FORBIDDEN',
          checkedCount: idx,
          failureReason: `Cross-tenant restore forbidden in auditEvents: event [${rawEvt.id || idx}] belongs to [${rawEvt.organizationId}], expected [${cleanOrgId}]`,
        };
      }
      const ver = rawEvt.schemaVersion;
      if (ver !== undefined && ver !== 1 && ver !== 2 && ver !== 3) {
        return {
          valid: false,
          status: 400,
          code: 'UNSUPPORTED_AUDIT_SCHEMA_VERSION',
          checkedCount: idx,
          failureReason: `Unsupported audit event schemaVersion [${String(ver)}] at index ${idx}. Allowed versions: 1, 2, 3.`,
        };
      }
    }

    // Reverse from export order (newest-first) to chronological order (oldest-first)
    const events = [...(candidateEvents as AuditEvent[])].reverse();

    // 2. Validate checkpoint structure and counters even when events is empty (Gate G9 / AC-28)
    if (tenantCheckpoint) {
      const ckptPreCheck = validateTenantCheckpointConsistency(cleanOrgId, tenantCheckpoint, events);
      if (!ckptPreCheck.valid && events.length === 0) {
        return {
          valid: false,
          status: ckptPreCheck.status,
          code: ckptPreCheck.code,
          checkedCount: 0,
          failureReason: ckptPreCheck.failureReason,
        };
      }
      if (
        !isNonNegativeInteger(tenantCheckpoint.evictedCount ?? 0) ||
        !isNonNegativeInteger(tenantCheckpoint.lastEvictedTenantSeq ?? 0) ||
        (tenantCheckpoint.lastEvictedIntegrityHash !== undefined &&
          (typeof tenantCheckpoint.lastEvictedIntegrityHash !== 'string' ||
            !HEX_64_REGEX.test(tenantCheckpoint.lastEvictedIntegrityHash)))
      ) {
        return {
          valid: false,
          status: 400,
          code: 'TAMPERED_AUDIT_CHAIN',
          checkedCount: 0,
          failureReason: 'Malformed auditTenantCheckpoint counters or hash.',
        };
      }
    }

    const hasEvictions = Boolean(
      tenantCheckpoint &&
        typeof tenantCheckpoint.evictedCount === 'number' &&
        tenantCheckpoint.evictedCount > 0
    );

    let expectedTenantPrev = hasEvictions
      ? tenantCheckpoint!.lastEvictedIntegrityHash || AUDIT_GENESIS_HASH
      : AUDIT_GENESIS_HASH;
    let expectedTenantSeq = hasEvictions
      ? (tenantCheckpoint!.lastEvictedTenantSeq ?? 0) + 1
      : 1;
    let prevGlobalSeq = 0;

    const seenIds = new Set<string>();

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (
        typeof ev.id !== 'string' ||
        !ev.id.trim() ||
        typeof ev.actorType !== 'string' ||
        !ev.actorType.trim() ||
        typeof ev.action !== 'string' ||
        !ev.action.trim() ||
        typeof ev.entityType !== 'string' ||
        !ev.entityType.trim() ||
        typeof ev.entityId !== 'string' ||
        !ev.entityId.trim() ||
        typeof ev.integrityHash !== 'string' ||
        !HEX_64_REGEX.test(ev.integrityHash) ||
        typeof ev.prevHash !== 'string' ||
        !HEX_64_REGEX.test(ev.prevHash) ||
        typeof ev.createdAt !== 'string' ||
        !ev.createdAt.trim() ||
        ((ev as any).timestamp !== undefined && (ev as any).timestamp !== ev.createdAt)
      ) {
        return {
          valid: false,
          status: 400,
          code: 'TAMPERED_AUDIT_CHAIN',
          checkedCount: i,
          failureReason: `Missing or malformed id, actorType, action, entityType, entityId, prevHash, integrityHash, or timestamp/createdAt in tenant auditEvents at index ${i}`,
        };
      }

      if (seenIds.has(ev.id)) {
        return {
          valid: false,
          status: 400,
          code: 'TAMPERED_AUDIT_CHAIN',
          checkedCount: i,
          failureReason: `Duplicate audit event id [${ev.id}] in tenant auditEvents at index ${i}`,
        };
      }
      seenIds.add(ev.id);

      const recomputed = this.computeEventHash(ev);
      if (recomputed !== ev.integrityHash) {
        return {
          valid: false,
          status: 400,
          code: 'TAMPERED_AUDIT_CHAIN',
          checkedCount: i,
          failureReason: `Payload or link integrityHash mismatch in tenant auditEvents at index ${i}`,
        };
      }

      if (ev.schemaVersion === 2 || ev.schemaVersion === 3) {
        if (
          typeof ev.tenantPrevHash !== 'string' ||
          !HEX_64_REGEX.test(ev.tenantPrevHash) ||
          typeof ev.tenantSeq !== 'number' ||
          !Number.isInteger(ev.tenantSeq) ||
          ev.tenantSeq < 1
        ) {
          return {
            valid: false,
            status: 400,
            code: 'TAMPERED_AUDIT_CHAIN',
            checkedCount: i,
            failureReason: `Missing or malformed tenantPrevHash/tenantSeq in v${ev.schemaVersion} tenant audit event at index ${i}`,
          };
        }

        if (ev.tenantPrevHash !== expectedTenantPrev) {
          return {
            valid: false,
            status: 400,
            code: 'TAMPERED_AUDIT_CHAIN',
            checkedCount: i,
            failureReason: `Broken tenantPrevHash chain link at tenant index ${i}: expected ${expectedTenantPrev}, got ${ev.tenantPrevHash}`,
          };
        }

        if (ev.tenantSeq !== expectedTenantSeq) {
          return {
            valid: false,
            status: 400,
            code: 'TAMPERED_AUDIT_CHAIN',
            checkedCount: i,
            failureReason: `Broken or out-of-order tenantSeq at tenant index ${i}: expected ${expectedTenantSeq}, got ${ev.tenantSeq}`,
          };
        }

        // Mandatory positive integer monotonic globalSeq on all v2/v3 events (F-08 remediation)
        if (
          typeof ev.globalSeq !== 'number' ||
          !Number.isInteger(ev.globalSeq) ||
          ev.globalSeq < 1 ||
          ev.globalSeq <= prevGlobalSeq
        ) {
          return {
            valid: false,
            status: 400,
            code: 'TAMPERED_AUDIT_CHAIN',
            checkedCount: i,
            failureReason: `Missing, non-integer, or non-monotonic globalSeq in tenant auditEvents at index ${i}: ${String(ev.globalSeq)} <= ${prevGlobalSeq}`,
          };
        }
        prevGlobalSeq = ev.globalSeq;

        expectedTenantPrev = ev.integrityHash;
        expectedTenantSeq = ev.tenantSeq + 1;
      } else {
        // Legacy v1 event verification within a tenant backup
        expectedTenantPrev = ev.integrityHash;
        expectedTenantSeq += 1;
      }
    }

    if (tenantCheckpoint) {
      const ckptPostCheck = validateTenantCheckpointConsistency(cleanOrgId, tenantCheckpoint, events);
      if (!ckptPostCheck.valid) {
        return {
          valid: false,
          status: ckptPostCheck.status,
          code: ckptPostCheck.code,
          checkedCount: events.length,
          failureReason: ckptPostCheck.failureReason,
        };
      }
    }

    if (options?.requireManifest || candidateManifest !== undefined) {
      const manifestCheck = this.verifyIntegrityManifest(candidateManifest, {
        allowedArtifactTypes: ['TENANT_BACKUP'],
        scopeOrgId: cleanOrgId,
        events: candidateEvents as AuditEvent[],
        tenantCheckpoint,
      });
      if (!manifestCheck.valid) {
        return {
          valid: false,
          status: manifestCheck.status,
          code: manifestCheck.code,
          checkedCount: events.length,
          failureReason: manifestCheck.failureReason,
        };
      }
    }

    return {
      valid: true,
      status: 200,
      code: 'VERIFIED',
      checkedCount: events.length,
    };
  }
}
