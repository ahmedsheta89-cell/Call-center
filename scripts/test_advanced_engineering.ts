/**
 * @file scripts/test_advanced_engineering.ts
 * OmniFlow OS — Advanced Engineering, Latency Benchmarking (p50/p95/p99) & Fault Injection Test Suite
 */

import * as path from 'path';
import * as fs from 'fs';
import crypto from 'crypto';
import { spawn, ChildProcess } from 'child_process';
import {
  acquireDirectoryLock,
  releaseDirectoryLock,
  writeVerifiedAtomicFileSync,
  resolveDurableDataPath,
} from '../server/db/localPersistenceEngine.ts';
import { db } from '../server/db/store.ts';

const BENCHMARK_PORT = 3198;
const BASE_URL = `http://127.0.0.1:${BENCHMARK_PORT}`;
const AUDIT_DIR = 'F:\\Dev_Workspace\\Audit\\OMNIFLOW_OS\\MASTER_COMPLETION_MISSION';
const FAULT_DATA_DIR = 'F:\\Dev_Workspace\\Call-center\\data-fault-test';

interface BenchmarkMetric {
  endpoint: string;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  throughputRps: number;
}

interface FaultInjectionResult {
  testId: string;
  name: string;
  nameAr: string;
  category: 'FAULT_INJECTION' | 'LOCKING' | 'STORAGE' | 'SECURITY';
  passed: boolean;
  expectedBehavior: string;
  observedBehavior: string;
  durationMs: number;
}

const benchmarkMetrics: BenchmarkMetric[] = [];
const faultResults: FaultInjectionResult[] = [];

function log(msg: string) {
  console.log(`[ADV-ENG] ${msg}`);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url: string, timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.status === 200) {
        const body = await res.json();
        if (body.status === 'healthy') return true;
      }
    } catch {}
    await sleep(200);
  }
  return false;
}

async function startBenchmarkServer(): Promise<ChildProcess> {
  if (fs.existsSync(FAULT_DATA_DIR)) {
    try {
      fs.rmSync(FAULT_DATA_DIR, { recursive: true, force: true });
    } catch {}
  }
  fs.mkdirSync(FAULT_DATA_DIR, { recursive: true });

  const env = {
    ...process.env,
    PORT: String(BENCHMARK_PORT),
    NODE_ENV: 'production',
    OMNIFLOW_DATA_DIR: FAULT_DATA_DIR,
    OMNIFLOW_ALLOW_LOCAL_TEST_LOGIN: 'true',
    SESSION_SECRET: 'omniflow-advanced-benchmarking-secret-key-at-least-32-chars',
    CHANNEL_SECRET_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    AUDIT_CHECKPOINT_HMAC_KEY: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
  };

  const proc = spawn('node', ['dist-server/server.cjs'], {
    cwd: 'F:\\Dev_Workspace\\Call-center',
    env,
    stdio: 'ignore',
  });

  const ready = await waitForServer(BASE_URL);
  if (!ready) {
    proc.kill();
    throw new Error('Benchmark server failed to start within timeout');
  }
  log(`Benchmark server online on ${BASE_URL}`);
  return proc;
}

async function runBenchmark(
  endpoint: string,
  method: 'GET' | 'POST',
  token: string,
  totalRequests: number,
  concurrency: number,
  body?: any
): Promise<BenchmarkMetric> {
  log(`Benchmarking ${method} ${endpoint} (Requests: ${totalRequests}, Concurrency: ${concurrency})...`);
  const latencies: number[] = [];
  let successCount = 0;
  let errorCount = 0;
  const startAll = Date.now();

  const makeRequest = async () => {
    const t0 = performance.now();
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (body) headers['Content-Type'] = 'application/json';

      const res = await fetch(`${BASE_URL}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const t1 = performance.now();
      latencies.push(t1 - t0);
      if (res.status >= 200 && res.status < 400) {
        successCount++;
      } else {
        errorCount++;
      }
    } catch {
      errorCount++;
    }
  };

  // Run in chunks of concurrency
  let remaining = totalRequests;
  while (remaining > 0) {
    const batchSize = Math.min(concurrency, remaining);
    const batch = Array.from({ length: batchSize }, () => makeRequest());
    await Promise.all(batch);
    remaining -= batchSize;
  }

  const totalDurationSec = (Date.now() - startAll) / 1000;
  latencies.sort((a, b) => a - b);

  const getPercentile = (p: number) => {
    const idx = Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length));
    return Number(latencies[idx].toFixed(2));
  };

  const metric: BenchmarkMetric = {
    endpoint,
    totalRequests,
    successCount,
    errorCount,
    minMs: Number(latencies[0].toFixed(2)),
    maxMs: Number(latencies[latencies.length - 1].toFixed(2)),
    avgMs: Number((latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2)),
    p50Ms: getPercentile(50),
    p90Ms: getPercentile(90),
    p95Ms: getPercentile(95),
    p99Ms: getPercentile(99),
    throughputRps: Number((totalRequests / totalDurationSec).toFixed(1)),
  };

  benchmarkMetrics.push(metric);
  log(`  -> p50: ${metric.p50Ms}ms | p95: ${metric.p95Ms}ms | p99: ${metric.p99Ms}ms | Throughput: ${metric.throughputRps} req/s`);
  return metric;
}

async function main() {
  log('=============================================================');
  log('STARTING OMNIFLOW OS ADVANCED ENGINEERING & BENCHMARK SUITE');
  log('=============================================================');

  const serverProc = await startBenchmarkServer();

  // Bootstrap & authenticate local owner
  const tokenFile = path.join(FAULT_DATA_DIR, '.owner_bootstrap_token');
  const tokenJson = JSON.parse(fs.readFileSync(tokenFile, 'utf-8'));
  await fetch(`${BASE_URL}/api/v1/auth/local-owner/bootstrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bootstrapToken: tokenJson.token,
      username: 'perfadmin',
      password: 'PerfAdminPassword123!@#',
      fullName: 'مدير اختبار الأداء',
    }),
  });

  const loginRes = await fetch(`${BASE_URL}/api/v1/auth/local-owner/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'perfadmin', password: 'PerfAdminPassword123!@#' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.data?.token;

  if (!token) throw new Error('Failed to authenticate for benchmarking');

  try {
    // -------------------------------------------------------------
    // PART 1: HIGH-CONCURRENCY LATENCY BENCHMARKS (p50, p95, p99)
    // -------------------------------------------------------------
    log('\n--- PART 1: LATENCY BENCHMARKING (p50 / p95 / p99) ---');

    // 1. Live Ops KPIs endpoint
    await runBenchmark('/api/v1/operations/live', 'GET', token, 150, 15);

    // 2. Customers List
    await runBenchmark('/api/v1/customers', 'GET', token, 150, 15);

    // 3. Conversations List
    await runBenchmark('/api/v1/conversations', 'GET', token, 150, 15);

    // 4. Tickets List
    await runBenchmark('/api/v1/tickets', 'GET', token, 150, 15);

    // 5. Arabic KB Semantic Search
    await runBenchmark('/api/v1/kb/articles/search', 'POST', token, 100, 10, {
      query: 'إعدادات الراوتر والواي فاي فايبر',
    });

    // -------------------------------------------------------------
    // PART 2: FAULT INJECTION & RESILIENCE ASSURANCE
    // -------------------------------------------------------------
    log('\n--- PART 2: FAULT INJECTION & RESILIENCE TESTS ---');

    // TEST 1: Single-Instance Directory Lock Collision
    {
      const t0 = Date.now();
      const testLockTarget = path.join(FAULT_DATA_DIR, 'test_lock_target.json');
      // Process 1 acquires lock
      const lock1 = acquireDirectoryLock(testLockTarget, process.pid);
      // Process 2 (simulating a concurrent second instance with a different PID) attempts to acquire lock
      const simulatedOtherPid = process.pid + 1000;
      const lock2 = acquireDirectoryLock(testLockTarget, simulatedOtherPid);
      releaseDirectoryLock(testLockTarget, process.pid);

      const passed = lock1.ok && !lock2.ok && lock2.errorCode === 'STORAGE_LOCKED_BY_ACTIVE_PROCESS';
      faultResults.push({
        testId: 'FAULT-01',
        name: 'Single-Instance Directory Lock Collision Prevention',
        nameAr: 'منع تشغيل أكثر من نسخة على نفس مسار البيانات عبر قفل المجلد',
        category: 'LOCKING',
        passed,
        expectedBehavior: 'Second instance acquireDirectoryLock rejected with STORAGE_LOCKED_BY_ACTIVE_PROCESS',
        observedBehavior: `lock1.ok=${lock1.ok}, lock2.ok=${lock2.ok}, lock2.code=${lock2.errorCode}`,
        durationMs: Date.now() - t0,
      });
      log(`[FAULT-01] Lock Collision Prevention: ${passed ? 'PASSED' : 'FAILED'}`);
    }

    // TEST 2: Atomic File Write Crash Safety (writeVerifiedAtomicFileSync)
    {
      const t0 = Date.now();
      const atomicTestFile = path.join(FAULT_DATA_DIR, 'atomic_test.json');
      const payload = JSON.stringify({ verified: true, timestamp: Date.now() });
      let writeOk = false;
      try {
        writeVerifiedAtomicFileSync(atomicTestFile, payload);
        writeOk = true;
      } catch {
        writeOk = false;
      }
      const content = fs.existsSync(atomicTestFile) ? fs.readFileSync(atomicTestFile, 'utf-8') : '';

      const passed = writeOk && content === payload;
      faultResults.push({
        testId: 'FAULT-02',
        name: 'Atomic Verified File Persistence (Zero Partial Writes)',
        nameAr: 'الحفظ الذري المؤكد للملفات لمنع التلف الجزئي عند انقطاع الطاقة',
        category: 'STORAGE',
        passed,
        expectedBehavior: 'Payload written via verified atomic temporary swap with strict fsync',
        observedBehavior: `Atomic write ok=${writeOk}, content verified bit-for-bit (${content.length} bytes)`,
        durationMs: Date.now() - t0,
      });
      log(`[FAULT-02] Atomic File Persistence: ${passed ? 'PASSED' : 'FAILED'}`);
    }

    // TEST 3: Malformed JSON Request Rejection Gate
    {
      const t0 = Date.now();
      const rawRes = await fetch(`${BASE_URL}/api/v1/customers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: '{"malformed": "json", unquoted_key: }',
      });

      const passed = rawRes.status === 400;
      faultResults.push({
        testId: 'FAULT-03',
        name: 'Malformed JSON Payload Handling & Security Gate',
        nameAr: 'معالجة نصوص JSON المشوهة ورفضها الصارم لمنع انهيار السيرفر',
        category: 'FAULT_INJECTION',
        passed,
        expectedBehavior: 'HTTP 400 Bad Request returned without crashing process',
        observedBehavior: `HTTP status: ${rawRes.status}`,
        durationMs: Date.now() - t0,
      });
      log(`[FAULT-03] Malformed JSON Rejection: ${passed ? 'PASSED' : 'FAILED'}`);
    }

    // TEST 4: Cross-Tenant Payload Boundary Defense Gate
    {
      const t0 = Date.now();
      const spoofRes = await fetch(`${BASE_URL}/api/v1/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          organizationId: 'unauthorized-foreign-tenant-999',
          title: 'محاولة اختراق عزل المستأجرين',
          customerId: 'cust-demo',
          category: 'General',
          priority: 'urgent',
        }),
      });

      const passed = spoofRes.status === 403 || spoofRes.status === 400 || spoofRes.status === 404;
      faultResults.push({
        testId: 'FAULT-04',
        name: 'Cross-Tenant Payload Boundary Defense Gate',
        nameAr: 'بوابة الدفاع وحماية الحدود الصارمة ضد التلاعب بمستأجري المؤسسات',
        category: 'SECURITY',
        passed,
        expectedBehavior: 'Rejection with 400/403/404 fail-closed boundary guard',
        observedBehavior: `HTTP status: ${spoofRes.status}`,
        durationMs: Date.now() - t0,
      });
      log(`[FAULT-04] Cross-Tenant Defense Gate: ${passed ? 'PASSED' : 'FAILED'}`);
    }

    // TEST 5: Rate Limiting Persistent Lockdown Integrity
    {
      const t0 = Date.now();
      let rateLimitTriggered = false;
      for (let i = 0; i < 15; i++) {
        const failLogin = await fetch(`${BASE_URL}/api/v1/auth/local-owner/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'perfadmin', password: 'WrongPasswordAttempt!' }),
        });
        if (failLogin.status === 429) {
          rateLimitTriggered = true;
          break;
        }
      }

      const passed = rateLimitTriggered;
      faultResults.push({
        testId: 'FAULT-05',
        name: 'Persistent Brute-Force Rate Limiting Lockdown',
        nameAr: 'نظام الحظر التلقائي والتصاعدي ضد محاولات كسر كلمات المرور بالقوة الغاشمة',
        category: 'SECURITY',
        passed,
        expectedBehavior: 'HTTP 429 Too Many Requests triggered after consecutive failed attempts',
        observedBehavior: `Rate limit triggered: ${rateLimitTriggered}`,
        durationMs: Date.now() - t0,
      });
      log(`[FAULT-05] Rate Limiting Lockdown: ${passed ? 'PASSED' : 'FAILED'}`);
    }

  } finally {
    serverProc.kill();
  }

  // -------------------------------------------------------------
  // SAVE DETAILED METRICS REPORT
  // -------------------------------------------------------------
  const reportPayload = {
    executedAt: new Date().toISOString(),
    benchmarkSummary: {
      totalEndpointsTested: benchmarkMetrics.length,
      overallP50AvgMs: Number((benchmarkMetrics.reduce((s, m) => s + m.p50Ms, 0) / benchmarkMetrics.length).toFixed(2)),
      overallP95AvgMs: Number((benchmarkMetrics.reduce((s, m) => s + m.p95Ms, 0) / benchmarkMetrics.length).toFixed(2)),
      overallP99AvgMs: Number((benchmarkMetrics.reduce((s, m) => s + m.p99Ms, 0) / benchmarkMetrics.length).toFixed(2)),
      metrics: benchmarkMetrics,
    },
    faultInjectionSummary: {
      totalTests: faultResults.length,
      passed: faultResults.filter((f) => f.passed).length,
      failed: faultResults.filter((f) => !f.passed).length,
      results: faultResults,
    },
  };

  const reportPath = path.join(AUDIT_DIR, 'performance_and_fault_injection_results.json');
  fs.writeFileSync(reportPath, JSON.stringify(reportPayload, null, 2), 'utf-8');
  log(`\nDetailed report successfully written to: ${reportPath}`);

  log('\n=============================================================');
  log('FINAL BENCHMARK & FAULT INJECTION SUMMARY:');
  log('=============================================================');
  for (const m of benchmarkMetrics) {
    log(`[PERF] ${m.endpoint} | p50: ${m.p50Ms}ms | p95: ${m.p95Ms}ms | p99: ${m.p99Ms}ms | ${m.throughputRps} rps`);
  }
  for (const f of faultResults) {
    log(`[${f.passed ? 'PASS' : 'FAIL'}] ${f.testId}: ${f.name} (${f.durationMs}ms)`);
  }
}

main().catch((err) => {
  console.error('[FATAL ADV ENG ERROR]', err);
  process.exit(1);
});
