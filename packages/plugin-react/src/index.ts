// packages/plugin-react/src/index.ts
import type { BuoyPlugin, ScanContext, ScanResult } from '@buoy/core';
import { ReactComponentScanner } from '@buoy/scanners/git';

const plugin: BuoyPlugin = {
  metadata: {
    name: '@buoy/plugin-react',
    version: '0.0.1',
    description: 'React and Next.js component scanner',
    detects: ['react', 'next', 'remix', 'gatsby'],
  },

  async scan(context: ScanContext): Promise<ScanResult> {
    const scanner = new ReactComponentScanner({
      projectRoot: context.projectRoot,
      include: context.include || ['src/**/*.tsx', 'src/**/*.jsx', 'app/**/*.tsx', 'components/**/*.tsx'],
      exclude: context.exclude || ['**/node_modules/**', '**/*.test.*', '**/*.spec.*'],
      options: context.config,
    });

    const result = await scanner.scan();

    return {
      components: result.items,
      tokens: [],
      errors: result.errors,
      stats: result.stats,
    };
  },
};

export default () => plugin;
export { plugin };
