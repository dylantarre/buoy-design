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
 * Common nested frontend directory names.
 * These are subdirectories that contain a separate frontend app (e.g., in full-stack repos
 * where a Go/Python/etc backend has a React/Vue/etc frontend in a subdirectory).
 */
const NESTED_FRONTEND_DIRS = ['frontend', 'client', 'web', 'ui', 'app', 'dashboard'];

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
          .filter(Boolean)
          // Strip single and double quotes from YAML strings
          .map(pattern => pattern.replace(/^["'](.*)["']$/, '$1'))
          // Filter out negation patterns (they start with !)
          .filter(pattern => !pattern.startsWith('!'));
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

export interface NestedFrontendInfo {
  dir: string;       // e.g., 'frontend', 'client', 'web'
  hasPackageJson: boolean;
  hasSrcDir: boolean;
}

/**
 * Detect if this project has a nested frontend directory.
 * Common in full-stack apps where a Go/Python/etc backend has a frontend/ subdirectory.
 */
async function detectNestedFrontend(projectRoot: string): Promise<NestedFrontendInfo | null> {
  for (const dir of NESTED_FRONTEND_DIRS) {
    const dirPath = resolve(projectRoot, dir);
    const pkgPath = resolve(dirPath, 'package.json');

    // Check if the directory has a package.json with a frontend framework
    if (existsSync(pkgPath)) {
      try {
        const content = JSON.parse(await readFile(pkgPath, 'utf-8'));
        const deps = { ...content.dependencies, ...content.devDependencies };

        // Check for common frontend framework indicators
        const hasFrontendFramework = Boolean(
          deps['react'] ||
          deps['react-dom'] ||
          deps['vue'] ||
          deps['svelte'] ||
          deps['@angular/core'] ||
          deps['next'] ||
          deps['nuxt'] ||
          deps['@sveltejs/kit']
        );

        if (hasFrontendFramework) {
          const srcPath = resolve(dirPath, 'src');
          return {
            dir,
            hasPackageJson: true,
            hasSrcDir: existsSync(srcPath),
          };
        }
      } catch {
        // Invalid JSON, continue checking other directories
      }
    }
  }

  return null;
}

/**
 * Expand include patterns for nested frontend directory.
 * Prefixes patterns with the frontend directory path.
 */
function expandForNestedFrontend(basePatterns: string[], nested: NestedFrontendInfo): string[] {
  const expanded: string[] = [];

  for (const pattern of basePatterns) {
    // Add the nested prefix to the pattern
    // e.g., 'src/**/*.tsx' -> 'frontend/src/**/*.tsx'
    expanded.push(`${nested.dir}/${pattern}`);
  }

  // Also include the base patterns in case there's code at the root level too
  expanded.push(...basePatterns);

  return [...new Set(expanded)];  // Deduplicate
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
 * Expand patterns for project structure (monorepo or nested frontend).
 * Returns the appropriate patterns based on detected structure.
 */
function expandPatterns(
  basePatterns: string[],
  monorepo: MonorepoInfo | null,
  nestedFrontend: NestedFrontendInfo | null
): string[] {
  let patterns = basePatterns;

  // Apply monorepo expansion first
  if (monorepo) {
    patterns = expandForMonorepo(patterns, monorepo);
  }

  // Apply nested frontend expansion
  if (nestedFrontend) {
    patterns = expandForNestedFrontend(patterns, nestedFrontend);
  }

  return patterns;
}

/**
 * Build a config automatically from detected frameworks.
 * Used when no .buoy.yaml exists - zero-config mode.
 */
export async function buildAutoConfig(projectRoot: string = process.cwd()): Promise<{
  config: BuoyConfig;
  detected: DetectedFramework[];
  tokenFiles: string[];
  monorepo: MonorepoInfo | null;
  nestedFrontend: NestedFrontendInfo | null;
}> {
  // Detect monorepo and nested frontend structures
  const monorepo = await detectMonorepo(projectRoot);
  const nestedFrontend = await detectNestedFrontend(projectRoot);

  // Detect frameworks - check nested frontend directory if present
  // This ensures we find frameworks in frontend/ subdirectories
  let detected: DetectedFramework[];
  if (nestedFrontend) {
    const nestedRoot = resolve(projectRoot, nestedFrontend.dir);
    // Detect frameworks in nested frontend first
    detected = await detectFrameworks(nestedRoot, monorepo);
    // If no frameworks found in nested, try root
    if (detected.length === 0) {
      detected = await detectFrameworks(projectRoot, monorepo);
    }
  } else {
    detected = await detectFrameworks(projectRoot, monorepo);
  }

  // Find token files
  const tokenFiles = await findTokenFiles(projectRoot);

  // Build config from detections
  const config: BuoyConfig = {
    project: {
      name: basename(projectRoot),
    },
    sources: {},
    drift: {
      ignore: [],
      severity: {},
      aggregation: {
        strategies: ['value', 'suggestion', 'path', 'entity'],
        minGroupSize: 2,
        pathPatterns: [],
      },
      types: {},
    },
    claude: { enabled: false, model: 'claude-sonnet-4-20250514' },
    output: { format: 'table', colors: true },
    experimental: { repeatedPatternDetection: false },
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
          include: expandPatterns(baseInclude, monorepo, nestedFrontend),
          exclude: ['**/*.test.*', '**/*.spec.*', '**/*.stories.*', '**/node_modules/**'],
        };
        break;
      }

      case 'vue': {
        // Include Laravel-style paths (resources/js, resources/assets/js) for PHP full-stack apps
        const baseInclude = [
          'src/**/*.vue',
          'components/**/*.vue',
          'resources/js/**/*.vue',           // Laravel 5.5+/Mix
          'resources/assets/js/**/*.vue',    // Older Laravel/Elixir
        ];
        config.sources.vue = {
          enabled: true,
          include: expandPatterns(baseInclude, monorepo, nestedFrontend),
          exclude: ['**/*.test.*', '**/*.spec.*', '**/*.stories.*', '**/node_modules/**'],
        };
        break;
      }

      case 'svelte': {
        const baseInclude = ['src/**/*.svelte', 'lib/**/*.svelte'];
        config.sources.svelte = {
          enabled: true,
          include: expandPatterns(baseInclude, monorepo, nestedFrontend),
          exclude: ['**/*.test.*', '**/*.spec.*', '**/*.stories.*', '**/node_modules/**'],
        };
        break;
      }

      case 'angular': {
        // Use **/*.ts to catch Angular Material-style naming (e.g., button.ts, tab.ts)
        // as well as standard *.component.ts files
        const baseInclude = ['src/**/*.ts'];
        config.sources.angular = {
          enabled: true,
          include: expandPatterns(baseInclude, monorepo, nestedFrontend),
          exclude: ['**/*.spec.*', '**/*.test.*', '**/node_modules/**'],
        };
        break;
      }

      case 'webcomponents': {
        const baseInclude = ['src/**/*.ts'];
        config.sources.webcomponent = {
          enabled: true,
          include: expandPatterns(baseInclude, monorepo, nestedFrontend),
          exclude: ['**/*.test.*', '**/*.spec.*', '**/node_modules/**'],
          framework: 'auto',
        };
        break;
      }

      case 'tailwind': {
        // Enable Tailwind arbitrary value detection
        const baseInclude = ['src/**/*.tsx', 'src/**/*.jsx', 'src/**/*.vue', 'src/**/*.svelte', 'app/**/*.tsx', 'components/**/*.tsx'];
        config.sources.tailwind = {
          enabled: true,
          files: expandPatterns(baseInclude, monorepo, nestedFrontend),
          exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
        };
        break;
      }

      case 'astro': {
        // Astro components use .astro files
        const baseInclude = ['src/**/*.astro', 'components/**/*.astro'];
        config.sources.templates = {
          enabled: true,
          include: expandPatterns(baseInclude, monorepo, nestedFrontend),
          exclude: ['**/node_modules/**', '**/dist/**'],
          type: 'astro',
        };
        break;
      }
    }
  }

  // Add token scanning if we found token files
  if (tokenFiles.length > 0) {
    config.sources.tokens = {
      enabled: true,
      files: tokenFiles,
    };
  }

  return { config, detected, tokenFiles, monorepo, nestedFrontend };
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
