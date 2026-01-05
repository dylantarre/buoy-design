// packages/agents/src/types.ts
// Shared types for all Buoy agents

import { z } from 'zod';

// ============================================================================
// Core Agent Types
// ============================================================================

/**
 * Context passed to agents about a repository
 */
export interface RepoContext {
  owner: string;
  name: string;
  path: string;
  defaultBranch: string;
  description?: string;
  language?: string;
  designSystemSignals?: string[];
}

/**
 * A sampled file with content
 */
export interface SampledFile {
  path: string;
  content: string;
  reason: string;
}

/**
 * Standard agent result structure
 */
export interface AgentResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  confidence: number;
  tokensUsed?: number;
}

// ============================================================================
// History Agent Types
// ============================================================================

export interface HistoryInput {
  repoPath: string;
  filePath: string;
  lineRange?: [number, number];
}

export interface CommitInfo {
  hash: string;
  date: string;
  author: string;
  email: string;
  message: string;
  prNumber?: number;
}

export const HistoryVerdictSchema = z.enum([
  'accidental',    // Dev didn't know about the token/pattern
  'intentional',   // Deliberate override (comment, clear reason)
  'ai-generated',  // Looks like Copilot/Claude output
  'unknown',       // Can't determine
]);

export type HistoryVerdict = z.infer<typeof HistoryVerdictSchema>;

export interface HistoryResult {
  verdict: HistoryVerdict;
  timeline: CommitInfo[];
  context: string;
  confidence: number;
  lastModified: string;
  authors: string[];
}

// ============================================================================
// Review Agent Types
// ============================================================================

export interface ReviewInput {
  repo: RepoContext;
  buoyOutput: {
    components: number;
    tokens: number;
    driftSignals: number;
    signals?: unknown[];
  };
  sampledFiles: SampledFile[];
  buoyConfig?: string;
  repoStructure: string[];
}

export const MissedPatternCategorySchema = z.enum([
  'component',
  'token',
  'drift',
  'source',
]);

export type MissedPatternCategory = z.infer<typeof MissedPatternCategorySchema>;

export interface MissedPattern {
  category: MissedPatternCategory;
  description: string;
  evidence: {
    file: string;
    lineRange?: [number, number];
    codeSnippet?: string;
  };
  suggestedDetection: string;
  severity: 'high' | 'medium' | 'low';
}

export interface BuoyImprovement {
  area: 'scanner' | 'config' | 'drift-rules' | 'token-parser';
  title: string;
  description: string;
  examples: string[];
  estimatedImpact: string;
}

export interface ReviewResult {
  missedPatterns: MissedPattern[];
  improvements: BuoyImprovement[];
  summary: {
    totalMissed: number;
    missedByCategory: Record<string, number>;
    improvementAreas: string[];
  };
  confidence: number;
}

// ============================================================================
// Acceptance Agent Types
// ============================================================================

export interface AcceptanceInput {
  repo: RepoContext;
  contributingMd?: string;
  recentPRs: Array<{
    number: number;
    merged: boolean;
    author: string;
    daysOpen: number;
    reviewComments: number;
  }>;
  maintainerActivity: {
    commitsLastMonth: number;
    prsReviewedLastMonth: number;
    avgReviewTimeHours: number;
  };
  issueLabels?: string[];
}

export const AcceptanceLikelihoodSchema = z.enum(['high', 'medium', 'low']);

export type AcceptanceLikelihood = z.infer<typeof AcceptanceLikelihoodSchema>;

export interface AcceptanceResult {
  likelihood: AcceptanceLikelihood;
  score: number;  // 0-100
  reasoning: string;
  suggestedApproach: string;
  redFlags: string[];
  greenFlags: string[];
}

// ============================================================================
// Fixability Agent Types
// ============================================================================

export interface FixabilityInput {
  signal: {
    id: string;
    type: string;
    message: string;
    file: string;
    line?: number;
    severity: string;
  };
  fileContent: string;
  historyContext?: HistoryResult;
  surroundingCode?: string;
  designTokens?: Record<string, string>;
}

export const FixTierSchema = z.enum(['slam-dunk', 'review', 'skip']);

export type FixTier = z.infer<typeof FixTierSchema>;

export const FixDifficultySchema = z.enum(['one-liner', 'moderate', 'complex']);

export type FixDifficulty = z.infer<typeof FixDifficultySchema>;

export interface FixabilityResult {
  tier: FixTier;
  difficulty: FixDifficulty;
  reasoning: string;
  intentional: boolean;
  safeToFix: boolean;
  suggestedFix?: {
    before: string;
    after: string;
    explanation: string;
  };
}

// ============================================================================
// Generator Agent Types
// ============================================================================

export interface GeneratorInput {
  repo: RepoContext;
  signals: Array<{
    signal: FixabilityInput['signal'];
    fixability: FixabilityResult;
    history?: HistoryResult;
  }>;
  acceptanceContext: AcceptanceResult;
  designTokens?: Record<string, string>;
}

export interface GeneratedFix {
  file: string;
  line: number;
  before: string;
  after: string;
  explanation: string;
}

export interface GeneratorResult {
  fixes: GeneratedFix[];
  prTitle: string;
  prBody: string;
  confidence: number;
  cherryPickNote?: string;
  filesChanged: number;
}

// ============================================================================
// Contribution State Types
// ============================================================================

export interface ContributionState {
  version: number;
  queue: Array<{
    owner: string;
    name: string;
    url: string;
    addedAt: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
  }>;
  processed: Array<{
    owner: string;
    name: string;
    processedAt: string;
    result: 'pr-staged' | 'no-fixes' | 'skipped' | 'error';
    prUrl?: string;
    error?: string;
  }>;
  pendingPRs: Array<{
    owner: string;
    name: string;
    generatedAt: string;
    fixCount: number;
    confidence: number;
  }>;
}
