/**
 * Configuration constants for semantic analysis and drift detection.
 * These values control various thresholds and weights used in the analysis engine.
 */

/**
 * Component matching thresholds
 */
export const MATCHING_CONFIG = {
  /** Minimum confidence score (0-1) for component matching */
  minMatchConfidence: 0.7,

  /** Threshold above which a match is considered "similar" vs "partial" */
  similarMatchThreshold: 0.9,

  /** Weights for component similarity calculation */
  similarityWeights: {
    name: 0.4,
    props: 0.3,
    variants: 0.2,
    dependencies: 0.1,
  },
} as const;

/**
 * Naming pattern analysis thresholds
 */
export const NAMING_CONFIG = {
  /**
   * Minimum ratio (0-1) of components using a pattern to consider it "dominant"
   * Used for naming convention detection
   */
  dominantPatternThreshold: 0.6,

  /**
   * Minimum ratio (0-1) of prop usage to consider a naming convention established
   * Used for prop naming consistency checks
   */
  establishedConventionThreshold: 0.7,

  /**
   * Minimum count OR percentage of total to be considered an outlier
   * Used to determine when to report naming inconsistencies
   */
  outlierMinCount: 3,
  outlierMinPercentage: 0.1,
} as const;

/**
 * Token suggestion thresholds
 */
export const TOKEN_SUGGESTION_CONFIG = {
  /** Minimum similarity (0-1) for color token suggestions */
  colorSimilarityThreshold: 0.8,

  /** Minimum similarity (0-1) for spacing token suggestions */
  spacingSimilarityThreshold: 0.9,

  /** Default number of suggestions to return */
  maxSuggestions: 3,

  /** Base font size in pixels (for rem/em conversions) */
  baseFontSizePx: 16,
} as const;

/**
 * Scanner configuration defaults
 */
export const SCANNER_CONFIG = {
  /** Default concurrency for parallel file processing */
  defaultConcurrency: 10,
} as const;

/**
 * Get the outlier threshold based on total count
 */
export function getOutlierThreshold(total: number): number {
  return Math.max(
    NAMING_CONFIG.outlierMinCount,
    total * NAMING_CONFIG.outlierMinPercentage,
  );
}
