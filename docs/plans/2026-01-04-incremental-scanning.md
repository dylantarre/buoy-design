# Incremental Scanning Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make scans 10-60x faster by only processing files that changed since the last scan.

**Architecture:** Hybrid git + mtime approach. Use `git diff` to detect changes in tracked files (fast, no file reads). Fall back to mtime comparison for untracked files. Store cache in `.buoy/scan-cache.json`. Inject cache logic into base Scanner class so all scanners benefit automatically.

**Tech Stack:** Node.js fs/child_process, git CLI, JSON file storage, TypeScript

---

## Task 1: Create ScanCache Types and Interface

**Files:**
- Create: `packages/scanners/src/cache/types.ts`

**Step 1: Write the type definitions**

```typescript
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
```

**Step 2: Commit**

```bash
git add packages/scanners/src/cache/types.ts
git commit -m "feat(scanners): add scan cache type definitions"
```

---

## Task 2: Create Git Utilities

**Files:**
- Create: `packages/scanners/src/cache/git-utils.ts`
- Test: `packages/scanners/src/cache/git-utils.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/scanners/src/cache/git-utils.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";
import {
  isGitRepo,
  getCurrentCommit,
  getChangedFilesSince,
  getUntrackedFiles,
  isFileTracked,
} from "./git-utils.js";

describe("git-utils", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "buoy-git-test-"));
    // Initialize git repo
    execSync("git init", { cwd: testDir });
    execSync('git config user.email "test@test.com"', { cwd: testDir });
    execSync('git config user.name "Test"', { cwd: testDir });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("isGitRepo", () => {
    it("returns true for git repos", async () => {
      expect(await isGitRepo(testDir)).toBe(true);
    });

    it("returns false for non-git directories", async () => {
      const nonGit = await mkdtemp(join(tmpdir(), "non-git-"));
      expect(await isGitRepo(nonGit)).toBe(false);
      await rm(nonGit, { recursive: true, force: true });
    });
  });

  describe("getCurrentCommit", () => {
    it("returns null for repo with no commits", async () => {
      expect(await getCurrentCommit(testDir)).toBe(null);
    });

    it("returns commit hash after commit", async () => {
      await writeFile(join(testDir, "file.txt"), "content");
      execSync("git add .", { cwd: testDir });
      execSync('git commit -m "initial"', { cwd: testDir });

      const hash = await getCurrentCommit(testDir);
      expect(hash).toMatch(/^[a-f0-9]{40}$/);
    });
  });

  describe("getChangedFilesSince", () => {
    it("returns empty array when no changes", async () => {
      await writeFile(join(testDir, "file.txt"), "content");
      execSync("git add .", { cwd: testDir });
      execSync('git commit -m "initial"', { cwd: testDir });
      const commit = await getCurrentCommit(testDir);

      const changed = await getChangedFilesSince(testDir, commit!);
      expect(changed).toEqual([]);
    });

    it("returns changed files since commit", async () => {
      await writeFile(join(testDir, "file.txt"), "content");
      execSync("git add .", { cwd: testDir });
      execSync('git commit -m "initial"', { cwd: testDir });
      const commit = await getCurrentCommit(testDir);

      // Modify file
      await writeFile(join(testDir, "file.txt"), "modified");
      execSync("git add .", { cwd: testDir });
      execSync('git commit -m "modify"', { cwd: testDir });

      const changed = await getChangedFilesSince(testDir, commit!);
      expect(changed).toContain("file.txt");
    });
  });

  describe("getUntrackedFiles", () => {
    it("returns untracked files", async () => {
      await writeFile(join(testDir, "tracked.txt"), "content");
      execSync("git add .", { cwd: testDir });
      execSync('git commit -m "initial"', { cwd: testDir });

      // Add untracked file
      await writeFile(join(testDir, "untracked.txt"), "new");

      const untracked = await getUntrackedFiles(testDir);
      expect(untracked).toContain("untracked.txt");
      expect(untracked).not.toContain("tracked.txt");
    });
  });

  describe("isFileTracked", () => {
    it("returns true for tracked files", async () => {
      await writeFile(join(testDir, "tracked.txt"), "content");
      execSync("git add .", { cwd: testDir });
      execSync('git commit -m "initial"', { cwd: testDir });

      expect(await isFileTracked(testDir, "tracked.txt")).toBe(true);
    });

    it("returns false for untracked files", async () => {
      await writeFile(join(testDir, "untracked.txt"), "content");
      expect(await isFileTracked(testDir, "untracked.txt")).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm --filter @buoy-design/scanners test src/cache/git-utils.test.ts
```

Expected: FAIL - module not found

**Step 3: Write the implementation**

```typescript
// packages/scanners/src/cache/git-utils.ts
import { exec } from "child_process";
import { promisify } from "util";
import { access } from "fs/promises";
import { join } from "path";

const execAsync = promisify(exec);

/**
 * Check if a directory is a git repository
 */
export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await access(join(dir, ".git"));
    return true;
  } catch {
    // Check if we're in a subdirectory of a git repo
    try {
      await execAsync("git rev-parse --git-dir", { cwd: dir });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Get the current HEAD commit hash
 * Returns null if no commits exist
 */
export async function getCurrentCommit(dir: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync("git rev-parse HEAD", { cwd: dir });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Get list of files changed since a specific commit
 * Returns relative paths
 */
export async function getChangedFilesSince(
  dir: string,
  commitHash: string
): Promise<string[]> {
  try {
    const { stdout } = await execAsync(
      `git diff --name-only ${commitHash} HEAD`,
      { cwd: dir }
    );
    return stdout.trim().split("\n").filter(Boolean);
  } catch {
    // If commit doesn't exist or other error, return empty
    return [];
  }
}

/**
 * Get list of files changed in the working directory (uncommitted)
 * Includes both staged and unstaged changes
 */
export async function getUncommittedChanges(dir: string): Promise<string[]> {
  try {
    // Get both staged and unstaged changes
    const { stdout: staged } = await execAsync(
      "git diff --name-only --cached",
      { cwd: dir }
    );
    const { stdout: unstaged } = await execAsync("git diff --name-only", {
      cwd: dir,
    });

    const files = new Set([
      ...staged.trim().split("\n").filter(Boolean),
      ...unstaged.trim().split("\n").filter(Boolean),
    ]);

    return Array.from(files);
  } catch {
    return [];
  }
}

/**
 * Get list of untracked files in the repository
 * Returns relative paths
 */
export async function getUntrackedFiles(dir: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync(
      "git ls-files --others --exclude-standard",
      { cwd: dir }
    );
    return stdout.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Check if a specific file is tracked by git
 */
export async function isFileTracked(
  dir: string,
  relativePath: string
): Promise<boolean> {
  try {
    await execAsync(`git ls-files --error-unmatch "${relativePath}"`, {
      cwd: dir,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all changed files (committed since hash + uncommitted + untracked)
 * This is the main function for incremental scanning
 */
export async function getAllChangedFiles(
  dir: string,
  sinceCommit: string | null
): Promise<{ changed: string[]; isFullScan: boolean }> {
  // If no commit to compare against, need full scan
  if (!sinceCommit) {
    return { changed: [], isFullScan: true };
  }

  try {
    // Check if the commit exists
    await execAsync(`git cat-file -t ${sinceCommit}`, { cwd: dir });
  } catch {
    // Commit doesn't exist (maybe rebased), need full scan
    return { changed: [], isFullScan: true };
  }

  const [committedChanges, uncommittedChanges, untrackedFiles] =
    await Promise.all([
      getChangedFilesSince(dir, sinceCommit),
      getUncommittedChanges(dir),
      getUntrackedFiles(dir),
    ]);

  const allChanged = new Set([
    ...committedChanges,
    ...uncommittedChanges,
    ...untrackedFiles,
  ]);

  return { changed: Array.from(allChanged), isFullScan: false };
}
```

**Step 4: Run tests to verify they pass**

```bash
pnpm --filter @buoy-design/scanners test src/cache/git-utils.test.ts
```

Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/scanners/src/cache/git-utils.ts packages/scanners/src/cache/git-utils.test.ts
git commit -m "feat(scanners): add git utilities for incremental scanning"
```

---

## Task 3: Create ScanCache Service

**Files:**
- Create: `packages/scanners/src/cache/scan-cache.ts`
- Test: `packages/scanners/src/cache/scan-cache.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/scanners/src/cache/scan-cache.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";
import { ScanCache } from "./scan-cache.js";

describe("ScanCache", () => {
  let testDir: string;
  let cache: ScanCache;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "buoy-cache-test-"));
    // Initialize git repo
    execSync("git init", { cwd: testDir });
    execSync('git config user.email "test@test.com"', { cwd: testDir });
    execSync('git config user.name "Test"', { cwd: testDir });

    // Create initial commit
    await writeFile(join(testDir, "src", "Button.tsx"), "export const Button = () => <button />");
    await mkdir(join(testDir, "src"), { recursive: true });
    await writeFile(join(testDir, "src", "Button.tsx"), "export const Button = () => <button />");
    execSync("git add .", { cwd: testDir });
    execSync('git commit -m "initial"', { cwd: testDir });

    cache = new ScanCache(testDir);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("checkFiles", () => {
    it("returns all files as needing scan on first run", async () => {
      const files = ["src/Button.tsx"];
      const result = await cache.checkFiles(files, "react");

      expect(result.filesToScan).toEqual(files);
      expect(result.cachedFiles).toEqual([]);
    });

    it("returns cached files after they are stored", async () => {
      const files = ["src/Button.tsx"];

      // First scan
      await cache.checkFiles(files, "react");
      await cache.storeResult("src/Button.tsx", "react", [{ name: "Button" }]);
      await cache.save();

      // Second scan - should be cached
      const result = await cache.checkFiles(files, "react");

      expect(result.cachedFiles).toEqual(files);
      expect(result.filesToScan).toEqual([]);
    });

    it("invalidates cache when file changes", async () => {
      const files = ["src/Button.tsx"];

      // First scan
      await cache.checkFiles(files, "react");
      await cache.storeResult("src/Button.tsx", "react", [{ name: "Button" }]);
      await cache.save();

      // Modify file
      await writeFile(
        join(testDir, "src", "Button.tsx"),
        "export const Button = () => <button>Changed</button>"
      );
      execSync("git add .", { cwd: testDir });
      execSync('git commit -m "modify"', { cwd: testDir });

      // New cache instance (simulates fresh CLI run)
      const newCache = new ScanCache(testDir);
      const result = await newCache.checkFiles(files, "react");

      expect(result.filesToScan).toEqual(files);
      expect(result.cachedFiles).toEqual([]);
    });
  });

  describe("getCachedResult", () => {
    it("returns cached result for file", async () => {
      await cache.storeResult("src/Button.tsx", "react", [{ name: "Button", id: "123" }]);

      const result = cache.getCachedResult("src/Button.tsx", "react");
      expect(result).toEqual([{ name: "Button", id: "123" }]);
    });

    it("returns null for uncached file", () => {
      const result = cache.getCachedResult("src/Unknown.tsx", "react");
      expect(result).toBeNull();
    });
  });

  describe("clear", () => {
    it("removes all cached entries", async () => {
      await cache.storeResult("src/Button.tsx", "react", [{ name: "Button" }]);
      cache.clear();

      const result = cache.getCachedResult("src/Button.tsx", "react");
      expect(result).toBeNull();
    });
  });

  describe("persistence", () => {
    it("persists cache to .buoy directory", async () => {
      await cache.storeResult("src/Button.tsx", "react", [{ name: "Button" }]);
      await cache.save();

      // Verify file exists
      const cacheFile = join(testDir, ".buoy", "scan-cache.json");
      const content = await readFile(cacheFile, "utf-8");
      const data = JSON.parse(content);

      expect(data.version).toBe(1);
      expect(data.entries).toHaveProperty("react:src/Button.tsx");
    });

    it("loads cache from .buoy directory", async () => {
      await cache.storeResult("src/Button.tsx", "react", [{ name: "Button" }]);
      await cache.save();

      // New cache instance should load from disk
      const newCache = new ScanCache(testDir);
      await newCache.load();

      const result = newCache.getCachedResult("src/Button.tsx", "react");
      expect(result).toEqual([{ name: "Button" }]);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm --filter @buoy-design/scanners test src/cache/scan-cache.test.ts
```

Expected: FAIL - module not found

**Step 3: Write the implementation**

```typescript
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
```

**Step 4: Run tests to verify they pass**

```bash
pnpm --filter @buoy-design/scanners test src/cache/scan-cache.test.ts
```

Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/scanners/src/cache/scan-cache.ts packages/scanners/src/cache/scan-cache.test.ts packages/scanners/src/cache/types.ts
git commit -m "feat(scanners): add ScanCache service for incremental scanning"
```

---

## Task 4: Create Cache Index Export

**Files:**
- Create: `packages/scanners/src/cache/index.ts`

**Step 1: Write the export file**

```typescript
// packages/scanners/src/cache/index.ts
export { ScanCache } from "./scan-cache.js";
export * from "./types.js";
export * from "./git-utils.js";
```

**Step 2: Export from main package**

Update `packages/scanners/src/index.ts` to add:

```typescript
export * from "./cache/index.js";
```

**Step 3: Commit**

```bash
git add packages/scanners/src/cache/index.ts packages/scanners/src/index.ts
git commit -m "feat(scanners): export cache module"
```

---

## Task 5: Integrate Cache into Base Scanner

**Files:**
- Modify: `packages/scanners/src/base/scanner.ts`

**Step 1: Add cache support to ScannerConfig**

Add to `ScannerConfig` interface (around line 5):

```typescript
export interface ScannerConfig {
  projectRoot: string;
  include?: string[];
  exclude?: string[];
  options?: Record<string, unknown>;
  concurrency?: number;
  largeFileCountThreshold?: number;
  overrideDefaultExcludes?: boolean;
  /** Scan cache instance for incremental scanning */
  cache?: import("../cache/scan-cache.js").ScanCache;
}
```

**Step 2: Add cache-aware scan methods to Scanner class**

Add these methods to the `Scanner` class (after `runScan` method, around line 598):

```typescript
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
```

**Step 3: Add import at top of file**

```typescript
import { join } from "path";
```

**Step 4: Run existing tests to ensure no regression**

```bash
pnpm --filter @buoy-design/scanners test src/base/scanner.test.ts
```

Expected: All existing tests PASS

**Step 5: Commit**

```bash
git add packages/scanners/src/base/scanner.ts
git commit -m "feat(scanners): add cache-aware runScanWithCache method to base scanner"
```

---

## Task 6: Update React Scanner to Use Cache

**Files:**
- Modify: `packages/scanners/src/git/react-scanner.ts`

**Step 1: Update scan() method to use cache**

Replace the `scan()` method (around line 93-100):

```typescript
  async scan(): Promise<ScanResult<Component>> {
    // Clear signals from previous scan
    this.signalAggregator.clear();

    // Use cache if available
    if (this.config.cache) {
      return this.runScanWithCache(
        (file) => this.parseFile(file),
        ReactComponentScanner.DEFAULT_PATTERNS,
      );
    }

    return this.runScan(
      (file) => this.parseFile(file),
      ReactComponentScanner.DEFAULT_PATTERNS,
    );
  }
```

**Step 2: Run React scanner tests**

```bash
pnpm --filter @buoy-design/scanners test src/git/react-scanner.test.ts
```

Expected: All tests PASS

**Step 3: Commit**

```bash
git add packages/scanners/src/git/react-scanner.ts
git commit -m "feat(scanners): enable cache support in React scanner"
```

---

## Task 7: Update Other Scanners to Use Cache

**Files:**
- Modify: `packages/scanners/src/git/vue-scanner.ts`
- Modify: `packages/scanners/src/git/svelte-scanner.ts`
- Modify: `packages/scanners/src/git/angular-scanner.ts`
- Modify: `packages/scanners/src/git/webcomponent-scanner.ts`
- Modify: `packages/scanners/src/git/template-scanner.ts`
- Modify: `packages/scanners/src/git/token-scanner.ts`

**Step 1: Update each scanner's scan() method**

Apply the same pattern to each scanner - check for cache and use `runScanWithCache`:

```typescript
// Example pattern for each scanner
async scan(): Promise<ScanResult<Component>> {
  if (this.config.cache) {
    return this.runScanWithCache(
      (file) => this.parseFile(file),
      DEFAULT_PATTERNS,
    );
  }
  return this.runScan(
    (file) => this.parseFile(file),
    DEFAULT_PATTERNS,
  );
}
```

**Step 2: Run all scanner tests**

```bash
pnpm --filter @buoy-design/scanners test
```

Expected: All tests PASS

**Step 3: Commit**

```bash
git add packages/scanners/src/git/*.ts
git commit -m "feat(scanners): enable cache support in all framework scanners"
```

---

## Task 8: Wire Cache into Orchestrator

**Files:**
- Modify: `apps/cli/src/scan/orchestrator.ts`

**Step 1: Add cache support to orchestrator**

Update the `ScanOrchestrator` class to accept and pass cache:

```typescript
// Add import at top
import { ScanCache } from "@buoy-design/scanners";

// Update class
export class ScanOrchestrator {
  private config: BuoyConfig;
  private projectRoot: string;
  private cache: ScanCache | null;

  constructor(
    config: BuoyConfig,
    projectRoot: string = process.cwd(),
    options?: { cache?: ScanCache }
  ) {
    this.config = config;
    this.projectRoot = projectRoot;
    this.cache = options?.cache ?? null;
  }
```

**Step 2: Pass cache to each scanner**

Update each scanner creation in `scanSource` to include cache. Example for React:

```typescript
case "react": {
  const cfg = this.config.sources.react;
  if (!cfg) break;

  const scanner = new scanners.ReactComponentScanner({
    projectRoot: this.projectRoot,
    include: cfg.include,
    exclude: cfg.exclude,
    designSystemPackage: cfg.designSystemPackage,
    cache: this.cache ?? undefined,  // Add this line
  });
  // ... rest unchanged
}
```

Apply same change to all scanner cases (vue, svelte, angular, webcomponent, templates, tokens).

**Step 3: Commit**

```bash
git add apps/cli/src/scan/orchestrator.ts
git commit -m "feat(cli): pass scan cache to orchestrator and scanners"
```

---

## Task 9: Add CLI Flags for Cache Control

**Files:**
- Modify: `apps/cli/src/commands/scan.ts`
- Modify: `apps/cli/src/commands/status.ts`

**Step 1: Update scan command to support cache flags**

Add these options to the scan command:

```typescript
.option("--no-cache", "Disable incremental scanning cache")
.option("--clear-cache", "Clear cache before scanning")
```

Update the action to create and use cache:

```typescript
// At start of action, after config loading
let cache: ScanCache | null = null;
if (options.cache !== false) {  // --no-cache sets this to false
  cache = new ScanCache(projectRoot);

  if (options.clearCache) {
    cache.clear();
  }
}

// Pass to orchestrator
const orchestrator = new ScanOrchestrator(config, projectRoot, { cache });

// After scan completes, save cache
if (cache) {
  await cache.save();
}
```

**Step 2: Add same flags to status command**

Apply similar changes to `apps/cli/src/commands/status.ts`.

**Step 3: Build and test**

```bash
pnpm build
node apps/cli/dist/bin.js scan --help
# Should show --no-cache and --clear-cache options
```

**Step 4: Commit**

```bash
git add apps/cli/src/commands/scan.ts apps/cli/src/commands/status.ts
git commit -m "feat(cli): add --no-cache and --clear-cache flags to scan commands"
```

---

## Task 10: Add Cache Statistics to Output

**Files:**
- Modify: `apps/cli/src/output/reporters.ts`

**Step 1: Add cache stats reporting function**

```typescript
export function reportCacheStats(stats: { hits: number; misses: number }): void {
  if (isJsonMode()) return;

  const total = stats.hits + stats.misses;
  const hitRate = total > 0 ? ((stats.hits / total) * 100).toFixed(1) : "0";

  if (stats.hits > 0) {
    info(`Cache: ${stats.hits}/${total} files cached (${hitRate}% hit rate)`);
  }
}
```

**Step 2: Use in scan command after scan completes**

```typescript
// In scan command, after orchestrator.scan()
if (cache) {
  const cacheStats = cache.getStats();
  reportCacheStats({ hits: result.cacheStats?.hits ?? 0, misses: result.cacheStats?.misses ?? 0 });
}
```

**Step 3: Commit**

```bash
git add apps/cli/src/output/reporters.ts apps/cli/src/commands/scan.ts
git commit -m "feat(cli): display cache hit statistics after scan"
```

---

## Task 11: Integration Test

**Files:**
- Create: `apps/cli/src/__tests__/incremental-scan.test.ts`

**Step 1: Write integration test**

```typescript
// apps/cli/src/__tests__/incremental-scan.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";

describe("Incremental Scanning Integration", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "buoy-integ-test-"));

    // Initialize git repo
    execSync("git init", { cwd: testDir });
    execSync('git config user.email "test@test.com"', { cwd: testDir });
    execSync('git config user.name "Test"', { cwd: testDir });

    // Create component files
    await mkdir(join(testDir, "src"), { recursive: true });
    await writeFile(
      join(testDir, "src", "Button.tsx"),
      'export const Button = () => <button>Click</button>;'
    );
    await writeFile(
      join(testDir, "src", "Card.tsx"),
      'export const Card = () => <div>Card</div>;'
    );

    // Initial commit
    execSync("git add .", { cwd: testDir });
    execSync('git commit -m "initial"', { cwd: testDir });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("caches scan results and reuses them", async () => {
    // First scan - should scan all files
    const result1 = execSync(
      `node ${process.cwd()}/apps/cli/dist/bin.js scan --json`,
      { cwd: testDir, encoding: "utf-8" }
    );
    const scan1 = JSON.parse(result1);
    expect(scan1.components.length).toBe(2);

    // Second scan - should use cache
    const result2 = execSync(
      `node ${process.cwd()}/apps/cli/dist/bin.js scan --json`,
      { cwd: testDir, encoding: "utf-8" }
    );
    const scan2 = JSON.parse(result2);
    expect(scan2.components.length).toBe(2);

    // Verify cache file exists
    const cacheFile = join(testDir, ".buoy", "scan-cache.json");
    const cacheContent = await readFile(cacheFile, "utf-8");
    const cache = JSON.parse(cacheContent);
    expect(Object.keys(cache.entries).length).toBeGreaterThan(0);
  });

  it("invalidates cache when file changes", async () => {
    // First scan
    execSync(
      `node ${process.cwd()}/apps/cli/dist/bin.js scan --json`,
      { cwd: testDir }
    );

    // Modify a file
    await writeFile(
      join(testDir, "src", "Button.tsx"),
      'export const Button = () => <button>Modified</button>;'
    );
    execSync("git add .", { cwd: testDir });
    execSync('git commit -m "modify button"', { cwd: testDir });

    // Second scan - Button should be re-scanned
    const result = execSync(
      `node ${process.cwd()}/apps/cli/dist/bin.js scan --json`,
      { cwd: testDir, encoding: "utf-8" }
    );
    const scan = JSON.parse(result);
    expect(scan.components.length).toBe(2);
  });

  it("respects --no-cache flag", async () => {
    // First scan with cache
    execSync(
      `node ${process.cwd()}/apps/cli/dist/bin.js scan`,
      { cwd: testDir }
    );

    // Second scan with --no-cache should still work
    const result = execSync(
      `node ${process.cwd()}/apps/cli/dist/bin.js scan --json --no-cache`,
      { cwd: testDir, encoding: "utf-8" }
    );
    const scan = JSON.parse(result);
    expect(scan.components.length).toBe(2);
  });

  it("respects --clear-cache flag", async () => {
    // First scan
    execSync(
      `node ${process.cwd()}/apps/cli/dist/bin.js scan`,
      { cwd: testDir }
    );

    // Verify cache exists
    const cacheFile = join(testDir, ".buoy", "scan-cache.json");
    let cache = JSON.parse(await readFile(cacheFile, "utf-8"));
    expect(Object.keys(cache.entries).length).toBeGreaterThan(0);

    // Scan with --clear-cache
    execSync(
      `node ${process.cwd()}/apps/cli/dist/bin.js scan --clear-cache`,
      { cwd: testDir }
    );

    // Cache should be repopulated (not empty)
    cache = JSON.parse(await readFile(cacheFile, "utf-8"));
    expect(Object.keys(cache.entries).length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run integration test**

```bash
pnpm build
pnpm --filter @buoy-design/cli test src/__tests__/incremental-scan.test.ts
```

Expected: All tests PASS

**Step 3: Commit**

```bash
git add apps/cli/src/__tests__/incremental-scan.test.ts
git commit -m "test(cli): add incremental scanning integration tests"
```

---

## Task 12: Update .gitignore

**Files:**
- Modify: `.gitignore`

**Step 1: Add cache file to gitignore**

Add to `.gitignore`:

```
# Buoy scan cache (per-project, not committed)
.buoy/scan-cache.json
```

**Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore scan cache files"
```

---

## Task 13: Final Build and Test

**Step 1: Full build**

```bash
pnpm build
```

**Step 2: Run all tests**

```bash
pnpm test
```

**Step 3: Manual smoke test**

```bash
# In a test project
cd /path/to/test-project
buoy sweep  # First scan - should be normal speed
buoy sweep  # Second scan - should be faster, show cache stats
```

**Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "feat: complete incremental scanning implementation"
```

---

## Summary

This implementation adds incremental scanning with:

1. **Hybrid git + mtime approach** - Fast change detection using git for tracked files
2. **Per-file caching** - Results stored in `.buoy/scan-cache.json`
3. **Automatic cache invalidation** - When files change or git history changes
4. **CLI flags** - `--no-cache` to disable, `--clear-cache` to reset
5. **Cache statistics** - Shows hit rate after scans
6. **All scanners supported** - React, Vue, Svelte, Angular, WebComponent, Templates, Tokens

Expected performance improvement: **10-60x faster** for typical incremental scans.
