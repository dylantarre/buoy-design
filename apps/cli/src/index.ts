import { Command } from "commander";
import {
  createInitCommand,
  createScanCommand,
  createDriftCommand,
  createStatusCommand,
  createTokensCommand,
  createBuildCommand,
  createPluginsCommand,
  createCICommand,
  createCheckCommand,
  createBaselineCommand,
  createExplainCommand,
  createCompareCommand,
} from "./commands/index.js";

export function createCli(): Command {
  const program = new Command();

  program
    .name("buoy")
    .description("Design drift detection for the AI era")
    .version("0.0.1");

  // Add commands
  program.addCommand(createInitCommand());
  program.addCommand(createScanCommand());
  program.addCommand(createDriftCommand());
  program.addCommand(createStatusCommand());
  program.addCommand(createTokensCommand());
  program.addCommand(createBuildCommand());
  program.addCommand(createPluginsCommand());
  program.addCommand(createCICommand());
  program.addCommand(createCheckCommand());
  program.addCommand(createBaselineCommand());
  program.addCommand(createExplainCommand());
  program.addCommand(createCompareCommand());

  return program;
}

// Re-export config utilities for user config files
export { defineConfig } from "./config/schema.js";
export type { BuoyConfig } from "./config/schema.js";
