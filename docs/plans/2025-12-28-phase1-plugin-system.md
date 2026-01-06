# Phase 1: Core Plugin System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract plugin system from CLI so scanners can be installed separately, keeping core lean.

**Architecture:** Define a `BuoyPlugin` interface, create a plugin loader/registry in CLI, refactor `buoy init` to detect frameworks and suggest plugins rather than bundling all scanners.

**Tech Stack:** TypeScript, Zod (validation), Commander.js (CLI), glob (detection)

---

## Task 1: Define Plugin Interface

**Files:**
- Create: `packages/core/src/plugins/types.ts`
- Create: `packages/core/src/plugins/index.ts`
- Modify: `packages/core/src/index.ts`

**Step 1: Create the plugin type definitions**

```typescript
// packages/core/src/plugins/types.ts
import type { Component, DesignToken } from '../models';

export interface PluginMetadata {
  name: string;
  version: string;
  description?: string;
  detects?: string[];  // Framework identifiers this plugin handles: ['react', 'next']
}

export interface ScanContext {
  projectRoot: string;
  config: Record<string, unknown>;
  include?: string[];
  exclude?: string[];
}

export interface ScanResult {
  components: Component[];
  tokens: DesignToken[];
  errors: Array<{ file?: string; message: string; code?: string }>;
  stats: { filesScanned: number; itemsFound: number; duration: number };
}

export interface ReportContext {
  ci: boolean;
  format: 'json' | 'table' | 'markdown';
  github?: {
    token: string;
    repo: string;
    pr: number;
  };
}

export interface DriftResult {
  signals: Array<{
    type: string;
    severity: 'critical' | 'warning' | 'info';
    message: string;
    component?: string;
    file?: string;
    line?: number;
    suggestion?: string;
  }>;
  summary: { total: number; critical: number; warning: number; info: number };
}

export interface BuoyPlugin {
  metadata: PluginMetadata;

  // Optional: Scanner capability
  scan?(context: ScanContext): Promise<ScanResult>;

  // Optional: Reporter capability (for CI integrations)
  report?(results: DriftResult, context: ReportContext): Promise<void>;
}

export type PluginFactory = () => BuoyPlugin | Promise<BuoyPlugin>;
```

**Step 2: Create the index export**

```typescript
// packages/core/src/plugins/index.ts
export * from './types';
```

**Step 3: Export from core package**

Add to `packages/core/src/index.ts`:
```typescript
export * from './plugins';
```

**Step 4: Run build to verify types compile**

Run: `pnpm --filter @buoy/core build`
Expected: Build succeeds with no errors

**Step 5: Commit**

```bash
git add packages/core/src/plugins/
git add packages/core/src/index.ts
git commit -m "feat(core): add plugin interface types"
```

---

## Task 2: Create Plugin Loader

**Files:**
- Create: `apps/cli/src/plugins/loader.ts`
- Create: `apps/cli/src/plugins/registry.ts`
- Create: `apps/cli/src/plugins/index.ts`

**Step 1: Create the plugin registry**

```typescript
// apps/cli/src/plugins/registry.ts
import type { BuoyPlugin, PluginMetadata } from '@buoy/core';

export class PluginRegistry {
  private plugins: Map<string, BuoyPlugin> = new Map();

  register(plugin: BuoyPlugin): void {
    this.plugins.set(plugin.metadata.name, plugin);
  }

  get(name: string): BuoyPlugin | undefined {
    return this.plugins.get(name);
  }

  getAll(): BuoyPlugin[] {
    return Array.from(this.plugins.values());
  }

  getScanners(): BuoyPlugin[] {
    return this.getAll().filter((p) => typeof p.scan === 'function');
  }

  getReporters(): BuoyPlugin[] {
    return this.getAll().filter((p) => typeof p.report === 'function');
  }

  getByDetection(framework: string): BuoyPlugin | undefined {
    return this.getAll().find((p) =>
      p.metadata.detects?.includes(framework.toLowerCase())
    );
  }

  list(): PluginMetadata[] {
    return this.getAll().map((p) => p.metadata);
  }
}

export const registry = new PluginRegistry();
```

**Step 2: Create the plugin loader**

```typescript
// apps/cli/src/plugins/loader.ts
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { BuoyPlugin, PluginFactory } from '@buoy/core';
import { registry } from './registry';

const PLUGIN_PREFIX = '@buoy/plugin-';

interface LoaderOptions {
  projectRoot?: string;
  autoDiscover?: boolean;
}

export async function loadPlugin(nameOrPath: string): Promise<BuoyPlugin> {
  // Handle shorthand: "react" -> "@buoy/plugin-react"
  const moduleName = nameOrPath.startsWith('@')
    ? nameOrPath
    : `${PLUGIN_PREFIX}${nameOrPath}`;

  try {
    const imported = await import(moduleName);
    const factory: PluginFactory = imported.default || imported.plugin || imported;

    if (typeof factory !== 'function') {
      throw new Error(`Plugin ${moduleName} does not export a valid factory function`);
    }

    const plugin = await factory();
    registry.register(plugin);
    return plugin;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error(
        `Plugin "${moduleName}" not found. Install it with: npm install ${moduleName}`
      );
    }
    throw err;
  }
}

export async function discoverPlugins(options: LoaderOptions = {}): Promise<string[]> {
  const projectRoot = options.projectRoot || process.cwd();
  const pkgPath = resolve(projectRoot, 'package.json');

  if (!existsSync(pkgPath)) {
    return [];
  }

  const pkgJson = JSON.parse(await readFile(pkgPath, 'utf-8'));
  const allDeps = {
    ...pkgJson.dependencies,
    ...pkgJson.devDependencies,
  };

  return Object.keys(allDeps).filter((dep) => dep.startsWith(PLUGIN_PREFIX));
}

export async function loadDiscoveredPlugins(options: LoaderOptions = {}): Promise<BuoyPlugin[]> {
  const pluginNames = await discoverPlugins(options);
  const plugins: BuoyPlugin[] = [];

  for (const name of pluginNames) {
    try {
      const plugin = await loadPlugin(name);
      plugins.push(plugin);
    } catch (err) {
      console.warn(`Warning: Failed to load plugin ${name}:`, (err as Error).message);
    }
  }

  return plugins;
}

export { registry };
```

**Step 3: Create index export**

```typescript
// apps/cli/src/plugins/index.ts
export { loadPlugin, discoverPlugins, loadDiscoveredPlugins, registry } from './loader';
export { PluginRegistry } from './registry';
```

**Step 4: Run build to verify**

Run: `pnpm --filter @buoy/cli build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add apps/cli/src/plugins/
git commit -m "feat(cli): add plugin loader and registry"
```

---

## Task 3: Create Lightweight Framework Detector

**Files:**
- Create: `apps/cli/src/detect/frameworks.ts`
- Modify: `apps/cli/src/detect/index.ts`

**Step 1: Create the lightweight detector**

This detector uses only glob and package.json - no heavy AST parsing.

```typescript
// apps/cli/src/detect/frameworks.ts
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { glob } from 'glob';

export interface DetectedFramework {
  name: string;
  plugin: string;  // Suggested plugin name
  confidence: 'high' | 'medium' | 'low';
  evidence: string;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const FRAMEWORK_PATTERNS: Array<{
  name: string;
  plugin: string;
  packages?: string[];
  files?: string[];
}> = [
  // React ecosystem
  { name: 'react', plugin: 'react', packages: ['react', 'react-dom'] },
  { name: 'next', plugin: 'react', packages: ['next'] },
  { name: 'remix', plugin: 'react', packages: ['@remix-run/react'] },
  { name: 'gatsby', plugin: 'react', packages: ['gatsby'] },

  // Vue ecosystem
  { name: 'vue', plugin: 'vue', packages: ['vue'] },
  { name: 'nuxt', plugin: 'vue', packages: ['nuxt', 'nuxt3'] },

  // Svelte ecosystem
  { name: 'svelte', plugin: 'svelte', packages: ['svelte'] },
  { name: 'sveltekit', plugin: 'svelte', packages: ['@sveltejs/kit'] },

  // Angular
  { name: 'angular', plugin: 'angular', packages: ['@angular/core'] },

  // Web Components
  { name: 'lit', plugin: 'webcomponents', packages: ['lit', 'lit-element'] },
  { name: 'stencil', plugin: 'webcomponents', packages: ['@stencil/core'] },

  // CSS/Tokens
  { name: 'tailwind', plugin: 'tailwind', packages: ['tailwindcss'], files: ['tailwind.config.*'] },
  { name: 'css-variables', plugin: 'css', files: ['**/*.css'] },

  // Design tools
  { name: 'figma', plugin: 'figma', files: ['.figmarc', 'figma.config.*'] },
  { name: 'storybook', plugin: 'storybook', packages: ['@storybook/react', '@storybook/vue3', '@storybook/svelte'], files: ['.storybook/**'] },
];

export async function detectFrameworks(projectRoot: string): Promise<DetectedFramework[]> {
  const detected: DetectedFramework[] = [];

  // Read package.json
  const pkgPath = resolve(projectRoot, 'package.json');
  let pkgJson: PackageJson = {};

  if (existsSync(pkgPath)) {
    pkgJson = JSON.parse(await readFile(pkgPath, 'utf-8'));
  }

  const allDeps = {
    ...pkgJson.dependencies,
    ...pkgJson.devDependencies,
  };
  const depNames = Object.keys(allDeps);

  for (const pattern of FRAMEWORK_PATTERNS) {
    // Check package.json dependencies
    if (pattern.packages) {
      const matchedPkg = pattern.packages.find((pkg) => depNames.includes(pkg));
      if (matchedPkg) {
        detected.push({
          name: pattern.name,
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
            plugin: pattern.plugin,
            confidence: pattern.packages ? 'medium' : 'high',
            evidence: `Found ${matches[0]}`,
          });
          break;
        }
      }
    }
  }

  // Deduplicate by plugin name, keeping highest confidence
  const byPlugin = new Map<string, DetectedFramework>();
  for (const d of detected) {
    const existing = byPlugin.get(d.plugin);
    if (!existing || confidenceRank(d.confidence) > confidenceRank(existing.confidence)) {
      byPlugin.set(d.plugin, d);
    }
  }

  return Array.from(byPlugin.values());
}

function confidenceRank(c: 'high' | 'medium' | 'low'): number {
  return c === 'high' ? 3 : c === 'medium' ? 2 : 1;
}

export function getPluginInstallCommand(plugins: string[]): string {
  const fullNames = plugins.map((p) => `@buoy/plugin-${p}`);
  return `npm install --save-dev ${fullNames.join(' ')}`;
}
```

**Step 2: Update detect index**

Add to `apps/cli/src/detect/index.ts`:
```typescript
export * from './frameworks';
```

**Step 3: Run build to verify**

Run: `pnpm --filter @buoy/cli build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add apps/cli/src/detect/
git commit -m "feat(cli): add lightweight framework detector for plugin suggestions"
```

---

## Task 4: Update `buoy init` to Suggest Plugins

**Files:**
- Modify: `apps/cli/src/commands/init.ts`

**Step 1: Read current init.ts**

Read the file first to understand current structure.

**Step 2: Refactor init command**

Add plugin suggestion after detection. Insert after framework detection, before config generation:

```typescript
// After detecting frameworks, suggest plugins
import { detectFrameworks, getPluginInstallCommand } from '../detect/frameworks';
import { discoverPlugins } from '../plugins';

// Inside the init action, after project detection:
const detectedFrameworks = await detectFrameworks(process.cwd());
const installedPlugins = await discoverPlugins();

if (detectedFrameworks.length > 0) {
  console.log('\nDetected frameworks:');
  for (const fw of detectedFrameworks) {
    const installed = installedPlugins.some((p) => p.includes(fw.plugin));
    const status = installed ? chalk.green('(installed)') : chalk.yellow('(not installed)');
    console.log(`  ${chalk.cyan('✓')} ${fw.name} ${status}`);
    console.log(`    ${chalk.dim(fw.evidence)}`);
  }

  const missingPlugins = detectedFrameworks
    .map((fw) => fw.plugin)
    .filter((plugin) => !installedPlugins.some((p) => p.includes(plugin)));

  if (missingPlugins.length > 0) {
    console.log('\nRecommended plugins:');
    console.log(`  ${chalk.cyan(getPluginInstallCommand(missingPlugins))}`);

    // Interactive prompt to install
    const { shouldInstall } = await inquirer.prompt([{
      type: 'confirm',
      name: 'shouldInstall',
      message: 'Install recommended plugins now?',
      default: true,
    }]);

    if (shouldInstall) {
      const { execSync } = await import('node:child_process');
      console.log('\nInstalling plugins...');
      execSync(getPluginInstallCommand(missingPlugins), { stdio: 'inherit' });
    }
  }
}
```

**Step 3: Run build and test manually**

Run: `pnpm --filter @buoy/cli build`
Run: `cd test-fixture && node ../apps/cli/dist/index.js init`
Expected: Should detect frameworks and suggest plugins

**Step 4: Commit**

```bash
git add apps/cli/src/commands/init.ts
git commit -m "feat(cli): buoy init now suggests plugins based on detected frameworks"
```

---

## Task 5: Create Plugin Adapter for Existing Scanners

**Files:**
- Create: `packages/scanners/src/plugin-adapter.ts`
- Modify: `packages/scanners/src/index.ts`

This allows existing scanners to work with the new plugin system while we transition.

**Step 1: Create the adapter**

```typescript
// packages/scanners/src/plugin-adapter.ts
import type { BuoyPlugin, ScanContext, ScanResult } from '@buoy/core';
import type { Scanner, ScannerConfig } from './base/scanner';
import type { Component } from '@buoy/core';

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
```

**Step 2: Export from scanners package**

Add to `packages/scanners/src/index.ts`:
```typescript
export { createPluginFromScanner } from './plugin-adapter';
```

**Step 3: Run build**

Run: `pnpm --filter @buoy/scanners build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/scanners/src/plugin-adapter.ts
git add packages/scanners/src/index.ts
git commit -m "feat(scanners): add plugin adapter for existing scanners"
```

---

## Task 6: Create @buoy/plugin-react as Proof of Concept

**Files:**
- Create: `packages/plugin-react/package.json`
- Create: `packages/plugin-react/tsconfig.json`
- Create: `packages/plugin-react/src/index.ts`

**Step 1: Create package.json**

```json
{
  "name": "@buoy/plugin-react",
  "version": "0.0.1",
  "description": "Buoy plugin for React and Next.js component scanning",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "keywords": ["buoy", "plugin", "react", "design-system", "drift"],
  "license": "MIT",
  "peerDependencies": {
    "@buoy/core": "workspace:*"
  },
  "dependencies": {
    "@buoy/scanners": "workspace:*"
  },
  "devDependencies": {
    "@buoy/core": "workspace:*",
    "typescript": "^5.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

**Step 3: Create the plugin entry point**

```typescript
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
```

**Step 4: Add to pnpm workspace**

Verify `pnpm-workspace.yaml` includes `packages/*` (it should already).

**Step 5: Install dependencies and build**

Run: `pnpm install`
Run: `pnpm --filter @buoy/plugin-react build`
Expected: Build succeeds, creates dist/index.js

**Step 6: Commit**

```bash
git add packages/plugin-react/
git commit -m "feat: add @buoy/plugin-react as first standalone plugin"
```

---

## Task 7: Update Scan Command to Use Plugin Registry

**Files:**
- Modify: `apps/cli/src/commands/scan.ts`

**Step 1: Read current scan.ts to understand structure**

**Step 2: Add plugin-based scanning alongside existing logic**

Add this near the top of the scan command action:

```typescript
import { loadDiscoveredPlugins, registry } from '../plugins';

// At start of action:
const plugins = await loadDiscoveredPlugins({ projectRoot: process.cwd() });

if (plugins.length > 0) {
  console.log(chalk.dim(`Loaded ${plugins.length} plugin(s): ${plugins.map(p => p.metadata.name).join(', ')}`));
}
```

Then update the scanning logic to check for plugins first:

```typescript
// For each source type, check if a plugin handles it
const sourceType = 'react'; // example
const plugin = registry.getByDetection(sourceType);

if (plugin && plugin.scan) {
  const result = await plugin.scan({
    projectRoot: process.cwd(),
    config: config.sources[sourceType] || {},
    include: config.sources[sourceType]?.include,
    exclude: config.sources[sourceType]?.exclude,
  });
  allComponents.push(...result.components);
  allTokens.push(...result.tokens);
} else {
  // Fall back to bundled scanner (existing code)
}
```

**Step 3: Run build and test**

Run: `pnpm --filter @buoy/cli build`
Run: `cd test-fixture && node ../apps/cli/dist/index.js scan`
Expected: Should load plugins and scan

**Step 4: Commit**

```bash
git add apps/cli/src/commands/scan.ts
git commit -m "feat(cli): scan command now uses plugin registry when available"
```

---

## Task 8: Add `buoy plugins` Command

**Files:**
- Create: `apps/cli/src/commands/plugins.ts`
- Modify: `apps/cli/src/commands/index.ts`
- Modify: `apps/cli/src/index.ts`

**Step 1: Create the plugins command**

```typescript
// apps/cli/src/commands/plugins.ts
import { Command } from 'commander';
import chalk from 'chalk';
import { discoverPlugins, loadDiscoveredPlugins, registry } from '../plugins';
import { detectFrameworks, getPluginInstallCommand } from '../detect/frameworks';

export const pluginsCommand = new Command('plugins')
  .description('Manage Buoy plugins');

pluginsCommand
  .command('list')
  .description('List installed plugins')
  .action(async () => {
    const plugins = await loadDiscoveredPlugins();

    if (plugins.length === 0) {
      console.log(chalk.yellow('No plugins installed.'));
      console.log('\nRun `buoy init` to detect your project and get plugin recommendations.');
      return;
    }

    console.log(chalk.bold('Installed plugins:\n'));
    for (const plugin of plugins) {
      console.log(`  ${chalk.cyan(plugin.metadata.name)} ${chalk.dim(`v${plugin.metadata.version}`)}`);
      if (plugin.metadata.description) {
        console.log(`    ${chalk.dim(plugin.metadata.description)}`);
      }
      if (plugin.metadata.detects?.length) {
        console.log(`    Detects: ${plugin.metadata.detects.join(', ')}`);
      }
      console.log();
    }
  });

pluginsCommand
  .command('suggest')
  .description('Suggest plugins based on detected frameworks')
  .action(async () => {
    const detected = await detectFrameworks(process.cwd());
    const installed = await discoverPlugins();

    if (detected.length === 0) {
      console.log(chalk.yellow('No frameworks detected.'));
      return;
    }

    console.log(chalk.bold('Detected frameworks:\n'));
    for (const fw of detected) {
      const isInstalled = installed.some((p) => p.includes(fw.plugin));
      const status = isInstalled
        ? chalk.green('✓ installed')
        : chalk.yellow('○ not installed');
      console.log(`  ${fw.name} ${chalk.dim(`(${fw.confidence})`)} ${status}`);
      console.log(`    ${chalk.dim(fw.evidence)}`);
    }

    const missing = detected
      .map((fw) => fw.plugin)
      .filter((p, i, arr) => arr.indexOf(p) === i) // dedupe
      .filter((plugin) => !installed.some((p) => p.includes(plugin)));

    if (missing.length > 0) {
      console.log('\n' + chalk.bold('Install missing plugins:'));
      console.log(`  ${chalk.cyan(getPluginInstallCommand(missing))}`);
    }
  });
```

**Step 2: Export from commands index**

Add to `apps/cli/src/commands/index.ts`:
```typescript
export { pluginsCommand } from './plugins';
```

**Step 3: Register in main CLI**

Add to `apps/cli/src/index.ts`:
```typescript
import { pluginsCommand } from './commands';
// ...
program.addCommand(pluginsCommand);
```

**Step 4: Run build and test**

Run: `pnpm --filter @buoy/cli build`
Run: `node apps/cli/dist/index.js plugins list`
Run: `node apps/cli/dist/index.js plugins suggest`
Expected: Both commands work

**Step 5: Commit**

```bash
git add apps/cli/src/commands/plugins.ts
git add apps/cli/src/commands/index.ts
git add apps/cli/src/index.ts
git commit -m "feat(cli): add 'buoy plugins' command for listing and suggesting plugins"
```

---

## Success Criteria Checklist

- [ ] Plugin interface defined in `@buoy/core`
- [ ] Plugin loader discovers `@buoy/plugin-*` from package.json
- [ ] `buoy init` detects frameworks and suggests plugins
- [ ] `buoy plugins list` shows installed plugins
- [ ] `buoy plugins suggest` recommends plugins based on detection
- [ ] `@buoy/plugin-react` works as standalone package
- [ ] `buoy sweep` uses plugins when available, falls back to bundled

---

## Next Phase Preview

After Phase 1, Phase 2 will add the `buoy lighthouse` command with JSON output and exit codes, preparing for the GitHub Action.
