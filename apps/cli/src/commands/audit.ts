import { Command } from 'commander';
import chalk from 'chalk';
import { glob } from 'glob';
import { readFile } from 'fs/promises';
import {
  spinner,
  error,
  header,
  keyValue,
  newline,
  setJsonMode,
} from '../output/reporters.js';
import {
  generateAuditReport,
  findCloseMatches,
  type AuditValue,
  type AuditReport,
} from '@buoy-design/core';
import { extractStyles, extractCssFileStyles } from '@buoy-design/scanners';
import { parseCssValues } from '@buoy-design/core';

export function createAuditCommand(): Command {
  const cmd = new Command('audit')
    .description('Audit your codebase for design system health')
    .option('--json', 'Output as JSON')
    .option('--tokens <path>', 'Path to design tokens file for close-match detection')
    .action(async (options) => {
      if (options.json) {
        setJsonMode(true);
      }

      const spin = spinner('Scanning codebase...');

      try {
        const cwd = process.cwd();

        // Find all source files
        spin.text = 'Finding source files...';
        const patterns = [
          '**/*.tsx',
          '**/*.jsx',
          '**/*.vue',
          '**/*.svelte',
          '**/*.css',
          '**/*.scss',
        ];
        const ignore = [
          '**/node_modules/**',
          '**/dist/**',
          '**/build/**',
          '**/*.min.css',
          '**/*.test.*',
          '**/*.spec.*',
          '**/*.stories.*',
        ];

        const files: string[] = [];
        for (const pattern of patterns) {
          const matches = await glob(pattern, { cwd, ignore, absolute: true });
          files.push(...matches);
        }

        if (files.length === 0) {
          spin.stop();
          error('No source files found');
          return;
        }

        // Extract values from all files
        spin.text = `Scanning ${files.length} files...`;
        const extractedValues: AuditValue[] = [];

        for (const filePath of files) {
          try {
            const content = await readFile(filePath, 'utf-8');
            const relativePath = filePath.replace(cwd + '/', '');

            // Determine file type
            const ext = filePath.split('.').pop()?.toLowerCase();
            const isCss = ext === 'css' || ext === 'scss';

            const styles = isCss
              ? extractCssFileStyles(content)
              : extractStyles(content, ext === 'vue' ? 'vue' : ext === 'svelte' ? 'svelte' : 'react');

            for (const style of styles) {
              const { values } = parseCssValues(style.css);

              for (const v of values) {
                extractedValues.push({
                  category: mapCategory(v.property),
                  value: v.value,
                  file: relativePath,
                  line: 1, // Line info not available from style extraction
                });
              }
            }
          } catch {
            // Skip files that can't be processed
          }
        }

        spin.stop();

        if (extractedValues.length === 0) {
          console.log(chalk.green('✓ No hardcoded design values found!'));
          console.log(chalk.dim('Your codebase appears to be using design tokens correctly.'));
          return;
        }

        // Generate report
        const report = generateAuditReport(extractedValues);

        // Load design tokens for close-match detection if provided
        if (options.tokens) {
          try {
            const tokenContent = await readFile(options.tokens, 'utf-8');
            const tokenData = JSON.parse(tokenContent);
            // Extract token values and find close matches
            const colorTokens = extractTokenValues(tokenData, 'color');
            const spacingTokens = extractTokenValues(tokenData, 'spacing');

            const colorValues = extractedValues
              .filter((v) => v.category === 'color')
              .map((v) => v.value);
            const spacingValues = extractedValues
              .filter((v) => v.category === 'spacing')
              .map((v) => v.value);

            report.closeMatches = [
              ...findCloseMatches(colorValues, colorTokens, 'color'),
              ...findCloseMatches(spacingValues, spacingTokens, 'spacing'),
            ];
          } catch {
            // Ignore token loading errors
          }
        }

        // Output
        if (options.json) {
          console.log(JSON.stringify(report, null, 2));
          return;
        }

        printReport(report);
      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Audit failed: ${message}`);
        process.exit(1);
      }
    });

  return cmd;
}

function mapCategory(property: string): AuditValue['category'] {
  const colorProps = ['color', 'background', 'background-color', 'border-color', 'fill', 'stroke'];
  const spacingProps = ['padding', 'margin', 'gap', 'top', 'right', 'bottom', 'left', 'width', 'height'];
  const radiusProps = ['border-radius'];
  const typographyProps = ['font-size', 'line-height', 'font-weight', 'font-family'];

  const propLower = property.toLowerCase();

  if (colorProps.some((p) => propLower.includes(p))) return 'color';
  if (radiusProps.some((p) => propLower.includes(p))) return 'radius';
  if (typographyProps.some((p) => propLower.includes(p))) return 'typography';
  if (spacingProps.some((p) => propLower.includes(p))) return 'spacing';

  return 'spacing'; // Default
}

function extractTokenValues(tokenData: Record<string, unknown>, _category: string): string[] {
  const values: string[] = [];

  function traverse(obj: unknown): void {
    if (typeof obj !== 'object' || obj === null) return;

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key === '$value' || key === 'value') {
        if (typeof value === 'string') {
          values.push(value);
        }
      } else if (typeof value === 'object') {
        traverse(value);
      }
    }
  }

  traverse(tokenData);
  return values;
}

function printReport(report: AuditReport): void {
  newline();
  header('Design System Health Report');
  newline();

  // Score with color coding
  const scoreColor =
    report.score >= 80 ? chalk.green :
    report.score >= 50 ? chalk.yellow :
    chalk.red;

  const scoreLabel =
    report.score >= 80 ? 'Good' :
    report.score >= 50 ? 'Fair' :
    report.score < 30 ? 'Poor' : 'Needs Work';

  console.log(`Overall Score: ${scoreColor.bold(`${report.score}/100`)} (${scoreLabel})`);
  newline();

  // Category breakdown
  for (const [category, stats] of Object.entries(report.categories)) {
    const expected = getExpectedCount(category);
    const drift = stats.uniqueCount - expected;
    const driftColor = drift > 5 ? chalk.red : drift > 0 ? chalk.yellow : chalk.green;

    console.log(chalk.bold(capitalize(category)));
    keyValue('  Found', `${stats.uniqueCount} unique values`);
    keyValue('  Expected', `~${expected}`);
    if (drift > 0) {
      keyValue('  Drift', driftColor(`+${drift} extra values`));
    }

    // Most common unlisted
    if (stats.mostCommon.length > 0) {
      console.log(chalk.dim('  Most common:'));
      for (const { value, count } of stats.mostCommon.slice(0, 3)) {
        console.log(chalk.dim(`    ${value}  (${count} usages)`));
      }
    }
    newline();
  }

  // Close matches (typos)
  if (report.closeMatches.length > 0) {
    console.log(chalk.bold.yellow('Possible Typos'));
    for (const match of report.closeMatches.slice(0, 5)) {
      console.log(`  ${chalk.yellow('⚠')} ${match.value} → close to ${chalk.cyan(match.closeTo)}`);
    }
    if (report.closeMatches.length > 5) {
      console.log(chalk.dim(`  ... and ${report.closeMatches.length - 5} more`));
    }
    newline();
  }

  // Worst files
  if (report.worstFiles.length > 0) {
    console.log(chalk.bold('Worst Offenders'));
    for (const { file, issueCount } of report.worstFiles.slice(0, 5)) {
      console.log(`  ${chalk.red(issueCount.toString().padStart(3))} issues  ${file}`);
    }
    newline();
  }

  // Summary
  console.log(chalk.dim('─'.repeat(50)));
  keyValue('Total unique values', String(report.totals.uniqueValues));
  keyValue('Total usages', String(report.totals.totalUsages));
  keyValue('Files affected', String(report.totals.filesAffected));
  newline();

  if (report.score < 50) {
    console.log(chalk.yellow('Run `buoy drift check` for detailed fixes.'));
  }
}

function getExpectedCount(category: string): number {
  const expected: Record<string, number> = {
    color: 12,
    spacing: 8,
    typography: 6,
    radius: 4,
  };
  return expected[category] || 10;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
