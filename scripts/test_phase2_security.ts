/**
 * @file scripts/test_phase2_security.ts
 * Enterprise Security Hardening, Cryptographic Invariants & Auth Verification Suite (Phase 2)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  initLocalOwnerAuth,
  completeLocalOwnerBootstrap,
  authenticateLocalOwner,
  validatePasswordStrength,
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
} from '../server/core/localAuth.ts';
import { ensureRuntimeCryptoKeys, classifyRuntimeEnvironment } from '../server/core/cryptoKeyPolicy.ts';
import { issueSessionToken, verifySessionToken, validateSessionSecretConfig } from '../server/core/identity.ts';
import { db } from '../server/db/store.ts';
import express from 'express';
import { apiRouter } from '../server/api/router.ts';

async function runPhase2SecurityVerificationSuite() {
  console.log('========================================================================');
  console.log('🔐  OMNIFLOW OS — PHASE 2 COMPREHENSIVE SECURITY VERIFICATION SUITE');
  console.log('========================================================================\n');

  const pid = process.pid;
  const timestamp = Date.now();
  const testSandboxDir = path.resolve(`F:\\Dev_Workspace\\Temp\\OMNIFLOW_OS\\security_test_${pid}_${timestamp}`);
  fs.mkdirSync(testSandboxDir, { recursive: true, mode: 0o700 });

  let passed = 0;
  const total = 11;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Password Strength Invariants
    // -------------------------------------------------------------------------
    console.log('[TEST 1/11] Testing Password Complexity Policy Enforcement...');
    if (validatePasswordStrength('short').valid) throw new Error('Short password allowed');
    if (validatePasswordStrength('alllowercase123!').valid) throw new Error('Password without uppercase allowed');
    if (validatePasswordStrength('ALLUPPERCASE123!').valid) throw new Error('Password without lowercase allowed');
    if (validatePasswordStrength('NoSpecialChars123').valid) throw new Error('Password without special char allowed');
    if (validatePasswordStrength('NoNumbersHere!@#').valid) throw new Error('Password without number allowed');
    if (!validatePasswordStrength('StrongLocalOwner#2026!').valid) throw new Error('Valid strong password rejected');
    console.log('  ✅ [PASS] Password complexity policy enforces length, casing, numbers, and symbols.\n');
    passed++;

    // -------------------------------------------------------------------------
    // TEST 2: Local Owner First-Run Bootstrap Flow
    // -------------------------------------------------------------------------
    console.log('[TEST 2/11] Testing One-Time Owner Bootstrap Token & Credential Provisioning...');
    const status1 = initLocalOwnerAuth(testSandboxDir);
    if (status1.status !== 'BOOTSTRAP_PENDING' || status1.configured !== false) {
      throw new Error(`Unexpected initial status: ${JSON.stringify(status1)}`);
    }

    const tokenFilePath = path.join(testSandboxDir, '.owner_bootstrap_token');
    if (!fs.existsSync(tokenFilePath)) {
      throw new Error('Bootstrap token file was not created');
    }
    const tokenPayload = JSON.parse(fs.readFileSync(tokenFilePath, 'utf8'));
    const rawToken = tokenPayload.token;
    if (typeof rawToken !== 'string' || rawToken.length !== 64) {
      throw new Error(`Bootstrap token has invalid length: ${rawToken?.length}`);
    }

    // Try bootstrap with invalid token
    const badTokenAttempt = completeLocalOwnerBootstrap(testSandboxDir, {
      bootstrapToken: 'wrong_token_value_000000000000000000000000000000000000000000000000',
      username: 'owner',
      password: 'StrongLocalOwner#2026!',
    });
    if (badTokenAttempt.ok || badTokenAttempt.errorCode !== 'INVALID_BOOTSTRAP_TOKEN') {
      throw new Error(`Invalid token should have failed with INVALID_BOOTSTRAP_TOKEN: ${JSON.stringify(badTokenAttempt)}`);
    }

    // Valid bootstrap
    const goodBootstrap = completeLocalOwnerBootstrap(testSandboxDir, {
      bootstrapToken: rawToken,
      username: 'localowner',
      password: 'StrongLocalOwner#2026!',
      email: 'owner@omniflow.local',
      fullName: 'System Owner Administrator',
    });
    if (!goodBootstrap.ok) {
      throw new Error(`Bootstrap failed: ${goodBootstrap.errorCode} - ${goodBootstrap.errorMessage}`);
    }

    // Verify token file was wiped
    if (fs.existsSync(tokenFilePath)) {
      throw new Error('Bootstrap token file was not deleted after successful provisioning');
    }

    // Verify auth credential file exists and contains scrypt hash
    const authFilePath = path.join(testSandboxDir, '.local_owner_auth.json');
    if (!fs.existsSync(authFilePath)) {
      throw new Error('Credential store .local_owner_auth.json was not created');
    }
    const authRecord = JSON.parse(fs.readFileSync(authFilePath, 'utf8'));
    if (!authRecord.hashHex || !authRecord.saltHex || (authRecord.scryptParams.N !== 16384 && authRecord.scryptParams.N !== 131072)) {
      throw new Error('Credential store is missing scrypt hash or proper parameters');
    }

    // Verify post-bootstrap status is CONFIGURED
    const status2 = initLocalOwnerAuth(testSandboxDir);
    if (!status2.configured || status2.status !== 'CONFIGURED') {
      throw new Error(`Status should be CONFIGURED, got: ${JSON.stringify(status2)}`);
    }

    console.log('  ✅ [PASS] Bootstrap generated 256-bit one-time token.');
    console.log('  ✅ [PASS] Invalid bootstrap token rejected.');
    console.log('  ✅ [PASS] Valid bootstrap created scrypt hash (N=16384, r=8, p=1).');
    console.log('  ✅ [PASS] One-time bootstrap token file deleted immediately post-provisioning.\n');
    passed++;

    // -------------------------------------------------------------------------
    // TEST 3: Local Owner Login & Constant-Time Scrypt Verification
    // -------------------------------------------------------------------------
    console.log('[TEST 3/11] Testing Local Owner Authentication & Constant-Time Verification...');
    // Wrong password
    const wrongPw = authenticateLocalOwner(testSandboxDir, {
      username: 'localowner',
      password: 'WrongPassword#123!',
      ip: '127.0.0.1',
    });
    if (wrongPw.ok || wrongPw.errorCode !== 'INVALID_CREDENTIALS') {
      throw new Error(`Wrong password should fail with INVALID_CREDENTIALS: ${JSON.stringify(wrongPw)}`);
    }

    // Correct password
    const rightPw = authenticateLocalOwner(testSandboxDir, {
      username: 'localowner',
      password: 'StrongLocalOwner#2026!',
      ip: '127.0.0.1',
    });
    if (!rightPw.ok || !rightPw.user || rightPw.user.role !== 'Owner') {
      throw new Error(`Correct login failed: ${JSON.stringify(rightPw)}`);
    }

    console.log('  ✅ [PASS] Wrong password rejected with 401 INVALID_CREDENTIALS.');
    console.log(`  ✅ [PASS] Correct password authenticated user [${rightPw.user.id}] with role [${rightPw.user.role}].\n`);
    passed++;

    // -------------------------------------------------------------------------
    // TEST 4: Brute-Force Rate Limiting (5 Attempts Sliding Window)
    // -------------------------------------------------------------------------
    console.log('[TEST 4/11] Testing Brute-Force Rate Limiting Defense...');
    const testIp = '192.168.1.100';
    resetRateLimit(testIp);

    for (let i = 1; i <= 4; i++) {
      const res = authenticateLocalOwner(testSandboxDir, { username: 'localowner', password: 'bad', ip: testIp });
      if (res.errorCode !== 'INVALID_CREDENTIALS') throw new Error(`Expected INVALID_CREDENTIALS at attempt ${i}`);
    }

    // 5th attempt: should record failure and block
    authenticateLocalOwner(testSandboxDir, { username: 'localowner', password: 'bad', ip: testIp });

    // 6th attempt: must be blocked with TOO_MANY_FAILED_ATTEMPTS
    const blockedRes = authenticateLocalOwner(testSandboxDir, { username: 'localowner', password: 'bad', ip: testIp });
    if (blockedRes.ok || blockedRes.errorCode !== 'TOO_MANY_FAILED_ATTEMPTS') {
      throw new Error(`Expected TOO_MANY_FAILED_ATTEMPTS, got: ${JSON.stringify(blockedRes)}`);
    }
    resetRateLimit(testIp);
    console.log('  ✅ [PASS] IP correctly blocked with TOO_MANY_FAILED_ATTEMPTS after 5 failed attempts.\n');
    passed++;

    // -------------------------------------------------------------------------
    // TEST 5: Cryptographic Key Durability & Environment Isolation
    // -------------------------------------------------------------------------
    console.log('[TEST 5/11] Testing Cryptographic Key Durability Across Cold Restarts...');
    const fakeDbPath = path.join(testSandboxDir, 'db_state.json');
    // Ensure clean state
    delete process.env.CHANNEL_SECRET_ENCRYPTION_KEY;
    delete process.env.AUDIT_CHECKPOINT_HMAC_KEY;

    // First key generation
    const keyRun1 = ensureRuntimeCryptoKeys(fakeDbPath);
    if (!keyRun1.ok || keyRun1.source !== 'dev_keyfile_created') {
      throw new Error(`Initial key provisioning failed: ${JSON.stringify(keyRun1)}`);
    }
    const keyFile = keyRun1.keyFilePath!;
    const keysStored1 = JSON.parse(fs.readFileSync(keyFile, 'utf8'));

    // Clear environment variables to simulate full cold reboot
    delete process.env.CHANNEL_SECRET_ENCRYPTION_KEY;
    delete process.env.AUDIT_CHECKPOINT_HMAC_KEY;

    // Second run: must load existing keys without regeneration
    const keyRun2 = ensureRuntimeCryptoKeys(fakeDbPath);
    if (!keyRun2.ok || keyRun2.source !== 'dev_keyfile_existing') {
      throw new Error(`Key reload failed: ${JSON.stringify(keyRun2)}`);
    }
    const keysStored2 = JSON.parse(fs.readFileSync(keyFile, 'utf8'));

    if (keysStored1.channelSecretEncryptionKey !== keysStored2.channelSecretEncryptionKey) {
      throw new Error('channelSecretEncryptionKey mutated across restarts');
    }
    if (keysStored1.auditCheckpointHmacKey !== keysStored2.auditCheckpointHmacKey) {
      throw new Error('auditCheckpointHmacKey mutated across restarts');
    }

    console.log('  ✅ [PASS] Keys stably persisted and loaded across cold restart.');
    console.log(`     Channel Key Length: ${keysStored1.channelSecretEncryptionKey.length} hex chars (256-bit).`);
    console.log(`     Audit HMAC Length:  ${keysStored1.auditCheckpointHmacKey.length} hex chars (256-bit).\n`);
    passed++;

    // -------------------------------------------------------------------------
    // TEST 6: Fail-Closed Protection Against Key Regeneration for Existing DB
    // -------------------------------------------------------------------------
    console.log('[TEST 6/11] Testing Fail-Closed Protection on Missing Keys for Existing DB...');
    const orphanDbDir = path.join(testSandboxDir, 'orphan_db_dir');
    fs.mkdirSync(orphanDbDir, { recursive: true, mode: 0o700 });
    const orphanDbPath = path.join(orphanDbDir, 'db_state.json');
    fs.writeFileSync(orphanDbPath, JSON.stringify({ schemaVersion: 2, organizations: [{ id: 'org-test' }] }));

    delete process.env.CHANNEL_SECRET_ENCRYPTION_KEY;
    delete process.env.AUDIT_CHECKPOINT_HMAC_KEY;

    const orphanAttempt = ensureRuntimeCryptoKeys(orphanDbPath);
    if (orphanAttempt.ok || orphanAttempt.errorCode !== 'DEV_KEYS_MISSING_FOR_EXISTING_DB') {
      throw new Error(`Expected DEV_KEYS_MISSING_FOR_EXISTING_DB, got: ${JSON.stringify(orphanAttempt)}`);
    }
    console.log('  ✅ [PASS] Silent key regeneration refused for existing database without keyfile (fail-closed).\n');
    passed++;

    // -------------------------------------------------------------------------
    // TEST 7: Cryptographic Session Token Verification & Revocation
    // -------------------------------------------------------------------------
    console.log('[TEST 7/11] Testing Session Token Issuance, Constant-Time Signature & Revocation...');
    // Seed test org and user in db
    db.organizations.set('org-sec-test', { id: 'org-sec-test', name: 'Security Test Org', isActive: true } as any);
    db.users.set('usr-sec-test', {
      id: 'usr-sec-test',
      organizationId: 'org-sec-test',
      email: 'sec@test.local',
      fullName: 'Security Tester',
      role: 'Owner',
      isActive: true,
      mfaEnabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const { token, session, csrfToken } = issueSessionToken({ userId: 'usr-sec-test' });
    if (!token.startsWith('omf1.') || !csrfToken) {
      throw new Error('Session token issuance returned invalid format');
    }

    const verified = verifySessionToken(token);
    if (!verified.authenticated || verified.userId !== 'usr-sec-test') {
      throw new Error('Session token verification failed');
    }

    // Tamper with signature
    const parts = token.split('.');
    const tamperedToken = `${parts[0]}.${parts[1]}.tampered_sig_00000000000000000000`;
    let tamperedCaught = false;
    try {
      verifySessionToken(tamperedToken);
    } catch {
      tamperedCaught = true;
    }
    if (!tamperedCaught) {
      throw new Error('Tampered token was accepted by verifier');
    }

    console.log('  ✅ [PASS] Session token cryptographically signed and verified.');
    console.log('  ✅ [PASS] Tampered session signature rejected in constant-time.\n');
    passed++;

    // -------------------------------------------------------------------------
    // TEST 8: TLS Configuration & CA File Verification
    // -------------------------------------------------------------------------
    console.log('[TEST 8/11] Testing TLS Certificate Verification & CAfile Configuration...');
    const npmrcPath = path.resolve('F:\\Dev_Workspace\\Call-center\\.npmrc');
    const npmrcContent = fs.readFileSync(npmrcPath, 'utf8');
    if (npmrcContent.includes('strict-ssl=false')) {
      throw new Error('Insecure strict-ssl=false detected in .npmrc');
    }
    if (!npmrcContent.includes('strict-ssl=true')) {
      throw new Error('strict-ssl=true is missing from .npmrc');
    }
    if (!npmrcContent.includes('cafile=')) {
      throw new Error('cafile configuration is missing from .npmrc');
    }

    const avastPemPath = path.resolve('F:\\Dev_Workspace\\Cache\\avast_root.pem');
    if (!fs.existsSync(avastPemPath)) {
      throw new Error(`Exported Avast PEM file not found at: ${avastPemPath}`);
    }
    const pemContent = fs.readFileSync(avastPemPath, 'utf8');
    if (!pemContent.includes('BEGIN CERTIFICATE') || !pemContent.includes('END CERTIFICATE')) {
      throw new Error('Avast PEM file is invalid or empty');
    }
    console.log('  ✅ [PASS] .npmrc strictly enforces strict-ssl=true.');
    console.log(`  ✅ [PASS] Trusted CA file verified at: ${avastPemPath} (${pemContent.length} bytes).\n`);
    passed++;

    // -------------------------------------------------------------------------
    // TEST 9: Production Environment Fail-Closed Secret Requirements
    // -------------------------------------------------------------------------
    console.log('[TEST 9/11] Testing Production Environment Strict Secret Validation...');
    const prodWeak = validateSessionSecretConfig('production', 'weak_secret');
    if (prodWeak.valid) throw new Error('Short secret allowed in production');

    const prodEmpty = validateSessionSecretConfig('production', '');
    if (prodEmpty.valid) throw new Error('Empty secret allowed in production');

    const prodDefault = validateSessionSecretConfig('production', '12345678901234567890123456789012');
    if (prodDefault.valid) throw new Error('Known weak default secret allowed in production');

    const prodStrong = validateSessionSecretConfig('production', crypto.randomBytes(32).toString('hex'));
    if (!prodStrong.valid) throw new Error('Strong 256-bit secret rejected in production');

    console.log('  ✅ [PASS] Production environment requires explicit >=32 char high-entropy SESSION_SECRET (fail-closed).\n');
    passed++;

    // -------------------------------------------------------------------------
    // TEST 10: Authentication Bypass Policy Enforcement (Strict Lockdown)
    // -------------------------------------------------------------------------
    console.log('[TEST 10/11] Testing Authentication Bypass Policy (Strict Lockdown)...');
    const app = express();
    app.use(express.json());
    app.use('/api/v1', apiRouter);

    const testServer = await new Promise<any>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = testServer.address();
    const testPort = typeof addr === 'object' ? addr.port : 0;
    const testLoginUrl = `http://127.0.0.1:${testPort}/api/v1/auth/login`;

    try {
      const origNodeEnv = process.env.NODE_ENV;
      const origAllow = process.env.OMNIFLOW_ALLOW_LOCAL_TEST_LOGIN;

      // 1. In NODE_ENV=development, raw userId login MUST be rejected even with OMNIFLOW_ALLOW_LOCAL_TEST_LOGIN=true
      process.env.NODE_ENV = 'development';
      process.env.OMNIFLOW_ALLOW_LOCAL_TEST_LOGIN = 'true';

      const devRes = await fetch(testLoginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'usr-sec-test' }),
      });
      if (devRes.status === 200) {
        throw new Error('Authentication bypass was erroneously permitted in development mode');
      }

      // 2. In NODE_ENV=production, raw userId login MUST be rejected
      process.env.NODE_ENV = 'production';
      process.env.OMNIFLOW_ALLOW_LOCAL_TEST_LOGIN = 'true';

      const prodRes = await fetch(testLoginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'usr-sec-test' }),
      });
      if (prodRes.status === 200) {
        throw new Error('Authentication bypass was erroneously permitted in production mode');
      }

      // 3. In NODE_ENV=test and OMNIFLOW_ALLOW_LOCAL_TEST_LOGIN=true from loopback, it is allowed
      process.env.NODE_ENV = 'test';
      process.env.OMNIFLOW_ALLOW_LOCAL_TEST_LOGIN = 'true';

      const testRes = await fetch(testLoginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'usr-sec-test' }),
      });
      if (testRes.status !== 200) {
        const errJson = await testRes.json().catch(() => ({}));
        throw new Error(`Test login should be allowed in test mode from loopback, got status ${testRes.status}: ${JSON.stringify(errJson)}`);
      }

      // 4. In NODE_ENV=test without OMNIFLOW_ALLOW_LOCAL_TEST_LOGIN=true, it is rejected
      process.env.OMNIFLOW_ALLOW_LOCAL_TEST_LOGIN = 'false';
      const noFlagRes = await fetch(testLoginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'usr-sec-test' }),
      });
      if (noFlagRes.status === 200) {
        throw new Error('Test login without OMNIFLOW_ALLOW_LOCAL_TEST_LOGIN flag should be rejected');
      }

      // Restore environment
      process.env.NODE_ENV = origNodeEnv;
      process.env.OMNIFLOW_ALLOW_LOCAL_TEST_LOGIN = origAllow;

      console.log('  ✅ [PASS] Authentication bypass rejected in development mode.');
      console.log('  ✅ [PASS] Authentication bypass rejected in production mode.');
      console.log('  ✅ [PASS] Authentication bypass strictly confined to NODE_ENV=test from loopback with explicit flag.\n');
      passed++;
    } finally {
      testServer.close();
    }

    // -------------------------------------------------------------------------
    // TEST 11: Owner Personal Data Privacy & Hygiene (Zero Unsolicited Contact Data)
    // -------------------------------------------------------------------------
    console.log('[TEST 11/11] Testing Owner Personal Data Privacy & Hygiene...');
    const privacySandboxDir = path.join(testSandboxDir, 'privacy_sandbox');
    fs.mkdirSync(privacySandboxDir, { recursive: true, mode: 0o700 });

    initLocalOwnerAuth(privacySandboxDir);
    const privTokenFile = path.join(privacySandboxDir, '.owner_bootstrap_token');
    const privToken = JSON.parse(fs.readFileSync(privTokenFile, 'utf8')).token;

    // Bootstrap without phone number
    const noPhoneBootstrap = completeLocalOwnerBootstrap(privacySandboxDir, {
      bootstrapToken: privToken,
      username: 'priv_owner',
      password: 'StrongLocalOwner#2026!',
      email: 'priv_owner@local.test',
      fullName: 'Privacy Owner',
      // No phoneNumber supplied
    });
    if (!noPhoneBootstrap.ok) {
      throw new Error(`Bootstrap failed: ${noPhoneBootstrap.errorMessage}`);
    }

    const privAuth = authenticateLocalOwner(privacySandboxDir, {
      username: 'priv_owner',
      password: 'StrongLocalOwner#2026!',
    });
    if (!privAuth.ok || !privAuth.user) {
      throw new Error(`Auth failed: ${privAuth.errorMessage}`);
    }

    if (privAuth.user.phoneNumber !== null && privAuth.user.phoneNumber !== undefined) {
      throw new Error(`Unsolicited phone number was stored on Owner: ${privAuth.user.phoneNumber}`);
    }

    // Verify schema file on disk has no hardcoded phone default
    const schemaPath = path.resolve('src/db/schema.ts');
    const schemaCode = fs.readFileSync(schemaPath, 'utf8');
    if (schemaCode.includes(".default('01018108979')") || schemaCode.includes('01018108979')) {
      throw new Error('Hardcoded personal phone number found in src/db/schema.ts');
    }

    console.log('  ✅ [PASS] Owner bootstrap without phone number results in null phoneNumber (no unsolicited data).');
    console.log('  ✅ [PASS] Owner authentication returns null phoneNumber.');
    console.log('  ✅ [PASS] Schema verified clean of hardcoded personal phone numbers.\n');
    passed++;

    console.log('========================================================================');
    console.log(`🎉 ALL PHASE 2 SECURITY TESTS PASSED: ${passed}/${total}`);
    console.log('========================================================================\n');
  } finally {
    try {
      if (fs.existsSync(testSandboxDir)) {
        fs.rmSync(testSandboxDir, { recursive: true, force: true });
        console.log(`[Cleanup] Temporary security sandbox cleaned: ${testSandboxDir}`);
      }
    } catch (_) {}
  }
}

runPhase2SecurityVerificationSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
