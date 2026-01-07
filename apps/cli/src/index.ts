import { Command } from "commander";
import { existsSync } from "fs";
import { join } from "path";
import pkg from "../package.json" with { type: "json" };
import {
  createDockCommand,
  createPluginsCommand,
  createCheckCommand,
  createBaselineCommand,
  createBeginCommand,
  createFixCommand,
  createShowCommand,
  createDriftCommand,
  createTokensCommand,
  createComponentsCommand,
  createScanCommand,
  createCommandsCommand,
  createShipCommand,
} from "./commands/index.js";

export function createCli(): Command {
  const program = new Command();

  program
    .name("buoy")
    .description("Design drift detection for the AI era")
    .version(pkg.version)
    .configureHelp({
      sortSubcommands: false,
      subcommandTerm: (cmd) => cmd.name(),
    })
    .addHelpText(
      "after",
      `
Command Groups:
  For AI Agents      show (components, tokens, drift, health, all, history)
  Getting Started    begin, dock (config, skills, agents, context, hooks)
  CI/Hooks           check, baseline
  Fixing             fix
  Plugins            plugins
  Ship (Cloud)       ship (login, logout, status, github, gitlab, billing, plans)

Quick Start:
  $ buoy                    # auto-launches wizard if no config
  $ buoy show all           # everything an AI agent needs
  $ buoy show drift         # design system violations
  $ buoy dock               # set up config, skills, agents, hooks
`,
    );

  // === For AI Agents (primary interface) ===
  program.addCommand(createShowCommand());
  program.addCommand(createDriftCommand());
  program.addCommand(createTokensCommand());
  program.addCommand(createComponentsCommand());
  program.addCommand(createScanCommand());

  // === Getting Started ===
  const beginCommand = createBeginCommand();
  program.addCommand(beginCommand);
  program.addCommand(createDockCommand());
  program.addCommand(createCommandsCommand());

  // === CI/Hooks ===
  program.addCommand(createCheckCommand());
  program.addCommand(createBaselineCommand());

  // === Fixing ===
  program.addCommand(createFixCommand());

  // === Plugins ===
  program.addCommand(createPluginsCommand());

  // === Ship (Cloud) ===
  program.addCommand(createShipCommand());

  // Default action: run wizard if no config exists
  program.action(async () => {
    const configExists =
      existsSync(join(process.cwd(), "buoy.config.mjs")) ||
      existsSync(join(process.cwd(), "buoy.config.js")) ||
      existsSync(join(process.cwd(), "buoy.config.json"));

    if (!configExists && process.stdin.isTTY) {
      // No config + interactive terminal - launch wizard
      console.log("\nNo config found. Launching setup wizard...\n");
      await beginCommand.parseAsync([], { from: "user" });
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
