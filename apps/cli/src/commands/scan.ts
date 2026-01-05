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
import { discoverProject, formatInsightsBlock, promptNextAction, isTTY } from "../insights/index.js";
import {
  isLoggedIn,
  syncScan,
  formatScanForUpload,
  getGitMetadata,
  hasQueuedScans,
  getQueueCount,
} from "../cloud/index.js";

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

          // Show what we detected (but not in JSON mode)
          if (!options.json && (autoResult.detected.length > 0 || autoResult.monorepo)) {
            spin.stop();
            console.log(chalk.cyan.bold("⚡ Zero-config mode"));
            console.log(chalk.dim("   Auto-detected:"));
            if (autoResult.monorepo) {
              console.log(`   ${chalk.green("•")} ${autoResult.monorepo.type} monorepo ${chalk.dim(`(${autoResult.monorepo.patterns.slice(0, 2).join(', ')})`)}`);
            }
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

          // Show insights instead of generic help
          const insights = await discoverProject(process.cwd());

          console.log(chalk.dim('Components: 0 (no scanners available for your framework)'));
          console.log(chalk.dim('Tokens: 0'));
          newline();
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

        // If we found nothing, show insights instead of bare zeros
        if (results.components.length === 0 && results.tokens.length === 0) {
          console.log(chalk.dim('Components: 0 (no scanners matched your framework)'));
          console.log(chalk.dim('Tokens: 0'));
          newline();

          // Show what we DID find
          const insights = await discoverProject(process.cwd());
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

        // Cloud sync if linked
        const cloudProjectId = (config as BuoyConfig & { cloudProjectId?: string }).cloudProjectId;
        if (cloudProjectId && isLoggedIn()) {
          const syncSpin = spinner("Syncing to Buoy Cloud...").start();

          try {
            const cwd = process.cwd();
            const gitMeta = getGitMetadata(cwd);

            // Convert scan results to upload format
            // Note: drift is computed separately, here we just upload components/tokens
            const scanData = formatScanForUpload(
              results.components.map((c) => ({
                name: c.name,
                path: 'path' in c.source ? c.source.path : c.id,
                framework: c.source.type,
                props: c.props.map((p) => ({
                  name: p.name,
                  type: p.type,
                  required: p.required,
                  defaultValue: p.defaultValue,
                })),
              })),
              results.tokens.map((t) => ({
                name: t.name,
                value: typeof t.value === 'object' ? JSON.stringify(t.value) : String(t.value),
                type: typeof t.value === 'object' && 'type' in t.value ? t.value.type : 'unknown',
                path: 'path' in t.source ? t.source.path : undefined,
                source: t.source.type,
              })),
              [], // Drift signals come from drift check, not basic scan
              gitMeta
            );

            const syncResult = await syncScan(cwd, cloudProjectId, scanData);

            if (syncResult.success) {
              syncSpin.succeed(`Synced to Buoy Cloud (${syncResult.scanId})`);
            } else if (syncResult.queued) {
              syncSpin.warn("Sync failed - queued for retry");
              info(`Run ${chalk.cyan("buoy sync")} to retry`);
            } else {
              syncSpin.fail(`Sync failed: ${syncResult.error}`);
            }
          } catch (syncErr) {
            syncSpin.fail("Cloud sync failed");
            if (options.verbose) {
              const msg = syncErr instanceof Error ? syncErr.message : String(syncErr);
              error(msg);
            }
          }
        } else if (hasQueuedScans(process.cwd())) {
          // Remind about queued scans
          const queueCount = getQueueCount(process.cwd());
          newline();
          warning(`${queueCount} scan(s) queued for sync`);
          info(`Run ${chalk.cyan("buoy sync")} to upload`);
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
      } catch (err) {
        spin.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Scan failed: ${message}`);
        process.exit(1);
      }
    });

  return cmd;
}
