import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { dashboard } from './dashboard';
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

  app.route('/dashboard', dashboard);
  return app;
}

// Type for API responses
interface HealthResponse {
  percentage: number;
  componentsAligned: number;
  componentsTotal: number;
  alertCount: number;
  trend?: { direction: string; percentage: number };
  lastSyncAt: string;
}

interface DashboardResponse {
  health: HealthResponse;
  inbox: InboxItem[];
  guardrails: GuardrailsResponse;
  activity: ActivityItem[];
}

interface InboxItem {
  id: string;
  type: string;
  title: string;
  description: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}

interface GuardrailsResponse {
  rules: GuardrailRule[];
  sensitivity: string;
}

interface GuardrailRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  category: string;
}

interface ActivityItem {
  id: string;
  type: string;
  description: string;
  createdAt: string;
  success: boolean;
}

describe('Dashboard API Routes', () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
  });

  describe('GET /dashboard', () => {
    it('returns full dashboard data', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      // Mock latest scan
      mockDb.setNextFirst({
        id: 'scan_123',
        project_id: 'proj_123',
        components_count: 50,
        tokens_count: 25,
        drift_count: 5,
        drift_data: JSON.stringify([]),
        created_at: new Date().toISOString(),
      });

      const res = await app.request('/dashboard');
      expect(res.status).toBe(200);

      const data = (await res.json()) as DashboardResponse;
      expect(data).toHaveProperty('health');
      expect(data).toHaveProperty('inbox');
      expect(data).toHaveProperty('guardrails');
      expect(data).toHaveProperty('activity');
    });

    it('returns health with correct structure', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst({
        id: 'scan_123',
        components_count: 100,
        drift_count: 10,
        created_at: new Date().toISOString(),
      });

      const res = await app.request('/dashboard');
      const data = (await res.json()) as DashboardResponse;

      expect(data.health).toHaveProperty('percentage');
      expect(data.health).toHaveProperty('componentsAligned');
      expect(data.health).toHaveProperty('componentsTotal');
      expect(data.health).toHaveProperty('alertCount');
      expect(data.health).toHaveProperty('lastSyncAt');
      expect(typeof data.health.percentage).toBe('number');
    });

    it('returns 401 when not authenticated', async () => {
      const app = createTestApp(mockDb);
      const res = await app.request('/dashboard');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /dashboard/health', () => {
    it('returns health data', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst({
        id: 'scan_123',
        components_count: 50,
        drift_count: 5,
        created_at: new Date().toISOString(),
      });

      const res = await app.request('/dashboard/health');
      expect(res.status).toBe(200);

      const data = (await res.json()) as HealthResponse;
      expect(data).toHaveProperty('percentage');
      expect(data).toHaveProperty('componentsAligned');
      expect(data).toHaveProperty('componentsTotal');
      expect(data).toHaveProperty('alertCount');
    });

    it('returns percentage as a number', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst({
        id: 'scan_123',
        components_count: 100,
        drift_count: 10,
        created_at: new Date().toISOString(),
      });

      const res = await app.request('/dashboard/health');
      const data = (await res.json()) as HealthResponse;
      expect(typeof data.percentage).toBe('number');
      expect(data.percentage).toBeGreaterThanOrEqual(0);
      expect(data.percentage).toBeLessThanOrEqual(100);
    });

    it('returns 401 when not authenticated', async () => {
      const app = createTestApp(mockDb);
      const res = await app.request('/dashboard/health');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /dashboard/inbox', () => {
    it('returns inbox items as an array', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst({
        drift_data: JSON.stringify([
          { id: 'sig_1', type: 'hardcoded-value', severity: 'warning', message: 'Test signal' },
        ]),
        created_at: new Date().toISOString(),
      });

      const res = await app.request('/dashboard/inbox');
      expect(res.status).toBe(200);

      const data = (await res.json()) as InboxItem[];
      expect(Array.isArray(data)).toBe(true);
    });

    it('returns inbox items with correct structure', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst({
        drift_data: JSON.stringify([
          { id: 'sig_1', type: 'hardcoded-value', severity: 'warning', message: 'Found hardcoded color' },
        ]),
        created_at: new Date().toISOString(),
      });

      const res = await app.request('/dashboard/inbox');
      const data = (await res.json()) as InboxItem[];

      if (data.length > 0) {
        const item = data[0];
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('type');
        expect(item).toHaveProperty('title');
        expect(item).toHaveProperty('description');
        expect(item).toHaveProperty('createdAt');
        expect(item).toHaveProperty('metadata');
      }
    });

    it('returns valid inbox item types', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst({
        drift_data: JSON.stringify([
          { id: 'sig_1', type: 'hardcoded-value', severity: 'warning', message: 'Test' },
          { id: 'sig_2', type: 'missing-component', severity: 'info', message: 'Test' },
        ]),
        created_at: new Date().toISOString(),
      });

      const res = await app.request('/dashboard/inbox');
      const data = (await res.json()) as InboxItem[];

      const validTypes = ['new-component', 'undefined-token', 'guardrail-catch', 'large-deviation'];
      data.forEach((item) => {
        expect(validTypes).toContain(item.type);
      });
    });

    it('returns 401 when not authenticated', async () => {
      const app = createTestApp(mockDb);
      const res = await app.request('/dashboard/inbox');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /dashboard/inbox/:id/action', () => {
    it('accepts valid action', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      const res = await app.request('/dashboard/inbox/inbox-1/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add-to-system' }),
      });
      expect(res.status).toBe(200);

      const data = (await res.json()) as { success: boolean; itemId: string; action: string };
      expect(data.success).toBe(true);
      expect(data.itemId).toBe('inbox-1');
      expect(data.action).toBe('add-to-system');
    });

    it('rejects invalid action payload', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      const res = await app.request('/dashboard/inbox/inbox-1/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /dashboard/guardrails', () => {
    it('returns guardrail configuration', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst(null); // No project settings

      const res = await app.request('/dashboard/guardrails');
      expect(res.status).toBe(200);

      const data = (await res.json()) as GuardrailsResponse;
      expect(data).toHaveProperty('rules');
      expect(data).toHaveProperty('sensitivity');
      expect(Array.isArray(data.rules)).toBe(true);
    });

    it('returns rules with correct structure', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst(null);

      const res = await app.request('/dashboard/guardrails');
      const data = (await res.json()) as GuardrailsResponse;

      if (data.rules.length > 0) {
        const rule = data.rules[0];
        expect(rule).toHaveProperty('id');
        expect(rule).toHaveProperty('name');
        expect(rule).toHaveProperty('description');
        expect(rule).toHaveProperty('enabled');
        expect(rule).toHaveProperty('category');
      }
    });

    it('returns valid sensitivity value', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst(null);

      const res = await app.request('/dashboard/guardrails');
      const data = (await res.json()) as GuardrailsResponse;

      expect(['relaxed', 'balanced', 'strict']).toContain(data.sensitivity);
    });

    it('returns 401 when not authenticated', async () => {
      const app = createTestApp(mockDb);
      const res = await app.request('/dashboard/guardrails');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /dashboard/guardrails', () => {
    it('updates sensitivity', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst({ id: 'proj_123', name: 'Test Project', settings: null });

      const res = await app.request('/dashboard/guardrails', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sensitivity: 'strict' }),
      });
      expect(res.status).toBe(200);

      const data = (await res.json()) as GuardrailsResponse;
      expect(data.sensitivity).toBe('strict');
    });

    it('rejects invalid sensitivity value', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst({ id: 'proj_123', name: 'Test Project', settings: null });

      const res = await app.request('/dashboard/guardrails', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sensitivity: 'invalid' }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 401 when not authenticated', async () => {
      const app = createTestApp(mockDb);
      const res = await app.request('/dashboard/guardrails', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sensitivity: 'strict' }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /dashboard/activity', () => {
    it('returns activity items as an array', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst({ id: 'proj_123' });
      mockDb.setNextAll([]);

      const res = await app.request('/dashboard/activity');
      expect(res.status).toBe(200);

      const data = (await res.json()) as ActivityItem[];
      expect(Array.isArray(data)).toBe(true);
    });

    it('returns activity items with correct structure', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst({ id: 'proj_123' });
      mockDb.setNextAll([
        { id: 'res_1', signal_id: 'sig_1', status: 'resolved', resolution: 'Fixed', created_at: new Date().toISOString() },
      ]);

      const res = await app.request('/dashboard/activity');
      const data = (await res.json()) as ActivityItem[];

      if (data.length > 0) {
        const item = data[0];
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('type');
        expect(item).toHaveProperty('description');
        expect(item).toHaveProperty('createdAt');
        expect(item).toHaveProperty('success');
      }
    });

    it('returns 401 when not authenticated', async () => {
      const app = createTestApp(mockDb);
      const res = await app.request('/dashboard/activity');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /dashboard/tokens', () => {
    it('returns token inventory structure', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst({ id: 'scan_123', tokens_count: 100 });

      const res = await app.request('/dashboard/tokens');
      expect(res.status).toBe(200);

      const data = (await res.json()) as { total: number; categories: Record<string, number>; tokens: unknown[] };
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('categories');
      expect(data).toHaveProperty('tokens');
    });

    it('returns 401 when not authenticated', async () => {
      const app = createTestApp(mockDb);
      const res = await app.request('/dashboard/tokens');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /dashboard/components', () => {
    it('returns component map structure', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst({ id: 'scan_123', components_count: 50, drift_count: 5 });

      const res = await app.request('/dashboard/components');
      expect(res.status).toBe(200);

      const data = (await res.json()) as { total: number; aligned: number; inReview: number; components: unknown[] };
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('aligned');
      expect(data).toHaveProperty('inReview');
      expect(data).toHaveProperty('components');
    });

    it('returns 401 when not authenticated', async () => {
      const app = createTestApp(mockDb);
      const res = await app.request('/dashboard/components');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /dashboard/drift/history', () => {
    it('returns drift history structure', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextAll([
        { id: 'scan_1', components_count: 50, drift_count: 5, created_at: new Date().toISOString() },
      ]);

      const res = await app.request('/dashboard/drift/history');
      expect(res.status).toBe(200);

      const data = (await res.json()) as { period: string; dataPoints: unknown[]; summary: Record<string, unknown> };
      expect(data).toHaveProperty('period');
      expect(data).toHaveProperty('dataPoints');
      expect(data).toHaveProperty('summary');
    });

    it('returns 401 when not authenticated', async () => {
      const app = createTestApp(mockDb);
      const res = await app.request('/dashboard/drift/history');
      expect(res.status).toBe(401);
    });
  });
});
