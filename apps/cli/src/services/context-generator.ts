/**
 * Context Generator Service
 *
 * Generates design system context for CLAUDE.md files.
 * Helps AI agents understand and follow design system rules.
 */

import type { Component, DesignToken, DriftSignal } from '@buoy-design/core';

export type DetailLevel = 'minimal' | 'standard' | 'comprehensive';

export interface ContextGeneratorOptions {
  projectName?: string;
  detailLevel?: DetailLevel;
  includeTokens?: boolean;
  includeComponents?: boolean;
  includeAntiPatterns?: boolean;
  includeValidation?: boolean;
}

export interface ContextData {
  tokens: DesignToken[];
  components: Component[];
  drifts?: DriftSignal[];
  projectName: string;
}

export interface ContextGeneratorResult {
  content: string;
  stats: {
    tokenCount: number;
    componentCount: number;
    antiPatternCount: number;
  };
}

/**
 * Generate design system context for CLAUDE.md
 */
export function generateContext(
  data: ContextData,
  options: ContextGeneratorOptions = {}
): ContextGeneratorResult {
  const {
    detailLevel = 'standard',
    includeTokens = true,
    includeComponents = true,
    includeAntiPatterns = true,
    includeValidation = true,
  } = options;

  const sections: string[] = [];
  let antiPatternCount = 0;

  // Header
  sections.push(generateHeader(data.projectName));

  // Component Usage
  if (includeComponents && data.components.length > 0) {
    sections.push(generateComponentSection(data.components, detailLevel));
  }

  // Token Requirements
  if (includeTokens && data.tokens.length > 0) {
    sections.push(generateTokenSection(data.tokens, detailLevel));
  }

  // Anti-Patterns
  if (includeAntiPatterns) {
    const antiPatterns = generateAntiPatternSection(data.drifts || [], detailLevel);
    if (antiPatterns) {
      sections.push(antiPatterns);
      antiPatternCount = (data.drifts || []).length;
    }
  }

  // Validation
  if (includeValidation) {
    sections.push(generateValidationSection());
  }

  return {
    content: sections.join('\n\n'),
    stats: {
      tokenCount: data.tokens.length,
      componentCount: data.components.length,
      antiPatternCount,
    },
  };
}

/**
 * Generate context header
 */
function generateHeader(projectName: string): string {
  return `## Design System Rules

This project uses the ${projectName} Design System. Follow these rules when generating code:`;
}

/**
 * Generate component usage section
 */
function generateComponentSection(
  components: Component[],
  detailLevel: DetailLevel
): string {
  const lines: string[] = ['### Component Usage'];
  lines.push('');

  // Group by framework
  const byFramework = groupByFramework(components);
  const frameworks = Object.keys(byFramework);

  if (frameworks.length === 1) {
    const framework = frameworks[0]!;
    const comps = byFramework[framework]!;
    lines.push(`Use components from your ${framework} component library. Check before creating new ones:`);
    lines.push('');
    lines.push(formatComponentList(comps, detailLevel));
  } else {
    lines.push('Use existing components from your component libraries:');
    lines.push('');
    for (const framework of frameworks) {
      const comps = byFramework[framework]!;
      lines.push(`**${capitalize(framework)}:** ${formatComponentList(comps, detailLevel)}`);
    }
  }

  if (detailLevel !== 'minimal') {
    lines.push('');
    lines.push('See full inventory: `buoy sweep --components`');
  }

  return lines.join('\n');
}

/**
 * Generate token requirements section
 */
function generateTokenSection(
  tokens: DesignToken[],
  detailLevel: DetailLevel
): string {
  const lines: string[] = ['### Token Requirements'];
  lines.push('');
  lines.push('**NEVER hardcode these values:**');

  // Group tokens by category
  const byCategory = groupByCategory(tokens);

  if (byCategory.color && byCategory.color.length > 0) {
    lines.push(`- Colors: Use design tokens or utility classes`);
  }
  if (byCategory.spacing && byCategory.spacing.length > 0) {
    lines.push(`- Spacing: Use spacing scale tokens`);
  }
  if (byCategory.typography && byCategory.typography.length > 0) {
    lines.push(`- Typography: Use font tokens`);
  }

  // Quick reference for standard/comprehensive
  if (detailLevel !== 'minimal') {
    lines.push('');
    lines.push('**Quick Reference:**');

    // Show sample tokens
    if (byCategory.color) {
      const samples = byCategory.color.slice(0, 3);
      for (const token of samples) {
        const value = formatTokenValue(token);
        lines.push(`- ${token.name}: ${value}`);
      }
    }

    if (byCategory.spacing) {
      const spacingValues = byCategory.spacing
        .map((t) => formatTokenValue(t))
        .slice(0, 8)
        .join(', ');
      lines.push(`- Spacing scale: ${spacingValues}`);
    }
  }

  // Comprehensive: show all tokens
  if (detailLevel === 'comprehensive') {
    lines.push('');
    lines.push('**All Tokens:**');
    lines.push('');
    lines.push('| Token | Value | Category |');
    lines.push('|-------|-------|----------|');
    for (const token of tokens.slice(0, 50)) {
      const value = formatTokenValue(token);
      lines.push(`| \`${token.name}\` | ${value} | ${token.category} |`);
    }
    if (tokens.length > 50) {
      lines.push(`| ... | ${tokens.length - 50} more tokens | ... |`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate anti-patterns section
 */
function generateAntiPatternSection(
  drifts: DriftSignal[],
  detailLevel: DetailLevel
): string | null {
  const lines: string[] = ['### Anti-Patterns'];
  lines.push('');
  lines.push('AVOID:');

  // Common anti-patterns always included
  const commonAntiPatterns = [
    '- `<div onClick>` - Use `<Button>` or semantic elements',
    '- Inline styles for colors/spacing - Use tokens or classes',
    '- Creating component variants that already exist',
    '- Arbitrary values (e.g., `p-[13px]`) - Use scale values',
  ];

  lines.push(...commonAntiPatterns);

  // Add project-specific anti-patterns from drift signals
  if (detailLevel !== 'minimal' && drifts.length > 0) {
    const hardcodedTypes = new Set<string>();

    for (const drift of drifts) {
      if (drift.type === 'hardcoded-value') {
        // Extract the type of hardcoded value
        const typeMatch = drift.message.match(/hardcoded (color|spacing|font|radius)/i);
        if (typeMatch) {
          hardcodedTypes.add(typeMatch[1]!.toLowerCase());
        }
      }
    }

    if (hardcodedTypes.size > 0) {
      lines.push('');
      lines.push('**Detected issues in this codebase:**');
      for (const type of hardcodedTypes) {
        lines.push(`- Hardcoded ${type} values found - use tokens instead`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Generate validation section
 */
function generateValidationSection(): string {
  return `### Validation

Run before committing:
\`\`\`bash
buoy check          # Quick validation
buoy drift check    # Detailed drift analysis
buoy fix --dry-run  # See suggested fixes
\`\`\``;
}

// Helper functions

function groupByFramework(components: Component[]): Record<string, Component[]> {
  const groups: Record<string, Component[]> = {};
  for (const comp of components) {
    const framework = comp.source.type;
    if (!groups[framework]) {
      groups[framework] = [];
    }
    groups[framework]!.push(comp);
  }
  return groups;
}

function groupByCategory(tokens: DesignToken[]): Record<string, DesignToken[]> {
  const groups: Record<string, DesignToken[]> = {};
  for (const token of tokens) {
    if (!groups[token.category]) {
      groups[token.category] = [];
    }
    groups[token.category]!.push(token);
  }
  return groups;
}

function formatComponentList(components: Component[], detailLevel: DetailLevel): string {
  const names = [...new Set(components.map((c) => c.name))].sort();

  if (detailLevel === 'minimal') {
    return names.slice(0, 10).join(', ') + (names.length > 10 ? '...' : '');
  }

  if (detailLevel === 'standard') {
    return names.slice(0, 20).join(', ') + (names.length > 20 ? ` (+${names.length - 20} more)` : '');
  }

  // Comprehensive
  return names.join(', ');
}

function formatTokenValue(token: DesignToken): string {
  const value = token.value;

  if (value.type === 'color') {
    return value.hex;
  }

  if (value.type === 'spacing') {
    return `${value.value}${value.unit}`;
  }

  if (value.type === 'typography') {
    return `${value.fontFamily} ${value.fontSize}`;
  }

  if (value.type === 'raw') {
    return String(value.value);
  }

  return '(complex)';
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Generate minimal context (for quick reference)
 */
export function generateMinimalContext(data: ContextData): string {
  return generateContext(data, { detailLevel: 'minimal' }).content;
}

/**
 * Generate comprehensive context (for full documentation)
 */
export function generateComprehensiveContext(data: ContextData): string {
  return generateContext(data, { detailLevel: 'comprehensive' }).content;
}
