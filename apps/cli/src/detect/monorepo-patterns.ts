/**
 * Monorepo pattern detection and expansion
 *
 * Handles automatic pattern expansion for popular monorepo structures:
 * - pnpm workspaces (pnpm-workspace.yaml)
 * - yarn/npm workspaces (package.json workspaces)
 * - Lerna (lerna.json)
 * - Nx workspaces (nx.json with apps/libs structure)
 * - Turborepo (turbo.json)
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { parse as parseYaml } from 'yaml';

export interface MonorepoConfig {
  type: 'pnpm' | 'yarn' | 'npm' | 'lerna' | 'nx' | 'turborepo' | null;
  workspacePatterns: string[];
}

export interface ExpandedPatterns {
  /** Original patterns (for single-package projects) */
  basePatterns: string[];
  /** Expanded patterns for monorepo structures */
  monorepoPatterns: string[];
  /** Combined patterns (base + monorepo) */
  allPatterns: string[];
}

// Note: These patterns are used in project-detector.ts for scanning monorepo directories
// The actual patterns are defined inline there for better maintainability

/**
 * Detect monorepo configuration from project root
 */
export function detectMonorepoConfig(projectRoot: string): MonorepoConfig {
  // Check for pnpm workspaces
  const pnpmWorkspacePath = resolve(projectRoot, 'pnpm-workspace.yaml');
  if (existsSync(pnpmWorkspacePath)) {
    const patterns = parsePnpmWorkspaces(pnpmWorkspacePath);
    return { type: 'pnpm', workspacePatterns: patterns };
  }

  // Check for lerna.json
  const lernaPath = resolve(projectRoot, 'lerna.json');
  if (existsSync(lernaPath)) {
    const patterns = parseLernaConfig(lernaPath);
    return { type: 'lerna', workspacePatterns: patterns };
  }

  // Check for nx.json
  const nxPath = resolve(projectRoot, 'nx.json');
  if (existsSync(nxPath)) {
    // Nx typically uses apps/ and libs/ structure
    return { type: 'nx', workspacePatterns: ['apps/*', 'libs/*', 'packages/*'] };
  }

  // Check for turbo.json
  const turboPath = resolve(projectRoot, 'turbo.json');
  if (existsSync(turboPath)) {
    // Turborepo uses package.json workspaces or pnpm-workspace.yaml
    // Fall through to check package.json
  }

  // Check for package.json workspaces (yarn/npm)
  const pkgPath = resolve(projectRoot, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const workspaces = pkg.workspaces;

      if (workspaces) {
        // Handle both array and object format
        const patterns = Array.isArray(workspaces)
          ? workspaces
          : (workspaces.packages || []);

        if (patterns.length > 0) {
          // Determine if it's turborepo with npm/yarn workspaces
          const type = existsSync(turboPath) ? 'turborepo' :
                       existsSync(resolve(projectRoot, 'yarn.lock')) ? 'yarn' : 'npm';
          return { type, workspacePatterns: patterns };
        }
      }
    } catch {
      // Invalid JSON, continue
    }
  }

  return { type: null, workspacePatterns: [] };
}

/**
 * Parse pnpm-workspace.yaml to get workspace patterns
 */
function parsePnpmWorkspaces(filePath: string): string[] {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const config = parseYaml(content);
    return config?.packages || [];
  } catch {
    // Default pnpm patterns
    return ['packages/*'];
  }
}

/**
 * Parse lerna.json to get workspace patterns
 */
function parseLernaConfig(filePath: string): string[] {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const config = JSON.parse(content);
    return config?.packages || ['packages/*'];
  } catch {
    return ['packages/*'];
  }
}

/**
 * Expand file patterns for monorepo structures
 *
 * Given base patterns like ['src/**\/*.tsx'], this function expands them
 * to include monorepo package locations like ['packages/*\/src/**\/*.tsx']
 *
 * @param basePatterns - Original file patterns (e.g., ['src/**\/*.tsx'])
 * @param monorepoConfig - Detected monorepo configuration
 * @returns Expanded patterns for the monorepo structure
 */
export function expandPatternsForMonorepo(
  basePatterns: string[],
  monorepoConfig: MonorepoConfig,
): ExpandedPatterns {
  if (!monorepoConfig.type || monorepoConfig.workspacePatterns.length === 0) {
    return {
      basePatterns,
      monorepoPatterns: [],
      allPatterns: basePatterns,
    };
  }

  const monorepoPatterns: string[] = [];

  for (const workspacePattern of monorepoConfig.workspacePatterns) {
    // Convert workspace patterns like 'packages/*' to component patterns
    // Remove trailing /* if present for cleaner paths
    const baseWorkspace = workspacePattern.replace(/\/\*+$/, '');

    for (const basePattern of basePatterns) {
      // Handle patterns that start with 'src/'
      if (basePattern.startsWith('src/')) {
        // packages/* + src/**/*.tsx -> packages/*/src/**/*.tsx
        monorepoPatterns.push(`${baseWorkspace}/*/${basePattern}`);
        // Also check for scoped packages: packages/@scope/*/src/**/*.tsx
        if (baseWorkspace === 'packages') {
          monorepoPatterns.push(`packages/@*/*/${basePattern}`);
        }
      } else {
        // For patterns not starting with src/, add them under workspace packages
        // **/*.tsx -> packages/*/src/**/*.tsx
        monorepoPatterns.push(`${baseWorkspace}/*/src/${basePattern}`);
        if (baseWorkspace === 'packages') {
          monorepoPatterns.push(`packages/@*/*/src/${basePattern}`);
        }
      }
    }
  }

  // Add standard monorepo paths that might not be in workspace config
  // but are commonly used (e.g., apps/ for Nx)
  const additionalPatterns: string[] = [];

  if (monorepoConfig.type === 'nx' || monorepoConfig.type === 'turborepo') {
    for (const basePattern of basePatterns) {
      if (basePattern.startsWith('src/')) {
        additionalPatterns.push(`apps/*/${basePattern}`);
        additionalPatterns.push(`libs/*/${basePattern}`);
      } else {
        additionalPatterns.push(`apps/*/src/${basePattern}`);
        additionalPatterns.push(`libs/*/src/${basePattern}`);
      }
    }
  }

  // Combine and deduplicate
  const allMonorepoPatterns = Array.from(new Set([...monorepoPatterns, ...additionalPatterns]));

  return {
    basePatterns,
    monorepoPatterns: allMonorepoPatterns,
    allPatterns: Array.from(new Set([...basePatterns, ...allMonorepoPatterns])),
  };
}

/**
 * Get default include patterns for a framework, expanded for monorepo if detected
 *
 * @param framework - Framework name (react, vue, svelte, angular)
 * @param projectRoot - Project root directory
 * @returns Include patterns appropriate for the project structure
 */
export function getIncludePatternsForFramework(
  framework: 'react' | 'vue' | 'svelte' | 'angular' | 'webcomponent',
  projectRoot: string,
): string[] {
  // Base patterns by framework
  const basePatterns: Record<string, string[]> = {
    react: ['src/**/*.tsx', 'src/**/*.jsx'],
    vue: ['src/**/*.vue'],
    svelte: ['src/**/*.svelte'],
    angular: ['src/**/*.component.ts'],
    webcomponent: ['src/**/*.ts'],
  };

  const patterns = basePatterns[framework] || ['src/**/*.tsx'];
  const monorepoConfig = detectMonorepoConfig(projectRoot);

  if (!monorepoConfig.type) {
    return patterns;
  }

  const expanded = expandPatternsForMonorepo(patterns, monorepoConfig);
  return expanded.allPatterns;
}

/**
 * Check if a project is a monorepo
 */
export function isMonorepo(projectRoot: string): boolean {
  const config = detectMonorepoConfig(projectRoot);
  return config.type !== null;
}

/**
 * Get human-readable monorepo type description
 */
export function getMonorepoDescription(config: MonorepoConfig): string {
  if (!config.type) return 'Single package';

  const descriptions: Record<string, string> = {
    pnpm: 'pnpm workspace',
    yarn: 'Yarn workspace',
    npm: 'npm workspace',
    lerna: 'Lerna monorepo',
    nx: 'Nx workspace',
    turborepo: 'Turborepo',
  };

  return descriptions[config.type] || 'Monorepo';
}
