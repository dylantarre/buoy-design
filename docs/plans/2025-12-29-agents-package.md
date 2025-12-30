# @buoy-design/agents Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a reusable package of specialized AI agents for code analysis, git history review, and contribution assessment.

**Architecture:** Three composable agents (CodebaseReviewAgent, HistoryReviewAgent, AcceptanceAgent) with a shared interface. Each agent gathers specific context, constructs a structured prompt, calls Claude API, and returns typed findings. Agents can be used standalone or orchestrated together.

**Tech Stack:** TypeScript, Zod (validation), Anthropic SDK (Claude API), simple-git (git operations)

---

## Task 1: Package Scaffold

**Files:**
- Create: `packages/agents/package.json`
- Create: `packages/agents/tsconfig.json`
- Create: `packages/agents/src/index.ts`

**Step 1: Create package.json**

```json
{
  "name": "@buoy-design/agents",
  "version": "0.1.0",
  "description": "AI agents for code analysis, history review, and contribution assessment",
  "type": "module",
  "license": "MIT",
  "author": "Buoy <hello@buoy.design>",
  "homepage": "https://buoy.design",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/dylantarre/buoy-design.git",
    "directory": "packages/agents"
  },
  "bugs": {
    "url": "https://github.com/dylantarre/buoy-design/issues"
  },
  "keywords": ["buoy", "ai-agents", "code-review", "git-analysis"],
  "files": ["dist", "README.md"],
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./codebase": {
      "types": "./dist/agents/codebase-review.d.ts",
      "import": "./dist/agents/codebase-review.js"
    },
    "./history": {
      "types": "./dist/agents/history-review.d.ts",
      "import": "./dist/agents/history-review.js"
    },
    "./acceptance": {
      "types": "./dist/agents/acceptance.d.ts",
      "import": "./dist/agents/acceptance.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.32.1",
    "simple-git": "^3.27.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "typescript": "^5.7.2"
  },
  "peerDependencies": {
    "@buoy-design/core": "workspace:*"
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
  "exclude": ["node_modules", "dist", "src/**/*.test.ts", "src/__tests__"]
}
```

**Step 3: Create placeholder index.ts**

```typescript
// packages/agents/src/index.ts
export * from './types.js';
export * from './agents/codebase-review.js';
export * from './agents/history-review.js';
export * from './agents/acceptance.js';
```

**Step 4: Install dependencies**

Run: `pnpm install`

**Step 5: Verify build works**

Run: `pnpm --filter @buoy-design/agents build`
Expected: Fails (missing files) - that's okay, scaffold is ready

**Step 6: Commit**

```bash
git add packages/agents/
git commit -m "feat(agents): create package scaffold"
```

---

## Task 2: Core Types

**Files:**
- Create: `packages/agents/src/types.ts`
- Create: `packages/agents/src/types.test.ts`

**Step 1: Write the types file**

```typescript
// packages/agents/src/types.ts
import { z } from 'zod';
import type { DriftSignal } from '@buoy-design/core';

// ============================================================================
// Repository & File Context
// ============================================================================

export const RepoMetadataSchema = z.object({
  url: z.string(),
  name: z.string(),
  owner: z.string(),
  defaultBranch: z.string(),
  localPath: z.string(),
  description: z.string().optional(),
  stars: z.number().optional(),
  lastCommitDate: z.date().optional(),
});

export type RepoMetadata = z.infer<typeof RepoMetadataSchema>;

export const FileContentSchema = z.object({
  path: z.string(),
  content: z.string(),
  language: z.string().optional(),
  lineCount: z.number(),
});

export type FileContent = z.infer<typeof FileContentSchema>;

// ============================================================================
// Git History Types
// ============================================================================

export const CommitInfoSchema = z.object({
  hash: z.string(),
  shortHash: z.string(),
  author: z.string(),
  email: z.string(),
  date: z.date(),
  message: z.string(),
  filesChanged: z.number().optional(),
});

export type CommitInfo = z.infer<typeof CommitInfoSchema>;

export const BlameLineSchema = z.object({
  lineNumber: z.number(),
  content: z.string(),
  commit: CommitInfoSchema,
});

export type BlameLine = z.infer<typeof BlameLineSchema>;

export const PullRequestInfoSchema = z.object({
  number: z.number(),
  title: z.string(),
  author: z.string(),
  state: z.enum(['open', 'closed', 'merged']),
  createdAt: z.date(),
  mergedAt: z.date().optional(),
  url: z.string(),
  body: z.string().optional(),
  labels: z.array(z.string()),
  reviewers: z.array(z.string()).optional(),
  commentsCount: z.number().optional(),
});

export type PullRequestInfo = z.infer<typeof PullRequestInfoSchema>;

// ============================================================================
// Agent Input Context
// ============================================================================

export const AgentContextSchema = z.object({
  repo: RepoMetadataSchema,
  files: z.array(FileContentSchema),
  signals: z.array(z.custom<DriftSignal>()).optional(),
  // Additional context that can be passed to agents
  focusAreas: z.array(z.string()).optional(),
  question: z.string().optional(),
});

export type AgentContext = z.infer<typeof AgentContextSchema>;

export const HistoryContextSchema = AgentContextSchema.extend({
  commits: z.array(CommitInfoSchema),
  blame: z.record(z.string(), z.array(BlameLineSchema)).optional(), // path -> blame lines
  pullRequests: z.array(PullRequestInfoSchema).optional(),
});

export type HistoryContext = z.infer<typeof HistoryContextSchema>;

export const AcceptanceContextSchema = AgentContextSchema.extend({
  contributingGuide: z.string().optional(),
  codeOfConduct: z.string().optional(),
  prTemplate: z.string().optional(),
  recentMergedPRs: z.array(PullRequestInfoSchema).optional(),
  recentRejectedPRs: z.array(PullRequestInfoSchema).optional(),
  maintainers: z.array(z.string()).optional(),
});

export type AcceptanceContext = z.infer<typeof AcceptanceContextSchema>;

// ============================================================================
// Agent Output Types
// ============================================================================

export const FindingSeveritySchema = z.enum(['critical', 'warning', 'info', 'positive']);
export type FindingSeverity = z.infer<typeof FindingSeveritySchema>;

export const FindingSchema = z.object({
  type: z.string(),
  severity: FindingSeveritySchema,
  location: z.string().optional(), // file:line format
  observation: z.string(),
  recommendation: z.string().optional(),
  evidence: z.array(z.string()), // Supporting quotes, data, or references
  confidence: z.number().min(0).max(1),
});

export type Finding = z.infer<typeof FindingSchema>;

export const AgentResultSchema = z.object({
  agentId: z.string(),
  agentName: z.string(),
  executedAt: z.date(),
  durationMs: z.number(),
  summary: z.string(), // 1-2 sentence takeaway
  findings: z.array(FindingSchema),
  overallConfidence: z.number().min(0).max(1),
  rawAnalysis: z.string(), // Full Claude response for transparency
  tokensUsed: z.object({
    input: z.number(),
    output: z.number(),
  }).optional(),
});

export type AgentResult = z.infer<typeof AgentResultSchema>;

// ============================================================================
// Codebase Review Specific Types
// ============================================================================

export const CodePatternSchema = z.object({
  name: z.string(),
  description: z.string(),
  occurrences: z.number(),
  examples: z.array(z.object({
    file: z.string(),
    line: z.number(),
    snippet: z.string(),
  })),
  isConsistent: z.boolean(),
});

export type CodePattern = z.infer<typeof CodePatternSchema>;

export const CodebaseReviewResultSchema = AgentResultSchema.extend({
  patterns: z.array(CodePatternSchema),
  codeQuality: z.object({
    score: z.number().min(0).max(100),
    strengths: z.array(z.string()),
    concerns: z.array(z.string()),
  }),
  intentionalDivergences: z.array(z.object({
    signalId: z.string().optional(),
    reason: z.string(),
    confidence: z.number(),
  })),
});

export type CodebaseReviewResult = z.infer<typeof CodebaseReviewResultSchema>;

// ============================================================================
// History Review Specific Types
// ============================================================================

export const EvolutionNarrativeSchema = z.object({
  file: z.string(),
  summary: z.string(),
  keyEvents: z.array(z.object({
    date: z.date(),
    event: z.string(),
    commit: z.string(),
    significance: z.enum(['major', 'minor', 'context']),
  })),
  mainContributors: z.array(z.string()),
  lastMeaningfulChange: z.date().optional(),
  changeFrequency: z.enum(['active', 'stable', 'dormant', 'abandoned']),
});

export type EvolutionNarrative = z.infer<typeof EvolutionNarrativeSchema>;

export const HistoryReviewResultSchema = AgentResultSchema.extend({
  narratives: z.array(EvolutionNarrativeSchema),
  whyNotUpdated: z.array(z.object({
    file: z.string(),
    reason: z.string(),
    evidence: z.array(z.string()),
    shouldUpdate: z.boolean(),
  })),
  relatedPRs: z.array(z.object({
    pr: PullRequestInfoSchema,
    relevance: z.string(),
  })),
});

export type HistoryReviewResult = z.infer<typeof HistoryReviewResultSchema>;

// ============================================================================
// Acceptance Prediction Specific Types
// ============================================================================

export const AcceptancePredictionSchema = z.object({
  likelihood: z.enum(['high', 'medium', 'low', 'unlikely']),
  score: z.number().min(0).max(100),
  factors: z.array(z.object({
    factor: z.string(),
    impact: z.enum(['positive', 'negative', 'neutral']),
    weight: z.number(),
    evidence: z.string(),
  })),
  suggestedApproach: z.object({
    prTitle: z.string(),
    prBody: z.string(),
    commitMessage: z.string(),
    labels: z.array(z.string()),
  }),
  risks: z.array(z.object({
    risk: z.string(),
    mitigation: z.string(),
  })),
  timing: z.object({
    bestTimeToSubmit: z.string().optional(),
    maintainerActivity: z.string(),
  }),
});

export type AcceptancePrediction = z.infer<typeof AcceptancePredictionSchema>;

export const AcceptanceResultSchema = AgentResultSchema.extend({
  prediction: AcceptancePredictionSchema,
  similarAcceptedPRs: z.array(z.object({
    pr: PullRequestInfoSchema,
    similarity: z.string(),
  })),
  maintainerPreferences: z.array(z.object({
    preference: z.string(),
    evidence: z.string(),
  })),
});

export type AcceptanceResult = z.infer<typeof AcceptanceResultSchema>;

// ============================================================================
// Agent Interface
// ============================================================================

export interface Agent<TContext extends AgentContext, TResult extends AgentResult> {
  readonly id: string;
  readonly name: string;
  readonly description: string;

  /**
   * Execute the agent with the given context
   */
  execute(context: TContext): Promise<TResult>;

  /**
   * Validate that the context has required fields
   */
  validateContext(context: TContext): { valid: boolean; errors: string[] };
}

// ============================================================================
// Agent Configuration
// ============================================================================

export const AgentConfigSchema = z.object({
  model: z.enum(['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-haiku-20241022']).default('claude-sonnet-4-20250514'),
  maxTokens: z.number().default(4096),
  temperature: z.number().min(0).max(1).default(0.3),
  apiKey: z.string().optional(), // Falls back to ANTHROPIC_API_KEY env var
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  model: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
  temperature: 0.3,
};
```

**Step 2: Write basic validation tests**

```typescript
// packages/agents/src/types.test.ts
import { describe, it, expect } from 'vitest';
import {
  RepoMetadataSchema,
  FileContentSchema,
  FindingSchema,
  AgentResultSchema,
  DEFAULT_AGENT_CONFIG,
} from './types.js';

describe('agent types', () => {
  describe('RepoMetadataSchema', () => {
    it('validates valid repo metadata', () => {
      const valid = {
        url: 'https://github.com/org/repo',
        name: 'repo',
        owner: 'org',
        defaultBranch: 'main',
        localPath: '/tmp/repos/org/repo',
      };
      expect(RepoMetadataSchema.parse(valid)).toEqual(valid);
    });

    it('rejects missing required fields', () => {
      const invalid = { url: 'https://github.com/org/repo' };
      expect(() => RepoMetadataSchema.parse(invalid)).toThrow();
    });
  });

  describe('FileContentSchema', () => {
    it('validates file content', () => {
      const valid = {
        path: 'src/Button.tsx',
        content: 'export const Button = () => {}',
        lineCount: 1,
      };
      expect(FileContentSchema.parse(valid)).toEqual(valid);
    });
  });

  describe('FindingSchema', () => {
    it('validates a finding', () => {
      const finding = {
        type: 'pattern-violation',
        severity: 'warning' as const,
        location: 'src/Button.tsx:23',
        observation: 'Hardcoded color value',
        recommendation: 'Use design token instead',
        evidence: ['Found #3b82f6 instead of --color-primary'],
        confidence: 0.85,
      };
      expect(FindingSchema.parse(finding)).toEqual(finding);
    });

    it('rejects confidence outside 0-1 range', () => {
      const invalid = {
        type: 'test',
        severity: 'info',
        observation: 'test',
        evidence: [],
        confidence: 1.5,
      };
      expect(() => FindingSchema.parse(invalid)).toThrow();
    });
  });

  describe('DEFAULT_AGENT_CONFIG', () => {
    it('has expected defaults', () => {
      expect(DEFAULT_AGENT_CONFIG.model).toBe('claude-sonnet-4-20250514');
      expect(DEFAULT_AGENT_CONFIG.maxTokens).toBe(4096);
      expect(DEFAULT_AGENT_CONFIG.temperature).toBe(0.3);
    });
  });
});
```

**Step 3: Run tests**

Run: `pnpm --filter @buoy-design/agents test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add packages/agents/src/types.ts packages/agents/src/types.test.ts
git commit -m "feat(agents): add core types for agent interface"
```

---

## Task 3: Claude API Utility

**Files:**
- Create: `packages/agents/src/utils/claude.ts`
- Create: `packages/agents/src/utils/claude.test.ts`

**Step 1: Write the Claude utility**

```typescript
// packages/agents/src/utils/claude.ts
import Anthropic from '@anthropic-ai/sdk';
import type { AgentConfig } from '../types.js';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeResponse {
  content: string;
  tokensUsed: {
    input: number;
    output: number;
  };
  stopReason: string;
}

export class ClaudeClient {
  private client: Anthropic;
  private config: AgentConfig;

  constructor(config: Partial<AgentConfig> = {}) {
    const apiKey = config.apiKey ?? process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      throw new Error(
        'Anthropic API key required. Set ANTHROPIC_API_KEY env var or pass apiKey in config.'
      );
    }

    this.client = new Anthropic({ apiKey });
    this.config = {
      model: config.model ?? 'claude-sonnet-4-20250514',
      maxTokens: config.maxTokens ?? 4096,
      temperature: config.temperature ?? 0.3,
    };
  }

  async complete(
    systemPrompt: string,
    messages: ClaudeMessage[],
    options: Partial<AgentConfig> = {}
  ): Promise<ClaudeResponse> {
    const response = await this.client.messages.create({
      model: options.model ?? this.config.model,
      max_tokens: options.maxTokens ?? this.config.maxTokens,
      temperature: options.temperature ?? this.config.temperature,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const textContent = response.content.find((c) => c.type === 'text');
    const content = textContent?.type === 'text' ? textContent.text : '';

    return {
      content,
      tokensUsed: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
      stopReason: response.stop_reason ?? 'unknown',
    };
  }

  /**
   * Complete with structured JSON output
   */
  async completeJSON<T>(
    systemPrompt: string,
    messages: ClaudeMessage[],
    options: Partial<AgentConfig> = {}
  ): Promise<{ data: T; tokensUsed: ClaudeResponse['tokensUsed'] }> {
    const jsonSystemPrompt = `${systemPrompt}

IMPORTANT: Your response must be valid JSON only. No markdown code blocks, no explanation text before or after. Just the JSON object.`;

    const response = await this.complete(jsonSystemPrompt, messages, options);

    // Try to extract JSON from response
    let jsonStr = response.content.trim();

    // Handle markdown code blocks if present
    if (jsonStr.startsWith('```')) {
      const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match?.[1]) {
        jsonStr = match[1];
      }
    }

    try {
      const data = JSON.parse(jsonStr) as T;
      return { data, tokensUsed: response.tokensUsed };
    } catch {
      throw new Error(`Failed to parse Claude response as JSON: ${jsonStr.slice(0, 200)}...`);
    }
  }
}

/**
 * Create a prompt section with clear boundaries
 */
export function promptSection(name: string, content: string): string {
  return `<${name}>
${content}
</${name}>`;
}

/**
 * Format file contents for prompt
 */
export function formatFilesForPrompt(
  files: Array<{ path: string; content: string }>
): string {
  return files
    .map(
      (f) => `## ${f.path}

\`\`\`
${f.content}
\`\`\``
    )
    .join('\n\n');
}

/**
 * Truncate content to fit token limits (rough estimate: 4 chars per token)
 */
export function truncateForTokens(content: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (content.length <= maxChars) {
    return content;
  }
  return content.slice(0, maxChars) + '\n\n[... content truncated for token limits ...]';
}
```

**Step 2: Write tests (mock the API)**

```typescript
// packages/agents/src/utils/claude.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promptSection, formatFilesForPrompt, truncateForTokens } from './claude.js';

describe('claude utilities', () => {
  describe('promptSection', () => {
    it('wraps content in XML-style tags', () => {
      const result = promptSection('context', 'some content here');
      expect(result).toBe(`<context>
some content here
</context>`);
    });
  });

  describe('formatFilesForPrompt', () => {
    it('formats files with headers and code blocks', () => {
      const files = [
        { path: 'src/Button.tsx', content: 'export const Button = () => {}' },
        { path: 'src/Input.tsx', content: 'export const Input = () => {}' },
      ];
      const result = formatFilesForPrompt(files);

      expect(result).toContain('## src/Button.tsx');
      expect(result).toContain('## src/Input.tsx');
      expect(result).toContain('```');
      expect(result).toContain('export const Button');
    });
  });

  describe('truncateForTokens', () => {
    it('returns content unchanged if within limit', () => {
      const content = 'short content';
      expect(truncateForTokens(content, 1000)).toBe(content);
    });

    it('truncates content exceeding limit', () => {
      const content = 'a'.repeat(10000);
      const result = truncateForTokens(content, 100); // 100 tokens = ~400 chars
      expect(result.length).toBeLessThan(content.length);
      expect(result).toContain('[... content truncated for token limits ...]');
    });
  });
});
```

**Step 3: Run tests**

Run: `pnpm --filter @buoy-design/agents test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add packages/agents/src/utils/
git commit -m "feat(agents): add Claude API client utility"
```

---

## Task 4: Git History Utility

**Files:**
- Create: `packages/agents/src/utils/git.ts`
- Create: `packages/agents/src/utils/git.test.ts`
- Create: `packages/agents/src/utils/index.ts`

**Step 1: Write the git utility**

```typescript
// packages/agents/src/utils/git.ts
import simpleGit, { SimpleGit, LogResult } from 'simple-git';
import type { CommitInfo, BlameLine, PullRequestInfo } from '../types.js';

export interface GitClient {
  getCommits(filePath?: string, limit?: number): Promise<CommitInfo[]>;
  getBlame(filePath: string): Promise<BlameLine[]>;
  getDiff(fromRef: string, toRef?: string): Promise<string>;
  getFileAtCommit(filePath: string, commitHash: string): Promise<string | null>;
  getContributors(filePath?: string): Promise<string[]>;
}

export function createGitClient(repoPath: string): GitClient {
  const git: SimpleGit = simpleGit(repoPath);

  return {
    async getCommits(filePath?: string, limit = 50): Promise<CommitInfo[]> {
      const options: Record<string, string | number | undefined> = {
        '--max-count': limit,
      };

      if (filePath) {
        options['--follow'] = undefined;
      }

      const log: LogResult = filePath
        ? await git.log({ file: filePath, maxCount: limit })
        : await git.log({ maxCount: limit });

      return log.all.map((commit) => ({
        hash: commit.hash,
        shortHash: commit.hash.slice(0, 7),
        author: commit.author_name,
        email: commit.author_email,
        date: new Date(commit.date),
        message: commit.message,
        filesChanged: undefined,
      }));
    },

    async getBlame(filePath: string): Promise<BlameLine[]> {
      try {
        const result = await git.raw(['blame', '--line-porcelain', filePath]);
        return parseBlameOutput(result);
      } catch {
        return [];
      }
    },

    async getDiff(fromRef: string, toRef = 'HEAD'): Promise<string> {
      return git.diff([fromRef, toRef]);
    },

    async getFileAtCommit(filePath: string, commitHash: string): Promise<string | null> {
      try {
        return await git.show([`${commitHash}:${filePath}`]);
      } catch {
        return null;
      }
    },

    async getContributors(filePath?: string): Promise<string[]> {
      const commits = await this.getCommits(filePath, 100);
      const contributors = new Set<string>();
      for (const commit of commits) {
        contributors.add(commit.author);
      }
      return Array.from(contributors);
    },
  };
}

function parseBlameOutput(output: string): BlameLine[] {
  const lines: BlameLine[] = [];
  const chunks = output.split(/^([a-f0-9]{40})/m).filter(Boolean);

  let lineNumber = 1;
  for (let i = 0; i < chunks.length; i += 2) {
    const hash = chunks[i];
    const rest = chunks[i + 1];
    if (!hash || !rest) continue;

    const authorMatch = rest.match(/^author (.+)$/m);
    const emailMatch = rest.match(/^author-mail <(.+)>$/m);
    const timeMatch = rest.match(/^author-time (\d+)$/m);
    const summaryMatch = rest.match(/^summary (.+)$/m);
    const contentMatch = rest.match(/^\t(.*)$/m);

    if (authorMatch && contentMatch) {
      lines.push({
        lineNumber,
        content: contentMatch[1] ?? '',
        commit: {
          hash,
          shortHash: hash.slice(0, 7),
          author: authorMatch[1] ?? 'Unknown',
          email: emailMatch?.[1] ?? '',
          date: new Date(parseInt(timeMatch?.[1] ?? '0', 10) * 1000),
          message: summaryMatch?.[1] ?? '',
        },
      });
      lineNumber++;
    }
  }

  return lines;
}

/**
 * Extract file paths from git diff output
 */
export function extractChangedFiles(diffOutput: string): string[] {
  const files: string[] = [];
  const matches = diffOutput.matchAll(/^diff --git a\/(.+?) b\//gm);
  for (const match of matches) {
    if (match[1]) {
      files.push(match[1]);
    }
  }
  return files;
}

/**
 * Summarize commit history for a file into a narrative
 */
export function summarizeFileHistory(commits: CommitInfo[]): {
  frequency: 'active' | 'stable' | 'dormant' | 'abandoned';
  lastChange: Date | undefined;
  mainContributors: string[];
} {
  if (commits.length === 0) {
    return { frequency: 'abandoned', lastChange: undefined, mainContributors: [] };
  }

  const lastChange = commits[0]?.date;
  const now = new Date();
  const daysSinceLastChange = lastChange
    ? (now.getTime() - lastChange.getTime()) / (1000 * 60 * 60 * 24)
    : Infinity;

  let frequency: 'active' | 'stable' | 'dormant' | 'abandoned';
  if (daysSinceLastChange < 30) {
    frequency = 'active';
  } else if (daysSinceLastChange < 90) {
    frequency = 'stable';
  } else if (daysSinceLastChange < 365) {
    frequency = 'dormant';
  } else {
    frequency = 'abandoned';
  }

  const contributorCounts = new Map<string, number>();
  for (const commit of commits) {
    contributorCounts.set(
      commit.author,
      (contributorCounts.get(commit.author) ?? 0) + 1
    );
  }

  const mainContributors = Array.from(contributorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);

  return { frequency, lastChange, mainContributors };
}
```

**Step 2: Write tests**

```typescript
// packages/agents/src/utils/git.test.ts
import { describe, it, expect } from 'vitest';
import { extractChangedFiles, summarizeFileHistory } from './git.js';
import type { CommitInfo } from '../types.js';

describe('git utilities', () => {
  describe('extractChangedFiles', () => {
    it('extracts file paths from diff output', () => {
      const diff = `diff --git a/src/Button.tsx b/src/Button.tsx
index 123..456 789
--- a/src/Button.tsx
+++ b/src/Button.tsx
@@ -1,3 +1,4 @@
+import React from 'react';
diff --git a/src/Input.tsx b/src/Input.tsx
index abc..def ghi`;

      const files = extractChangedFiles(diff);
      expect(files).toEqual(['src/Button.tsx', 'src/Input.tsx']);
    });

    it('returns empty array for no matches', () => {
      expect(extractChangedFiles('')).toEqual([]);
    });
  });

  describe('summarizeFileHistory', () => {
    it('returns abandoned for empty commits', () => {
      const result = summarizeFileHistory([]);
      expect(result.frequency).toBe('abandoned');
      expect(result.mainContributors).toEqual([]);
    });

    it('returns active for recent commits', () => {
      const commits: CommitInfo[] = [
        {
          hash: 'abc123',
          shortHash: 'abc123',
          author: 'Alice',
          email: 'alice@test.com',
          date: new Date(),
          message: 'Recent commit',
        },
      ];
      const result = summarizeFileHistory(commits);
      expect(result.frequency).toBe('active');
      expect(result.mainContributors).toContain('Alice');
    });

    it('identifies main contributors', () => {
      const now = new Date();
      const commits: CommitInfo[] = [
        { hash: '1', shortHash: '1', author: 'Alice', email: '', date: now, message: '' },
        { hash: '2', shortHash: '2', author: 'Alice', email: '', date: now, message: '' },
        { hash: '3', shortHash: '3', author: 'Bob', email: '', date: now, message: '' },
        { hash: '4', shortHash: '4', author: 'Alice', email: '', date: now, message: '' },
      ];
      const result = summarizeFileHistory(commits);
      expect(result.mainContributors[0]).toBe('Alice');
    });
  });
});
```

**Step 3: Create utils index**

```typescript
// packages/agents/src/utils/index.ts
export * from './claude.js';
export * from './git.js';
```

**Step 4: Run tests**

Run: `pnpm --filter @buoy-design/agents test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add packages/agents/src/utils/
git commit -m "feat(agents): add git history utilities"
```

---

## Task 5: Base Agent Class

**Files:**
- Create: `packages/agents/src/agents/base.ts`
- Create: `packages/agents/src/agents/base.test.ts`

**Step 1: Write the base agent class**

```typescript
// packages/agents/src/agents/base.ts
import {
  type Agent,
  type AgentContext,
  type AgentResult,
  type AgentConfig,
  type Finding,
  DEFAULT_AGENT_CONFIG,
} from '../types.js';
import { ClaudeClient, type ClaudeResponse } from '../utils/claude.js';

export interface BaseAgentOptions {
  config?: Partial<AgentConfig>;
}

export abstract class BaseAgent<
  TContext extends AgentContext = AgentContext,
  TResult extends AgentResult = AgentResult
> implements Agent<TContext, TResult>
{
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;

  protected client: ClaudeClient;
  protected config: AgentConfig;

  constructor(options: BaseAgentOptions = {}) {
    this.config = { ...DEFAULT_AGENT_CONFIG, ...options.config };
    this.client = new ClaudeClient(this.config);
  }

  abstract execute(context: TContext): Promise<TResult>;

  validateContext(context: TContext): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!context.repo) {
      errors.push('Missing required field: repo');
    }
    if (!context.files || context.files.length === 0) {
      errors.push('At least one file is required in context');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Build the base result object
   */
  protected buildResult(
    summary: string,
    findings: Finding[],
    rawAnalysis: string,
    startTime: number,
    tokensUsed?: ClaudeResponse['tokensUsed']
  ): AgentResult {
    const confidences = findings.map((f) => f.confidence);
    const overallConfidence =
      confidences.length > 0
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : 0;

    return {
      agentId: this.id,
      agentName: this.name,
      executedAt: new Date(),
      durationMs: Date.now() - startTime,
      summary,
      findings,
      overallConfidence,
      rawAnalysis,
      tokensUsed,
    };
  }

  /**
   * Parse findings from Claude's JSON response
   */
  protected parseFindings(findings: unknown[]): Finding[] {
    if (!Array.isArray(findings)) return [];

    return findings
      .filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null)
      .map((f) => ({
        type: String(f['type'] ?? 'unknown'),
        severity: this.parseSeverity(f['severity']),
        location: f['location'] ? String(f['location']) : undefined,
        observation: String(f['observation'] ?? ''),
        recommendation: f['recommendation'] ? String(f['recommendation']) : undefined,
        evidence: Array.isArray(f['evidence'])
          ? f['evidence'].map(String)
          : [],
        confidence: typeof f['confidence'] === 'number' ? f['confidence'] : 0.5,
      }));
  }

  private parseSeverity(value: unknown): Finding['severity'] {
    if (value === 'critical' || value === 'warning' || value === 'info' || value === 'positive') {
      return value;
    }
    return 'info';
  }
}
```

**Step 2: Write tests**

```typescript
// packages/agents/src/agents/base.test.ts
import { describe, it, expect, vi } from 'vitest';
import { BaseAgent, type BaseAgentOptions } from './base.js';
import type { AgentContext, AgentResult, Finding } from '../types.js';

// Concrete test implementation
class TestAgent extends BaseAgent {
  readonly id = 'test-agent';
  readonly name = 'Test Agent';
  readonly description = 'A test agent';

  async execute(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();
    return this.buildResult(
      'Test summary',
      [],
      'Raw analysis',
      startTime
    );
  }
}

describe('BaseAgent', () => {
  describe('validateContext', () => {
    it('returns valid for complete context', () => {
      const agent = new TestAgent();
      const context: AgentContext = {
        repo: {
          url: 'https://github.com/org/repo',
          name: 'repo',
          owner: 'org',
          defaultBranch: 'main',
          localPath: '/tmp/repo',
        },
        files: [{ path: 'test.ts', content: 'code', lineCount: 1 }],
      };

      const result = agent.validateContext(context);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns invalid for missing repo', () => {
      const agent = new TestAgent();
      const context = {
        files: [{ path: 'test.ts', content: 'code', lineCount: 1 }],
      } as AgentContext;

      const result = agent.validateContext(context);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: repo');
    });

    it('returns invalid for empty files', () => {
      const agent = new TestAgent();
      const context: AgentContext = {
        repo: {
          url: 'https://github.com/org/repo',
          name: 'repo',
          owner: 'org',
          defaultBranch: 'main',
          localPath: '/tmp/repo',
        },
        files: [],
      };

      const result = agent.validateContext(context);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one file is required in context');
    });
  });

  describe('parseFindings', () => {
    it('parses valid findings', () => {
      const agent = new TestAgent();
      const rawFindings = [
        {
          type: 'pattern-violation',
          severity: 'warning',
          location: 'src/test.ts:10',
          observation: 'Found issue',
          recommendation: 'Fix it',
          evidence: ['evidence 1'],
          confidence: 0.9,
        },
      ];

      // Access protected method via any
      const findings = (agent as unknown as { parseFindings: (f: unknown[]) => Finding[] }).parseFindings(rawFindings);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.type).toBe('pattern-violation');
      expect(findings[0]?.severity).toBe('warning');
      expect(findings[0]?.confidence).toBe(0.9);
    });

    it('handles malformed findings gracefully', () => {
      const agent = new TestAgent();
      const rawFindings = [null, 'invalid', { type: 'valid' }];

      const findings = (agent as unknown as { parseFindings: (f: unknown[]) => Finding[] }).parseFindings(rawFindings);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.type).toBe('valid');
    });
  });
});
```

**Step 3: Run tests**

Run: `pnpm --filter @buoy-design/agents test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add packages/agents/src/agents/
git commit -m "feat(agents): add base agent class"
```

---

## Task 6: Codebase Review Agent

**Files:**
- Create: `packages/agents/src/agents/codebase-review.ts`
- Create: `packages/agents/src/agents/codebase-review.test.ts`

**Step 1: Write the codebase review agent**

```typescript
// packages/agents/src/agents/codebase-review.ts
import { BaseAgent, type BaseAgentOptions } from './base.js';
import {
  type AgentContext,
  type CodebaseReviewResult,
  type CodePattern,
  type Finding,
} from '../types.js';
import { promptSection, formatFilesForPrompt, truncateForTokens } from '../utils/claude.js';

const SYSTEM_PROMPT = `You are an expert code reviewer specializing in design systems and component architecture.

Your task is to analyze code for:
1. Code patterns and conventions used in the codebase
2. Whether reported drift signals are actually problems or intentional divergences
3. Code quality assessment
4. Consistency of patterns across files

You will receive:
- Source files from a codebase
- Optional drift signals detected by an automated tool
- A question or focus area to analyze

Respond with a JSON object (no markdown, just JSON) matching this structure:
{
  "summary": "1-2 sentence summary of your analysis",
  "patterns": [
    {
      "name": "Pattern name",
      "description": "What this pattern does",
      "occurrences": 5,
      "examples": [{"file": "path.ts", "line": 10, "snippet": "code"}],
      "isConsistent": true
    }
  ],
  "codeQuality": {
    "score": 75,
    "strengths": ["Good typing", "Consistent naming"],
    "concerns": ["Some code duplication"]
  },
  "findings": [
    {
      "type": "intentional-divergence|pattern-violation|suggestion",
      "severity": "critical|warning|info|positive",
      "location": "file:line",
      "observation": "What you observed",
      "recommendation": "What to do about it",
      "evidence": ["Supporting quote or data"],
      "confidence": 0.85
    }
  ],
  "intentionalDivergences": [
    {
      "signalId": "drift-signal-id if analyzing a specific signal",
      "reason": "Why this appears to be intentional",
      "confidence": 0.9
    }
  ]
}`;

export class CodebaseReviewAgent extends BaseAgent<AgentContext, CodebaseReviewResult> {
  readonly id = 'codebase-review';
  readonly name = 'Codebase Review Agent';
  readonly description =
    'Analyzes code for patterns, quality, and whether drift signals are intentional divergences';

  constructor(options: BaseAgentOptions = {}) {
    super(options);
  }

  async execute(context: AgentContext): Promise<CodebaseReviewResult> {
    const startTime = Date.now();
    const validation = this.validateContext(context);
    if (!validation.valid) {
      throw new Error(`Invalid context: ${validation.errors.join(', ')}`);
    }

    const userPrompt = this.buildPrompt(context);
    const response = await this.client.completeJSON<RawCodebaseReviewResponse>(
      SYSTEM_PROMPT,
      [{ role: 'user', content: userPrompt }]
    );

    const { data } = response;
    const findings = this.parseFindings(data.findings ?? []);
    const patterns = this.parsePatterns(data.patterns ?? []);

    const baseResult = this.buildResult(
      data.summary ?? 'Analysis complete',
      findings,
      JSON.stringify(data, null, 2),
      startTime,
      response.tokensUsed
    );

    return {
      ...baseResult,
      patterns,
      codeQuality: {
        score: data.codeQuality?.score ?? 50,
        strengths: data.codeQuality?.strengths ?? [],
        concerns: data.codeQuality?.concerns ?? [],
      },
      intentionalDivergences: (data.intentionalDivergences ?? []).map((d) => ({
        signalId: d.signalId,
        reason: d.reason ?? 'Unknown reason',
        confidence: d.confidence ?? 0.5,
      })),
    };
  }

  private buildPrompt(context: AgentContext): string {
    const sections: string[] = [];

    // Repository context
    sections.push(
      promptSection(
        'repository',
        `Name: ${context.repo.name}
Owner: ${context.repo.owner}
URL: ${context.repo.url}`
      )
    );

    // Files to analyze
    const filesContent = formatFilesForPrompt(
      context.files.map((f) => ({
        path: f.path,
        content: truncateForTokens(f.content, 2000),
      }))
    );
    sections.push(promptSection('files', filesContent));

    // Drift signals if present
    if (context.signals && context.signals.length > 0) {
      const signalsText = context.signals
        .map(
          (s) =>
            `- ID: ${s.id}
  Type: ${s.type}
  Severity: ${s.severity}
  Message: ${s.message}
  Location: ${s.source.location}`
        )
        .join('\n\n');
      sections.push(promptSection('drift_signals', signalsText));
    }

    // Focus areas
    if (context.focusAreas && context.focusAreas.length > 0) {
      sections.push(
        promptSection('focus_areas', context.focusAreas.join('\n'))
      );
    }

    // Specific question
    if (context.question) {
      sections.push(promptSection('question', context.question));
    } else {
      sections.push(
        promptSection(
          'question',
          'Analyze this code for patterns, quality, and whether any drift signals are intentional divergences.'
        )
      );
    }

    return sections.join('\n\n');
  }

  private parsePatterns(patterns: unknown[]): CodePattern[] {
    if (!Array.isArray(patterns)) return [];

    return patterns
      .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
      .map((p) => ({
        name: String(p['name'] ?? 'Unknown'),
        description: String(p['description'] ?? ''),
        occurrences: typeof p['occurrences'] === 'number' ? p['occurrences'] : 0,
        examples: Array.isArray(p['examples'])
          ? p['examples']
              .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
              .map((e) => ({
                file: String(e['file'] ?? ''),
                line: typeof e['line'] === 'number' ? e['line'] : 0,
                snippet: String(e['snippet'] ?? ''),
              }))
          : [],
        isConsistent: p['isConsistent'] === true,
      }));
  }
}

interface RawCodebaseReviewResponse {
  summary?: string;
  patterns?: unknown[];
  codeQuality?: {
    score?: number;
    strengths?: string[];
    concerns?: string[];
  };
  findings?: unknown[];
  intentionalDivergences?: Array<{
    signalId?: string;
    reason?: string;
    confidence?: number;
  }>;
}
```

**Step 2: Write tests**

```typescript
// packages/agents/src/agents/codebase-review.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodebaseReviewAgent } from './codebase-review.js';
import type { AgentContext } from '../types.js';

// Mock the ClaudeClient
vi.mock('../utils/claude.js', async () => {
  const actual = await vi.importActual('../utils/claude.js');
  return {
    ...actual,
    ClaudeClient: vi.fn().mockImplementation(() => ({
      completeJSON: vi.fn().mockResolvedValue({
        data: {
          summary: 'Code follows consistent patterns',
          patterns: [
            {
              name: 'Functional Components',
              description: 'React functional components with hooks',
              occurrences: 5,
              examples: [{ file: 'Button.tsx', line: 1, snippet: 'const Button = () => {}' }],
              isConsistent: true,
            },
          ],
          codeQuality: {
            score: 85,
            strengths: ['Good typing'],
            concerns: [],
          },
          findings: [
            {
              type: 'pattern-violation',
              severity: 'warning',
              location: 'Button.tsx:10',
              observation: 'Hardcoded color',
              recommendation: 'Use token',
              evidence: ['#3b82f6'],
              confidence: 0.9,
            },
          ],
          intentionalDivergences: [],
        },
        tokensUsed: { input: 100, output: 200 },
      }),
    })),
  };
});

describe('CodebaseReviewAgent', () => {
  let agent: CodebaseReviewAgent;
  let context: AgentContext;

  beforeEach(() => {
    agent = new CodebaseReviewAgent();
    context = {
      repo: {
        url: 'https://github.com/test/repo',
        name: 'repo',
        owner: 'test',
        defaultBranch: 'main',
        localPath: '/tmp/repo',
      },
      files: [
        {
          path: 'Button.tsx',
          content: 'export const Button = () => <button style={{color: "#3b82f6"}}>Click</button>',
          lineCount: 1,
        },
      ],
    };
  });

  it('has correct metadata', () => {
    expect(agent.id).toBe('codebase-review');
    expect(agent.name).toBe('Codebase Review Agent');
  });

  it('validates context correctly', () => {
    const result = agent.validateContext(context);
    expect(result.valid).toBe(true);
  });

  it('executes and returns structured result', async () => {
    const result = await agent.execute(context);

    expect(result.agentId).toBe('codebase-review');
    expect(result.summary).toBe('Code follows consistent patterns');
    expect(result.patterns).toHaveLength(1);
    expect(result.patterns[0]?.name).toBe('Functional Components');
    expect(result.codeQuality.score).toBe(85);
    expect(result.findings).toHaveLength(1);
    expect(result.tokensUsed).toBeDefined();
  });

  it('throws on invalid context', async () => {
    const invalidContext = { repo: context.repo, files: [] };
    await expect(agent.execute(invalidContext)).rejects.toThrow('Invalid context');
  });
});
```

**Step 3: Run tests**

Run: `pnpm --filter @buoy-design/agents test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add packages/agents/src/agents/codebase-review.ts packages/agents/src/agents/codebase-review.test.ts
git commit -m "feat(agents): add CodebaseReviewAgent"
```

---

## Task 7: History Review Agent

**Files:**
- Create: `packages/agents/src/agents/history-review.ts`
- Create: `packages/agents/src/agents/history-review.test.ts`

**Step 1: Write the history review agent**

```typescript
// packages/agents/src/agents/history-review.ts
import { BaseAgent, type BaseAgentOptions } from './base.js';
import {
  type HistoryContext,
  type HistoryReviewResult,
  type EvolutionNarrative,
  type Finding,
} from '../types.js';
import { promptSection, truncateForTokens } from '../utils/claude.js';

const SYSTEM_PROMPT = `You are an expert at understanding code evolution and git history.

Your task is to analyze git history to understand:
1. Why code evolved to its current state
2. Who maintains different parts of the codebase
3. Whether files were intentionally left unchanged (and why)
4. Historical context that explains current code patterns
5. Related PRs and discussions that provide context

You will receive:
- Commit history for specific files
- Git blame information showing who wrote each line
- Pull request information when available
- Optional drift signals to explain

Respond with a JSON object (no markdown, just JSON) matching this structure:
{
  "summary": "1-2 sentence summary of the history analysis",
  "narratives": [
    {
      "file": "path/to/file.ts",
      "summary": "This file handles X and was last significantly updated when Y",
      "keyEvents": [
        {
          "date": "2024-06-15T00:00:00Z",
          "event": "Added token migration",
          "commit": "abc1234",
          "significance": "major|minor|context"
        }
      ],
      "mainContributors": ["Alice", "Bob"],
      "lastMeaningfulChange": "2024-06-15T00:00:00Z",
      "changeFrequency": "active|stable|dormant|abandoned"
    }
  ],
  "whyNotUpdated": [
    {
      "file": "path/to/file.ts",
      "reason": "Token migration PR #301 missed this file",
      "evidence": ["Commit abc123 only updated 5 of 8 files"],
      "shouldUpdate": true
    }
  ],
  "relatedPRs": [
    {
      "pr": {
        "number": 301,
        "title": "Migrate to design tokens",
        "author": "alice",
        "state": "merged",
        "createdAt": "2024-06-01T00:00:00Z",
        "mergedAt": "2024-06-15T00:00:00Z",
        "url": "https://github.com/org/repo/pull/301",
        "labels": ["design-system"]
      },
      "relevance": "This PR introduced the tokens this file should be using"
    }
  ],
  "findings": [
    {
      "type": "historical-context|maintenance-pattern|ownership",
      "severity": "info|warning|positive",
      "location": "file:line",
      "observation": "What you found in the history",
      "recommendation": "Suggested action based on history",
      "evidence": ["commit hashes", "PR references"],
      "confidence": 0.85
    }
  ]
}`;

export class HistoryReviewAgent extends BaseAgent<HistoryContext, HistoryReviewResult> {
  readonly id = 'history-review';
  readonly name = 'History Review Agent';
  readonly description =
    'Analyzes git history to understand why code evolved and whether files were intentionally left unchanged';

  constructor(options: BaseAgentOptions = {}) {
    super(options);
  }

  async execute(context: HistoryContext): Promise<HistoryReviewResult> {
    const startTime = Date.now();
    const validation = this.validateContext(context);
    if (!validation.valid) {
      throw new Error(`Invalid context: ${validation.errors.join(', ')}`);
    }

    const userPrompt = this.buildPrompt(context);
    const response = await this.client.completeJSON<RawHistoryReviewResponse>(
      SYSTEM_PROMPT,
      [{ role: 'user', content: userPrompt }]
    );

    const { data } = response;
    const findings = this.parseFindings(data.findings ?? []);

    const baseResult = this.buildResult(
      data.summary ?? 'History analysis complete',
      findings,
      JSON.stringify(data, null, 2),
      startTime,
      response.tokensUsed
    );

    return {
      ...baseResult,
      narratives: this.parseNarratives(data.narratives ?? []),
      whyNotUpdated: (data.whyNotUpdated ?? []).map((w) => ({
        file: String(w.file ?? ''),
        reason: String(w.reason ?? ''),
        evidence: Array.isArray(w.evidence) ? w.evidence.map(String) : [],
        shouldUpdate: w.shouldUpdate === true,
      })),
      relatedPRs: (data.relatedPRs ?? []).map((r) => ({
        pr: this.parsePR(r.pr),
        relevance: String(r.relevance ?? ''),
      })),
    };
  }

  override validateContext(context: HistoryContext): { valid: boolean; errors: string[] } {
    const baseValidation = super.validateContext(context);
    const errors = [...baseValidation.errors];

    if (!context.commits || context.commits.length === 0) {
      errors.push('At least one commit is required for history analysis');
    }

    return { valid: errors.length === 0, errors };
  }

  private buildPrompt(context: HistoryContext): string {
    const sections: string[] = [];

    // Repository context
    sections.push(
      promptSection(
        'repository',
        `Name: ${context.repo.name}
Owner: ${context.repo.owner}
URL: ${context.repo.url}`
      )
    );

    // Commit history
    const commitsText = context.commits
      .slice(0, 50) // Limit to recent 50 commits
      .map(
        (c) =>
          `${c.shortHash} | ${c.date.toISOString().split('T')[0]} | ${c.author} | ${c.message.split('\n')[0]}`
      )
      .join('\n');
    sections.push(promptSection('commit_history', commitsText));

    // Blame info if present
    if (context.blame) {
      const blameText = Object.entries(context.blame)
        .map(([file, lines]) => {
          const summary = this.summarizeBlame(lines);
          return `## ${file}\n${summary}`;
        })
        .join('\n\n');
      sections.push(promptSection('blame_summary', truncateForTokens(blameText, 2000)));
    }

    // PRs if present
    if (context.pullRequests && context.pullRequests.length > 0) {
      const prsText = context.pullRequests
        .slice(0, 20)
        .map(
          (pr) =>
            `#${pr.number} | ${pr.state} | ${pr.author} | ${pr.title}
  Labels: ${pr.labels.join(', ') || 'none'}
  URL: ${pr.url}`
        )
        .join('\n\n');
      sections.push(promptSection('pull_requests', prsText));
    }

    // Files for context
    const filesText = context.files
      .map((f) => `- ${f.path} (${f.lineCount} lines)`)
      .join('\n');
    sections.push(promptSection('files_under_analysis', filesText));

    // Drift signals if present
    if (context.signals && context.signals.length > 0) {
      const signalsText = context.signals
        .map(
          (s) =>
            `- ${s.type} in ${s.source.location}: ${s.message}`
        )
        .join('\n');
      sections.push(promptSection('drift_signals_to_explain', signalsText));
    }

    // Question
    if (context.question) {
      sections.push(promptSection('question', context.question));
    } else {
      sections.push(
        promptSection(
          'question',
          'Analyze this git history to understand why the code is in its current state and whether any files were intentionally left unchanged.'
        )
      );
    }

    return sections.join('\n\n');
  }

  private summarizeBlame(lines: Array<{ lineNumber: number; commit: { author: string; date: Date } }>): string {
    const authorCounts = new Map<string, number>();
    let oldestDate = new Date();
    let newestDate = new Date(0);

    for (const line of lines) {
      authorCounts.set(
        line.commit.author,
        (authorCounts.get(line.commit.author) ?? 0) + 1
      );
      if (line.commit.date < oldestDate) oldestDate = line.commit.date;
      if (line.commit.date > newestDate) newestDate = line.commit.date;
    }

    const authors = Array.from(authorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => `${name} (${count} lines)`)
      .join(', ');

    return `Contributors: ${authors}
Date range: ${oldestDate.toISOString().split('T')[0]} to ${newestDate.toISOString().split('T')[0]}
Total lines: ${lines.length}`;
  }

  private parseNarratives(narratives: unknown[]): EvolutionNarrative[] {
    if (!Array.isArray(narratives)) return [];

    return narratives
      .filter((n): n is Record<string, unknown> => typeof n === 'object' && n !== null)
      .map((n) => ({
        file: String(n['file'] ?? ''),
        summary: String(n['summary'] ?? ''),
        keyEvents: Array.isArray(n['keyEvents'])
          ? n['keyEvents']
              .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
              .map((e) => ({
                date: new Date(String(e['date'] ?? '')),
                event: String(e['event'] ?? ''),
                commit: String(e['commit'] ?? ''),
                significance: this.parseSignificance(e['significance']),
              }))
          : [],
        mainContributors: Array.isArray(n['mainContributors'])
          ? n['mainContributors'].map(String)
          : [],
        lastMeaningfulChange: n['lastMeaningfulChange']
          ? new Date(String(n['lastMeaningfulChange']))
          : undefined,
        changeFrequency: this.parseFrequency(n['changeFrequency']),
      }));
  }

  private parseSignificance(value: unknown): 'major' | 'minor' | 'context' {
    if (value === 'major' || value === 'minor' || value === 'context') {
      return value;
    }
    return 'context';
  }

  private parseFrequency(value: unknown): 'active' | 'stable' | 'dormant' | 'abandoned' {
    if (value === 'active' || value === 'stable' || value === 'dormant' || value === 'abandoned') {
      return value;
    }
    return 'stable';
  }

  private parsePR(pr: unknown): HistoryReviewResult['relatedPRs'][0]['pr'] {
    if (typeof pr !== 'object' || pr === null) {
      return {
        number: 0,
        title: '',
        author: '',
        state: 'closed',
        createdAt: new Date(),
        url: '',
        labels: [],
      };
    }

    const p = pr as Record<string, unknown>;
    return {
      number: typeof p['number'] === 'number' ? p['number'] : 0,
      title: String(p['title'] ?? ''),
      author: String(p['author'] ?? ''),
      state: this.parsePRState(p['state']),
      createdAt: new Date(String(p['createdAt'] ?? '')),
      mergedAt: p['mergedAt'] ? new Date(String(p['mergedAt'])) : undefined,
      url: String(p['url'] ?? ''),
      body: p['body'] ? String(p['body']) : undefined,
      labels: Array.isArray(p['labels']) ? p['labels'].map(String) : [],
    };
  }

  private parsePRState(value: unknown): 'open' | 'closed' | 'merged' {
    if (value === 'open' || value === 'closed' || value === 'merged') {
      return value;
    }
    return 'closed';
  }
}

interface RawHistoryReviewResponse {
  summary?: string;
  narratives?: unknown[];
  whyNotUpdated?: Array<{
    file?: string;
    reason?: string;
    evidence?: unknown[];
    shouldUpdate?: boolean;
  }>;
  relatedPRs?: Array<{
    pr?: unknown;
    relevance?: string;
  }>;
  findings?: unknown[];
}
```

**Step 2: Write tests**

```typescript
// packages/agents/src/agents/history-review.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HistoryReviewAgent } from './history-review.js';
import type { HistoryContext } from '../types.js';

vi.mock('../utils/claude.js', async () => {
  const actual = await vi.importActual('../utils/claude.js');
  return {
    ...actual,
    ClaudeClient: vi.fn().mockImplementation(() => ({
      completeJSON: vi.fn().mockResolvedValue({
        data: {
          summary: 'File was last updated 8 months ago during token migration',
          narratives: [
            {
              file: 'Button.tsx',
              summary: 'Component was created in 2023, updated during design system migration',
              keyEvents: [
                {
                  date: '2024-06-15T00:00:00Z',
                  event: 'Token migration',
                  commit: 'abc1234',
                  significance: 'major',
                },
              ],
              mainContributors: ['Alice'],
              lastMeaningfulChange: '2024-06-15T00:00:00Z',
              changeFrequency: 'stable',
            },
          ],
          whyNotUpdated: [
            {
              file: 'Button.tsx',
              reason: 'Missed during token migration PR',
              evidence: ['PR #301 updated 5 of 8 component files'],
              shouldUpdate: true,
            },
          ],
          relatedPRs: [
            {
              pr: {
                number: 301,
                title: 'Migrate to design tokens',
                author: 'alice',
                state: 'merged',
                createdAt: '2024-06-01T00:00:00Z',
                mergedAt: '2024-06-15T00:00:00Z',
                url: 'https://github.com/org/repo/pull/301',
                labels: ['design-system'],
              },
              relevance: 'Introduced the tokens this file should use',
            },
          ],
          findings: [
            {
              type: 'historical-context',
              severity: 'info',
              observation: 'File was missed during migration',
              evidence: ['PR #301'],
              confidence: 0.9,
            },
          ],
        },
        tokensUsed: { input: 150, output: 300 },
      }),
    })),
  };
});

describe('HistoryReviewAgent', () => {
  let agent: HistoryReviewAgent;
  let context: HistoryContext;

  beforeEach(() => {
    agent = new HistoryReviewAgent();
    context = {
      repo: {
        url: 'https://github.com/test/repo',
        name: 'repo',
        owner: 'test',
        defaultBranch: 'main',
        localPath: '/tmp/repo',
      },
      files: [
        {
          path: 'Button.tsx',
          content: 'export const Button = () => {}',
          lineCount: 1,
        },
      ],
      commits: [
        {
          hash: 'abc1234567890',
          shortHash: 'abc1234',
          author: 'Alice',
          email: 'alice@test.com',
          date: new Date('2024-06-15'),
          message: 'feat: migrate to design tokens',
        },
      ],
    };
  });

  it('has correct metadata', () => {
    expect(agent.id).toBe('history-review');
    expect(agent.name).toBe('History Review Agent');
  });

  it('validates context requires commits', () => {
    const noCommits = { ...context, commits: [] };
    const result = agent.validateContext(noCommits);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('At least one commit is required for history analysis');
  });

  it('executes and returns structured result', async () => {
    const result = await agent.execute(context);

    expect(result.agentId).toBe('history-review');
    expect(result.narratives).toHaveLength(1);
    expect(result.narratives[0]?.file).toBe('Button.tsx');
    expect(result.narratives[0]?.changeFrequency).toBe('stable');
    expect(result.whyNotUpdated).toHaveLength(1);
    expect(result.whyNotUpdated[0]?.shouldUpdate).toBe(true);
    expect(result.relatedPRs).toHaveLength(1);
    expect(result.relatedPRs[0]?.pr.number).toBe(301);
  });
});
```

**Step 3: Run tests**

Run: `pnpm --filter @buoy-design/agents test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add packages/agents/src/agents/history-review.ts packages/agents/src/agents/history-review.test.ts
git commit -m "feat(agents): add HistoryReviewAgent"
```

---

## Task 8: Acceptance Agent

**Files:**
- Create: `packages/agents/src/agents/acceptance.ts`
- Create: `packages/agents/src/agents/acceptance.test.ts`

**Step 1: Write the acceptance agent**

```typescript
// packages/agents/src/agents/acceptance.ts
import { BaseAgent, type BaseAgentOptions } from './base.js';
import {
  type AcceptanceContext,
  type AcceptanceResult,
  type AcceptancePrediction,
} from '../types.js';
import { promptSection, truncateForTokens } from '../utils/claude.js';

const SYSTEM_PROMPT = `You are an expert at understanding open source contribution patterns and predicting PR acceptance.

Your task is to analyze a repository's contribution culture to predict:
1. Whether a proposed change would be accepted
2. How to frame the PR for maximum acceptance
3. What risks might cause rejection
4. When and how to submit

You will receive:
- CONTRIBUTING.md and other contribution guidelines
- Recent merged and rejected PRs
- Information about maintainers and their preferences
- The proposed change

Respond with a JSON object (no markdown, just JSON) matching this structure:
{
  "summary": "1-2 sentence summary of acceptance likelihood",
  "prediction": {
    "likelihood": "high|medium|low|unlikely",
    "score": 75,
    "factors": [
      {
        "factor": "Active maintainer",
        "impact": "positive|negative|neutral",
        "weight": 0.3,
        "evidence": "Merged 12 PRs in last month"
      }
    ],
    "suggestedApproach": {
      "prTitle": "fix: migrate Button to design tokens",
      "prBody": "## Summary\\n...",
      "commitMessage": "fix(Button): use design tokens instead of hardcoded colors",
      "labels": ["design-system", "good-first-issue"]
    },
    "risks": [
      {
        "risk": "Maintainer prefers bundled changes",
        "mitigation": "Group with other token migrations"
      }
    ],
    "timing": {
      "bestTimeToSubmit": "Weekday mornings UTC",
      "maintainerActivity": "Most active Tue-Thu"
    }
  },
  "similarAcceptedPRs": [
    {
      "pr": {
        "number": 305,
        "title": "fix: migrate Input to tokens",
        "author": "contributor",
        "state": "merged",
        "mergedAt": "2024-07-01T00:00:00Z",
        "url": "..."
      },
      "similarity": "Same type of token migration change"
    }
  ],
  "maintainerPreferences": [
    {
      "preference": "Prefers small, focused PRs",
      "evidence": "Rejected PR #290 asking to split into smaller PRs"
    }
  ],
  "findings": [
    {
      "type": "contribution-pattern|maintainer-preference|risk",
      "severity": "info|warning|positive",
      "observation": "What you found",
      "recommendation": "How to use this insight",
      "evidence": ["PR numbers", "quotes"],
      "confidence": 0.85
    }
  ]
}`;

export class AcceptanceAgent extends BaseAgent<AcceptanceContext, AcceptanceResult> {
  readonly id = 'acceptance';
  readonly name = 'Acceptance Prediction Agent';
  readonly description =
    'Predicts PR acceptance likelihood and suggests optimal submission approach';

  constructor(options: BaseAgentOptions = {}) {
    super(options);
  }

  async execute(context: AcceptanceContext): Promise<AcceptanceResult> {
    const startTime = Date.now();
    const validation = this.validateContext(context);
    if (!validation.valid) {
      throw new Error(`Invalid context: ${validation.errors.join(', ')}`);
    }

    const userPrompt = this.buildPrompt(context);
    const response = await this.client.completeJSON<RawAcceptanceResponse>(
      SYSTEM_PROMPT,
      [{ role: 'user', content: userPrompt }]
    );

    const { data } = response;
    const findings = this.parseFindings(data.findings ?? []);

    const baseResult = this.buildResult(
      data.summary ?? 'Acceptance analysis complete',
      findings,
      JSON.stringify(data, null, 2),
      startTime,
      response.tokensUsed
    );

    return {
      ...baseResult,
      prediction: this.parsePrediction(data.prediction),
      similarAcceptedPRs: (data.similarAcceptedPRs ?? []).map((s) => ({
        pr: this.parsePR(s.pr),
        similarity: String(s.similarity ?? ''),
      })),
      maintainerPreferences: (data.maintainerPreferences ?? []).map((p) => ({
        preference: String(p.preference ?? ''),
        evidence: String(p.evidence ?? ''),
      })),
    };
  }

  private buildPrompt(context: AcceptanceContext): string {
    const sections: string[] = [];

    // Repository context
    sections.push(
      promptSection(
        'repository',
        `Name: ${context.repo.name}
Owner: ${context.repo.owner}
URL: ${context.repo.url}
Stars: ${context.repo.stars ?? 'Unknown'}`
      )
    );

    // Contributing guide
    if (context.contributingGuide) {
      sections.push(
        promptSection(
          'contributing_guide',
          truncateForTokens(context.contributingGuide, 2000)
        )
      );
    }

    // PR template
    if (context.prTemplate) {
      sections.push(
        promptSection('pr_template', truncateForTokens(context.prTemplate, 500))
      );
    }

    // Recent merged PRs
    if (context.recentMergedPRs && context.recentMergedPRs.length > 0) {
      const prsText = context.recentMergedPRs
        .slice(0, 10)
        .map(
          (pr) =>
            `#${pr.number} | ${pr.author} | ${pr.title}
  Merged: ${pr.mergedAt?.toISOString().split('T')[0] ?? 'N/A'}
  Labels: ${pr.labels.join(', ') || 'none'}`
        )
        .join('\n\n');
      sections.push(promptSection('recent_merged_prs', prsText));
    }

    // Recent rejected PRs
    if (context.recentRejectedPRs && context.recentRejectedPRs.length > 0) {
      const prsText = context.recentRejectedPRs
        .slice(0, 5)
        .map(
          (pr) =>
            `#${pr.number} | ${pr.author} | ${pr.title}
  Labels: ${pr.labels.join(', ') || 'none'}
  Comments: ${pr.commentsCount ?? 'Unknown'}`
        )
        .join('\n\n');
      sections.push(promptSection('recent_rejected_prs', prsText));
    }

    // Maintainers
    if (context.maintainers && context.maintainers.length > 0) {
      sections.push(
        promptSection('maintainers', context.maintainers.join(', '))
      );
    }

    // Proposed change (from drift signals or files)
    if (context.signals && context.signals.length > 0) {
      const changesText = context.signals
        .map(
          (s) =>
            `- ${s.type}: ${s.message}
  Location: ${s.source.location}
  Severity: ${s.severity}`
        )
        .join('\n\n');
      sections.push(promptSection('proposed_changes', changesText));
    }

    // Files being modified
    const filesText = context.files
      .map((f) => `- ${f.path} (${f.lineCount} lines)`)
      .join('\n');
    sections.push(promptSection('files_to_modify', filesText));

    // Question
    if (context.question) {
      sections.push(promptSection('question', context.question));
    } else {
      sections.push(
        promptSection(
          'question',
          'Analyze this repository\'s contribution patterns and predict whether the proposed changes would be accepted as a PR. Provide specific recommendations for submission.'
        )
      );
    }

    return sections.join('\n\n');
  }

  private parsePrediction(prediction: unknown): AcceptancePrediction {
    const defaults: AcceptancePrediction = {
      likelihood: 'medium',
      score: 50,
      factors: [],
      suggestedApproach: {
        prTitle: '',
        prBody: '',
        commitMessage: '',
        labels: [],
      },
      risks: [],
      timing: {
        maintainerActivity: 'Unknown',
      },
    };

    if (typeof prediction !== 'object' || prediction === null) {
      return defaults;
    }

    const p = prediction as Record<string, unknown>;

    return {
      likelihood: this.parseLikelihood(p['likelihood']),
      score: typeof p['score'] === 'number' ? p['score'] : 50,
      factors: Array.isArray(p['factors'])
        ? p['factors']
            .filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null)
            .map((f) => ({
              factor: String(f['factor'] ?? ''),
              impact: this.parseImpact(f['impact']),
              weight: typeof f['weight'] === 'number' ? f['weight'] : 0.5,
              evidence: String(f['evidence'] ?? ''),
            }))
        : [],
      suggestedApproach: this.parseSuggestedApproach(p['suggestedApproach']),
      risks: Array.isArray(p['risks'])
        ? p['risks']
            .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
            .map((r) => ({
              risk: String(r['risk'] ?? ''),
              mitigation: String(r['mitigation'] ?? ''),
            }))
        : [],
      timing: {
        bestTimeToSubmit:
          typeof (p['timing'] as Record<string, unknown>)?.['bestTimeToSubmit'] === 'string'
            ? String((p['timing'] as Record<string, unknown>)['bestTimeToSubmit'])
            : undefined,
        maintainerActivity: String(
          (p['timing'] as Record<string, unknown>)?.['maintainerActivity'] ?? 'Unknown'
        ),
      },
    };
  }

  private parseLikelihood(value: unknown): AcceptancePrediction['likelihood'] {
    if (value === 'high' || value === 'medium' || value === 'low' || value === 'unlikely') {
      return value;
    }
    return 'medium';
  }

  private parseImpact(value: unknown): 'positive' | 'negative' | 'neutral' {
    if (value === 'positive' || value === 'negative' || value === 'neutral') {
      return value;
    }
    return 'neutral';
  }

  private parseSuggestedApproach(approach: unknown): AcceptancePrediction['suggestedApproach'] {
    const defaults = { prTitle: '', prBody: '', commitMessage: '', labels: [] };

    if (typeof approach !== 'object' || approach === null) {
      return defaults;
    }

    const a = approach as Record<string, unknown>;
    return {
      prTitle: String(a['prTitle'] ?? ''),
      prBody: String(a['prBody'] ?? ''),
      commitMessage: String(a['commitMessage'] ?? ''),
      labels: Array.isArray(a['labels']) ? a['labels'].map(String) : [],
    };
  }

  private parsePR(pr: unknown): AcceptanceResult['similarAcceptedPRs'][0]['pr'] {
    if (typeof pr !== 'object' || pr === null) {
      return {
        number: 0,
        title: '',
        author: '',
        state: 'closed',
        createdAt: new Date(),
        url: '',
        labels: [],
      };
    }

    const p = pr as Record<string, unknown>;
    return {
      number: typeof p['number'] === 'number' ? p['number'] : 0,
      title: String(p['title'] ?? ''),
      author: String(p['author'] ?? ''),
      state: this.parsePRState(p['state']),
      createdAt: new Date(String(p['createdAt'] ?? '')),
      mergedAt: p['mergedAt'] ? new Date(String(p['mergedAt'])) : undefined,
      url: String(p['url'] ?? ''),
      body: p['body'] ? String(p['body']) : undefined,
      labels: Array.isArray(p['labels']) ? p['labels'].map(String) : [],
    };
  }

  private parsePRState(value: unknown): 'open' | 'closed' | 'merged' {
    if (value === 'open' || value === 'closed' || value === 'merged') {
      return value;
    }
    return 'closed';
  }
}

interface RawAcceptanceResponse {
  summary?: string;
  prediction?: unknown;
  similarAcceptedPRs?: Array<{
    pr?: unknown;
    similarity?: string;
  }>;
  maintainerPreferences?: Array<{
    preference?: string;
    evidence?: string;
  }>;
  findings?: unknown[];
}
```

**Step 2: Write tests**

```typescript
// packages/agents/src/agents/acceptance.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AcceptanceAgent } from './acceptance.js';
import type { AcceptanceContext } from '../types.js';

vi.mock('../utils/claude.js', async () => {
  const actual = await vi.importActual('../utils/claude.js');
  return {
    ...actual,
    ClaudeClient: vi.fn().mockImplementation(() => ({
      completeJSON: vi.fn().mockResolvedValue({
        data: {
          summary: 'High likelihood of acceptance based on similar merged PRs',
          prediction: {
            likelihood: 'high',
            score: 85,
            factors: [
              {
                factor: 'Active maintainer',
                impact: 'positive',
                weight: 0.4,
                evidence: 'Merged 15 PRs in last month',
              },
            ],
            suggestedApproach: {
              prTitle: 'fix: migrate Button to design tokens',
              prBody: '## Summary\nMigrates hardcoded colors to design tokens',
              commitMessage: 'fix(Button): use design tokens',
              labels: ['design-system'],
            },
            risks: [
              {
                risk: 'Change conflicts with ongoing refactor',
                mitigation: 'Check open PRs first',
              },
            ],
            timing: {
              bestTimeToSubmit: 'Weekday mornings',
              maintainerActivity: 'Most active Tue-Thu',
            },
          },
          similarAcceptedPRs: [
            {
              pr: {
                number: 305,
                title: 'fix: migrate Input to tokens',
                author: 'alice',
                state: 'merged',
                mergedAt: '2024-07-01T00:00:00Z',
                url: 'https://github.com/org/repo/pull/305',
                labels: ['design-system'],
              },
              similarity: 'Same type of token migration',
            },
          ],
          maintainerPreferences: [
            {
              preference: 'Small, focused PRs',
              evidence: 'Rejected large PRs asking to split',
            },
          ],
          findings: [],
        },
        tokensUsed: { input: 200, output: 400 },
      }),
    })),
  };
});

describe('AcceptanceAgent', () => {
  let agent: AcceptanceAgent;
  let context: AcceptanceContext;

  beforeEach(() => {
    agent = new AcceptanceAgent();
    context = {
      repo: {
        url: 'https://github.com/test/repo',
        name: 'repo',
        owner: 'test',
        defaultBranch: 'main',
        localPath: '/tmp/repo',
        stars: 500,
      },
      files: [
        {
          path: 'Button.tsx',
          content: 'export const Button = () => {}',
          lineCount: 1,
        },
      ],
      contributingGuide: '# Contributing\n\nPlease submit small PRs.',
    };
  });

  it('has correct metadata', () => {
    expect(agent.id).toBe('acceptance');
    expect(agent.name).toBe('Acceptance Prediction Agent');
  });

  it('executes and returns structured result', async () => {
    const result = await agent.execute(context);

    expect(result.agentId).toBe('acceptance');
    expect(result.prediction.likelihood).toBe('high');
    expect(result.prediction.score).toBe(85);
    expect(result.prediction.factors).toHaveLength(1);
    expect(result.prediction.suggestedApproach.prTitle).toContain('design tokens');
    expect(result.prediction.risks).toHaveLength(1);
    expect(result.similarAcceptedPRs).toHaveLength(1);
    expect(result.maintainerPreferences).toHaveLength(1);
  });
});
```

**Step 3: Run tests**

Run: `pnpm --filter @buoy-design/agents test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add packages/agents/src/agents/acceptance.ts packages/agents/src/agents/acceptance.test.ts
git commit -m "feat(agents): add AcceptanceAgent"
```

---

## Task 9: Agent Index & Package Finalization

**Files:**
- Create: `packages/agents/src/agents/index.ts`
- Update: `packages/agents/src/index.ts`
- Create: `packages/agents/README.md`

**Step 1: Create agents index**

```typescript
// packages/agents/src/agents/index.ts
export { BaseAgent, type BaseAgentOptions } from './base.js';
export { CodebaseReviewAgent } from './codebase-review.js';
export { HistoryReviewAgent } from './history-review.js';
export { AcceptanceAgent } from './acceptance.js';
```

**Step 2: Update main index**

```typescript
// packages/agents/src/index.ts
// Types
export * from './types.js';

// Utilities
export * from './utils/index.js';

// Agents
export * from './agents/index.js';
```

**Step 3: Create README**

```markdown
# @buoy-design/agents

AI agents for code analysis, git history review, and contribution assessment.

## Installation

```bash
pnpm add @buoy-design/agents
```

## Agents

### CodebaseReviewAgent

Analyzes code for patterns, quality, and whether drift signals are intentional divergences.

```typescript
import { CodebaseReviewAgent } from '@buoy-design/agents';

const agent = new CodebaseReviewAgent();
const result = await agent.execute({
  repo: { url: '...', name: 'repo', owner: 'org', defaultBranch: 'main', localPath: '/path' },
  files: [{ path: 'Button.tsx', content: '...', lineCount: 50 }],
  signals: driftSignals, // optional
});

console.log(result.patterns);
console.log(result.codeQuality);
console.log(result.intentionalDivergences);
```

### HistoryReviewAgent

Analyzes git history to understand why code evolved and whether files were intentionally left unchanged.

```typescript
import { HistoryReviewAgent } from '@buoy-design/agents';

const agent = new HistoryReviewAgent();
const result = await agent.execute({
  repo: { ... },
  files: [{ ... }],
  commits: [{ hash: '...', author: '...', date: new Date(), message: '...' }],
  blame: { 'Button.tsx': [...] }, // optional
  pullRequests: [...], // optional
});

console.log(result.narratives);
console.log(result.whyNotUpdated);
console.log(result.relatedPRs);
```

### AcceptanceAgent

Predicts PR acceptance likelihood and suggests optimal submission approach.

```typescript
import { AcceptanceAgent } from '@buoy-design/agents';

const agent = new AcceptanceAgent();
const result = await agent.execute({
  repo: { ... },
  files: [{ ... }],
  contributingGuide: '...',
  recentMergedPRs: [...],
});

console.log(result.prediction.likelihood); // 'high' | 'medium' | 'low' | 'unlikely'
console.log(result.prediction.suggestedApproach);
console.log(result.maintainerPreferences);
```

## Configuration

All agents accept optional configuration:

```typescript
const agent = new CodebaseReviewAgent({
  config: {
    model: 'claude-sonnet-4-20250514', // or 'claude-opus-4-20250514'
    maxTokens: 4096,
    temperature: 0.3,
    apiKey: 'sk-...', // or set ANTHROPIC_API_KEY env var
  },
});
```

## License

MIT
```

**Step 4: Build and verify**

Run: `pnpm --filter @buoy-design/agents build`
Expected: Build succeeds

**Step 5: Run all tests**

Run: `pnpm --filter @buoy-design/agents test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add packages/agents/
git commit -m "feat(agents): finalize package with README and exports"
```

---

## Summary

After completing all tasks, you will have:

1. **@buoy-design/agents** package with:
   - `CodebaseReviewAgent` - analyzes code patterns and identifies intentional divergences
   - `HistoryReviewAgent` - understands git history and why code wasn't updated
   - `AcceptanceAgent` - predicts PR acceptance and suggests submission approach

2. **Utilities**:
   - `ClaudeClient` - wrapper for Anthropic API with JSON parsing
   - `createGitClient` - git history and blame utilities

3. **Comprehensive types** with Zod validation for all inputs/outputs

4. **Full test coverage** with mocked Claude API calls

The agents are designed to be:
- **Composable** - use individually or together
- **Reusable** - will work in buoy-testing-suite and future `buoy explain` command
- **Well-typed** - full TypeScript with Zod schemas
- **Testable** - easy to mock for unit tests
