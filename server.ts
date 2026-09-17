/**
 * @file server.ts
 * Enterprise Full-Stack Application Entrypoint (Express + Vite)
 * AI Contact Center OS v1.0.1
 */

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './server/api/router.ts';
import { initializeSeedData, ensureEgyptSpecialCustomer } from './server/db/seed.ts';
import { db } from './server/db/store.ts';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import { getUsers, getOrCreateUser } from './src/db/users.ts';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 1. Initialize Seed Data or Load from Persistent Storage
  const restored = db.loadFromDisk();
  if (!restored) {
    console.log('[Storage] Initializing fresh enterprise dataset and saving to persistent storage...');
    initializeSeedData();
    db.saveToDisk();
  } else {
    console.log('[Storage] Loaded live state from disk successfully.');
  }

  // Ensure Egypt special test customer (01018108979) is always initialized in memory
  ensureEgyptSpecialCustomer();

  // 2. Global Middlewares
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // 3. Mount Master API v1 Router
  app.use('/api/v1', apiRouter);

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      system: 'AI Contact Center OS',
      version: '1.0.0-enterprise',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // Cloud SQL & Firebase Auth Users API
  app.get('/api/users', requireAuth, async (req: AuthRequest, res) => {
    try {
      const sqlUsers = await getUsers();
      res.json({ success: true, data: sqlUsers });
    } catch (error: any) {
      console.error('Failed to fetch users:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch users' });
    }
  });

  app.post('/api/users/sync', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user;
      if (!user || !user.uid) {
        return res.status(400).json({ success: false, error: 'User UID missing' });
      }
      const synced = await getOrCreateUser(user.uid, user.email || '', user.name);
      res.json({ success: true, data: synced });
    } catch (error: any) {
      console.error('Failed to sync user:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to sync user' });
    }
  });

  // Global Error Handler for API
  app.use('/api', (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
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
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[AI Contact Center OS] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Server Startup Failure]', err);
  process.exit(1);
});
