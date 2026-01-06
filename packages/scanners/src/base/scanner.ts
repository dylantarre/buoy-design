import { glob } from "glob";
import { access } from "fs/promises";
import { join, isAbsolute } from "path";
import type { ScanCache } from "../cache/scan-cache.js";

export interface ScannerConfig {
  projectRoot: string;
  include?: string[];
  exclude?: string[];
  options?: Record<string, unknown>;
  /** Maximum number of files to process in parallel (default: 10) */
  concurrency?: number;
  /** Threshold for warning about large file counts (default: 1000) */
  largeFileCountThreshold?: number;
  /**
   * If true, custom exclude patterns will completely replace DEFAULT_EXCLUDES.
   * If false (default), custom exclude patterns are merged with DEFAULT_EXCLUDES.
   * This allows users to opt out of default exclusions when explicitly needed.
   */
  overrideDefaultExcludes?: boolean;
  /** Scan cache instance for incremental scanning */
  cache?: ScanCache;
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
 * Result from an abortable scan operation
 */
export interface AbortableScanResult<T> extends ScanResult<T> {
  /** Whether the scan was aborted before completion */
  aborted: boolean;
}

/**
 * Statistics for a single glob pattern
 */
export interface PatternStats {
  pattern: string;
  count: number;
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
 * Core exclusion patterns that should ALWAYS be applied.
 * These are build artifacts, dependencies, and tooling directories
 * that are never valid component sources.
 */
export const CORE_EXCLUDES = [
  // Package manager and dependencies
  "**/node_modules/**",

  // Build output
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/out/**",

  // Coverage and cache
  "**/coverage/**",
  "**/.turbo/**",
  "**/.cache/**",

  // Version control
  "**/.git/**",

  // Auto-generated files (code generators, build artifacts)
  "**/*.gen.ts",
  "**/*.gen.tsx",
  "**/*.gen.js",
  "**/*.gen.jsx",
  "**/*.generated.ts",
  "**/*.generated.tsx",
  "**/*.generated.js",
  "**/*.generated.jsx",

  // TypeScript declaration files (type definitions, not components)
  "**/*.d.ts",

  // Minified/bundled files
  "**/*.min.js",
  "**/*.min.css",

  // Example/sandbox code (not production components)
  // These are always excluded as they are typically demo/playground code
  "**/sandbox/**",
  "**/examples/**",
];

/**
 * Default exclusion patterns for file discovery.
 * Includes common build output, cache, tooling directories,
 * and example/test/sandbox code that should not be counted as
 * production components.
 *
 * These patterns are used when no custom excludes are provided.
 * When custom excludes ARE provided, only CORE_EXCLUDES are merged in.
 */
export const DEFAULT_EXCLUDES = [
  // Core excludes (always applied)
  ...CORE_EXCLUDES,

  // Test files by naming convention
  "**/*.test.*",
  "**/*.spec.*",
  "**/*.e2e.*",

  // Story files
  "**/*.stories.*",
  "**/__stories__/**",
  "**/.storybook/**",

  // Test directories
  "**/__tests__/**",
  "**/__mocks__/**",
  "**/__fixtures__/**",
  "**/fixtures/**",

  // E2E testing directories
  "**/e2e/**",
  "**/cypress/**",
  "**/playwright/**",
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
   * Build the exclude patterns list based on config.
   * By default, custom excludes are merged with CORE_EXCLUDES.
   * Set overrideDefaultExcludes: true to completely replace defaults.
   *
   * This method uses CORE_EXCLUDES (node_modules, dist, .git, etc.)
   * rather than full DEFAULT_EXCLUDES when custom excludes are provided.
   * This allows specialized scanners (like storybook scanner) to work correctly
   * when they explicitly include files that would be excluded by DEFAULT_EXCLUDES.
   */
  protected getExcludePatterns(): string[] {
    const customExcludes = this.config.exclude || [];

    // If no custom excludes, use full defaults
    if (customExcludes.length === 0) {
      return DEFAULT_EXCLUDES;
    }

    // If overrideDefaultExcludes is true, use only custom excludes
    if (this.config.overrideDefaultExcludes) {
      return customExcludes;
    }

    // Default behavior: merge custom excludes with CORE_EXCLUDES
    // This ensures node_modules, dist, .git are always excluded
    // but allows specialized scanners to include stories/tests if they want
    return [...new Set([...CORE_EXCLUDES, ...customExcludes])];
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
    const ignore = this.getExcludePatterns();

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

  /**
   * Run scan with caching support.
   * Files that haven't changed since last scan will use cached results.
   */
  protected async runScanWithCache(
    processor: (file: string) => Promise<T[]>,
    defaultPatterns: string[],
    options?: ParallelProcessOptions,
  ): Promise<ScanResult<T> & { cacheStats?: { hits: number; misses: number } }> {
    const cache = this.config.cache;
    const scannerType = this.getSourceType();

    // No cache configured - fall back to regular scan
    if (!cache) {
      return this.runScan(processor, defaultPatterns, options);
    }

    const startTime = Date.now();
    const { files, unmatchedPatterns } = await this.findFilesWithDetails(defaultPatterns);
    const items: T[] = [];
    const errors: ScanError[] = [];
    const warnings: ScanWarning[] = [];

    // Check cache for all files
    const { filesToScan, cachedFiles, cachedEntries } = await cache.checkFiles(
      files,
      scannerType,
    );

    // Add cached results
    for (const entry of cachedEntries) {
      try {
        const cachedItems = JSON.parse(entry.result) as T[];
        items.push(...cachedItems);
      } catch {
        // Corrupt cache entry - add file to scan list
        const absPath = join(this.config.projectRoot, entry.path);
        if (!filesToScan.includes(absPath)) {
          filesToScan.push(absPath);
        }
      }
    }

    // Warn about unmatched patterns
    for (const pattern of unmatchedPatterns) {
      warnings.push({
        code: "PATTERN_NO_MATCH",
        message: `Pattern "${pattern}" matched no files`,
        pattern,
      });
    }

    if (files.length === 0 && unmatchedPatterns.length > 0) {
      warnings.push({
        code: "NO_FILES_MATCHED",
        message: `No files found matching patterns: ${unmatchedPatterns.join(", ")}`,
      });
    }

    // Process only files that need scanning
    if (filesToScan.length > 0) {
      const results = await parallelProcess(
        filesToScan,
        async (file) => {
          const fileItems = await processor(file);
          // Store in cache
          await cache.storeResult(file, scannerType, fileItems);
          return { file, items: fileItems };
        },
        this.concurrency,
        options,
      );

      const { successes } = extractResults(results);

      for (const success of successes) {
        items.push(...success.items);
      }

      // Map failures to errors
      for (let i = 0; i < results.length; i++) {
        const result = results[i]!;
        if (result.status === "rejected") {
          const reason = result.reason;
          const message = reason instanceof Error ? reason.message : String(reason);
          const code =
            reason && typeof reason === "object" && "code" in reason && (reason as any).code === "TIMEOUT"
              ? "TIMEOUT"
              : "PARSE_ERROR";
          errors.push({
            file: filesToScan[i],
            message,
            code,
          });
        }
      }
    }

    const stats: ScanStats = {
      filesScanned: filesToScan.length,
      itemsFound: items.length,
      duration: Date.now() - startTime,
    };

    return {
      items,
      errors,
      warnings,
      stats,
      cacheStats: {
        hits: cachedFiles.length,
        misses: filesToScan.length,
      },
    };
  }

  /**
   * Get per-pattern file match statistics.
   * Useful for debugging which patterns are matching files.
   *
   * @param patterns Glob patterns to analyze
   * @returns Array of pattern statistics with match counts
   */
  protected async getPatternStats(patterns: string[]): Promise<PatternStats[]> {
    const ignore = this.getExcludePatterns();
    const stats: PatternStats[] = [];

    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: this.config.projectRoot,
        ignore,
        absolute: true,
      });
      stats.push({ pattern, count: matches.length });
    }

    return stats;
  }

  /**
   * Async iterator for memory-efficient streaming of scan results.
   * Yields items one at a time as they are discovered, allowing
   * early termination and lower memory usage for large repositories.
   *
   * @param defaultPatterns Default glob patterns for file discovery
   */
  async *scanIterator(defaultPatterns: string[]): AsyncGenerator<T, void, unknown> {
    const { files } = await this.findFilesWithDetails(defaultPatterns);

    for (const file of files) {
      try {
        const items = await this.processFile(file);
        for (const item of items) {
          yield item;
        }
      } catch {
        // Errors are silently skipped in iterator mode
        // Use scan() or scanWithAbort() for error reporting
        continue;
      }
    }
  }

  /**
   * Scan with abort signal support for cancellable operations.
   * Useful for implementing timeouts or user-initiated cancellation.
   *
   * @param defaultPatterns Default glob patterns for file discovery
   * @param signal AbortSignal for cancellation
   * @returns Scan result with aborted flag
   */
  async scanWithAbort(
    defaultPatterns: string[],
    signal: AbortSignal,
  ): Promise<AbortableScanResult<T>> {
    const startTime = Date.now();
    const { files, unmatchedPatterns } = await this.findFilesWithDetails(defaultPatterns);
    const items: T[] = [];
    const errors: ScanError[] = [];
    const warnings: ScanWarning[] = [];
    let aborted = false;

    // Check if already aborted
    if (signal.aborted) {
      return {
        items: [],
        errors: [],
        warnings: [],
        stats: { filesScanned: 0, itemsFound: 0, duration: Date.now() - startTime },
        aborted: true,
      };
    }

    // Warn about unmatched patterns
    for (const pattern of unmatchedPatterns) {
      warnings.push({
        code: "PATTERN_NO_MATCH",
        message: `Pattern "${pattern}" matched no files`,
        pattern,
      });
    }

    // Process files one by one, checking abort signal
    for (const file of files) {
      if (signal.aborted) {
        aborted = true;
        break;
      }

      try {
        const fileItems = await this.processFile(file);
        items.push(...fileItems);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code =
          error && typeof error === "object" && "code" in error && (error as { code: string }).code === "TIMEOUT"
            ? "TIMEOUT"
            : "PARSE_ERROR";
        errors.push({ file, message, code });
      }
    }

    const stats: ScanStats = {
      filesScanned: aborted ? items.length : files.length,
      itemsFound: items.length,
      duration: Date.now() - startTime,
    };

    return { items, errors, warnings, stats, aborted };
  }

  /**
   * Process a single file and return extracted items.
   * Subclasses should override this method for custom processing.
   * Default implementation throws to indicate it must be overridden
   * if using iterator or abort methods.
   *
   * @param file Absolute file path to process
   * @returns Array of extracted items
   */
  protected async processFile(file: string): Promise<T[]> {
    // Default implementation that can be overridden
    // For scanIterator and scanWithAbort to work, subclasses
    // must implement this method
    void file;
    throw new Error(
      "processFile must be implemented by subclass when using scanIterator or scanWithAbort"
    );
  }

  abstract scan(): Promise<ScanResult<T>>;
  abstract getSourceType(): string;
}
