/**
 * Guided issue reviewer for the wizard.
 * Walks through drift issues one at a time with suggestions.
 */

import { readFileSync, writeFileSync } from 'fs';
import { exec } from 'child_process';
import chalk from 'chalk';
import type { DriftSignal, Severity } from '@buoy-design/core';
import { showMenu, sectionHeader, info, codeBlock } from './menu.js';
import { formatDriftTypeForDesigners } from '../output/formatters.js';

type ReviewAction = 'next' | 'open' | 'ignore' | 'back';

interface ReviewResult {
  reviewed: number;
  ignored: number;
  completed: boolean;
}

/**
 * Review drift issues one by one.
 */
export async function reviewIssues(
  drifts: DriftSignal[],
  severity?: Severity
): Promise<ReviewResult> {
  // Filter by severity if specified
  const filtered = severity
    ? drifts.filter(d => d.severity === severity)
    : drifts;

  if (filtered.length === 0) {
    info('No issues to review.');
    return { reviewed: 0, ignored: 0, completed: true };
  }

  let index = 0;
  let ignored = 0;

  while (index < filtered.length) {
    const drift = filtered[index]!;
    const action = await showIssue(drift, index + 1, filtered.length);

    switch (action) {
      case 'next':
        index++;
        break;
      case 'open':
        await openInEditor(drift);
        // Stay on same issue after opening
        break;
      case 'ignore':
        await addIgnoreComment(drift);
        ignored++;
        index++;
        break;
      case 'back':
        return { reviewed: index, ignored, completed: false };
    }
  }

  console.log('');
  console.log(chalk.green('  ✓ ') + `All ${filtered.length} issues reviewed.`);

  return { reviewed: filtered.length, ignored, completed: true };
}

/**
 * Display a single issue and get user action.
 */
async function showIssue(
  drift: DriftSignal,
  current: number,
  total: number
): Promise<ReviewAction> {
  const severityColor = drift.severity === 'critical'
    ? chalk.red
    : drift.severity === 'warning'
    ? chalk.yellow
    : chalk.blue;

  sectionHeader(`${severityColor(drift.severity.toUpperCase())} Issue ${current} of ${total}`);

  // Issue details
  console.log(`  ${chalk.dim('Type:')}      ${formatDriftTypeForDesigners(drift.type)}`);
  console.log(`  ${chalk.dim('File:')}      ${drift.source.location}`);
  console.log('');

  // Show expected vs actual if available
  if (drift.details.expected !== undefined || drift.details.actual !== undefined) {
    if (drift.details.actual !== undefined) {
      console.log(`  ${chalk.dim('Found:')}     ${chalk.red(String(drift.details.actual))}`);
    }
    if (drift.details.expected !== undefined) {
      console.log(`  ${chalk.dim('Suggested:')} ${chalk.green(String(drift.details.expected))}`);
    }
    console.log('');
  }

  // Show token suggestions if available
  if (drift.details.tokenSuggestions && drift.details.tokenSuggestions.length > 0) {
    console.log(`  ${chalk.dim('Token match:')} ${drift.details.tokenSuggestions[0]}`);
    console.log('');
  }

  // Show code context
  const codeContext = await getCodeContext(drift);
  if (codeContext) {
    codeBlock(codeContext);
  }

  // Menu options
  return showMenu<ReviewAction>('', [
    { label: 'Next issue', value: 'next' },
    { label: 'Open file in editor', value: 'open' },
    { label: 'Mark as intentional (add buoy-ignore)', value: 'ignore' },
    { label: 'Back to menu', value: 'back' },
  ]);
}

/**
 * Get code context around the issue.
 */
async function getCodeContext(drift: DriftSignal): Promise<string[] | null> {
  try {
    // Parse location like "src/components/Button.tsx:24"
    const match = drift.source.location.match(/^(.+):(\d+)$/);
    if (!match || !match[1] || !match[2]) return null;

    const filePath = match[1];
    const line = parseInt(match[2], 10);

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Get 2 lines before and after
    const start = Math.max(0, line - 3);
    const end = Math.min(lines.length - 1, line + 1);

    const contextLines: string[] = [];
    for (let i = start; i <= end; i++) {
      const lineNum = (i + 1).toString().padStart(4, ' ');
      const marker = i + 1 === line ? chalk.yellow(' ← ') : '   ';
      const lineContent = lines[i]?.substring(0, 40) ?? '';
      contextLines.push(`${chalk.dim(lineNum)} │ ${lineContent}${marker}`);
    }

    return contextLines;
  } catch {
    return null;
  }
}

/**
 * Open the file in the user's editor.
 */
async function openInEditor(drift: DriftSignal): Promise<void> {
  const match = drift.source.location.match(/^(.+):(\d+)$/);
  if (!match) {
    info('Could not parse file location.');
    return;
  }

  const [, filePath, line] = match;
  const editor = process.env.EDITOR || 'code';

  // VS Code format: code -g file:line
  const command = editor === 'code' || editor === 'code-insiders'
    ? `${editor} -g "${filePath}:${line}"`
    : `${editor} "${filePath}"`;

  return new Promise((resolve) => {
    exec(command, (error) => {
      if (error) {
        info(`Could not open editor: ${error.message}`);
      } else {
        info(`Opened ${filePath} in ${editor}`);
      }
      resolve();
    });
  });
}

/**
 * Add a buoy-ignore comment to the file.
 */
async function addIgnoreComment(drift: DriftSignal): Promise<void> {
  try {
    const match = drift.source.location.match(/^(.+):(\d+)$/);
    if (!match || !match[1] || !match[2]) {
      info('Could not parse file location.');
      return;
    }

    const filePath = match[1];
    const lineNum = parseInt(match[2], 10) - 1; // 0-indexed

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    if (lineNum < 0 || lineNum >= lines.length) {
      info('Line number out of range.');
      return;
    }

    // Detect indentation of the target line
    const targetLine = lines[lineNum] ?? '';
    const indentMatch = targetLine.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '';

    // Detect file type for comment style
    const isJsx = filePath.endsWith('.tsx') || filePath.endsWith('.jsx');
    const comment = isJsx
      ? `${indent}{/* buoy-ignore */}`
      : `${indent}// buoy-ignore`;

    // Insert comment before the line
    lines.splice(lineNum, 0, comment);

    writeFileSync(filePath, lines.join('\n'));
    console.log(chalk.green('  ✓ ') + `Added buoy-ignore to ${filePath}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    info(`Could not add ignore comment: ${msg}`);
  }
}
