// packages/scanners/src/cache/scan-cache.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "path";
import { execSync } from "child_process";

// Unmock fs modules to use real filesystem for git operations
vi.unmock("fs/promises");
vi.unmock("fs");

// Must import after unmock
const { mkdtemp, rm, writeFile, mkdir, readFile } = await import("fs/promises");
const { tmpdir } = await import("os");

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

    // Create src directory and initial file
    await mkdir(join(testDir, "src"), { recursive: true });
    await writeFile(
      join(testDir, "src", "Button.tsx"),
      "export const Button = () => <button />"
    );
    execSync("git add .", { cwd: testDir });
    execSync('git commit -m "initial"', { cwd: testDir });

    cache = new ScanCache(testDir);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("checkFiles", () => {
    it("returns all files as needing scan on first run", async () => {
      const files = [join(testDir, "src", "Button.tsx")];
      const result = await cache.checkFiles(files, "react");

      expect(result.filesToScan).toEqual(files);
      expect(result.cachedFiles).toEqual([]);
    });

    it("returns cached files after they are stored", async () => {
      const files = [join(testDir, "src", "Button.tsx")];

      // First scan
      await cache.checkFiles(files, "react");
      await cache.storeResult(files[0]!, "react", [{ name: "Button" }]);
      await cache.save();

      // Second scan - should be cached (same cache instance)
      const result = await cache.checkFiles(files, "react");

      expect(result.cachedFiles).toEqual(files);
      expect(result.filesToScan).toEqual([]);
    });

    it("invalidates cache when file changes", async () => {
      const files = [join(testDir, "src", "Button.tsx")];

      // First scan
      await cache.checkFiles(files, "react");
      await cache.storeResult(files[0]!, "react", [{ name: "Button" }]);
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
      const absPath = join(testDir, "src", "Button.tsx");
      await cache.storeResult(absPath, "react", [{ name: "Button", id: "123" }]);

      const result = cache.getCachedResult(absPath, "react");
      expect(result).toEqual([{ name: "Button", id: "123" }]);
    });

    it("returns null for uncached file", () => {
      const result = cache.getCachedResult(
        join(testDir, "src", "Unknown.tsx"),
        "react"
      );
      expect(result).toBeNull();
    });
  });

  describe("clear", () => {
    it("removes all cached entries", async () => {
      const absPath = join(testDir, "src", "Button.tsx");
      await cache.storeResult(absPath, "react", [{ name: "Button" }]);
      cache.clear();

      const result = cache.getCachedResult(absPath, "react");
      expect(result).toBeNull();
    });
  });

  describe("persistence", () => {
    it("persists cache to .buoy directory", async () => {
      const absPath = join(testDir, "src", "Button.tsx");
      await cache.storeResult(absPath, "react", [{ name: "Button" }]);
      await cache.save();

      // Verify file exists
      const cacheFile = join(testDir, ".buoy", "scan-cache.json");
      const content = await readFile(cacheFile, "utf-8");
      const data = JSON.parse(content);

      expect(data.version).toBe(1);
      expect(data.entries).toHaveProperty("react:src/Button.tsx");
    });

    it("loads cache from .buoy directory", async () => {
      const absPath = join(testDir, "src", "Button.tsx");
      await cache.storeResult(absPath, "react", [{ name: "Button" }]);
      await cache.save();

      // New cache instance should load from disk
      const newCache = new ScanCache(testDir);
      await newCache.load();

      const result = newCache.getCachedResult(absPath, "react");
      expect(result).toEqual([{ name: "Button" }]);
    });
  });

  describe("getStats", () => {
    it("returns entry count and size", async () => {
      const absPath = join(testDir, "src", "Button.tsx");
      await cache.storeResult(absPath, "react", [
        { name: "Button", props: [] },
      ]);

      const stats = cache.getStats();
      expect(stats.entryCount).toBe(1);
      expect(stats.totalSize).toBeGreaterThan(0);
    });
  });
});
