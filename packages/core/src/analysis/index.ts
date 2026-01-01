export {
  SemanticDiffEngine,
  type ComponentMatch,
  type ComponentDifference,
  type SemanticDiffResult,
  type TokenDiffResult,
  type DiffOptions,
  type AnalysisOptions,
} from "./semantic-diff.js";

// Token suggestion utilities
export {
  TokenSuggestionService,
  type TokenSuggestion,
} from "./token-suggestions.js";

// String utilities
export {
  stringSimilarity,
  levenshteinDistance,
  normalizeForComparison,
} from "./string-utils.js";

// Analysis configuration
export {
  MATCHING_CONFIG,
  NAMING_CONFIG,
  TOKEN_SUGGESTION_CONFIG,
  SCANNER_CONFIG,
  getOutlierThreshold,
} from "./config.js";

// Audit report
export {
  generateAuditReport,
  findCloseMatches,
  calculateHealthScore,
  type AuditValue,
  type AuditReport,
  type CategoryStats,
  type FileIssue,
  type CloseMatch,
} from "./audit.js";
