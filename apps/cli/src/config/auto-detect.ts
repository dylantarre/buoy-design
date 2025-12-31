// apps/cli/src/config/auto-detect.ts
import { basename } from 'node:path';
import { glob } from 'glob';
import { detectFrameworks, type DetectedFramework } from '../detect/frameworks.js';
import type { BuoyConfig } from './schema.js';

/**
 * Build a config automatically from detected frameworks.
 * Used when no buoy.config.mjs exists - zero-config mode.
 */
export async function buildAutoConfig(projectRoot: string = process.cwd()): Promise<{
  config: BuoyConfig;
  detected: DetectedFramework[];
  tokenFiles: string[];
}> {
  // Detect frameworks
  const detected = await detectFrameworks(projectRoot);

  // Find token files
  const tokenFiles = await findTokenFiles(projectRoot);

  // Build config from detections
  const config: BuoyConfig = {
    project: {
      name: basename(projectRoot),
    },
    sources: {},
    drift: { ignore: [], severity: {} },
    claude: { enabled: false, model: 'claude-sonnet-4-20250514' },
    output: { format: 'table', colors: true },
  };

  // Map detected frameworks to source configs
  for (const framework of detected) {
    const scanner = framework.scanner;
    if (!scanner) continue;

    switch (scanner) {
      case 'react':
        config.sources.react = {
          enabled: true,
          include: ['src/**/*.tsx', 'src/**/*.jsx', 'app/**/*.tsx', 'app/**/*.jsx', 'components/**/*.tsx', 'components/**/*.jsx'],
          exclude: ['**/*.test.*', '**/*.spec.*', '**/*.stories.*', '**/node_modules/**'],
        };
        break;

      case 'vue':
        config.sources.vue = {
          enabled: true,
          include: ['src/**/*.vue', 'components/**/*.vue'],
          exclude: ['**/*.test.*', '**/*.spec.*', '**/*.stories.*', '**/node_modules/**'],
        };
        break;

      case 'svelte':
        config.sources.svelte = {
          enabled: true,
          include: ['src/**/*.svelte', 'lib/**/*.svelte'],
          exclude: ['**/*.test.*', '**/*.spec.*', '**/*.stories.*', '**/node_modules/**'],
        };
        break;

      case 'angular':
        config.sources.angular = {
          enabled: true,
          include: ['src/**/*.component.ts'],
          exclude: ['**/*.spec.*', '**/node_modules/**'],
        };
        break;

      case 'webcomponents':
        config.sources.webcomponent = {
          enabled: true,
          include: ['src/**/*.ts'],
          exclude: ['**/*.test.*', '**/*.spec.*', '**/node_modules/**'],
          framework: 'auto',
        };
        break;

      case 'tailwind':
        // Tailwind is handled by token scanning, not a separate source
        break;
    }
  }

  // Add token scanning if we found token files
  if (tokenFiles.length > 0) {
    config.sources.tokens = {
      enabled: true,
      files: tokenFiles,
    };
  }

  return { config, detected, tokenFiles };
}

/**
 * Find common token file patterns
 */
async function findTokenFiles(projectRoot: string): Promise<string[]> {
  const patterns = [
    // CSS custom properties
    '**/tokens.css',
    '**/variables.css',
    '**/design-tokens.css',
    '**/theme.css',
    '**/_variables.scss',
    '**/_tokens.scss',
    '**/styles/variables.css',
    '**/styles/tokens.css',

    // JSON tokens
    '**/tokens.json',
    '**/design-tokens.json',
    '**/.tokens.json',
    '**/style-dictionary/**/*.json',

    // Tailwind config (extract theme)
    'tailwind.config.js',
    'tailwind.config.ts',
    'tailwind.config.mjs',
  ];

  const found: string[] = [];

  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      cwd: projectRoot,
      nodir: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
    });
    found.push(...matches);
  }

  // Deduplicate
  return [...new Set(found)];
}

/**
 * Format a summary of what was auto-detected
 */
export function formatAutoDetectSummary(
  detected: DetectedFramework[],
  tokenFiles: string[],
): string {
  const lines: string[] = [];

  if (detected.length > 0) {
    lines.push('Detected:');
    for (const d of detected) {
      lines.push(`  • ${d.name} (${d.evidence})`);
    }
  }

  if (tokenFiles.length > 0) {
    lines.push('Token files:');
    for (const f of tokenFiles.slice(0, 5)) {
      lines.push(`  • ${f}`);
    }
    if (tokenFiles.length > 5) {
      lines.push(`  ... and ${tokenFiles.length - 5} more`);
    }
  }

  return lines.join('\n');
}
