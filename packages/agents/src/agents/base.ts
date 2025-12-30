// packages/agents/src/agents/base.ts
import {
  type Agent,
  type AgentContext,
  type AgentResult,
  type AgentConfig,
  type Finding,
  DEFAULT_AGENT_CONFIG,
} from '../types.js';
import { ClaudeClient, type ClaudeResponse } from '../utils/claude.js';

export interface BaseAgentOptions {
  config?: Partial<AgentConfig>;
}

export abstract class BaseAgent<
  TContext extends AgentContext = AgentContext,
  TResult extends AgentResult = AgentResult
> implements Agent<TContext, TResult>
{
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;

  protected client: ClaudeClient;
  protected config: AgentConfig;

  constructor(options: BaseAgentOptions = {}) {
    this.config = { ...DEFAULT_AGENT_CONFIG, ...options.config };
    this.client = new ClaudeClient(this.config);
  }

  abstract execute(context: TContext): Promise<TResult>;

  validateContext(context: TContext): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!context.repo) {
      errors.push('Missing required field: repo');
    }
    if (!context.files || context.files.length === 0) {
      errors.push('At least one file is required in context');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Build the base result object
   */
  protected buildResult(
    summary: string,
    findings: Finding[],
    rawAnalysis: string,
    startTime: number,
    tokensUsed?: ClaudeResponse['tokensUsed']
  ): AgentResult {
    const confidences = findings.map((f) => f.confidence);
    const overallConfidence =
      confidences.length > 0
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : 0;

    return {
      agentId: this.id,
      agentName: this.name,
      executedAt: new Date(),
      durationMs: Date.now() - startTime,
      summary,
      findings,
      overallConfidence,
      rawAnalysis,
      tokensUsed,
    };
  }

  /**
   * Parse findings from Claude's JSON response
   */
  protected parseFindings(findings: unknown[]): Finding[] {
    if (!Array.isArray(findings)) return [];

    return findings
      .filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null)
      .map((f) => ({
        type: String(f['type'] ?? 'unknown'),
        severity: this.parseSeverity(f['severity']),
        location: f['location'] ? String(f['location']) : undefined,
        observation: String(f['observation'] ?? ''),
        recommendation: f['recommendation'] ? String(f['recommendation']) : undefined,
        evidence: Array.isArray(f['evidence'])
          ? f['evidence'].map(String)
          : [],
        confidence: typeof f['confidence'] === 'number' ? f['confidence'] : 0.5,
      }));
  }

  private parseSeverity(value: unknown): Finding['severity'] {
    if (value === 'critical' || value === 'warning' || value === 'info' || value === 'positive') {
      return value;
    }
    return 'info';
  }
}
