import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";

export interface ExplainTarget {
  type: "file" | "directory" | "drift" | "all" | "scan";
  path: string;
  name: string;
  scanData?: string; // Formatted scan results for AI analysis
}

export interface AgentResult {
  agent: string;
  success: boolean;
  output: string;
  error?: string;
}

export interface ExplainResult {
  target: ExplainTarget;
  findings: AgentResult[];
  synthesis: string;
}

/**
 * Resolve the target from user input
 * Returns null if no input and not --all (meaning run scan mode)
 */
export function resolveTarget(input: string | undefined, all: boolean): ExplainTarget | null {
  if (all) {
    return {
      type: "all",
      path: process.cwd(),
      name: "design-system",
    };
  }

  if (!input) {
    // No input = scan mode, handled separately
    return null;
  }

  // Drift signal reference
  if (input.startsWith("drift:")) {
    const driftId = input.slice(6);
    return {
      type: "drift",
      path: driftId,
      name: `drift-${driftId}`,
    };
  }

  // File or directory
  const resolved = resolve(input);
  if (!existsSync(resolved)) {
    throw new Error(`Target not found: ${input}`);
  }

  const stats = require("fs").statSync(resolved);
  return {
    type: stats.isDirectory() ? "directory" : "file",
    path: resolved,
    name: basename(resolved),
  };
}

/**
 * Build quick/high-level prompts for --all or --quick mode
 */
function buildQuickPrompt(agent: string, targetDesc: string): string {
  const prompts: Record<string, string> = {
    "git-archaeologist": `Analyze ${targetDesc}. Quick git history overview:
1. Check recent commits (last 20) for patterns
2. Who are the main contributors?
3. Any recent major changes?
Keep response under 300 words. Focus on key insights only.`,

    "structure-analyst": `Analyze ${targetDesc}. Quick architecture overview:
1. What's the high-level structure?
2. Key directories and their purposes?
3. Main patterns or frameworks used?
Keep response under 300 words. Focus on architecture insights only.`,

    "code-reader": `Analyze ${targetDesc}. Quick code overview:
1. What are the main technologies?
2. Any obvious TODOs or FIXMEs?
3. Code quality observations?
Keep response under 300 words. Focus on key observations only.`,

    "convention-detective": `Analyze ${targetDesc}. Quick conventions check:
1. What frameworks/patterns are used?
2. Are conventions consistent?
3. Any obvious anti-patterns?
Keep response under 300 words. Focus on pattern insights only.`,
  };

  return prompts[agent] || "";
}

/**
 * Build the prompt for each investigation agent
 */
function buildAgentPrompt(agent: string, target: ExplainTarget, quick?: boolean): string {
  // Special handling for scan results
  if (target.type === "scan" && target.scanData) {
    return buildScanAgentPrompt(agent, target.scanData);
  }

  const targetDesc = target.type === "all"
    ? "the design system in this codebase"
    : target.type === "drift"
    ? `drift signal ${target.path}`
    : `${target.path}`;

  // Quick mode uses shorter, more focused prompts
  if (quick || target.type === "all") {
    return buildQuickPrompt(agent, targetDesc);
  }

  const prompts: Record<string, string> = {
    "git-archaeologist": `You are investigating: ${targetDesc}

Your mission: Uncover the history of this code through git forensics.

Tasks:
1. Run git log to see the history of changes to this target
2. Run git blame on relevant files to see line-by-line attribution
3. Find the original commits that introduced this code
4. Look for refactoring commits (messages with "refactor", "move", "rename")
5. Check for PR/issue references in commit messages (#123 patterns)
6. Identify the author(s) and time periods of major changes

Focus your output on:
- When and why this was originally created
- Key evolutionary moments (major refactors, ownership changes)
- Any PR/issue discussions that reveal intent
- Clues from commit messages about constraints or decisions

Be concise. Focus on insights that explain WHY things are the way they are.`,

    "structure-analyst": `You are investigating: ${targetDesc}

Your mission: Understand how this fits into the codebase architecture.

Tasks:
1. Find what imports or depends on this (search for import statements)
2. Find what this imports or depends on
3. Examine the directory structure - why is it located here?
4. Look for related files (tests, stories, types, styles)
5. Check if this is part of a larger pattern (similar files nearby)
6. Identify the architectural "layer" this belongs to

Focus your output on:
- The dependency graph (what uses this, what this uses)
- Why the current location makes sense (or doesn't)
- Related files that provide context
- The architectural role this plays

Be concise. Focus on structural insights that explain the design.`,

    "code-reader": `You are investigating: ${targetDesc}

Your mission: Read the actual code for clues about purpose and constraints.

Tasks:
1. Read the file(s) carefully
2. Extract all comments, especially TODO, HACK, FIXME, NOTE, WARNING
3. Analyze naming conventions - what do names reveal?
4. Look for defensive code, error handling, edge cases
5. Identify hardcoded values and speculate why they exist
6. Note unusual patterns that might have backstory

Focus your output on:
- The core purpose (1-2 sentences)
- Revealing comments (quote them verbatim)
- What the code structure tells us about constraints
- Oddities that suggest workarounds or history

Be concise. Focus on what the code itself reveals about intent.`,

    "convention-detective": `You are investigating: ${targetDesc}

Your mission: Compare against known patterns and project conventions.

Tasks:
1. Identify the framework/library being used (React, Vue, Tailwind, etc.)
2. Check if this follows standard patterns for that ecosystem
3. Look for deviations from conventions - intentional or accidental?
4. Compare to similar code elsewhere in this project
5. Identify potential workarounds for known limitations
6. Note anti-patterns that might indicate tech debt

Focus your output on:
- What conventions/patterns this should follow
- Where it deviates and possible reasons why
- How it compares to similar code in the same repo
- Signs of workarounds or intentional divergence

Be concise. Focus on pattern analysis that explains design choices.`,
  };

  return prompts[agent] || "";
}

/**
 * Build prompts for explaining scan results (drift signals)
 */
function buildScanAgentPrompt(agent: string, scanData: string): string {
  const prompts: Record<string, string> = {
    "drift-analyst": `You are analyzing Buoy scan results for this codebase.

Here are the scan results:

${scanData}

Your mission: Analyze the PATTERNS in these drift signals.

Tasks:
1. Group related drift signals (same component, same type, same root cause)
2. Identify the most impactful issues (what affects the most code)
3. Look for systemic problems vs one-off issues
4. Note which components or areas have the most drift

Focus your output on:
- Patterns you see across multiple signals
- The severity distribution and what it means
- Components or areas that need the most attention
- Whether this looks like gradual drift or sudden changes

Be concise. Focus on insights that help prioritize fixes.`,

    "root-cause-investigator": `You are analyzing Buoy scan results for this codebase.

Here are the scan results:

${scanData}

Your mission: Investigate the ROOT CAUSES of drift.

Tasks:
1. For hardcoded values: Why might developers be bypassing tokens?
2. For naming issues: What convention conflicts exist?
3. For orphaned components: Why aren't these in the design system?
4. For deprecated patterns: What's blocking migration?

Focus your output on:
- The likely reasons behind each type of drift
- Whether issues stem from tooling, process, or knowledge gaps
- Common root causes that explain multiple signals
- What's intentional vs accidental

Be concise. Focus on WHY drift is happening, not just WHAT drifted.`,

    "impact-assessor": `You are analyzing Buoy scan results for this codebase.

Here are the scan results:

${scanData}

Your mission: Assess the IMPACT and RISK of this drift.

Tasks:
1. Which drift signals pose the highest risk?
2. What's the blast radius of each issue?
3. Which fixes would have the most positive impact?
4. What happens if this drift continues unchecked?

Focus your output on:
- Risk assessment for the critical and warning signals
- Which components are most heavily affected
- The cumulative effect of the drift patterns
- Priority order for addressing issues

Be concise. Focus on impact and risk, not just listing issues.`,

    "fix-strategist": `You are analyzing Buoy scan results for this codebase.

Here are the scan results:

${scanData}

Your mission: Develop a FIX STRATEGY for the drift.

Tasks:
1. Group fixes that can be done together (same root cause)
2. Identify quick wins vs larger refactors
3. Suggest the order of operations for fixes
4. Note any fixes that might have dependencies

Focus your output on:
- Concrete fix strategies, not vague suggestions
- Which fixes can be automated vs need manual work
- The logical order for addressing drift
- Potential risks or gotchas with fixes

Be concise. Focus on actionable fix strategies.`,
  };

  return prompts[agent] || "";
}

/**
 * Build the synthesis prompt for scan results
 */
function buildScanSynthesisPrompt(scanData: string, findings: AgentResult[]): string {
  const findingsText = findings
    .filter((f) => f.success)
    .map((f) => `## ${f.agent}\n\n${f.output}`)
    .join("\n\n---\n\n");

  return `You are synthesizing an analysis of Buoy scan results.

Original scan data:
${scanData}

Four agents have analyzed these results. Here are their findings:

${findingsText}

---

Your mission: Create a clear, ACTIONABLE summary for the developer.

Create a response with this EXACT structure:

# Design System Health Report

## Summary

[2-3 sentences: How healthy is this codebase? What's the overall drift situation?]

## Key Findings

[3-5 bullet points of the most important insights from the analysis]

## Recommendations

[Numbered list of 3-5 specific, actionable recommendations. Each should have:]
- A clear action title
- Confidence level: (High Confidence), (Medium Confidence), or (Low Confidence)
- 2-3 sentences explaining the fix and its impact
- Specific files or components affected if known

Order by priority - most impactful fixes first.

## Quick Wins

[2-3 small fixes that can be done immediately with high confidence]

## Open Questions

[2-3 things that need human judgment or more investigation]

Be direct. Be specific. Make the recommendations genuinely useful.
Focus on what the developer should DO, not just what's wrong.`;
}

/**
 * Build the synthesis prompt that combines all findings
 */
function buildSynthesisPrompt(target: ExplainTarget, findings: AgentResult[]): string {
  const findingsText = findings
    .filter((f) => f.success)
    .map((f) => `## ${f.agent}\n\n${f.output}`)
    .join("\n\n---\n\n");

  return `You are synthesizing an investigation about: ${target.name}

Four agents have investigated this target. Here are their findings:

${findingsText}

---

Your mission: Build a coherent, ACTIONABLE explanation.

Create a response with this EXACT structure:

# ${target.name}

## What We Found

[2-3 paragraphs explaining the history and context. Why does this exist?
How did it evolve? What constraints shaped it?]

## Recommendations

[Numbered list of 2-4 specific, actionable recommendations. Each should have:]
- A clear action title
- Confidence level: (High Confidence), (Medium Confidence), or (Low Confidence)
- 2-3 sentences explaining WHY this action makes sense based on the evidence
- Code example if applicable (use diff format for changes)

Focus on recommendations that are:
- Grounded in evidence from the investigation
- Actually useful (not just "consider refactoring")
- Prioritized by confidence and impact

## Open Questions

[2-3 bullet points of things that remain unclear and might need human input]

Be direct. Be specific. Make the recommendations genuinely useful.`;
}

/**
 * Run a single agent using the Claude CLI
 */
async function runAgent(
  agent: string,
  prompt: string,
  options: { timeout?: number; verbose?: boolean } = {}
): Promise<AgentResult> {
  const timeout = options.timeout || 60000;

  return new Promise((resolve) => {
    // Use --print flag for non-interactive mode, disable MCP to speed up
    const args = ["-p", prompt, "--output-format", "text", "--no-mcp"];

    const child = spawn("claude", args, {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        // Skip project detection to speed up
        CLAUDE_CODE_SKIP_PROJECT_DETECTION: "1",
      },
    });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      const partialInfo = stdout.length > 0 ? ` (got ${stdout.length} chars)` : "";
      const stderrInfo = stderr.length > 0 ? ` stderr: ${stderr.slice(0, 100)}` : "";
      resolve({
        agent,
        success: false,
        output: stdout,
        error: `Agent timed out after ${timeout / 1000}s${partialInfo}${stderrInfo}`,
      });
    }, timeout);

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ agent, success: true, output: stdout.trim() });
      } else {
        resolve({
          agent,
          success: false,
          output: stdout.trim(),
          error: stderr.trim() || `Agent exited with code ${code}`,
        });
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        agent,
        success: false,
        output: "",
        error: `Failed to spawn claude: ${err.message}`,
      });
    });
  });
}

/**
 * Run all investigation agents in parallel, then synthesize
 */
export async function runExplainAgents(
  target: ExplainTarget,
  options: {
    verbose?: boolean;
    quick?: boolean;
    onProgress?: (agent: string, status: "started" | "completed" | "failed") => void;
  } = {}
): Promise<ExplainResult> {
  // Use different agents for scan mode vs file/directory mode
  const agents = target.type === "scan"
    ? ["drift-analyst", "root-cause-investigator", "impact-assessor", "fix-strategist"]
    : ["git-archaeologist", "structure-analyst", "code-reader", "convention-detective"];

  // Timeouts depend on scope and quick mode
  // --all on large codebases needs more time
  const agentTimeout = options.quick ? 60000 : (target.type === "all" ? 180000 : 120000);
  const synthesizerTimeout = options.quick ? 90000 : 300000;

  // Run investigation agents in parallel
  const investigationPromises = agents.map(async (agent) => {
    options.onProgress?.(agent, "started");
    const prompt = buildAgentPrompt(agent, target, options.quick);
    const result = await runAgent(agent, prompt, { timeout: agentTimeout, verbose: options.verbose });
    options.onProgress?.(agent, result.success ? "completed" : "failed");
    return result;
  });

  const findings = await Promise.all(investigationPromises);

  // Run synthesizer with all findings (longer timeout since it processes everything)
  options.onProgress?.("synthesizer", "started");
  const synthesisPrompt = target.type === "scan" && target.scanData
    ? buildScanSynthesisPrompt(target.scanData, findings)
    : buildSynthesisPrompt(target, findings);
  const synthesisResult = await runAgent("synthesizer", synthesisPrompt, {
    timeout: synthesizerTimeout,
    verbose: options.verbose,
  });
  options.onProgress?.("synthesizer", synthesisResult.success ? "completed" : "failed");

  // If synthesis failed, build a fallback from the findings
  let synthesis: string;
  if (synthesisResult.success) {
    synthesis = synthesisResult.output;
  } else if (synthesisResult.output && synthesisResult.output.length > 100) {
    // Partial output is available - use it
    synthesis = `${synthesisResult.output}\n\n---\n*Note: Synthesis was interrupted but partial analysis above may be useful.*`;
  } else {
    // Build manual summary from individual findings
    synthesis = buildFallbackSynthesis(target, findings);
  }

  return {
    target,
    findings,
    synthesis,
  };
}

/**
 * Build a fallback synthesis when the synthesizer agent fails
 */
function buildFallbackSynthesis(target: ExplainTarget, findings: AgentResult[]): string {
  const successfulFindings = findings.filter((f) => f.success);

  if (successfulFindings.length === 0) {
    return `# Analysis Failed

Unable to complete analysis of ${target.name}. All investigation agents failed.

Please try again or check your network connection.`;
  }

  let output = `# ${target.name}

*Note: Full synthesis unavailable. Showing individual agent findings.*

`;

  for (const finding of successfulFindings) {
    const agentTitle = finding.agent
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    output += `## ${agentTitle}\n\n`;
    output += finding.output;
    output += "\n\n---\n\n";
  }

  output += `## Next Steps

Review the findings above and look for:
- Patterns that appear in multiple agent reports
- High-confidence observations vs speculation
- Actionable items you can address immediately

Run with \`--verbose\` for full agent output.`;

  return output;
}
