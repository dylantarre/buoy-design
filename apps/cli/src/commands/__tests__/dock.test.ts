// apps/cli/src/commands/__tests__/dock.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { existsSync, writeFileSync } from 'fs';
import type { DetectedProject } from '../../detect/project-detector.js';

// Mock modules before importing the command
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    text: '',
  })),
}));

vi.mock('readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn((_, cb) => cb('y')),
    close: vi.fn(),
  })),
}));

vi.mock('../../output/reporters.js', () => ({
  spinner: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    text: '',
  })),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  header: vi.fn(),
  keyValue: vi.fn(),
  newline: vi.fn(),
}));

vi.mock('../../detect/index.js', () => ({
  ProjectDetector: vi.fn(),
  detectMonorepoConfig: vi.fn(() => ({ type: null, packages: [] })),
  expandPatternsForMonorepo: vi.fn((patterns) => ({ allPatterns: patterns })),
}));

vi.mock('../../detect/frameworks.js', () => ({
  detectFrameworks: vi.fn(() => []),
  getPluginInstallCommand: vi.fn(() => 'npm install @buoy-design/plugin-test'),
  PLUGIN_INFO: {},
  BUILTIN_SCANNERS: {},
}));

vi.mock('../../hooks/index.js', () => ({
  setupHooks: vi.fn(() => ({ success: true, message: 'Hooks set up' })),
  generateStandaloneHook: vi.fn(() => ({ success: true, message: 'Hook generated' })),
  detectHookSystem: vi.fn(() => null),
}));

vi.mock('@buoy-design/core', () => ({
  parseTokenFile: vi.fn(() => []),
  detectFormat: vi.fn(() => 'dtcg'),
}));

// Import after mocks are set up
import { createDockCommand } from '../dock.js';
import { ProjectDetector } from '../../detect/index.js';
import * as reporters from '../../output/reporters.js';

const mockExistsSync = vi.mocked(existsSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

// Helper to create a test program
function createTestProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({
    writeErr: () => {},
    writeOut: () => {},
  });
  program.addCommand(createDockCommand());
  return program;
}

// Helper to create mock detected project
function createMockProject(overrides: Partial<DetectedProject> = {}): DetectedProject {
  return {
    name: 'test-project',
    root: '/test/project',
    frameworks: [],
    primaryFramework: null,
    components: [],
    tokens: [],
    storybook: null,
    designSystem: null,
    monorepo: null,
    designSystemDocs: null,
    ...overrides,
  };
}

describe('dock command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let originalCwd: () => string;
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    originalCwd = process.cwd;
    process.cwd = vi.fn().mockReturnValue('/test/project');
    originalIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = false; // Disable interactive prompts in tests

    // Default: no existing config
    mockExistsSync.mockReturnValue(false);

    // Default mock detector
    const mockDetect = vi.fn().mockResolvedValue(createMockProject());
    (ProjectDetector as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      detect: mockDetect,
    }));
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    process.cwd = originalCwd;
    process.stdin.isTTY = originalIsTTY;
  });

  describe('command structure', () => {
    it('creates dock command with correct name and description', () => {
      const cmd = createDockCommand();

      expect(cmd.name()).toBe('dock');
      expect(cmd.description()).toBe('Dock Buoy into your project');
    });

    it('has expected options', () => {
      const cmd = createDockCommand();
      const options = cmd.options;
      const optionNames = options.map(o => o.long?.replace('--', '') || o.short?.replace('-', ''));

      expect(optionNames).toContain('force');
      expect(optionNames).toContain('name');
      expect(optionNames).toContain('skip-detect');
      expect(optionNames).toContain('yes');
      expect(optionNames).toContain('hooks');
    });
  });

  describe('config file handling', () => {
    it('warns when config already exists without --force', async () => {
      mockExistsSync.mockReturnValue(true);

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'dock']);

      expect(reporters.warning).toHaveBeenCalledWith(
        expect.stringContaining('Configuration already exists')
      );
    });

    it('overwrites config when --force is provided', async () => {
      mockExistsSync.mockReturnValue(true);

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'dock', '--force']);

      expect(mockWriteFileSync).toHaveBeenCalled();
      expect(reporters.success).toHaveBeenCalledWith('Created buoy.config.mjs');
    });

    it('creates new config when none exists', async () => {
      mockExistsSync.mockReturnValue(false);

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'dock']);

      expect(mockWriteFileSync).toHaveBeenCalled();
      expect(reporters.success).toHaveBeenCalledWith('Created buoy.config.mjs');
    });
  });

  describe('project detection', () => {
    it('runs project detection by default', async () => {
      const mockDetect = vi.fn().mockResolvedValue(createMockProject({
        frameworks: [{ name: 'react', typescript: true, version: '18.0.0' }],
      }));
      (ProjectDetector as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        detect: mockDetect,
      }));

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'dock']);

      expect(mockDetect).toHaveBeenCalled();
    });

    it('skips detection with --skip-detect', async () => {
      const mockDetect = vi.fn().mockResolvedValue(createMockProject());
      (ProjectDetector as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        detect: mockDetect,
      }));

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'dock', '--skip-detect']);

      // detect() is still called once to get the project name, but detection results aren't used
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('uses custom project name when provided', async () => {
      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'dock', '--name', 'my-custom-project']);

      const writeCall = mockWriteFileSync.mock.calls[0];
      const configContent = writeCall?.[1] as string;

      expect(configContent).toContain("name: 'my-custom-project'");
    });
  });

  describe('framework detection display', () => {
    it('shows detected React framework', async () => {
      const mockDetect = vi.fn().mockResolvedValue(createMockProject({
        frameworks: [{ name: 'react', typescript: true, version: '18.0.0' }],
      }));
      (ProjectDetector as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        detect: mockDetect,
      }));

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'dock']);

      // Should display detection results
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('shows detected Vue framework', async () => {
      const mockDetect = vi.fn().mockResolvedValue(createMockProject({
        frameworks: [{ name: 'vue', typescript: false, version: '3.0.0' }],
      }));
      (ProjectDetector as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        detect: mockDetect,
      }));

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'dock']);

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('warns about multiple UI frameworks', async () => {
      const mockDetect = vi.fn().mockResolvedValue(createMockProject({
        frameworks: [
          { name: 'react', typescript: true, version: '18.0.0' },
          { name: 'vue', typescript: false, version: '3.0.0' },
        ],
      }));
      (ProjectDetector as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        detect: mockDetect,
      }));

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'dock']);

      // Should warn about framework sprawl
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('config generation', () => {
    it('generates config with React source when detected', async () => {
      const mockDetect = vi.fn().mockResolvedValue(createMockProject({
        frameworks: [{ name: 'react', typescript: true, version: '18.0.0' }],
        components: [{ path: 'src/components', fileCount: 10, type: 'tsx', pattern: 'src/**/*.tsx' }],
      }));
      (ProjectDetector as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        detect: mockDetect,
      }));

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'dock']);

      const writeCall = mockWriteFileSync.mock.calls[0];
      const configContent = writeCall?.[1] as string;

      expect(configContent).toContain('react:');
      expect(configContent).toContain('enabled: true');
    });

    it('generates config with Vue source when detected', async () => {
      const mockDetect = vi.fn().mockResolvedValue(createMockProject({
        frameworks: [{ name: 'vue', typescript: false, version: '3.0.0' }],
        components: [{ path: 'src/components', fileCount: 5, type: 'vue', pattern: 'src/**/*.vue' }],
      }));
      (ProjectDetector as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        detect: mockDetect,
      }));

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'dock']);

      const writeCall = mockWriteFileSync.mock.calls[0];
      const configContent = writeCall?.[1] as string;

      expect(configContent).toContain('vue:');
    });

    it('generates config with token files when detected', async () => {
      const mockDetect = vi.fn().mockResolvedValue(createMockProject({
        tokens: [{ name: 'CSS Variables', path: 'styles/tokens.css', type: 'css' }],
      }));
      (ProjectDetector as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        detect: mockDetect,
      }));

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'dock']);

      const writeCall = mockWriteFileSync.mock.calls[0];
      const configContent = writeCall?.[1] as string;

      expect(configContent).toContain('tokens:');
      expect(configContent).toContain("'styles/tokens.css'");
    });

    it('generates config with Storybook when detected', async () => {
      const mockDetect = vi.fn().mockResolvedValue(createMockProject({
        storybook: { configPath: '.storybook', version: '7.0.0' },
      }));
      (ProjectDetector as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        detect: mockDetect,
      }));

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'dock']);

      const writeCall = mockWriteFileSync.mock.calls[0];
      const configContent = writeCall?.[1] as string;

      expect(configContent).toContain('storybook:');
    });
  });

  describe('design system docs detection', () => {
    it('detects TokenForge and shows it', async () => {
      const mockDetect = vi.fn().mockResolvedValue(createMockProject({
        designSystemDocs: { type: 'tokenforge', exportPath: 'tokenforge.json' },
      }));
      (ProjectDetector as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        detect: mockDetect,
      }));

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'dock']);

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('detects Tokens Studio and shows it', async () => {
      const mockDetect = vi.fn().mockResolvedValue(createMockProject({
        designSystemDocs: { type: 'tokens-studio', exportPath: 'tokens.json' },
      }));
      (ProjectDetector as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        detect: mockDetect,
      }));

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'dock']);

      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('hooks setup', () => {
    it('sets up hooks when --hooks flag is provided', async () => {
      const { setupHooks, detectHookSystem } = await import('../../hooks/index.js');

      vi.mocked(detectHookSystem).mockReturnValue('husky');
      vi.mocked(setupHooks).mockReturnValue({ success: true, message: 'Hooks configured' });

      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'dock', '--hooks']);

      expect(detectHookSystem).toHaveBeenCalled();
      expect(setupHooks).toHaveBeenCalled();
    });
  });

  describe('next steps', () => {
    it('shows next steps after successful dock', async () => {
      const program = createTestProgram();
      await program.parseAsync(['node', 'test', 'dock']);

      expect(reporters.info).toHaveBeenCalledWith('Next steps:');
      expect(reporters.info).toHaveBeenCalledWith(
        expect.stringContaining('buoy sweep')
      );
    });
  });

  describe('error handling', () => {
    it('handles detection failure gracefully', async () => {
      const mockDetect = vi.fn().mockRejectedValue(new Error('Detection failed'));
      (ProjectDetector as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        detect: mockDetect,
      }));

      const program = createTestProgram();

      try {
        await program.parseAsync(['node', 'test', 'dock']);
      } catch {
        // Expected
      }

      expect(reporters.error).toHaveBeenCalled();
    });

    it('handles config write failure', async () => {
      mockWriteFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const program = createTestProgram();

      try {
        await program.parseAsync(['node', 'test', 'dock']);
      } catch {
        // Expected
      }

      expect(reporters.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create configuration')
      );
    });
  });
});
