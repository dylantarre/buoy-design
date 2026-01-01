import { readFileSync } from 'fs';
import { glob } from 'glob';
import { relative } from 'path';
import type { DriftSignal, DriftSource } from '@buoy-design/core';

export interface ArbitraryValue {
  type: 'color' | 'spacing' | 'size' | 'timing' | 'grid' | 'css-property' | 'other';
  value: string;
  fullClass: string;
  file: string;
  line: number;
  column: number;
}

export interface ArbitraryDetectorConfig {
  projectRoot: string;
  include?: string[];
  exclude?: string[];
}

// Common modifiers that can prefix arbitrary value classes
// Handles: dark:, before:, after:, hover:, focus:, lg:, sm:, @md:, @min-[28rem]:, has-[>svg]:, etc.
const MODIFIER_PREFIX = '(?:(?:@(?:min|max)-\\[[^\\]]+\\]|@[a-z]+|[a-z-]+|has-\\[[^\\]]+\\]):)*';

// Patterns for arbitrary values in Tailwind classes
const ARBITRARY_PATTERNS = {
  // Colors: text-[#fff], bg-[#ff6b6b], border-[rgb(...)], via-[#hex]/opacity, etc.
  // Also handles modifier prefixes like dark:bg-[#1a1a1a]
  color: new RegExp(`${MODIFIER_PREFIX}(?:text|bg|border|ring|fill|stroke|from|via|to|accent|caret|decoration|outline|shadow)-\\[([^\\]]+)\\](?:/\\d+)?`, 'g'),

  // Spacing: p-[17px], m-[2rem], gap-[10px], etc.
  // Also handles modifier prefixes like before:p-[10px]
  spacing: new RegExp(`${MODIFIER_PREFIX}(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y|inset|top|right|bottom|left)-\\[([^\\]]+)\\]`, 'g'),

  // Sizing: w-[100px], h-[50vh], min-w-[300px], etc.
  // Also handles modifier prefixes like before:h-[300px], after:w-[240px]
  size: new RegExp(`${MODIFIER_PREFIX}(?:w|h|min-w|max-w|min-h|max-h|size)-\\[([^\\]]+)\\]`, 'g'),

  // Font size: text-[14px], text-[1.5rem]
  fontSize: new RegExp(`${MODIFIER_PREFIX}text-\\[(\\d+(?:\\.\\d+)?(?:px|rem|em))\\]`, 'g'),

  // Grid templates: grid-cols-[...], grid-rows-[...]
  grid: new RegExp(`${MODIFIER_PREFIX}(?:grid-cols|grid-rows)-\\[([^\\]]+)\\]`, 'g'),

  // Timing/animation: duration-[5s], delay-[200ms], transition-[...]
  timing: new RegExp(`${MODIFIER_PREFIX}(?:duration|delay|transition|ease)-\\[([^\\]]+)\\]`, 'g'),

  // Drop shadow and other shadow variants with arbitrary values
  dropShadow: new RegExp(`${MODIFIER_PREFIX}drop-shadow-\\[([^\\]]+)\\]`, 'g'),

  // Arbitrary CSS properties: [--custom-prop:value], [color:red]
  cssProperty: /\[(-{0,2}[\w-]+:[^\]]+)\]/g,

  // Other arbitrary values
  other: new RegExp(`${MODIFIER_PREFIX}[\\w-]+-\\[([^\\]]+)\\]`, 'g'),
};

export class ArbitraryValueDetector {
  private config: ArbitraryDetectorConfig;

  constructor(config: ArbitraryDetectorConfig) {
    this.config = config;
  }

  async detect(): Promise<ArbitraryValue[]> {
    const files = await this.findSourceFiles();
    const arbitraryValues: ArbitraryValue[] = [];

    for (const file of files) {
      const values = this.scanFile(file);
      arbitraryValues.push(...values);
    }

    return arbitraryValues;
  }

  async detectAsDriftSignals(): Promise<DriftSignal[]> {
    const values = await this.detect();
    return this.valuesToDriftSignals(values);
  }

  private async findSourceFiles(): Promise<string[]> {
    const patterns = this.config.include || [
      '**/*.html',
      '**/*.jsx',
      '**/*.tsx',
      '**/*.vue',
      '**/*.svelte',
      '**/*.astro',
      '**/*.php',
      '**/*.blade.php',
      '**/*.erb',
      '**/*.twig',
      '**/*.cshtml',
    ];

    const ignore = this.config.exclude || [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/vendor/**',
    ];

    const allFiles: string[] = [];

    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: this.config.projectRoot,
        ignore,
        absolute: true,
      });
      allFiles.push(...matches);
    }

    return [...new Set(allFiles)];
  }

  private scanFile(filePath: string): ArbitraryValue[] {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const values: ArbitraryValue[] = [];
    const relativePath = relative(this.config.projectRoot, filePath);
    const seen = new Set<string>(); // Track seen matches to avoid duplicates

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum]!;

      // Check for color arbitrary values (including with alpha modifiers)
      for (const match of line.matchAll(ARBITRARY_PATTERNS.color)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key) && this.isHardcodedColor(match[1]!)) {
          seen.add(key);
          values.push({
            type: 'color',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for spacing arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.spacing)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'spacing',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for size arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.size)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'size',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for font size arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.fontSize)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'size',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for grid template arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.grid)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'grid',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for timing/animation arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.timing)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'timing',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for drop shadow arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.dropShadow)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'other',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for arbitrary CSS properties
      for (const match of line.matchAll(ARBITRARY_PATTERNS.cssProperty)) {
        const fullClass = match[0];
        const key = `${lineNum}:${match.index}:${fullClass}`;
        if (!seen.has(key)) {
          seen.add(key);
          values.push({
            type: 'css-property',
            value: match[1]!,
            fullClass,
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }
    }

    return values;
  }

  private isHardcodedColor(value: string): boolean {
    // Hex colors: #fff, #ff6b6b, #ffffff70
    if (/^#[0-9a-fA-F]{3,8}$/.test(value)) {
      return true;
    }

    // RGB/RGBA/HSL/HSLA functional colors
    if (/^(?:rgb|rgba|hsl|hsla)\s*\(/.test(value)) {
      return true;
    }

    // CSS variable references are OK
    if (/^var\(/.test(value)) {
      return false;
    }

    // color(...) function
    if (/^color\s*\(/.test(value)) {
      return true;
    }

    return false;
  }

  private valuesToDriftSignals(values: ArbitraryValue[]): DriftSignal[] {
    const byFile = new Map<string, ArbitraryValue[]>();
    for (const value of values) {
      const existing = byFile.get(value.file) || [];
      existing.push(value);
      byFile.set(value.file, existing);
    }

    const signals: DriftSignal[] = [];

    for (const [file, fileValues] of byFile) {
      const colors = fileValues.filter(v => v.type === 'color');
      const spacing = fileValues.filter(v => v.type === 'spacing');
      const sizes = fileValues.filter(v => v.type === 'size');
      const grids = fileValues.filter(v => v.type === 'grid');
      const timing = fileValues.filter(v => v.type === 'timing');
      const cssProps = fileValues.filter(v => v.type === 'css-property');
      const others = fileValues.filter(v => v.type === 'other');

      if (colors.length > 0) {
        signals.push(this.createDriftSignal(
          'color',
          file,
          colors,
          `${colors.length} hardcoded color${colors.length > 1 ? 's' : ''} found. Use theme colors instead.`
        ));
      }

      if (spacing.length > 0) {
        signals.push(this.createDriftSignal(
          'spacing',
          file,
          spacing,
          `${spacing.length} arbitrary spacing value${spacing.length > 1 ? 's' : ''} found. Use theme spacing instead.`
        ));
      }

      if (sizes.length > 0) {
        signals.push(this.createDriftSignal(
          'size',
          file,
          sizes,
          `${sizes.length} arbitrary size value${sizes.length > 1 ? 's' : ''} found. Consider using theme values.`
        ));
      }

      if (grids.length > 0) {
        signals.push(this.createDriftSignal(
          'grid',
          file,
          grids,
          `${grids.length} arbitrary grid template${grids.length > 1 ? 's' : ''} found. Consider defining in theme.`
        ));
      }

      if (timing.length > 0) {
        signals.push(this.createDriftSignal(
          'timing',
          file,
          timing,
          `${timing.length} arbitrary timing value${timing.length > 1 ? 's' : ''} found. Consider using theme transitions.`
        ));
      }

      if (cssProps.length > 0) {
        signals.push(this.createDriftSignal(
          'css-property',
          file,
          cssProps,
          `${cssProps.length} arbitrary CSS propert${cssProps.length > 1 ? 'ies' : 'y'} found. Consider using utility classes.`
        ));
      }

      if (others.length > 0) {
        signals.push(this.createDriftSignal(
          'other',
          file,
          others,
          `${others.length} other arbitrary value${others.length > 1 ? 's' : ''} found. Review for theme consistency.`
        ));
      }
    }

    return signals;
  }

  private createDriftSignal(
    valueType: string,
    file: string,
    values: ArbitraryValue[],
    message: string
  ): DriftSignal {
    const source: DriftSource = {
      entityType: 'component',
      entityId: `tailwind:${file}`,
      entityName: file,
      location: `${file}:${values[0]!.line}`,
    };

    const examples = values.slice(0, 5).map(v =>
      `${v.fullClass} at line ${v.line}`
    );

    return {
      id: `drift:hardcoded-value:tailwind:${file}:${valueType}`,
      type: 'hardcoded-value',
      severity: valueType === 'color' ? 'warning' : 'info',
      source,
      message,
      details: {
        expected: 'Use Tailwind theme tokens',
        actual: `${values.length} arbitrary ${valueType} values`,
        affectedFiles: [file],
        suggestions: [
          valueType === 'color'
            ? 'Replace arbitrary colors with theme colors: text-primary, bg-secondary, etc.'
            : 'Replace arbitrary values with theme tokens: p-4, gap-2, w-full, etc.',
          'Add missing values to tailwind.config.js theme.extend if needed',
          `Examples: ${examples.slice(0, 3).join(', ')}`,
        ],
      },
      detectedAt: new Date(),
    };
  }
}
