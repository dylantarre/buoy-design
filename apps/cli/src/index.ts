import { Command } from "commander";
import { existsSync } from "fs";
import { join } from "path";
import {
  createDockCommand,
  createScanCommand,
  createDriftCommand,
  createTokensCommand,
  createAnchorCommand,
  createPluginsCommand,
  createCICommand,
  createCheckCommand,
  createBaselineCommand,
  createExplainCommand,
  createCompareCommand,
  createAuditCommand,
  createGraphCommand,
  createImportCommand,
  createHistoryCommand,
  createBeginCommand,
  createSkillCommand,
  createFixCommand,
  createContextCommand,
  createOnboardCommand,
  createLearnCommand,
  createCommandsCommand,
  // Cloud commands
  createLoginCommand,
  createLogoutCommand,
  createWhoamiCommand,
  createLinkCommand,
  createUnlinkCommand,
  createSyncCommand,
  createGitHubCommand,
  createBillingCommand,
} from "./commands/index.js";

export function createCli(): Command {
  const program = new Command();

  program
    .name("buoy")
    .description("Design drift detection for the AI era")
    .version("0.0.1")
    .configureHelp({
      sortSubcommands: false,
      subcommandTerm: (cmd) => cmd.name(),
    })
    .addHelpText('after', `
Command Groups:
  Getting Started    begin, sweep, dock
  Drift Detection    drift, lighthouse, check, fix, baseline
  AI Integration     onboard, skill, context, explain
  Design Tokens      tokens, anchor, compare, import
  Analysis           audit, graph, history, learn, plugins
  Cloud              login, logout, whoami, link, unlink, sync, billing
  GitHub             github

Quick Start:
  $ buoy              # auto-launches wizard if no config
  $ buoy sweep        # scan your codebase
  $ buoy drift        # check for design drift
  $ buoy onboard      # set up AI guardrails
`);

  // === Getting Started ===
  const beginCommand = createBeginCommand();
  program.addCommand(beginCommand);
  program.addCommand(createScanCommand());
  program.addCommand(createDockCommand());

  // === Drift Detection ===
  program.addCommand(createCheckCommand());
  program.addCommand(createDriftCommand());
  program.addCommand(createCICommand());
  program.addCommand(createFixCommand());
  program.addCommand(createBaselineCommand());

  // === AI Integration ===
  program.addCommand(createOnboardCommand());
  program.addCommand(createSkillCommand());
  program.addCommand(createContextCommand());
  program.addCommand(createExplainCommand());
  program.addCommand(createCommandsCommand());

  // === Design Tokens ===
  program.addCommand(createTokensCommand());
  program.addCommand(createAnchorCommand());
  program.addCommand(createCompareCommand());
  program.addCommand(createImportCommand());

  // === Analysis ===
  program.addCommand(createAuditCommand());
  program.addCommand(createGraphCommand());
  program.addCommand(createHistoryCommand());
  program.addCommand(createLearnCommand());
  program.addCommand(createPluginsCommand());

  // === Cloud ===
  program.addCommand(createLoginCommand());
  program.addCommand(createLogoutCommand());
  program.addCommand(createWhoamiCommand());
  program.addCommand(createLinkCommand());
  program.addCommand(createUnlinkCommand());
  program.addCommand(createSyncCommand());
  program.addCommand(createBillingCommand());

  // === GitHub ===
  program.addCommand(createGitHubCommand());

  // Default action: run wizard if no config exists
  program.action(async () => {
    const configExists =
      existsSync(join(process.cwd(), 'buoy.config.mjs')) ||
      existsSync(join(process.cwd(), 'buoy.config.js')) ||
      existsSync(join(process.cwd(), 'buoy.config.json'));

    if (!configExists && process.stdin.isTTY) {
      // No config + interactive terminal - launch wizard
      console.log('\nNo config found. Launching setup wizard...\n');
      await beginCommand.parseAsync([], { from: 'user' });
    } else {
      // Config exists or non-interactive - show help
      program.outputHelp();
    }
  });

  return program;
}

// Re-export config utilities for user config files
export { defineConfig } from "./config/schema.js";
export type { BuoyConfig } from "./config/schema.js";
