/**
 * buoy plans - Show available plans and features
 *
 * Displays a comparison of Free vs Team plans with pricing info.
 * Helps users understand what they get with an upgrade.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  isLoggedIn,
  getBillingStatus,
} from '../cloud/index.js';
import {
  header,
  newline,
  info,
} from '../output/reporters.js';

const FREE_FEATURES = [
  'Auto-detect design system',
  'All drift detection commands',
  'Token import (JSON, CSS, Tokens Studio)',
  'AI guardrails (skills, hooks, context)',
  'Local scan history',
  'Unlimited developers',
];

const TEAM_FEATURES = [
  'Everything in Free',
  'Unlimited repos',
  'GitHub PR comments',
  'Slack & Teams alerts',
  'Cloud history & trends',
  'Figma Monitor plugin',
];

const ENTERPRISE_FEATURES = [
  'Everything in Team',
  'SSO / SAML',
  'Audit logs',
  'SLA guarantees',
  'Implementation consulting',
  'Dedicated Slack channel',
];

export function createPlansCommand(): Command {
  return new Command('plans')
    .description('Compare available plans and pricing')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      if (options.json) {
        console.log(JSON.stringify({
          plans: [
            {
              id: 'free',
              name: 'Free',
              price: '$0',
              period: 'forever',
              features: FREE_FEATURES,
            },
            {
              id: 'team',
              name: 'Team',
              price: '$25',
              period: '/dev/month',
              annualPrice: '$20',
              annualPeriod: '/dev/month (billed annually)',
              features: TEAM_FEATURES,
            },
            {
              id: 'enterprise',
              name: 'Enterprise',
              price: 'Custom',
              features: ENTERPRISE_FEATURES,
            },
          ],
        }, null, 2));
        return;
      }

      // Check current plan
      let currentPlan = 'free';
      let trialDays = 0;

      if (isLoggedIn()) {
        try {
          const result = await getBillingStatus();
          if (result.ok && result.data) {
            currentPlan = result.data.plan.id;
            if (result.data.trial?.active) {
              trialDays = result.data.trial.daysRemaining;
            }
          }
        } catch {
          // Ignore - assume free
        }
      }

      // Header
      console.log('');
      header('Buoy Plans');
      newline();

      // Free plan
      const freeLabel = currentPlan === 'free' && trialDays === 0
        ? chalk.green(' ← current')
        : '';
      console.log(chalk.bold('Free') + chalk.dim(' $0/forever') + freeLabel);
      for (const feature of FREE_FEATURES) {
        console.log(`  ${chalk.green('✓')} ${feature}`);
      }
      newline();

      // Team plan
      const teamLabel = currentPlan === 'team'
        ? chalk.green(' ← current')
        : trialDays > 0
          ? chalk.yellow(` ← trial (${trialDays} days left)`)
          : '';
      console.log(chalk.cyan.bold('Team') + chalk.dim(' $25/dev/month') + teamLabel);
      console.log(chalk.dim('      $20/dev/month billed annually (20% off)'));
      for (const feature of TEAM_FEATURES) {
        console.log(`  ${chalk.green('✓')} ${feature}`);
      }
      newline();

      // Enterprise plan
      const entLabel = currentPlan === 'enterprise' ? chalk.green(' ← current') : '';
      console.log(chalk.magenta.bold('Enterprise') + chalk.dim(' Custom pricing') + entLabel);
      for (const feature of ENTERPRISE_FEATURES) {
        console.log(`  ${chalk.green('✓')} ${feature}`);
      }
      newline();

      // Call to action
      console.log(chalk.dim('─'.repeat(50)));
      if (currentPlan === 'free' && trialDays === 0) {
        console.log(
          chalk.dim('💡 ') +
          'Run ' +
          chalk.cyan('buoy billing upgrade') +
          ' to start your Team trial'
        );
      } else if (trialDays > 0) {
        console.log(
          chalk.dim('💡 ') +
          'Run ' +
          chalk.cyan('buoy billing upgrade') +
          ' to keep Team features after trial'
        );
      } else if (currentPlan === 'team') {
        info('Contact sales@buoy.dev for Enterprise');
      }

      console.log(
        chalk.dim('   ') +
        'Learn more: ' +
        chalk.cyan('https://buoy.dev/pricing')
      );
    });
}
