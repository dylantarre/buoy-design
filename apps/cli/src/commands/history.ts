import { Command } from "commander";
import chalk from "chalk";
import { loadConfig, getConfigPath } from "../config/loader.js";
import { buildAutoConfig } from "../config/auto-detect.js";
import {
  spinner,
  error,
  info,
  header,
  keyValue,
  newline,
  setJsonMode,
} from "../output/reporters.js";
import type { BuoyConfig } from "../config/schema.js";
import { createStore, getProjectName } from "../store/index.js";

export function createHistoryCommand(): Command {
  const cmd = new Command("history")
    .description("View scan history and trends")
    .option("--json", "Output as JSON")
    .option("-n, --limit <number>", "Number of scans to show", "10")
    .option("-v, --verbose", "Show detailed information")
    .action(async (options) => {
      if (options.json) {
        setJsonMode(true);
      }
      const spin = spinner("Loading scan history...");

      try {
        // Load config for project name
        const configPath = getConfigPath();
        let config: BuoyConfig;

        if (configPath) {
          const result = await loadConfig();
          config = result.config;
        } else {
          const autoResult = await buildAutoConfig(process.cwd());
          config = autoResult.config;
        }

        const store = createStore();
        const projectName = config.project?.name || getProjectName();

        try {
          const project = await store.getOrCreateProject(projectName);
          const limit = parseInt(options.limit, 10) || 10;
          const scans = await store.getScans(project.id, limit);
          const snapshots = await store.getSnapshots(project.id, limit);

          spin.stop();

          if (options.json) {
            console.log(
              JSON.stringify(
                {
                  project: {
                    id: project.id,
                    name: project.name,
                  },
                  scans: scans.map((s) => ({
                    id: s.id,
                    status: s.status,
                    sources: s.sources,
                    stats: s.stats,
                    startedAt: s.startedAt,
                    completedAt: s.completedAt,
                  })),
                  snapshots: snapshots.map((s) => ({
                    scanId: s.scanId,
                    componentCount: s.componentCount,
                    tokenCount: s.tokenCount,
                    driftCount: s.driftCount,
                    summary: s.summary,
                    createdAt: s.createdAt,
                  })),
                },
                null,
                2
              )
            );
            store.close();
            return;
          }

          header("Scan History");
          newline();

          keyValue("Project", project.name);
          keyValue("Total scans", String(scans.length));
          newline();

          if (scans.length === 0) {
            info("No scans recorded yet. Run " + chalk.cyan("buoy sweep") + " to start tracking.");
            store.close();
            return;
          }

          // Display scans in a table format
          console.log(
            chalk.dim("ID".padEnd(15)) +
              chalk.dim("Status".padEnd(12)) +
              chalk.dim("Components".padEnd(12)) +
              chalk.dim("Drift".padEnd(8)) +
              chalk.dim("Date")
          );
          console.log(chalk.dim("─".repeat(60)));

          for (const scan of scans) {
            const snapshot = snapshots.find((s) => s.scanId === scan.id);
            const statusColor =
              scan.status === "completed"
                ? chalk.green
                : scan.status === "failed"
                ? chalk.red
                : chalk.yellow;

            const date = scan.completedAt || scan.startedAt || scan.createdAt;
            const dateStr = date ? formatRelativeDate(date) : "—";

            const compCount = snapshot?.componentCount ?? scan.stats?.componentCount ?? "—";
            const driftCount = snapshot?.driftCount ?? scan.stats?.driftCount ?? "—";

            console.log(
              chalk.cyan(scan.id.padEnd(15)) +
                statusColor(scan.status.padEnd(12)) +
                String(compCount).padEnd(12) +
                String(driftCount).padEnd(8) +
                chalk.dim(dateStr)
            );

            // Show verbose details
            if (options.verbose && snapshot) {
              console.log(
                chalk.dim("  ") +
                  `Critical: ${snapshot.summary.critical}, ` +
                  `Warning: ${snapshot.summary.warning}, ` +
                  `Info: ${snapshot.summary.info}`
              );
              if (snapshot.summary.frameworks?.length > 0) {
                console.log(
                  chalk.dim("  Frameworks: ") +
                    snapshot.summary.frameworks.join(", ")
                );
              }
            }
          }

          newline();

          // Show trend summary
          if (snapshots.length >= 2) {
            const latest = snapshots[0]!;
            const previous = snapshots[1]!;

            const driftDelta = latest.driftCount - previous.driftCount;
            const compDelta = latest.componentCount - previous.componentCount;

            console.log(chalk.bold("Trend Summary"));
            console.log(chalk.dim("─".repeat(30)));

            if (driftDelta > 0) {
              console.log(
                `Drift: ${chalk.red("+" + driftDelta)} since last scan`
              );
            } else if (driftDelta < 0) {
              console.log(
                `Drift: ${chalk.green(driftDelta)} since last scan`
              );
            } else {
              console.log(`Drift: ${chalk.dim("no change")}`);
            }

            if (compDelta > 0) {
              console.log(
                `Components: ${chalk.green("+" + compDelta)} since last scan`
              );
            } else if (compDelta < 0) {
              console.log(
                `Components: ${chalk.red(compDelta)} since last scan`
              );
            } else {
              console.log(`Components: ${chalk.dim("no change")}`);
            }
          }

          store.close();
        } catch (storeErr) {
          spin.stop();
          store.close();
          const msg = storeErr instanceof Error ? storeErr.message : String(storeErr);
          error(`Failed to load history: ${msg}`);

          // Hint about running a scan first
          info("Run " + chalk.cyan("buoy sweep") + " first to start tracking history.");
          process.exit(1);
        }
      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`History failed: ${message}`);
        process.exit(1);
      }
    });

  // Subcommand: history show <scan-id>
  cmd
    .command("show <scan-id>")
    .description("Show details of a specific scan")
    .option("--json", "Output as JSON")
    .action(async (scanId: string, options) => {
      if (options.json) {
        setJsonMode(true);
      }
      const spin = spinner("Loading scan details...");

      try {
        const store = createStore();

        const scan = await store.getScan(scanId);
        if (!scan) {
          spin.stop();
          error(`Scan not found: ${scanId}`);
          store.close();
          process.exit(1);
        }

        const components = await store.getComponents(scanId);
        const tokens = await store.getTokens(scanId);
        const drifts = await store.getDriftSignals(scanId);

        spin.stop();

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                scan: {
                  id: scan.id,
                  status: scan.status,
                  sources: scan.sources,
                  stats: scan.stats,
                  startedAt: scan.startedAt,
                  completedAt: scan.completedAt,
                },
                components,
                tokens,
                drifts,
              },
              null,
              2
            )
          );
          store.close();
          return;
        }

        header(`Scan: ${scan.id}`);
        newline();

        keyValue("Status", scan.status);
        keyValue("Sources", scan.sources.join(", "));
        if (scan.startedAt) {
          keyValue("Started", scan.startedAt.toLocaleString());
        }
        if (scan.completedAt) {
          keyValue("Completed", scan.completedAt.toLocaleString());
        }
        if (scan.stats?.duration) {
          keyValue("Duration", `${(scan.stats.duration / 1000).toFixed(1)}s`);
        }
        newline();

        keyValue("Components", String(components.length));
        keyValue("Tokens", String(tokens.length));
        keyValue("Drift signals", String(drifts.length));
        newline();

        // Show drift breakdown
        if (drifts.length > 0) {
          const critical = drifts.filter((d) => d.severity === "critical").length;
          const warning = drifts.filter((d) => d.severity === "warning").length;
          const info = drifts.filter((d) => d.severity === "info").length;

          console.log(chalk.bold("Drift Breakdown"));
          console.log(
            `  ${chalk.red("Critical:")} ${critical}  ` +
              `${chalk.yellow("Warning:")} ${warning}  ` +
              `${chalk.blue("Info:")} ${info}`
          );
        }

        store.close();
      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Failed to show scan: ${message}`);
        process.exit(1);
      }
    });

  // Subcommand: history compare <scan-id-1> <scan-id-2>
  cmd
    .command("compare <scan1> <scan2>")
    .description("Compare two scans")
    .option("--json", "Output as JSON")
    .action(async (scan1: string, scan2: string, options) => {
      if (options.json) {
        setJsonMode(true);
      }
      const spin = spinner("Comparing scans...");

      try {
        const store = createStore();

        const diff = await store.compareScan(scan1, scan2);

        spin.stop();

        if (options.json) {
          console.log(JSON.stringify(diff, null, 2));
          store.close();
          return;
        }

        header(`Comparing ${scan1} → ${scan2}`);
        newline();

        // Components diff
        console.log(chalk.bold("Components"));
        console.log(
          `  ${chalk.green("Added:")} ${diff.added.components.length}  ` +
            `${chalk.red("Removed:")} ${diff.removed.components.length}  ` +
            `${chalk.yellow("Modified:")} ${diff.modified.components.length}`
        );

        if (diff.added.components.length > 0) {
          console.log(chalk.green("  + ") + diff.added.components.map((c) => c.name).join(", "));
        }
        if (diff.removed.components.length > 0) {
          console.log(chalk.red("  - ") + diff.removed.components.map((c) => c.name).join(", "));
        }

        newline();

        // Tokens diff
        console.log(chalk.bold("Tokens"));
        console.log(
          `  ${chalk.green("Added:")} ${diff.added.tokens.length}  ` +
            `${chalk.red("Removed:")} ${diff.removed.tokens.length}  ` +
            `${chalk.yellow("Modified:")} ${diff.modified.tokens.length}`
        );

        newline();

        // Drifts diff
        console.log(chalk.bold("Drift Signals"));
        console.log(
          `  ${chalk.green("New:")} ${diff.added.drifts.length}  ` +
            `${chalk.red("Resolved:")} ${diff.removed.drifts.length}`
        );

        if (diff.added.drifts.length > 0) {
          newline();
          console.log(chalk.yellow("New drift signals:"));
          for (const d of diff.added.drifts.slice(0, 5)) {
            console.log(`  ${d.severity === "critical" ? chalk.red("!") : chalk.yellow("~")} ${d.message}`);
          }
          if (diff.added.drifts.length > 5) {
            console.log(chalk.dim(`  ... and ${diff.added.drifts.length - 5} more`));
          }
        }

        store.close();
      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Compare failed: ${message}`);
        process.exit(1);
      }
    });

  return cmd;
}

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) {
    return date.toLocaleDateString();
  } else if (days > 0) {
    return `${days}d ago`;
  } else if (hours > 0) {
    return `${hours}h ago`;
  } else if (minutes > 0) {
    return `${minutes}m ago`;
  } else {
    return "just now";
  }
}
