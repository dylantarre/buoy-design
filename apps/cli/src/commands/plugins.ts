import { Command } from 'commander';
import chalk from 'chalk';
import { discoverPlugins, loadDiscoveredPlugins } from '../plugins/index.js';
import { detectFrameworks, getPluginInstallCommand } from '../detect/frameworks.js';

export function createPluginsCommand(): Command {
  const cmd = new Command('plugins')
    .description('Manage Buoy plugins');

  cmd
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

  cmd
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
          ? chalk.green('(installed)')
          : chalk.yellow('(not installed)');
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

  return cmd;
}
