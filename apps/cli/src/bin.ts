#!/usr/bin/env node

import { createCli } from './index.js';
import { existsSync } from 'fs';
import { join } from 'path';

const cli = createCli();

// Check if user provided any arguments beyond node and script path
const hasArgs = process.argv.length > 2;

if (!hasArgs) {
  // No arguments - check if config exists
  const configExists =
    existsSync(join(process.cwd(), ".buoy.yaml")) ||
    existsSync(join(process.cwd(), ".buoy.yml")) ||
    existsSync(join(process.cwd(), "buoy.config.mjs")) ||
    existsSync(join(process.cwd(), "buoy.config.js"));

  if (!configExists) {
    // No config - launch wizard
    console.log("\n🛟 No config found. Launching setup wizard...\n");
    cli.parse(["node", "buoy", "begin"]);
  } else {
    // Config exists - show help
    cli.parse();
  }
} else {
  cli.parse();
}
