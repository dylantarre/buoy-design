// Built-in GitHub integration for Buoy CLI
import { Octokit } from '@octokit/rest';

const REQUEST_TIMEOUT_MS = 30000; // 30 seconds

// Hidden marker to identify Buoy comments for updates
export const COMMENT_MARKER = '<!-- buoy-drift-report -->';

// Marker for inline drift comments (includes signal ID)
export const INLINE_MARKER_PREFIX = '<!-- buoy-drift:';
export const INLINE_MARKER_SUFFIX = ' -->';

// Reaction meanings for drift signals
export const REACTION_APPROVED = '+1'; // Drift acknowledged as intentional
export const REACTION_DISPUTED = '-1'; // Drift should be fixed
export const REACTION_CONFUSED = 'confused'; // Needs clarification

export interface CommentReaction {
  user: string;
  reaction: '+1' | '-1' | 'laugh' | 'hooray' | 'confused' | 'heart' | 'rocket' | 'eyes';
  createdAt: Date;
}

export interface ReviewComment {
  id: number;
  body: string;
  path: string;
  line: number | null;
  user: string;
  createdAt: Date;
  reactions: CommentReaction[];
  driftSignalId?: string; // Extracted from marker if present
}

export interface PRInfo {
  number: number;
  title: string;
  author: string;
  headSha: string;
  baseSha: string;
  headBranch: string;
  baseBranch: string;
  createdAt: Date;
  updatedAt: Date;
  filesChanged: PRFile[];
}

export interface PRFile {
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  patch?: string;
}

export interface GitHubContext {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
}

export class GitHubClient {
  private octokit: Octokit;
  private context: GitHubContext;

  constructor(context: GitHubContext) {
    this.context = context;
    this.octokit = new Octokit({
      auth: context.token,
      request: {
        timeout: REQUEST_TIMEOUT_MS,
      },
    });
  }

  async findExistingComment(): Promise<number | null> {
    const { owner, repo, prNumber } = this.context;

    // Use pagination to handle PRs with 30+ comments
    const comments = await this.octokit.paginate(
      this.octokit.issues.listComments,
      {
        owner,
        repo,
        issue_number: prNumber,
        per_page: 100,
      }
    );

    const existing = comments.find(
      (comment) => comment.body?.includes(COMMENT_MARKER)
    );

    return existing?.id ?? null;
  }

  async createOrUpdateComment(body: string): Promise<void> {
    const { owner, repo, prNumber } = this.context;
    const existingId = await this.findExistingComment();

    if (existingId) {
      await this.octokit.issues.updateComment({
        owner,
        repo,
        comment_id: existingId,
        body,
      });
    } else {
      await this.octokit.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body,
      });
    }
  }

  async deleteComment(): Promise<void> {
    const { owner, repo } = this.context;
    const existingId = await this.findExistingComment();

    if (existingId) {
      await this.octokit.issues.deleteComment({
        owner,
        repo,
        comment_id: existingId,
      });
    }
  }

  /**
   * Get PR information including files changed
   */
  async getPRInfo(): Promise<PRInfo> {
    const { owner, repo, prNumber } = this.context;

    const [prData, filesData] = await Promise.all([
      this.octokit.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      }),
      this.octokit.paginate(this.octokit.pulls.listFiles, {
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100,
      }),
    ]);

    return {
      number: prData.data.number,
      title: prData.data.title,
      author: prData.data.user?.login ?? 'unknown',
      headSha: prData.data.head.sha,
      baseSha: prData.data.base.sha,
      headBranch: prData.data.head.ref,
      baseBranch: prData.data.base.ref,
      createdAt: new Date(prData.data.created_at),
      updatedAt: new Date(prData.data.updated_at),
      filesChanged: filesData.map((f) => ({
        filename: f.filename,
        status: f.status as PRFile['status'],
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
      })),
    };
  }

  /**
   * Get all review comments on the PR with their reactions
   */
  async getReviewComments(): Promise<ReviewComment[]> {
    const { owner, repo, prNumber } = this.context;

    const comments = await this.octokit.paginate(
      this.octokit.pulls.listReviewComments,
      {
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100,
      }
    );

    const result: ReviewComment[] = [];

    for (const comment of comments) {
      // Get reactions for this comment
      const reactions = await this.getCommentReactions(comment.id);

      // Extract drift signal ID from marker if present
      let driftSignalId: string | undefined;
      if (comment.body?.includes(INLINE_MARKER_PREFIX)) {
        const start = comment.body.indexOf(INLINE_MARKER_PREFIX) + INLINE_MARKER_PREFIX.length;
        const end = comment.body.indexOf(INLINE_MARKER_SUFFIX, start);
        if (end > start) {
          driftSignalId = comment.body.slice(start, end);
        }
      }

      result.push({
        id: comment.id,
        body: comment.body ?? '',
        path: comment.path,
        line: comment.line ?? comment.original_line ?? null,
        user: comment.user?.login ?? 'unknown',
        createdAt: new Date(comment.created_at),
        reactions,
        driftSignalId,
      });
    }

    return result;
  }

  /**
   * Get reactions for a specific comment
   */
  async getCommentReactions(commentId: number): Promise<CommentReaction[]> {
    const { owner, repo } = this.context;

    try {
      const reactions = await this.octokit.paginate(
        this.octokit.reactions.listForPullRequestReviewComment,
        {
          owner,
          repo,
          comment_id: commentId,
          per_page: 100,
        }
      );

      return reactions.map((r) => ({
        user: r.user?.login ?? 'unknown',
        reaction: r.content as CommentReaction['reaction'],
        createdAt: new Date(r.created_at),
      }));
    } catch {
      // Reactions API may fail for various reasons, return empty
      return [];
    }
  }

  /**
   * Get feedback summary from reactions on Buoy comments
   */
  async getFeedbackSummary(): Promise<{
    approved: string[]; // Users who +1'd
    disputed: string[]; // Users who -1'd
    confused: string[]; // Users who reacted with confused
  }> {
    const { owner, repo } = this.context;
    const existingId = await this.findExistingComment();

    if (!existingId) {
      return { approved: [], disputed: [], confused: [] };
    }

    try {
      const reactions = await this.octokit.paginate(
        this.octokit.reactions.listForIssueComment,
        {
          owner,
          repo,
          comment_id: existingId,
          per_page: 100,
        }
      );

      const approved: string[] = [];
      const disputed: string[] = [];
      const confused: string[] = [];

      for (const r of reactions) {
        const user = r.user?.login ?? 'unknown';
        if (r.content === '+1') approved.push(user);
        else if (r.content === '-1') disputed.push(user);
        else if (r.content === 'confused') confused.push(user);
      }

      return { approved, disputed, confused };
    } catch {
      return { approved: [], disputed: [], confused: [] };
    }
  }

  /**
   * Create an inline review comment on a specific file and line
   */
  async createInlineComment(
    path: string,
    line: number,
    body: string,
    driftSignalId?: string
  ): Promise<number> {
    const { owner, repo, prNumber } = this.context;

    // Get the latest commit SHA for the PR
    const pr = await this.octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    const commitId = pr.data.head.sha;

    // Add marker if signal ID provided
    const markedBody = driftSignalId
      ? `${INLINE_MARKER_PREFIX}${driftSignalId}${INLINE_MARKER_SUFFIX}\n${body}`
      : body;

    const comment = await this.octokit.pulls.createReviewComment({
      owner,
      repo,
      pull_number: prNumber,
      body: markedBody,
      commit_id: commitId,
      path,
      line,
      side: 'RIGHT',
    });

    return comment.data.id;
  }

  /**
   * Find all inline comments created by Buoy
   */
  async findBuoyInlineComments(): Promise<ReviewComment[]> {
    const comments = await this.getReviewComments();
    return comments.filter((c) => c.driftSignalId !== undefined);
  }

  /**
   * Get drift signals that have been acknowledged (approved via reaction)
   */
  async getAcknowledgedDriftSignals(): Promise<string[]> {
    const comments = await this.findBuoyInlineComments();
    const acknowledged: string[] = [];

    for (const comment of comments) {
      if (!comment.driftSignalId) continue;

      // Check if any reaction indicates approval
      const hasApproval = comment.reactions.some(
        (r) => r.reaction === '+1' || r.reaction === 'heart'
      );

      if (hasApproval) {
        acknowledged.push(comment.driftSignalId);
      }
    }

    return acknowledged;
  }

  /**
   * Delete all inline Buoy comments (for cleanup/reset)
   */
  async deleteInlineComments(): Promise<number> {
    const { owner, repo } = this.context;
    const comments = await this.findBuoyInlineComments();
    let deleted = 0;

    for (const comment of comments) {
      try {
        await this.octokit.pulls.deleteReviewComment({
          owner,
          repo,
          comment_id: comment.id,
        });
        deleted++;
      } catch {
        // Comment may already be deleted
      }
    }

    return deleted;
  }
}

export function parseRepoString(repoString: string): { owner: string; repo: string } {
  const parts = repoString.split('/');
  if (parts.length !== 2) {
    throw new Error(`Invalid repo format: "${repoString}". Expected "owner/repo".`);
  }
  return { owner: parts[0]!, repo: parts[1]! };
}
