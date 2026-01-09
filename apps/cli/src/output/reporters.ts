import chalk from "chalk";
import ora, { Ora } from "ora";

// Output configuration for JSON mode
// When set to true, all non-JSON output is suppressed or redirected to stderr
let jsonMode = false;

export function setJsonMode(enabled: boolean): void {
  jsonMode = enabled;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

function output(message: string): void {
  (jsonMode ? console.error : console.log)(message);
}

// Create a spinner
// In JSON mode, spinner output goes to stderr to keep stdout clean for JSON
export function spinner(text: string): Ora {
  return ora({
    text,
    color: "cyan",
    stream: jsonMode ? process.stderr : process.stdout,
  }).start();
}

// Success message
export function success(message: string): void {
  output(chalk.green("✓") + " " + message);
}

// Warning message
export function warning(message: string): void {
  output(chalk.yellow("!") + " " + message);
}

// Error message
export function error(message: string): void {
  output(chalk.red("✗") + " " + message);
}

// Info message
export function info(message: string): void {
  output(chalk.blue("i") + " " + message);
}

// Debug message (only in verbose mode)
export function debug(message: string, verbose: boolean = false): void {
  if (verbose) {
    output(chalk.dim("  " + message));
  }
}

// Header
export function header(text: string): void {
  output("");
  output(chalk.bold(text));
  output(chalk.dim("─".repeat(text.length)));
}

// Newline
export function newline(): void {
  output("");
}

// Divider
export function divider(): void {
  output(chalk.dim("─".repeat(50)));
}

// List item
export function listItem(text: string, indent: number = 0): void {
  const prefix = "  ".repeat(indent) + chalk.dim("•") + " ";
  output(prefix + text);
}

// Key-value pair
export function keyValue(key: string, value: string, indent: number = 0): void {
  const prefix = "  ".repeat(indent);
  output(prefix + chalk.dim(key + ":") + " " + value);
}

// Progress bar (simple)
// Always writes to stderr to avoid corrupting JSON output on stdout
export function progress(current: number, total: number, label: string): void {
  // In JSON mode, suppress progress output entirely
  if (jsonMode) {
    return;
  }
  // Handle division by zero: if total is 0, show 100% (nothing to do = complete)
  const percent = total > 0 ? Math.round((current / total) * 100) : 100;
  const filled = Math.round(percent / 5);
  const empty = 20 - filled;
  const bar = chalk.green("█".repeat(filled)) + chalk.dim("░".repeat(empty));
  process.stderr.write(`\r${bar} ${percent}% ${label}`);
  if (current === total) {
    process.stderr.write("\n");
  }
}

// Coverage stats interface
export interface CoverageStats {
  aligned: number;
  drifting: number;
  untracked: number;
  total: number;
}

// Coverage grid symbols
const SYMBOLS = {
  filled: "⛁", // Aligned
  partial: "⛀", // Drifting
  empty: "⛶", // Untracked/empty
};

const GRID_COLS = 10;
const GRID_ROWS = 10;
const TOTAL_SLOTS = GRID_COLS * GRID_ROWS;

// Render the coverage grid with legend
export function coverageGrid(stats: CoverageStats): void {
  const { aligned, drifting, untracked, total } = stats;

  // Calculate percentages
  const alignedPct = total > 0 ? Math.round((aligned / total) * 100) : 0;
  const driftingPct = total > 0 ? Math.round((drifting / total) * 100) : 0;
  const untrackedPct = total > 0 ? Math.round((untracked / total) * 100) : 0;

  // Scale to grid slots
  const scale = total > 0 ? TOTAL_SLOTS / total : 0;
  const alignedSlots = Math.round(aligned * scale);
  const driftingSlots = Math.round(drifting * scale);
  const untrackedSlots = TOTAL_SLOTS - alignedSlots - driftingSlots;

  // Build the grid array
  const grid: string[] = [];
  for (let i = 0; i < alignedSlots; i++) {
    grid.push(chalk.green(SYMBOLS.filled));
  }
  for (let i = 0; i < driftingSlots; i++) {
    grid.push(chalk.yellow(SYMBOLS.partial));
  }
  for (let i = 0; i < untrackedSlots; i++) {
    grid.push(chalk.dim(SYMBOLS.empty));
  }

  // Pad to TOTAL_SLOTS if needed
  while (grid.length < TOTAL_SLOTS) {
    grid.push(chalk.dim(SYMBOLS.empty));
  }

  // Build legend lines
  const summaryLine = `${aligned}/${total} components · ${alignedPct}% aligned`;
  const legendLines = [
    "",
    "",
    `${chalk.green(SYMBOLS.filled)} Aligned: ${aligned} (${alignedPct}%)`,
    `${chalk.yellow(SYMBOLS.partial)} Drifting: ${drifting} (${driftingPct}%)`,
    `${chalk.dim(SYMBOLS.empty)} Untracked: ${untracked} (${untrackedPct}%)`,
    "",
    "",
    "",
    "",
    "",
  ];

  // Print header
  console.log("");
  console.log(chalk.bold("Component Alignment"));
  console.log("");

  // Print grid with legend
  for (let row = 0; row < GRID_ROWS; row++) {
    const start = row * GRID_COLS;
    const rowSymbols = grid.slice(start, start + GRID_COLS).join(" ");
    const legend =
      row === 0
        ? `   ${summaryLine}`
        : legendLines[row]
          ? `   ${legendLines[row]}`
          : "";
    console.log(rowSymbols + legend);
  }
  console.log("");
}

/**
 * Health score badge - visual representation of design system health
 * Shows score with color-coded indicator
 */
export function healthBadge(score: number): string {
  const rounded = Math.round(score);
  const color =
    rounded >= 90 ? chalk.green :
    rounded >= 70 ? chalk.yellow :
    rounded >= 50 ? chalk.hex('#FFA500') : // orange
    chalk.red;

  const label =
    rounded >= 90 ? 'Excellent' :
    rounded >= 70 ? 'Good' :
    rounded >= 50 ? 'Fair' :
    'Needs Work';

  return `${color('■')} ${color.bold(String(rounded))}% ${chalk.dim(`(${label})`)}`;
}

/**
 * Display health score prominently
 */
export function displayHealthScore(score: number, components: number, drifts: number): void {
  output('');
  output(chalk.bold('Design System Health'));
  output('');
  output(`  Score: ${healthBadge(score)}`);
  output(`  Components: ${chalk.cyan(String(components))}`);
  output(`  Drift Issues: ${drifts > 0 ? chalk.yellow(String(drifts)) : chalk.green('0')}`);
  output('');
}
