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
