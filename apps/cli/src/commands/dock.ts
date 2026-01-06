import { Command } from "commander";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { resolve, extname } from "path";
import chalk from "chalk";
import ora from "ora";
import { createInterface } from "readline";
import { success, error, info, warning } from "../output/reporters.js";
import {
  ProjectDetector,
  type DetectedProject,
  detectMonorepoConfig,
  expandPatternsForMonorepo,
} from "../detect/index.js";
import {
  detectFrameworks,
  getPluginInstallCommand,
  PLUGIN_INFO,
  BUILTIN_SCANNERS,
} from "../detect/frameworks.js";
import {
  setupHooks,
  generateStandaloneHook,
  detectHookSystem,
} from "../hooks/index.js";
import { parseTokenFile, detectFormat } from "@buoy-design/core";
import type { DesignToken } from "@buoy-design/core";

function generateConfig(project: DetectedProject): string {
  const lines: string[] = [];

  // Detect monorepo configuration for pattern expansion
  const monorepoConfig = detectMonorepoConfig(project.root);

  lines.push(`/** @type {import('@buoy-design/cli').BuoyConfig} */`);
  lines.push(`export default {`);
  lines.push(`  project: {`);
  lines.push(`    name: '${project.name}',`);
  lines.push(`  },`);
  lines.push(`  sources: {`);

  // Determine the correct source key based on framework
  const getSourceKey = (frameworkName: string): string | null => {
    // React-based frameworks
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
      ].includes(frameworkName)
    ) {
      return "react";
    }
    // Vue-based frameworks
    if (["vue", "nuxt"].includes(frameworkName)) {
      return "vue";
    }
    // Svelte-based frameworks
    if (["svelte", "sveltekit"].includes(frameworkName)) {
      return "svelte";
    }
    // Angular
    if (frameworkName === "angular") {
      return "angular";
    }
    // Web Components
    if (["lit", "stencil"].includes(frameworkName)) {
      return "webcomponent";
    }
    // Astro is special - can use multiple frameworks
    if (frameworkName === "astro") {
      return "react"; // Default to React for Astro
    }
    return null;
  };

  // File extensions by framework
  const getExtensions = (sourceKey: string, typescript: boolean): string[] => {
    switch (sourceKey) {
      case "vue":
        return ["vue"];
      case "svelte":
        return ["svelte"];
      case "angular":
        return ["component.ts"];
      case "webcomponent":
        return ["ts"];
      default: // react
        return typescript ? ["tsx", "jsx"] : ["jsx", "tsx"];
    }
  };

  // JS Framework config (React, Vue, Svelte, Angular, Web Components)
  // Handle multiple frameworks - generate config for each UI framework
  const addedSourceKeys = new Set<string>();

  for (const framework of project.frameworks) {
    const sourceKey = getSourceKey(framework.name);

    if (sourceKey && !addedSourceKeys.has(sourceKey)) {
      addedSourceKeys.add(sourceKey);
      const extensions = getExtensions(sourceKey, framework.typescript);
      const jsComponents = project.components.filter(
        (c) =>
          c.type === "jsx" ||
          c.type === "vue" ||
          c.type === "svelte" ||
          !c.type,
      );

      let includePatterns: string[];
      if (jsComponents.length > 0) {
        includePatterns = jsComponents.flatMap((c) =>
          extensions.map((ext) => `${c.path}/**/*.${ext}`),
        );
      } else {
        // Use default patterns, but expand for monorepo if detected
        const defaultPatterns = extensions.map((ext) => `src/**/*.${ext}`);
        if (monorepoConfig.type) {
          const expanded = expandPatternsForMonorepo(defaultPatterns, monorepoConfig);
          includePatterns = expanded.allPatterns;
        } else {
          includePatterns = defaultPatterns;
        }
      }

      lines.push(`    ${sourceKey}: {`);
      lines.push(`      enabled: true,`);
      lines.push(
        `      include: [${includePatterns.map((p) => `'${p}'`).join(", ")}],`,
      );
      lines.push(
        `      exclude: ['**/*.test.*', '**/*.spec.*', '**/*.stories.*'],`,
      );
      if (project.designSystem) {
        lines.push(
          `      designSystemPackage: '${project.designSystem.package}',`,
        );
      }
      if (sourceKey === "webcomponent") {
        const wcFramework = framework.name === "lit" ? "lit" : "stencil";
        lines.push(`      framework: '${wcFramework}',`);
      }
      lines.push(`    },`);
    }
  }

  // Server-side / template-based framework config
  const serverFrameworks = [
    "php",
    "laravel",
    "symfony",
    "rails",
    "django",
    "flask",
    "fastapi",
    "express",
    "nestjs",
    "spring",
    "aspnet",
    "go",
    "hugo",
    "jekyll",
    "eleventy",
  ];

  // Map framework to template type
  const getTemplateType = (
    frameworkName: string,
    componentType?: string,
  ): string => {
    // Return component type directly if it's a known template type
    const knownTypes = [
      // Server-side templates
      "blade", "erb", "twig", "njk", "razor", "hbs", "mustache",
      "ejs", "pug", "liquid", "slim", "haml", "jinja", "django",
      "thymeleaf", "freemarker", "go-template", "edge", "eta", "heex",
      "velocity", "xslt",
      // JS frameworks
      "astro", "solid", "qwik", "marko", "lit", "fast", "angular",
      "stencil", "alpine", "htmx",
      // Static site generators
      "hugo", "jekyll", "eleventy", "shopify",
      // Documentation
      "markdown", "mdx", "asciidoc",
      // Graphics
      "svg",
      // Data templates
      "yaml-template", "json-template"
    ];
    if (componentType && knownTypes.includes(componentType)) {
      return componentType;
    }

    // Framework-based defaults
    if (frameworkName === "laravel") return "blade";
    if (frameworkName === "rails") return "erb";
    if (frameworkName === "symfony") return "twig";
    if (frameworkName === "eleventy") return "eleventy";
    if (frameworkName === "aspnet") return "razor";
    if (frameworkName === "express") return "ejs";
    if (frameworkName === "flask") return "jinja";
    if (frameworkName === "django") return "django";
    if (frameworkName === "spring") return "thymeleaf";
    if (frameworkName === "go") return "go-template";
    if (frameworkName === "astro") return "astro";
    if (frameworkName === "hugo") return "hugo";
    if (frameworkName === "jekyll") return "jekyll";
    return "html";
  };

  // Check if any framework is a server-side framework
  const serverFramework = project.frameworks.find((f) =>
    serverFrameworks.includes(f.name),
  );
  if (serverFramework) {
    const templateTypes = [
      // Server-side templates
      "php", "blade", "erb", "twig", "html", "njk", "razor", "hbs",
      "mustache", "ejs", "pug", "liquid", "slim", "haml", "jinja",
      "django", "thymeleaf", "freemarker", "go-template", "edge",
      "eta", "heex", "velocity", "xslt",
      // JS frameworks
      "astro", "solid", "qwik", "marko", "lit", "fast", "angular",
      "stencil", "alpine", "htmx",
      // Static site generators
      "hugo", "jekyll", "eleventy", "shopify",
      // Documentation
      "markdown", "mdx", "asciidoc",
      // Graphics
      "svg",
      // Data templates
      "yaml-template", "json-template"
    ];
    const templateComponents = project.components.filter(
      (c) => c.type && templateTypes.includes(c.type),
    );
    if (templateComponents.length > 0) {
      // Use the first component's type to determine template type
      const templateType = getTemplateType(
        serverFramework.name,
        templateComponents[0]?.type,
      );

      lines.push(`    templates: {`);
      lines.push(`      enabled: true,`);
      lines.push(`      type: '${templateType}',`);
      lines.push(`      include: [`);
      for (const comp of templateComponents) {
        lines.push(`        '${comp.pattern}',`);
      }
      lines.push(`      ],`);
      lines.push(`    },`);
    }
  }

  // Storybook config
  if (project.storybook) {
    lines.push(`    storybook: {`);
    lines.push(`      enabled: true,`);
    lines.push(`    },`);
  }

  // Token files config
  const tokenFiles = project.tokens.filter((t) => t.type !== "tailwind");
  const hasTailwind = project.tokens.some((t) => t.type === "tailwind");

  if (tokenFiles.length > 0 || hasTailwind) {
    lines.push(`    tokens: {`);
    lines.push(`      enabled: true,`);
    if (tokenFiles.length > 0) {
      lines.push(`      files: [`);
      for (const token of tokenFiles) {
        lines.push(`        '${token.path}',`);
      }
      lines.push(`      ],`);
    }
    lines.push(`    },`);
  }

  // Figma placeholder (always disabled by default)
  lines.push(`    figma: {`);
  lines.push(`      enabled: false,`);
  lines.push(`      // accessToken: process.env.FIGMA_ACCESS_TOKEN,`);
  lines.push(`      // fileKeys: [],`);
  lines.push(`    },`);

  lines.push(`  },`);
  lines.push(`  output: {`);
  lines.push(`    format: 'table',`);
  lines.push(`    colors: true,`);
  lines.push(`  },`);
  lines.push(`};`);
  lines.push(``);

  return lines.join("\n");
}

function printDetectionResults(project: DetectedProject): void {
  console.log("");
  console.log(chalk.bold("  Detected:"));

  const frameworkNames: Record<string, string> = {
    // JS frameworks
    react: "React",
    vue: "Vue",
    svelte: "Svelte",
    angular: "Angular",
    solid: "Solid",
    preact: "Preact",
    // Meta-frameworks
    nextjs: "Next.js",
    nuxt: "Nuxt",
    astro: "Astro",
    remix: "Remix",
    sveltekit: "SvelteKit",
    gatsby: "Gatsby",
    // Mobile
    "react-native": "React Native",
    flutter: "Flutter",
    expo: "Expo",
    // Web Components
    lit: "Lit",
    stencil: "Stencil",
    // Server-side
    php: "PHP",
    laravel: "Laravel",
    symfony: "Symfony",
    rails: "Ruby on Rails",
    django: "Django",
    flask: "Flask",
    fastapi: "FastAPI",
    express: "Express",
    nestjs: "NestJS",
    spring: "Spring Boot",
    aspnet: "ASP.NET",
    go: "Go",
    // Static site generators
    hugo: "Hugo",
    jekyll: "Jekyll",
    eleventy: "Eleventy",
  };

  // Frameworks - show all detected
  if (project.frameworks.length > 0) {
    // Show warning if multiple UI frameworks detected (framework sprawl)
    const uiFrameworks = [
      "react",
      "vue",
      "svelte",
      "angular",
      "solid",
      "preact",
      "lit",
      "stencil",
      "nextjs",
      "nuxt",
      "astro",
      "remix",
      "sveltekit",
      "gatsby",
      "react-native",
      "expo",
      "flutter",
    ];
    const uiCount = project.frameworks.filter((f) =>
      uiFrameworks.includes(f.name),
    ).length;

    if (uiCount > 1) {
      console.log(
        chalk.yellow("    ⚠ ") +
          chalk.yellow.bold(
            "Multiple UI frameworks detected (framework sprawl)",
          ),
      );
    }

    for (const framework of project.frameworks) {
      const ts = framework.typescript ? " + TypeScript" : "";
      const frameworkName =
        frameworkNames[framework.name] || capitalize(framework.name);
      const meta = framework.meta ? chalk.dim(` (${framework.meta})`) : "";
      const version =
        framework.version !== "unknown" ? ` ${framework.version}` : "";
      console.log(
        chalk.green("    ✓ ") +
          chalk.bold(frameworkName) +
          ts +
          meta +
          chalk.dim(version),
      );
    }
  }

  // Components
  if (project.components.length > 0) {
    for (const comp of project.components) {
      const typeLabels: Record<string, string> = {
        // JS frameworks
        jsx: "component files",
        tsx: "TypeScript components",
        vue: "Vue components",
        svelte: "Svelte components",
        astro: "Astro components",
        solid: "Solid components",
        qwik: "Qwik components",
        marko: "Marko components",
        lit: "Lit elements",
        fast: "FAST elements",
        // Server-side templates
        php: "PHP templates",
        blade: "Blade templates",
        erb: "ERB templates",
        twig: "Twig templates",
        html: "HTML templates",
        njk: "Nunjucks templates",
        razor: "Razor views",
        hbs: "Handlebars templates",
        mustache: "Mustache templates",
        ejs: "EJS templates",
        pug: "Pug templates",
        liquid: "Liquid templates",
        slim: "Slim templates",
        haml: "Haml templates",
        jinja: "Jinja templates",
        django: "Django templates",
        thymeleaf: "Thymeleaf templates",
        freemarker: "Freemarker templates",
        velocity: "Velocity templates",
        "go-template": "Go templates",
        edge: "Edge.js templates",
        eta: "Eta templates",
        heex: "HEEx templates",
        xslt: "XSLT stylesheets",
        // Static site generators
        hugo: "Hugo layouts",
        jekyll: "Jekyll layouts",
        eleventy: "Eleventy templates",
        shopify: "Shopify templates",
        // Documentation
        markdown: "Markdown files",
        mdx: "MDX files",
        asciidoc: "AsciiDoc files",
        // Data templates
        "yaml-template": "YAML templates",
        "json-template": "JSON templates",
        // Additional JS frameworks
        angular: "Angular components",
        stencil: "Stencil components",
        alpine: "Alpine.js templates",
        htmx: "HTMX templates",
        // Graphics
        svg: "SVG components",
      };
      const typeLabel = comp.type
        ? typeLabels[comp.type] || "template files"
        : "component files";
      console.log(
        chalk.green("    ✓ ") +
          `${comp.fileCount} ${typeLabel} in ` +
          chalk.cyan(comp.path),
      );
    }
  }

  // Tokens
  if (project.tokens.length > 0) {
    for (const token of project.tokens) {
      console.log(
        chalk.green("    ✓ ") + `${token.name}: ` + chalk.cyan(token.path),
      );
    }
  }

  // Storybook
  if (project.storybook) {
    const version = project.storybook.version
      ? ` (${project.storybook.version})`
      : "";
    console.log(chalk.green("    ✓ ") + `Storybook` + chalk.dim(version));
  }

  // Design system
  if (project.designSystem) {
    console.log(
      chalk.green("    ✓ ") +
        `Design system: ` +
        chalk.cyan(project.designSystem.package),
    );
  }

  // Monorepo
  if (project.monorepo) {
    // Show basic monorepo info
    console.log(
      chalk.green("    ✓ ") +
        capitalize(project.monorepo.type) +
        ` monorepo (${project.monorepo.packages.length} packages)`,
    );

    // Show monorepo component paths if detected
    const monorepoComponents = project.components.filter(
      (c) =>
        c.path.startsWith("packages/") ||
        c.path.startsWith("apps/") ||
        c.path.startsWith("libs/") ||
        c.path.startsWith("modules/"),
    );

    if (monorepoComponents.length > 0) {
      console.log(
        chalk.dim("      ") +
          chalk.dim(
            `Scanning: ${monorepoComponents.map((c) => c.path).slice(0, 3).join(", ")}${monorepoComponents.length > 3 ? ` +${monorepoComponents.length - 3} more` : ""}`,
          ),
      );
    }
  }

  // Design system documentation tools
  if (project.designSystemDocs) {
    const typeNames: Record<string, string> = {
      'zeroheight': 'Zeroheight',
      'supernova': 'Supernova',
      'specify': 'Specify',
      'knapsack': 'Knapsack',
      'framer': 'Framer',
      'tokenforge': 'TokenForge',
      'tokens-studio': 'Tokens Studio (Figma Tokens)',
    };
    const name = typeNames[project.designSystemDocs.type] || project.designSystemDocs.type;
    const path = project.designSystemDocs.exportPath || project.designSystemDocs.configPath || '';
    console.log(
      chalk.green("    ✓ ") +
        chalk.bold(name) +
        (path ? chalk.dim(` (${path})`) : ''),
    );
  }

  // Nothing found
  if (
    project.frameworks.length === 0 &&
    project.components.length === 0 &&
    project.tokens.length === 0 &&
    !project.storybook &&
    !project.designSystemDocs
  ) {
    console.log(chalk.yellow("    ⚠ ") + "No sources auto-detected");
    console.log(
      chalk.dim("      You can manually configure sources in buoy.config.mjs"),
    );
  }

  console.log("");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Import tokens from a detected source and generate output file
 */
async function importTokensFromSource(
  sourcePath: string,
  outputPath: string,
): Promise<{ success: boolean; tokenCount: number }> {
  try {
    const content = readFileSync(sourcePath, 'utf-8');
    const ext = extname(sourcePath).toLowerCase();
    let tokens: DesignToken[] = [];

    if (ext === '.json') {
      const json = JSON.parse(content);
      const format = detectFormat(json);
      info(`Detected format: ${formatTokenFormat(format)}`);
      tokens = parseTokenFile(content);
    } else if (ext === '.css') {
      tokens = parseCssVariablesForInit(content, sourcePath);
    } else {
      return { success: false, tokenCount: 0 };
    }

    if (tokens.length === 0) {
      return { success: false, tokenCount: 0 };
    }

    // Generate CSS output
    const outputContent = generateCssFromTokens(tokens);
    writeFileSync(outputPath, outputContent);

    return { success: true, tokenCount: tokens.length };
  } catch {
    return { success: false, tokenCount: 0 };
  }
}

/**
 * Parse CSS variables for token import
 */
function parseCssVariablesForInit(content: string, filePath: string): DesignToken[] {
  const tokens: DesignToken[] = [];
  const varRegex = /--([\\w-]+)\\s*:\\s*([^;]+);/g;

  let match;
  while ((match = varRegex.exec(content)) !== null) {
    const name = match[1]!;
    const value = match[2]!.trim();

    tokens.push({
      id: `css:${filePath}:${name}`,
      name: `--${name}`,
      category: inferTokenCategory(name, value),
      value: parseTokenValue(value),
      source: { type: 'css', path: filePath },
      aliases: [],
      usedBy: [],
      metadata: {},
      scannedAt: new Date(),
    });
  }

  return tokens;
}

/**
 * Infer token category from name or value
 */
function inferTokenCategory(name: string, value: string): DesignToken['category'] {
  const nameLower = name.toLowerCase();

  if (nameLower.includes('color') || value.startsWith('#') || value.startsWith('rgb') || value.startsWith('hsl')) {
    return 'color';
  }
  if (nameLower.includes('spacing') || nameLower.includes('space') || nameLower.includes('gap')) {
    return 'spacing';
  }
  if (nameLower.includes('font') || nameLower.includes('text') || nameLower.includes('size')) {
    return 'typography';
  }
  if (nameLower.includes('radius') || nameLower.includes('rounded')) {
    return 'border';
  }
  if (nameLower.includes('shadow')) {
    return 'shadow';
  }

  return 'other';
}

/**
 * Parse a CSS value into TokenValue
 */
function parseTokenValue(value: string): DesignToken['value'] {
  if (value.startsWith('#') || value.startsWith('rgb') || value.startsWith('hsl')) {
    return { type: 'color', hex: value.startsWith('#') ? value.toLowerCase() : value };
  }

  const dimMatch = value.match(/^([\d.]+)(px|rem|em|%)$/);
  if (dimMatch) {
    return { type: 'spacing', value: parseFloat(dimMatch[1]!), unit: dimMatch[2] as 'px' | 'rem' | 'em' };
  }

  return { type: 'raw', value };
}

/**
 * Generate CSS file from tokens
 */
function generateCssFromTokens(tokens: DesignToken[]): string {
  const lines: string[] = [
    '/**',
    ' * Design Tokens',
    ' * Imported by Buoy',
    ' */',
    '',
    ':root {',
  ];

  // Group by category
  const groups: Record<string, DesignToken[]> = {};
  for (const token of tokens) {
    const cat = token.category;
    if (!groups[cat]) groups[cat] = [];
    groups[cat]!.push(token);
  }

  for (const [category, catTokens] of Object.entries(groups)) {
    lines.push(`  /* ${capitalize(category)} */`);
    for (const token of catTokens) {
      const name = token.name.startsWith('--') ? token.name : `--${token.name}`;
      const value = getTokenDisplayValue(token);
      lines.push(`  ${name}: ${value};`);
    }
    lines.push('');
  }

  lines.push('}');
  return lines.join('\\n');
}

/**
 * Get display value for a token
 */
function getTokenDisplayValue(token: DesignToken): string {
  const v = token.value;
  if (v.type === 'color') return v.hex;
  if (v.type === 'spacing') return `${v.value}${v.unit}`;
  if (v.type === 'raw') return v.value;
  return JSON.stringify(v);
}

/**
 * Format token format name for display
 */
function formatTokenFormat(format: string): string {
  const names: Record<string, string> = {
    dtcg: 'W3C Design Tokens (DTCG)',
    'tokens-studio': 'Tokens Studio (Figma Tokens)',
    'style-dictionary': 'Style Dictionary',
  };
  return names[format] || format;
}

async function promptConfirm(
  message: string,
  defaultValue = true,
): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const suffix = defaultValue ? "[Y/n]" : "[y/N]";

  return new Promise((resolve) => {
    rl.question(`${message} ${suffix} `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === "") {
        resolve(defaultValue);
      } else {
        resolve(trimmed === "y" || trimmed === "yes");
      }
    });
  });
}

export function createDockCommand(): Command {
  const cmd = new Command("dock")
    .description("Dock Buoy into your project")
    .option("-f, --force", "Overwrite existing configuration")
    .option("-n, --name <name>", "Project name")
    .option("--skip-detect", "Skip auto-detection and create minimal config")
    .option("-y, --yes", "Auto-install recommended plugins without prompting")
    .option("--no-install", "Skip plugin installation prompts")
    .option("--hooks", "Setup pre-commit hook for drift checking")
    .action(async (options) => {
      const cwd = process.cwd();
      const configPath = resolve(cwd, "buoy.config.mjs");

      // Check if config already exists
      if (existsSync(configPath) && !options.force) {
        warning(`Configuration already exists at ${configPath}`);
        info("Use --force to overwrite");
        return;
      }

      let project: DetectedProject;

      if (options.skipDetect) {
        // Minimal detection - just get the project name
        const detector = new ProjectDetector(cwd);
        project = {
          name: options.name || (await detector.detect()).name,
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
        // Run auto-detection
        const spinner = ora("Scanning project...").start();

        try {
          const detector = new ProjectDetector(cwd);
          project = await detector.detect();

          if (options.name) {
            project.name = options.name;
          }

          spinner.stop();
          printDetectionResults(project);
        } catch (err) {
          spinner.fail("Detection failed");
          const message = err instanceof Error ? err.message : String(err);
          error(message);
          process.exit(1);
        }
      }

      // Track imported token file path for config generation
      let importedTokenFile: string | null = null;

      // Check if design system docs were detected and offer to import tokens
      if (project.designSystemDocs && !options.skipDetect) {
        const docType = project.designSystemDocs.type;
        const sourcePath = project.designSystemDocs.exportPath || project.designSystemDocs.configPath;

        const typeNames: Record<string, string> = {
          'zeroheight': 'Zeroheight',
          'supernova': 'Supernova',
          'specify': 'Specify',
          'knapsack': 'Knapsack',
          'framer': 'Framer',
          'tokenforge': 'TokenForge',
          'tokens-studio': 'Tokens Studio',
        };
        const docName = typeNames[docType] || docType;

        if (sourcePath && existsSync(resolve(cwd, sourcePath))) {
          console.log(chalk.bold("  Token Import"));
          console.log("");
          console.log(`  Found ${chalk.cyan(docName)} tokens at ${chalk.dim(sourcePath)}`);
          console.log("");

          let shouldImport = false;
          if (options.yes) {
            shouldImport = true;
          } else if (process.stdin.isTTY) {
            shouldImport = await promptConfirm(
              `  Import tokens from ${docName}?`,
              true,
            );
          }

          if (shouldImport) {
            const outputFile = 'design-tokens.css';
            const importSpinner = ora(`Importing tokens from ${docName}...`).start();

            const result = await importTokensFromSource(
              resolve(cwd, sourcePath),
              resolve(cwd, outputFile),
            );

            if (result.success) {
              importSpinner.succeed(`Imported ${result.tokenCount} tokens to ${outputFile}`);
              importedTokenFile = outputFile;

              // Add to project tokens for config generation
              project.tokens.push({
                name: 'Design Tokens',
                path: outputFile,
                type: 'css',
              });
            } else {
              importSpinner.warn('Could not parse tokens from source');
              info(`You can manually import later with: ${chalk.cyan(`buoy import ${sourcePath}`)}`);
            }
            console.log("");
          }
        }
      }

      // Show detected frameworks and scanners
      const detectedFrameworks = await detectFrameworks(cwd);

      if (detectedFrameworks.length > 0) {
        // Separate built-in scanners from optional plugins
        const builtIn = detectedFrameworks.filter((fw) => fw.scanner);
        const optionalPlugins = detectedFrameworks.filter(
          (fw) => fw.plugin && !fw.scanner,
        );

        // Show built-in scanners (no install needed)
        if (builtIn.length > 0) {
          console.log(
            chalk.bold("  Built-in Scanners") +
              chalk.dim(" (no install needed)"),
          );
          console.log("");

          for (const fw of builtIn) {
            const scannerInfo = BUILTIN_SCANNERS[fw.scanner!];
            const scannerLabel =
              scannerInfo?.description || capitalize(fw.name);
            console.log(
              `  ${chalk.green("✓")} ${chalk.cyan.bold(scannerLabel)}`,
            );
            console.log(`    ${chalk.dim(fw.evidence)}`);
            console.log("");
          }
        }

        // Show optional plugins (need install)
        if (optionalPlugins.length > 0) {
          console.log(chalk.bold("  Optional Plugins"));
          console.log("");

          for (const fw of optionalPlugins) {
            const pluginInfo = PLUGIN_INFO[fw.plugin!];
            const pluginName =
              pluginInfo?.name || `@buoy-design/plugin-${fw.plugin}`;

            console.log(`  ${chalk.dim("┌")} ${chalk.cyan.bold(pluginName)}`);
            console.log(`  ${chalk.dim("│")}`);

            // What was detected
            const detectsLabel = pluginInfo?.detects || capitalize(fw.name);
            console.log(
              `  ${chalk.dim("│")}  ${chalk.white("Detected:")} ${detectsLabel} ${chalk.dim(`(${fw.evidence.toLowerCase()})`)}`,
            );
            console.log(`  ${chalk.dim("│")}`);

            // What the plugin does
            if (pluginInfo?.description) {
              console.log(
                `  ${chalk.dim("│")}  ${chalk.dim(pluginInfo.description)}`,
              );
            }

            console.log(
              `  ${chalk.dim("└─")} ${chalk.dim(getPluginInstallCommand([fw.plugin!]))}`,
            );
            console.log("");
          }

          const missingPlugins = optionalPlugins
            .map((fw) => fw.plugin!)
            .filter((plugin, index, self) => self.indexOf(plugin) === index);

          if (missingPlugins.length > 0) {
            console.log(chalk.dim("  " + "─".repeat(65)));
            console.log("");
            console.log(chalk.bold("  Install all optional plugins:"));
            console.log(
              `    ${chalk.cyan(getPluginInstallCommand(missingPlugins))}`,
            );
            console.log("");

            // Determine if we should install plugins
            let shouldInstall = false;
            if (options.yes) {
              shouldInstall = true;
            } else if (options.install !== false) {
              // Only prompt if --no-install was not passed and stdin is a TTY
              if (process.stdin.isTTY) {
                shouldInstall = await promptConfirm(
                  "Install optional plugins now?",
                  true,
                );
              }
            }

            if (shouldInstall) {
              const { execSync } = await import("node:child_process");
              console.log("");
              console.log("Installing plugins...");
              try {
                execSync(getPluginInstallCommand(missingPlugins), {
                  stdio: "inherit",
                });
                success("Plugins installed successfully");
              } catch {
                warning(
                  "Plugin installation failed. You can install manually with the command above.",
                );
              }
            }
          }
        }
        console.log("");
      }

      // Generate and write config
      const content = generateConfig(project);

      try {
        writeFileSync(configPath, content, "utf-8");
        success(`Created buoy.config.mjs`);

        // Setup hooks if --hooks flag is provided
        if (options.hooks) {
          console.log("");
          const hookSystem = detectHookSystem(cwd);

          if (hookSystem) {
            info(`Detected hook system: ${hookSystem}`);
            const hookResult = setupHooks(cwd);

            if (hookResult.success) {
              success(hookResult.message);
            } else {
              warning(hookResult.message);
            }
          } else {
            // No hook system detected, create standalone hook
            const standaloneResult = generateStandaloneHook(cwd);
            if (standaloneResult.success) {
              success(standaloneResult.message);
              info(
                "To use this hook, copy it to .git/hooks/pre-commit or configure your hook system",
              );
            } else {
              warning(standaloneResult.message);
            }
          }
        }

        console.log("");
        info("Next steps:");

        let stepNum = 1;

        if (importedTokenFile) {
          info(`  ${stepNum}. Review imported tokens in ${chalk.cyan(importedTokenFile)}`);
          stepNum++;
        }

        info(`  ${stepNum}. Run ${chalk.cyan("buoy sweep")} to scan your codebase`);
        stepNum++;
        info(`  ${stepNum}. Run ${chalk.cyan("buoy drift check")} to detect drift`);
        stepNum++;

        if (!options.hooks) {
          info(
            `  ${stepNum}. Run ` +
              chalk.cyan("buoy dock --hooks") +
              " to setup pre-commit hooks",
          );
        }

        if (!project.storybook) {
          console.log("");
          info(
            chalk.dim(
              "Optional: Connect Figma by adding your API key to the config",
            ),
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        error(`Failed to create configuration: ${message}`);
        process.exit(1);
      }
    });

  return cmd;
}
