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
import {
  setupHooks as installHooks,
  generateStandaloneHook,
  detectHookSystem,
} from '../hooks/index.js';

type MenuAction =
  | 'scan'
  | 'dock-agents'
  | 'review-issues'
  | 'check-drift'
  | 'setup-hooks'
  | 'setup-ci'
  | 'learn-more'
  | 'exit';

interface WizardState {
  // Detection state
  hasTokens: boolean;
  tokenFiles: string[];
  hasAISetup: boolean;
  hasHooks: boolean;
  hasCISetup: boolean;
  hasConfig: boolean;
  hasBaseline: boolean;
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
 * Detect if pre-commit hooks are set up.
 */
function detectHooks(cwd: string): boolean {
  const gitHookPath = join(cwd, '.git', 'hooks', 'pre-commit');
  if (existsSync(gitHookPath)) {
    try {
      const content = readFileSync(gitHookPath, 'utf-8');
      if (content.includes('buoy')) {
        return true;
      }
    } catch {
      // Ignore read errors
    }
  }

  // Check for husky
  const huskyPath = join(cwd, '.husky', 'pre-commit');
  if (existsSync(huskyPath)) {
    try {
      const content = readFileSync(huskyPath, 'utf-8');
      if (content.includes('buoy')) {
        return true;
      }
    } catch {
      // Ignore read errors
    }
  }

  // Check for lint-staged config with buoy
  const packageJsonPath = join(cwd, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      if (pkg['lint-staged'] && JSON.stringify(pkg['lint-staged']).includes('buoy')) {
        return true;
      }
    } catch {
      // Ignore read errors
    }
  }

  return false;
}

/**
 * Detect if baseline is set up.
 */
function detectBaseline(cwd: string): boolean {
  return existsSync(join(cwd, '.buoy', 'baseline.json')) ||
         existsSync(join(cwd, 'buoy-baseline.json'));
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

/**
 * Run all setup steps automatically without prompts.
 * This is the "just make it work" mode for users who want quick setup.
 */
async function runQuickOnboard(cwd: string): Promise<void> {
  console.log('');
  console.log(chalk.cyan.bold('🛟  Buoy Quick Setup'));
  console.log('');

  // Step 1: Detect project state
  const spin = spinner('Analyzing project...');
  const tokenResult = await detectTokens(cwd);
  const hasAISetup = detectAISetup(cwd);
  const existingConfig = getConfigPath();
  spin.stop();

  console.log(`  ${chalk.green('✓')} Project analyzed`);

  // Step 2: Create tokens if needed
  if (!tokenResult.hasTokens) {
    console.log('');
    console.log(chalk.cyan('  Creating design tokens...'));
    const { spawn } = await import('child_process');
    await new Promise<void>((resolve) => {
      const child = spawn('npx', ['ahoybuoy', 'anchor', '-y'], {
        cwd,
        stdio: 'inherit',
      });
      child.on('close', () => resolve());
    });
  } else {
    console.log(`  ${chalk.green('✓')} Design tokens found`);
  }

  // Step 3: Load or create config
  let config: BuoyConfig;
  if (existingConfig) {
    const result = await loadConfig();
    config = result.config;
  } else {
    const autoResult = await buildAutoConfig(cwd);
    config = autoResult.config;
  }

  // Step 4: Run scan
  const scanSpin = spinner('Scanning for drift...');
  try {
    const orchestrator = new ScanOrchestrator(config);
    const { components } = await orchestrator.scanComponents({});

    const detector = new ProjectDetector(cwd);
    const projectInfo = await detector.detect();

    const { SemanticDiffEngine } = await import('@buoy-design/core/analysis');
    const engine = new SemanticDiffEngine();
    const diffResult = engine.analyzeComponents(components, {
      checkDeprecated: true,
      checkNaming: true,
      checkDocumentation: true,
    });

    scanSpin.stop();
    console.log(`  ${chalk.green('✓')} Scanned ${components.length} components`);

    const critical = diffResult.drifts.filter(d => d.severity === 'critical').length;
    const warning = diffResult.drifts.filter(d => d.severity === 'warning').length;

    if (diffResult.drifts.length > 0) {
      console.log(`  ${chalk.yellow('!')} Found ${diffResult.drifts.length} drift issue${diffResult.drifts.length === 1 ? '' : 's'}`);
      if (critical > 0) console.log(`      ${chalk.red('•')} ${critical} critical`);
      if (warning > 0) console.log(`      ${chalk.yellow('•')} ${warning} warnings`);
    } else {
      console.log(`  ${chalk.green('✓')} No drift detected`);
    }

    // Log frameworks detected
    if (projectInfo.frameworks.length > 0) {
      console.log(`  ${chalk.green('✓')} Detected: ${projectInfo.frameworks.map(f => f.name).join(', ')}`);
    }
  } catch (err) {
    scanSpin.stop();
    console.log(`  ${chalk.yellow('!')} Scan skipped: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Step 5: Set up AI guardrails if needed
  if (!hasAISetup) {
    console.log('');
    console.log(chalk.cyan('  Setting up AI guardrails...'));
    const result = await setupAIGuardrails(cwd, config);
    if (result.skillExported) {
      console.log(`  ${chalk.green('✓')} AI skill exported`);
    }
    if (result.contextGenerated) {
      console.log(`  ${chalk.green('✓')} CLAUDE.md updated`);
    }
  } else {
    console.log(`  ${chalk.green('✓')} AI guardrails already configured`);
  }

  // Summary
  console.log('');
  console.log(chalk.green.bold('  ━'.repeat(24)));
  console.log('');
  console.log(chalk.green.bold('    ✓ Setup complete!'));
  console.log('');
  console.log(chalk.green.bold('  ━'.repeat(24)));
  console.log('');
  console.log(chalk.dim('  Next steps:'));
  console.log(`    ${chalk.cyan('buoy show all')}     Check for drift`);
  console.log(`    ${chalk.cyan('buoy check')}    Pre-commit validation`);
  console.log(`    ${chalk.cyan('buoy begin')}    Interactive setup`);
  console.log('');
}

export function createBeginCommand(): Command {
  return new Command('begin')
    .description('Interactive wizard to get started with Buoy')
    .option('-y, --yes', 'Run all setup steps automatically without prompts')
    .action(async (options: { yes?: boolean }) => {
      const cwd = process.cwd();

      // Quick onboard mode - run all steps automatically
      if (options.yes) {
        await runQuickOnboard(cwd);
        return;
      }

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
      const hasHooks = detectHooks(cwd);
      const hasBaseline = detectBaseline(cwd);
      const hasCISetup = existsSync(join(cwd, '.github', 'workflows', 'buoy.yml')) ||
                         existsSync(join(cwd, '.gitlab-ci.yml'));
      const hasConfig = !!getConfigPath();

      // Initialize state
      const state: WizardState = {
        hasTokens: tokenResult.hasTokens,
        tokenFiles: tokenResult.files,
        hasAISetup,
        hasHooks,
        hasCISetup,
        hasConfig,
        hasBaseline,
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

  // Pre-commit hooks
  if (state.hasHooks) {
    console.log(`  ${chalk.green('✓')} Pre-commit hooks active`);
  } else {
    console.log(`  ${chalk.dim('○')} Pre-commit hooks not set up`);
  }

  // CI Setup
  if (state.hasCISetup) {
    console.log(`  ${chalk.green('✓')} CI/CD integration active`);
  } else {
    console.log(`  ${chalk.dim('○')} CI/CD not configured`);
  }

  // Baseline
  if (state.hasBaseline) {
    console.log(`  ${chalk.green('✓')} Baseline established`);
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
    console.log(chalk.dim('    Tip: Run buoy show all --verbose to see what paths are being searched'));
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
 * Setup pre-commit hooks with celebration!
 * This is the "lock in your gains" moment.
 */
async function setupHooks(cwd: string): Promise<{ success: boolean }> {
  console.log('');
  console.log(chalk.cyan.bold('  🔒 Locking in your design system...'));
  console.log('');

  const hookSystem = detectHookSystem(cwd);

  let success = false;

  if (hookSystem) {
    console.log(chalk.dim(`  Detected: ${hookSystem}`));
    const result = installHooks(cwd);
    success = result.success;

    if (result.success) {
      console.log(`  ${chalk.green('✓')} ${result.message}`);
    } else {
      console.log(`  ${chalk.yellow('!')} ${result.message}`);
    }
  } else {
    // Generate standalone hook
    const result = generateStandaloneHook(cwd);
    success = result.success;

    if (result.success) {
      console.log(`  ${chalk.green('✓')} ${result.message}`);
    } else {
      console.log(`  ${chalk.yellow('!')} ${result.message}`);
    }
  }

  if (success) {
    // Celebration!
    console.log('');
    console.log(chalk.green.bold('  ━'.repeat(24)));
    console.log('');
    console.log(chalk.green.bold('    🎉 Your design system is protected!'));
    console.log('');
    console.log(chalk.green.bold('  ━'.repeat(24)));
    console.log('');
    console.log(chalk.dim('  Every commit will now be checked for drift.'));
    console.log(chalk.dim('  Use --no-verify to bypass if needed.'));
    console.log('');
  }

  return { success };
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
      case 'scan': {
        // Run scan to discover components and tokens
        console.log('');
        console.log(chalk.cyan('  Scanning your codebase...'));
        console.log('');
        
        try {
          const scanResult = await runScan(cwd);
          state.hasScanned = true;
          state.components = scanResult.components;
          state.drifts = scanResult.drifts;
          config = scanResult.config;
          console.log('');
          console.log(chalk.green('  ✓ Scan complete!'));
          console.log('');
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errorLog(`Scan failed: ${message}`);
        }
        break;
      }

      case 'dock-agents': {
        // Run dock agents to set up AI integration
        console.log('');
        console.log(chalk.cyan('  Setting up AI integration...'));
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

      case 'setup-hooks': {
        const result = await setupHooks(cwd);
        if (result.success) {
          state.hasHooks = true;
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
    // No tokens - primary action is scan
    options.push({
      label: '🔍 Scan your codebase',
      value: 'scan',
      description: 'Find components and design values in your code',
    });
    options.push({
      label: 'Check for drift anyway',
      value: 'check-drift',
      description: 'Find hardcoded values without a token file',
    });
  } else if (!state.hasAISetup) {
    // Has tokens but no AI setup - primary action is dock agents
    options.push({
      label: '🛟 Set up AI integration',
      value: 'dock-agents',
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

  // Hook setup - only show after baseline is set OR no drift OR issues reviewed
  // This is the "lock in your gains" moment
  const isCleanState = state.hasBaseline ||
                       (state.hasScanned && state.drifts.length === 0) ||
                       state.issuesReviewed;

  if (!state.hasHooks && state.hasTokens && isCleanState) {
    options.push({
      label: '🔒 Lock it in with pre-commit hooks',
      value: 'setup-hooks',
      description: 'Catch new drift before it\'s committed',
    });
  }

  // CI setup - show after hooks are set up, or if they explicitly want it
  if (!state.hasCISetup && state.hasTokens && (state.hasHooks || isCleanState)) {
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
  console.log(`    ${chalk.cyan('buoy show drift')}   See all drift issues`);
  console.log(`    ${chalk.cyan('buoy show health')}  Quick health overview`);
  console.log(`    ${chalk.cyan('buoy check')}        Pre-commit validation`);
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
      // No tokens - recommend scanning to find values
      console.log('This project has no design tokens.');
      console.log('');
      console.log('PRIMARY: Scan your codebase');
      console.log('  → Run: buoy scan');
      console.log('  This finds components and design values in your code.');
      console.log('');
      console.log('ALTERNATIVE: Check for drift without tokens');
      console.log('  → Run: buoy drift');
      console.log('  Find hardcoded values that should be tokens.');
    } else if (!hasAISetup) {
      // Has tokens but no AI setup - recommend dock agents
      console.log('This project has tokens but AI tools aren\'t configured to use them.');
      console.log('');
      console.log('PRIMARY: Set up AI integration');
      console.log('  → Run: buoy dock agents');
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
      console.log('');
      console.log('OTHER OPTIONS:');
      console.log('  • buoy dock hooks             Interactive setup for Claude or git hooks');
      console.log('  • buoy dock hooks --claude    Claude hooks (design system in every session)');
      console.log('  • buoy dock hooks --commit    Git pre-commit hooks (catch drift before commit)');
      console.log('  • buoy ahoy github            GitHub PR bot (comments on drift)');
    }

    console.log('');
    console.log('─'.repeat(50));

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`Analysis failed: ${message}`);
    console.log('');
    console.log('Try running: buoy show all');
  }
}
