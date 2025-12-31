import { Command } from "commander";
import chalk from "chalk";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  spinner,
  success,
  error,
  info,
  newline,
} from "../output/reporters.js";
import {
  resolveTarget,
  runExplainAgents,
  type ExplainTarget,
} from "../explain/agents.js";
import { loadConfig } from "../config/loader.js";
import { ScanOrchestrator } from "../scan/orchestrator.js";
import type { DriftSignal } from "@buoy-design/core";

export function createExplainCommand(): Command {
  const cmd = new Command("explain")
    .description("AI-powered investigation of code and drift signals")
    .argument("[target]", "File, directory, or drift:<id> (runs scan if omitted)")
    .option("-a, --all", "Explain the entire design system")
    .option("-s, --save", "Save the explanation to .buoy/explain/")
    .option("-o, --output <path>", "Save explanation to custom path")
    .option("-v, --verbose", "Show detailed agent progress")
    .option("-q, --quick", "Quick analysis (shorter prompts, faster)")
    .option("--json", "Output as JSON")
    .action(async (targetArg, options) => {
      try {
        // Resolve target
        let target: ExplainTarget | null = resolveTarget(targetArg, options.all);

        // If no target, run scan mode - explain the current drift state
        if (!target) {
          target = await runScanAndBuildTarget();
          if (!target) {
            success("No drift detected. Your design system is aligned!");
            newline();
            info("To investigate specific code, try:");
            console.log(chalk.gray("  buoy explain src/components/Button.tsx"));
            console.log(chalk.gray("  buoy explain src/components/"));
            return;
          }
        }

        // Progress tracking
        const agentStatus: Record<string, string> = {};
        const spin = spinner(`Investigating ${target.name}...`);

        const updateSpinner = () => {
          const statuses = Object.entries(agentStatus)
            .map(([agent, status]) => {
              const icon = status === "completed" ? "✓" : status === "failed" ? "✗" : "○";
              const color = status === "completed" ? chalk.green : status === "failed" ? chalk.red : chalk.gray;
              return color(`${icon} ${agent}`);
            })
            .join("  ");
          spin.text = `Investigating ${target.name}...\n  ${statuses}`;
        };

        // Run agents
        const result = await runExplainAgents(target, {
          verbose: options.verbose,
          quick: options.quick,
          onProgress: (agent, status) => {
            const displayName = agent
              .split("-")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" ");
            agentStatus[displayName] = status;
            updateSpinner();
          },
        });

        spin.stop();
        newline();

        // Check for failures
        const failures = result.findings.filter((f) => !f.success);
        if (failures.length > 0) {
          newline();
          for (const f of failures) {
            console.log(chalk.yellow(`⚠ ${f.agent}: ${f.error}`));
          }
          newline();

          // If ALL failed, show help
          if (failures.length === result.findings.length) {
            info("All agents failed. Common causes:");
            console.log(chalk.gray("  • Claude CLI not installed (run: npm install -g @anthropic-ai/claude-code)"));
            console.log(chalk.gray("  • Not authenticated (run: claude login)"));
            console.log(chalk.gray("  • Network issues"));
            newline();
          }
        }

        // Output
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          // Print the synthesis with nice formatting
          console.log(chalk.gray("─".repeat(60)));
          newline();
          console.log(result.synthesis);
          newline();
          console.log(chalk.gray("─".repeat(60)));
        }

        // Save if requested
        if (options.save || options.output) {
          const outputDir = options.output || join(process.cwd(), ".buoy", "explain");
          mkdirSync(outputDir, { recursive: true });

          const filename = `${target.name}.md`;
          const filepath = join(outputDir, filename);

          writeFileSync(filepath, result.synthesis);
          newline();
          success(`Saved to ${filepath}`);
        }

        // Verbose: show individual agent outputs
        if (options.verbose) {
          newline();
          info("Individual agent findings:");
          newline();
          for (const finding of result.findings) {
            if (finding.success) {
              console.log(chalk.bold.cyan(`── ${finding.agent} ──`));
              console.log(finding.output);
              newline();
            }
          }
        }
      } catch (err) {
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  return cmd;
}

/**
 * Run a Buoy scan and build an ExplainTarget from the results
 */
async function runScanAndBuildTarget(): Promise<ExplainTarget | null> {
  const spin = spinner("Scanning for drift...");

  try {
    const { config } = await loadConfig();
    const orchestrator = new ScanOrchestrator(config);

    const { components } = await orchestrator.scanComponents({
      onProgress: (msg) => {
        spin.text = msg;
      },
    });

    spin.text = "Analyzing drift...";

    const { SemanticDiffEngine } = await import("@buoy-design/core/analysis");
    const engine = new SemanticDiffEngine();
    const diffResult = engine.analyzeComponents(components, {
      checkDeprecated: true,
      checkNaming: true,
      checkDocumentation: true,
    });

    spin.stop();

    const drifts = diffResult.drifts;
    if (drifts.length === 0) {
      return null;
    }

    // Format drift data for AI analysis
    const scanData = formatDriftsForAI(drifts, components.length);

    return {
      type: "scan",
      path: process.cwd(),
      name: "current-drift",
      scanData,
    };
  } catch (err) {
    spin.stop();
    throw err;
  }
}

/**
 * Format drift signals into a structured text for AI analysis
 */
function formatDriftsForAI(drifts: DriftSignal[], componentCount: number): string {
  const summary = {
    total: drifts.length,
    critical: drifts.filter((d) => d.severity === "critical").length,
    warning: drifts.filter((d) => d.severity === "warning").length,
    info: drifts.filter((d) => d.severity === "info").length,
  };

  const byType: Record<string, DriftSignal[]> = {};
  for (const drift of drifts) {
    if (!byType[drift.type]) {
      byType[drift.type] = [];
    }
    byType[drift.type]!.push(drift);
  }

  let output = `# Buoy Scan Results

## Summary
- Components scanned: ${componentCount}
- Total drift signals: ${summary.total}
- Critical: ${summary.critical}
- Warning: ${summary.warning}
- Info: ${summary.info}

## Drift Signals by Type

`;

  for (const [type, signals] of Object.entries(byType)) {
    output += `### ${type} (${signals.length})\n\n`;
    for (const signal of signals.slice(0, 10)) { // Limit to avoid token overflow
      output += `- **${signal.source.entityName}** (${signal.severity})\n`;
      output += `  ${signal.message}\n`;
      if (signal.source.location) {
        output += `  Location: ${signal.source.location}\n`;
      }
      const suggestions = signal.details?.suggestions;
      if (suggestions && suggestions.length > 0) {
        output += `  Suggestion: ${suggestions[0]}\n`;
      }
      output += "\n";
    }
    if (signals.length > 10) {
      output += `  ... and ${signals.length - 10} more ${type} signals\n\n`;
    }
  }

  return output;
}
