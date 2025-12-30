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
