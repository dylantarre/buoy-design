// apps/cli/src/constants.ts

/**
 * CLI Exit Codes
 *
 * These follow standard Unix conventions:
 * - 0: Success
 * - 1: General error
 * - 2: Drift detected above threshold
 *
 * Usage:
 *   process.exit(EXIT_SUCCESS);
 *   process.exit(EXIT_ERROR);
 *   process.exit(EXIT_DRIFT_DETECTED);
 */
export const EXIT_SUCCESS = 0;

/** General error (config error, network error, etc.) */
export const EXIT_ERROR = 1;

/** Drift was detected above the configured threshold */
export const EXIT_DRIFT_DETECTED = 1;

/**
 * Severity weights for drift ordering
 * Higher weight = more severe
 */
export const SEVERITY_WEIGHTS = {
  critical: 2,
  warning: 1,
  info: 0,
} as const;

/**
 * Maximum number of drift signals to show in compact mode
 */
export const MAX_DRIFT_DISPLAY = 10;

/**
 * Maximum number of file errors to show before truncating
 */
export const MAX_ERROR_DISPLAY = 5;
