/**
 * Buoy Import Command
 *
 * Import design tokens from various sources:
 * - TokenForge exports
 * - Tokens Studio (Figma Tokens)
 * - Style Dictionary
 * - W3C Design Tokens (DTCG)
 * - CSS files with variables
 */

import { Command } from 'commander';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve, extname } from 'path';
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
} from '../output/reporters.js';
import { parseTokenFile, detectFormat } from '@buoy-design/core';
import type { DesignToken } from '@buoy-design/core';

interface ImportOptions {
  output?: string;
  format?: 'css' | 'json' | 'scss';
  dryRun?: boolean;
}

export function createImportCommand(): Command {
  const cmd = new Command('import')
    .description('Import design tokens from external sources')
    .argument('<file>', 'Token file to import (JSON, CSS)')
    .option('-o, --output <path>', 'Output file path (default: design-tokens.css)')
    .option('-f, --format <format>', 'Output format: css, json, scss', 'css')
    .option('--dry-run', 'Preview import without writing files')
    .action(async (file: string, options: ImportOptions) => {
      const filePath = resolve(process.cwd(), file);

      if (!existsSync(filePath)) {
        error(`File not found: ${file}`);
        process.exit(1);
      }

      const spin = spinner('Reading token file...');

      try {
        const content = readFileSync(filePath, 'utf-8');
        const ext = extname(filePath).toLowerCase();
        let tokens: DesignToken[] = [];

        // Parse based on file type
        if (ext === '.json') {
          spin.text = 'Parsing JSON tokens...';
          const json = JSON.parse(content);
          const format = detectFormat(json);
          info(`Detected format: ${formatName(format)}`);
          tokens = parseTokenFile(content);
        } else if (ext === '.css') {
          spin.text = 'Extracting CSS variables...';
          tokens = parseCssVariables(content, filePath);
        } else if (ext === '.scss' || ext === '.sass') {
          spin.text = 'Extracting SCSS variables...';
          tokens = parseScssVariables(content, filePath);
        } else {
          spin.stop();
          error(`Unsupported file type: ${ext}`);
          info('Supported formats: .json, .css, .scss');
          process.exit(1);
        }

        spin.stop();

        if (tokens.length === 0) {
          warning('No tokens found in file.');
          process.exit(0);
        }

        // Display summary
        header('Import Summary');
        newline();

        const categories = groupByCategory(tokens);
        for (const [category, catTokens] of Object.entries(categories)) {
          keyValue(capitalize(category), `${catTokens.length} tokens`);
        }
        newline();

        // Preview tokens
        console.log(chalk.bold.underline('Token Preview'));
        const preview = tokens.slice(0, 10);
        for (const token of preview) {
          const value = getTokenValueString(token);
          console.log(`  ${chalk.cyan(token.name)}: ${value}`);
        }
        if (tokens.length > 10) {
          console.log(chalk.gray(`  ... and ${tokens.length - 10} more`));
        }
        newline();

        if (options.dryRun) {
          info('Dry run - no files written');
          return;
        }

        // Generate output
        const outputPath = options.output || `design-tokens.${options.format || 'css'}`;
        const outputContent = generateOutput(tokens, options.format || 'css');

        writeFileSync(resolve(process.cwd(), outputPath), outputContent);
        success(`Imported ${tokens.length} tokens to ${outputPath}`);

        // Hint about next steps
        newline();
        info('Next steps:');
        console.log('  1. Review the generated file');
        console.log('  2. Add to your .buoy.yaml:');
        console.log(chalk.gray(`     sources:`));
        console.log(chalk.gray(`       tokens:`));
        console.log(chalk.gray(`         files: ['${outputPath}']`));
        console.log('  3. Run `buoy show all` to verify');

      } catch (err) {
        spin.stop();
        const msg = err instanceof Error ? err.message : String(err);
        error(`Import failed: ${msg}`);
        process.exit(1);
      }
    });

  return cmd;
}

/**
 * Parse CSS custom properties
 */
function parseCssVariables(content: string, filePath: string): DesignToken[] {
  const tokens: DesignToken[] = [];
  const varRegex = /--([\w-]+)\s*:\s*([^;]+);/g;

  let match;
  while ((match = varRegex.exec(content)) !== null) {
    const name = match[1]!;
    const value = match[2]!.trim();

    tokens.push({
      id: `css:${filePath}:${name}`,
      name: `--${name}`,
      category: inferCategory(name, value),
      value: parseValue(value),
      source: {
        type: 'css',
        path: filePath,
      },
      aliases: [],
      usedBy: [],
      metadata: {},
      scannedAt: new Date(),
    });
  }

  return tokens;
}

/**
 * Parse SCSS variables
 */
function parseScssVariables(content: string, filePath: string): DesignToken[] {
  const tokens: DesignToken[] = [];
  const varRegex = /\$([\w-]+)\s*:\s*([^;]+);/g;

  let match;
  while ((match = varRegex.exec(content)) !== null) {
    const name = match[1]!;
    const value = match[2]!.trim();

    tokens.push({
      id: `scss:${filePath}:${name}`,
      name: `$${name}`,
      category: inferCategory(name, value),
      value: parseValue(value),
      source: {
        type: 'scss',
        path: filePath,
        variableName: `$${name}`,
      },
      aliases: [],
      usedBy: [],
      metadata: {},
      scannedAt: new Date(),
    });
  }

  return tokens;
}

/**
 * Infer token category from name or value
 */
function inferCategory(name: string, value: string): DesignToken['category'] {
  const nameLower = name.toLowerCase();

  if (nameLower.includes('color') || value.startsWith('#') || value.startsWith('rgb') || value.startsWith('hsl')) {
    return 'color';
  }
  if (nameLower.includes('spacing') || nameLower.includes('space') || nameLower.includes('gap') || nameLower.includes('margin') || nameLower.includes('padding')) {
    return 'spacing';
  }
  if (nameLower.includes('font') || nameLower.includes('text') || nameLower.includes('size')) {
    return 'typography';
  }
  if (nameLower.includes('radius') || nameLower.includes('rounded')) {
    return 'border';
  }
  if (nameLower.includes('shadow')) {
    return 'shadow';
  }

  return 'other';
}

/**
 * Parse a CSS value into TokenValue
 */
function parseValue(value: string): DesignToken['value'] {
  // Color
  if (value.startsWith('#') || value.startsWith('rgb') || value.startsWith('hsl')) {
    return {
      type: 'color',
      hex: normalizeColor(value),
    };
  }

  // Dimension
  const dimMatch = value.match(/^([\d.]+)(px|rem|em|%)$/);
  if (dimMatch) {
    return {
      type: 'spacing',
      value: parseFloat(dimMatch[1]!),
      unit: dimMatch[2] as 'px' | 'rem' | 'em',
    };
  }

  // Raw value
  return {
    type: 'raw',
    value,
  };
}

/**
 * Normalize color to hex
 */
function normalizeColor(color: string): string {
  if (color.startsWith('#')) {
    // Expand shorthand hex
    if (color.length === 4) {
      return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`.toLowerCase();
    }
    return color.toLowerCase();
  }
  // For rgb/hsl, just return as-is for now
  return color;
}

/**
 * Group tokens by category
 */
function groupByCategory(tokens: DesignToken[]): Record<string, DesignToken[]> {
  const groups: Record<string, DesignToken[]> = {};

  for (const token of tokens) {
    const cat = token.category;
    if (!groups[cat]) {
      groups[cat] = [];
    }
    groups[cat]!.push(token);
  }

  return groups;
}

/**
 * Get a display string for a token value
 */
function getTokenValueString(token: DesignToken): string {
  const v = token.value;
  if (v.type === 'color') {
    return v.hex;
  }
  if (v.type === 'spacing') {
    return `${v.value}${v.unit}`;
  }
  if (v.type === 'raw') {
    return v.value;
  }
  return JSON.stringify(v);
}

/**
 * Generate output file content
 */
function generateOutput(tokens: DesignToken[], format: string): string {
  if (format === 'json') {
    const output: Record<string, Record<string, string>> = {};

    for (const token of tokens) {
      const category = token.category;
      if (!output[category]) {
        output[category] = {};
      }
      output[category]![token.name] = getTokenValueString(token);
    }

    return JSON.stringify(output, null, 2);
  }

  if (format === 'scss') {
    const lines: string[] = ['// Design Tokens', '// Imported by Buoy', ''];
    const categories = groupByCategory(tokens);

    for (const [category, catTokens] of Object.entries(categories)) {
      lines.push(`// ${capitalize(category)}`);
      for (const token of catTokens) {
        // Convert to SCSS variable format
        const name = token.name.startsWith('--')
          ? token.name.slice(2)
          : token.name.startsWith('$')
          ? token.name.slice(1)
          : token.name;
        lines.push(`$${name}: ${getTokenValueString(token)};`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  // Default: CSS
  const lines: string[] = [
    '/**',
    ' * Design Tokens',
    ' * Imported by Buoy',
    ' */',
    '',
    ':root {',
  ];

  const categories = groupByCategory(tokens);

  for (const [category, catTokens] of Object.entries(categories)) {
    lines.push(`  /* ${capitalize(category)} */`);
    for (const token of catTokens) {
      // Convert to CSS variable format
      const name = token.name.startsWith('--')
        ? token.name
        : token.name.startsWith('$')
        ? `--${token.name.slice(1)}`
        : `--${token.name}`;
      lines.push(`  ${name}: ${getTokenValueString(token)};`);
    }
    lines.push('');
  }

  lines.push('}');

  return lines.join('\n');
}

function formatName(format: string): string {
  const names: Record<string, string> = {
    dtcg: 'W3C Design Tokens (DTCG)',
    'tokens-studio': 'Tokens Studio (Figma Tokens)',
    'style-dictionary': 'Style Dictionary',
  };
  return names[format] || format;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
