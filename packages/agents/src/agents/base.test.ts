// packages/agents/src/agents/base.test.ts
import { describe, it, expect, vi } from 'vitest';
import { BaseAgent, type BaseAgentOptions } from './base.js';
import type { AgentContext, AgentResult, Finding } from '../types.js';

// Mock ClaudeClient to avoid needing API key
vi.mock('../utils/claude.js', async () => {
  const actual = await vi.importActual('../utils/claude.js');
  return {
    ...actual,
    ClaudeClient: vi.fn().mockImplementation(() => ({
      complete: vi.fn(),
      completeJSON: vi.fn(),
    })),
  };
});

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
