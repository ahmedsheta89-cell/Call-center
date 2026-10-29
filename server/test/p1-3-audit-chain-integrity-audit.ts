/**
 * @file server/test/p1-3-audit-chain-integrity-audit.ts
 * PHASE P.1.3.2 — Audit Integrity Hardening, Checkpoint Authentication & Atomic Restore Suite (AC-01 .. AC-32)
 *
 * Isolation Rules:
 * - Uses strictly isolated synthetic organization IDs:
 *   - `org-p1-3-audit-chain-temp`
 *   - `org-p1-3-2-audit-hardening-temp`
 *   - `org-p1-3-2-audit-hardening-peer-temp`
 * - Never touches `org-madar-001`, `org-madar-enterprise-001`, or `org-p1-1-forensic-audit-temp`.
 * - Every test (AC-01..AC-32) cleans up its synthetic data and verifies deletion via Read-After-Delete proof.
 */

import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import express from 'express';
import { apiRouter } from '../api/router.ts';
import { db } from '../db/store.ts';
import {
  AUDIT_GENESIS_HASH,
  AUDIT_MANIFEST_CONTRACT_VERSION,
  AuditLogger,
  canonicalSerialize,
  deepFreezeAuditValue,
  resolveAuditHmacVerificationKey,
  validateAuditHmacKey,
  type AuditIntegrityManifest,
  type AuditRetentionCheckpoint,
  type TenantAuditCheckpoint,
} from '../core/audit.ts';
import { issueSessionToken } from '../core/identity.ts';
import type { AuditEvent, Organization, User } from '../core/types.ts';

export const P1_3_TEMP_ORG_ID = 'org-p1-3-audit-chain-temp';
export const P1_3_2_TEMP_ORG_ID = 'org-p1-3-2-audit-hardening-temp';
export const P1_3_2_PEER_ORG_ID = 'org-p1-3-2-audit-hardening-peer-temp';

const P1_3_ADMIN_USER_ID = 'usr-p1-3-audit-admin';
const P1_3_AGENT_USER_ID = 'usr-p1-3-audit-agent';
const P1_3_2_ADMIN_USER_ID = 'usr-p1-3-2-hardening-admin';
const P1_3_2_PEER_ADMIN_USER_ID = 'usr-p1-3-2-peer-admin';

const TEST_CHANNEL_KEY_64 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TEST_HMAC_KEY_64 = 'a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff00';
const TEST_HMAC_KEY_ID = 'audit-hmac-p1-3-2-test-v1';
const ROTATED_HMAC_KEY_64 = 'f0e1d2c3b4a5968778695a4b3c2d1e0f00112233445566778899aabbccddeeff';
const ROTATED_HMAC_KEY_ID = 'audit-hmac-p1-3-2-rotated-v2';
const WRONG_HMAC_KEY_64 = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

export interface P13AcceptanceTestResult {
  id: string;
  title: string;
  passed: boolean;
  evidenceSummary: string;
  readAfterDeleteVerified: boolean;
  evidence?: Record<string, any>;
}

function assertCondition(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function httpJson(
  baseUrl: string,
  method: string,
  pathUrl: string,
  headers: Record<string, string>,
  body?: unknown
): Promise<{ status: number; body: any; rawText: string }> {
  const res = await fetch(`${baseUrl}${pathUrl}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Connection: 'close',
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const rawText = await res.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = rawText;
  }
  return { status: res.status, body: parsed, rawText };
}

function createSyntheticOrg(id: string, name: string, slug: string): Organization {
  const now = new Date().toISOString();
  return {
    id,
    name,
    slug,
    plan: 'enterprise',
    settings: {
      timezone: 'UTC',
      defaultLanguage: 'en',
      workingHours: { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] },
      zeroCostMode: false,
      aiMonthlyBudgetUsd: 100,
      aiCurrentMonthSpendUsd: 0,
    },
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

function createSyntheticUser(id: string, organizationId: string, role: User['role'], email: string): User {
  const now = new Date().toISOString();
  return {
    id,
    organizationId,
    email,
    fullName: `${role} (${id})`,
    role,
    isActive: true,
    mfaEnabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

function cleanupSyntheticOrgs(): boolean {
  const syntheticOrgs = [P1_3_TEMP_ORG_ID, P1_3_2_TEMP_ORG_ID, P1_3_2_PEER_ORG_ID];
  for (const orgId of syntheticOrgs) {
    db.purgeOrganizationData(orgId);
    db.organizations.delete(orgId);
  }
  db.users.delete(P1_3_ADMIN_USER_ID);
  db.users.delete(P1_3_AGENT_USER_ID);
  db.users.delete(P1_3_2_ADMIN_USER_ID);
  db.users.delete(P1_3_2_PEER_ADMIN_USER_ID);

  // Read-After-Delete verification across live Maps
  for (const orgId of syntheticOrgs) {
    if (db.organizations.has(orgId)) return false;
    if (Array.from(db.users.values()).some((u) => u.organizationId === orgId)) return false;
    if (Array.from(db.customers.values()).some((c) => c.organizationId === orgId)) return false;
    if (Array.from(db.tickets.values()).some((t) => t.organizationId === orgId)) return false;
    if (Array.from(db.macros.values()).some((m) => m.organizationId === orgId)) return false;
  }
  return true;
}

interface SavedEnvVarState {
  exists: boolean;
  value: string | undefined;
}

function captureEnvVar(name: string): SavedEnvVarState {
  const exists = Object.prototype.hasOwnProperty.call(process.env, name);
  return {
    exists,
    value: exists ? process.env[name] : undefined,
  };
}

function restoreEnvVar(name: string, state: SavedEnvVarState): void {
  if (!state.exists || state.value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = state.value;
  }
}

export async function runPhaseP13AuditChainSuite(options?: {
  existingBaseUrl?: string;
  verboseRawDump?: boolean;
}): Promise<P13AcceptanceTestResult[]> {
  const results: P13AcceptanceTestResult[] = [];

  const origChannelKey = captureEnvVar('CHANNEL_SECRET_ENCRYPTION_KEY');
  const origHmacKey = captureEnvVar('AUDIT_CHECKPOINT_HMAC_KEY');
  const origHmacKeyId = captureEnvVar('AUDIT_CHECKPOINT_HMAC_KEY_ID');
  const origVerifyKeys = captureEnvVar('AUDIT_CHECKPOINT_HMAC_VERIFY_KEYS');
  const origSessionSecret = captureEnvVar('SESSION_SECRET');
  const origPersistPath = db.getPersistFilePath();
  const origMaxLimit = AuditLogger.getMaxRetentionLimit();

  process.env.CHANNEL_SECRET_ENCRYPTION_KEY = TEST_CHANNEL_KEY_64;
  process.env.AUDIT_CHECKPOINT_HMAC_KEY = TEST_HMAC_KEY_64;
  process.env.AUDIT_CHECKPOINT_HMAC_KEY_ID = TEST_HMAC_KEY_ID;
  delete process.env.AUDIT_CHECKPOINT_HMAC_VERIFY_KEYS;

  const seedTestTenants = () => {
    db.organizations.set(
      P1_3_TEMP_ORG_ID,
      createSyntheticOrg(P1_3_TEMP_ORG_ID, 'P.1.3 Audit Chain Temp Org', 'p1-3-audit-temp')
    );
    db.organizations.set(
      P1_3_2_TEMP_ORG_ID,
      createSyntheticOrg(P1_3_2_TEMP_ORG_ID, 'P.1.3.2 Hardening Temp Org', 'p1-3-2-hardening-temp')
    );
    db.organizations.set(
      P1_3_2_PEER_ORG_ID,
      createSyntheticOrg(P1_3_2_PEER_ORG_ID, 'P.1.3.2 Peer Temp Org', 'p1-3-2-peer-temp')
    );

    db.users.set(
      P1_3_ADMIN_USER_ID,
      createSyntheticUser(P1_3_ADMIN_USER_ID, P1_3_TEMP_ORG_ID, 'Admin', 'admin@p1-3.internal')
    );
    db.users.set(
      P1_3_AGENT_USER_ID,
      createSyntheticUser(P1_3_AGENT_USER_ID, P1_3_TEMP_ORG_ID, 'Agent', 'agent@p1-3.internal')
    );
    db.users.set(
      P1_3_2_ADMIN_USER_ID,
      createSyntheticUser(P1_3_2_ADMIN_USER_ID, P1_3_2_TEMP_ORG_ID, 'Admin', 'admin@p1-3-2.internal')
    );
    db.users.set(
      P1_3_2_PEER_ADMIN_USER_ID,
      createSyntheticUser(P1_3_2_PEER_ADMIN_USER_ID, P1_3_2_PEER_ORG_ID, 'Admin', 'peer@p1-3-2.internal')
    );
  };

  if (db.organizations.size === 0) {
    seedTestTenants();
  }

  const preSuiteAuditSnapshot = AuditLogger.captureSnapshot();
  const preSuiteFullBackup = db.exportFullBackup();

  let localServer: http.Server | null = null;
  let baseUrl = options?.existingBaseUrl || '';

  if (!baseUrl) {
    const app = express();
    app.use(express.json({ limit: '10mb' }));
    app.use('/api/v1', apiRouter);
    localServer = http.createServer(app);
    await new Promise<void>((resolve) => localServer!.listen(0, '127.0.0.1', () => resolve()));
    const addr = localServer.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;
  }

  const runId = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const tempDiskDir = path.join(os.tmpdir(), 'omniflow-data', `p1_3_2_${runId}`);
  fs.mkdirSync(tempDiskDir, { recursive: true });
  const tempDiskFile = path.join(tempDiskDir, 'db_state.json');

  try {
    db.setPersistFilePathForTesting(tempDiskFile);
    seedTestTenants();

    // =========================================================================
    // AC-01: Sequential Hash Chain Integrity (22 v3 Events Across Global & Per-Tenant Chains)
    // =========================================================================
    {
      AuditLogger.resetForTesting();
      AuditLogger.setMaxRetentionLimitForTesting(2000);
      const generated: AuditEvent[] = [];

      for (let i = 1; i <= 22; i++) {
        const targetOrg = i % 2 === 0 ? P1_3_2_TEMP_ORG_ID : P1_3_TEMP_ORG_ID;
        const ev = await AuditLogger.log({
          organizationId: targetOrg,
          actorId: P1_3_2_ADMIN_USER_ID,
          actorType: 'user',
          action: `p1_3_2.seq_test_${i}`,
          entityType: 'audit_verification',
          entityId: `ent-${i}`,
          beforeState: { step: i - 1 },
          afterState: { step: i },
          ipAddress: '127.0.0.1',
          userAgent: 'P1.3.2-Audit-Suite/1.0',
          requestId: `req-ac01-${i}`,
          reason: `Sequential hash test ${i}`,
        });
        generated.push(ev);
      }

      const e1 = generated[0];
      const e2 = generated[1];
      const e3 = generated[2];

      assertCondition(e1.schemaVersion === 3, 'e1 must use schemaVersion 3');
      assertCondition(e1.prevHash === AUDIT_GENESIS_HASH, 'e1 prevHash must equal AUDIT_GENESIS_HASH');
      assertCondition(e2.prevHash === e1.integrityHash, 'e2 prevHash must equal e1 integrityHash');
      assertCondition(e3.prevHash === e2.integrityHash, 'e3 prevHash must equal e2 integrityHash');
      assertCondition(e1.globalSeq === 1 && e2.globalSeq === 2 && e3.globalSeq === 3, 'globalSeq must increment 1..3');

      const tenantEvents = generated.filter((e) => e.organizationId === P1_3_2_TEMP_ORG_ID);
      assertCondition(tenantEvents[0].tenantSeq === 1, 'First tenant event must have tenantSeq === 1');
      assertCondition(tenantEvents[0].tenantPrevHash === AUDIT_GENESIS_HASH, 'First tenant event tenantPrevHash must be genesis');
      assertCondition(
        tenantEvents[1].tenantPrevHash === tenantEvents[0].integrityHash,
        'Second tenant event tenantPrevHash must equal first tenant event integrityHash'
      );

      const globalCheck = AuditLogger.verifyChainIntegrity();
      assertCondition(globalCheck.valid === true && globalCheck.checkedCount === 22, 'Global chain of 22 events must verify');
      assertCondition(globalCheck.v3Count === 22, 'All 22 new events must be v3Count=22');

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      results.push({
        id: 'AC-01',
        title: 'Sequential Hash Chain Integrity (22 v3 Events Across Global & Per-Tenant Sub-Chains)',
        passed: true,
        evidenceSummary: `checkedCount=${globalCheck.checkedCount}, v3Count=${globalCheck.v3Count}, e1Hash=${e1.integrityHash?.slice(0, 16)}, e2PrevHash=${e2.prevHash?.slice(0, 16)}`,
        readAfterDeleteVerified: radOk,
        evidence: {
          e1Id: e1.id,
          e1Hash: e1.integrityHash,
          e2Id: e2.id,
          e2PrevHash: e2.prevHash,
          e2Hash: e2.integrityHash,
          globalCheck,
        },
      });
    }

    // =========================================================================
    // AC-02: Tamper Detection Matrix (Payload, Actor, Timestamp, Hash, Middle Deletion)
    // =========================================================================
    {
      const baseExport = AuditLogger.exportAllEvents(); // newest-first
      const tamperMatrix: any[] = [];

      // Case A: Mutate afterState on chronological index 4 (export index baseExport.length - 1 - 4)
      const cloneA = baseExport.map((e) => ({ ...e }));
      const targetIdxA = cloneA.length - 5;
      cloneA[targetIdxA] = { ...cloneA[targetIdxA], afterState: { step: 99999, tampered: true } };
      const resA = AuditLogger.verifyChainIntegrity(cloneA);
      assertCondition(!resA.valid && resA.code === 'PAYLOAD_HASH_MISMATCH', 'Mutating afterState must fail with PAYLOAD_HASH_MISMATCH');
      tamperMatrix.push({ scenario: 'Mutate afterState', code: resA.code, checkedCount: resA.checkedCount });

      // Case B: Mutate actorId
      const cloneB = baseExport.map((e) => ({ ...e }));
      const targetIdxB = cloneB.length - 8;
      cloneB[targetIdxB] = { ...cloneB[targetIdxB], actorId: 'attacker-actor' };
      const resB = AuditLogger.verifyChainIntegrity(cloneB);
      assertCondition(!resB.valid && resB.code === 'PAYLOAD_HASH_MISMATCH', 'Mutating actorId must fail with PAYLOAD_HASH_MISMATCH');
      tamperMatrix.push({ scenario: 'Mutate actorId', code: resB.code, checkedCount: resB.checkedCount });

      // Case C: Mutate createdAt
      const cloneC = baseExport.map((e) => ({ ...e }));
      const targetIdxC = cloneC.length - 11;
      cloneC[targetIdxC] = { ...cloneC[targetIdxC], createdAt: '1999-01-01T00:00:00.000Z' };
      const resC = AuditLogger.verifyChainIntegrity(cloneC);
      assertCondition(!resC.valid && resC.code === 'PAYLOAD_HASH_MISMATCH', 'Mutating createdAt must fail with PAYLOAD_HASH_MISMATCH');
      tamperMatrix.push({ scenario: 'Mutate createdAt', code: resC.code, checkedCount: resC.checkedCount });

      // Case D: Mutate integrityHash
      const cloneD = baseExport.map((e) => ({ ...e }));
      const targetIdxD = cloneD.length - 3;
      cloneD[targetIdxD] = { ...cloneD[targetIdxD], integrityHash: 'f'.repeat(64) };
      const resD = AuditLogger.verifyChainIntegrity(cloneD);
      assertCondition(!resD.valid, 'Mutating integrityHash must fail');
      tamperMatrix.push({ scenario: 'Mutate integrityHash', code: resD.code, checkedCount: resD.checkedCount });

      // Case E: Delete middle event
      const cloneE = baseExport.filter((_, idx) => idx !== cloneD.length - 6);
      const resE = AuditLogger.verifyChainIntegrity(cloneE);
      assertCondition(!resE.valid && resE.code === 'BROKEN_PREV_HASH_LINK', 'Deleting middle event must fail with BROKEN_PREV_HASH_LINK');
      tamperMatrix.push({ scenario: 'Delete middle event', code: resE.code, checkedCount: resE.checkedCount });

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      results.push({
        id: 'AC-02',
        title: 'Tamper Detection Matrix (Payload, Actor, Timestamp, Hash, Middle Event Deletion)',
        passed: true,
        evidenceSummary: `All 5 tamper scenarios rejected: ${tamperMatrix.map((m) => m.code).join(', ')}`,
        readAfterDeleteVerified: radOk,
        evidence: { tamperMatrix },
      });
    }

    // =========================================================================
    // AC-03: Disk Persistence & Reload Verification (Survives Restart With Signed Manifest)
    // =========================================================================
    {
      const beforeHash = AuditLogger.verifyChainIntegrity().latestIntegrityHash;
      const saved = db.saveToDisk();
      assertCondition(saved === true && fs.existsSync(tempDiskFile), 'db.saveToDisk() must succeed');

      const rawDisk = JSON.parse(fs.readFileSync(tempDiskFile, 'utf8'));
      assertCondition(Array.isArray(rawDisk.auditEvents) && rawDisk.auditEvents.length === 22, 'Disk file must contain 22 auditEvents');
      assertCondition(
        rawDisk.auditIntegrityManifest?.manifestVersion === AUDIT_MANIFEST_CONTRACT_VERSION &&
          rawDisk.auditIntegrityManifest?.artifactType === 'DISK_SNAPSHOT',
        'Disk file must contain signed DISK_SNAPSHOT auditIntegrityManifest'
      );

      AuditLogger.resetForTesting();
      assertCondition(AuditLogger.exportAllEvents().length === 0, 'In-memory store must be empty after resetForTesting');

      const loaded = db.loadFromDisk();
      assertCondition(loaded === true, 'db.loadFromDisk() must succeed');
      const afterCheck = AuditLogger.verifyChainIntegrity();
      assertCondition(
        afterCheck.valid === true && afterCheck.checkedCount === 22 && afterCheck.latestIntegrityHash === beforeHash,
        'Reloaded chain must match pre-save hash and event count'
      );

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      db.saveToDisk();
      results.push({
        id: 'AC-03',
        title: 'Disk Persistence & Reload Verification (No Silent Reset on Restart)',
        passed: true,
        evidenceSummary: `persistedEvents=22, manifestKeyId=${rawDisk.auditIntegrityManifest.keyId}, hash=${afterCheck.latestIntegrityHash?.slice(0, 16)}`,
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-04: Corrupted Persisted Audit Chain Fails Closed on Startup Load
    // =========================================================================
    {
      const corruptFile = path.join(tempDiskDir, 'db_state_corrupt_ac04.json');
      const raw = JSON.parse(fs.readFileSync(tempDiskFile, 'utf8'));
      raw.auditEvents[2].afterState = { corruptedOnDisk: true };
      fs.writeFileSync(corruptFile, JSON.stringify(raw, null, 2), 'utf8');

      db.setPersistFilePathForTesting(corruptFile);
      const loadRes = db.loadFromDisk();
      const diag = db.getLastStorageError();
      assertCondition(loadRes === false, 'db.loadFromDisk() must return false on corrupted persisted audit chain');
      assertCondition(diag?.code === 'TAMPERED_AUDIT_CHAIN', `Expected TAMPERED_AUDIT_CHAIN diagnostic, got ${diag?.code}`);

      db.setPersistFilePathForTesting(tempDiskFile);
      db.loadFromDisk();

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      db.saveToDisk();
      results.push({
        id: 'AC-04',
        title: 'Corrupted Persisted Audit Chain Fails Closed on Startup Load',
        passed: true,
        evidenceSummary: `loadFromDisk=${loadRes}, diagnosticCode=${diag?.code}`,
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-05: Tenant Backup Export & Cryptographic Integrity Verification
    // =========================================================================
    {
      const tenantBackup = db.exportTenantBackup(P1_3_2_TEMP_ORG_ID);
      assertCondition(tenantBackup.scopeOrganizationId === P1_3_2_TEMP_ORG_ID, 'scopeOrganizationId must match');
      assertCondition(Array.isArray(tenantBackup.auditEvents) && tenantBackup.auditEvents.length === 11, 'Tenant backup must contain 11 events');
      assertCondition(
        tenantBackup.auditIntegrityManifest?.artifactType === 'TENANT_BACKUP' &&
          tenantBackup.auditIntegrityManifest?.scopeOrgId === P1_3_2_TEMP_ORG_ID,
        'Tenant backup must contain scoped TENANT_BACKUP manifest'
      );

      const cleanVerify = AuditLogger.verifyTenantBackupIntegrity(
        P1_3_2_TEMP_ORG_ID,
        tenantBackup.auditEvents,
        tenantBackup.auditTenantCheckpoint,
        tenantBackup.auditIntegrityManifest,
        { requireManifest: true }
      );
      assertCondition(cleanVerify.valid === true && cleanVerify.code === 'VERIFIED', 'Clean tenant backup must verify');

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      results.push({
        id: 'AC-05',
        title: 'Tenant Backup Export & Scoped Cryptographic Integrity Verification',
        passed: true,
        evidenceSummary: `tenantEvents=${tenantBackup.auditEvents.length}, manifestSig=${tenantBackup.auditIntegrityManifest.signature.slice(0, 16)}, code=${cleanVerify.code}`,
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-06: Restore Rejection on Tampered Audit Chain via HTTP POST /api/v1/system/restore
    // =========================================================================
    {
      const adminToken = issueSessionToken({ userId: P1_3_2_ADMIN_USER_ID }).token;
      const backupRes = await httpJson(baseUrl, 'GET', '/system/backup', {
        Authorization: `Bearer ${adminToken}`,
      });
      assertCondition(backupRes.status === 200, 'GET /system/backup must return 200');

      const validBackup = backupRes.body.data;
      const tamperedBackup = JSON.parse(JSON.stringify(validBackup));
      tamperedBackup.auditEvents[1].afterState = { step: 8888, tamperedInBackup: true };

      const restoreTampered = await httpJson(
        baseUrl,
        'POST',
        '/system/restore',
        { Authorization: `Bearer ${adminToken}` },
        tamperedBackup
      );
      assertCondition(
        restoreTampered.status === 400 && restoreTampered.body?.error?.code === 'TAMPERED_AUDIT_CHAIN',
        `Expected 400 TAMPERED_AUDIT_CHAIN, got ${restoreTampered.status} ${restoreTampered.body?.error?.code}`
      );

      const restoreClean = await httpJson(
        baseUrl,
        'POST',
        '/system/restore',
        { Authorization: `Bearer ${adminToken}` },
        validBackup
      );
      assertCondition(restoreClean.status === 200 && restoreClean.body?.success === true, 'Clean backup restore must return 200');

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      db.saveToDisk();
      results.push({
        id: 'AC-06',
        title: 'HTTP Restore Rejection on Tampered Audit Chain (POST /api/v1/system/restore -> 400)',
        passed: true,
        evidenceSummary: `tamperedStatus=${restoreTampered.status} (${restoreTampered.body?.error?.code}), cleanStatus=${restoreClean.status}`,
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-07: Versioned Hash Contract (Legacy v1 + v2 + v3 Coexistence Without Silent Rewrite)
    // =========================================================================
    {
      const v1Ev1Base = {
        id: 'aud-v1-1',
        organizationId: P1_3_2_TEMP_ORG_ID,
        actorId: P1_3_2_ADMIN_USER_ID,
        actorType: 'user' as const,
        action: 'legacy.v1.first',
        entityType: 'ticket',
        entityId: 'tck-1',
        beforeState: { status: 'new' },
        afterState: { status: 'open' },
        prevHash: AUDIT_GENESIS_HASH,
        createdAt: '2025-01-01T00:00:00.000Z',
      };
      const v1Ev1: AuditEvent = {
        ...v1Ev1Base,
        integrityHash: AuditLogger.computeEventHash(v1Ev1Base),
      };

      const v2Ev2Base = {
        schemaVersion: 2 as const,
        id: 'aud-v2-2',
        organizationId: P1_3_2_TEMP_ORG_ID,
        actorId: P1_3_2_ADMIN_USER_ID,
        actorType: 'user' as const,
        action: 'modern.v2.second',
        entityType: 'ticket',
        entityId: 'tck-1',
        beforeState: { status: 'open' },
        afterState: { status: 'in_progress' },
        globalSeq: 2,
        prevHash: v1Ev1.integrityHash!,
        tenantSeq: 2,
        tenantPrevHash: v1Ev1.integrityHash!,
        createdAt: '2025-01-01T00:01:00.000Z',
      };
      const v2Ev2: AuditEvent = {
        ...v2Ev2Base,
        integrityHash: AuditLogger.computeEventHash(v2Ev2Base),
      };

      const v3Ev3Base = {
        schemaVersion: 3 as const,
        id: 'aud-v3-3',
        organizationId: P1_3_2_TEMP_ORG_ID,
        actorId: P1_3_2_ADMIN_USER_ID,
        actorType: 'user' as const,
        action: 'hardened.v3.third',
        entityType: 'ticket',
        entityId: 'tck-1',
        beforeState: { b: 2, a: 1 },
        afterState: { status: 'resolved' },
        ipAddress: '10.10.1.5',
        userAgent: 'OmniFlow-Agent/3.0',
        requestId: 'req-v3-3',
        reason: 'Customer confirmed resolution',
        globalSeq: 3,
        prevHash: v2Ev2.integrityHash!,
        tenantSeq: 3,
        tenantPrevHash: v2Ev2.integrityHash!,
        createdAt: '2025-01-01T00:02:00.000Z',
      };
      const v3Ev3: AuditEvent = {
        ...v3Ev3Base,
        integrityHash: AuditLogger.computeEventHash(v3Ev3Base),
      };

      // verifyChainIntegrity expects export order (newest-first)
      const mixedExportOrder = [v3Ev3, v2Ev2, v1Ev1];
      const mixedCheck = AuditLogger.verifyChainIntegrity(mixedExportOrder);
      assertCondition(
        mixedCheck.valid === true && mixedCheck.v1Count === 1 && mixedCheck.v2Count === 1 && mixedCheck.v3Count === 1,
        'Mixed v1 + v2 + v3 chain must verify with exact version counts'
      );

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      results.push({
        id: 'AC-07',
        title: 'Versioned Hash Contract (v1 + v2 + v3 Coexistence Without Silent Rewrite)',
        passed: true,
        evidenceSummary: `valid=${mixedCheck.valid}, v1Count=${mixedCheck.v1Count}, v2Count=${mixedCheck.v2Count}, v3Count=${mixedCheck.v3Count}`,
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-08: Retention Checkpoint Continuity (Bounded Hot Window Eviction vs. Uncheckpointed Drop)
    // =========================================================================
    {
      // Lower retention limit to 10 so 12 oldest events out of 22 are evicted into retentionCheckpoint
      AuditLogger.setMaxRetentionLimitForTesting(10);
      const ckpt = AuditLogger.exportCheckpoint();
      const postEvictCheck = AuditLogger.verifyChainIntegrity();

      assertCondition(ckpt.totalEvictedCount === 12, `Expected 12 evicted events, got ${ckpt.totalEvictedCount}`);
      assertCondition(ckpt.lastEvictedGlobalSeq === 12, `Expected lastEvictedGlobalSeq=12, got ${ckpt.lastEvictedGlobalSeq}`);
      assertCondition(
        postEvictCheck.valid === true &&
          postEvictCheck.checkedCount === 10 &&
          postEvictCheck.anchorType === 'RETENTION_CHECKPOINT',
        'Post-eviction chain of 10 events must verify against RETENTION_CHECKPOINT'
      );

      // Dropping the oldest remaining event without updating the checkpoint must fail closed
      const activeEvents = AuditLogger.exportAllEvents(); // newest-first
      const unauthorizedDrop = activeEvents.slice(0, activeEvents.length - 1);
      const dropCheck = AuditLogger.verifyChainIntegrity(unauthorizedDrop, ckpt);
      assertCondition(
        !dropCheck.valid &&
          (dropCheck.code === 'BROKEN_ANCHOR_LINK' || dropCheck.code === 'INVALID_RETENTION_CHECKPOINT'),
        `Unauthorized deletion after checkpoint must fail with BROKEN_ANCHOR_LINK or INVALID_RETENTION_CHECKPOINT, got ${dropCheck.code}`
      );

      AuditLogger.setMaxRetentionLimitForTesting(2000);
      db.loadFromDisk();

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      db.saveToDisk();
      results.push({
        id: 'AC-08',
        title: 'Retention Checkpoint Continuity (Bounded Eviction Verified vs. Uncheckpointed Drop Rejected)',
        passed: true,
        evidenceSummary: `evicted=${ckpt.totalEvictedCount}, active=${postEvictCheck.checkedCount}, anchor=${postEvictCheck.anchorType}, unauthorizedDrop=${dropCheck.code}`,
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-09: Audit Endpoint RBAC & Tenant Scoping (/api/v1/audit/logs)
    // =========================================================================
    {
      const adminToken = issueSessionToken({ userId: P1_3_2_ADMIN_USER_ID }).token;
      const agentToken = issueSessionToken({ userId: P1_3_AGENT_USER_ID }).token;

      const adminRes = await httpJson(baseUrl, 'GET', '/audit/logs', {
        Authorization: `Bearer ${adminToken}`,
      });
      const agentRes = await httpJson(baseUrl, 'GET', '/audit/logs', {
        Authorization: `Bearer ${agentToken}`,
      });

      assertCondition(adminRes.status === 200 && Array.isArray(adminRes.body?.data), 'Admin GET /audit/logs must return 200');
      assertCondition(
        adminRes.body.data.every((e: AuditEvent) => e.organizationId === P1_3_2_TEMP_ORG_ID),
        'Admin GET /audit/logs must only return events for authenticated tenant'
      );
      assertCondition(agentRes.status === 403, 'Agent GET /audit/logs must return 403');

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      results.push({
        id: 'AC-09',
        title: 'Audit Logs HTTP Endpoint RBAC & Strict Tenant Scoping (Admin 200 vs. Agent 403)',
        passed: true,
        evidenceSummary: `adminStatus=${adminRes.status} (tenantEvents=${adminRes.body.data.length}), agentStatus=${agentRes.status}`,
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-10: Cross-Tenant Contamination Rejection in Tenant Backup Restore
    // =========================================================================
    {
      const adminToken = issueSessionToken({ userId: P1_3_2_ADMIN_USER_ID }).token;
      const contaminatedBackup = db.exportTenantBackup(P1_3_2_TEMP_ORG_ID);
      contaminatedBackup.macros.push({
        id: 'macro-cross-tenant-spy',
        organizationId: P1_3_TEMP_ORG_ID,
        shortcut: '/spy',
        title: 'Spy Macro',
        category: 'Spy',
        text: 'Belongs to another tenant',
      });

      const restoreRes = await httpJson(
        baseUrl,
        'POST',
        '/system/restore',
        { Authorization: `Bearer ${adminToken}` },
        contaminatedBackup
      );
      assertCondition(
        restoreRes.status === 403 && restoreRes.body?.error?.code === 'CROSS_TENANT_RESTORE_FORBIDDEN',
        `Expected 403 CROSS_TENANT_RESTORE_FORBIDDEN, got ${restoreRes.status} ${restoreRes.body?.error?.code}`
      );

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      results.push({
        id: 'AC-10',
        title: 'Cross-Tenant Record Contamination Rejected on Restore (403 CROSS_TENANT_RESTORE_FORBIDDEN)',
        passed: true,
        evidenceSummary: `status=${restoreRes.status}, code=${restoreRes.body?.error?.code}`,
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-11: Checkpoint Forgery & Full Chain+Checkpoint Rewrite Rejection (11A & 11B Hardened)
    // =========================================================================
    {
      // 11A: Checkpoint-only tamper without rewriting events
      AuditLogger.setMaxRetentionLimitForTesting(12);
      const snap11A = AuditLogger.captureSnapshot();
      const tamperedCkpt11A: AuditRetentionCheckpoint = {
        ...snap11A.checkpoint,
        lastEvictedIntegrityHash: 'b'.repeat(64),
      };
      const verify11A = AuditLogger.verifyChainIntegrity(snap11A.events, tamperedCkpt11A);
      assertCondition(!verify11A.valid && verify11A.code === 'BROKEN_ANCHOR_LINK', '11A checkpoint-only tamper must fail with BROKEN_ANCHOR_LINK');

      AuditLogger.setMaxRetentionLimitForTesting(2000);
      db.loadFromDisk();

      // 11B (Hardened in P.1.3.2): Attacker with disk/backup write access deletes events,
      // fabricates a matching checkpoint, AND recomputes all remaining SHA-256 event hashes,
      // WITHOUT possessing AUDIT_CHECKPOINT_HMAC_KEY.
      const adminToken = issueSessionToken({ userId: P1_3_2_ADMIN_USER_ID }).token;
      const forgedBackup = db.exportTenantBackup(P1_3_2_TEMP_ORG_ID);
      const fakeEvictedHash = crypto.createHash('sha256').update('attacker-forged-anchor-11b').digest('hex');

      // Attacker rewrites tenant chain from scratch starting after fakeEvictedHash (evictedCount=5)
      const chronologicalOrig = [...forgedBackup.auditEvents].reverse().slice(2); // drops 2 events
      const rewrittenChronological: AuditEvent[] = [];
      let prevH = fakeEvictedHash;
      for (let i = 0; i < chronologicalOrig.length; i++) {
        const orig = chronologicalOrig[i];
        const tSeq = 5 + i + 1;
        const gSeq = 10 + i + 1;
        const candidateBase = {
          ...orig,
          schemaVersion: 3 as const,
          globalSeq: gSeq,
          prevHash: prevH,
          tenantSeq: tSeq,
          tenantPrevHash: prevH,
        };
        const newHash = AuditLogger.computeEventHash(candidateBase);
        rewrittenChronological.push({ ...candidateBase, integrityHash: newHash });
        prevH = newHash;
      }

      const rewrittenExportOrder = [...rewrittenChronological].reverse();
      forgedBackup.auditEvents = rewrittenExportOrder;
      forgedBackup.auditTenantCheckpoint = {
        organizationId: P1_3_2_TEMP_ORG_ID,
        contractVersion: '1.3.0-p1-3',
        evictedCount: 5,
        evictedTenantEventCount: 5,
        lastEvictedTenantSeq: 5,
        lastEvictedIntegrityHash: fakeEvictedHash,
        lastEvictedCreatedAt: new Date().toISOString(),
        activeTenantEventCount: rewrittenExportOrder.length,
        latestTenantSeq: rewrittenExportOrder[0].tenantSeq,
        latestTenantIntegrityHash: rewrittenExportOrder[0].integrityHash,
      };
      // Attacker recomputes manifest claims and signs with WRONG_HMAC_KEY_64
      const forgedClaims = AuditLogger.computeManifestClaims({
        artifactType: 'TENANT_BACKUP',
        scopeOrgId: P1_3_2_TEMP_ORG_ID,
        events: rewrittenExportOrder,
        tenantCheckpoint: forgedBackup.auditTenantCheckpoint,
      });
      const unsignedForged = {
        manifestVersion: AUDIT_MANIFEST_CONTRACT_VERSION,
        algorithm: 'HMAC-SHA256' as const,
        keyId: TEST_HMAC_KEY_ID,
        ...forgedClaims,
        issuedAt: new Date().toISOString(),
      };
      forgedBackup.auditIntegrityManifest = {
        ...unsignedForged,
        signature: crypto
          .createHmac('sha256', Buffer.from(WRONG_HMAC_KEY_64, 'hex'))
          .update(canonicalSerialize(unsignedForged))
          .digest('hex'),
      };

      const restore11B = await httpJson(
        baseUrl,
        'POST',
        '/system/restore',
        { Authorization: `Bearer ${adminToken}` },
        forgedBackup
      );
      assertCondition(
        restore11B.status === 400 && restore11B.body?.error?.code === 'AUDIT_SIGNATURE_INVALID',
        `11B full chain + checkpoint rewrite without HMAC key must fail with 400 AUDIT_SIGNATURE_INVALID, got ${restore11B.status} ${restore11B.body?.error?.code}`
      );

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      results.push({
        id: 'AC-11',
        title: 'Checkpoint Tamper (11A) & Full Chain+Checkpoint Rewrite Without HMAC Key (11B -> 400 AUDIT_SIGNATURE_INVALID)',
        passed: true,
        evidenceSummary: `11A=${verify11A.code}, 11B=${restore11B.status} (${restore11B.body?.error?.code})`,
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-12: Missing, Malformed, or Reused AUDIT_CHECKPOINT_HMAC_KEY Rejected (Fail-Closed 503)
    // =========================================================================
    {
      const adminToken = issueSessionToken({ userId: P1_3_2_ADMIN_USER_ID }).token;

      // 12.1 Missing key
      delete process.env.AUDIT_CHECKPOINT_HMAC_KEY;
      const missingKeyCheck = validateAuditHmacKey();
      const missingHttpRes = await httpJson(baseUrl, 'GET', '/system/backup', {
        Authorization: `Bearer ${adminToken}`,
      });
      assertCondition(
        !missingKeyCheck.valid &&
          missingKeyCheck.code === 'AUDIT_KEY_UNAVAILABLE' &&
          missingHttpRes.status === 503 &&
          missingHttpRes.body?.error?.code === 'AUDIT_KEY_UNAVAILABLE',
        'Missing AUDIT_CHECKPOINT_HMAC_KEY must fail closed with 503 AUDIT_KEY_UNAVAILABLE'
      );

      // 12.2 Malformed key (wrong length / non-hex / uppercase)
      for (const badKey of ['short', 'z'.repeat(64), TEST_HMAC_KEY_64.toUpperCase()]) {
        process.env.AUDIT_CHECKPOINT_HMAC_KEY = badKey;
        const badCheck = validateAuditHmacKey();
        assertCondition(
          !badCheck.valid && badCheck.status === 503 && badCheck.code === 'AUDIT_KEY_INVALID',
          `Malformed key '${badKey.slice(0, 10)}' must fail with 503 AUDIT_KEY_INVALID`
        );
      }

      // 12.3 Reusing CHANNEL_SECRET_ENCRYPTION_KEY
      process.env.AUDIT_CHECKPOINT_HMAC_KEY = TEST_CHANNEL_KEY_64;
      const reuseCheck = validateAuditHmacKey();
      const reuseHttpRes = await httpJson(baseUrl, 'GET', '/system/backup', {
        Authorization: `Bearer ${adminToken}`,
      });
      assertCondition(
        !reuseCheck.valid &&
          reuseCheck.code === 'AUDIT_KEY_REUSE_FORBIDDEN' &&
          reuseHttpRes.status === 503 &&
          reuseHttpRes.body?.error?.code === 'AUDIT_KEY_REUSE_FORBIDDEN',
        'Reusing CHANNEL_SECRET_ENCRYPTION_KEY must fail closed with 503 AUDIT_KEY_REUSE_FORBIDDEN'
      );

      process.env.AUDIT_CHECKPOINT_HMAC_KEY = TEST_HMAC_KEY_64;

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      results.push({
        id: 'AC-12',
        title: 'Fail-Closed Key Validation (Missing -> 503 AUDIT_KEY_UNAVAILABLE, Malformed -> 503 AUDIT_KEY_INVALID, Reused -> 503 AUDIT_KEY_REUSE_FORBIDDEN)',
        passed: true,
        evidenceSummary: `missing=${missingHttpRes.status}/${missingHttpRes.body?.error?.code}, reused=${reuseHttpRes.status}/${reuseHttpRes.body?.error?.code}`,
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-13: Valid Key & Key Rotation Verification via AUDIT_CHECKPOINT_HMAC_VERIFY_KEYS
    // =========================================================================
    {
      const events = AuditLogger.exportAllEvents();
      const ckpt = AuditLogger.exportCheckpoint();

      // Sign manifest with initial key (TEST_HMAC_KEY_ID)
      const oldManifest = AuditLogger.exportIntegrityManifest({
        artifactType: 'FULL_BACKUP',
        scopeOrgId: null,
        events,
        checkpoint: ckpt,
      });

      // Rotate active key to ROTATED_HMAC_KEY_64 / ROTATED_HMAC_KEY_ID and move old key to AUDIT_CHECKPOINT_HMAC_VERIFY_KEYS
      process.env.AUDIT_CHECKPOINT_HMAC_KEY = ROTATED_HMAC_KEY_64;
      process.env.AUDIT_CHECKPOINT_HMAC_KEY_ID = ROTATED_HMAC_KEY_ID;
      process.env.AUDIT_CHECKPOINT_HMAC_VERIFY_KEYS = `${TEST_HMAC_KEY_ID}:${TEST_HMAC_KEY_64}`;

      const verifyOld = AuditLogger.verifyIntegrityManifest(oldManifest, {
        allowedArtifactTypes: ['FULL_BACKUP'],
        scopeOrgId: null,
        events,
        checkpoint: ckpt,
      });
      assertCondition(verifyOld.valid === true, 'Manifest signed with historical keyId must verify via AUDIT_CHECKPOINT_HMAC_VERIFY_KEYS');

      const newManifest = AuditLogger.exportIntegrityManifest({
        artifactType: 'FULL_BACKUP',
        scopeOrgId: null,
        events,
        checkpoint: ckpt,
      });
      assertCondition(newManifest.keyId === ROTATED_HMAC_KEY_ID, 'New manifest must be signed with rotated keyId');

      const verifyNew = AuditLogger.verifyIntegrityManifest(newManifest, {
        allowedArtifactTypes: ['FULL_BACKUP'],
        scopeOrgId: null,
        events,
        checkpoint: ckpt,
      });
      assertCondition(verifyNew.valid === true, 'Manifest signed with rotated active key must verify');

      // Unknown keyId must fail with 400 AUDIT_KEY_ID_UNKNOWN
      const unknownKeyManifest = { ...newManifest, keyId: 'unknown-key-id-999' };
      const verifyUnknown = AuditLogger.verifyIntegrityManifest(unknownKeyManifest, {
        allowedArtifactTypes: ['FULL_BACKUP'],
        scopeOrgId: null,
        events,
        checkpoint: ckpt,
      });
      assertCondition(
        !verifyUnknown.valid && verifyUnknown.code === 'AUDIT_KEY_ID_UNKNOWN',
        `Unknown keyId must fail with AUDIT_KEY_ID_UNKNOWN, got ${verifyUnknown.code}`
      );

      process.env.AUDIT_CHECKPOINT_HMAC_KEY = TEST_HMAC_KEY_64;
      process.env.AUDIT_CHECKPOINT_HMAC_KEY_ID = TEST_HMAC_KEY_ID;
      delete process.env.AUDIT_CHECKPOINT_HMAC_VERIFY_KEYS;

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      results.push({
        id: 'AC-13',
        title: 'HMAC Key Rotation & Historical Keyring Verification (AUDIT_CHECKPOINT_HMAC_VERIFY_KEYS & AUDIT_KEY_ID_UNKNOWN)',
        passed: true,
        evidenceSummary: `oldKeyVerified=${verifyOld.valid}, rotatedKeyVerified=${verifyNew.valid}, unknownKeyCode=${verifyUnknown.code}`,
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-14: Full Global Chain + Checkpoint Rewrite Without HMAC Key Rejected
    // =========================================================================
    {
      const fullBackup = db.exportFullBackup();
      const fakeGlobalAnchor = crypto.createHash('sha256').update('global-rewrite-fake-anchor').digest('hex');

      const forgedEvBase = {
        schemaVersion: 3 as const,
        id: 'aud-global-forged-1',
        organizationId: P1_3_2_TEMP_ORG_ID,
        actorId: P1_3_2_ADMIN_USER_ID,
        actorType: 'user' as const,
        action: 'forged.global.event',
        entityType: 'system',
        entityId: 'sys-1',
        globalSeq: 6,
        prevHash: fakeGlobalAnchor,
        tenantSeq: 6,
        tenantPrevHash: fakeGlobalAnchor,
        createdAt: new Date().toISOString(),
      };
      const forgedEv: AuditEvent = {
        ...forgedEvBase,
        integrityHash: AuditLogger.computeEventHash(forgedEvBase),
      };

      fullBackup.auditEvents = [forgedEv];
      fullBackup.auditCheckpoint = {
        contractVersion: '1.3.0-p1-3',
        maxRetentionLimit: 2000,
        maxHotWindowEvents: 2000,
        totalEvictedCount: 5,
        lastEvictedGlobalSeq: 5,
        lastEvictedIntegrityHash: fakeGlobalAnchor,
        lastEvictedCreatedAt: new Date().toISOString(),
        cumulativeArchiveChainHash: fakeGlobalAnchor,
        tenantCheckpoints: {
          [P1_3_2_TEMP_ORG_ID]: {
            evictedCount: 5,
            evictedTenantEventCount: 5,
            lastEvictedTenantSeq: 5,
            lastEvictedIntegrityHash: fakeGlobalAnchor,
            lastEvictedCreatedAt: new Date().toISOString(),
          },
        },
      };

      const importRes = db.importFullBackupDetailed(fullBackup, { persistToDisk: false });
      assertCondition(
        !importRes.ok && importRes.status === 400 && importRes.code === 'AUDIT_SIGNATURE_INVALID',
        `Expected 400 AUDIT_SIGNATURE_INVALID on forged global chain+checkpoint, got ${importRes.status} ${importRes.code}`
      );

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      results.push({
        id: 'AC-14',
        title: 'Full Global Chain + Checkpoint Rewrite Without HMAC Key Rejected (400 AUDIT_SIGNATURE_INVALID)',
        passed: true,
        evidenceSummary: `ok=${importRes.ok}, status=${importRes.status}, code=${importRes.code}`,
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-15: Missing auditIntegrityManifest Rejected on Both Tenant & Full Restore
    // =========================================================================
    {
      const adminToken = issueSessionToken({ userId: P1_3_2_ADMIN_USER_ID }).token;
      const tenantBackup = db.exportTenantBackup(P1_3_2_TEMP_ORG_ID);
      delete tenantBackup.auditIntegrityManifest;

      const tenantRestoreRes = await httpJson(
        baseUrl,
        'POST',
        '/system/restore',
        { Authorization: `Bearer ${adminToken}` },
        tenantBackup
      );
      assertCondition(
        tenantRestoreRes.status === 400 && tenantRestoreRes.body?.error?.code === 'AUDIT_MANIFEST_MISSING',
        `Tenant restore missing manifest must return 400 AUDIT_MANIFEST_MISSING, got ${tenantRestoreRes.status} ${tenantRestoreRes.body?.error?.code}`
      );

      const fullBackup = db.exportFullBackup();
      delete fullBackup.auditIntegrityManifest;
      const fullImportRes = db.importFullBackupDetailed(fullBackup, { persistToDisk: false });
      assertCondition(
        !fullImportRes.ok && fullImportRes.status === 400 && fullImportRes.code === 'AUDIT_MANIFEST_MISSING',
        `Full backup import missing manifest must return 400 AUDIT_MANIFEST_MISSING, got ${fullImportRes.code}`
      );

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      results.push({
        id: 'AC-15',
        title: 'Missing auditIntegrityManifest Rejected (400 AUDIT_MANIFEST_MISSING on Tenant & Full Restore)',
        passed: true,
        evidenceSummary: `tenantRestore=${tenantRestoreRes.status}/${tenantRestoreRes.body?.error?.code}, fullImport=${fullImportRes.status}/${fullImportRes.code}`,
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-16: Manifest Signed With Wrong 32-Byte HMAC Key Rejected
    // =========================================================================
    {
      const events = AuditLogger.exportAllEvents();
      const ckpt = AuditLogger.exportCheckpoint();
      const validManifest = AuditLogger.exportIntegrityManifest({
        artifactType: 'FULL_BACKUP',
        scopeOrgId: null,
        events,
        checkpoint: ckpt,
      });

      const { signature: _origSig, ...unsigned } = validManifest;
      const wrongSig = crypto
        .createHmac('sha256', Buffer.from(WRONG_HMAC_KEY_64, 'hex'))
        .update(canonicalSerialize(unsigned))
        .digest('hex');

      const wrongKeyManifest: AuditIntegrityManifest = {
        ...unsigned,
        signature: wrongSig,
      };

      const verifyRes = AuditLogger.verifyIntegrityManifest(wrongKeyManifest, {
        allowedArtifactTypes: ['FULL_BACKUP'],
        scopeOrgId: null,
        events,
        checkpoint: ckpt,
      });
      assertCondition(
        !verifyRes.valid && verifyRes.status === 400 && verifyRes.code === 'AUDIT_SIGNATURE_INVALID',
        `Manifest signed with wrong HMAC key must fail with 400 AUDIT_SIGNATURE_INVALID, got ${verifyRes.code}`
      );

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      results.push({
        id: 'AC-16',
        title: 'Manifest Signed With Unauthorized 32-Byte HMAC Key Rejected (400 AUDIT_SIGNATURE_INVALID)',
        passed: true,
        evidenceSummary: `valid=${verifyRes.valid}, status=${verifyRes.status}, code=${verifyRes.code}`,
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-17: Tampering With Any Claim Field Inside auditIntegrityManifest Rejected
    // =========================================================================
    {
      const events = AuditLogger.exportAllEvents();
      const ckpt = AuditLogger.exportCheckpoint();
      const baseManifest = AuditLogger.exportIntegrityManifest({
        artifactType: 'FULL_BACKUP',
        scopeOrgId: null,
        events,
        checkpoint: ckpt,
      });

      const mutations: Array<{ field: string; mutate: (m: any) => void }> = [
        { field: 'eventCount', mutate: (m) => { m.eventCount += 1; } },
        { field: 'latestIntegrityHash', mutate: (m) => { m.latestIntegrityHash = 'a'.repeat(64); } },
        { field: 'checkpointDigest', mutate: (m) => { m.checkpointDigest = 'b'.repeat(64); } },
        { field: 'eventsDigest', mutate: (m) => { m.eventsDigest = 'c'.repeat(64); } },
        { field: 'issuedAt', mutate: (m) => { m.issuedAt = '2020-01-01T00:00:00.000Z'; } },
        { field: 'scopeOrgId', mutate: (m) => { m.scopeOrgId = P1_3_2_TEMP_ORG_ID; } },
      ];

      const codes: string[] = [];
      for (const item of mutations) {
        const cloned = JSON.parse(JSON.stringify(baseManifest));
        item.mutate(cloned);
        const check = AuditLogger.verifyIntegrityManifest(cloned, {
          allowedArtifactTypes: ['FULL_BACKUP'],
          scopeOrgId: null,
          events,
          checkpoint: ckpt,
        });
        assertCondition(!check.valid, `Tampering with manifest.${item.field} must be rejected`);
        codes.push(`${item.field}:${check.code}`);
      }

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      results.push({
        id: 'AC-17',
        title: 'Tampering With Any Claim Field Inside auditIntegrityManifest Rejected',
        passed: true,
        evidenceSummary: codes.join(', '),
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-18: Cross-Tenant Manifest Swap (403) & Artifact Scope Swap (400) Rejected
    // =========================================================================
    {
      // Log an event for P1_3_2_PEER_ORG_ID
      await AuditLogger.log({
        organizationId: P1_3_2_PEER_ORG_ID,
        actorId: P1_3_2_PEER_ADMIN_USER_ID,
        actorType: 'user',
        action: 'peer.tenant.action',
        entityType: 'system',
        entityId: 'peer-1',
      });

      const peerBackup = db.exportTenantBackup(P1_3_2_PEER_ORG_ID);
      const adminToken = issueSessionToken({ userId: P1_3_2_ADMIN_USER_ID }).token;

      // 18A: Admin of P1_3_2_TEMP_ORG_ID attempts to restore peer tenant's valid signed backup
      const crossTenantRes = await httpJson(
        baseUrl,
        'POST',
        '/system/restore',
        { Authorization: `Bearer ${adminToken}` },
        peerBackup
      );
      assertCondition(
        crossTenantRes.status === 403 && crossTenantRes.body?.error?.code === 'CROSS_TENANT_RESTORE_FORBIDDEN',
        `Expected 403 CROSS_TENANT_RESTORE_FORBIDDEN, got ${crossTenantRes.status} ${crossTenantRes.body?.error?.code}`
      );

      // 18B: Transplant valid FULL_BACKUP manifest into a TENANT_BACKUP restore payload
      const ownBackup = db.exportTenantBackup(P1_3_2_TEMP_ORG_ID);
      const fullBackup = db.exportFullBackup();
      ownBackup.auditIntegrityManifest = fullBackup.auditIntegrityManifest;

      const scopeSwapRes = await httpJson(
        baseUrl,
        'POST',
        '/system/restore',
        { Authorization: `Bearer ${adminToken}` },
        ownBackup
      );
      assertCondition(
        scopeSwapRes.status === 400 && scopeSwapRes.body?.error?.code === 'AUDIT_MANIFEST_INVALID',
        `Expected 400 AUDIT_MANIFEST_INVALID on artifactType swap, got ${scopeSwapRes.status} ${scopeSwapRes.body?.error?.code}`
      );

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      db.saveToDisk();
      results.push({
        id: 'AC-18',
        title: 'Cross-Tenant Manifest Restore (403 CROSS_TENANT_RESTORE_FORBIDDEN) & Artifact Type Swap (400 AUDIT_MANIFEST_INVALID) Rejected',
        passed: true,
        evidenceSummary: `crossTenant=${crossTenantRes.status}/${crossTenantRes.body?.error?.code}, scopeSwap=${scopeSwapRes.status}/${scopeSwapRes.body?.error?.code}`,
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-19: On-Disk db_state.json Chain + Checkpoint Rewrite Rejected by loadFromDisk
    // =========================================================================
    {
      const forgedDiskPath = path.join(tempDiskDir, 'db_state_forged_ac19.json');
      const rawDisk = JSON.parse(fs.readFileSync(tempDiskFile, 'utf8'));
      const fakeAnchor = crypto.createHash('sha256').update('ac19-disk-anchor').digest('hex');

      const diskEvtBase = {
        schemaVersion: 3 as const,
        id: 'aud-disk-forged-ac19',
        organizationId: P1_3_2_TEMP_ORG_ID,
        actorId: P1_3_2_ADMIN_USER_ID,
        actorType: 'user' as const,
        action: 'disk.rewrite.attack',
        entityType: 'system',
        entityId: 'disk-1',
        globalSeq: 2,
        prevHash: fakeAnchor,
        tenantSeq: 2,
        tenantPrevHash: fakeAnchor,
        createdAt: new Date().toISOString(),
      };
      rawDisk.auditEvents = [{ ...diskEvtBase, integrityHash: AuditLogger.computeEventHash(diskEvtBase) }];
      rawDisk.auditCheckpoint = {
        contractVersion: '1.3.0-p1-3',
        maxRetentionLimit: 2000,
        maxHotWindowEvents: 2000,
        totalEvictedCount: 1,
        lastEvictedGlobalSeq: 1,
        lastEvictedIntegrityHash: fakeAnchor,
        lastEvictedCreatedAt: new Date().toISOString(),
        cumulativeArchiveChainHash: fakeAnchor,
        tenantCheckpoints: {
          [P1_3_2_TEMP_ORG_ID]: {
            evictedCount: 1,
            evictedTenantEventCount: 1,
            lastEvictedTenantSeq: 1,
            lastEvictedIntegrityHash: fakeAnchor,
            lastEvictedCreatedAt: new Date().toISOString(),
          },
        },
      };
      fs.writeFileSync(forgedDiskPath, JSON.stringify(rawDisk, null, 2), 'utf8');

      db.setPersistFilePathForTesting(forgedDiskPath);
      const loadRes = db.loadFromDisk();
      const diag = db.getLastStorageError();
      assertCondition(
        loadRes === false && diag?.code === 'AUDIT_SIGNATURE_INVALID',
        `Expected loadFromDisk=false with AUDIT_SIGNATURE_INVALID, got load=${loadRes}, code=${diag?.code}`
      );

      db.setPersistFilePathForTesting(tempDiskFile);
      db.loadFromDisk();

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      db.saveToDisk();
      results.push({
        id: 'AC-19',
        title: 'On-Disk db_state.json Chain + Checkpoint Rewrite Rejected by loadFromDisk (AUDIT_SIGNATURE_INVALID)',
        passed: true,
        evidenceSummary: `loadFromDisk=${loadRes}, errorCode=${diag?.code}`,
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-20: Atomic Verify-Before-Mutate on AuditLogger.restoreSnapshot (Corrupted Events)
    // =========================================================================
    {
      const beforeSnap = AuditLogger.captureSnapshot();
      const beforeHash = AuditLogger.verifyChainIntegrity().latestIntegrityHash;

      const corruptedEvents = beforeSnap.events.map((e) => ({ ...e }));
      corruptedEvents[0] = { ...corruptedEvents[0], action: 'corrupted.in.snapshot' };

      const restoreRes = AuditLogger.restoreSnapshot({
        events: corruptedEvents,
        checkpoint: beforeSnap.checkpoint,
      });
      assertCondition(!restoreRes.valid, 'restoreSnapshot must return valid: false on corrupted events');

      const afterEvents = AuditLogger.exportAllEvents();
      const afterHash = AuditLogger.verifyChainIntegrity().latestIntegrityHash;
      assertCondition(
        afterEvents.length === beforeSnap.events.length && afterHash === beforeHash,
        'Live AuditLogger state must remain 100% untouched after failed restoreSnapshot'
      );

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      results.push({
        id: 'AC-20',
        title: 'Verify-Before-Mutate Atomicity on AuditLogger.restoreSnapshot (Corrupted Events)',
        passed: true,
        evidenceSummary: `restoreValid=${restoreRes.valid}, countBefore=${beforeSnap.events.length}, countAfter=${afterEvents.length}, hashUnchanged=${afterHash === beforeHash}`,
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-21: Atomic Verify-Before-Mutate on AuditLogger.restoreSnapshot (Tampered Checkpoint)
    // =========================================================================
    {
      const beforeSnap = AuditLogger.captureSnapshot();
      const beforeHash = AuditLogger.verifyChainIntegrity().latestIntegrityHash;

      const invalidCkpt: AuditRetentionCheckpoint = {
        ...beforeSnap.checkpoint,
        totalEvictedCount: 5,
        lastEvictedGlobalSeq: 0, // inconsistent with totalEvictedCount=5
      };

      const restoreRes = AuditLogger.restoreSnapshot({
        events: beforeSnap.events,
        checkpoint: invalidCkpt,
      });
      assertCondition(
        !restoreRes.valid && restoreRes.code === 'INVALID_RETENTION_CHECKPOINT',
        'restoreSnapshot must reject inconsistent checkpoint with INVALID_RETENTION_CHECKPOINT'
      );

      const liveCkptAfter = AuditLogger.exportCheckpoint();
      const afterHash = AuditLogger.verifyChainIntegrity().latestIntegrityHash;
      assertCondition(
        liveCkptAfter.totalEvictedCount === beforeSnap.checkpoint.totalEvictedCount && afterHash === beforeHash,
        'Live retentionCheckpoint and events must remain untouched after failed restoreSnapshot'
      );

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      results.push({
        id: 'AC-21',
        title: 'Verify-Before-Mutate Atomicity on AuditLogger.restoreSnapshot (Tampered Checkpoint)',
        passed: true,
        evidenceSummary: `code=${restoreRes.code}, liveEvictedCount=${liveCkptAfter.totalEvictedCount}, hashUnchanged=${afterHash === beforeHash}`,
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-22: Atomic Verify-Before-Mutate on AuditLogger.importEvents
    // =========================================================================
    {
      const beforeSnap = AuditLogger.captureSnapshot();
      const beforeHash = AuditLogger.verifyChainIntegrity().latestIntegrityHash;

      const badEvents = beforeSnap.events.map((e) => ({ ...e }));
      badEvents[0] = { ...badEvents[0], actorId: 'tampered-actor-in-import' };

      let threwCode = '';
      try {
        AuditLogger.importEvents(badEvents, beforeSnap.checkpoint);
      } catch (err: any) {
        threwCode = err?.code || 'THREW';
      }
      assertCondition(threwCode === 'PAYLOAD_HASH_MISMATCH', `importEvents must throw PAYLOAD_HASH_MISMATCH, got ${threwCode}`);

      const afterEvents = AuditLogger.exportAllEvents();
      const afterHash = AuditLogger.verifyChainIntegrity().latestIntegrityHash;
      assertCondition(
        afterEvents.length === beforeSnap.events.length && afterHash === beforeHash,
        'Live AuditLogger state must remain 100% untouched when importEvents throws'
      );

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      results.push({
        id: 'AC-22',
        title: 'Verify-Before-Mutate Atomicity on AuditLogger.importEvents (Throws Without Mutating Live State)',
        passed: true,
        evidenceSummary: `threwCode=${threwCode}, countBefore=${beforeSnap.events.length}, countAfter=${afterEvents.length}`,
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-23: Atomic Rollback Guarantee on POST /api/v1/system/restore (Memory & Disk Untouched)
    // =========================================================================
    {
      db.saveToDisk();
      const diskShaBefore = crypto.createHash('sha256').update(fs.readFileSync(tempDiskFile)).digest('hex');
      const macrosBefore = db.getMacros(P1_3_2_TEMP_ORG_ID).length;
      const auditHashBefore = AuditLogger.verifyChainIntegrity().latestIntegrityHash;

      const adminToken = issueSessionToken({ userId: P1_3_2_ADMIN_USER_ID }).token;
      const forgedBackup = JSON.parse(JSON.stringify(db.exportTenantBackup(P1_3_2_TEMP_ORG_ID)));
      forgedBackup.macros.push({
        id: 'macro-ghost-ac23',
        organizationId: P1_3_2_TEMP_ORG_ID,
        shortcut: '/ghost',
        title: 'Ghost Macro',
        category: 'Ghost',
        text: 'Must never be committed',
      });
      forgedBackup.auditIntegrityManifest.signature = 'd'.repeat(64);

      const restoreRes = await httpJson(
        baseUrl,
        'POST',
        '/system/restore',
        { Authorization: `Bearer ${adminToken}` },
        forgedBackup
      );
      assertCondition(
        restoreRes.status === 400 && restoreRes.body?.error?.code === 'AUDIT_SIGNATURE_INVALID',
        'Forged restore must return 400 AUDIT_SIGNATURE_INVALID'
      );

      const diskShaAfter = crypto.createHash('sha256').update(fs.readFileSync(tempDiskFile)).digest('hex');
      assertCondition(!db.macros.has('macro-ghost-ac23'), 'Ghost macro must never enter live db.macros');
      assertCondition(db.getMacros(P1_3_2_TEMP_ORG_ID).length === macrosBefore, 'Tenant macro count must be unchanged');
      assertCondition(
        AuditLogger.verifyChainIntegrity().latestIntegrityHash === auditHashBefore,
        'Live AuditLogger hash must be unchanged'
      );
      assertCondition(diskShaAfter === diskShaBefore, 'On-disk file SHA-256 must be 100% unchanged after rejected restore');

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      db.saveToDisk();
      results.push({
        id: 'AC-23',
        title: 'Atomic Failure on POST /api/v1/system/restore (Zero Live Memory or Disk SHA-256 Mutation)',
        passed: true,
        evidenceSummary: `status=${restoreRes.status}, ghostMacroCommitted=false, diskShaUnchanged=${diskShaAfter === diskShaBefore}`,
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-24: Atomic Staging Verification on db.loadFromDisk (Live Memory Untouched on Failure)
    // =========================================================================
    {
      const orgsCountBefore = db.organizations.size;
      const auditHashBefore = AuditLogger.verifyChainIntegrity().latestIntegrityHash;

      const badDiskPath = path.join(tempDiskDir, 'db_state_atomic_ac24.json');
      const raw = JSON.parse(fs.readFileSync(tempDiskFile, 'utf8'));
      raw.organizations.push(createSyntheticOrg('org-ghost-ac24', 'Ghost Disk Org', 'ghost-disk'));
      raw.auditIntegrityManifest.signature = '1'.repeat(64);
      fs.writeFileSync(badDiskPath, JSON.stringify(raw, null, 2), 'utf8');

      db.setPersistFilePathForTesting(badDiskPath);
      const loadRes = db.loadFromDisk();
      assertCondition(loadRes === false, 'loadFromDisk must return false on invalid signature');
      assertCondition(!db.organizations.has('org-ghost-ac24'), 'Ghost org from rejected disk file must not enter live db.organizations');
      assertCondition(db.organizations.size === orgsCountBefore, 'Live db.organizations.size must remain unchanged');
      assertCondition(
        AuditLogger.verifyChainIntegrity().latestIntegrityHash === auditHashBefore,
        'Live AuditLogger hash must remain unchanged'
      );

      db.setPersistFilePathForTesting(tempDiskFile);
      db.loadFromDisk();

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      db.saveToDisk();
      results.push({
        id: 'AC-24',
        title: 'Atomic Staging Verification on db.loadFromDisk (Zero Live State Pollution on Rejected File)',
        passed: true,
        evidenceSummary: `loadRes=${loadRes}, ghostOrgPresent=false, orgsCount=${db.organizations.size}`,
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-25: SchemaVersion 3 Full-Field Hash Coverage & Canonical Key-Order Independence
    // =========================================================================
    {
      const baseV3 = {
        schemaVersion: 3 as const,
        id: 'aud-v3-ac25',
        organizationId: P1_3_2_TEMP_ORG_ID,
        actorId: P1_3_2_ADMIN_USER_ID,
        actorType: 'user' as const,
        action: 'forensic.v3.coverage',
        entityType: 'security_policy',
        entityId: 'pol-25',
        beforeState: { zKey: 10, aKey: { innerY: 'y', innerX: [1, { b: 2, a: 1 }] } },
        afterState: { enforced: true },
        ipAddress: '192.0.2.55',
        userAgent: 'ForensicVerifier/3.2',
        requestId: 'req-ac25-001',
        reason: 'Mandatory security control',
        globalSeq: 1,
        prevHash: AUDIT_GENESIS_HASH,
        tenantSeq: 1,
        tenantPrevHash: AUDIT_GENESIS_HASH,
        createdAt: '2026-03-30T12:00:00.000Z',
      };
      const baseHash = AuditLogger.computeEventHash(baseV3);

      // Reordered nested keys must produce the exact same canonical hash
      const reorderedV3 = {
        ...baseV3,
        beforeState: { aKey: { innerX: [1, { a: 1, b: 2 }], innerY: 'y' }, zKey: 10 },
      };
      const reorderedHash = AuditLogger.computeEventHash(reorderedV3);
      assertCondition(reorderedHash === baseHash, 'Reordered nested keys in v3 beforeState must produce identical hash');

      // Mutating any of ipAddress, userAgent, requestId, reason, or core fields must change the hash
      const fieldPatches: Array<[string, Record<string, any>]> = [
        ['ipAddress', { ipAddress: '198.51.100.1' }],
        ['userAgent', { userAgent: 'SpoofedUA/1.0' }],
        ['requestId', { requestId: 'req-spoofed-999' }],
        ['reason', { reason: 'Altered reason' }],
        ['actorId', { actorId: 'other-actor' }],
        ['actorType', { actorType: 'system' }],
        ['action', { action: 'other.action' }],
        ['entityType', { entityType: 'other_entity' }],
        ['entityId', { entityId: 'pol-999' }],
        ['afterState', { afterState: { enforced: false } }],
        ['globalSeq', { globalSeq: 2 }],
        ['tenantSeq', { tenantSeq: 2 }],
        ['prevHash', { prevHash: 'e'.repeat(64) }],
        ['tenantPrevHash', { tenantPrevHash: 'f'.repeat(64) }],
      ];

      for (const [field, patch] of fieldPatches) {
        const mutatedHash = AuditLogger.computeEventHash({ ...baseV3, ...patch });
        assertCondition(mutatedHash !== baseHash, `Mutating v3 field '${field}' must change integrityHash`);
      }

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      results.push({
        id: 'AC-25',
        title: 'SchemaVersion 3 Full-Field Hash Coverage (ipAddress, userAgent, requestId, reason) & Key-Order Independence',
        passed: true,
        evidenceSummary: `reorderedKeysEqual=${reorderedHash === baseHash}, verifiedFields=${fieldPatches.length}`,
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-26: Unknown / Unsupported schemaVersion Fails Closed (UNSUPPORTED_AUDIT_SCHEMA_VERSION)
    // =========================================================================
    {
      const invalidVersions: any[] = [0, 4, 99, -1, '2', '3', null];
      for (const badVer of invalidVersions) {
        const candidate: any = {
          id: `aud-badver-${String(badVer)}`,
          schemaVersion: badVer,
          organizationId: P1_3_2_TEMP_ORG_ID,
          actorId: P1_3_2_ADMIN_USER_ID,
          actorType: 'user',
          action: 'bad.version',
          entityType: 'system',
          entityId: 'sys-1',
          globalSeq: 1,
          prevHash: AUDIT_GENESIS_HASH,
          tenantSeq: 1,
          tenantPrevHash: AUDIT_GENESIS_HASH,
          integrityHash: 'a'.repeat(64),
          createdAt: new Date().toISOString(),
        };
        const globalCheck = AuditLogger.verifyChainIntegrity([candidate]);
        assertCondition(
          !globalCheck.valid && globalCheck.code === 'UNSUPPORTED_AUDIT_SCHEMA_VERSION',
          `verifyChainIntegrity must reject schemaVersion=${String(badVer)} with UNSUPPORTED_AUDIT_SCHEMA_VERSION`
        );

        const tenantCheck = AuditLogger.verifyTenantBackupIntegrity(P1_3_2_TEMP_ORG_ID, [candidate]);
        assertCondition(
          !tenantCheck.valid && tenantCheck.code === 'UNSUPPORTED_AUDIT_SCHEMA_VERSION',
          `verifyTenantBackupIntegrity must reject schemaVersion=${String(badVer)} with UNSUPPORTED_AUDIT_SCHEMA_VERSION`
        );
      }

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      results.push({
        id: 'AC-26',
        title: 'Unsupported schemaVersion Values Rejected Fail-Closed (UNSUPPORTED_AUDIT_SCHEMA_VERSION)',
        passed: true,
        evidenceSummary: `rejectedVersions=${JSON.stringify(invalidVersions)}`,
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-27: Deep In-Memory Immutability (deepFreezeAuditValue on Log & Restore)
    // =========================================================================
    {
      const callerState = { nested: { items: ['x', 'y'], status: 'initial' } };
      const loggedEv = await AuditLogger.log({
        organizationId: P1_3_2_TEMP_ORG_ID,
        actorId: P1_3_2_ADMIN_USER_ID,
        actorType: 'user',
        action: 'immutability.deep_freeze_test',
        entityType: 'security',
        entityId: 'imm-27',
        afterState: callerState,
      });

      // Mutate caller's object after logging
      callerState.nested.items.push('caller-mutated');
      callerState.nested.status = 'tampered-by-caller';

      const storedEv = AuditLogger.exportAllEvents().find((e) => e.id === loggedEv.id)!;
      assertCondition(
        (storedEv.afterState as any).nested.status === 'initial' &&
          (storedEv.afterState as any).nested.items.length === 2,
        'Caller object mutation after AuditLogger.log() must not affect stored event'
      );

      let topLevelThrew = false;
      let nestedThrew = false;
      try {
        (loggedEv as any).action = 'mutated';
      } catch {
        topLevelThrew = true;
      }
      try {
        (loggedEv.afterState as any).nested.items.push('illegal');
      } catch {
        nestedThrew = true;
      }
      assertCondition(topLevelThrew && nestedThrew, 'Direct mutation on top-level or nested AuditEvent fields must throw TypeError');

      db.loadFromDisk();
      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      db.saveToDisk();
      results.push({
        id: 'AC-27',
        title: 'Deep In-Memory Event Immutability (Defensive Clone + Recursive Object.freeze)',
        passed: true,
        evidenceSummary: `topLevelThrew=${topLevelThrew}, nestedThrew=${nestedThrew}, callerIsolationVerified=true`,
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-28: Empty Chain (events = []) With Checkpoint Strict Validation
    // =========================================================================
    {
      // Valid empty checkpoint after 3 evictions
      const validEmptyCkpt: AuditRetentionCheckpoint = {
        contractVersion: '1.3.0-p1-3',
        maxRetentionLimit: 2000,
        maxHotWindowEvents: 2000,
        totalEvictedCount: 3,
        lastEvictedGlobalSeq: 3,
        lastEvictedIntegrityHash: 'c'.repeat(64),
        lastEvictedCreatedAt: new Date().toISOString(),
        cumulativeArchiveChainHash: 'd'.repeat(64),
        tenantCheckpoints: {
          [P1_3_2_TEMP_ORG_ID]: {
            evictedCount: 3,
            evictedTenantEventCount: 3,
            lastEvictedTenantSeq: 3,
            lastEvictedIntegrityHash: 'c'.repeat(64),
            lastEvictedCreatedAt: new Date().toISOString(),
          },
        },
      };
      const cleanEmptyRes = AuditLogger.verifyChainIntegrity([], validEmptyCkpt);
      assertCondition(
        cleanEmptyRes.valid === true && cleanEmptyRes.code === 'CHAIN_VALID_EMPTY',
        'Valid empty checkpoint with events=[] must return CHAIN_VALID_EMPTY'
      );

      // Tampered empty checkpoint: totalEvictedCount=0 but non-genesis hash
      const inconsistentEmptyCkpt: AuditRetentionCheckpoint = {
        ...validEmptyCkpt,
        totalEvictedCount: 0,
      };
      const badEmptyRes = AuditLogger.verifyChainIntegrity([], inconsistentEmptyCkpt);
      assertCondition(
        !badEmptyRes.valid && badEmptyRes.code === 'INVALID_RETENTION_CHECKPOINT',
        'Empty chain with inconsistent checkpoint must fail with INVALID_RETENTION_CHECKPOINT'
      );

      // Tampered tenant empty checkpoint: claims activeTenantEventCount=5 when events=[]
      const badTenantEmptyRes = AuditLogger.verifyTenantBackupIntegrity(P1_3_2_TEMP_ORG_ID, [], {
        organizationId: P1_3_2_TEMP_ORG_ID,
        evictedCount: 0,
        evictedTenantEventCount: 0,
        lastEvictedTenantSeq: 0,
        lastEvictedIntegrityHash: AUDIT_GENESIS_HASH,
        activeTenantEventCount: 5,
      });
      assertCondition(
        !badTenantEmptyRes.valid && badTenantEmptyRes.code === 'TAMPERED_AUDIT_CHAIN',
        'Empty tenant chain with checkpoint claiming activeTenantEventCount=5 must fail with TAMPERED_AUDIT_CHAIN'
      );

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      results.push({
        id: 'AC-28',
        title: 'Empty Chain (events = []) With Checkpoint Strict Validation (Gate G9)',
        passed: true,
        evidenceSummary: `cleanEmpty=${cleanEmptyRes.code}, badGlobalEmpty=${badEmptyRes.code}, badTenantEmpty=${badTenantEmptyRes.code}`,
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-29: Timing-Safe HMAC Verification & Malformed Signature Handling
    // =========================================================================
    {
      const events = AuditLogger.exportAllEvents();
      const ckpt = AuditLogger.exportCheckpoint();
      const validManifest = AuditLogger.exportIntegrityManifest({
        artifactType: 'FULL_BACKUP',
        scopeOrgId: null,
        events,
        checkpoint: ckpt,
      });

      const malformedSigs = ['', '1234', 'g'.repeat(64), 'A'.repeat(64), validManifest.signature.slice(0, 62)];
      for (const badSig of malformedSigs) {
        const candidate = { ...validManifest, signature: badSig };
        const res = AuditLogger.verifyIntegrityManifest(candidate, {
          allowedArtifactTypes: ['FULL_BACKUP'],
          scopeOrgId: null,
          events,
          checkpoint: ckpt,
        });
        assertCondition(
          !res.valid && res.status === 400 && res.code === 'AUDIT_MANIFEST_INVALID',
          `Malformed signature '${badSig.slice(0, 10)}' must return 400 AUDIT_MANIFEST_INVALID without throwing`
        );
      }

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      results.push({
        id: 'AC-29',
        title: 'Timing-Safe HMAC Comparison (crypto.timingSafeEqual) & Malformed Signature Rejection',
        passed: true,
        evidenceSummary: `malformedVectorsTested=${malformedSigs.length}, allReturned=400 AUDIT_MANIFEST_INVALID`,
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-30: Key Secrecy & Zero Raw HMAC Key Leakage Across All Artifacts & Responses
    // =========================================================================
    {
      const adminToken = issueSessionToken({ userId: P1_3_2_ADMIN_USER_ID }).token;
      const backupHttp = await httpJson(baseUrl, 'GET', '/system/backup', {
        Authorization: `Bearer ${adminToken}`,
      });
      const logsHttp = await httpJson(baseUrl, 'GET', '/audit/logs', {
        Authorization: `Bearer ${adminToken}`,
      });
      const fullBackup = db.exportFullBackup();
      const diskRaw = fs.readFileSync(tempDiskFile, 'utf8');

      const blobs = [backupHttp.rawText, logsHttp.rawText, JSON.stringify(fullBackup), diskRaw];
      for (const b of blobs) {
        assertCondition(!b.includes(TEST_HMAC_KEY_64), 'Raw AUDIT_CHECKPOINT_HMAC_KEY must never appear in any artifact or response');
      }

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      results.push({
        id: 'AC-30',
        title: 'Key Secrecy Proof (Zero Raw AUDIT_CHECKPOINT_HMAC_KEY Leakage in Backups, Disk, or HTTP Responses)',
        passed: true,
        evidenceSummary: `artifactsInspected=${blobs.length}, rawKeyOccurrences=0`,
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-31: Honest Architectural Classification of Old Signed Snapshot Replay
    // =========================================================================
    {
      const snapT1 = db.exportTenantBackup(P1_3_2_TEMP_ORG_ID);
      const verifyT1 = AuditLogger.verifyTenantBackupIntegrity(
        P1_3_2_TEMP_ORG_ID,
        snapT1.auditEvents,
        snapT1.auditTenantCheckpoint,
        snapT1.auditIntegrityManifest,
        { requireManifest: true }
      );
      assertCondition(verifyT1.valid === true, 'Signed snapshot at T1 is cryptographically authentic');

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      results.push({
        id: 'AC-31',
        title: 'Old Signed Snapshot Replay Boundary & Honest Classification',
        passed: true,
        evidenceSummary:
          'Classification: OPEN — REQUIRES MONOTONIC STATE GENERATION COUNTER OR EXTERNAL ANCHOR IN POSTGRESQL PHASE',
        readAfterDeleteVerified: radOk,
      });
    }

    // =========================================================================
    // AC-32: Cryptographic Key Separation Proof (AUDIT_CHECKPOINT_HMAC_KEY != CHANNEL_SECRET_ENCRYPTION_KEY)
    // =========================================================================
    {
      process.env.AUDIT_CHECKPOINT_HMAC_KEY = TEST_CHANNEL_KEY_64;
      const checkSameAsChannel = validateAuditHmacKey();

      process.env.SESSION_SECRET = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
      process.env.AUDIT_CHECKPOINT_HMAC_KEY = process.env.SESSION_SECRET;
      const checkSameAsSession = validateAuditHmacKey();

      delete process.env.SESSION_SECRET;
      process.env.AUDIT_CHECKPOINT_HMAC_KEY = TEST_HMAC_KEY_64;

      assertCondition(
        !checkSameAsChannel.valid && checkSameAsChannel.code === 'AUDIT_KEY_REUSE_FORBIDDEN',
        'Reusing CHANNEL_SECRET_ENCRYPTION_KEY must return AUDIT_KEY_REUSE_FORBIDDEN'
      );
      assertCondition(
        !checkSameAsSession.valid && checkSameAsSession.code === 'AUDIT_KEY_REUSE_FORBIDDEN',
        'Reusing SESSION_SECRET must return AUDIT_KEY_REUSE_FORBIDDEN'
      );

      const radOk = cleanupSyntheticOrgs();
      seedTestTenants();
      results.push({
        id: 'AC-32',
        title: 'Cryptographic Key Separation Proof (Rejects Reuse of CHANNEL_SECRET_ENCRYPTION_KEY or SESSION_SECRET)',
        passed: true,
        evidenceSummary: `channelKeyReuse=${checkSameAsChannel.code}, sessionSecretReuse=${checkSameAsSession.code}`,
        readAfterDeleteVerified: radOk,
      });
    }
  } finally {
    let cleanupFailure: Error | null = null;
    try {
      AuditLogger.setMaxRetentionLimitForTesting(origMaxLimit);
      db.setPersistFilePathForTesting(origPersistPath);

      // Activate the exact signing-compatible verification context before importing preSuiteFullBackup
      process.env.CHANNEL_SECRET_ENCRYPTION_KEY = TEST_CHANNEL_KEY_64;
      process.env.AUDIT_CHECKPOINT_HMAC_KEY = TEST_HMAC_KEY_64;
      process.env.AUDIT_CHECKPOINT_HMAC_KEY_ID = TEST_HMAC_KEY_ID;
      delete process.env.AUDIT_CHECKPOINT_HMAC_VERIFY_KEYS;

      const cleanupErrors: string[] = [];

      try {
        const backupRestored = db.importFullBackup(preSuiteFullBackup);
        if (!backupRestored) {
          cleanupErrors.push(
            'Phase P.1.3.2 cleanup failed: db.importFullBackup(preSuiteFullBackup) returned false'
          );
        }
      } catch (err: any) {
        cleanupErrors.push(
          `Phase P.1.3.2 cleanup failed: db.importFullBackup(preSuiteFullBackup) threw: ${err?.message || String(err)}`
        );
      }

      try {
        const syntheticCleaned = cleanupSyntheticOrgs();
        if (!syntheticCleaned) {
          cleanupErrors.push(
            'Phase P.1.3.2 cleanup failed: cleanupSyntheticOrgs() read-after-delete verification returned false'
          );
        }
      } catch (err: any) {
        cleanupErrors.push(
          `Phase P.1.3.2 cleanup failed: cleanupSyntheticOrgs() threw: ${err?.message || String(err)}`
        );
      }

      try {
        const snapshotRestored = AuditLogger.restoreSnapshot(preSuiteAuditSnapshot);
        if (!snapshotRestored.valid) {
          cleanupErrors.push(
            `Phase P.1.3.2 cleanup failed: AuditLogger.restoreSnapshot(preSuiteAuditSnapshot) returned valid=false (${snapshotRestored.failureReason || snapshotRestored.code || 'unknown error'})`
          );
        }
      } catch (err: any) {
        cleanupErrors.push(
          `Phase P.1.3.2 cleanup failed: AuditLogger.restoreSnapshot(preSuiteAuditSnapshot) threw: ${err?.message || String(err)}`
        );
      }

      if (cleanupErrors.length > 0) {
        cleanupFailure = new Error(cleanupErrors.join('; '));
      }
    } finally {
      restoreEnvVar('CHANNEL_SECRET_ENCRYPTION_KEY', origChannelKey);
      restoreEnvVar('AUDIT_CHECKPOINT_HMAC_KEY', origHmacKey);
      restoreEnvVar('AUDIT_CHECKPOINT_HMAC_KEY_ID', origHmacKeyId);
      restoreEnvVar('AUDIT_CHECKPOINT_HMAC_VERIFY_KEYS', origVerifyKeys);
      restoreEnvVar('SESSION_SECRET', origSessionSecret);

      if (fs.existsSync(tempDiskDir)) {
        fs.rmSync(tempDiskDir, { recursive: true, force: true });
      }
      if (localServer) {
        localServer.closeAllConnections?.();
        await new Promise<void>((resolve) => localServer!.close(() => resolve()));
      }
    }

    if (cleanupFailure) {
      throw cleanupFailure;
    }
  }

  return results;
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectExecution) {
  runPhaseP13AuditChainSuite({ verboseRawDump: true })
    .then((results) => {
      const passedCount = results.filter((r) => r.passed && r.readAfterDeleteVerified).length;
      console.log('================================================================================');
      console.log(`PHASE P.1.3.2 — AUDIT INTEGRITY HARDENING SUITE: ${passedCount}/${results.length} PASSED`);
      console.log('================================================================================');
      for (const r of results) {
        console.log(
          `${r.passed && r.readAfterDeleteVerified ? 'PASS' : 'FAIL'} [${r.id}] ${r.title} | ${r.evidenceSummary} | RAD=${r.readAfterDeleteVerified}`
        );
      }
      if (passedCount !== results.length) {
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('Fatal error in P.1.3.2 audit suite:', err);
      process.exit(1);
    });
}
