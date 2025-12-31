// apps/cli/src/scan/orchestrator.ts
import type { Component, DesignToken } from "@buoy-design/core";
import type { BuoyConfig } from "../config/schema.js";

/**
 * Result of a scan operation
 */
export interface ScanResult {
  components: Component[];
  tokens: DesignToken[];
  errors: ScanError[];
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
 * Centralized scanner orchestration for all CLI commands.
 * Eliminates duplicate scanning logic across scan, status, ci, and drift commands.
 */
export class ScanOrchestrator {
  private config: BuoyConfig;
  private projectRoot: string;

  constructor(config: BuoyConfig, projectRoot: string = process.cwd()) {
    this.config = config;
    this.projectRoot = projectRoot;
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
        const sourceResult = await this.scanSource(source, scanners);
        result.components.push(...sourceResult.components);
        result.tokens.push(...sourceResult.tokens);
        result.errors.push(...sourceResult.errors);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push({ source, message });
      }
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

    return {
      ReactComponentScanner,
      VueComponentScanner,
      SvelteComponentScanner,
      AngularComponentScanner,
      WebComponentScanner,
      TemplateScanner,
      TokenScanner,
    };
  }

  /**
   * Scan a specific source and return results
   */
  private async scanSource(
    source: ScannerSource,
    scanners: Awaited<ReturnType<typeof this.importScanners>>,
  ): Promise<ScanResult> {
    const result: ScanResult = {
      components: [],
      tokens: [],
      errors: [],
    };

    switch (source) {
      case "react": {
        const cfg = this.config.sources.react;
        if (!cfg) break;

        const scanner = new scanners.ReactComponentScanner({
          projectRoot: this.projectRoot,
          include: cfg.include,
          exclude: cfg.exclude,
          designSystemPackage: cfg.designSystemPackage,
        });

        const scanResult = await scanner.scan();
        result.components.push(...scanResult.items);
        this.collectErrors(result.errors, source, scanResult.errors);
        break;
      }

      case "vue": {
        const cfg = this.config.sources.vue;
        if (!cfg) break;

        const scanner = new scanners.VueComponentScanner({
          projectRoot: this.projectRoot,
          include: cfg.include,
          exclude: cfg.exclude,
        });

        const scanResult = await scanner.scan();
        result.components.push(...scanResult.items);
        this.collectErrors(result.errors, source, scanResult.errors);
        break;
      }

      case "svelte": {
        const cfg = this.config.sources.svelte;
        if (!cfg) break;

        const scanner = new scanners.SvelteComponentScanner({
          projectRoot: this.projectRoot,
          include: cfg.include,
          exclude: cfg.exclude,
        });

        const scanResult = await scanner.scan();
        result.components.push(...scanResult.items);
        this.collectErrors(result.errors, source, scanResult.errors);
        break;
      }

      case "angular": {
        const cfg = this.config.sources.angular;
        if (!cfg) break;

        const scanner = new scanners.AngularComponentScanner({
          projectRoot: this.projectRoot,
          include: cfg.include,
          exclude: cfg.exclude,
        });

        const scanResult = await scanner.scan();
        result.components.push(...scanResult.items);
        this.collectErrors(result.errors, source, scanResult.errors);
        break;
      }

      case "webcomponent": {
        const cfg = this.config.sources.webcomponent;
        if (!cfg) break;

        const scanner = new scanners.WebComponentScanner({
          projectRoot: this.projectRoot,
          include: cfg.include,
          exclude: cfg.exclude,
          framework: cfg.framework,
        });

        const scanResult = await scanner.scan();
        result.components.push(...scanResult.items);
        this.collectErrors(result.errors, source, scanResult.errors);
        break;
      }

      case "templates": {
        const cfg = this.config.sources.templates;
        if (!cfg) break;

        const scanner = new scanners.TemplateScanner({
          projectRoot: this.projectRoot,
          include: cfg.include,
          exclude: cfg.exclude,
          templateType: cfg.type,
        });

        const scanResult = await scanner.scan();
        result.components.push(...scanResult.items);
        this.collectErrors(result.errors, source, scanResult.errors);
        break;
      }

      case "tokens": {
        const cfg = this.config.sources.tokens;
        if (!cfg) break;

        const scanner = new scanners.TokenScanner({
          projectRoot: this.projectRoot,
          files: cfg.files,
          cssVariablePrefix: cfg.cssVariablePrefix,
        });

        const scanResult = await scanner.scan();
        result.tokens.push(...scanResult.items);
        this.collectErrors(result.errors, source, scanResult.errors);
        break;
      }

      case "figma":
      case "storybook":
        // TODO: Implement figma and storybook scanners
        break;
    }

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
