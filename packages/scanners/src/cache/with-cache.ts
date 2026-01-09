// packages/scanners/src/cache/with-cache.ts
/**
 * RAII-style cache wrapper for guaranteed resource cleanup.
 *
 * Ensures cache is properly loaded before use and saved after use,
 * even when errors occur during the callback execution.
 */

import { ScanCache } from "./scan-cache.js";

/**
 * Options for the withCache wrapper
 */
export interface WithCacheOptions {
  /** Clear cache before use */
  clearCache?: boolean;
  /** Save cache even if callback throws (default: false) */
  saveOnError?: boolean;
  /** Callback for verbose logging */
  onVerbose?: (message: string) => void;
}

/**
 * Result from withCache including cache statistics
 */
export interface WithCacheResult<T> {
  /** The result from the callback */
  result: T;
  /** Cache statistics after operation */
  stats: {
    entryCount: number;
    totalSize: number;
  };
}

/**
 * Execute a callback with a properly managed cache instance.
 *
 * This wrapper ensures:
 * - Cache is loaded before the callback executes
 * - Cache is saved after successful completion
 * - Cache state is consistent even if errors occur
 *
 * @example
 * ```typescript
 * // Simple usage
 * const { result } = await withCache(projectRoot, async (cache) => {
 *   const orchestrator = new ScanOrchestrator(config, projectRoot, { cache });
 *   return orchestrator.scan(['react']);
 * });
 *
 * // With options
 * const { result, stats } = await withCache(
 *   projectRoot,
 *   async (cache) => doScanning(cache),
 *   { clearCache: true, onVerbose: console.log }
 * );
 * ```
 */
export async function withCache<T>(
  projectRoot: string,
  callback: (cache: ScanCache) => Promise<T>,
  options: WithCacheOptions = {},
): Promise<WithCacheResult<T>> {
  const { clearCache = false, saveOnError = false, onVerbose } = options;

  const cache = new ScanCache(projectRoot);

  // Load existing cache data
  await cache.load();

  // Clear if requested
  if (clearCache) {
    cache.clear();
    onVerbose?.("Cache cleared");
  }

  let result: T;
  let error: Error | undefined;

  try {
    result = await callback(cache);
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));

    if (saveOnError) {
      // Save partial progress even on error
      try {
        await cache.save();
        onVerbose?.("Cache saved (partial progress after error)");
      } catch (saveError) {
        // Log but don't mask the original error
        onVerbose?.(`Failed to save cache after error: ${saveError}`);
      }
    }

    throw error;
  }

  // Save cache on success
  await cache.save();
  onVerbose?.("Cache saved");

  return {
    result,
    stats: cache.getStats(),
  };
}

/**
 * Execute a callback with an optional cache instance.
 *
 * If caching is disabled (enabled=false), the callback receives undefined
 * and no cache operations are performed.
 *
 * @example
 * ```typescript
 * const result = await withOptionalCache(
 *   projectRoot,
 *   options.cache !== false, // enabled based on CLI flag
 *   async (cache) => {
 *     const orchestrator = new ScanOrchestrator(config, projectRoot, { cache });
 *     return orchestrator.scan(['react']);
 *   },
 *   { clearCache: options.clearCache }
 * );
 * ```
 */
export async function withOptionalCache<T>(
  projectRoot: string,
  enabled: boolean,
  callback: (cache: ScanCache | undefined) => Promise<T>,
  options: WithCacheOptions = {},
): Promise<{ result: T; stats?: { entryCount: number; totalSize: number } }> {
  if (!enabled) {
    const result = await callback(undefined);
    return { result };
  }

  return withCache(projectRoot, callback, options);
}
