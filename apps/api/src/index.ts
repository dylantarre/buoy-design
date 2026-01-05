/**
 * Buoy Cloud API
 *
 * Cloudflare Workers entry point
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { nanoid } from 'nanoid';
import type { MessageBatch } from '@cloudflare/workers-types';
import type { Env, Variables } from './env.js';
import { auth } from './routes/auth.js';
import { apiKeys } from './routes/api-keys.js';
import { projects } from './routes/projects.js';
import { scans } from './routes/scans.js';
import { drift } from './routes/drift.js';
import { team } from './routes/team.js';
import { events } from './routes/events.js';
import { github } from './routes/github.js';
import { billing } from './routes/billing.js';
import { dashboard } from './routes/dashboard.js';
import { requireAuth } from './middleware/auth.js';
import { handleQueue, type ScanJobMessage } from './queue.js';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Request ID middleware
app.use('*', async (c, next) => {
  c.set('requestId', nanoid(12));
  await next();
});

// Logger
app.use('*', logger());

// CORS
app.use(
  '*',
  cors({
    origin: (origin, c) => {
      // Allow configured origin
      if (origin === c.env.CORS_ORIGIN) return origin;
      // Allow localhost in development
      if (c.env.ENVIRONMENT === 'development' && origin?.includes('localhost')) {
        return origin;
      }
      return null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400,
  })
);

// Health check
app.get('/', (c) => {
  return c.json({
    name: 'Buoy Cloud API',
    version: c.env.API_VERSION,
    environment: c.env.ENVIRONMENT,
    status: 'healthy',
  });
});

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes (public)
app.route('/auth', auth);

// API key routes (authenticated)
app.use('/api-keys/*', requireAuth);
app.route('/api-keys', apiKeys);

// Project routes (authenticated)
app.use('/projects/*', requireAuth);
app.route('/projects', projects);
app.route('/projects', scans); // Nested: /projects/:id/scans
app.route('/projects', drift); // Nested: /projects/:id/drift
app.route('/projects', events); // Nested: /projects/:id/events

// Team management routes (authenticated)
app.use('/account/*', requireAuth);
app.route('', team); // /account and /account/*

// Public invite acceptance
app.route('', team); // /invites/:token/accept (handled by team router)

// GitHub App routes
app.use('/github/install', requireAuth);
app.use('/github/installations', requireAuth);
app.use('/github/installations/*', requireAuth);
app.route('', github); // /github/* and /webhooks/github

// Billing routes (authenticated except webhook)
app.use('/billing', requireAuth);
app.use('/billing/*', requireAuth);
app.route('', billing); // /billing/* and /webhooks/stripe

// Dashboard routes (authenticated)
app.use('/dashboard', requireAuth);
app.use('/dashboard/*', requireAuth);
app.route('/dashboard', dashboard);

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      error: 'Not Found',
      message: `Route ${c.req.method} ${c.req.path} not found`,
    },
    404
  );
});

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json(
    {
      error: 'Internal Server Error',
      message: c.env.ENVIRONMENT === 'development' ? err.message : 'An unexpected error occurred',
      requestId: c.get('requestId'),
    },
    500
  );
});

// Export the Hono app as the fetch handler
// Export the queue consumer handler
export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<ScanJobMessage>, env: Env): Promise<void> {
    await handleQueue(batch, env);
  },
};
