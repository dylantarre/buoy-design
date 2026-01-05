// packages/agents/src/index.ts
// Main entry point for @buoy-design/agents

// Agents
export { HistoryAgent } from './history.js';
export { ReviewAgent } from './review.js';
export { AcceptanceAgent } from './acceptance.js';
export { FixabilityAgent } from './fixability.js';
export { GeneratorAgent } from './generator.js';

// Types
export type {
  // Core
  RepoContext,
  SampledFile,
  AgentResult,

  // History Agent
  HistoryInput,
  HistoryResult,
  HistoryVerdict,
  CommitInfo,

  // Review Agent
  ReviewInput,
  ReviewResult,
  MissedPattern,
  MissedPatternCategory,
  BuoyImprovement,

  // Acceptance Agent
  AcceptanceInput,
  AcceptanceResult,
  AcceptanceLikelihood,

  // Fixability Agent
  FixabilityInput,
  FixabilityResult,
  FixTier,
  FixDifficulty,

  // Generator Agent
  GeneratorInput,
  GeneratorResult,
  GeneratedFix,

  // State
  ContributionState,
} from './types.js';
