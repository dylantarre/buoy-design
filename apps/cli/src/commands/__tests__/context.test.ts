import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createContextCommand } from '../context.js';

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
  info: vi.fn(),
  setJsonMode: vi.fn(),
}));

vi.mock('../../scan/orchestrator.js', () => ({
  ScanOrchestrator: vi.fn().mockImplementation(() => ({
    scan: vi.fn().mockResolvedValue({
      components: [
        {
          id: 'component:Button',
          name: 'Button',
          source: { type: 'react', path: 'src/Button.tsx' },
          props: [],
          variants: [],
          tokens: [],
          metadata: {},
        },
      ],
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

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('{"name": "test-project"}'),
  writeFile: vi.fn().mockResolvedValue(undefined),
  appendFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
}));

describe('context command', () => {
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
      const cmd = createContextCommand();
      expect(cmd.name()).toBe('context');
      expect(cmd.description()).toContain('CLAUDE.md');
      
      const options = cmd.options.map((o) => o.long);
      expect(options).toContain('--output');
      expect(options).toContain('--append');
      expect(options).toContain('--detail');
      expect(options).toContain('--json');
    });
  });

  describe('default execution', () => {
    it('outputs context to stdout by default', async () => {
      const cmd = createContextCommand();
      await cmd.parseAsync(['node', 'test']);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('Design System Rules');
    });
  });

  describe('detail levels', () => {
    it('defaults to standard detail level', () => {
      const cmd = createContextCommand();
      const detailOpt = cmd.options.find((o) => o.long === '--detail');
      expect(detailOpt?.defaultValue).toBe('standard');
    });
  });
});
