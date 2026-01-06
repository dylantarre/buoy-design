/**
 * Interactive menu helpers for the wizard.
 */

import { select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';

export interface MenuOption<T = string> {
  label: string;
  value: T;
  description?: string;
  disabled?: boolean;
}

/**
 * Display an interactive menu and return the selected value.
 */
export async function showMenu<T = string>(
  title: string,
  options: MenuOption<T>[]
): Promise<T> {
  console.log('');
  console.log(chalk.bold(title));
  console.log('');

  const answer = await select({
    message: '',
    choices: options.map(opt => ({
      name: opt.label,
      value: opt.value,
      description: opt.description,
      disabled: opt.disabled,
    })),
  });

  return answer;
}

/**
 * Ask a yes/no confirmation question.
 */
export async function askConfirm(message: string, defaultValue = true): Promise<boolean> {
  return confirm({
    message,
    default: defaultValue,
  });
}

/**
 * Display a section header.
 */
export function sectionHeader(title: string): void {
  console.log('');
  console.log(chalk.dim('━━━ ') + chalk.bold(title) + chalk.dim(' ━━━'));
  console.log('');
}

/**
 * Display a success message.
 */
export function success(message: string): void {
  console.log(chalk.green('  ✓ ') + message);
}

/**
 * Display an info message.
 */
export function info(message: string): void {
  console.log(chalk.dim('  ') + message);
}

/**
 * Display a bullet list.
 */
export function bulletList(items: string[]): void {
  for (const item of items) {
    console.log(chalk.dim('    • ') + item);
  }
}

/**
 * Display a code block.
 */
export function codeBlock(lines: string[]): void {
  console.log('');
  console.log(chalk.dim('┌' + '─'.repeat(50) + '┐'));
  for (const line of lines) {
    console.log(chalk.dim('│ ') + line.padEnd(48) + chalk.dim(' │'));
  }
  console.log(chalk.dim('└' + '─'.repeat(50) + '┘'));
  console.log('');
}

/**
 * Display a key-value pair.
 */
export function keyValue(key: string, value: string): void {
  console.log(`  ${chalk.dim(key + ':')} ${value}`);
}

/**
 * Pause with a "press enter to continue" prompt.
 */
export async function pressEnter(message = 'Press enter to continue...'): Promise<void> {
  await confirm({
    message,
    default: true,
  });
}
