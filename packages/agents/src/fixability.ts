// packages/agents/src/fixability.ts
// Assesses how fixable a drift signal is

import Anthropic from '@anthropic-ai/sdk';
import type {
  FixabilityInput,
  FixabilityResult,
  FixTier,
  FixDifficulty,
  AgentResult,
} from './types.js';

const MODEL = 'claude-haiku-4-20250514';  // Use Haiku for speed on many signals

export class FixabilityAgent {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Assess how fixable a drift signal is
   */
  async assess(input: FixabilityInput): Promise<AgentResult<FixabilityResult>> {
    try {
      const prompt = this.buildPrompt(input);

      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      });

      const textContent = response.content.find((c) => c.type === 'text');
      const responseText = textContent?.type === 'text' ? textContent.text : '';

      const parsed = this.parseResponse(responseText);

      return {
        success: true,
        data: parsed,
        confidence: parsed.tier === 'slam-dunk' ? 0.9 : 0.7,
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
   * Batch assess multiple signals (more efficient)
   */
  async assessBatch(
    inputs: FixabilityInput[]
  ): Promise<AgentResult<FixabilityResult>[]> {
    // Process in parallel with concurrency limit
    const concurrency = 5;
    const results: AgentResult<FixabilityResult>[] = [];

    for (let i = 0; i < inputs.length; i += concurrency) {
      const batch = inputs.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((input) => this.assess(input))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Build the assessment prompt
   */
  private buildPrompt(input: FixabilityInput): string {
    const historyContext = input.historyContext
      ? `
## Git History Context
- Verdict: ${input.historyContext.verdict}
- Last modified: ${input.historyContext.lastModified}
- Authors: ${input.historyContext.authors.join(', ')}
- Context: ${input.historyContext.context}
`
      : '';

    const tokenContext = input.designTokens
      ? `
## Available Design Tokens
${Object.entries(input.designTokens)
  .slice(0, 20)
  .map(([name, value]) => `- ${name}: ${value}`)
  .join('\n')}
`
      : '';

    return `You are assessing whether a drift signal is worth fixing in an open source contribution.

## Drift Signal
- Type: ${input.signal.type}
- File: ${input.signal.file}${input.signal.line ? `:${input.signal.line}` : ''}
- Severity: ${input.signal.severity}
- Message: ${input.signal.message}

## File Content (around the issue)
\`\`\`
${input.surroundingCode ?? input.fileContent.slice(0, 1000)}
\`\`\`

${historyContext}
${tokenContext}

## Your Task

Assess this signal:

1. **Tier**: Is this a slam-dunk fix, needs review, or should skip?
   - slam-dunk: Clear mistake, safe to fix, token exists
   - review: Probably fixable but needs human judgment
   - skip: Intentional, risky, or too complex

2. **Difficulty**: How hard is the fix?
   - one-liner: Just replace one value
   - moderate: Few lines, maybe a type change
   - complex: Multiple files, logic changes

3. **Intentional**: Is this drift intentional?
   - Check for comments explaining the value
   - Check if it's a special override
   - Check git history context

4. **Safe to Fix**: Could this break anything?

Respond with JSON:
{
  "tier": "slam-dunk" | "review" | "skip",
  "difficulty": "one-liner" | "moderate" | "complex",
  "reasoning": "Brief explanation",
  "intentional": true | false,
  "safeToFix": true | false,
  "suggestedFix": {
    "before": "original code",
    "after": "fixed code",
    "explanation": "what changed"
  }
}

The suggestedFix is optional - include only for slam-dunk tier.`;
  }

  /**
   * Parse Claude's response
   */
  private parseResponse(response: string): FixabilityResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          tier: this.validateTier(parsed.tier),
          difficulty: this.validateDifficulty(parsed.difficulty),
          reasoning: String(parsed.reasoning ?? ''),
          intentional: Boolean(parsed.intentional),
          safeToFix: Boolean(parsed.safeToFix),
          suggestedFix: parsed.suggestedFix
            ? {
                before: String(parsed.suggestedFix.before ?? ''),
                after: String(parsed.suggestedFix.after ?? ''),
                explanation: String(parsed.suggestedFix.explanation ?? ''),
              }
            : undefined,
        };
      }
    } catch {
      // Fall through
    }

    return {
      tier: 'skip',
      difficulty: 'complex',
      reasoning: 'Unable to analyze signal',
      intentional: false,
      safeToFix: false,
    };
  }

  /**
   * Validate tier value
   */
  private validateTier(value: unknown): FixTier {
    const valid: FixTier[] = ['slam-dunk', 'review', 'skip'];
    return valid.includes(value as FixTier) ? (value as FixTier) : 'skip';
  }

  /**
   * Validate difficulty value
   */
  private validateDifficulty(value: unknown): FixDifficulty {
    const valid: FixDifficulty[] = ['one-liner', 'moderate', 'complex'];
    return valid.includes(value as FixDifficulty)
      ? (value as FixDifficulty)
      : 'complex';
  }
}
