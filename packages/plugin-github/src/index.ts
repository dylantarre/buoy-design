// packages/plugin-github/src/index.ts
import type { BuoyPlugin, DriftResult, ReportContext } from '@buoy/core';
import { formatPRComment } from './formatter.js';
import { GitHubClient, parseRepoString } from './github.js';

const plugin: BuoyPlugin = {
  metadata: {
    name: '@buoy/plugin-github',
    version: '0.0.1',
    description: 'GitHub PR comment integration for Buoy',
  },

  async report(results: DriftResult, context: ReportContext): Promise<void> {
    if (!context.github) {
      throw new Error('GitHub context is required. Provide token, repo, and pr number.');
    }

    const { token, repo, pr } = context.github;
    const { owner, repo: repoName } = parseRepoString(repo);

    const client = new GitHubClient({
      token,
      owner,
      repo: repoName,
      prNumber: pr,
    });

    // If no issues, optionally delete existing comment or post success
    if (results.summary.total === 0) {
      // Post a success comment
      const body = formatPRComment(results);
      await client.createOrUpdateComment(body);
      return;
    }

    // Post or update comment with drift results
    const body = formatPRComment(results);
    await client.createOrUpdateComment(body);
  },
};

export default () => plugin;
export { plugin };
export { formatPRComment } from './formatter.js';
export { GitHubClient, parseRepoString } from './github.js';
