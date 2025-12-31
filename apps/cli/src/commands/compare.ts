import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { resolve, basename } from 'path';
import chalk from 'chalk';
import {
  spinner,
  success,
  error,
  info,
  warning,
  header,
  keyValue,
  newline,
  setJsonMode,
} from '../output/reporters.js';
import {
  parseTokenFile,
  detectFormat,
  compareTokens,
  type DesignToken,
} from '@buoy-design/core';
import { TokenScanner } from '@buoy-design/scanners';

export function createCompareCommand(): Command {
  const cmd = new Command('compare')
    .description('Compare design tokens from a file against your codebase')
    .argument('<design-tokens-file>', 'Path to design tokens JSON file (DTCG, Tokens Studio, or Style Dictionary format)')
    .option('--json', 'Output as JSON')
    .option('--strict', 'Exit with error code if any drift detected')
    .option('-v, --verbose', 'Show detailed match information')
    .action(async (designTokensPath: string, options) => {
      if (options.json) {
        setJsonMode(true);
      }

      const spin = spinner('Loading design tokens...');

      try {
        const cwd = process.cwd();
        const fullPath = resolve(cwd, designTokensPath);

        // Verify file exists
        if (!existsSync(fullPath)) {
          spin.stop();
          error(`File not found: ${designTokensPath}`);
          process.exit(1);
        }

        // Parse design tokens file
        const content = readFileSync(fullPath, 'utf-8');
        let designTokens: DesignToken[];

        try {
          const json = JSON.parse(content);
          const format = detectFormat(json);

          if (!options.json) {
            spin.stop();
            info(`Detected format: ${formatName(format)}`);
            spin.start('Parsing tokens...');
          }

          designTokens = parseTokenFile(content);
        } catch (parseErr) {
          spin.stop();
          error(`Failed to parse token file: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
          process.exit(1);
        }

        if (designTokens.length === 0) {
          spin.stop();
          warning('No tokens found in the design file');
          info('Make sure the file contains valid DTCG, Tokens Studio, or Style Dictionary format tokens');
          process.exit(0);
        }

        // Scan codebase for tokens
        spin.text = 'Scanning codebase for tokens...';

        const scanner = new TokenScanner({
          projectRoot: cwd,
          include: ['**/*.css', '**/*.scss', '**/*.json'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/*.min.css'],
        });

        const scanResult = await scanner.scan();
        const codeTokens = scanResult.items;
        spin.stop();

        // Compare tokens
        const result = compareTokens(designTokens, codeTokens);

        // Output results
        if (options.json) {
          console.log(JSON.stringify({
            designFile: basename(fullPath),
            ...result,
          }, null, 2));
          return;
        }

        newline();
        header('Token Comparison');
        newline();

        // Summary
        keyValue('Design tokens', String(result.summary.totalDesignTokens));
        keyValue('Code tokens', String(result.summary.totalCodeTokens));
        keyValue('Matched', String(result.summary.matched));
        if (result.summary.matchedWithDrift > 0) {
          keyValue('Value drift', chalk.yellow(String(result.summary.matchedWithDrift)));
        }
        if (result.summary.missing > 0) {
          keyValue('Missing in code', chalk.red(String(result.summary.missing)));
        }
        if (result.summary.orphan > 0) {
          keyValue('Orphan (code only)', chalk.dim(String(result.summary.orphan)));
        }
        newline();

        // Match details
        if (options.verbose && result.matches.length > 0) {
          console.log(chalk.bold('Matches:'));
          for (const match of result.matches) {
            const icon = match.valueDrift ? chalk.yellow('⚠') : chalk.green('✓');
            const matchType = match.matchType === 'exact' ? '' : chalk.dim(` [${match.matchType}]`);
            console.log(`  ${icon} ${match.designToken.name}${matchType}`);
            if (match.valueDrift) {
              console.log(`     Design: ${formatValue(match.designToken.value)}`);
              console.log(`     Code:   ${formatValue(match.codeToken.value)}`);
            }
          }
          newline();
        }

        // Missing tokens
        if (result.missingTokens.length > 0) {
          console.log(chalk.bold.red('Missing in codebase:'));
          for (const token of result.missingTokens.slice(0, 10)) {
            console.log(`  ${chalk.red('✗')} ${token.name}`);
          }
          if (result.missingTokens.length > 10) {
            console.log(chalk.dim(`  ... and ${result.missingTokens.length - 10} more`));
          }
          newline();
        }

        // Orphan tokens (optional, dimmed)
        if (options.verbose && result.orphanTokens.length > 0) {
          console.log(chalk.bold.dim('Code tokens not in design:'));
          for (const token of result.orphanTokens.slice(0, 5)) {
            console.log(chalk.dim(`  ? ${token.name}`));
          }
          if (result.orphanTokens.length > 5) {
            console.log(chalk.dim(`  ... and ${result.orphanTokens.length - 5} more`));
          }
          newline();
        }

        // Summary message
        if (result.summary.missing === 0 && result.summary.matchedWithDrift === 0) {
          success('Design tokens are fully aligned with your codebase!');
        } else if (result.summary.matchedWithDrift > 0) {
          warning(`${result.summary.matchedWithDrift} tokens have value drift`);
        }

        if (result.summary.missing > 0) {
          info(`${result.summary.missing} design tokens are not used in code`);
        }

        // Exit with error if strict mode and issues found
        if (options.strict && (result.summary.missing > 0 || result.summary.matchedWithDrift > 0)) {
          process.exit(1);
        }

      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Comparison failed: ${message}`);
        process.exit(1);
      }
    });

  return cmd;
}

function formatName(format: string): string {
  switch (format) {
    case 'dtcg': return 'W3C DTCG';
    case 'tokens-studio': return 'Tokens Studio';
    case 'style-dictionary': return 'Style Dictionary';
    default: return format;
  }
}

function formatValue(value: DesignToken['value']): string {
  if (value.type === 'color') {
    return value.hex;
  }
  if (value.type === 'spacing') {
    return `${value.value}${value.unit}`;
  }
  if (value.type === 'raw') {
    return String(value.value);
  }
  return JSON.stringify(value);
}
