import { glob } from "glob";
import { access } from "fs/promises";
import { join, isAbsolute } from "path";

export interface ScannerConfig {
  projectRoot: string;
  include?: string[];
  exclude?: string[];
  options?: Record<string, unknown>;
  /** Maximum number of files to process in parallel (default: 10) */
  concurrency?: number;
  /** Threshold for warning about large file counts (default: 1000) */
  largeFileCountThreshold?: number;
}

export interface ScanError {
  file?: string;
  message: string;
  code: string;
}

/**
 * Warning codes for scan operations
 */
export type ScanWarningCode =
  | "NO_FILES_MATCHED"
  | "PATTERN_NO_MATCH"
  | "FILE_READ_FAILED"
  | "LARGE_FILE_COUNT";

/**
 * Error codes for scan operations
 */
export type ScanErrorCode =
  | "PARSE_ERROR"
  | "TIMEOUT"
  | "FILE_READ_ERROR";

/**
 * Non-fatal warning from scan operations
 */
export interface ScanWarning {
  code: ScanWarningCode;
  message: string;
  pattern?: string;
  file?: string;
}

export interface ScanStats {
  filesScanned: number;
  itemsFound: number;
  duration: number;
}

export interface ScanResult<T> {
  items: T[];
  errors: ScanError[];
  /** Non-fatal warnings from the scan operation. Added in v0.1.2. */
  warnings?: ScanWarning[];
  stats: ScanStats;
}

/**
 * Result of file path validation
 */
export interface FileValidationResult {
  /** Absolute paths to files that exist */
  valid: string[];
  /** Paths/patterns that could not be resolved to existing files */
  missing: string[];
}

/**
 * Default exclusion patterns for file discovery.
 * Includes common build output, cache, and tooling directories.
 */
export const DEFAULT_EXCLUDES = [
  "**/node_modules/**",
  "**/*.test.*",
  "**/*.spec.*",
  "**/*.stories.*",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/coverage/**",
  "**/.turbo/**",
  "**/.cache/**",
  "**/out/**",
  "**/.git/**",
];

/**
 * Common monorepo directory patterns for file discovery.
 * These patterns help scanners find files in typical monorepo structures.
 */
export const MONOREPO_PATTERNS = [
  "packages/*/src/**",
  "packages/*/*/src/**",
  "apps/*/src/**",
  "sandbox/*/src/**",
  "libs/*/src/**",
  "modules/*/src/**",
  "examples/*/src/**",
  "tools/*/src/**",
  "website/src/**",
  "docs/src/**",
];

/**
 * Patterns for scoped npm packages (e.g., @org/package).
 * These are common in organization-owned monorepos.
 */
export const SCOPED_PACKAGE_PATTERNS = [
  "@*/*/src/**",
  "packages/@*/*/src/**",
];

/**
 * Calculate optimal concurrency based on file count.
 * For small file counts, use lower concurrency to avoid overhead.
 * For large file counts, increase concurrency up to a cap.
 *
 * @param fileCount Number of files to process
 * @returns Recommended concurrency level
 */
export function adaptiveConcurrency(fileCount: number): number {
  if (fileCount <= 10) {
    return Math.min(fileCount, 5);
  }
  if (fileCount <= 100) {
    return 10;
  }
  if (fileCount <= 500) {
    return 20;
  }
  // Cap at 50 for very large repos
  return Math.min(Math.ceil(fileCount / 20), 50);
}

/**
 * Options for parallel processing
 */
export interface ParallelProcessOptions {
  /** Callback invoked after each item is processed */
  onProgress?: (completed: number, total: number) => void;
  /** Timeout in ms for each item (0 = no timeout, default: 0) */
  fileTimeout?: number;
  /** Number of retries for transient failures (default: 0) */
  retries?: number;
  /** Base delay in ms between retries (default: 100) */
  retryDelayMs?: number;
}

/**
 * Error codes that are considered transient and can be retried
 */
const TRANSIENT_ERROR_CODES = new Set(["EBUSY", "EMFILE", "ENFILE", "EAGAIN", "EWOULDBLOCK"]);

/**
 * Check if an error is transient and should be retried
 */
function isTransientError(error: unknown): boolean {
  if (error && typeof error === "object" && "code" in error) {
    return TRANSIENT_ERROR_CODES.has((error as { code: string }).code);
  }
  return false;
}

/**
 * Sleep for the specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrap a promise with a timeout
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, file?: string): Promise<T> {
  if (timeoutMs <= 0) return promise;

  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        const error = new Error(`Processing timed out after ${timeoutMs}ms`);
        (error as any).code = "TIMEOUT";
        (error as any).file = file;
        reject(error);
      }, timeoutMs);
    }),
  ]);
}

/**
 * Process items in parallel with limited concurrency
 * @param items Items to process
 * @param processor Function to process each item
 * @param concurrency Maximum number of concurrent operations (default: 10)
 * @param options Optional configuration for progress, timeout, and retries
 */
export async function parallelProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number = 10,
  options?: ParallelProcessOptions,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  let completed = 0;
  const total = items.length;
  const { onProgress, fileTimeout = 0, retries = 0, retryDelayMs = 100 } = options || {};

  /**
   * Process a single item with retries and timeout
   */
  async function processWithRetries(item: T): Promise<R> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const promise = processor(item);
        return fileTimeout > 0
          ? await withTimeout(promise, fileTimeout, String(item))
          : await promise;
      } catch (error) {
        lastError = error;
        // Only retry transient errors
        if (attempt < retries && isTransientError(error)) {
          // Exponential backoff: 100ms, 200ms, 400ms, etc.
          await sleep(retryDelayMs * Math.pow(2, attempt));
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  // Process items in batches
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async (item) => {
        const result = await processWithRetries(item);
        completed++;
        onProgress?.(completed, total);
        return result;
      })
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * Helper to extract successful results from parallel processing
 */
export function extractResults<T>(settled: PromiseSettledResult<T>[]): {
  successes: T[];
  failures: { reason: unknown }[];
} {
  const successes: T[] = [];
  const failures: { reason: unknown }[] = [];

  for (const result of settled) {
    if (result.status === "fulfilled") {
      successes.push(result.value);
    } else {
      failures.push({ reason: result.reason });
    }
  }

  return { successes, failures };
}

/**
 * Helper to check if a string contains glob pattern characters
 */
function isGlobPattern(path: string): boolean {
  return path.includes("*") || path.includes("?") || path.includes("[");
}

/**
 * Validate that file paths exist, expanding glob patterns if necessary.
 * This helps catch configuration errors where specified files don't exist.
 *
 * @param paths Array of file paths or glob patterns to validate
 * @param projectRoot The project root directory for resolving relative paths
 * @returns Object with valid (existing) and missing file paths
 */
export async function validateFilePaths(
  paths: string[],
  projectRoot: string,
): Promise<FileValidationResult> {
  const valid: string[] = [];
  const missing: string[] = [];

  for (const pathOrPattern of paths) {
    if (isGlobPattern(pathOrPattern)) {
      // It's a glob pattern - expand it
      const matches = await glob(pathOrPattern, {
        cwd: projectRoot,
        absolute: true,
      });

      if (matches.length > 0) {
        valid.push(...matches);
      } else {
        // Pattern matched nothing
        missing.push(pathOrPattern);
      }
    } else {
      // It's a direct file path - check if it exists
      const absolutePath = isAbsolute(pathOrPattern)
        ? pathOrPattern
        : join(projectRoot, pathOrPattern);

      try {
        await access(absolutePath);
        valid.push(absolutePath);
      } catch {
        missing.push(pathOrPattern);
      }
    }
  }

  return { valid, missing };
}

/**
 * Internal result from file discovery, including patterns that matched nothing
 */
interface FileDiscoveryResult {
  files: string[];
  unmatchedPatterns: string[];
}

export abstract class Scanner<T, C extends ScannerConfig = ScannerConfig> {
  protected config: C;

  constructor(config: C) {
    this.config = config;
  }

  /** Get the configured concurrency limit */
  protected get concurrency(): number {
    return this.config.concurrency ?? 10;
  }

  /**
   * Find files matching the configured patterns.
   * @param defaultPatterns Default include patterns if none configured
   * @returns Object with matched files and patterns that matched nothing
   */
  protected async findFilesWithDetails(
    defaultPatterns: string[],
  ): Promise<FileDiscoveryResult> {
    const patterns = this.config.include?.length
      ? this.config.include
      : defaultPatterns;
    const ignore = this.config.exclude?.length
      ? this.config.exclude
      : DEFAULT_EXCLUDES;

    const allFiles: string[] = [];
    const unmatchedPatterns: string[] = [];

    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: this.config.projectRoot,
        ignore,
        absolute: true,
      });
      if (matches.length > 0) {
        allFiles.push(...matches);
      } else {
        unmatchedPatterns.push(pattern);
      }
    }

    // Deduplicate
    return {
      files: [...new Set(allFiles)],
      unmatchedPatterns,
    };
  }

  /**
   * Find files matching the configured patterns.
   * @param defaultPatterns Default include patterns if none configured
   * @returns Array of absolute file paths
   * @deprecated Use findFilesWithDetails for pattern match warnings
   */
  protected async findFiles(defaultPatterns: string[]): Promise<string[]> {
    const result = await this.findFilesWithDetails(defaultPatterns);
    return result.files;
  }

  /**
   * Helper to run the scan with timing and error handling boilerplate.
   * @param processor Function that processes files and returns items
   * @param defaultPatterns Default glob patterns for file discovery
   * @param options Optional configuration for progress, timeout, and retries
   */
  protected async runScan(
    processor: (file: string) => Promise<T[]>,
    defaultPatterns: string[],
    options?: ParallelProcessOptions,
  ): Promise<ScanResult<T>> {
    const startTime = Date.now();
    const { files, unmatchedPatterns } =
      await this.findFilesWithDetails(defaultPatterns);
    const items: T[] = [];
    const errors: ScanError[] = [];
    const warnings: ScanWarning[] = [];

    // Warn about unmatched patterns
    for (const pattern of unmatchedPatterns) {
      warnings.push({
        code: "PATTERN_NO_MATCH",
        message: `Pattern "${pattern}" matched no files`,
        pattern,
      });
    }

    // If no files matched at all, add a summary warning
    if (files.length === 0 && unmatchedPatterns.length > 0) {
      warnings.push({
        code: "NO_FILES_MATCHED",
        message: `No files found matching patterns: ${unmatchedPatterns.join(", ")}`,
      });
    }

    // Warn about large file counts
    const threshold = this.config.largeFileCountThreshold ?? 1000;
    if (files.length > threshold) {
      warnings.push({
        code: "LARGE_FILE_COUNT",
        message: `Found ${files.length} files to scan, which exceeds the threshold of ${threshold}. Consider adding more specific include patterns or excluding directories.`,
      });
    }

    // Process files in parallel with configurable concurrency
    const results = await parallelProcess(
      files,
      async (file) => ({ file, items: await processor(file) }),
      this.concurrency,
      options,
    );

    // Extract results and errors
    const { successes } = extractResults(results);

    for (const success of successes) {
      items.push(...success.items);
    }

    // Map failures to errors with file context
    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      if (result.status === "rejected") {
        const reason = result.reason;
        const message =
          reason instanceof Error
            ? reason.message
            : String(reason);
        // Detect timeout errors
        const code =
          reason && typeof reason === "object" && "code" in reason && (reason as any).code === "TIMEOUT"
            ? "TIMEOUT"
            : "PARSE_ERROR";
        errors.push({
          file: files[i],
          message,
          code,
        });
      }
    }

    const stats: ScanStats = {
      filesScanned: files.length,
      itemsFound: items.length,
      duration: Date.now() - startTime,
    };

    return { items, errors, warnings, stats };
  }

  abstract scan(): Promise<ScanResult<T>>;
  abstract getSourceType(): string;
}
