import chalk from 'chalk';
import { ProjectDetector, type DetectedProject } from '../detect/project-detector.js';

const FRAMEWORK_FAMILIES = {
  react: ['react', 'nextjs', 'remix', 'gatsby'],
  vue: ['vue', 'nuxt'],
  svelte: ['svelte', 'sveltekit'],
  angular: ['angular'],
  webcomponents: ['lit', 'stencil'],
} as const;

const MAX_SUGGESTIONS = 3;

export interface ProjectInsights {
  project: DetectedProject;
  summary: InsightSummary;
  suggestions: Suggestion[];
}

export interface InsightSummary {
  frameworkLine: string;
  fileBreakdown: FileBreakdown[];
  tokenSummary: string | null;
  scannerStatus: ScannerStatus[];
}

export interface FileBreakdown {
  type: string;
  count: number;
  path: string;
  scannable: boolean;
}

export interface ScannerStatus {
  name: string;
  available: boolean;
  reason: string;
}

export interface Suggestion {
  command: string;
  description: string;
  reason: string;
}

export async function discoverProject(cwd: string = process.cwd()): Promise<ProjectInsights> {
  const detector = new ProjectDetector(cwd);
  const project = await detector.detect();

  const summary = buildSummary(project);
  const suggestions = buildSuggestions(project, summary);

  return { project, summary, suggestions };
}

function buildSummary(project: DetectedProject): InsightSummary {
  let frameworkLine = 'Unknown project type';
  if (project.frameworks.length > 0) {
    const primary = project.frameworks[0]!;
    const ts = primary.typescript ? ' + TypeScript' : '';
    const version = primary.version !== 'unknown' ? ` ${primary.version}` : '';
    frameworkLine = `${capitalize(primary.name)}${ts}${version}`;
  }

  // Determine which component types are scannable based on detected frameworks
  const hasReact = project.frameworks.some(f => FRAMEWORK_FAMILIES.react.includes(f.name as typeof FRAMEWORK_FAMILIES.react[number]));
  const hasVue = project.frameworks.some(f => FRAMEWORK_FAMILIES.vue.includes(f.name as typeof FRAMEWORK_FAMILIES.vue[number]));
  const hasSvelte = project.frameworks.some(f => FRAMEWORK_FAMILIES.svelte.includes(f.name as typeof FRAMEWORK_FAMILIES.svelte[number]));
  const hasAngular = project.frameworks.some(f => FRAMEWORK_FAMILIES.angular.includes(f.name as typeof FRAMEWORK_FAMILIES.angular[number]));
  const hasWebComponents = project.frameworks.some(f => FRAMEWORK_FAMILIES.webcomponents.includes(f.name as typeof FRAMEWORK_FAMILIES.webcomponents[number]));
  const hasAstro = project.frameworks.some(f => f.name === 'astro');

  const scannableTypes = new Set<string>();
  if (hasReact) { scannableTypes.add('jsx'); scannableTypes.add('tsx'); }
  if (hasVue) scannableTypes.add('vue');
  if (hasSvelte) scannableTypes.add('svelte');
  if (hasAngular) scannableTypes.add('angular');

  const fileBreakdown: FileBreakdown[] = [];
  for (const loc of project.components) {
    fileBreakdown.push({
      type: getTypeLabel(loc.type),
      count: loc.fileCount,
      path: loc.path,
      scannable: scannableTypes.has(loc.type || ''),
    });
  }

  let tokenSummary: string | null = null;
  if (project.tokens.length > 0) {
    const cssTokens = project.tokens.filter(t => t.type === 'css' || t.type === 'scss');
    const hasCss = cssTokens.length > 0;
    const hasTailwind = project.tokens.some(t => t.type === 'tailwind');

    const parts: string[] = [];
    if (hasTailwind) parts.push('Tailwind config');
    if (hasCss) parts.push(`${cssTokens.length} CSS file(s)`);
    tokenSummary = parts.join(', ');
  }

  const scannerStatus: ScannerStatus[] = [];

  if (hasReact) scannerStatus.push({ name: 'React', available: true, reason: 'React detected' });
  if (hasVue) scannerStatus.push({ name: 'Vue', available: true, reason: 'Vue detected' });
  if (hasSvelte) scannerStatus.push({ name: 'Svelte', available: true, reason: 'Svelte detected' });
  if (hasAngular) scannerStatus.push({ name: 'Angular', available: true, reason: 'Angular detected' });

  if (hasAstro) scannerStatus.push({ name: 'Astro', available: false, reason: 'Astro scanner coming soon' });
  if (hasWebComponents) scannerStatus.push({ name: 'Lit', available: false, reason: 'Lit scanner coming soon' });

  const hasTailwindDs = project.designSystem?.type === 'tailwind' || project.tokens.some(t => t.type === 'tailwind');
  if (hasTailwindDs) {
    scannerStatus.push({ name: 'Tailwind', available: true, reason: 'Tailwind config found' });
  }

  return { frameworkLine, fileBreakdown, tokenSummary, scannerStatus };
}

function buildSuggestions(project: DetectedProject, summary: InsightSummary): Suggestion[] {
  const suggestions: Suggestion[] = [];

  const hasUnscannable = summary.fileBreakdown.some(f => !f.scannable && f.count > 0);
  const hasScannable = summary.fileBreakdown.some(f => f.scannable && f.count > 0);

  // Always suggest tokens as a starting point - it works on any codebase
  suggestions.push({
    command: 'buoy tokens',
    description: 'Extract design values from your code into tokens',
    reason: 'Works on any codebase - analyzes CSS, inline styles, and more',
  });

  // If there are token sources already, prioritize showing them
  if (project.tokens.length > 0) {
    suggestions.push({
      command: 'buoy show tokens',
      description: 'View existing design tokens',
      reason: `Found ${project.tokens.length} token source(s)`,
    });
  }

  // If component scanning isn't available, explain why
  if (hasUnscannable && !hasScannable) {
    suggestions.push({
      command: 'buoy drift',
      description: 'Check for hardcoded values that should be tokens',
      reason: 'Component prop scanning not yet available for your framework',
    });
  }

  return suggestions;
}

function getTypeLabel(type: string | undefined): string {
  const labels: Record<string, string> = {
    jsx: 'React components',
    tsx: 'React components',
    vue: 'Vue components',
    svelte: 'Svelte components',
    angular: 'Angular components',
    astro: 'Astro components',
    lit: 'Lit elements',
    blade: 'Blade templates',
    erb: 'ERB templates',
    twig: 'Twig templates',
    svg: 'SVG components',
  };
  return labels[type || ''] || `${type || 'Unknown'} files`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Format insights for CLI display.
 * Used by commands when primary results are empty.
 */
export function formatInsightsBlock(insights: ProjectInsights): string {
  const lines: string[] = [];
  const { summary, suggestions } = insights;

  // Header
  lines.push(chalk.bold('Your Codebase at a Glance'));
  lines.push(chalk.dim('─'.repeat(30)));
  lines.push('');

  // Framework
  lines.push(`  Framework:  ${chalk.cyan(summary.frameworkLine)}`);

  // File breakdown
  if (summary.fileBreakdown.length > 0) {
    lines.push('');
    lines.push('  ' + chalk.dim('Files found:'));
    for (const fb of summary.fileBreakdown) {
      const icon = fb.scannable ? chalk.green('✓') : chalk.yellow('○');
      const scanNote = fb.scannable ? '' : chalk.dim(' (no scanner yet)');
      lines.push(`    ${icon} ${fb.count} ${fb.type} in ${fb.path}${scanNote}`);
    }
  }

  // Token summary
  if (summary.tokenSummary) {
    lines.push('');
    lines.push(`  Tokens:     ${summary.tokenSummary}`);
  }

  // Scanner status
  const unavailable = summary.scannerStatus.filter(s => !s.available);
  if (unavailable.length > 0) {
    lines.push('');
    lines.push('  ' + chalk.dim('Scanner status:'));
    for (const s of unavailable) {
      lines.push(`    ${chalk.yellow('○')} ${s.name}: ${chalk.dim(s.reason)}`);
    }
  }

  // Suggestions
  if (suggestions.length > 0) {
    lines.push('');
    lines.push(chalk.dim('─'.repeat(30)));
    lines.push('');
    lines.push('  ' + chalk.bold('Try instead:'));
    for (const s of suggestions.slice(0, MAX_SUGGESTIONS)) {
      lines.push(`    ${chalk.cyan(s.command)}`);
      lines.push(`    ${chalk.dim(s.description)}`);
      lines.push('');
    }
    if (suggestions.length > MAX_SUGGESTIONS) {
      const remaining = suggestions.length - MAX_SUGGESTIONS;
      lines.push(`  ${chalk.dim(`...and ${remaining} more suggestion${remaining === 1 ? '' : 's'}`)}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Format a compact one-line summary for headers.
 */
export function formatInsightsSummaryLine(insights: ProjectInsights): string {
  const { summary } = insights;
  const fileCount = summary.fileBreakdown.reduce((sum, fb) => sum + fb.count, 0);
  if (fileCount === 0) {
    return summary.frameworkLine;
  }
  return `${summary.frameworkLine} · ${fileCount} files`;
}
