import chalk, { type ChalkInstance } from 'chalk';
import Table from 'cli-table3';
import type { Component, DesignToken, DriftSignal, Severity } from '@buoy-design/core';
import { sortDriftsBySeverity } from '../services/drift-analysis.js';

// Severity colors
export function getSeverityColor(severity: Severity): ChalkInstance {
  switch (severity) {
    case 'critical':
      return chalk.red;
    case 'warning':
      return chalk.yellow;
    case 'info':
      return chalk.blue;
  }
}

export function getSeverityIcon(severity: Severity): string {
  switch (severity) {
    case 'critical':
      return chalk.red('!');
    case 'warning':
      return chalk.yellow('~');
    case 'info':
      return chalk.blue('i');
  }
}

// Format component table
export function formatComponentTable(components: Component[]): string {
  if (components.length === 0) {
    return chalk.dim('No components found.');
  }

  const table = new Table({
    head: [
      chalk.bold('Name'),
      chalk.bold('Source'),
      chalk.bold('Props'),
      chalk.bold('Variants'),
    ],
    style: { head: [], border: [] },
  });

  for (const comp of components) {
    table.push([
      comp.name,
      comp.source.type,
      String(comp.props.length),
      String(comp.variants.length),
    ]);
  }

  return table.toString();
}

// Format token table
export function formatTokenTable(tokens: DesignToken[]): string {
  if (tokens.length === 0) {
    return chalk.dim('No tokens found.');
  }

  const table = new Table({
    head: [
      chalk.bold('Name'),
      chalk.bold('Category'),
      chalk.bold('Source'),
      chalk.bold('Value'),
    ],
    style: { head: [], border: [] },
  });

  for (const token of tokens) {
    let value = '';
    switch (token.value.type) {
      case 'color':
        value = token.value.hex;
        break;
      case 'spacing':
        value = `${token.value.value}${token.value.unit}`;
        break;
      case 'typography':
        value = `${token.value.fontFamily} ${token.value.fontSize}px`;
        break;
      case 'shadow':
        value = `${token.value.x}px ${token.value.y}px ${token.value.blur}px ${token.value.color}`;
        break;
      case 'border':
        value = `${token.value.width}px ${token.value.style} ${token.value.color}`;
        break;
      case 'raw':
        // Show the actual value, truncated if needed
        value = token.value.value.length > 40
          ? token.value.value.slice(0, 37) + '...'
          : token.value.value;
        break;
      default:
        value = JSON.stringify(token.value).slice(0, 30);
    }

    table.push([
      token.name,
      token.category,
      token.source.type,
      value,
    ]);
  }

  return table.toString();
}

// Format drift table
export function formatDriftTable(drifts: DriftSignal[]): string {
  if (drifts.length === 0) {
    return chalk.green('No drift detected. Your design system is aligned.');
  }

  const table = new Table({
    head: [
      '',
      chalk.bold('Type'),
      chalk.bold('Entity'),
      chalk.bold('Message'),
    ],
    style: { head: [], border: [] },
    colWidths: [3, 25, 25, 50],
    wordWrap: true,
  });

  // Sort by severity (critical first)
  const sorted = sortDriftsBySeverity(drifts);

  for (const drift of sorted) {
    const color = getSeverityColor(drift.severity);
    const icon = getSeverityIcon(drift.severity);

    table.push([
      icon,
      color(drift.type),
      drift.source.entityName,
      drift.message,
    ]);
  }

  return table.toString();
}

// Format drift details
export function formatDriftDetails(drift: DriftSignal): string {
  const color = getSeverityColor(drift.severity);
  const lines: string[] = [];

  lines.push(color.bold(`[${drift.severity.toUpperCase()}] ${drift.type}`));
  lines.push('');
  lines.push(chalk.bold('Entity: ') + drift.source.entityName);
  lines.push(chalk.bold('Location: ') + drift.source.location);
  lines.push('');
  lines.push(chalk.bold('Message:'));
  lines.push(drift.message);

  if (drift.details.suggestions && drift.details.suggestions.length > 0) {
    lines.push('');
    lines.push(chalk.bold('Suggestions:'));
    for (const suggestion of drift.details.suggestions) {
      lines.push(`  - ${suggestion}`);
    }
  }

  if (drift.details.claudeAnalysis) {
    lines.push('');
    lines.push(chalk.bold('Analysis:'));
    lines.push(drift.details.claudeAnalysis);
  }

  return lines.join('\n');
}

// Format summary
export function formatSummary(stats: {
  components: number;
  tokens: number;
  drifts: { critical: number; warning: number; info: number };
}): string {
  const lines: string[] = [];

  lines.push(chalk.bold('Summary'));
  lines.push(`  Components: ${stats.components}`);
  lines.push(`  Tokens: ${stats.tokens}`);
  lines.push('');
  lines.push(chalk.bold('Drift Signals'));
  lines.push(`  ${chalk.red('Critical:')} ${stats.drifts.critical}`);
  lines.push(`  ${chalk.yellow('Warning:')} ${stats.drifts.warning}`);
  lines.push(`  ${chalk.blue('Info:')} ${stats.drifts.info}`);

  return lines.join('\n');
}

// Format as JSON
export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

// Format drift list with full details and action items
export function formatDriftList(drifts: DriftSignal[]): string {
  if (drifts.length === 0) {
    return chalk.green('No drift detected. Your design system is aligned.');
  }

  const lines: string[] = [];

  // Sort by severity (critical first)
  const sorted = sortDriftsBySeverity(drifts);

  // Group by severity for better readability
  const critical = sorted.filter(d => d.severity === 'critical');
  const warning = sorted.filter(d => d.severity === 'warning');
  const info = sorted.filter(d => d.severity === 'info');

  const formatIssue = (drift: DriftSignal, index: number) => {
    const color = getSeverityColor(drift.severity);
    const icon = getSeverityIcon(drift.severity);

    lines.push('');
    lines.push(`${icon} ${color.bold(`#${index + 1} ${formatDriftType(drift.type)}`)}`);
    lines.push(`  ${chalk.dim('Component:')} ${drift.source.entityName}`);

    if (drift.source.location) {
      lines.push(`  ${chalk.dim('Location:')}  ${drift.source.location}`);
    }

    lines.push(`  ${chalk.dim('Issue:')}     ${drift.message}`);

    // Show expected vs actual if available
    if (drift.details.expected !== undefined && drift.details.actual !== undefined) {
      lines.push(`  ${chalk.dim('Expected:')}  ${chalk.green(String(drift.details.expected))}`);
      lines.push(`  ${chalk.dim('Actual:')}    ${chalk.red(String(drift.details.actual))}`);
    }

    // Show affected files/locations if available
    if (drift.details.affectedFiles && drift.details.affectedFiles.length > 0) {
      lines.push(`  ${chalk.dim('Details:')}`);
      for (const file of drift.details.affectedFiles.slice(0, 5)) {
        lines.push(`    ${chalk.dim('•')} ${file}`);
      }
      if (drift.details.affectedFiles.length > 5) {
        lines.push(`    ${chalk.dim(`... and ${drift.details.affectedFiles.length - 5} more`)}`);
      }
    }

    // Show related components if available
    if (drift.details.relatedComponents && drift.details.relatedComponents.length > 0) {
      lines.push(`  ${chalk.dim('Related:')}   ${drift.details.relatedComponents.join(', ')}`);
    }

    // Show action items
    const actions = getActionItems(drift);
    if (actions.length > 0) {
      lines.push('');
      lines.push(`  ${chalk.cyan.bold('Actions:')}`);
      for (let i = 0; i < actions.length; i++) {
        lines.push(`    ${chalk.cyan(`${i + 1}.`)} ${actions[i]}`);
      }
    }
  };

  let issueNumber = 0;

  if (critical.length > 0) {
    lines.push('');
    lines.push(chalk.red.bold(`━━━ CRITICAL (${critical.length}) ━━━`));
    for (const drift of critical) {
      formatIssue(drift, issueNumber++);
    }
  }

  if (warning.length > 0) {
    lines.push('');
    lines.push(chalk.yellow.bold(`━━━ WARNING (${warning.length}) ━━━`));
    for (const drift of warning) {
      formatIssue(drift, issueNumber++);
    }
  }

  if (info.length > 0) {
    lines.push('');
    lines.push(chalk.blue.bold(`━━━ INFO (${info.length}) ━━━`));
    for (const drift of info) {
      formatIssue(drift, issueNumber++);
    }
  }

  return lines.join('\n');
}

// Get specific action items for a drift signal
function getActionItems(drift: DriftSignal): string[] {
  const actions: string[] = [];

  switch (drift.type) {
    case 'hardcoded-value':
      if (drift.message.includes('color')) {
        actions.push('Replace hardcoded colors with design tokens');
        actions.push('Example: Change #3b82f6 → var(--color-primary) or theme.colors.primary');
        actions.push('If no token exists, add it to your design system first');
      } else {
        actions.push('Replace hardcoded values with spacing/size tokens');
        actions.push('Example: Change 16px → var(--spacing-4) or theme.spacing.md');
      }
      break;

    case 'naming-inconsistency':
      if (drift.details.relatedComponents) {
        actions.push(`Consolidate duplicate components: ${drift.details.relatedComponents.join(', ')}`);
        actions.push('Keep the most complete version and update imports');
        actions.push('Document the canonical component in your design system');
      } else {
        actions.push('Rename component to match project conventions');
        if (drift.details.suggestions?.[0]) {
          actions.push(drift.details.suggestions[0]);
        }
      }
      break;

    case 'semantic-mismatch':
      actions.push('Standardize prop types across components');
      if (drift.details.expected && drift.details.actual) {
        actions.push(`Change prop type from "${drift.details.actual}" to "${drift.details.expected}"`);
      }
      if (drift.details.usedIn && drift.details.usedIn.length > 0) {
        actions.push(`Reference: ${drift.details.usedIn.join(', ')} use the expected type`);
      }
      break;

    case 'deprecated-pattern':
      actions.push('Migrate away from deprecated component');
      if (drift.details.suggestions?.[0]) {
        actions.push(drift.details.suggestions[0]);
      }
      actions.push('Search codebase for usages and update imports');
      break;

    case 'orphaned-component':
      if (drift.message.includes('not in design')) {
        actions.push('Add component to Figma design system');
        actions.push('Or document as intentional code-only component');
        actions.push('Or remove if truly unused');
      } else {
        actions.push('Implement the designed component in code');
        actions.push('Or remove from Figma if no longer needed');
      }
      break;

    case 'orphaned-token':
      if (drift.message.includes('not in design')) {
        actions.push('Add token to design system (Figma/Tokens Studio)');
        actions.push('Or remove from code if unused');
      } else {
        actions.push('Implement token in code (CSS variables or theme)');
        actions.push('Or remove from design if deprecated');
      }
      break;

    case 'value-divergence':
      actions.push('Align token values between design and code');
      if (drift.details.expected && drift.details.actual) {
        actions.push(`Design value: ${JSON.stringify(drift.details.expected)}`);
        actions.push(`Code value: ${JSON.stringify(drift.details.actual)}`);
      }
      actions.push('Update whichever source is outdated');
      break;

    case 'accessibility-conflict':
      actions.push('Add missing accessibility attributes');
      actions.push('For interactive elements: add aria-label or visible text');
      actions.push('Run accessibility audit: npx axe-core or use browser devtools');
      break;

    case 'framework-sprawl':
      actions.push('Document which framework is primary');
      actions.push('Create migration plan for legacy framework code');
      if (drift.details.frameworks) {
        const frameworks = drift.details.frameworks as Array<{name: string}>;
        actions.push(`Frameworks detected: ${frameworks.map(f => f.name).join(', ')}`);
      }
      break;

    default:
      // Fall back to generic suggestions from the drift signal
      if (drift.details.suggestions) {
        actions.push(...drift.details.suggestions);
      }
  }

  return actions;
}

// Format drift type for display (technical)
function formatDriftType(type: string): string {
  const labels: Record<string, string> = {
    'hardcoded-value': 'Hardcoded Value',
    'naming-inconsistency': 'Naming Inconsistency',
    'semantic-mismatch': 'Prop Type Mismatch',
    'deprecated-pattern': 'Deprecated Component',
    'orphaned-component': 'Orphaned Component',
    'orphaned-token': 'Orphaned Token',
    'value-divergence': 'Token Value Mismatch',
    'accessibility-conflict': 'Accessibility Issue',
    'framework-sprawl': 'Framework Sprawl',
    'missing-documentation': 'Missing Documentation',
  };
  return labels[type] || type;
}

// Designer-friendly labels (plain English, non-technical)
export function formatDriftTypeForDesigners(type: string): string {
  const labels: Record<string, string> = {
    'hardcoded-value': 'Using wrong color/size',
    'naming-inconsistency': 'Inconsistent naming',
    'semantic-mismatch': 'Component behaves differently',
    'deprecated-pattern': 'Using outdated component',
    'orphaned-component': 'Component not in design file',
    'orphaned-token': 'Style not in design system',
    'value-divergence': 'Design doesn\'t match code',
    'accessibility-conflict': 'Accessibility problem',
    'framework-sprawl': 'Mixed technologies',
    'missing-documentation': 'Missing documentation',
    'unused-component': 'Component never used',
    'unused-token': 'Style never used',
    'color-contrast': 'Hard to read (contrast)',
  };
  return labels[type] || type;
}

// Designer-friendly explanations
export function getDriftExplanationForDesigners(type: string): string {
  const explanations: Record<string, string> = {
    'hardcoded-value': 'A developer typed a specific color or size value instead of using the design system. This makes it harder to update the design later.',
    'naming-inconsistency': 'Similar components have different names, which makes it confusing to know which one to use.',
    'semantic-mismatch': 'The same component works differently in different places, which creates an inconsistent experience.',
    'deprecated-pattern': 'This component has been replaced with a newer version, but someone is still using the old one.',
    'orphaned-component': 'This component exists in code but isn\'t documented in Figma, so designers can\'t see it.',
    'orphaned-token': 'This style exists in code but isn\'t in the design system, so it might be inconsistent.',
    'value-divergence': 'The design file says one thing, but the code says something different. They need to be synced.',
    'accessibility-conflict': 'This might be hard for some users to see or interact with.',
    'framework-sprawl': 'The code uses multiple different technologies, which can cause inconsistencies.',
    'missing-documentation': 'This component doesn\'t have documentation, so developers might use it incorrectly.',
    'unused-component': 'This component was built but never actually used anywhere.',
    'unused-token': 'This style was defined but never applied anywhere.',
    'color-contrast': 'The text and background colors don\'t have enough contrast for everyone to read easily.',
  };
  return explanations[type] || 'A design consistency issue was detected.';
}

// Format for AI agents - concise, actionable, easy to parse
export function formatAgent(drifts: DriftSignal[]): string {
  if (drifts.length === 0) {
    return JSON.stringify({ status: 'clean', fixes: [] });
  }

  // Focus on actionable signals (warning and critical only)
  const actionable = drifts.filter(d => d.severity === 'warning' || d.severity === 'critical');

  if (actionable.length === 0) {
    return JSON.stringify({
      status: 'clean',
      fixes: [],
      info: `${drifts.length} info-level signals (run with --verbose to see)`
    });
  }

  // Group by file for efficient fixes
  const byFile = new Map<string, DriftSignal[]>();
  for (const drift of actionable) {
    const file = drift.source.location?.split(':')[0] || drift.source.entityName;
    const existing = byFile.get(file) || [];
    existing.push(drift);
    byFile.set(file, existing);
  }

  const fixes: Array<{
    file: string;
    severity: string;
    type: string;
    issue: string;
    fix: string;
    line?: number;
  }> = [];

  for (const [file, fileDrifts] of byFile) {
    for (const drift of fileDrifts) {
      const line = drift.source.location?.includes(':')
        ? parseInt(drift.source.location.split(':')[1] || '0', 10)
        : undefined;

      // Generate specific fix suggestion
      let fix = '';
      if (drift.type === 'hardcoded-value') {
        if (drift.message.includes('color')) {
          const match = drift.message.match(/#[0-9a-fA-F]{3,8}/);
          if (match) {
            fix = `Replace ${match[0]} with design token (e.g., bg-muted, text-primary)`;
          } else {
            fix = 'Replace hardcoded color with design token';
          }
        } else if (drift.message.includes('spacing')) {
          fix = 'Replace arbitrary spacing with theme value (e.g., p-4, gap-2)';
        } else if (drift.message.includes('size')) {
          fix = 'Replace arbitrary size with theme value (e.g., w-full, h-10)';
        } else {
          fix = 'Replace arbitrary value with design token';
        }
      } else if (drift.type === 'semantic-mismatch') {
        fix = `Standardize prop type: ${drift.details.actual} → ${drift.details.expected}`;
      } else if (drift.details.suggestions?.[0]) {
        fix = drift.details.suggestions[0];
      } else {
        fix = drift.message;
      }

      fixes.push({
        file,
        severity: drift.severity,
        type: drift.type,
        issue: drift.message,
        fix,
        ...(line && { line }),
      });
    }
  }

  // Sort by severity (critical first) then by file
  fixes.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'critical' ? -1 : 1;
    }
    return a.file.localeCompare(b.file);
  });

  return JSON.stringify({
    status: 'drift_detected',
    summary: {
      critical: drifts.filter(d => d.severity === 'critical').length,
      warning: drifts.filter(d => d.severity === 'warning').length,
      info: drifts.filter(d => d.severity === 'info').length,
    },
    fixes: fixes.slice(0, 20), // Limit to top 20 for context efficiency
    ...(fixes.length > 20 && { truncated: fixes.length - 20 }),
  }, null, 2);
}

// Format as HTML (shareable with designers)
export function formatHtml(drifts: DriftSignal[], options?: { designerFriendly?: boolean }): string {
  const useDesignerLanguage = options?.designerFriendly ?? true;
  const getLabel = useDesignerLanguage ? formatDriftTypeForDesigners : formatDriftType;
  const getExplanation = useDesignerLanguage ? getDriftExplanationForDesigners : () => '';

  const critical = drifts.filter(d => d.severity === 'critical');
  const warning = drifts.filter(d => d.severity === 'warning');
  const info = drifts.filter(d => d.severity === 'info');

  const severityColors: Record<string, string> = {
    critical: '#dc2626',
    warning: '#d97706',
    info: '#2563eb',
  };

  const renderDrift = (drift: DriftSignal) => {
    const color = severityColors[drift.severity];
    const explanation = getExplanation(drift.type);
    return `
      <div style="border-left: 4px solid ${color}; padding: 12px 16px; margin: 12px 0; background: #f9fafb; border-radius: 0 8px 8px 0;">
        <div style="font-weight: 600; color: ${color}; margin-bottom: 4px;">${getLabel(drift.type)}</div>
        <div style="font-size: 14px; color: #374151; margin-bottom: 8px;">${drift.source.entityName}</div>
        ${drift.source.location ? `<div style="font-size: 12px; color: #6b7280; margin-bottom: 8px;">📍 ${drift.source.location}</div>` : ''}
        <div style="font-size: 14px; color: #111827;">${drift.message}</div>
        ${explanation ? `<div style="font-size: 13px; color: #6b7280; margin-top: 8px; font-style: italic;">${explanation}</div>` : ''}
        ${drift.details.suggestions && drift.details.suggestions.length > 0 ? `
          <div style="margin-top: 12px; padding: 8px 12px; background: #ecfdf5; border-radius: 4px;">
            <div style="font-size: 12px; font-weight: 600; color: #059669; margin-bottom: 4px;">💡 How to fix:</div>
            <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #047857;">
              ${drift.details.suggestions.map(s => `<li>${s}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    `;
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Buoy Design Drift Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #fff; color: #111827; line-height: 1.5; padding: 40px; max-width: 900px; margin: 0 auto; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .subtitle { color: #6b7280; font-size: 14px; margin-bottom: 24px; }
    .summary { display: flex; gap: 16px; margin-bottom: 32px; }
    .summary-card { padding: 16px 24px; border-radius: 8px; text-align: center; }
    .summary-card.critical { background: #fef2f2; border: 1px solid #fecaca; }
    .summary-card.warning { background: #fffbeb; border: 1px solid #fde68a; }
    .summary-card.info { background: #eff6ff; border: 1px solid #bfdbfe; }
    .summary-number { font-size: 32px; font-weight: 700; }
    .summary-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; }
    .section-title { font-size: 18px; font-weight: 600; margin: 24px 0 16px; padding-bottom: 8px; border-bottom: 2px solid; }
    .section-title.critical { border-color: #dc2626; color: #dc2626; }
    .section-title.warning { border-color: #d97706; color: #d97706; }
    .section-title.info { border-color: #2563eb; color: #2563eb; }
    .empty { text-align: center; padding: 48px; color: #059669; background: #ecfdf5; border-radius: 8px; }
    .empty-icon { font-size: 48px; margin-bottom: 12px; }
    footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center; }
  </style>
</head>
<body>
  <h1>🚢 Design Drift Report</h1>
  <div class="subtitle">Generated ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${new Date().toLocaleTimeString()}</div>

  ${drifts.length === 0 ? `
    <div class="empty">
      <div class="empty-icon">✨</div>
      <div style="font-size: 18px; font-weight: 600;">No drift detected!</div>
      <div style="margin-top: 8px;">Your design system is perfectly aligned.</div>
    </div>
  ` : `
    <div class="summary">
      <div class="summary-card critical">
        <div class="summary-number" style="color: #dc2626;">${critical.length}</div>
        <div class="summary-label">Critical</div>
      </div>
      <div class="summary-card warning">
        <div class="summary-number" style="color: #d97706;">${warning.length}</div>
        <div class="summary-label">Warnings</div>
      </div>
      <div class="summary-card info">
        <div class="summary-number" style="color: #2563eb;">${info.length}</div>
        <div class="summary-label">Info</div>
      </div>
    </div>

    ${critical.length > 0 ? `
      <h2 class="section-title critical">🔴 Critical Issues (${critical.length})</h2>
      ${critical.map(renderDrift).join('')}
    ` : ''}

    ${warning.length > 0 ? `
      <h2 class="section-title warning">🟡 Warnings (${warning.length})</h2>
      ${warning.map(renderDrift).join('')}
    ` : ''}

    ${info.length > 0 ? `
      <h2 class="section-title info">🔵 Info (${info.length})</h2>
      ${info.map(renderDrift).join('')}
    ` : ''}
  `}

  <footer>
    Generated by <strong>Buoy</strong> — Design drift detection for AI-generated code<br>
    <a href="https://github.com/ahoybuoy/buoy" style="color: #6b7280;">github.com/ahoybuoy/buoy</a>
  </footer>
</body>
</html>`;
}

// Format like the buoy.design homepage - compact tree view
export function formatDriftTree(drifts: DriftSignal[], fileCount: number = 0): string {
  if (drifts.length === 0) {
    return chalk.green('✓ No drift detected. Your design system is aligned.');
  }

  const lines: string[] = [];

  // Summary line
  const fileText = fileCount > 0 ? ` in ${fileCount} files` : '';
  lines.push(chalk.white.bold(`Found ${drifts.length} issues${fileText}`));
  lines.push('');

  // Group by drift type for cleaner display
  const grouped = new Map<string, DriftSignal[]>();
  for (const drift of drifts) {
    const key = drift.type;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(drift);
  }

  // Category display names and colors
  const categoryConfig: Record<string, { label: string; color: ChalkInstance }> = {
    'hardcoded-value': { label: 'HARDCODED VALUES', color: chalk.yellow },
    'naming-inconsistency': { label: 'NAMING', color: chalk.yellow },
    'semantic-mismatch': { label: 'TYPE MISMATCHES', color: chalk.yellow },
    'deprecated-pattern': { label: 'DEPRECATED', color: chalk.red },
    'orphaned-component': { label: 'ORPHANED', color: chalk.yellow },
    'orphaned-token': { label: 'ORPHANED TOKENS', color: chalk.yellow },
    'value-divergence': { label: 'VALUE DRIFT', color: chalk.yellow },
    'accessibility-conflict': { label: 'ACCESSIBILITY', color: chalk.red },
    'framework-sprawl': { label: 'FRAMEWORK SPRAWL', color: chalk.yellow },
    'missing-documentation': { label: 'MISSING DOCS', color: chalk.blue },
  };

  // Sort groups: critical severity types first
  const criticalTypes = ['accessibility-conflict', 'deprecated-pattern'];
  const sortedGroups = [...grouped.entries()].sort((a, b) => {
    const aIsCritical = criticalTypes.includes(a[0]);
    const bIsCritical = criticalTypes.includes(b[0]);
    if (aIsCritical && !bIsCritical) return -1;
    if (!aIsCritical && bIsCritical) return 1;
    return b[1].length - a[1].length; // Then by count
  });

  for (const [type, typeDrifts] of sortedGroups) {
    const config = categoryConfig[type] || { label: type.toUpperCase().replace(/-/g, ' '), color: chalk.yellow };

    lines.push(config.color.bold(`${config.label} (${typeDrifts.length})`));

    // Show up to 5 items per category
    const shown = typeDrifts.slice(0, 5);
    const remaining = typeDrifts.length - shown.length;

    shown.forEach((drift, i) => {
      const isLast = i === shown.length - 1 && remaining === 0;
      const prefix = isLast ? '└─' : '├─';

      // Extract file:line from location or use entity name
      const location = drift.source.location || drift.source.entityName;
      const parts = location.split(':');
      const file = parts[0] || drift.source.entityName;
      const lineNum = parts[1];
      const shortFile = file.length > 30 ? '...' + file.slice(-27) : file;
      const fileLoc = lineNum ? `${shortFile}:${lineNum}` : shortFile;

      // Build the issue description
      let issueText = '';

      if (drift.type === 'hardcoded-value') {
        // Extract the actual values and show concise suggestion
        const colorMatch = drift.message.match(/#[0-9a-fA-F]{3,8}/g);
        const sizeMatches = drift.message.match(/\d+px/g);

        if (colorMatch && colorMatch.length > 0) {
          // Show color value with token suggestion
          const colorVal = colorMatch[0];
          issueText = `${chalk.hex(colorVal)(colorVal)} → ${chalk.cyan('use var(--color-*)')}`;
        } else if (sizeMatches && sizeMatches.length > 0) {
          // Show size value with token suggestion
          const sizeVal = sizeMatches[0];
          issueText = `${chalk.dim(sizeVal)} → ${chalk.cyan('use var(--spacing-*)')}`;
        } else {
          // Generic hardcoded value
          issueText = chalk.dim('hardcoded value detected');
        }
      } else if (drift.type === 'accessibility-conflict') {
        // Extract key issue
        if (drift.message.includes('aria-label')) {
          issueText = 'Missing aria-label';
        } else if (drift.message.includes('focus')) {
          issueText = 'Focus trap not implemented';
        } else {
          issueText = drift.message.slice(0, 35);
        }
      } else if (drift.type === 'naming-inconsistency') {
        const suggestions = drift.details?.suggestions as string[] | undefined;
        if (suggestions?.[0]) {
          issueText = `→ rename to ${chalk.cyan(suggestions[0])}`;
        } else {
          issueText = 'Inconsistent naming';
        }
      } else if (drift.type === 'deprecated-pattern') {
        issueText = chalk.red('deprecated') + ' - migrate to new API';
      } else {
        // For other types, show a brief message
        const suggestions = drift.details?.suggestions as string[] | undefined;
        if (suggestions?.[0]) {
          issueText = `→ ${suggestions[0].slice(0, 30)}`;
        } else {
          issueText = drift.message.slice(0, 35);
        }
      }

      lines.push(chalk.dim(prefix) + ' ' + chalk.white(fileLoc) + ' ' + issueText);
    });

    if (remaining > 0) {
      lines.push(chalk.dim('└─ ... and ' + remaining + ' more'));
    }

    lines.push('');
  }

  // Footer
  lines.push(chalk.dim('Add to CI to catch drift on every PR'));

  return lines.join('\n');
}

// Format as markdown
export function formatMarkdown(drifts: DriftSignal[]): string {
  if (drifts.length === 0) {
    return '# Drift Report\n\nNo drift detected.';
  }

  const lines: string[] = [];
  lines.push('# Drift Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  const critical = drifts.filter(d => d.severity === 'critical');
  const warning = drifts.filter(d => d.severity === 'warning');
  const info = drifts.filter(d => d.severity === 'info');

  const formatDriftMarkdown = (drift: DriftSignal) => {
    lines.push(`### ${drift.source.entityName}`);
    lines.push(`- **Type:** ${formatDriftType(drift.type)}`);
    if (drift.source.location) {
      lines.push(`- **Location:** \`${drift.source.location}\``);
    }
    lines.push(`- **Issue:** ${drift.message}`);

    if (drift.details.expected !== undefined && drift.details.actual !== undefined) {
      lines.push(`- **Expected:** ${drift.details.expected}`);
      lines.push(`- **Actual:** ${drift.details.actual}`);
    }

    if (drift.details.relatedComponents && drift.details.relatedComponents.length > 0) {
      lines.push(`- **Related:** ${drift.details.relatedComponents.join(', ')}`);
    }

    const actions = getActionItems(drift);
    if (actions.length > 0) {
      lines.push('');
      lines.push('**Actions:**');
      for (let i = 0; i < actions.length; i++) {
        lines.push(`${i + 1}. ${actions[i]}`);
      }
    }
    lines.push('');
  };

  if (critical.length > 0) {
    lines.push('## Critical');
    lines.push('');
    for (const drift of critical) {
      formatDriftMarkdown(drift);
    }
  }

  if (warning.length > 0) {
    lines.push('## Warnings');
    lines.push('');
    for (const drift of warning) {
      formatDriftMarkdown(drift);
    }
  }

  if (info.length > 0) {
    lines.push('## Info');
    lines.push('');
    for (const drift of info) {
      formatDriftMarkdown(drift);
    }
  }

  return lines.join('\n');
}
