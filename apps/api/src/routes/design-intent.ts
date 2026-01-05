/**
 * Design Intent API Routes
 *
 * Stores the designer's intended design system - tokens, components,
 * and baseline exceptions. This is what Buoy compares code against.
 *
 * GET    /design-intent              - Get current design intent
 * PUT    /design-intent              - Create/update design intent
 * POST   /design-intent/tokens       - Add a token
 * DELETE /design-intent/tokens/:name - Remove a token
 * POST   /design-intent/components   - Add a component
 * DELETE /design-intent/components/:name - Remove a component
 * POST   /design-intent/baseline     - Add baseline exception
 * DELETE /design-intent/baseline/:id - Remove baseline exception
 * PATCH  /design-intent/tracking     - Update tracking categories
 * GET    /design-intent/health       - Get health score
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import type { Env, Variables } from '../env.js';

export const designIntent = new Hono<{ Bindings: Env; Variables: Variables }>();

// ============================================================================
// Validation Schemas
// ============================================================================

const TokenSchema = z.object({
  name: z.string().min(1),
  category: z.enum(['color', 'spacing', 'typography', 'other']),
  value: z.string().min(1),
  source: z.string().optional(),
});

const ComponentSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  figmaNodeId: z.string().optional(),
});

const BaselineExceptionSchema = z.object({
  type: z.string().min(1),
  itemId: z.string().min(1),
  reason: z.enum(['intentional-variation', 'one-off', 'deprecated', 'other']),
});

const TrackingCategoriesSchema = z.object({
  colors: z.boolean().optional(),
  typography: z.boolean().optional(),
  spacing: z.boolean().optional(),
  components: z.boolean().optional(),
});

const DesignIntentSchema = z.object({
  source: z.enum(['figma', 'manual', 'code_discovery']),
  tokens: z.array(TokenSchema).optional(),
  components: z.array(ComponentSchema).optional(),
  baselineExceptions: z.array(BaselineExceptionSchema).optional(),
  trackingCategories: TrackingCategoriesSchema.optional(),
});

// ============================================================================
// Types
// ============================================================================

interface DesignIntentRow {
  id: string;
  account_id: string;
  source: string;
  tokens: string;
  components: string;
  baseline_exceptions: string;
  tracking_categories: string;
  created_at: string;
  updated_at: string;
}

interface TokenDef {
  name: string;
  category: string;
  value: string;
  source?: string;
}

interface ComponentDef {
  name: string;
  description?: string;
  figmaNodeId?: string;
}

interface BaselineException {
  id: string;
  type: string;
  itemId: string;
  reason: string;
}

interface TrackingCategories {
  colors: boolean;
  typography: boolean;
  spacing: boolean;
  components: boolean;
}

const DEFAULT_TRACKING: TrackingCategories = {
  colors: true,
  typography: true,
  spacing: true,
  components: true,
};

// ============================================================================
// Helpers
// ============================================================================

function parseJson<T>(str: string | null, defaultValue: T): T {
  if (!str) return defaultValue;
  try {
    return JSON.parse(str) as T;
  } catch {
    return defaultValue;
  }
}

function formatResponse(row: DesignIntentRow | null) {
  if (!row) {
    return {
      id: null,
      source: null,
      tokens: [],
      components: [],
      baselineExceptions: [],
      trackingCategories: DEFAULT_TRACKING,
      createdAt: null,
      updatedAt: null,
    };
  }

  return {
    id: row.id,
    source: row.source,
    tokens: parseJson<TokenDef[]>(row.tokens, []),
    components: parseJson<ComponentDef[]>(row.components, []),
    baselineExceptions: parseJson<BaselineException[]>(row.baseline_exceptions, []),
    trackingCategories: parseJson<TrackingCategories>(row.tracking_categories, DEFAULT_TRACKING),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getDesignIntent(db: D1Database, accountId: string): Promise<DesignIntentRow | null> {
  return db
    .prepare('SELECT * FROM design_intent WHERE account_id = ?')
    .bind(accountId)
    .first<DesignIntentRow>();
}

// ============================================================================
// Routes
// ============================================================================

/**
 * Get current design intent
 */
designIntent.get('/', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = c.env.PLATFORM_DB;
  const intent = await getDesignIntent(db, session.accountId);
  return c.json(formatResponse(intent));
});

/**
 * Create or update design intent
 */
designIntent.put('/', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = DesignIntentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400);
  }

  const db = c.env.PLATFORM_DB;
  const now = new Date().toISOString();
  const existing = await getDesignIntent(db, session.accountId);

  const tokens = JSON.stringify(parsed.data.tokens || []);
  const components = JSON.stringify(parsed.data.components || []);
  const baselineExceptions = JSON.stringify(parsed.data.baselineExceptions || []);
  const trackingCategories = JSON.stringify(parsed.data.trackingCategories || DEFAULT_TRACKING);

  if (existing) {
    await db
      .prepare(
        `UPDATE design_intent
         SET source = ?, tokens = ?, components = ?, baseline_exceptions = ?,
             tracking_categories = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(parsed.data.source, tokens, components, baselineExceptions, trackingCategories, now, existing.id)
      .run();

    return c.json(formatResponse({ ...existing, ...parsed.data, updated_at: now } as DesignIntentRow));
  } else {
    const id = `di_${nanoid(12)}`;
    await db
      .prepare(
        `INSERT INTO design_intent (id, account_id, source, tokens, components, baseline_exceptions, tracking_categories, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, session.accountId, parsed.data.source, tokens, components, baselineExceptions, trackingCategories, now, now)
      .run();

    return c.json({
      id,
      source: parsed.data.source,
      tokens: parsed.data.tokens || [],
      components: parsed.data.components || [],
      baselineExceptions: parsed.data.baselineExceptions || [],
      trackingCategories: parsed.data.trackingCategories || DEFAULT_TRACKING,
      createdAt: now,
      updatedAt: now,
    });
  }
});

/**
 * Add a token
 */
designIntent.post('/tokens', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = TokenSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid token', details: parsed.error.issues }, 400);
  }

  const db = c.env.PLATFORM_DB;
  const intent = await getDesignIntent(db, session.accountId);

  if (!intent) {
    return c.json({ error: 'No design intent found. Create one first.' }, 404);
  }

  const tokens = parseJson<TokenDef[]>(intent.tokens, []);

  // Check for duplicate
  if (tokens.some((t) => t.name === parsed.data.name)) {
    return c.json({ error: 'Token with this name already exists' }, 400);
  }

  tokens.push(parsed.data);
  const now = new Date().toISOString();

  await db
    .prepare('UPDATE design_intent SET tokens = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(tokens), now, intent.id)
    .run();

  return c.json({ success: true, token: parsed.data }, 201);
});

/**
 * Remove a token
 */
designIntent.delete('/tokens/:name', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const name = decodeURIComponent(c.req.param('name'));
  const db = c.env.PLATFORM_DB;
  const intent = await getDesignIntent(db, session.accountId);

  if (!intent) {
    return c.json({ error: 'No design intent found' }, 404);
  }

  const tokens = parseJson<TokenDef[]>(intent.tokens, []);
  const index = tokens.findIndex((t) => t.name === name);

  if (index === -1) {
    return c.json({ error: 'Token not found' }, 404);
  }

  tokens.splice(index, 1);
  const now = new Date().toISOString();

  await db
    .prepare('UPDATE design_intent SET tokens = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(tokens), now, intent.id)
    .run();

  return c.json({ success: true });
});

/**
 * Add a component
 */
designIntent.post('/components', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = ComponentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid component', details: parsed.error.issues }, 400);
  }

  const db = c.env.PLATFORM_DB;
  const intent = await getDesignIntent(db, session.accountId);

  if (!intent) {
    return c.json({ error: 'No design intent found. Create one first.' }, 404);
  }

  const components = parseJson<ComponentDef[]>(intent.components, []);

  // Check for duplicate
  if (components.some((comp) => comp.name === parsed.data.name)) {
    return c.json({ error: 'Component with this name already exists' }, 400);
  }

  components.push(parsed.data);
  const now = new Date().toISOString();

  await db
    .prepare('UPDATE design_intent SET components = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(components), now, intent.id)
    .run();

  return c.json({ success: true, component: parsed.data }, 201);
});

/**
 * Remove a component
 */
designIntent.delete('/components/:name', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const name = decodeURIComponent(c.req.param('name'));
  const db = c.env.PLATFORM_DB;
  const intent = await getDesignIntent(db, session.accountId);

  if (!intent) {
    return c.json({ error: 'No design intent found' }, 404);
  }

  const components = parseJson<ComponentDef[]>(intent.components, []);
  const index = components.findIndex((comp) => comp.name === name);

  if (index === -1) {
    return c.json({ error: 'Component not found' }, 404);
  }

  components.splice(index, 1);
  const now = new Date().toISOString();

  await db
    .prepare('UPDATE design_intent SET components = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(components), now, intent.id)
    .run();

  return c.json({ success: true });
});

/**
 * Add baseline exception
 */
designIntent.post('/baseline', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = BaselineExceptionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid exception', details: parsed.error.issues }, 400);
  }

  const db = c.env.PLATFORM_DB;
  const intent = await getDesignIntent(db, session.accountId);

  if (!intent) {
    return c.json({ error: 'No design intent found. Create one first.' }, 404);
  }

  const exceptions = parseJson<BaselineException[]>(intent.baseline_exceptions, []);
  const exception: BaselineException = {
    id: `exc_${nanoid(8)}`,
    ...parsed.data,
  };

  exceptions.push(exception);
  const now = new Date().toISOString();

  await db
    .prepare('UPDATE design_intent SET baseline_exceptions = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(exceptions), now, intent.id)
    .run();

  return c.json({ success: true, exception }, 201);
});

/**
 * Remove baseline exception
 */
designIntent.delete('/baseline/:id', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const id = c.req.param('id');
  const db = c.env.PLATFORM_DB;
  const intent = await getDesignIntent(db, session.accountId);

  if (!intent) {
    return c.json({ error: 'No design intent found' }, 404);
  }

  const exceptions = parseJson<BaselineException[]>(intent.baseline_exceptions, []);
  const index = exceptions.findIndex((exc) => exc.id === id);

  if (index === -1) {
    return c.json({ error: 'Exception not found' }, 404);
  }

  exceptions.splice(index, 1);
  const now = new Date().toISOString();

  await db
    .prepare('UPDATE design_intent SET baseline_exceptions = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(exceptions), now, intent.id)
    .run();

  return c.json({ success: true });
});

/**
 * Update tracking categories
 */
designIntent.patch('/tracking', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = TrackingCategoriesSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid tracking categories', details: parsed.error.issues }, 400);
  }

  const db = c.env.PLATFORM_DB;
  const intent = await getDesignIntent(db, session.accountId);

  if (!intent) {
    return c.json({ error: 'No design intent found. Create one first.' }, 404);
  }

  const current = parseJson<TrackingCategories>(intent.tracking_categories, DEFAULT_TRACKING);
  const updated = { ...current, ...parsed.data };
  const now = new Date().toISOString();

  await db
    .prepare('UPDATE design_intent SET tracking_categories = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(updated), now, intent.id)
    .run();

  return c.json({ trackingCategories: updated });
});

/**
 * Get health score
 */
designIntent.get('/health', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = c.env.PLATFORM_DB;
  const intent = await getDesignIntent(db, session.accountId);

  if (!intent) {
    return c.json({
      score: 0,
      breakdown: {
        tokens: { defined: 0, tracked: false },
        components: { defined: 0, tracked: false },
        hasBaselineExceptions: false,
      },
      message: 'No design intent defined yet',
    });
  }

  const tokens = parseJson<TokenDef[]>(intent.tokens, []);
  const components = parseJson<ComponentDef[]>(intent.components, []);
  const tracking = parseJson<TrackingCategories>(intent.tracking_categories, DEFAULT_TRACKING);
  const exceptions = parseJson<BaselineException[]>(intent.baseline_exceptions, []);

  // Calculate health score (simple version)
  let score = 0;
  const maxScore = 100;

  // Tokens defined (up to 30 points)
  const tokenScore = Math.min(tokens.length * 3, 30);
  score += tokenScore;

  // Components defined (up to 30 points)
  const componentScore = Math.min(components.length * 5, 30);
  score += componentScore;

  // Categories enabled (up to 20 points)
  const enabledCategories = Object.values(tracking).filter(Boolean).length;
  score += enabledCategories * 5;

  // Has exceptions (shows engagement, 10 points)
  if (exceptions.length > 0) {
    score += 10;
  }

  // Source is set (10 points)
  if (intent.source) {
    score += 10;
  }

  return c.json({
    score: Math.min(score, maxScore),
    breakdown: {
      tokens: { defined: tokens.length, categories: countByCategory(tokens) },
      components: { defined: components.length },
      tracking,
      baselineExceptions: exceptions.length,
      source: intent.source,
    },
  });
});

function countByCategory(tokens: TokenDef[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const token of tokens) {
    counts[token.category] = (counts[token.category] || 0) + 1;
  }
  return counts;
}
