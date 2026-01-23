/**
 * Token Utility Analyzer - Design Token Utility Function Detection
 *
 * Detects design token utility functions in the codebase (e.g., getSpacing, getRadius)
 * and flags hardcoded values that could use these utilities instead.
 *
 * Phase 4.2 of BUOY_ROADMAP.md
 */

import type { Component, DriftSignal, ComponentSource } from "../../models/index.js";
import { createStableDriftId } from "../../models/index.js";

/**
 * Safely get path from component source (handles discriminated union)
 */
function getSourcePath(source: ComponentSource): string | null {
  if (source.type === "react" || source.type === "vue" || source.type === "svelte") {
    return source.path;
  }
  return null;
}

// Common design token utility function patterns
export const TOKEN_UTILITY_PATTERNS = [
  // Spacing utilities
  { pattern: /\bgetSpacing\b/, category: "spacing", name: "getSpacing" },
  { pattern: /\bspacing\(/, category: "spacing", name: "spacing()" },
  { pattern: /\btheme\.spacing\b/, category: "spacing", name: "theme.spacing" },
  { pattern: /\bspace\[/, category: "spacing", name: "space[]" },

  // Border radius utilities
  { pattern: /\bgetRadius\b/, category: "radius", name: "getRadius" },
  { pattern: /\bradii\(/, category: "radius", name: "radii()" },
  { pattern: /\btheme\.radii\b/, category: "radius", name: "theme.radii" },
  { pattern: /\bborderRadius\[/, category: "radius", name: "borderRadius[]" },

  // Font size utilities
  { pattern: /\bgetFontSize\b/, category: "fontSize", name: "getFontSize" },
  { pattern: /\bfontSize\(/, category: "fontSize", name: "fontSize()" },
  { pattern: /\btheme\.fontSizes\b/, category: "fontSize", name: "theme.fontSizes" },
  { pattern: /\bfontSizes\[/, category: "fontSize", name: "fontSizes[]" },

  // Color utilities
  { pattern: /\bgetColor\b/, category: "color", name: "getColor" },
  { pattern: /\bcolors\(/, category: "color", name: "colors()" },
  { pattern: /\btheme\.colors\b/, category: "color", name: "theme.colors" },
  { pattern: /\bcolors\[/, category: "color", name: "colors[]" },

  // Shadow utilities
  { pattern: /\bgetShadow\b/, category: "shadow", name: "getShadow" },
  { pattern: /\bshadows\(/, category: "shadow", name: "shadows()" },
  { pattern: /\btheme\.shadows\b/, category: "shadow", name: "theme.shadows" },

  // Generic token utilities
  { pattern: /\bgetToken\b/, category: "generic", name: "getToken" },
  { pattern: /\buseToken\b/, category: "generic", name: "useToken" },
  { pattern: /\btoken\(/, category: "generic", name: "token()" },
  { pattern: /\bcssVar\(/, category: "generic", name: "cssVar()" },
  { pattern: /\b--[a-z]+-[a-z]+/, category: "cssVariable", name: "CSS Variable" },

  // Chakra-style utilities
  { pattern: /\buseStyleConfig\b/, category: "generic", name: "useStyleConfig" },
  { pattern: /\buseTheme\b/, category: "generic", name: "useTheme" },

  // Mantine-style utilities
  { pattern: /\buseMantineTheme\b/, category: "generic", name: "useMantineTheme" },
  { pattern: /\brem\(/, category: "spacing", name: "rem()" },
  { pattern: /\bem\(/, category: "spacing", name: "em()" },
];

export interface DetectedUtility {
  /** Utility function name */
  name: string;
  /** Category of token (spacing, color, etc.) */
  category: string;
  /** File where utility was found */
  file: string;
  /** Line number if available */
  line?: number;
}

export interface UtilityAnalysisResult {
  /** Utilities detected in the codebase */
  availableUtilities: DetectedUtility[];
  /** Map of category -> utility names */
  utilitiesByCategory: Map<string, string[]>;
}

/**
 * Detect token utility functions from source file contents
 *
 * Note: Component metadata doesn't include source code, so utilities must be
 * detected from file content provided separately (e.g., via additional theme files).
 */
export function detectTokenUtilities(
  _components: Component[],
  additionalSources?: Array<{ content: string; file: string }>,
): UtilityAnalysisResult {
  const utilities: DetectedUtility[] = [];
  const seenUtilities = new Set<string>();

  // Scan additional sources (e.g., theme files, config files)
  if (additionalSources) {
    for (const source of additionalSources) {
      for (const util of TOKEN_UTILITY_PATTERNS) {
        if (util.pattern.test(source.content) && !seenUtilities.has(util.name)) {
          seenUtilities.add(util.name);
          utilities.push({
            name: util.name,
            category: util.category,
            file: source.file,
          });
        }
      }
    }
  }

  // Group by category
  const utilitiesByCategory = new Map<string, string[]>();
  for (const util of utilities) {
    const existing = utilitiesByCategory.get(util.category) || [];
    existing.push(util.name);
    utilitiesByCategory.set(util.category, existing);
  }

  return { availableUtilities: utilities, utilitiesByCategory };
}

/**
 * Map hardcoded value type to utility category
 */
function mapValueTypeToCategory(type: string): string | null {
  switch (type) {
    case "spacing":
    case "fontSize":
      return "spacing";
    case "color":
      return "color";
    case "borderRadius":
    case "radius":
      return "radius";
    case "shadow":
      return "shadow";
    default:
      return null;
  }
}

/**
 * Check if hardcoded values could use available token utilities
 */
export function checkTokenUtilityUsage(
  components: Component[],
  utilityAnalysis: UtilityAnalysisResult,
): DriftSignal[] {
  const drifts: DriftSignal[] = [];

  for (const component of components) {
    const hardcodedValues = component.metadata.hardcodedValues || [];

    for (const hardcoded of hardcodedValues) {
      const category = mapValueTypeToCategory(hardcoded.type);
      if (!category) continue;

      const availableUtils = utilityAnalysis.utilitiesByCategory.get(category);
      if (!availableUtils || availableUtils.length === 0) continue;

      // Found a hardcoded value that has a utility available
      drifts.push({
        id: createStableDriftId("hardcoded-value", component.name, {
          property: hardcoded.property,
          actual: hardcoded.value,
        }),
        type: "hardcoded-value",
        severity: "info",
        source: {
          entityType: "component",
          entityId: component.id,
          entityName: component.name,
          location: hardcoded.location || getSourcePath(component.source) || "",
        },
        message: `Component "${component.name}" has hardcoded ${hardcoded.type} value "${hardcoded.value}" that could use ${availableUtils[0]}`,
        details: {
          expected: `Use token utility: ${availableUtils.join(" or ")}`,
          actual: `Hardcoded value: ${hardcoded.value}`,
          suggestions: [
            `Replace "${hardcoded.value}" with ${availableUtils[0]}(...)`,
            `Available utilities: ${availableUtils.join(", ")}`,
            `Check if a design token exists for this value`,
          ],
        },
        detectedAt: new Date(),
      });
    }
  }

  return drifts;
}

/**
 * Generate a summary of token utility usage in the codebase
 */
export function summarizeTokenUtilityUsage(
  components: Component[],
  utilityAnalysis: UtilityAnalysisResult,
): {
  totalComponents: number;
  componentsWithHardcodedValues: number;
  componentsUsingUtilities: number;
  hardcodedByCategory: Map<string, number>;
  suggestions: string[];
} {
  const componentsWithHardcoded = components.filter(
    (c) => (c.metadata.hardcodedValues?.length || 0) > 0,
  );

  // Count hardcoded values by category
  const hardcodedByCategory = new Map<string, number>();
  for (const component of components) {
    for (const h of component.metadata.hardcodedValues || []) {
      const category = mapValueTypeToCategory(h.type);
      if (category) {
        hardcodedByCategory.set(category, (hardcodedByCategory.get(category) || 0) + 1);
      }
    }
  }

  // Generate suggestions
  const suggestions: string[] = [];
  for (const [category, count] of hardcodedByCategory) {
    const utils = utilityAnalysis.utilitiesByCategory.get(category);
    if (utils && utils.length > 0) {
      suggestions.push(
        `${count} hardcoded ${category} values could use ${utils[0]}`,
      );
    } else {
      suggestions.push(
        `Consider adding a token utility for ${category} (${count} hardcoded values)`,
      );
    }
  }

  return {
    totalComponents: components.length,
    componentsWithHardcodedValues: componentsWithHardcoded.length,
    // Note: Utility usage count requires source code analysis which is done at scan time
    componentsUsingUtilities: 0,
    hardcodedByCategory,
    suggestions,
  };
}
