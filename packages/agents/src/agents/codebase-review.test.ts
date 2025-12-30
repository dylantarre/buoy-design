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
