// apps/cli/src/scan/orchestrator.ts
import type { Component, DesignToken } from "@buoy-design/core";
import type { ScanCache } from "@buoy-design/scanners";
import type { BuoyConfig, SourcesConfig } from "../config/schema.js";

/**
 * Result of a scan operation
 */
export interface ScanResult {
  components: Component[];
  tokens: DesignToken[];
  errors: ScanError[];
  cacheStats?: { hits: number; misses: number };
}

export interface ScanError {
  source: string;
  message: string;
  file?: string;
}

/**
 * Options for the scan orchestrator
 */
export interface ScanOrchestratorOptions {
  /**
   * Specific sources to scan. If empty, scans all enabled sources.
   */
  sources?: string[];

  /**
   * Callback for progress updates
   */
  onProgress?: (message: string) => void;

  /**
   * Specific files to scan. If provided, overrides include patterns in scanners.
   */
  files?: string[];
}

/**
 * All supported scanner source types
 */
export type ScannerSource =
  | "react"
  | "vue"
  | "svelte"
  | "angular"
  | "webcomponent"
  | "templates"
  | "tokens"
  | "figma"
  | "storybook";

/**
 * Scanner definition for the registry pattern
 */
interface ScannerDefinition {
  source: ScannerSource;
  configKey: keyof SourcesConfig;
  scannerKey: string;
  resultType: "components" | "tokens";
  getOptions: (
    cfg: any,
    projectRoot: string,
    cache: ScanCache | undefined,
    files?: string[]
  ) => any;
  validate?: (cfg: any) => { valid: boolean; error?: string };
}

/**
 * Registry of all scanner definitions - add new scanners here
 */
const SCANNER_REGISTRY: ScannerDefinition[] = [
  {
    source: "react",
    configKey: "react",
    scannerKey: "ReactComponentScanner",
    resultType: "components",
    getOptions: (cfg, projectRoot, cache, files) => ({
      projectRoot,
      include: files?.length ? files : cfg.include,
      exclude: cfg.exclude,
      designSystemPackage: cfg.designSystemPackage,
      cache,
    }),
  },
  {
    source: "vue",
    configKey: "vue",
    scannerKey: "VueComponentScanner",
    resultType: "components",
    getOptions: (cfg, projectRoot, cache, files) => ({
      projectRoot,
      include: files?.length ? files : cfg.include,
      exclude: cfg.exclude,
      cache,
    }),
  },
  {
    source: "svelte",
    configKey: "svelte",
    scannerKey: "SvelteComponentScanner",
    resultType: "components",
    getOptions: (cfg, projectRoot, cache, files) => ({
      projectRoot,
      include: files?.length ? files : cfg.include,
      exclude: cfg.exclude,
      cache,
    }),
  },
  {
    source: "angular",
    configKey: "angular",
    scannerKey: "AngularComponentScanner",
    resultType: "components",
    getOptions: (cfg, projectRoot, cache, files) => ({
      projectRoot,
      include: files?.length ? files : cfg.include,
      exclude: cfg.exclude,
      cache,
    }),
  },
  {
    source: "webcomponent",
    configKey: "webcomponent",
    scannerKey: "WebComponentScanner",
    resultType: "components",
    getOptions: (cfg, projectRoot, cache, files) => ({
      projectRoot,
      include: files?.length ? files : cfg.include,
      exclude: cfg.exclude,
      framework: cfg.framework,
      cache,
    }),
  },
  {
    source: "templates",
    configKey: "templates",
    scannerKey: "TemplateScanner",
    resultType: "components",
    getOptions: (cfg, projectRoot, cache, files) => ({
      projectRoot,
      include: files?.length ? files : cfg.include,
      exclude: cfg.exclude,
      templateType: cfg.type,
      cache,
    }),
  },
  {
    source: "tokens",
    configKey: "tokens",
    scannerKey: "TokenScanner",
    resultType: "tokens",
    getOptions: (cfg, projectRoot, cache) => ({
      projectRoot,
      files: cfg.files,
      cssVariablePrefix: cfg.cssVariablePrefix,
      cache,
    }),
  },
  {
    source: "figma",
    configKey: "figma",
    scannerKey: "FigmaComponentScanner",
    resultType: "components",
    getOptions: (cfg, projectRoot) => ({
      projectRoot,
      accessToken: cfg.accessToken,
      fileKeys: cfg.fileKeys,
      componentPageName: cfg.componentPageName,
    }),
    validate: (cfg) => ({
      valid: !!(cfg?.accessToken && cfg?.fileKeys?.length > 0),
      error: "Figma scanner requires accessToken and at least one fileKey",
    }),
  },
  {
    source: "storybook",
    configKey: "storybook",
    scannerKey: "StorybookScanner",
    resultType: "components",
    getOptions: (cfg, projectRoot) => ({
      projectRoot,
      url: cfg.url,
      staticDir: cfg.staticDir,
    }),
  },
];

/**
 * Options for ScanOrchestrator constructor
 */
export interface ScanOrchestratorConstructorOptions {
  /** Scan cache for incremental scanning */
  cache?: ScanCache;
}

/**
 * Centralized scanner orchestration for all CLI commands.
 * Eliminates duplicate scanning logic across scan, status, ci, and drift commands.
 */
export class ScanOrchestrator {
  private config: BuoyConfig;
  private projectRoot: string;
  private cache: ScanCache | undefined;

  constructor(
    config: BuoyConfig,
    projectRoot: string = process.cwd(),
    options?: ScanOrchestratorConstructorOptions
  ) {
    this.config = config;
    this.projectRoot = projectRoot;
    this.cache = options?.cache;
  }

  /**
   * Get list of enabled sources from config
   */
  getEnabledSources(): ScannerSource[] {
    const sources: ScannerSource[] = [];

    // JS Frameworks
    if (this.config.sources.react?.enabled) sources.push("react");
    if (this.config.sources.vue?.enabled) sources.push("vue");
    if (this.config.sources.svelte?.enabled) sources.push("svelte");
    if (this.config.sources.angular?.enabled) sources.push("angular");
    if (this.config.sources.webcomponent?.enabled) sources.push("webcomponent");

    // Templates
    if (this.config.sources.templates?.enabled) sources.push("templates");

    // Design tools
    if (this.config.sources.figma?.enabled) sources.push("figma");
    if (this.config.sources.storybook?.enabled) sources.push("storybook");
    if (this.config.sources.tokens?.enabled) sources.push("tokens");

    return sources;
  }

  /**
   * Scan all enabled sources or specific sources
   */
  async scan(options: ScanOrchestratorOptions = {}): Promise<ScanResult> {
    const result: ScanResult = {
      components: [],
      tokens: [],
      errors: [],
    };
    let totalCacheHits = 0;
    let totalCacheMisses = 0;

    // Determine sources to scan
    const sourcesToScan =
      options.sources && options.sources.length > 0
        ? (options.sources as ScannerSource[])
        : this.getEnabledSources();

    if (sourcesToScan.length === 0) {
      return result;
    }

    // Import scanners dynamically (lazy load)
    const scanners = await this.importScanners();

    // Scan each source
    for (const source of sourcesToScan) {
      options.onProgress?.(`Scanning ${source}...`);

      try {
        const sourceResult = await this.scanSource(source, scanners, options.files);
        result.components.push(...sourceResult.components);
        result.tokens.push(...sourceResult.tokens);
        result.errors.push(...sourceResult.errors);
        if (sourceResult.cacheStats) {
          totalCacheHits += sourceResult.cacheStats.hits;
          totalCacheMisses += sourceResult.cacheStats.misses;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push({ source, message });
      }
    }

    // Add cache stats if cache was used
    if (this.cache) {
      result.cacheStats = { hits: totalCacheHits, misses: totalCacheMisses };
    }

    return result;
  }

  /**
   * Scan only component sources (no tokens)
   */
  async scanComponents(
    options: ScanOrchestratorOptions = {},
  ): Promise<{ components: Component[]; errors: ScanError[] }> {
    const result = await this.scan({
      ...options,
      sources:
        options.sources?.filter((s) => s !== "tokens") ||
        this.getEnabledSources().filter((s) => s !== "tokens"),
    });

    return {
      components: result.components,
      errors: result.errors,
    };
  }

  /**
   * Scan only token sources
   */
  async scanTokens(
    options: Omit<ScanOrchestratorOptions, "sources"> = {},
  ): Promise<{ tokens: DesignToken[]; errors: ScanError[] }> {
    const result = await this.scan({
      ...options,
      sources: ["tokens"],
    });

    return {
      tokens: result.tokens,
      errors: result.errors,
    };
  }

  /**
   * Import all scanner classes dynamically
   */
  private async importScanners() {
    const {
      ReactComponentScanner,
      VueComponentScanner,
      SvelteComponentScanner,
      AngularComponentScanner,
      WebComponentScanner,
      TemplateScanner,
      TokenScanner,
    } = await import("@buoy-design/scanners/git");

    const { FigmaComponentScanner } = await import("@buoy-design/scanners/figma");
    const { StorybookScanner } = await import("@buoy-design/scanners/storybook");

    return {
      ReactComponentScanner,
      VueComponentScanner,
      SvelteComponentScanner,
      AngularComponentScanner,
      WebComponentScanner,
      TemplateScanner,
      TokenScanner,
      FigmaComponentScanner,
      StorybookScanner,
    };
  }

  /**
   * Scan a specific source and return results using the scanner registry
   */
  private async scanSource(
    source: ScannerSource,
    scanners: Record<string, new (options: any) => { scan(): Promise<any> }>,
    files?: string[],
  ): Promise<ScanResult> {
    const result: ScanResult = {
      components: [],
      tokens: [],
      errors: [],
    };

    // Find scanner definition in registry
    const definition = SCANNER_REGISTRY.find((d) => d.source === source);
    if (!definition) return result;

    // Get config for this scanner
    const cfg = this.config.sources[definition.configKey];
    if (!cfg) return result;

    // Run validation if defined
    if (definition.validate) {
      const validation = definition.validate(cfg);
      if (!validation.valid) {
        result.errors.push({ source, message: validation.error! });
        return result;
      }
    }

    // Get scanner class and instantiate
    const ScannerClass = scanners[definition.scannerKey];
    if (!ScannerClass) return result;

    const options = definition.getOptions(cfg, this.projectRoot, this.cache, files);
    const scanner = new ScannerClass(options);
    const scanResult = await scanner.scan();

    // Collect results based on type
    if (definition.resultType === "components") {
      result.components.push(...scanResult.items);
    } else {
      result.tokens.push(...scanResult.items);
    }

    result.cacheStats = scanResult.cacheStats;
    this.collectErrors(result.errors, source, scanResult.errors);

    return result;
  }

  /**
   * Collect and format errors from scanner result
   */
  private collectErrors(
    target: ScanError[],
    source: string,
    errors: Array<{ message: string; file?: string }>,
  ): void {
    for (const err of errors) {
      target.push({
        source,
        message: err.message,
        file: err.file,
      });
    }
  }
}
