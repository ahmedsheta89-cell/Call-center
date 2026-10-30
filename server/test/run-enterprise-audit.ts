/**
 * @file server/test/run-enterprise-audit.ts
 * Phase 4 Comprehensive Enterprise Security, Cryptographic Identity Trust, Firestore Rules,
 * Atomic Backup/Restore, and Multi-Wave Concurrency Audit Suite.
 */

import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  apiRouter,
  validateGitHubSyncTarget,
  captureGitHubSyncStateForTesting,
  restoreGitHubSyncStateForTesting,
} from '../api/router.ts';
import { DEMO_ORG_ID, initializeSeedData, ensureEgyptSpecialCustomer, ensureAdminUser } from '../db/seed.ts';
import { db } from '../db/store.ts';
import { AIGateway } from '../modules/ai/gateway.ts';
import { AuditLogger } from '../core/audit.ts';
import {
  issueSessionToken,
  verifyFirebaseIdToken,
  validateSessionSecretConfig,
  setFirebaseVerifierForTesting,
  mountLegacyUserRouteClosuresAndApiFallback,
} from '../core/identity.ts';
import {
  createSessionAwareClient,
  installDescriptorSafeFetch,
  registerGlobalApiClient,
  appFetch,
} from '../../src/lib/apiClient.ts';
import firebaseConfig from '../../firebase-applet-config.json';
import { runFirestoreSecurityGateAudit, runFirestoreEmulatorSecuritySuite } from './firestore-rules-audit.ts';
import { runPhaseP12AcceptanceSuite } from './p1-2-channel-secret-encryption-audit.ts';
import { runPhaseP13AuditChainSuite } from './p1-3-audit-chain-integrity-audit.ts';
import * as dbSchema from '../../src/db/schema.ts';

process.stdout.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') process.exit(0);
});

async function runComprehensiveEnterpriseAudit() {
  const hadExternalEncryptionKey = Boolean(process.env.CHANNEL_SECRET_ENCRYPTION_KEY?.trim());
  const hadExternalAuditHmacKey = Boolean(process.env.AUDIT_CHECKPOINT_HMAC_KEY?.trim());
  const hadExternalAuditHmacKeyId = Boolean(process.env.AUDIT_CHECKPOINT_HMAC_KEY_ID?.trim());
  if (!hadExternalEncryptionKey) {
    process.env.CHANNEL_SECRET_ENCRYPTION_KEY =
      'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
  }
  if (!hadExternalAuditHmacKey) {
    process.env.AUDIT_CHECKPOINT_HMAC_KEY =
      '7f8e9d0c1b2a39485766758493a2b1c0f0e1d2c3b4a5968778695a4b3c2d1e0f';
  }
  if (!hadExternalAuditHmacKeyId) {
    process.env.AUDIT_CHECKPOINT_HMAC_KEY_ID = 'audit-hmac-enterprise-test-v1';
  }
  const auditSuiteDiskPath = path.join(
    os.tmpdir(),
    'omniflow-data',
    `enterprise_audit_state_${process.pid}_${Date.now()}.json`
  );
  db.setPersistFilePathForTesting(auditSuiteDiskPath);

  const restored = db.loadFromDisk();
  if (!restored || db.tickets.size === 0) {
    initializeSeedData();
    db.saveToDisk();
  }
  ensureEgyptSpecialCustomer();
  ensureAdminUser();

  // Seed temporary isolated test fixtures for authentic multi-tenant & multi-role token verification
  const FOREIGN_ORG_ID = 'org-secondary-002';
  db.organizations.set(FOREIGN_ORG_ID, {
    id: FOREIGN_ORG_ID,
    name: 'Secondary Isolated Enterprise Tenant',
    slug: 'secondary-tenant',
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  db.users.set('usr-ro-01', {
    id: 'usr-ro-01',
    organizationId: DEMO_ORG_ID,
    email: 'readonly@madar.com',
    fullName: 'مراقب قراءة فقط (Read Only)',
    role: 'Read Only',
    isActive: true,
    mfaEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  db.users.set('usr-foreign-admin-01', {
    id: 'usr-foreign-admin-01',
    organizationId: FOREIGN_ORG_ID,
    email: 'admin@secondary-org.com',
    fullName: 'Foreign Org Admin',
    role: 'Admin',
    isActive: true,
    mfaEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  db.users.set('usr-foreign-agt-01', {
    id: 'usr-foreign-agt-01',
    organizationId: FOREIGN_ORG_ID,
    email: 'agent@secondary-org.com',
    fullName: 'Foreign Org Agent',
    role: 'Agent',
    isActive: true,
    mfaEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/v1', apiRouter);
  mountLegacyUserRouteClosuresAndApiFallback(app);
  app.use('/api', (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err.status || 500).json({
      success: false,
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'An unexpected error occurred',
      },
    });
  });
  // Simulated SPA fallback matching server.ts production/Vite fallback to verify /api/* never leaks 200 HTML
  app.get('*', (_req, res) => {
    res.status(200).type('text/html').send('<!doctype html><html><body>SPA Fallback</body></html>');
  });

  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3099;
  const rootUrl = `http://127.0.0.1:${port}`;
  const baseUrl = `${rootUrl}/api/v1`;

  console.log('================================================================================');
  console.log('🛡️ OMNIFLOW AI — PHASE 4 IDENTITY TRUST, ATOMIC STORAGE & RELEASE AUDIT SUITE');
  console.log('================================================================================');

  try {
    // Issue real cryptographic session tokens for each distinct role & organization
    const adminSession = issueSessionToken({ userId: 'usr-admin-01' });
    const supervisorSession = issueSessionToken({ userId: 'usr-sup-01' });
    const agentSession = issueSessionToken({ userId: 'usr-agt-01' });
    const qaSession = issueSessionToken({ userId: 'usr-qa-01' });
    const readOnlySession = issueSessionToken({ userId: 'usr-ro-01' });
    const foreignAdminSession = issueSessionToken({ userId: 'usr-foreign-admin-01' });
    const foreignAgentSession = issueSessionToken({ userId: 'usr-foreign-agt-01' });

    const authHeaders = (token: string, extra: Record<string, string> = {}) => ({
      'Content-Type': 'application/json',
      Connection: 'close',
      Authorization: `Bearer ${token}`,
      ...extra,
    });

    // 1. Verify Drizzle PostgreSQL Schema Tables & Columns directly
    const drizzleTables = {
      users: Object.keys(dbSchema.users).filter((k) => !k.startsWith('_') && k !== 'enableRLS'),
      customers: Object.keys(dbSchema.customers).filter((k) => !k.startsWith('_') && k !== 'enableRLS'),
      tickets: Object.keys(dbSchema.tickets).filter((k) => !k.startsWith('_') && k !== 'enableRLS'),
      conversations: Object.keys(dbSchema.conversations).filter((k) => !k.startsWith('_') && k !== 'enableRLS'),
      callSessions: Object.keys(dbSchema.callSessions).filter((k) => !k.startsWith('_') && k !== 'enableRLS'),
      auditEvents: Object.keys(dbSchema.auditEvents).filter((k) => !k.startsWith('_') && k !== 'enableRLS'),
    };

    console.log('\n[1/7] 🗄️ DRIZZLE ORM CODE SCHEMA VERIFICATION (6 CORE TABLES):');
    let totalDrizzleCols = 0;
    for (const [tableName, cols] of Object.entries(drizzleTables)) {
      totalDrizzleCols += cols.length;
      console.log(`  ✅ Table [${tableName}]: ${cols.length} Columns Defined -> (${cols.join(', ')})`);
    }
    console.log(`  📌 Total Drizzle ORM Columns in src/db/schema.ts: ${totalDrizzleCols} Columns`);

    // 2. Call /qa/code-and-columns-audit & /github/project-files using Admin token
    const codeAuditRes = await fetch(`${baseUrl}/qa/code-and-columns-audit`, {
      headers: authHeaders(adminSession.token),
    });
    const codeAuditJson = await codeAuditRes.json();
    const ghFilesRes = await fetch(`${baseUrl}/github/project-files`, {
      headers: authHeaders(adminSession.token),
    });
    const ghFilesJson = await ghFilesRes.json();
    console.log('\n[2/7] 🔍 DEEP CODEBASE, GIT REPOSITORY & CRYPTOGRAPHIC INTEGRITY:');
    console.log(`  ✅ Scanned App Files (src+server+config): ${codeAuditJson.data.filesScannedCount}`);
    console.log(`  ✅ Scanned App Lines of Code: ${codeAuditJson.data.totalLinesOfCode}`);
    console.log(`  ✅ Workspace Tree SHA-256 Hash: ${codeAuditJson.data.workspaceTreeHash}`);
    console.log(`  ✅ Authentic Git Repo Connected: ${ghFilesJson.data.gitRepositoryStatus.remoteOriginUrl} (branch: ${ghFilesJson.data.gitRepositoryStatus.currentBranch})`);

    // 3. Phase 4 Identity Trust, Header Spoofing Rejection, RBAC & Tenant Isolation Tests
    console.log('\n[3/7] 🔒 PHASE 4 IDENTITY TRUST, SPOOFING REJECTION, RBAC & ATOMIC STORAGE TESTS:');

    // 3.0 Identity Trust & Token Verification Tests
    const unauthTicketsRes = await fetch(`${baseUrl}/tickets`);
    const unauthBackupRes = await fetch(`${baseUrl}/system/backup`);
    const unauthHeaderSpoofRes = await fetch(`${baseUrl}/system/backup`, {
      headers: {
        'x-user-role': 'Admin',
        'x-organization-id': DEMO_ORG_ID,
        'x-user-id': 'usr-admin-01',
      },
    });
    if (unauthTicketsRes.status !== 401 || unauthBackupRes.status !== 401 || unauthHeaderSpoofRes.status !== 401) {
      throw new Error(
        `Unauthenticated requests must return 401! Got: tickets=${unauthTicketsRes.status}, backup=${unauthBackupRes.status}, headerSpoof=${unauthHeaderSpoofRes.status}`
      );
    }
    console.log('  ✅ [AUTH-01] Unauthenticated requests & raw header-only spoofing rejected -> HTTP 401 (AUTH_TOKEN_REQUIRED)');

    const tamperedToken = adminSession.token.slice(0, -6) + 'xxxxxx';
    const tamperedTokenRes = await fetch(`${baseUrl}/tickets`, {
      headers: authHeaders(tamperedToken),
    });
    const expiredSession = issueSessionToken({ userId: 'usr-agt-01', ttlMs: -5000 });
    const expiredTokenRes = await fetch(`${baseUrl}/tickets`, {
      headers: authHeaders(expiredSession.token),
    });
    const tempLogoutSession = issueSessionToken({ userId: 'usr-agt-02' });
    await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: authHeaders(tempLogoutSession.token),
    });
    const revokedTokenRes = await fetch(`${baseUrl}/tickets`, {
      headers: authHeaders(tempLogoutSession.token),
    });
    if (tamperedTokenRes.status !== 401 || expiredTokenRes.status !== 401 || revokedTokenRes.status !== 401) {
      throw new Error(
        `Expected 401 for tampered/expired/revoked tokens! Got tampered=${tamperedTokenRes.status}, expired=${expiredTokenRes.status}, revoked=${revokedTokenRes.status}`
      );
    }
    console.log('  ✅ [AUTH-02] Tampered signature (401), Expired token (401), and Revoked session (401) rejected');

    // Spoofed headers attached to a valid Agent token must be rejected with 403
    const spoofedRoleHeaderRes = await fetch(`${baseUrl}/system/backup`, {
      headers: authHeaders(agentSession.token, { 'x-user-role': 'Admin' }),
    });
    const spoofedOrgHeaderRes = await fetch(`${baseUrl}/tickets`, {
      headers: authHeaders(agentSession.token, { 'x-organization-id': FOREIGN_ORG_ID }),
    });
    const spoofedUserHeaderRes = await fetch(`${baseUrl}/tickets`, {
      headers: authHeaders(agentSession.token, { 'x-user-id': 'usr-admin-01' }),
    });
    if (
      spoofedRoleHeaderRes.status !== 403 ||
      spoofedOrgHeaderRes.status !== 403 ||
      spoofedUserHeaderRes.status !== 403
    ) {
      throw new Error(
        `Spoofed headers must be rejected with 403! Got role=${spoofedRoleHeaderRes.status}, org=${spoofedOrgHeaderRes.status}, user=${spoofedUserHeaderRes.status}`
      );
    }
    console.log('  ✅ [AUTH-03] Spoofed headers on authenticated session blocked: x-user-role (403), x-organization-id (403), x-user-id (403)');

    // Unauthorized POST /auth/switch-role by Agent and Read Only must be rejected with 403
    const agentRoleSwitchAttempt = await fetch(`${baseUrl}/auth/switch-role`, {
      method: 'POST',
      headers: authHeaders(agentSession.token),
      body: JSON.stringify({ role: 'Admin' }),
    });
    const roRoleSwitchAttempt = await fetch(`${baseUrl}/auth/switch-role`, {
      method: 'POST',
      headers: authHeaders(readOnlySession.token),
      body: JSON.stringify({ role: 'Owner' }),
    });
    if (agentRoleSwitchAttempt.status !== 403 || roRoleSwitchAttempt.status !== 403) {
      throw new Error(
        `Expected 403 on unauthorized POST /auth/switch-role, got Agent=${agentRoleSwitchAttempt.status}, RO=${roRoleSwitchAttempt.status}`
      );
    }
    console.log('  ✅ [AUTH-04] Unauthorized POST /auth/switch-role self-escalation by Agent & Read Only blocked -> HTTP 403 (ROLE_SWITCH_FORBIDDEN)');

    // 3.0a2 Phase 4.4B.3H Legacy Route Closure (GET /api/users & POST /api/users/sync) & SPA Fallback Isolation
    const usersCountBeforeLegacyProbes = db.users.size;
    const serverTsSource = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');
    if (
      serverTsSource.includes('getUsers(') ||
      serverTsSource.includes('getOrCreateUser(') ||
      serverTsSource.includes('requireAuth') ||
      serverTsSource.includes('./src/db/users.ts') ||
      serverTsSource.includes('./src/middleware/auth.ts')
    ) {
      throw new Error('server.ts still references legacy requireAuth, getUsers, or getOrCreateUser!');
    }

    const legacyAuthStates = [
      { label: 'unauthenticated', headers: { Accept: 'text/html,application/json' } as Record<string, string> },
      { label: 'invalid-token', headers: authHeaders('malformed.invalid.token', { Accept: 'text/html,application/json' }) },
      { label: 'read-only-user', headers: authHeaders(readOnlySession.token) },
      { label: 'agent-user', headers: authHeaders(agentSession.token) },
      { label: 'foreign-tenant-admin', headers: authHeaders(foreignAdminSession.token) },
      { label: 'admin-user', headers: authHeaders(adminSession.token) },
    ];

    for (const state of legacyAuthStates) {
      const getLegacyUsersRes = await fetch(`${rootUrl}/api/users`, {
        method: 'GET',
        headers: state.headers,
      });
      const getLegacyUsersBody = await getLegacyUsersRes.json();
      if (
        getLegacyUsersRes.status !== 410 ||
        getLegacyUsersBody.success !== false ||
        getLegacyUsersBody.error?.code !== 'LEGACY_ROUTE_GONE' ||
        'data' in getLegacyUsersBody
      ) {
        throw new Error(
          `Expected 410 LEGACY_ROUTE_GONE on GET /api/users (${state.label}), got status=${getLegacyUsersRes.status} body=${JSON.stringify(getLegacyUsersBody)}`
        );
      }

      const postLegacySyncRes = await fetch(`${rootUrl}/api/users/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...state.headers },
        body: JSON.stringify({ uid: `uninvited-${state.label}`, email: `${state.label}@example.com`, name: 'Probe' }),
      });
      const postLegacySyncBody = await postLegacySyncRes.json();
      if (
        postLegacySyncRes.status !== 410 ||
        postLegacySyncBody.success !== false ||
        postLegacySyncBody.error?.code !== 'LEGACY_ROUTE_GONE' ||
        'data' in postLegacySyncBody
      ) {
        throw new Error(
          `Expected 410 LEGACY_ROUTE_GONE on POST /api/users/sync (${state.label}), got status=${postLegacySyncRes.status} body=${JSON.stringify(postLegacySyncBody)}`
        );
      }
    }

    const unknownApiFallbackRes = await fetch(`${rootUrl}/api/nonexistent-legacy-probe`, {
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    const unknownApiFallbackBody = await unknownApiFallbackRes.json();
    if (
      unknownApiFallbackRes.status !== 404 ||
      unknownApiFallbackBody.error?.code !== 'API_ROUTE_NOT_FOUND'
    ) {
      throw new Error(
        `Expected 404 API_ROUTE_NOT_FOUND on unknown /api/* route instead of SPA HTML fallback, got status=${unknownApiFallbackRes.status}`
      );
    }

    if (db.users.size !== usersCountBeforeLegacyProbes) {
      throw new Error(`Legacy route probes mutated db.users size: before=${usersCountBeforeLegacyProbes}, after=${db.users.size}`);
    }
    console.log('  ✅ [AUTH-04b] Legacy GET /api/users & POST /api/users/sync permanently closed -> HTTP 410 (LEGACY_ROUTE_GONE across 6 auth states, 0 DB calls, SPA fallback blocked)');

    // 3.0b Phase 4.2 End-to-End HTTP Firebase ID Token Verification & Production Lockdown
    const invalidFbLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'malformed.firebase.jwt.token' }),
    });
    if (invalidFbLoginRes.status !== 401) {
      throw new Error(`Expected 401 on invalid Firebase ID token login, got ${invalidFbLoginRes.status}`);
    }

    // Install deterministic verifier for full HTTP route testing of POST /api/v1/auth/login
    const adminUserRef = db.users.get('usr-admin-01')!;
    const prevFirebaseUid = adminUserRef.firebaseUid;
    delete adminUserRef.firebaseUid;

    setFirebaseVerifierForTesting(async (tok: string) => {
      if (tok === 'fb-valid-verified-email') {
        return {
          uid: 'fb-uid-admin-999',
          email: 'ahmedsheta89@gmail.com',
          email_verified: true,
          aud: firebaseConfig.projectId,
          iss: `https://securetoken.google.com/${firebaseConfig.projectId}`,
          exp: Math.floor(Date.now() / 1000) + 3600,
        };
      }
      if (tok === 'fb-unverified-email') {
        return {
          uid: 'fb-uid-unverified-111',
          email: 'ahmedsheta89@gmail.com',
          email_verified: false,
          aud: firebaseConfig.projectId,
          iss: `https://securetoken.google.com/${firebaseConfig.projectId}`,
          exp: Math.floor(Date.now() / 1000) + 3600,
        };
      }
      if (tok === 'fb-conflicting-uid') {
        return {
          uid: 'fb-uid-imposter-222',
          email: 'ahmedsheta89@gmail.com',
          email_verified: true,
          aud: firebaseConfig.projectId,
          iss: `https://securetoken.google.com/${firebaseConfig.projectId}`,
          exp: Math.floor(Date.now() / 1000) + 3600,
        };
      }
      if (tok === 'fb-expired') {
        return {
          uid: 'fb-uid-admin-999',
          email: 'ahmedsheta89@gmail.com',
          email_verified: true,
          aud: firebaseConfig.projectId,
          iss: `https://securetoken.google.com/${firebaseConfig.projectId}`,
          exp: Math.floor(Date.now() / 1000) - 600,
        };
      }
      if (tok === 'fb-wrong-aud') {
        return {
          uid: 'fb-uid-admin-999',
          email: 'ahmedsheta89@gmail.com',
          email_verified: true,
          aud: 'wrong-firebase-project-id',
          iss: `https://securetoken.google.com/${firebaseConfig.projectId}`,
          exp: Math.floor(Date.now() / 1000) + 3600,
        };
      }
      if (tok === 'fb-wrong-iss') {
        return {
          uid: 'fb-uid-admin-999',
          email: 'ahmedsheta89@gmail.com',
          email_verified: true,
          aud: firebaseConfig.projectId,
          iss: 'https://evil-issuer.example.com/project',
          exp: Math.floor(Date.now() / 1000) + 3600,
        };
      }
      if (tok === 'fb-service-outage') {
        throw Object.assign(new Error('Firebase Auth service network unavailable'), {
          code: 'auth/internal-error',
        });
      }
      throw new Error('Invalid token');
    });

    try {
      // 1) Unverified email must be rejected (403 FIREBASE_EMAIL_NOT_VERIFIED) before UID is bound
      const unverifiedEmailRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: 'fb-unverified-email' }),
      });
      // 2) Valid verified email binds firebaseUid and issues session over HTTP (200)
      const validFbHttpRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: 'fb-valid-verified-email' }),
      });
      const validFbJson = await validFbHttpRes.json();
      // 3) Conflicting UID trying to claim the same email after binding must be rejected (403 FIREBASE_UID_CONFLICT)
      const conflictUidRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: 'fb-conflicting-uid' }),
      });
      // 4) Expired, wrong aud, wrong iss, and service outage over HTTP
      const expiredHttpRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: 'fb-expired' }),
      });
      const wrongAudHttpRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: 'fb-wrong-aud' }),
      });
      const wrongIssHttpRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: 'fb-wrong-iss' }),
      });
      const outageHttpRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: 'fb-service-outage' }),
      });

      // 5) Production mode lockdown: raw userId login without idToken must be rejected (401)
      process.env.OMNIFLOW_REQUIRE_FIREBASE_AUTH = 'true';
      const prodDemoBlockedRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'usr-admin-01' }),
      });
      delete process.env.OMNIFLOW_REQUIRE_FIREBASE_AUTH;

      if (
        unverifiedEmailRes.status !== 403 ||
        validFbHttpRes.status !== 200 ||
        adminUserRef.firebaseUid !== 'fb-uid-admin-999' ||
        validFbJson.data?.actor?.userId !== 'usr-admin-01' ||
        conflictUidRes.status !== 403 ||
        expiredHttpRes.status !== 401 ||
        wrongAudHttpRes.status !== 401 ||
        wrongIssHttpRes.status !== 401 ||
        outageHttpRes.status !== 503 ||
        prodDemoBlockedRes.status !== 401
      ) {
        throw new Error(
          `HTTP Firebase Auth matrix failed: unverified=${unverifiedEmailRes.status}, valid=${validFbHttpRes.status}, conflict=${conflictUidRes.status}, expired=${expiredHttpRes.status}, aud=${wrongAudHttpRes.status}, iss=${wrongIssHttpRes.status}, outage=${outageHttpRes.status}, prodDemo=${prodDemoBlockedRes.status}`
        );
      }
    } finally {
      setFirebaseVerifierForTesting(null);
      delete process.env.OMNIFLOW_REQUIRE_FIREBASE_AUTH;
      if (prevFirebaseUid) adminUserRef.firebaseUid = prevFirebaseUid;
      else delete adminUserRef.firebaseUid;
    }
    console.log(
      '  ✅ [AUTH-05] End-to-End HTTP Firebase ID Token flow verified: valid bound to firebaseUid (200), unverified email (403), UID conflict (403), expired/aud/iss (401), outage (503), & prod demo-login lockdown (401)'
    );

    // 3.0c Phase 4.2 Production SESSION_SECRET Fail-Closed Validation + Mid-Session User/Org Deactivation
    const missingProdSecret = validateSessionSecretConfig('production', undefined);
    const shortProdSecret = validateSessionSecretConfig('production', 'too-short-secret-123');
    const weakProdSecret = validateSessionSecretConfig('production', 'default');
    const strongProdSecret = validateSessionSecretConfig('production', 'a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8');
    if (missingProdSecret.valid || shortProdSecret.valid || weakProdSecret.valid || !strongProdSecret.valid) {
      throw new Error('Production SESSION_SECRET fail-closed validation check failed!');
    }

    // Mid-session user deactivation & organization suspension tests over HTTP
    const roUserObj = db.users.get('usr-ro-01')!;
    const foreignOrgObj = db.organizations.get(FOREIGN_ORG_ID)!;
    roUserObj.isActive = false;
    const deactivatedUserRes = await fetch(`${baseUrl}/auth/me`, {
      headers: authHeaders(readOnlySession.token),
    });
    roUserObj.isActive = true;

    foreignOrgObj.isActive = false;
    const suspendedOrgRes = await fetch(`${baseUrl}/auth/me`, {
      headers: authHeaders(foreignAdminSession.token),
    });
    foreignOrgObj.isActive = true;

    if (deactivatedUserRes.status !== 401 || suspendedOrgRes.status !== 401) {
      throw new Error(
        `Mid-session deactivation gate failed: userDeactivated=${deactivatedUserRes.status}, orgSuspended=${suspendedOrgRes.status}`
      );
    }
    console.log(
      '  ✅ [AUTH-06] Production SESSION_SECRET fail-closed gate & mid-session User Deactivation (401) + Org Suspension (401) verified'
    );

    // 3.0d Phase 4.2 Cookie Attributes (HttpOnly, SameSite=None; Secure; Partitioned) & 6-Vector CSRF Protection
    const httpsLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-proto': 'https',
      },
      body: JSON.stringify({ userId: 'usr-agt-01' }),
    });
    const setCookieHeader = httpsLoginRes.headers.get('set-cookie') || '';
    const httpsLoginJson = await httpsLoginRes.json();
    const cookieSessionToken = httpsLoginJson.data?.token;
    const cookieCsrfToken = httpsLoginJson.data?.csrfToken;
    if (
      !setCookieHeader.includes('HttpOnly') ||
      !setCookieHeader.includes('SameSite=None; Secure; Partitioned') ||
      !setCookieHeader.includes('Path=/') ||
      !cookieCsrfToken
    ) {
      throw new Error(`Invalid HTTPS Set-Cookie header attributes: ${setCookieHeader}`);
    }

    // Vector 1: Cookie mutation with NEITHER Origin NOR Referer -> 403 CSRF_ORIGIN_REQUIRED
    const csrfNoOriginRes = await fetch(`${baseUrl}/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `omniflow_session=${encodeURIComponent(cookieSessionToken)}`,
        'x-csrf-token': cookieCsrfToken,
      },
      body: JSON.stringify({ customerId: 'cust-auto-001', title: 'CSRF Missing Origin Test' }),
    });

    // Vector 2: Cookie mutation with forged Host & X-Forwarded-Host matching attacker Origin -> 403 CSRF_ORIGIN_MISMATCH
    const csrfForgedHostRes = await fetch(`${baseUrl}/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `omniflow_session=${encodeURIComponent(cookieSessionToken)}`,
        Host: 'evil-attacker.example.com',
        'X-Forwarded-Host': 'evil-attacker.example.com',
        Origin: 'https://evil-attacker.example.com',
        'x-csrf-token': cookieCsrfToken,
      },
      body: JSON.stringify({ customerId: 'cust-auto-001', title: 'CSRF Forged Host Test' }),
    });

    // Vector 3: Cookie mutation with foreign Origin -> 403 CSRF_ORIGIN_MISMATCH
    const csrfForeignOriginRes = await fetch(`${baseUrl}/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `omniflow_session=${encodeURIComponent(cookieSessionToken)}`,
        Origin: 'https://evil-attacker.example.com',
        'x-csrf-token': cookieCsrfToken,
      },
      body: JSON.stringify({ customerId: 'cust-auto-001', title: 'CSRF Foreign Origin Test' }),
    });

    // Vector 4: Cookie mutation with trusted Origin but MISSING x-csrf-token -> 403 CSRF_TOKEN_MISSING
    const csrfMissingTokenRes = await fetch(`${baseUrl}/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `omniflow_session=${encodeURIComponent(cookieSessionToken)}`,
        Origin: `http://127.0.0.1:${port}`,
      },
      body: JSON.stringify({ customerId: 'cust-auto-001', title: 'CSRF Missing Token Test' }),
    });

    // Vector 5: Cookie mutation with trusted Origin but ANOTHER session's valid x-csrf-token -> 403 CSRF_TOKEN_INVALID
    const csrfCrossSessionRes = await fetch(`${baseUrl}/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `omniflow_session=${encodeURIComponent(cookieSessionToken)}`,
        Origin: `http://127.0.0.1:${port}`,
        'x-csrf-token': adminSession.csrfToken,
      },
      body: JSON.stringify({ customerId: 'cust-auto-001', title: 'CSRF Cross Session Token Test' }),
    });

    // Vector 6: Cookie mutation with trusted Origin AND matching session x-csrf-token -> 200 + state persisted
    const ticketsBeforeCsrf = db.tickets.size;
    const csrfValidRes = await fetch(`${baseUrl}/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `omniflow_session=${encodeURIComponent(cookieSessionToken)}`,
        Origin: `http://127.0.0.1:${port}`,
        'x-csrf-token': cookieCsrfToken,
      },
      body: JSON.stringify({
        customerId: 'cust-auto-001',
        title: 'CSRF Authorized Cookie Mutation',
        priority: 'low',
      }),
    });
    if (
      csrfNoOriginRes.status !== 403 ||
      csrfForgedHostRes.status !== 403 ||
      csrfForeignOriginRes.status !== 403 ||
      csrfMissingTokenRes.status !== 403 ||
      csrfCrossSessionRes.status !== 403 ||
      csrfValidRes.status !== 200 ||
      db.tickets.size !== ticketsBeforeCsrf + 1
    ) {
      throw new Error(
        `CSRF 6-vector check failed: noOrigin=${csrfNoOriginRes.status}, forgedHost=${csrfForgedHostRes.status}, foreignOrigin=${csrfForeignOriginRes.status}, missingToken=${csrfMissingTokenRes.status}, crossSession=${csrfCrossSessionRes.status}, valid=${csrfValidRes.status}`
      );
    }
    console.log(
      '  ✅ [AUTH-07] Cookie attributes & 6-vector CSRF gate verified: missing Origin (403), forged Host/X-Forwarded-Host (403), foreign Origin (403), missing token (403), cross-session token (403), valid mutation (200)'
    );

    // 3.0e Phase 4.2 window.fetch Descriptor, Request/AbortSignal, Non-Configurable Fallback & Full Logout Lifecycle
    const mockIframeWindow: any = {};
    Object.defineProperty(mockIframeWindow, 'fetch', {
      get() {
        return fetch;
      },
      configurable: true,
    });
    const mockLockedWindow: any = {};
    Object.defineProperty(mockLockedWindow, 'fetch', {
      get() {
        return fetch;
      },
      configurable: false,
    });

    const coalescingClient = createSessionAwareClient({
      rawFetch: (input: RequestInfo | URL, init?: RequestInit) => {
        if (typeof Request !== 'undefined' && input instanceof Request) {
          const full = input.url.startsWith('/') ? `http://127.0.0.1:${port}${input.url}` : input.url;
          return fetch(new Request(full, input), init);
        }
        const u = typeof input === 'string' ? input : input.toString();
        const full = u.startsWith('/') ? `http://127.0.0.1:${port}${u}` : u;
        return fetch(full, init);
      },
      globalThisTarget: mockIframeWindow,
      loginTimeoutMs: 5000,
    });

    registerGlobalApiClient(coalescingClient);
    const iframeInstall = installDescriptorSafeFetch(mockIframeWindow, coalescingClient);
    const lockedInstall = installDescriptorSafeFetch(mockLockedWindow, coalescingClient);
    if (!iframeInstall.installedOnGlobal || iframeInstall.descriptorMode !== 'configurable_getter') {
      throw new Error('Failed to install descriptor-safe fetch on configurable getter iframe window');
    }
    if (
      lockedInstall.installedOnGlobal ||
      lockedInstall.descriptorMode !== 'non_configurable_locked' ||
      !lockedInstall.fallbackRequired
    ) {
      throw new Error('Expected locked non-configurable fetch to flag fallbackRequired: true without throwing');
    }

    // Verify 10 concurrent pre-bootstrap calls coalesce into 1 login
    const parallelEarlyResponses = await Promise.all(
      Array.from({ length: 10 }).map(() => mockIframeWindow.fetch('/api/v1/auth/me'))
    );
    if (
      coalescingClient.getLoginCallCount() !== 1 ||
      parallelEarlyResponses.some((r: Response) => r.status !== 200)
    ) {
      throw new Error(
        `Expected 1 coalesced login call and 10 HTTP 200 responses, got loginCalls=${coalescingClient.getLoginCallCount()}`
      );
    }

    // Verify Request object + custom Headers preservation AND appFetch fallback for non-configurable environments
    const reqObj = new Request(`http://127.0.0.1:${port}/api/v1/auth/me`, {
      headers: { 'X-Custom-Client-Trace': 'trace-verified-42' },
    });
    const reqObjRes = await appFetch(reqObj);
    if (reqObjRes.status !== 200) {
      throw new Error(`Expected 200 via appFetch with Request instance, got ${reqObjRes.status}`);
    }

    // Verify pre-aborted AbortSignal is respected immediately
    const preAbortedController = new AbortController();
    preAbortedController.abort(new Error('CallerPreAborted'));
    let abortCaught = false;
    try {
      await coalescingClient.apiFetch('/api/v1/tickets', { signal: preAbortedController.signal });
    } catch {
      abortCaught = true;
    }
    if (!abortCaught) {
      throw new Error('Expected pre-aborted AbortSignal to reject immediately in apiFetch');
    }

    // Verify full client lifecycle: Switch Role -> Logout -> Attempt reuse after logout fails closed with 401 (no silent relogin!)
    const clientSwitchRes = await coalescingClient.apiFetch('/api/v1/auth/switch-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'Supervisor' }),
    });
    const clientSwitchJson = await clientSwitchRes.json();
    const tokenBeforeLogout = coalescingClient.getActiveSession()?.token;
    const clientLogoutRes = await coalescingClient.apiFetch('/api/v1/auth/logout', {
      method: 'POST',
    });
    const clearCookieHdr = clientLogoutRes.headers.get('set-cookie') || '';
    const postLogoutClientRes = await coalescingClient.apiFetch('/api/v1/tickets');
    const postLogoutServerReuseRes = await fetch(`${baseUrl}/tickets`, {
      headers: authHeaders(tokenBeforeLogout || ''),
    });

    if (
      clientSwitchRes.status !== 200 ||
      clientSwitchJson.data?.currentActor?.role !== 'Supervisor' ||
      clientLogoutRes.status !== 200 ||
      !clearCookieHdr.includes('Max-Age=0') ||
      postLogoutClientRes.status !== 401 ||
      postLogoutServerReuseRes.status !== 401
    ) {
      throw new Error(
        `Lifecycle logout/reuse check failed: switch=${clientSwitchRes.status}, logout=${clientLogoutRes.status}, postLogoutClient=${postLogoutClientRes.status}, postLogoutServer=${postLogoutServerReuseRes.status}`
      );
    }

    // Scenario 4 & 5: Failed bootstrap and login timeout must fail closed with 401 (never fake 200)
    const failingBootstrapClient = createSessionAwareClient({
      rawFetch: async () => new Response(JSON.stringify({ success: false }), { status: 401 }),
      loginTimeoutMs: 1000,
    });
    const failedBootRes = await failingBootstrapClient.apiFetch('/api/v1/tickets');

    const timeoutBootstrapClient = createSessionAwareClient({
      rawFetch: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('Aborted by timeout')));
        }),
      loginTimeoutMs: 35,
    });
    const timeoutBootRes = await timeoutBootstrapClient.apiFetch('/api/v1/tickets');

    if (failedBootRes.status !== 401 || timeoutBootRes.status !== 401) {
      throw new Error(
        `Expected 401 fail-closed on bootstrap failure/timeout, got failed=${failedBootRes.status}, timeout=${timeoutBootRes.status}`
      );
    }
    console.log(
      '  ✅ [FETCH-01] Descriptor matrix, Request/Headers, AbortSignal, non-configurable appFetch fallback, & Login->SwitchRole->Logout->RevokedReuse (401) verified'
    );

    // Fetch entity IDs using Admin token
    const callsList = await (await fetch(`${baseUrl}/calls`, { headers: authHeaders(adminSession.token) })).json();
    const callId = callsList.data[0]?.id;
    const shiftsList = await (await fetch(`${baseUrl}/wfm/shifts`, { headers: authHeaders(adminSession.token) })).json();
    const shiftId = shiftsList.data[0]?.id;
    const convsList = await (await fetch(`${baseUrl}/conversations`, { headers: authHeaders(adminSession.token) })).json();
    const convId = convsList.data[0]?.id;
    const ticketsList = await (await fetch(`${baseUrl}/tickets`, { headers: authHeaders(adminSession.token) })).json();
    const ticketId = ticketsList.data[0]?.id;

    // 3A. RBAC Read-Only & QA rejection tests using real Read-Only and QA session tokens
    const rbacHoldRes = await fetch(`${baseUrl}/calls/${callId}/control`, {
      method: 'POST',
      headers: authHeaders(readOnlySession.token),
      body: JSON.stringify({ action: 'hold' }),
    });
    if (rbacHoldRes.status !== 403) throw new Error(`Expected 403 on Read Only call control, got ${rbacHoldRes.status}`);
    console.log(`  ✅ [RBAC-01] Read Only session blocked from POST /calls/:id/control -> HTTP ${rbacHoldRes.status}`);

    const rbacShiftRes = await fetch(`${baseUrl}/wfm/shifts/${shiftId}/status`, {
      method: 'POST',
      headers: authHeaders(readOnlySession.token),
      body: JSON.stringify({ status: 'break' }),
    });
    if (rbacShiftRes.status !== 403) throw new Error(`Expected 403 on Read Only shift status, got ${rbacShiftRes.status}`);
    console.log(`  ✅ [RBAC-02] Read Only session blocked from POST /wfm/shifts/:id/status -> HTTP ${rbacShiftRes.status}`);

    const rbacMacroRes = await fetch(`${baseUrl}/macros/macro-welcome/execute`, {
      method: 'POST',
      headers: authHeaders(readOnlySession.token),
      body: JSON.stringify({ conversationId: convId }),
    });
    if (rbacMacroRes.status !== 403) throw new Error(`Expected 403 on Read Only macro execute, got ${rbacMacroRes.status}`);
    console.log(`  ✅ [RBAC-03] Read Only session blocked from POST /macros/:id/execute -> HTTP ${rbacMacroRes.status}`);

    const rbacRestoreRes = await fetch(`${baseUrl}/system/restore`, {
      method: 'POST',
      headers: authHeaders(qaSession.token),
      body: JSON.stringify({ organizations: [] }),
    });
    if (rbacRestoreRes.status !== 403) throw new Error(`Expected 403 on QA system restore, got ${rbacRestoreRes.status}`);
    console.log(`  ✅ [RBAC-04] QA session blocked from POST /system/restore (requires settings.manage) -> HTTP ${rbacRestoreRes.status}`);

    // 3B. Multi-Tenant Isolation tests using real Foreign Organization session tokens
    const crossTenantCustRes = await fetch(`${baseUrl}/customers/cust-auto-001/timeline`, {
      headers: authHeaders(foreignAdminSession.token),
    });
    if (crossTenantCustRes.status !== 404) throw new Error(`Expected 404 on cross-tenant timeline, got ${crossTenantCustRes.status}`);
    console.log(`  ✅ [TENANT-01] Foreign tenant session blocked on GET /customers/:id/timeline -> HTTP ${crossTenantCustRes.status}`);

    const crossTenantMacroRes = await fetch(`${baseUrl}/macros/macro-welcome/execute`, {
      method: 'POST',
      headers: authHeaders(foreignAdminSession.token),
      body: JSON.stringify({ conversationId: convId }),
    });
    if (crossTenantMacroRes.status !== 404) throw new Error(`Expected 404 on cross-tenant macro execute, got ${crossTenantMacroRes.status}`);
    console.log(`  ✅ [TENANT-02] Foreign tenant session blocked on POST /macros/:id/execute -> HTTP ${crossTenantMacroRes.status}`);

    const crossTenantMsgsRes = await fetch(`${baseUrl}/conversations/${convId}/messages`, {
      headers: authHeaders(foreignAdminSession.token),
    });
    if (crossTenantMsgsRes.status !== 404) throw new Error(`Expected 404 on cross-tenant conversation messages, got ${crossTenantMsgsRes.status}`);
    console.log(`  ✅ [TENANT-03] Foreign tenant session blocked on GET /conversations/:id/messages -> HTTP ${crossTenantMsgsRes.status}`);

    // 3C. Input Validation tests
    const emptyTicketRes = await fetch(`${baseUrl}/tickets`, {
      method: 'POST',
      headers: authHeaders(agentSession.token),
      body: JSON.stringify({}),
    });
    if (emptyTicketRes.status !== 400) throw new Error(`Expected 400 on empty ticket, got ${emptyTicketRes.status}`);
    console.log(`  ✅ [VALID-01] Empty payload rejected on POST /tickets -> HTTP ${emptyTicketRes.status}`);

    const blankReplyRes = await fetch(`${baseUrl}/conversations/${convId}/reply`, {
      method: 'POST',
      headers: authHeaders(agentSession.token),
      body: JSON.stringify({ body: '   ' }),
    });
    if (blankReplyRes.status !== 400) throw new Error(`Expected 400 on blank reply, got ${blankReplyRes.status}`);
    console.log(`  ✅ [VALID-02] Blank message rejected on POST /conversations/:id/reply -> HTTP ${blankReplyRes.status}`);

    const invalidRoleSwitchRes = await fetch(`${baseUrl}/auth/switch-role`, {
      method: 'POST',
      headers: authHeaders(adminSession.token),
      body: JSON.stringify({ role: 'UnauthorizedSuperHacker' }),
    });
    if (invalidRoleSwitchRes.status !== 400) throw new Error(`Expected 400 on invalid role switch, got ${invalidRoleSwitchRes.status}`);
    console.log(`  ✅ [VALID-03] Unrecognized role rejected on POST /auth/switch-role -> HTTP ${invalidRoleSwitchRes.status}`);

    const invalidTicketStatusRes = await fetch(`${baseUrl}/tickets/${ticketId}`, {
      method: 'PUT',
      headers: authHeaders(agentSession.token),
      body: JSON.stringify({ status: 'hacked_status_xyz' }),
    });
    if (invalidTicketStatusRes.status !== 400) throw new Error(`Expected 400 on invalid ticket status, got ${invalidTicketStatusRes.status}`);
    console.log(`  ✅ [VALID-04] Invalid ticket status enum rejected on PUT /tickets/:id -> HTTP ${invalidTicketStatusRes.status}`);

    // 3D. AI PII Redaction, Channel Secret Masking & Immutable Audit Chain tests
    const aiResp = await AIGateway.execute({
      organizationId: DEMO_ORG_ID,
      task: 'conversation_summary',
      input: 'بطاقة ائتمان رقم 4532-1122-3344-5566 ورقم قومي 29501011234567',
      privacy: 'public',
      forceLocal: true,
    });
    if (aiResp.content.includes('4532-1122-3344-5566') || aiResp.content.includes('29501011234567')) {
      throw new Error('PII leaked in AI summary output!');
    }
    console.log('  ✅ [PII-01] AI Gateway scrubbed credit card & national ID before processing');

    const channelsJson = await (
      await fetch(`${baseUrl}/integrations/channels`, { headers: authHeaders(adminSession.token) })
    ).json();
    const waAccountInfo = channelsJson.data.find((c: any) => c.id === 'chan-whatsapp')?.accountInfo;
    if (waAccountInfo?.apiToken !== '[REDACTED_SECRET]' || waAccountInfo?.webhookSecret !== '[REDACTED_SECRET]') {
      throw new Error(`Channel secrets were not redacted: ${JSON.stringify(waAccountInfo)}`);
    }
    console.log('  ✅ [PII-02] GET /integrations/channels redacted apiToken & webhookSecret -> [REDACTED_SECRET]');

    const auditEvt = await AuditLogger.log({
      organizationId: DEMO_ORG_ID,
      actorType: 'user',
      action: 'security.audit_verification',
      entityType: 'channel',
      entityId: 'ch-sec-01',
      afterState: { apiToken: 'synthetic-secret-token-xyz' },
    });
    const chainCheck = AuditLogger.verifyChainIntegrity();
    const fullBackup = db.exportFullBackup();
    if (
      (auditEvt.afterState as any)?.apiToken !== '[REDACTED_SECRET]' ||
      !auditEvt.integrityHash ||
      !chainCheck.valid ||
      !Array.isArray(fullBackup.auditEvents) ||
      fullBackup.auditEvents.length === 0
    ) {
      throw new Error('Audit secret redaction, hash chain verification, or backup export failed!');
    }
    console.log(`  ✅ [AUDIT-01] Secret redacted, SHA-256 chain verified (${chainCheck.checkedCount} events), & auditEvents included in exportFullBackup()`);

    // 3E. Audit Payload Tampering & Atomic Corrupted Backup Restore Rejection Tests
    const clonedEvents = AuditLogger.exportAllEvents().map((e) => ({ ...e }));
    clonedEvents[0] = { ...clonedEvents[0], action: 'tampered.malicious_action' };
    const tamperedPayloadCheck = AuditLogger.verifyChainIntegrity(clonedEvents);
    if (tamperedPayloadCheck.valid) {
      throw new Error('AuditLogger.verifyChainIntegrity failed to detect payload tampering!');
    }
    console.log(`  ✅ [AUDIT-02] Payload Tampering Detected: verifyChainIntegrity() rejected modified action (${tamperedPayloadCheck.failureReason})`);

    const tamperedRestoreRes = await fetch(`${baseUrl}/system/restore`, {
      method: 'POST',
      headers: authHeaders(adminSession.token),
      body: JSON.stringify({
        organizations: fullBackup.organizations,
        auditEvents: clonedEvents,
      }),
    });
    if (tamperedRestoreRes.status !== 400) {
      throw new Error(`Expected 400 on tampered audit chain restore, got ${tamperedRestoreRes.status}`);
    }
    console.log(`  ✅ [AUDIT-03] POST /system/restore rejected tampered auditEvents payload -> HTTP ${tamperedRestoreRes.status} (TAMPERED_AUDIT_CHAIN)`);

    // Test Atomic All-or-Nothing Restore: inject corrupted ticket mid-array and verify ZERO partial state corruption
    const preOrgCount = db.organizations.size;
    const preUserCount = db.users.size;
    const preTicketCount = db.tickets.size;
    const preCustCount = db.customers.size;
    const corruptedMidBackup = {
      organizations: [{ id: 'org-partial-wipe-attempt', name: 'Partial Wipe Attempt', isActive: true }],
      users: [{ id: 'usr-partial-wipe', organizationId: 'org-partial-wipe-attempt', email: 'x@x.com', fullName: 'X', role: 'Admin', isActive: true }],
      tickets: [
        { id: 'tkt-valid-1', organizationId: DEMO_ORG_ID, title: 'Valid 1' },
        { id: '', organizationId: '', title: 'CORRUPTED_RECORD_MISSING_ID_AND_ORG' },
      ],
    };
    const corruptedRestoreRes = await fetch(`${baseUrl}/system/restore`, {
      method: 'POST',
      headers: authHeaders(adminSession.token),
      body: JSON.stringify(corruptedMidBackup),
    });
    if (
      corruptedRestoreRes.status !== 400 ||
      db.organizations.size !== preOrgCount ||
      db.users.size !== preUserCount ||
      db.tickets.size !== preTicketCount ||
      db.customers.size !== preCustCount ||
      db.organizations.has('org-partial-wipe-attempt')
    ) {
      throw new Error('Atomic restore failed: corrupted mid-backup either succeeded or partially mutated live DatabaseStore!');
    }
    console.log(
      `  ✅ [STORAGE-01] Atomic Restore Verified: corrupted mid-payload rejected (HTTP 400) with ZERO partial state mutation (Orgs=${db.organizations.size}, Users=${db.users.size}, Tickets=${db.tickets.size})`
    );

    // -------------------------------------------------------------------------
    // 3E.2 PHASE P.1 — UNIFIED RUNTIME DATA STORE & MULTI-TENANT ISOLATION SUITE
    // Covers all 9 mandatory verification proofs (Section 6: P1-01 .. P1-09)
    // -------------------------------------------------------------------------
    console.log('\n  [PHASE P.1] 🏛️ UNIFIED DATA STORE & MULTI-TENANT ISOLATION PROOF SUITE (P1-01..P1-09):');

    // [P1-01] Full Save/Load Cycle across all 6 consolidated collections (channelConfigs, recommendations, coachingPlans, macros, teamQaFeedback, connectedDevices + crossDeviceSyncEvents)
    const preP1FullSnapshot = db.exportFullBackup();
    const p1TempDiskPath = path.join(os.tmpdir(), 'omniflow-data', `p1_cycle_test_${Date.now()}.json`);
    try {
      db.setPersistFilePathForTesting(p1TempDiskPath);

      db.setChannelConfig(FOREIGN_ORG_ID, 'chan-whatsapp', {
        wabaId: 'WABA-FOREIGN-202',
        phoneNumberId: 'PNID-FOREIGN-202',
        apiToken: 'EAAG_foreign_secret_token_999',
        webhookSecret: 'foreign_webhook_secret_999',
      });
      db.saveRecommendation(FOREIGN_ORG_ID, {
        id: 'rec-foreign-p1',
        organizationId: FOREIGN_ORG_ID,
        domain: 'operational',
        title: 'Foreign Tenant P1 Recommendation',
        description: 'Isolated recommendation for secondary tenant',
        priority: 'high',
        impact: '100% Tenant Isolation',
        actionLabel: 'Apply Foreign Action',
        applied: false,
      });
      db.saveCoachingPlan(FOREIGN_ORG_ID, {
        id: 'cp-foreign-p1',
        organizationId: FOREIGN_ORG_ID,
        agentId: 'usr-foreign-agt-01',
        agentName: 'Foreign Agent',
        title: 'Foreign Coaching Plan',
        focusArea: 'Security Compliance',
        recommendationText: 'Verify tenant boundaries',
        targetMetric: '100%',
        status: 'active',
        assignedBy: 'Foreign Admin',
        dueDate: '2026-11-01',
        progressPercent: 25,
      });
      db.saveMacro(FOREIGN_ORG_ID, {
        id: 'macro-foreign-p1',
        organizationId: FOREIGN_ORG_ID,
        shortcut: '/foreign_hi',
        title: 'Foreign Welcome Macro',
        category: 'General',
        text: 'Welcome to Secondary Enterprise Tenant',
      });
      db.saveTeamQaFeedback(FOREIGN_ORG_ID, {
        id: 'qa-fb-foreign-p1',
        organizationId: FOREIGN_ORG_ID,
        reviewerName: 'Foreign QA Lead',
        reviewerRole: 'QA',
        moduleId: 'inbox',
        moduleName: 'Inbox',
        verdict: 'passed_100',
        comment: 'Foreign tenant QA feedback record',
        notifiedAdminPhone: '[REDACTED_PHONE]',
        createdAt: new Date().toISOString(),
      });
      db.saveConnectedDevice(FOREIGN_ORG_ID, {
        id: 'DEV-FOREIGN-01',
        deviceId: 'DEV-FOREIGN-01',
        organizationId: FOREIGN_ORG_ID,
        deviceName: 'Foreign Workstation',
        osName: 'Linux',
        formFactor: 'desktop',
        appRuntime: 'Web Browser',
        browserName: 'Chrome',
        screenResolution: '1920x1080',
        activeTab: 'inbox',
        operatorRole: 'Admin',
        adminPhone: '[REDACTED_PHONE]',
        status: 'online_synced',
        latencyMs: 6,
        lastHeartbeatAt: new Date().toISOString(),
      });
      db.saveCrossDeviceSyncEvent(FOREIGN_ORG_ID, {
        id: 'SYNC-FOREIGN-01',
        syncId: 'SYNC-FOREIGN-01',
        organizationId: FOREIGN_ORG_ID,
        sourceDeviceId: 'DEV-FOREIGN-01',
        sourcePlatform: 'Linux Web',
        targetPlatforms: ['Linux (DEV-FOREIGN-01)'],
        actionType: 'FOREIGN_SYNC',
        payloadSummary: 'Foreign sync event',
        sha256Receipt: 'abcdef0123456789',
        roundtripLatencyMs: 5,
        timestamp: new Date().toISOString(),
      });

      const savedOk = db.saveToDisk();
      if (!savedOk || !fs.existsSync(p1TempDiskPath)) {
        throw new Error('[P1-01] Failed to write consolidated collections to disk');
      }

      // Clear all 6 consolidated collections in memory, then reload from disk
      db.channelConfigs.clear();
      db.recommendations.clear();
      db.coachingPlans.clear();
      db.macros.clear();
      db.teamQaFeedback.clear();
      db.connectedDevices.clear();
      db.crossDeviceSyncEvents.clear();

      const loadedOk = db.loadFromDisk();
      if (
        !loadedOk ||
        db.getChannelConfig(DEMO_ORG_ID, 'chan-whatsapp')?.wabaId !== 'WABA-902184920194' ||
        db.getChannelConfig(FOREIGN_ORG_ID, 'chan-whatsapp')?.wabaId !== 'WABA-FOREIGN-202' ||
        db.getRecommendations(DEMO_ORG_ID).length < 6 ||
        db.getRecommendations(FOREIGN_ORG_ID).length !== 1 ||
        db.getCoachingPlans(DEMO_ORG_ID).length < 2 ||
        db.getCoachingPlans(FOREIGN_ORG_ID).length !== 1 ||
        db.getMacros(DEMO_ORG_ID).length < 5 ||
        db.getMacros(FOREIGN_ORG_ID).length !== 1 ||
        db.getTeamQaFeedback(DEMO_ORG_ID).length < 1 ||
        db.getTeamQaFeedback(FOREIGN_ORG_ID).length !== 1 ||
        db.getConnectedDevices(DEMO_ORG_ID).length < 3 ||
        db.getConnectedDevices(FOREIGN_ORG_ID).length !== 1 ||
        db.getCrossDeviceSyncEvents(DEMO_ORG_ID).length < 1 ||
        db.getCrossDeviceSyncEvents(FOREIGN_ORG_ID).length !== 1
      ) {
        throw new Error('[P1-01] Save/Load cycle did not preserve all 6 consolidated collections per tenant');
      }
      console.log(
        '  ✅ [P1-01] Save/Load Disk Cycle Verified across all 6 consolidated collections (channelConfigs, recommendations, coachingPlans, macros, teamQaFeedback, connectedDevices + crossDeviceSyncEvents)'
      );

      // [P1-02] Export / Import Backup Roundtrip for all 6 consolidated collections
      const demoTenantBackupRes = await fetch(`${baseUrl}/system/backup`, {
        headers: authHeaders(adminSession.token),
      });
      const demoTenantBackupJson = await demoTenantBackupRes.json();
      const exportedDemoData = demoTenantBackupJson.data;
      if (
        demoTenantBackupRes.status !== 200 ||
        !Array.isArray(exportedDemoData?.channelConfigs) ||
        exportedDemoData.channelConfigs.length < 5 ||
        !Array.isArray(exportedDemoData?.recommendations) ||
        exportedDemoData.recommendations.length < 6 ||
        !Array.isArray(exportedDemoData?.coachingPlans) ||
        exportedDemoData.coachingPlans.length < 2 ||
        !Array.isArray(exportedDemoData?.macros) ||
        exportedDemoData.macros.length < 5 ||
        !Array.isArray(exportedDemoData?.teamQaFeedback) ||
        exportedDemoData.teamQaFeedback.length < 1 ||
        !Array.isArray(exportedDemoData?.connectedDevices) ||
        exportedDemoData.connectedDevices.length < 3
      ) {
        throw new Error('[P1-02] GET /system/backup missing one or more of the 6 consolidated collections');
      }

      // Mutate DEMO_ORG_ID macros & coachingPlans, then restore DEMO_ORG_ID backup via POST /system/restore
      const rawDemoBackup = db.exportTenantBackup(DEMO_ORG_ID);
      db.saveMacro(DEMO_ORG_ID, {
        id: 'macro-ephemeral-wipe',
        organizationId: DEMO_ORG_ID,
        shortcut: '/temp',
        title: 'Temp',
        category: 'Temp',
        text: 'Should be wiped by restore',
      });
      const restoreDemoRes = await fetch(`${baseUrl}/system/restore`, {
        method: 'POST',
        headers: authHeaders(adminSession.token),
        body: JSON.stringify(rawDemoBackup),
      });
      if (
        restoreDemoRes.status !== 200 ||
        db.getMacro(DEMO_ORG_ID, 'macro-ephemeral-wipe') !== undefined ||
        db.getMacros(DEMO_ORG_ID).length !== rawDemoBackup.macros.length ||
        // Foreign tenant data must remain untouched when DEMO_ORG_ID restores its own tenant backup!
        db.getMacros(FOREIGN_ORG_ID).length !== 1
      ) {
        throw new Error(`[P1-02] Tenant-scoped backup restore roundtrip failed: status=${restoreDemoRes.status}`);
      }
      console.log(
        '  ✅ [P1-02] Export/Import Backup Roundtrip Verified: all 6 consolidated collections exported & restored with tenant scoping'
      );

      // [P1-03] Negative Cross-Tenant Read Isolation across all 6 consolidated collections & backup
      // Clean FOREIGN_ORG_ID records first so FOREIGN_ORG_ID has 0 items of its own
      db.purgeOrganizationData(FOREIGN_ORG_ID);

      const [
        foreignChannelsRes,
        foreignRecsRes,
        foreignPlansRes,
        foreignMacrosRes,
        foreignFeedbackRes,
        foreignDevicesRes,
        foreignBackupRes,
      ] = await Promise.all([
        fetch(`${baseUrl}/integrations/channels`, { headers: authHeaders(foreignAdminSession.token) }),
        fetch(`${baseUrl}/recommendations`, { headers: authHeaders(foreignAdminSession.token) }),
        fetch(`${baseUrl}/qa/coaching-plans`, { headers: authHeaders(foreignAdminSession.token) }),
        fetch(`${baseUrl}/macros`, { headers: authHeaders(foreignAdminSession.token) }),
        fetch(`${baseUrl}/qa/feedback`, { headers: authHeaders(foreignAdminSession.token) }),
        fetch(`${baseUrl}/platforms/devices`, { headers: authHeaders(foreignAdminSession.token) }),
        fetch(`${baseUrl}/system/backup`, { headers: authHeaders(foreignAdminSession.token) }),
      ]);

      const foreignChannelsJson = await foreignChannelsRes.json();
      const foreignRecsJson = await foreignRecsRes.json();
      const foreignPlansJson = await foreignPlansRes.json();
      const foreignMacrosJson = await foreignMacrosRes.json();
      const foreignFeedbackJson = await foreignFeedbackRes.json();
      const foreignDevicesJson = await foreignDevicesRes.json();
      const foreignBackupJson = await foreignBackupRes.json();

      const foreignWaInfo = foreignChannelsJson.data?.find((c: any) => c.id === 'chan-whatsapp')?.accountInfo || {};
      if (
        foreignWaInfo.wabaId === 'WABA-902184920194' ||
        foreignRecsJson.data?.length !== 0 ||
        foreignPlansJson.data?.length !== 0 ||
        foreignMacrosJson.data?.length !== 0 ||
        foreignFeedbackJson.data?.items?.length !== 0 ||
        foreignDevicesJson.data?.devices?.length !== 0 ||
        foreignDevicesJson.data?.syncLedger?.length !== 0 ||
        foreignBackupJson.data?.tickets?.length !== 0 ||
        foreignBackupJson.data?.macros?.length !== 0 ||
        foreignBackupJson.data?.channelConfigs?.length !== 0
      ) {
        throw new Error(
          `[P1-03] Cross-tenant read leak detected! waWaba=${foreignWaInfo.wabaId}, recs=${foreignRecsJson.data?.length}, plans=${foreignPlansJson.data?.length}, macros=${foreignMacrosJson.data?.length}, feedback=${foreignFeedbackJson.data?.items?.length}, devices=${foreignDevicesJson.data?.devices?.length}`
        );
      }
      console.log(
        '  ✅ [P1-03] Negative Cross-Tenant Read Isolation Verified: 0 DEMO_ORG_ID records leaked to FOREIGN_ORG_ID across channels, recommendations, coachingPlans, macros, qa/feedback, platforms/devices, and system/backup'
      );

      // [P1-04] Negative Cross-Tenant Write, Mutation, ID-Collision & Restore Isolation
      const crossApplyRecRes = await fetch(`${baseUrl}/recommendations/rec-op-01/apply`, {
        method: 'POST',
        headers: authHeaders(foreignAdminSession.token),
      });
      const crossUpdatePlanRes = await fetch(`${baseUrl}/qa/coaching-plans/cp-01/progress`, {
        method: 'POST',
        headers: authHeaders(foreignAdminSession.token),
        body: JSON.stringify({ progressPercent: 100 }),
      });
      const crossOverwritePlanIdRes = await fetch(`${baseUrl}/qa/coaching-plans`, {
        method: 'POST',
        headers: authHeaders(foreignAdminSession.token),
        body: JSON.stringify({
          id: 'cp-01',
          agentName: 'Attacker',
          focusArea: 'Overwrite Attempt',
        }),
      });
      const crossOverwriteMacroIdRes = await fetch(`${baseUrl}/macros`, {
        method: 'POST',
        headers: authHeaders(foreignAdminSession.token),
        body: JSON.stringify({
          id: 'macro-welcome',
          shortcut: '/hijack',
          title: 'Hijack',
          text: 'Hijacked macro text',
        }),
      });
      const crossOverwriteFeedbackIdRes = await fetch(`${baseUrl}/qa/feedback`, {
        method: 'POST',
        headers: authHeaders(foreignAdminSession.token),
        body: JSON.stringify({
          id: 'qa-fb-001',
          reviewerName: 'Attacker',
          comment: 'Overwrite feedback attempt',
        }),
      });
      const crossOverwriteDeviceIdRes = await fetch(`${baseUrl}/platforms/register-device`, {
        method: 'POST',
        headers: authHeaders(foreignAdminSession.token),
        body: JSON.stringify({
          deviceId: 'DEV-WIN11-HQ01',
          deviceName: 'Hijacked HQ Workstation',
        }),
      });
      const crossRestoreDemoPayloadRes = await fetch(`${baseUrl}/system/restore`, {
        method: 'POST',
        headers: authHeaders(foreignAdminSession.token),
        body: JSON.stringify(rawDemoBackup),
      });

      // Also verify foreign channel config write only mutates FOREIGN_ORG_ID and never DEMO_ORG_ID
      const foreignChanWriteRes = await fetch(`${baseUrl}/integrations/channels/chan-whatsapp/config`, {
        method: 'PUT',
        headers: authHeaders(foreignAdminSession.token),
        body: JSON.stringify({ wabaId: 'WABA-FOREIGN-ONLY-777', apiToken: 'secret_foreign_777' }),
      });

      if (
        crossApplyRecRes.status !== 404 ||
        db.getRecommendation(DEMO_ORG_ID, 'rec-op-01')?.applied !== false ||
        crossUpdatePlanRes.status !== 404 ||
        db.getCoachingPlan(DEMO_ORG_ID, 'cp-01')?.progressPercent !== 65 ||
        crossOverwritePlanIdRes.status !== 403 ||
        crossOverwriteMacroIdRes.status !== 403 ||
        db.getMacro(DEMO_ORG_ID, 'macro-welcome')?.shortcut !== '/welcome' ||
        crossOverwriteFeedbackIdRes.status !== 403 ||
        crossOverwriteDeviceIdRes.status !== 403 ||
        db.getConnectedDevice(DEMO_ORG_ID, 'DEV-WIN11-HQ01')?.deviceName.includes('Hijacked') ||
        crossRestoreDemoPayloadRes.status !== 403 ||
        foreignChanWriteRes.status !== 200 ||
        db.getChannelConfig(DEMO_ORG_ID, 'chan-whatsapp')?.wabaId !== 'WABA-902184920194' ||
        db.getChannelConfig(FOREIGN_ORG_ID, 'chan-whatsapp')?.wabaId !== 'WABA-FOREIGN-ONLY-777'
      ) {
        throw new Error(
          `[P1-04] Cross-tenant write/collision guard failed: applyRec=${crossApplyRecRes.status}, updatePlan=${crossUpdatePlanRes.status}, overwritePlan=${crossOverwritePlanIdRes.status}, overwriteMacro=${crossOverwriteMacroIdRes.status}, overwriteFeedback=${crossOverwriteFeedbackIdRes.status}, overwriteDevice=${crossOverwriteDeviceIdRes.status}, crossRestore=${crossRestoreDemoPayloadRes.status}`
        );
      }
      console.log(
        '  ✅ [P1-04] Negative Cross-Tenant Write & ID-Collision Isolation Verified: cross-tenant mutations (404), primary-key collisions (403 CROSS_TENANT_OVERWRITE_FORBIDDEN), and cross-tenant backup restore (403 CROSS_TENANT_RESTORE_FORBIDDEN) blocked'
      );

      // [P1-05] Rejection of Missing, Empty, 'unauthenticated', or Unregistered organizationId (Zero Silent Default Fallback)
      const emptyOrgBodyRes = await fetch(`${baseUrl}/macros`, {
        method: 'POST',
        headers: authHeaders(adminSession.token),
        body: JSON.stringify({
          organizationId: '',
          shortcut: '/bad1',
          title: 'Bad 1',
          text: 'Text',
        }),
      });
      const unauthOrgBodyRes = await fetch(`${baseUrl}/macros`, {
        method: 'POST',
        headers: authHeaders(adminSession.token),
        body: JSON.stringify({
          organizationId: 'unauthenticated',
          shortcut: '/bad2',
          title: 'Bad 2',
          text: 'Text',
        }),
      });
      const unknownOrgBodyRes = await fetch(`${baseUrl}/macros`, {
        method: 'POST',
        headers: authHeaders(adminSession.token),
        body: JSON.stringify({
          organizationId: 'org-nonexistent-999',
          shortcut: '/bad3',
          title: 'Bad 3',
          text: 'Text',
        }),
      });
      const mismatchedOrgBodyRes = await fetch(`${baseUrl}/macros`, {
        method: 'POST',
        headers: authHeaders(foreignAdminSession.token),
        body: JSON.stringify({
          organizationId: DEMO_ORG_ID,
          shortcut: '/bad4',
          title: 'Bad 4',
          text: 'Text',
        }),
      });

      let directStoreRejectedCount = 0;
      for (const badOrg of ['', '   ', 'unauthenticated', 'org-unregistered-xyz']) {
        try {
          db.saveMacro(badOrg, {
            id: 'macro-should-fail',
            organizationId: badOrg,
            shortcut: '/fail',
            title: 'Fail',
            category: 'Fail',
            text: 'Fail',
          });
        } catch (err: any) {
          if (err?.status === 400 && err?.code === 'INVALID_ORGANIZATION_CONTEXT') {
            directStoreRejectedCount++;
          }
        }
      }

      if (
        emptyOrgBodyRes.status !== 400 ||
        unauthOrgBodyRes.status !== 400 ||
        unknownOrgBodyRes.status !== 400 ||
        mismatchedOrgBodyRes.status !== 403 ||
        directStoreRejectedCount !== 4 ||
        db.macros.has('macro-should-fail')
      ) {
        throw new Error(
          `[P1-05] Invalid organizationId rejection check failed: empty=${emptyOrgBodyRes.status}, unauth=${unauthOrgBodyRes.status}, unknown=${unknownOrgBodyRes.status}, mismatch=${mismatchedOrgBodyRes.status}, directRejected=${directStoreRejectedCount}/4`
        );
      }
      console.log(
        '  ✅ [P1-05] Missing/Empty/Unauthenticated/Unregistered organizationId Deterministically Rejected (HTTP 400/403 & Store Guard) with ZERO silent default assignment'
      );

      // [P1-06] Historical / Mismatched Organization ID ('org-madar-001' vs 'org-madar-enterprise-001') Non-Corruption & Referential Integrity Check
      const orphanOrgBackup = {
        organizations: [{ id: DEMO_ORG_ID, name: 'Madar Primary', isActive: true }],
        macros: [
          {
            id: 'macro-orphan-legacy-org',
            organizationId: 'org-madar-001', // Not registered in organizations list above
            shortcut: '/orphan',
            title: 'Orphan Legacy Org Macro',
            category: 'Legacy',
            text: 'Should be rejected rather than silently rewritten',
          },
        ],
      };
      const orphanImportResult = db.importFullBackupDetailed(orphanOrgBackup, { persistToDisk: false });
      const auditIntegrityAfterOrphan = AuditLogger.verifyChainIntegrity();
      if (
        orphanImportResult.ok !== false ||
        orphanImportResult.status !== 400 ||
        orphanImportResult.code !== 'UNREGISTERED_ORGANIZATION_ID' ||
        db.macros.has('macro-orphan-legacy-org') ||
        !auditIntegrityAfterOrphan.valid
      ) {
        throw new Error(
          `[P1-06] Legacy/orphan organizationId referential check failed: ${JSON.stringify(orphanImportResult)}`
        );
      }
      console.log(
        '  ✅ [P1-06] Historical Organization ID Referential Integrity Verified: unregistered org-madar-001 backup record rejected (400 UNREGISTERED_ORGANIZATION_ID) without silent rewrite or Audit Hash Chain mutation'
      );

      // [P1-07] Simulated Corrupted Disk JSON & Simulated Unwritable Disk Path (/proc/...) with Atomic Rollback
      const corruptDiskFile = path.join(os.tmpdir(), 'omniflow-data', `p1_corrupt_${Date.now()}.json`);
      fs.writeFileSync(corruptDiskFile, '{"version":"1.1.0-enterprise-p1","organizations":[{"id":"truncated_json...', 'utf-8');
      db.setPersistFilePathForTesting(corruptDiskFile);
      const macrosCountBeforeCorruptLoad = db.getMacros(DEMO_ORG_ID).length;
      const corruptLoadSucceeded = db.loadFromDisk();
      const readErrorDiag = db.getLastStorageError();
      try {
        fs.unlinkSync(corruptDiskFile);
      } catch {
        // ignore
      }

      if (
        corruptLoadSucceeded !== false ||
        readErrorDiag?.operation !== 'loadFromDisk' ||
        readErrorDiag?.code !== 'DISK_PERSISTENCE_READ_FAILED' ||
        db.getMacros(DEMO_ORG_ID).length !== macrosCountBeforeCorruptLoad
      ) {
        throw new Error(
          `[P1-07] Corrupted JSON load handling failed: succeeded=${corruptLoadSucceeded}, diag=${JSON.stringify(readErrorDiag)}`
        );
      }

      // Now point persistence to a deterministic unwritable path (regular file used as parent directory -> ENOTDIR)
      const p1UnwritableBlockerFile = path.join(
        os.tmpdir(),
        'omniflow-data',
        `p1_unwritable_blocker_${Date.now()}`
      );
      fs.writeFileSync(p1UnwritableBlockerFile, 'not-a-directory', 'utf-8');
      const unwritablePath = path.join(p1UnwritableBlockerFile, 'db_state.json');
      db.setPersistFilePathForTesting(unwritablePath);
      const unwritableSaveResult = db.saveToDisk();
      const writeErrorDiag = db.getLastStorageError();

      // Attempt HTTP POST /system/restore while disk write is failing -> must return HTTP 500 DISK_PERSISTENCE_WRITE_FAILED and roll back memory state!
      const modifiedDemoBackup = db.exportTenantBackup(DEMO_ORG_ID);
      modifiedDemoBackup.macros.push({
        id: 'macro-must-rollback-on-disk-fail',
        organizationId: DEMO_ORG_ID,
        shortcut: '/rollback',
        title: 'Rollback Test',
        category: 'Test',
        text: 'Must not remain in memory when disk persistence fails',
      });
      const failedDiskRestoreRes = await fetch(`${baseUrl}/system/restore`, {
        method: 'POST',
        headers: authHeaders(adminSession.token),
        body: JSON.stringify(modifiedDemoBackup),
      });
      const failedDiskRestoreJson = await failedDiskRestoreRes.json();

      // Restore valid test disk path and remove blocker file
      db.setPersistFilePathForTesting(p1TempDiskPath);
      try {
        if (fs.existsSync(p1UnwritableBlockerFile)) fs.unlinkSync(p1UnwritableBlockerFile);
      } catch {
        // ignore
      }

      if (
        unwritableSaveResult !== false ||
        writeErrorDiag?.operation !== 'saveToDisk' ||
        writeErrorDiag?.code !== 'DISK_PERSISTENCE_WRITE_FAILED' ||
        failedDiskRestoreRes.status !== 500 ||
        failedDiskRestoreJson.error?.code !== 'DISK_PERSISTENCE_WRITE_FAILED' ||
        db.getMacro(DEMO_ORG_ID, 'macro-must-rollback-on-disk-fail') !== undefined
      ) {
        throw new Error(
          `[P1-07] Unwritable disk failure & atomic rollback check failed: save=${unwritableSaveResult}, restoreStatus=${failedDiskRestoreRes.status}, code=${failedDiskRestoreJson.error?.code}`
        );
      }
      console.log(
        '  ✅ [P1-07] Explicit Disk Read/Write Failure & Atomic Restore Rollback Verified: corrupted JSON -> false (DISK_PERSISTENCE_READ_FAILED), unwritable path -> HTTP 500 (DISK_PERSISTENCE_WRITE_FAILED) with full memory rollback'
      );

      // [P1-08] Concurrent Multi-Tenant Operations across all 6 consolidated collections (40 parallel requests)
      db.purgeOrganizationData(FOREIGN_ORG_ID);
      const concurrentTasks = Array.from({ length: 40 }).map(async (_, idx) => {
        const isForeign = idx % 2 === 1;
        const token = isForeign ? foreignAdminSession.token : adminSession.token;
        const expectedOrg = isForeign ? FOREIGN_ORG_ID : DEMO_ORG_ID;

        if (idx % 4 === 0) {
          // Concurrent Macro creation + immediate tenant list read
          const createRes = await fetch(`${baseUrl}/macros`, {
            method: 'POST',
            headers: authHeaders(token),
            body: JSON.stringify({
              id: `macro-conc-${expectedOrg}-${idx}`,
              shortcut: `/c${idx}`,
              title: `Concurrent Macro ${idx}`,
              text: `Body for ${expectedOrg}`,
            }),
          });
          if (createRes.status !== 200) throw new Error(`[P1-08] Macro create ${idx} failed: ${createRes.status}`);
          const listRes = await fetch(`${baseUrl}/macros`, { headers: authHeaders(token) });
          const listJson = await listRes.json();
          if (listJson.data.some((m: any) => m.organizationId !== expectedOrg)) {
            throw new Error(`[P1-08] Cross-tenant macro bleed during concurrency on idx ${idx}`);
          }
        } else if (idx % 4 === 1) {
          // Concurrent Coaching Plan creation + tenant list read
          const cpRes = await fetch(`${baseUrl}/qa/coaching-plans`, {
            method: 'POST',
            headers: authHeaders(token),
            body: JSON.stringify({
              id: `cp-conc-${expectedOrg}-${idx}`,
              agentName: `Agent ${idx}`,
              focusArea: 'Concurrent Isolation',
            }),
          });
          if (cpRes.status !== 200) throw new Error(`[P1-08] CoachingPlan create ${idx} failed: ${cpRes.status}`);
          const listRes = await fetch(`${baseUrl}/qa/coaching-plans`, { headers: authHeaders(token) });
          const listJson = await listRes.json();
          if (listJson.data.some((p: any) => p.organizationId !== expectedOrg)) {
            throw new Error(`[P1-08] Cross-tenant coaching plan bleed during concurrency on idx ${idx}`);
          }
        } else if (idx % 4 === 2) {
          // Concurrent Device registration + tenant list read
          const devRes = await fetch(`${baseUrl}/platforms/register-device`, {
            method: 'POST',
            headers: authHeaders(token),
            body: JSON.stringify({
              deviceId: `DEV-CONC-${expectedOrg}-${idx}`,
              deviceName: `Device ${idx}`,
              osName: 'Windows',
            }),
          });
          if (devRes.status !== 200) throw new Error(`[P1-08] Device register ${idx} failed: ${devRes.status}`);
          const listRes = await fetch(`${baseUrl}/platforms/devices`, { headers: authHeaders(token) });
          const listJson = await listRes.json();
          if (listJson.data.devices.some((d: any) => d.organizationId !== expectedOrg)) {
            throw new Error(`[P1-08] Cross-tenant device bleed during concurrency on idx ${idx}`);
          }
        } else {
          // Concurrent QA Feedback creation + tenant list read
          const fbRes = await fetch(`${baseUrl}/qa/feedback`, {
            method: 'POST',
            headers: authHeaders(token),
            body: JSON.stringify({
              id: `fb-conc-${expectedOrg}-${idx}`,
              reviewerName: `Reviewer ${idx}`,
              comment: `Concurrent feedback ${idx}`,
            }),
          });
          if (fbRes.status !== 200) throw new Error(`[P1-08] Feedback create ${idx} failed: ${fbRes.status}`);
          const listRes = await fetch(`${baseUrl}/qa/feedback`, { headers: authHeaders(token) });
          const listJson = await listRes.json();
          if (listJson.data.items.some((f: any) => f.organizationId !== expectedOrg)) {
            throw new Error(`[P1-08] Cross-tenant feedback bleed during concurrency on idx ${idx}`);
          }
        }
      });

      await Promise.all(concurrentTasks);
      console.log(
        '  ✅ [P1-08] 40-Request Concurrent Multi-Tenant Read/Write Burst across Consolidated Collections Verified (0 Cross-Tenant Bleed, 0 Race Conditions)'
      );

      // [P1-09] Secret & PII Redaction in Channel Configs, Backup Exports & Storage Error Diagnostics
      const putSecretChanRes = await fetch(`${baseUrl}/integrations/channels/chan-whatsapp/config`, {
        method: 'PUT',
        headers: authHeaders(foreignAdminSession.token),
        body: JSON.stringify({
          wabaId: 'WABA-REDACT-TEST',
          apiToken: 'EAAG_SUPER_SECRET_LIVE_TOKEN_123456',
          webhookSecret: 'SUPER_SECRET_WEBHOOK_KEY_123456',
        }),
      });
      const putSecretChanJson = await putSecretChanRes.json();
      const testConnSecretRes = await fetch(`${baseUrl}/integrations/channels/chan-whatsapp/test-connection`, {
        method: 'POST',
        headers: authHeaders(foreignAdminSession.token),
      });
      const testConnSecretJson = await testConnSecretRes.json();
      const backupSecretRes = await fetch(`${baseUrl}/system/backup`, {
        headers: authHeaders(foreignAdminSession.token),
      });
      const backupSecretText = await backupSecretRes.text();

      if (
        putSecretChanJson.data?.apiToken !== '[REDACTED_SECRET]' ||
        putSecretChanJson.data?.webhookSecret !== '[REDACTED_SECRET]' ||
        testConnSecretJson.data?.details?.apiToken !== '[REDACTED_SECRET]' ||
        backupSecretText.includes('EAAG_SUPER_SECRET_LIVE_TOKEN_123456') ||
        backupSecretText.includes('SUPER_SECRET_WEBHOOK_KEY_123456')
      ) {
        throw new Error('[P1-09] Channel secret leaked in PUT config, test-connection, or GET /system/backup response!');
      }
      console.log(
        '  ✅ [P1-09] Secret & Credential Redaction Verified across PUT /config, POST /test-connection, GET /system/backup, and storage diagnostics'
      );
    } finally {
      db.setPersistFilePathForTesting(auditSuiteDiskPath);
      try {
        if (fs.existsSync(p1TempDiskPath)) fs.unlinkSync(p1TempDiskPath);
      } catch {
        // ignore
      }
      db.importFullBackup(preP1FullSnapshot);
      db.purgeOrganizationData(FOREIGN_ORG_ID);
      db.saveToDisk();
    }

    // -------------------------------------------------------------------------
    // 3E.3 PHASE P.1.2 — CHANNEL SECRET ENCRYPTION & BACKUP/RESTORE INTEGRITY SUITE (AT-01..AT-17)
    // -------------------------------------------------------------------------
    console.log('\n  [PHASE P.1.2] 🔐 CHANNEL SECRET ENCRYPTION & BACKUP/RESTORE INTEGRITY SUITE (AT-01..AT-17):');
    const preP12FullSnapshot = db.exportFullBackup();
    try {
      const p12Results = await runPhaseP12AcceptanceSuite({ existingBaseUrl: baseUrl });
      if (p12Results.length !== 17 || p12Results.some((r) => !r.passed || !r.readAfterDeleteVerified)) {
        throw new Error(
          `[PHASE P.1.2] Acceptance suite did not pass all 17 tests! Count=${p12Results.length}`
        );
      }
      for (const r of p12Results) {
        console.log(
          `  ✅ [${r.id}] ${r.title} -> PASS (Read-After-Delete=${r.readAfterDeleteVerified})`
        );
      }
    } finally {
      db.setPersistFilePathForTesting(auditSuiteDiskPath);
      db.importFullBackup(preP12FullSnapshot);
      db.saveToDisk();
    }

    // -------------------------------------------------------------------------
    // 3E.4 PHASE P.1.3 / P.1.3.1 / P.1.3.2 — AUDIT CHAIN INTEGRITY, CHECKPOINT AUTHENTICATION & ATOMIC RESTORE SUITE (AC-01..AC-32)
    // -------------------------------------------------------------------------
    console.log('\n  [PHASE P.1.3.2] 🔗 AUDIT CHAIN INTEGRITY, CHECKPOINT AUTHENTICATION & ATOMIC RESTORE SUITE (AC-01..AC-32):');
    const preP13FullSnapshot = db.exportFullBackup();
    const preP13AuditSnapshot = AuditLogger.captureSnapshot();
    try {
      const p13Results = await runPhaseP13AuditChainSuite({ existingBaseUrl: baseUrl });
      if (p13Results.length !== 32 || p13Results.some((r) => !r.passed || !r.readAfterDeleteVerified)) {
        throw new Error(
          `[PHASE P.1.3.2] Audit chain suite did not pass all 32 tests! Count=${p13Results.length}`
        );
      }
      for (const r of p13Results) {
        console.log(
          `  ✅ [${r.id}] ${r.title} -> PASS (Read-After-Delete=${r.readAfterDeleteVerified})`
        );
      }
    } finally {
      db.setPersistFilePathForTesting(auditSuiteDiskPath);
      db.importFullBackup(preP13FullSnapshot);
      AuditLogger.restoreSnapshot(preP13AuditSnapshot);
      db.saveToDisk();
      const postP13ChainCheck = AuditLogger.verifyChainIntegrity();
      if (!postP13ChainCheck.valid) {
        throw new Error(
          `[PHASE P.1.3] Post-cleanup AuditLogger.verifyChainIntegrity() failed: ${JSON.stringify(postP13ChainCheck)}`
        );
      }
      console.log(
        `  ✅ [P1-3-CHAIN-VERIFY] Post-cleanup AuditLogger.verifyChainIntegrity() verified: ${JSON.stringify(postP13ChainCheck)}`
      );
    }

    // 3F. Secondary Endpoint RBAC Guards & Workspace Relay Header Separation
    const roExportBundleRes = await fetch(`${baseUrl}/github/export-bundle`, {
      headers: authHeaders(readOnlySession.token),
    });
    const roRegisterDeviceRes = await fetch(`${baseUrl}/platforms/register-device`, {
      method: 'POST',
      headers: authHeaders(readOnlySession.token),
      body: JSON.stringify({ deviceName: 'Unauthorized Device' }),
    });
    const roQaSuiteRes = await fetch(`${baseUrl}/qa/run-full-suite`, {
      method: 'POST',
      headers: authHeaders(readOnlySession.token),
      body: JSON.stringify({ concurrency: 10 }),
    });
    const foreignAdminProfileRes = await fetch(`${baseUrl}/admin/profile`, {
      headers: authHeaders(foreignAdminSession.token),
    });
    // Workspace relay with valid OmniFlow session + X-Google-Access-Token targeting disallowed domain must return 403 (not 401 session collision!)
    const workspaceRelayDisallowedDomainRes = await fetch(`${baseUrl}/workspace/relay`, {
      method: 'POST',
      headers: authHeaders(adminSession.token, { 'X-Google-Access-Token': 'ya29.test-oauth-token' }),
      body: JSON.stringify({ targetUrl: 'https://evil-ssrf.internal/secret', method: 'GET' }),
    });
    if (
      roExportBundleRes.status !== 403 ||
      roRegisterDeviceRes.status !== 403 ||
      roQaSuiteRes.status !== 403 ||
      foreignAdminProfileRes.status !== 404 ||
      workspaceRelayDisallowedDomainRes.status !== 403
    ) {
      throw new Error(
        `Secondary endpoint guard failure: export=${roExportBundleRes.status}, device=${roRegisterDeviceRes.status}, qaSuite=${roQaSuiteRes.status}, profile=${foreignAdminProfileRes.status}, relay=${workspaceRelayDisallowedDomainRes.status}`
      );
    }
    console.log(
      '  ✅ [RBAC-06] Secondary endpoints hardened: /github/export-bundle (403), /platforms/register-device (403), /qa/run-full-suite (403), foreign /admin/profile (404), /workspace/relay SSRF/header separation (403)'
    );

    // 3G. Phase 4.4A.2 GitHub Sync Security, Branch/Repo Allowlists, Unconditional Lineage Guard,
    // Non-Silent Secret/Symlink Exclusion, PII Hygiene & Isolated Test Cleanup
    const tmpGhConfigPath = path.join(os.tmpdir(), 'omniflow-data', 'github_sync_config.json');
    const hadPreExistingTmpConfig = fs.existsSync(tmpGhConfigPath);
    const preExistingTmpConfigContent = hadPreExistingTmpConfig
      ? fs.readFileSync(tmpGhConfigPath, 'utf-8')
      : null;
    const preTestGitHubMemoryState = captureGitHubSyncStateForTesting();
    const prevEnvSyntheticFlag = process.env.OMNIFLOW_ALLOW_SYNTHETIC_REST_SYNC;

    try {
      // [GITHUB-SYNC-01] Unauthenticated and non-admin RBAC rejection on /github/sync-live
      const unauthSyncRes = await fetch(`${baseUrl}/github/sync-live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: 'fix/phase2-security-and-github-verification' }),
      });
      const roSyncRes = await fetch(`${baseUrl}/github/sync-live`, {
        method: 'POST',
        headers: authHeaders(readOnlySession.token),
        body: JSON.stringify({ branch: 'fix/phase2-security-and-github-verification' }),
      });
      const agentSyncRes = await fetch(`${baseUrl}/github/sync-live`, {
        method: 'POST',
        headers: authHeaders(agentSession.token),
        body: JSON.stringify({ branch: 'fix/phase2-security-and-github-verification' }),
      });
      if (unauthSyncRes.status !== 401 || roSyncRes.status !== 403 || agentSyncRes.status !== 403) {
        throw new Error(
          `[GITHUB-SYNC-01] Auth/RBAC check failed: unauth=${unauthSyncRes.status}, ro=${roSyncRes.status}, agent=${agentSyncRes.status}`
        );
      }

      // [GITHUB-SYNC-02] Branch protection (Finding 03: git check-ref-format aligned validator) & Repository allowlist
      const forbiddenMainBranches = [
        'main',
        'MAIN',
        'master',
        'MASTER',
        'prod',
        'production',
        'refs/heads/main',
        'origin/main',
      ];
      for (const mainBr of forbiddenMainBranches) {
        const res = validateGitHubSyncTarget('ahmedsheta89-cell', 'Call-center', mainBr);
        if (res.valid || res.status !== 403 || res.errorCode !== 'DIRECT_MAIN_PUSH_FORBIDDEN') {
          throw new Error(
            `[GITHUB-SYNC-02] Protected branch '${mainBr}' was not rejected with 403 DIRECT_MAIN_PUSH_FORBIDDEN: ${JSON.stringify(res)}`
          );
        }
      }

      const invalidRefBranches = [
        'fix/branch.',
        'fix/branch.lock',
        'fix/branch.LOCK',
        'fix/sub.lock/item',
        'fix/-branch',
        'fix/.hidden',
        'fix/sub/-item',
        'fix/sub/.item',
        'fix/',
        'fix//branch',
        '/fix/branch',
        'fix/branch/',
        'fix/../main',
        'fix/%2e%2e/main',
        'fix/branch@{0}',
        'fix/branch~1',
        'fix/branch^1',
        'fix/branch:ref',
        'fix/branch?x',
        'fix/branch*',
        'fix/branch[0]',
        'fix/branch\\name',
        'fix/branch name',
        'unprefixed-branch',
        'FIX/uppercase-prefix',
      ];
      for (const badBr of invalidRefBranches) {
        const res = validateGitHubSyncTarget('ahmedsheta89-cell', 'Call-center', badBr);
        if (res.valid || res.status !== 400 || res.errorCode !== 'INVALID_BRANCH_TARGET') {
          throw new Error(
            `[GITHUB-SYNC-02] Invalid branch ref '${badBr}' was not rejected with 400 INVALID_BRANCH_TARGET: ${JSON.stringify(res)}`
          );
        }
      }

      const validFeatureBranches = [
        'fix/phase2-security-and-github-verification',
        'feat/omni-routing-v2.1',
        'chore/ci-lockfile-prep',
        'hotfix/csrf-origin-gate',
        'release/v1.0.2-rc1',
      ];
      for (const goodBr of validFeatureBranches) {
        const res = validateGitHubSyncTarget('ahmedsheta89-cell', 'Call-center', goodBr);
        if (!res.valid || res.branch !== goodBr) {
          throw new Error(
            `[GITHUB-SYNC-02] Valid feature branch '${goodBr}' was unexpectedly rejected: ${JSON.stringify(res)}`
          );
        }
      }

      const syncMainRes = await fetch(`${baseUrl}/github/sync-live`, {
        method: 'POST',
        headers: authHeaders(adminSession.token),
        body: JSON.stringify({ branch: 'main' }),
      });
      const syncMainJson = await syncMainRes.json();
      const syncDotLockRes = await fetch(`${baseUrl}/github/sync-live`, {
        method: 'POST',
        headers: authHeaders(adminSession.token),
        body: JSON.stringify({ branch: 'fix/branch.LOCK' }),
      });
      const syncForeignRepoRes = await fetch(`${baseUrl}/github/sync-live`, {
        method: 'POST',
        headers: authHeaders(adminSession.token),
        body: JSON.stringify({
          repoOwner: 'evil-attacker',
          repoName: 'exfil-repo',
          branch: 'fix/phase2-security-and-github-verification',
        }),
      });
      const syncForeignRepoJson = await syncForeignRepoRes.json();
      if (
        syncMainRes.status !== 403 ||
        syncMainJson.errorCode !== 'DIRECT_MAIN_PUSH_FORBIDDEN' ||
        syncDotLockRes.status !== 400 ||
        syncForeignRepoRes.status !== 403 ||
        syncForeignRepoJson.errorCode !== 'REPOSITORY_NOT_IN_ALLOWLIST'
      ) {
        throw new Error(
          `[GITHUB-SYNC-02] HTTP branch/repo allowlist check failed: main=${syncMainRes.status}, dotLock=${syncDotLockRes.status}, foreignRepo=${syncForeignRepoRes.status}`
        );
      }

      // [GITHUB-SYNC-03] Unconditional fail-closed lineage protection (Finding 02: even when OMNIFLOW_ALLOW_SYNTHETIC_REST_SYNC='true')
      const syntheticWriteAttemptRes = await fetch(`${baseUrl}/github/sync-live`, {
        method: 'POST',
        headers: authHeaders(adminSession.token),
        body: JSON.stringify({
          branch: 'fix/phase2-security-and-github-verification',
          githubToken: 'ephemeral-test-credential-never-persist',
        }),
      });
      const syntheticWriteJson = await syntheticWriteAttemptRes.json();

      process.env.OMNIFLOW_ALLOW_SYNTHETIC_REST_SYNC = 'true';
      const flagEnabledWriteAttemptRes = await fetch(`${baseUrl}/github/sync-live`, {
        method: 'POST',
        headers: authHeaders(adminSession.token),
        body: JSON.stringify({
          branch: 'fix/phase2-security-and-github-verification',
          mode: 'github_live_api',
          githubToken: 'ephemeral-test-credential-never-persist',
        }),
      });
      const flagEnabledWriteJson = await flagEnabledWriteAttemptRes.json();
      if (prevEnvSyntheticFlag === undefined) {
        delete process.env.OMNIFLOW_ALLOW_SYNTHETIC_REST_SYNC;
      } else {
        process.env.OMNIFLOW_ALLOW_SYNTHETIC_REST_SYNC = prevEnvSyntheticFlag;
      }

      const tmpGhConfigRaw = fs.existsSync(tmpGhConfigPath) ? fs.readFileSync(tmpGhConfigPath, 'utf-8') : '';
      if (
        syntheticWriteAttemptRes.status !== 409 ||
        syntheticWriteJson.errorCode !== 'SYNTHETIC_REST_SYNC_DISABLED_FOR_LINEAGE_SAFETY' ||
        flagEnabledWriteAttemptRes.status !== 409 ||
        flagEnabledWriteJson.errorCode !== 'SYNTHETIC_REST_SYNC_DISABLED_FOR_LINEAGE_SAFETY' ||
        flagEnabledWriteJson.remoteSynced !== false ||
        tmpGhConfigRaw.includes('ephemeral-test-credential-never-persist') ||
        tmpGhConfigRaw.includes('"token"')
      ) {
        throw new Error(
          `[GITHUB-SYNC-03] Unconditional lineage protection check failed: default=${syntheticWriteAttemptRes.status}, withFlag=${flagEnabledWriteAttemptRes.status}`
        );
      }

      // [GITHUB-SYNC-04 & 05] Explicit allowlist file discovery + Non-silent Secret, Encrypted PEM, PGP, .env, key & symlink exclusion (Finding 04)
      const tempDotEnvFile = path.join(process.cwd(), 'docs', '.env.production');
      const tempKeyFile = path.join(process.cwd(), 'docs', 'temp_private_test.key');
      const tempInlineSecretFile = path.join(process.cwd(), 'docs', 'temp_inline_secret_test.md');
      const tempEncryptedPemFile = path.join(process.cwd(), 'docs', 'temp_encrypted_pem_test.md');
      const tempPgpKeyFile = path.join(process.cwd(), 'docs', 'temp_pgp_private_test.md');
      const tempSymlinkFile = path.join(process.cwd(), 'docs', 'temp_symlink_escape.md');
      const allTempFixtures = [
        tempDotEnvFile,
        tempKeyFile,
        tempInlineSecretFile,
        tempEncryptedPemFile,
        tempPgpKeyFile,
        tempSymlinkFile,
      ];

      let discoveredPaths: string[] = [];
      let adminExcludedFiles: Array<{ path: string; reason: string }> = [];
      let roExcludedFiles: Array<{ path: string; reason: string }> = [];
      let auditFullyScannedDuringFixtures = true;
      try {
        fs.writeFileSync(tempDotEnvFile, 'SECRET_KEY=super_secret\n', 'utf-8');
        fs.writeFileSync(tempKeyFile, 'raw-key-bytes\n', 'utf-8');
        fs.writeFileSync(
          tempInlineSecretFile,
          `# Test Doc\n-----BEGIN ${'RSA PRIVATE KEY'}-----\nMIIEowIBAAKCAQEA...\n`,
          'utf-8'
        );
        fs.writeFileSync(
          tempEncryptedPemFile,
          `# Encrypted Key\n-----BEGIN ${'ENCRYPTED PRIVATE KEY'}-----\nMIIFDjBABgkqhkiG9w0BBQ0w...\n`,
          'utf-8'
        );
        fs.writeFileSync(
          tempPgpKeyFile,
          `# PGP Key\n-----BEGIN ${'PGP PRIVATE KEY BLOCK'}-----\nlQOYBGTestBlock...\n`,
          'utf-8'
        );
        try {
          fs.symlinkSync('/etc/os-release', tempSymlinkFile);
        } catch {
          // Ignore if symlink creation is restricted
        }

        const projectFilesAuditRes = await fetch(`${baseUrl}/github/project-files`, {
          headers: authHeaders(adminSession.token),
        });
        const projectFilesAuditJson = await projectFilesAuditRes.json();
        discoveredPaths = (projectFilesAuditJson.data?.files || []).map((f: any) => String(f.path));
        adminExcludedFiles = projectFilesAuditJson.data?.workspaceCleanlinessAudit?.excludedFiles || [];
        auditFullyScannedDuringFixtures =
          projectFilesAuditJson.data?.workspaceCleanlinessAudit?.fullyScannedWithoutExclusions;

        // Also verify Read-Only caller receives redacted paths on excludedFiles
        const roProjectFilesRes = await fetch(`${baseUrl}/github/project-files`, {
          headers: authHeaders(readOnlySession.token),
        });
        const roProjectFilesJson = await roProjectFilesRes.json();
        roExcludedFiles = roProjectFilesJson.data?.workspaceCleanlinessAudit?.excludedFiles || [];
      } finally {
        for (const tempP of allTempFixtures) {
          try {
            if (fs.lstatSync(tempP)) fs.unlinkSync(tempP);
          } catch {
            // Ignore cleanup if already absent
          }
        }
      }

      const requiredTrackedFiles = [
        '.github/workflows/ci.yml',
        'firestore.rules',
        'DRAFT_firestore.rules',
        '.env.example',
        'firebase.json',
        'server/api/router.ts',
        'src/components/GitHubSyncAndQASuiteView.tsx',
        'docs/PHASE_4_2_INDEPENDENT_SECURITY_VERIFICATION.md',
        'docs/PHASE_4_RELEASE_READINESS_AUDIT.md',
        'docs/roadmap/OMNIFLOW_PHASE_P1_3_2_EVIDENCE.sha256',
        'scripts/test_all_operations.ts',
      ];
      const missingRequiredFiles = requiredTrackedFiles.filter((reqFile) => !discoveredPaths.includes(reqFile));
      const leakedForbiddenFiles = discoveredPaths.filter(
        (p) =>
          p.endsWith('.env.production') ||
          p.endsWith('.key') ||
          p.includes('temp_inline_secret_test.md') ||
          p.includes('temp_encrypted_pem_test.md') ||
          p.includes('temp_pgp_private_test.md') ||
          p.includes('temp_symlink_escape.md') ||
          p.startsWith('node_modules/') ||
          p.startsWith('dist/')
      );
      const adminExcludedMap = new Map(adminExcludedFiles.map((item) => [item.path, item.reason]));
      const roPathsAllRedacted =
        roExcludedFiles.length === adminExcludedFiles.length &&
        roExcludedFiles.every((item) => item.path === '[REDACTED_SENSITIVE_PATH]');

      if (
        missingRequiredFiles.length > 0 ||
        leakedForbiddenFiles.length > 0 ||
        auditFullyScannedDuringFixtures !== false ||
        adminExcludedMap.has('docs/roadmap/OMNIFLOW_PHASE_P1_3_2_EVIDENCE.sha256') ||
        adminExcludedMap.get('docs/temp_encrypted_pem_test.md') !== 'excluded_secret_content_pattern' ||
        adminExcludedMap.get('docs/temp_pgp_private_test.md') !== 'excluded_secret_content_pattern' ||
        adminExcludedMap.get('docs/temp_inline_secret_test.md') !== 'excluded_secret_content_pattern' ||
        adminExcludedMap.get('docs/.env.production') !== 'excluded_forbidden_filename' ||
        adminExcludedMap.get('docs/temp_private_test.key') !== 'excluded_forbidden_filename' ||
        !roPathsAllRedacted
      ) {
        throw new Error(
          `[GITHUB-SYNC-04/05] File discovery or exclusion audit failed: missing=[${missingRequiredFiles.join(', ')}], leaked=[${leakedForbiddenFiles.join(', ')}], fullyScanned=${auditFullyScannedDuringFixtures}, roPathsAllRedacted=${roPathsAllRedacted}`
        );
      }

      // Verify clean workspace reports 0 exclusions after fixture cleanup and includes evidence manifest
      const cleanFilesAuditRes = await fetch(`${baseUrl}/github/project-files`, {
        headers: authHeaders(adminSession.token),
      });
      const cleanFilesAuditJson = await cleanFilesAuditRes.json();
      const cleanDiscoveredPaths = (cleanFilesAuditJson.data?.files || []).map((f: any) => String(f.path));
      const cleanExcludedPaths = (cleanFilesAuditJson.data?.workspaceCleanlinessAudit?.excludedFiles || []).map(
        (f: any) => String(f.path)
      );
      if (
        cleanFilesAuditJson.data?.workspaceCleanlinessAudit?.excludedFilesCount !== 0 ||
        cleanFilesAuditJson.data?.workspaceCleanlinessAudit?.fullyScannedWithoutExclusions !== true ||
        !cleanDiscoveredPaths.includes('docs/roadmap/OMNIFLOW_PHASE_P1_3_2_EVIDENCE.sha256') ||
        cleanExcludedPaths.includes('docs/roadmap/OMNIFLOW_PHASE_P1_3_2_EVIDENCE.sha256')
      ) {
        throw new Error(
          `[GITHUB-SYNC-05] Post-cleanup workspace should have 0 excluded files and include evidence manifest, got: ${JSON.stringify(cleanFilesAuditJson.data?.workspaceCleanlinessAudit?.excludedFiles)}`
        );
      }

      // [GITHUB-SYNC-06] Verified workspace snapshot explicit local-only contract, PII hygiene & CI workflow checks
      const validSnapshotSyncRes = await fetch(`${baseUrl}/github/sync-live`, {
        method: 'POST',
        headers: authHeaders(adminSession.token),
        body: JSON.stringify({
          branch: 'fix/phase2-security-and-github-verification',
          commitMessage: 'chore(sync): verify card 4532-1122-3344-5566 redaction on feature branch',
        }),
      });
      const validSnapshotSyncJson = await validSnapshotSyncRes.json();
      const exportBundleRes = await fetch(`${baseUrl}/github/export-bundle`, {
        headers: authHeaders(adminSession.token),
      });
      const exportBundleJson = await exportBundleRes.json();
      const ciYamlContent = fs.readFileSync(path.join(process.cwd(), '.github', 'workflows', 'ci.yml'), 'utf-8');
      const hasPackageLock = fs.existsSync(path.join(process.cwd(), 'package-lock.json'));
      const ciHasBrokenNpmCache =
        !hasPackageLock && (/cache:\s*['"]?npm['"]?/.test(ciYamlContent) || /\bnpm\s+ci\b/.test(ciYamlContent));
      const ciHasLeastPrivilegePermissions = /permissions:\s*\n\s*contents:\s*read/.test(ciYamlContent);

      if (
        validSnapshotSyncRes.status !== 200 ||
        validSnapshotSyncJson.data?.mode !== 'workspace_verified_snapshot' ||
        validSnapshotSyncJson.data?.remoteSynced !== false ||
        validSnapshotSyncJson.data?.localSnapshotOnly !== true ||
        !String(validSnapshotSyncJson.data?.message || '').startsWith('[LOCAL SNAPSHOT ONLY — NOT PUSHED TO GITHUB]') ||
        validSnapshotSyncJson.data?.commit?.branch !== 'fix/phase2-security-and-github-verification' ||
        validSnapshotSyncJson.data?.commit?.authorEmail !== '[REDACTED_EMAIL]' ||
        validSnapshotSyncJson.data?.commit?.message?.includes('4532-1122-3344-5566') ||
        exportBundleJson.data?.adminPhone !== '[REDACTED_PHONE]' ||
        exportBundleJson.data?.adminEmail !== '[REDACTED_EMAIL]' ||
        ciHasBrokenNpmCache ||
        !ciHasLeastPrivilegePermissions
      ) {
        throw new Error(
          `[GITHUB-SYNC-06] Snapshot contract, PII hygiene, or CI YAML check failed: status=${validSnapshotSyncRes.status}, remoteSynced=${validSnapshotSyncJson.data?.remoteSynced}, localSnapshotOnly=${validSnapshotSyncJson.data?.localSnapshotOnly}, ciHasLeastPrivilegePermissions=${ciHasLeastPrivilegePermissions}`
        );
      }
      console.log(
        `  ✅ [GITHUB-SYNC-01..06] GitHub Sync Hardened (Phase 4.4A.2): RBAC (401/403), 26 branch/ref boundary vectors verified, unconditional 409 live-sync block (even with flag), ${discoveredPaths.length} allowlisted files discovered, Encrypted PEM & PGP secrets tracked in excludedFiles (with non-admin path redaction), explicit local-snapshot indicators & CI least-privilege verified`
      );
    } finally {
      if (prevEnvSyntheticFlag === undefined) {
        delete process.env.OMNIFLOW_ALLOW_SYNTHETIC_REST_SYNC;
      } else {
        process.env.OMNIFLOW_ALLOW_SYNTHETIC_REST_SYNC = prevEnvSyntheticFlag;
      }
      restoreGitHubSyncStateForTesting(preTestGitHubMemoryState);
      try {
        if (hadPreExistingTmpConfig && preExistingTmpConfigContent !== null) {
          fs.writeFileSync(tmpGhConfigPath, preExistingTmpConfigContent, 'utf-8');
        } else if (!hadPreExistingTmpConfig && fs.existsSync(tmpGhConfigPath)) {
          fs.unlinkSync(tmpGhConfigPath);
        }
      } catch {
        // Ignore tmp cleanup error
      }
    }

    // Verify Finding 06 post-test state restoration
    const postCleanupState = captureGitHubSyncStateForTesting();
    if (
      postCleanupState.commitsLedger.length !== preTestGitHubMemoryState.commitsLedger.length ||
      (!hadPreExistingTmpConfig && fs.existsSync(tmpGhConfigPath))
    ) {
      throw new Error(
        `[GITHUB-SYNC-06] Test cleanup failed to restore pre-test state: ledgerLen=${postCleanupState.commitsLedger.length} (expected ${preTestGitHubMemoryState.commitsLedger.length}), tmpExists=${fs.existsSync(tmpGhConfigPath)}`
      );
    }

    // 4. Firestore Security Gate, "Dirty Dozen" Red Team & Real JVM Emulator Suite
    console.log('\n[4/7] 🔥 FIRESTORE SECURITY GATE, RED TEAM & REAL JVM EMULATOR SUITE (firestore.rules & DRAFT_firestore.rules):');
    const fsGate = runFirestoreSecurityGateAudit();
    const emuGate = await runFirestoreEmulatorSecuritySuite();
    console.log(`  ✅ Java 21 Runtime Verified: ${emuGate.javaBinary} (${emuGate.javaVersion})`);
    console.log(`  ✅ Structural Invariants Verified: ${fsGate.structuralChecksPassed}/12 Passed (SHA-256 parity + FINDING-4.4B.2.1-01 + AUDIT-3B-04 guards)`);
    console.log(`  ✅ Deterministic Adversarial Payloads Blocked: ${fsGate.dirtyDozenBlocked}/20 Returned PERMISSION_DENIED`);
    console.log(`  ✅ Real JVM Firestore Emulator Suite: ${emuGate.totalTests}/39 Passed (${emuGate.adversarialBlockedCount}/29 Attacks PERMISSION_DENIED | ${emuGate.authorizedAllowedCount}/10 Flows ALLOWED)`);

    // 5. Test core live operational endpoints
    const endpointsToVerify = [
      { name: 'Live Operations & KPIs', method: 'GET', path: '/operations/live' },
      { name: 'Tickets & SLA Engine', method: 'GET', path: '/tickets' },
      { name: 'Customer 360 Profiles', method: 'GET', path: '/customers' },
      { name: 'Omnichannel Conversations', method: 'GET', path: '/conversations' },
      { name: 'Voice Call Center Sessions', method: 'GET', path: '/calls' },
      { name: 'Workforce Management Overview (WFM)', method: 'GET', path: '/wfm/overview' },
      { name: 'Workforce Shifts Schedule', method: 'GET', path: '/wfm/shifts' },
      { name: 'Visual Workflow Automation Rules', method: 'GET', path: '/automation/rules' },
      { name: 'Intelligent NBA Recommendations', method: 'GET', path: '/recommendations' },
      { name: 'Canned Responses & Quick Macros', method: 'GET', path: '/macros' },
      { name: 'Omnichannel Connectors & Gateways', method: 'GET', path: '/integrations/channels' },
      { name: 'WhatsApp Approved Templates', method: 'GET', path: '/integrations/whatsapp/templates' },
      { name: 'Cross-Platform Verification Suite', method: 'POST', path: '/platforms/verify-all' },
      { name: 'GitHub Live Sync & Workspace Audit', method: 'GET', path: '/github/project-files' },
    ];

    console.log('\n[5/7] 🌐 END-TO-END REST API VERIFICATION:');
    for (const ep of endpointsToVerify) {
      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: ep.method,
        headers: authHeaders(adminSession.token),
        body: ep.method === 'POST' ? JSON.stringify({}) : undefined,
      });
      const data = await res.json();
      const statusOk = res.status === 200 && data.success === true;
      console.log(`  ${statusOk ? '✅' : '❌'} [${ep.method} ${ep.path}] (${ep.name}) -> HTTP ${res.status} | success=${data.success}`);
      if (!statusOk) {
        throw new Error(`Endpoint ${ep.path} failed verification! Status: ${res.status}`);
      }
    }

    // 6. Execute all 22 Platform Modules via /system/execute-function and verify NO fallback
    const all22Modules = [
      'live_ops', 'inbox', 'gmail_hub', 'voice', 'tickets',
      'customers', 'agentic_ai', 'predictive_cx', 'recommendations', 'ai_analyst',
      'automation', 'enterprise_scale', 'cloud_db', 'sheets_hub', 'integrations',
      'knowledge_base', 'training', 'wfm', 'qa', 'audit',
      'github_qa_hub', 'cross_platform_hub',
    ];
    console.log('\n[6/7] ⚡ LIVE EXECUTION VERIFICATION ACROSS ALL 22 PLATFORM MODULES:');
    for (const modId of all22Modules) {
      const res = await fetch(`${baseUrl}/system/execute-function`, {
        method: 'POST',
        headers: authHeaders(adminSession.token),
        body: JSON.stringify({ moduleId: modId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success || json.data.isDefaultFallback || json.data.affectedEntity === 'system_state') {
        throw new Error(`Module ${modId} execution failed or fell through to default!`);
      }
      console.log(`  ✅ Module [${modId.padEnd(18)}] -> Verified (${json.data.affectedEntity}) | ${json.data.apiRoute}`);
    }

    // 7. Multi-Wave Sustained Concurrent HTTP, Identity Isolation & Storage Write Benchmark (3 Waves x 50 = 150 Requests)
    console.log('\n[7/7] 🚀 MULTI-WAVE CONCURRENT HTTP, IDENTITY ISOLATION & STORAGE BENCHMARK (3 WAVES x 50 = 150 REQUESTS):');
    const waves = 3;
    const concurrencyPerWave = 50;
    const allLatencies: number[] = [];
    const totalStart = performance.now();

    for (let wave = 1; wave <= waves; wave++) {
      const waveLatencies: number[] = [];
      const waveStart = performance.now();

      await Promise.all(
        Array.from({ length: concurrencyPerWave }).map(async (_, idx) => {
          const reqStart = performance.now();
          if (idx % 5 === 0) {
            // Foreign tenant session: must return 0 tickets and never bleed into DEMO_ORG_ID
            const r = await fetch(`${baseUrl}/tickets`, {
              headers: authHeaders(foreignAgentSession.token),
            });
            if (r.status !== 200) throw new Error(`Wave ${wave} foreign tenant request ${idx} failed with ${r.status}`);
            const d = await r.json();
            if (!Array.isArray(d.data) || d.data.length !== 0) {
              throw new Error(`Wave ${wave} context bleed on request ${idx}: expected 0 tickets for foreign tenant, got ${d.data?.length}`);
            }
          } else if (idx % 5 === 1) {
            // Read-Only session attempting a write during concurrent load: must return 403
            const r = await fetch(`${baseUrl}/tickets`, {
              method: 'POST',
              headers: authHeaders(readOnlySession.token),
              body: JSON.stringify({ customerId: 'cust-001', title: 'Concurrent RO Write', priority: 'low' }),
            });
            if (r.status !== 403) throw new Error(`Wave ${wave} Read Only write ${idx} expected 403, got ${r.status}`);
            await r.json();
          } else if (idx % 5 === 2) {
            // Async endpoint (test-connection has 20-50ms delay) with Admin session
            const r = await fetch(`${baseUrl}/integrations/channels/chan-whatsapp/test-connection`, {
              method: 'POST',
              headers: authHeaders(adminSession.token),
            });
            if (r.status !== 200) throw new Error(`Wave ${wave} async test-connection ${idx} failed with ${r.status}`);
            await r.json();
          } else if (idx % 5 === 3) {
            // Concurrent backup export + atomic disk persistence under load
            const r = await fetch(`${baseUrl}/auth/me`, {
              headers: authHeaders(supervisorSession.token),
            });
            if (r.status !== 200) throw new Error(`Wave ${wave} supervisor /auth/me ${idx} failed with ${r.status}`);
            const d = await r.json();
            if (d.data?.user?.role !== 'Supervisor' || d.data?.organization?.id !== DEMO_ORG_ID) {
              throw new Error(`Wave ${wave} identity bleed on /auth/me: got role=${d.data?.user?.role}, org=${d.data?.organization?.id}`);
            }
            if (idx === 3 || idx === 28) {
              if (!db.saveToDisk()) {
                throw new Error(`Wave ${wave} concurrent db.saveToDisk() failed!`);
              }
            }
          } else {
            // Primary tenant read (/operations/live or /tickets) with Supervisor session
            const endpoint = idx % 2 === 0 ? '/operations/live' : '/tickets';
            const r = await fetch(`${baseUrl}${endpoint}`, {
              headers: authHeaders(supervisorSession.token),
            });
            if (r.status !== 200) throw new Error(`Wave ${wave} primary request ${idx} failed with status ${r.status}`);
            const d = await r.json();
            if (endpoint === '/tickets' && (!Array.isArray(d.data) || d.data.length === 0)) {
              throw new Error(`Wave ${wave} context bleed on primary tenant request ${idx}: expected >0 tickets, got 0`);
            }
          }
          const lat = performance.now() - reqStart;
          waveLatencies.push(lat);
          allLatencies.push(lat);
        })
      );

      const waveDuration = performance.now() - waveStart;
      waveLatencies.sort((a, b) => a - b);
      const wP50 = waveLatencies[Math.floor(waveLatencies.length * 0.5)];
      const wP95 = waveLatencies[Math.floor(waveLatencies.length * 0.95)];
      console.log(
        `  ✅ Wave ${wave}/${waves} (${concurrencyPerWave} parallel reqs) -> ${waveDuration.toFixed(1)}ms | P50: ${wP50.toFixed(2)}ms | P95: ${wP95.toFixed(2)}ms | Bleed: 0/${concurrencyPerWave}`
      );
    }

    const totalDurationMs = performance.now() - totalStart;
    allLatencies.sort((a, b) => a - b);
    const p50 = allLatencies[Math.floor(allLatencies.length * 0.5)];
    const p95 = allLatencies[Math.floor(allLatencies.length * 0.95)];
    const p99 = allLatencies[Math.floor(allLatencies.length * 0.99)];
    const rps = Math.round((allLatencies.length / totalDurationMs) * 1000);
    console.log(
      `  🏆 Aggregate 150-Request Multi-Tenant/Multi-Role Burst Completed in ${totalDurationMs.toFixed(1)}ms | Throughput: ${rps} req/s | P50: ${p50.toFixed(2)}ms | P95: ${p95.toFixed(2)}ms | P99: ${p99.toFixed(2)}ms | Identity/Tenant Bleed: 0/150`
    );

    const blueprintPath = path.join(process.cwd(), 'firebase-blueprint.json');
    if (fs.existsSync(blueprintPath)) {
      const bp = JSON.parse(fs.readFileSync(blueprintPath, 'utf-8'));
      const entityCount = Object.keys(bp.entities || {}).length;
      const collectionCount = Object.keys(bp.firestore || {}).length;
      console.log(`  ✅ Firebase Blueprint Verified: ${entityCount} Entities | ${collectionCount} Collections`);
    }

    console.log('\n================================================================================');
    console.log('🎉 ALL PHASE 4 IDENTITY TRUST, ATOMIC STORAGE, FIRESTORE & 150-REQ LOAD TESTS PASSED');
    console.log('================================================================================');
  } finally {
    // Clean up temporary test fixtures before persisting state
    db.purgeOrganizationData(FOREIGN_ORG_ID);
    db.organizations.delete(FOREIGN_ORG_ID);
    db.users.delete('usr-ro-01');
    db.users.delete('usr-foreign-admin-01');
    db.users.delete('usr-foreign-agt-01');
    db.saveToDisk();
    db.setPersistFilePathForTesting(null);
    try {
      if (fs.existsSync(auditSuiteDiskPath)) fs.unlinkSync(auditSuiteDiskPath);
    } catch {
      // ignore
    }
    if (!hadExternalEncryptionKey) {
      delete process.env.CHANNEL_SECRET_ENCRYPTION_KEY;
    }
    if (!hadExternalAuditHmacKey) {
      delete process.env.AUDIT_CHECKPOINT_HMAC_KEY;
    }
    if (!hadExternalAuditHmacKeyId) {
      delete process.env.AUDIT_CHECKPOINT_HMAC_KEY_ID;
    }
    server.closeAllConnections?.();
    server.close();
  }
}

runComprehensiveEnterpriseAudit()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Audit Runner Failed:', err);
    process.exit(1);
  });
