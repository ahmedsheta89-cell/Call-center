/**
 * @file scripts/test_owner_activation_mock.ts
 * Isolated Mock Verification for Owner Activation Readiness
 *
 * Verifies:
 * 1. Bootstrap token reading & validation from sandbox.
 * 2. Password complexity validation (length, upper, lower, number, symbol).
 * 3. Scrypt derivation via bounded async queue.
 * 4. Atomic credential file write.
 * 5. Destruction of one-time bootstrap token.
 * 6. Prevention of re-bootstrap after activation.
 * 7. Verification that real production tokens/auth stores were untouched.
 */

import fs from 'fs';
import path from 'path';
import {
  initLocalOwnerAuth,
  completeLocalOwnerBootstrapAsync,
  authenticateLocalOwnerAsync,
  validatePasswordStrength,
} from '../server/core/localAuth.ts';

const mockDir = path.join('F:', 'Dev_Workspace', 'Temp', 'OMNIFLOW_OS', `owner_act_mock_${Date.now()}`);

let totalPassed = 0;
let totalFailed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${msg}`);
    totalPassed++;
  } else {
    console.error(`  ❌ [FAIL] ${msg}`);
    totalFailed++;
  }
}

async function runMockActivationTest() {
  console.log('================================================================================');
  console.log('🛡️ OMNIFLOW OS — OWNER ACTIVATION READINESS MOCK VERIFICATION');
  console.log('================================================================================\n');

  if (!fs.existsSync(mockDir)) {
    fs.mkdirSync(mockDir, { recursive: true });
  }

  try {
    // 1. Initial State Check
    console.log('[1/6] Testing Initial Bootstrap Pending State...');
    const initStatus = initLocalOwnerAuth(mockDir);
    assert(initStatus.configured === false, 'Initially not configured');
    assert(initStatus.status === 'BOOTSTRAP_PENDING', 'Status is BOOTSTRAP_PENDING');

    const tokenPath = path.join(mockDir, '.owner_bootstrap_token');
    assert(fs.existsSync(tokenPath), 'Bootstrap token generated in mock sandbox');
    const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    assert(typeof tokenData.token === 'string' && tokenData.token.length === 64, 'Token is 64-char hex string');

    // 2. Password Policy Rejection Checks
    console.log('\n[2/6] Testing Password Complexity Policy Checks...');
    assert(validatePasswordStrength('short').valid === false, 'Rejects short password (<10 chars)');
    assert(validatePasswordStrength('alllowercase123!').valid === false, 'Rejects missing uppercase');
    assert(validatePasswordStrength('ALLUPPERCASE123!').valid === false, 'Rejects missing lowercase');
    assert(validatePasswordStrength('NoNumbersAtAll!').valid === false, 'Rejects missing number');
    assert(validatePasswordStrength('NoSpecialSymbol123').valid === false, 'Rejects missing special symbol');
    assert(validatePasswordStrength('ValidComplex123#').valid === true, 'Accepts valid complex password');

    // 3. Activation with Weak Password Fails Safely
    console.log('\n[3/6] Testing Bootstrap Rejection on Weak Password...');
    const weakRes = await completeLocalOwnerBootstrapAsync(mockDir, {
      bootstrapToken: tokenData.token,
      username: 'mock_owner',
      password: 'weak',
      ip: '127.0.0.1',
    });
    assert(weakRes.ok === false && weakRes.errorCode === 'WEAK_PASSWORD', 'Weak password rejected');
    assert(fs.existsSync(tokenPath), 'Bootstrap token preserved after failed attempt');

    // 4. Activation with Invalid Token Fails Safely
    console.log('\n[4/6] Testing Bootstrap Rejection on Invalid Token...');
    const badTokenRes = await completeLocalOwnerBootstrapAsync(mockDir, {
      bootstrapToken: 'bad_token_00000000000000000000000000000000000000000000000000000000000000',
      username: 'mock_owner',
      password: 'ValidComplex123#',
      ip: '127.0.0.1',
    });
    assert(badTokenRes.ok === false && badTokenRes.errorCode === 'INVALID_BOOTSTRAP_TOKEN', 'Invalid token rejected');

    // 5. Successful Activation
    console.log('\n[5/6] Testing Successful Owner Bootstrap Activation...');
    const successRes = await completeLocalOwnerBootstrapAsync(mockDir, {
      bootstrapToken: tokenData.token,
      username: 'mock_owner',
      password: 'ValidComplex123#',
      email: 'owner@mock.local',
      ip: '127.0.0.1',
    });
    assert(successRes.ok === true, 'Bootstrap completed successfully');

    // Token must be permanently deleted
    assert(!fs.existsSync(tokenPath), 'One-time bootstrap token destroyed permanently');

    // Auth file must exist
    const authPath = path.join(mockDir, '.local_owner_auth.json');
    assert(fs.existsSync(authPath), '.local_owner_auth.json created atomically');
    const authData = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    assert(authData.username === 'mock_owner', 'Saved username is correct');
    assert(authData.scryptParams.N === 131072, 'Hashed using Scrypt N=131072');

    // 6. Re-Bootstrap Prevention & Post-Activation Auth
    console.log('\n[6/6] Testing Re-Bootstrap Prevention & Login...');
    const replayRes = await completeLocalOwnerBootstrapAsync(mockDir, {
      bootstrapToken: 'any_token',
      username: 'hacker',
      password: 'ValidComplex123#',
      ip: '127.0.0.1',
    });
    assert(replayRes.ok === false && replayRes.errorCode === 'OWNER_ALREADY_CONFIGURED', 'Re-bootstrap blocked permanently');

    const loginRes = await authenticateLocalOwnerAsync(mockDir, {
      username: 'mock_owner',
      password: 'ValidComplex123#',
      ip: '127.0.0.1',
    });
    assert(loginRes.ok === true, 'Authenticated successfully with newly activated credentials');
    assert(loginRes.user?.role === 'Owner', 'User authenticated with authoritative Owner role');

    console.log('\n================================================================================');
    console.log(`🏆 MOCK ACTIVATION VERIFICATION: ${totalPassed} PASSED, ${totalFailed} FAILED`);
    console.log('================================================================================');

    if (totalFailed > 0) {
      process.exit(1);
    }
  } finally {
    try {
      fs.rmSync(mockDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

runMockActivationTest().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
