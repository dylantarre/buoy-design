import { Command } from "commander";
import chalk from "chalk";
import { loadConfig, getConfigPath } from "../config/loader.js";
import { buildAutoConfig } from "../config/auto-detect.js";
import {
  spinner,
  error,
  setJsonMode,
} from "../output/reporters.js";
import { ScanOrchestrator } from "../scan/orchestrator.js";
import { DriftAnalysisService } from "../services/drift-analysis.js";
import { withOptionalCache, type ScanCache } from "@buoy-design/scanners";
import type { DriftSignal } from "@buoy-design/core";
import { formatUpgradeHint } from "../utils/upgrade-hints.js";
import { generateAuditReport, type AuditValue } from "@buoy-design/core";
import { extractStyles, extractCssFileStyles } from "@buoy-design/scanners";
import { parseCssValues } from "@buoy-design/core";
import { glob } from "glob";
import { readFile } from "fs/promises";
import type { BuoyConfig } from "../config/schema.js";

export function createShowCommand(): Command {
  const cmd = new Command("show")
    .description("Show design system information")
    .option("--json", "Output as JSON (default)")
    .option("--no-cache", "Disable incremental scanning cache");

  // show components
  cmd
    .command("components")
    .description("Show components found in the codebase")
    .option("--json", "Output as JSON")
    .action(async (options, command) => {
      const parentOpts = command.parent?.opts() || {};
      const json = options.json || parentOpts.json !== false;
      if (json) setJsonMode(true);

      const spin = spinner("Scanning components...");

      try {
        const config = await getOrBuildConfig();

        const { result: scanResult } = await withOptionalCache(
          process.cwd(),
          parentOpts.cache !== false,
          async (cache: ScanCache | undefined) => {
            const orchestrator = new ScanOrchestrator(config, process.cwd(), { cache });
            return orchestrator.scanComponents({
              onProgress: (msg) => { spin.text = msg; },
            });
          },
        );

        spin.stop();
        console.log(JSON.stringify({ components: scanResult.components }, null, 2));
      } catch (err) {
        spin.stop();
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // show tokens
  cmd
    .command("tokens")
    .description("Show design tokens found in the codebase")
    .option("--json", "Output as JSON")
    .action(async (options, command) => {
      const parentOpts = command.parent?.opts() || {};
      const json = options.json || parentOpts.json !== false;
      if (json) setJsonMode(true);

      const spin = spinner("Scanning tokens...");

      try {
        const config = await getOrBuildConfig();

        const { result: scanResult } = await withOptionalCache(
          process.cwd(),
          parentOpts.cache !== false,
          async (cache: ScanCache | undefined) => {
            const orchestrator = new ScanOrchestrator(config, process.cwd(), { cache });
            return orchestrator.scanTokens({
              onProgress: (msg) => { spin.text = msg; },
            });
          },
        );

        spin.stop();
        console.log(JSON.stringify({ tokens: scanResult.tokens }, null, 2));
      } catch (err) {
        spin.stop();
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // show drift
  cmd
    .command("drift")
    .description("Show drift signals (design system violations)")
    .option("--json", "Output as JSON")
    .option("-S, --severity <level>", "Filter by minimum severity (info, warning, critical)")
    .option("-t, --type <type>", "Filter by drift type")
    .action(async (options, command) => {
      const parentOpts = command.parent?.opts() || {};
      const json = options.json || parentOpts.json !== false;
      if (json) setJsonMode(true);

      const spin = spinner("Analyzing drift...");

      try {
        const { config } = await loadConfig();

        const { result } = await withOptionalCache(
          process.cwd(),
          parentOpts.cache !== false,
          async (cache: ScanCache | undefined) => {
            const service = new DriftAnalysisService(config);
            return service.analyze({
              onProgress: (msg) => { spin.text = msg; },
              includeBaseline: false,
              minSeverity: options.severity,
              filterType: options.type,
              cache,
            });
          },
        );

        spin.stop();

        const output = {
          drifts: result.drifts,
          summary: {
            total: result.drifts.length,
            critical: result.drifts.filter((d: DriftSignal) => d.severity === "critical").length,
            warning: result.drifts.filter((d: DriftSignal) => d.severity === "warning").length,
            info: result.drifts.filter((d: DriftSignal) => d.severity === "info").length,
          },
        };

        console.log(JSON.stringify(output, null, 2));
      } catch (err) {
        spin.stop();
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // show health
  cmd
    .command("health")
    .description("Show design system health score")
    .option("--json", "Output as JSON")
    .action(async (options, command) => {
      const parentOpts = command.parent?.opts() || {};
      const json = options.json ?? parentOpts.json;
      if (json) setJsonMode(true);

      const spin = spinner("Auditing codebase...");

      try {
        const extractedValues = await extractAllValues(spin);
        spin.stop();

        if (extractedValues.length === 0) {
          if (json) {
            console.log(JSON.stringify({
              score: 100,
              message: "No hardcoded design values found",
              categories: {},
              worstFiles: [],
            }, null, 2));
          } else {
            console.log('');
            console.log(chalk.green.bold('  ✓ Health Score: 100/100'));
            console.log('');
            console.log(chalk.dim('  No hardcoded design values found.'));
            console.log(chalk.dim('  Your codebase is using design tokens correctly!'));
            console.log('');
          }
          return;
        }

        const report = generateAuditReport(extractedValues);

        if (json) {
          console.log(JSON.stringify({
            score: report.score,
            categories: report.categories,
            worstFiles: report.worstFiles,
            totals: report.totals,
          }, null, 2));
        } else {
          // Human-readable output
          console.log('');
          const scoreColor = report.score >= 80 ? chalk.green : 
                            report.score >= 50 ? chalk.yellow : 
                            chalk.red;
          console.log(`  ${chalk.bold('Health Score:')} ${scoreColor.bold(report.score + '/100')}`);
          console.log('');
          
          // Categories
          console.log(chalk.bold('  By Category:'));
          for (const [category, data] of Object.entries(report.categories)) {
            const catData = data as { uniqueCount: number; totalUsages: number };
            console.log(`    ${category}: ${catData.uniqueCount} unique values, ${catData.totalUsages} usages`);
          }
          console.log('');
          
          // Worst files
          if (report.worstFiles.length > 0) {
            console.log(chalk.bold('  Files with most hardcoded values:'));
            for (const file of report.worstFiles.slice(0, 5)) {
              console.log(`    ${chalk.dim('•')} ${file.file}: ${file.issueCount} values`);
            }
            if (report.worstFiles.length > 5) {
              console.log(chalk.dim(`    ...and ${report.worstFiles.length - 5} more files`));
            }
            console.log('');
          }
          
          // Totals
          console.log(chalk.dim(`  Total: ${report.totals.uniqueValues} unique values across ${report.totals.filesAffected} files`));
          console.log('');
          
          // Suggestion
          if (report.score < 80) {
            console.log(chalk.dim('  Run `buoy tokens` to generate tokens from these values'));
            console.log('');
          }

          // Show upgrade hint after health score
          const hint = formatUpgradeHint('after-health-score');
          if (hint) {
            console.log(hint);
            console.log('');
          }
        }
      } catch (err) {
        spin.stop();
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // show history
  cmd
    .command("history")
    .description("Show scan history")
    .option("--json", "Output as JSON")
    .option("-n, --limit <number>", "Number of entries to show", "10")
    .action(async (options, command) => {
      const parentOpts = command.parent?.opts() || {};
      const json = options.json || parentOpts.json !== false;
      if (json) setJsonMode(true);

      try {
        // Import store dynamically to avoid circular deps
        const { createStore, getProjectName } = await import("../store/index.js");
        const store = createStore({ forceLocal: true });
        const projectName = getProjectName();
        const project = await store.getOrCreateProject(projectName);
        const limit = parseInt(options.limit, 10) || 10;

        const scans = await store.getScans(project.id, limit);
        store.close();

        console.log(JSON.stringify({
          project: projectName,
          scans: scans.map(s => ({
            id: s.id,
            startedAt: s.startedAt,
            completedAt: s.completedAt,
            status: s.status,
            componentCount: s.stats?.componentCount ?? 0,
            tokenCount: s.stats?.tokenCount ?? 0,
            driftCount: s.stats?.driftCount ?? 0,
          })),
        }, null, 2));
      } catch (err) {
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // show all
  cmd
    .command("all")
    .description("Show everything: components, tokens, drift, and health")
    .option("--json", "Output as JSON")
    .action(async (options, command) => {
      const parentOpts = command.parent?.opts() || {};
      const json = options.json || parentOpts.json !== false;
      if (json) setJsonMode(true);

      const spin = spinner("Gathering design system data...");

      try {
        const config = await getOrBuildConfig();

        const { result: allResults } = await withOptionalCache(
          process.cwd(),
          parentOpts.cache !== false,
          async (cache: ScanCache | undefined) => {
            // Scan components and tokens
            spin.text = "Scanning components and tokens...";
            const orchestrator = new ScanOrchestrator(config, process.cwd(), { cache });
            const scanResult = await orchestrator.scan({
              onProgress: (msg) => { spin.text = msg; },
            });

            // Analyze drift
            spin.text = "Analyzing drift...";
            const service = new DriftAnalysisService(config);
            const driftResult = await service.analyze({
              onProgress: (msg) => { spin.text = msg; },
              includeBaseline: false,
              cache,
            });

            return { scanResult, driftResult };
          },
        );

        // Calculate health (doesn't need cache)
        spin.text = "Calculating health score...";
        const extractedValues = await extractAllValues(spin);
        const healthReport = extractedValues.length > 0
          ? generateAuditReport(extractedValues)
          : { score: 100, categories: {}, worstFiles: [], totals: { uniqueValues: 0, totalUsages: 0, filesAffected: 0 } };

        const { scanResult, driftResult } = allResults;
        spin.stop();

        const output = {
          components: scanResult.components,
          tokens: scanResult.tokens,
          drift: {
            signals: driftResult.drifts,
            summary: {
              total: driftResult.drifts.length,
              critical: driftResult.drifts.filter((d: DriftSignal) => d.severity === "critical").length,
              warning: driftResult.drifts.filter((d: DriftSignal) => d.severity === "warning").length,
              info: driftResult.drifts.filter((d: DriftSignal) => d.severity === "info").length,
            },
          },
          health: {
            score: healthReport.score,
            categories: healthReport.categories,
            worstFiles: healthReport.worstFiles.slice(0, 5),
          },
        };

        console.log(JSON.stringify(output, null, 2));
      } catch (err) {
        spin.stop();
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  return cmd;
}

// Helper: Load or auto-build config
async function getOrBuildConfig(): Promise<BuoyConfig> {
  const existingConfigPath = getConfigPath();
  if (existingConfigPath) {
    const { config } = await loadConfig();
    return config;
  }
  const autoResult = await buildAutoConfig(process.cwd());
  return autoResult.config;
}

// Helper: Extract all hardcoded values for health audit
async function extractAllValues(spin: { text: string }): Promise<AuditValue[]> {
  const cwd = process.cwd();

  spin.text = "Finding source files...";
  const patterns = [
    "**/*.tsx", "**/*.jsx", "**/*.vue", "**/*.svelte",
    "**/*.css", "**/*.scss",
  ];
  const ignore = [
    "**/node_modules/**", "**/dist/**", "**/build/**",
    "**/*.min.css", "**/*.test.*", "**/*.spec.*", "**/*.stories.*",
  ];

  const files: string[] = [];
  for (const pattern of patterns) {
    const matches = await glob(pattern, { cwd, ignore, absolute: true });
    files.push(...matches);
  }

  if (files.length === 0) return [];

  spin.text = `Scanning ${files.length} files...`;
  const extractedValues: AuditValue[] = [];

  for (const filePath of files) {
    try {
      const content = await readFile(filePath, "utf-8");
      const relativePath = filePath.replace(cwd + "/", "");
      const ext = filePath.split(".").pop()?.toLowerCase();
      const isCss = ext === "css" || ext === "scss";

      const styles = isCss
        ? extractCssFileStyles(content)
        : extractStyles(content, ext === "vue" ? "vue" : ext === "svelte" ? "svelte" : "react");

      for (const style of styles) {
        const { values } = parseCssValues(style.css);
        for (const v of values) {
          extractedValues.push({
            category: mapCategory(v.property),
            value: v.value,
            file: relativePath,
            line: 1,
          });
        }
      }
    } catch {
      // Skip files that can't be processed
    }
  }

  return extractedValues;
}

function mapCategory(property: string): AuditValue["category"] {
  const colorProps = ["color", "background", "background-color", "border-color", "fill", "stroke"];
  const spacingProps = ["padding", "margin", "gap", "top", "right", "bottom", "left", "width", "height"];
  const radiusProps = ["border-radius"];
  const typographyProps = ["font-size", "line-height", "font-weight", "font-family"];

  const propLower = property.toLowerCase();

  if (colorProps.some(p => propLower.includes(p))) return "color";
  if (radiusProps.some(p => propLower.includes(p))) return "radius";
  if (typographyProps.some(p => propLower.includes(p))) return "typography";
  if (spacingProps.some(p => propLower.includes(p))) return "spacing";

  return "spacing";
}
