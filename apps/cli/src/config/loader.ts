import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';
import { parse as parseYaml } from 'yaml';
import { ZodError } from 'zod';
import { fromZodError } from 'zod-validation-error';
import { BuoyConfig, BuoyConfigSchema } from './schema.js';
import { buildAutoConfig } from './auto-detect.js';

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
    // YAML config files (.buoy.yaml, .buoy.yml)
    if (ext === 'yaml' || ext === 'yml') {
      const content = readFileSync(configPath, 'utf-8');
      const raw = parseYaml(content);
      return {
        config: BuoyConfigSchema.parse(raw),
        configPath,
      };
    }

    // JSON config files (.buoyrc.json, .buoyrc)
    if (ext === 'json' || configPath.endsWith('.buoyrc')) {
      const content = readFileSync(configPath, 'utf-8');
      const raw = JSON.parse(content);
      return {
        config: BuoyConfigSchema.parse(raw),
        configPath,
      };
    }

    // For JS/TS files, we need to import them
    // Note: TypeScript files need tsx or similar runtime
    const fileUrl = pathToFileURL(configPath).href;
    const mod = await import(fileUrl);
    const raw = mod.default || mod;

    return {
      config: BuoyConfigSchema.parse(raw),
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
