/**
 * buoy begin - Interactive wizard for new users.
 *
 * Explains what Buoy does, scans the project, and guides users through setup
 * with clear, jargon-free language.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { checkbox } from '@inquirer/prompts';
import { loadConfig, getConfigPath } from '../config/loader.js';
import { buildAutoConfig } from '../config/auto-detect.js';
import { spinner, error as errorLog } from '../output/reporters.js';
import { ScanOrchestrator } from '../scan/orchestrator.js';
import { ProjectDetector } from '../detect/project-detector.js';
import type { BuoyConfig } from '../config/schema.js';
import type { DriftSignal, Component } from '@buoy-design/core';
import {
  showMenu,
  success,
} from '../wizard/menu.js';
import { reviewIssues } from '../wizard/issue-reviewer.js';
import { setupCI } from '../wizard/ci-generator.js';
import { setupAIGuardrails } from '../wizard/ai-guardrails-generator.js';

type MenuAction =
  | 'quick-scan'
  | 'review-issues'
  | 'setup-prevention'
  | 'learn-more'
  | 'exit';

interface WizardState {
  configSaved: boolean;
  ciSetup: boolean;
  aiGuardrailsSetup: boolean;
  hasScanned: boolean;
  issuesReviewed: boolean;
}

export function createBeginCommand(): Command {
  return new Command('begin')
    .description('Interactive wizard to get started with Buoy')
    .action(async () => {
      // Check if we're in an interactive terminal
      if (!process.stdin.isTTY) {
        // Output AI-friendly guide so the AI can walk the user through it
        printAIGuide();
        return;
      }

      const cwd = process.cwd();

      // Welcome with clear explanation
      console.log('');
      console.log(chalk.cyan.bold('🛟  Welcome to Buoy'));
      console.log('');
      console.log(chalk.dim('  Buoy catches inconsistencies in your code before they ship.'));
      console.log('');
      console.log(chalk.dim('  Examples of what it finds:'));
      console.log(`    ${chalk.yellow('•')} Hardcoded colors like ${chalk.yellow('#3b82f6')} instead of design tokens`);
      console.log(`    ${chalk.yellow('•')} Magic numbers like ${chalk.yellow('padding: 17px')} instead of spacing variables`);
      console.log(`    ${chalk.yellow('•')} AI-generated code that ignores your team's patterns`);
      console.log('');
      console.log(chalk.dim('  Think of it like a linter, but for design consistency.'));
      console.log('');

      // Initialize state
      const state: WizardState = {
        configSaved: !!getConfigPath(),
        ciSetup: existsSync(join(cwd, '.github', 'workflows', 'buoy.yml')) ||
                 existsSync(join(cwd, '.gitlab-ci.yml')),
        aiGuardrailsSetup: existsSync(join(cwd, '.claude', 'skills', 'design-system', 'SKILL.md')),
        hasScanned: false,
        issuesReviewed: false,
      };

      // Main menu loop
      await menuLoop(cwd, state);

      // Exit message
      showExitMessage();
    });
}

/**
 * Scan the project and show results in a user-friendly way.
 */
async function runScan(cwd: string): Promise<{
  components: Component[];
  drifts: DriftSignal[];
  config: BuoyConfig;
  projectInfo: Awaited<ReturnType<ProjectDetector['detect']>>;
  autoResult: Awaited<ReturnType<typeof buildAutoConfig>> | undefined;
}> {
  const spin = spinner('Looking at your project...');

  try {
    // Load or auto-detect config
    const existingConfig = getConfigPath();
    let config: BuoyConfig;
    let autoResult: Awaited<ReturnType<typeof buildAutoConfig>> | undefined;

    if (existingConfig) {
      const result = await loadConfig();
      config = result.config;
    } else {
      autoResult = await buildAutoConfig(cwd);
      config = autoResult.config;
    }

    // Run scan
    const orchestrator = new ScanOrchestrator(config);
    const { components } = await orchestrator.scanComponents({
      onProgress: (msg) => {
        spin.text = msg;
      },
    });

    // Detect frameworks
    spin.text = 'Detecting frameworks...';
    const detector = new ProjectDetector(cwd);
    const projectInfo = await detector.detect();

    // Run drift analysis
    spin.text = 'Analyzing for drift...';
    const { SemanticDiffEngine } = await import('@buoy-design/core/analysis');
    const engine = new SemanticDiffEngine();
    const diffResult = engine.analyzeComponents(components, {
      checkDeprecated: true,
      checkNaming: true,
      checkDocumentation: true,
    });

    const drifts: DriftSignal[] = [...diffResult.drifts];

    // Check framework sprawl
    const sprawlSignal = engine.checkFrameworkSprawl(
      projectInfo.frameworks.map(f => ({ name: f.name, version: f.version }))
    );
    if (sprawlSignal) {
      drifts.push(sprawlSignal);
    }

    spin.stop();
    return { components, drifts, config, projectInfo, autoResult };
  } catch (err) {
    spin.stop();
    throw err;
  }
}

/**
 * Show scan results in a friendly way with clear transparency.
 */
function showScanResults(
  components: Component[],
  drifts: DriftSignal[],
  projectInfo: Awaited<ReturnType<ProjectDetector['detect']>>
): void {
  console.log('');
  console.log(chalk.bold('  Scan Results'));
  console.log('');

  // Framework detection
  if (projectInfo.frameworks.length > 0) {
    const frameworkNames = projectInfo.frameworks.map(f => f.name).join(', ');
    console.log(`  ${chalk.green('✓')} Detected: ${chalk.cyan(frameworkNames)}`);
  }

  // Components - be transparent about what was scanned
  if (components.length > 0) {
    console.log(`  ${chalk.green('✓')} Scanned ${components.length} component${components.length === 1 ? '' : 's'}`);
  } else {
    console.log(`  ${chalk.yellow('○')} No components found to scan`);
    console.log(chalk.dim('    Tip: Run buoy scan --verbose to see what paths are being searched'));
  }

  // Drift summary - clearer language about severity
  const critical = drifts.filter(d => d.severity === 'critical').length;
  const warning = drifts.filter(d => d.severity === 'warning').length;
  const total = drifts.length;

  console.log('');
  if (components.length === 0) {
    console.log(chalk.dim('  (No components to analyze for drift)'));
  } else if (total === 0) {
    console.log(`  ${chalk.green('✓')} No drift detected — your code follows consistent patterns!`);
  } else {
    console.log(`  ${chalk.yellow('!')} Found ${total} inconsistenc${total === 1 ? 'y' : 'ies'}:`);
    if (critical > 0) {
      console.log(`    ${chalk.red('•')} ${critical} ${chalk.red('should fix')} — hardcoded values that bypass design tokens`);
    }
    if (warning > 0) {
      console.log(`    ${chalk.yellow('•')} ${warning} ${chalk.yellow('could improve')} — naming or pattern suggestions`);
    }
  }
  console.log('');
}

/**
 * Main menu loop with clear, jargon-free options.
 */
async function menuLoop(
  cwd: string,
  state: WizardState
): Promise<void> {
  let scanResult: Awaited<ReturnType<typeof runScan>> | undefined;

  while (true) {
    const action = await showMainMenu(state, scanResult);

    switch (action) {
      case 'quick-scan': {
        try {
          scanResult = await runScan(cwd);
          state.hasScanned = true;
          showScanResults(scanResult.components, scanResult.drifts, scanResult.projectInfo);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errorLog(`Scan failed: ${message}`);
        }
        break;
      }

      case 'review-issues': {
        if (!scanResult) {
          console.log(chalk.yellow('\n  Run a scan first to see issues.\n'));
          break;
        }
        if (scanResult.drifts.length === 0) {
          console.log(chalk.green('\n  No issues to review!\n'));
          break;
        }
        const result = await reviewIssues(scanResult.drifts);
        if (result.completed) {
          state.issuesReviewed = true;
        }
        break;
      }

      case 'setup-prevention': {
        await showPreventionOptions(cwd, scanResult?.config, state);
        break;
      }

      case 'learn-more': {
        showLearnMore();
        break;
      }

      case 'exit':
        return;
    }
  }
}

/**
 * Show the main menu with friendly options and clear next steps.
 */
async function showMainMenu(
  state: WizardState,
  scanResult?: Awaited<ReturnType<typeof runScan>>
): Promise<MenuAction> {
  const options: Array<{ label: string; value: MenuAction; description?: string }> = [];

  if (!state.hasScanned) {
    // First time: simple choice
    options.push({
      label: 'Scan my project',
      value: 'quick-scan',
      description: 'Find inconsistencies in your code',
    });

    options.push({
      label: 'Learn more first',
      value: 'learn-more',
      description: 'What is design drift and why does it matter?',
    });
  } else {
    // After scan: context-aware options
    const issueCount = scanResult?.drifts.length ?? 0;

    if (issueCount > 0 && !state.issuesReviewed) {
      // Issues found - make review the primary action
      options.push({
        label: `Review ${issueCount} issue${issueCount === 1 ? '' : 's'} found`,
        value: 'review-issues',
        description: 'See the problems and how to fix them',
      });
    }

    // Offer prevention setup with clearer description
    if (!state.ciSetup && !state.aiGuardrailsSetup) {
      options.push({
        label: 'Prevent future drift',
        value: 'setup-prevention',
        description: 'Add CI checks or help AI tools follow your patterns',
      });
    }

    // Re-scan only if useful (e.g., after making changes)
    if (state.issuesReviewed || issueCount === 0) {
      options.push({
        label: 'Scan again',
        value: 'quick-scan',
        description: 'Check if anything changed',
      });
    }
  }

  options.push({
    label: 'Exit',
    value: 'exit',
    description: state.hasScanned ? 'Done for now' : undefined,
  });

  return showMenu<MenuAction>('What next?', options);
}

/**
 * Show prevention setup options (CI, AI guardrails, config).
 */
async function showPreventionOptions(
  cwd: string,
  config: BuoyConfig | undefined,
  state: WizardState
): Promise<void> {
  console.log('');
  console.log(chalk.bold('  Ways to prevent drift:'));
  console.log('');
  console.log(chalk.dim('  Choose how you want Buoy to catch issues:'));
  console.log('');

  type PreventionAction = 'ci' | 'ai' | 'config' | 'back';
  const options: Array<{ label: string; value: PreventionAction; description?: string }> = [];

  if (!state.aiGuardrailsSetup) {
    options.push({
      label: 'Set up AI guardrails',
      value: 'ai',
      description: 'Help Copilot & Claude follow your design system',
    });
  } else {
    options.push({
      label: 'AI guardrails configured ✓',
      value: 'ai',
      description: 'View or update AI settings',
    });
  }

  if (!state.ciSetup) {
    options.push({
      label: 'Add to CI/CD pipeline',
      value: 'ci',
      description: 'Block PRs that introduce drift (GitHub Actions, etc.)',
    });
  } else {
    options.push({
      label: 'CI/CD already configured ✓',
      value: 'ci',
      description: 'View or update your CI setup',
    });
  }

  if (!state.configSaved) {
    options.push({
      label: 'Save configuration',
      value: 'config',
      description: 'Customize what Buoy scans and ignores',
    });
  }

  options.push({
    label: 'Back to main menu',
    value: 'back',
  });

  const action = await showMenu<PreventionAction>('Prevention options:', options);

  switch (action) {
    case 'ci':
      await setupCI(cwd);
      state.ciSetup = true;
      break;
    case 'ai':
      if (config) {
        const result = await setupAIGuardrails(cwd, config);
        if (result.skillExported || result.contextGenerated) {
          state.aiGuardrailsSetup = true;
        }
      } else {
        console.log(chalk.yellow('\n  Run a scan first to set up AI guardrails.\n'));
      }
      break;
    case 'config':
      if (config) {
        await saveConfiguration(cwd, config);
        state.configSaved = true;
      } else {
        console.log(chalk.yellow('\n  Run a scan first to save configuration.\n'));
      }
      break;
    case 'back':
      break;
  }
}

/**
 * Save configuration flow.
 */
async function saveConfiguration(
  cwd: string,
  config: BuoyConfig
): Promise<void> {
  console.log('');
  console.log(chalk.bold('  Save Configuration'));
  console.log('');
  console.log(chalk.dim('  A config file lets you customize what Buoy scans.'));
  console.log('');

  const action = await showMenu<'save' | 'customize' | 'skip'>('Save buoy.config.mjs?', [
    { label: 'Save with defaults', value: 'save', description: 'Use auto-detected settings' },
    { label: 'Customize first', value: 'customize', description: 'Choose what to exclude' },
    { label: 'Skip for now', value: 'skip' },
  ]);

  if (action === 'skip') {
    return;
  }

  let finalConfig = config;

  if (action === 'customize') {
    finalConfig = await customizeConfig(config);
  }

  // Write config file
  const configPath = join(cwd, 'buoy.config.mjs');
  const configContent = generateConfigFile(finalConfig);
  writeFileSync(configPath, configContent);

  console.log('');
  success('Created buoy.config.mjs');
  console.log('');
}

/**
 * Customize configuration interactively.
 */
async function customizeConfig(config: BuoyConfig): Promise<BuoyConfig> {
  console.log('');
  console.log(chalk.bold('  Customize Configuration'));
  console.log('');

  const excludePaths = [
    'tests/**/*',
    '**/*.test.*',
    '**/*.spec.*',
    'stories/**/*',
    '**/*.stories.*',
  ];

  const selectedExcludes = await checkbox({
    message: 'Exclude from scanning:',
    choices: excludePaths.map(p => ({
      name: p,
      value: p,
      checked: true,
    })),
  });

  // Update config with exclusions
  const existingReact = config.sources.react;
  const updatedConfig: BuoyConfig = {
    ...config,
    sources: {
      ...config.sources,
      react: {
        enabled: existingReact?.enabled ?? true,
        include: existingReact?.include ?? ['src/**/*.tsx'],
        exclude: selectedExcludes,
        designSystemPackage: existingReact?.designSystemPackage,
      },
    },
  };

  return updatedConfig;
}

/**
 * Generate config file content.
 */
function generateConfigFile(config: BuoyConfig): string {
  return `/** @type {import('@buoy-design/cli').BuoyConfig} */
export default ${JSON.stringify(config, null, 2)};
`;
}

/**
 * Show learn more section - explains drift in plain language.
 */
function showLearnMore(): void {
  console.log('');
  console.log(chalk.bold('  What is Design Drift?'));
  console.log('');
  console.log(chalk.dim('  When you have a design system, you want code to follow it.'));
  console.log(chalk.dim('  But over time, inconsistencies creep in:'));
  console.log('');
  console.log(`    ${chalk.red('•')} Someone writes ${chalk.yellow('color: #3b82f6')} instead of using your blue token`);
  console.log(`    ${chalk.red('•')} A developer uses ${chalk.yellow('padding: 17px')} instead of your 4px spacing scale`);
  console.log(`    ${chalk.red('•')} AI tools generate code that ignores your design system`);
  console.log('');
  console.log(chalk.dim('  This is "design drift" — and it adds up fast.'));
  console.log('');
  console.log(chalk.bold('  How Buoy Helps'));
  console.log('');
  console.log(`    ${chalk.green('1.')} ${chalk.cyan('Scan')} your code to find drift`);
  console.log(`    ${chalk.green('2.')} ${chalk.cyan('Review')} issues and see suggested fixes`);
  console.log(`    ${chalk.green('3.')} ${chalk.cyan('Prevent')} future drift with CI checks and AI guardrails`);
  console.log('');
  console.log(chalk.dim(`  Docs: ${chalk.cyan('https://buoy.design/docs')}`));
  console.log('');
}

/**
 * Show exit message.
 */
function showExitMessage(): void {
  console.log('');
  console.log(chalk.green('  ✓ You\'re all set!'));
  console.log('');
  console.log(chalk.dim('  Quick commands:'));
  console.log(`    ${chalk.cyan('buoy scan')}     Scan for drift`);
  console.log(`    ${chalk.cyan('buoy status')}   Quick health overview`);
  console.log(`    ${chalk.cyan('buoy check')}    Pre-commit validation`);
  console.log('');
  console.log(chalk.dim(`  Run ${chalk.cyan('buoy begin')} anytime to return here.`));
  console.log('');
}

/**
 * Print an AI-friendly guide so AI assistants can walk users through the wizard.
 */
function printAIGuide(): void {
  console.log(`
# Buoy Setup Guide (for AI Assistants)

Walk the user through these steps conversationally.

## Step 1: Explain What Buoy Does

Tell the user:
"Buoy catches design drift — when code diverges from your design system.
For example:
- Hardcoded colors like #3b82f6 instead of design tokens
- Magic numbers like padding: 17px instead of spacing variables
- AI-generated code that ignores your team's patterns"

## Step 2: Scan the Project

Run: buoy status

This shows:
- What frameworks were detected
- How many components were found
- Any drift issues

Share the results with the user and explain what they mean.

## Step 3: Ask What They'd Like to Do

Based on the scan results, offer these options:

A) **Review issues** (if drift was found)
   Run: buoy drift check
   Walk through each issue and explain the fix

B) **Set up AI guardrails** (recommended)
   Run: buoy skill export
   This creates a skill file that helps AI tools follow their design system

C) **Add to CI/CD**
   Run: buoy ci --init
   Generates GitHub Actions or GitLab CI config

D) **Save configuration**
   Run: buoy init
   Creates buoy.config.mjs with detected settings

## Step 4: Wrap Up

After completing their chosen action, remind them:
- \`buoy scan\` - Scan for drift anytime
- \`buoy check\` - Quick pre-commit validation
- \`buoy status\` - Health overview

## Commands Reference

| Command | Purpose |
|---------|---------|
| buoy status | Quick health overview (start here) |
| buoy scan | Full component scan |
| buoy drift check | Detailed drift report |
| buoy skill export | Generate AI skill file |
| buoy context | Generate CLAUDE.md section |
| buoy init | Save configuration |
| buoy ci --init | Set up CI/CD |
`);
}
