#!/usr/bin/env node
/**
 * Buoy PostToolUse Hook - Self-Validating Agent
 *
 * Runs after Edit/Write tool completes to check for design drift.
 * Returns structured feedback that Claude can use to self-correct.
 *
 * @see https://code.claude.com/docs/en/hooks
 */

import { spawnSync } from 'child_process';
import { readFileSync, unlinkSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

// Read hook input from stdin
let inputData = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  inputData += chunk;
});

process.stdin.on('end', () => {
  try {
    const input = JSON.parse(inputData);
    const result = validateFile(input);

    if (result) {
      console.log(JSON.stringify(result));
    }

    // Always exit 0 - we want to provide feedback, not block
    process.exit(0);
  } catch (err) {
    // Silent failure - don't interrupt Claude's work
    process.exit(0);
  }
});

/**
 * Check if a file is a UI component file we should validate
 */
function isUIFile(filePath) {
  if (!filePath) return false;

  const uiExtensions = [
    '.tsx', '.jsx', '.vue', '.svelte',
    '.component.ts', '.component.html'
  ];

  const excludePatterns = [
    /\.test\./,
    /\.spec\./,
    /\.stories\./,
    /node_modules/,
    /\.d\.ts$/,
    /\.config\./
  ];

  const isUIExt = uiExtensions.some(e => filePath.endsWith(e));
  const isExcluded = excludePatterns.some(p => p.test(filePath));

  return isUIExt && !isExcluded;
}

/**
 * Validate a file for design drift
 */
function validateFile(input) {
  const toolInput = input.tool_input || {};
  const filePath = toolInput.file_path;

  // Only validate UI files
  if (!isUIFile(filePath)) {
    return null;
  }

  try {
    // Run buoy check with JSON format via temp file to avoid Node.js pipe buffer limits
    const tempFile = path.join(tmpdir(), `buoy-check-${process.pid}.json`);
    const result = spawnSync('sh', ['-c', `npx buoy check --format json > "${tempFile}" 2>/dev/null`], {
      cwd: input.cwd || process.cwd(),
      timeout: 30000,
      shell: false
    });

    if (result.error) {
      return null;
    }

    let output;
    try {
      output = readFileSync(tempFile, 'utf8');
      unlinkSync(tempFile);
    } catch (e) {
      return null;
    }

    const checkResult = JSON.parse(output);

    // Filter to only issues in the modified file
    const fileIssues = (checkResult.issues || checkResult.drifts || []).filter(
      issue => {
        // Extract path from source.location (format: "path/to/file.tsx:123")
        const location = issue.source?.location || '';
        const issuePath = location.split(':')[0] || issue.file || issue.source?.path;
        return issuePath === filePath || filePath.endsWith(issuePath) || issuePath?.endsWith(path.basename(filePath));
      }
    );

    if (fileIssues.length === 0) {
      return null; // No issues, no feedback needed
    }

    // Format feedback for Claude
    const feedback = formatFeedback(filePath, fileIssues);

    return {
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: feedback
      }
    };

  } catch (err) {
    // buoy check failed or not installed - silent failure
    return null;
  }
}

/**
 * Format drift issues as actionable feedback for Claude
 */
function formatFeedback(filePath, issues) {
  const lines = [
    '⚠️ Design drift detected in ' + path.basename(filePath) + ':',
    ''
  ];

  for (const issue of issues.slice(0, 5)) { // Limit to 5 issues
    const type = issue.type || issue.driftType || 'drift';
    const msg = issue.message || issue.description || 'Design system violation';
    lines.push('• ' + type + ': ' + msg);

    if (issue.suggestion || issue.fix) {
      lines.push('  Fix: ' + (issue.suggestion || issue.fix));
    }
    lines.push('');
  }

  if (issues.length > 5) {
    lines.push('... and ' + (issues.length - 5) + ' more issues');
    lines.push('');
  }

  lines.push('Run `buoy show drift` for full details.');

  return lines.join('\n');
}
