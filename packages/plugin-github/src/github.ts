// packages/plugin-github/src/github.ts
import { Octokit } from '@octokit/rest';
import { COMMENT_MARKER } from './formatter.js';

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
    this.octokit = new Octokit({ auth: context.token });
  }

  async findExistingComment(): Promise<number | null> {
    const { owner, repo, prNumber } = this.context;

    const comments = await this.octokit.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
    });

    const existing = comments.data.find(
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
