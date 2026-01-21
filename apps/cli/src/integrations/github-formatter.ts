// GitHub PR comment formatter for Buoy CLI
// Styled after CodeRabbit's rich review format
import type { DriftResult, DriftSignal } from '@buoy-design/core';
import { COMMENT_MARKER, INLINE_MARKER_PREFIX, INLINE_MARKER_SUFFIX } from './github.js';

export interface PRContext {
  filesChanged?: string[];
  baseBranch?: string;
  headBranch?: string;
  /** Whether a design system reference (tokens, Figma) is configured */
  hasDesignReference?: boolean;
  /** Number of tokens found */
  tokenCount?: number;
}

export function formatPRComment(results: DriftResult, context?: PRContext): string {
  const lines: string[] = [COMMENT_MARKER];

  // Header
  lines.push('## 🛟 Buoy Design Drift Report');
  lines.push('');

  // Summary section
  if (results.summary.total === 0) {
    if (!context?.hasDesignReference) {
      // No design reference configured
      lines.push('> **No design system reference configured.**');
      lines.push('>');
      lines.push('> Buoy works best when you have design tokens to compare against.');
      lines.push('> Run `buoy tokens` locally to extract tokens from your CSS files.');
      lines.push('');
    } else {
      lines.push(`✅ No design drift detected across ${context.tokenCount || 0} design tokens.`);
      lines.push('');
    }
  } else {
    lines.push(generateWalkthrough(results));
    lines.push('');
  }

  // Changes table
  if (results.summary.total > 0) {
    lines.push('### Changes');
    lines.push('');
    lines.push('| File | Drift Signals | Severity |');
    lines.push('|------|---------------|----------|');

    const byFile = groupByFile(results.signals);
    for (const [file, signals] of Object.entries(byFile).slice(0, 15)) {
      const maxSeverity = getMaxSeverity(signals);
      const severityIcon = maxSeverity === 'critical' ? '🔴' : maxSeverity === 'warning' ? '🟡' : '🔵';
      lines.push(`| \`${file}\` | ${signals.length} | ${severityIcon} ${maxSeverity} |`);
    }
    if (Object.keys(byFile).length > 15) {
      lines.push(`| ... | *${Object.keys(byFile).length - 15} more files* | |`);
    }
    lines.push('');
  }

  // Pre-merge checks section
  lines.push('### Pre-merge checks');
  lines.push('');

  const { critical, warning } = results.summary;
  if (critical > 0) {
    lines.push(`| Check | Status | Details |`);
    lines.push(`|-------|--------|---------|`);
    lines.push(`| Design System Compliance | ❌ Failed | ${critical} critical drift signal${critical === 1 ? '' : 's'} detected |`);
    if (warning > 0) {
      lines.push(`| Token Usage | ⚠️ Warning | ${warning} warning${warning === 1 ? '' : 's'} to review |`);
    }
  } else if (warning > 0) {
    lines.push(`| Check | Status | Details |`);
    lines.push(`|-------|--------|---------|`);
    lines.push(`| Design System Compliance | ⚠️ Warning | ${warning} warning${warning === 1 ? '' : 's'} to review |`);
    lines.push(`| Critical Issues | ✅ Passed | No critical drift detected |`);
  } else {
    lines.push(`| Check | Status |`);
    lines.push(`|-------|--------|`);
    lines.push(`| Design System Compliance | ✅ Passed |`);
    lines.push(`| Token Usage | ✅ Passed |`);
  }
  lines.push('');

  // Actionable comments summary
  if (results.summary.total > 0) {
    lines.push(`### 📜 Review details`);
    lines.push('');
    lines.push(`**Actionable comments posted: ${Math.min(results.summary.critical + results.summary.warning, 10)}**`);
    lines.push('');

    // Critical issues with full detail
    const criticals = results.signals.filter(s => s.severity === 'critical');
    if (criticals.length > 0) {
      lines.push('<details>');
      lines.push(`<summary>🔴 Critical Issues (${criticals.length})</summary>`);
      lines.push('');
      for (const signal of criticals) {
        lines.push(formatSignalDetail(signal));
        lines.push('');
      }
      lines.push('</details>');
      lines.push('');
    }

    // Warnings
    const warnings = results.signals.filter(s => s.severity === 'warning');
    if (warnings.length > 0) {
      lines.push('<details>');
      lines.push(`<summary>🟡 Warnings (${warnings.length})</summary>`);
      lines.push('');
      for (const signal of warnings.slice(0, 10)) {
        lines.push(formatSignalDetail(signal));
        lines.push('');
      }
      if (warnings.length > 10) {
        lines.push(`*... and ${warnings.length - 10} more warnings*`);
        lines.push('');
      }
      lines.push('</details>');
      lines.push('');
    }

    // Info collapsed
    const infos = results.signals.filter(s => s.severity === 'info');
    if (infos.length > 0) {
      lines.push('<details>');
      lines.push(`<summary>🔵 Info (${infos.length})</summary>`);
      lines.push('');
      for (const signal of infos.slice(0, 5)) {
        lines.push(`- \`${signal.component || '-'}\`: ${signal.message}`);
      }
      if (infos.length > 5) {
        lines.push(`- *... and ${infos.length - 5} more*`);
      }
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }
  }

  // Finishing touches section
  lines.push('### ✨ Finishing touches');
  lines.push('');
  lines.push('React to this comment to provide feedback:');
  lines.push('- 👍 = All drift is intentional, approve');
  lines.push('- 👎 = Issues need to be fixed');
  lines.push('- 😕 = Need clarification on design system rules');
  lines.push('');

  // Footer - minimal, just the link
  lines.push('---');
  lines.push('<sub>Powered by <a href="https://github.com/ahoybuoy/buoy">Buoy</a></sub>');

  return lines.join('\n');
}

function generateWalkthrough(results: DriftResult): string {
  const { critical, warning, info } = results.summary;
  const parts: string[] = [];

  if (critical > 0) {
    parts.push(`Found **${critical} critical** design system violation${critical === 1 ? '' : 's'} that should be addressed before merging`);
  }
  if (warning > 0) {
    parts.push(`${warning} warning${warning === 1 ? '' : 's'} for hardcoded values or inconsistent patterns`);
  }
  if (info > 0) {
    parts.push(`${info} informational suggestion${info === 1 ? '' : 's'}`);
  }

  // Group by type for summary
  const byType = new Map<string, number>();
  for (const signal of results.signals) {
    byType.set(signal.type, (byType.get(signal.type) || 0) + 1);
  }

  const typeDescriptions: string[] = [];
  for (const [type, count] of byType) {
    const label = type.replace(/-/g, ' ');
    typeDescriptions.push(`${count} ${label}`);
  }

  if (typeDescriptions.length > 0) {
    parts.push(`Issues include: ${typeDescriptions.join(', ')}.`);
  }

  return parts.join('. ') + '.';
}

function groupByFile(signals: DriftResult['signals']): Record<string, DriftResult['signals']> {
  const groups: Record<string, DriftResult['signals']> = {};
  for (const signal of signals) {
    const file = signal.file || 'unknown';
    if (!groups[file]) groups[file] = [];
    groups[file].push(signal);
  }
  return groups;
}

function getMaxSeverity(signals: DriftResult['signals']): 'critical' | 'warning' | 'info' {
  if (signals.some(s => s.severity === 'critical')) return 'critical';
  if (signals.some(s => s.severity === 'warning')) return 'warning';
  return 'info';
}

function formatSignalDetail(signal: DriftResult['signals'][0]): string {
  const lines: string[] = [];
  const icon = signal.severity === 'critical' ? '🔴' : signal.severity === 'warning' ? '🟡' : '🔵';
  const typeLabel = signal.type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  // File location
  const location = signal.file ? `\`${signal.file}${signal.line ? `:${signal.line}` : ''}\`` : '';

  lines.push(`#### ${icon} ${typeLabel}`);
  if (location) {
    lines.push(`📍 ${location}`);
  }
  lines.push('');
  lines.push(`> ${signal.message}`);

  if (signal.component) {
    lines.push('');
    lines.push(`**Component:** \`${signal.component}\``);
  }

  if (signal.suggestion) {
    lines.push('');
    lines.push(`**💡 Suggestion:** ${signal.suggestion}`);
  }

  return lines.join('\n');
}

/**
 * Format an inline comment for a specific drift signal (CodeRabbit style)
 */
export function formatInlineComment(signal: {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  component?: string;
  suggestion?: string;
  currentValue?: string;
  expectedValue?: string;
}, signalId?: string): string {
  const lines: string[] = [];

  // Add hidden marker with signal ID for tracking
  if (signalId) {
    lines.push(`${INLINE_MARKER_PREFIX}${signalId}${INLINE_MARKER_SUFFIX}`);
  }

  // Severity badge (CodeRabbit style)
  const severityBadge = signal.severity === 'critical'
    ? '⚠️ Potential issue | 🔴 Critical'
    : signal.severity === 'warning'
    ? '⚠️ Potential issue | 🟠 Warning'
    : '💡 Suggestion | 🔵 Info';

  // Header with type
  const typeLabel = signal.type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  lines.push(`**${severityBadge}**`);
  lines.push('');
  lines.push(`### ${typeLabel}`);
  lines.push('');

  // Message
  lines.push(signal.message);

  // Component context
  if (signal.component) {
    lines.push('');
    lines.push(`**Component:** \`${signal.component}\``);
  }

  // Committable suggestion (if we have current/expected values)
  if (signal.currentValue && signal.expectedValue) {
    lines.push('');
    lines.push('```diff');
    lines.push(`- ${signal.currentValue}`);
    lines.push(`+ ${signal.expectedValue}`);
    lines.push('```');
    lines.push('');
    lines.push('<details>');
    lines.push('<summary>📝 Committable suggestion</summary>');
    lines.push('');
    lines.push('```suggestion');
    lines.push(signal.expectedValue);
    lines.push('```');
    lines.push('</details>');
  } else if (signal.suggestion) {
    lines.push('');
    lines.push(`> 💡 **Suggestion:** ${signal.suggestion}`);
  }

  // Reaction hint
  lines.push('');
  lines.push('---');
  lines.push('<sub>React with 👍 to acknowledge as intentional, or 👎 if it needs fixing.</sub>');

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
    currentValue: drift.details.actual as string | undefined,
    expectedValue: drift.details.expected as string | undefined,
  }, signalId);
}

/**
 * AI Analysis types (imported from ai-analysis service)
 */
interface DriftAnalysis {
  signal: { type: string; severity: 'critical' | 'warning' | 'info'; message: string; source: { entityName: string; location?: string } };
  analysis: string;
  isLikelyIntentional: boolean;
  confidence: number;
  suggestedAction: 'fix' | 'approve' | 'discuss';
  relatedHistory: string[];
}

interface PRAnalysisSummary {
  overview: string;
  criticalIssues: DriftAnalysis[];
  warnings: DriftAnalysis[];
  recommendations: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * Format PR comment with AI-powered analysis (CodeRabbit style)
 */
export function formatAIPRComment(analysis: PRAnalysisSummary, results: DriftResult): string {
  const lines: string[] = [COMMENT_MARKER];

  // Header with AI badge
  lines.push('## 🛟 Buoy Design Drift Report');
  lines.push('');
  lines.push('*🤖 AI-powered analysis enabled*');
  lines.push('');

  // AI Overview and risk level
  const riskIcon = analysis.riskLevel === 'high' ? '🔴' : analysis.riskLevel === 'medium' ? '🟡' : '🟢';
  lines.push(`${riskIcon} **Risk Level:** ${analysis.riskLevel.toUpperCase()}`);
  lines.push('');
  lines.push(analysis.overview);
  lines.push('');

  // Changes table
  if (results.summary.total > 0) {
    lines.push('### Changes');
    lines.push('');
    lines.push('| File | Drift Signals | Severity |');
    lines.push('|------|---------------|----------|');

    const byFile = groupByFile(results.signals);
    for (const [file, signals] of Object.entries(byFile).slice(0, 15)) {
      const maxSeverity = getMaxSeverity(signals);
      const severityIcon = maxSeverity === 'critical' ? '🔴' : maxSeverity === 'warning' ? '🟡' : '🔵';
      lines.push(`| \`${file}\` | ${signals.length} | ${severityIcon} ${maxSeverity} |`);
    }
    if (Object.keys(byFile).length > 15) {
      lines.push(`| ... | *${Object.keys(byFile).length - 15} more files* | |`);
    }
    lines.push('');
  }

  // Pre-merge checks
  lines.push('### Pre-merge checks');
  lines.push('');
  lines.push('| Check | Status | Details |');
  lines.push('|-------|--------|---------|');

  if (analysis.riskLevel === 'high') {
    lines.push(`| Design System Compliance | ❌ Failed | ${results.summary.critical} critical issues require attention |`);
  } else if (analysis.riskLevel === 'medium') {
    lines.push(`| Design System Compliance | ⚠️ Warning | Review recommended before merge |`);
  } else {
    lines.push(`| Design System Compliance | ✅ Passed | Low risk, minor issues only |`);
  }

  // Check for intentional drift
  const intentionalCount = [...analysis.criticalIssues, ...analysis.warnings].filter(a => a.isLikelyIntentional).length;
  if (intentionalCount > 0) {
    lines.push(`| Intentional Drift | ℹ️ Info | ${intentionalCount} issue${intentionalCount === 1 ? '' : 's'} appear intentional |`);
  }
  lines.push('');

  // AI-Analyzed Issues
  if (analysis.criticalIssues.length > 0) {
    lines.push('### 📜 AI Analysis - Critical Issues');
    lines.push('');

    for (const issue of analysis.criticalIssues) {
      lines.push(formatAIAnalyzedIssue(issue));
      lines.push('');
    }
  }

  if (analysis.warnings.length > 0) {
    lines.push('<details>');
    lines.push(`<summary>🟡 AI Analysis - Warnings (${analysis.warnings.length})</summary>`);
    lines.push('');

    for (const issue of analysis.warnings) {
      lines.push(formatAIAnalyzedIssue(issue));
      lines.push('');
    }

    lines.push('</details>');
    lines.push('');
  }

  // Recommendations
  if (analysis.recommendations.length > 0) {
    lines.push('### 💡 Recommendations');
    lines.push('');
    for (const rec of analysis.recommendations) {
      lines.push(`- ${rec}`);
    }
    lines.push('');
  }

  // Finishing touches
  lines.push('### ✨ Finishing touches');
  lines.push('');
  lines.push('React to provide feedback:');
  lines.push('- 👍 = Approve all flagged drift as intentional');
  lines.push('- 👎 = Issues need fixing before merge');
  lines.push('- 😕 = Need clarification on design system rules');
  lines.push('');

  // Footer - minimal, just the link
  lines.push('---');
  lines.push('<sub>Powered by <a href="https://github.com/ahoybuoy/buoy">Buoy</a></sub>');

  return lines.join('\n');
}

function formatAIAnalyzedIssue(issue: DriftAnalysis): string {
  const lines: string[] = [];
  const icon = issue.signal.severity === 'critical' ? '🔴' : issue.signal.severity === 'warning' ? '🟡' : '🔵';
  const typeLabel = issue.signal.type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  // Action badge
  const actionBadge = issue.suggestedAction === 'fix'
    ? '⚠️ **Needs Fix**'
    : issue.suggestedAction === 'approve'
    ? '✅ **Likely Intentional**'
    : '💬 **Discuss**';

  lines.push(`#### ${icon} ${typeLabel}`);

  const location = issue.signal.source.location;
  if (location) {
    lines.push(`📍 \`${location}\``);
  }
  lines.push('');

  lines.push(`> ${issue.signal.message}`);
  lines.push('');

  // AI Analysis
  lines.push(`**🤖 AI Analysis:** ${issue.analysis}`);
  lines.push('');
  lines.push(`**Suggested Action:** ${actionBadge}`);

  if (issue.isLikelyIntentional) {
    lines.push('');
    lines.push(`*Confidence: ${Math.round(issue.confidence * 100)}% - This drift appears intentional based on context.*`);
  }

  // Related history
  if (issue.relatedHistory.length > 0) {
    lines.push('');
    lines.push('**Context:**');
    for (const h of issue.relatedHistory) {
      lines.push(`- ${h}`);
    }
  }

  return lines.join('\n');
}
