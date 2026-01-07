/**
 * buoy onboard - Onboard AI to your design system
 *
 * Creates skill files and updates CLAUDE.md so AI tools
 * understand and follow your design system.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, copyFileSync, readdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { loadConfig, getConfigPath } from '../config/loader.js';
import { buildAutoConfig } from '../config/auto-detect.js';
import { ScanOrchestrator } from '../scan/orchestrator.js';
import { spinner, error as errorLog, setJsonMode } from '../output/reporters.js';
import { SkillExportService } from '../services/skill-export.js';
import { generateContext } from '../services/context-generator.js';
import { setupClaudeHooks } from '../hooks/index.js';
import type { BuoyConfig } from '../config/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Install Buoy's Claude commands to ~/.claude/commands/
 */
function installClaudeCommands(dryRun = false): { installed: string[]; alreadyExisted: string[] } {
  const commandsDir = join(homedir(), '.claude', 'commands');
  const assetsDir = resolve(__dirname, '..', '..', 'assets', 'commands');

  const installed: string[] = [];
  const alreadyExisted: string[] = [];

  // Check if assets directory exists
  if (!existsSync(assetsDir)) {
    return { installed, alreadyExisted };
  }

  // Create commands directory if needed
  if (!dryRun && !existsSync(commandsDir)) {
    mkdirSync(commandsDir, { recursive: true });
  }

  // Copy each command file
  const commandFiles = readdirSync(assetsDir).filter(f => f.endsWith('.md'));

  for (const file of commandFiles) {
    const srcPath = join(assetsDir, file);
    const destPath = join(commandsDir, file);

    if (existsSync(destPath)) {
      alreadyExisted.push(file.replace('.md', ''));
    } else {
      if (!dryRun) {
        copyFileSync(srcPath, destPath);
      }
      installed.push(file.replace('.md', ''));
    }
  }

  return { installed, alreadyExisted };
}

export function createOnboardCommand(): Command {
  return new Command('onboard')
    .description('Onboard AI to your design system')
    .option('--skill-only', 'Only create skill files, skip CLAUDE.md')
    .option('--context-only', 'Only update CLAUDE.md, skip skill files')
    .option('--claude-hooks', 'Setup Claude Code hooks for real-time drift feedback')
    .option('--no-commands', 'Skip installing Claude slash commands')
    .option('--dry-run', 'Show what would be created without writing files')
    .option('--json', 'Output result as JSON')
    .action(async (options) => {
      const cwd = process.cwd();

      if (options.json) {
        setJsonMode(true);
      }

      console.log('');
      console.log(chalk.cyan.bold('🛟 Onboarding AI to your design system...'));
      console.log('');

      const spin = spinner('Analyzing your codebase...');

      try {
        // Load or auto-detect config
        let config: BuoyConfig;
        let projectName = 'design-system';

        const configPath = getConfigPath();
        if (configPath) {
          const result = await loadConfig();
          config = result.config;
          projectName = config.project?.name || 'design-system';
        } else {
          const autoResult = await buildAutoConfig(cwd);
          config = autoResult.config;
          projectName = config.project?.name || 'design-system';
        }

        // Scan components and tokens
        spin.text = 'Scanning components and tokens...';
        const orchestrator = new ScanOrchestrator(config, cwd);
        const scanResult = await orchestrator.scan({
          onProgress: (msg) => {
            spin.text = msg;
          },
        });

        // Run drift analysis for anti-patterns
        spin.text = 'Identifying patterns and anti-patterns...';
        const { SemanticDiffEngine } = await import('@buoy-design/core/analysis');
        const engine = new SemanticDiffEngine();
        const diffResult = engine.analyzeComponents(scanResult.components, {
          checkDeprecated: true,
          checkNaming: true,
          checkDocumentation: true,
        });

        spin.stop();

        const results = {
          skillCreated: false,
          contextUpdated: false,
          claudeHooksCreated: false,
          commandsInstalled: [] as string[],
          commandsExisted: [] as string[],
          skillPath: '',
          claudeHooksPath: '',
          stats: {
            tokens: 0,
            components: 0,
            patterns: 0,
          },
        };

        // Create skill files (unless --context-only)
        if (!options.contextOnly) {
          const skillPath = resolve(cwd, '.claude/skills/design-system');

          if (options.dryRun) {
            console.log(chalk.dim('  Would create skill at: ' + skillPath));
          } else {
            const exportService = new SkillExportService(projectName);
            const skillResult = await exportService.export(
              {
                tokens: scanResult.tokens,
                components: scanResult.components,
                drifts: diffResult.drifts,
                projectName,
              },
              {
                sections: ['tokens', 'components', 'patterns', 'anti-patterns'],
                outputPath: skillPath,
              }
            );

            // Write skill files
            for (const file of skillResult.files) {
              const dir = dirname(file.path);
              if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
              }
              writeFileSync(file.path, file.content);
            }

            results.skillCreated = true;
            results.skillPath = skillPath;
            results.stats.tokens = skillResult.stats.tokens.total;
            results.stats.components = skillResult.stats.components;
            results.stats.patterns = skillResult.stats.patterns.length;
          }
        }

        // Update CLAUDE.md (unless --skill-only)
        if (!options.skillOnly) {
          const claudeMdPath = join(cwd, 'CLAUDE.md');

          if (options.dryRun) {
            console.log(chalk.dim('  Would update: CLAUDE.md'));
          } else {
            // Generate context
            const contextResult = generateContext(
              {
                tokens: scanResult.tokens,
                components: scanResult.components,
                drifts: diffResult.drifts,
                projectName,
              },
              { detailLevel: 'standard' }
            );
            const context = contextResult.content;

            // Check if CLAUDE.md exists and has design system section
            const designSystemHeader = '## Design System';
            let existingContent = '';
            let hasDesignSystemSection = false;

            if (existsSync(claudeMdPath)) {
              existingContent = readFileSync(claudeMdPath, 'utf-8');

              // Remove code blocks before checking for headers to avoid false positives
              const contentWithoutCodeBlocks = existingContent.replace(/```[\s\S]*?```/g, '');

              // Check for design system header at start of line (not inside code blocks)
              hasDesignSystemSection = /^##?\s*[Dd]esign\s*[Ss]ystem/m.test(contentWithoutCodeBlocks);
            }

            if (!hasDesignSystemSection) {
              // Append design system section
              const section = `\n${designSystemHeader}\n\n${context}\n`;
              if (existingContent) {
                appendFileSync(claudeMdPath, section);
              } else {
                writeFileSync(claudeMdPath, `# CLAUDE.md\n${section}`);
              }
              results.contextUpdated = true;
            } else {
              // Already has design system section - skip
              console.log(chalk.dim('  CLAUDE.md already has design system section'));
            }
          }
        }

        // Setup Claude Code hooks if --claude-hooks flag is provided
        if (options.claudeHooks) {
          if (options.dryRun) {
            console.log(chalk.dim('  Would create: .claude/settings.local.json'));
            console.log(chalk.dim('  Would create: .claude/buoy-context.md'));
          } else {
            // Generate condensed context file for session injection
            const exportService = new SkillExportService(projectName);
            const condensedContext = exportService.generateCondensedContext({
              tokens: scanResult.tokens,
              components: scanResult.components,
              drifts: diffResult.drifts,
              projectName,
            });

            const claudeDir = resolve(cwd, '.claude');
            if (!existsSync(claudeDir)) {
              mkdirSync(claudeDir, { recursive: true });
            }
            writeFileSync(resolve(claudeDir, 'buoy-context.md'), condensedContext);

            // Setup the hooks
            const claudeResult = setupClaudeHooks(cwd);

            if (claudeResult.success) {
              results.claudeHooksCreated = claudeResult.created;
              results.claudeHooksPath = claudeResult.filePath || '';
              // Track if hooks were already configured (for output)
              if (!claudeResult.created) {
                (results as Record<string, unknown>).claudeHooksAlreadyConfigured = true;
              }
            } else {
              // Show error when hooks setup fails
              console.log(chalk.yellow(`  ⚠ Could not setup Claude hooks: ${claudeResult.message}`));
            }
          }
        }

        // Install Claude slash commands (unless --no-commands)
        if (options.commands !== false) {
          if (options.dryRun) {
            const { installed } = installClaudeCommands(true);
            if (installed.length > 0) {
              console.log(chalk.dim(`  Would install commands: ${installed.map(c => `/${c}`).join(', ')}`));
            }
          } else {
            const { installed, alreadyExisted } = installClaudeCommands(false);
            results.commandsInstalled = installed;
            results.commandsExisted = alreadyExisted;
          }
        }

        // Output results
        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
        } else if (!options.dryRun) {
          // Celebration!
          console.log('');
          console.log(chalk.green.bold('━'.repeat(50)));
          console.log('');
          console.log(chalk.green.bold('  🎉 AI is now part of the crew!'));
          console.log('');
          console.log(chalk.green.bold('━'.repeat(50)));
          console.log('');

          if (results.skillCreated) {
            console.log(`  ${chalk.green('✓')} Created skill files`);
            console.log(chalk.dim(`      ${results.skillPath}/`));
          }

          if (results.contextUpdated) {
            console.log(`  ${chalk.green('✓')} Updated CLAUDE.md`);
          }

          if (results.claudeHooksCreated) {
            console.log(`  ${chalk.green('✓')} Created Claude Code hooks`);
            console.log(chalk.dim(`      ${results.claudeHooksPath}`));
            console.log(chalk.dim(`      .claude/buoy-context.md (injected at session start)`));
          } else if ((results as Record<string, unknown>).claudeHooksAlreadyConfigured) {
            console.log(`  ${chalk.green('✓')} Claude Code hooks already configured`);
            console.log(chalk.dim(`      Updated .claude/buoy-context.md`));
          }

          if (results.commandsInstalled.length > 0) {
            console.log(`  ${chalk.green('✓')} Installed slash commands`);
            for (const cmd of results.commandsInstalled) {
              console.log(chalk.dim(`      /${cmd}`));
            }
          }
          if (results.commandsExisted.length > 0) {
            console.log(`  ${chalk.dim('○')} Commands already installed: ${results.commandsExisted.map(c => `/${c}`).join(', ')}`);
          }

          console.log('');
          console.log(chalk.dim('  Your AI assistant now knows:'));
          if (results.stats.tokens > 0) {
            console.log(`    • ${results.stats.tokens} design tokens`);
          }
          if (results.stats.components > 0) {
            console.log(`    • ${results.stats.components} component patterns`);
          }
          if (results.stats.patterns > 0) {
            console.log(`    • ${results.stats.patterns} approved patterns`);
          }
          console.log('');
          console.log(chalk.dim('  Try asking:'));
          console.log(chalk.cyan('    "Build a button following our design system"'));
          console.log('');

          // Suggest Claude hooks if not set up
          if (!options.claudeHooks && !results.claudeHooksCreated) {
            console.log(chalk.dim('  Want real-time feedback in Claude Code?'));
            console.log(`    Run: ${chalk.cyan('buoy onboard --claude-hooks')}`);
            console.log('');
          }
        }

      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        errorLog(`Onboarding failed: ${message}`);
        process.exit(1);
      }
    });
}
