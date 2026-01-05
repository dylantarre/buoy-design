// packages/agents/src/history.ts
// Analyzes git history to understand why drift exists

import Anthropic from '@anthropic-ai/sdk';
import { simpleGit, SimpleGit } from 'simple-git';
import type {
  HistoryInput,
  HistoryResult,
  HistoryVerdict,
  CommitInfo,
  AgentResult,
} from './types.js';

const MODEL = 'claude-sonnet-4-20250514';

export class HistoryAgent {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Analyze git history for a file to understand why drift exists
   */
  async analyze(input: HistoryInput): Promise<AgentResult<HistoryResult>> {
    try {
      const git: SimpleGit = simpleGit(input.repoPath);

      // Get git blame for the file
      const blameRaw = await git.raw([
        'blame',
        '--line-porcelain',
        input.filePath,
      ]).catch(() => '');

      // Get commit history for the file
      const logResult = await git.log({
        file: input.filePath,
        maxCount: 20,
      });

      // Parse commits into our format
      const timeline: CommitInfo[] = logResult.all.map((commit) => ({
        hash: commit.hash.slice(0, 7),
        date: commit.date,
        author: commit.author_name,
        email: commit.author_email,
        message: commit.message,
        prNumber: this.extractPRNumber(commit.message),
      }));

      // Extract unique authors
      const authors = [...new Set(timeline.map((c) => c.author))];

      // Get last modified date
      const lastModified = timeline[0]?.date ?? 'unknown';

      // If we have line range, extract relevant blame info
      let focusedBlame = '';
      if (input.lineRange && blameRaw) {
        focusedBlame = this.extractBlameForLines(
          blameRaw,
          input.lineRange[0],
          input.lineRange[1]
        );
      }

      // Use Claude to analyze the history
      const prompt = this.buildPrompt(input, timeline, focusedBlame);

      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      });

      const textContent = response.content.find((c) => c.type === 'text');
      const responseText = textContent?.type === 'text' ? textContent.text : '';

      // Parse the response
      const parsed = this.parseResponse(responseText);

      return {
        success: true,
        data: {
          verdict: parsed.verdict,
          timeline,
          context: parsed.context,
          confidence: parsed.confidence,
          lastModified,
          authors,
        },
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
   * Extract PR number from commit message
   */
  private extractPRNumber(message: string): number | undefined {
    const match = message.match(/#(\d+)/);
    return match ? parseInt(match[1], 10) : undefined;
  }

  /**
   * Extract blame info for specific lines
   */
  private extractBlameForLines(
    blameRaw: string,
    startLine: number,
    endLine: number
  ): string {
    const lines = blameRaw.split('\n');
    const relevant: string[] = [];
    let currentLine = 0;

    for (const line of lines) {
      if (line.match(/^[a-f0-9]{40}/)) {
        currentLine++;
        if (currentLine >= startLine && currentLine <= endLine) {
          relevant.push(line);
        }
      }
    }

    return relevant.join('\n');
  }

  /**
   * Build the analysis prompt
   */
  private buildPrompt(
    input: HistoryInput,
    timeline: CommitInfo[],
    focusedBlame: string
  ): string {
    const recentCommits = timeline
      .slice(0, 10)
      .map(
        (c) =>
          `- ${c.hash} (${c.date}) by ${c.author}: ${c.message.slice(0, 100)}`
      )
      .join('\n');

    return `You are analyzing git history to understand why a piece of code exists.

## File
${input.filePath}
${input.lineRange ? `Lines ${input.lineRange[0]}-${input.lineRange[1]}` : ''}

## Recent Commits
${recentCommits}

${focusedBlame ? `## Blame Info for Relevant Lines\n${focusedBlame}` : ''}

## Your Task

Determine if the code in question was:
- **accidental**: Developer didn't know about existing patterns/tokens
- **intentional**: Deliberate choice (override, special case, commented reason)
- **ai-generated**: Looks like Copilot/Claude output (generic patterns, no context awareness)
- **unknown**: Cannot determine from available information

Analyze the commit messages, timing, and patterns to make your determination.

Respond with JSON:
{
  "verdict": "accidental" | "intentional" | "ai-generated" | "unknown",
  "context": "Explanation of your analysis (2-3 sentences)",
  "confidence": 0.0-1.0
}

Be concise but specific. Reference actual commits or patterns you observed.`;
  }

  /**
   * Parse Claude's response
   */
  private parseResponse(response: string): {
    verdict: HistoryVerdict;
    context: string;
    confidence: number;
  } {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          verdict: this.validateVerdict(parsed.verdict),
          context: String(parsed.context ?? ''),
          confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
        };
      }
    } catch {
      // Fall through to default
    }

    return {
      verdict: 'unknown',
      context: 'Unable to parse analysis response',
      confidence: 0,
    };
  }

  /**
   * Validate verdict is a known value
   */
  private validateVerdict(value: unknown): HistoryVerdict {
    const valid: HistoryVerdict[] = [
      'accidental',
      'intentional',
      'ai-generated',
      'unknown',
    ];
    return valid.includes(value as HistoryVerdict)
      ? (value as HistoryVerdict)
      : 'unknown';
  }
}
