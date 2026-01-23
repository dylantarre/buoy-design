/**
 * Variant Analyzer - Cross-Variant Consistency Checking
 *
 * Detects components in variant directories (e.g., registry/default/, registry/new-york/)
 * and flags differences between same-named components across variants.
 *
 * Phase 4.1 of BUOY_ROADMAP.md
 */

import type { Component, DriftSignal, Severity, ComponentSource } from "../../models/index.js";
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

// Common variant directory patterns
const VARIANT_PATTERNS = [
  // shadcn/ui registry variants
  /registry\/([^/]+)\/ui\//,
  /registry\/([^/]+)\/components\//,
  /registry\/([^/]+)\/blocks\//,
  // Generic theme/style variants
  /themes?\/([^/]+)\//,
  /styles?\/([^/]+)\//,
  /variants?\/([^/]+)\//,
  // Platform variants
  /platforms?\/([^/]+)\//,
  // Brand variants
  /brands?\/([^/]+)\//,
];

export interface VariantGroup {
  /** Component name (shared across variants) */
  componentName: string;
  /** Map of variant name -> component */
  variants: Map<string, Component>;
}

export interface VariantDifference {
  /** Type of difference */
  type: "prop-missing" | "prop-type" | "variant-missing" | "style-value";
  /** Affected prop or variant name */
  field: string;
  /** Variant A name and value */
  variantA: { name: string; value: unknown };
  /** Variant B name and value */
  variantB: { name: string; value: unknown };
  /** Severity of the difference */
  severity: Severity;
}

/**
 * Extract variant name from component path
 * @returns variant name or null if not in a variant directory
 */
export function extractVariantName(path: string): string | null {
  for (const pattern of VARIANT_PATTERNS) {
    const match = path.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Group components by name across variants
 */
export function groupComponentsByVariant(components: Component[]): VariantGroup[] {
  const groups = new Map<string, Map<string, Component>>();

  for (const component of components) {
    const path = getSourcePath(component.source) || "";
    const variantName = extractVariantName(path);

    if (!variantName) continue;

    const normalizedName = component.name.toLowerCase();
    let variantMap = groups.get(normalizedName);
    if (!variantMap) {
      variantMap = new Map();
      groups.set(normalizedName, variantMap);
    }

    // Store only the first component found for each variant
    if (!variantMap.has(variantName)) {
      variantMap.set(variantName, component);
    }
  }

  // Filter to only groups with multiple variants
  const result: VariantGroup[] = [];
  for (const [name, variants] of groups) {
    if (variants.size > 1) {
      result.push({
        componentName: name,
        variants,
      });
    }
  }

  return result;
}

/**
 * Compare two components across variants and find differences
 */
export function compareVariants(
  componentA: Component,
  variantA: string,
  componentB: Component,
  variantB: string,
): VariantDifference[] {
  const differences: VariantDifference[] = [];

  // Compare props
  const propsA = new Map(componentA.props.map((p) => [p.name.toLowerCase(), p]));
  const propsB = new Map(componentB.props.map((p) => [p.name.toLowerCase(), p]));

  // Props in A but not in B
  for (const [name, prop] of propsA) {
    if (!propsB.has(name)) {
      differences.push({
        type: "prop-missing",
        field: prop.name,
        variantA: { name: variantA, value: prop },
        variantB: { name: variantB, value: undefined },
        severity: prop.required ? "warning" : "info",
      });
    } else {
      const propB = propsB.get(name)!;
      if (prop.type !== propB.type) {
        differences.push({
          type: "prop-type",
          field: prop.name,
          variantA: { name: variantA, value: prop.type },
          variantB: { name: variantB, value: propB.type },
          severity: "warning",
        });
      }
    }
  }

  // Props in B but not in A
  for (const [name, prop] of propsB) {
    if (!propsA.has(name)) {
      differences.push({
        type: "prop-missing",
        field: prop.name,
        variantA: { name: variantA, value: undefined },
        variantB: { name: variantB, value: prop },
        severity: prop.required ? "warning" : "info",
      });
    }
  }

  // Compare component variants (sizes, colors, etc.)
  const variantsA = new Set(componentA.variants.map((v) => v.name.toLowerCase()));
  const variantsB = new Set(componentB.variants.map((v) => v.name.toLowerCase()));

  for (const variant of variantsA) {
    if (!variantsB.has(variant)) {
      differences.push({
        type: "variant-missing",
        field: variant,
        variantA: { name: variantA, value: true },
        variantB: { name: variantB, value: false },
        severity: "info",
      });
    }
  }

  for (const variant of variantsB) {
    if (!variantsA.has(variant)) {
      differences.push({
        type: "variant-missing",
        field: variant,
        variantA: { name: variantA, value: false },
        variantB: { name: variantB, value: true },
        severity: "info",
      });
    }
  }

  // Compare hardcoded values (style differences)
  const hardcodedA = componentA.metadata.hardcodedValues || [];
  const hardcodedB = componentB.metadata.hardcodedValues || [];

  // Group by property for comparison
  const styleMapA = new Map<string, string>();
  const styleMapB = new Map<string, string>();

  for (const h of hardcodedA) {
    styleMapA.set(h.property, h.value);
  }
  for (const h of hardcodedB) {
    styleMapB.set(h.property, h.value);
  }

  // Check for same property with different values
  for (const [prop, valueA] of styleMapA) {
    const valueB = styleMapB.get(prop);
    if (valueB && valueA !== valueB) {
      differences.push({
        type: "style-value",
        field: prop,
        variantA: { name: variantA, value: valueA },
        variantB: { name: variantB, value: valueB },
        severity: "warning",
      });
    }
  }

  return differences;
}

/**
 * Check all component variants for consistency and generate drift signals
 */
export function checkVariantConsistency(components: Component[]): DriftSignal[] {
  const drifts: DriftSignal[] = [];
  const groups = groupComponentsByVariant(components);

  for (const group of groups) {
    const variantNames = Array.from(group.variants.keys());

    // Compare each pair of variants
    for (let i = 0; i < variantNames.length; i++) {
      for (let j = i + 1; j < variantNames.length; j++) {
        const variantA = variantNames[i]!;
        const variantB = variantNames[j]!;
        const componentA = group.variants.get(variantA)!;
        const componentB = group.variants.get(variantB)!;

        const differences = compareVariants(componentA, variantA, componentB, variantB);

        if (differences.length > 0) {
          // Group differences by severity
          const critical = differences.filter((d) => d.severity === "critical");
          const warnings = differences.filter((d) => d.severity === "warning");

          const severity: Severity =
            critical.length > 0 ? "critical" : warnings.length > 0 ? "warning" : "info";

          // Create a summary of differences
          const diffSummary = differences
            .slice(0, 5)
            .map((d) => {
              if (d.type === "prop-missing") {
                const hasIt = d.variantA.value ? d.variantA.name : d.variantB.name;
                return `${d.field} only in ${hasIt}`;
              } else if (d.type === "prop-type") {
                return `${d.field}: ${d.variantA.value} vs ${d.variantB.value}`;
              } else if (d.type === "style-value") {
                return `${d.field}: ${d.variantA.value} vs ${d.variantB.value}`;
              }
              return `${d.field} differs`;
            })
            .join(", ");

          const moreCount = differences.length - 5;
          const summary =
            moreCount > 0 ? `${diffSummary}, +${moreCount} more` : diffSummary;

          drifts.push({
            id: createStableDriftId("value-divergence", group.componentName, {
              property: `${variantA}-vs-${variantB}`,
            }),
            type: "value-divergence",
            severity,
            source: {
              entityType: "component",
              entityId: componentA.id,
              entityName: componentA.name,
              location: getSourcePath(componentA.source) || "",
            },
            target: {
              entityType: "component",
              entityId: componentB.id,
              entityName: componentB.name,
              location: getSourcePath(componentB.source) || "",
            },
            message: `Component "${group.componentName}" has ${differences.length} difference${differences.length > 1 ? "s" : ""} between ${variantA} and ${variantB} variants: ${summary}`,
            details: {
              expected: `Consistent implementation across variants`,
              actual: `${differences.length} differences found`,
              diff: JSON.stringify(
                differences.map((d) => ({
                  type: d.type,
                  field: d.field,
                  [d.variantA.name]: d.variantA.value,
                  [d.variantB.name]: d.variantB.value,
                })),
                null,
                2,
              ),
              suggestions: [
                "Review variant differences for intentionality",
                "Document intentional differences in design system documentation",
                "Align implementations if differences are unintentional",
              ],
            },
            detectedAt: new Date(),
          });
        }
      }
    }
  }

  return drifts;
}
