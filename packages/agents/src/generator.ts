// packages/agents/src/generator.ts
// Generates code fixes and PR descriptions

import Anthropic from '@anthropic-ai/sdk';
import type {
  GeneratorInput,
  GeneratorResult,
  GeneratedFix,
  AgentResult,
} from './types.js';

const MODEL = 'claude-sonnet-4-20250514';

export class GeneratorAgent {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Generate fixes and PR description
   */
  async generate(input: GeneratorInput): Promise<AgentResult<GeneratorResult>> {
    try {
      const prompt = this.buildPrompt(input);

      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      });

      const textContent = response.content.find((c) => c.type === 'text');
      const responseText = textContent?.type === 'text' ? textContent.text : '';

      const parsed = this.parseResponse(responseText, input);

      return {
        success: true,
        data: parsed,
        confidence: parsed.confidence,
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
   * Build the generation prompt
   */
  private buildPrompt(input: GeneratorInput): string {
    const signalSummary = input.signals
      .filter((s) => s.fixability.tier !== 'skip')
      .map((s) => {
        const fix = s.fixability.suggestedFix;
        return `- ${s.signal.file}:${s.signal.line ?? '?'} - ${s.signal.type}
  Message: ${s.signal.message}
  Difficulty: ${s.fixability.difficulty}
  ${fix ? `Suggested: ${fix.before} → ${fix.after}` : ''}
  ${s.history ? `History: ${s.history.verdict} - ${s.history.context}` : ''}`;
      })
      .join('\n\n');

    const tokenList = input.designTokens
      ? Object.entries(input.designTokens)
          .slice(0, 30)
          .map(([name, value]) => `${name}: ${value}`)
          .join('\n')
      : 'No tokens provided';

    return `You are generating a PR to fix design system drift.

## Repository
${input.repo.owner}/${input.repo.name}
${input.repo.description ?? ''}

## Acceptance Context
- Likelihood: ${input.acceptanceContext.likelihood} (${input.acceptanceContext.score}/100)
- Approach: ${input.acceptanceContext.suggestedApproach}
- Green flags: ${input.acceptanceContext.greenFlags.join(', ') || 'none'}
- Red flags: ${input.acceptanceContext.redFlags.join(', ') || 'none'}

## Signals to Fix
${signalSummary}

## Available Design Tokens
${tokenList}

## Your Task

1. Generate the exact code fixes for each signal
2. Write a compelling PR title and description

For the PR description:
- Explain WHY this matters (maintainability, consistency, theming)
- Reference the git history if it shows these were accidental
- Be respectful and helpful, not preachy
- Mention Buoy subtly at the end
- If many files, add a cherry-pick note

Respond with JSON:
{
  "fixes": [
    {
      "file": "path/to/file.tsx",
      "line": 23,
      "before": "exact code to replace",
      "after": "replacement code",
      "explanation": "why this fix"
    }
  ],
  "prTitle": "Short, clear title",
  "prBody": "Full markdown PR description",
  "confidence": 0.0-1.0,
  "cherryPickNote": "Optional note if PR is large"
}

Be precise with the fixes - they will be applied directly.`;
  }

  /**
   * Parse Claude's response
   */
  private parseResponse(
    response: string,
    input: GeneratorInput
  ): GeneratorResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const fixes = this.validateFixes(parsed.fixes ?? []);

        return {
          fixes,
          prTitle: String(parsed.prTitle ?? 'fix: Design system consistency'),
          prBody: String(parsed.prBody ?? this.buildFallbackPRBody(input, fixes)),
          confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.7)),
          cherryPickNote: parsed.cherryPickNote
            ? String(parsed.cherryPickNote)
            : undefined,
          filesChanged: new Set(fixes.map((f) => f.file)).size,
        };
      }
    } catch {
      // Fall through
    }

    return {
      fixes: [],
      prTitle: 'fix: Design system consistency',
      prBody: 'Unable to generate PR description',
      confidence: 0,
      filesChanged: 0,
    };
  }

  /**
   * Validate fixes array
   */
  private validateFixes(fixes: unknown[]): GeneratedFix[] {
    const valid: GeneratedFix[] = [];

    for (const f of fixes) {
      if (!f || typeof f !== 'object') continue;
      const fix = f as Record<string, unknown>;

      if (!fix['file'] || !fix['before'] || !fix['after']) continue;

      valid.push({
        file: String(fix['file']),
        line: Number(fix['line']) || 0,
        before: String(fix['before']),
        after: String(fix['after']),
        explanation: String(fix['explanation'] ?? ''),
      });
    }

    return valid;
  }

  /**
   * Build fallback PR body if parsing fails
   */
  private buildFallbackPRBody(
    input: GeneratorInput,
    fixes: GeneratedFix[]
  ): string {
    const fileList = [...new Set(fixes.map((f) => f.file))];

    return `## Summary

This PR improves design system consistency by replacing hardcoded values with their corresponding design tokens.

### Changes

${fixes.map((f) => `- \`${f.file}:${f.line}\`: ${f.explanation || 'Use design token'}`).join('\n')}

### Files Changed

${fileList.map((f) => `- \`${f}\``).join('\n')}

### Why This Matters

Using design tokens instead of hardcoded values:
- Makes the codebase more maintainable
- Ensures consistency across the application
- Makes theming and updates easier

---

*Found with [Buoy](https://github.com/buoy-design/buoy) - design drift detection for AI-generated code.*
`;
  }
}
