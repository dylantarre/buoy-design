#!/usr/bin/env node
/**
 * Workflow Enforcement Hook
 *
 * Runs before git commits to remind about:
 * - Changelog updates
 * - Version bumps
 * - Test runs
 *
 * This is a "soft" enforcement - it provides feedback but doesn't block.
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

let inputData = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  inputData += chunk;
});

process.stdin.on('end', () => {
  try {
    const input = JSON.parse(inputData);
    const result = checkWorkflow(input);

    if (result) {
      console.log(JSON.stringify(result));
    }

    process.exit(0);
  } catch (err) {
    process.exit(0);
  }
});

function checkWorkflow(input) {
  const command = input.tool_input?.command || '';
  const cwd = input.cwd || process.cwd();

  // Only check on git commit commands
  if (!command.includes('git commit')) {
    return null;
  }

  const reminders = [];

  // Check if CHANGELOG.md was modified
  const changelogUpdated = isChangelogUpdated(cwd);
  if (!changelogUpdated) {
    reminders.push('📝 CHANGELOG.md has not been updated. Consider adding an entry under [Unreleased].');
  }

  // Check if this looks like a version bump commit
  const isVersionBump = command.includes('version') || command.includes('release') || command.includes('bump');
  if (isVersionBump) {
    // Check if all package.jsons are in sync
    const versionIssues = checkVersionSync(cwd);
    if (versionIssues.length > 0) {
      reminders.push('⚠️ Version sync issues: ' + versionIssues.join(', '));
    }
  }

  // Check if tests were run recently (within last 5 minutes of git activity)
  // This is a heuristic - we can't know for sure
  const hasTestFiles = existsSync(path.join(cwd, 'packages/core/src/__tests__')) ||
                       existsSync(path.join(cwd, 'apps/cli/src/__tests__'));
  if (hasTestFiles && !wasTestRunRecently(cwd)) {
    reminders.push('🧪 Consider running `pnpm test` before committing.');
  }

  if (reminders.length === 0) {
    return null;
  }

  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: [
        '📋 Workflow Reminders:',
        '',
        ...reminders,
        '',
        'These are reminders, not blockers. Proceed if intentional.'
      ].join('\n')
    }
  };
}

function isChangelogUpdated(cwd) {
  try {
    // Check if CHANGELOG.md is in the staged files
    const staged = execSync('git diff --cached --name-only', { cwd, encoding: 'utf8' });
    return staged.includes('CHANGELOG.md');
  } catch {
    return true; // Assume updated if we can't check
  }
}

function checkVersionSync(cwd) {
  const issues = [];
  const packages = [
    'apps/cli/package.json',
    'apps/ahoybuoy/package.json',
    'packages/core/package.json',
    'packages/scanners/package.json'
  ];

  try {
    const versions = {};
    for (const pkg of packages) {
      const fullPath = path.join(cwd, pkg);
      if (existsSync(fullPath)) {
        const content = JSON.parse(readFileSync(fullPath, 'utf8'));
        versions[pkg] = content.version;
      }
    }

    // CLI and ahoybuoy should match
    if (versions['apps/cli/package.json'] !== versions['apps/ahoybuoy/package.json']) {
      issues.push('cli and ahoybuoy versions should match');
    }

    // Core and scanners should match
    if (versions['packages/core/package.json'] !== versions['packages/scanners/package.json']) {
      issues.push('core and scanners versions should match');
    }
  } catch {
    // Ignore errors
  }

  return issues;
}

function wasTestRunRecently(cwd) {
  // This is a heuristic - check if there's recent test output
  // In practice, we can't reliably detect this, so just return true
  // to avoid false positives
  return true;
}
