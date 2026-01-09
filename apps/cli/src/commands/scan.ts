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
import { createStore, getProjectName, wouldUseCloud, type ScanStore } from "../store/index.js";
import { withOptionalCache, type ScanCache } from "@buoy-design/scanners";
import type { Component, DesignToken, PropDefinition } from "@buoy-design/core";
import type { ScanError } from "../scan/orchestrator.js";

export function createScanCommand(): Command {
  const cmd = new Command("scan")
    .description("Scan your codebase for components and tokens")
    .option(
      "-s, --source <sources...>",
      "Specific sources to scan (react, vue, svelte, angular, tokens, etc.)",
    )
    .option("--json", "Output as JSON")
    .option("-v, --verbose", "Verbose output")
    .option("--no-persist", "Skip saving results to local database")
    .option("--no-cache", "Disable incremental scanning cache")
    .option("--clear-cache", "Clear cache before scanning")
    .action(async (options) => {
      // Set JSON mode before creating spinner to redirect spinner to stderr
      if (options.json) {
        setJsonMode(true);
      }
      const spin = spinner("Loading configuration...");
      let store: ScanStore | undefined;

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

        // Use cache wrapper for guaranteed cleanup
        const { result: scanResult } = await withOptionalCache(
          process.cwd(),
          options.cache !== false,
          async (cache: ScanCache | undefined) => {
            // Create orchestrator and determine sources
            const orchestrator = new ScanOrchestrator(config, process.cwd(), { cache });
            const sourcesToScan: string[] =
              options.source || orchestrator.getEnabledSources();

            if (sourcesToScan.length === 0) {
              return { type: 'no-sources' as const };
            }

            // Run the scan using orchestrator
            const results = await orchestrator.scan({
              sources: sourcesToScan,
              onProgress: (msg) => {
                spin.text = msg;
              },
            });

            return { type: 'success' as const, results, sourcesToScan };
          },
          {
            clearCache: options.clearCache,
            onVerbose: options.verbose ? info : undefined,
          },
        );

        // Handle no sources case (early exit)
        if (scanResult.type === 'no-sources') {
          spin.stop();

          // JSON mode: return empty results
          if (options.json) {
            console.log(JSON.stringify({ components: [], tokens: [], errors: [] }, null, 2));
            return;
          }

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

        const { results, sourcesToScan } = scanResult;

        // Persist results to store (unless --no-persist)
        let scanId: string | undefined;
        if (options.persist !== false) {
          try {
            spin.text = "Saving scan results...";
            store = createStore({ forceLocal: !wouldUseCloud() });
            const projectName = config.project?.name || getProjectName();
            const project = await store.getOrCreateProject(projectName);
            const scan = await store.startScan(project.id, sourcesToScan);
            scanId = scan.id;

            // Complete the scan with results (no drift signals from basic scan)
            await store.completeScan(scan.id, {
              components: results.components,
              tokens: results.tokens,
              drifts: [],
              errors: results.errors.map((e: ScanError) => `[${e.source}] ${e.file || ""}: ${e.message}`),
            });

            if (options.verbose) {
              info(`Saved to ${wouldUseCloud() ? 'Buoy Cloud' : 'local database'} (${scan.id})`);
            }
          } catch (storeErr) {
            // Don't fail the whole scan if persistence fails
            if (options.verbose) {
              const msg = storeErr instanceof Error ? storeErr.message : String(storeErr);
              warning(`Failed to save scan: ${msg}`);
            }
          }
        }

        spin.stop();

        // Output results
        if (options.json) {
          console.log(
            JSON.stringify(
              {
                scanId,
                components: results.components,
                tokens: results.tokens,
                errors: results.errors.map(
                  (e: ScanError) => `[${e.source}] ${e.file || ""}: ${e.message}`,
                ),
                cacheStats: results.cacheStats,
              },
              null,
              2,
            ),
          );
          store?.close();
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

        // Display cache statistics if caching was used
        if (results.cacheStats) {
          const { hits, misses } = results.cacheStats;
          const total = hits + misses;
          const hitRate = total > 0 ? Math.round((hits / total) * 100) : 0;
          keyValue("Cache", `${hits} hits, ${misses} misses (${hitRate}% hit rate)`);
        }
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

        if (scanId) {
          success(`Scan complete (${scanId})`);
        } else {
          success("Scan complete");
        }

        // Cloud sync if linked
        const cloudProjectId = (config as BuoyConfig & { cloudProjectId?: string }).cloudProjectId;
        if (cloudProjectId && isLoggedIn()) {
          const syncSpin = spinner("Syncing to Buoy Cloud...");

          try {
            const cwd = process.cwd();
            const gitMeta = getGitMetadata(cwd);

            // Convert scan results to upload format
            // Note: drift is computed separately, here we just upload components/tokens
            const scanData = formatScanForUpload(
              results.components.map((c: Component) => ({
                name: c.name,
                path: 'path' in c.source ? c.source.path : c.id,
                framework: c.source.type,
                props: c.props.map((p: PropDefinition) => ({
                  name: p.name,
                  type: p.type,
                  required: p.required,
                  defaultValue: p.defaultValue,
                })),
              })),
              results.tokens.map((t: DesignToken) => ({
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

        // Cleanup store connection
        store?.close();
      } catch (err) {
        spin.stop();
        store?.close();
        const message = err instanceof Error ? err.message : String(err);
        error(`Scan failed: ${message}`);
        process.exit(1);
      }
    });

  return cmd;
}
