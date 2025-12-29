// packages/plugin-github/src/__tests__/github.test.ts
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { COMMENT_MARKER } from '../formatter.js';

// Mock Octokit before importing the plugin
vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    issues: {
      listComments: vi.fn(),
      createComment: vi.fn(),
      updateComment: vi.fn(),
      deleteComment: vi.fn(),
    },
  })),
}));

// Import after mocking
import { Octokit } from '@octokit/rest';
import { GitHubClient, parseRepoString, type GitHubContext } from '../github.js';

describe('GitHubClient', () => {
  let mockOctokit: {
    issues: {
      listComments: Mock;
      createComment: Mock;
      updateComment: Mock;
      deleteComment: Mock;
    };
  };
  let client: GitHubClient;
  const testContext: GitHubContext = {
    token: 'test-token',
    owner: 'test-owner',
    repo: 'test-repo',
    prNumber: 123,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    client = new GitHubClient(testContext);
    // Get the mock instance that was created
    mockOctokit = (Octokit as Mock).mock.results[0]?.value;
  });

  describe('constructor', () => {
    it('creates an Octokit instance with the provided token', () => {
      expect(Octokit).toHaveBeenCalledWith({
        auth: 'test-token',
        request: {
          timeout: 30000,
        },
      });
    });
  });

  describe('findExistingComment', () => {
    it('returns null when no comments exist', async () => {
      mockOctokit.issues.listComments.mockResolvedValue({
        data: [],
      });

      const result = await client.findExistingComment();

      expect(result).toBeNull();
      expect(mockOctokit.issues.listComments).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
      });
    });

    it('returns null when no buoy comment exists', async () => {
      mockOctokit.issues.listComments.mockResolvedValue({
        data: [
          { id: 1, body: 'Regular comment' },
          { id: 2, body: 'Another comment' },
        ],
      });

      const result = await client.findExistingComment();

      expect(result).toBeNull();
    });

    it('returns comment id when buoy marker found', async () => {
      mockOctokit.issues.listComments.mockResolvedValue({
        data: [
          { id: 456, body: `${COMMENT_MARKER}\nOld report content` },
          { id: 789, body: 'Some other comment' },
        ],
      });

      const result = await client.findExistingComment();

      expect(result).toBe(456);
    });

    it('returns first matching comment when multiple buoy comments exist', async () => {
      mockOctokit.issues.listComments.mockResolvedValue({
        data: [
          { id: 100, body: 'Unrelated comment' },
          { id: 200, body: `${COMMENT_MARKER}\nFirst buoy comment` },
          { id: 300, body: `${COMMENT_MARKER}\nSecond buoy comment` },
        ],
      });

      const result = await client.findExistingComment();

      expect(result).toBe(200);
    });

    it('handles comments with null body', async () => {
      mockOctokit.issues.listComments.mockResolvedValue({
        data: [
          { id: 1, body: null },
          { id: 2, body: undefined },
          { id: 3, body: `${COMMENT_MARKER}\nValid comment` },
        ],
      });

      const result = await client.findExistingComment();

      expect(result).toBe(3);
    });
  });

  describe('createOrUpdateComment', () => {
    const testBody = `${COMMENT_MARKER}\n## Test Report`;

    it('creates new comment when none exists', async () => {
      mockOctokit.issues.listComments.mockResolvedValue({
        data: [],
      });
      mockOctokit.issues.createComment.mockResolvedValue({
        data: { id: 123, html_url: 'https://github.com/test-owner/test-repo/pull/123#issuecomment-123' },
      });

      await client.createOrUpdateComment(testBody);

      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        body: testBody,
      });
      expect(mockOctokit.issues.updateComment).not.toHaveBeenCalled();
    });

    it('updates existing comment when buoy marker found', async () => {
      mockOctokit.issues.listComments.mockResolvedValue({
        data: [
          { id: 456, body: `${COMMENT_MARKER}\nOld report content` },
          { id: 789, body: 'Some other comment' },
        ],
      });
      mockOctokit.issues.updateComment.mockResolvedValue({
        data: { id: 456 },
      });

      await client.createOrUpdateComment(testBody);

      expect(mockOctokit.issues.updateComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        comment_id: 456,
        body: testBody,
      });
      expect(mockOctokit.issues.createComment).not.toHaveBeenCalled();
    });

    it('handles API rate limit errors', async () => {
      mockOctokit.issues.listComments.mockRejectedValue(
        new Error('API rate limit exceeded')
      );

      await expect(client.createOrUpdateComment(testBody)).rejects.toThrow(
        'API rate limit exceeded'
      );
    });

    it('handles network errors gracefully', async () => {
      mockOctokit.issues.listComments.mockRejectedValue(
        new Error('Network error')
      );

      await expect(client.createOrUpdateComment(testBody)).rejects.toThrow(
        'Network error'
      );
    });

    it('handles createComment API errors', async () => {
      mockOctokit.issues.listComments.mockResolvedValue({ data: [] });
      mockOctokit.issues.createComment.mockRejectedValue(
        new Error('Resource not accessible by integration')
      );

      await expect(client.createOrUpdateComment(testBody)).rejects.toThrow(
        'Resource not accessible by integration'
      );
    });

    it('handles updateComment API errors', async () => {
      mockOctokit.issues.listComments.mockResolvedValue({
        data: [{ id: 456, body: `${COMMENT_MARKER}\nOld content` }],
      });
      mockOctokit.issues.updateComment.mockRejectedValue(
        new Error('Comment not found')
      );

      await expect(client.createOrUpdateComment(testBody)).rejects.toThrow(
        'Comment not found'
      );
    });
  });

  describe('deleteComment', () => {
    it('deletes existing buoy comment', async () => {
      mockOctokit.issues.listComments.mockResolvedValue({
        data: [{ id: 456, body: `${COMMENT_MARKER}\nReport content` }],
      });
      mockOctokit.issues.deleteComment.mockResolvedValue({});

      await client.deleteComment();

      expect(mockOctokit.issues.deleteComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        comment_id: 456,
      });
    });

    it('does nothing when no buoy comment exists', async () => {
      mockOctokit.issues.listComments.mockResolvedValue({
        data: [{ id: 789, body: 'Some other comment' }],
      });

      await client.deleteComment();

      expect(mockOctokit.issues.deleteComment).not.toHaveBeenCalled();
    });

    it('handles delete errors', async () => {
      mockOctokit.issues.listComments.mockResolvedValue({
        data: [{ id: 456, body: `${COMMENT_MARKER}\nReport` }],
      });
      mockOctokit.issues.deleteComment.mockRejectedValue(
        new Error('Cannot delete comment')
      );

      await expect(client.deleteComment()).rejects.toThrow(
        'Cannot delete comment'
      );
    });
  });
});

describe('parseRepoString', () => {
  it('parses valid owner/repo format', () => {
    const result = parseRepoString('test-owner/test-repo');

    expect(result).toEqual({
      owner: 'test-owner',
      repo: 'test-repo',
    });
  });

  it('handles repo names with hyphens', () => {
    const result = parseRepoString('my-org/my-cool-repo');

    expect(result).toEqual({
      owner: 'my-org',
      repo: 'my-cool-repo',
    });
  });

  it('handles repo names with underscores', () => {
    const result = parseRepoString('org_name/repo_name');

    expect(result).toEqual({
      owner: 'org_name',
      repo: 'repo_name',
    });
  });

  it('handles repo names with dots', () => {
    const result = parseRepoString('owner/repo.js');

    expect(result).toEqual({
      owner: 'owner',
      repo: 'repo.js',
    });
  });

  it('throws error for invalid format without slash', () => {
    expect(() => parseRepoString('invalid-format')).toThrow(
      'Invalid repo format: "invalid-format". Expected "owner/repo".'
    );
  });

  it('throws error for format with multiple slashes', () => {
    expect(() => parseRepoString('owner/repo/extra')).toThrow(
      'Invalid repo format: "owner/repo/extra". Expected "owner/repo".'
    );
  });

  it('throws error for empty string', () => {
    expect(() => parseRepoString('')).toThrow(
      'Invalid repo format: "". Expected "owner/repo".'
    );
  });

  it('parses slash into empty owner and repo', () => {
    // Edge case: "/" splits into ["", ""] which has length 2
    // So the function returns empty strings rather than throwing
    const result = parseRepoString('/');
    expect(result).toEqual({ owner: '', repo: '' });
  });
});

describe('GitHubClient integration scenarios', () => {
  let mockOctokit: {
    issues: {
      listComments: Mock;
      createComment: Mock;
      updateComment: Mock;
      deleteComment: Mock;
    };
  };
  let client: GitHubClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new GitHubClient({
      token: 'ghp_test123',
      owner: 'acme',
      repo: 'design-system',
      prNumber: 42,
    });
    mockOctokit = (Octokit as Mock).mock.results[0]?.value;
  });

  it('handles first report on a new PR', async () => {
    mockOctokit.issues.listComments.mockResolvedValue({ data: [] });
    mockOctokit.issues.createComment.mockResolvedValue({
      data: { id: 1001, html_url: 'https://github.com/acme/design-system/pull/42#issuecomment-1001' },
    });

    const reportBody = `${COMMENT_MARKER}\n## Drift Report\nAll good!`;
    await client.createOrUpdateComment(reportBody);

    expect(mockOctokit.issues.createComment).toHaveBeenCalledTimes(1);
    expect(mockOctokit.issues.updateComment).not.toHaveBeenCalled();
  });

  it('handles subsequent reports updating existing comment', async () => {
    const existingCommentId = 5001;
    mockOctokit.issues.listComments.mockResolvedValue({
      data: [
        { id: existingCommentId, body: `${COMMENT_MARKER}\n## Old Report` },
      ],
    });
    mockOctokit.issues.updateComment.mockResolvedValue({
      data: { id: existingCommentId },
    });

    const newReportBody = `${COMMENT_MARKER}\n## Updated Report\n3 issues found`;
    await client.createOrUpdateComment(newReportBody);

    expect(mockOctokit.issues.updateComment).toHaveBeenCalledTimes(1);
    expect(mockOctokit.issues.createComment).not.toHaveBeenCalled();
    expect(mockOctokit.issues.updateComment).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'design-system',
      comment_id: existingCommentId,
      body: newReportBody,
    });
  });

  it('preserves other comments when updating buoy comment', async () => {
    mockOctokit.issues.listComments.mockResolvedValue({
      data: [
        { id: 1, body: 'LGTM!' },
        { id: 2, body: `${COMMENT_MARKER}\n## Buoy Report` },
        { id: 3, body: 'Can you fix the linting?' },
      ],
    });
    mockOctokit.issues.updateComment.mockResolvedValue({ data: { id: 2 } });

    await client.createOrUpdateComment(`${COMMENT_MARKER}\n## New Report`);

    // Should only update comment id 2, not touch others
    expect(mockOctokit.issues.updateComment).toHaveBeenCalledWith(
      expect.objectContaining({ comment_id: 2 })
    );
    expect(mockOctokit.issues.deleteComment).not.toHaveBeenCalled();
  });

  it('handles PR with many comments efficiently', async () => {
    // Simulate a PR with many comments where buoy comment is near the end
    const manyComments = Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      body: i === 45 ? `${COMMENT_MARKER}\n## Report` : `Comment ${i}`,
    }));
    mockOctokit.issues.listComments.mockResolvedValue({ data: manyComments });
    mockOctokit.issues.updateComment.mockResolvedValue({ data: { id: 46 } });

    const existingId = await client.findExistingComment();

    expect(existingId).toBe(46); // 45 + 1 due to 0-indexing
  });
});
