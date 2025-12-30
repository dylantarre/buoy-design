// packages/agents/src/types.ts
import { z } from 'zod';
import type { DriftSignal } from '@buoy-design/core';

// ============================================================================
// Repository & File Context
// ============================================================================

export const RepoMetadataSchema = z.object({
  url: z.string(),
  name: z.string(),
  owner: z.string(),
  defaultBranch: z.string(),
  localPath: z.string(),
  description: z.string().optional(),
  stars: z.number().optional(),
  lastCommitDate: z.date().optional(),
});

export type RepoMetadata = z.infer<typeof RepoMetadataSchema>;

export const FileContentSchema = z.object({
  path: z.string(),
  content: z.string(),
  language: z.string().optional(),
  lineCount: z.number(),
});

export type FileContent = z.infer<typeof FileContentSchema>;

// ============================================================================
// Git History Types
// ============================================================================

export const CommitInfoSchema = z.object({
  hash: z.string(),
  shortHash: z.string(),
  author: z.string(),
  email: z.string(),
  date: z.date(),
  message: z.string(),
  filesChanged: z.number().optional(),
});

export type CommitInfo = z.infer<typeof CommitInfoSchema>;

export const BlameLineSchema = z.object({
  lineNumber: z.number(),
  content: z.string(),
  commit: CommitInfoSchema,
});

export type BlameLine = z.infer<typeof BlameLineSchema>;

export const PullRequestInfoSchema = z.object({
  number: z.number(),
  title: z.string(),
  author: z.string(),
  state: z.enum(['open', 'closed', 'merged']),
  createdAt: z.date(),
  mergedAt: z.date().optional(),
  url: z.string(),
  body: z.string().optional(),
  labels: z.array(z.string()),
  reviewers: z.array(z.string()).optional(),
  commentsCount: z.number().optional(),
});

export type PullRequestInfo = z.infer<typeof PullRequestInfoSchema>;

// ============================================================================
// Agent Input Context
// ============================================================================

export const AgentContextSchema = z.object({
  repo: RepoMetadataSchema,
  files: z.array(FileContentSchema),
  signals: z.array(z.custom<DriftSignal>()).optional(),
  // Additional context that can be passed to agents
  focusAreas: z.array(z.string()).optional(),
  question: z.string().optional(),
});

export type AgentContext = z.infer<typeof AgentContextSchema>;

export const HistoryContextSchema = AgentContextSchema.extend({
  commits: z.array(CommitInfoSchema),
  blame: z.record(z.string(), z.array(BlameLineSchema)).optional(), // path -> blame lines
  pullRequests: z.array(PullRequestInfoSchema).optional(),
});

export type HistoryContext = z.infer<typeof HistoryContextSchema>;

export const AcceptanceContextSchema = AgentContextSchema.extend({
  contributingGuide: z.string().optional(),
  codeOfConduct: z.string().optional(),
  prTemplate: z.string().optional(),
  recentMergedPRs: z.array(PullRequestInfoSchema).optional(),
  recentRejectedPRs: z.array(PullRequestInfoSchema).optional(),
  maintainers: z.array(z.string()).optional(),
});

export type AcceptanceContext = z.infer<typeof AcceptanceContextSchema>;

// ============================================================================
// Agent Output Types
// ============================================================================

export const FindingSeveritySchema = z.enum(['critical', 'warning', 'info', 'positive']);
export type FindingSeverity = z.infer<typeof FindingSeveritySchema>;

export const FindingSchema = z.object({
  type: z.string(),
  severity: FindingSeveritySchema,
  location: z.string().optional(), // file:line format
  observation: z.string(),
  recommendation: z.string().optional(),
  evidence: z.array(z.string()), // Supporting quotes, data, or references
  confidence: z.number().min(0).max(1),
});

export type Finding = z.infer<typeof FindingSchema>;

export const AgentResultSchema = z.object({
  agentId: z.string(),
  agentName: z.string(),
  executedAt: z.date(),
  durationMs: z.number(),
  summary: z.string(), // 1-2 sentence takeaway
  findings: z.array(FindingSchema),
  overallConfidence: z.number().min(0).max(1),
  rawAnalysis: z.string(), // Full Claude response for transparency
  tokensUsed: z.object({
    input: z.number(),
    output: z.number(),
  }).optional(),
});

export type AgentResult = z.infer<typeof AgentResultSchema>;

// ============================================================================
// Codebase Review Specific Types
// ============================================================================

export const CodePatternSchema = z.object({
  name: z.string(),
  description: z.string(),
  occurrences: z.number(),
  examples: z.array(z.object({
    file: z.string(),
    line: z.number(),
    snippet: z.string(),
  })),
  isConsistent: z.boolean(),
});

export type CodePattern = z.infer<typeof CodePatternSchema>;

export const CodebaseReviewResultSchema = AgentResultSchema.extend({
  patterns: z.array(CodePatternSchema),
  codeQuality: z.object({
    score: z.number().min(0).max(100),
    strengths: z.array(z.string()),
    concerns: z.array(z.string()),
  }),
  intentionalDivergences: z.array(z.object({
    signalId: z.string().optional(),
    reason: z.string(),
    confidence: z.number(),
  })),
});

export type CodebaseReviewResult = z.infer<typeof CodebaseReviewResultSchema>;

// ============================================================================
// History Review Specific Types
// ============================================================================

export const EvolutionNarrativeSchema = z.object({
  file: z.string(),
  summary: z.string(),
  keyEvents: z.array(z.object({
    date: z.date(),
    event: z.string(),
    commit: z.string(),
    significance: z.enum(['major', 'minor', 'context']),
  })),
  mainContributors: z.array(z.string()),
  lastMeaningfulChange: z.date().optional(),
  changeFrequency: z.enum(['active', 'stable', 'dormant', 'abandoned']),
});

export type EvolutionNarrative = z.infer<typeof EvolutionNarrativeSchema>;

export const HistoryReviewResultSchema = AgentResultSchema.extend({
  narratives: z.array(EvolutionNarrativeSchema),
  whyNotUpdated: z.array(z.object({
    file: z.string(),
    reason: z.string(),
    evidence: z.array(z.string()),
    shouldUpdate: z.boolean(),
  })),
  relatedPRs: z.array(z.object({
    pr: PullRequestInfoSchema,
    relevance: z.string(),
  })),
});

export type HistoryReviewResult = z.infer<typeof HistoryReviewResultSchema>;

// ============================================================================
// Acceptance Prediction Specific Types
// ============================================================================

export const AcceptancePredictionSchema = z.object({
  likelihood: z.enum(['high', 'medium', 'low', 'unlikely']),
  score: z.number().min(0).max(100),
  factors: z.array(z.object({
    factor: z.string(),
    impact: z.enum(['positive', 'negative', 'neutral']),
    weight: z.number(),
    evidence: z.string(),
  })),
  suggestedApproach: z.object({
    prTitle: z.string(),
    prBody: z.string(),
    commitMessage: z.string(),
    labels: z.array(z.string()),
  }),
  risks: z.array(z.object({
    risk: z.string(),
    mitigation: z.string(),
  })),
  timing: z.object({
    bestTimeToSubmit: z.string().optional(),
    maintainerActivity: z.string(),
  }),
});

export type AcceptancePrediction = z.infer<typeof AcceptancePredictionSchema>;

export const AcceptanceResultSchema = AgentResultSchema.extend({
  prediction: AcceptancePredictionSchema,
  similarAcceptedPRs: z.array(z.object({
    pr: PullRequestInfoSchema,
    similarity: z.string(),
  })),
  maintainerPreferences: z.array(z.object({
    preference: z.string(),
    evidence: z.string(),
  })),
});

export type AcceptanceResult = z.infer<typeof AcceptanceResultSchema>;

// ============================================================================
// Agent Interface
// ============================================================================

export interface Agent<TContext extends AgentContext, TResult extends AgentResult> {
  readonly id: string;
  readonly name: string;
  readonly description: string;

  /**
   * Execute the agent with the given context
   */
  execute(context: TContext): Promise<TResult>;

  /**
   * Validate that the context has required fields
   */
  validateContext(context: TContext): { valid: boolean; errors: string[] };
}

// ============================================================================
// Agent Configuration
// ============================================================================

export const AgentConfigSchema = z.object({
  model: z.enum(['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-haiku-20241022']).default('claude-sonnet-4-20250514'),
  maxTokens: z.number().default(4096),
  temperature: z.number().min(0).max(1).default(0.3),
  apiKey: z.string().optional(), // Falls back to ANTHROPIC_API_KEY env var
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  model: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
  temperature: 0.3,
};
