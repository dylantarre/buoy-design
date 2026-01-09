/**
 * Naming Pattern Analyzer
 *
 * Detects and validates naming conventions across components.
 * Identifies inconsistencies based on the project's own patterns,
 * not arbitrary external rules.
 */

import type { Component } from "../../models/index.js";
import { NAMING_CONFIG, getOutlierThreshold } from "../config.js";

/**
 * Analysis of naming patterns found in the codebase
 */
export interface NamingPatternAnalysis {
  patterns: {
    PascalCase: number;
    camelCase: number;
    "kebab-case": number;
    snake_case: number;
    other: number;
  };
  dominant: NamingPattern | null;
  total: number;
}

export type NamingPattern = "PascalCase" | "camelCase" | "kebab-case" | "snake_case" | "other";

/**
 * Result of a naming consistency check
 */
export interface NamingIssue {
  message: string;
  suggestion: string;
}

/**
 * Identify the naming pattern of a string
 */
export function identifyNamingPattern(name: string): NamingPattern {
  if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) return "PascalCase";
  if (/^[a-z][a-zA-Z0-9]*$/.test(name)) return "camelCase";
  if (/^[a-z][a-z0-9-]*$/.test(name)) return "kebab-case";
  if (/^[a-z][a-z0-9_]*$/.test(name)) return "snake_case";
  return "other";
}

/**
 * Detect the dominant naming patterns in a set of components
 */
export function detectNamingPatterns(components: Component[]): NamingPatternAnalysis {
  const patterns = {
    PascalCase: 0,
    camelCase: 0,
    "kebab-case": 0,
    snake_case: 0,
    other: 0,
  };

  for (const comp of components) {
    const pattern = identifyNamingPattern(comp.name);
    patterns[pattern]++;
  }

  // Find dominant pattern (must exceed threshold to be considered dominant)
  const total = components.length;
  let dominant: NamingPattern | null = null;
  let dominantCount = 0;

  for (const [pattern, count] of Object.entries(patterns)) {
    if (
      count > dominantCount &&
      count / total > NAMING_CONFIG.dominantPatternThreshold
    ) {
      dominant = pattern as NamingPattern;
      dominantCount = count;
    }
  }

  return { patterns, dominant, total };
}

/**
 * Check if a component name is consistent with the project's naming patterns
 */
export function checkNamingConsistency(
  name: string,
  patterns: NamingPatternAnalysis,
): NamingIssue | null {
  if (!patterns.dominant) return null; // No clear pattern, don't flag

  const thisPattern = identifyNamingPattern(name);
  if (thisPattern === patterns.dominant) return null;

  // Only flag if this is a clear outlier
  const outlierThreshold = getOutlierThreshold(patterns.total);
  if (patterns.patterns[patterns.dominant]! < outlierThreshold) return null;

  const percentage = Math.round(
    (patterns.patterns[patterns.dominant]! / patterns.total) * 100
  );

  return {
    message: `Component "${name}" uses ${thisPattern} but ${percentage}% of components use ${patterns.dominant}`,
    suggestion: `Consider renaming to match project convention (${patterns.dominant})`,
  };
}
