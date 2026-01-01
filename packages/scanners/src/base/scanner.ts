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
}

export interface ScanError {
  file?: string;
  message: string;
  code: string;
}

export interface ScanStats {
  filesScanned: number;
  itemsFound: number;
  duration: number;
}

export interface ScanResult<T> {
  items: T[];
  errors: ScanError[];
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
 * Default exclusion patterns for file discovery
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
];

/**
 * Process items in parallel with limited concurrency
 * @param items Items to process
 * @param processor Function to process each item
 * @param concurrency Maximum number of concurrent operations (default: 10)
 */
export async function parallelProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number = 10,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];

  // Process items in batches
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(processor));
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
   * @returns Array of absolute file paths
   */
  protected async findFiles(defaultPatterns: string[]): Promise<string[]> {
    const patterns = this.config.include?.length
      ? this.config.include
      : defaultPatterns;
    const ignore = this.config.exclude?.length
      ? this.config.exclude
      : DEFAULT_EXCLUDES;

    const allFiles: string[] = [];

    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: this.config.projectRoot,
        ignore,
        absolute: true,
      });
      allFiles.push(...matches);
    }

    // Deduplicate
    return [...new Set(allFiles)];
  }

  /**
   * Helper to run the scan with timing and error handling boilerplate.
   * @param processor Function that processes files and returns items
   * @param defaultPatterns Default glob patterns for file discovery
   */
  protected async runScan(
    processor: (file: string) => Promise<T[]>,
    defaultPatterns: string[],
  ): Promise<ScanResult<T>> {
    const startTime = Date.now();
    const files = await this.findFiles(defaultPatterns);
    const items: T[] = [];
    const errors: ScanError[] = [];

    // Process files in parallel with configurable concurrency
    const results = await parallelProcess(
      files,
      async (file) => ({ file, items: await processor(file) }),
      this.concurrency,
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
        const message =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        errors.push({
          file: files[i],
          message,
          code: "PARSE_ERROR",
        });
      }
    }

    const stats: ScanStats = {
      filesScanned: files.length,
      itemsFound: items.length,
      duration: Date.now() - startTime,
    };

    return { items, errors, stats };
  }

  abstract scan(): Promise<ScanResult<T>>;
  abstract getSourceType(): string;
}
