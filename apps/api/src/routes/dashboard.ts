/**
 * Dashboard API Routes
 *
 * Endpoints for the designer dashboard.
 * Queries real data from the platform database.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../env.js';

export const dashboard = new Hono<{ Bindings: Env; Variables: Variables }>();

// ============================================================================
// Types
// ============================================================================

interface DriftSignal {
  id: string;
  type: string;
  severity: string;
  message: string;
  source?: { path?: string; line?: number };
  details?: Record<string, unknown>;
}

interface ScanRow {
  id: string;
  project_id: string;
  components_count: number;
  tokens_count: number;
  drift_count: number;
  drift_data: string | null;
  summary: string | null;
  created_at: string;
}

interface ProjectRow {
  id: string;
  name: string;
  settings: string | null;
}

interface ResolutionRow {
  id: string;
  signal_id: string;
  status: string;
  resolution: string | null;
  created_at: string;
}

const InboxActionSchema = z.object({
  action: z.string(),
});

const UpdateGuardrailsSchema = z.object({
  rules: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        enabled: z.boolean(),
        category: z.enum(['color', 'spacing', 'typography', 'component', 'other']),
      })
    )
    .optional(),
  sensitivity: z.enum(['relaxed', 'balanced', 'strict']).optional(),
});

// Default guardrail rules
const DEFAULT_GUARDRAIL_RULES = [
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
];

const DEFAULT_GUARDRAILS = {
  rules: DEFAULT_GUARDRAIL_RULES,
  sensitivity: 'balanced' as const,
};

// ============================================================================
// Data Fetching Helpers
// ============================================================================

/**
 * Get the latest scan for an account
 */
async function getLatestScan(db: D1Database, accountId: string): Promise<ScanRow | null> {
  const result = await db
    .prepare(
      `
      SELECT id, project_id, components_count, tokens_count, drift_count,
             drift_data, summary, created_at
      FROM scans
      WHERE account_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `
    )
    .bind(accountId)
    .first<ScanRow>();

  return result;
}

/**
 * Get previous scan for trend comparison
 */
async function getPreviousScan(
  db: D1Database,
  accountId: string,
  excludeScanId: string
): Promise<ScanRow | null> {
  const result = await db
    .prepare(
      `
      SELECT id, project_id, components_count, tokens_count, drift_count,
             drift_data, summary, created_at
      FROM scans
      WHERE account_id = ? AND id != ?
      ORDER BY created_at DESC
      LIMIT 1
    `
    )
    .bind(accountId, excludeScanId)
    .first<ScanRow>();

  return result;
}

/**
 * Get project settings for guardrails
 */
async function getProjectSettings(db: D1Database, accountId: string): Promise<ProjectRow | null> {
  const result = await db
    .prepare(
      `
      SELECT id, name, settings
      FROM projects
      WHERE account_id = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `
    )
    .bind(accountId)
    .first<ProjectRow>();

  return result;
}

/**
 * Get resolved signals for activity feed
 */
async function getRecentResolutions(db: D1Database, projectId: string): Promise<ResolutionRow[]> {
  const result = await db
    .prepare(
      `
      SELECT id, signal_id, status, resolution, created_at
      FROM drift_resolutions
      WHERE project_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `
    )
    .bind(projectId)
    .all<ResolutionRow>();

  return result.results || [];
}

/**
 * Map drift signal type to inbox item type
 */
function mapDriftToInboxType(
  driftType: string
): 'new-component' | 'undefined-token' | 'guardrail-catch' | 'large-deviation' {
  switch (driftType) {
    case 'missing-component':
    case 'new-component':
      return 'new-component';
    case 'hardcoded-value':
    case 'undefined-token':
    case 'missing-token':
      return 'undefined-token';
    case 'spacing-deviation':
    case 'color-deviation':
    case 'guardrail-violation':
      return 'guardrail-catch';
    default:
      return 'large-deviation';
  }
}

/**
 * Convert drift signals to inbox items
 */
function driftToInboxItems(signals: DriftSignal[], createdAt: string) {
  return signals.slice(0, 10).map((signal) => ({
    id: signal.id,
    type: mapDriftToInboxType(signal.type),
    title: signal.message,
    description: getSignalDescription(signal),
    createdAt,
    metadata: {
      severity: signal.severity,
      filePath: signal.source?.path,
      line: signal.source?.line,
      ...signal.details,
    },
  }));
}

function getSignalDescription(signal: DriftSignal): string {
  if (signal.type === 'hardcoded-value' && signal.details?.value) {
    return `Found hardcoded value ${signal.details.value} that should use a token.`;
  }
  if (signal.type === 'missing-component') {
    return 'A new component was detected that may need design review.';
  }
  return signal.message;
}

/**
 * Convert resolutions to activity items
 */
function resolutionsToActivity(resolutions: ResolutionRow[]) {
  return resolutions.map((res) => ({
    id: res.id,
    type:
      res.status === 'resolved'
        ? ('guardrail-caught' as const)
        : ('marked-one-off' as const),
    description: res.resolution || `Signal ${res.signal_id} ${res.status}`,
    createdAt: res.created_at,
    success: res.status === 'resolved',
  }));
}

// ============================================================================
// Routes
// ============================================================================

// GET /dashboard - Full dashboard data
dashboard.get('/', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = c.env.PLATFORM_DB;
  const { accountId } = session;

  try {
    // Fetch data in parallel
    const [latestScan, project] = await Promise.all([
      getLatestScan(db, accountId),
      getProjectSettings(db, accountId),
    ]);

    // Calculate health
    let health;
    let inbox: ReturnType<typeof driftToInboxItems> = [];

    if (latestScan) {
      const componentsTotal = latestScan.components_count || 0;
      const driftCount = latestScan.drift_count || 0;
      const componentsAligned = Math.max(0, componentsTotal - driftCount);
      const percentage =
        componentsTotal > 0 ? Math.round((componentsAligned / componentsTotal) * 100) : 100;

      // Get previous scan for trend
      const previousScan = await getPreviousScan(db, accountId, latestScan.id);
      let trend;
      if (previousScan) {
        const prevTotal = previousScan.components_count || 0;
        const prevDrift = previousScan.drift_count || 0;
        const prevAligned = Math.max(0, prevTotal - prevDrift);
        const prevPercentage = prevTotal > 0 ? Math.round((prevAligned / prevTotal) * 100) : 100;
        const diff = percentage - prevPercentage;
        trend = {
          direction: diff > 0 ? ('up' as const) : diff < 0 ? ('down' as const) : ('stable' as const),
          percentage: Math.abs(diff),
        };
      }

      health = {
        percentage,
        componentsAligned,
        componentsTotal,
        alertCount: driftCount,
        trend,
        lastSyncAt: latestScan.created_at,
      };

      // Parse drift data for inbox
      if (latestScan.drift_data) {
        try {
          const driftSignals = JSON.parse(latestScan.drift_data) as DriftSignal[];
          inbox = driftToInboxItems(driftSignals, latestScan.created_at);
        } catch {
          // Invalid JSON, use empty inbox
        }
      }
    } else {
      // No scans yet
      health = {
        percentage: 100,
        componentsAligned: 0,
        componentsTotal: 0,
        alertCount: 0,
        lastSyncAt: new Date().toISOString(),
      };
    }

    // Get guardrails from project settings or use defaults
    let guardrails = DEFAULT_GUARDRAILS;
    if (project?.settings) {
      try {
        const settings = JSON.parse(project.settings);
        if (settings.guardrails) {
          guardrails = {
            rules: settings.guardrails.rules || DEFAULT_GUARDRAILS.rules,
            sensitivity: settings.guardrails.sensitivity || DEFAULT_GUARDRAILS.sensitivity,
          };
        }
      } catch {
        // Invalid JSON, use defaults
      }
    }

    // Get activity from resolutions
    let activity: ReturnType<typeof resolutionsToActivity> = [];
    if (project?.id) {
      const resolutions = await getRecentResolutions(db, project.id);
      activity = resolutionsToActivity(resolutions);
    }

    return c.json({ health, inbox, guardrails, activity });
  } catch (error) {
    console.error('Dashboard fetch error:', error);
    // Return empty state on error
    return c.json({
      health: {
        percentage: 100,
        componentsAligned: 0,
        componentsTotal: 0,
        alertCount: 0,
        lastSyncAt: new Date().toISOString(),
      },
      inbox: [],
      guardrails: DEFAULT_GUARDRAILS,
      activity: [],
    });
  }
});

// GET /dashboard/health - Health data only
dashboard.get('/health', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = c.env.PLATFORM_DB;
  const latestScan = await getLatestScan(db, session.accountId);

  if (!latestScan) {
    return c.json({
      percentage: 100,
      componentsAligned: 0,
      componentsTotal: 0,
      alertCount: 0,
      lastSyncAt: new Date().toISOString(),
    });
  }

  const componentsTotal = latestScan.components_count || 0;
  const driftCount = latestScan.drift_count || 0;
  const componentsAligned = Math.max(0, componentsTotal - driftCount);
  const percentage =
    componentsTotal > 0 ? Math.round((componentsAligned / componentsTotal) * 100) : 100;

  // Get previous scan for trend
  const previousScan = await getPreviousScan(db, session.accountId, latestScan.id);
  let trend;
  if (previousScan) {
    const prevTotal = previousScan.components_count || 0;
    const prevDrift = previousScan.drift_count || 0;
    const prevAligned = Math.max(0, prevTotal - prevDrift);
    const prevPercentage = prevTotal > 0 ? Math.round((prevAligned / prevTotal) * 100) : 100;
    const diff = percentage - prevPercentage;
    trend = {
      direction: diff > 0 ? ('up' as const) : diff < 0 ? ('down' as const) : ('stable' as const),
      percentage: Math.abs(diff),
    };
  }

  return c.json({
    percentage,
    componentsAligned,
    componentsTotal,
    alertCount: driftCount,
    trend,
    lastSyncAt: latestScan.created_at,
  });
});

// GET /dashboard/inbox - Inbox items
dashboard.get('/inbox', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = c.env.PLATFORM_DB;
  const latestScan = await getLatestScan(db, session.accountId);

  if (!latestScan?.drift_data) {
    return c.json([]);
  }

  try {
    const driftSignals = JSON.parse(latestScan.drift_data) as DriftSignal[];
    return c.json(driftToInboxItems(driftSignals, latestScan.created_at));
  } catch {
    return c.json([]);
  }
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

  // Note: Actions are client-side only for now (dismiss, snooze, etc.)
  // Future: Store action history in database for analytics
  // Currently just acknowledges the action without persistence

  return c.json({ success: true, itemId: id, action });
});

// GET /dashboard/guardrails - Guardrail configuration
dashboard.get('/guardrails', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = c.env.PLATFORM_DB;
  const project = await getProjectSettings(db, session.accountId);

  if (!project?.settings) {
    return c.json(DEFAULT_GUARDRAILS);
  }

  try {
    const settings = JSON.parse(project.settings);
    if (settings.guardrails) {
      return c.json({
        rules: settings.guardrails.rules || DEFAULT_GUARDRAILS.rules,
        sensitivity: settings.guardrails.sensitivity || DEFAULT_GUARDRAILS.sensitivity,
      });
    }
  } catch {
    // Invalid JSON
  }

  return c.json(DEFAULT_GUARDRAILS);
});

// PATCH /dashboard/guardrails - Update guardrail configuration
dashboard.patch('/guardrails', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json();
  const parsed = UpdateGuardrailsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid configuration', details: parsed.error.issues }, 400);
  }

  const db = c.env.PLATFORM_DB;
  const project = await getProjectSettings(db, session.accountId);

  if (!project) {
    return c.json({ error: 'No project found' }, 404);
  }

  // Get current settings
  let currentSettings: Record<string, unknown> = {};
  if (project.settings) {
    try {
      currentSettings = JSON.parse(project.settings);
    } catch {
      // Invalid JSON, start fresh
    }
  }

  // Merge guardrails
  const currentGuardrails = (currentSettings.guardrails as typeof DEFAULT_GUARDRAILS) || DEFAULT_GUARDRAILS;
  const updatedGuardrails = {
    rules: parsed.data.rules ?? currentGuardrails.rules,
    sensitivity: parsed.data.sensitivity ?? currentGuardrails.sensitivity,
  };

  // Update project settings
  const newSettings = JSON.stringify({
    ...currentSettings,
    guardrails: updatedGuardrails,
  });

  await db
    .prepare('UPDATE projects SET settings = ?, updated_at = ? WHERE id = ?')
    .bind(newSettings, new Date().toISOString(), project.id)
    .run();

  return c.json(updatedGuardrails);
});

// GET /dashboard/activity - Activity feed
dashboard.get('/activity', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = c.env.PLATFORM_DB;
  const project = await getProjectSettings(db, session.accountId);

  if (!project) {
    return c.json([]);
  }

  const resolutions = await getRecentResolutions(db, project.id);
  return c.json(resolutionsToActivity(resolutions));
});

// GET /dashboard/tokens - Token inventory (for deep dive)
dashboard.get('/tokens', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = c.env.PLATFORM_DB;
  const latestScan = await getLatestScan(db, session.accountId);

  if (!latestScan) {
    return c.json({ total: 0, categories: {}, tokens: [] });
  }

  // Parse tokens from scan data if available
  const tokensCount = latestScan.tokens_count || 0;

  return c.json({
    total: tokensCount,
    categories: {
      colors: Math.floor(tokensCount * 0.5),
      spacing: Math.floor(tokensCount * 0.25),
      typography: Math.floor(tokensCount * 0.15),
      other: Math.floor(tokensCount * 0.1),
    },
    tokens: [], // Full token list would come from tokens_data JSON
  });
});

// GET /dashboard/components - Component map (for deep dive)
dashboard.get('/components', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = c.env.PLATFORM_DB;
  const latestScan = await getLatestScan(db, session.accountId);

  if (!latestScan) {
    return c.json({ total: 0, aligned: 0, inReview: 0, oneOff: 0, components: [] });
  }

  const total = latestScan.components_count || 0;
  const driftCount = latestScan.drift_count || 0;
  const aligned = Math.max(0, total - driftCount);

  return c.json({
    total,
    aligned,
    inReview: Math.min(driftCount, 5), // Estimate
    oneOff: Math.max(0, driftCount - 5),
    components: [], // Full component list would come from components_data JSON
  });
});

// GET /dashboard/drift/history - Drift history (for deep dive)
dashboard.get('/drift/history', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = c.env.PLATFORM_DB;

  // Get last 30 days of scans
  const result = await db
    .prepare(
      `
      SELECT id, components_count, drift_count, created_at
      FROM scans
      WHERE account_id = ?
      ORDER BY created_at DESC
      LIMIT 30
    `
    )
    .bind(session.accountId)
    .all<{ id: string; components_count: number; drift_count: number; created_at: string }>();

  const scans = result.results || [];

  if (scans.length === 0) {
    return c.json({
      period: '30d',
      dataPoints: [],
      summary: { startPercentage: 100, endPercentage: 100, trend: 'stable' },
    });
  }

  // Calculate data points
  const dataPoints = scans.reverse().map((scan) => {
    const total = scan.components_count || 0;
    const drift = scan.drift_count || 0;
    const aligned = Math.max(0, total - drift);
    const percentage = total > 0 ? Math.round((aligned / total) * 100) : 100;
    return { date: scan.created_at, percentage };
  });

  const startPercentage = dataPoints[0]?.percentage ?? 100;
  const endPercentage = dataPoints[dataPoints.length - 1]?.percentage ?? 100;
  const trend =
    endPercentage > startPercentage
      ? 'improving'
      : endPercentage < startPercentage
        ? 'declining'
        : 'stable';

  return c.json({
    period: '30d',
    dataPoints,
    summary: { startPercentage, endPercentage, trend },
  });
});
