import { Command } from "commander";
import chalk from "chalk";
import { existsSync } from "fs";
import { loadConfig } from "../config/loader.js";
import {
  spinner,
  success,
  error,
  info,
  warning,
  header,
  keyValue,
  newline,
  setJsonMode,
} from "../output/reporters.js";
import {
  formatDriftTable,
  formatDriftList,
  formatJson,
  formatMarkdown,
  formatHtml,
  formatAgent,
} from "../output/formatters.js";
import { writeFileSync } from "fs";
import type { DriftSignal, Severity } from "@buoy-design/core";
import { DriftAnalysisService } from "../services/drift-analysis.js";
import { withOptionalCache, type ScanCache } from "@buoy-design/scanners";

export function createDriftCommand(): Command {
  const cmd = new Command("drift")
    .description("Detect design system drift in your codebase")
    .option(
      "-S, --severity <level>",
      "Filter by minimum severity (info, warning, critical)",
    )
    .option("-t, --type <type>", "Filter by drift type")
    .option("--json", "Output as JSON")
    .option("--markdown", "Output as Markdown")
    .option("--html [file]", "Output as HTML report (optionally specify filename)")
    .option("--agent", "Output optimized for AI agents (concise, actionable)")
    .option("--compact", "Compact table output (less detail)")
    .option("-v, --verbose", "Verbose output")
    .option("--include-baseline", "Include baselined drifts (show all)")
    .option("--no-cache", "Disable incremental scanning cache")
    .option("--clear-cache", "Clear cache before scanning")
    .action(async (options) => {
      // Set JSON mode before creating spinner to redirect spinner to stderr
      if (options.json || options.agent) {
        setJsonMode(true);
      }
      const spin = spinner("Loading configuration...");

      try {
        const { config } = await loadConfig();
        spin.text = "Scanning for drift...";

        // Use cache wrapper for guaranteed cleanup
        const { result } = await withOptionalCache(
          process.cwd(),
          options.cache !== false,
          async (cache: ScanCache | undefined) => {
            const service = new DriftAnalysisService(config);
            return service.analyze({
              onProgress: (msg) => {
                spin.text = msg;
              },
              includeBaseline: options.includeBaseline,
              minSeverity: options.severity as Severity | undefined,
              filterType: options.type,
              cache,
            });
          },
          {
            clearCache: options.clearCache,
            onVerbose: options.verbose ? info : undefined,
          },
        );

        const drifts = result.drifts;
        const sourceComponents = result.components;
        const baselinedCount = result.baselinedCount;

        spin.stop();

        // Output results
        if (options.agent) {
          console.log(formatAgent(drifts));
          return;
        }

        if (options.json) {
          console.log(
            formatJson({
              drifts,
              summary: getSummary(drifts),
              baselinedCount,
            }),
          );
          return;
        }

        if (options.markdown) {
          console.log(formatMarkdown(drifts));
          return;
        }

        if (options.html) {
          const htmlContent = formatHtml(drifts, { designerFriendly: true });
          const filename = typeof options.html === 'string' ? options.html : 'drift-report.html';
          writeFileSync(filename, htmlContent);
          success(`HTML report saved to ${filename}`);
          return;
        }

        header("Drift Analysis");
        newline();

        const summary = getSummary(drifts);
        keyValue("Components scanned", String(sourceComponents.length));
        keyValue("Critical", String(summary.critical));
        keyValue("Warning", String(summary.warning));
        keyValue("Info", String(summary.info));
        if (baselinedCount > 0) {
          keyValue("Baselined (hidden)", String(baselinedCount));
        }
        newline();

        // Use compact table or detailed list
        if (options.compact) {
          console.log(formatDriftTable(drifts));
        } else {
          console.log(formatDriftList(drifts));
        }
        newline();

        if (summary.critical > 0) {
          warning(`${summary.critical} critical issues require attention.`);
        } else if (drifts.length === 0) {
          // Check if we scanned any components
          if (sourceComponents.length === 0) {
            info("No components found to analyze.");
            newline();
            info("The drift command analyzes component props.");
            info("To find hardcoded inline styles:");
            info("  " + chalk.cyan("buoy show health") + "  # See all hardcoded values");
            info("  " + chalk.cyan("buoy tokens") + "       # Extract values as tokens");
          } else {
            // Check if we have any reference sources to compare against
            const hasTokens = config.sources.tokens?.enabled &&
              (config.sources.tokens.files?.length ?? 0) > 0;
            const hasFigma = config.sources.figma?.enabled;
            const hasStorybook = config.sources.storybook?.enabled;
            const hasDesignTokensFile = existsSync('design-tokens.css') ||
              existsSync('design-tokens.json');

            if (!hasTokens && !hasFigma && !hasStorybook && !hasDesignTokensFile) {
              info("No drift detected, but no reference source is configured.");
              newline();
              info("To detect hardcoded values vs design tokens:");
              info("  1. Run " + chalk.cyan("buoy tokens") + " to extract design tokens");
              info("  2. Configure tokens in buoy.config.mjs:");
              console.log(chalk.gray(`
       sources: {
         tokens: {
           enabled: true,
           files: ['design-tokens.css'],
         },
       },
  `));
              info("Or connect a design source: Figma, Storybook, or token files");
            } else {
              success("No drift detected. Your design system is aligned!");
            }
          }
        } else {
          info(
            `Found ${drifts.length} drift signals. Run with --compact for summary view.`,
          );
        }
      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Drift check failed: ${message}`);

        if (options.verbose) {
          console.error(err);
        }

        process.exit(1);
      }
    });

  return cmd;
}

function getSummary(drifts: DriftSignal[]): {
  critical: number;
  warning: number;
  info: number;
} {
  return {
    critical: drifts.filter((d) => d.severity === "critical").length,
    warning: drifts.filter((d) => d.severity === "warning").length,
    info: drifts.filter((d) => d.severity === "info").length,
  };
}
