/**
 * Dashboard API Routes
 *
 * Endpoints for the designer dashboard
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../env.js';

export const dashboard = new Hono<{ Bindings: Env; Variables: Variables }>();

// ============================================================================
// Types
// ============================================================================

const HealthResponseSchema = z.object({
  percentage: z.number(),
  componentsAligned: z.number(),
  componentsTotal: z.number(),
  alertCount: z.number(),
  trend: z
    .object({
      direction: z.enum(['up', 'down', 'stable']),
      percentage: z.number(),
    })
    .optional(),
  lastSyncAt: z.string(),
});

const InboxItemSchema = z.object({
  id: z.string(),
  type: z.enum(['new-component', 'undefined-token', 'guardrail-catch', 'large-deviation']),
  title: z.string(),
  description: z.string(),
  createdAt: z.string(),
  metadata: z.record(z.unknown()),
});

const GuardrailRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  category: z.enum(['color', 'spacing', 'typography', 'component', 'other']),
});

const GuardrailConfigSchema = z.object({
  rules: z.array(GuardrailRuleSchema),
  sensitivity: z.enum(['relaxed', 'balanced', 'strict']),
});

const ActivityItemSchema = z.object({
  id: z.string(),
  type: z.enum(['component-added', 'token-approved', 'guardrail-caught', 'marked-one-off']),
  description: z.string(),
  createdAt: z.string(),
  success: z.boolean(),
});

const InboxActionSchema = z.object({
  action: z.string(),
});

const UpdateGuardrailsSchema = z.object({
  rules: z.array(GuardrailRuleSchema).optional(),
  sensitivity: z.enum(['relaxed', 'balanced', 'strict']).optional(),
});

// ============================================================================
// Mock Data (to be replaced with real data fetching)
// ============================================================================

function getMockHealth() {
  return {
    percentage: 94,
    componentsAligned: 47,
    componentsTotal: 52,
    alertCount: 2,
    trend: {
      direction: 'up' as const,
      percentage: 3,
    },
    lastSyncAt: new Date().toISOString(),
  };
}

function getMockInbox() {
  return [
    {
      id: 'inbox-1',
      type: 'new-component' as const,
      title: 'New component: <ProductBadge>',
      description: 'AI created this during the sprint. Looks like a keeper?',
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      metadata: {
        filePath: 'src/components/checkout/ProductBadge.tsx',
        prNumber: 482,
        author: 'jamie',
        similarity: 88,
        existingMatch: 'StatusBadge',
      },
    },
    {
      id: 'inbox-2',
      type: 'undefined-token' as const,
      title: 'Undefined token: #3B82F6',
      description: "This blue is being used in 3 places but isn't in your palette.",
      createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      metadata: {
        tokenValue: '#3B82F6',
        closestToken: '--color-blue-500',
      },
    },
    {
      id: 'inbox-3',
      type: 'guardrail-catch' as const,
      title: 'Guardrail catch: Spacing deviation',
      description:
        'AI tried to use 18px padding (your system uses 16px or 20px). Buoy suggested the fix and the dev accepted it — nice!',
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      metadata: {
        resolved: true,
      },
    },
  ];
}

function getMockGuardrails() {
  return {
    rules: [
      {
        id: 'rule-1',
        name: 'Block hardcoded colors',
        description: 'Prevent hardcoded color values, require token usage',
        enabled: true,
        category: 'color' as const,
      },
      {
        id: 'rule-2',
        name: 'Require spacing tokens',
        description: 'Enforce spacing scale, no arbitrary values',
        enabled: true,
        category: 'spacing' as const,
      },
      {
        id: 'rule-3',
        name: 'Check component naming',
        description: 'Ensure new components follow naming conventions',
        enabled: true,
        category: 'component' as const,
      },
      {
        id: 'rule-4',
        name: 'Enforce typography scale',
        description: 'Require typography tokens for font sizes',
        enabled: false,
        category: 'typography' as const,
      },
      {
        id: 'rule-5',
        name: 'Validate border radius',
        description: 'Ensure consistent border radius values',
        enabled: false,
        category: 'other' as const,
      },
    ],
    sensitivity: 'balanced' as const,
  };
}

function getMockActivity() {
  return [
    {
      id: 'activity-1',
      type: 'component-added' as const,
      description: '<CardHeader> added to system by you',
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      success: true,
    },
    {
      id: 'activity-2',
      type: 'guardrail-caught' as const,
      description: 'Guardrail caught 5px border-radius, dev fixed it',
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      success: true,
    },
    {
      id: 'activity-3',
      type: 'token-approved' as const,
      description: 'New token --spacing-2xs approved',
      createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      success: true,
    },
    {
      id: 'activity-4',
      type: 'marked-one-off' as const,
      description: '<DataTable> marked as one-off (not added to system)',
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      success: false,
    },
  ];
}

// ============================================================================
// Routes
// ============================================================================

// GET /dashboard - Full dashboard data
dashboard.get('/', (c) => {
  return c.json({
    health: getMockHealth(),
    inbox: getMockInbox(),
    guardrails: getMockGuardrails(),
    activity: getMockActivity(),
  });
});

// GET /dashboard/health - Health data only
dashboard.get('/health', (c) => {
  return c.json(getMockHealth());
});

// GET /dashboard/inbox - Inbox items
dashboard.get('/inbox', (c) => {
  return c.json(getMockInbox());
});

// POST /dashboard/inbox/:id/action - Perform action on inbox item
dashboard.post('/inbox/:id/action', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  const parsed = InboxActionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid action', details: parsed.error.issues }, 400);
  }

  const { action } = parsed.data;

  // TODO: Implement actual action handling
  console.log(`Action ${action} on inbox item ${id}`);

  return c.json({ success: true, itemId: id, action });
});

// GET /dashboard/guardrails - Guardrail configuration
dashboard.get('/guardrails', (c) => {
  return c.json(getMockGuardrails());
});

// PATCH /dashboard/guardrails - Update guardrail configuration
dashboard.patch('/guardrails', async (c) => {
  const body = await c.req.json();

  const parsed = UpdateGuardrailsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid configuration', details: parsed.error.issues }, 400);
  }

  // TODO: Implement actual update
  const current = getMockGuardrails();
  const updated = {
    ...current,
    ...parsed.data,
    rules: parsed.data.rules ?? current.rules,
  };

  return c.json(updated);
});

// GET /dashboard/activity - Activity feed
dashboard.get('/activity', (c) => {
  return c.json(getMockActivity());
});

// GET /dashboard/tokens - Token inventory (for deep dive)
dashboard.get('/tokens', (c) => {
  // TODO: Implement token inventory
  return c.json({
    total: 48,
    categories: {
      colors: 24,
      spacing: 12,
      typography: 8,
      other: 4,
    },
    tokens: [],
  });
});

// GET /dashboard/components - Component map (for deep dive)
dashboard.get('/components', (c) => {
  // TODO: Implement component map
  return c.json({
    total: 52,
    aligned: 47,
    inReview: 3,
    oneOff: 2,
    components: [],
  });
});

// GET /dashboard/drift/history - Drift history (for deep dive)
dashboard.get('/drift/history', (c) => {
  // TODO: Implement drift history
  return c.json({
    period: '30d',
    dataPoints: [],
    summary: {
      startPercentage: 91,
      endPercentage: 94,
      trend: 'improving',
    },
  });
});
