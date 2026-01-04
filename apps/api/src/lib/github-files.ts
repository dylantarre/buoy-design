/**
 * GitHub Files API
 *
 * Fetch PR files and content from GitHub API
 */

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Rate limit state from GitHub API response headers
 */
export interface RateLimitState {
  remaining: number;
  resetAt: Date;
}

/**
 * Custom error for rate limiting
 */
export class RateLimitError extends Error {
  resetAt: Date;

  constructor(resetAt: Date) {
    super(`Rate limited until ${resetAt.toISOString()}`);
    this.name = 'RateLimitError';
    this.resetAt = resetAt;
  }
}

/**
 * Custom error for GitHub API errors
 */
export class GitHubAPIError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`GitHub API error ${status}: ${body}`);
    this.name = 'GitHubAPIError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Changed file from PR
 */
export interface ChangedFile {
  sha: string;
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  size?: number;
}

/**
 * Make authenticated GitHub API request with rate limit tracking
 */
export async function fetchGitHub<T>(
  url: string,
  token: string
): Promise<{ data: T; rateLimit: RateLimitState }> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Buoy-Design-Drift',
    },
  });

  const rateLimit: RateLimitState = {
    remaining: parseInt(res.headers.get('X-RateLimit-Remaining') || '5000'),
    resetAt: new Date(parseInt(res.headers.get('X-RateLimit-Reset') || '0') * 1000),
  };

  if (res.status === 403 && rateLimit.remaining === 0) {
    throw new RateLimitError(rateLimit.resetAt);
  }

  if (!res.ok) {
    throw new GitHubAPIError(res.status, await res.text());
  }

  return { data: (await res.json()) as T, rateLimit };
}

/**
 * Check current rate limit status
 */
export async function checkRateLimit(token: string): Promise<RateLimitState> {
  const { rateLimit } = await fetchGitHub<{ resources: { core: { remaining: number; reset: number } } }>(
    `${GITHUB_API_BASE}/rate_limit`,
    token
  );
  return rateLimit;
}

/**
 * Get list of changed files in a PR
 */
export async function getChangedFiles(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<{ files: ChangedFile[]; rateLimit: RateLimitState }> {
  const { data, rateLimit } = await fetchGitHub<ChangedFile[]>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`,
    token
  );

  return { files: data, rateLimit };
}

/**
 * Get raw file content by blob SHA
 */
export async function getFileContent(
  owner: string,
  repo: string,
  sha: string,
  token: string
): Promise<{ content: string; rateLimit: RateLimitState }> {
  const { data, rateLimit } = await fetchGitHub<{ content: string; encoding: string }>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/blobs/${sha}`,
    token
  );

  // GitHub returns base64-encoded content
  const content = atob(data.content.replace(/\n/g, ''));

  return { content, rateLimit };
}

/**
 * Get file content from a specific ref (branch/commit)
 */
export async function getFileAtRef(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  token: string
): Promise<{ content: string; rateLimit: RateLimitState } | null> {
  try {
    const { data, rateLimit } = await fetchGitHub<{ content: string; encoding: string }>(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}?ref=${ref}`,
      token
    );

    const content = atob(data.content.replace(/\n/g, ''));
    return { content, rateLimit };
  } catch (err) {
    if (err instanceof GitHubAPIError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * Filter files to only scannable ones
 */
export function filterScannableFiles(files: ChangedFile[]): ChangedFile[] {
  const scannableExtensions = ['tsx', 'jsx', 'vue', 'svelte', 'astro'];
  const maxFileSize = 100_000; // 100KB

  return files.filter((file) => {
    // Skip removed files
    if (file.status === 'removed') return false;

    // Check extension
    const ext = file.filename.split('.').pop()?.toLowerCase();
    if (!ext || !scannableExtensions.includes(ext)) return false;

    // Check size (if available)
    if (file.size && file.size > maxFileSize) return false;

    return true;
  });
}
