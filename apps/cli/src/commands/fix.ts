/**
 * Fix Command
 *
 * Suggests and applies fixes for hardcoded values by replacing them with design tokens.
 */

import { Command } from "commander";
import chalk from "chalk";
import { loadConfig, getConfigPath } from "../config/loader.js";
import { buildAutoConfig } from "../config/auto-detect.js";
import {
  spinner,
  success,
  error,
  warning,
  setJsonMode,
} from "../output/reporters.js";
import {
  formatFixPreview,
  formatFixDiff,
  formatFixResult,
  formatSafetyCheck,
  formatFixesJson,
} from "../output/fix-formatters.js";
import { ScanOrchestrator } from "../scan/orchestrator.js";
import {
  applyFixes,
  runSafetyChecks,
  validateFixTargets,
} from "../fix/index.js";
import {
  generateFixes,
  type Fix,
  type ConfidenceLevel,
  type DesignToken,
  type DriftSignal,
} from "@buoy-design/core";
import type { BuoyConfig } from "../config/schema.js";

export function createFixCommand(): Command {
  const cmd = new Command("fix")
    .description("Suggest and apply fixes for design drift issues")
    .option("--apply", "Apply fixes to source files")
    .option("--dry-run", "Show detailed diff without applying changes")
    .option(
      "-c, --confidence <level>",
      "Minimum confidence level (high, medium, low)",
      "high",
    )
    .option(
      "-t, --type <types>",
      "Fix types to include (comma-separated: hardcoded-color,hardcoded-spacing)",
    )
    .option(
      "-f, --file <patterns>",
      "File glob patterns to include (comma-separated)",
    )
    .option(
      "--exclude <patterns>",
      "File glob patterns to exclude (comma-separated)",
    )
    .option("--backup", "Create .bak backup files before modifying")
    .option("--json", "Output as JSON")
    .option("--force", "Skip safety checks")
    .action(async (options) => {
      if (options.json) {
        setJsonMode(true);
      }

      const spin = spinner("Loading configuration...");

      try {
        // Load or auto-detect config
        const existingConfigPath = getConfigPath();
        let config: BuoyConfig;

        if (existingConfigPath) {
          const result = await loadConfig();
          config = result.config;
        } else {
          spin.text = "Auto-detecting project setup...";
          const autoResult = await buildAutoConfig(process.cwd());
          config = autoResult.config;
        }

        // Run scan to get drift signals and tokens
        spin.text = "Scanning for drift signals...";
        const orchestrator = new ScanOrchestrator(config, process.cwd());
        const scanResult = await orchestrator.scan();

        // Get tokens from scan
        const tokens = scanResult.tokens || [];

        if (tokens.length === 0) {
          spin.stop();
          // No Dead Ends: Show what we found and guide next steps
          console.log("");
          warning("No design tokens found to match against");
          console.log("");
          console.log("  But here's what I found:");
          if (scanResult.components.length > 0) {
            console.log(
              `    • ${scanResult.components.length} components scanned`,
            );
          }
          const frameworks = config.sources
            ? Object.keys(config.sources).filter(
                (k) =>
                  config.sources[k as keyof typeof config.sources]?.enabled,
              )
            : [];
          if (frameworks.length > 0) {
            console.log(`    • Frameworks: ${frameworks.join(", ")}`);
          }
          console.log("");
          console.log("  Next steps:");
          console.log(
            "    • Run `buoy tokens` to extract tokens from hardcoded values",
          );
          console.log("    • Or create a tokens file (design-tokens.json)");
          console.log("    • Run `buoy show all` to see full analysis");
          console.log("");
          return;
        }

        // Run drift analysis to get hardcoded value signals
        spin.text = "Analyzing for hardcoded values...";
        const { SemanticDiffEngine } =
          await import("@buoy-design/core/analysis");
        const engine = new SemanticDiffEngine();
        const components = scanResult.components || [];

        // Pass availableTokens to get token suggestions for hardcoded values
        const diffResult = engine.analyzeComponents(components, {
          availableTokens: tokens as DesignToken[],
        });

        // Get drift signals (hardcoded values specifically)
        const driftSignals: DriftSignal[] = diffResult.drifts.filter((d) =>
          d.type.startsWith("hardcoded-"),
        );

        if (driftSignals.length === 0) {
          spin.stop();
          
          // If no components were found, we might have missed inline styles
          if (components.length === 0) {
            console.log("");
            warning("No components found for analysis");
            console.log("");
            console.log("  The fix command analyzes component props for drift.");
            console.log("  To see hardcoded inline styles:");
            console.log(`    ${chalk.cyan("buoy show health")}   # See all hardcoded values`);
            console.log(`    ${chalk.cyan("buoy tokens")}        # Extract values as tokens`);
            console.log("");
            return;
          }
          
          // No Dead Ends: Celebrate success and show what was checked
          console.log("");
          success("No hardcoded values found in components!");
          console.log("");
          console.log("  What was checked:");
          console.log(`    • ${components.length} components scanned`);
          console.log(`    • ${tokens.length} tokens available for matching`);
          const otherDrifts = diffResult.drifts.filter(
            (d) => !d.type.startsWith("hardcoded-"),
          );
          if (otherDrifts.length > 0) {
            console.log("");
            console.log(
              `  Note: ${otherDrifts.length} other drift signals found (naming, etc.)`,
            );
            console.log("    Run `buoy show drift` for full analysis");
          }
          console.log("");
          return;
        }

        // Parse options
        const minConfidence = parseConfidenceLevel(options.confidence);
        const includeTypes = options.type
          ? options.type.split(",").map((t: string) => t.trim())
          : undefined;
        const includeFiles = options.file
          ? options.file.split(",").map((f: string) => f.trim())
          : [];
        const excludeFiles = options.exclude
          ? options.exclude.split(",").map((f: string) => f.trim())
          : [];

        // Generate fixes
        spin.text = "Generating fix suggestions...";
        const fixes = generateFixes(
          driftSignals as DriftSignal[],
          tokens as DesignToken[],
          {
            types: includeTypes,
            minConfidence,
            includeFiles,
            excludeFiles,
          },
        );

        spin.stop();

        if (fixes.length === 0) {
          // No Dead Ends: Explain what didn't match and suggest alternatives
          console.log("");
          warning("No fixable issues match your criteria");
          console.log("");
          console.log(`  Found ${driftSignals.length} hardcoded values, but:`);
          if (minConfidence === "high") {
            console.log("    • No high-confidence fixes available");
            console.log("    • Try: --confidence medium or --confidence low");
          }
          if (includeTypes?.length) {
            console.log(`    • Types filter: ${includeTypes.join(", ")}`);
            console.log("    • Try: Remove --type filter to see all issues");
          }
          if (includeFiles.length > 0) {
            console.log(`    • File filter: ${includeFiles.join(", ")}`);
            console.log("    • Try: Remove --file filter to see all files");
          }
          console.log("");
          console.log(
            "  Or run `buoy fix --dry-run` without filters to preview all fixes",
          );
          console.log("");
          return;
        }

        // Validate fix targets
        const { valid, invalid } = validateFixTargets(fixes);
        if (invalid.length > 0) {
          warning(
            `${invalid.length} fixes have invalid targets and will be skipped`,
          );
        }

        // Output based on mode
        if (options.json) {
          console.log(formatFixesJson(valid));
          return;
        }

        if (options.apply) {
          // Apply mode: actually modify files
          await handleApplyMode(valid, options);
        } else if (options.dryRun) {
          // Dry-run mode: show detailed diff
          console.log(formatFixDiff(valid));
        } else {
          // Default preview mode
          console.log(formatFixPreview(valid));
        }
      } catch (err) {
        spin.stop();
        error(err instanceof Error ? err.message : "Fix command failed");
        process.exit(1);
      }
    });

  return cmd;
}

/**
 * Handle apply mode - run safety checks and apply fixes
 */
async function handleApplyMode(
  fixes: Fix[],
  options: { backup?: boolean; force?: boolean; confidence?: string },
): Promise<void> {
  // Run safety checks unless forced
  if (!options.force) {
    const safetyResult = runSafetyChecks(fixes);
    console.log(formatSafetyCheck(safetyResult));

    if (!safetyResult.safe) {
      error("Safety checks failed. Use --force to override.");
      process.exit(1);
    }

    if (safetyResult.warnings.length > 0) {
      console.log("");
      warning("Proceeding despite warnings...");
      console.log("");
    }
  }

  // Apply fixes
  const spin = spinner("Applying fixes...");
  const minConfidence = parseConfidenceLevel(options.confidence || "high");

  try {
    const result = await applyFixes(fixes, {
      dryRun: false,
      backup: options.backup,
      minConfidence,
    });

    spin.stop();
    console.log(formatFixResult(result));

    if (result.failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    spin.stop();
    error(err instanceof Error ? err.message : "Failed to apply fixes");
    process.exit(1);
  }
}

/**
 * Parse confidence level from string
 */
function parseConfidenceLevel(level: string): ConfidenceLevel {
  const normalized = level.toLowerCase();
  if (
    normalized === "high" ||
    normalized === "medium" ||
    normalized === "low"
  ) {
    return normalized;
  }
  return "high";
}
