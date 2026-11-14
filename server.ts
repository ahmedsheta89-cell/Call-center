/**
 * @file server.ts
 * Enterprise Full-Stack Application Entrypoint (Express + Vite)
 * AI Contact Center OS v1.0.2 — Instant Port Binding & Non-Blocking Initialization
 */

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { resolveDurableDataPath, acquireDirectoryLock, releaseDirectoryLock } from "./server/db/localPersistenceEngine.ts";
import { ensureRuntimeCryptoKeys } from "./server/core/cryptoKeyPolicy.ts";
dotenv.config();
const durableDataPath = resolveDurableDataPath();
if (!durableDataPath.ok || !durableDataPath.filePath) { console.error(`[Fatal Storage Path] ${durableDataPath.errorCode}`); process["exit"](1); }
const bootLock = acquireDirectoryLock(durableDataPath.filePath);
if (!bootLock.ok) { console.error(`[Fatal Storage Lock] ${bootLock.errorCode}: ${bootLock.errorMessage}`); process["exit"](1); }
const keyPolicy = ensureRuntimeCryptoKeys(durableDataPath.filePath);
if (!keyPolicy.ok) { console.error(`[Fatal Crypto Policy] ${keyPolicy.errorCode}: ${keyPolicy.errorMessage}`); releaseDirectoryLock(durableDataPath.filePath); process["exit"](1); }
let isShuttingDown = false, isBootstrapReady = false, bootstrapFailed = false, canFlushPersistence = false;
let finalizePromise: Promise<void> | null = null;
let activeDbRef: { flushPendingPersist: (signal?: AbortSignal) => boolean | Promise<boolean>; hasPendingPersist?: () => boolean; getPersistFilePath: () => string; isDiskOverwriteProtected?: () => boolean } | null = null;
const flushWithTimeout = async (dbRef: NonNullable<typeof activeDbRef>, timeoutMs = 3000): Promise<{ ok: boolean; settled: boolean }> => {
  const abortController = new AbortController();
  let settled = false, timer: NodeJS.Timeout | null = null;
  const flushPromise = Promise.resolve().then(() => dbRef.flushPendingPersist(abortController.signal)).then((r) => ({ ok: r === true, timedOut: false }), () => ({ ok: false, timedOut: false })).finally(() => { settled = true; });
  try {
    const res = await Promise.race([
      flushPromise,
      new Promise<{ ok: boolean; timedOut: boolean }>((resolve) => { timer = setTimeout(() => resolve({ ok: false, timedOut: true }), timeoutMs); timer.unref?.(); }),
    ]);
    if (res.timedOut && !settled) {
      abortController.abort();
      await Promise.race([flushPromise, new Promise<void>((r) => setTimeout(r, 200))]);
      return { ok: false, settled };
    }
    return { ok: res.ok, settled: true };
  } finally { if (timer) clearTimeout(timer); }
};
const gracefulShutdown = () => {
  if (isShuttingDown) return;
  isShuttingDown = true; isBootstrapReady = false;
  const finalize = () => {
    if (finalizePromise) return finalizePromise;
    clearTimeout(t);
    finalizePromise = (async () => {
      let ok = true, canReleaseLock = true;
      if (activeDbRef) {
        const hasPending = activeDbRef.hasPendingPersist ? activeDbRef.hasPendingPersist() : true;
        if (canFlushPersistence) {
          if (activeDbRef.isDiskOverwriteProtected?.()) {
            if (hasPending) { ok = false; console.error("[Shutdown Error] Pending writes cannot be flushed because storage is overwrite-protected."); }
          } else {
            const flushOutcome = await flushWithTimeout(activeDbRef, 3000);
            ok = flushOutcome.ok;
            canReleaseLock = flushOutcome.settled;
          }
        } else if (hasPending) {
          ok = false; console.error("[Shutdown Error] Pending writes exist while canFlushPersistence is false.");
        }
      }
      let rel = false;
      if (canReleaseLock) {
        rel = releaseDirectoryLock(activeDbRef?.getPersistFilePath() || durableDataPath.filePath);
      } else {
        console.error("[Fatal Shutdown Error] Flush exceeded timeout and did not settle after abort; preserving directory lock.");
      }
      process["exit"](ok && rel ? 0 : 1);
    })();
    return finalizePromise;
  };
  const t = setTimeout(() => { server.closeAllConnections?.(); void finalize(); }, 1500); t.unref?.();
  server.close(() => { clearTimeout(t); void finalize(); });
  server.closeIdleConnections?.();
};
const fatalBootstrapShutdown = () => {
  bootstrapFailed = true; isBootstrapReady = false;
  if (isShuttingDown) return;
  isShuttingDown = true;
  const finalizeFatal = () => {
    if (finalizePromise) return finalizePromise;
    clearTimeout(t);
    finalizePromise = Promise.resolve().then(() => {
      releaseDirectoryLock(activeDbRef?.getPersistFilePath() || durableDataPath.filePath);
      process["exit"](1);
    });
    return finalizePromise;
  };
  const t = setTimeout(() => { server.closeAllConnections?.(); void finalizeFatal(); }, 500); t.unref?.();
  server.close(() => { clearTimeout(t); void finalizeFatal(); });
  server.closeAllConnections?.();
};
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

const app = express();
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT) || 3000;

// Bind port 3000 immediately so control-plane health checks succeed within <100ms
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[AI Contact Center OS] Server listening on http://0.0.0.0:${PORT}`);
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Immediate Health Check Endpoint (validates fail-closed production secret requirements)
app.get('/api/health', async (_req, res) => {
  if (process.env.NODE_ENV === 'production') {
    const rawSecret = process.env.SESSION_SECRET;
    if (!rawSecret || rawSecret.trim().length < 32) {
      return res.status(503).json({
        status: 'misconfigured',
        code: 'SESSION_SECRET_MISCONFIGURED',
        message: 'SESSION_SECRET must be set (>= 32 chars) in production.',
      });
    }
  }
    if (!isBootstrapReady || bootstrapFailed || isShuttingDown) return res.status(503).json({ status: bootstrapFailed ? "unhealthy" : "starting", code: bootstrapFailed ? "BOOTSTRAP_FAILED" : "BOOTSTRAP_NOT_READY" }); res.json({
    status: 'healthy',
    system: 'AI Contact Center OS',
    version: '1.0.2-enterprise',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Serve Web App Manifest immediately in both Dev & Prod
app.get('/manifest.webmanifest', (_req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.json({
    id: '/',
    name: 'OmniFlow AI Contact Center OS — Android & Windows Enterprise',
    short_name: 'OmniFlow OS',
    description:
      'منظومة تشغيل مركز الاتصال الذكي المتكامل (Android APK/TWA • Windows Desktop EXE • Web Cloud PWA)',
    theme_color: '#0f172a',
    background_color: '#0f172a',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
    orientation: 'any',
    dir: 'rtl',
    lang: 'ar',
    start_url: '/',
    scope: '/',
    categories: ['business', 'productivity', 'utilities'],
    icons: [
      { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  });
});

// Direct short download redirects for Android App, Windows Desktop App, and GitHub Bundle
app.get('/download/android-app', (_req, res) => {
  res.redirect('/api/v1/platforms/download/android');
});
app.get('/download/windows-app', (_req, res) => {
  res.redirect('/api/v1/platforms/download/windows');
});
app.get('/download/github-bundle', (_req, res) => {
  res.redirect('/api/v1/github/export-bundle');
});

async function bootstrapModules() {
  const [
    { db },
    { initializeSeedData, ensureEgyptSpecialCustomer, ensureAdminUser },
    { ensurePwaIconsGenerated, getPwaIconBuffer },
    { apiRouter },
    { mountLegacyUserRouteClosuresAndApiFallback },
  ] = await Promise.all([
    import('./server/db/store.ts'),
    import('./server/db/seed.ts'),
    import('./server/core/pwaAssets.ts'),
    import('./server/api/router.ts'),
import('./server/core/identity.ts'),
  ]);

  // 1. Initialize Seed Data or Load from Persistent Storage
  activeDbRef = db;
    const restored = db.loadFromDisk();
    if (!restored) {
    if (db.isDiskOverwriteProtected()) {
      console.error(`[Storage] Existing persistence file could not be loaded/migrated (${db.getLastStorageError()?.code}); keeping existing file untouched.`);
     fatalBootstrapShutdown();
      throw new Error("[Storage] Protected persistence file cannot be overwritten.");
    } else {
      console.log("[Storage] Initializing fresh enterprise dataset and saving to persistent storage...");
      initializeSeedData();
      ensureEgyptSpecialCustomer();
      ensureAdminUser();
      if (!db.saveToDisk()) throw new Error("[Storage] Initial seed persistence failed.");
      canFlushPersistence = true;
    }
  } else {
    console.log("[Storage] Loaded live state from disk successfully.");
    ensureEgyptSpecialCustomer();
    ensureAdminUser(); if (!db.saveToDisk()) throw new Error("[Storage] Final bootstrap persistence failed."); canFlushPersistence = true;
} 
  // 2. ynamic PWA Binary Icon Serving
  ensurePwaIconsGenerated();

  const innerRouter = express.Router();

  innerRouter.get(
    ['/pwa-192x192.png', '/pwa-512x512.png', '/pwa-maskable-512x512.png', '/apple-touch-icon.png'],
    (req, res) => {
      const fileName = req.path.replace(/^\//, '');
      const buf = getPwaIconBuffer(fileName);
      if (buf) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(buf);
      }
      res.status(404).end();
    }
  );

  // 3. Mount Master API v1 Router
  innerRouter.use('/api/v1', apiRouter);

  // Permanent Legacy Route Closure (FINDING-3G-01 & FINDING-3G-02 Remediation):
  // Closes GET /api/users and POST /api/users/sync with explicit 410 Gone without DB access
  // and enforces fail-closed 404 JSON on unknown /api/* paths before Vite/SPA fallback.
  mountLegacyUserRouteClosuresAndApiFallback(innerRouter);

  // Global Error Handler for API
  innerRouter.use('/api', (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Server API Error]', err);
    res.status(err.status || 500).json({
      success: false,
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'An unexpected error occurred',
      },
    });
  });

  // 4. Vite Middleware for Development / Static Serve for Production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, watch: null },
      appType: 'spa',
    });
    innerRouter.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // Security Gate: Never allow static exposure of server bundle or sourcemaps
    innerRouter.use((req, res, next) => {
      if (/\.(cjs|map)$/i.test(req.path) || req.path.includes('server.cjs')) {
        res.status(404).end();
        return;
      }
      next();
    });
    innerRouter.use(express.static(distPath));
    innerRouter.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  isBootstrapReady = true; return innerRouter;
}

const routerReadyPromise = bootstrapModules().catch((err) => {
  console.error('[Server Bootstrap Error]', err);
  fatalBootstrapShutdown(); return null;
});

app.use(async (req, res, next) => {
  try {
    const initializedRouter = await routerReadyPromise;
    if (!initializedRouter || !isBootstrapReady || bootstrapFailed || isShuttingDown) return res.status(503).json({ status: "unhealthy", code: "BOOTSTRAP_FAILED" }); initializedRouter(req, res, next);
  } catch (err) {
    next(err);
  }
});

export { app, server };
