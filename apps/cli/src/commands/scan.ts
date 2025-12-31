import { Command } from "commander";
import chalk from "chalk";
import { loadConfig, getConfigPath } from "../config/loader.js";
import { buildAutoConfig } from "../config/auto-detect.js";
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
  formatComponentTable,
  formatTokenTable,
} from "../output/formatters.js";
import { ScanOrchestrator } from "../scan/orchestrator.js";
import type { BuoyConfig } from "../config/schema.js";

export function createScanCommand(): Command {
  const cmd = new Command("scan")
    .description("Scan sources for components and tokens")
    .option(
      "-s, --source <sources...>",
      "Specific sources to scan (react, vue, svelte, angular, tokens, etc.)",
    )
    .option("--json", "Output as JSON")
    .option("-v, --verbose", "Verbose output")
    .action(async (options) => {
      // Set JSON mode before creating spinner to redirect spinner to stderr
      if (options.json) {
        setJsonMode(true);
      }
      const spin = spinner("Loading configuration...");

      try {
        // Load config, or auto-detect if none exists
        const existingConfigPath = getConfigPath();
        let config: BuoyConfig;
        let isAutoDetected = false;

        if (existingConfigPath) {
          const result = await loadConfig();
          config = result.config;
          if (options.verbose) {
            spin.stop();
            info(`Using config: ${existingConfigPath}`);
            spin.start();
          }
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

        spin.text = "Scanning sources...";

        // Create orchestrator and determine sources
        const orchestrator = new ScanOrchestrator(config);
        const sourcesToScan: string[] =
          options.source || orchestrator.getEnabledSources();

        if (sourcesToScan.length === 0) {
          spin.stop();

          if (isAutoDetected) {
            warning("No frontend project detected");
            console.log("");
            info("Buoy couldn't find React, Vue, Svelte, Angular, or other UI frameworks.");
            console.log("");
            info("If this is a frontend project, try:");
            info("  1. Run " + chalk.cyan("buoy init") + " to configure manually");
            info("  2. Make sure package.json lists your framework");
          } else {
            warning("No sources to scan");
            console.log("");
            info("Your config file has no sources enabled.");
            console.log("");
            info("This can happen if:");
            info("  - Auto-detection found no components");
            info("  - No token files (CSS variables, JSON tokens) were found");
            info("  - This is not a frontend project");
            console.log("");
            info("To fix:");
            info(
              "  1. Run " +
                chalk.cyan("buoy bootstrap") +
                " to extract tokens from existing code",
            );
            info(
              "  2. Run " +
                chalk.cyan("buoy build") +
                " to generate a design system with AI",
            );
            info("  3. Or add paths manually to your config");
          }
          return;
        }

        // Run the scan using orchestrator
        const results = await orchestrator.scan({
          sources: sourcesToScan,
          onProgress: (msg) => {
            spin.text = msg;
          },
        });

        spin.stop();

        // Output results
        if (options.json) {
          console.log(
            JSON.stringify(
              {
                components: results.components,
                tokens: results.tokens,
                errors: results.errors.map(
                  (e) => `[${e.source}] ${e.file || ""}: ${e.message}`,
                ),
              },
              null,
              2,
            ),
          );
          return;
        }

        header("Scan Results");
        newline();

        keyValue("Components found", String(results.components.length));
        keyValue("Tokens found", String(results.tokens.length));
        keyValue("Errors", String(results.errors.length));
        newline();

        if (results.components.length > 0) {
          header("Components");
          console.log(formatComponentTable(results.components));
          newline();
        }

        if (results.tokens.length > 0) {
          header("Tokens");
          console.log(formatTokenTable(results.tokens));
          newline();
        }

        if (results.errors.length > 0) {
          header("Errors");
          for (const err of results.errors) {
            error(`[${err.source}] ${err.file || ""}: ${err.message}`);
          }
          newline();
        }

        success("Scan complete");

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
        error(`Scan failed: ${message}`);
        process.exit(1);
      }
    });

  return cmd;
}
