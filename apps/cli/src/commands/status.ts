import { Command } from "commander";
import chalk from "chalk";
import { loadConfig, getConfigPath } from "../config/loader.js";
import { buildAutoConfig } from "../config/auto-detect.js";
import {
  spinner,
  success,
  error,
  info,
  coverageGrid,
  setJsonMode,
  type CoverageStats,
} from "../output/reporters.js";
import { ProjectDetector } from "../detect/project-detector.js";
import { ScanOrchestrator } from "../scan/orchestrator.js";
import type { BuoyConfig } from "../config/schema.js";
import type { DriftSignal } from "@buoy-design/core";

export function createStatusCommand(): Command {
  const cmd = new Command("status")
    .description("Show design system coverage at a glance")
    .option("--json", "Output as JSON")
    .option("-v, --verbose", "Verbose output")
    .action(async (options) => {
      // Set JSON mode before creating spinner to redirect spinner to stderr
      if (options.json) {
        setJsonMode(true);
      }
      const spin = spinner("Analyzing design system coverage...");

      try {
        // Load config, or auto-detect if none exists
        const configPath = getConfigPath();
        let config: BuoyConfig;
        let isAutoDetected = false;

        if (configPath) {
          const result = await loadConfig();
          config = result.config;
        } else {
          // Zero-config mode: auto-detect everything
          spin.text = "Auto-detecting project setup...";
          const autoResult = await buildAutoConfig(process.cwd());
          config = autoResult.config;
          isAutoDetected = true;

          // Show what we detected
          if (autoResult.detected.length > 0) {
            spin.stop();
            console.log(chalk.cyan.bold("⚡ Zero-config mode"));
            console.log(chalk.dim("   Auto-detected:"));
            for (const d of autoResult.detected) {
              console.log(`   ${chalk.green("•")} ${d.name} ${chalk.dim(`(${d.evidence})`)}`);
            }
            if (autoResult.tokenFiles.length > 0) {
              console.log(`   ${chalk.green("•")} ${autoResult.tokenFiles.length} token file(s)`);
            }
            console.log("");
            spin.start();
          }
        }

        // Scan components using orchestrator
        spin.text = "Scanning components...";
        const orchestrator = new ScanOrchestrator(config);
        const { components } = await orchestrator.scanComponents({
          onProgress: (msg) => {
            spin.text = msg;
          },
        });

        // Detect frameworks for sprawl check
        spin.text = "Detecting frameworks...";
        const detector = new ProjectDetector(process.cwd());
        const projectInfo = await detector.detect();

        // Run drift analysis
        spin.text = "Analyzing drift...";
        const { SemanticDiffEngine } =
          await import("@buoy-design/core/analysis");
        const engine = new SemanticDiffEngine();
        const diffResult = engine.analyzeComponents(components, {
          checkDeprecated: true,
          checkNaming: true,
          checkDocumentation: true,
        });

        const drifts: DriftSignal[] = [...diffResult.drifts];

        // Check for framework sprawl
        const sprawlSignal = engine.checkFrameworkSprawl(
          projectInfo.frameworks.map((f) => ({
            name: f.name,
            version: f.version,
          })),
        );
        if (sprawlSignal) {
          drifts.push(sprawlSignal);
        }

        // Calculate coverage stats
        const driftingComponentIds = new Set(
          drifts.map((d) => d.source.entityId),
        );

        const stats: CoverageStats = {
          aligned: components.filter((c) => !driftingComponentIds.has(c.id))
            .length,
          drifting: driftingComponentIds.size,
          untracked: 0, // For future: components not yet analyzed
          total: components.length,
        };

        spin.stop();

        // Group components by status
        const alignedComponents = components.filter(
          (c) => !driftingComponentIds.has(c.id),
        );
        const driftingComponentsList = components.filter((c) =>
          driftingComponentIds.has(c.id),
        );

        // Output
        if (options.json) {
          console.log(
            JSON.stringify(
              {
                stats,
                alignedPercent:
                  stats.total > 0
                    ? Math.round((stats.aligned / stats.total) * 100)
                    : 0,
                frameworks: projectInfo.frameworks.map((f) => ({
                  name: f.name,
                  version: f.version,
                })),
                frameworkSprawl: sprawlSignal !== null,
                components: {
                  aligned: alignedComponents.map((c) => ({
                    id: c.id,
                    name: c.name,
                    path: "path" in c.source ? c.source.path : undefined,
                  })),
                  drifting: driftingComponentsList.map((c) => ({
                    id: c.id,
                    name: c.name,
                    path: "path" in c.source ? c.source.path : undefined,
                  })),
                },
              },
              null,
              2,
            ),
          );
          return;
        }

        if (stats.total === 0) {
          info("No components found to analyze.");
          console.log("");
          info("Options:");
          info(
            "  - Run " +
              chalk.cyan("buoy bootstrap") +
              " to extract tokens from existing code",
          );
          info(
            "  - Run " +
              chalk.cyan("buoy build") +
              " to generate a design system with AI",
          );
          info("  - Check your config has component paths configured");
          return;
        }

        // Display framework sprawl warning if detected
        if (sprawlSignal) {
          console.log("");
          console.log(chalk.yellow.bold("Warning: Framework Sprawl Detected"));
          console.log(chalk.dim("   Multiple UI frameworks in use:"));
          projectInfo.frameworks.forEach((f) => {
            const version =
              f.version !== "unknown" ? chalk.dim(` (${f.version})`) : "";
            console.log(`   - ${chalk.cyan(f.name)}${version}`);
          });
          console.log("");
        }

        // Display the coverage grid
        coverageGrid(stats);

        // Display component lists
        console.log("");

        if (driftingComponentsList.length > 0) {
          console.log(chalk.yellow("Drifting:"));
          driftingComponentsList.forEach((c) => {
            console.log(`  ${c.name}`);
          });
          console.log("");
        }

        if (alignedComponents.length > 0) {
          console.log(chalk.green("Aligned:"));
          alignedComponents.forEach((c) => {
            console.log(`  ${c.name}`);
          });
          console.log("");
        }

        // Summary message
        const alignedPct = Math.round((stats.aligned / stats.total) * 100);
        if (alignedPct === 100) {
          success("Perfect alignment! No drift detected.");
        } else if (alignedPct >= 80) {
          success("Good alignment. Minor drift to review.");
        } else if (alignedPct >= 50) {
          info("Moderate alignment. Consider reviewing drifting components.");
        } else {
          error("Low alignment. Run buoy drift check for details.");
        }

        // Show hint to save config if we auto-detected
        if (isAutoDetected) {
          console.log("");
          console.log(chalk.dim("─".repeat(50)));
          console.log(
            chalk.dim("💡 ") +
              "Run " +
              chalk.cyan("buoy init") +
              " to save this configuration"
          );
        }
      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Status check failed: ${message}`);

        if (options.verbose) {
          console.error(err);
        }

        process.exit(1);
      }
    });

  return cmd;
}
