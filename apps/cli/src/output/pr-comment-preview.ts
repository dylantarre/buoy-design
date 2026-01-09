// apps/cli/src/output/pr-comment-preview.ts
import type { DriftSignal } from '@buoy-design/core';
import chalk from 'chalk';

/**
 * Generate a preview of what a PR comment would look like
 * This matches the format used by Buoy Cloud's PR bot
 */
export function generatePRCommentPreview(
  drifts: DriftSignal[],
  summary: { critical: number; warning: number; info: number; total: number }
): string {
  const lines: string[] = [];

  // Header
  lines.push(chalk.bold.cyan('--- PR Comment Preview ---'));
  lines.push('');

  // Title
  if (summary.total === 0) {
    lines.push(chalk.green.bold('✓ Buoy: All Clear'));
    lines.push('');
    lines.push('No design system drift detected in this PR.');
  } else {
    lines.push(chalk.yellow.bold(`⚠️ Buoy: ${summary.total} Design System Issue${summary.total !== 1 ? 's' : ''}`));
    lines.push('');

    // Summary badges
    const badges: string[] = [];
    if (summary.critical > 0) badges.push(chalk.red(`${summary.critical} critical`));
    if (summary.warning > 0) badges.push(chalk.yellow(`${summary.warning} warning`));
    if (summary.info > 0) badges.push(chalk.blue(`${summary.info} info`));
    lines.push(badges.join(' · '));
    lines.push('');

    // Issues table header
    lines.push(chalk.dim('| File | Issue | Suggestion |'));
    lines.push(chalk.dim('|------|-------|------------|'));

    // Show up to 5 issues
    const shown = drifts.slice(0, 5);
    for (const drift of shown) {
      const file = drift.source.location?.split(':')[0] || drift.source.entityName;
      const shortFile = file.length > 30 ? '...' + file.slice(-27) : file;
      const suggestion = (drift.details?.suggestions as string[] | undefined)?.[0] || '-';
      const shortSuggestion = suggestion.length > 25 ? suggestion.slice(0, 22) + '...' : suggestion;
      lines.push(`| ${shortFile} | ${drift.message.slice(0, 30)} | ${shortSuggestion} |`);
    }

    if (drifts.length > 5) {
      lines.push('');
      lines.push(chalk.dim(`... and ${drifts.length - 5} more issues`));
    }
  }

  lines.push('');
  lines.push(chalk.dim('─'.repeat(40)));
  lines.push('');
  lines.push(chalk.dim('This is a preview. Install Buoy GitHub App to get real PR comments.'));
  lines.push(chalk.cyan('→ buoy ship github'));

  return lines.join('\n');
}
