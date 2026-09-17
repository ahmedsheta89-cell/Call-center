/**
 * @file server.ts
 * Enterprise Full-Stack Application Entrypoint (Express + Vite)
 * AI Contact Center OS
 */

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './server/api/router.ts';
import { initializeSeedData } from './server/db/seed.ts';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 1. Initialize Seed Data for Enterprise Multi-Tenant Store
  initializeSeedData();

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
