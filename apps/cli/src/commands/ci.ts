// apps/cli/src/commands/ci.ts
import { Command } from "commander";
import { loadConfig, getConfigPath } from "../config/loader.js";
import { setJsonMode } from "../output/reporters.js";
import type { DriftSignal, Severity } from "@buoy-design/core";
import {
  GitHubClient,
  parseRepoString,
  formatPRComment,
  formatAIPRComment,
} from "../integrations/index.js";
import {
  DriftAnalysisService,
  hasDriftsAboveThreshold,
  sortDriftsBySeverity,
} from "../services/drift-analysis.js";
import { AIAnalysisService } from "../services/ai-analysis.js";
import { ScanCache } from "@buoy-design/scanners";

export interface CIOutput {
  version: string;
  timestamp: string;
  summary: {
    total: number;
    critical: number;
    warning: number;
    info: number;
  };
  topIssues: Array<{
    type: string;
    severity: Severity;
    component: string;
    message: string;
    file?: string;
    line?: number;
    suggestion?: string;
  }>;
  exitCode: number;
}

interface GitHubOptions {
  token?: string;
  repo?: string;
  pr?: number;
}

function validateGitHubOptions(options: {
  githubToken?: string;
  githubRepo?: string;
  githubPr?: string;
}): GitHubOptions {
  const token = options.githubToken || process.env.GITHUB_TOKEN;
  const repo = options.githubRepo || process.env.GITHUB_REPOSITORY;
  const prInput = options.githubPr || process.env.GITHUB_PR_NUMBER;

  // Validate token: must be non-empty if provided
  if (token !== undefined && token.trim() === "") {
    throw new Error("Invalid GitHub token: must be non-empty if provided.");
  }

  // Validate repo format: must be "owner/repo" with non-empty parts
  if (repo !== undefined) {
    const repoPattern = /^[^/]+\/[^/]+$/;
    if (!repoPattern.test(repo)) {
      throw new Error(
        `Invalid GitHub repo format: '${repo}'. Must be in 'owner/repo' format (e.g., 'facebook/react').`,
      );
    }
    const [owner, repoName] = repo.split("/");
    if (!owner || owner.trim() === "" || !repoName || repoName.trim() === "") {
      throw new Error(
        `Invalid GitHub repo format: '${repo}'. Both owner and repo parts must be non-empty.`,
      );
    }
  }

  // Validate PR number: must be a positive integer
  let pr: number | undefined;
  if (prInput !== undefined) {
    const parsed = parseInt(prInput, 10);
    if (
      isNaN(parsed) ||
      parsed <= 0 ||
      !Number.isInteger(parsed) ||
      String(parsed) !== prInput.trim()
    ) {
      throw new Error(
        `Invalid PR number: '${prInput}'. Must be a positive integer.`,
      );
    }
    pr = parsed;
  }

  return {
    token: token?.trim(),
    repo: repo?.trim(),
    pr,
  };
}

export function createCICommand(): Command {
  const cmd = new Command("lighthouse")
    .alias("ci")
    .description("Run drift detection in CI/CD pipelines")
    .option(
      "--fail-on <severity>",
      "Exit 1 if drift at this severity or higher: critical, warning, info, none",
      "critical",
    )
    .option("--json", "Output as JSON (default)")
    .option("--format <format>", "Output format: json, summary", "json")
    .option("--quiet", "Suppress non-essential output")
    .option("--top <n>", "Number of top issues to include", "10")
    .option(
      "--include-baseline",
      "Include baselined drifts (by default only new issues shown)",
    )
    .option(
      "--github-token <token>",
      "GitHub token for PR comments (or use GITHUB_TOKEN env)",
    )
    .option(
      "--github-repo <repo>",
      "GitHub repo in owner/repo format (or use GITHUB_REPOSITORY env)",
    )
    .option(
      "--github-pr <number>",
      "PR number to comment on (or use GITHUB_PR_NUMBER env)",
    )
    .option(
      "--ai",
      "Enable AI-powered analysis (requires ANTHROPIC_API_KEY env)",
    )
    .option(
      "--no-ai",
      "Disable AI analysis even if ANTHROPIC_API_KEY is set",
    )
    .option("--no-cache", "Disable incremental scanning cache")
    .option("--clear-cache", "Clear cache before scanning")
    .option(
      "--max-drift <n>",
      "Fail if total drift count exceeds this threshold"
    )
    .option(
      "--max-critical <n>",
      "Fail if critical drift count exceeds this threshold"
    )
    .option(
      "--max-warning <n>",
      "Fail if warning drift count exceeds this threshold"
    )
    .action(async (options) => {
      // Set JSON mode to ensure any reporter output goes to stderr
      // --json flag takes precedence, but --format also works
      if (options.json || options.format === "json") {
        setJsonMode(true);
      }
      const log = options.quiet ? () => {} : console.error.bind(console);

      try {
        // Validate GitHub options early, before any scanning
        const github = validateGitHubOptions(options);

        // Check for config
        if (!getConfigPath()) {
          const output: CIOutput = {
            version: "0.0.1",
            timestamp: new Date().toISOString(),
            summary: { total: 0, critical: 0, warning: 0, info: 0 },
            topIssues: [],
            exitCode: 0,
          };
          console.log(JSON.stringify(output, null, 2));
          return;
        }

        log("Loading configuration...");
        const { config } = await loadConfig();

        log("Scanning for drift...");

        // Initialize cache if enabled
        let cache: ScanCache | undefined;
        if (options.cache !== false) {
          cache = new ScanCache(process.cwd());
          await cache.load();

          if (options.clearCache) {
            cache.clear();
            log("Cache cleared");
          }
        }

        // Use consolidated drift analysis service
        const service = new DriftAnalysisService(config);
        const result = await service.analyze({
          onProgress: log,
          includeBaseline: options.includeBaseline,
          cache,
        });

        // Save cache after scan
        if (cache) {
          await cache.save();
        }

        const drifts = result.drifts;

        // Check for design system reference
        const hasTokenConfig = config.sources.tokens?.enabled &&
          (config.sources.tokens.files?.length ?? 0) > 0;
        const hasFigmaConfig = config.sources.figma?.enabled;
        const hasDesignReference = hasTokenConfig || hasFigmaConfig;

        // Count tokens if configured
        let tokenCount = 0;
        if (hasTokenConfig) {
          const { ScanOrchestrator } = await import("../scan/orchestrator.js");
          const orchestrator = new ScanOrchestrator(config);
          const tokenResult = await orchestrator.scanTokens();
          tokenCount = tokenResult.tokens.length;
        }

        // Build output
        const output = buildCIOutput(drifts, options);

        // Post to GitHub if configured (using pre-validated values)
        if (github.token && github.repo && github.pr) {
          try {
            const { owner, repo: repoName } = parseRepoString(github.repo);
            const client = new GitHubClient({
              token: github.token,
              owner,
              repo: repoName,
              prNumber: github.pr,
            });

            // Get PR info for context
            let prAuthor: string | undefined;
            let filesChanged: string[] | undefined;
            try {
              const prInfo = await client.getPRInfo();
              prAuthor = prInfo.author;
              filesChanged = prInfo.filesChanged.map((f) => f.filename);
            } catch {
              // PR info is optional, continue without it
            }

            let comment: string;

            // Use AI analysis if enabled
            const useAI = options.ai !== false && process.env.ANTHROPIC_API_KEY;
            if (useAI && drifts.length > 0) {
              log("Running AI analysis...");
              const aiService = new AIAnalysisService();
              const analysis = await aiService.analyzePR(drifts, {
                projectRoot: process.cwd(),
                prNumber: github.pr,
                prAuthor,
                filesChanged,
              });
              log("Generating AI-powered PR comment...");
              comment = formatAIPRComment(analysis, {
                signals: drifts.map((d) => ({
                  type: d.type,
                  severity: d.severity,
                  message: d.message,
                  component: d.source.entityName,
                  file: d.source.location?.split(":")[0],
                  line: d.source.location?.includes(":")
                    ? parseInt(d.source.location.split(":")[1] || "0", 10)
                    : undefined,
                  suggestion: d.details.suggestions?.[0],
                })),
                summary: {
                  total: drifts.length,
                  critical: drifts.filter((d) => d.severity === "critical").length,
                  warning: drifts.filter((d) => d.severity === "warning").length,
                  info: drifts.filter((d) => d.severity === "info").length,
                },
              });
            } else {
              log("Posting to GitHub PR...");
              const driftResult = {
                signals: drifts.map((d) => ({
                  type: d.type,
                  severity: d.severity,
                  message: d.message,
                  component: d.source.entityName,
                  file: d.source.location?.split(":")[0],
                  line: d.source.location?.includes(":")
                    ? parseInt(d.source.location.split(":")[1] || "0", 10)
                    : undefined,
                  suggestion: d.details.suggestions?.[0],
                })),
                summary: {
                  total: drifts.length,
                  critical: drifts.filter((d) => d.severity === "critical").length,
                  warning: drifts.filter((d) => d.severity === "warning").length,
                  info: drifts.filter((d) => d.severity === "info").length,
                },
              };
              comment = formatPRComment(driftResult, {
                hasDesignReference,
                tokenCount,
                filesChanged,
              });
            }

            await client.createOrUpdateComment(comment);
            log("Posted PR comment");
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            log(`Failed to post GitHub comment: ${msg}`);
          }
        }

        if (options.format === "json") {
          console.log(JSON.stringify(output, null, 2));
        } else {
          printSummary(output);
        }

        process.exit(output.exitCode);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ error: message }, null, 2));
        process.exit(1);
      }
    });

  return cmd;
}

interface CIBuildOptions {
  failOn: string;
  top: string;
  maxDrift?: string;
  maxCritical?: string;
  maxWarning?: string;
}

function buildCIOutput(
  drifts: DriftSignal[],
  options: CIBuildOptions,
): CIOutput {
  const summary = {
    total: drifts.length,
    critical: drifts.filter((d) => d.severity === "critical").length,
    warning: drifts.filter((d) => d.severity === "warning").length,
    info: drifts.filter((d) => d.severity === "info").length,
  };

  // Sort by severity (critical first) using shared utility
  const sorted = sortDriftsBySeverity(drifts);

  const topN = parseInt(options.top, 10) || 10;
  const topIssues = sorted.slice(0, topN).map((d) => {
    const locationParts = d.source.location?.split(":");
    return {
      type: d.type,
      severity: d.severity,
      component: d.source.entityName,
      message: d.message,
      file: locationParts?.[0],
      line: locationParts?.[1] ? parseInt(locationParts[1], 10) : undefined,
      suggestion: d.details.suggestions?.[0],
    };
  });

  // Determine exit code - check thresholds first, then severity
  let exitCode = 0;

  // Check threshold-based failures
  if (options.maxDrift !== undefined) {
    const maxDrift = parseInt(options.maxDrift, 10);
    if (!isNaN(maxDrift) && summary.total > maxDrift) {
      exitCode = 1;
    }
  }

  if (options.maxCritical !== undefined) {
    const maxCritical = parseInt(options.maxCritical, 10);
    if (!isNaN(maxCritical) && summary.critical > maxCritical) {
      exitCode = 1;
    }
  }

  if (options.maxWarning !== undefined) {
    const maxWarning = parseInt(options.maxWarning, 10);
    if (!isNaN(maxWarning) && summary.warning > maxWarning) {
      exitCode = 1;
    }
  }

  // If no threshold failures, check severity-based failure
  if (exitCode === 0) {
    const failOn = options.failOn as Severity | "none";
    exitCode = hasDriftsAboveThreshold(drifts, failOn) ? 1 : 0;
  }

  return {
    version: "0.0.1",
    timestamp: new Date().toISOString(),
    summary,
    topIssues,
    exitCode,
  };
}

function printSummary(output: CIOutput): void {
  const icon = output.exitCode === 0 ? "+" : "x";
  const status = output.exitCode === 0 ? "PASS" : "FAIL";

  console.log(`${icon} Buoy Drift Check: ${status}`);
  console.log("");
  console.log(`  Total:    ${output.summary.total}`);
  console.log(`  Critical: ${output.summary.critical}`);
  console.log(`  Warning:  ${output.summary.warning}`);
  console.log(`  Info:     ${output.summary.info}`);

  if (output.topIssues.length > 0) {
    console.log("");
    console.log("Top issues:");
    for (const issue of output.topIssues.slice(0, 5)) {
      const sev =
        issue.severity === "critical"
          ? "!"
          : issue.severity === "warning"
            ? "~"
            : "i";
      const loc = issue.file
        ? ` (${issue.file}${issue.line ? `:${issue.line}` : ""})`
        : "";
      console.log(`  [${sev}] ${issue.component}: ${issue.message}${loc}`);
    }

    if (output.topIssues.length > 5) {
      console.log(`  ... and ${output.topIssues.length - 5} more`);
    }
  }
}
