// GitHub PR comment formatter for Buoy CLI
import type { DriftResult } from '@buoy-design/core';
import { COMMENT_MARKER } from './github.js';

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
      lines.push(`- \`${signal.component || 'Unknown'}\`: ${signal.message}${loc}`);
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
