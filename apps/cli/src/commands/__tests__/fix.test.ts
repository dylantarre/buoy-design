import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFixCommand } from '../fix.js';

// Mock dependencies
vi.mock('../../config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    config: {
      sources: {
        react: { include: ['src/**/*.tsx'] },
      },
    },
  }),
  getConfigPath: vi.fn().mockReturnValue('.buoy.yaml'),
}));

vi.mock('../../config/auto-detect.js', () => ({
  buildAutoConfig: vi.fn().mockResolvedValue({
    config: {
      sources: {
        react: { include: ['src/**/*.tsx'] },
      },
    },
    detected: [],
    tokenFiles: [],
  }),
}));

vi.mock('../../output/reporters.js', () => ({
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    text: '',
  })),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  setJsonMode: vi.fn(),
}));

vi.mock('../../scan/orchestrator.js', () => ({
  ScanOrchestrator: vi.fn().mockImplementation(() => ({
    scan: vi.fn().mockResolvedValue({
      components: [],
      tokens: [
        {
          id: 'token:--color-primary',
          name: '--color-primary',
          category: 'color',
          value: { type: 'color', hex: '#3b82f6' },
          source: { type: 'css', file: 'tokens.css', line: 1 },
          metadata: {},
        },
      ],
      errors: [],
    }),
  })),
}));

vi.mock('@buoy-design/core/analysis', () => ({
  SemanticDiffEngine: vi.fn().mockImplementation(() => ({
    analyzeComponents: vi.fn().mockReturnValue({
      drifts: [],
    }),
  })),
}));

vi.mock('../../fix/index.js', () => ({
  applyFixes: vi.fn().mockResolvedValue({
    results: [],
    applied: 0,
    skipped: 0,
    failed: 0,
  }),
  runSafetyChecks: vi.fn().mockReturnValue({
    safe: true,
    warnings: [],
    errors: [],
  }),
  validateFixTargets: vi.fn().mockImplementation((fixes) => ({
    valid: fixes,
    invalid: [],
  })),
}));

vi.mock('../../output/fix-formatters.js', () => ({
  formatFixPreview: vi.fn().mockReturnValue('Preview output'),
  formatFixDiff: vi.fn().mockReturnValue('Diff output'),
  formatFixResult: vi.fn().mockReturnValue('Result output'),
  formatSafetyCheck: vi.fn().mockReturnValue('Safety output'),
  formatFixesJson: vi.fn().mockReturnValue('{}'),
}));

vi.mock('@buoy-design/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@buoy-design/core')>();
  return {
    ...actual,
    generateFixes: vi.fn().mockReturnValue([]),
  };
});

describe('fix command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('command structure', () => {
    it('creates command with correct name and options', () => {
      const cmd = createFixCommand();
      expect(cmd.name()).toBe('fix');
      expect(cmd.description()).toContain('fix');
      
      const options = cmd.options.map((o) => o.long);
      expect(options).toContain('--apply');
      expect(options).toContain('--dry-run');
      expect(options).toContain('--confidence');
      expect(options).toContain('--json');
    });
  });

  describe('default mode (preview)', () => {
    it('runs scan and drift analysis', async () => {
      const { ScanOrchestrator } = await import('../../scan/orchestrator.js');
      const { warning } = await import('../../output/reporters.js');

      const cmd = createFixCommand();
      await cmd.parseAsync(['node', 'test']);

      expect(ScanOrchestrator).toHaveBeenCalled();
      // With no components found, should show warning guiding user to alternatives
      expect(warning).toHaveBeenCalledWith(expect.stringContaining('No components'));
    });
  });

  describe('confidence level parsing', () => {
    it('defaults to high confidence', () => {
      const cmd = createFixCommand();
      const confidenceOpt = cmd.options.find((o) => o.long === '--confidence');
      expect(confidenceOpt?.defaultValue).toBe('high');
    });
  });
});
