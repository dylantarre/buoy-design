// packages/agents/src/acceptance.ts
// Predicts likelihood of PR acceptance

import Anthropic from '@anthropic-ai/sdk';
import type {
  AcceptanceInput,
  AcceptanceResult,
  AcceptanceLikelihood,
  AgentResult,
} from './types.js';

const MODEL = 'claude-sonnet-4-20250514';

export class AcceptanceAgent {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Predict likelihood of PR acceptance for a repo
   */
  async predict(input: AcceptanceInput): Promise<AgentResult<AcceptanceResult>> {
    try {
      const prompt = this.buildPrompt(input);

      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      });

      const textContent = response.content.find((c) => c.type === 'text');
      const responseText = textContent?.type === 'text' ? textContent.text : '';

      const parsed = this.parseResponse(responseText);

      return {
        success: true,
        data: parsed,
        confidence: parsed.score / 100,
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
   * Build the prediction prompt
   */
  private buildPrompt(input: AcceptanceInput): string {
    const prStats = this.calculatePRStats(input.recentPRs);

    return `You are predicting whether a design system consistency PR will be accepted.

## Repository
${input.repo.owner}/${input.repo.name}
${input.repo.description ? `Description: ${input.repo.description}` : ''}

## Maintainer Activity
- Commits last month: ${input.maintainerActivity.commitsLastMonth}
- PRs reviewed last month: ${input.maintainerActivity.prsReviewedLastMonth}
- Avg review time: ${input.maintainerActivity.avgReviewTimeHours} hours

## PR Statistics
- Total PRs analyzed: ${input.recentPRs.length}
- Merge rate: ${prStats.mergeRate}%
- Avg days open: ${prStats.avgDaysOpen}
- External contributor merge rate: ${prStats.externalMergeRate}%

${input.contributingMd ? `## CONTRIBUTING.md\n${input.contributingMd.slice(0, 2000)}` : '## No CONTRIBUTING.md found'}

${input.issueLabels?.length ? `## Issue Labels Used\n${input.issueLabels.join(', ')}` : ''}

## Your Task

Predict likelihood of accepting a PR that:
- Fixes design system drift (hardcoded colors → tokens)
- Is a small, focused change (1-5 files)
- Has clear explanation of why the change matters
- Comes from an external contributor

Respond with JSON:
{
  "likelihood": "high" | "medium" | "low",
  "score": 0-100,
  "reasoning": "2-3 sentences explaining your prediction",
  "suggestedApproach": "How to frame the PR for best reception",
  "redFlags": ["List of concerns"],
  "greenFlags": ["List of positive signals"]
}`;
  }

  /**
   * Calculate PR statistics
   */
  private calculatePRStats(prs: AcceptanceInput['recentPRs']): {
    mergeRate: number;
    avgDaysOpen: number;
    externalMergeRate: number;
  } {
    if (prs.length === 0) {
      return { mergeRate: 0, avgDaysOpen: 0, externalMergeRate: 0 };
    }

    const merged = prs.filter((pr) => pr.merged);
    const mergeRate = Math.round((merged.length / prs.length) * 100);
    const avgDaysOpen = Math.round(
      prs.reduce((sum, pr) => sum + pr.daysOpen, 0) / prs.length
    );

    // Assume external if author is not in first 3 commits (rough heuristic)
    // In real implementation, you'd check against maintainer list
    const externalPRs = prs.filter((pr) => pr.reviewComments > 0);
    const externalMerged = externalPRs.filter((pr) => pr.merged);
    const externalMergeRate =
      externalPRs.length > 0
        ? Math.round((externalMerged.length / externalPRs.length) * 100)
        : mergeRate;

    return { mergeRate, avgDaysOpen, externalMergeRate };
  }

  /**
   * Parse Claude's response
   */
  private parseResponse(response: string): AcceptanceResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          likelihood: this.validateLikelihood(parsed.likelihood),
          score: Math.min(100, Math.max(0, Number(parsed.score) || 50)),
          reasoning: String(parsed.reasoning ?? ''),
          suggestedApproach: String(parsed.suggestedApproach ?? ''),
          redFlags: Array.isArray(parsed.redFlags)
            ? parsed.redFlags.map(String)
            : [],
          greenFlags: Array.isArray(parsed.greenFlags)
            ? parsed.greenFlags.map(String)
            : [],
        };
      }
    } catch {
      // Fall through
    }

    return {
      likelihood: 'medium',
      score: 50,
      reasoning: 'Unable to analyze - defaulting to medium likelihood',
      suggestedApproach: 'Follow standard contribution guidelines',
      redFlags: [],
      greenFlags: [],
    };
  }

  /**
   * Validate likelihood value
   */
  private validateLikelihood(value: unknown): AcceptanceLikelihood {
    const valid: AcceptanceLikelihood[] = ['high', 'medium', 'low'];
    return valid.includes(value as AcceptanceLikelihood)
      ? (value as AcceptanceLikelihood)
      : 'medium';
  }
}
