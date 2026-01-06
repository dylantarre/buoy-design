/**
 * SkillExportService - Generate design system skills for AI agents
 *
 * Exports tokens, components, patterns, and anti-patterns as markdown files
 * optimized for progressive disclosure in AI agent workflows.
 */

import type { Component, DesignToken, DriftSignal } from '@buoy-design/core';
import { join } from 'path';

export interface SkillExportOptions {
  /** Sections to include in export */
  sections: string[];
  /** Output directory path */
  outputPath: string;
}

export interface ScanData {
  tokens: DesignToken[];
  components: Component[];
  drifts: DriftSignal[];
  projectName: string;
}

export interface SkillExportResult {
  /** Files to write */
  files: Array<{ path: string; content: string }>;
  /** Statistics about exported content */
  stats: {
    tokens: {
      colors: number;
      spacing: number;
      typography: number;
      total: number;
    };
    components: number;
    patterns: string[];
  };
}

/**
 * Service for exporting design system data as AI agent skills
 */
export class SkillExportService {
  constructor(_projectName: string) {
    // Project name is passed for future extensibility but currently
    // derived from ScanData.projectName in export()
  }

  /**
   * Export design system data as skill files
   */
  async export(
    data: ScanData,
    options: SkillExportOptions
  ): Promise<SkillExportResult> {
    const files: Array<{ path: string; content: string }> = [];
    const { sections, outputPath } = options;

    // Always include SKILL.md
    files.push({
      path: join(outputPath, 'SKILL.md'),
      content: this.generateSkillMd(data),
    });

    // Tokens section
    if (sections.includes('tokens')) {
      files.push({
        path: join(outputPath, 'tokens', '_index.md'),
        content: this.generateTokensIndex(data.tokens),
      });
      files.push({
        path: join(outputPath, 'tokens', 'colors.md'),
        content: this.generateColorTokens(data.tokens),
      });
      files.push({
        path: join(outputPath, 'tokens', 'spacing.md'),
        content: this.generateSpacingTokens(data.tokens),
      });
      files.push({
        path: join(outputPath, 'tokens', 'typography.md'),
        content: this.generateTypographyTokens(data.tokens),
      });
    }

    // Components section
    if (sections.includes('components')) {
      files.push({
        path: join(outputPath, 'components', '_inventory.md'),
        content: this.generateComponentInventory(data.components),
      });
    }

    // Patterns section
    if (sections.includes('patterns')) {
      files.push({
        path: join(outputPath, 'patterns', '_common.md'),
        content: this.generatePatternsIndex(data.components),
      });
    }

    // Anti-patterns section
    if (sections.includes('anti-patterns')) {
      files.push({
        path: join(outputPath, 'anti-patterns', '_avoid.md'),
        content: this.generateAntiPatterns(data.drifts),
      });
    }

    // Calculate stats
    const colorTokens = data.tokens.filter((t) => t.category === 'color');
    const spacingTokens = data.tokens.filter((t) => t.category === 'spacing');
    const typographyTokens = data.tokens.filter(
      (t) => t.category === 'typography'
    );

    const detectedPatterns = this.detectPatterns(data.components);

    return {
      files,
      stats: {
        tokens: {
          colors: colorTokens.length,
          spacing: spacingTokens.length,
          typography: typographyTokens.length,
          total: data.tokens.length,
        },
        components: data.components.length,
        patterns: detectedPatterns,
      },
    };
  }

  /**
   * Generate the main SKILL.md entry point
   */
  generateSkillMd(data: ScanData): string {
    const hasTokens = data.tokens.length > 0;
    const hasComponents = data.components.length > 0;

    const rules: string[] = [];
    if (hasTokens) {
      const hasColors = data.tokens.some((t) => t.category === 'color');
      const hasSpacing = data.tokens.some((t) => t.category === 'spacing');
      const hasTypography = data.tokens.some((t) => t.category === 'typography');

      if (hasColors) {
        rules.push(
          '1. NEVER hardcode colors - use tokens from `tokens/colors.md`'
        );
      }
      if (hasSpacing) {
        rules.push(
          '2. NEVER use arbitrary spacing - use scale from `tokens/spacing.md`'
        );
      }
      if (hasTypography) {
        rules.push(
          '3. NEVER hardcode fonts - use tokens from `tokens/typography.md`'
        );
      }
    }
    if (hasComponents) {
      rules.push(
        `${rules.length + 1}. NEVER create new components without checking \`components/_inventory.md\` first`
      );
    }

    return `---
name: design-system
description: Use when building UI components, styling, or layouts for ${data.projectName}
triggers:
  - building UI
  - styling components
  - adding colors
  - creating layouts
  - form design
  - component creation
---

# ${data.projectName} Design System

This skill provides design system context for AI code generation.

## Quick Start

${hasComponents ? '1. **Before generating UI code**, check `components/_inventory.md`' : ''}
${hasTokens ? '2. **For styling**, use tokens from `tokens/_index.md`' : ''}
3. **For patterns**, see \`patterns/_common.md\`

## Rules

${rules.length > 0 ? rules.join('\n') : 'No specific rules defined yet.'}

## Progressive Loading

- Start with \`_index.md\` files for quick reference
- Load specific files when you need details
- The \`anti-patterns/_avoid.md\` file lists what NEVER to do

## Feedback Loop

If you create something not in the design system:
1. Check if a similar component exists
2. If truly new, flag for design system team review
3. Use closest existing pattern as base

## Validation

Run \`buoy check\` before committing to validate compliance.

\`\`\`bash
buoy check           # Quick validation
buoy drift check     # Detailed drift analysis
\`\`\`
`;
  }

  /**
   * Generate tokens index with category counts
   */
  generateTokensIndex(tokens: DesignToken[]): string {
    if (tokens.length === 0) {
      return `# Design Tokens

No tokens detected in this project.

Run \`buoy sweep\` to detect tokens from your codebase.
`;
    }

    const colorCount = tokens.filter((t) => t.category === 'color').length;
    const spacingCount = tokens.filter((t) => t.category === 'spacing').length;
    const typographyCount = tokens.filter(
      (t) => t.category === 'typography'
    ).length;
    const otherCount = tokens.length - colorCount - spacingCount - typographyCount;

    const categories: string[] = [];
    if (colorCount > 0) {
      categories.push(`| Color | ${colorCount} | [colors.md](./colors.md) |`);
    }
    if (spacingCount > 0) {
      categories.push(
        `| Spacing | ${spacingCount} | [spacing.md](./spacing.md) |`
      );
    }
    if (typographyCount > 0) {
      categories.push(
        `| Typography | ${typographyCount} | [typography.md](./typography.md) |`
      );
    }
    if (otherCount > 0) {
      categories.push(`| Other | ${otherCount} | - |`);
    }

    return `# Design Tokens

Quick reference for all design tokens in this project.

## Categories

| Category | Count | Details |
|----------|-------|---------|
${categories.join('\n')}

## Usage

Always use tokens instead of hardcoded values:

\`\`\`tsx
// Bad
<div style={{ color: '#2563EB' }}>...</div>

// Good
<div className="text-primary">...</div>
\`\`\`

See individual files for complete token lists with usage guidance.
`;
  }

  /**
   * Generate color tokens markdown
   */
  generateColorTokens(tokens: DesignToken[]): string {
    const colorTokens = tokens.filter((t) => t.category === 'color');

    if (colorTokens.length === 0) {
      return `# Color Tokens

No color tokens detected in this project.
`;
    }

    const rows = colorTokens.map((token) => {
      const value =
        token.value.type === 'color' ? token.value.hex : String(token.value);
      const usage = token.metadata?.description || 'General use';
      return `| \`${token.name}\` | ${value} | ${usage} |`;
    });

    return `# Color Tokens

## All Colors

| Token | Value | Usage |
|-------|-------|-------|
${rows.join('\n')}

## Usage Guidelines

- **Primary colors**: Use for main CTAs and brand elements
- **Semantic colors**: Use success/error/warning for feedback states
- **Neutral colors**: Use for text, backgrounds, and borders

## Common Mistakes

❌ Using hex values directly:
\`\`\`tsx
style={{ color: '#2563EB' }}
\`\`\`

✅ Using tokens:
\`\`\`tsx
className="text-primary"
// or
color={tokens.primary}
\`\`\`
`;
  }

  /**
   * Generate spacing tokens markdown
   */
  generateSpacingTokens(tokens: DesignToken[]): string {
    const spacingTokens = tokens.filter((t) => t.category === 'spacing');

    if (spacingTokens.length === 0) {
      return `# Spacing Tokens

No spacing tokens detected in this project.
`;
    }

    const rows = spacingTokens.map((token) => {
      let value = '';
      if (token.value.type === 'spacing') {
        value = `${token.value.value}${token.value.unit}`;
      }
      const usage = token.metadata?.description || 'General spacing';
      return `| \`${token.name}\` | ${value} | ${usage} |`;
    });

    return `# Spacing Tokens

## Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
${rows.join('\n')}

## Usage Guidelines

- Use consistent spacing from the scale
- Avoid arbitrary values like \`17px\` or \`13px\`
- Prefer spacing utilities over inline styles

## Common Mistakes

❌ Arbitrary spacing:
\`\`\`tsx
style={{ padding: '17px' }}
className="p-[13px]"
\`\`\`

✅ Scale-based spacing:
\`\`\`tsx
className="p-4"
style={{ padding: tokens.space4 }}
\`\`\`
`;
  }

  /**
   * Generate typography tokens markdown
   */
  generateTypographyTokens(tokens: DesignToken[]): string {
    const typographyTokens = tokens.filter((t) => t.category === 'typography');

    if (typographyTokens.length === 0) {
      return `# Typography Tokens

No typography tokens detected in this project.
`;
    }

    const rows = typographyTokens.map((token) => {
      let value = '';
      if (token.value.type === 'typography') {
        value = `${token.value.fontFamily}, ${token.value.fontSize}px, ${token.value.fontWeight}`;
      }
      return `| \`${token.name}\` | ${value} |`;
    });

    return `# Typography Tokens

## Font Definitions

| Token | Value |
|-------|-------|
${rows.join('\n')}

## Usage Guidelines

- Use typography tokens for consistent text styling
- Avoid hardcoding font families or sizes
- Prefer text utility classes

## Common Mistakes

❌ Hardcoded fonts:
\`\`\`tsx
style={{ fontFamily: 'Inter', fontSize: '16px' }}
\`\`\`

✅ Typography tokens:
\`\`\`tsx
className="text-body"
// or
style={{ ...tokens.textBody }}
\`\`\`
`;
  }

  /**
   * Generate component inventory markdown
   */
  generateComponentInventory(components: Component[]): string {
    if (components.length === 0) {
      return `# Component Inventory

No components detected in this project.

Run \`buoy sweep\` to detect components from your codebase.
`;
    }

    const rows = components.map((comp) => {
      const props = comp.props.map((p) => p.name).join(', ') || '-';
      // Handle different source types - some have path, some have other identifiers
      let path = '-';
      if ('path' in comp.source) {
        path = comp.source.path;
      } else if (comp.source.type === 'figma') {
        path = `Figma: ${comp.source.fileKey}`;
      } else if (comp.source.type === 'storybook') {
        path = `Storybook: ${comp.source.storyId}`;
      }
      return `| \`${comp.name}\` | ${path} | ${props} |`;
    });

    return `# Component Inventory

${components.length} components available in this design system.

## All Components

| Component | Path | Props |
|-----------|------|-------|
${rows.join('\n')}

## Usage Guidelines

1. **Check this inventory first** before creating a new component
2. Use existing components when possible
3. Extend existing components rather than duplicating

## Before Creating New Components

Ask yourself:
- Does a similar component already exist?
- Can an existing component be extended?
- Will this component be reused elsewhere?
`;
  }

  /**
   * Generate patterns index based on component names
   */
  generatePatternsIndex(components: Component[]): string {
    const patterns = this.detectPatterns(components);

    if (patterns.length === 0) {
      return `# Common Patterns

No specific patterns detected yet.

As your design system grows, patterns will be detected from:
- Component naming conventions
- Common component groupings
- Usage patterns
`;
    }

    const patternSections = patterns
      .map((pattern) => {
        const relatedComponents = this.getComponentsForPattern(
          pattern,
          components
        );
        const componentList = relatedComponents
          .map((c) => `- \`${c.name}\``)
          .join('\n');

        return `## ${this.capitalizePattern(pattern)} Pattern

${componentList}
`;
      })
      .join('\n');

    return `# Common Patterns

Detected patterns based on component organization.

${patternSections}

## Using Patterns

When building features, look for existing patterns first.
Patterns help maintain consistency across the codebase.
`;
  }

  /**
   * Generate anti-patterns from drift signals
   */
  generateAntiPatterns(drifts: DriftSignal[]): string {
    if (drifts.length === 0) {
      return `# Anti-Patterns

No known anti-patterns detected. Your codebase is clean!

## General Guidelines

Even without detected issues, avoid:
- Hardcoded color values
- Arbitrary spacing values
- Inline styles for design tokens
- Creating components that duplicate existing ones
`;
    }

    // Group by drift type
    const byType = new Map<string, DriftSignal[]>();
    for (const drift of drifts) {
      const existing = byType.get(drift.type) || [];
      existing.push(drift);
      byType.set(drift.type, existing);
    }

    const sections: string[] = [];
    for (const [type, typeDrifts] of byType) {
      const severity = typeDrifts[0]?.severity || 'warning';
      const severityBadge =
        severity === 'critical'
          ? '🔴 Critical'
          : severity === 'warning'
            ? '🟡 Warning'
            : '🔵 Info';

      const examples = typeDrifts
        .slice(0, 3)
        .map((d) => `- ${d.source.entityName}: ${d.message}`)
        .join('\n');

      sections.push(`## ${this.formatDriftType(type)}

${severityBadge}

${examples}
`);
    }

    return `# Anti-Patterns

These patterns have been detected as violations of the design system.

${sections.join('\n')}

## How to Fix

Run \`buoy check\` to see current violations with fix suggestions.
`;
  }

  /**
   * Detect patterns from component names
   */
  private detectPatterns(components: Component[]): string[] {
    const patterns: Set<string> = new Set();
    const names = components.map((c) => c.name.toLowerCase());

    // Form patterns
    if (
      names.some(
        (n) =>
          n.includes('form') ||
          n.includes('input') ||
          n.includes('select') ||
          n.includes('checkbox')
      )
    ) {
      patterns.add('form');
    }

    // Navigation patterns
    if (
      names.some(
        (n) =>
          n.includes('nav') ||
          n.includes('menu') ||
          n.includes('sidebar') ||
          n.includes('header')
      )
    ) {
      patterns.add('navigation');
    }

    // Card patterns
    if (names.some((n) => n.includes('card') || n.includes('tile'))) {
      patterns.add('card');
    }

    // Modal patterns
    if (
      names.some(
        (n) =>
          n.includes('modal') || n.includes('dialog') || n.includes('drawer')
      )
    ) {
      patterns.add('modal');
    }

    // Table patterns
    if (
      names.some(
        (n) =>
          n.includes('table') || n.includes('grid') || n.includes('list')
      )
    ) {
      patterns.add('data-display');
    }

    return Array.from(patterns);
  }

  /**
   * Get components that match a pattern
   */
  private getComponentsForPattern(
    pattern: string,
    components: Component[]
  ): Component[] {
    const keywords: Record<string, string[]> = {
      form: ['form', 'input', 'select', 'checkbox', 'radio', 'textarea'],
      navigation: ['nav', 'menu', 'sidebar', 'header', 'footer', 'link'],
      card: ['card', 'tile', 'panel'],
      modal: ['modal', 'dialog', 'drawer', 'overlay'],
      'data-display': ['table', 'grid', 'list', 'row', 'cell'],
    };

    const patternKeywords = keywords[pattern] || [];
    return components.filter((c) =>
      patternKeywords.some((k) => c.name.toLowerCase().includes(k))
    );
  }

  /**
   * Capitalize pattern name for display
   */
  private capitalizePattern(pattern: string): string {
    return pattern
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Format drift type for display
   */
  private formatDriftType(type: string): string {
    return type
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Generate condensed context for session hook injection
   * Contains all crucial info in a compact format (~500-1500 tokens)
   *
   * IMPORTANT: This is informative context, not a task list.
   * We tell Claude what TO DO, not what's currently broken.
   */
  generateCondensedContext(data: ScanData): string {
    const lines: string[] = [];

    lines.push(`# ${data.projectName} Design System`);
    lines.push('');
    lines.push('This context helps you write code that follows the design system.');
    lines.push('');

    // Components - compact list
    if (data.components.length > 0) {
      lines.push('## Available Components');
      lines.push('Check these before creating new components:');
      for (const comp of data.components.slice(0, 30)) {
        const props = comp.props.slice(0, 5).map(p => p.name).join(', ');
        lines.push(`- \`${comp.name}\`${props ? ` (${props})` : ''}`);
      }
      if (data.components.length > 30) {
        lines.push(`- ... and ${data.components.length - 30} more`);
      }
      lines.push('');
    }

    // Tokens - grouped and compact
    if (data.tokens.length > 0) {
      lines.push('## Design Tokens');
      lines.push('Use these instead of hardcoded values:');
      lines.push('');

      const colorTokens = data.tokens.filter(t => t.category === 'color');
      const spacingTokens = data.tokens.filter(t => t.category === 'spacing');
      const typographyTokens = data.tokens.filter(t => t.category === 'typography');

      if (colorTokens.length > 0) {
        lines.push('**Colors:**');
        for (const token of colorTokens.slice(0, 20)) {
          const value = token.value.type === 'color' ? token.value.hex : String(token.value);
          lines.push(`- \`${token.name}\` = ${value}`);
        }
        if (colorTokens.length > 20) {
          lines.push(`- ... and ${colorTokens.length - 20} more`);
        }
        lines.push('');
      }

      if (spacingTokens.length > 0) {
        lines.push('**Spacing:**');
        for (const token of spacingTokens.slice(0, 15)) {
          let value = '';
          if (token.value.type === 'spacing') {
            value = `${token.value.value}${token.value.unit}`;
          }
          lines.push(`- \`${token.name}\` = ${value}`);
        }
        if (spacingTokens.length > 15) {
          lines.push(`- ... and ${spacingTokens.length - 15} more`);
        }
        lines.push('');
      }

      if (typographyTokens.length > 0) {
        lines.push('**Typography:**');
        for (const token of typographyTokens.slice(0, 10)) {
          let value = '';
          if (token.value.type === 'typography') {
            value = `${token.value.fontFamily}, ${token.value.fontSize}px`;
          }
          lines.push(`- \`${token.name}\` = ${value}`);
        }
        if (typographyTokens.length > 10) {
          lines.push(`- ... and ${typographyTokens.length - 10} more`);
        }
        lines.push('');
      }
    }

    // Guidelines - what to do (not what's broken)
    lines.push('## Guidelines');
    lines.push('When writing UI code:');
    if (data.components.length > 0) {
      lines.push('- Use existing components from the list above');
      lines.push('- Extend existing components rather than duplicating');
    }
    if (data.tokens.length > 0) {
      lines.push('- Use design tokens for colors, spacing, typography');
      lines.push('- Never hardcode values that have token equivalents');
    }
    lines.push('');
    lines.push('To validate compliance: `buoy check`');

    return lines.join('\n');
  }
}
