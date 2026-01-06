// packages/scanners/src/cache/git-utils.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "path";
import { execSync } from "child_process";

// Unmock fs modules to use real filesystem for git operations
vi.unmock("fs/promises");
vi.unmock("fs");

// Must import after unmock
const { mkdtemp, rm, writeFile, mkdir } = await import("fs/promises");
const { tmpdir } = await import("os");

import {
  isGitRepo,
  getCurrentCommit,
  getChangedFilesSince,
  getUntrackedFiles,
  isFileTracked,
  getAllChangedFiles,
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

  describe("getAllChangedFiles", () => {
    it("returns isFullScan true when no commit provided", async () => {
      const result = await getAllChangedFiles(testDir, null);
      expect(result.isFullScan).toBe(true);
    });

    it("returns all changed files since commit", async () => {
      await writeFile(join(testDir, "file1.txt"), "content");
      execSync("git add .", { cwd: testDir });
      execSync('git commit -m "initial"', { cwd: testDir });
      const commit = await getCurrentCommit(testDir);

      // Add new committed file
      await writeFile(join(testDir, "file2.txt"), "new");
      execSync("git add .", { cwd: testDir });
      execSync('git commit -m "add file2"', { cwd: testDir });

      // Add untracked file
      await writeFile(join(testDir, "file3.txt"), "untracked");

      const result = await getAllChangedFiles(testDir, commit!);
      expect(result.isFullScan).toBe(false);
      expect(result.changed).toContain("file2.txt");
      expect(result.changed).toContain("file3.txt");
    });
  });
});
