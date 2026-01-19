import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';
import { parse as parseYaml } from 'yaml';
import { ZodError } from 'zod';
import { fromZodError } from 'zod-validation-error';
import { BuoyConfig, BuoyConfigSchema, SourcesConfig } from './schema.js';
import { buildAutoConfig } from './auto-detect.js';

/**
 * Framework sources that can be auto-detected and merged.
 * These are the component scanning sources (not tokens/figma/storybook).
 */
const AUTO_DETECTABLE_SOURCES: (keyof SourcesConfig)[] = [
  'react', 'vue', 'svelte', 'angular', 'webcomponent', 'templates', 'tailwind'
];

/**
 * Merge auto-detected framework sources into user config.
 * This ensures that if a user provides a partial config (e.g., only tokens),
 * we still auto-detect and enable framework sources like React.
 *
 * User's explicit settings always take precedence:
 * - If user sets `react: { enabled: false }`, we respect that
 * - If user doesn't mention a source at all, we merge in auto-detected config
 */
async function mergeAutoDetectedSources(
  userConfig: BuoyConfig,
  cwd: string
): Promise<BuoyConfig> {
  // Run auto-detection to get framework sources
  const { config: autoConfig } = await buildAutoConfig(cwd);

  // Start with user config
  const mergedConfig: BuoyConfig = { ...userConfig };

  // Merge auto-detected sources that the user didn't explicitly configure
  for (const source of AUTO_DETECTABLE_SOURCES) {
    // If user didn't define this source at all, use auto-detected
    if (userConfig.sources[source] === undefined && autoConfig.sources[source]) {
      mergedConfig.sources = {
        ...mergedConfig.sources,
        [source]: autoConfig.sources[source],
      };
    }
  }

  return mergedConfig;
}

const CONFIG_FILES = [
  '.buoy.yaml',       // Primary - YAML
  '.buoy.yml',        // Alt YAML extension
  'buoy.config.mjs',  // Legacy ESM (still supported)
  'buoy.config.js',   // Legacy JS
  'buoy.config.ts',   // Requires tsx or similar runtime
  '.buoyrc.json',     // Legacy JSON
  '.buoyrc',          // Legacy JSON
];

export interface LoadConfigResult {
  config: BuoyConfig;
  configPath: string | null;
}

export async function loadConfig(cwd: string = process.cwd()): Promise<LoadConfigResult> {
  // Find config file
  let configPath: string | null = null;

  for (const filename of CONFIG_FILES) {
    const fullPath = resolve(cwd, filename);
    if (existsSync(fullPath)) {
      configPath = fullPath;
      break;
    }
  }

  if (!configPath) {
    // No config file - use zero-config auto-detection
    const { config } = await buildAutoConfig(cwd);
    return {
      config,
      configPath: null,
    };
  }

  // Load config based on extension
  const ext = configPath.split('.').pop();

  try {
    let userConfig: BuoyConfig;

    // YAML config files (.buoy.yaml, .buoy.yml)
    if (ext === 'yaml' || ext === 'yml') {
      const content = readFileSync(configPath, 'utf-8');
      const raw = parseYaml(content);
      userConfig = BuoyConfigSchema.parse(raw);
    }
    // JSON config files (.buoyrc.json, .buoyrc)
    else if (ext === 'json' || configPath.endsWith('.buoyrc')) {
      const content = readFileSync(configPath, 'utf-8');
      const raw = JSON.parse(content);
      userConfig = BuoyConfigSchema.parse(raw);
    }
    // For JS/TS files, we need to import them
    // Note: TypeScript files need tsx or similar runtime
    else {
      const fileUrl = pathToFileURL(configPath).href;
      const mod = await import(fileUrl);
      const raw = mod.default || mod;
      userConfig = BuoyConfigSchema.parse(raw);
    }

    // Merge auto-detected framework sources with user config
    // This ensures partial configs still get framework detection
    const mergedConfig = await mergeAutoDetectedSources(userConfig, cwd);

    return {
      config: mergedConfig,
      configPath,
    };
  } catch (error) {
    // Provide helpful error messages for different error types
    if (error instanceof ZodError) {
      const validationError = fromZodError(error as any, {
        prefix: 'Configuration error',
        prefixSeparator: ': ',
      });
      throw new Error(
        `Invalid config in ${configPath}:\n\n${validationError.message}\n\nRun 'buoy dock' to generate a valid configuration.`,
      );
    }

    if (error instanceof SyntaxError) {
      throw new Error(
        `Invalid JSON in ${configPath}: ${error.message}\n\nCheck for missing commas, trailing commas, or unquoted keys.`,
      );
    }

    // Handle import errors (for JS/TS config files)
    if (error instanceof Error && error.message.includes('Cannot find module')) {
      throw new Error(
        `Failed to load config from ${configPath}: Module not found.\n\nIf using TypeScript, ensure tsx or ts-node is installed.`,
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load config from ${configPath}: ${message}`);
  }
}

export function getConfigPath(cwd: string = process.cwd()): string | null {
  for (const filename of CONFIG_FILES) {
    const fullPath = resolve(cwd, filename);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }
  return null;
}
