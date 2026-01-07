/**
 * Fix Formatters
 *
 * Format fix suggestions, diffs, and results for CLI output.
 */

import chalk from 'chalk';
import type { Fix, ConfidenceLevel } from '@buoy-design/core';
import type { ApplyFixesResult } from '../fix/applier.js';

/**
 * Format confidence level with color
 */
function formatConfidence(level: ConfidenceLevel): string {
  switch (level) {
    case 'exact':
      return chalk.green.bold('exact');
    case 'high':
      return chalk.green('high');
    case 'medium':
      return chalk.yellow('medium');
    case 'low':
      return chalk.red('low');
  }
}

/**
 * Format fix type with readable label
 */
function formatFixType(type: string): string {
  const labels: Record<string, string> = {
    'hardcoded-color': 'Color',
    'hardcoded-spacing': 'Spacing',
    'hardcoded-radius': 'Radius',
    'hardcoded-font-size': 'Font Size',
  };
  return labels[type] || type;
}

/**
 * Format a preview of available fixes (default mode)
 */
export function formatFixPreview(fixes: Fix[]): string {
  if (fixes.length === 0) {
    return chalk.green('✓ No fixable issues found');
  }

  const lines: string[] = [];

  // Header
  lines.push(chalk.bold(`Found ${fixes.length} fixable issue${fixes.length === 1 ? '' : 's'}:`));
  lines.push('');

  // Group by confidence
  const byConfidence = groupByConfidence(fixes);

  if (byConfidence.exact.length > 0) {
    lines.push(chalk.green.bold(`  ${byConfidence.exact.length} exact match`) + ' (100% safe to auto-apply)');
  }
  if (byConfidence.high.length > 0) {
    lines.push(chalk.green(`  ${byConfidence.high.length} high confidence`) + ' (safe to auto-apply)');
  }
  if (byConfidence.medium.length > 0) {
    lines.push(chalk.yellow(`  ${byConfidence.medium.length} medium confidence`) + ' (review recommended)');
  }
  if (byConfidence.low.length > 0) {
    lines.push(chalk.red(`  ${byConfidence.low.length} low confidence`) + ' (manual review required)');
  }

  lines.push('');

  // Summary table by type
  const byType = groupByType(fixes);
  lines.push(chalk.dim('By type:'));
  for (const [type, typeFixes] of Object.entries(byType)) {
    lines.push(`  ${formatFixType(type)}: ${typeFixes.length}`);
  }

  lines.push('');

  // Next steps
  lines.push(chalk.dim('Next steps:'));
  lines.push('  buoy fix --dry-run     Show detailed changes');
  lines.push('  buoy fix --apply       Apply high-confidence fixes');
  lines.push('  buoy fix --apply --confidence=medium  Include medium confidence');

  return lines.join('\n');
}

/**
 * Format detailed diff for dry-run mode
 */
export function formatFixDiff(fixes: Fix[]): string {
  if (fixes.length === 0) {
    return chalk.green('✓ No fixable issues found');
  }

  const lines: string[] = [];

  // Group by file
  const byFile = groupByFile(fixes);

  for (const [file, fileFixes] of Object.entries(byFile)) {
    lines.push(chalk.bold(chalk.cyan(file)));
    lines.push('');

    for (const fix of fileFixes) {
      // Location and confidence
      lines.push(
        `  ${chalk.dim(`Line ${fix.line}:`)} ` +
          `[${formatConfidence(fix.confidence)}] ` +
          formatFixType(fix.fixType)
      );

      // Token name
      if (fix.tokenName) {
        lines.push(`  ${chalk.dim('Token:')} ${fix.tokenName}`);
      }

      // Reason
      lines.push(`  ${chalk.dim('Reason:')} ${fix.reason}`);

      // Diff
      lines.push(`  ${chalk.red(`- ${fix.original}`)}`);
      lines.push(`  ${chalk.green(`+ ${fix.replacement}`)}`);
      lines.push('');
    }
  }

  // Summary
  const byConfidence = groupByConfidence(fixes);
  lines.push(chalk.dim('─'.repeat(50)));
  lines.push(
    `Total: ${fixes.length} fixes ` +
      `(${chalk.green.bold(`${byConfidence.exact.length} exact`)}, ` +
      `${chalk.green(`${byConfidence.high.length} high`)}, ` +
      `${chalk.yellow(`${byConfidence.medium.length} medium`)}, ` +
      `${chalk.red(`${byConfidence.low.length} low`)})`
  );

  return lines.join('\n');
}

/**
 * Format a single fix line item
 */
export function formatFixLine(fix: Fix): string {
  const location = `${fix.file}:${fix.line}:${fix.column}`;
  return (
    `${chalk.dim(location)} ` +
    `[${formatConfidence(fix.confidence)}] ` +
    `${chalk.red(fix.original)} → ${chalk.green(fix.replacement)}`
  );
}

/**
 * Format results after applying fixes
 */
export function formatFixResult(result: ApplyFixesResult): string {
  const lines: string[] = [];

  if (result.applied === 0 && result.skipped === 0 && result.failed === 0) {
    return chalk.yellow('No fixes were processed');
  }

  // Summary line
  const parts: string[] = [];
  if (result.applied > 0) {
    parts.push(chalk.green(`${result.applied} applied`));
  }
  if (result.skipped > 0) {
    parts.push(chalk.yellow(`${result.skipped} skipped`));
  }
  if (result.failed > 0) {
    parts.push(chalk.red(`${result.failed} failed`));
  }

  lines.push(chalk.bold(`Fix Results: ${parts.join(', ')}`));
  lines.push('');

  // Group results by status
  const applied = result.results.filter((r) => r.status === 'applied');
  const skipped = result.results.filter((r) => r.status === 'skipped');
  const failed = result.results.filter((r) => r.status === 'failed');

  if (applied.length > 0) {
    lines.push(chalk.green('✓ Applied:'));
    for (const r of applied) {
      lines.push(`  ${r.fixId}`);
    }
    lines.push('');
  }

  if (skipped.length > 0) {
    lines.push(chalk.yellow('○ Skipped:'));
    for (const r of skipped) {
      lines.push(`  ${r.fixId}${r.error ? ` (${r.error})` : ''}`);
    }
    lines.push('');
  }

  if (failed.length > 0) {
    lines.push(chalk.red('✗ Failed:'));
    for (const r of failed) {
      lines.push(`  ${r.fixId}: ${r.error || 'Unknown error'}`);
    }
    lines.push('');
  }

  // Next steps
  if (result.applied > 0) {
    lines.push(chalk.dim('Run `buoy show all` to verify changes'));
  }

  return lines.join('\n');
}

/**
 * Format safety check warnings and errors
 */
export function formatSafetyCheck(result: {
  safe: boolean;
  warnings: string[];
  errors: string[];
}): string {
  const lines: string[] = [];

  if (result.errors.length > 0) {
    lines.push(chalk.red(chalk.bold('Errors:')));
    for (const error of result.errors) {
      lines.push(chalk.red(`  ✗ ${error}`));
    }
    lines.push('');
  }

  if (result.warnings.length > 0) {
    lines.push(chalk.yellow(chalk.bold('Warnings:')));
    for (const warning of result.warnings) {
      lines.push(chalk.yellow(`  ⚠ ${warning}`));
    }
    lines.push('');
  }

  if (result.safe && result.warnings.length === 0) {
    lines.push(chalk.green('✓ Safety checks passed'));
  }

  return lines.join('\n');
}

/**
 * Format JSON output for fixes
 */
export function formatFixesJson(fixes: Fix[]): string {
  return JSON.stringify(
    {
      total: fixes.length,
      byConfidence: {
        exact: fixes.filter((f) => f.confidence === 'exact').length,
        high: fixes.filter((f) => f.confidence === 'high').length,
        medium: fixes.filter((f) => f.confidence === 'medium').length,
        low: fixes.filter((f) => f.confidence === 'low').length,
      },
      fixes: fixes.map((f) => ({
        id: f.id,
        file: f.file,
        line: f.line,
        column: f.column,
        confidence: f.confidence,
        confidenceScore: f.confidenceScore,
        original: f.original,
        replacement: f.replacement,
        reason: f.reason,
        fixType: f.fixType,
        tokenName: f.tokenName,
      })),
    },
    null,
    2
  );
}

// Helper functions

function groupByConfidence(
  fixes: Fix[]
): Record<ConfidenceLevel, Fix[]> {
  return {
    exact: fixes.filter((f) => f.confidence === 'exact'),
    high: fixes.filter((f) => f.confidence === 'high'),
    medium: fixes.filter((f) => f.confidence === 'medium'),
    low: fixes.filter((f) => f.confidence === 'low'),
  };
}

function groupByType(fixes: Fix[]): Record<string, Fix[]> {
  const groups: Record<string, Fix[]> = {};
  for (const fix of fixes) {
    if (!groups[fix.fixType]) {
      groups[fix.fixType] = [];
    }
    groups[fix.fixType]!.push(fix);
  }
  return groups;
}

function groupByFile(fixes: Fix[]): Record<string, Fix[]> {
  const groups: Record<string, Fix[]> = {};
  for (const fix of fixes) {
    if (!groups[fix.file]) {
      groups[fix.file] = [];
    }
    groups[fix.file]!.push(fix);
  }
  return groups;
}
