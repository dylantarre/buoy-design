/**
 * Accessibility Analyzer
 *
 * Checks components for accessibility issues including:
 * - Missing ARIA labels on interactive elements
 * - Color contrast violations (WCAG AA/AAA)
 */

import type { Component, DriftSignal, DriftSource } from "../../models/index.js";
import { createDriftId } from "../../models/index.js";
import {
  colorToRgb,
  getContrastRatio,
  WCAG_THRESHOLDS,
} from "../utils/color-contrast.js";

/**
 * Interactive component types that require accessibility considerations
 */
const INTERACTIVE_COMPONENTS = [
  "Button",
  "Link",
  "Input",
  "Select",
  "Checkbox",
  "Radio",
];

/**
 * Check if a component is interactive based on its name
 */
export function isInteractiveComponent(componentName: string): boolean {
  return INTERACTIVE_COMPONENTS.some((ic) =>
    componentName.toLowerCase().includes(ic.toLowerCase()),
  );
}

/**
 * Check component for general accessibility issues
 */
export function checkAccessibility(component: Component): string[] {
  const issues: string[] = [];

  const isInteractive = isInteractiveComponent(component.name);

  if (isInteractive) {
    const hasAriaLabel = component.props.some(
      (p) =>
        p.name.toLowerCase().includes("arialabel") ||
        p.name.toLowerCase().includes("aria-label"),
    );
    const hasChildren = component.props.some(
      (p) => p.name.toLowerCase() === "children",
    );

    if (
      !hasAriaLabel &&
      !hasChildren &&
      component.metadata.accessibility?.issues
    ) {
      issues.push(...component.metadata.accessibility.issues);
    }
  }

  return issues;
}

/**
 * Convert a component to a DriftSource for signal generation
 */
function componentToDriftSource(comp: Component): DriftSource {
  let location = "";
  if (comp.source.type === "figma") {
    location = comp.source.url || comp.source.nodeId;
  } else if (comp.source.type === "storybook") {
    location = comp.source.url || comp.source.storyId;
  } else if (comp.source.path) {
    location = comp.source.line
      ? `${comp.source.path}:${comp.source.line}`
      : comp.source.path;
  }

  return {
    entityType: "component",
    entityId: comp.id,
    entityName: comp.name,
    location,
  };
}

/**
 * Check for color contrast issues in a component.
 * Detects foreground/background color pairs that fail WCAG contrast ratios.
 */
export function checkColorContrast(component: Component): DriftSignal[] {
  const drifts: DriftSignal[] = [];

  if (!component.metadata.hardcodedValues) {
    return drifts;
  }

  const colorValues = component.metadata.hardcodedValues.filter(
    (h) => h.type === "color",
  );

  // Group colors by property
  const colorsByProperty = new Map<string, typeof colorValues>();
  for (const cv of colorValues) {
    const prop = cv.property.toLowerCase();
    if (!colorsByProperty.has(prop)) {
      colorsByProperty.set(prop, []);
    }
    colorsByProperty.get(prop)!.push(cv);
  }

  const foregroundColors = colorsByProperty.get("color") || [];
  const backgroundColors =
    colorsByProperty.get("background-color") ||
    colorsByProperty.get("background") ||
    [];

  // Check contrast ratio for each foreground/background pair
  for (const fg of foregroundColors) {
    for (const bg of backgroundColors) {
      const fgRgb = colorToRgb(fg.value);
      const bgRgb = colorToRgb(bg.value);

      if (!fgRgb || !bgRgb) continue;

      const ratio = getContrastRatio(fgRgb, bgRgb);

      if (ratio < WCAG_THRESHOLDS.AA_NORMAL_TEXT) {
        const level = ratio < WCAG_THRESHOLDS.AA_LARGE_TEXT ? "WCAG AA and AAA" : "WCAG AAA";
        drifts.push({
          id: createDriftId("color-contrast", component.id, `${fg.value}-${bg.value}`),
          type: "color-contrast",
          severity: "critical",
          source: componentToDriftSource(component),
          message: `Component "${component.name}" has insufficient color contrast: ${fg.value} on ${bg.value} (ratio: ${ratio.toFixed(2)}:1)`,
          details: {
            expected: `Minimum ${WCAG_THRESHOLDS.AA_NORMAL_TEXT}:1 for WCAG AA, ${WCAG_THRESHOLDS.AAA_NORMAL_TEXT}:1 for AAA`,
            actual: `${ratio.toFixed(2)}:1`,
            suggestions: [
              `Fails ${level} - adjust colors to meet minimum ${WCAG_THRESHOLDS.AA_NORMAL_TEXT}:1 ratio`,
              "Use a contrast checker tool to find accessible color combinations",
              "Consider using design system color tokens with built-in contrast ratios",
            ],
            affectedFiles: [
              `${fg.location}: ${fg.property}: ${fg.value}`,
              `${bg.location}: ${bg.property}: ${bg.value}`,
            ],
          },
          detectedAt: new Date(),
        });
      }
    }
  }

  return drifts;
}
