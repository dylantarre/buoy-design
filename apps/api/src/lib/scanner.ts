/**
 * Lightweight Drift Scanner for Cloudflare Workers
 *
 * Scans file content in-memory for design drift signals.
 * Simplified version of the full scanner package for use in Workers.
 */

import { signalHash } from './crypto.js';

/**
 * Drift signal detected in source code
 */
export interface DriftSignal {
  type: DriftType;
  severity: 'error' | 'warning' | 'info';
  file: string;
  line: number;
  column?: number;
  value: string;
  message: string;
  suggestion?: string;
  componentName?: string;
  /** Author who introduced this line (from git blame) */
  author?: string;
}

export type DriftType =
  | 'hardcoded-color'
  | 'hardcoded-spacing'
  | 'arbitrary-tailwind'
  | 'inline-style'
  | 'magic-number';

/**
 * Result of scanning a file
 */
export interface ScanResult {
  signals: DriftSignal[];
  scannedCount: number;
  truncated?: boolean;
  deferred?: boolean;
}

// Color patterns
const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/g;
const RGB_COLOR = /rgba?\s*\([^)]+\)/g;
const HSL_COLOR = /hsla?\s*\([^)]+\)/g;

// Tailwind arbitrary value patterns
const TAILWIND_ARBITRARY = {
  // Colors: bg-[#fff], text-[rgb(...)], border-[#hex]
  color: /(?:text|bg|border|fill|stroke|from|via|to|accent|caret|decoration|shadow)-\[([^\]]+)\](?:\/\d+)?/g,
  // Spacing: p-[17px], m-[2rem], gap-[10px]
  spacing: /(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y|inset|top|right|bottom|left)-\[([\d.]+(?:px|rem|em|vh|vw|%)?)\]/g,
  // Sizing: w-[100px], h-[50vh], min-w-[300px]
  size: /(?:w|h|min-w|max-w|min-h|max-h|size)-\[([\d.]+(?:px|rem|em|vh|vw|%)?)\]/g,
};

// Inline style detection
const INLINE_STYLE_JSX = /style\s*=\s*\{\{([^}]+)\}\}/g;
const INLINE_STYLE_ATTR = /style\s*=\s*["']([^"']+)["']/g;

/**
 * Scan file content for drift signals
 */
export function scanFileContent(
  content: string,
  filename: string
): DriftSignal[] {
  const signals: DriftSignal[] = [];
  const lines = content.split('\n');
  const seenPositions = new Set<string>();

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]!;
    const lineNumber = lineNum + 1;

    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('*')) {
      continue;
    }

    // Detect hardcoded colors
    detectHardcodedColors(line, filename, lineNumber, signals, seenPositions);

    // Detect Tailwind arbitrary values
    detectTailwindArbitrary(line, filename, lineNumber, signals, seenPositions);

    // Detect inline styles
    detectInlineStyles(line, filename, lineNumber, signals, seenPositions);
  }

  return signals;
}

/**
 * Detect hardcoded color values
 */
function detectHardcodedColors(
  line: string,
  filename: string,
  lineNumber: number,
  signals: DriftSignal[],
  seen: Set<string>
): void {
  // Skip CSS variable declarations and Tailwind config-like patterns
  if (line.includes('--') && line.includes(':')) return;
  if (line.includes('theme(') || line.includes('colors:')) return;

  // Check for hex colors
  for (const match of line.matchAll(HEX_COLOR)) {
    const key = `${lineNumber}:${match.index}:hex`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Skip if inside a CSS variable, Tailwind class, or comment
    const before = line.slice(0, match.index || 0);
    if (before.includes('var(--') || before.includes('theme(')) continue;

    signals.push({
      type: 'hardcoded-color',
      severity: 'warning',
      file: filename,
      line: lineNumber,
      column: (match.index || 0) + 1,
      value: match[0],
      message: `Hardcoded color ${match[0]}`,
      suggestion: 'Use a design token or CSS variable',
    });
  }

  // Check for rgb/rgba colors
  for (const match of line.matchAll(RGB_COLOR)) {
    const key = `${lineNumber}:${match.index}:rgb`;
    if (seen.has(key)) continue;
    seen.add(key);

    signals.push({
      type: 'hardcoded-color',
      severity: 'warning',
      file: filename,
      line: lineNumber,
      column: (match.index || 0) + 1,
      value: match[0],
      message: `Hardcoded color ${match[0]}`,
      suggestion: 'Use a design token or CSS variable',
    });
  }

  // Check for hsl/hsla colors
  for (const match of line.matchAll(HSL_COLOR)) {
    const key = `${lineNumber}:${match.index}:hsl`;
    if (seen.has(key)) continue;
    seen.add(key);

    signals.push({
      type: 'hardcoded-color',
      severity: 'warning',
      file: filename,
      line: lineNumber,
      column: (match.index || 0) + 1,
      value: match[0],
      message: `Hardcoded color ${match[0]}`,
      suggestion: 'Use a design token or CSS variable',
    });
  }
}

/**
 * Detect Tailwind arbitrary value patterns
 */
function detectTailwindArbitrary(
  line: string,
  filename: string,
  lineNumber: number,
  signals: DriftSignal[],
  seen: Set<string>
): void {
  // Skip lines without arbitrary syntax
  if (!line.includes('[') || !line.includes(']')) return;

  // Check for arbitrary color values
  for (const match of line.matchAll(TAILWIND_ARBITRARY.color)) {
    const value = match[1]!;
    const key = `${lineNumber}:${match.index}:tw-color`;
    if (seen.has(key)) continue;

    // Only flag if it's a hardcoded color (hex, rgb, hsl), not a CSS variable
    if (isHardcodedColor(value)) {
      seen.add(key);
      signals.push({
        type: 'arbitrary-tailwind',
        severity: 'warning',
        file: filename,
        line: lineNumber,
        column: (match.index || 0) + 1,
        value: match[0],
        message: `Arbitrary Tailwind color: ${match[0]}`,
        suggestion: 'Use a Tailwind theme color class',
      });
    }
  }

  // Check for arbitrary spacing values
  for (const match of line.matchAll(TAILWIND_ARBITRARY.spacing)) {
    const key = `${lineNumber}:${match.index}:tw-spacing`;
    if (seen.has(key)) continue;
    seen.add(key);

    signals.push({
      type: 'arbitrary-tailwind',
      severity: 'info',
      file: filename,
      line: lineNumber,
      column: (match.index || 0) + 1,
      value: match[0],
      message: `Arbitrary Tailwind spacing: ${match[0]}`,
      suggestion: 'Use a Tailwind spacing class (p-4, m-2, etc.)',
    });
  }

  // Check for arbitrary size values
  for (const match of line.matchAll(TAILWIND_ARBITRARY.size)) {
    const key = `${lineNumber}:${match.index}:tw-size`;
    if (seen.has(key)) continue;
    seen.add(key);

    signals.push({
      type: 'arbitrary-tailwind',
      severity: 'info',
      file: filename,
      line: lineNumber,
      column: (match.index || 0) + 1,
      value: match[0],
      message: `Arbitrary Tailwind size: ${match[0]}`,
      suggestion: 'Use a Tailwind size class (w-full, h-screen, etc.)',
    });
  }
}

/**
 * Detect inline style usage
 */
function detectInlineStyles(
  line: string,
  filename: string,
  lineNumber: number,
  signals: DriftSignal[],
  seen: Set<string>
): void {
  // JSX style objects: style={{ ... }}
  for (const match of line.matchAll(INLINE_STYLE_JSX)) {
    const key = `${lineNumber}:${match.index}:inline-jsx`;
    if (seen.has(key)) continue;

    // Parse the style object content for hardcoded values
    const styleContent = match[1]!;

    // Check for hardcoded colors in style objects
    if (HEX_COLOR.test(styleContent) || RGB_COLOR.test(styleContent) || HSL_COLOR.test(styleContent)) {
      seen.add(key);
      signals.push({
        type: 'inline-style',
        severity: 'warning',
        file: filename,
        line: lineNumber,
        column: (match.index || 0) + 1,
        value: `style={{ ${styleContent.slice(0, 50)}${styleContent.length > 50 ? '...' : ''} }}`,
        message: 'Inline style with hardcoded color',
        suggestion: 'Use className with design tokens instead',
      });
    }
  }

  // HTML style attributes: style="..."
  for (const match of line.matchAll(INLINE_STYLE_ATTR)) {
    const key = `${lineNumber}:${match.index}:inline-attr`;
    if (seen.has(key)) continue;

    const styleContent = match[1]!;

    if (HEX_COLOR.test(styleContent) || RGB_COLOR.test(styleContent) || HSL_COLOR.test(styleContent)) {
      seen.add(key);
      signals.push({
        type: 'inline-style',
        severity: 'warning',
        file: filename,
        line: lineNumber,
        column: (match.index || 0) + 1,
        value: `style="${styleContent.slice(0, 50)}${styleContent.length > 50 ? '...' : ''}"`,
        message: 'Inline style with hardcoded color',
        suggestion: 'Use CSS classes with design tokens instead',
      });
    }
  }
}

/**
 * Check if a value is a hardcoded color (not a CSS variable)
 */
function isHardcodedColor(value: string): boolean {
  // Hex colors
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return true;

  // RGB/RGBA/HSL/HSLA functional colors
  if (/^(?:rgb|rgba|hsl|hsla)\s*\(/.test(value)) return true;

  // color(...) function
  if (/^color\s*\(/.test(value)) return true;

  // CSS variable references are OK
  if (/^var\(/.test(value)) return false;

  return false;
}

/**
 * Generate a stable signature hash for a drift signal
 * Used for baseline comparison
 */
export async function getSignalSignature(signal: DriftSignal): Promise<string> {
  return signalHash(
    signal.type,
    signal.file,
    signal.value,
    signal.componentName
  );
}

/**
 * Filter signals to only those NOT in the baseline
 */
export async function filterAgainstBaseline(
  signals: DriftSignal[],
  baselineSignatures: string[]
): Promise<DriftSignal[]> {
  const baselineSet = new Set(baselineSignatures);
  const newSignals: DriftSignal[] = [];

  for (const signal of signals) {
    const signature = await getSignalSignature(signal);
    if (!baselineSet.has(signature)) {
      newSignals.push(signal);
    }
  }

  return newSignals;
}
