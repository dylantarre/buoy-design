// packages/agents/src/agents/codebase-review.ts
import { BaseAgent, type BaseAgentOptions } from './base.js';
import {
  type AgentContext,
  type CodebaseReviewResult,
  type CodePattern,
  type Finding,
} from '../types.js';
import { promptSection, formatFilesForPrompt, truncateForTokens } from '../utils/claude.js';

const SYSTEM_PROMPT = `You are an expert code reviewer specializing in design systems and component architecture.

Your task is to analyze code for:
1. Code patterns and conventions used in the codebase
2. Whether reported drift signals are actually problems or intentional divergences
3. Code quality assessment
4. Consistency of patterns across files

You will receive:
- Source files from a codebase
- Optional drift signals detected by an automated tool
- A question or focus area to analyze

Respond with a JSON object (no markdown, just JSON) matching this structure:
{
  "summary": "1-2 sentence summary of your analysis",
  "patterns": [
    {
      "name": "Pattern name",
      "description": "What this pattern does",
      "occurrences": 5,
      "examples": [{"file": "path.ts", "line": 10, "snippet": "code"}],
      "isConsistent": true
    }
  ],
  "codeQuality": {
    "score": 75,
    "strengths": ["Good typing", "Consistent naming"],
    "concerns": ["Some code duplication"]
  },
  "findings": [
    {
      "type": "intentional-divergence|pattern-violation|suggestion",
      "severity": "critical|warning|info|positive",
      "location": "file:line",
      "observation": "What you observed",
      "recommendation": "What to do about it",
      "evidence": ["Supporting quote or data"],
      "confidence": 0.85
    }
  ],
  "intentionalDivergences": [
    {
      "signalId": "drift-signal-id if analyzing a specific signal",
      "reason": "Why this appears to be intentional",
      "confidence": 0.9
    }
  ]
}`;

export class CodebaseReviewAgent extends BaseAgent<AgentContext, CodebaseReviewResult> {
  readonly id = 'codebase-review';
  readonly name = 'Codebase Review Agent';
  readonly description =
    'Analyzes code for patterns, quality, and whether drift signals are intentional divergences';

  constructor(options: BaseAgentOptions = {}) {
    super(options);
  }

  async execute(context: AgentContext): Promise<CodebaseReviewResult> {
    const startTime = Date.now();
    const validation = this.validateContext(context);
    if (!validation.valid) {
      throw new Error(`Invalid context: ${validation.errors.join(', ')}`);
    }

    const userPrompt = this.buildPrompt(context);
    const response = await this.client.completeJSON<RawCodebaseReviewResponse>(
      SYSTEM_PROMPT,
      [{ role: 'user', content: userPrompt }]
    );

    const { data } = response;
    const findings = this.parseFindings(data.findings ?? []);
    const patterns = this.parsePatterns(data.patterns ?? []);

    const baseResult = this.buildResult(
      data.summary ?? 'Analysis complete',
      findings,
      JSON.stringify(data, null, 2),
      startTime,
      response.tokensUsed
    );

    return {
      ...baseResult,
      patterns,
      codeQuality: {
        score: data.codeQuality?.score ?? 50,
        strengths: data.codeQuality?.strengths ?? [],
        concerns: data.codeQuality?.concerns ?? [],
      },
      intentionalDivergences: (data.intentionalDivergences ?? []).map((d) => ({
        signalId: d.signalId,
        reason: d.reason ?? 'Unknown reason',
        confidence: d.confidence ?? 0.5,
      })),
    };
  }

  private buildPrompt(context: AgentContext): string {
    const sections: string[] = [];

    // Repository context
    sections.push(
      promptSection(
        'repository',
        `Name: ${context.repo.name}
Owner: ${context.repo.owner}
URL: ${context.repo.url}`
      )
    );

    // Files to analyze
    const filesContent = formatFilesForPrompt(
      context.files.map((f) => ({
        path: f.path,
        content: truncateForTokens(f.content, 2000),
      }))
    );
    sections.push(promptSection('files', filesContent));

    // Drift signals if present
    if (context.signals && context.signals.length > 0) {
      const signalsText = context.signals
        .map(
          (s) =>
            `- ID: ${s.id}
  Type: ${s.type}
  Severity: ${s.severity}
  Message: ${s.message}
  Location: ${s.source.location}`
        )
        .join('\n\n');
      sections.push(promptSection('drift_signals', signalsText));
    }

    // Focus areas
    if (context.focusAreas && context.focusAreas.length > 0) {
      sections.push(
        promptSection('focus_areas', context.focusAreas.join('\n'))
      );
    }

    // Specific question
    if (context.question) {
      sections.push(promptSection('question', context.question));
    } else {
      sections.push(
        promptSection(
          'question',
          'Analyze this code for patterns, quality, and whether any drift signals are intentional divergences.'
        )
      );
    }

    return sections.join('\n\n');
  }

  private parsePatterns(patterns: unknown[]): CodePattern[] {
    if (!Array.isArray(patterns)) return [];

    return patterns
      .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
      .map((p) => ({
        name: String(p['name'] ?? 'Unknown'),
        description: String(p['description'] ?? ''),
        occurrences: typeof p['occurrences'] === 'number' ? p['occurrences'] : 0,
        examples: Array.isArray(p['examples'])
          ? p['examples']
              .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
              .map((e) => ({
                file: String(e['file'] ?? ''),
                line: typeof e['line'] === 'number' ? e['line'] : 0,
                snippet: String(e['snippet'] ?? ''),
              }))
          : [],
        isConsistent: p['isConsistent'] === true,
      }));
  }
}

interface RawCodebaseReviewResponse {
  summary?: string;
  patterns?: unknown[];
  codeQuality?: {
    score?: number;
    strengths?: string[];
    concerns?: string[];
  };
  findings?: unknown[];
  intentionalDivergences?: Array<{
    signalId?: string;
    reason?: string;
    confidence?: number;
  }>;
}
