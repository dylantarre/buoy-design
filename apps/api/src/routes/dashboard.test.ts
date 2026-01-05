import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { dashboard } from './dashboard';

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

// Create a test app with the dashboard routes
function createTestApp() {
  const app = new Hono();
  app.route('/dashboard', dashboard);
  return app;
}

describe('Dashboard API Routes', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('GET /dashboard', () => {
    it('returns full dashboard data', async () => {
      const res = await app.request('/dashboard');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('health');
      expect(data).toHaveProperty('inbox');
      expect(data).toHaveProperty('guardrails');
      expect(data).toHaveProperty('activity');
    });

    it('returns health with correct structure', async () => {
      const res = await app.request('/dashboard');
      const data = await res.json() as DashboardResponse;

      expect(data.health).toHaveProperty('percentage');
      expect(data.health).toHaveProperty('componentsAligned');
      expect(data.health).toHaveProperty('componentsTotal');
      expect(data.health).toHaveProperty('alertCount');
      expect(data.health).toHaveProperty('lastSyncAt');
      expect(typeof data.health.percentage).toBe('number');
    });
  });

  describe('GET /dashboard/health', () => {
    it('returns health data', async () => {
      const res = await app.request('/dashboard/health');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('percentage');
      expect(data).toHaveProperty('componentsAligned');
      expect(data).toHaveProperty('componentsTotal');
      expect(data).toHaveProperty('alertCount');
    });

    it('returns percentage as a number', async () => {
      const res = await app.request('/dashboard/health');
      const data = await res.json() as HealthResponse;
      expect(typeof data.percentage).toBe('number');
      expect(data.percentage).toBeGreaterThanOrEqual(0);
      expect(data.percentage).toBeLessThanOrEqual(100);
    });
  });

  describe('GET /dashboard/inbox', () => {
    it('returns inbox items as an array', async () => {
      const res = await app.request('/dashboard/inbox');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it('returns inbox items with correct structure', async () => {
      const res = await app.request('/dashboard/inbox');
      const data = await res.json() as InboxItem[];

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
      const res = await app.request('/dashboard/inbox');
      const data = await res.json() as InboxItem[];

      const validTypes = ['new-component', 'undefined-token', 'guardrail-catch', 'large-deviation'];
      data.forEach((item) => {
        expect(validTypes).toContain(item.type);
      });
    });
  });

  describe('POST /dashboard/inbox/:id/action', () => {
    it('accepts valid action', async () => {
      const res = await app.request('/dashboard/inbox/inbox-1/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add-to-system' }),
      });
      expect(res.status).toBe(200);

      const data = await res.json() as { success: boolean; itemId: string; action: string };
      expect(data.success).toBe(true);
      expect(data.itemId).toBe('inbox-1');
      expect(data.action).toBe('add-to-system');
    });

    it('rejects invalid action payload', async () => {
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
      const res = await app.request('/dashboard/guardrails');
      expect(res.status).toBe(200);

      const data = await res.json() as GuardrailsResponse;
      expect(data).toHaveProperty('rules');
      expect(data).toHaveProperty('sensitivity');
      expect(Array.isArray(data.rules)).toBe(true);
    });

    it('returns rules with correct structure', async () => {
      const res = await app.request('/dashboard/guardrails');
      const data = await res.json() as GuardrailsResponse;

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
      const res = await app.request('/dashboard/guardrails');
      const data = await res.json() as GuardrailsResponse;

      expect(['relaxed', 'balanced', 'strict']).toContain(data.sensitivity);
    });
  });

  describe('PATCH /dashboard/guardrails', () => {
    it('updates sensitivity', async () => {
      const res = await app.request('/dashboard/guardrails', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sensitivity: 'strict' }),
      });
      expect(res.status).toBe(200);

      const data = await res.json() as GuardrailsResponse;
      expect(data.sensitivity).toBe('strict');
    });

    it('rejects invalid sensitivity value', async () => {
      const res = await app.request('/dashboard/guardrails', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sensitivity: 'invalid' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /dashboard/activity', () => {
    it('returns activity items as an array', async () => {
      const res = await app.request('/dashboard/activity');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it('returns activity items with correct structure', async () => {
      const res = await app.request('/dashboard/activity');
      const data = await res.json() as ActivityItem[];

      if (data.length > 0) {
        const item = data[0];
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('type');
        expect(item).toHaveProperty('description');
        expect(item).toHaveProperty('createdAt');
        expect(item).toHaveProperty('success');
      }
    });
  });

  describe('GET /dashboard/tokens', () => {
    it('returns token inventory structure', async () => {
      const res = await app.request('/dashboard/tokens');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('categories');
      expect(data).toHaveProperty('tokens');
    });
  });

  describe('GET /dashboard/components', () => {
    it('returns component map structure', async () => {
      const res = await app.request('/dashboard/components');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('aligned');
      expect(data).toHaveProperty('inReview');
      expect(data).toHaveProperty('components');
    });
  });

  describe('GET /dashboard/drift/history', () => {
    it('returns drift history structure', async () => {
      const res = await app.request('/dashboard/drift/history');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('period');
      expect(data).toHaveProperty('dataPoints');
      expect(data).toHaveProperty('summary');
    });
  });
});
