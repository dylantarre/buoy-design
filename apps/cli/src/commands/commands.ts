/**
 * buoy commands - Manage Claude Code slash commands
 *
 * Install Buoy's slash commands to ~/.claude/commands/
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { setJsonMode } from '../output/reporters.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Install Buoy's Claude commands to ~/.claude/commands/
 */
function installClaudeCommands(dryRun = false): { installed: string[]; alreadyExisted: string[]; skipped: string[] } {
  const commandsDir = join(homedir(), '.claude', 'commands');
  const assetsDir = resolve(__dirname, '..', '..', 'assets', 'commands');

  const installed: string[] = [];
  const alreadyExisted: string[] = [];
  const skipped: string[] = [];

  // Check if assets directory exists
  if (!existsSync(assetsDir)) {
    return { installed, alreadyExisted, skipped };
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

  return { installed, alreadyExisted, skipped };
}

/**
 * List available commands
 */
function listAvailableCommands(): string[] {
  const assetsDir = resolve(__dirname, '..', '..', 'assets', 'commands');

  if (!existsSync(assetsDir)) {
    return [];
  }

  return readdirSync(assetsDir)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace('.md', ''));
}

export function createCommandsCommand(): Command {
  const cmd = new Command('commands')
    .description('Manage Claude Code slash commands');

  // List available commands
  cmd.command('list')
    .description('List available Buoy slash commands')
    .option('--json', 'Output as JSON')
    .action((options) => {
      if (options.json) {
        setJsonMode(true);
      }

      const available = listAvailableCommands();
      const commandsDir = join(homedir(), '.claude', 'commands');

      if (options.json) {
        const result = available.map(cmd => ({
          name: cmd,
          installed: existsSync(join(commandsDir, `${cmd}.md`)),
        }));
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log('');
      console.log(chalk.cyan.bold('  Available Buoy Commands'));
      console.log('');

      if (available.length === 0) {
        console.log(chalk.dim('  No commands available'));
        return;
      }

      for (const cmd of available) {
        const isInstalled = existsSync(join(commandsDir, `${cmd}.md`));
        const status = isInstalled
          ? chalk.green('✓ installed')
          : chalk.dim('not installed');
        console.log(`  /${cmd}  ${status}`);
      }

      console.log('');
      console.log(chalk.dim('  Run `buoy commands install` to install all commands'));
      console.log('');
    });

  // Install commands
  cmd.command('install')
    .description('Install Buoy slash commands to ~/.claude/commands/')
    .option('--dry-run', 'Show what would be installed')
    .option('--json', 'Output as JSON')
    .action((options) => {
      if (options.json) {
        setJsonMode(true);
      }

      const result = installClaudeCommands(options.dryRun);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log('');

      if (options.dryRun) {
        console.log(chalk.cyan.bold('  Dry Run - Would install:'));
        console.log('');
        for (const cmd of result.installed) {
          console.log(`  ${chalk.green('+')} /${cmd}`);
        }
        for (const cmd of result.alreadyExisted) {
          console.log(`  ${chalk.dim('○')} /${cmd} (already exists)`);
        }
      } else {
        if (result.installed.length > 0) {
          console.log(chalk.green.bold('  ✓ Installed slash commands:'));
          console.log('');
          for (const cmd of result.installed) {
            console.log(`    /${cmd}`);
          }
        }

        if (result.alreadyExisted.length > 0) {
          console.log('');
          console.log(chalk.dim(`  Already installed: ${result.alreadyExisted.map(c => `/${c}`).join(', ')}`));
        }

        if (result.installed.length === 0 && result.alreadyExisted.length > 0) {
          console.log(chalk.dim('  All commands already installed'));
        }
      }

      console.log('');
      console.log(chalk.dim(`  Commands installed to: ~/.claude/commands/`));
      console.log(chalk.dim('  Restart Claude Code to use them'));
      console.log('');
    });

  return cmd;
}
