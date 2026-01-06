# No Dead Ends UX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make every Buoy command provide useful insights, even when primary results are empty.

**Architecture:** Create a shared `ProjectInsights` module that wraps `ProjectDetector` and provides formatted discovery data. All commands call this when primary results are empty, ensuring consistent "fallback insight" behavior across the CLI.

**Tech Stack:** TypeScript, Commander.js, Chalk, @inquirer/prompts (new dependency)

---

## Task 1: Create ProjectInsights Module

**Files:**
- Create: `apps/cli/src/insights/project-insights.ts`
- Create: `apps/cli/src/insights/index.ts`

**Step 1: Create the insights directory and index**

```typescript
// apps/cli/src/insights/index.ts
export * from './project-insights.js';
```

**Step 2: Create ProjectInsights class**

```typescript
// apps/cli/src/insights/project-insights.ts
import chalk from 'chalk';
import { ProjectDetector, type DetectedProject } from '../detect/project-detector.js';

export interface ProjectInsights {
  project: DetectedProject;
  summary: InsightSummary;
  suggestions: Suggestion[];
}

export interface InsightSummary {
  frameworkLine: string;           // "Astro + TypeScript"
  fileBreakdown: FileBreakdown[];  // [{type: 'Astro components', count: 66, path: 'src/'}]
  tokenSummary: string | null;     // "2 spacing values, 1 radius"
  scannerStatus: ScannerStatus[];  // Which scanners match vs don't
}

export interface FileBreakdown {
  type: string;
  count: number;
  path: string;
  scannable: boolean;  // Whether we have a scanner for this
}

export interface ScannerStatus {
  name: string;
  available: boolean;
  reason: string;  // "Found tailwindcss in package.json" or "No React/Vue/Svelte detected"
}

export interface Suggestion {
  command: string;
  description: string;
  reason: string;
}

/**
 * Discover everything about a project and format it for display.
 * This is the "always show something" layer.
 */
export async function discoverProject(cwd: string = process.cwd()): Promise<ProjectInsights> {
  const detector = new ProjectDetector(cwd);
  const project = await detector.detect();

  const summary = buildSummary(project);
  const suggestions = buildSuggestions(project, summary);

  return { project, summary, suggestions };
}

function buildSummary(project: DetectedProject): InsightSummary {
  // Framework line
  let frameworkLine = 'Unknown project type';
  if (project.frameworks.length > 0) {
    const primary = project.frameworks[0]!;
    const ts = primary.typescript ? ' + TypeScript' : '';
    const version = primary.version !== 'unknown' ? ` ${primary.version}` : '';
    frameworkLine = `${capitalize(primary.name)}${ts}${version}`;
  }

  // File breakdown from component locations
  const fileBreakdown: FileBreakdown[] = [];
  const scannableTypes = ['jsx', 'tsx', 'vue', 'svelte', 'angular'];

  for (const loc of project.components) {
    fileBreakdown.push({
      type: getTypeLabel(loc.type),
      count: loc.fileCount,
      path: loc.path,
      scannable: scannableTypes.includes(loc.type || ''),
    });
  }

  // Token summary
  let tokenSummary: string | null = null;
  if (project.tokens.length > 0) {
    const tokenTypes = project.tokens.map(t => t.type);
    const hasCss = tokenTypes.includes('css') || tokenTypes.includes('scss');
    const hasTailwind = tokenTypes.includes('tailwind');

    const parts: string[] = [];
    if (hasTailwind) parts.push('Tailwind config');
    if (hasCss) parts.push(`${project.tokens.filter(t => t.type === 'css' || t.type === 'scss').length} CSS file(s)`);
    tokenSummary = parts.join(', ');
  }

  // Scanner status
  const scannerStatus: ScannerStatus[] = [];

  // Check component scanners
  const hasReact = project.frameworks.some(f => ['react', 'nextjs', 'remix', 'gatsby'].includes(f.name));
  const hasVue = project.frameworks.some(f => ['vue', 'nuxt'].includes(f.name));
  const hasSvelte = project.frameworks.some(f => ['svelte', 'sveltekit'].includes(f.name));
  const hasAngular = project.frameworks.some(f => f.name === 'angular');
  const hasAstro = project.frameworks.some(f => f.name === 'astro');
  const hasLit = project.frameworks.some(f => f.name === 'lit');

  if (hasReact) scannerStatus.push({ name: 'React', available: true, reason: 'React detected' });
  if (hasVue) scannerStatus.push({ name: 'Vue', available: true, reason: 'Vue detected' });
  if (hasSvelte) scannerStatus.push({ name: 'Svelte', available: true, reason: 'Svelte detected' });
  if (hasAngular) scannerStatus.push({ name: 'Angular', available: true, reason: 'Angular detected' });

  // Unsupported but detected
  if (hasAstro) scannerStatus.push({ name: 'Astro', available: false, reason: 'Astro scanner coming soon' });
  if (hasLit) scannerStatus.push({ name: 'Lit', available: false, reason: 'Lit scanner coming soon' });

  // Tailwind
  const hasTailwind = project.designSystem?.type === 'tailwind' || project.tokens.some(t => t.type === 'tailwind');
  if (hasTailwind) {
    scannerStatus.push({ name: 'Tailwind', available: true, reason: 'Tailwind config found' });
  }

  return { frameworkLine, fileBreakdown, tokenSummary, scannerStatus };
}

function buildSuggestions(project: DetectedProject, summary: InsightSummary): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // If no scannable components but files exist
  const hasUnscannable = summary.fileBreakdown.some(f => !f.scannable && f.count > 0);
  const hasScannable = summary.fileBreakdown.some(f => f.scannable && f.count > 0);

  if (hasUnscannable && !hasScannable) {
    suggestions.push({
      command: 'buoy audit',
      description: 'Analyze CSS values in your codebase',
      reason: 'Component scanning not available for your framework, but CSS analysis works everywhere',
    });
  }

  // If tokens exist
  if (project.tokens.length > 0) {
    suggestions.push({
      command: 'buoy tokens',
      description: 'Extract and formalize design tokens',
      reason: `Found ${project.tokens.length} potential token source(s)`,
    });
  }

  // Always suggest explain for specific files
  if (summary.fileBreakdown.length > 0) {
    const firstPath = summary.fileBreakdown[0]!.path;
    suggestions.push({
      command: `buoy explain ${firstPath}`,
      description: 'AI-powered investigation of your code',
      reason: 'Works on any file type',
    });
  }

  return suggestions;
}

function getTypeLabel(type: string | undefined): string {
  const labels: Record<string, string> = {
    jsx: 'React components',
    tsx: 'React components',
    vue: 'Vue components',
    svelte: 'Svelte components',
    angular: 'Angular components',
    astro: 'Astro components',
    lit: 'Lit elements',
    blade: 'Blade templates',
    erb: 'ERB templates',
    twig: 'Twig templates',
    svg: 'SVG components',
  };
  return labels[type || ''] || `${type || 'Unknown'} files`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

**Step 3: Run typecheck**

```bash
pnpm --filter @buoy-design/cli build
```

Expected: Build succeeds

**Step 4: Commit**

```bash
git add apps/cli/src/insights/
git commit -m "feat(cli): add ProjectInsights module for fallback discovery"
```

---

## Task 2: Add Insight Formatting Functions

**Files:**
- Modify: `apps/cli/src/insights/project-insights.ts`

**Step 1: Add formatting functions**

Add to the end of `project-insights.ts`:

```typescript
/**
 * Format insights for CLI display.
 * Used by commands when primary results are empty.
 */
export function formatInsightsBlock(insights: ProjectInsights): string {
  const lines: string[] = [];
  const { summary, suggestions } = insights;

  // Header
  lines.push(chalk.bold('Your Codebase at a Glance'));
  lines.push(chalk.dim('─'.repeat(30)));
  lines.push('');

  // Framework
  lines.push(`  Framework:  ${chalk.cyan(summary.frameworkLine)}`);

  // File breakdown
  if (summary.fileBreakdown.length > 0) {
    lines.push('');
    lines.push('  ' + chalk.dim('Files found:'));
    for (const fb of summary.fileBreakdown) {
      const icon = fb.scannable ? chalk.green('✓') : chalk.yellow('○');
      const scanNote = fb.scannable ? '' : chalk.dim(' (no scanner yet)');
      lines.push(`    ${icon} ${fb.count} ${fb.type} in ${fb.path}${scanNote}`);
    }
  }

  // Token summary
  if (summary.tokenSummary) {
    lines.push('');
    lines.push(`  Tokens:     ${summary.tokenSummary}`);
  }

  // Scanner status
  const unavailable = summary.scannerStatus.filter(s => !s.available);
  if (unavailable.length > 0) {
    lines.push('');
    lines.push('  ' + chalk.dim('Scanner status:'));
    for (const s of unavailable) {
      lines.push(`    ${chalk.yellow('○')} ${s.name}: ${chalk.dim(s.reason)}`);
    }
  }

  // Suggestions
  if (suggestions.length > 0) {
    lines.push('');
    lines.push(chalk.dim('─'.repeat(30)));
    lines.push('');
    lines.push('  ' + chalk.bold('Try instead:'));
    for (const s of suggestions.slice(0, 3)) {
      lines.push(`    ${chalk.cyan(s.command)}`);
      lines.push(`    ${chalk.dim(s.description)}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Format a compact one-line summary for headers.
 */
export function formatInsightsSummaryLine(insights: ProjectInsights): string {
  const { summary } = insights;
  const fileCount = summary.fileBreakdown.reduce((sum, fb) => sum + fb.count, 0);
  return `${summary.frameworkLine} · ${fileCount} files`;
}
```

**Step 2: Build and verify**

```bash
pnpm --filter @buoy-design/cli build
```

**Step 3: Commit**

```bash
git add apps/cli/src/insights/project-insights.ts
git commit -m "feat(cli): add insight formatting functions"
```

---

## Task 3: Update `buoy sweep` Command

**Files:**
- Modify: `apps/cli/src/commands/scan.ts`

**Step 1: Import insights module**

At the top of scan.ts, add:

```typescript
import { discoverProject, formatInsightsBlock } from '../insights/index.js';
```

**Step 2: Update empty results handling**

Find the section around line 159-187 that handles output. Replace the empty case with insight display:

```typescript
        // Output results
        if (options.json) {
          console.log(
            JSON.stringify(
              {
                components: results.components,
                tokens: results.tokens,
                errors: results.errors.map(
                  (e) => `[${e.source}] ${e.file || ""}: ${e.message}`,
                ),
              },
              null,
              2,
            ),
          );
          return;
        }

        header("Scan Results");
        newline();

        // If we found nothing, show insights instead of bare zeros
        if (results.components.length === 0 && results.tokens.length === 0) {
          console.log(chalk.dim('Components: 0 (no scanners matched your framework)'));
          console.log(chalk.dim('Tokens: 0'));
          newline();

          // Show what we DID find
          const insights = await discoverProject(process.cwd());
          console.log(formatInsightsBlock(insights));
          return;
        }

        keyValue("Components found", String(results.components.length));
        keyValue("Tokens found", String(results.tokens.length));
        keyValue("Errors", String(results.errors.length));
        newline();
```

**Step 3: Build and test**

```bash
pnpm --filter @buoy-design/cli build
```

Test manually in a non-React project:
```bash
cd /tmp && mkdir test-astro && cd test-astro
echo '{"dependencies":{"astro":"^4.0.0"}}' > package.json
mkdir -p src/components
touch src/components/Header.astro
node ~/dev/buoy/apps/cli/dist/bin.js scan
```

Expected: Shows "Your Codebase at a Glance" with Astro files listed

**Step 4: Commit**

```bash
git add apps/cli/src/commands/scan.ts
git commit -m "feat(cli): show project insights when scan finds nothing"
```

---

## Task 4: Update `buoy sweep` Command

**Files:**
- Modify: `apps/cli/src/commands/status.ts`

**Step 1: Import insights module**

Add to imports:

```typescript
import { discoverProject, formatInsightsBlock } from '../insights/index.js';
```

**Step 2: Update empty state handling**

Find the section around line 159-175 that handles `stats.total === 0`. Replace with:

```typescript
        if (stats.total === 0) {
          // Show insights instead of bare "no components"
          const insights = await discoverProject(process.cwd());

          console.log(chalk.bold('Design System Status'));
          console.log(chalk.dim('────────────────────'));
          newline();
          console.log(`Coverage: ${chalk.dim('N/A')} (no component scanners active)`);
          newline();
          console.log(formatInsightsBlock(insights));
          return;
        }
```

**Step 3: Build and test**

```bash
pnpm --filter @buoy-design/cli build
node ~/dev/buoy/apps/cli/dist/bin.js status
```

**Step 4: Commit**

```bash
git add apps/cli/src/commands/status.ts
git commit -m "feat(cli): show project insights when status has no components"
```

---

## Task 5: Update `buoy explain` Command

**Files:**
- Modify: `apps/cli/src/commands/explain.ts`

**Step 1: Import insights**

Add to imports:

```typescript
import { discoverProject, formatInsightsBlock } from '../insights/index.js';
```

**Step 2: Update no-target empty state**

Find the section around line 40-46 where it returns early for no drift. Replace with:

```typescript
        if (!target) {
          // No drift found - but show what we know about the codebase
          const insights = await discoverProject(process.cwd());

          console.log(formatInsightsBlock(insights));
          newline();
          console.log(chalk.green('✓') + ' No drift detected in scannable components.');
          newline();
          info("To investigate specific code, try:");

          // Suggest based on actual files found
          if (insights.summary.fileBreakdown.length > 0) {
            const firstPath = insights.summary.fileBreakdown[0]!.path;
            console.log(chalk.gray(`  buoy explain ${firstPath}`));
          } else {
            console.log(chalk.gray("  buoy explain src/components/Button.tsx"));
          }
          console.log(chalk.gray("  buoy explain src/"));
          return;
        }
```

**Step 3: Build and test**

```bash
pnpm --filter @buoy-design/cli build
node ~/dev/buoy/apps/cli/dist/bin.js explain
```

**Step 4: Commit**

```bash
git add apps/cli/src/commands/explain.ts
git commit -m "feat(cli): show project insights when explain has no drift"
```

---

## Task 6: Add Interactive Prompts (TTY Mode)

**Files:**
- Create: `apps/cli/src/insights/interactive.ts`
- Modify: `apps/cli/src/insights/index.ts`

**Step 1: Add @inquirer/prompts dependency**

```bash
cd /Users/dylantarre/dev/buoy
pnpm --filter @buoy-design/cli add @inquirer/prompts
```

**Step 2: Create interactive module**

```typescript
// apps/cli/src/insights/interactive.ts
import { select } from '@inquirer/prompts';
import type { ProjectInsights, Suggestion } from './project-insights.js';

/**
 * Check if we're in an interactive TTY session.
 */
export function isTTY(): boolean {
  return process.stdout.isTTY === true && process.stdin.isTTY === true;
}

/**
 * Present interactive choices based on insights.
 * Returns the selected command to run, or null if skipped.
 */
export async function promptNextAction(insights: ProjectInsights): Promise<string | null> {
  if (!isTTY()) {
    return null;
  }

  const choices = insights.suggestions.slice(0, 4).map(s => ({
    name: `${s.command} - ${s.description}`,
    value: s.command,
  }));

  choices.push({
    name: 'Skip for now',
    value: '',
  });

  try {
    const answer = await select({
      message: 'Would you like to try one of these?',
      choices,
    });
    return answer || null;
  } catch {
    // User cancelled (Ctrl+C)
    return null;
  }
}
```

**Step 3: Export from index**

```typescript
// apps/cli/src/insights/index.ts
export * from './project-insights.js';
export * from './interactive.js';
```

**Step 4: Build and verify**

```bash
pnpm --filter @buoy-design/cli build
```

**Step 5: Commit**

```bash
git add apps/cli/src/insights/ pnpm-lock.yaml apps/cli/package.json
git commit -m "feat(cli): add interactive prompts for next actions"
```

---

## Task 7: Wire Interactive Prompts into Commands

**Files:**
- Modify: `apps/cli/src/commands/scan.ts`
- Modify: `apps/cli/src/commands/status.ts`

**Step 1: Update scan.ts imports**

```typescript
import { discoverProject, formatInsightsBlock, promptNextAction, isTTY } from '../insights/index.js';
```

**Step 2: Add prompt after insights in scan.ts**

After `console.log(formatInsightsBlock(insights));`, add:

```typescript
          // Offer interactive next step if TTY
          if (isTTY()) {
            const nextCmd = await promptNextAction(insights);
            if (nextCmd) {
              console.log(chalk.dim(`\nRunning: ${nextCmd}\n`));
              // Import and run the command dynamically
              const { execSync } = await import('child_process');
              execSync(nextCmd, { stdio: 'inherit', cwd: process.cwd() });
            }
          }
          return;
```

**Step 3: Do the same for status.ts**

Add after the `formatInsightsBlock` call in status.ts:

```typescript
          // Offer interactive next step if TTY
          if (isTTY()) {
            const nextCmd = await promptNextAction(insights);
            if (nextCmd) {
              console.log(chalk.dim(`\nRunning: ${nextCmd}\n`));
              const { execSync } = await import('child_process');
              execSync(nextCmd, { stdio: 'inherit', cwd: process.cwd() });
            }
          }
          return;
```

**Step 4: Build and test interactively**

```bash
pnpm --filter @buoy-design/cli build
node ~/dev/buoy/apps/cli/dist/bin.js scan
```

Expected: Shows insights, then prompts with arrow keys to select next action

**Step 5: Commit**

```bash
git add apps/cli/src/commands/scan.ts apps/cli/src/commands/status.ts
git commit -m "feat(cli): wire interactive prompts into scan and status commands"
```

---

## Task 8: Test All Commands End-to-End

**Step 1: Create test scenarios**

Test in a React project:
```bash
cd ~/dev/buoy  # or any React project
node apps/cli/dist/bin.js scan
node apps/cli/dist/bin.js status
node apps/cli/dist/bin.js explain
```

Expected: Normal output with components found

Test in an Astro project (no scanner):
```bash
cd /path/to/astro-project
buoy sweep
buoy sweep
buoy explain
```

Expected: Shows "Your Codebase at a Glance" with Astro files, suggests alternatives

Test in CI mode (non-TTY):
```bash
echo "" | node apps/cli/dist/bin.js scan
```

Expected: Shows insights but no interactive prompt

**Step 2: Verify JSON mode still works**

```bash
node apps/cli/dist/bin.js scan --json
node apps/cli/dist/bin.js status --json
```

Expected: Clean JSON output, no insights text mixed in

**Step 3: Final commit**

```bash
git add -A
git commit -m "test: verify no-dead-ends UX across all commands"
```

---

## Summary

After completing all tasks:

1. ✅ `buoy sweep` shows project insights when no components found
2. ✅ `buoy sweep` shows project insights when no components found
3. ✅ `buoy explain` shows project insights when no drift found
4. ✅ Interactive prompts guide users to next actions (TTY only)
5. ✅ JSON mode unaffected
6. ✅ CI/pipe mode works (no prompts, just insights)

Total new code: ~200 lines in `insights/` module, ~50 lines per command update.
