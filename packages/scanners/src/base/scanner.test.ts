// packages/scanners/src/base/scanner.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { vol } from 'memfs';
import {
  Scanner,
  ScannerConfig,
  ScanResult,
  DEFAULT_EXCLUDES,
  MONOREPO_PATTERNS,
  parallelProcess,
  extractResults,
  validateFilePaths,
  FileValidationResult,
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

    it('discovers files in sandbox directory', async () => {
      vol.fromJSON({
        '/project/sandbox/storybook/src/stories.ts': 'export {}',
        '/project/sandbox/playground/src/demo.ts': 'export {}',
      });

      const scanner = new TestScanner({
        projectRoot: '/project',
        include: ['sandbox/*/src/**/*.ts'],
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
});
