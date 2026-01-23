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

// Drift aggregation
export {
  DriftAggregator,
  createStrategy,
  builtInStrategies,
  type DriftGroup,
  type AggregationResult,
  type GroupingStrategy,
  type AggregatorOptions,
  type BuiltInStrategyType,
} from "./drift-aggregator.js";

// Pattern analyzer (experimental)
export {
  detectRepeatedPatterns,
  normalizeClassPattern,
  groupPatterns,
  type ClassOccurrence,
  type PatternAnalyzerOptions,
} from "./analyzers/pattern-analyzer.js";

// Variant analyzer (Phase 4.1)
export {
  checkVariantConsistency,
  groupComponentsByVariant,
  compareVariants,
  extractVariantName,
  type VariantGroup,
  type VariantDifference,
} from "./analyzers/variant-analyzer.js";

// Token utility analyzer (Phase 4.2)
export {
  detectTokenUtilities,
  checkTokenUtilityUsage,
  summarizeTokenUtilityUsage,
  TOKEN_UTILITY_PATTERNS,
  type DetectedUtility,
  type UtilityAnalysisResult,
} from "./analyzers/token-utility-analyzer.js";

// Example code analyzer (Phase 4.3)
export {
  checkExampleCompliance,
  analyzeExampleCoverage,
  annotateComponentContexts,
  classifyComponentContext,
  isExampleFile,
  isTestFile,
  type ComponentContext,
  type ComponentWithContext,
} from "./analyzers/example-analyzer.js";
