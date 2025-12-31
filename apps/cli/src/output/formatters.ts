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

// Format drift type for display
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
