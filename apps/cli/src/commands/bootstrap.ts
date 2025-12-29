import { Command } from 'commander';
import { writeFileSync, readFileSync } from 'fs';
import { resolve, relative } from 'path';
import chalk from 'chalk';
import { glob } from 'glob';
import { loadConfig, getConfigPath } from '../config/loader.js';
import { spinner, success, error, info, header, newline, warning } from '../output/reporters.js';
import { detectFrameworks } from '../detect/frameworks.js';

// Patterns for detecting hardcoded values in CSS/SCSS
const COLOR_PATTERNS = [
  /#[0-9a-fA-F]{3,8}\b/g,           // Hex colors
  /rgb\s*\([^)]+\)/gi,               // rgb()
  /rgba\s*\([^)]+\)/gi,              // rgba()
  /hsl\s*\([^)]+\)/gi,               // hsl()
  /hsla\s*\([^)]+\)/gi,              // hsla()
];

const SPACING_PATTERN = /:\s*(\d+(?:\.\d+)?(?:px|rem|em))\s*[;}\n]/g;
const FONT_SIZE_PATTERN = /font-size\s*:\s*(\d+(?:\.\d+)?(?:px|rem|em|pt))/gi;

interface ExtractedValue {
  type: 'color' | 'spacing' | 'fontSize' | 'fontFamily' | 'shadow' | 'border' | 'other';
  value: string;
  count: number;
  sources: string[];
}

interface TokenOutput {
  $schema?: string;
  colors: Record<string, { value: string; description?: string }>;
  spacing: Record<string, { value: string; description?: string }>;
  typography: {
    fontSizes: Record<string, { value: string; description?: string }>;
  };
}

export function createBootstrapCommand(): Command {
  const cmd = new Command('bootstrap')
    .description('Extract design tokens from existing hardcoded values')
    .option('--format <format>', 'Output format: json, css-variables, tailwind', 'json')
    .option('--output <path>', 'Output file path', 'tokens.json')
    .option('--dry-run', 'Preview without writing files')
    .option('-v, --verbose', 'Show detailed extraction info')
    .action(async (options) => {
      try {
        const cwd = process.cwd();

        // Early validation: Check if this is a frontend project
        const frameworks = await detectFrameworks(cwd);
        const frontendFrameworks = frameworks.filter(f =>
          ['react', 'vue', 'svelte', 'angular', 'webcomponents', 'tailwind', 'css'].includes(f.plugin)
        );

        // Check for style files
        const stylePatterns = ['**/*.css', '**/*.scss', '**/*.sass', '**/*.less'];
        const styleIgnore = ['**/node_modules/**', '**/dist/**', '**/build/**'];
        let hasStyleFiles = false;

        for (const pattern of stylePatterns) {
          const matches = await glob(pattern, { cwd, ignore: styleIgnore, nodir: true });
          if (matches.length > 0) {
            hasStyleFiles = true;
            break;
          }
        }

        // If no frontend framework and no style files, abort early
        if (frontendFrameworks.length === 0 && !hasStyleFiles) {
          newline();
          warning('This doesn\'t appear to be a frontend project.');
          newline();
          info('Bootstrap extracts design tokens from existing CSS and component files.');
          info('No frontend frameworks or stylesheets were detected in this project.');
          newline();
          console.log(chalk.dim('Detected project type:'));
          if (frameworks.length > 0) {
            frameworks.forEach(f => console.log(chalk.dim(`  • ${f.name} (${f.evidence})`)));
          } else {
            console.log(chalk.dim('  • No known frameworks detected'));
          }
          newline();
          console.log(chalk.cyan('💡 If this is a frontend project:'));
          console.log(chalk.dim('   • Ensure you\'re in the correct directory'));
          console.log(chalk.dim('   • Check that your CSS/component files exist'));
          newline();
          console.log(chalk.cyan('💡 To create a design system from scratch:'));
          console.log(chalk.dim('   Run: buoy build'));
          return;
        }

        const spin = spinner('Scanning for hardcoded values...');
        const extracted: Map<string, ExtractedValue> = new Map();

        // Check if config exists - if so, use component scanning
        const configExists = getConfigPath() !== null;

        if (configExists) {
          spin.text = 'Scanning components for hardcoded values...';
          await extractFromComponents(cwd, extracted, options.verbose);
        }

        // Always scan CSS/SCSS files
        spin.text = 'Scanning stylesheets...';
        await extractFromStylesheets(cwd, extracted, options.verbose);

        spin.stop();

        // Group by type
        const colors = [...extracted.values()].filter(v => v.type === 'color');
        const spacing = [...extracted.values()].filter(v => v.type === 'spacing');
        const fontSizes = [...extracted.values()].filter(v => v.type === 'fontSize');

        // Display summary
        newline();
        header('Extracted Values');
        newline();

        if (colors.length === 0 && spacing.length === 0 && fontSizes.length === 0) {
          info('No hardcoded values found to extract.');
          newline();
          info('This could mean:');
          info('  • Your codebase already uses design tokens');
          info('  • No CSS/component files were found');
          info('  • Values are using CSS variables or theme objects');
          newline();

          // Suggest buoy build
          console.log(chalk.cyan('💡 Want to create a design system from scratch?'));
          console.log(chalk.dim('   Run: buoy build'));
          return;
        }

        console.log(`  ${chalk.cyan('Colors:')} ${colors.length} unique values`);
        if (options.verbose && colors.length > 0) {
          colors.slice(0, 5).forEach(c => {
            console.log(chalk.dim(`    ${c.value} (${c.count}x)`));
          });
          if (colors.length > 5) console.log(chalk.dim(`    ... and ${colors.length - 5} more`));
        }

        console.log(`  ${chalk.cyan('Spacing:')} ${spacing.length} unique values`);
        if (options.verbose && spacing.length > 0) {
          spacing.slice(0, 5).forEach(s => {
            console.log(chalk.dim(`    ${s.value} (${s.count}x)`));
          });
          if (spacing.length > 5) console.log(chalk.dim(`    ... and ${spacing.length - 5} more`));
        }

        console.log(`  ${chalk.cyan('Font sizes:')} ${fontSizes.length} unique values`);
        if (options.verbose && fontSizes.length > 0) {
          fontSizes.slice(0, 5).forEach(f => {
            console.log(chalk.dim(`    ${f.value} (${f.count}x)`));
          });
          if (fontSizes.length > 5) console.log(chalk.dim(`    ... and ${fontSizes.length - 5} more`));
        }

        newline();

        // Generate output
        const outputPath = resolve(cwd, options.output);

        if (options.dryRun) {
          info('Dry run - no files written');
          newline();
          console.log(chalk.dim('Would generate:'));
          console.log(chalk.dim(`  ${outputPath}`));
          newline();

          // Preview the output
          const tokens = generateTokens(colors, spacing, fontSizes);
          console.log(chalk.dim(JSON.stringify(tokens, null, 2).slice(0, 500) + '...'));
          return;
        }

        // Generate and write tokens
        const tokens = generateTokens(colors, spacing, fontSizes);

        switch (options.format) {
          case 'css-variables':
            writeFileSync(outputPath.replace('.json', '.css'), generateCssVariables(tokens));
            success(`Created ${relative(cwd, outputPath.replace('.json', '.css'))}`);
            break;
          case 'tailwind':
            writeFileSync(outputPath.replace('.json', '.js'), generateTailwindConfig(tokens));
            success(`Created ${relative(cwd, outputPath.replace('.json', '.js'))}`);
            break;
          default:
            writeFileSync(outputPath, JSON.stringify(tokens, null, 2));
            success(`Created ${relative(cwd, outputPath)}`);
        }

        newline();
        info('Next steps:');
        info('  1. Review and rename tokens in the generated file');
        info('  2. Update your config to reference the token file');
        info('  3. Run ' + chalk.cyan('buoy drift check') + ' to find usage of hardcoded values');
        newline();

        console.log(chalk.dim('💡 Tip: Use buoy build to generate a complete design system with AI'));

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        error(`Bootstrap failed: ${message}`);
        process.exit(1);
      }
    });

  return cmd;
}

async function extractFromComponents(
  cwd: string,
  extracted: Map<string, ExtractedValue>,
  _verbose: boolean
): Promise<void> {
  const { config } = await loadConfig();

  // Import scanners dynamically
  const {
    ReactComponentScanner,
    VueComponentScanner,
    SvelteComponentScanner,
  } = await import('@buoy/scanners/git');

  // Scan React components
  if (config.sources.react?.enabled) {
    const scanner = new ReactComponentScanner({
      projectRoot: cwd,
      include: config.sources.react.include,
      exclude: config.sources.react.exclude,
    });

    const result = await scanner.scan();

    for (const component of result.items) {
      if (component.metadata.hardcodedValues) {
        const sourcePath = 'path' in component.source ? component.source.path : component.name;
        for (const hv of component.metadata.hardcodedValues) {
          addExtractedValue(extracted, hv.value, hv.type, sourcePath);
        }
      }
    }
  }

  // Scan Vue components
  if (config.sources.vue?.enabled) {
    const scanner = new VueComponentScanner({
      projectRoot: cwd,
      include: config.sources.vue.include,
      exclude: config.sources.vue.exclude,
    });

    const result = await scanner.scan();

    for (const component of result.items) {
      if (component.metadata.hardcodedValues) {
        const sourcePath = 'path' in component.source ? component.source.path : component.name;
        for (const hv of component.metadata.hardcodedValues) {
          addExtractedValue(extracted, hv.value, hv.type, sourcePath);
        }
      }
    }
  }

  // Scan Svelte components
  if (config.sources.svelte?.enabled) {
    const scanner = new SvelteComponentScanner({
      projectRoot: cwd,
      include: config.sources.svelte.include,
      exclude: config.sources.svelte.exclude,
    });

    const result = await scanner.scan();

    for (const component of result.items) {
      if (component.metadata.hardcodedValues) {
        const sourcePath = 'path' in component.source ? component.source.path : component.name;
        for (const hv of component.metadata.hardcodedValues) {
          addExtractedValue(extracted, hv.value, hv.type, sourcePath);
        }
      }
    }
  }
}

async function extractFromStylesheets(
  cwd: string,
  extracted: Map<string, ExtractedValue>,
  _verbose: boolean
): Promise<void> {
  // Find CSS/SCSS files
  const patterns = ['**/*.css', '**/*.scss', '**/*.sass', '**/*.less'];
  const ignore = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**'];

  const files: string[] = [];
  for (const pattern of patterns) {
    const matches = await glob(pattern, { cwd, ignore, absolute: true });
    files.push(...matches);
  }

  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8');
      const relativePath = relative(cwd, file);

      // Skip files that are likely generated or vendor
      if (relativePath.includes('vendor') || relativePath.includes('.min.')) {
        continue;
      }

      // Extract colors
      for (const pattern of COLOR_PATTERNS) {
        const matches = content.matchAll(pattern);
        for (const match of matches) {
          const value = match[0].toLowerCase();
          // Skip CSS variable references
          if (!value.includes('var(')) {
            addExtractedValue(extracted, value, 'color', relativePath);
          }
        }
      }

      // Extract spacing values
      const spacingMatches = content.matchAll(SPACING_PATTERN);
      for (const match of spacingMatches) {
        if (match[1]) {
          addExtractedValue(extracted, match[1], 'spacing', relativePath);
        }
      }

      // Extract font sizes
      const fontMatches = content.matchAll(FONT_SIZE_PATTERN);
      for (const match of fontMatches) {
        if (match[1]) {
          addExtractedValue(extracted, match[1], 'fontSize', relativePath);
        }
      }
    } catch {
      // Skip files that can't be read
    }
  }
}

function addExtractedValue(
  extracted: Map<string, ExtractedValue>,
  value: string,
  type: ExtractedValue['type'],
  source: string
): void {
  const key = `${type}:${value}`;
  const existing = extracted.get(key);

  if (existing) {
    existing.count++;
    if (!existing.sources.includes(source)) {
      existing.sources.push(source);
    }
  } else {
    extracted.set(key, {
      type,
      value,
      count: 1,
      sources: [source],
    });
  }
}

function generateTokens(
  colors: ExtractedValue[],
  spacing: ExtractedValue[],
  fontSizes: ExtractedValue[]
): TokenOutput {
  const tokens: TokenOutput = {
    colors: {},
    spacing: {},
    typography: {
      fontSizes: {},
    },
  };

  // Sort by frequency (most used first)
  colors.sort((a, b) => b.count - a.count);
  spacing.sort((a, b) => b.count - a.count);
  fontSizes.sort((a, b) => b.count - a.count);

  // Generate color tokens
  colors.forEach((color, i) => {
    const name = generateColorName(color.value, i);
    tokens.colors[name] = {
      value: color.value,
      description: `Used ${color.count}x`,
    };
  });

  // Generate spacing tokens
  spacing.forEach((space, i) => {
    const name = generateSpacingName(space.value, i);
    tokens.spacing[name] = {
      value: space.value,
      description: `Used ${space.count}x`,
    };
  });

  // Generate font size tokens
  fontSizes.forEach((size, i) => {
    const name = generateFontSizeName(size.value, i);
    tokens.typography.fontSizes[name] = {
      value: size.value,
      description: `Used ${size.count}x`,
    };
  });

  return tokens;
}

function generateColorName(value: string, index: number): string {
  // Try to generate semantic names based on value
  const lower = value.toLowerCase();

  if (lower === '#fff' || lower === '#ffffff' || lower === 'rgb(255, 255, 255)') {
    return 'white';
  }
  if (lower === '#000' || lower === '#000000' || lower === 'rgb(0, 0, 0)') {
    return 'black';
  }

  // For other colors, use generic names
  return `color-${index + 1}`;
}

function generateSpacingName(value: string, index: number): string {
  // Map common values to semantic names
  const num = parseFloat(value);

  if (value.includes('rem')) {
    return `space-${Math.round(num * 4)}`;
  }
  if (value.includes('px')) {
    if (num <= 4) return 'space-xs';
    if (num <= 8) return 'space-sm';
    if (num <= 16) return 'space-md';
    if (num <= 24) return 'space-lg';
    if (num <= 32) return 'space-xl';
    return `space-${index + 1}`;
  }

  return `space-${index + 1}`;
}

function generateFontSizeName(value: string, index: number): string {
  const num = parseFloat(value);

  if (value.includes('px')) {
    if (num <= 12) return 'text-xs';
    if (num <= 14) return 'text-sm';
    if (num <= 16) return 'text-base';
    if (num <= 18) return 'text-lg';
    if (num <= 20) return 'text-xl';
    if (num <= 24) return 'text-2xl';
    if (num <= 30) return 'text-3xl';
    return `text-${index + 1}`;
  }

  if (value.includes('rem')) {
    if (num <= 0.75) return 'text-xs';
    if (num <= 0.875) return 'text-sm';
    if (num <= 1) return 'text-base';
    if (num <= 1.125) return 'text-lg';
    if (num <= 1.25) return 'text-xl';
    return `text-${index + 1}`;
  }

  return `text-${index + 1}`;
}

function generateCssVariables(tokens: TokenOutput): string {
  const lines: string[] = [
    '/* Generated by buoy bootstrap */',
    '/* Review and rename these variables as needed */',
    '',
    ':root {',
  ];

  // Colors
  if (Object.keys(tokens.colors).length > 0) {
    lines.push('  /* Colors */');
    for (const [name, token] of Object.entries(tokens.colors)) {
      lines.push(`  --${name}: ${token.value};`);
    }
    lines.push('');
  }

  // Spacing
  if (Object.keys(tokens.spacing).length > 0) {
    lines.push('  /* Spacing */');
    for (const [name, token] of Object.entries(tokens.spacing)) {
      lines.push(`  --${name}: ${token.value};`);
    }
    lines.push('');
  }

  // Typography
  if (Object.keys(tokens.typography.fontSizes).length > 0) {
    lines.push('  /* Typography */');
    for (const [name, token] of Object.entries(tokens.typography.fontSizes)) {
      lines.push(`  --${name}: ${token.value};`);
    }
  }

  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

function generateTailwindConfig(tokens: TokenOutput): string {
  const colors: Record<string, string> = {};
  const spacing: Record<string, string> = {};
  const fontSize: Record<string, string> = {};

  for (const [name, token] of Object.entries(tokens.colors)) {
    colors[name] = token.value;
  }

  for (const [name, token] of Object.entries(tokens.spacing)) {
    spacing[name.replace('space-', '')] = token.value;
  }

  for (const [name, token] of Object.entries(tokens.typography.fontSizes)) {
    fontSize[name.replace('text-', '')] = token.value;
  }

  return `// Generated by buoy bootstrap
// Review and rename these values as needed

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: ${JSON.stringify(colors, null, 6).replace(/\n/g, '\n      ')},
      spacing: ${JSON.stringify(spacing, null, 6).replace(/\n/g, '\n      ')},
      fontSize: ${JSON.stringify(fontSize, null, 6).replace(/\n/g, '\n      ')},
    },
  },
};
`;
}
