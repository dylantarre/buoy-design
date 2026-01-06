// packages/scanners/src/cache/types.ts

/**
 * Cached result for a single file
 */
export interface FileCacheEntry {
  /** File path relative to project root */
  path: string;
  /** Scanner that processed this file */
  scanner: string;
  /** mtime of file when scanned (for untracked files) */
  mtime: number;
  /** Git commit hash when file was scanned (for tracked files) */
  commitHash?: string;
  /** Cached scan result (serialized) */
  result: string;
  /** Timestamp when this entry was created */
  cachedAt: number;
}

/**
 * Root structure of the scan cache file
 */
export interface ScanCacheData {
  /** Cache format version for migrations */
  version: number;
  /** Project root this cache belongs to */
  projectRoot: string;
  /** Last git commit hash when full scan was done */
  lastFullScanCommit: string | null;
  /** Timestamp of last full scan */
  lastFullScanTime: number | null;
  /** Per-file cache entries keyed by "scanner:relativePath" */
  entries: Record<string, FileCacheEntry>;
}

/**
 * Result of checking which files need scanning
 */
export interface CacheCheckResult {
  /** Files that need to be scanned (changed or new) */
  filesToScan: string[];
  /** Files with valid cache (can skip) */
  cachedFiles: string[];
  /** Cache entries for cached files */
  cachedEntries: FileCacheEntry[];
}

/**
 * Options for cache operations
 */
export interface CacheOptions {
  /** Force full scan, ignore cache */
  noCache?: boolean;
  /** Clear cache before scanning */
  clearCache?: boolean;
}

/** Current cache version */
export const CACHE_VERSION = 1;
