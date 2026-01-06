// packages/scanners/src/cache/scanner-cache.test.ts
// Tests for base scanner cache integration
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "path";
import { execSync } from "child_process";

// Unmock fs modules and glob to use real filesystem
vi.unmock("fs/promises");
vi.unmock("fs");
vi.unmock("glob");

const { mkdtemp, rm, writeFile, mkdir, readFile } = await import("fs/promises");
const { tmpdir } = await import("os");
const { glob } = await import("glob");

import { ScanCache } from "./scan-cache.js";
import { Scanner, type ScannerConfig, type ScanResult } from "../base/scanner.js";

// Create a simple test scanner
class TestScanner extends Scanner<{ name: string }> {
  private parseCount = 0;

  async scan(): Promise<ScanResult<{ name: string }>> {
    if (this.config.cache) {
      return this.runScanWithCache(
        (file) => this.parseFile(file),
        ["**/*.txt"]
      );
    }
    return this.runScan((file) => this.parseFile(file), ["**/*.txt"]);
  }

  protected async parseFile(file: string): Promise<{ name: string }[]> {
    this.parseCount++;
    const { readFile } = await import("fs/promises");
    const content = await readFile(file, "utf-8");
    return [{ name: content.trim() }];
  }

  getSourceType(): string {
    return "test";
  }

  getParseCount(): number {
    return this.parseCount;
  }

  resetParseCount(): void {
    this.parseCount = 0;
  }
}

describe("Scanner Cache Integration", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "buoy-scanner-cache-"));
    // Initialize git repo
    execSync("git init", { cwd: testDir });
    execSync('git config user.email "test@test.com"', { cwd: testDir });
    execSync('git config user.name "Test"', { cwd: testDir });

    // Create test files
    await mkdir(join(testDir, "src"), { recursive: true });
    await writeFile(join(testDir, "src", "file1.txt"), "Component1");
    await writeFile(join(testDir, "src", "file2.txt"), "Component2");
    execSync("git add .", { cwd: testDir });
    execSync('git commit -m "initial"', { cwd: testDir });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("scans all files without cache", async () => {
    const scanner = new TestScanner({
      projectRoot: testDir,
      include: ["src/**/*.txt"],
    });

    const result = await scanner.scan();
    expect(result.items).toHaveLength(2);
    expect(scanner.getParseCount()).toBe(2);
  });

  it("uses cache on second scan", async () => {
    const cache = new ScanCache(testDir);

    // First scan
    const scanner1 = new TestScanner({
      projectRoot: testDir,
      include: ["src/**/*.txt"],
      cache,
    });

    const result1 = await scanner1.scan();
    expect(result1.items).toHaveLength(2);
    expect(scanner1.getParseCount()).toBe(2);

    await cache.save();

    // Second scan with same cache instance
    scanner1.resetParseCount();
    const result2 = await scanner1.scan();
    expect(result2.items).toHaveLength(2);
    // Should use cache, no parsing
    expect(scanner1.getParseCount()).toBe(0);
  });

  it("invalidates cache when file changes", async () => {
    const cache = new ScanCache(testDir);

    // First scan
    const scanner = new TestScanner({
      projectRoot: testDir,
      include: ["src/**/*.txt"],
      cache,
    });

    await scanner.scan();
    await cache.save();

    // Modify file
    await writeFile(join(testDir, "src", "file1.txt"), "Modified");
    execSync("git add .", { cwd: testDir });
    execSync('git commit -m "modify"', { cwd: testDir });

    // New cache instance (fresh CLI run)
    const newCache = new ScanCache(testDir);
    const scanner2 = new TestScanner({
      projectRoot: testDir,
      include: ["src/**/*.txt"],
      cache: newCache,
    });

    const result = await scanner2.scan();
    expect(result.items).toHaveLength(2);
    // Only the changed file should be re-scanned, other uses cache
    expect(scanner2.getParseCount()).toBe(1);
  });

  it("returns cache stats", async () => {
    const cache = new ScanCache(testDir);

    // First scan
    const scanner = new TestScanner({
      projectRoot: testDir,
      include: ["src/**/*.txt"],
      cache,
    });

    const result1 = await scanner.scan() as any;
    expect(result1.cacheStats).toEqual({ hits: 0, misses: 2 });

    await cache.save();

    // Second scan
    scanner.resetParseCount();
    const result2 = await scanner.scan() as any;
    expect(result2.cacheStats).toEqual({ hits: 2, misses: 0 });
  });
});
