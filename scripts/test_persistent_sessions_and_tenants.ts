/**
 * @file scripts/test_persistent_sessions_and_tenants.ts
 * R2.1C Persistent Sessions, Revocation, Concurrency, Corrupt Store & Canonical Tenant Identity Suite
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';
import express from 'express';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'r2-1c-persistent-sessions-test-secret-key-32-chars';
process.env.CHANNEL_SECRET_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.AUDIT_CHECKPOINT_HMAC_KEY = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'omniflow-r21c-sessions-'));
  const dbPath = path.join(tempRoot, 'db_state.json');
  const sessionsPath = path.join(tempRoot, '.omniflow_sessions.json');

  const { db } = await import('../server/db/store.ts');
  db.setPersistFilePathForTesting(dbPath);
  const { initializeSeedData, ensureAdminUser, DEMO_ORG_ID } = await import('../server/db/seed.ts');
  initializeSeedData();
  ensureAdminUser();

  // Add a second isolated tenant & users for cross-tenant testing
  const foreignOrgId = 'org-r21c-foreign-999';
  db.organizations.set(foreignOrgId, {
    id: foreignOrgId,
    name: 'Foreign Tenant 999',
    slug: 'foreign-999',
    plan: 'enterprise',
    settings: {
      timezone: 'UTC',
      defaultLanguage: 'en',
      workingHours: { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] },
      zeroCostMode: true,
      aiMonthlyBudgetUsd: 100,
      aiCurrentMonthSpendUsd: 0,
    },
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  db.users.set('usr-r21c-foreign-admin', {
    id: 'usr-r21c-foreign-admin',
    organizationId: foreignOrgId,
    email: 'foreign-admin@r21c.local',
    fullName: 'Foreign Admin',
    role: 'Admin',
    isActive: true,
    mfaEnabled: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  db.users.set('usr-r21c-agent', {
    id: 'usr-r21c-agent',
    organizationId: DEMO_ORG_ID,
    email: 'r21c-agent@madar.local',
    fullName: 'R21C Agent',
    role: 'Agent',
    isActive: true,
    mfaEnabled: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  db.saveToDisk();

  const {
    defaultSessionStore,
  } = await import('../server/core/sessionStore.ts');
  defaultSessionStore.setFilePathForTesting(sessionsPath);

  const {
    issueSessionToken,
    verifySessionToken,
    revokeSessionToken,
    revokeAllUserSessions,
    invalidateUserCredentials,
    cleanupExpiredSessions,
    listUserSessions,
  } = await import('../server/core/identity.ts');

  const {
    CANONICAL_PRIMARY_ORG_ID,
    LEGACY_FIRESTORE_BOOTSTRAP_ORG_ID,
    resolveCanonicalTenantId,
    assertTenantBoundary,
  } = await import('../server/core/tenantIdentity.ts');

  const { apiRouter } = await import('../server/api/router.ts');
  const app = express();
  app.use(express.json());
  app.use('/api/v1', apiRouter);
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  let passed = 0;
  const check = (name: string, fn: () => void | Promise<void>) =>
    Promise.resolve()
      .then(fn)
      .then(() => {
        passed++;
        console.log(`  ✅ ${name}`);
      });

  console.log('================================================================================');
  console.log('🔐 OMNIFLOW OS R2.1C — PERSISTENT SESSIONS & CANONICAL TENANT IDENTITY SUITE');
  console.log('================================================================================');

  try {
    // 1. Canonical Tenant Identity Resolution & Compatibility
    await check('[TENANT-ID-01] Canonical primary org is org-madar-enterprise-001; legacy alias org-madar-001 resolves only with explicit opt-in', () => {
      assert.strictEqual(CANONICAL_PRIMARY_ORG_ID, 'org-madar-enterprise-001');
      assert.strictEqual(LEGACY_FIRESTORE_BOOTSTRAP_ORG_ID, 'org-madar-001');

      const direct = resolveCanonicalTenantId('org-madar-enterprise-001', {
        registeredOrganizations: db.organizations,
      });
      assert.strictEqual(direct.ok, true);
      assert.strictEqual(direct.canonicalOrgId, 'org-madar-enterprise-001');
      assert.strictEqual(direct.isLegacyAlias, false);

      const aliased = resolveCanonicalTenantId('org-madar-001', {
        allowLegacyAlias: true,
        registeredOrganizations: db.organizations,
      });
      assert.strictEqual(aliased.ok, true);
      assert.strictEqual(aliased.canonicalOrgId, 'org-madar-enterprise-001');
      assert.strictEqual(aliased.isLegacyAlias, true);

      // Strict backup/audit mode (allowLegacyAlias=false) MUST reject unregistered org-madar-001
      const strict = resolveCanonicalTenantId('org-madar-001', {
        allowLegacyAlias: false,
        registeredOrganizations: db.organizations,
      });
      assert.strictEqual(strict.ok, false);
      assert.strictEqual(strict.errorCode, 'UNREGISTERED_ORGANIZATION_ID');

      let boundaryBlocked = false;
      try {
        assertTenantBoundary(DEMO_ORG_ID, foreignOrgId);
      } catch (e: any) {
        boundaryBlocked = e?.code === 'CROSS_TENANT_ACCESS_FORBIDDEN' && e?.status === 403;
      }
      assert.strictEqual(boundaryBlocked, true);
    });

    // 2. Durable session persistence across simulated store reload
    const s1 = issueSessionToken({ userId: 'usr-admin-01' });
    const s2 = issueSessionToken({ userId: 'usr-admin-01' });
    const sAgent1 = issueSessionToken({ userId: 'usr-r21c-agent' });
    const sAgent2 = issueSessionToken({ userId: 'usr-r21c-agent' });
    const sForeign = issueSessionToken({ userId: 'usr-r21c-foreign-admin' });

    await check('[SESS-01] Durable sessions persist to disk and survive store restart', () => {
      assert.strictEqual(fs.existsSync(sessionsPath), true, 'Session store file must exist');
      defaultSessionStore.simulateProcessRestartForTesting();
      const actor = verifySessionToken(s1.token);
      assert.strictEqual(actor.userId, 'usr-admin-01');
      assert.strictEqual(actor.organizationId, DEMO_ORG_ID);
    });

    // 3. Single-session revocation & replay rejection
    await check('[SESS-02] Single-session revocation persists and blocks replay', () => {
      assert.strictEqual(revokeSessionToken(s2.session.jti, 'test_single_revoke'), true);
      defaultSessionStore.simulateProcessRestartForTesting();
      let rejected = false;
      try {
        verifySessionToken(s2.token);
      } catch (e: any) {
        rejected = e?.code === 'SESSION_REVOKED_OR_UNKNOWN' && e?.status === 401;
      }
      assert.strictEqual(rejected, true);
      assert.strictEqual(verifySessionToken(s1.token).sessionId, s1.session.jti);
    });

    // 4. All-user-session revocation & HTTP /auth/sessions + /auth/logout-all
    await check('[SESS-03] HTTP GET /auth/sessions and POST /auth/logout-all revoke all user sessions without affecting other users', async () => {
      const listRes = await fetch(`${baseUrl}/auth/sessions`, {
        headers: { Authorization: `Bearer ${sAgent1.token}` },
      });
      assert.strictEqual(listRes.status, 200);
      const listJson = await listRes.json();
      assert.strictEqual(listJson.data.length >= 2, true);

      const logoutAllRes = await fetch(`${baseUrl}/auth/logout-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sAgent1.token}` },
      });
      assert.strictEqual(logoutAllRes.status, 200);
      const logoutAllJson = await logoutAllRes.json();
      assert.strictEqual(logoutAllJson.revokedCount >= 2, true);

      // Both sAgent1 and sAgent2 must now be rejected
      for (const tok of [sAgent1.token, sAgent2.token]) {
        let rej = false;
        try {
          verifySessionToken(tok);
        } catch (e: any) {
          rej = e?.code === 'SESSION_REVOKED_OR_UNKNOWN';
        }
        assert.strictEqual(rej, true, 'All sessions for user must be rejected after logout-all');
      }
      // Admin session s1 must still work
      assert.strictEqual(verifySessionToken(s1.token).userId, 'usr-admin-01');
    });

    // 5. Cross-tenant session revocation & user disable attack prevention
    await check('[TENANT-SESS-01] Foreign org admin is blocked (404) from revoking session or disabling user in primary org', async () => {
      const revokeForeignRes = await fetch(`${baseUrl}/auth/sessions/${s1.session.jti}/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sForeign.token}` },
      });
      assert.strictEqual(revokeForeignRes.status, 404);

      const disableForeignRes = await fetch(`${baseUrl}/users/usr-r21c-agent/status`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sForeign.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      });
      assert.strictEqual(disableForeignRes.status, 404);

      const invalidateForeignRes = await fetch(`${baseUrl}/users/usr-r21c-agent/invalidate-sessions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sForeign.token}` },
      });
      assert.strictEqual(invalidateForeignRes.status, 404);
    });

    // 6. User disable & credential-change invalidation
    await check('[SESS-04] Disabling user via POST /users/:id/status and credential invalidation revoke all tokens', async () => {
      const sAgent3 = issueSessionToken({ userId: 'usr-r21c-agent' });
      const disableRes = await fetch(`${baseUrl}/users/usr-r21c-agent/status`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${s1.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      });
      assert.strictEqual(disableRes.status, 200);
      const disableJson = await disableRes.json();
      assert.strictEqual(disableJson.data.isActive, false);

      let disabledRejected = false;
      try {
        verifySessionToken(sAgent3.token);
      } catch (e: any) {
        disabledRejected = e?.code === 'SESSION_REVOKED_OR_UNKNOWN' || e?.code === 'USER_INACTIVE_OR_DELETED';
      }
      assert.strictEqual(disabledRejected, true);

      // Re-enable user and test credentialVersion bump
      const enableRes = await fetch(`${baseUrl}/users/usr-r21c-agent/status`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${s1.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      });
      assert.strictEqual(enableRes.status, 200);

      const sAgent4 = issueSessionToken({ userId: 'usr-r21c-agent' });
      const credOutcome = invalidateUserCredentials('usr-r21c-agent', 'password_rotated');
      assert.strictEqual(credOutcome.ok, true);
      assert.strictEqual((credOutcome.credentialVersion || 0) >= 2, true);

      let credRejected = false;
      try {
        verifySessionToken(sAgent4.token);
      } catch (e: any) {
        credRejected =
          e?.code === 'SESSION_REVOKED_OR_UNKNOWN' || e?.code === 'SESSION_CREDENTIAL_CHANGED';
      }
      assert.strictEqual(credRejected, true);
    });

    // 7. Expired session cleanup preserves non-expired revoked sessions
    await check('[SESS-05] cleanupExpiredSessions removes expired entries while preserving non-expired revoked sessions', () => {
      const expiredSess = issueSessionToken({ userId: 'usr-r21c-agent', ttlMs: -5000 });
      const removed = cleanupExpiredSessions(Date.now());
      assert.strictEqual(removed >= 1, true);
      assert.strictEqual(defaultSessionStore.get(expiredSess.session.jti), undefined);
      // s2 was revoked but NOT expired, so it must still exist as revoked to reject replays
      const s2Rec = defaultSessionStore.get(s2.session.jti);
      assert.strictEqual(s2Rec?.revoked, true);
    });

    // 8. Concurrent session mutations
    await check('[SESS-06] Concurrent session issuance and revocation preserve store integrity', async () => {
      const issued = await Promise.all(
        Array.from({ length: 10 }, () => Promise.resolve().then(() => issueSessionToken({ userId: 'usr-r21c-agent' })))
      );
      await Promise.all(
        issued.slice(0, 5).map((s) => Promise.resolve().then(() => revokeSessionToken(s.session.jti, 'concurrent')))
      );
      defaultSessionStore.simulateProcessRestartForTesting();
      const remaining = listUserSessions('usr-r21c-agent', DEMO_ORG_ID, false);
      assert.strictEqual(remaining.length >= 5, true);
      for (const rev of issued.slice(0, 5)) {
        assert.strictEqual(defaultSessionStore.get(rev.session.jti)?.revoked, true);
      }
    });

    // 9. Corrupt session store fails closed
    await check('[SESS-07] Corrupted .omniflow_sessions.json fails closed with SESSION_STORE_CORRUPTED', () => {
      const backup = fs.readFileSync(sessionsPath, 'utf-8');
      fs.writeFileSync(sessionsPath, '{CORRUPT_JSON', 'utf-8');
      let failedClosed = false;
      try {
        defaultSessionStore.simulateProcessRestartForTesting();
      } catch (e: any) {
        failedClosed = e?.code === 'SESSION_STORE_CORRUPTED';
      }
      fs.writeFileSync(sessionsPath, backup, 'utf-8');
      defaultSessionStore.simulateProcessRestartForTesting();
      assert.strictEqual(failedClosed, true);
    });

    // Clean up
    revokeAllUserSessions('usr-admin-01', 'cleanup');
    revokeAllUserSessions('usr-r21c-agent', 'cleanup');
    revokeAllUserSessions('usr-r21c-foreign-admin', 'cleanup');

    console.log(`\n🎉 PERSISTENT SESSIONS & TENANT IDENTITY SUITE PASSED (${passed}/9 CHECKS)`);
  } finally {
    server.close();
    defaultSessionStore.setFilePathForTesting(null);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('❌ Persistent Sessions & Tenant Suite Failed:', err);
  process.exit(1);
});
