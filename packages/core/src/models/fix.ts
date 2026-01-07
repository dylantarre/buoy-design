import { z } from 'zod';

/**
 * Confidence level for a fix
 */
export const ConfidenceLevelSchema = z.enum(['exact', 'high', 'medium', 'low']);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

/**
 * A proposed fix for a drift signal
 */
export const FixSchema = z.object({
  /** Unique identifier for this fix */
  id: z.string(),

  /** The drift signal this fix addresses */
  driftSignalId: z.string(),

  /** Confidence level (high = 95%+, medium = 70-94%, low = <70%) */
  confidence: ConfidenceLevelSchema,

  /** Numeric confidence score (0-100) */
  confidenceScore: z.number().min(0).max(100),

  /** File path where the fix will be applied */
  file: z.string(),

  /** Line number (1-indexed) */
  line: z.number().int().positive(),

  /** Column number (1-indexed) */
  column: z.number().int().positive(),

  /** Original text to replace */
  original: z.string(),

  /** Replacement text */
  replacement: z.string(),

  /** Human-readable reason for this fix */
  reason: z.string(),

  /** The type of fix */
  fixType: z.enum([
    'hardcoded-color',
    'hardcoded-spacing',
    'hardcoded-radius',
    'hardcoded-font-size',
  ]),

  /** Token name being applied (if applicable) */
  tokenName: z.string().optional(),
});

export type Fix = z.infer<typeof FixSchema>;

/**
 * Result of applying a single fix
 */
export const FixResultSchema = z.object({
  fixId: z.string(),
  status: z.enum(['applied', 'skipped', 'failed']),
  error: z.string().optional(),
});

export type FixResult = z.infer<typeof FixResultSchema>;

/**
 * A fix session tracks all fixes applied in one run
 */
export const FixSessionSchema = z.object({
  /** Unique session identifier */
  id: z.string(),

  /** When the session started */
  startedAt: z.date(),

  /** When the session completed */
  completedAt: z.date().optional(),

  /** All fixes that were considered */
  fixes: z.array(FixSchema),

  /** Results for each fix */
  results: z.array(FixResultSchema),

  /** Summary statistics */
  summary: z.object({
    total: z.number(),
    applied: z.number(),
    skipped: z.number(),
    failed: z.number(),
  }),
});

export type FixSession = z.infer<typeof FixSessionSchema>;

/**
 * Options for generating fixes
 */
export interface FixGeneratorOptions {
  /** Filter to specific fix types */
  types?: Array<Fix['fixType']>;

  /** Minimum confidence level to include */
  minConfidence?: ConfidenceLevel;

  /** File glob patterns to include */
  includeFiles?: string[];

  /** File glob patterns to exclude */
  excludeFiles?: string[];
}

/**
 * Options for applying fixes
 */
export interface FixApplyOptions {
  /** Only show what would be done, don't modify files */
  dryRun?: boolean;

  /** Create .bak backup files before modifying */
  backup?: boolean;

  /** Minimum confidence level to apply */
  minConfidence?: ConfidenceLevel;
}

/**
 * Create a unique fix ID
 */
export function createFixId(file: string, line: number, column: number): string {
  return `fix:${file}:${line}:${column}`;
}

/**
 * Get confidence level from numeric score
 */
export function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 100) return 'exact';
  if (score >= 95) return 'high';
  if (score >= 70) return 'medium';
  return 'low';
}

/**
 * Check if a confidence level meets the minimum threshold
 */
export function meetsConfidenceThreshold(
  level: ConfidenceLevel,
  minimum: ConfidenceLevel
): boolean {
  const order: Record<ConfidenceLevel, number> = {
    low: 0,
    medium: 1,
    high: 2,
    exact: 3,
  };
  return order[level] >= order[minimum];
}
