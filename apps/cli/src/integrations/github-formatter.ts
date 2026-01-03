// GitHub PR comment formatter for Buoy CLI
import type { DriftResult, DriftSignal } from '@buoy-design/core';
import { COMMENT_MARKER, INLINE_MARKER_PREFIX, INLINE_MARKER_SUFFIX } from './github.js';

export function formatPRComment(results: DriftResult): string {
  const lines: string[] = [COMMENT_MARKER];

  // Header
  const icon = results.summary.critical > 0 ? '🔴' :
               results.summary.warning > 0 ? '🟡' : '🟢';
  lines.push(`## ${icon} Buoy Drift Report`);
  lines.push('');

  // Summary
  const { total, critical, warning, info } = results.summary;
  if (total === 0) {
    lines.push('No design drift detected. Your code is aligned with the design system!');
    lines.push('');
    lines.push('---');
    lines.push('<sub>🔱 <a href="https://github.com/dylantarre/buoy">Buoy</a></sub>');
    return lines.join('\n');
  }

  lines.push(`**${total} issue${total === 1 ? '' : 's'} found** (${critical} critical, ${warning} warning${warning === 1 ? '' : 's'}, ${info} info)`);
  lines.push('');

  // Group by severity
  const criticals = results.signals.filter(s => s.severity === 'critical');
  const warnings = results.signals.filter(s => s.severity === 'warning');
  const infos = results.signals.filter(s => s.severity === 'info');

  // Critical issues table
  if (criticals.length > 0) {
    lines.push('### Critical');
    lines.push('');
    lines.push('| Component | Issue | File |');
    lines.push('|-----------|-------|------|');
    for (const signal of criticals) {
      const file = signal.file ? `\`${signal.file}${signal.line ? `:${signal.line}` : ''}\`` : '-';
      lines.push(`| \`${signal.component || '-'}\` | ${signal.message} | ${file} |`);
    }
    lines.push('');
  }

  // Warning issues table
  if (warnings.length > 0) {
    lines.push('### Warnings');
    lines.push('');
    lines.push('| Component | Issue | File |');
    lines.push('|-----------|-------|------|');
    for (const signal of warnings.slice(0, 10)) {
      const file = signal.file ? `\`${signal.file}${signal.line ? `:${signal.line}` : ''}\`` : '-';
      lines.push(`| \`${signal.component || '-'}\` | ${signal.message} | ${file} |`);
    }
    if (warnings.length > 10) {
      lines.push(`| ... | *${warnings.length - 10} more warnings* | |`);
    }
    lines.push('');
  }

  // Info issues collapsed
  if (infos.length > 0) {
    lines.push('<details>');
    lines.push(`<summary>${infos.length} info-level issue${infos.length === 1 ? '' : 's'}</summary>`);
    lines.push('');
    for (const signal of infos) {
      const loc = signal.file ? ` (${signal.file}${signal.line ? `:${signal.line}` : ''})` : '';
      lines.push(`- \`${signal.component || '-'}\`: ${signal.message}${loc}`);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push('<sub>🔱 <a href="https://github.com/dylantarre/buoy">Buoy</a></sub>');

  return lines.join('\n');
}

/**
 * Format an inline comment for a specific drift signal
 */
export function formatInlineComment(signal: {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  component?: string;
  suggestion?: string;
}, signalId?: string): string {
  const lines: string[] = [];

  // Add hidden marker with signal ID for tracking
  if (signalId) {
    lines.push(`${INLINE_MARKER_PREFIX}${signalId}${INLINE_MARKER_SUFFIX}`);
  }

  // Severity icon
  const icon = signal.severity === 'critical' ? '🔴' :
               signal.severity === 'warning' ? '🟡' : '🔵';

  // Header with type
  const typeLabel = signal.type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  lines.push(`${icon} **${typeLabel}**`);
  lines.push('');

  // Message
  lines.push(signal.message);

  // Component context
  if (signal.component) {
    lines.push('');
    lines.push(`Component: \`${signal.component}\``);
  }

  // Suggestion
  if (signal.suggestion) {
    lines.push('');
    lines.push(`> 💡 **Suggestion:** ${signal.suggestion}`);
  }

  // Reaction hint
  lines.push('');
  lines.push('<sub>React with 👍 to acknowledge this is intentional, or 👎 if it needs fixing.</sub>');

  return lines.join('\n');
}

/**
 * Format a signal for inline commenting from a DriftSignal
 */
export function formatDriftSignalForInline(drift: DriftSignal, signalId: string): string {
  return formatInlineComment({
    type: drift.type,
    severity: drift.severity,
    message: drift.message,
    component: drift.source.entityName,
    suggestion: drift.details.suggestions?.[0],
  }, signalId);
}
