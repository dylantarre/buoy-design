/**
 * Pattern Analyzer
 *
 * Detects repeated className patterns across the codebase.
 * Suggests extracting common patterns into components or utility classes.
 */

import type { DriftSignal } from "../../models/index.js";
import { createDriftId } from "../../models/index.js";

export interface ClassOccurrence {
  classes: string;
  file: string;
  line: number;
}

export interface PatternAnalyzerOptions {
  minOccurrences?: number;
  matching?: "exact" | "tight" | "loose";
}

/**
 * Normalize a className string by sorting classes alphabetically.
 * "flex items-center gap-2" -> "flex gap-2 items-center"
 */
export function normalizeClassPattern(classes: string): string {
  return classes
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

/**
 * Group occurrences by normalized pattern.
 */
export function groupPatterns(
  occurrences: ClassOccurrence[],
  _matching: "exact" | "tight" | "loose" = "exact"
): Map<string, ClassOccurrence[]> {
  const groups = new Map<string, ClassOccurrence[]>();

  for (const occ of occurrences) {
    const normalized = normalizeClassPattern(occ.classes);
    if (!normalized) continue;

    const existing = groups.get(normalized) || [];
    existing.push(occ);
    groups.set(normalized, existing);
  }

  return groups;
}

/**
 * Detect repeated patterns and generate drift signals.
 */
export function detectRepeatedPatterns(
  occurrences: ClassOccurrence[],
  options: PatternAnalyzerOptions = {}
): DriftSignal[] {
  const { minOccurrences = 3, matching = "exact" } = options;
  const groups = groupPatterns(occurrences, matching);
  const drifts: DriftSignal[] = [];

  for (const [pattern, locations] of groups) {
    if (locations.length < minOccurrences) continue;

    const classCount = pattern.split(" ").length;
    const isSimple = classCount <= 3;
    const firstLocation = locations[0]!;

    const suggestions = isSimple
      ? ["Consider creating a utility class for this pattern"]
      : ["Consider extracting this pattern into a reusable component"];

    drifts.push({
      id: createDriftId("repeated-pattern", pattern.replace(/\s+/g, "-")),
      type: "repeated-pattern",
      severity: "info",
      source: {
        entityType: "component",
        entityId: `pattern:${pattern.replace(/\s+/g, "-")}`,
        entityName: pattern,
        location: `${firstLocation.file}:${firstLocation.line}`,
      },
      message: `Pattern "${pattern}" appears ${locations.length} times across ${new Set(locations.map(l => l.file)).size} files`,
      details: {
        occurrences: locations.length,
        locations: locations.map((l) => `${l.file}:${l.line}`),
        suggestions,
      },
      detectedAt: new Date(),
    });
  }

  return drifts;
}
