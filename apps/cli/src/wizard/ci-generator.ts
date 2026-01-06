/**
 * CI configuration generator for the wizard.
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { showMenu, sectionHeader, success, info, bulletList } from './menu.js';

type CIProvider = 'github' | 'gitlab' | 'manual';

interface CISetupResult {
  provider: CIProvider;
  filePath?: string;
  created: boolean;
}

const GITHUB_WORKFLOW = `name: Design System Check
on: [pull_request]

jobs:
  buoy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run Buoy
        run: npx @buoy-design/cli ci
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`;

const GITLAB_CI = `buoy:
  image: node:20
  script:
    - npx @buoy-design/cli ci
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
`;

/**
 * Run the CI setup wizard.
 */
export async function setupCI(cwd: string): Promise<CISetupResult> {
  sectionHeader('Set up CI Integration');

  info('Buoy can comment on PRs when drift is introduced.');
  console.log('');

  const provider = await showMenu<CIProvider>('Which CI provider?', [
    { label: 'GitHub Actions', value: 'github' },
    { label: 'GitLab CI', value: 'gitlab' },
    { label: 'Other / Manual setup', value: 'manual' },
  ]);

  switch (provider) {
    case 'github':
      return setupGitHub(cwd);
    case 'gitlab':
      return setupGitLab(cwd);
    case 'manual':
      return showManualInstructions();
  }
}

/**
 * Set up GitHub Actions workflow.
 */
async function setupGitHub(cwd: string): Promise<CISetupResult> {
  const workflowDir = join(cwd, '.github', 'workflows');
  const workflowPath = join(workflowDir, 'buoy.yml');

  // Check if file already exists
  if (existsSync(workflowPath)) {
    info('GitHub workflow already exists at .github/workflows/buoy.yml');
    return { provider: 'github', filePath: workflowPath, created: false };
  }

  // Create directory if needed
  if (!existsSync(workflowDir)) {
    mkdirSync(workflowDir, { recursive: true });
  }

  // Write workflow file
  writeFileSync(workflowPath, GITHUB_WORKFLOW);

  console.log('');
  success('Created .github/workflows/buoy.yml');
  console.log('');

  info('This workflow will:');
  bulletList([
    'Run on pull requests',
    'Comment with drift summary',
    'Fail on critical issues (configurable)',
  ]);

  console.log('');
  info(`${chalk.bold('Next:')} Push this file and Buoy will run on your next PR.`);

  return { provider: 'github', filePath: workflowPath, created: true };
}

/**
 * Set up GitLab CI configuration.
 */
async function setupGitLab(cwd: string): Promise<CISetupResult> {
  const ciPath = join(cwd, '.gitlab-ci.yml');

  // Check if file already exists
  if (existsSync(ciPath)) {
    info('GitLab CI config already exists. Add the buoy job manually:');
    console.log('');
    console.log(chalk.dim(GITLAB_CI));
    return { provider: 'gitlab', created: false };
  }

  // Write CI file
  writeFileSync(ciPath, GITLAB_CI);

  console.log('');
  success('Created .gitlab-ci.yml');
  console.log('');

  info('This job will:');
  bulletList([
    'Run on merge requests',
    'Report drift in the pipeline',
  ]);

  console.log('');
  info(`${chalk.bold('Next:')} Push this file to enable Buoy in your pipeline.`);

  return { provider: 'gitlab', filePath: ciPath, created: true };
}

/**
 * Show manual CI setup instructions.
 */
async function showManualInstructions(): Promise<CISetupResult> {
  console.log('');
  info('Add this to your CI pipeline:');
  console.log('');
  console.log(chalk.cyan('    npx @buoy-design/cli ci'));
  console.log('');

  info('Options:');
  bulletList([
    `${chalk.dim('--fail-on critical')}   Exit 1 on critical issues`,
    `${chalk.dim('--fail-on warning')}    Exit 1 on warnings too`,
  ]);

  return { provider: 'manual', created: false };
}
