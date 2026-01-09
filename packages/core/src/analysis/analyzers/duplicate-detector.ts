/**
 * Duplicate Component Detector
 *
 * Detects potential duplicate components based on similar names.
 * Only flags true duplicates like Button vs ButtonNew or Card vs CardLegacy.
 * Does NOT flag compound components like Button vs ButtonGroup.
 */

import type { Component } from "../../models/index.js";

/**
 * Semantic suffixes that represent legitimate separate components.
 * Components with these suffixes are NOT duplicates of their base component.
 * e.g., Button vs ButtonGroup are distinct components, not duplicates.
 */
export const SEMANTIC_COMPONENT_SUFFIXES = [
  // Compound component patterns
  "group",
  "list",
  "item",
  "items",
  "container",
  "wrapper",
  "provider",
  "context",
  // Layout parts
  "header",
  "footer",
  "body",
  "content",
  "section",
  "sidebar",
  "panel",
  // Specific UI patterns
  "trigger",
  "target",
  "overlay",
  "portal",
  "root",
  "slot",
  "action",
  "actions",
  "icon",
  "label",
  "text",
  "title",
  "description",
  "separator",
  "divider",
  // Size/state variants that are distinct components
  "small",
  "large",
  "mini",
  "skeleton",
  "placeholder",
  "loading",
  "error",
  "empty",
  // Form-related
  "input",
  "field",
  "control",
  "message",
  "helper",
  "hint",
  // Navigation
  "link",
  "menu",
  "submenu",
  "tab",
  "tabs",
  // Data display
  "cell",
  "row",
  "column",
  "columns",
  "head",
  "view",
] as const;

/**
 * Version/status suffixes that indicate potential duplicates.
 * Components with ONLY these suffixes are likely duplicates.
 * e.g., Button vs ButtonNew, Card vs CardLegacy
 */
export const VERSION_SUFFIXES_PATTERN =
  /(New|Old|V\d+|Legacy|Updated|Deprecated|Beta|Alpha|Experimental|Next|Previous|Original|Backup|Copy|Clone|Alt|Alternative|Temp|Temporary|WIP|Draft)$/i;

/**
 * Result of base name extraction
 */
export interface BaseNameResult {
  baseName: string;
  hasVersionSuffix: boolean;
}

/**
 * A group of potentially duplicate components
 */
export interface DuplicateGroup {
  components: Component[];
}

/**
 * Extract the base name from a component name, stripping version suffixes.
 * Returns whether the name had a version suffix (indicating potential duplicate).
 */
export function extractBaseName(name: string): BaseNameResult {
  const lowerName = name.toLowerCase();

  // Check if the name ends with a semantic suffix (legitimate separate component)
  for (const suffix of SEMANTIC_COMPONENT_SUFFIXES) {
    if (
      lowerName.endsWith(suffix) &&
      lowerName.length > suffix.length &&
      // Ensure the suffix is at a word boundary (e.g., "ButtonGroup" not "Buttong")
      lowerName[lowerName.length - suffix.length - 1]?.match(/[a-z0-9]/)
    ) {
      // This is a compound component, not a duplicate candidate
      return { baseName: lowerName, hasVersionSuffix: false };
    }
  }

  // Check for version suffixes that indicate duplicates
  const hasVersionSuffix = VERSION_SUFFIXES_PATTERN.test(name);
  const strippedName = name
    .replace(VERSION_SUFFIXES_PATTERN, "")
    .replace(/\d+$/, "") // Strip trailing numbers
    .toLowerCase();

  return { baseName: strippedName, hasVersionSuffix };
}

/**
 * Detect potential duplicate components in a list.
 * Only returns groups where at least one component has a version suffix.
 */
export function detectPotentialDuplicates(components: Component[]): DuplicateGroup[] {
  const duplicates: DuplicateGroup[] = [];
  const processed = new Set<string>();

  for (const comp of components) {
    if (processed.has(comp.id)) continue;

    const { baseName, hasVersionSuffix } = extractBaseName(comp.name);

    const similar = components.filter((c) => {
      if (c.id === comp.id) return false;

      const other = extractBaseName(c.name);

      // Only match if base names are identical
      if (baseName !== other.baseName || baseName.length < 3) {
        return false;
      }

      // At least one component must have a version suffix to be a duplicate
      return hasVersionSuffix || other.hasVersionSuffix;
    });

    if (similar.length > 0) {
      const group = [comp, ...similar];
      group.forEach((c) => processed.add(c.id));
      duplicates.push({ components: group });
    }
  }

  return duplicates;
}
