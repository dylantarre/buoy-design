/**
 * Cloudflare Workers Environment Bindings
 */

export interface Env {
  // D1 Databases
  PLATFORM_DB: D1Database;

  // KV Namespaces
  SESSIONS: KVNamespace;
  RATE_LIMITS: KVNamespace;

  // R2 Buckets
  BACKUPS: R2Bucket;

  // Queues
  SCAN_QUEUE: Queue;

  // Environment variables
  ENVIRONMENT: 'development' | 'staging' | 'production';
  API_VERSION: string;
  CORS_ORIGIN: string;

  // Secrets (set via wrangler secret put)
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  SESSION_SECRET: string;
  ENCRYPTION_KEY: string;
}

export type Variables = {
  // Set by auth middleware
  session?: {
    userId: string;
    accountId: string;
    role: string;
  };
  // Request metadata
  requestId: string;
};
