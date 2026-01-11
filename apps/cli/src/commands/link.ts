/**
 * buoy link - Connect local project to Buoy Cloud
 *
 * Links the current project to a cloud project for syncing scans and drift history.
 */

import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { createInterface } from 'readline';
import { isLoggedIn } from '../cloud/config.js';
import { listProjects, createProject, type Project } from '../cloud/client.js';
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

const CONFIG_FILES = ['.buoy.yaml', '.buoy.yml', 'buoy.config.mjs', 'buoy.config.js'];

/**
 * Find the first existing config file
 */
function findConfigFile(cwd: string): string | null {
  for (const file of CONFIG_FILES) {
    if (existsSync(join(cwd, file))) {
      return file;
    }
  }
  return null;
}

/**
 * Prompt for selection from a list
 */
function promptSelect(question: string, options: string[]): Promise<number> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(question);
  options.forEach((opt, i) => {
    console.log(`  ${i + 1}. ${opt}`);
  });

  return new Promise((resolve) => {
    rl.question('Enter number: ', (answer) => {
      rl.close();
      const num = parseInt(answer.trim(), 10);
      resolve(num - 1);
    });
  });
}

/**
 * Prompt for text input
 */
function prompt(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Read project name from local config
 */
function getLocalProjectName(cwd: string): string | null {
  const configFile = findConfigFile(cwd);
  if (!configFile) {
    return null;
  }
  const configPath = join(cwd, configFile);

  try {
    const content = readFileSync(configPath, 'utf-8');
    // Simple regex to extract name from config
    const match = content.match(/name:\s*['"]([^'"]+)['"]/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Get existing cloud project ID from local config
 */
function getCloudProjectId(cwd: string): string | null {
  const configFile = findConfigFile(cwd);
  if (!configFile) {
    return null;
  }
  const configPath = join(cwd, configFile);

  try {
    const content = readFileSync(configPath, 'utf-8');
    const match = content.match(/cloudProjectId:\s*['"]([^'"]+)['"]/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Add cloudProjectId to local config
 */
function updateLocalConfig(cwd: string, projectId: string): boolean {
  const configFile = findConfigFile(cwd);
  if (!configFile) {
    return false;
  }
  const configPath = join(cwd, configFile);

  try {
    let content = readFileSync(configPath, 'utf-8');

    // Check if cloudProjectId already exists
    if (content.includes('cloudProjectId:')) {
      // Replace existing
      content = content.replace(
        /cloudProjectId:\s*['"][^'"]*['"]/,
        `cloudProjectId: '${projectId}'`
      );
    } else {
      // Add after project name or at start of project section
      if (content.includes('project:')) {
        // Find project section and add cloudProjectId
        content = content.replace(
          /(project:\s*\{[^}]*name:\s*['"][^'"]+['"])/,
          `$1,\n    cloudProjectId: '${projectId}'`
        );
      } else if (content.includes('name:')) {
        // Add after name in root
        content = content.replace(
          /(name:\s*['"][^'"]+['"])/,
          `$1,\n  cloudProjectId: '${projectId}'`
        );
      }
    }

    writeFileSync(configPath, content);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get git remote URL for repo matching
 */
function getGitRemoteUrl(cwd: string): string | null {
  try {
    const gitConfigPath = join(cwd, '.git', 'config');
    if (!existsSync(gitConfigPath)) return null;

    const content = readFileSync(gitConfigPath, 'utf-8');
    const match = content.match(/url\s*=\s*(.+)/);
    return match?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

export function createLinkCommand(): Command {
  const cmd = new Command('link');

  cmd
    .description('Connect local project to Buoy Cloud')
    .option('--project-id <id>', 'Link to specific cloud project ID')
    .option('--create', 'Create new cloud project')
    .option('-y, --yes', 'Skip confirmation prompts')
    .action(async (options) => {
      const cwd = process.cwd();

      // Check login
      if (!isLoggedIn()) {
        error('Not logged in');
        info('Run `buoy ship login` first');
        process.exit(1);
      }

      // Check for existing link
      const existingId = getCloudProjectId(cwd);
      if (existingId && !options.projectId) {
        warning(`Already linked to cloud project: ${existingId}`);
        info('Run `buoy unlink` first to disconnect');
        return;
      }

      // Check for local config
      const configFile = findConfigFile(cwd);
      if (!configFile) {
        error('No .buoy.yaml found');
        info('Run `buoy dock` first to initialize your project');
        process.exit(1);
      }

      const localName = getLocalProjectName(cwd) || basename(cwd);
      const repoUrl = getGitRemoteUrl(cwd);

      newline();
      header('Buoy Cloud Link');
      keyValue('Local project', localName);
      if (repoUrl) {
        keyValue('Repository', repoUrl);
      }
      newline();

      let cloudProject: Project | undefined;

      if (options.projectId) {
        // Direct link to specified project
        info(`Linking to project ${options.projectId}...`);
        // We'd fetch the project here to verify it exists
        cloudProject = { id: options.projectId } as Project;
      } else if (options.create) {
        // Create new cloud project
        const spin = spinner('Creating cloud project...');

        const result = await createProject({
          name: localName,
          repoUrl: repoUrl || undefined,
        });

        if (!result.ok || !result.data) {
          spin.fail('Failed to create project');
          error(result.error || 'Unknown error');
          process.exit(1);
        }

        spin.succeed('Created cloud project');
        cloudProject = result.data;
      } else {
        // Interactive: list existing projects or create new
        const spin = spinner('Fetching cloud projects...');
        const result = await listProjects();

        if (!result.ok) {
          spin.fail('Failed to fetch projects');
          error(result.error || 'Unknown error');
          process.exit(1);
        }

        spin.stop();

        const projects = result.data?.projects || [];

        // Find matching project by name or repo URL
        const matchingProject = projects.find(
          (p) => p.name === localName || (repoUrl && p.repoUrl === repoUrl)
        );

        if (matchingProject && (options.yes || !process.stdin.isTTY)) {
          // Auto-link to matching project
          cloudProject = matchingProject;
          info(`Found matching project: ${matchingProject.name}`);
        } else if (projects.length > 0 && process.stdin.isTTY) {
          // Let user select
          const projectOptions = [
            ...projects.map((p) => `${p.name} (${p.id})`),
            '+ Create new project',
          ];

          const selection = await promptSelect('Select a cloud project:', projectOptions);

          if (selection === projects.length) {
            // Create new
            const name = await prompt(`Project name [${localName}]: `);
            const projectName = name || localName;

            const createSpin = spinner('Creating cloud project...');
            const createResult = await createProject({
              name: projectName,
              repoUrl: repoUrl || undefined,
            });

            if (!createResult.ok || !createResult.data) {
              createSpin.fail('Failed to create project');
              error(createResult.error || 'Unknown error');
              process.exit(1);
            }

            createSpin.succeed('Created cloud project');
            cloudProject = createResult.data;
          } else if (selection >= 0 && selection < projects.length) {
            cloudProject = projects[selection];
          } else {
            error('Invalid selection');
            process.exit(1);
          }
        } else {
          // No projects, create new
          const spin2 = spinner('Creating cloud project...');
          const result2 = await createProject({
            name: localName,
            repoUrl: repoUrl || undefined,
          });

          if (!result2.ok || !result2.data) {
            spin2.fail('Failed to create project');
            error(result2.error || 'Unknown error');
            process.exit(1);
          }

          spin2.succeed('Created cloud project');
          cloudProject = result2.data;
        }
      }

      if (!cloudProject) {
        error('No project selected');
        process.exit(1);
      }

      // Update local config
      const updated = updateLocalConfig(cwd, cloudProject.id);
      if (!updated) {
        warning('Could not update config file automatically');
        info(`Add this to your .buoy.yaml:`);
        info(`  cloudProjectId: '${cloudProject.id}'`);
      }

      newline();
      success(`Linked to ${cloudProject.name || cloudProject.id}`);
      keyValue('Project ID', cloudProject.id);

      newline();
      info('Your scans will now sync to Buoy Cloud.');
      info('Run `buoy show all` to upload your first scan.');
    });

  return cmd;
}
