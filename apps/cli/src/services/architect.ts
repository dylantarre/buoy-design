/**
 * AI Design System Architect
 *
 * Analyzes a codebase to diagnose design system maturity and
 * generates recommendations + PR to implement a design system.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  DesignSystemDiagnosis,
  DesignSystemRecommendation,
  SuggestedToken
} from '@buoy-design/core';
import {
  collectGitHistory,
} from '@buoy-design/core';
import { CssScanner, type CssAnalysis } from '@buoy-design/scanners';
import { detectFrameworks } from '../detect/frameworks.js';

export interface ArchitectOptions {
  projectRoot: string;
  /** Skip AI analysis (use heuristics only) */
  noAI?: boolean;
  /** Callback for progress updates */
  onProgress?: (message: string) => void;
}

export interface ArchitectResult {
  diagnosis: DesignSystemDiagnosis;
  generatedTokensFile: string;
  prDescription: string;
}

/**
 * AI Design System Architect
 *
 * Diagnoses design system maturity and generates recommendations.
 */
export class DesignSystemArchitect {
  private client: Anthropic | null = null;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (key) {
      this.client = new Anthropic({ apiKey: key });
    }
  }

  /**
   * Analyze the codebase and generate a design system diagnosis
   */
  async analyze(options: ArchitectOptions): Promise<ArchitectResult> {
    const { projectRoot, onProgress } = options;

    // Step 1: Scan CSS files
    onProgress?.('Scanning CSS files...');
    const cssScanner = new CssScanner({ projectRoot });
    const cssResult = await cssScanner.scan();

    // Step 2: Collect git history
    onProgress?.('Analyzing git history...');
    const gitResult = await collectGitHistory(projectRoot, { maxCount: 1000 });

    // Step 3: Detect frameworks
    onProgress?.('Detecting frameworks...');
    const frameworks = await detectFrameworks(projectRoot);

    // Step 4: Build diagnosis
    onProgress?.('Building diagnosis...');
    const diagnosis = await this.buildDiagnosis(
      cssResult.analysis,
      gitResult,
      frameworks,
      cssResult.files.length,
      options
    );

    // Step 5: Generate tokens file
    onProgress?.('Generating design tokens...');
    const generatedTokensFile = this.generateTokensFile(diagnosis);

    // Step 6: Generate PR description
    onProgress?.('Generating PR description...');
    const prDescription = await this.generatePRDescription(diagnosis, options);

    return {
      diagnosis,
      generatedTokensFile,
      prDescription
    };
  }

  /**
   * Build a complete diagnosis from collected data
   */
  private async buildDiagnosis(
    cssAnalysis: CssAnalysis,
    gitResult: Awaited<ReturnType<typeof collectGitHistory>>,
    frameworks: Awaited<ReturnType<typeof detectFrameworks>>,
    cssFileCount: number,
    _options: ArchitectOptions
  ): Promise<DesignSystemDiagnosis> {
    // Team analysis
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const activeContributors = gitResult.developers.filter(d => {
      // Check if any of their commits are recent
      return gitResult.commits.some(c =>
        c.authorEmail === d.email && new Date(c.timestamp) > ninetyDaysAgo
      );
    }).length;

    // Find who touches CSS files
    const cssCommits = gitResult.commits.filter(c =>
      c.filesChanged.some(f => f.path.match(/\.(css|scss|sass|less)$/))
    );
    const cssAuthors = new Set(cssCommits.map(c => c.authorEmail));

    const totalCommits = gitResult.commits.length;
    const avgCommitsPerContributor = gitResult.developers.length > 0
      ? Math.round(totalCommits / gitResult.developers.length)
      : 0;

    // Calculate maturity score
    const maturityScore = this.calculateMaturityScore(cssAnalysis, gitResult.developers.length);
    const maturityLevel = this.getMaturityLevel(maturityScore);

    // Generate recommendations based on analysis
    const recommendations = this.generateRecommendations(
      cssAnalysis,
      gitResult.developers.length,
      maturityLevel
    );

    // Generate suggested tokens
    const suggestedTokens = this.generateSuggestedTokens(cssAnalysis);

    return {
      maturityScore,
      maturityLevel,
      cssAnalysis: {
        uniqueColors: cssAnalysis.stats.uniqueColors,
        uniqueSpacing: cssAnalysis.stats.uniqueSpacing,
        uniqueFonts: cssAnalysis.stats.uniqueFonts,
        tokenizationScore: cssAnalysis.stats.tokenizationScore,
        hardcodedValues: cssAnalysis.stats.hardcodedUsage,
        suggestedPalette: cssAnalysis.suggestedPalette,
        suggestedSpacingScale: cssAnalysis.suggestedSpacingScale
      },
      teamAnalysis: {
        totalContributors: gitResult.developers.length,
        activeContributors,
        stylingContributors: cssAuthors.size,
        avgCommitsPerContributor
      },
      codebaseAnalysis: {
        totalFiles: gitResult.commits.reduce((acc, c) => acc + c.filesChanged.length, 0),
        cssFiles: cssFileCount,
        componentFiles: 0, // TODO: count from framework scan
        frameworksDetected: frameworks.map(f => f.name)
      },
      recommendations,
      suggestedTokens
    };
  }

  /**
   * Calculate overall maturity score (0-100)
   */
  private calculateMaturityScore(cssAnalysis: CssAnalysis, contributorCount: number): number {
    let score = 0;

    // Tokenization score (40% weight)
    score += cssAnalysis.stats.tokenizationScore * 0.4;

    // Color consolidation (20% weight)
    // Fewer unique colors = better (assuming they're using tokens)
    const colorScore = cssAnalysis.stats.uniqueColors <= 8 ? 100
      : cssAnalysis.stats.uniqueColors <= 16 ? 75
      : cssAnalysis.stats.uniqueColors <= 32 ? 50
      : cssAnalysis.stats.uniqueColors <= 64 ? 25
      : 0;
    score += colorScore * 0.2;

    // Spacing consolidation (20% weight)
    const spacingScore = cssAnalysis.stats.uniqueSpacing <= 8 ? 100
      : cssAnalysis.stats.uniqueSpacing <= 16 ? 75
      : cssAnalysis.stats.uniqueSpacing <= 32 ? 50
      : 25;
    score += spacingScore * 0.2;

    // Scale adjustment (20% weight)
    // Larger teams with consistent styling = bonus
    // This rewards teams that maintain consistency at scale
    const scaleScore = contributorCount <= 3
      ? 50 // Small team, neutral
      : cssAnalysis.stats.tokenizationScore >= 50
        ? 100 // Large team with good tokenization
        : 25; // Large team with poor tokenization
    score += scaleScore * 0.2;

    return Math.round(score);
  }

  /**
   * Convert score to maturity level
   */
  private getMaturityLevel(score: number): DesignSystemDiagnosis['maturityLevel'] {
    if (score >= 80) return 'optimized';
    if (score >= 60) return 'managed';
    if (score >= 40) return 'defined';
    if (score >= 20) return 'emerging';
    return 'none';
  }

  /**
   * Generate recommendations based on diagnosis
   */
  private generateRecommendations(
    cssAnalysis: CssAnalysis,
    contributorCount: number,
    maturityLevel: DesignSystemDiagnosis['maturityLevel']
  ): DesignSystemRecommendation[] {
    const recommendations: DesignSystemRecommendation[] = [];

    // No tokens? Suggest creating them
    if (cssAnalysis.stats.tokenizationScore < 10) {
      recommendations.push({
        priority: 'high',
        category: 'tokens',
        title: 'Create design tokens',
        description: `Your codebase has ${cssAnalysis.stats.uniqueColors} unique colors and ${cssAnalysis.stats.uniqueSpacing} spacing values, but only ${cssAnalysis.stats.tokenizationScore}% are using CSS variables. Creating design tokens will improve consistency.`,
        effort: contributorCount <= 3 ? 'small' : 'medium',
        impact: 'large'
      });
    }

    // Too many colors? Suggest consolidation
    if (cssAnalysis.stats.uniqueColors > 20) {
      const suggestedCount = contributorCount <= 3 ? 8 : 12;
      recommendations.push({
        priority: 'high',
        category: 'tokens',
        title: 'Consolidate color palette',
        description: `You have ${cssAnalysis.stats.uniqueColors} unique colors. For a team of ${contributorCount}, we recommend consolidating to ~${suggestedCount} colors.`,
        effort: 'medium',
        impact: 'large'
      });
    }

    // Too many spacing values?
    if (cssAnalysis.stats.uniqueSpacing > 15) {
      recommendations.push({
        priority: 'medium',
        category: 'tokens',
        title: 'Create spacing scale',
        description: `You have ${cssAnalysis.stats.uniqueSpacing} unique spacing values. A consistent scale (e.g., 4, 8, 12, 16, 24, 32) would improve maintainability.`,
        effort: 'small',
        impact: 'medium'
      });
    }

    // Small team? Keep it simple
    if (contributorCount <= 3 && maturityLevel === 'none') {
      recommendations.push({
        priority: 'medium',
        category: 'process',
        title: 'Start simple',
        description: 'For a small team, start with just colors and spacing tokens. You can add more complexity as you grow.',
        effort: 'small',
        impact: 'medium'
      });
    }

    // Larger team? Need more structure
    if (contributorCount > 5 && maturityLevel !== 'optimized') {
      recommendations.push({
        priority: 'high',
        category: 'documentation',
        title: 'Document design decisions',
        description: 'With a larger team, documenting design tokens and usage guidelines becomes critical for consistency.',
        effort: 'medium',
        impact: 'large'
      });
    }

    return recommendations;
  }

  /**
   * Generate suggested tokens from CSS analysis
   */
  private generateSuggestedTokens(cssAnalysis: CssAnalysis): SuggestedToken[] {
    const tokens: SuggestedToken[] = [];

    // Color tokens from suggested palette
    const colorNames = [
      'primary', 'secondary', 'accent', 'neutral-50', 'neutral-100',
      'neutral-200', 'neutral-700', 'neutral-800', 'neutral-900',
      'success', 'warning', 'error'
    ];

    for (let i = 0; i < Math.min(cssAnalysis.suggestedPalette.length, colorNames.length); i++) {
      const color = cssAnalysis.suggestedPalette[i]!;
      const name = colorNames[i]!;

      // Find all colors this would replace
      const replaces: string[] = [];
      for (const [normalized, colorValue] of cssAnalysis.colors) {
        // Check if this color is similar enough to be replaced
        if (this.colorsSimilar(color, normalized)) {
          replaces.push(colorValue.value);
        }
      }

      tokens.push({
        name: `--color-${name}`,
        value: color,
        category: 'color',
        usageCount: replaces.length,
        replaces
      });
    }

    // Spacing tokens from suggested scale
    const spacingNames = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'];

    for (let i = 0; i < Math.min(cssAnalysis.suggestedSpacingScale.length, spacingNames.length); i++) {
      const value = cssAnalysis.suggestedSpacingScale[i]!;
      const name = spacingNames[i]!;

      // Find values close to this
      const replaces: string[] = [];
      for (const [_, spacingValue] of cssAnalysis.spacing) {
        if (spacingValue.unit === 'px' && Math.abs(spacingValue.numericValue - value) <= 2) {
          replaces.push(spacingValue.value);
        }
      }

      tokens.push({
        name: `--spacing-${name}`,
        value: `${value}px`,
        category: 'spacing',
        usageCount: replaces.length,
        replaces
      });
    }

    return tokens;
  }

  /**
   * Check if two colors are similar enough to consolidate
   */
  private colorsSimilar(hex1: string, hex2: string): boolean {
    const rgb1 = this.hexToRgb(hex1);
    const rgb2 = this.hexToRgb(hex2);
    if (!rgb1 || !rgb2) return false;

    const distance = Math.sqrt(
      Math.pow(rgb1.r - rgb2.r, 2) +
      Math.pow(rgb1.g - rgb2.g, 2) +
      Math.pow(rgb1.b - rgb2.b, 2)
    );

    return distance < 30; // ~5% difference
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const match = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!match) return null;
    return {
      r: parseInt(match[1]!, 16),
      g: parseInt(match[2]!, 16),
      b: parseInt(match[3]!, 16)
    };
  }

  /**
   * Generate a design-tokens.css file from diagnosis
   */
  generateTokensFile(diagnosis: DesignSystemDiagnosis): string {
    const lines: string[] = [
      '/**',
      ' * Design Tokens',
      ' * Generated by Buoy Design System Architect',
      ' * ',
      ` * Maturity Level: ${diagnosis.maturityLevel}`,
      ` * Score: ${diagnosis.maturityScore}/100`,
      ' */',
      '',
      ':root {'
    ];

    // Group tokens by category
    const colorTokens = diagnosis.suggestedTokens.filter((t: SuggestedToken) => t.category === 'color');
    const spacingTokens = diagnosis.suggestedTokens.filter((t: SuggestedToken) => t.category === 'spacing');

    if (colorTokens.length > 0) {
      lines.push('  /* Colors */');
      for (const token of colorTokens) {
        lines.push(`  ${token.name}: ${token.value};`);
      }
      lines.push('');
    }

    if (spacingTokens.length > 0) {
      lines.push('  /* Spacing */');
      for (const token of spacingTokens) {
        lines.push(`  ${token.name}: ${token.value};`);
      }
      lines.push('');
    }

    lines.push('}');

    return lines.join('\n');
  }

  /**
   * Generate PR description using AI (or fallback to template)
   */
  private async generatePRDescription(
    diagnosis: DesignSystemDiagnosis,
    options: ArchitectOptions
  ): Promise<string> {
    if (!this.client || options.noAI) {
      return this.generatePRDescriptionTemplate(diagnosis);
    }

    try {
      const prompt = `You are a design system expert. Generate a clear, concise PR description for introducing design tokens to a codebase.

Diagnosis:
- Maturity Level: ${diagnosis.maturityLevel} (${diagnosis.maturityScore}/100)
- Unique Colors: ${diagnosis.cssAnalysis.uniqueColors}
- Unique Spacing Values: ${diagnosis.cssAnalysis.uniqueSpacing}
- Current Tokenization: ${diagnosis.cssAnalysis.tokenizationScore}%
- Team Size: ${diagnosis.teamAnalysis.totalContributors} contributors
- Frameworks: ${diagnosis.codebaseAnalysis.frameworksDetected.join(', ') || 'None detected'}

Recommendations:
${diagnosis.recommendations.map((r: DesignSystemRecommendation) => `- [${r.priority}] ${r.title}: ${r.description}`).join('\n')}

Suggested Tokens:
${diagnosis.suggestedTokens.slice(0, 10).map((t: SuggestedToken) => `- ${t.name}: ${t.value} (replaces ${t.usageCount} values)`).join('\n')}

Generate a PR description with:
1. A clear summary of what this PR does
2. Why this change is needed (based on the diagnosis)
3. What's included (the design tokens)
4. Migration path for adopting these tokens
5. Any breaking changes or considerations

Keep it concise and actionable. Use markdown formatting.`;

      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      });

      const text = response.content[0]?.type === 'text'
        ? response.content[0].text
        : '';

      return text || this.generatePRDescriptionTemplate(diagnosis);
    } catch {
      return this.generatePRDescriptionTemplate(diagnosis);
    }
  }

  /**
   * Template-based PR description (fallback)
   */
  private generatePRDescriptionTemplate(diagnosis: DesignSystemDiagnosis): string {
    const lines: string[] = [
      '## 🎨 Introduce Design Tokens',
      '',
      '### Summary',
      '',
      `This PR introduces a foundational design token system to improve consistency across the codebase.`,
      '',
      '### Why This Change?',
      '',
      `Our analysis found:`,
      `- **${diagnosis.cssAnalysis.uniqueColors}** unique colors used`,
      `- **${diagnosis.cssAnalysis.uniqueSpacing}** unique spacing values`,
      `- Only **${diagnosis.cssAnalysis.tokenizationScore}%** of values use CSS variables`,
      '',
      `Current maturity level: **${diagnosis.maturityLevel}** (${diagnosis.maturityScore}/100)`,
      '',
      '### What\'s Included',
      '',
      `- ${diagnosis.suggestedTokens.filter((t: SuggestedToken) => t.category === 'color').length} color tokens`,
      `- ${diagnosis.suggestedTokens.filter((t: SuggestedToken) => t.category === 'spacing').length} spacing tokens`,
      '',
      '### Migration Path',
      '',
      '1. This PR adds the token definitions - no breaking changes',
      '2. Gradually replace hardcoded values with `var(--token-name)`',
      '3. Use Buoy to track migration progress',
      '',
      '---',
      '*Generated by [Buoy](https://github.com/ahoybuoy/buoy) Design System Architect*'
    ];

    return lines.join('\n');
  }
}
