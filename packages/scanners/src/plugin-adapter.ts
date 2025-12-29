import type { BuoyPlugin, ScanContext, ScanResult, Component } from '@buoy/core';
import type { Scanner, ScannerConfig } from './base/scanner.js';

type ScannerClass<T extends Scanner<Component>> = new (config: ScannerConfig) => T;

export function createPluginFromScanner<T extends Scanner<Component>>(
  metadata: {
    name: string;
    version: string;
    description?: string;
    detects?: string[];
  },
  ScannerClass: ScannerClass<T>
): () => BuoyPlugin {
  return () => ({
    metadata,
    async scan(context: ScanContext): Promise<ScanResult> {
      const scanner = new ScannerClass({
        projectRoot: context.projectRoot,
        include: context.include || ['**/*'],
        exclude: context.exclude || ['**/node_modules/**'],
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
  });
}
