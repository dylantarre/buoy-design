// apps/cli/src/config/auto-detect.ts
import { basename, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { glob } from 'glob';
import { detectFrameworks, type DetectedFramework } from '../detect/frameworks.js';
import type { BuoyConfig } from './schema.js';

export interface MonorepoInfo {
  type: 'pnpm' | 'yarn' | 'npm' | 'lerna' | 'nx' | 'turborepo';
  patterns: string[];  // Workspace patterns from config
}

/**
 * Detect if this is a monorepo and return workspace patterns.
 */
async function detectMonorepo(projectRoot: string): Promise<MonorepoInfo | null> {
  // Check for pnpm-workspace.yaml
  const pnpmWorkspacePath = resolve(projectRoot, 'pnpm-workspace.yaml');
  if (existsSync(pnpmWorkspacePath)) {
    try {
      const content = await readFile(pnpmWorkspacePath, 'utf-8');
      // Simple YAML parsing for packages: array
      const packagesMatch = content.match(/packages:\s*\n((?:\s+-\s+[^\n]+\n?)+)/);
      if (packagesMatch && packagesMatch[1]) {
        const patterns = packagesMatch[1]
          .split('\n')
          .map(line => line.replace(/^\s*-\s*/, '').trim())
          .filter(Boolean);
        return { type: 'pnpm', patterns };
      }
    } catch {
      // Failed to parse, continue
    }
    return { type: 'pnpm', patterns: ['packages/**', 'apps/**'] };  // Default patterns
  }

  // Check for lerna.json
  const lernaPath = resolve(projectRoot, 'lerna.json');
  if (existsSync(lernaPath)) {
    try {
      const content = JSON.parse(await readFile(lernaPath, 'utf-8'));
      if (content.packages) {
        return { type: 'lerna', patterns: content.packages };
      }
    } catch {
      // Failed to parse
    }
    return { type: 'lerna', patterns: ['packages/*'] };
  }

  // Check for nx.json
  const nxPath = resolve(projectRoot, 'nx.json');
  if (existsSync(nxPath)) {
    return { type: 'nx', patterns: ['packages/**', 'apps/**', 'libs/**'] };
  }

  // Check for turbo.json
  const turboPath = resolve(projectRoot, 'turbo.json');
  if (existsSync(turboPath)) {
    return { type: 'turborepo', patterns: ['packages/**', 'apps/**'] };
  }

  // Check package.json for workspaces (yarn/npm)
  const pkgPath = resolve(projectRoot, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const content = JSON.parse(await readFile(pkgPath, 'utf-8'));
      if (content.workspaces) {
        const patterns = Array.isArray(content.workspaces)
          ? content.workspaces
          : content.workspaces.packages || [];
        if (patterns.length > 0) {
          // Check if it's yarn (yarn.lock) or npm (package-lock.json)
          const type = existsSync(resolve(projectRoot, 'yarn.lock')) ? 'yarn' : 'npm';
          return { type, patterns };
        }
      }
    } catch {
      // Failed to parse
    }
  }

  return null;
}

/**
 * Expand include patterns for monorepo structure.
 * Adds patterns like packages/[star]/src/[star][star]/[star].tsx for monorepos.
 */
function expandForMonorepo(basePatterns: string[], monorepo: MonorepoInfo): string[] {
  const expanded: string[] = [...basePatterns];

  // Add monorepo-specific patterns based on workspace config
  for (const wsPattern of monorepo.patterns) {
    // Normalize the pattern (remove trailing slashes and **)
    const base = wsPattern.replace(/\/?\*\*?\/?$/, '').replace(/\/$/, '');

    // For each base pattern, add the monorepo equivalent
    for (const pattern of basePatterns) {
      // Extract the core pattern (e.g., '**/*.tsx' from 'src/**/*.tsx')
      const match = pattern.match(/^([^*]+)(\*\*.*)$/);
      if (match) {
        const prefix = match[1];  // e.g., 'src/'
        const suffix = match[2];  // e.g., '**/*.tsx'

        // Add patterns for different monorepo structures:
        // - packages/*/src/**/*.tsx (direct packages)
        // - packages/@scope/*/src/**/*.tsx (scoped packages like @mantine/core)
        if (base.includes('*')) {
          // Already has a wildcard (e.g., 'packages/**')
          expanded.push(`${base}/${prefix}${suffix}`);
        } else {
          // Need to add wildcards for package directories
          expanded.push(`${base}/*/${prefix}${suffix}`);
          // Also handle scoped packages (packages/@scope/*/src/...)
          expanded.push(`${base}/@*/*/${prefix}${suffix}`);
        }
      }
    }
  }

  // Also add common patterns for apps directory (many monorepos have an apps/ folder)
  if (!monorepo.patterns.some(p => p.includes('apps'))) {
    for (const pattern of basePatterns) {
      const match = pattern.match(/^([^*]+)(\*\*.*)$/);
      if (match) {
        expanded.push(`apps/*/${match[1]}${match[2]}`);
      }
    }
  }

  // Add registry patterns for shadcn-style repos
  for (const pattern of basePatterns) {
    if (pattern.includes('*.tsx') || pattern.includes('*.jsx')) {
      expanded.push(`**/registry/**/*.tsx`);
      expanded.push(`**/registry/**/*.jsx`);
    }
  }

  return [...new Set(expanded)];  // Deduplicate
}

/**
 * Build a config automatically from detected frameworks.
 * Used when no buoy.config.mjs exists - zero-config mode.
 */
export async function buildAutoConfig(projectRoot: string = process.cwd()): Promise<{
  config: BuoyConfig;
  detected: DetectedFramework[];
  tokenFiles: string[];
  monorepo: MonorepoInfo | null;
}> {
  // Detect frameworks and monorepo
  const [detected, monorepo] = await Promise.all([
    detectFrameworks(projectRoot),
    detectMonorepo(projectRoot),
  ]);

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
      case 'react': {
        const baseInclude = ['src/**/*.tsx', 'src/**/*.jsx', 'app/**/*.tsx', 'app/**/*.jsx', 'components/**/*.tsx', 'components/**/*.jsx'];
        config.sources.react = {
          enabled: true,
          include: monorepo ? expandForMonorepo(baseInclude, monorepo) : baseInclude,
          exclude: ['**/*.test.*', '**/*.spec.*', '**/*.stories.*', '**/node_modules/**'],
        };
        break;
      }

      case 'vue': {
        const baseInclude = ['src/**/*.vue', 'components/**/*.vue'];
        config.sources.vue = {
          enabled: true,
          include: monorepo ? expandForMonorepo(baseInclude, monorepo) : baseInclude,
          exclude: ['**/*.test.*', '**/*.spec.*', '**/*.stories.*', '**/node_modules/**'],
        };
        break;
      }

      case 'svelte': {
        const baseInclude = ['src/**/*.svelte', 'lib/**/*.svelte'];
        config.sources.svelte = {
          enabled: true,
          include: monorepo ? expandForMonorepo(baseInclude, monorepo) : baseInclude,
          exclude: ['**/*.test.*', '**/*.spec.*', '**/*.stories.*', '**/node_modules/**'],
        };
        break;
      }

      case 'angular': {
        const baseInclude = ['src/**/*.component.ts'];
        config.sources.angular = {
          enabled: true,
          include: monorepo ? expandForMonorepo(baseInclude, monorepo) : baseInclude,
          exclude: ['**/*.spec.*', '**/node_modules/**'],
        };
        break;
      }

      case 'webcomponents': {
        const baseInclude = ['src/**/*.ts'];
        config.sources.webcomponent = {
          enabled: true,
          include: monorepo ? expandForMonorepo(baseInclude, monorepo) : baseInclude,
          exclude: ['**/*.test.*', '**/*.spec.*', '**/node_modules/**'],
          framework: 'auto',
        };
        break;
      }

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

  return { config, detected, tokenFiles, monorepo };
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
