// apps/cli/src/commands/check.ts
import { Command } from "commander";
import { loadConfig, getConfigPath } from "../config/loader.js";
import type { DriftSignal, Severity } from "@buoy-design/core";
import { execSync } from "node:child_process";
import {
  DriftAnalysisService,
  hasDriftsAboveThreshold,
  calculateDriftSummary,
} from "../services/drift-analysis.js";

/**
 * Get list of staged files from git
 */
export function getStagedFiles(): string[] {
  try {
    const output = execSync(
      "git diff --cached --name-only --diff-filter=ACMR",
      {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    return output
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Filter files to only include scannable extensions
 */
export function filterScannableFiles(files: string[]): string[] {
  const scannableExtensions = [
    // React/JS
    ".tsx",
    ".jsx",
    ".ts",
    ".js",
    // Vue
    ".vue",
    // Svelte
    ".svelte",
    // Angular
    ".component.ts",
    // Templates
    ".blade.php",
    ".erb",
    ".twig",
    ".njk",
    ".html",
    // Tokens
    ".css",
    ".scss",
    ".json",
  ];

  return files.filter((file) =>
    scannableExtensions.some((ext) => file.endsWith(ext)),
  );
}

/**
 * Check if a drift signal is from a staged file
 */
export function isFromStagedFile(drift: DriftSignal, stagedFiles: string[]): boolean {
  const location = drift.source.location;
  if (!location) return true; // Include drifts without location

  // Extract file path from location (format: "path/to/file.tsx:line")
  const filePath = location.split(":")[0];

  // Check if the file path matches any staged file
  if (!filePath) return true;

  return stagedFiles.some(
    (stagedFile) =>
      filePath === stagedFile ||
      filePath.endsWith(`/${stagedFile}`) ||
      stagedFile.endsWith(`/${filePath}`),
  );
}

export function createCheckCommand(): Command {
  const cmd = new Command("check")
    .description("Fast drift check for pre-commit hooks")
    .option(
      "--fail-on <severity>",
      "Exit 1 if drift at this severity or higher: critical, warning, info, none",
      "critical",
    )
    .option("--staged", "Only check staged files (for pre-commit hooks)")
    .option("--quiet", "Suppress all output except errors")
    .option("-v, --verbose", "Show detailed output")
    .action(async (options) => {
      const log = options.quiet
        ? () => {}
        : options.verbose
          ? console.error.bind(console)
          : () => {};

      try {
        // Check for config
        if (!getConfigPath()) {
          log("No buoy.config.mjs found, skipping check");
          process.exit(0);
        }

        // Get staged files if --staged flag is used
        let stagedFiles: string[] = [];
        if (options.staged) {
          stagedFiles = getStagedFiles();
          const scannableStaged = filterScannableFiles(stagedFiles);

          if (scannableStaged.length === 0) {
            log("No scannable files staged, skipping check");
            process.exit(0);
          }

          log(`Checking ${scannableStaged.length} staged file(s)...`);
        }

        log("Loading configuration...");
        const { config } = await loadConfig();

        log("Scanning for drift...");

        // Use consolidated drift analysis service
        const service = new DriftAnalysisService(config);
        const result = await service.analyze({
          onProgress: log,
          includeBaseline: false,
        });

        let drifts = result.drifts;

        // Filter to staged files only if --staged is used
        if (options.staged && stagedFiles.length > 0) {
          drifts = drifts.filter((d) => isFromStagedFile(d, stagedFiles));
        }

        // Determine exit code using shared utility
        const failOn = options.failOn as Severity | "none";
        const exitCode = hasDriftsAboveThreshold(drifts, failOn) ? 1 : 0;

        // Summary counts using shared utility
        const summary = calculateDriftSummary(drifts);

        // Output
        if (!options.quiet) {
          if (exitCode === 0) {
            if (summary.total === 0) {
              console.log("+ No drift detected");
            } else {
              console.log(
                `+ Check passed (${summary.total} drift${summary.total !== 1 ? "s" : ""} below threshold)`,
              );
            }
          } else {
            console.log("x Drift detected");
            console.log("");
            console.log(`  Critical: ${summary.critical}`);
            console.log(`  Warning:  ${summary.warning}`);
            console.log(`  Info:     ${summary.info}`);

            if (options.verbose) {
              console.log("");
              console.log("Issues:");
              for (const drift of drifts.slice(0, 10)) {
                const sev =
                  drift.severity === "critical"
                    ? "!"
                    : drift.severity === "warning"
                      ? "~"
                      : "i";
                const loc = drift.source.location
                  ? ` (${drift.source.location})`
                  : "";
                console.log(
                  `  [${sev}] ${drift.source.entityName}: ${drift.message}${loc}`,
                );
              }
              if (drifts.length > 10) {
                console.log(`  ... and ${drifts.length - 10} more`);
              }
            }

            console.log("");
            console.log("Run `buoy drift check` for details");
          }
        }

        process.exit(exitCode);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!options.quiet) {
          console.error(`Error: ${message}`);
        }
        process.exit(1);
      }
    });

  return cmd;
}
