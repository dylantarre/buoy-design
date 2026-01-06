# Phase 3: GitHub Plugin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create `@buoy/plugin-github` that posts PR comments with drift detection results.

**Architecture:** The plugin implements the `report()` method from the BuoyPlugin interface. It uses the GitHub REST API via `@octokit/rest` to create/update PR comments. Comments are identified by a hidden marker to enable updates on subsequent commits.

**Tech Stack:** TypeScript, @octokit/rest, @buoy/core types

---

## Task 1: Create Package Scaffold

**Files:**
- Create: `packages/plugin-github/package.json`
- Create: `packages/plugin-github/tsconfig.json`
- Create: `packages/plugin-github/src/index.ts`

**Step 1: Create package.json**

```json
{
  "name": "@buoy/plugin-github",
  "version": "0.0.1",
  "description": "Buoy plugin for GitHub PR comments",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "keywords": ["buoy", "plugin", "github", "pr", "comments"],
  "license": "MIT",
  "peerDependencies": {
    "@buoy/core": "workspace:*"
  },
  "dependencies": {
    "@octokit/rest": "^20.0.0"
  },
  "devDependencies": {
    "@buoy/core": "workspace:*",
    "typescript": "^5.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create minimal index.ts**

```typescript
// packages/plugin-github/src/index.ts
import type { BuoyPlugin, DriftResult, ReportContext } from '@buoy/core';

const plugin: BuoyPlugin = {
  metadata: {
    name: '@buoy/plugin-github',
    version: '0.0.1',
    description: 'GitHub PR comment integration for Buoy',
  },

  async report(results: DriftResult, context: ReportContext): Promise<void> {
    // Implementation in next task
    console.log('GitHub plugin placeholder');
  },
};

export default () => plugin;
export { plugin };
```

**Step 4: Install dependencies and build**

```bash
cd /Users/dylantarre/dev/bouy
pnpm install
pnpm --filter @buoy/plugin-github build
```

**Step 5: Commit**

```bash
git add packages/plugin-github/
git commit -m "feat(plugin-github): create package scaffold"
```

---

## Task 2: Implement Markdown Formatter

**Files:**
- Create: `packages/plugin-github/src/formatter.ts`

**Step 1: Create formatter.ts**

```typescript
// packages/plugin-github/src/formatter.ts
import type { DriftResult } from '@buoy/core';

// Hidden marker to identify Buoy comments for updates
export const COMMENT_MARKER = '<!-- buoy-drift-report -->';

export function formatPRComment(results: DriftResult): string {
  const lines: string[] = [COMMENT_MARKER];

  // Header
  const icon = results.summary.critical > 0 ? '🔴' :
               results.summary.warning > 0 ? '🟡' : '🟢';
  lines.push(`## ${icon} Buoy Drift Report`);
  lines.push('');

  // Summary
  const { total, critical, warning, info } = results.summary;
  if (total === 0) {
    lines.push('No design drift detected. Your code is aligned with the design system!');
    lines.push('');
    lines.push('---');
    lines.push('<sub>🔱 <a href="https://github.com/buoy-design/buoy">Buoy</a></sub>');
    return lines.join('\n');
  }

  lines.push(`**${total} issue${total === 1 ? '' : 's'} found** (${critical} critical, ${warning} warning${warning === 1 ? '' : 's'}, ${info} info)`);
  lines.push('');

  // Group by severity
  const criticals = results.signals.filter(s => s.severity === 'critical');
  const warnings = results.signals.filter(s => s.severity === 'warning');
  const infos = results.signals.filter(s => s.severity === 'info');

  // Critical issues table
  if (criticals.length > 0) {
    lines.push('### Critical');
    lines.push('');
    lines.push('| Component | Issue | File |');
    lines.push('|-----------|-------|------|');
    for (const signal of criticals) {
      const file = signal.file ? `\`${signal.file}${signal.line ? `:${signal.line}` : ''}\`` : '-';
      lines.push(`| \`${signal.component || '-'}\` | ${signal.message} | ${file} |`);
    }
    lines.push('');
  }

  // Warning issues table
  if (warnings.length > 0) {
    lines.push('### Warnings');
    lines.push('');
    lines.push('| Component | Issue | File |');
    lines.push('|-----------|-------|------|');
    for (const signal of warnings.slice(0, 10)) {
      const file = signal.file ? `\`${signal.file}${signal.line ? `:${signal.line}` : ''}\`` : '-';
      lines.push(`| \`${signal.component || '-'}\` | ${signal.message} | ${file} |`);
    }
    if (warnings.length > 10) {
      lines.push(`| ... | *${warnings.length - 10} more warnings* | |`);
    }
    lines.push('');
  }

  // Info issues collapsed
  if (infos.length > 0) {
    lines.push('<details>');
    lines.push(`<summary>${infos.length} info-level issue${infos.length === 1 ? '' : 's'}</summary>`);
    lines.push('');
    for (const signal of infos) {
      const loc = signal.file ? ` (${signal.file}${signal.line ? `:${signal.line}` : ''})` : '';
      lines.push(`- \`${signal.component || 'Unknown'}\`: ${signal.message}${loc}`);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push('<sub>🔱 <a href="https://github.com/buoy-design/buoy">Buoy</a></sub>');

  return lines.join('\n');
}
```

**Step 2: Build and verify**

```bash
pnpm --filter @buoy/plugin-github build
```

**Step 3: Commit**

```bash
git add packages/plugin-github/src/formatter.ts
git commit -m "feat(plugin-github): add PR comment formatter"
```

---

## Task 3: Implement GitHub API Client

**Files:**
- Create: `packages/plugin-github/src/github.ts`

**Step 1: Create github.ts**

```typescript
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
```

**Step 2: Build**

```bash
pnpm --filter @buoy/plugin-github build
```

**Step 3: Commit**

```bash
git add packages/plugin-github/src/github.ts
git commit -m "feat(plugin-github): add GitHub API client"
```

---

## Task 4: Wire Up Plugin Report Method

**Files:**
- Modify: `packages/plugin-github/src/index.ts`

**Step 1: Update index.ts with full implementation**

```typescript
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
```

**Step 2: Build and verify exports**

```bash
pnpm --filter @buoy/plugin-github build
```

**Step 3: Commit**

```bash
git add packages/plugin-github/src/index.ts
git commit -m "feat(plugin-github): wire up report method"
```

---

## Task 5: Update CI Command to Use GitHub Plugin

**Files:**
- Modify: `apps/cli/src/commands/ci.ts`

**Step 1: Add GitHub reporting option to CI command**

Add new options to the CI command:

```typescript
.option('--github-token <token>', 'GitHub token for PR comments (or use GITHUB_TOKEN env)')
.option('--github-repo <repo>', 'GitHub repo in owner/repo format (or use GITHUB_REPOSITORY env)')
.option('--github-pr <number>', 'PR number to comment on (or use GITHUB_PR_NUMBER env)')
```

**Step 2: Add GitHub reporting logic after drift analysis**

After the line `const output = buildCIOutput(drifts, options);`, add:

```typescript
// Post to GitHub if configured
const githubToken = options.githubToken || process.env.GITHUB_TOKEN;
const githubRepo = options.githubRepo || process.env.GITHUB_REPOSITORY;
const githubPr = options.githubPr || process.env.GITHUB_PR_NUMBER;

if (githubToken && githubRepo && githubPr) {
  try {
    const githubPlugin = registry.get('@buoy/plugin-github');
    if (githubPlugin && githubPlugin.report) {
      log('Posting to GitHub PR...');

      const driftResult = {
        signals: drifts.map(d => ({
          type: d.type,
          severity: d.severity,
          message: d.message,
          component: d.source.entityName,
          file: d.source.location?.split(':')[0],
          line: d.source.location?.includes(':')
            ? parseInt(d.source.location.split(':')[1], 10)
            : undefined,
          suggestion: d.details.suggestions?.[0],
        })),
        summary: {
          total: drifts.length,
          critical: drifts.filter(d => d.severity === 'critical').length,
          warning: drifts.filter(d => d.severity === 'warning').length,
          info: drifts.filter(d => d.severity === 'info').length,
        },
      };

      await githubPlugin.report(driftResult, {
        ci: true,
        format: 'markdown',
        github: {
          token: githubToken,
          repo: githubRepo,
          pr: parseInt(githubPr, 10),
        },
      });

      log('Posted PR comment');
    } else {
      log('GitHub plugin not installed, skipping PR comment');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Failed to post GitHub comment: ${msg}`);
  }
}
```

**Step 3: Build**

```bash
pnpm --filter @buoy/cli build
```

**Step 4: Commit**

```bash
git add apps/cli/src/commands/ci.ts
git commit -m "feat(cli): add GitHub PR comment support to buoy ci"
```

---

## Task 6: Add Manual Test Script

**Files:**
- Create: `packages/plugin-github/test-manual.md`

**Step 1: Create test documentation**

```markdown
# Manual Testing for @buoy/plugin-github

## Prerequisites

1. A GitHub repo with an open PR
2. A GitHub token with `repo` scope
3. The plugin installed

## Test Commands

### Test 1: Direct Plugin Test

```bash
# Set environment
export GITHUB_TOKEN="your-token"
export GITHUB_REPOSITORY="owner/repo"
export GITHUB_PR_NUMBER="123"

# Run CI with GitHub reporting
cd your-project
buoy lighthouse --github-token $GITHUB_TOKEN --github-repo $GITHUB_REPOSITORY --github-pr $GITHUB_PR_NUMBER
```

### Test 2: Using Environment Variables

```bash
# GitHub Actions sets these automatically
export GITHUB_TOKEN="${{ secrets.GITHUB_TOKEN }}"
export GITHUB_REPOSITORY="${{ github.repository }}"
export GITHUB_PR_NUMBER="${{ github.event.pull_request.number }}"

buoy ci
```

### Expected Results

1. PR comment should appear with Buoy drift report
2. Running again should update the same comment (not create new)
3. No drift = green success message
4. Drift found = table of issues by severity
```

**Step 2: Commit**

```bash
git add packages/plugin-github/test-manual.md
git commit -m "docs(plugin-github): add manual testing guide"
```

---

## Task 7: Final Integration Test

**Files:**
- No file changes, verification only

**Step 1: Build everything**

```bash
pnpm build
```

**Step 2: Verify plugin loads**

```bash
cd test-fixture
node -e "
const plugin = require('../packages/plugin-github/dist/index.js').default();
console.log('Plugin loaded:', plugin.metadata.name);
console.log('Has report method:', typeof plugin.report === 'function');
"
```

**Step 3: Test formatter output**

```bash
node -e "
const { formatPRComment } = require('../packages/plugin-github/dist/index.js');
const result = {
  summary: { total: 2, critical: 1, warning: 1, info: 0 },
  signals: [
    { type: 'hardcoded-value', severity: 'critical', message: 'Hardcoded color', component: 'Button', file: 'Button.tsx', line: 10 },
    { type: 'naming', severity: 'warning', message: 'Inconsistent name', component: 'Card' }
  ]
};
console.log(formatPRComment(result));
"
```

**Step 4: Commit completion**

```bash
git commit --allow-empty -m "feat(plugin-github): GitHub plugin complete"
```

---

## Summary

After completing all tasks:

1. `@buoy/plugin-github` package created
2. Markdown formatter for PR comments
3. GitHub API client with create/update/delete
4. CI command integration via `--github-*` options
5. Environment variable support for GitHub Actions

**Usage:**

```bash
# With explicit options
buoy lighthouse --github-token $TOKEN --github-repo owner/repo --github-pr 123

# With environment variables (GitHub Actions style)
GITHUB_TOKEN=xxx GITHUB_REPOSITORY=owner/repo GITHUB_PR_NUMBER=123 buoy ci
```

**Next Phase:** GitHub Action wrapper (`buoy-dev/buoy-action`)
