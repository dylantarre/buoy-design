import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HistoryAgent } from './history.js';
import { ReviewAgent } from './review.js';
import { AcceptanceAgent } from './acceptance.js';
import { FixabilityAgent } from './fixability.js';
import { GeneratorAgent } from './generator.js';

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    };
  },
}));

// Mock simple-git
vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => ({
    log: vi.fn().mockResolvedValue({ all: [] }),
    raw: vi.fn().mockResolvedValue(''),
  })),
}));

describe('Agent Instantiation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create HistoryAgent', () => {
    const agent = new HistoryAgent('test-key');
    expect(agent).toBeDefined();
    expect(agent.analyze).toBeDefined();
  });

  it('should create ReviewAgent', () => {
    const agent = new ReviewAgent('test-key');
    expect(agent).toBeDefined();
    expect(agent.analyze).toBeDefined();
  });

  it('should create AcceptanceAgent', () => {
    const agent = new AcceptanceAgent('test-key');
    expect(agent).toBeDefined();
    expect(agent.predict).toBeDefined();
  });

  it('should create FixabilityAgent', () => {
    const agent = new FixabilityAgent('test-key');
    expect(agent).toBeDefined();
    expect(agent.assess).toBeDefined();
    expect(agent.assessBatch).toBeDefined();
  });

  it('should create GeneratorAgent', () => {
    const agent = new GeneratorAgent('test-key');
    expect(agent).toBeDefined();
    expect(agent.generate).toBeDefined();
  });
});

describe('HistoryAgent', () => {
  it('should analyze git history for a signal', async () => {
    const agent = new HistoryAgent('test-key');

    const result = await agent.analyze({
      repo: { path: '/tmp/test', owner: 'test', name: 'repo' },
      signal: {
        type: 'hardcoded-value',
        file: 'Button.tsx',
        line: 23,
        severity: 'warning',
        message: 'Hardcoded color #3182ce',
      },
      blameRange: { start: 20, end: 25 },
    });

    expect(result.success).toBe(true);
  });
});

describe('AcceptanceAgent', () => {
  it('should predict acceptance likelihood', async () => {
    const agent = new AcceptanceAgent('test-key');

    const result = await agent.predict({
      repo: { owner: 'test', name: 'repo' },
      recentPRs: [
        { number: 1, merged: true, daysOpen: 2, reviewComments: 3 },
        { number: 2, merged: false, daysOpen: 10, reviewComments: 0 },
      ],
      maintainerActivity: {
        commitsLastMonth: 20,
        prsReviewedLastMonth: 5,
        avgReviewTimeHours: 24,
      },
    });

    expect(result.success).toBe(true);
  });
});

describe('FixabilityAgent', () => {
  it('should assess signal fixability', async () => {
    const agent = new FixabilityAgent('test-key');

    const result = await agent.assess({
      signal: {
        type: 'hardcoded-value',
        file: 'Button.tsx',
        line: 23,
        severity: 'warning',
        message: 'Hardcoded color #3182ce',
      },
      fileContent: 'const color = "#3182ce";',
    });

    expect(result.success).toBe(true);
  });

  it('should batch assess multiple signals', async () => {
    const agent = new FixabilityAgent('test-key');

    const inputs = [
      {
        signal: { type: 'hardcoded-value' as const, file: 'a.tsx', severity: 'warning' as const, message: 'test' },
        fileContent: 'const a = 1;',
      },
      {
        signal: { type: 'hardcoded-value' as const, file: 'b.tsx', severity: 'warning' as const, message: 'test' },
        fileContent: 'const b = 2;',
      },
    ];

    const results = await agent.assessBatch(inputs);

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);
  });
});
