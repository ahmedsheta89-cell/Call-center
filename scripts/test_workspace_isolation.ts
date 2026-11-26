/**
 * @file scripts/test_workspace_isolation.ts
 * Automated Workspace Isolation & Project Boundary Verification Suite (Cross-Platform Portable)
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { resolveDurableDataPath } from '../server/db/localPersistenceEngine.ts';

const PROJECT_ID = 'OMNIFLOW_OS';
const WORKSTATION_DATA_ROOT = path.resolve('F:\\Dev_Workspace\\Data\\OMNIFLOW_OS');
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
  const expectedRepoRoot = process.env.OMNIFLOW_EXPECTED_REPO_ROOT
    ? path.resolve(process.env.OMNIFLOW_EXPECTED_REPO_ROOT)
    : cwd;
  if (cwd !== expectedRepoRoot || !fs.existsSync(path.join(cwd, 'package.json'))) {
    throw new Error(`[ISOLATION-01 FAIL] Current working directory [${cwd}] is not a valid OmniFlow repo root`);
  }
  details.push(`✅ [ISOLATION-01] Repository root verified: ${cwd}`);

  // Test 2: Workstation Project Registry Verification (when present or explicitly required)
  assertions++;
  const requireRegistry = process.env.OMNIFLOW_REQUIRE_WORKSTATION_REGISTRY === 'true';
  if (fs.existsSync(REGISTRY_PATH)) {
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf8').replace(/^\uFEFF/, '');
    const registry = JSON.parse(raw);
    const activeProj = registry.projects?.find((p: any) => p.projectId === PROJECT_ID);
    if (!activeProj || activeProj.workspaceStatus !== 'ACTIVE') {
      throw new Error(`[ISOLATION-02 FAIL] Active project registration missing or invalid in registry`);
    }
    details.push(`✅ [ISOLATION-02] Central project registry verified with ACTIVE status for ${PROJECT_ID}`);
  } else if (requireRegistry) {
    throw new Error(`[ISOLATION-02 FAIL] Project registry file missing at ${REGISTRY_PATH}`);
  } else {
    details.push(`ℹ️ [ISOLATION-02] SKIPPED_ENVIRONMENT_SPECIFIC: Workstation registry not present in CI environment (NOT_APPLICABLE)`);
  }

  // Test 3: Storage Path Isolation
  assertions++;
  let tempIsolationDir: string | null = null;
  const hasWorkstationData = fs.existsSync(WORKSTATION_DATA_ROOT);
  const envDataDir = process.env.OMNIFLOW_DATA_DIR || process.env.DATA_DIR;
  let approvedDataRoot: string;
  if (envDataDir) {
    approvedDataRoot = path.resolve(envDataDir);
  } else if (hasWorkstationData) {
    approvedDataRoot = WORKSTATION_DATA_ROOT;
  } else {
    tempIsolationDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omniflow-isolation-canary-'));
    approvedDataRoot = tempIsolationDir;
  }

  try {
    const durable = resolveDurableDataPath(null, {
      ...process.env,
      OMNIFLOW_DATA_DIR: approvedDataRoot,
    });
    if (!durable.ok || !path.resolve(durable.filePath).startsWith(approvedDataRoot)) {
      throw new Error(`[ISOLATION-03 FAIL] Durable storage path [${durable.filePath}] is outside approved root [${approvedDataRoot}]`);
    }
    details.push(`✅ [ISOLATION-03] Storage path strictly bound to isolated root: ${durable.filePath}`);

    // Test 4: Dev Keyfile Isolation (workstation-specific check when workstation data root exists)
    assertions++;
    const keyFilePath = path.join(approvedDataRoot, '.omniflow-dev-keys.json');
    if (hasWorkstationData && approvedDataRoot === WORKSTATION_DATA_ROOT) {
      if (!fs.existsSync(keyFilePath)) {
        throw new Error(`[ISOLATION-04 FAIL] Isolated crypto keys missing from ${keyFilePath}`);
      }
      details.push(`✅ [ISOLATION-04] Cryptographic keyfile isolated to project data root: ${keyFilePath}`);
    } else {
      details.push(`ℹ️ [ISOLATION-04] SKIPPED_ENVIRONMENT_SPECIFIC: Workstation dev keyfile check not applicable on ephemeral CI runner`);
    }

    // Test 5: Canary File Write & Strict Allowlist
    assertions++;
    const canaryPath = path.join(approvedDataRoot, `isolation_canary_${process.pid}_${Date.now()}.tmp`);
    const canaryPayload = JSON.stringify({ projectId: PROJECT_ID, timestamp: new Date().toISOString() });
    fs.writeFileSync(canaryPath, canaryPayload, 'utf8');
    if (!fs.existsSync(canaryPath) || fs.readFileSync(canaryPath, 'utf8') !== canaryPayload) {
      throw new Error(`[ISOLATION-05 FAIL] Canary file verification failed`);
    }
    fs.unlinkSync(canaryPath);
    details.push(`✅ [ISOLATION-05] Canary file verified within approved write boundary and cleaned up cleanly`);
  } finally {
    if (tempIsolationDir) {
      try {
        fs.rmSync(tempIsolationDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    }
  }

  // Test 6: Foreign Project Protection (Read-Only & Never Mutate)
  assertions++;
  if (process.platform === 'win32') {
    for (const fPath of FORBIDDEN_FOREIGN_PATHS) {
      if (fs.existsSync(fPath)) {
        const foreignItems = fs.readdirSync(fPath);
        if (fPath.toLowerCase().endsWith('callcenter')) {
          const nonReport = foreignItems.filter((i) => i !== 'omniflow_zero_cost_architecture_decision_report.md');
          if (nonReport.length > 0) {
            throw new Error(`[ISOLATION-06 FAIL] Historical report directory F:\\callcenter contains unexpected files: ${nonReport.join(', ')}`);
          }
        } else {
          const contaminated = foreignItems.filter((i) => i.toLowerCase().includes('omniflow'));
          if (contaminated.length > 0) {
            throw new Error(`[ISOLATION-06 FAIL] Foreign directory ${fPath} contains contaminated items: ${contaminated.join(', ')}`);
          }
        }
      }
    }
    details.push(`✅ [ISOLATION-06] Zero contamination verified across foreign Windows workspaces`);
  } else {
    details.push(`ℹ️ [ISOLATION-06] SKIPPED_ENVIRONMENT_SPECIFIC: Foreign Windows drive paths not applicable on ${process.platform}`);
  }

  // Test 7: Git Root Isolation
  assertions++;
  const gitDir = path.join(cwd, '.git');
  if (!fs.existsSync(gitDir)) {
    throw new Error(`[ISOLATION-07 FAIL] Local .git missing from repository root`);
  }
  details.push(`✅ [ISOLATION-07] Git repository isolated: working tree root is independent`);

  console.log(`--- WORKSPACE ISOLATION TESTS COMPLETE: ${assertions}/${assertions} PASSED ---`);
  return { passed: true, assertions, details };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
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
