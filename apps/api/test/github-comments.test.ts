/**
 * Tests for GitHub PR Comments API
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  findBuoyComment,
  postComment,
  updateComment,
  postOrUpdateComment,
  type GitHubComment,
} from '../src/lib/github-comments.js';
import { BUOY_COMMENT_MARKER } from '../src/lib/pr-comment.js';

describe('findBuoyComment', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('finds existing Buoy comment with marker', async () => {
    const mockComments: GitHubComment[] = [
      {
        id: 1,
        body: 'Regular comment',
        user: { login: 'user1', type: 'User' },
        created_at: '2025-01-01T10:00:00Z',
        updated_at: '2025-01-01T10:00:00Z',
      },
      {
        id: 2,
        body: `${BUOY_COMMENT_MARKER}\n## Buoy Report`,
        user: { login: 'buoy-bot', type: 'Bot' },
        created_at: '2025-01-01T11:00:00Z',
        updated_at: '2025-01-01T11:00:00Z',
      },
      {
        id: 3,
        body: 'Another comment',
        user: { login: 'user2', type: 'User' },
        created_at: '2025-01-01T12:00:00Z',
        updated_at: '2025-01-01T12:00:00Z',
      },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: () => null,
      },
      json: async () => mockComments,
    });

    vi.stubGlobal('fetch', mockFetch);

    const { comment } = await findBuoyComment('owner', 'repo', 123, 'token');

    expect(comment).not.toBeNull();
    expect(comment?.id).toBe(2);
    expect(comment?.body).toContain(BUOY_COMMENT_MARKER);
  });

  it('finds Buoy comment with heading fallback', async () => {
    const mockComments: GitHubComment[] = [
      {
        id: 1,
        body: 'Regular comment',
        user: { login: 'user1', type: 'User' },
        created_at: '2025-01-01T10:00:00Z',
        updated_at: '2025-01-01T10:00:00Z',
      },
      {
        id: 2,
        body: '## :ring_buoy: Buoy Design Drift Report\n\nNo new drift',
        user: { login: 'buoy-bot', type: 'Bot' },
        created_at: '2025-01-01T11:00:00Z',
        updated_at: '2025-01-01T11:00:00Z',
      },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: () => null,
      },
      json: async () => mockComments,
    });

    vi.stubGlobal('fetch', mockFetch);

    const { comment } = await findBuoyComment('owner', 'repo', 123, 'token');

    expect(comment).not.toBeNull();
    expect(comment?.id).toBe(2);
  });

  it('returns null when no Buoy comment exists', async () => {
    const mockComments: GitHubComment[] = [
      {
        id: 1,
        body: 'Regular comment',
        user: { login: 'user1', type: 'User' },
        created_at: '2025-01-01T10:00:00Z',
        updated_at: '2025-01-01T10:00:00Z',
      },
      {
        id: 2,
        body: 'Another comment',
        user: { login: 'user2', type: 'User' },
        created_at: '2025-01-01T11:00:00Z',
        updated_at: '2025-01-01T11:00:00Z',
      },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: () => null,
      },
      json: async () => mockComments,
    });

    vi.stubGlobal('fetch', mockFetch);

    const { comment } = await findBuoyComment('owner', 'repo', 123, 'token');

    expect(comment).toBeNull();
  });

  it('returns most recently updated Buoy comment', async () => {
    const mockComments: GitHubComment[] = [
      {
        id: 1,
        body: `${BUOY_COMMENT_MARKER}\nOlder`,
        user: { login: 'buoy-bot', type: 'Bot' },
        created_at: '2025-01-01T10:00:00Z',
        updated_at: '2025-01-01T10:00:00Z',
      },
      {
        id: 2,
        body: `${BUOY_COMMENT_MARKER}\nNewer`,
        user: { login: 'buoy-bot', type: 'Bot' },
        created_at: '2025-01-01T11:00:00Z',
        updated_at: '2025-01-01T12:00:00Z', // Most recent update
      },
      {
        id: 3,
        body: `${BUOY_COMMENT_MARKER}\nOld`,
        user: { login: 'buoy-bot', type: 'Bot' },
        created_at: '2025-01-01T09:00:00Z',
        updated_at: '2025-01-01T09:00:00Z',
      },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: () => null,
      },
      json: async () => mockComments,
    });

    vi.stubGlobal('fetch', mockFetch);

    const { comment } = await findBuoyComment('owner', 'repo', 123, 'token');

    expect(comment).not.toBeNull();
    expect(comment?.id).toBe(2);
  });

  it('handles empty comment list', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: () => null,
      },
      json: async () => [],
    });

    vi.stubGlobal('fetch', mockFetch);

    const { comment } = await findBuoyComment('owner', 'repo', 123, 'token');

    expect(comment).toBeNull();
  });

  it('includes rate limit information', async () => {
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
      json: async () => [],
    });

    vi.stubGlobal('fetch', mockFetch);

    const { rateLimit } = await findBuoyComment('owner', 'repo', 123, 'token');

    expect(rateLimit.remaining).toBe(42);
    expect(rateLimit.resetAt.getTime()).toBe(1735992000 * 1000);
  });
});

describe('postComment', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('posts new comment with correct request', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: {
        get: () => null,
      },
      json: async () => ({ id: 123 }),
    });

    vi.stubGlobal('fetch', mockFetch);

    await postComment('owner', 'repo', 456, 'Comment body', 'token');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo/issues/456/comments',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token',
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
          'User-Agent': 'Buoy-Design-Drift',
        },
        body: JSON.stringify({ body: 'Comment body' }),
      }
    );
  });

  it('returns comment ID', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: {
        get: () => null,
      },
      json: async () => ({ id: 789 }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const { commentId } = await postComment('owner', 'repo', 123, 'Body', 'token');

    expect(commentId).toBe(789);
  });

  it('includes rate limit information', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: {
        get: (key: string) => {
          if (key === 'X-RateLimit-Remaining') return '100';
          if (key === 'X-RateLimit-Reset') return '1735992000';
          return null;
        },
      },
      json: async () => ({ id: 123 }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const { rateLimit } = await postComment('owner', 'repo', 123, 'Body', 'token');

    expect(rateLimit.remaining).toBe(100);
    expect(rateLimit.resetAt.getTime()).toBe(1735992000 * 1000);
  });

  it('throws error on failure', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: {
        get: () => null,
      },
      text: async () => 'Forbidden',
    });

    vi.stubGlobal('fetch', mockFetch);

    await expect(postComment('owner', 'repo', 123, 'Body', 'token')).rejects.toThrow('Failed to post comment');
    await expect(postComment('owner', 'repo', 123, 'Body', 'token')).rejects.toThrow('403');
  });
});

describe('updateComment', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('updates comment with correct request', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: () => null,
      },
      json: async () => ({ id: 123 }),
    });

    vi.stubGlobal('fetch', mockFetch);

    await updateComment('owner', 'repo', 456, 'Updated body', 'token');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo/issues/comments/456',
      {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer token',
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
          'User-Agent': 'Buoy-Design-Drift',
        },
        body: JSON.stringify({ body: 'Updated body' }),
      }
    );
  });

  it('includes rate limit information', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (key: string) => {
          if (key === 'X-RateLimit-Remaining') return '50';
          if (key === 'X-RateLimit-Reset') return '1735992000';
          return null;
        },
      },
      json: async () => ({ id: 123 }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const { rateLimit } = await updateComment('owner', 'repo', 123, 'Body', 'token');

    expect(rateLimit.remaining).toBe(50);
    expect(rateLimit.resetAt.getTime()).toBe(1735992000 * 1000);
  });

  it('throws error on failure', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: {
        get: () => null,
      },
      text: async () => 'Not found',
    });

    vi.stubGlobal('fetch', mockFetch);

    await expect(updateComment('owner', 'repo', 999, 'Body', 'token')).rejects.toThrow('Failed to update comment');
    await expect(updateComment('owner', 'repo', 999, 'Body', 'token')).rejects.toThrow('404');
  });
});

describe('postOrUpdateComment', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('updates existing comment when existingCommentId provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: () => null,
      },
      json: async () => ({ id: 456 }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const { commentId } = await postOrUpdateComment('owner', 'repo', 123, 'Body', 'token', 456);

    expect(commentId).toBe(456);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/issues/comments/456'),
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('finds and updates existing Buoy comment when no ID provided', async () => {
    const mockFetch = vi.fn();

    // First call: find comments
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => [
        {
          id: 789,
          body: `${BUOY_COMMENT_MARKER}\nExisting`,
          user: { login: 'buoy-bot', type: 'Bot' },
          created_at: '2025-01-01T10:00:00Z',
          updated_at: '2025-01-01T10:00:00Z',
        },
      ],
    });

    // Second call: update comment
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ id: 789 }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const { commentId } = await postOrUpdateComment('owner', 'repo', 123, 'New body', 'token');

    expect(commentId).toBe(789);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // First call should be GET comments
    expect(mockFetch.mock.calls[0]?.[0]).toContain('/issues/123/comments');
    // Second call should be PATCH comment
    expect(mockFetch.mock.calls[1]?.[0]).toContain('/issues/comments/789');
    expect(mockFetch.mock.calls[1]?.[1]).toMatchObject({ method: 'PATCH' });
  });

  it('creates new comment when none exists', async () => {
    const mockFetch = vi.fn();

    // First call: find comments (empty)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => [],
    });

    // Second call: create comment
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: { get: () => null },
      json: async () => ({ id: 999 }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const { commentId } = await postOrUpdateComment('owner', 'repo', 123, 'New body', 'token');

    expect(commentId).toBe(999);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // First call should be GET comments
    expect(mockFetch.mock.calls[0]?.[0]).toContain('/issues/123/comments');
    // Second call should be POST comment
    expect(mockFetch.mock.calls[1]?.[0]).toContain('/issues/123/comments');
    expect(mockFetch.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' });
  });

  it('returns rate limit from final operation', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (key: string) => {
          if (key === 'X-RateLimit-Remaining') return '25';
          if (key === 'X-RateLimit-Reset') return '1735992000';
          return null;
        },
      },
      json: async () => ({ id: 123 }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const { rateLimit } = await postOrUpdateComment('owner', 'repo', 123, 'Body', 'token', 456);

    expect(rateLimit.remaining).toBe(25);
    expect(rateLimit.resetAt.getTime()).toBe(1735992000 * 1000);
  });
});
