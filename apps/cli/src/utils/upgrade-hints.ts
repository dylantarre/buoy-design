// apps/cli/src/utils/upgrade-hints.ts
import chalk from 'chalk';
import { isLoggedIn } from '../cloud/index.js';

export type HintContext =
  | 'after-drift-found'
  | 'after-health-score'
  | 'after-check-fail'
  | 'after-scan'
  | 'after-fix';

interface UpgradeHint {
  condition: () => boolean;
  message: string;
  cta: string;
}

const HINTS: Record<HintContext, UpgradeHint[]> = {
  'after-drift-found': [
    {
      condition: () => !isLoggedIn(),
      message: 'Get PR comments that catch drift before it ships',
      cta: 'buoy ship login',
    },
  ],
  'after-health-score': [
    {
      condition: () => !isLoggedIn(),
      message: 'Track health score trends over time',
      cta: 'buoy ship login',
    },
  ],
  'after-check-fail': [
    {
      condition: () => !isLoggedIn(),
      message: 'Block PRs with drift automatically',
      cta: 'buoy ship github',
    },
  ],
  'after-scan': [
    {
      condition: () => !isLoggedIn(),
      message: 'Share scan results with your team',
      cta: 'buoy ship login',
    },
  ],
  'after-fix': [
    {
      condition: () => !isLoggedIn(),
      message: 'Auto-fix suggestions in PRs',
      cta: 'buoy ship login',
    },
  ],
};

/**
 * Get a random applicable hint for the given context
 * Returns undefined if no hints apply or user is already on paid plan
 */
export function getUpgradeHint(context: HintContext): { message: string; cta: string } | undefined {
  const contextHints = HINTS[context];
  if (!contextHints) return undefined;

  const applicable = contextHints.filter(h => h.condition());
  if (applicable.length === 0) return undefined;

  // Return random applicable hint
  const hint = applicable[Math.floor(Math.random() * applicable.length)];
  if (!hint) return undefined;
  return { message: hint.message, cta: hint.cta };
}

/**
 * Format an upgrade hint for CLI output
 */
export function formatUpgradeHint(context: HintContext): string | undefined {
  const hintData = getUpgradeHint(context);
  if (!hintData) return undefined;

  return chalk.dim(`Tip: ${hintData.message} → ${chalk.cyan(hintData.cta)}`);
}
