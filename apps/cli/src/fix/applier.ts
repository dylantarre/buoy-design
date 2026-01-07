/**
 * Fix Applier
 *
 * Applies fixes to source files by replacing hardcoded values with design tokens.
 */

import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { Fix, FixResult, FixApplyOptions } from '@buoy-design/core';

export interface ApplyFixesResult {
  results: FixResult[];
  applied: number;
  skipped: number;
  failed: number;
}

/**
 * Apply multiple fixes to source files
 */
export async function applyFixes(
  fixes: Fix[],
  options: FixApplyOptions = {}
): Promise<ApplyFixesResult> {
  const { dryRun = false, backup = false, minConfidence = 'high' } = options;

  const results: FixResult[] = [];
  let applied = 0;
  let skipped = 0;
  let failed = 0;

  // Group fixes by file for efficiency
  const fixesByFile = groupFixesByFile(fixes);

  for (const [file, fileFixes] of Object.entries(fixesByFile)) {
    const fileResults = await applyFixesToFile(file, fileFixes, {
      dryRun,
      backup,
      minConfidence,
    });

    for (const result of fileResults) {
      results.push(result);
      if (result.status === 'applied') applied++;
      else if (result.status === 'skipped') skipped++;
      else failed++;
    }
  }

  return { results, applied, skipped, failed };
}

/**
 * Apply fixes to a single file
 */
async function applyFixesToFile(
  file: string,
  fixes: Fix[],
  options: FixApplyOptions
): Promise<FixResult[]> {
  const { dryRun, backup, minConfidence = 'high' } = options;
  const results: FixResult[] = [];

  // Check file exists
  if (!existsSync(file)) {
    return fixes.map((fix) => ({
      fixId: fix.id,
      status: 'failed' as const,
      error: `File not found: ${file}`,
    }));
  }

  try {
    // Read file content
    let content = await readFile(file, 'utf-8');
    const lines = content.split('\n');

    // Sort fixes by line number descending so we apply from bottom to top
    // This prevents line number shifts from affecting subsequent fixes
    const sortedFixes = [...fixes].sort((a, b) => {
      if (b.line !== a.line) return b.line - a.line;
      return b.column - a.column;
    });

    // Track which fixes were actually applied
    const appliedFixes: Fix[] = [];

    for (const fix of sortedFixes) {
      // Check confidence threshold
      if (!meetsMinConfidence(fix.confidence, minConfidence)) {
        results.push({
          fixId: fix.id,
          status: 'skipped',
          error: `Confidence ${fix.confidence} below threshold ${minConfidence}`,
        });
        continue;
      }

      // Get the line (1-indexed to 0-indexed)
      const lineIndex = fix.line - 1;
      if (lineIndex < 0 || lineIndex >= lines.length) {
        results.push({
          fixId: fix.id,
          status: 'failed',
          error: `Line ${fix.line} out of range (file has ${lines.length} lines)`,
        });
        continue;
      }

      const line = lines[lineIndex]!;

      // Find and replace the original value
      const column = fix.column - 1;
      const originalIndex = line.indexOf(fix.original, column);

      if (originalIndex === -1) {
        // Try finding anywhere in the line
        const anyIndex = line.indexOf(fix.original);
        if (anyIndex === -1) {
          results.push({
            fixId: fix.id,
            status: 'failed',
            error: `Original value "${fix.original}" not found on line ${fix.line}`,
          });
          continue;
        }
        // Found it elsewhere, use that position
        lines[lineIndex] =
          line.slice(0, anyIndex) +
          fix.replacement +
          line.slice(anyIndex + fix.original.length);
      } else {
        // Replace at the expected position
        lines[lineIndex] =
          line.slice(0, originalIndex) +
          fix.replacement +
          line.slice(originalIndex + fix.original.length);
      }

      appliedFixes.push(fix);
      results.push({
        fixId: fix.id,
        status: 'applied',
      });
    }

    // If not dry run and we have fixes to apply, write the file
    if (!dryRun && appliedFixes.length > 0) {
      // Create backup if requested
      if (backup) {
        await copyFile(file, `${file}.bak`);
      }

      // Write the modified content
      content = lines.join('\n');
      await writeFile(file, content, 'utf-8');
    }
  } catch (error) {
    // If any error occurs, mark remaining fixes as failed
    const appliedIds = new Set(results.map((r) => r.fixId));
    for (const fix of fixes) {
      if (!appliedIds.has(fix.id)) {
        results.push({
          fixId: fix.id,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  return results;
}

/**
 * Group fixes by file path
 */
function groupFixesByFile(fixes: Fix[]): Record<string, Fix[]> {
  const groups: Record<string, Fix[]> = {};
  for (const fix of fixes) {
    if (!groups[fix.file]) {
      groups[fix.file] = [];
    }
    groups[fix.file]!.push(fix);
  }
  return groups;
}

/**
 * Check if confidence level meets minimum threshold
 */
function meetsMinConfidence(
  level: 'exact' | 'high' | 'medium' | 'low',
  minimum: 'exact' | 'high' | 'medium' | 'low'
): boolean {
  const order = { low: 0, medium: 1, high: 2, exact: 3 };
  return order[level] >= order[minimum];
}

/**
 * Generate a diff preview for a fix
 */
export function generateFixDiff(fix: Fix, _contextLines: number = 2): string {
  const lines: string[] = [];

  lines.push(`--- ${fix.file}`);
  lines.push(`+++ ${fix.file}`);
  lines.push(`@@ -${fix.line},1 +${fix.line},1 @@`);
  lines.push(`-${fix.original}`);
  lines.push(`+${fix.replacement}`);

  return lines.join('\n');
}

/**
 * Generate a full diff preview by reading the actual file
 */
export async function generateFullDiff(
  fix: Fix,
  contextLines: number = 3
): Promise<string> {
  const lines: string[] = [];

  try {
    const content = await readFile(fix.file, 'utf-8');
    const fileLines = content.split('\n');
    const lineIndex = fix.line - 1;

    // Calculate context bounds
    const startLine = Math.max(0, lineIndex - contextLines);
    const endLine = Math.min(fileLines.length - 1, lineIndex + contextLines);

    lines.push(`--- ${fix.file}`);
    lines.push(`+++ ${fix.file}`);
    lines.push(`@@ -${startLine + 1},${endLine - startLine + 1} +${startLine + 1},${endLine - startLine + 1} @@`);

    // Add context lines before
    for (let i = startLine; i < lineIndex; i++) {
      lines.push(` ${fileLines[i]}`);
    }

    // Add the changed line
    const originalLine = fileLines[lineIndex] || '';
    const newLine = originalLine.replace(fix.original, fix.replacement);
    lines.push(`-${originalLine}`);
    lines.push(`+${newLine}`);

    // Add context lines after
    for (let i = lineIndex + 1; i <= endLine; i++) {
      lines.push(` ${fileLines[i]}`);
    }
  } catch {
    // Fallback to simple diff
    return generateFixDiff(fix, contextLines);
  }

  return lines.join('\n');
}
