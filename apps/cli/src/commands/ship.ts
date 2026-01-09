/**
 * buoy ship - Buoy Cloud management
 *
 * buoy ship login    - Authenticate
 * buoy ship logout   - Sign out
 * buoy ship status   - Show account, project, and bot status
 * buoy ship github   - Set up GitHub PR bot
 * buoy ship gitlab   - Set up GitLab PR bot (coming soon)
 * buoy ship billing  - Manage subscription
 * buoy ship plans    - Compare pricing
 */

import { Command } from 'commander';
import chalk from 'chalk';
import open from 'open';
import {
  isLoggedIn,
  getApiEndpoint,
  listGitHubInstallations,
  revokeGitHubInstallation,
  getGitHubInstallUrl,
  requireFeature,
  getBillingStatus,
  getQueueCount,
} from '../cloud/index.js';
import { getMe } from '../cloud/client.js';
import {
  spinner,
  success,
  error,
  info,
  warning,
  keyValue,
  newline,
  header,
} from '../output/reporters.js';
import { createLoginCommand } from './login.js';
import { createLogoutCommand } from './logout.js';
import { createBillingCommand } from './billing.js';
import { createPlansCommand } from './plans.js';

export function createShipCommand(): Command {
  const cmd = new Command('ship');

  cmd
    .description('Ship to Buoy Cloud - PR bot and team features')
    .addCommand(createLoginCommand())
    .addCommand(createLogoutCommand())
    .addCommand(createStatusCommand())
    .addCommand(createGitHubCommand())
    .addCommand(createGitLabCommand())
    .addCommand(createBillingCommand())
    .addCommand(createPlansCommand());

  // Default action shows status
  cmd.action(async () => {
    const statusCmd = cmd.commands.find(c => c.name() === 'status');
    if (statusCmd) {
      await statusCmd.parseAsync([], { from: 'user' });
    }
  });

  return cmd;
}

// ============================================================================
// Status - Combined view of account, project, and bot
// ============================================================================

function createStatusCommand(): Command {
  return new Command('status')
    .description('Show cloud account, project link, and bot status')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      if (!isLoggedIn()) {
        if (options.json) {
          console.log(JSON.stringify({ loggedIn: false }));
        } else {
          warning('Not logged in');
          info('Run `buoy ship login` to sign in');
        }
        return;
      }

      const spin = spinner('Checking cloud status...');

      try {
        // Fetch user info
        const meResult = await getMe();
        if (!meResult.ok || !meResult.data) {
          spin.fail('Session expired');
          error('Please login again: buoy ship login');
          process.exit(1);
        }

        // Fetch GitHub installations
        const githubResult = await listGitHubInstallations();
        const installations = githubResult.ok ? (githubResult.data?.installations || []) : [];

        // Fetch billing
        let billing = null;
        try {
          const billingResult = await getBillingStatus();
          if (billingResult.ok && billingResult.data) {
            billing = billingResult.data;
          }
        } catch {
          // Ignore billing errors
        }

        // Get queue count
        const queueCount = getQueueCount(process.cwd());

        spin.stop();

        const { user, account } = meResult.data;

        if (options.json) {
          console.log(JSON.stringify({
            loggedIn: true,
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
            },
            account: {
              id: account.id,
              name: account.name,
              plan: account.plan,
            },
            github: {
              installations: installations.map(i => ({
                account: i.accountLogin,
                type: i.accountType,
                suspended: i.suspended,
              })),
            },
            queue: queueCount,
            billing: billing ? {
              plan: billing.plan?.name,
              trial: billing.trial,
              subscription: !!billing.subscription,
            } : null,
          }, null, 2));
          return;
        }

        // Human-readable output
        newline();
        header('Buoy Cloud Status');
        newline();

        // Account section
        console.log(chalk.bold('Account'));
        keyValue('  User', user.name || user.email);
        keyValue('  Email', user.email);
        keyValue('  Organization', account.name);

        // Plan with color
        const planColor = billing?.plan?.id === 'team' ? chalk.green :
                         billing?.plan?.id === 'enterprise' ? chalk.magenta :
                         chalk.gray;
        keyValue('  Plan', planColor(billing?.plan?.name || account.plan));

        if (billing?.trial?.active) {
          keyValue('  Status', chalk.yellow(`Trial (${billing.trial.daysRemaining} days left)`));
        } else if (billing?.subscription) {
          keyValue('  Status', chalk.green('Active'));
        }

        newline();

        // GitHub Bot section
        console.log(chalk.bold('GitHub Bot'));
        if (installations.length === 0) {
          keyValue('  Status', chalk.dim('Not installed'));
          info('  Run `buoy ship github` to set up PR comments');
        } else {
          for (const install of installations) {
            const statusIcon = install.suspended ? chalk.red('suspended') : chalk.green('active');
            keyValue(`  ${install.accountLogin}`, statusIcon);
          }
        }

        newline();

        // Sync queue
        console.log(chalk.bold('Sync Queue'));
        if (queueCount > 0) {
          keyValue('  Pending', chalk.yellow(String(queueCount)));
          info('  Scans will sync automatically on next run');
        } else {
          keyValue('  Pending', chalk.green('0'));
        }

        // Payment alert if any
        if (billing?.paymentAlert) {
          newline();
          warning(`Payment ${billing.paymentAlert.status}`);
          info(`${billing.paymentAlert.daysRemaining} days until account restriction`);
          info(`Run ${chalk.cyan('buoy ship billing')} to update payment`);
        }

      } catch (err) {
        spin.fail('Failed to check status');
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exit(1);
      }
    });
}

// ============================================================================
// GitHub Bot Setup
// ============================================================================

function createGitHubCommand(): Command {
  const cmd = new Command('github');

  cmd
    .description('Set up GitHub PR bot')
    .option('--disconnect [account]', 'Remove GitHub installation')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      if (!isLoggedIn()) {
        if (options.json) {
          console.log(JSON.stringify({ error: 'Not logged in' }));
        } else {
          error('Not logged in');
          info('Run `buoy ship login` to sign in');
        }
        process.exit(1);
      }

      // Handle disconnect
      if (options.disconnect !== undefined) {
        await handleGitHubDisconnect(options.disconnect, options.json);
        return;
      }

      // Check feature access
      const allowed = await requireFeature('github-pr-comments');
      if (!allowed) {
        process.exit(1);
      }

      // Show current status first
      const spin = spinner('Checking GitHub status...');
      const result = await listGitHubInstallations();
      spin.stop();

      if (result.ok) {
        const installations = result.data?.installations || [];

        if (installations.length > 0) {
          if (options.json) {
            console.log(JSON.stringify({ installations }, null, 2));
            return;
          }

          header('GitHub Bot');
          newline();

          for (const install of installations) {
            const statusIcon = install.suspended ? chalk.red('suspended') : chalk.green('active');
            console.log(`${chalk.bold(install.accountLogin)} (${install.accountType})`);
            keyValue('  Status', statusIcon);
            keyValue('  Repositories', install.repositorySelection === 'all' ? 'All' : 'Selected');
            newline();
          }

          success(`${installations.length} installation(s) connected`);
          newline();
          info('To add another org/account, run this command again');
          info('To disconnect: buoy ship github --disconnect <account>');

          // Still offer to add more
          newline();
        }
      }

      // Show free tier message when no installations yet
      if (!result.ok || (result.data?.installations || []).length === 0) {
        if (!options.json) {
          header('GitHub PR Bot');
          newline();
          console.log(chalk.green('✓ Free for public repositories'));
          console.log(chalk.dim('  Private repos available on Team plan'));
          newline();
        }
      }

      // Open install URL
      const endpoint = getApiEndpoint();
      const installUrl = getGitHubInstallUrl(endpoint);

      info('Opening browser to install the Buoy GitHub App...');
      newline();

      try {
        await open(installUrl);
        success('Browser opened!');
        newline();
        info('Complete the installation in your browser.');
        info('Choose which repositories Buoy should have access to.');
        newline();
        console.log(chalk.green.bold('Free for public repositories!'));
        info('Private repos require a Team plan. See: buoy ship plans');
        newline();
        info('After installation, run `buoy ship status` to verify.');
      } catch {
        error('Failed to open browser');
        newline();
        info('Please visit this URL manually:');
        console.log(chalk.cyan(installUrl));
      }
    });

  return cmd;
}

async function handleGitHubDisconnect(account: string | true, json: boolean): Promise<void> {
  const spin = spinner('Getting installations...');

  const result = await listGitHubInstallations();
  if (!result.ok) {
    spin.fail('Failed to get installations');
    error(result.error || 'Unknown error');
    process.exit(1);
  }

  const installations = result.data?.installations || [];

  if (installations.length === 0) {
    spin.stop();
    if (json) {
      console.log(JSON.stringify({ message: 'No installations' }));
    } else {
      info('No GitHub installations to disconnect');
    }
    return;
  }

  let toDisconnect = installations;

  // If specific account provided
  if (typeof account === 'string') {
    toDisconnect = installations.filter(
      (i) => i.accountLogin.toLowerCase() === account.toLowerCase()
    );

    if (toDisconnect.length === 0) {
      spin.stop();
      error(`No installation found for "${account}"`);
      info('Available: ' + installations.map(i => i.accountLogin).join(', '));
      process.exit(1);
    }
  } else if (installations.length > 1) {
    // Multiple installations, need to specify
    spin.stop();
    error('Multiple installations found. Specify which to disconnect:');
    for (const i of installations) {
      info(`  buoy ship github --disconnect ${i.accountLogin}`);
    }
    process.exit(1);
  }

  spin.text = 'Disconnecting...';

  const disconnected: string[] = [];
  const failed: string[] = [];

  for (const install of toDisconnect) {
    const deleteResult = await revokeGitHubInstallation(install.id);
    if (deleteResult.ok) {
      disconnected.push(install.accountLogin);
    } else {
      failed.push(install.accountLogin);
    }
  }

  spin.stop();

  if (json) {
    console.log(JSON.stringify({ disconnected, failed }));
    return;
  }

  if (disconnected.length > 0) {
    success(`Disconnected: ${disconnected.join(', ')}`);
  }
  if (failed.length > 0) {
    warning(`Failed: ${failed.join(', ')}`);
  }

  newline();
  info('Note: To fully uninstall, visit GitHub Settings > Applications');
}

// ============================================================================
// GitLab (Coming Soon)
// ============================================================================

function createGitLabCommand(): Command {
  return new Command('gitlab')
    .description('Set up GitLab PR bot (coming soon)')
    .action(() => {
      header('GitLab Integration');
      newline();
      info('GitLab integration is coming soon!');
      newline();
      info('In the meantime, use the CLI in GitLab CI:');
      newline();
      console.log(chalk.dim('  # .gitlab-ci.yml'));
      console.log(chalk.cyan('  buoy_check:'));
      console.log(chalk.cyan('    script:'));
      console.log(chalk.cyan('      - npx @buoy-design/cli check --json'));
      newline();
      info('Follow updates at: https://buoy.design/roadmap');
    });
}
