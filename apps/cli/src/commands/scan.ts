import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, getConfigPath } from '../config/loader.js';
import { spinner, success, error, info, warning, header, keyValue, newline } from '../output/reporters.js';
import { loadDiscoveredPlugins, registry } from '../plugins/index.js';
import { formatComponentTable, formatTokenTable } from '../output/formatters.js';

export function createScanCommand(): Command {
  const cmd = new Command('scan')
    .description('Scan sources for components and tokens')
    .option('-s, --source <sources...>', 'Specific sources to scan (react, vue, svelte, angular, tokens, etc.)')
    .option('--json', 'Output as JSON')
    .option('-v, --verbose', 'Verbose output')
    .action(async (options) => {
      const spin = spinner('Loading configuration...');

      try {
        // Load config
        const { config, configPath } = await loadConfig();
        spin.text = 'Loading plugins...';

        // Load discovered plugins from package.json
        const plugins = await loadDiscoveredPlugins({ projectRoot: process.cwd() });

        if (plugins.length > 0 && options.verbose) {
          spin.stop();
          console.log(chalk.dim(`Loaded ${plugins.length} plugin(s): ${plugins.map(p => p.metadata.name).join(', ')}`));
          spin.start();
        }

        spin.text = 'Scanning sources...';

        if (options.verbose && configPath) {
          spin.stop();
          info(`Using config: ${configPath}`);
          spin.start();
        }

        // Determine which sources to scan
        const sourcesToScan: string[] = options.source || [];
        if (sourcesToScan.length === 0) {
          // JS Frameworks
          if (config.sources.react?.enabled) sourcesToScan.push('react');
          if (config.sources.vue?.enabled) sourcesToScan.push('vue');
          if (config.sources.svelte?.enabled) sourcesToScan.push('svelte');
          if (config.sources.angular?.enabled) sourcesToScan.push('angular');
          if (config.sources.webcomponent?.enabled) sourcesToScan.push('webcomponent');
          // Templates
          if (config.sources.templates?.enabled) sourcesToScan.push('templates');
          // Design tools
          if (config.sources.figma?.enabled) sourcesToScan.push('figma');
          if (config.sources.storybook?.enabled) sourcesToScan.push('storybook');
          if (config.sources.tokens?.enabled) sourcesToScan.push('tokens');
        }

        if (sourcesToScan.length === 0) {
          spin.stop();

          // Check if config file even exists
          const configExists = getConfigPath() !== null;

          if (!configExists) {
            error('No configuration found');
            console.log('');
            info('Run ' + chalk.cyan('buoy init') + ' to set up your project');
            console.log('');
            info('This will auto-detect components, tokens, and more.');
          } else {
            warning('No sources to scan');
            console.log('');
            info('Your config file has no sources enabled.');
            console.log('');
            info('This can happen if:');
            info('  • Auto-detection found no components');
            info('  • No token files (CSS variables, JSON tokens) were found');
            info('  • This is not a frontend project');
            console.log('');
            info('To fix:');
            info('  1. Run ' + chalk.cyan('buoy bootstrap') + ' to extract tokens from existing code');
            info('  2. Run ' + chalk.cyan('buoy build') + ' to generate a design system with AI');
            info('  3. Or add paths manually to your config');
          }
          return;
        }

        // Import scanners dynamically
        const {
          ReactComponentScanner,
          VueComponentScanner,
          SvelteComponentScanner,
          AngularComponentScanner,
          WebComponentScanner,
          TemplateScanner,
          TokenScanner,
        } = await import('@buoy/scanners/git');

        const results: {
          components: Awaited<ReturnType<typeof ReactComponentScanner.prototype.scan>>['items'];
          tokens: Awaited<ReturnType<typeof TokenScanner.prototype.scan>>['items'];
          errors: string[];
        } = {
          components: [],
          tokens: [],
          errors: [],
        };

        // Scan each source
        for (const source of sourcesToScan) {
          spin.text = `Scanning ${source}...`;

          try {
            // Check if a plugin can handle this source type
            const plugin = registry.getByDetection(source);

            if (plugin && plugin.scan) {
              // Use plugin scanner
              if (options.verbose) {
                spin.stop();
                console.log(chalk.dim(`  Using plugin "${plugin.metadata.name}" for ${source}`));
                spin.start();
              }

              const sourceConfig = config.sources[source as keyof typeof config.sources];
              const pluginResult = await plugin.scan({
                projectRoot: process.cwd(),
                config: (sourceConfig as Record<string, unknown>) || {},
                include: (sourceConfig as { include?: string[] })?.include,
                exclude: (sourceConfig as { exclude?: string[] })?.exclude,
              });

              results.components.push(...pluginResult.components);
              results.tokens.push(...pluginResult.tokens);

              if (pluginResult.errors.length > 0) {
                results.errors.push(
                  ...pluginResult.errors.map(e => `[${source}] ${e.file || ''}: ${e.message}`)
                );
              }
            } else {
              // Fall back to bundled scanners

              // React
              if (source === 'react' && config.sources.react) {
                const scanner = new ReactComponentScanner({
                  projectRoot: process.cwd(),
                  include: config.sources.react.include,
                  exclude: config.sources.react.exclude,
                  designSystemPackage: config.sources.react.designSystemPackage,
                });

                const scanResult = await scanner.scan();
                results.components.push(...scanResult.items);

                if (scanResult.errors.length > 0) {
                  results.errors.push(
                    ...scanResult.errors.map(e => `[${source}] ${e.file || ''}: ${e.message}`)
                  );
                }
              }

              // Vue
              if (source === 'vue' && config.sources.vue) {
                const scanner = new VueComponentScanner({
                  projectRoot: process.cwd(),
                  include: config.sources.vue.include,
                  exclude: config.sources.vue.exclude,
                });

                const scanResult = await scanner.scan();
                results.components.push(...scanResult.items);

                if (scanResult.errors.length > 0) {
                  results.errors.push(
                    ...scanResult.errors.map(e => `[${source}] ${e.file || ''}: ${e.message}`)
                  );
                }
              }

              // Svelte
              if (source === 'svelte' && config.sources.svelte) {
                const scanner = new SvelteComponentScanner({
                  projectRoot: process.cwd(),
                  include: config.sources.svelte.include,
                  exclude: config.sources.svelte.exclude,
                });

                const scanResult = await scanner.scan();
                results.components.push(...scanResult.items);

                if (scanResult.errors.length > 0) {
                  results.errors.push(
                    ...scanResult.errors.map(e => `[${source}] ${e.file || ''}: ${e.message}`)
                  );
                }
              }

              // Angular
              if (source === 'angular' && config.sources.angular) {
                const scanner = new AngularComponentScanner({
                  projectRoot: process.cwd(),
                  include: config.sources.angular.include,
                  exclude: config.sources.angular.exclude,
                });

                const scanResult = await scanner.scan();
                results.components.push(...scanResult.items);

                if (scanResult.errors.length > 0) {
                  results.errors.push(
                    ...scanResult.errors.map(e => `[${source}] ${e.file || ''}: ${e.message}`)
                  );
                }
              }

              // Web Components (Lit, Stencil)
              if (source === 'webcomponent' && config.sources.webcomponent) {
                const scanner = new WebComponentScanner({
                  projectRoot: process.cwd(),
                  include: config.sources.webcomponent.include,
                  exclude: config.sources.webcomponent.exclude,
                  framework: config.sources.webcomponent.framework,
                });

                const scanResult = await scanner.scan();
                results.components.push(...scanResult.items);

                if (scanResult.errors.length > 0) {
                  results.errors.push(
                    ...scanResult.errors.map(e => `[${source}] ${e.file || ''}: ${e.message}`)
                  );
                }
              }

              // Templates (Blade, ERB, Twig, etc.)
              if (source === 'templates' && config.sources.templates) {
                const scanner = new TemplateScanner({
                  projectRoot: process.cwd(),
                  include: config.sources.templates.include,
                  exclude: config.sources.templates.exclude,
                  templateType: config.sources.templates.type,
                });

                const scanResult = await scanner.scan();
                results.components.push(...scanResult.items);

                if (scanResult.errors.length > 0) {
                  results.errors.push(
                    ...scanResult.errors.map(e => `[${source}] ${e.file || ''}: ${e.message}`)
                  );
                }
              }

              // Tokens
              if (source === 'tokens' && config.sources.tokens) {
                const scanner = new TokenScanner({
                  projectRoot: process.cwd(),
                  files: config.sources.tokens.files,
                  cssVariablePrefix: config.sources.tokens.cssVariablePrefix,
                });

                const scanResult = await scanner.scan();
                results.tokens.push(...scanResult.items);

                if (scanResult.errors.length > 0) {
                  results.errors.push(
                    ...scanResult.errors.map(e => `[${source}] ${e.file || ''}: ${e.message}`)
                  );
                }
              }

              // TODO: Add figma, storybook scanners
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            results.errors.push(`[${source}] ${message}`);
          }
        }

        spin.stop();

        // Output results
        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
          return;
        }

        header('Scan Results');
        newline();

        keyValue('Components found', String(results.components.length));
        keyValue('Tokens found', String(results.tokens.length));
        keyValue('Errors', String(results.errors.length));
        newline();

        if (results.components.length > 0) {
          header('Components');
          console.log(formatComponentTable(results.components));
          newline();
        }

        if (results.tokens.length > 0) {
          header('Tokens');
          console.log(formatTokenTable(results.tokens));
          newline();
        }

        if (results.errors.length > 0) {
          header('Errors');
          for (const err of results.errors) {
            error(err);
          }
          newline();
        }

        success('Scan complete');
      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Scan failed: ${message}`);
        process.exit(1);
      }
    });

  return cmd;
}
