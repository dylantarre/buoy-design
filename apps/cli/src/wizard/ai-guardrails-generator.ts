/**
 * AI Guardrails setup wizard.
 *
 * Helps users set up AI-friendly design system context:
 * - Skill export for Claude Code
 * - CLAUDE.md context generation
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { showMenu, sectionHeader, success, info, bulletList } from './menu.js';
import { ScanOrchestrator } from '../scan/orchestrator.js';
import type { BuoyConfig } from '../config/schema.js';
import {
  generateContext,
  type ContextData,
} from '../services/context-generator.js';

type AIGuardrailsAction = 'skill' | 'context' | 'both' | 'skip';

interface AIGuardrailsResult {
  skillExported: boolean;
  contextGenerated: boolean;
  skillPath?: string;
  contextPath?: string;
}

/**
 * Run the AI guardrails setup wizard.
 */
export async function setupAIGuardrails(
  cwd: string,
  config: BuoyConfig
): Promise<AIGuardrailsResult> {
  sectionHeader('Set up AI Guardrails');

  info('Help AI coding tools understand your design system.');
  console.log('');

  info('Available options:');
  bulletList([
    'Export as a skill for Claude Code',
    'Generate context for CLAUDE.md',
  ]);
  console.log('');

  // Check existing state
  const skillExists = existsSync(join(cwd, '.claude', 'skills', 'design-system', 'SKILL.md'));
  const claudeMdExists = existsSync(join(cwd, 'CLAUDE.md'));
  const hasDesignSystemSection = claudeMdExists &&
    readFileSync(join(cwd, 'CLAUDE.md'), 'utf-8').includes('## Design System Rules');

  if (skillExists) {
    info(`${chalk.dim('Skill already exported at .claude/skills/design-system/')}`);
  }
  if (hasDesignSystemSection) {
    info(`${chalk.dim('CLAUDE.md already has design system context')}`);
  }

  const action = await showMenu<AIGuardrailsAction>('What would you like to set up?', [
    { label: 'Both (recommended)', value: 'both' },
    { label: 'Export skill only', value: 'skill' },
    { label: 'Generate CLAUDE.md context only', value: 'context' },
    { label: 'Skip for now', value: 'skip' },
  ]);

  if (action === 'skip') {
    return { skillExported: false, contextGenerated: false };
  }

  const result: AIGuardrailsResult = {
    skillExported: false,
    contextGenerated: false,
  };

  // Run scan to get tokens and components
  info('Scanning design system...');
  const orchestrator = new ScanOrchestrator(config, cwd);
  const scanResult = await orchestrator.scan();

  // Get project name
  const projectName = await getProjectName(cwd);

  if (action === 'skill' || action === 'both') {
    const skillResult = await exportSkill(cwd, scanResult, projectName);
    result.skillExported = skillResult.created;
    result.skillPath = skillResult.path;
  }

  if (action === 'context' || action === 'both') {
    const contextResult = await generateClaudeMdContext(cwd, scanResult, projectName);
    result.contextGenerated = contextResult.created;
    result.contextPath = contextResult.path;
  }

  // Show summary
  console.log('');
  sectionHeader('AI Guardrails Summary');

  if (result.skillExported) {
    success(`Skill exported to ${result.skillPath}`);
  }
  if (result.contextGenerated) {
    success(`Context ${result.contextPath === join(cwd, 'CLAUDE.md') ? 'added to' : 'created in'} CLAUDE.md`);
  }

  console.log('');
  info('Now AI tools will know about your design system!');

  return result;
}

/**
 * Export design system as a skill.
 */
async function exportSkill(
  cwd: string,
  scanResult: { tokens: unknown[]; components: unknown[] },
  projectName: string
): Promise<{ created: boolean; path?: string }> {
  const skillDir = join(cwd, '.claude', 'skills', 'design-system');
  const skillPath = join(skillDir, 'SKILL.md');

  // Create directory
  if (!existsSync(skillDir)) {
    mkdirSync(skillDir, { recursive: true });
  }

  // Generate skill content
  const skillContent = generateSkillContent(scanResult, projectName);
  writeFileSync(skillPath, skillContent);

  // Also create token reference files
  await createTokenFiles(skillDir, scanResult.tokens);

  return { created: true, path: skillDir };
}

/**
 * Generate SKILL.md content.
 */
function generateSkillContent(
  scanResult: { tokens: unknown[]; components: unknown[] },
  projectName: string
): string {
  const tokens = scanResult.tokens as Array<{ name: string; category: string; value: { hex?: string; value?: number; unit?: string } }>;
  const components = scanResult.components as Array<{ name: string; source: { type: string } }>;

  const colorTokens = tokens.filter(t => t.category === 'color');
  const spacingTokens = tokens.filter(t => t.category === 'spacing');

  return `---
name: ${projectName.toLowerCase().replace(/\s+/g, '-')}-design-system
description: Use when writing UI code for ${projectName}. Provides tokens, components, and patterns to maintain design consistency.
---

# ${projectName} Design System

## Quick Reference

### Colors
${colorTokens.length > 0
  ? colorTokens.slice(0, 10).map(t => `- \`${t.name}\`: ${t.value.hex || 'N/A'}`).join('\n')
  : '- No color tokens detected'}

### Spacing
${spacingTokens.length > 0
  ? spacingTokens.slice(0, 10).map(t => `- \`${t.name}\`: ${t.value.value}${t.value.unit}`).join('\n')
  : '- No spacing tokens detected'}

## Components (${components.length})
${components.slice(0, 20).map(c => `- ${c.name}`).join('\n')}

## Rules

1. **NEVER hardcode colors** - Always use design tokens
2. **NEVER hardcode spacing** - Use the spacing scale
3. **USE existing components** - Check the list above before creating new ones
4. **RUN validation** - Execute \`buoy check\` before committing

## Validation

Before committing any UI code:
\`\`\`bash
buoy check
\`\`\`

For detailed drift report:
\`\`\`bash
buoy drift check
\`\`\`

## More Details

See the token files in this directory for complete reference:
- \`tokens/colors.md\` - All color tokens
- \`tokens/spacing.md\` - Spacing scale
`;
}

/**
 * Create token reference files.
 */
async function createTokenFiles(
  skillDir: string,
  tokens: unknown[]
): Promise<void> {
  const typedTokens = tokens as Array<{ name: string; category: string; value: { hex?: string; value?: number; unit?: string } }>;
  const tokensDir = join(skillDir, 'tokens');

  if (!existsSync(tokensDir)) {
    mkdirSync(tokensDir, { recursive: true });
  }

  // Color tokens
  const colorTokens = typedTokens.filter(t => t.category === 'color');
  if (colorTokens.length > 0) {
    const colorContent = `# Color Tokens

| Token | Value |
|-------|-------|
${colorTokens.map(t => `| \`${t.name}\` | ${t.value.hex || 'N/A'} |`).join('\n')}
`;
    writeFileSync(join(tokensDir, 'colors.md'), colorContent);
  }

  // Spacing tokens
  const spacingTokens = typedTokens.filter(t => t.category === 'spacing');
  if (spacingTokens.length > 0) {
    const spacingContent = `# Spacing Tokens

| Token | Value |
|-------|-------|
${spacingTokens.map(t => `| \`${t.name}\` | ${t.value.value}${t.value.unit} |`).join('\n')}
`;
    writeFileSync(join(tokensDir, 'spacing.md'), spacingContent);
  }
}

/**
 * Generate context for CLAUDE.md.
 */
async function generateClaudeMdContext(
  cwd: string,
  scanResult: { tokens: unknown[]; components: unknown[] },
  projectName: string
): Promise<{ created: boolean; path?: string }> {
  const claudeMdPath = join(cwd, 'CLAUDE.md');

  // Run drift analysis for anti-patterns
  const { SemanticDiffEngine } = await import('@buoy-design/core/analysis');
  const engine = new SemanticDiffEngine();
  const diffResult = engine.analyzeComponents(
    scanResult.components as ContextData['components'],
    { availableTokens: scanResult.tokens as ContextData['tokens'] }
  );

  // Prepare context data
  const contextData: ContextData = {
    tokens: scanResult.tokens as ContextData['tokens'],
    components: scanResult.components as ContextData['components'],
    drifts: diffResult.drifts,
    projectName,
  };

  // Generate context
  const result = generateContext(contextData, {
    detailLevel: 'standard',
    includeTokens: true,
    includeComponents: true,
    includeValidation: true,
  });

  // Handle file operations
  if (existsSync(claudeMdPath)) {
    const existing = readFileSync(claudeMdPath, 'utf-8');
    if (existing.includes('## Design System Rules')) {
      info('CLAUDE.md already has design system context. Skipping.');
      return { created: false, path: claudeMdPath };
    }

    // Append with separator
    const toAppend = '\n\n---\n\n' + result.content;
    appendFileSync(claudeMdPath, toAppend);
  } else {
    // Create new CLAUDE.md
    const header = `# Project Instructions

This file provides guidance to AI tools working with this codebase.

`;
    writeFileSync(claudeMdPath, header + result.content);
  }

  return { created: true, path: claudeMdPath };
}

/**
 * Get project name from package.json or directory name.
 */
async function getProjectName(cwd: string): Promise<string> {
  const packageJsonPath = join(cwd, 'package.json');

  if (existsSync(packageJsonPath)) {
    try {
      const content = readFileSync(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(content);
      if (pkg.name) {
        const name = pkg.name.replace(/^@[^/]+\//, '');
        return name
          .split('-')
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Fall back to directory name
  const parts = cwd.split('/');
  const dirName = parts[parts.length - 1] || 'Project';
  return dirName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
