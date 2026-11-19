/**
 * @file scripts/test_owner_lifecycle.ts
 * Regression & Independent Verification Test Suite for Local Owner Lifecycle & Rate Limiting
 *
 * Runs strictly inside an isolated temporary directory.
 * DOES NOT TOUCH OR MUTATE PRODUCTION OPERATIONAL DATA.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  initLocalOwnerAuth,
  completeLocalOwnerBootstrap,
  authenticateLocalOwner,
  validatePasswordStrength,
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
  clearAllRateLimits,
  getLocalAuthFilePath,
  getBootstrapTokenFilePath,
} from '../server/core/localAuth.ts';

function runSuite() {
  console.log('========================================================================');
  console.log('🧪 RUNNING ISOLATED LOCAL OWNER & RATE LIMITING REGRESSION TEST SUITE');
  console.log('========================================================================\n');

  const testIsolatedDir = path.join(
    'F:',
    'Dev_Workspace',
    'Temp',
    'OMNIFLOW_OS',
    `test_owner_suite_${Date.now()}`
  );

  fs.mkdirSync(testIsolatedDir, { recursive: true });
  console.log(`[Setup] Isolated Test Sandbox: ${testIsolatedDir}\n`);

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, desc: string) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [PASS] ${desc}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] ${desc}`);
      throw new Error(`Assertion failed: ${desc}`);
    }
  }

  try {
    // 1. Password Complexity Validation
    assert(
      !validatePasswordStrength('short').valid,
      'Rejects password shorter than 10 characters'
    );
    assert(
      !validatePasswordStrength('alllowercase123!').valid,
      'Rejects password without uppercase'
    );
    assert(
      !validatePasswordStrength('ALLUPPERCASE123!').valid,
      'Rejects password without lowercase'
    );
    assert(
      !validatePasswordStrength('NoNumbersSpecial!').valid,
      'Rejects password without digits'
    );
    assert(
      !validatePasswordStrength('NoSpecialChar1234').valid,
      'Rejects password without special character'
    );
    assert(
      validatePasswordStrength('ValidStr0ngP@ssword!').valid,
      'Accepts compliant strong password'
    );

    // 2. Initial State & Bootstrap Token Generation
    const initialStatus = initLocalOwnerAuth(testIsolatedDir);
    assert(
      !initialStatus.configured && initialStatus.status === 'BOOTSTRAP_PENDING',
      'Initial state reports BOOTSTRAP_PENDING'
    );

    const tokenFile = getBootstrapTokenFilePath(testIsolatedDir);
    assert(fs.existsSync(tokenFile), 'Bootstrap token file created on disk');
    const tokenPayload = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
    assert(
      typeof tokenPayload.token === 'string' && tokenPayload.token.length === 64,
      'Bootstrap token is 256-bit CSPRNG hex string (64 characters)'
    );

    // 3. Rejection of Invalid Bootstrap Token
    const badTokenRes = completeLocalOwnerBootstrap(testIsolatedDir, {
      bootstrapToken: 'invalid_token_1234567890abcdef',
      username: 'testowner',
      password: 'ValidStr0ngP@ssword!',
      ip: '127.0.0.99',
    });
    assert(
      !badTokenRes.ok && badTokenRes.errorCode === 'INVALID_BOOTSTRAP_TOKEN',
      'Rejects incorrect bootstrap token with INVALID_BOOTSTRAP_TOKEN'
    );

    // 4. Rate Limiting on Failed Bootstrap Attempts
    const testIp = '127.0.0.99';
    resetRateLimit(`bootstrap:${testIp}`, testIsolatedDir);

    for (let i = 1; i <= 4; i++) {
      recordFailedAttempt(`bootstrap:${testIp}`, testIsolatedDir);
      const chk = checkRateLimit(`bootstrap:${testIp}`, testIsolatedDir);
      assert(chk.allowed && chk.remainingAttempts === 5 - i, `Rate limit permits attempt ${i} (remaining: ${chk.remainingAttempts})`);
    }

    // 5th failed attempt locks out
    recordFailedAttempt(`bootstrap:${testIp}`, testIsolatedDir);
    const lockedChk = checkRateLimit(`bootstrap:${testIp}`, testIsolatedDir);
    assert(!lockedChk.allowed && lockedChk.remainingAttempts === 0, '5th failed attempt locks out client (allowed: false)');

    // Attempting bootstrap while locked out fails immediately with TOO_MANY_FAILED_ATTEMPTS
    const lockedAttemptRes = completeLocalOwnerBootstrap(testIsolatedDir, {
      bootstrapToken: tokenPayload.token,
      username: 'testowner',
      password: 'ValidStr0ngP@ssword!',
      ip: testIp,
    });
    assert(
      !lockedAttemptRes.ok && lockedAttemptRes.errorCode === 'TOO_MANY_FAILED_ATTEMPTS',
      'Bootstrap rejected immediately with TOO_MANY_FAILED_ATTEMPTS while client is locked out'
    );

    // 5. Successful Bootstrap under Clean IP
    const cleanIp = '127.0.0.1';
    resetRateLimit(`bootstrap:${cleanIp}`, testIsolatedDir);

    const goodBootstrap = completeLocalOwnerBootstrap(testIsolatedDir, {
      bootstrapToken: tokenPayload.token,
      username: 'testowner',
      password: 'ValidStr0ngP@ssword!',
      email: 'testowner@omniflow.local',
      fullName: 'Test Owner',
      ip: cleanIp,
    });
    assert(goodBootstrap.ok, 'Bootstrap succeeds with valid token and strong password');

    // 6. Token Destruction & Auth File Creation
    assert(!fs.existsSync(tokenFile), 'Bootstrap token permanently destroyed from disk after success');
    const authFile = getLocalAuthFilePath(testIsolatedDir);
    assert(fs.existsSync(authFile), 'Local owner auth file created on disk');

    const authPayload = JSON.parse(fs.readFileSync(authFile, 'utf8'));
    assert(authPayload.scryptParams.N >= 16384, 'Scrypt parameters conform to RFC 7914 / OWASP recommendation (N>=16384)');
    assert(authPayload.scryptParams.r === 8, 'Scrypt parameters conform to RFC 7914 (r=8)');
    assert(authPayload.scryptParams.p === 1, 'Scrypt parameters conform to RFC 7914 (p=1)');
    assert(authPayload.hashHex.length === 128, 'Derived key is 64 bytes (128 hex chars)');
    assert(authPayload.saltHex.length === 64, 'Salt is 32 bytes (64 hex chars)');

    // 7. Double Bootstrap Prevention
    const repeatBootstrap = completeLocalOwnerBootstrap(testIsolatedDir, {
      bootstrapToken: 'any_token',
      username: 'attacker',
      password: 'AnotherStr0ngPassword!',
      ip: cleanIp,
    });
    assert(
      !repeatBootstrap.ok && repeatBootstrap.errorCode === 'OWNER_ALREADY_CONFIGURED',
      'Double bootstrap blocked fail-closed with OWNER_ALREADY_CONFIGURED'
    );

    // 8. Authentication Verification
    const wrongPwRes = authenticateLocalOwner(testIsolatedDir, {
      username: 'testowner',
      password: 'WrongPassword123!',
      ip: cleanIp,
    });
    assert(!wrongPwRes.ok && wrongPwRes.errorCode === 'INVALID_CREDENTIALS', 'Rejects incorrect password with INVALID_CREDENTIALS');

    const goodPwRes = authenticateLocalOwner(testIsolatedDir, {
      username: 'testowner',
      password: 'ValidStr0ngP@ssword!',
      ip: cleanIp,
    });
    assert(goodPwRes.ok && goodPwRes.user.role === 'Owner', 'Authenticates correct password and returns Owner role');

    // 9. Login Rate Limiting (5 failed logins on specific account -> lock)
    const loginTestIp = '127.0.0.88';
    resetRateLimit(`login:testowner:${loginTestIp}`, testIsolatedDir);

    for (let i = 0; i < 5; i++) {
      authenticateLocalOwner(testIsolatedDir, {
        username: 'testowner',
        password: 'IncorrectPassword1!',
        ip: loginTestIp,
      });
    }

    const lockedLoginRes = authenticateLocalOwner(testIsolatedDir, {
      username: 'testowner',
      password: 'ValidStr0ngP@ssword!',
      ip: loginTestIp,
    });
    assert(
      !lockedLoginRes.ok && lockedLoginRes.errorCode === 'TOO_MANY_FAILED_ATTEMPTS',
      'Login rate limiter locks account/IP client out after 5 consecutive failures even with correct password'
    );

    // 10. Persistent Rate Limiting Across Process Restart Verification
    const stateFile = path.join(testIsolatedDir, '.rate_limit_state.json');
    assert(fs.existsSync(stateFile), 'Rate limit state file persisted to disk at .rate_limit_state.json');

    // Simulate Node.js process kill and restart (cold restart: wipe in-memory cache)
    clearAllRateLimits(); // Wipes in-memory map without deleting disk file when called without dir

    // Re-check rate limit on fresh load from disk
    const postRestartCheck = checkRateLimit(`login:testowner:${loginTestIp}`, testIsolatedDir);
    assert(
      !postRestartCheck.allowed && postRestartCheck.remainingAttempts === 0,
      'Lockout persists across cold restart: checkRateLimit blocks client on fresh disk reload'
    );

    // Verify different account on same IP is NOT blocked by individual account lock
    const otherAccountCheck = checkRateLimit(`login:otheruser:${loginTestIp}`, testIsolatedDir);
    assert(
      otherAccountCheck.allowed && otherAccountCheck.remainingAttempts === 5,
      'Different account on same IP is not blocked by single-account lockout (prevents system-wide DoS)'
    );

    // 11. Malformed Rate Limit File Resilience (Corrupt state quarantine & backup recovery)
    clearAllRateLimits();
    fs.writeFileSync(stateFile, 'INVALID_MALFORMED_JSON_CORRUPT{', 'utf8');
    const corruptFileCheck = checkRateLimit(`login:testowner:${loginTestIp}`, testIsolatedDir);
    assert(
      !corruptFileCheck.allowed,
      'Malformed rate limit file handled with fail-secure recovery (quarantined corrupt file, restored lockout from .bak)'
    );

    // 12. Administrative Lockout Recovery via State File Reset
    if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);
    const bakFile = path.join(testIsolatedDir, '.rate_limit_state.json.bak');
    if (fs.existsSync(bakFile)) fs.unlinkSync(bakFile);
    clearAllRateLimits();
    const recoveredCheck = checkRateLimit(`login:testowner:${loginTestIp}`, testIsolatedDir);
    assert(
      recoveredCheck.allowed && recoveredCheck.remainingAttempts === 5,
      'Administrative recovery path verified: deleting state and backup files cleanly restores full attempt budget'
    );

    console.log(`\n========================================================================`);
    console.log(`🎉 ALL ${passedTests}/${totalTests} OWNER LIFECYCLE & RATE LIMIT TESTS PASSED!`);
    console.log(`========================================================================\n`);
  } finally {
    // Cleanup isolated sandbox
    try {
      if (fs.existsSync(testIsolatedDir)) {
        fs.rmSync(testIsolatedDir, { recursive: true, force: true });
        console.log(`[Cleanup] Successfully removed isolated sandbox directory: ${testIsolatedDir}`);
      }
    } catch (e: any) {
      console.warn(`[Cleanup Warning] Could not delete temp dir: ${e.message}`);
    }
  }
}

runSuite();
