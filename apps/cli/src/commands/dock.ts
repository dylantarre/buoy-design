/**
 * buoy dock - Dock Buoy into your project
 *
 * Smart walkthrough that sets up config, agents, and hooks.
 *
 * Usage:
 *   buoy dock              # Smart walkthrough: config → agents → hooks
 *   buoy dock config       # Just create buoy.config.mjs
 *   buoy dock agents       # Set up AI agents (skills + context)
 *   buoy dock skills       # Just create skill files
 *   buoy dock context      # Just generate CLAUDE.md section
 *   buoy dock hooks        # Just set up git hooks
 */

import { Command } from "commander";
import {
  writeFileSync,
  existsSync,
  readFileSync,
  mkdirSync,
  appendFileSync,
  copyFileSync,
  readdirSync,
} from "fs";
import { resolve, dirname, join } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";
import chalk from "chalk";
import { createInterface } from "readline";
import ora from "ora";
import {
  success,
  error,
  info,
  warning,
  setJsonMode,
  spinner,
} from "../output/reporters.js";
import { loadConfig, getConfigPath } from "../config/loader.js";
import { buildAutoConfig } from "../config/auto-detect.js";
import { ScanOrchestrator } from "../scan/orchestrator.js";
import { SkillExportService } from "../services/skill-export.js";
import { generateContext } from "../services/context-generator.js";
import {
  setupHooks,
  generateStandaloneHook,
  detectHookSystem,
  setupClaudeHooks,
} from "../hooks/index.js";
import {
  ProjectDetector,
  type DetectedProject,
  detectMonorepoConfig,
  expandPatternsForMonorepo,
} from "../detect/index.js";
import {
  detectFrameworks,
  getPluginInstallCommand,
} from "../detect/frameworks.js";
import type { BuoyConfig } from "../config/schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createDockCommand(): Command {
  const cmd = new Command("dock")
    .description("Dock Buoy into your project")
    .option("-y, --yes", "Auto-accept all defaults")
    .option("--json", "Output results as JSON")
    .option("-f, --force", "Overwrite existing configuration")
    .action(async (options) => {
      await runSmartDock(options);
    });

  // dock config - Just create config
  cmd
    .command("config")
    .description("Create buoy.config.mjs")
    .option("-f, --force", "Overwrite existing configuration")
    .option("-y, --yes", "Auto-install recommended plugins without prompting")
    .option("--skip-detect", "Skip auto-detection and create minimal config")
    .action(async (options) => {
      await runConfigDock(options);
    });

  // dock agents - Full AI agent onboarding
  cmd
    .command("agents")
    .description("Set up AI agents with your design system")
    .option("--dry-run", "Show what would be created without writing files")
    .option("--json", "Output result as JSON")
    .action(async (options) => {
      await runAgentsDock(options);
    });

  // dock skills - Create skill files
  cmd
    .command("skills")
    .description("Create skill files for AI agents")
    .option(
      "-o, --output <path>",
      "Output directory",
      ".claude/skills/design-system",
    )
    .option("--global", "Export to global skills directory (~/.claude/skills/)")
    .option("--dry-run", "Show what would be created without writing files")
    .option("--json", "Output result as JSON")
    .action(async (options) => {
      await runSkillsDock(options);
    });

  // dock context - Generate CLAUDE.md section
  cmd
    .command("context")
    .description("Generate design system context for CLAUDE.md")
    .option("-o, --output <path>", "Output file path (default: CLAUDE.md)")
    .option("--stdout", "Output to stdout instead of file")
    .option(
      "-d, --detail <level>",
      "Detail level: minimal, standard, comprehensive",
      "standard",
    )
    .option("--json", "Output as JSON with stats")
    .action(async (options) => {
      await runContextDock(options);
    });

  // dock hooks - Set up git hooks
  cmd
    .command("hooks")
    .description("Set up git hooks for drift checking")
    .option("--claude", "Also set up Claude Code hooks")
    .action(async (options) => {
      await runHooksDock(options);
    });

  return cmd;
}

/**
 * Smart dock walkthrough - goes through config → agents → hooks
 */
async function runSmartDock(options: {
  yes?: boolean;
  json?: boolean;
  force?: boolean;
}) {
  const cwd = process.cwd();

  if (options.json) {
    setJsonMode(true);
  }

  console.log("");
  console.log(chalk.cyan.bold("  Docking Buoy..."));
  console.log(chalk.dim("  ─".repeat(25)));
  console.log("");

  const results = {
    configCreated: false,
    agentsSetup: false,
    hooksSetup: false,
  };

  // Step 1: Check/create config
  const configPath = getConfigPath();
  if (!configPath) {
    console.log(chalk.yellow("  ⚠ No buoy.config.mjs found"));
    console.log("");

    const shouldCreateConfig =
      options.yes || (await promptConfirm("  Create config now?", true));

    if (shouldCreateConfig) {
      console.log("");
      await runConfigDock({ yes: options.yes });
      results.configCreated = true;
    } else {
      console.log("");
      info("Run `buoy dock config` later to create config.");
      console.log("");
      return;
    }
  } else {
    results.configCreated = true;
    console.log(`  ${chalk.green("✓")} Config exists`);
  }

  // Step 2: Check/setup AI agents
  const skillsDir = resolve(cwd, ".claude/skills/design-system");
  const claudeMdPath = join(cwd, "CLAUDE.md");
  const hasSkills = existsSync(skillsDir);
  const hasClaudeMd =
    existsSync(claudeMdPath) &&
    readFileSync(claudeMdPath, "utf-8").includes("Design System");

  if (!hasSkills || !hasClaudeMd) {
    console.log("");
    console.log(chalk.yellow("  ⚠ AI agents not configured"));
    if (!hasSkills) console.log(chalk.dim("    • Missing skill files"));
    if (!hasClaudeMd) console.log(chalk.dim("    • Missing CLAUDE.md section"));
    console.log("");

    const shouldSetupAgents =
      options.yes || (await promptConfirm("  Set up AI agents?", true));

    if (shouldSetupAgents) {
      console.log("");
      await runAgentsDock({ json: options.json });
      results.agentsSetup = true;
    }
  } else {
    console.log(`  ${chalk.green("✓")} AI agents configured`);
    results.agentsSetup = true;
  }

  // Step 3: Check/setup hooks
  const hasHooks =
    existsSync(join(cwd, ".husky/pre-commit")) ||
    existsSync(join(cwd, "lefthook.yml")) ||
    existsSync(join(cwd, ".git/hooks/pre-commit"));

  if (!hasHooks) {
    console.log("");
    console.log(chalk.yellow("  ⚠ No pre-commit hooks"));
    console.log("");

    const shouldSetupHooks =
      options.yes || (await promptConfirm("  Set up hooks?", true));

    if (shouldSetupHooks) {
      await runHooksDock({});
      results.hooksSetup = true;
    }
  } else {
    console.log(`  ${chalk.green("✓")} Hooks configured`);
    results.hooksSetup = true;
  }

  // Summary
  console.log("");
  console.log(chalk.dim("  ─".repeat(25)));
  console.log("");

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    const allDone =
      results.configCreated && results.agentsSetup && results.hooksSetup;

    if (allDone) {
      console.log(chalk.green.bold("  ✓ Buoy is docked!"));
      console.log("");
      console.log(chalk.dim("  Try:"));
      console.log(
        `    ${chalk.cyan("buoy show all")}      # See your design system`,
      );
      console.log(`    ${chalk.cyan("buoy show drift")}    # Check for drift`);
    } else {
      console.log(chalk.yellow("  Partially docked"));
      console.log("");
      if (!results.configCreated)
        console.log(`    Run ${chalk.cyan("buoy dock config")}`);
      if (!results.agentsSetup)
        console.log(`    Run ${chalk.cyan("buoy dock agents")}`);
      if (!results.hooksSetup)
        console.log(`    Run ${chalk.cyan("buoy dock hooks")}`);
    }
  }

  console.log("");
}

/**
 * Config dock - creates buoy.config.mjs
 */
async function runConfigDock(options: {
  force?: boolean;
  yes?: boolean;
  skipDetect?: boolean;
}) {
  const cwd = process.cwd();
  const configFilePath = resolve(cwd, "buoy.config.mjs");

  if (existsSync(configFilePath) && !options.force) {
    warning(`Config already exists at ${configFilePath}`);
    info("Use --force to overwrite");
    return;
  }

  let project: DetectedProject;

  if (options.skipDetect) {
    const detector = new ProjectDetector(cwd);
    project = {
      name: (await detector.detect()).name,
      root: cwd,
      frameworks: [],
      primaryFramework: null,
      components: [],
      tokens: [],
      storybook: null,
      designSystem: null,
      monorepo: null,
      designSystemDocs: null,
    };
  } else {
    const spin = ora("Scanning project...").start();
    try {
      const detector = new ProjectDetector(cwd);
      project = await detector.detect();
      spin.stop();
      printDetectionResults(project);
    } catch (err) {
      spin.fail("Detection failed");
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  }

  // Show frameworks and offer plugin install
  const detectedFrameworks = await detectFrameworks(cwd);
  if (detectedFrameworks.length > 0) {
    await showFrameworksAndPlugins(detectedFrameworks, options.yes);
  }

  // Generate and write config
  const content = generateConfig(project);

  try {
    writeFileSync(configFilePath, content, "utf-8");
    success("Created buoy.config.mjs");
  } catch (err) {
    error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

/**
 * Agents dock - sets up AI agents (skills + context + commands)
 */
async function runAgentsDock(options: { dryRun?: boolean; json?: boolean }) {
  const cwd = process.cwd();

  if (options.json) setJsonMode(true);

  const spin = spinner("Setting up AI agents...");

  try {
    const { config, projectName } = await loadOrBuildConfig(cwd);

    spin.text = "Scanning...";
    const orchestrator = new ScanOrchestrator(config, cwd);
    const scanResult = await orchestrator.scan({
      onProgress: (msg) => {
        spin.text = msg;
      },
    });

    spin.text = "Analyzing...";
    const { SemanticDiffEngine } = await import("@buoy-design/core/analysis");
    const engine = new SemanticDiffEngine();
    const diffResult = engine.analyzeComponents(scanResult.components, {
      checkDeprecated: true,
      checkNaming: true,
      checkDocumentation: true,
    });

    spin.stop();

    const results = {
      skillCreated: false,
      contextUpdated: false,
      commandsInstalled: [] as string[],
      stats: { tokens: 0, components: 0 },
    };

    // Create skill files
    const skillPath = resolve(cwd, ".claude/skills/design-system");

    if (options.dryRun) {
      console.log(chalk.dim("  Would create: " + skillPath));
    } else {
      const exportService = new SkillExportService(projectName);
      const skillResult = await exportService.export(
        {
          tokens: scanResult.tokens,
          components: scanResult.components,
          drifts: diffResult.drifts,
          projectName,
        },
        {
          sections: ["tokens", "components", "patterns", "anti-patterns"],
          outputPath: skillPath,
        },
      );

      for (const file of skillResult.files) {
        const dir = dirname(file.path);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(file.path, file.content);
      }

      results.skillCreated = true;
      results.stats.tokens = skillResult.stats.tokens.total;
      results.stats.components = skillResult.stats.components;
    }

    // Update CLAUDE.md
    const claudeMdPath = join(cwd, "CLAUDE.md");

    if (options.dryRun) {
      console.log(chalk.dim("  Would update: CLAUDE.md"));
    } else {
      const contextResult = generateContext(
        {
          tokens: scanResult.tokens,
          components: scanResult.components,
          drifts: diffResult.drifts,
          projectName,
        },
        { detailLevel: "standard" },
      );

      let existingContent = "";
      let hasSection = false;

      if (existsSync(claudeMdPath)) {
        existingContent = readFileSync(claudeMdPath, "utf-8");
        hasSection = /^##?\s*[Dd]esign\s*[Ss]ystem/m.test(
          existingContent.replace(/```[\s\S]*?```/g, ""),
        );
      }

      if (!hasSection) {
        const section = `\n## Design System\n\n${contextResult.content}\n`;
        if (existingContent) {
          appendFileSync(claudeMdPath, section);
        } else {
          writeFileSync(claudeMdPath, `# CLAUDE.md\n${section}`);
        }
        results.contextUpdated = true;
      }
    }

    // Install commands
    if (!options.dryRun) {
      const { installed } = installClaudeCommands(false);
      results.commandsInstalled = installed;
    }

    if (options.json) {
      console.log(JSON.stringify(results, null, 2));
    } else if (!options.dryRun) {
      console.log("");
      if (results.skillCreated)
        console.log(`  ${chalk.green("✓")} Created skill files`);
      if (results.contextUpdated)
        console.log(`  ${chalk.green("✓")} Updated CLAUDE.md`);
      if (results.commandsInstalled.length > 0) {
        console.log(
          `  ${chalk.green("✓")} Installed: ${results.commandsInstalled.map((c) => `/${c}`).join(", ")}`,
        );
      }
      console.log("");
    }
  } catch (err) {
    spin.stop();
    error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

/**
 * Skills dock - creates skill files only
 */
async function runSkillsDock(options: {
  output?: string;
  global?: boolean;
  dryRun?: boolean;
  json?: boolean;
}) {
  const cwd = process.cwd();
  if (options.json) setJsonMode(true);

  const spin = spinner("Creating skills...");

  try {
    const { config, projectName } = await loadOrBuildConfig(cwd);

    spin.text = "Scanning...";
    const orchestrator = new ScanOrchestrator(config, cwd);
    const scanResult = await orchestrator.scan({
      onProgress: (msg) => {
        spin.text = msg;
      },
    });

    spin.text = "Analyzing...";
    const { SemanticDiffEngine } = await import("@buoy-design/core/analysis");
    const engine = new SemanticDiffEngine();
    const diffResult = engine.analyzeComponents(scanResult.components, {});

    spin.stop();

    let outputPath = options.output || ".claude/skills/design-system";
    if (options.global)
      outputPath = join(homedir(), ".claude", "skills", projectName);
    outputPath = resolve(cwd, outputPath);

    if (options.dryRun) {
      console.log(chalk.dim(`Would create: ${outputPath}`));
      return;
    }

    const exportService = new SkillExportService(projectName);
    const result = await exportService.export(
      {
        tokens: scanResult.tokens,
        components: scanResult.components,
        drifts: diffResult.drifts,
        projectName,
      },
      {
        sections: ["tokens", "components", "patterns", "anti-patterns"],
        outputPath,
      },
    );

    for (const file of result.files) {
      const dir = dirname(file.path);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(file.path, file.content);
    }

    if (options.json) {
      console.log(
        JSON.stringify({ path: outputPath, stats: result.stats }, null, 2),
      );
    } else {
      success(`Created skills at ${outputPath}`);
    }
  } catch (err) {
    spin.stop();
    error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

/**
 * Context dock - generates CLAUDE.md section
 */
async function runContextDock(options: {
  output?: string;
  stdout?: boolean;
  detail?: string;
  json?: boolean;
}) {
  const cwd = process.cwd();
  if (options.json) setJsonMode(true);

  const spin = spinner("Generating context...");

  try {
    const { config, projectName } = await loadOrBuildConfig(cwd);

    spin.text = "Scanning...";
    const orchestrator = new ScanOrchestrator(config, cwd);
    const scanResult = await orchestrator.scan();

    spin.text = "Analyzing...";
    const { SemanticDiffEngine } = await import("@buoy-design/core/analysis");
    const engine = new SemanticDiffEngine();
    const diffResult = engine.analyzeComponents(scanResult.components, {
      availableTokens: scanResult.tokens,
    });

    spin.stop();

    const contextResult = generateContext(
      {
        tokens: scanResult.tokens,
        components: scanResult.components,
        drifts: diffResult.drifts,
        projectName,
      },
      {
        detailLevel:
          (options.detail as "minimal" | "standard" | "comprehensive") ||
          "standard",
      },
    );

    if (options.json) {
      console.log(
        JSON.stringify(
          { content: contextResult.content, stats: contextResult.stats },
          null,
          2,
        ),
      );
      return;
    }

    if (options.stdout) {
      console.log(contextResult.content);
      return;
    }

    const claudeMdPath = options.output || join(cwd, "CLAUDE.md");
    const header = "## Design System\n\n";

    if (existsSync(claudeMdPath)) {
      const existing = readFileSync(claudeMdPath, "utf-8");
      if (!existing.includes("## Design System")) {
        appendFileSync(claudeMdPath, `\n${header}${contextResult.content}\n`);
        success("Appended to CLAUDE.md");
      } else {
        warning("CLAUDE.md already has Design System section");
      }
    } else {
      writeFileSync(
        claudeMdPath,
        `# CLAUDE.md\n\n${header}${contextResult.content}\n`,
      );
      success("Created CLAUDE.md");
    }
  } catch (err) {
    spin.stop();
    error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

/**
 * Hooks dock - sets up git hooks
 */
async function runHooksDock(options: { claude?: boolean }) {
  const cwd = process.cwd();
  console.log("");

  const hookSystem = detectHookSystem(cwd);

  if (hookSystem) {
    info(`Detected: ${hookSystem}`);
    const hookResult = setupHooks(cwd);
    if (hookResult.success) {
      success(hookResult.message);
    } else {
      warning(hookResult.message);
    }
  } else {
    const standaloneResult = generateStandaloneHook(cwd);
    if (standaloneResult.success) {
      success(standaloneResult.message);
      info("Copy to .git/hooks/pre-commit to activate");
    } else {
      warning(standaloneResult.message);
    }
  }

  if (options.claude) {
    console.log("");
    const { config, projectName } = await loadOrBuildConfig(cwd);
    const orchestrator = new ScanOrchestrator(config, cwd);
    const scanResult = await orchestrator.scan();

    const { SemanticDiffEngine } = await import("@buoy-design/core/analysis");
    const engine = new SemanticDiffEngine();
    const diffResult = engine.analyzeComponents(scanResult.components, {});

    const exportService = new SkillExportService(projectName);
    const condensedContext = exportService.generateCondensedContext({
      tokens: scanResult.tokens,
      components: scanResult.components,
      drifts: diffResult.drifts,
      projectName,
    });

    const claudeDir = resolve(cwd, ".claude");
    if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });
    writeFileSync(resolve(claudeDir, "buoy-context.md"), condensedContext);

    const claudeResult = setupClaudeHooks(cwd);
    if (claudeResult.success) {
      success("Created Claude hooks");
    } else {
      warning(`Claude hooks failed: ${claudeResult.message}`);
    }
  }

  console.log("");
}

// ============ Helpers ============

async function loadOrBuildConfig(
  cwd: string,
): Promise<{ config: BuoyConfig; projectName: string }> {
  const existingConfigPath = getConfigPath();
  if (existingConfigPath) {
    const result = await loadConfig();
    return {
      config: result.config,
      projectName: result.config.project?.name || "design-system",
    };
  }
  const autoResult = await buildAutoConfig(cwd);
  return {
    config: autoResult.config,
    projectName: autoResult.config.project?.name || "design-system",
  };
}

function installClaudeCommands(dryRun = false): {
  installed: string[];
  alreadyExisted: string[];
} {
  const commandsDir = join(homedir(), ".claude", "commands");
  const assetsDir = resolve(__dirname, "..", "..", "assets", "commands");
  const installed: string[] = [];
  const alreadyExisted: string[] = [];

  if (!existsSync(assetsDir)) return { installed, alreadyExisted };
  if (!dryRun && !existsSync(commandsDir))
    mkdirSync(commandsDir, { recursive: true });

  for (const file of readdirSync(assetsDir).filter((f) => f.endsWith(".md"))) {
    const destPath = join(commandsDir, file);
    if (existsSync(destPath)) {
      alreadyExisted.push(file.replace(".md", ""));
    } else {
      if (!dryRun) copyFileSync(join(assetsDir, file), destPath);
      installed.push(file.replace(".md", ""));
    }
  }
  return { installed, alreadyExisted };
}

function generateConfig(project: DetectedProject): string {
  const lines: string[] = [];
  const monorepoConfig = detectMonorepoConfig(project.root);

  lines.push(`/** @type {import('@buoy-design/cli').BuoyConfig} */`);
  lines.push(`export default {`);
  lines.push(`  project: { name: '${project.name}' },`);
  lines.push(`  sources: {`);

  for (const framework of project.frameworks) {
    const sourceKey = getSourceKey(framework.name);
    if (sourceKey) {
      const extensions = getExtensions(sourceKey, framework.typescript);
      const defaultPatterns = extensions.map((ext) => `src/**/*.${ext}`);
      const patterns = monorepoConfig.type
        ? expandPatternsForMonorepo(defaultPatterns, monorepoConfig).allPatterns
        : defaultPatterns;

      lines.push(`    ${sourceKey}: {`);
      lines.push(`      enabled: true,`);
      lines.push(
        `      include: [${patterns.map((p) => `'${p}'`).join(", ")}],`,
      );
      lines.push(
        `      exclude: ['**/*.test.*', '**/*.spec.*', '**/*.stories.*'],`,
      );
      lines.push(`    },`);
    }
  }

  if (project.tokens.length > 0) {
    lines.push(
      `    tokens: { enabled: true, files: [${project.tokens.map((t) => `'${t.path}'`).join(", ")}] },`,
    );
  }

  lines.push(`    figma: { enabled: false },`);
  lines.push(`  },`);
  lines.push(`  output: { format: 'table', colors: true },`);
  lines.push(`};`);

  return lines.join("\n");
}

function getSourceKey(name: string): string | null {
  if (
    [
      "react",
      "nextjs",
      "remix",
      "gatsby",
      "react-native",
      "expo",
      "preact",
      "solid",
    ].includes(name)
  )
    return "react";
  if (["vue", "nuxt"].includes(name)) return "vue";
  if (["svelte", "sveltekit"].includes(name)) return "svelte";
  if (name === "angular") return "angular";
  if (["lit", "stencil"].includes(name)) return "webcomponent";
  return null;
}

function getExtensions(sourceKey: string, typescript: boolean): string[] {
  switch (sourceKey) {
    case "vue":
      return ["vue"];
    case "svelte":
      return ["svelte"];
    case "angular":
      return ["component.ts"];
    case "webcomponent":
      return ["ts"];
    default:
      return typescript ? ["tsx", "jsx"] : ["jsx", "tsx"];
  }
}

function printDetectionResults(project: DetectedProject): void {
  console.log("");
  console.log(chalk.bold("  Detected:"));
  for (const fw of project.frameworks) {
    console.log(
      chalk.green("    ✓ ") +
        chalk.bold(fw.name) +
        (fw.typescript ? " + TS" : ""),
    );
  }
  for (const comp of project.components) {
    console.log(
      chalk.green("    ✓ ") +
        `${comp.fileCount} files in ${chalk.cyan(comp.path)}`,
    );
  }
  for (const token of project.tokens) {
    console.log(
      chalk.green("    ✓ ") + `${token.name}: ${chalk.cyan(token.path)}`,
    );
  }
  if (project.storybook) console.log(chalk.green("    ✓ ") + "Storybook");
  console.log("");
}

async function showFrameworksAndPlugins(
  frameworks: Array<{ name: string; scanner?: string; plugin?: string }>,
  autoInstall?: boolean,
): Promise<void> {
  const builtIn = frameworks.filter((fw) => fw.scanner);
  const plugins = frameworks.filter((fw) => fw.plugin && !fw.scanner);

  if (builtIn.length > 0) {
    console.log(chalk.bold("  Built-in Scanners"));
    for (const fw of builtIn)
      console.log(`  ${chalk.green("✓")} ${chalk.cyan(fw.name)}`);
    console.log("");
  }

  if (plugins.length > 0) {
    const missing = plugins
      .map((fw) => fw.plugin!)
      .filter((p, i, arr) => arr.indexOf(p) === i);
    console.log(chalk.bold("  Optional Plugins"));
    console.log(`    ${chalk.dim(getPluginInstallCommand(missing))}`);
    console.log("");

    if (autoInstall) {
      const { execSync } = await import("node:child_process");
      try {
        execSync(getPluginInstallCommand(missing), { stdio: "inherit" });
        success("Plugins installed");
      } catch {
        warning("Plugin install failed");
      }
    }
  }
}

async function promptConfirm(
  message: string,
  defaultValue = true,
): Promise<boolean> {
  if (!process.stdin.isTTY) return defaultValue;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} ${defaultValue ? "[Y/n]" : "[y/N]"} `, (answer) => {
      rl.close();
      const t = answer.trim().toLowerCase();
      resolve(t === "" ? defaultValue : t === "y" || t === "yes");
    });
  });
}
