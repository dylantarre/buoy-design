// packages/agents/src/review.ts
// Reviews codebase to find what Buoy missed

import Anthropic from '@anthropic-ai/sdk';
import type {
  ReviewInput,
  ReviewResult,
  MissedPattern,
  BuoyImprovement,
  AgentResult,
} from './types.js';

const MODEL = 'claude-sonnet-4-20250514';

export class ReviewAgent {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Review what Buoy found vs what's in the repo
   */
  async analyze(input: ReviewInput): Promise<AgentResult<ReviewResult>> {
    try {
      const prompt = this.buildPrompt(input);

      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      });

      const textContent = response.content.find((c) => c.type === 'text');
      const responseText = textContent?.type === 'text' ? textContent.text : '';

      const parsed = this.parseResponse(responseText);

      return {
        success: true,
        data: parsed,
        confidence: parsed.missedPatterns.length > 0 ? 0.8 : 0.9,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        confidence: 0,
      };
    }
  }

  /**
   * Build the analysis prompt
   */
  private buildPrompt(input: ReviewInput): string {
    const lines: string[] = [];

    lines.push(`# Buoy Coverage Analysis: ${input.repo.owner}/${input.repo.name}`);
    lines.push('');
    lines.push('## Your Task');
    lines.push('');
    lines.push('Buoy is a design drift detection tool. It scans codebases to find:');
    lines.push('- **Components**: React/Vue/etc components that are part of the design system');
    lines.push('- **Design Tokens**: Colors, spacing, typography defined as tokens');
    lines.push('- **Drift**: Places where code diverges from the design system');
    lines.push('');
    lines.push('Review what Buoy found and identify what it MISSED.');
    lines.push('');

    // Buoy results
    lines.push('## What Buoy Found');
    lines.push('');
    lines.push(`- Components detected: **${input.buoyOutput.components}**`);
    lines.push(`- Tokens detected: **${input.buoyOutput.tokens}**`);
    lines.push(`- Drift signals: **${input.buoyOutput.driftSignals}**`);
    lines.push('');

    // Config if available
    if (input.buoyConfig) {
      lines.push('## Buoy Configuration');
      lines.push('```javascript');
      lines.push(input.buoyConfig);
      lines.push('```');
      lines.push('');
    }

    // Repo structure
    lines.push('## Repository Structure');
    lines.push('```');
    lines.push(input.repoStructure.slice(0, 50).join('\n'));
    if (input.repoStructure.length > 50) {
      lines.push(`... and ${input.repoStructure.length - 50} more`);
    }
    lines.push('```');
    lines.push('');

    // Sampled files
    lines.push('## Sampled Files');
    lines.push('');
    for (const file of input.sampledFiles.slice(0, 8)) {
      lines.push(`### ${file.path}`);
      lines.push(`*${file.reason}*`);
      lines.push('');
      lines.push('```' + this.getFileExtension(file.path));
      lines.push(this.truncateContent(file.content, 100));
      lines.push('```');
      lines.push('');
    }

    // Output format
    lines.push('## Required Output');
    lines.push('');
    lines.push('Provide analysis, then end with JSON:');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify({
      missedPatterns: [{
        category: 'component | token | drift | source',
        description: 'What was missed',
        evidence: { file: 'path', lineRange: [1, 10], codeSnippet: '...' },
        suggestedDetection: 'How Buoy could catch this',
        severity: 'high | medium | low',
      }],
      improvements: [{
        area: 'scanner | config | drift-rules | token-parser',
        title: 'Short title',
        description: 'Detailed description',
        examples: ['Example from repo'],
        estimatedImpact: 'Would catch X items',
      }],
      summary: {
        totalMissed: 0,
        missedByCategory: {},
        improvementAreas: [],
      },
    }, null, 2));
    lines.push('```');

    return lines.join('\n');
  }

  /**
   * Parse Claude's response
   */
  private parseResponse(response: string): ReviewResult {
    try {
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```\s*$/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1] ?? '{}');
        return {
          missedPatterns: this.validateMissedPatterns(parsed.missedPatterns ?? []),
          improvements: this.validateImprovements(parsed.improvements ?? []),
          summary: parsed.summary ?? {
            totalMissed: 0,
            missedByCategory: {},
            improvementAreas: [],
          },
          confidence: 0.8,
        };
      }
    } catch {
      // Fall through
    }

    return {
      missedPatterns: [],
      improvements: [],
      summary: { totalMissed: 0, missedByCategory: {}, improvementAreas: [] },
      confidence: 0,
    };
  }

  /**
   * Validate missed patterns array
   */
  private validateMissedPatterns(patterns: unknown[]): MissedPattern[] {
    const valid: MissedPattern[] = [];
    const categories = ['component', 'token', 'drift', 'source'];

    for (const p of patterns) {
      if (!p || typeof p !== 'object') continue;
      const pattern = p as Record<string, unknown>;
      const category = pattern['category'];

      if (!categories.includes(category as string)) continue;

      valid.push({
        category: category as MissedPattern['category'],
        description: String(pattern['description'] ?? ''),
        evidence: {
          file: String((pattern['evidence'] as Record<string, unknown>)?.['file'] ?? ''),
          lineRange: (pattern['evidence'] as Record<string, unknown>)?.['lineRange'] as [number, number] | undefined,
          codeSnippet: (pattern['evidence'] as Record<string, unknown>)?.['codeSnippet'] as string | undefined,
        },
        suggestedDetection: String(pattern['suggestedDetection'] ?? ''),
        severity: (['high', 'medium', 'low'].includes(pattern['severity'] as string)
          ? pattern['severity']
          : 'medium') as MissedPattern['severity'],
      });
    }

    return valid;
  }

  /**
   * Validate improvements array
   */
  private validateImprovements(improvements: unknown[]): BuoyImprovement[] {
    const valid: BuoyImprovement[] = [];
    const areas = ['scanner', 'config', 'drift-rules', 'token-parser'];

    for (const i of improvements) {
      if (!i || typeof i !== 'object') continue;
      const imp = i as Record<string, unknown>;
      const area = imp['area'];

      if (!areas.includes(area as string)) continue;

      valid.push({
        area: area as BuoyImprovement['area'],
        title: String(imp['title'] ?? ''),
        description: String(imp['description'] ?? ''),
        examples: Array.isArray(imp['examples']) ? imp['examples'].map(String) : [],
        estimatedImpact: String(imp['estimatedImpact'] ?? ''),
      });
    }

    return valid;
  }

  /**
   * Get file extension for syntax highlighting
   */
  private getFileExtension(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    const mapping: Record<string, string> = {
      ts: 'typescript',
      tsx: 'tsx',
      js: 'javascript',
      jsx: 'jsx',
      json: 'json',
      css: 'css',
      md: 'markdown',
    };
    return mapping[ext] ?? ext;
  }

  /**
   * Truncate content to max lines
   */
  private truncateContent(content: string, maxLines: number): string {
    const lines = content.split('\n');
    if (lines.length <= maxLines) return content;

    const half = Math.floor(maxLines / 2);
    const start = lines.slice(0, half).join('\n');
    const end = lines.slice(-half).join('\n');
    return `${start}\n\n// ... ${lines.length - maxLines} lines omitted ...\n\n${end}`;
  }
}
