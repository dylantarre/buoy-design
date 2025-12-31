import { Command } from 'commander';
import chalk from 'chalk';
import { detectFrameworks, getPluginInstallCommand, BUILTIN_SCANNERS, PLUGIN_INFO } from '../detect/frameworks.js';

export function createPluginsCommand(): Command {
  const cmd = new Command('plugins')
    .description('Show available scanners and plugins');

  cmd
    .command('list')
    .description('List available scanners and plugins')
    .action(async () => {
      console.log(chalk.bold('\nBuilt-in Scanners') + chalk.dim(' (always available)'));
      console.log('');

      for (const [_key, info] of Object.entries(BUILTIN_SCANNERS)) {
        console.log(`  ${chalk.green('✓')} ${chalk.cyan(info.description)}`);
        console.log(`    ${chalk.dim(`Detects: ${info.detects}`)}`);
        console.log();
      }

      console.log(chalk.bold('Optional Plugins'));
      console.log('');

      for (const [_key, info] of Object.entries(PLUGIN_INFO)) {
        console.log(`  ${chalk.dim('○')} ${chalk.cyan(info.name)}`);
        console.log(`    ${chalk.dim(info.description)}`);
        console.log();
      }
    });

  cmd
    .command('suggest')
    .description('Suggest plugins based on detected frameworks')
    .action(async () => {
      try {
        const detected = await detectFrameworks(process.cwd());

        if (detected.length === 0) {
          console.log(chalk.yellow('No frameworks detected.'));
          return;
        }

        const builtIn = detected.filter(fw => fw.scanner);
        const needsPlugin = detected.filter(fw => fw.plugin && !fw.scanner);

        if (builtIn.length > 0) {
          console.log(chalk.bold('\nDetected (built-in support):'));
          for (const fw of builtIn) {
            console.log(`  ${chalk.green('✓')} ${fw.name} ${chalk.dim(`- ${fw.evidence}`)}`);
          }
        }

        if (needsPlugin.length > 0) {
          console.log(chalk.bold('\nDetected (optional plugin available):'));
          for (const fw of needsPlugin) {
            console.log(`  ${chalk.yellow('○')} ${fw.name} ${chalk.dim(`- ${fw.evidence}`)}`);
          }

          const plugins = needsPlugin
            .map(fw => fw.plugin!)
            .filter((p, i, arr) => arr.indexOf(p) === i);

          console.log('\n' + chalk.bold('Install optional plugins:'));
          console.log(`  ${chalk.cyan(getPluginInstallCommand(plugins))}`);
        }
      } catch (err) {
        console.error(chalk.red(`Failed to detect frameworks: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });

  return cmd;
}
