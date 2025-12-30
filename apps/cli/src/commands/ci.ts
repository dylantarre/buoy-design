// apps/cli/src/commands/ci.ts
import { Command } from 'commander';
import { loadConfig, getConfigPath } from '../config/loader.js';
import { setJsonMode } from '../output/reporters.js';
import type { DriftSignal, Severity } from '@buoy-design/core';
import { GitHubClient, parseRepoString, formatPRComment } from '../integrations/index.js';

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

const SEVERITY_ORDER: Record<Severity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

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
  if (token !== undefined && token.trim() === '') {
    throw new Error('Invalid GitHub token: must be non-empty if provided.');
  }

  // Validate repo format: must be "owner/repo" with non-empty parts
  if (repo !== undefined) {
    const repoPattern = /^[^/]+\/[^/]+$/;
    if (!repoPattern.test(repo)) {
      throw new Error(
        `Invalid GitHub repo format: '${repo}'. Must be in 'owner/repo' format (e.g., 'facebook/react').`
      );
    }
    const [owner, repoName] = repo.split('/');
    if (!owner || owner.trim() === '' || !repoName || repoName.trim() === '') {
      throw new Error(
        `Invalid GitHub repo format: '${repo}'. Both owner and repo parts must be non-empty.`
      );
    }
  }

  // Validate PR number: must be a positive integer
  let pr: number | undefined;
  if (prInput !== undefined) {
    const parsed = parseInt(prInput, 10);
    if (isNaN(parsed) || parsed <= 0 || !Number.isInteger(parsed) || String(parsed) !== prInput.trim()) {
      throw new Error(
        `Invalid PR number: '${prInput}'. Must be a positive integer.`
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
  const cmd = new Command('ci')
    .description('Run drift detection for CI environments')
    .option('--fail-on <severity>', 'Exit 1 if drift at this severity or higher: critical, warning, info, none', 'critical')
    .option('--format <format>', 'Output format: json, summary', 'json')
    .option('--quiet', 'Suppress non-essential output')
    .option('--top <n>', 'Number of top issues to include', '10')
    .option('--github-token <token>', 'GitHub token for PR comments (or use GITHUB_TOKEN env)')
    .option('--github-repo <repo>', 'GitHub repo in owner/repo format (or use GITHUB_REPOSITORY env)')
    .option('--github-pr <number>', 'PR number to comment on (or use GITHUB_PR_NUMBER env)')
    .action(async (options) => {
      // Set JSON mode to ensure any reporter output goes to stderr
      if (options.format === 'json') {
        setJsonMode(true);
      }
      const log = options.quiet ? () => {} : console.error.bind(console);

      try {
        // Validate GitHub options early, before any scanning
        const github = validateGitHubOptions(options);

        // Check for config
        if (!getConfigPath()) {
          const output: CIOutput = {
            version: '0.0.1',
            timestamp: new Date().toISOString(),
            summary: { total: 0, critical: 0, warning: 0, info: 0 },
            topIssues: [],
            exitCode: 0,
          };
          console.log(JSON.stringify(output, null, 2));
          return;
        }

        log('Loading configuration...');
        const { config } = await loadConfig();

        log('Scanning for drift...');

        // Import analysis modules
        const { ReactComponentScanner } = await import('@buoy-design/scanners/git');
        const { SemanticDiffEngine } = await import('@buoy-design/core/analysis');

        // Scan components
        const components: Awaited<ReturnType<typeof ReactComponentScanner.prototype.scan>>['items'] = [];

        // Determine which sources to scan from config
        const sourcesToScan: string[] = [];
        if (config.sources.react?.enabled) sourcesToScan.push('react');
        if (config.sources.vue?.enabled) sourcesToScan.push('vue');
        if (config.sources.svelte?.enabled) sourcesToScan.push('svelte');
        if (config.sources.angular?.enabled) sourcesToScan.push('angular');

        // Scan each source using built-in scanners
        const {
          VueComponentScanner,
          SvelteComponentScanner,
          AngularComponentScanner,
        } = await import('@buoy-design/scanners/git');

        for (const source of sourcesToScan) {
          if (source === 'react' && config.sources.react) {
            const scanner = new ReactComponentScanner({
              projectRoot: process.cwd(),
              include: config.sources.react.include,
              exclude: config.sources.react.exclude,
              designSystemPackage: config.sources.react.designSystemPackage,
            });
            const result = await scanner.scan();
            components.push(...result.items);
          }

          if (source === 'vue' && config.sources.vue) {
            const scanner = new VueComponentScanner({
              projectRoot: process.cwd(),
              include: config.sources.vue.include,
              exclude: config.sources.vue.exclude,
            });
            const result = await scanner.scan();
            components.push(...result.items);
          }

          if (source === 'svelte' && config.sources.svelte) {
            const scanner = new SvelteComponentScanner({
              projectRoot: process.cwd(),
              include: config.sources.svelte.include,
              exclude: config.sources.svelte.exclude,
            });
            const result = await scanner.scan();
            components.push(...result.items);
          }

          if (source === 'angular' && config.sources.angular) {
            const scanner = new AngularComponentScanner({
              projectRoot: process.cwd(),
              include: config.sources.angular.include,
              exclude: config.sources.angular.exclude,
            });
            const result = await scanner.scan();
            components.push(...result.items);
          }
        }

        // Run semantic diff
        const engine = new SemanticDiffEngine();
        const diffResult = engine.analyzeComponents(components, {
          checkDeprecated: true,
          checkNaming: true,
          checkDocumentation: true,
        });

        let drifts: DriftSignal[] = diffResult.drifts;

        // Apply ignore rules
        for (const ignoreRule of config.drift.ignore) {
          drifts = drifts.filter(d => {
            if (d.type !== ignoreRule.type) return true;
            if (!ignoreRule.pattern) return false;
            try {
              const regex = new RegExp(ignoreRule.pattern);
              return !regex.test(d.source.entityName);
            } catch {
              log(`Warning: Invalid regex pattern "${ignoreRule.pattern}" in ignore rule, skipping`);
              return true; // Don't filter out drift if regex is invalid
            }
          });
        }

        // Build output
        const output = buildCIOutput(drifts, options);

        // Post to GitHub if configured (using pre-validated values)
        if (github.token && github.repo && github.pr) {
          try {
            log('Posting to GitHub PR...');

            const { owner, repo: repoName } = parseRepoString(github.repo);
            const client = new GitHubClient({
              token: github.token,
              owner,
              repo: repoName,
              prNumber: github.pr,
            });

            const driftResult = {
              signals: drifts.map(d => ({
                type: d.type,
                severity: d.severity,
                message: d.message,
                component: d.source.entityName,
                file: d.source.location?.split(':')[0],
                line: d.source.location?.includes(':')
                  ? parseInt(d.source.location.split(':')[1] || '0', 10)
                  : undefined,
                suggestion: d.details.suggestions?.[0],
              })),
              summary: {
                total: drifts.length,
                critical: drifts.filter(d => d.severity === 'critical').length,
                warning: drifts.filter(d => d.severity === 'warning').length,
                info: drifts.filter(d => d.severity === 'info').length,
              },
            };

            const comment = formatPRComment(driftResult);
            await client.createOrUpdateComment(comment);

            log('Posted PR comment');
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            log(`Failed to post GitHub comment: ${msg}`);
          }
        }

        if (options.format === 'json') {
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

function buildCIOutput(drifts: DriftSignal[], options: { failOn: string; top: string }): CIOutput {
  const summary = {
    total: drifts.length,
    critical: drifts.filter(d => d.severity === 'critical').length,
    warning: drifts.filter(d => d.severity === 'warning').length,
    info: drifts.filter(d => d.severity === 'info').length,
  };

  // Sort by severity (critical first)
  const sorted = [...drifts].sort((a, b) =>
    SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]
  );

  const topN = parseInt(options.top, 10) || 10;
  const topIssues = sorted.slice(0, topN).map(d => {
    const locationParts = d.source.location?.split(':');
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

  // Determine exit code
  let exitCode = 0;
  const failOn = options.failOn as Severity | 'none';

  if (failOn !== 'none') {
    const threshold = SEVERITY_ORDER[failOn] ?? SEVERITY_ORDER.critical;
    const hasFailure = drifts.some(d => SEVERITY_ORDER[d.severity] >= threshold);
    exitCode = hasFailure ? 1 : 0;
  }

  return {
    version: '0.0.1',
    timestamp: new Date().toISOString(),
    summary,
    topIssues,
    exitCode,
  };
}

function printSummary(output: CIOutput): void {
  const icon = output.exitCode === 0 ? '✓' : '✗';
  const status = output.exitCode === 0 ? 'PASS' : 'FAIL';

  console.log(`${icon} Buoy Drift Check: ${status}`);
  console.log('');
  console.log(`  Total:    ${output.summary.total}`);
  console.log(`  Critical: ${output.summary.critical}`);
  console.log(`  Warning:  ${output.summary.warning}`);
  console.log(`  Info:     ${output.summary.info}`);

  if (output.topIssues.length > 0) {
    console.log('');
    console.log('Top issues:');
    for (const issue of output.topIssues.slice(0, 5)) {
      const sev = issue.severity === 'critical' ? '!' :
                  issue.severity === 'warning' ? '~' : 'i';
      const loc = issue.file ? ` (${issue.file}${issue.line ? `:${issue.line}` : ''})` : '';
      console.log(`  [${sev}] ${issue.component}: ${issue.message}${loc}`);
    }

    if (output.topIssues.length > 5) {
      console.log(`  ... and ${output.topIssues.length - 5} more`);
    }
  }
}
