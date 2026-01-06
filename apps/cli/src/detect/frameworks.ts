import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { glob } from 'glob';

export interface DetectedFramework {
  name: string;
  scanner?: string;  // Built-in scanner to use (no install needed)
  plugin?: string;   // Optional plugin for enhanced features
  confidence: 'high' | 'medium' | 'low';
  evidence: string;
  matchedFiles?: string[];  // Files that triggered detection
}

export interface PluginInfo {
  name: string;
  description: string;
  detects: string;
  examples?: string[];
}

// Built-in scanners - no plugins needed for these
export const BUILTIN_SCANNERS: Record<string, { description: string; detects: string }> = {
  react: { description: 'React/JSX component scanning', detects: 'React components' },
  vue: { description: 'Vue SFC scanning', detects: 'Vue components' },
  svelte: { description: 'Svelte component scanning', detects: 'Svelte components' },
  angular: { description: 'Angular component scanning', detects: 'Angular components' },
  webcomponents: { description: 'Lit/Stencil scanning', detects: 'Web Components' },
  tokens: { description: 'CSS/SCSS/JSON token scanning', detects: 'Design tokens' },
  templates: { description: 'Template scanning (Blade, ERB, Twig)', detects: 'Server templates' },
  tailwind: { description: 'Tailwind config & arbitrary value detection', detects: 'Tailwind CSS' },
};

// These require external configuration or APIs (future)
export const PLUGIN_INFO: Record<string, PluginInfo> = {
  figma: {
    name: '@buoy-design/plugin-figma',
    description: 'Connects to Figma to compare design tokens with your codebase.',
    detects: 'Figma configuration',
    examples: ['Token value drift between Figma and code', 'Missing component implementations'],
  },
  storybook: {
    name: '@buoy-design/plugin-storybook',
    description: 'Scans Storybook stories to verify component coverage.',
    detects: 'Storybook configuration',
    examples: ['Components without stories', 'Undocumented variants'],
  },
};

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

// Framework detection patterns
// scanner = built-in (no install needed), plugin = optional enhancement
const FRAMEWORK_PATTERNS: Array<{
  name: string;
  scanner?: string;  // Built-in scanner to use
  plugin?: string;   // Optional plugin for enhanced features
  packages?: string[];
  files?: string[];
}> = [
  // React ecosystem - built-in scanner
  { name: 'react', scanner: 'react', packages: ['react', 'react-dom'] },
  { name: 'next', scanner: 'react', packages: ['next'] },
  { name: 'remix', scanner: 'react', packages: ['@remix-run/react'] },
  { name: 'gatsby', scanner: 'react', packages: ['gatsby'] },

  // Vue ecosystem - built-in scanner
  { name: 'vue', scanner: 'vue', packages: ['vue'] },
  { name: 'nuxt', scanner: 'vue', packages: ['nuxt', 'nuxt3'] },

  // Svelte ecosystem - built-in scanner
  { name: 'svelte', scanner: 'svelte', packages: ['svelte'] },
  { name: 'sveltekit', scanner: 'svelte', packages: ['@sveltejs/kit'] },

  // Angular - built-in scanner
  { name: 'angular', scanner: 'angular', packages: ['@angular/core'] },

  // Web Components - built-in scanner
  { name: 'lit', scanner: 'webcomponents', packages: ['lit', 'lit-element'] },
  { name: 'stencil', scanner: 'webcomponents', packages: ['@stencil/core'] },

  // Astro - built-in template scanner
  { name: 'astro', scanner: 'astro', packages: ['astro'] },

  // CSS/Tokens - built-in
  { name: 'tailwind', scanner: 'tailwind', packages: ['tailwindcss'], files: ['tailwind.config.*'] },

  // Design tools - require plugins
  { name: 'figma', plugin: 'figma', files: ['.figmarc', 'figma.config.*'] },
  { name: 'storybook', plugin: 'storybook', packages: ['@storybook/react', '@storybook/vue3', '@storybook/svelte'], files: ['.storybook/**'] },
];

export interface MonorepoInfoForDetection {
  type: string;
  patterns: string[];
}

export async function detectFrameworks(projectRoot: string, monorepoInfo?: MonorepoInfoForDetection | null): Promise<DetectedFramework[]> {
  const detected: DetectedFramework[] = [];

  // Collect all dependency names from root and workspace packages
  const allDeps: Record<string, string> = {};

  // Read root package.json
  const pkgPath = resolve(projectRoot, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkgJson: PackageJson = JSON.parse(await readFile(pkgPath, 'utf-8'));
      Object.assign(allDeps, pkgJson.dependencies, pkgJson.devDependencies);
    } catch {
      // Invalid JSON, continue
    }
  }

  // If monorepo, also check workspace package.json files
  if (monorepoInfo && monorepoInfo.patterns.length > 0) {
    for (const wsPattern of monorepoInfo.patterns) {
      // Convert workspace pattern to package.json glob
      // e.g., "apps/*" -> "apps/*/package.json"
      // e.g., "packages/**/*" -> "packages/**/*/package.json"
      const normalizedPattern = wsPattern.replace(/\/?$/, '');
      const pkgPattern = normalizedPattern.endsWith('*')
        ? `${normalizedPattern}/package.json`
        : `${normalizedPattern}/*/package.json`;

      try {
        const matches = await glob(pkgPattern, { cwd: projectRoot, nodir: true });
        for (const match of matches.slice(0, 20)) {  // Limit to 20 packages
          try {
            const wsPkgPath = resolve(projectRoot, match);
            const wsPkgJson: PackageJson = JSON.parse(await readFile(wsPkgPath, 'utf-8'));
            Object.assign(allDeps, wsPkgJson.dependencies, wsPkgJson.devDependencies);
          } catch {
            // Invalid JSON, skip this package
          }
        }
      } catch {
        // Glob failed, continue
      }
    }
  }

  const depNames = Object.keys(allDeps);

  for (const pattern of FRAMEWORK_PATTERNS) {
    // Check package.json dependencies
    if (pattern.packages) {
      const matchedPkg = pattern.packages.find((pkg) => depNames.includes(pkg));
      if (matchedPkg) {
        detected.push({
          name: pattern.name,
          scanner: pattern.scanner,
          plugin: pattern.plugin,
          confidence: 'high',
          evidence: `Found "${matchedPkg}" in package.json`,
        });
        continue;
      }
    }

    // Check for config files
    if (pattern.files) {
      for (const filePattern of pattern.files) {
        const matches = await glob(filePattern, { cwd: projectRoot, nodir: true });
        if (matches.length > 0) {
          detected.push({
            name: pattern.name,
            scanner: pattern.scanner,
            plugin: pattern.plugin,
            confidence: pattern.packages ? 'medium' : 'high',
            evidence: `Found ${matches[0]}`,
            matchedFiles: matches.slice(0, 5),  // Keep up to 5 files for display
          });
          break;
        }
      }
    }
  }

  // Deduplicate by scanner or plugin name, keeping highest confidence
  const byKey = new Map<string, DetectedFramework>();
  for (const d of detected) {
    const key = d.scanner || d.plugin || d.name;
    const existing = byKey.get(key);
    if (!existing || confidenceRank(d.confidence) > confidenceRank(existing.confidence)) {
      byKey.set(key, d);
    }
  }

  return Array.from(byKey.values());
}

function confidenceRank(c: 'high' | 'medium' | 'low'): number {
  return c === 'high' ? 3 : c === 'medium' ? 2 : 1;
}

export function detectPackageManager(projectRoot: string = process.cwd()): 'pnpm' | 'yarn' | 'npm' {
  if (existsSync(resolve(projectRoot, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (existsSync(resolve(projectRoot, 'yarn.lock'))) {
    return 'yarn';
  }
  return 'npm';
}

export function getPluginInstallCommand(plugins: string[], projectRoot: string = process.cwd()): string {
  const fullNames = plugins.map((p) => `@buoy-design/plugin-${p}`);
  const pm = detectPackageManager(projectRoot);

  switch (pm) {
    case 'pnpm':
      return `pnpm add -D ${fullNames.join(' ')}`;
    case 'yarn':
      return `yarn add -D ${fullNames.join(' ')}`;
    default:
      return `npm install --save-dev ${fullNames.join(' ')}`;
  }
}
