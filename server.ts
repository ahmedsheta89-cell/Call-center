/**
 * @file server.ts
 * Enterprise Full-Stack Application Entrypoint (Express + Vite)
 * AI Contact Center OS v1.0.2 — Instant Port Binding & Non-Blocking Initialization
 */

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

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
  res.json({
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
  const restored = db.loadFromDisk();
  if (!restored) {
    if (db.isDiskOverwriteProtected()) {
      console.error(
        `[Storage] Existing persistence file could not be loaded/migrated (${db.getLastStorageError()?.code}); keeping existing file untouched.`
      );
    } else {
      console.log('[Storage] Initializing fresh enterprise dataset and saving to persistent storage...');
      initializeSeedData();
      db.saveToDisk();
      ensureEgyptSpecialCustomer();
      ensureAdminUser();
    }
  } else {
    console.log('[Storage] Loaded live state from disk successfully.');
    ensureEgyptSpecialCustomer();
    ensureAdminUser();
  }

  // 2. Dynamic PWA Binary Icon Serving
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

  return innerRouter;
}

const routerReadyPromise = bootstrapModules().catch((err) => {
  console.error('[Server Bootstrap Error]', err);
  throw err;
});

app.use(async (req, res, next) => {
  try {
    const initializedRouter = await routerReadyPromise;
    initializedRouter(req, res, next);
  } catch (err) {
    next(err);
  }
});

export { app, server };
