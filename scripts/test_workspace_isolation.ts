/**
 * @file scripts/test_workspace_isolation.ts
 * Automated Workspace Isolation & Project Boundary Verification Suite
 */

import fs from 'fs';
import path from 'path';
import { resolveDurableDataPath } from '../server/db/localPersistenceEngine.ts';

const PROJECT_ID = 'OMNIFLOW_OS';
const CANONICAL_REPO_PATH = path.resolve('F:\\Dev_Workspace\\Call-center');
const APPROVED_DATA_ROOT = path.resolve('F:\\Dev_Workspace\\Data\\OMNIFLOW_OS');
const REGISTRY_PATH = path.resolve('F:\\Dev_Workspace\\Registry\\projects.json');

const FORBIDDEN_FOREIGN_PATHS = [
  path.resolve('F:\\pharmacy_os'),
  path.resolve('F:\\quran'),
  path.resolve('F:\\callcenter'),
  path.resolve('C:\\Windows'),
  path.resolve('C:\\Program Files'),
];

export async function runIsolationTests(): Promise<{ passed: boolean; assertions: number; details: string[] }> {
  const details: string[] = [];
  let assertions = 0;

  console.log('--- STARTING WORKSPACE ISOLATION & CANARY VERIFICATION ---');

  // Test 1: Project Identity and Repository Root
  assertions++;
  const cwd = path.resolve(process.cwd());
  if (cwd !== CANONICAL_REPO_PATH) {
    throw new Error(`[ISOLATION-01 FAIL] Current working directory [${cwd}] is not the canonical repo path [${CANONICAL_REPO_PATH}]`);
  }
  details.push(`✅ [ISOLATION-01] Canonical repository root verified: ${cwd}`);

  // Test 2: Project Registry Verification
  assertions++;
  if (!fs.existsSync(REGISTRY_PATH)) {
    throw new Error(`[ISOLATION-02 FAIL] Project registry file missing at ${REGISTRY_PATH}`);
  }
  const raw = fs.readFileSync(REGISTRY_PATH, 'utf8').replace(/^\uFEFF/, '');
  const registry = JSON.parse(raw);
  const activeProj = registry.projects?.find((p: any) => p.projectId === PROJECT_ID);
  if (!activeProj || activeProj.workspaceStatus !== 'ACTIVE') {
    throw new Error(`[ISOLATION-02 FAIL] Active project registration missing or invalid in registry`);
  }
  details.push(`✅ [ISOLATION-02] Central project registry verified with ACTIVE status for ${PROJECT_ID}`);

  // Test 3: Storage Path Isolation
  assertions++;
  const durable = resolveDurableDataPath();
  if (!durable.ok || !durable.filePath.startsWith(APPROVED_DATA_ROOT)) {
    throw new Error(`[ISOLATION-03 FAIL] Durable storage path [${durable.filePath}] is outside approved root [${APPROVED_DATA_ROOT}]`);
  }
  details.push(`✅ [ISOLATION-03] Storage path strictly bound to isolated root: ${durable.filePath}`);

  // Test 4: Dev Keyfile Isolation
  assertions++;
  const keyFilePath = path.join(APPROVED_DATA_ROOT, '.omniflow-dev-keys.json');
  if (!fs.existsSync(keyFilePath)) {
    throw new Error(`[ISOLATION-04 FAIL] Isolated crypto keys missing from ${keyFilePath}`);
  }
  details.push(`✅ [ISOLATION-04] Cryptographic keyfile isolated to project data root: ${keyFilePath}`);

  // Test 5: Canary File Write & Strict Allowlist
  assertions++;
  const canaryPath = path.join(APPROVED_DATA_ROOT, `isolation_canary_${process.pid}_${Date.now()}.tmp`);
  const canaryPayload = JSON.stringify({ projectId: PROJECT_ID, timestamp: new Date().toISOString() });
  fs.writeFileSync(canaryPath, canaryPayload, 'utf8');
  if (!fs.existsSync(canaryPath) || fs.readFileSync(canaryPath, 'utf8') !== canaryPayload) {
    throw new Error(`[ISOLATION-05 FAIL] Canary file verification failed`);
  }
  fs.unlinkSync(canaryPath);
  details.push(`✅ [ISOLATION-05] Canary file verified within approved write boundary and cleaned up cleanly`);

  // Test 6: Foreign Project Protection (Read-Only & Never Mutate)
  assertions++;
  for (const fPath of FORBIDDEN_FOREIGN_PATHS) {
    if (fs.existsSync(fPath)) {
      const foreignItems = fs.readdirSync(fPath);
      if (fPath.toLowerCase().endsWith('callcenter')) {
        // F:\callcenter is historical report folder only; must contain no new data/code files
        const nonReport = foreignItems.filter((i) => i !== 'omniflow_zero_cost_architecture_decision_report.md');
        if (nonReport.length > 0) {
          throw new Error(`[ISOLATION-06 FAIL] Historical report directory F:\\callcenter contains unexpected files: ${nonReport.join(', ')}`);
        }
      } else {
        // F:\pharmacy_os, F:\quran must have zero omniflow files
        const contaminated = foreignItems.filter((i) => i.toLowerCase().includes('omniflow'));
        if (contaminated.length > 0) {
          throw new Error(`[ISOLATION-06 FAIL] Foreign directory ${fPath} contains contaminated items: ${contaminated.join(', ')}`);
        }
      }
    }
  }
  details.push(`✅ [ISOLATION-06] Zero contamination verified across all foreign workspaces (pharmacy_os, quran, callcenter)`);

  // Test 7: Git Root Isolation
  assertions++;
  const gitDir = path.join(CANONICAL_REPO_PATH, '.git');
  if (!fs.existsSync(gitDir)) {
    throw new Error(`[ISOLATION-07 FAIL] Local .git missing from repository root`);
  }
  details.push(`✅ [ISOLATION-07] Git repository isolated: working tree root is independent`);

  console.log(`--- WORKSPACE ISOLATION TESTS COMPLETE: ${assertions}/${assertions} PASSED ---`);
  return { passed: true, assertions, details };
}

// Run if called directly
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  runIsolationTests()
    .then((r) => {
      r.details.forEach((d) => console.log(d));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
}
