/**
 * buoy begin - Interactive wizard for new users.
 *
 * Runs a scan, shows results, and guides users through setup.
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
  sectionHeader,
  success,
  info,
  bulletList,
  keyValue,
} from '../wizard/menu.js';
import { reviewIssues } from '../wizard/issue-reviewer.js';
import { setupCI } from '../wizard/ci-generator.js';
import { setupAIGuardrails } from '../wizard/ai-guardrails-generator.js';

type MenuAction =
  | 'review-critical'
  | 'review-all'
  | 'save-config'
  | 'setup-ci'
  | 'setup-ai-guardrails'
  | 'learn-more'
  | 'exit';

interface WizardState {
  configSaved: boolean;
  ciSetup: boolean;
  aiGuardrailsSetup: boolean;
  criticalReviewed: boolean;
  allReviewed: boolean;
}

export function createBeginCommand(): Command {
  return new Command('begin')
    .description('Interactive wizard to get started with Buoy')
    .action(async () => {
      // Check if we're in an interactive terminal
      if (!process.stdin.isTTY) {
        console.log('');
        console.log(chalk.yellow('buoy begin requires an interactive terminal.'));
        console.log('');
        console.log('Try these commands instead:');
        console.log(`  ${chalk.cyan('buoy status')}       See health at a glance`);
        console.log(`  ${chalk.cyan('buoy drift check')} Detailed drift report`);
        console.log('');
        return;
      }

      const cwd = process.cwd();

      // Welcome
      console.log('');
      console.log(chalk.cyan.bold('Welcome to Buoy'));
      console.log('');

      const spin = spinner('Scanning your project...');

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
        spin.text = 'Analyzing frameworks...';
        const detector = new ProjectDetector(cwd);
        const projectInfo = await detector.detect();

        // Run drift analysis
        spin.text = 'Checking for drift...';
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

        // Show overview
        showOverview(components, drifts, autoResult, projectInfo);

        // Initialize state
        const state: WizardState = {
          configSaved: !!existingConfig,
          ciSetup: existsSync(join(cwd, '.github', 'workflows', 'buoy.yml')) ||
                   existsSync(join(cwd, '.gitlab-ci.yml')),
          aiGuardrailsSetup: existsSync(join(cwd, '.claude', 'skills', 'design-system', 'SKILL.md')),
          criticalReviewed: false,
          allReviewed: false,
        };

        // Main menu loop
        await menuLoop(cwd, config, components, drifts, state, autoResult);

        // Exit message
        showExitMessage();
      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        errorLog(`Wizard failed: ${message}`);
        process.exit(1);
      }
    });
}

/**
 * Show the project overview.
 */
function showOverview(
  components: Component[],
  drifts: DriftSignal[],
  autoResult: Awaited<ReturnType<typeof buildAutoConfig>> | undefined,
  projectInfo: Awaited<ReturnType<ProjectDetector['detect']>>
): void {
  sectionHeader('Project Overview');

  // Framework detection
  if (projectInfo.frameworks.length > 0) {
    const frameworkNames = projectInfo.frameworks.map(f => f.name).join(' + ');
    keyValue('Framework', frameworkNames);
  }

  keyValue('Components', `${components.length} found`);

  if (autoResult?.tokenFiles && autoResult.tokenFiles.length > 0) {
    keyValue('Tokens', `${autoResult.tokenFiles.length} file(s) detected`);
  }

  // Health check
  sectionHeader('Health Check');

  const critical = drifts.filter(d => d.severity === 'critical').length;
  const warning = drifts.filter(d => d.severity === 'warning').length;
  const infoCount = drifts.filter(d => d.severity === 'info').length;

  // Coverage grid
  const aligned = components.filter(c =>
    !drifts.some(d => d.source.entityId === c.id)
  ).length;
  const total = components.length;
  const pct = total > 0 ? Math.round((aligned / total) * 100) : 100;

  if (total > 0) {
    const gridSize = Math.min(10, total);
    const alignedCount = Math.round((aligned / total) * gridSize);
    const grid = '⛁ '.repeat(alignedCount) + '⛀ '.repeat(gridSize - alignedCount);
    console.log(`  ${grid.trim()}    ${aligned}/${total} aligned (${pct}%)`);
  }

  console.log('');
  if (critical > 0) {
    console.log(`  ${chalk.red('Critical:')}  ${critical}`);
  }
  if (warning > 0) {
    console.log(`  ${chalk.yellow('Warning:')}   ${warning}`);
  }
  if (infoCount > 0) {
    console.log(`  ${chalk.blue('Info:')}      ${infoCount}`);
  }
  if (critical === 0 && warning === 0 && infoCount === 0) {
    console.log(chalk.green('  No issues found!'));
  }
}

/**
 * Main menu loop.
 */
async function menuLoop(
  cwd: string,
  config: BuoyConfig,
  _components: Component[],
  drifts: DriftSignal[],
  state: WizardState,
  autoResult: Awaited<ReturnType<typeof buildAutoConfig>> | undefined
): Promise<void> {
  while (true) {
    const action = await showMainMenu(drifts, state);

    switch (action) {
      case 'review-critical': {
        const result = await reviewIssues(drifts, 'critical');
        if (result.completed) {
          state.criticalReviewed = true;
        }
        if (!(await askAnythingElse())) return;
        break;
      }

      case 'review-all': {
        const result = await reviewIssues(drifts);
        if (result.completed) {
          state.allReviewed = true;
        }
        if (!(await askAnythingElse())) return;
        break;
      }

      case 'save-config': {
        await saveConfiguration(cwd, config, autoResult);
        state.configSaved = true;
        if (!(await askAnythingElse())) return;
        break;
      }

      case 'setup-ci': {
        await setupCI(cwd);
        state.ciSetup = true;
        if (!(await askAnythingElse())) return;
        break;
      }

      case 'setup-ai-guardrails': {
        const result = await setupAIGuardrails(cwd, config);
        if (result.skillExported || result.contextGenerated) {
          state.aiGuardrailsSetup = true;
        }
        if (!(await askAnythingElse())) return;
        break;
      }

      case 'learn-more': {
        showLearnMore();
        if (!(await askAnythingElse())) return;
        break;
      }

      case 'exit':
        return;
    }
  }
}

/**
 * Show the main menu with dynamic options.
 */
async function showMainMenu(
  drifts: DriftSignal[],
  state: WizardState
): Promise<MenuAction> {
  const critical = drifts.filter(d => d.severity === 'critical').length;
  const total = drifts.length;

  const options: Array<{ label: string; value: MenuAction; disabled?: boolean }> = [];

  // Critical issues (if any and not reviewed)
  if (critical > 0 && !state.criticalReviewed) {
    options.push({
      label: `Review critical issues (${critical})`,
      value: 'review-critical',
    });
  }

  // All drift (if any)
  if (total > 0 && !state.allReviewed) {
    options.push({
      label: `Review all drift (${total})`,
      value: 'review-all',
    });
  }

  // Save config (if not already)
  if (!state.configSaved) {
    options.push({
      label: 'Save configuration',
      value: 'save-config',
    });
  }

  // CI setup (if not already)
  if (!state.ciSetup) {
    options.push({
      label: 'Set up CI integration',
      value: 'setup-ci',
    });
  }

  // AI guardrails (if not already)
  if (!state.aiGuardrailsSetup) {
    options.push({
      label: 'Set up AI guardrails',
      value: 'setup-ai-guardrails',
    });
  }

  // Always show learn more
  options.push({
    label: 'Learn more about Buoy',
    value: 'learn-more',
  });

  // Always show exit
  options.push({
    label: 'Exit',
    value: 'exit',
  });

  return showMenu<MenuAction>('What would you like to do?', options);
}

/**
 * Ask "Anything else?" and return whether to continue.
 */
async function askAnythingElse(): Promise<boolean> {
  console.log('');
  const action = await showMenu<'continue' | 'exit'>('Anything else?', [
    { label: 'Yes, show menu', value: 'continue' },
    { label: 'No, exit', value: 'exit' },
  ]);
  return action === 'continue';
}

/**
 * Save configuration flow.
 */
async function saveConfiguration(
  cwd: string,
  config: BuoyConfig,
  autoResult: Awaited<ReturnType<typeof buildAutoConfig>> | undefined
): Promise<void> {
  sectionHeader('Save Configuration');

  info('Buoy works without config, but saving one lets you:');
  console.log('');
  bulletList([
    'Exclude test files and generated code',
    'Connect Figma or Storybook as sources of truth',
    'Set severity thresholds for CI',
    'Track history across your team',
  ]);
  console.log('');

  if (autoResult) {
    info('Detected settings:');
    for (const d of autoResult.detected) {
      console.log(`    ${chalk.green('•')} ${d.name} ${chalk.dim(`(${d.evidence})`)}`);
    }
    if (autoResult.tokenFiles.length > 0) {
      console.log(`    ${chalk.green('•')} ${autoResult.tokenFiles.length} token file(s)`);
    }
    console.log('');
  }

  const action = await showMenu<'save' | 'customize' | 'skip'>('', [
    { label: 'Save and continue', value: 'save' },
    { label: 'Customize first', value: 'customize' },
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
}

/**
 * Customize configuration interactively.
 */
async function customizeConfig(config: BuoyConfig): Promise<BuoyConfig> {
  sectionHeader('Customize Configuration');

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
 * Show learn more section.
 */
function showLearnMore(): void {
  sectionHeader('About Buoy');

  info('Buoy catches design drift before it ships.');
  console.log('');
  info('Drift happens when code diverges from your design system:');
  bulletList([
    'Hardcoded colors instead of tokens',
    'Arbitrary spacing (17px vs your 4px scale)',
    'Inconsistent component naming',
  ]);
  console.log('');
  info('AI coding tools make this worse—they don\'t know your');
  info('design system exists.');
  console.log('');

  info('Commands to know:');
  console.log(`    ${chalk.cyan('buoy status')}        Quick health check`);
  console.log(`    ${chalk.cyan('buoy drift check')}   Detailed drift report`);
  console.log(`    ${chalk.cyan('buoy ci')}            Run in CI pipelines`);
  console.log(`    ${chalk.cyan('buoy history')}       View scan history`);
  console.log('');

  info(`Docs: ${chalk.cyan('https://buoy.design/docs')}`);
}

/**
 * Show exit message.
 */
function showExitMessage(): void {
  console.log('');
  success('You\'re all set!');
  console.log('');

  info('Quick commands:');
  console.log(`    ${chalk.cyan('buoy status')}        See health at a glance`);
  console.log(`    ${chalk.cyan('buoy drift check')}   Detailed drift report`);
  console.log('');

  info(`Run ${chalk.cyan('buoy begin')} anytime to return to this wizard.`);
  console.log('');
}
