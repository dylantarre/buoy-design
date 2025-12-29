import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, getConfigPath } from '../config/loader.js';
import {
  spinner,
  success,
  error,
  info,
  coverageGrid,
  type CoverageStats,
} from '../output/reporters.js';
import { ProjectDetector } from '../detect/project-detector.js';
import type { DriftSignal } from '@buoy/core';

export function createStatusCommand(): Command {
  const cmd = new Command('status')
    .description('Show design system coverage at a glance')
    .option('--json', 'Output as JSON')
    .option('-v, --verbose', 'Verbose output')
    .action(async (options) => {
      const spin = spinner('Analyzing design system coverage...');

      try {
        // Check if config exists
        const configExists = getConfigPath() !== null;
        if (!configExists) {
          spin.stop();
          error('No configuration found');
          console.log('');
          info('Run buoy init to set up your project');
          return;
        }

        const { config } = await loadConfig();

        // Import required modules
        const {
          ReactComponentScanner,
          VueComponentScanner,
          SvelteComponentScanner,
          AngularComponentScanner,
          WebComponentScanner,
          TemplateScanner,
        } = await import('@buoy/scanners/git');
        const { SemanticDiffEngine } = await import('@buoy/core/analysis');

        // Scan components from all sources
        type ComponentItem = Awaited<ReturnType<typeof ReactComponentScanner.prototype.scan>>['items'][number];
        const components: ComponentItem[] = [];

        spin.text = 'Scanning components...';

        // React
        if (config.sources.react?.enabled) {
          const scanner = new ReactComponentScanner({
            projectRoot: process.cwd(),
            include: config.sources.react.include,
            exclude: config.sources.react.exclude,
            designSystemPackage: config.sources.react.designSystemPackage,
          });
          const result = await scanner.scan();
          components.push(...result.items);
        }

        // Vue
        if (config.sources.vue?.enabled) {
          const scanner = new VueComponentScanner({
            projectRoot: process.cwd(),
            include: config.sources.vue.include,
            exclude: config.sources.vue.exclude,
          });
          const result = await scanner.scan();
          components.push(...result.items);
        }

        // Svelte
        if (config.sources.svelte?.enabled) {
          const scanner = new SvelteComponentScanner({
            projectRoot: process.cwd(),
            include: config.sources.svelte.include,
            exclude: config.sources.svelte.exclude,
          });
          const result = await scanner.scan();
          components.push(...result.items);
        }

        // Angular
        if (config.sources.angular?.enabled) {
          const scanner = new AngularComponentScanner({
            projectRoot: process.cwd(),
            include: config.sources.angular.include,
            exclude: config.sources.angular.exclude,
          });
          const result = await scanner.scan();
          components.push(...result.items);
        }

        // Web Components
        if (config.sources.webcomponent?.enabled) {
          const scanner = new WebComponentScanner({
            projectRoot: process.cwd(),
            include: config.sources.webcomponent.include,
            exclude: config.sources.webcomponent.exclude,
            framework: config.sources.webcomponent.framework,
          });
          const result = await scanner.scan();
          components.push(...result.items);
        }

        // Templates
        if (config.sources.templates?.enabled) {
          const scanner = new TemplateScanner({
            projectRoot: process.cwd(),
            include: config.sources.templates.include,
            exclude: config.sources.templates.exclude,
            templateType: config.sources.templates.type,
          });
          const result = await scanner.scan();
          components.push(...result.items);
        }

        // Detect frameworks for sprawl check
        spin.text = 'Detecting frameworks...';
        const detector = new ProjectDetector(process.cwd());
        const projectInfo = await detector.detect();

        // Run drift analysis
        spin.text = 'Analyzing drift...';
        const engine = new SemanticDiffEngine();
        const diffResult = engine.analyzeComponents(components, {
          checkDeprecated: true,
          checkNaming: true,
          checkDocumentation: true,
        });

        const drifts: DriftSignal[] = [...diffResult.drifts];

        // Check for framework sprawl
        const sprawlSignal = engine.checkFrameworkSprawl(
          projectInfo.frameworks.map(f => ({ name: f.name, version: f.version }))
        );
        if (sprawlSignal) {
          drifts.push(sprawlSignal);
        }

        // Calculate coverage stats
        const driftingComponentIds = new Set(
          drifts.map(d => d.source.entityId)
        );

        const stats: CoverageStats = {
          aligned: components.filter(c => !driftingComponentIds.has(c.id)).length,
          drifting: driftingComponentIds.size,
          untracked: 0, // For future: components not yet analyzed
          total: components.length,
        };

        spin.stop();

        // Group components by status
        const alignedComponents = components.filter(c => !driftingComponentIds.has(c.id));
        const driftingComponentsList = components.filter(c => driftingComponentIds.has(c.id));

        // Output
        if (options.json) {
          console.log(JSON.stringify({
            stats,
            alignedPercent: stats.total > 0 ? Math.round((stats.aligned / stats.total) * 100) : 0,
            frameworks: projectInfo.frameworks.map(f => ({ name: f.name, version: f.version })),
            frameworkSprawl: sprawlSignal !== null,
            components: {
              aligned: alignedComponents.map(c => ({ id: c.id, name: c.name, path: 'path' in c.source ? c.source.path : undefined })),
              drifting: driftingComponentsList.map(c => ({ id: c.id, name: c.name, path: 'path' in c.source ? c.source.path : undefined })),
            },
          }, null, 2));
          return;
        }

        if (stats.total === 0) {
          info('No components found to analyze.');
          console.log('');
          info('Options:');
          info('  • Run ' + chalk.cyan('buoy bootstrap') + ' to extract tokens from existing code');
          info('  • Run ' + chalk.cyan('buoy build') + ' to generate a design system with AI');
          info('  • Check your config has component paths configured');
          return;
        }

        // Display framework sprawl warning if detected
        if (sprawlSignal) {
          console.log('');
          console.log(chalk.yellow.bold('⚠️  Framework Sprawl Detected'));
          console.log(chalk.dim('   Multiple UI frameworks in use:'));
          projectInfo.frameworks.forEach(f => {
            const version = f.version !== 'unknown' ? chalk.dim(` (${f.version})`) : '';
            console.log(`   • ${chalk.cyan(f.name)}${version}`);
          });
          console.log('');
        }

        // Display the coverage grid
        coverageGrid(stats);

        // Display component lists
        console.log('');

        if (driftingComponentsList.length > 0) {
          console.log('\x1b[33m⛀ Drifting:\x1b[0m');
          driftingComponentsList.forEach(c => {
            console.log(`  ${c.name}`);
          });
          console.log('');
        }

        if (alignedComponents.length > 0) {
          console.log('\x1b[32m⛁ Aligned:\x1b[0m');
          alignedComponents.forEach(c => {
            console.log(`  ${c.name}`);
          });
          console.log('');
        }

        // Summary message
        const alignedPct = Math.round((stats.aligned / stats.total) * 100);
        if (alignedPct === 100) {
          success('Perfect alignment! No drift detected.');
        } else if (alignedPct >= 80) {
          success('Good alignment. Minor drift to review.');
        } else if (alignedPct >= 50) {
          info('Moderate alignment. Consider reviewing drifting components.');
        } else {
          error('Low alignment. Run buoy drift check for details.');
        }

      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Status check failed: ${message}`);

        if (options.verbose) {
          console.error(err);
        }

        process.exit(1);
      }
    });

  return cmd;
}
