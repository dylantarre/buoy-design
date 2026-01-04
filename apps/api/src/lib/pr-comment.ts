/**
 * PR Comment Formatting
 *
 * Generates markdown for Buoy's PR comments
 */

import type { DriftSignal } from './scanner.js';

export interface CommentData {
  signals: DriftSignal[];
  baselineCount: number;
  previousSignals?: DriftSignal[];
  truncated?: boolean;
  scannedCount?: number;
  totalCount?: number;
  deferred?: boolean;
  deferredResetAt?: Date;
}

/**
 * Format the PR comment markdown
 */
export function formatPRComment(data: CommentData): string {
  const { signals, baselineCount, previousSignals, truncated, scannedCount, totalCount } = data;

  // Handle deferred scan
  if (data.deferred && data.deferredResetAt) {
    return formatDeferredComment(data.deferredResetAt);
  }

  // Header
  let comment = `## :ring_buoy: Buoy Design Drift Report\n\n`;

  // Summary
  if (signals.length === 0) {
    comment += `:white_check_mark: **No new design drift detected** in this PR\n\n`;
  } else if (previousSignals) {
    // Show diff from previous push
    const fixed = previousSignals.filter(
      (prev) => !signals.some((s) => s.file === prev.file && s.line === prev.line && s.value === prev.value)
    );
    const remaining = signals.length;

    comment += `**${remaining} issue${remaining !== 1 ? 's' : ''} remaining**`;
    if (fixed.length > 0) {
      comment += ` (${fixed.length} fixed since last push)`;
    }
    comment += `\n\n`;

    // Show fixed items
    if (fixed.length > 0) {
      comment += `### :white_check_mark: Fixed\n\n`;
      for (const signal of fixed.slice(0, 5)) {
        comment += `- ~~\`${signal.file}:${signal.line}\`~~ ${signal.message}\n`;
      }
      if (fixed.length > 5) {
        comment += `- _...and ${fixed.length - 5} more_\n`;
      }
      comment += `\n`;
    }
  } else {
    comment += `**${signals.length} new issue${signals.length !== 1 ? 's' : ''}** in this PR\n\n`;
  }

  // Group signals by author
  if (signals.length > 0) {
    comment += formatSignalsByAuthor(signals);
  }

  // Truncation notice
  if (truncated && scannedCount !== undefined && totalCount !== undefined) {
    comment += `> :hourglass: Scanned ${scannedCount} of ${totalCount} changed files (rate limited)\n\n`;
  }

  // Baseline section
  if (baselineCount > 0) {
    comment += `---\n\n`;
    comment += `<details>\n`;
    comment += `<summary>Baseline: ${baselineCount} pre-existing issue${baselineCount !== 1 ? 's' : ''}</summary>\n\n`;
    comment += `These issues existed before this PR and are not shown above.\n\n`;
    comment += `Run \`buoy baseline reset\` to re-scan and update the baseline.\n\n`;
    comment += `</details>\n\n`;
  }

  // Footer
  comment += `---\n`;
  comment += `*:robot: [Buoy](https://buoy.design) scans every PR for design drift. [Configure](https://app.buoy.design/settings)*`;

  return comment;
}

/**
 * Group and format signals by author
 */
function formatSignalsByAuthor(signals: DriftSignal[]): string {
  // Group by author
  const byAuthor = new Map<string, DriftSignal[]>();

  for (const signal of signals) {
    const author = signal.author ?? 'Unknown';
    const existing = byAuthor.get(author) ?? [];
    existing.push(signal);
    byAuthor.set(author, existing);
  }

  // Sort authors by issue count (most issues first)
  const sortedAuthors = [...byAuthor.entries()].sort((a, b) => b[1].length - a[1].length);

  let comment = '';

  for (const [author, authorSignals] of sortedAuthors) {
    const count = authorSignals.length;
    comment += `### ${author} (${count} issue${count !== 1 ? 's' : ''})\n\n`;

    // Sort by severity (errors first, then warnings, then info)
    const sorted = [...authorSignals].sort((a, b) => {
      const order = { error: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    });

    comment += `| Severity | File | Line | Issue |\n`;
    comment += `|----------|------|------|-------|\n`;

    for (const signal of sorted.slice(0, 15)) {
      const icon = getSeverityIcon(signal.severity);
      const suggestion = signal.suggestion ? ` - ${signal.suggestion}` : '';
      comment += `| ${icon} | \`${signal.file}\` | ${signal.line} | ${signal.message}${suggestion} |\n`;
    }

    if (sorted.length > 15) {
      comment += `| | | | _...and ${sorted.length - 15} more_ |\n`;
    }

    comment += `\n`;
  }

  return comment;
}

/**
 * Get emoji icon for severity level
 */
function getSeverityIcon(severity: 'error' | 'warning' | 'info'): string {
  switch (severity) {
    case 'error':
      return ':x:';
    case 'warning':
      return ':warning:';
    case 'info':
      return ':information_source:';
  }
}

/**
 * Format a deferred scan comment (when rate limited)
 */
function formatDeferredComment(resetAt: Date): string {
  const resetTime = resetAt.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  return `## :ring_buoy: Buoy Design Drift Report

:hourglass: **Scan deferred** - GitHub API rate limit reached

Will scan automatically after ${resetTime}

---
*:robot: [Buoy](https://buoy.design) scans every PR for design drift*`;
}

/**
 * GitHub comment marker to identify Buoy comments
 */
export const BUOY_COMMENT_MARKER = '<!-- buoy-design-drift-report -->';

/**
 * Format comment with marker for identification
 */
export function formatCommentWithMarker(data: CommentData): string {
  return `${BUOY_COMMENT_MARKER}\n${formatPRComment(data)}`;
}

/**
 * Check if a comment is a Buoy comment
 */
export function isBuoyComment(body: string): boolean {
  return body.includes(BUOY_COMMENT_MARKER) || body.includes(':ring_buoy: Buoy Design Drift Report');
}
