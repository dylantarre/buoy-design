/**
 * Tests for GitHub Files API
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchGitHub,
  checkRateLimit,
  getChangedFiles,
  getFileContent,
  getFileAtRef,
  filterScannableFiles,
  RateLimitError,
  GitHubAPIError,
  type ChangedFile,
} from '../src/lib/github-files.js';

describe('RateLimitError', () => {
  it('creates error with reset date', () => {
    const resetAt = new Date('2025-01-04T15:30:00Z');
    const error = new RateLimitError(resetAt);

    expect(error.name).toBe('RateLimitError');
    expect(error.resetAt).toBe(resetAt);
    expect(error.message).toContain('2025-01-04T15:30:00.000Z');
  });
});

describe('GitHubAPIError', () => {
  it('creates error with status and body', () => {
    const error = new GitHubAPIError(404, 'Not found');

    expect(error.name).toBe('GitHubAPIError');
    expect(error.status).toBe(404);
    expect(error.body).toBe('Not found');
    expect(error.message).toContain('404');
    expect(error.message).toContain('Not found');
  });
});

describe('fetchGitHub', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('makes authenticated request with correct headers', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (key: string) => {
          if (key === 'X-RateLimit-Remaining') return '5000';
          if (key === 'X-RateLimit-Reset') return '1735992000';
          return null;
        },
      },
      json: async () => ({ test: 'data' }),
    });

    vi.stubGlobal('fetch', mockFetch);

    await fetchGitHub('https://api.github.com/test', 'token123');

    expect(mockFetch).toHaveBeenCalledWith('https://api.github.com/test', {
      headers: {
        Authorization: 'Bearer token123',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Buoy-Design-Drift',
      },
    });
  });

  it('parses rate limit headers', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (key: string) => {
          if (key === 'X-RateLimit-Remaining') return '42';
          if (key === 'X-RateLimit-Reset') return '1735992000';
          return null;
        },
      },
      json: async () => ({ test: 'data' }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const { rateLimit } = await fetchGitHub('https://api.github.com/test', 'token');

    expect(rateLimit.remaining).toBe(42);
    expect(rateLimit.resetAt.getTime()).toBe(1735992000 * 1000);
  });

  it('uses default rate limit values when headers missing', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: () => null,
      },
      json: async () => ({ test: 'data' }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const { rateLimit } = await fetchGitHub('https://api.github.com/test', 'token');

    expect(rateLimit.remaining).toBe(5000);
    expect(rateLimit.resetAt.getTime()).toBe(0);
  });

  it('throws RateLimitError when rate limited', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: {
        get: (key: string) => {
          if (key === 'X-RateLimit-Remaining') return '0';
          if (key === 'X-RateLimit-Reset') return '1735992000';
          return null;
        },
      },
      text: async () => 'Rate limit exceeded',
    });

    vi.stubGlobal('fetch', mockFetch);

    await expect(fetchGitHub('https://api.github.com/test', 'token')).rejects.toThrow(RateLimitError);
  });

  it('throws GitHubAPIError for other errors', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: {
        get: (key: string) => {
          if (key === 'X-RateLimit-Remaining') return '5000';
          if (key === 'X-RateLimit-Reset') return '1735992000';
          return null;
        },
      },
      text: async () => 'Not found',
    });

    vi.stubGlobal('fetch', mockFetch);

    await expect(fetchGitHub('https://api.github.com/test', 'token')).rejects.toThrow(GitHubAPIError);
    await expect(fetchGitHub('https://api.github.com/test', 'token')).rejects.toThrow('404');
  });

  it('returns parsed JSON data', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: () => null,
      },
      json: async () => ({ foo: 'bar', count: 42 }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const { data } = await fetchGitHub<{ foo: string; count: number }>('https://api.github.com/test', 'token');

    expect(data.foo).toBe('bar');
    expect(data.count).toBe(42);
  });
});

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches rate limit from API', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (key: string) => {
          if (key === 'X-RateLimit-Remaining') return '100';
          if (key === 'X-RateLimit-Reset') return '1735992000';
          return null;
        },
      },
      json: async () => ({
        resources: {
          core: {
            remaining: 100,
            reset: 1735992000,
          },
        },
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const rateLimit = await checkRateLimit('token');

    expect(rateLimit.remaining).toBe(100);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/rate_limit'),
      expect.any(Object)
    );
  });
});

describe('getChangedFiles', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches PR files from API', async () => {
    const mockFiles: ChangedFile[] = [
      {
        sha: 'abc123',
        filename: 'Button.tsx',
        status: 'modified',
        additions: 10,
        deletions: 5,
        changes: 15,
      },
      {
        sha: 'def456',
        filename: 'Card.tsx',
        status: 'added',
        additions: 50,
        deletions: 0,
        changes: 50,
      },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: () => null,
      },
      json: async () => mockFiles,
    });

    vi.stubGlobal('fetch', mockFetch);

    const { files } = await getChangedFiles('owner', 'repo', 123, 'token');

    expect(files).toHaveLength(2);
    expect(files[0]?.filename).toBe('Button.tsx');
    expect(files[1]?.filename).toBe('Card.tsx');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo/pulls/123/files?per_page=100',
      expect.any(Object)
    );
  });
});

describe('getFileContent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches and decodes file content', async () => {
    // "Hello, World!" in base64
    const base64Content = btoa('Hello, World!');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: () => null,
      },
      json: async () => ({
        content: base64Content,
        encoding: 'base64',
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const { content } = await getFileContent('owner', 'repo', 'sha123', 'token');

    expect(content).toBe('Hello, World!');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo/git/blobs/sha123',
      expect.any(Object)
    );
  });

  it('handles base64 content with newlines', async () => {
    // Base64 with newlines (GitHub returns this format)
    const base64WithNewlines = btoa('Test content').match(/.{1,10}/g)!.join('\n');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: () => null,
      },
      json: async () => ({
        content: base64WithNewlines,
        encoding: 'base64',
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const { content } = await getFileContent('owner', 'repo', 'sha123', 'token');

    expect(content).toBe('Test content');
  });
});

describe('getFileAtRef', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches file content at specific ref', async () => {
    const base64Content = btoa('File at ref');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: () => null,
      },
      json: async () => ({
        content: base64Content,
        encoding: 'base64',
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const result = await getFileAtRef('owner', 'repo', 'src/file.tsx', 'main', 'token');

    expect(result).not.toBeNull();
    expect(result?.content).toBe('File at ref');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo/contents/src/file.tsx?ref=main',
      expect.any(Object)
    );
  });

  it('returns null for 404 errors', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: {
        get: () => null,
      },
      text: async () => 'Not found',
    });

    vi.stubGlobal('fetch', mockFetch);

    const result = await getFileAtRef('owner', 'repo', 'missing.tsx', 'main', 'token');

    expect(result).toBeNull();
  });

  it('throws for other errors', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: {
        get: () => null,
      },
      text: async () => 'Server error',
    });

    vi.stubGlobal('fetch', mockFetch);

    await expect(getFileAtRef('owner', 'repo', 'file.tsx', 'main', 'token')).rejects.toThrow(GitHubAPIError);
  });
});

describe('filterScannableFiles', () => {
  it('filters by scannable extensions', () => {
    const files: ChangedFile[] = [
      { sha: '1', filename: 'Button.tsx', status: 'modified', additions: 10, deletions: 5, changes: 15 },
      { sha: '2', filename: 'Card.jsx', status: 'added', additions: 20, deletions: 0, changes: 20 },
      { sha: '3', filename: 'Modal.vue', status: 'modified', additions: 15, deletions: 10, changes: 25 },
      { sha: '4', filename: 'Component.svelte', status: 'added', additions: 30, deletions: 0, changes: 30 },
      { sha: '5', filename: 'Page.astro', status: 'modified', additions: 5, deletions: 2, changes: 7 },
      { sha: '6', filename: 'README.md', status: 'modified', additions: 1, deletions: 1, changes: 2 },
      { sha: '7', filename: 'package.json', status: 'modified', additions: 2, deletions: 1, changes: 3 },
    ];

    const scannable = filterScannableFiles(files);

    expect(scannable).toHaveLength(5);
    expect(scannable.map((f) => f.filename)).toEqual([
      'Button.tsx',
      'Card.jsx',
      'Modal.vue',
      'Component.svelte',
      'Page.astro',
    ]);
  });

  it('excludes removed files', () => {
    const files: ChangedFile[] = [
      { sha: '1', filename: 'Button.tsx', status: 'removed', additions: 0, deletions: 50, changes: 50 },
      { sha: '2', filename: 'Card.tsx', status: 'modified', additions: 10, deletions: 5, changes: 15 },
    ];

    const scannable = filterScannableFiles(files);

    expect(scannable).toHaveLength(1);
    expect(scannable[0]?.filename).toBe('Card.tsx');
  });

  it('excludes files larger than 100KB', () => {
    const files: ChangedFile[] = [
      { sha: '1', filename: 'Small.tsx', status: 'modified', additions: 10, deletions: 5, changes: 15, size: 50000 },
      { sha: '2', filename: 'Large.tsx', status: 'modified', additions: 10, deletions: 5, changes: 15, size: 150000 },
    ];

    const scannable = filterScannableFiles(files);

    expect(scannable).toHaveLength(1);
    expect(scannable[0]?.filename).toBe('Small.tsx');
  });

  it('includes files when size is not available', () => {
    const files: ChangedFile[] = [
      { sha: '1', filename: 'Button.tsx', status: 'modified', additions: 10, deletions: 5, changes: 15 },
    ];

    const scannable = filterScannableFiles(files);

    expect(scannable).toHaveLength(1);
  });

  it('handles case-insensitive extensions', () => {
    const files: ChangedFile[] = [
      { sha: '1', filename: 'Button.TSX', status: 'modified', additions: 10, deletions: 5, changes: 15 },
      { sha: '2', filename: 'Card.JSX', status: 'modified', additions: 10, deletions: 5, changes: 15 },
      { sha: '3', filename: 'Modal.VUE', status: 'modified', additions: 10, deletions: 5, changes: 15 },
    ];

    const scannable = filterScannableFiles(files);

    expect(scannable).toHaveLength(3);
  });

  it('handles files with multiple dots', () => {
    const files: ChangedFile[] = [
      { sha: '1', filename: 'Button.test.tsx', status: 'modified', additions: 10, deletions: 5, changes: 15 },
      { sha: '2', filename: 'utils.config.js', status: 'modified', additions: 5, deletions: 2, changes: 7 },
    ];

    const scannable = filterScannableFiles(files);

    expect(scannable).toHaveLength(1);
    expect(scannable[0]?.filename).toBe('Button.test.tsx');
  });

  it('returns empty array for empty input', () => {
    const scannable = filterScannableFiles([]);

    expect(scannable).toHaveLength(0);
  });
});
