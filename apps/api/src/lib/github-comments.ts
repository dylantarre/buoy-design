/**
 * GitHub PR Comments API
 *
 * Post and edit PR comments via GitHub API
 */

import { fetchGitHub, type RateLimitState } from './github-files.js';
import { BUOY_COMMENT_MARKER, isBuoyComment } from './pr-comment.js';

const GITHUB_API_BASE = 'https://api.github.com';

export interface GitHubComment {
  id: number;
  body: string;
  user: {
    login: string;
    type: string;
  };
  created_at: string;
  updated_at: string;
}

/**
 * Find existing Buoy comment on a PR
 */
export async function findBuoyComment(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<{ comment: GitHubComment | null; rateLimit: RateLimitState }> {
  const { data: comments, rateLimit } = await fetchGitHub<GitHubComment[]>(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`,
    token
  );

  // Find the most recent Buoy comment
  const buoyComment = comments
    .filter((c) => isBuoyComment(c.body))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];

  return { comment: buoyComment || null, rateLimit };
}

/**
 * Post a new comment on a PR
 */
export async function postComment(
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
  token: string
): Promise<{ commentId: number; rateLimit: RateLimitState }> {
  const res = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'Buoy-Design-Drift',
    },
    body: JSON.stringify({ body }),
  });

  const rateLimit: RateLimitState = {
    remaining: parseInt(res.headers.get('X-RateLimit-Remaining') || '5000'),
    resetAt: new Date(parseInt(res.headers.get('X-RateLimit-Reset') || '0') * 1000),
  };

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to post comment: ${res.status} ${error}`);
  }

  const data = (await res.json()) as { id: number };
  return { commentId: data.id, rateLimit };
}

/**
 * Update an existing comment
 */
export async function updateComment(
  owner: string,
  repo: string,
  commentId: number,
  body: string,
  token: string
): Promise<{ rateLimit: RateLimitState }> {
  const res = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/issues/comments/${commentId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'Buoy-Design-Drift',
    },
    body: JSON.stringify({ body }),
  });

  const rateLimit: RateLimitState = {
    remaining: parseInt(res.headers.get('X-RateLimit-Remaining') || '5000'),
    resetAt: new Date(parseInt(res.headers.get('X-RateLimit-Reset') || '0') * 1000),
  };

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to update comment: ${res.status} ${error}`);
  }

  return { rateLimit };
}

/**
 * Post or update Buoy comment on a PR
 * Returns the comment ID (new or existing)
 */
export async function postOrUpdateComment(
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
  token: string,
  existingCommentId?: number
): Promise<{ commentId: number; rateLimit: RateLimitState }> {
  // If we have an existing comment ID, update it
  if (existingCommentId) {
    const { rateLimit } = await updateComment(owner, repo, existingCommentId, body, token);
    return { commentId: existingCommentId, rateLimit };
  }

  // Otherwise, search for existing Buoy comment
  const { comment: existingComment, rateLimit: searchRateLimit } = await findBuoyComment(
    owner,
    repo,
    prNumber,
    token
  );

  if (existingComment) {
    const { rateLimit } = await updateComment(owner, repo, existingComment.id, body, token);
    return { commentId: existingComment.id, rateLimit };
  }

  // No existing comment, create new one
  return postComment(owner, repo, prNumber, body, token);
}
