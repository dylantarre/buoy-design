// packages/scanners/src/base/scanner.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { vol } from 'memfs';
import {
  Scanner,
  ScannerConfig,
  ScanResult,
  ScanWarning,
  DEFAULT_EXCLUDES,
  MONOREPO_PATTERNS,
  SCOPED_PACKAGE_PATTERNS,
  parallelProcess,
  extractResults,
  validateFilePaths,
  FileValidationResult,
  adaptiveConcurrency,
} from './scanner.js';

// Concrete implementation for testing
class TestScanner extends Scanner<string> {
  async scan(): Promise<ScanResult<string>> {
    return this.runScan(
      async (file) => [file], // Just return the file path as the "scanned" item
      ['**/*.ts']
    );
  }

  getSourceType(): string {
    return 'test';
  }
}

describe('Base Scanner', () => {
  beforeEach(() => {
    vol.reset();
  });

  describe('file discovery', () => {
    it('finds files matching glob patterns', async () => {
      vol.fromJSON({
        '/project/src/index.ts': 'export {}',
        '/project/src/utils.ts': 'export {}',
        '/project/src/components/Button.ts': 'export {}',
      });

      const scanner = new TestScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(3);
      expect(result.stats.filesScanned).toBe(3);
    });

    it('excludes files matching exclude patterns', async () => {
      vol.fromJSON({
        '/project/src/index.ts': 'export {}',
        '/project/src/index.test.ts': 'export {}',
        '/project/src/index.spec.ts': 'export {}',
      });

      const scanner = new TestScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
        exclude: ['**/*.test.ts', '**/*.spec.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toContain('index.ts');
    });

    it('deduplicates files matched by multiple patterns', async () => {
      vol.fromJSON({
        '/project/src/Button.ts': 'export {}',
      });

      const scanner = new TestScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts', 'src/Button.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
    });
  });

  describe('DEFAULT_EXCLUDES', () => {
    it('includes node_modules', () => {
      expect(DEFAULT_EXCLUDES).toContain('**/node_modules/**');
    });

    it('includes test files', () => {
      expect(DEFAULT_EXCLUDES).toContain('**/*.test.*');
      expect(DEFAULT_EXCLUDES).toContain('**/*.spec.*');
    });

    it('includes story files', () => {
      expect(DEFAULT_EXCLUDES).toContain('**/*.stories.*');
    });

    it('includes build directories', () => {
      expect(DEFAULT_EXCLUDES).toContain('**/dist/**');
      expect(DEFAULT_EXCLUDES).toContain('**/build/**');
    });
  });

  describe('MONOREPO_PATTERNS', () => {
    it('exports monorepo-aware default patterns', () => {
      expect(MONOREPO_PATTERNS).toBeDefined();
      expect(MONOREPO_PATTERNS).toContain('packages/*/src/**');
      expect(MONOREPO_PATTERNS).toContain('packages/*/*/src/**');
      expect(MONOREPO_PATTERNS).toContain('apps/*/src/**');
    });

    it('includes sandbox directory patterns', () => {
      expect(MONOREPO_PATTERNS).toContain('sandbox/*/src/**');
    });
  });

  describe('validateFilePaths', () => {
    it('returns valid results for existing files', async () => {
      vol.fromJSON({
        '/project/tokens.json': '{}',
        '/project/colors.json': '{}',
      });

      const result = await validateFilePaths(
        ['/project/tokens.json', '/project/colors.json'],
        '/project'
      );

      expect(result.valid).toHaveLength(2);
      expect(result.missing).toHaveLength(0);
    });

    it('identifies missing files', async () => {
      vol.fromJSON({
        '/project/tokens.json': '{}',
      });

      const result = await validateFilePaths(
        ['/project/tokens.json', '/project/missing.json'],
        '/project'
      );

      expect(result.valid).toHaveLength(1);
      expect(result.missing).toHaveLength(1);
      expect(result.missing[0]).toContain('missing.json');
    });

    it('handles empty file list', async () => {
      const result = await validateFilePaths([], '/project');

      expect(result.valid).toHaveLength(0);
      expect(result.missing).toHaveLength(0);
    });

    it('expands glob patterns and validates', async () => {
      vol.fromJSON({
        '/project/tokens/colors.json': '{}',
        '/project/tokens/spacing.json': '{}',
      });

      const result = await validateFilePaths(
        ['tokens/*.json'],
        '/project'
      );

      expect(result.valid).toHaveLength(2);
      expect(result.missing).toHaveLength(0);
    });

    it('reports glob patterns with no matches', async () => {
      vol.fromJSON({
        '/project/src/index.ts': 'export {}',
      });

      const result = await validateFilePaths(
        ['tokens/*.json'], // No tokens directory exists
        '/project'
      );

      expect(result.valid).toHaveLength(0);
      expect(result.missing).toHaveLength(1);
      expect(result.missing[0]).toBe('tokens/*.json');
    });
  });

  describe('parallel processing', () => {
    it('processes items in parallel batches', async () => {
      const items = [1, 2, 3, 4, 5];
      const processed: number[] = [];

      const results = await parallelProcess(
        items,
        async (item) => {
          processed.push(item);
          return item * 2;
        },
        2 // Concurrency of 2
      );

      expect(extractResults(results).successes).toEqual([2, 4, 6, 8, 10]);
    });

    it('handles errors gracefully without stopping other items', async () => {
      const items = [1, 2, 3];

      const results = await parallelProcess(items, async (item) => {
        if (item === 2) throw new Error('Test error');
        return item;
      });

      const { successes, failures } = extractResults(results);
      expect(successes).toEqual([1, 3]);
      expect(failures).toHaveLength(1);
    });

    it('respects concurrency limit', async () => {
      const concurrentCount: number[] = [];
      let currentConcurrent = 0;

      await parallelProcess(
        [1, 2, 3, 4, 5, 6],
        async (item) => {
          currentConcurrent++;
          concurrentCount.push(currentConcurrent);
          await new Promise((resolve) => setTimeout(resolve, 10));
          currentConcurrent--;
          return item;
        },
        2
      );

      // Max concurrent should never exceed 2
      expect(Math.max(...concurrentCount)).toBeLessThanOrEqual(2);
    });
  });

  describe('error handling', () => {
    it('captures parse errors with file context', async () => {
      vol.fromJSON({
        '/project/src/good.ts': 'export {}',
        '/project/src/bad.ts': 'export {}',
      });

      // Create a scanner that fails on specific files
      class FailingScanner extends Scanner<string> {
        async scan(): Promise<ScanResult<string>> {
          return this.runScan(
            async (file) => {
              if (file.includes('bad.ts')) {
                throw new Error('Parse failed');
              }
              return [file];
            },
            ['src/**/*.ts']
          );
        }

        getSourceType(): string {
          return 'test';
        }
      }

      const scanner = new FailingScanner({
        projectRoot: '/project',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.file).toContain('bad.ts');
      expect(result.errors[0]!.code).toBe('PARSE_ERROR');
    });

    it('continues processing after errors', async () => {
      vol.fromJSON({
        '/project/src/a.ts': 'export {}',
        '/project/src/b.ts': 'export {}',
        '/project/src/c.ts': 'export {}',
      });

      class PartialFailScanner extends Scanner<string> {
        async scan(): Promise<ScanResult<string>> {
          return this.runScan(
            async (file) => {
              if (file.includes('b.ts')) {
                throw new Error('Fail on b');
              }
              return [file];
            },
            ['src/**/*.ts']
          );
        }

        getSourceType(): string {
          return 'test';
        }
      }

      const scanner = new PartialFailScanner({
        projectRoot: '/project',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(2);
      expect(result.errors).toHaveLength(1);
      expect(result.stats.filesScanned).toBe(3);
    });
  });

  describe('scan statistics', () => {
    it('reports accurate file count', async () => {
      vol.fromJSON({
        '/project/src/a.ts': 'export {}',
        '/project/src/b.ts': 'export {}',
        '/project/src/c.ts': 'export {}',
      });

      const scanner = new TestScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.stats.filesScanned).toBe(3);
      expect(result.stats.itemsFound).toBe(3);
    });

    it('tracks scan duration', async () => {
      vol.fromJSON({
        '/project/src/index.ts': 'export {}',
      });

      const scanner = new TestScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.stats.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('configurable concurrency', () => {
    it('uses default concurrency of 10', async () => {
      vol.fromJSON({
        '/project/src/index.ts': 'export {}',
      });

      const scanner = new TestScanner({
        projectRoot: '/project',
      });

      // Access protected property for testing
      expect((scanner as any).concurrency).toBe(10);
    });

    it('respects custom concurrency setting', async () => {
      vol.fromJSON({
        '/project/src/index.ts': 'export {}',
      });

      const scanner = new TestScanner({
        projectRoot: '/project',
        concurrency: 5,
      });

      expect((scanner as any).concurrency).toBe(5);
    });
  });

  describe('monorepo file discovery', () => {
    it('discovers files in packages/*/src structure', async () => {
      vol.fromJSON({
        '/project/packages/core/src/index.ts': 'export {}',
        '/project/packages/ui/src/Button.ts': 'export {}',
        '/project/packages/utils/src/helpers.ts': 'export {}',
      });

      const scanner = new TestScanner({
        projectRoot: '/project',
        include: ['packages/*/src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(3);
    });

    it('discovers files in packages/*/*/src structure (nested)', async () => {
      vol.fromJSON({
        '/project/packages/react/components/src/Button.ts': 'export {}',
        '/project/packages/vue/components/src/Button.ts': 'export {}',
      });

      const scanner = new TestScanner({
        projectRoot: '/project',
        include: ['packages/*/*/src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(2);
    });

    it('discovers files in apps directory', async () => {
      vol.fromJSON({
        '/project/apps/web/src/index.ts': 'export {}',
        '/project/apps/docs/src/index.ts': 'export {}',
      });

      const scanner = new TestScanner({
        projectRoot: '/project',
        include: ['apps/*/src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(2);
    });

    it('excludes sandbox files by default even with explicit include pattern', async () => {
      vol.fromJSON({
        '/project/sandbox/storybook/src/stories.ts': 'export {}',
        '/project/sandbox/playground/src/demo.ts': 'export {}',
      });

      const scanner = new TestScanner({
        projectRoot: '/project',
        include: ['sandbox/*/src/**/*.ts'],
      });

      const result = await scanner.scan();

      // Sandbox files are excluded by DEFAULT_EXCLUDES
      expect(result.items).toHaveLength(0);
    });

    it('can include sandbox files by overriding exclude patterns', async () => {
      vol.fromJSON({
        '/project/sandbox/storybook/src/stories.ts': 'export {}',
        '/project/sandbox/playground/src/demo.ts': 'export {}',
      });

      const scanner = new TestScanner({
        projectRoot: '/project',
        include: ['sandbox/*/src/**/*.ts'],
        // Explicitly override excludes to allow sandbox
        exclude: ['**/node_modules/**'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(2);
    });

    it('excludes nested node_modules in monorepo packages', async () => {
      vol.fromJSON({
        '/project/packages/core/src/index.ts': 'export {}',
        '/project/packages/core/node_modules/dep/index.ts': 'export {}',
      });

      const scanner = new TestScanner({
        projectRoot: '/project',
        include: ['packages/*/src/**/*.ts'],
        exclude: ['**/node_modules/**'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toContain('core/src/index.ts');
    });
  });

  describe('scan warnings', () => {
    it('includes warnings in scan result', async () => {
      vol.fromJSON({
        '/project/src/index.ts': 'export {}',
      });

      const scanner = new TestScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      // ScanResult should have a warnings property
      expect(result.warnings).toBeDefined();
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('warns when no files match include patterns', async () => {
      vol.fromJSON({
        '/project/src/index.ts': 'export {}',
      });

      const scanner = new TestScanner({
        projectRoot: '/project',
        include: ['nonexistent/**/*.ts'],
      });

      const result = await scanner.scan();

      // Should have both a pattern-specific warning and a summary warning
      expect(result.warnings.length).toBeGreaterThanOrEqual(1);
      const noFilesWarning = result.warnings.find((w) => w.code === 'NO_FILES_MATCHED');
      expect(noFilesWarning).toBeDefined();
      expect(noFilesWarning!.message).toContain('nonexistent');
    });

    it('warns about unreadable files', async () => {
      vol.fromJSON({
        '/project/src/good.ts': 'export {}',
        '/project/src/bad.ts': 'export {}',
      });

      // Create a scanner that tracks file read failures
      class ReadWarningScanner extends Scanner<string> {
        async scan(): Promise<ScanResult<string>> {
          return this.runScan(
            async (file) => {
              if (file.includes('bad.ts')) {
                throw new Error('Permission denied');
              }
              return [file];
            },
            ['src/**/*.ts']
          );
        }

        getSourceType(): string {
          return 'test';
        }
      }

      const scanner = new ReadWarningScanner({
        projectRoot: '/project',
      });

      const result = await scanner.scan();

      // Both errors and warnings should be populated
      expect(result.errors).toHaveLength(1);
      expect(result.warnings).toBeDefined();
    });
  });

  describe('SCOPED_PACKAGE_PATTERNS', () => {
    it('exports scoped package patterns for @org/package structures', () => {
      expect(SCOPED_PACKAGE_PATTERNS).toBeDefined();
      expect(SCOPED_PACKAGE_PATTERNS).toContain('@*/*/src/**');
    });

    it('includes nested scoped package patterns', () => {
      expect(SCOPED_PACKAGE_PATTERNS).toContain('packages/@*/*/src/**');
    });
  });

  describe('additional monorepo patterns', () => {
    it('includes examples directory pattern', () => {
      expect(MONOREPO_PATTERNS).toContain('examples/*/src/**');
    });

    it('includes tooling directory pattern', () => {
      expect(MONOREPO_PATTERNS).toContain('tools/*/src/**');
    });

    it('includes website/docs directory patterns', () => {
      expect(MONOREPO_PATTERNS).toContain('website/src/**');
      expect(MONOREPO_PATTERNS).toContain('docs/src/**');
    });
  });

  describe('scoped package file discovery', () => {
    it('discovers files in @scope/package/src structure', async () => {
      vol.fromJSON({
        '/project/@chakra-ui/react/src/index.ts': 'export {}',
        '/project/@chakra-ui/icons/src/index.ts': 'export {}',
      });

      const scanner = new TestScanner({
        projectRoot: '/project',
        include: ['@*/*/src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(2);
    });

    it('discovers files in packages/@scope/package/src structure', async () => {
      vol.fromJSON({
        '/project/packages/@myorg/core/src/index.ts': 'export {}',
        '/project/packages/@myorg/ui/src/Button.ts': 'export {}',
      });

      const scanner = new TestScanner({
        projectRoot: '/project',
        include: ['packages/@*/*/src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(2);
    });
  });

  describe('adaptive concurrency', () => {
    it('returns lower concurrency for small file counts', () => {
      expect(adaptiveConcurrency(5)).toBeLessThanOrEqual(5);
    });

    it('returns default concurrency for medium file counts', () => {
      expect(adaptiveConcurrency(50)).toBe(10);
    });

    it('returns higher concurrency for large file counts', () => {
      expect(adaptiveConcurrency(500)).toBeGreaterThan(10);
    });

    it('caps concurrency at a reasonable maximum', () => {
      expect(adaptiveConcurrency(10000)).toBeLessThanOrEqual(50);
    });
  });

  describe('DEFAULT_EXCLUDES extensions', () => {
    it('includes .turbo cache directory', () => {
      expect(DEFAULT_EXCLUDES).toContain('**/.turbo/**');
    });

    it('includes .cache directories', () => {
      expect(DEFAULT_EXCLUDES).toContain('**/.cache/**');
    });

    it('includes output directories', () => {
      expect(DEFAULT_EXCLUDES).toContain('**/out/**');
    });

    it('includes .git directory', () => {
      expect(DEFAULT_EXCLUDES).toContain('**/.git/**');
    });

    // New exclusions for example/sandbox code - commonly causes over-detection
    it('includes sandbox directories', () => {
      expect(DEFAULT_EXCLUDES).toContain('**/sandbox/**');
    });

    it('includes __stories__ directories', () => {
      expect(DEFAULT_EXCLUDES).toContain('**/__stories__/**');
    });

    it('includes examples directories', () => {
      expect(DEFAULT_EXCLUDES).toContain('**/examples/**');
    });

    it('includes fixtures directories', () => {
      expect(DEFAULT_EXCLUDES).toContain('**/fixtures/**');
    });

    it('includes __fixtures__ directories', () => {
      expect(DEFAULT_EXCLUDES).toContain('**/__fixtures__/**');
    });

    it('includes __tests__ directories', () => {
      expect(DEFAULT_EXCLUDES).toContain('**/__tests__/**');
    });

    it('includes __mocks__ directories', () => {
      expect(DEFAULT_EXCLUDES).toContain('**/__mocks__/**');
    });

    it('includes e2e directories', () => {
      expect(DEFAULT_EXCLUDES).toContain('**/e2e/**');
    });

    it('includes cypress directories', () => {
      expect(DEFAULT_EXCLUDES).toContain('**/cypress/**');
    });

    it('includes playwright directories', () => {
      expect(DEFAULT_EXCLUDES).toContain('**/playwright/**');
    });

    it('includes .storybook directories', () => {
      expect(DEFAULT_EXCLUDES).toContain('**/.storybook/**');
    });
  });

  describe('sandbox/example file exclusion in file discovery', () => {
    it('excludes sandbox directory files by default', async () => {
      vol.fromJSON({
        '/project/src/Button.ts': 'export {}',
        '/project/sandbox/app/Button.ts': 'export {}',
        '/project/sandbox/demo/index.ts': 'export {}',
      });

      const scanner = new TestScanner({
        projectRoot: '/project',
        include: ['**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toContain('src/Button.ts');
    });

    it('excludes __stories__ directory files by default', async () => {
      vol.fromJSON({
        '/project/src/Button.ts': 'export {}',
        '/project/src/__stories__/Button.stories.ts': 'export {}',
      });

      const scanner = new TestScanner({
        projectRoot: '/project',
        include: ['**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toContain('src/Button.ts');
    });

    it('excludes examples directory files by default', async () => {
      vol.fromJSON({
        '/project/src/Button.ts': 'export {}',
        '/project/examples/basic/Button.ts': 'export {}',
        '/project/apps/docs/examples/usage.ts': 'export {}',
      });

      const scanner = new TestScanner({
        projectRoot: '/project',
        include: ['**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toContain('src/Button.ts');
    });

    it('excludes __tests__ directory files by default', async () => {
      vol.fromJSON({
        '/project/src/Button.ts': 'export {}',
        '/project/src/__tests__/Button.test.ts': 'export {}',
      });

      const scanner = new TestScanner({
        projectRoot: '/project',
        include: ['**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toContain('src/Button.ts');
    });

    it('excludes e2e directory files by default', async () => {
      vol.fromJSON({
        '/project/src/Button.ts': 'export {}',
        '/project/e2e/tests/button.e2e.ts': 'export {}',
      });

      const scanner = new TestScanner({
        projectRoot: '/project',
        include: ['**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toContain('src/Button.ts');
    });

    it('excludes .storybook config directory files by default', async () => {
      vol.fromJSON({
        '/project/src/Button.ts': 'export {}',
        '/project/.storybook/main.ts': 'export {}',
        '/project/.storybook/preview.ts': 'export {}',
      });

      const scanner = new TestScanner({
        projectRoot: '/project',
        include: ['**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toContain('src/Button.ts');
    });
  });

  describe('large file count warning', () => {
    it('warns when file count exceeds threshold', async () => {
      // Create a large number of files (1001+)
      const files: Record<string, string> = {};
      for (let i = 0; i < 1001; i++) {
        files[`/project/src/file${i}.ts`] = 'export {}';
      }
      vol.fromJSON(files);

      const scanner = new TestScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      // Should have a warning about large file count
      expect(result.warnings).toBeDefined();
      const largeFileWarning = result.warnings!.find((w) => w.code === 'LARGE_FILE_COUNT');
      expect(largeFileWarning).toBeDefined();
      expect(largeFileWarning!.message).toContain('1001');
    });

    it('does not warn when file count is below threshold', async () => {
      // Create a moderate number of files
      const files: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        files[`/project/src/file${i}.ts`] = 'export {}';
      }
      vol.fromJSON(files);

      const scanner = new TestScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      // Should not have a warning about large file count
      const largeFileWarning = result.warnings?.find((w) => w.code === 'LARGE_FILE_COUNT');
      expect(largeFileWarning).toBeUndefined();
    });

    it('allows custom file count threshold via config', async () => {
      // Create 51 files to exceed a custom threshold of 50
      const files: Record<string, string> = {};
      for (let i = 0; i < 51; i++) {
        files[`/project/src/file${i}.ts`] = 'export {}';
      }
      vol.fromJSON(files);

      const scanner = new TestScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
        largeFileCountThreshold: 50,
      } as any);

      const result = await scanner.scan();

      // Should have a warning about large file count
      const largeFileWarning = result.warnings?.find((w) => w.code === 'LARGE_FILE_COUNT');
      expect(largeFileWarning).toBeDefined();
    });
  });

  describe('progress callback', () => {
    it('calls progress callback during scan', async () => {
      vol.fromJSON({
        '/project/src/a.ts': 'export {}',
        '/project/src/b.ts': 'export {}',
        '/project/src/c.ts': 'export {}',
      });

      const progressUpdates: Array<{ completed: number; total: number }> = [];

      class ProgressScanner extends Scanner<string> {
        async scan(): Promise<ScanResult<string>> {
          return this.runScan(
            async (file) => [file],
            ['src/**/*.ts'],
            {
              onProgress: (completed, total) => {
                progressUpdates.push({ completed, total });
              },
            }
          );
        }

        getSourceType(): string {
          return 'test';
        }
      }

      const scanner = new ProgressScanner({
        projectRoot: '/project',
      });

      await scanner.scan();

      // Should have received progress updates
      expect(progressUpdates.length).toBeGreaterThan(0);
      // Last update should show all files completed
      const lastUpdate = progressUpdates[progressUpdates.length - 1];
      expect(lastUpdate!.completed).toBe(3);
      expect(lastUpdate!.total).toBe(3);
    });
  });

  describe('parallelProcess with progress', () => {
    it('calls onProgress callback with completed count', async () => {
      const items = [1, 2, 3, 4, 5];
      const progressCalls: Array<{ completed: number; total: number }> = [];

      await parallelProcess(
        items,
        async (item) => item * 2,
        2,
        {
          onProgress: (completed, total) => {
            progressCalls.push({ completed, total });
          },
        }
      );

      // Should have received progress updates
      expect(progressCalls.length).toBeGreaterThan(0);
      // Final call should show all complete
      const lastCall = progressCalls[progressCalls.length - 1];
      expect(lastCall!.completed).toBe(5);
      expect(lastCall!.total).toBe(5);
    });
  });

  describe('file timeout handling', () => {
    it('skips files that exceed timeout', async () => {
      vol.fromJSON({
        '/project/src/fast.ts': 'export {}',
        '/project/src/slow.ts': 'export {}',
      });

      class TimeoutScanner extends Scanner<string> {
        async scan(): Promise<ScanResult<string>> {
          return this.runScan(
            async (file) => {
              if (file.includes('slow.ts')) {
                // Simulate a slow file
                await new Promise((resolve) => setTimeout(resolve, 500));
              }
              return [file];
            },
            ['src/**/*.ts'],
            { fileTimeout: 100 }
          );
        }

        getSourceType(): string {
          return 'test';
        }
      }

      const scanner = new TimeoutScanner({
        projectRoot: '/project',
      });

      const result = await scanner.scan();

      // Fast file should be processed
      expect(result.items.length).toBe(1);
      expect(result.items[0]).toContain('fast.ts');

      // Slow file should have an error
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]!.code).toBe('TIMEOUT');
      expect(result.errors[0]!.file).toContain('slow.ts');
    });
  });

  describe('retry with backoff', () => {
    it('retries transient failures', async () => {
      vol.fromJSON({
        '/project/src/flaky.ts': 'export {}',
      });

      let attempts = 0;

      class RetryScanner extends Scanner<string> {
        async scan(): Promise<ScanResult<string>> {
          return this.runScan(
            async (file) => {
              attempts++;
              // Fail first 2 attempts, succeed on 3rd
              if (attempts < 3) {
                const error = new Error('Transient failure');
                (error as any).code = 'EBUSY';
                throw error;
              }
              return [file];
            },
            ['src/**/*.ts'],
            { retries: 3, retryDelayMs: 10 }
          );
        }

        getSourceType(): string {
          return 'test';
        }
      }

      const scanner = new RetryScanner({
        projectRoot: '/project',
      });

      const result = await scanner.scan();

      // Should eventually succeed after retries
      expect(result.items.length).toBe(1);
      expect(result.errors.length).toBe(0);
      expect(attempts).toBe(3);
    });

    it('gives up after max retries', async () => {
      vol.fromJSON({
        '/project/src/failing.ts': 'export {}',
      });

      let attempts = 0;

      class AlwaysFailScanner extends Scanner<string> {
        async scan(): Promise<ScanResult<string>> {
          return this.runScan(
            async () => {
              attempts++;
              const error = new Error('Permanent failure');
              (error as any).code = 'EBUSY';
              throw error;
            },
            ['src/**/*.ts'],
            { retries: 2, retryDelayMs: 10 }
          );
        }

        getSourceType(): string {
          return 'test';
        }
      }

      const scanner = new AlwaysFailScanner({
        projectRoot: '/project',
      });

      const result = await scanner.scan();

      // Should fail after max retries
      expect(result.items.length).toBe(0);
      expect(result.errors.length).toBe(1);
      expect(attempts).toBe(3); // Initial + 2 retries
    });
  });

  describe('batch size configuration', () => {
    it('processes files in configurable batch sizes', async () => {
      const files: Record<string, string> = {};
      for (let i = 0; i < 10; i++) {
        files[`/project/src/file${i}.ts`] = 'export {}';
      }
      vol.fromJSON(files);

      const batchStarts: number[] = [];
      let currentBatch = 0;

      class BatchTrackingScanner extends Scanner<string> {
        async scan(): Promise<ScanResult<string>> {
          return this.runScan(
            async (file) => {
              if (!batchStarts.includes(currentBatch)) {
                batchStarts.push(currentBatch);
              }
              return [file];
            },
            ['src/**/*.ts']
          );
        }

        getSourceType(): string {
          return 'test';
        }
      }

      const scanner = new BatchTrackingScanner({
        projectRoot: '/project',
        concurrency: 3, // Process 3 at a time
      });

      const result = await scanner.scan();
      expect(result.items.length).toBe(10);
    });
  });
});
