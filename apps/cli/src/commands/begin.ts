/**
 * buoy begin - Interactive wizard for new users.
 *
 * Explains what Buoy does, scans the project, and guides users through setup
 * with clear, jargon-free language.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { glob } from 'glob';
import { loadConfig, getConfigPath } from '../config/loader.js';
import { buildAutoConfig } from '../config/auto-detect.js';
import { spinner, error as errorLog } from '../output/reporters.js';
import { ScanOrchestrator } from '../scan/orchestrator.js';
import { ProjectDetector } from '../detect/project-detector.js';
import type { BuoyConfig } from '../config/schema.js';
import type { DriftSignal, Component, DesignToken } from '@buoy-design/core';
import {
  showMenu,
} from '../wizard/menu.js';
import { reviewIssues } from '../wizard/issue-reviewer.js';
import { setupCI } from '../wizard/ci-generator.js';
import { setupAIGuardrails } from '../wizard/ai-guardrails-generator.js';

type MenuAction =
  | 'anchor'
  | 'onboard'
  | 'review-issues'
  | 'check-drift'
  | 'setup-ci'
  | 'learn-more'
  | 'exit';

interface WizardState {
  // Detection state
  hasTokens: boolean;
  tokenFiles: string[];
  hasAISetup: boolean;
  hasCISetup: boolean;
  hasConfig: boolean;
  // Scan results
  hasScanned: boolean;
  components: Component[];
  tokens: DesignToken[];
  drifts: DriftSignal[];
  // Session progress
  issuesReviewed: boolean;
}

/**
 * Detect if project has design tokens.
 */
async function detectTokens(cwd: string): Promise<{ hasTokens: boolean; files: string[] }> {
  const patterns = [
    '**/design-tokens.json',
    '**/tokens.json',
    '**/.tokens.json',
    '**/tokens.css',
    '**/variables.css',
    '**/design-tokens.css',
    '**/_tokens.scss',
    '**/_variables.scss',
    '**/theme.json',
    '**/style-dictionary/**/*.json',
  ];

  const files: string[] = [];
  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      cwd,
      nodir: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
    });
    files.push(...matches);
  }

  // Also check if tailwind.config exists (counts as having tokens)
  const tailwindConfigs = await glob('tailwind.config.{js,ts,mjs}', { cwd });
  if (tailwindConfigs.length > 0) {
    files.push(...tailwindConfigs);
  }

  return { hasTokens: files.length > 0, files: [...new Set(files)] };
}

/**
 * Detect if AI guardrails are set up.
 */
function detectAISetup(cwd: string): boolean {
  // Check for skill file
  if (existsSync(join(cwd, '.claude', 'skills', 'design-system', 'SKILL.md'))) {
    return true;
  }
  // Check for design system section in CLAUDE.md
  const claudeMdPath = join(cwd, 'CLAUDE.md');
  if (existsSync(claudeMdPath)) {
    try {
      const content = readFileSync(claudeMdPath, 'utf-8');
      if (content.includes('Design System') || content.includes('design-system') || content.includes('buoy')) {
        return true;
      }
    } catch {
      // Ignore read errors
    }
  }
  return false;
}

export function createBeginCommand(): Command {
  return new Command('begin')
    .description('Interactive wizard to get started with Buoy')
    .action(async () => {
      const cwd = process.cwd();

      // Check if we're in an interactive terminal
      if (!process.stdin.isTTY) {
        // Run scan and output AI-friendly results so the AI can walk the user through it
        await runAIGuidedWizard(cwd);
        return;
      }

      // Welcome
      console.log('');
      console.log(chalk.cyan.bold('🛟  Welcome to Buoy'));
      console.log('');

      // Detect project state
      const spin = spinner('Analyzing your project...');

      const tokenResult = await detectTokens(cwd);
      const hasAISetup = detectAISetup(cwd);
      const hasCISetup = existsSync(join(cwd, '.github', 'workflows', 'buoy.yml')) ||
                         existsSync(join(cwd, '.gitlab-ci.yml'));
      const hasConfig = !!getConfigPath();

      // Initialize state
      const state: WizardState = {
        hasTokens: tokenResult.hasTokens,
        tokenFiles: tokenResult.files,
        hasAISetup,
        hasCISetup,
        hasConfig,
        hasScanned: false,
        components: [],
        tokens: [],
        drifts: [],
        issuesReviewed: false,
      };

      spin.stop();

      // Show what we found
      showProjectStatus(state);

      // Main menu loop
      await menuLoop(cwd, state);

      // Exit message
      showExitMessage();
    });
}

/**
 * Show project status based on detection.
 */
function showProjectStatus(state: WizardState): void {
  console.log(chalk.dim('  What we found:'));
  console.log('');

  // Tokens
  if (state.hasTokens) {
    console.log(`  ${chalk.green('✓')} Design tokens found`);
    if (state.tokenFiles.length <= 3) {
      state.tokenFiles.forEach(f => console.log(chalk.dim(`      ${f}`)));
    } else {
      console.log(chalk.dim(`      ${state.tokenFiles.length} token files`));
    }
  } else {
    console.log(`  ${chalk.yellow('○')} No design tokens found`);
  }

  // AI Setup
  if (state.hasAISetup) {
    console.log(`  ${chalk.green('✓')} AI guardrails configured`);
  } else {
    console.log(`  ${chalk.yellow('○')} AI guardrails not set up`);
  }

  // CI Setup
  if (state.hasCISetup) {
    console.log(`  ${chalk.green('✓')} CI/CD integration active`);
  } else {
    console.log(`  ${chalk.dim('○')} CI/CD not configured`);
  }

  console.log('');
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
    console.log(chalk.dim('    Tip: Run buoy sweep --verbose to see what paths are being searched'));
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
 * Main menu loop - smart recommendations based on project state.
 */
async function menuLoop(
  cwd: string,
  state: WizardState
): Promise<void> {
  let config: BuoyConfig | undefined;

  while (true) {
    const action = await showMainMenu(state);

    switch (action) {
      case 'anchor': {
        // Run anchor to establish design tokens
        console.log('');
        console.log(chalk.cyan('  Running: buoy anchor'));
        console.log(chalk.dim('  This will analyze your code and create design tokens.'));
        console.log('');
        const { spawn } = await import('child_process');
        await new Promise<void>((resolve) => {
          const child = spawn('npx', ['@buoy-design/cli', 'anchor'], {
            cwd,
            stdio: 'inherit',
          });
          child.on('close', () => {
            // Re-detect tokens after anchor completes
            detectTokens(cwd).then(result => {
              state.hasTokens = result.hasTokens;
              state.tokenFiles = result.files;
              resolve();
            });
          });
        });
        break;
      }

      case 'onboard': {
        // Run onboard to set up AI guardrails (this will be the new command)
        // For now, use the existing skill + context commands
        console.log('');
        console.log(chalk.cyan('  Setting up AI guardrails...'));
        console.log('');

        // Load config if needed
        if (!config) {
          const configPath = getConfigPath();
          if (configPath) {
            const result = await loadConfig();
            config = result.config;
          } else {
            const autoResult = await buildAutoConfig(cwd);
            config = autoResult.config;
          }
        }

        const result = await setupAIGuardrails(cwd, config);
        if (result.skillExported || result.contextGenerated) {
          state.hasAISetup = true;
        }
        break;
      }

      case 'check-drift': {
        // Run scan and show drift
        try {
          const scanResult = await runScan(cwd);
          state.hasScanned = true;
          state.components = scanResult.components;
          state.drifts = scanResult.drifts;
          config = scanResult.config;
          showScanResults(scanResult.components, scanResult.drifts, scanResult.projectInfo);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errorLog(`Scan failed: ${message}`);
        }
        break;
      }

      case 'review-issues': {
        if (state.drifts.length === 0) {
          console.log(chalk.green('\n  No issues to review!\n'));
          break;
        }
        const result = await reviewIssues(state.drifts);
        if (result.completed) {
          state.issuesReviewed = true;
        }
        break;
      }

      case 'setup-ci': {
        await setupCI(cwd);
        state.hasCISetup = true;
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
 * Show the main menu with smart recommendations based on project state.
 */
async function showMainMenu(state: WizardState): Promise<MenuAction> {
  const options: Array<{ label: string; value: MenuAction; description?: string }> = [];

  // Smart recommendations based on state
  if (!state.hasTokens) {
    // No tokens - primary action is anchor
    options.push({
      label: '⚓ Create design tokens',
      value: 'anchor',
      description: 'Analyze your code and establish a token system',
    });
    options.push({
      label: 'Check for drift anyway',
      value: 'check-drift',
      description: 'Find hardcoded values without a token file',
    });
  } else if (!state.hasAISetup) {
    // Has tokens but no AI setup - primary action is onboard
    options.push({
      label: '🛟 Onboard AI to your design system',
      value: 'onboard',
      description: 'Help AI tools follow your tokens and patterns',
    });
    options.push({
      label: 'Check for drift',
      value: 'check-drift',
      description: 'Find code that diverges from your tokens',
    });
  } else {
    // Has tokens + AI setup - primary action is drift check
    options.push({
      label: 'Check for drift',
      value: 'check-drift',
      description: 'Find code that diverges from your design system',
    });
  }

  // Show issues if we have them
  if (state.hasScanned && state.drifts.length > 0 && !state.issuesReviewed) {
    options.push({
      label: `Review ${state.drifts.length} issue${state.drifts.length === 1 ? '' : 's'}`,
      value: 'review-issues',
      description: 'See details and how to fix them',
    });
  }

  // CI setup if not done
  if (!state.hasCISetup && state.hasTokens) {
    options.push({
      label: '🚦 Add to CI/CD',
      value: 'setup-ci',
      description: 'Block PRs that introduce drift',
    });
  }

  // Learn more always available
  options.push({
    label: 'Learn more',
    value: 'learn-more',
    description: 'What is design drift?',
  });

  options.push({
    label: 'Exit',
    value: 'exit',
  });

  return showMenu<MenuAction>('What would you like to do?', options);
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
  console.log(`    ${chalk.cyan('buoy sweep')}     Scan for drift`);
  console.log(`    ${chalk.cyan('buoy sweep')}   Quick health overview`);
  console.log(`    ${chalk.cyan('buoy check')}    Pre-commit validation`);
  console.log('');
  console.log(chalk.dim(`  Run ${chalk.cyan('buoy begin')} anytime to return here.`));
  console.log('');
}

/**
 * Run the wizard in AI-guided mode - scans project and outputs everything
 * the AI needs to walk the user through setup conversationally.
 */
async function runAIGuidedWizard(cwd: string): Promise<void> {
  console.log(`
🛟 Buoy - Design Drift Detection

Analyzing your project...
`);

  try {
    // Detect project state
    const tokenResult = await detectTokens(cwd);
    const hasAISetup = detectAISetup(cwd);
    const hasCISetup = existsSync(join(cwd, '.github', 'workflows', 'buoy.yml')) ||
                       existsSync(join(cwd, '.gitlab-ci.yml'));
    const existingConfig = getConfigPath();

    // Load config
    let config: BuoyConfig;
    if (existingConfig) {
      const result = await loadConfig();
      config = result.config;
    } else {
      const autoResult = await buildAutoConfig(cwd);
      config = autoResult.config;
    }

    // Run scan
    const orchestrator = new ScanOrchestrator(config);
    const { components } = await orchestrator.scanComponents({});

    // Detect frameworks
    const detector = new ProjectDetector(cwd);
    const projectInfo = await detector.detect();

    // Run drift analysis
    const { SemanticDiffEngine } = await import('@buoy-design/core/analysis');
    const engine = new SemanticDiffEngine();
    const diffResult = engine.analyzeComponents(components, {
      checkDeprecated: true,
      checkNaming: true,
      checkDocumentation: true,
    });

    const drifts: DriftSignal[] = [...diffResult.drifts];

    // Output project state
    console.log('─'.repeat(50));
    console.log('PROJECT STATE');
    console.log('─'.repeat(50));
    console.log('');

    // Framework
    if (projectInfo.frameworks.length > 0) {
      console.log(`Framework: ${projectInfo.frameworks.map(f => f.name).join(', ')}`);
    }
    console.log(`Components: ${components.length} found`);

    // Tokens
    if (tokenResult.hasTokens) {
      console.log(`Design tokens: ✓ Found (${tokenResult.files.slice(0, 2).join(', ')}${tokenResult.files.length > 2 ? '...' : ''})`);
    } else {
      console.log('Design tokens: ✗ Not found');
    }

    // AI Setup
    console.log(`AI guardrails: ${hasAISetup ? '✓ Configured' : '✗ Not set up'}`);

    // CI Setup
    console.log(`CI/CD: ${hasCISetup ? '✓ Active' : '○ Not configured'}`);

    // Drift
    console.log('');
    if (drifts.length > 0) {
      const critical = drifts.filter(d => d.severity === 'critical').length;
      const warning = drifts.filter(d => d.severity === 'warning').length;
      console.log(`Drift: ${drifts.length} issue${drifts.length === 1 ? '' : 's'}`);
      if (critical > 0) console.log(`  • ${critical} critical`);
      if (warning > 0) console.log(`  • ${warning} warnings`);
    } else {
      console.log('Drift: None detected');
    }

    // Smart recommendations based on state
    console.log('');
    console.log('─'.repeat(50));
    console.log('RECOMMENDED ACTION');
    console.log('─'.repeat(50));
    console.log('');

    if (!tokenResult.hasTokens) {
      // No tokens - recommend anchor
      console.log('This project has no design tokens.');
      console.log('');
      console.log('PRIMARY: Create design tokens');
      console.log('  → Run: buoy anchor');
      console.log('  This analyzes your code and creates a token file.');
      console.log('');
      console.log('ALTERNATIVE: Check for drift without tokens');
      console.log('  → Run: buoy drift');
      console.log('  Find hardcoded values that should be tokens.');
    } else if (!hasAISetup) {
      // Has tokens but no AI setup - recommend onboard
      console.log('This project has tokens but AI tools aren\'t configured to use them.');
      console.log('');
      console.log('PRIMARY: Onboard AI to your design system');
      console.log('  → Run: buoy onboard');
      console.log('  This creates skill files and updates CLAUDE.md so AI follows your tokens.');
      console.log('');
      console.log('ALTERNATIVE: Check for drift');
      console.log('  → Run: buoy drift');
      console.log('  See if code follows your design system.');
    } else {
      // Has tokens + AI - recommend drift check
      console.log('This project is set up! AI tools know about your design system.');
      console.log('');
      console.log('PRIMARY: Check for drift');
      console.log('  → Run: buoy drift');
      console.log('  Find code that diverges from your design system.');

      if (!hasCISetup) {
        console.log('');
        console.log('ALSO CONSIDER: Add CI/CD integration');
        console.log('  → Run: buoy lighthouse');
        console.log('  Block PRs that introduce drift.');
      }
    }

    console.log('');
    console.log('─'.repeat(50));

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`Analysis failed: ${message}`);
    console.log('');
    console.log('Try running: buoy sweep');
  }
}
