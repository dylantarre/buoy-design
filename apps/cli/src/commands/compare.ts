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
import { TokenScanner, FigmaVariableScanner } from '@buoy-design/scanners';
import { loadConfig, getConfigPath } from '../config/loader.js';

export function createCompareCommand(): Command {
  const cmd = new Command('compare')
    .description('Compare design tokens from Figma or a file against your codebase')
    .argument('[design-tokens-file]', 'Path to design tokens JSON file (DTCG, Tokens Studio, or Style Dictionary format)')
    .option('--figma', 'Compare tokens from Figma Variables API (requires config)')
    .option('--figma-file <key>', 'Figma file key to fetch variables from')
    .option('--json', 'Output as JSON')
    .option('--strict', 'Exit with error code if any drift detected')
    .option('-v, --verbose', 'Show detailed match information')
    .action(async (designTokensPath: string | undefined, options) => {
      if (options.json) {
        setJsonMode(true);
      }

      const spin = spinner('Loading configuration...');

      try {
        const cwd = process.cwd();
        let designTokens: DesignToken[];
        let sourceLabel: string;

        // Determine source: Figma or file
        if (options.figma || options.figmaFile) {
          // Figma source
          const result = await loadFigmaTokens(options, spin);
          designTokens = result.tokens;
          sourceLabel = result.label;
        } else if (designTokensPath) {
          // File source
          const result = await loadFileTokens(designTokensPath, cwd, options, spin);
          designTokens = result.tokens;
          sourceLabel = result.label;
        } else {
          // Check if Figma is configured
          const configPath = getConfigPath();
          if (configPath) {
            const { config } = await loadConfig();
            if (config.sources.figma?.enabled && config.sources.figma?.fileKeys?.length > 0) {
              spin.stop();
              info('No source specified. Using Figma from config...');
              spin.start();
              const result = await loadFigmaTokens({ ...options, figma: true }, spin);
              designTokens = result.tokens;
              sourceLabel = result.label;
            } else {
              spin.stop();
              error('No source specified. Provide a token file path or use --figma flag.');
              console.log('');
              info('Usage:');
              info('  buoy compare tokens.json         # Compare from JSON file');
              info('  buoy compare --figma             # Compare from Figma (requires config)');
              info('  buoy compare --figma-file ABC123 # Compare from specific Figma file');
              process.exit(1);
            }
          } else {
            spin.stop();
            error('No source specified. Provide a token file path or use --figma flag.');
            console.log('');
            info('Usage:');
            info('  buoy compare tokens.json         # Compare from JSON file');
            info('  buoy compare --figma             # Compare from Figma (requires config)');
            info('  buoy compare --figma-file ABC123 # Compare from specific Figma file');
            process.exit(1);
          }
        }

        if (designTokens.length === 0) {
          spin.stop();
          warning('No tokens found in the design source');
          if (options.figma || options.figmaFile) {
            info('Make sure your Figma file has Variables defined');
          } else {
            info('Make sure the file contains valid DTCG, Tokens Studio, or Style Dictionary format tokens');
          }
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
            source: sourceLabel,
            ...result,
          }, null, 2));
          return;
        }

        newline();
        header('Token Comparison');
        keyValue('Source', sourceLabel);
        newline();

        // Summary
        keyValue('Design tokens', String(result.summary.totalDesignTokens));
        keyValue('Code tokens', String(result.summary.totalCodeTokens));
        keyValue('Matched', chalk.green(String(result.summary.matched)));
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
            const icon = match.valueDrift ? chalk.yellow('!') : chalk.green('+');
            const matchType = match.matchType === 'exact' ? '' : chalk.dim(` [${match.matchType}]`);
            console.log(`  ${icon} ${match.designToken.name}${matchType}`);
            if (match.valueDrift) {
              console.log(`     Design: ${formatValue(match.designToken.value)}`);
              console.log(`     Code:   ${formatValue(match.codeToken.value)}`);
            }
          }
          newline();
        }

        // Changed tokens (value drift)
        if (result.matches.filter(m => m.valueDrift).length > 0) {
          console.log(chalk.bold.yellow('Changed (value drift):'));
          for (const match of result.matches.filter(m => m.valueDrift).slice(0, 10)) {
            console.log(`  ${chalk.yellow('~')} ${match.designToken.name}`);
            console.log(`     Design: ${formatValue(match.designToken.value)}`);
            console.log(`     Code:   ${formatValue(match.codeToken.value)}`);
          }
          const driftCount = result.matches.filter(m => m.valueDrift).length;
          if (driftCount > 10) {
            console.log(chalk.dim(`  ... and ${driftCount - 10} more`));
          }
          newline();
        }

        // Missing tokens
        if (result.missingTokens.length > 0) {
          console.log(chalk.bold.red('Missing in codebase:'));
          for (const token of result.missingTokens.slice(0, 10)) {
            console.log(`  ${chalk.red('-')} ${token.name}`);
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

/**
 * Load tokens from Figma Variables API
 */
async function loadFigmaTokens(
  options: { figmaFile?: string },
  spin: { text: string; stop: () => void; start: (text?: string) => void }
): Promise<{ tokens: DesignToken[]; label: string }> {
  spin.text = 'Loading Figma configuration...';

  // Get Figma config
  let accessToken = process.env.FIGMA_ACCESS_TOKEN;
  let fileKeys: string[] = [];

  if (options.figmaFile) {
    fileKeys = [options.figmaFile];
  } else {
    // Load from config
    const configPath = getConfigPath();
    if (!configPath) {
      spin.stop();
      error('No buoy.config.mjs found. Run "buoy init" first or provide --figma-file.');
      process.exit(1);
    }

    const { config } = await loadConfig();
    if (!config.sources.figma?.enabled) {
      spin.stop();
      error('Figma is not enabled in your config. Add sources.figma.enabled = true');
      process.exit(1);
    }

    accessToken = config.sources.figma.accessToken || accessToken;
    fileKeys = config.sources.figma.fileKeys || [];
  }

  if (!accessToken) {
    spin.stop();
    error('No Figma access token found.');
    console.log('');
    info('Set FIGMA_ACCESS_TOKEN environment variable or add to config:');
    info('  sources.figma.accessToken = "your-token"');
    console.log('');
    info('Generate a token at: https://www.figma.com/developers/api#access-tokens');
    process.exit(1);
  }

  if (fileKeys.length === 0) {
    spin.stop();
    error('No Figma file keys configured.');
    console.log('');
    info('Add file keys to your config:');
    info('  sources.figma.fileKeys = ["your-file-key"]');
    console.log('');
    info('Find your file key in the Figma URL:');
    info('  https://www.figma.com/file/ABC123/...');
    info('                           ^^^^^^');
    process.exit(1);
  }

  spin.text = 'Fetching Figma variables...';

  const scanner = new FigmaVariableScanner({
    projectRoot: process.cwd(),
    accessToken,
    fileKeys,
  });

  const result = await scanner.scan();

  if (result.errors.length > 0) {
    spin.stop();
    for (const err of result.errors) {
      error(`[${err.file || 'figma'}] ${err.message}`);
    }
    if (result.items.length === 0) {
      process.exit(1);
    }
    warning('Some Figma files had errors, continuing with partial results...');
    spin.start();
  }

  const label = fileKeys.length === 1
    ? `Figma file: ${fileKeys[0]}`
    : `Figma files: ${fileKeys.join(', ')}`;

  return { tokens: result.items, label };
}

/**
 * Load tokens from a JSON file
 */
async function loadFileTokens(
  designTokensPath: string,
  cwd: string,
  options: { json?: boolean },
  spin: { text: string; stop: () => void; start: (text?: string) => void }
): Promise<{ tokens: DesignToken[]; label: string }> {
  spin.text = 'Loading design tokens...';

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

  return { tokens: designTokens, label: basename(fullPath) };
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
