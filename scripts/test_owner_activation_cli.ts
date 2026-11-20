/**
 * @file scripts/test_owner_activation_cli.ts
 * Security Verification for scripts/activate_owner.ts TTY Gates & Safety Controls
 *
 * Verifies:
 * 1. CLI rejects execution when stdin is not a TTY (piped/redirected stdin).
 * 2. CLI exits with code 1 and outputs SECURITY ABORT message when non-interactive.
 * 3. CLI prevents automated/piped credential leakage into background processes.
 */

import { spawnSync } from 'child_process';
import path from 'path';

console.log('================================================================================');
console.log('🛡️ OMNIFLOW OS — OWNER ACTIVATION CLI TTY SECURITY TEST');
console.log('================================================================================\n');

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${msg}`);
    failed++;
  }
}

// -----------------------------------------------------------------------------
// Test 1: Piped stdin execution must abort immediately with code 1
// -----------------------------------------------------------------------------
console.log('[Test 1] Spawning activate_owner with piped stdin (non-interactive)...');
const cliScript = path.resolve('scripts/activate_owner.ts');

const tsxCli = path.resolve('node_modules/tsx/dist/cli.mjs');
const result = spawnSync(process.execPath, [tsxCli, cliScript], {
  input: 'dummy_piped_input\n',
  encoding: 'utf8',
  shell: false,
  timeout: 10000,
});

assert(result.status === 1, `Process exited with exit code 1 (actual: ${result.status})`);
assert(
  result.stderr.includes('SECURITY ABORT') || result.stdout.includes('SECURITY ABORT'),
  'Output includes SECURITY ABORT notice for non-interactive terminal'
);
assert(
  result.stderr.includes('must be run interactively in a real terminal (TTY)') ||
    result.stdout.includes('must be run interactively in a real terminal (TTY)'),
  'Output explicitly explains requirement for interactive TTY'
);

console.log('\n================================================================================');
console.log(`🏆 CLI TTY VERIFICATION: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================================');

if (failed > 0) {
  process.exit(1);
}
