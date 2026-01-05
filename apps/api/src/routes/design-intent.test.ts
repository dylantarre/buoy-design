import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { designIntent } from './design-intent';
import type { Env, Variables } from '../env';

// Mock D1 database with configurable responses
function createMockDb() {
  let nextFirstResult: unknown = null;
  let nextAllResult: unknown[] = [];

  return {
    prepare: vi.fn((_sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        first: vi.fn(async () => nextFirstResult),
        all: vi.fn(async () => ({ results: nextAllResult })),
        run: vi.fn(async () => ({ meta: { changes: 1 } })),
      })),
    })),
    setNextFirst: (result: unknown) => {
      nextFirstResult = result;
    },
    setNextAll: (results: unknown[]) => {
      nextAllResult = results;
    },
  };
}

// Create a test app with mock bindings
function createTestApp(
  mockDb: ReturnType<typeof createMockDb>,
  session?: { userId: string; accountId: string; role: string }
) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();

  app.use('*', async (c, next) => {
    c.env = { PLATFORM_DB: mockDb } as unknown as Env;
    if (session) {
      c.set('session', session);
    }
    await next();
  });

  app.route('/design-intent', designIntent);
  return app;
}

// Test types
interface DesignIntentResponse {
  id: string;
  source: string;
  tokens: TokenDefinition[];
  components: ComponentDefinition[];
  baselineExceptions: BaselineException[];
  trackingCategories: TrackingCategories;
  createdAt: string;
  updatedAt: string;
}

interface TokenDefinition {
  name: string;
  category: string;
  value: string;
  source?: string;
}

interface ComponentDefinition {
  name: string;
  description?: string;
  figmaNodeId?: string;
}

interface BaselineException {
  id: string;
  type: string;
  reason: string;
}

interface TrackingCategories {
  colors: boolean;
  typography: boolean;
  spacing: boolean;
  components: boolean;
}

describe('Design Intent API Routes', () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
  });

  describe('GET /design-intent', () => {
    it('returns existing design intent for account', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst({
        id: 'di_123',
        account_id: 'acc_123',
        source: 'figma',
        tokens: JSON.stringify([{ name: '--color-primary', category: 'color', value: '#3B82F6' }]),
        components: JSON.stringify([{ name: 'Button' }]),
        baseline_exceptions: JSON.stringify([]),
        tracking_categories: JSON.stringify({ colors: true, typography: true, spacing: false, components: true }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const res = await app.request('/design-intent');
      expect(res.status).toBe(200);

      const data = (await res.json()) as DesignIntentResponse;
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('source');
      expect(data).toHaveProperty('tokens');
      expect(data).toHaveProperty('components');
      expect(Array.isArray(data.tokens)).toBe(true);
    });

    it('returns empty design intent when none exists', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst(null);

      const res = await app.request('/design-intent');
      expect(res.status).toBe(200);

      const data = (await res.json()) as DesignIntentResponse;
      expect(data.tokens).toEqual([]);
      expect(data.components).toEqual([]);
    });

    it('returns 401 when not authenticated', async () => {
      const app = createTestApp(mockDb);

      const res = await app.request('/design-intent');
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /design-intent', () => {
    it('creates design intent when none exists', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst(null); // No existing intent

      const res = await app.request('/design-intent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'figma',
          tokens: [{ name: '--color-primary', category: 'color', value: '#3B82F6' }],
          components: [{ name: 'Button', description: 'Primary action button' }],
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as DesignIntentResponse;
      expect(data.source).toBe('figma');
    });

    it('updates existing design intent', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst({ id: 'di_123' }); // Existing intent

      const res = await app.request('/design-intent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'manual',
          tokens: [{ name: '--spacing-sm', category: 'spacing', value: '8px' }],
        }),
      });

      expect(res.status).toBe(200);
    });

    it('returns 401 when not authenticated', async () => {
      const app = createTestApp(mockDb);

      const res = await app.request('/design-intent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'figma' }),
      });

      expect(res.status).toBe(401);
    });

    it('validates source field', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      const res = await app.request('/design-intent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'invalid-source' }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /design-intent/tokens', () => {
    it('adds a new token', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst({
        id: 'di_123',
        tokens: JSON.stringify([]),
      });

      const res = await app.request('/design-intent/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '--color-secondary',
          category: 'color',
          value: '#10B981',
        }),
      });

      expect(res.status).toBe(201);
    });

    it('returns 400 for duplicate token name', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst({
        id: 'di_123',
        tokens: JSON.stringify([{ name: '--color-primary', category: 'color', value: '#3B82F6' }]),
      });

      const res = await app.request('/design-intent/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '--color-primary',
          category: 'color',
          value: '#FF0000',
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /design-intent/tokens/:name', () => {
    it('removes a token', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst({
        id: 'di_123',
        tokens: JSON.stringify([{ name: '--color-primary', category: 'color', value: '#3B82F6' }]),
      });

      const res = await app.request('/design-intent/tokens/--color-primary', {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent token', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst({
        id: 'di_123',
        tokens: JSON.stringify([]),
      });

      const res = await app.request('/design-intent/tokens/--nonexistent', {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /design-intent/components', () => {
    it('adds a new component', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst({
        id: 'di_123',
        components: JSON.stringify([]),
      });

      const res = await app.request('/design-intent/components', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Card',
          description: 'Container for content',
        }),
      });

      expect(res.status).toBe(201);
    });
  });

  describe('POST /design-intent/baseline', () => {
    it('adds an exception to baseline', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst({
        id: 'di_123',
        baseline_exceptions: JSON.stringify([]),
      });

      const res = await app.request('/design-intent/baseline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'duplicate-color',
          itemId: '#3B82F6',
          reason: 'intentional-variation',
        }),
      });

      expect(res.status).toBe(201);
    });
  });

  describe('DELETE /design-intent/baseline/:id', () => {
    it('removes a baseline exception', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst({
        id: 'di_123',
        baseline_exceptions: JSON.stringify([{ id: 'exc_123', type: 'duplicate-color', reason: 'intentional' }]),
      });

      const res = await app.request('/design-intent/baseline/exc_123', {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
    });
  });

  describe('PATCH /design-intent/tracking', () => {
    it('updates tracking categories', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst({
        id: 'di_123',
        tracking_categories: JSON.stringify({ colors: true, typography: true, spacing: true, components: true }),
      });

      const res = await app.request('/design-intent/tracking', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spacing: false,
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { trackingCategories: TrackingCategories };
      expect(data.trackingCategories.spacing).toBe(false);
    });
  });

  describe('GET /design-intent/health', () => {
    it('returns health score based on design intent', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst({
        id: 'di_123',
        tokens: JSON.stringify([
          { name: '--color-primary', category: 'color', value: '#3B82F6' },
          { name: '--color-secondary', category: 'color', value: '#10B981' },
        ]),
        components: JSON.stringify([{ name: 'Button' }, { name: 'Card' }]),
        tracking_categories: JSON.stringify({ colors: true, typography: false, spacing: false, components: true }),
      });

      const res = await app.request('/design-intent/health');
      expect(res.status).toBe(200);

      const data = (await res.json()) as { score: number; breakdown: Record<string, unknown> };
      expect(data).toHaveProperty('score');
      expect(data).toHaveProperty('breakdown');
      expect(typeof data.score).toBe('number');
    });
  });
});
