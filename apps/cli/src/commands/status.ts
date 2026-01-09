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
  newline,
  type CoverageStats,
} from "../output/reporters.js";
import { ProjectDetector } from "../detect/project-detector.js";
import { ScanOrchestrator } from "../scan/orchestrator.js";
import type { BuoyConfig } from "../config/schema.js";
import type { DriftSignal, Component } from "@buoy-design/core";
import { discoverProject, formatInsightsBlock, promptNextAction, isTTY } from '../insights/index.js';
import { createStore, getProjectName, type ScanStore, type ScanSnapshot } from '../store/index.js';
import { withOptionalCache, type ScanCache } from "@buoy-design/scanners";

export function createStatusCommand(): Command {
  const cmd = new Command("status")
    .description("Show design system coverage at a glance")
    .option("--json", "Output as JSON")
    .option("-v, --verbose", "Verbose output")
    .option("--cached", "Use last scan results instead of rescanning")
    .option("--trend", "Show historical trend data")
    .option("--no-cache", "Disable incremental scanning cache")
    .option("--clear-cache", "Clear cache before scanning")
    .action(async (options) => {
      // Set JSON mode before creating spinner to redirect spinner to stderr
      if (options.json) {
        setJsonMode(true);
      }
      const spin = spinner("Analyzing design system coverage...");
      let store: ScanStore | undefined;

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

        // Initialize store for caching/trends
        let snapshots: ScanSnapshot[] = [];
        let components: Component[] = [];

        try {
          store = createStore();
          const projectName = config.project?.name || getProjectName();
          const project = await store.getOrCreateProject(projectName);

          // Load historical snapshots for trend data
          if (options.trend || options.cached) {
            snapshots = await store.getSnapshots(project.id, 10);
          }

          // Use cached results if requested and available
          if (options.cached) {
            const latestScan = await store.getLatestScan(project.id);
            if (latestScan && latestScan.status === 'completed') {
              spin.text = "Loading cached results...";
              components = await store.getComponents(latestScan.id);

              if (components.length > 0) {
                if (options.verbose) {
                  info(`Using cached scan from ${latestScan.completedAt?.toLocaleDateString() || 'unknown'}`);
                }
              }
            }
          }
        } catch {
          // Store not available, continue with live scan
          if (options.verbose) {
            info("No cached data available, running live scan");
          }
        }

        // If no cached components, run live scan
        if (components.length === 0) {
          spin.text = "Scanning components...";

          // Use cache wrapper for guaranteed cleanup
          const { result: scanResult } = await withOptionalCache(
            process.cwd(),
            options.cache !== false,
            async (cache: ScanCache | undefined) => {
              const orchestrator = new ScanOrchestrator(config, process.cwd(), { cache });
              return orchestrator.scanComponents({
                onProgress: (msg) => {
                  spin.text = msg;
                },
              });
            },
            {
              clearCache: options.clearCache,
              onVerbose: options.verbose ? info : undefined,
            },
          );
          components = scanResult.components;
        }

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
                history: snapshots.map(s => ({
                  scanId: s.scanId,
                  date: s.createdAt,
                  componentCount: s.componentCount,
                  tokenCount: s.tokenCount,
                  driftCount: s.driftCount,
                  summary: s.summary,
                })),
              },
              null,
              2,
            ),
          );
          store?.close();
          return;
        }

        if (stats.total === 0) {
          // Show insights instead of bare "no components"
          const insights = await discoverProject(process.cwd());

          console.log(chalk.bold('Design System Status'));
          console.log(chalk.dim('────────────────────'));
          console.log('');
          console.log(`Coverage: ${chalk.dim('N/A')} (no component scanners active)`);
          console.log('');
          console.log(formatInsightsBlock(insights));

          // Offer interactive next step if TTY
          if (isTTY()) {
            const nextCmd = await promptNextAction(insights);
            if (nextCmd) {
              console.log(chalk.dim(`\nRunning: ${nextCmd}\n`));
              try {
                const { execSync } = await import('child_process');
                execSync(nextCmd, { stdio: 'inherit', cwd: process.cwd() });
              } catch {
                // Command failed - user already saw the error output
              }
            }
          }
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

        // Show trend data if requested and available
        if (options.trend && snapshots.length > 1) {
          newline();
          console.log(chalk.bold("Trend") + chalk.dim(" (last " + snapshots.length + " scans)"));
          console.log(chalk.dim("─".repeat(40)));

          // Show mini sparkline of drift counts
          const driftCounts = snapshots.map(s => s.driftCount).reverse();
          const maxDrift = Math.max(...driftCounts, 1);
          const bars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

          const sparkline = driftCounts.map(count => {
            const idx = Math.min(Math.floor((count / maxDrift) * (bars.length - 1)), bars.length - 1);
            return count > 0 ? chalk.yellow(bars[idx]) : chalk.green(bars[0]);
          }).join('');

          console.log(`Drift: ${sparkline} ${chalk.dim(`(${driftCounts[driftCounts.length - 1]} now)`)}`);

          // Show component count trend
          const compCounts = snapshots.map(s => s.componentCount).reverse();
          const current = compCounts[compCounts.length - 1] ?? 0;
          const previous = compCounts.length > 1 ? (compCounts[compCounts.length - 2] ?? current) : current;
          const delta = current - previous;

          if (delta > 0) {
            console.log(`Components: ${current} ${chalk.green(`+${delta}`)}`);
          } else if (delta < 0) {
            console.log(`Components: ${current} ${chalk.red(`${delta}`)}`);
          } else {
            console.log(`Components: ${current} ${chalk.dim('(no change)')}`);
          }
        } else if (options.trend) {
          newline();
          info("No historical data yet. Run more scans to see trends.");
        }

        // Show hint to save config if we auto-detected
        if (isAutoDetected) {
          console.log("");
          console.log(chalk.dim("─".repeat(50)));
          console.log(
            chalk.dim("💡 ") +
              "Run " +
              chalk.cyan("buoy dock") +
              " to save this configuration"
          );
        }

        // Show upgrade prompt when drift is detected (conversion opportunity)
        if (drifts.length > 0) {
          console.log("");
          console.log(chalk.dim("─".repeat(50)));
          console.log(
            chalk.dim("💡 ") +
              "Upgrade to " +
              chalk.cyan("Team") +
              " to post these findings to GitHub PRs"
          );
          console.log(
            chalk.dim("   ") +
              "Run " +
              chalk.cyan("buoy plans") +
              " to compare plans"
          );
        }

        // Cleanup store connection
        store?.close();
      } catch (err) {
        spin.stop();
        store?.close();
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
