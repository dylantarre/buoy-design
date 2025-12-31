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

export interface DriftAnalysisOptions {
  /** Callback for progress updates */
  onProgress?: (message: string) => void;
  /** Include baselined drifts (default: false) */
  includeBaseline?: boolean;
  /** Filter by minimum severity */
  minSeverity?: Severity;
  /** Filter by drift type */
  filterType?: string;
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
 * DriftAnalysisService - Main entry point for drift detection
 */
export class DriftAnalysisService {
  constructor(private config: BuoyConfig) {}

  /**
   * Run full drift analysis pipeline
   */
  async analyze(options: DriftAnalysisOptions = {}): Promise<DriftAnalysisResult> {
    const { onProgress, includeBaseline, minSeverity, filterType } = options;

    // Step 1: Scan components
    onProgress?.("Scanning components...");
    const orchestrator = new ScanOrchestrator(this.config);
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

    let drifts: DriftSignal[] = diffResult.drifts;

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
      const { loadBaseline, filterBaseline } = await import(
        "../commands/baseline.js"
      );
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
}
