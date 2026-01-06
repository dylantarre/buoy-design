// packages/scanners/src/cache/scan-cache.ts
import { readFile, writeFile, mkdir, stat } from "fs/promises";
import { join, relative, isAbsolute } from "path";
import {
  type ScanCacheData,
  type FileCacheEntry,
  type CacheCheckResult,
  CACHE_VERSION,
} from "./types.js";
import {
  isGitRepo,
  getCurrentCommit,
  getAllChangedFiles,
} from "./git-utils.js";

const CACHE_FILE = "scan-cache.json";
const BUOY_DIR = ".buoy";

export class ScanCache {
  private projectRoot: string;
  private data: ScanCacheData;
  private loaded: boolean = false;
  private changedFilesCache: Set<string> | null = null;
  private isGit: boolean | null = null;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.data = this.createEmptyCache();
  }

  private createEmptyCache(): ScanCacheData {
    return {
      version: CACHE_VERSION,
      projectRoot: this.projectRoot,
      lastFullScanCommit: null,
      lastFullScanTime: null,
      entries: {},
    };
  }

  private getCachePath(): string {
    return join(this.projectRoot, BUOY_DIR, CACHE_FILE);
  }

  private getCacheKey(relativePath: string, scanner: string): string {
    return `${scanner}:${relativePath}`;
  }

  /**
   * Load cache from disk
   */
  async load(): Promise<void> {
    if (this.loaded) return;

    try {
      const content = await readFile(this.getCachePath(), "utf-8");
      const data = JSON.parse(content) as ScanCacheData;

      // Version check - invalidate if version mismatch
      if (data.version !== CACHE_VERSION) {
        this.data = this.createEmptyCache();
      } else {
        this.data = data;
      }
    } catch {
      // No cache file or parse error - start fresh
      this.data = this.createEmptyCache();
    }

    this.loaded = true;
  }

  /**
   * Save cache to disk
   */
  async save(): Promise<void> {
    const buoyDir = join(this.projectRoot, BUOY_DIR);

    // Ensure .buoy directory exists
    await mkdir(buoyDir, { recursive: true });

    // Update last scan info
    this.isGit = await isGitRepo(this.projectRoot);
    if (this.isGit) {
      this.data.lastFullScanCommit = await getCurrentCommit(this.projectRoot);
    }
    this.data.lastFullScanTime = Date.now();

    await writeFile(
      this.getCachePath(),
      JSON.stringify(this.data, null, 2),
      "utf-8"
    );
  }

  /**
   * Check which files need scanning vs which can use cache
   */
  async checkFiles(
    absolutePaths: string[],
    scanner: string
  ): Promise<CacheCheckResult> {
    await this.load();

    // Initialize git state if needed
    if (this.isGit === null) {
      this.isGit = await isGitRepo(this.projectRoot);
    }

    // Get changed files (cached per session)
    if (this.changedFilesCache === null) {
      if (this.isGit) {
        const { changed, isFullScan } = await getAllChangedFiles(
          this.projectRoot,
          this.data.lastFullScanCommit
        );

        if (isFullScan) {
          // Need full scan - invalidate all cache
          this.changedFilesCache = new Set(); // Empty means "all files changed"
          this.data.entries = {};
        } else {
          this.changedFilesCache = new Set(changed);
        }
      } else {
        // Not a git repo - use mtime comparison
        this.changedFilesCache = new Set();
      }
    }

    const filesToScan: string[] = [];
    const cachedFiles: string[] = [];
    const cachedEntries: FileCacheEntry[] = [];

    for (const absPath of absolutePaths) {
      const relativePath = isAbsolute(absPath)
        ? relative(this.projectRoot, absPath)
        : absPath;

      const cacheKey = this.getCacheKey(relativePath, scanner);
      const entry = this.data.entries[cacheKey];

      // Check if file needs scanning
      const needsScan = await this.needsScan(relativePath, entry, scanner);

      if (needsScan) {
        filesToScan.push(absPath);
      } else if (entry) {
        cachedFiles.push(absPath);
        cachedEntries.push(entry);
      } else {
        // No entry and doesn't need scan? Shouldn't happen, but scan to be safe
        filesToScan.push(absPath);
      }
    }

    return { filesToScan, cachedFiles, cachedEntries };
  }

  private async needsScan(
    relativePath: string,
    entry: FileCacheEntry | undefined,
    scanner: string
  ): Promise<boolean> {
    // No cache entry = needs scan
    if (!entry) return true;

    // Scanner mismatch = needs scan
    if (entry.scanner !== scanner) return true;

    // In git mode, check if file is in changed set
    if (this.isGit && this.changedFilesCache) {
      // If changedFilesCache is empty, we're doing a full scan
      if (this.changedFilesCache.size === 0 && !this.data.lastFullScanCommit) {
        return true;
      }
      // File is in changed set = needs scan
      if (this.changedFilesCache.has(relativePath)) {
        return true;
      }
      // File not in changed set = use cache
      return false;
    }

    // Non-git mode: use mtime comparison
    try {
      const absPath = join(this.projectRoot, relativePath);
      const stats = await stat(absPath);
      const currentMtime = stats.mtimeMs;

      // If mtime changed, needs scan
      return currentMtime > entry.mtime;
    } catch {
      // Can't stat file - needs scan (or doesn't exist)
      return true;
    }
  }

  /**
   * Store scan result for a file
   */
  async storeResult<T>(
    absoluteOrRelativePath: string,
    scanner: string,
    result: T[]
  ): Promise<void> {
    const relativePath = isAbsolute(absoluteOrRelativePath)
      ? relative(this.projectRoot, absoluteOrRelativePath)
      : absoluteOrRelativePath;

    const cacheKey = this.getCacheKey(relativePath, scanner);

    // Get mtime
    let mtime = Date.now();
    try {
      const absPath = isAbsolute(absoluteOrRelativePath)
        ? absoluteOrRelativePath
        : join(this.projectRoot, absoluteOrRelativePath);
      const stats = await stat(absPath);
      mtime = stats.mtimeMs;
    } catch {
      // Use current time if can't stat
    }

    const entry: FileCacheEntry = {
      path: relativePath,
      scanner,
      mtime,
      commitHash: this.isGit
        ? (await getCurrentCommit(this.projectRoot)) ?? undefined
        : undefined,
      result: JSON.stringify(result),
      cachedAt: Date.now(),
    };

    this.data.entries[cacheKey] = entry;
  }

  /**
   * Get cached result for a file
   */
  getCachedResult<T>(
    absoluteOrRelativePath: string,
    scanner: string
  ): T[] | null {
    const relativePath = isAbsolute(absoluteOrRelativePath)
      ? relative(this.projectRoot, absoluteOrRelativePath)
      : absoluteOrRelativePath;

    const cacheKey = this.getCacheKey(relativePath, scanner);
    const entry = this.data.entries[cacheKey];

    if (!entry) return null;

    try {
      return JSON.parse(entry.result) as T[];
    } catch {
      return null;
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.data = this.createEmptyCache();
    this.changedFilesCache = null;
  }

  /**
   * Get cache statistics
   */
  getStats(): { entryCount: number; totalSize: number } {
    const entries = Object.values(this.data.entries);
    const totalSize = entries.reduce((sum, e) => sum + e.result.length, 0);
    return {
      entryCount: entries.length,
      totalSize,
    };
  }
}
