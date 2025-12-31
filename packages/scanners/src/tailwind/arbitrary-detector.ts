import { readFileSync } from 'fs';
import { glob } from 'glob';
import { relative } from 'path';
import type { DriftSignal, DriftSource } from '@buoy-design/core';

export interface ArbitraryValue {
  type: 'color' | 'spacing' | 'size' | 'other';
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

// Patterns for arbitrary values in Tailwind classes
const ARBITRARY_PATTERNS = {
  // Colors: text-[#fff], bg-[#ff6b6b], border-[rgb(...)], etc.
  color: /\b(?:text|bg|border|ring|fill|stroke|from|via|to|accent|caret|decoration|outline|shadow)-\[([#\w(),.%\s]+)\]/g,

  // Spacing: p-[17px], m-[2rem], gap-[10px], etc.
  spacing: /\b(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y|inset|top|right|bottom|left)-\[([^\]]+)\]/g,

  // Sizing: w-[100px], h-[50vh], min-w-[300px], etc.
  size: /\b(?:w|h|min-w|max-w|min-h|max-h|size)-\[([^\]]+)\]/g,

  // Font size: text-[14px], text-[1.5rem]
  fontSize: /\btext-\[(\d+(?:\.\d+)?(?:px|rem|em))\]/g,

  // Other arbitrary values
  other: /\b[\w-]+-\[([^\]]+)\]/g,
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

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum]!;

      // Check for color arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.color)) {
        if (this.isHardcodedColor(match[1]!)) {
          values.push({
            type: 'color',
            value: match[1]!,
            fullClass: match[0],
            file: relativePath,
            line: lineNum + 1,
            column: match.index! + 1,
          });
        }
      }

      // Check for spacing arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.spacing)) {
        values.push({
          type: 'spacing',
          value: match[1]!,
          fullClass: match[0],
          file: relativePath,
          line: lineNum + 1,
          column: match.index! + 1,
        });
      }

      // Check for size arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.size)) {
        values.push({
          type: 'size',
          value: match[1]!,
          fullClass: match[0],
          file: relativePath,
          line: lineNum + 1,
          column: match.index! + 1,
        });
      }

      // Check for font size arbitrary values
      for (const match of line.matchAll(ARBITRARY_PATTERNS.fontSize)) {
        values.push({
          type: 'size',
          value: match[1]!,
          fullClass: match[0],
          file: relativePath,
          line: lineNum + 1,
          column: match.index! + 1,
        });
      }
    }

    return values;
  }

  private isHardcodedColor(value: string): boolean {
    if (/^#[0-9a-fA-F]{3,8}$/.test(value)) {
      return true;
    }

    if (/^(?:rgb|rgba|hsl|hsla)\s*\(/.test(value)) {
      return true;
    }

    // CSS variable references are OK
    if (/^var\(/.test(value)) {
      return false;
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
