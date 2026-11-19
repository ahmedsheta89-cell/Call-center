/**
 * @file scripts/activate_owner.ts
 * Interactive Local Owner Secure Activation Tool
 *
 * Prompts the operator directly on the local terminal for their secret password
 * with masked input (echo muted). The password is NEVER written to logs, NEVER
 * stored in plaintext, and NEVER transmitted over the network.
 */

import readline from 'readline';
import fs from 'fs';
import path from 'path';
import {
  initLocalOwnerAuth,
  completeLocalOwnerBootstrap,
  authenticateLocalOwner,
  validatePasswordStrength,
  getLocalAuthFilePath,
  getBootstrapTokenFilePath,
} from '../server/core/localAuth.ts';
import { resolveDurableDataPath } from '../server/db/localPersistenceEngine.ts';

function askHidden(query: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(query);
    const stdin = process.stdin;
    let password = '';

    const isTTY = Boolean(stdin.isTTY);
    if (isTTY && typeof stdin.setRawMode === 'function') {
      stdin.setRawMode(true);
    }
    stdin.resume();

    const onData = (chunk: Buffer) => {
      const str = chunk.toString('utf-8');
      for (const c of str) {
        if (c === '\r' || c === '\n' || c === '\u0004') {
          cleanup();
          process.stdout.write('\n');
          resolve(password);
          return;
        } else if (c === '\u0003') {
          // Ctrl+C
          cleanup();
          process.stdout.write('\n[Aborted by user]\n');
          process.exit(1);
        } else if (c === '\u0008' || c === '\x7f') {
          // Backspace
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else {
          password += c;
          process.stdout.write('*');
        }
      }
    };

    const cleanup = () => {
      stdin.removeListener('data', onData);
      if (isTTY && typeof stdin.setRawMode === 'function') {
        stdin.setRawMode(false);
      }
      stdin.pause();
    };

    stdin.on('data', onData);
  });
}

function ask(query: string, defaultValue = ''): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

async function runOwnerActivation() {
  console.log('========================================================================');
  console.log('🛡️  OMNIFLOW OS — SECURE LOCAL OWNER ACTIVATION CLI');
  console.log('========================================================================\n');

  const dataPathRes = resolveDurableDataPath();
  if (!dataPathRes.ok || !dataPathRes.dirPath) {
    console.error(`[Error] Failed to resolve durable data path: ${dataPathRes.errorMessage}`);
    process.exit(1);
  }
  const dataDir = dataPathRes.dirPath;

  const authFile = getLocalAuthFilePath(dataDir);
  const tokenFile = getBootstrapTokenFilePath(dataDir);

  if (fs.existsSync(authFile)) {
    console.log('ℹ️  A local Owner account is ALREADY ACTIVATED on this system.');
    console.log(`   Credential store: ${authFile}`);
    console.log(`   Status: OWNER_ACTIVATED\n`);
    console.log('If you need to re-initialize the Owner, you must intentionally reset');
    console.log('the credentials file via explicit administrator action.\n');
    process.exit(0);
  }

  // Ensure bootstrap token exists
  let status = initLocalOwnerAuth(dataDir);
  if (!fs.existsSync(tokenFile)) {
    console.error('[Error] Could not locate or generate one-time bootstrap token.');
    process.exit(1);
  }

  const tokenPayload = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
  const bootstrapToken = tokenPayload.token;

  console.log('✅ Found active one-time bootstrap token.');
  console.log('Please enter the configuration details for your local Owner account:\n');

  const username = await ask('  Enter Owner Username [default: owner]: ', 'owner');
  const email = await ask('  Enter Owner Email [default: owner@omniflow.local]: ', 'owner@omniflow.local');
  const fullName = await ask('  Enter Owner Full Name [default: System Owner]: ', 'System Owner');

  console.log('\n  Password Policy:');
  console.log('   - Minimum 10 characters');
  console.log('   - At least 1 uppercase letter (A-Z)');
  console.log('   - At least 1 lowercase letter (a-z)');
  console.log('   - At least 1 number (0-9)');
  console.log('   - At least 1 special character (!@#$%^&*...)\n');

  let password = '';
  let confirmedPassword = '';

  while (true) {
    password = await askHidden('  Enter Secret Password: ');
    const check = validatePasswordStrength(password);
    if (!check.valid) {
      console.log(`  ❌ ${check.reason} Please try again.\n`);
      continue;
    }

    confirmedPassword = await askHidden('  Confirm Secret Password: ');
    if (password !== confirmedPassword) {
      console.log('  ❌ Passwords do not match. Please try again.\n');
      continue;
    }
    break;
  }

  console.log('\n⏳ Deriving scrypt hash (RFC 7914; N=16384, r=8, p=1) and saving...');
  const outcome = completeLocalOwnerBootstrap(dataDir, {
    bootstrapToken,
    username,
    password,
    email,
    fullName,
    ip: '127.0.0.1',
  });

  if (!outcome.ok) {
    console.error(`\n❌ Activation failed: ${outcome.errorCode} - ${outcome.errorMessage}`);
    process.exit(1);
  }

  // Verify authentication immediately
  const verifyLogin = authenticateLocalOwner(dataDir, {
    username,
    password,
    ip: '127.0.0.1',
  });

  // Zero-out password variable references
  password = '';
  confirmedPassword = '';

  if (!verifyLogin.ok) {
    console.error(`\n❌ Post-activation login verification failed: ${verifyLogin.errorMessage}`);
    process.exit(1);
  }

  console.log('\n========================================================================');
  console.log('🎉 LOCAL OWNER SUCCESSFULLY ACTIVATED & VERIFIED!');
  console.log('========================================================================');
  console.log(`  User ID:   ${verifyLogin.user.id}`);
  console.log(`  Username:  ${username}`);
  console.log(`  Role:      ${verifyLogin.user.role}`);
  console.log(`  Status:    OWNER_LOGIN_VERIFIED`);
  console.log('========================================================================\n');
  console.log('You can now start the server with:');
  console.log('  npm run dev   (Development Mode)');
  console.log('  npm start     (Production Bundle)\n');
}

runOwnerActivation();
