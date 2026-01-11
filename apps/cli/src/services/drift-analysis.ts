// apps/cli/src/services/drift-analysis.ts
/**
 * DriftAnalysisService - Consolidated drift detection workflow
 *
 * Handles the common pattern of:
 * 1. Scanning components via ScanOrchestrator
 * 2. Running SemanticDiffEngine analysis
 * 3. Applying ignore rules from config
 * 4. Filtering against baseline
 */

import type { DriftSignal, Severity, Component } from "@buoy-design/core";
import type { BuoyConfig } from "../config/schema.js";
import { ScanOrchestrator } from "../scan/orchestrator.js";
import { getSeverityWeight } from "@buoy-design/core";
import { TailwindScanner, ScanCache, extractStaticClassStrings } from "@buoy-design/scanners";
import { detectRepeatedPatterns, type ClassOccurrence } from "@buoy-design/core";
import { glob } from "glob";
import { readFile } from "fs/promises";

export interface DriftAnalysisOptions {
  /** Callback for progress updates */
  onProgress?: (message: string) => void;
  /** Include baselined drifts (default: false) */
  includeBaseline?: boolean;
  /** Filter by minimum severity */
  minSeverity?: Severity;
  /** Filter by drift type */
  filterType?: string;
  /** Scan cache for incremental scanning */
  cache?: ScanCache;
  /** Enable experimental features (repeated pattern detection) */
  experimental?: boolean;
}

export interface DriftAnalysisResult {
  /** All drifts after filtering */
  drifts: DriftSignal[];
  /** Components that were scanned */
  components: Component[];
  /** Number of drifts filtered out by baseline */
  baselinedCount: number;
  /** Summary counts by severity */
  summary: {
    total: number;
    critical: number;
    warning: number;
    info: number;
  };
}

/**
 * Severity order for filtering and sorting (0 = lowest, 2 = highest)
 * Use getSeverityWeight from @buoy-design/core for consistent ordering
 */
const SEVERITY_ORDER: Record<Severity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

/**
 * Calculate summary counts for drift signals
 */
export function calculateDriftSummary(drifts: DriftSignal[]): {
  total: number;
  critical: number;
  warning: number;
  info: number;
} {
  return {
    total: drifts.length,
    critical: drifts.filter((d) => d.severity === "critical").length,
    warning: drifts.filter((d) => d.severity === "warning").length,
    info: drifts.filter((d) => d.severity === "info").length,
  };
}

/**
 * Determine if drifts exceed a severity threshold
 */
export function hasDriftsAboveThreshold(
  drifts: DriftSignal[],
  failOn: Severity | "none",
): boolean {
  if (failOn === "none") return false;
  const threshold = SEVERITY_ORDER[failOn] ?? SEVERITY_ORDER.critical;
  return drifts.some((d) => SEVERITY_ORDER[d.severity] >= threshold);
}

/**
 * Sort drifts by severity (critical first)
 */
export function sortDriftsBySeverity(drifts: DriftSignal[]): DriftSignal[] {
  return [...drifts].sort(
    (a, b) => getSeverityWeight(b.severity) - getSeverityWeight(a.severity),
  );
}

/**
 * Apply ignore rules from config to filter out matching drifts
 */
export function applyIgnoreRules(
  drifts: DriftSignal[],
  ignoreRules: BuoyConfig["drift"]["ignore"],
  onWarning?: (message: string) => void,
): DriftSignal[] {
  let filtered = drifts;

  for (const rule of ignoreRules) {
    filtered = filtered.filter((d) => {
      if (d.type !== rule.type) return true;
      if (!rule.pattern) return false;

      try {
        const regex = new RegExp(rule.pattern);
        return !regex.test(d.source.entityName);
      } catch {
        onWarning?.(
          `Invalid regex pattern "${rule.pattern}" in ignore rule, skipping`,
        );
        return true;
      }
    });
  }

  return filtered;
}

/**
 * Apply severity filter to drifts
 */
export function filterBySeverity(
  drifts: DriftSignal[],
  minSeverity: Severity,
): DriftSignal[] {
  const minLevel = SEVERITY_ORDER[minSeverity] ?? 0;
  return drifts.filter((d) => SEVERITY_ORDER[d.severity] >= minLevel);
}

/**
 * Apply type filter to drifts
 */
export function filterByType(
  drifts: DriftSignal[],
  type: string,
): DriftSignal[] {
  return drifts.filter((d) => d.type === type);
}

/**
 * Apply per-type severity overrides from config
 */
export function applySeverityOverrides(
  drifts: DriftSignal[],
  overrides: BuoyConfig["drift"]["severity"],
): DriftSignal[] {
  if (!overrides || Object.keys(overrides).length === 0) return drifts;
  return drifts.map((d) => {
    const override = overrides[d.type];
    return override ? { ...d, severity: override } : d;
  });
}

/**
 * DriftAnalysisService - Main entry point for drift detection
 */
export class DriftAnalysisService {
  constructor(private config: BuoyConfig) {}

  /**
   * Run full drift analysis pipeline
   */
  async analyze(
    options: DriftAnalysisOptions = {},
  ): Promise<DriftAnalysisResult> {
    const { onProgress, includeBaseline, minSeverity, filterType, cache, experimental } =
      options;

    // Step 1: Scan components
    onProgress?.("Scanning components...");
    const orchestrator = new ScanOrchestrator(this.config, process.cwd(), {
      cache,
    });
    const { components } = await orchestrator.scanComponents({
      onProgress,
    });

    // Step 2: Run semantic diff analysis
    onProgress?.("Analyzing drift...");
    const { SemanticDiffEngine } = await import("@buoy-design/core/analysis");
    const engine = new SemanticDiffEngine();
    const diffResult = engine.analyzeComponents(components, {
      checkDeprecated: true,
      checkNaming: true,
      checkDocumentation: true,
    });

    let drifts: DriftSignal[] = applySeverityOverrides(
      diffResult.drifts,
      this.config.drift.severity,
    );

    // Step 2.5: Run Tailwind arbitrary value detection if tailwind is configured
    if (this.config.sources.tailwind?.enabled) {
      onProgress?.("Scanning for Tailwind arbitrary values...");
      const tailwindScanner = new TailwindScanner({
        projectRoot: process.cwd(),
        include: this.config.sources.tailwind.files,
        exclude: this.config.sources.tailwind.exclude,
        detectArbitraryValues: true,
      });

      const tailwindResult = await tailwindScanner.scan();
      if (tailwindResult.drifts.length > 0) {
        drifts = [
          ...drifts,
          ...applySeverityOverrides(
            tailwindResult.drifts,
            this.config.drift.severity,
          ),
        ];
        onProgress?.(
          `Found ${tailwindResult.drifts.length} Tailwind arbitrary value issues`,
        );
      }
    }

    // Step 2.6: Experimental repeated pattern detection
    const experimentalEnabled = this.config.experimental?.repeatedPatternDetection || experimental;
    if (experimentalEnabled) {
      const patternConfig = (this.config.drift?.types?.["repeated-pattern"] ?? {}) as {
        enabled?: boolean;
        minOccurrences?: number;
        matching?: "exact" | "tight" | "loose";
      };
      if (patternConfig.enabled !== false) {
        onProgress?.("Detecting repeated patterns (experimental)...");
        const patternDrifts = await this.detectRepeatedPatterns(patternConfig);
        drifts.push(...patternDrifts);
        if (patternDrifts.length > 0) {
          onProgress?.(
            `Found ${patternDrifts.length} repeated pattern issues`,
          );
        }
      }
    }

    // Step 3: Apply severity filter (before other filters for efficiency)
    if (minSeverity) {
      drifts = filterBySeverity(drifts, minSeverity);
    }

    // Step 4: Apply type filter
    if (filterType) {
      drifts = filterByType(drifts, filterType);
    }

    // Step 5: Apply ignore rules from config
    drifts = applyIgnoreRules(drifts, this.config.drift.ignore, (msg) => {
      onProgress?.(`Warning: ${msg}`);
    });

    // Step 6: Apply baseline filtering
    let baselinedCount = 0;
    if (!includeBaseline) {
      const { loadBaseline, filterBaseline } =
        await import("../commands/baseline.js");
      const baseline = await loadBaseline();
      const filtered = filterBaseline(drifts, baseline);
      drifts = filtered.newDrifts;
      baselinedCount = filtered.baselinedCount;

      if (baselinedCount > 0) {
        onProgress?.(`Filtered out ${baselinedCount} baselined drift signals.`);
      }
    }

    return {
      drifts,
      components,
      baselinedCount,
      summary: calculateDriftSummary(drifts),
    };
  }

  /**
   * Detect repeated class patterns across source files (experimental)
   */
  private async detectRepeatedPatterns(config: {
    minOccurrences?: number;
    matching?: "exact" | "tight" | "loose";
  }): Promise<DriftSignal[]> {
    const occurrences: ClassOccurrence[] = [];
    const cwd = process.cwd();

    // Find all source files
    const patterns = ["**/*.tsx", "**/*.jsx", "**/*.vue", "**/*.svelte"];
    const ignore = ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/build/**"];

    const files = await glob(patterns, { cwd, ignore, absolute: true });

    for (const file of files) {
      try {
        const content = await readFile(file, "utf-8");
        const relativePath = file.replace(cwd + "/", "");

        // Extract static class strings using existing extractor
        const classStrings = extractStaticClassStrings(content);

        for (const cs of classStrings) {
          // Combine all classes into a single string
          const allClasses = cs.classes.join(" ");
          if (allClasses.trim()) {
            occurrences.push({
              classes: allClasses,
              file: relativePath,
              line: cs.line,
            });
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return detectRepeatedPatterns(occurrences, {
      minOccurrences: config.minOccurrences ?? 3,
      matching: config.matching ?? "exact",
    });
  }
}
