// Built-in GitHub integration for Buoy CLI
import { Octokit } from '@octokit/rest';

const REQUEST_TIMEOUT_MS = 30000; // 30 seconds

// Hidden marker to identify Buoy comments for updates
export const COMMENT_MARKER = '<!-- buoy-drift-report -->';

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
}

export function parseRepoString(repoString: string): { owner: string; repo: string } {
  const parts = repoString.split('/');
  if (parts.length !== 2) {
    throw new Error(`Invalid repo format: "${repoString}". Expected "owner/repo".`);
  }
  return { owner: parts[0]!, repo: parts[1]! };
}
