/**
 * Hardcoded Value Detection Patterns
 *
 * Shared patterns and utilities for detecting hardcoded design values
 * (colors, spacing, fonts) across all framework scanners.
 */

import type { HardcodedValue } from "@buoy-design/core";

/**
 * Patterns for detecting hardcoded color values
 */
export const COLOR_PATTERNS = [
  /^#[0-9a-fA-F]{3,8}$/,  // Hex colors (#fff, #ffffff, #ffffffff)
  /^rgb\s*\(/i,           // rgb()
  /^rgba\s*\(/i,          // rgba()
  /^hsl\s*\(/i,           // hsl()
  /^hsla\s*\(/i,          // hsla()
  /^oklch\s*\(/i,         // oklch()
] as const;

/**
 * Combined regex for color detection (more efficient for single check)
 */
export const COLOR_VALUE_REGEX = /^(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|oklch\()/;

/**
 * Patterns for detecting hardcoded spacing values
 */
export const SPACING_PATTERNS = [
  /^\d+(\.\d+)?(px|rem|em|vh|vw|%)$/, // Numeric with units
] as const;

/**
 * Combined regex for spacing detection
 */
export const SPACING_VALUE_REGEX = /^\d+(\.\d+)?(px|rem|em)$/;

/**
 * Patterns for detecting hardcoded font size values
 */
export const FONT_SIZE_PATTERNS = [
  /^\d+(\.\d+)?(px|rem|em|pt)$/, // Font sizes
] as const;

/**
 * Combined regex for font size detection
 */
export const FONT_SIZE_VALUE_REGEX = /^\d+(\.\d+)?(px|rem|em|pt)$/;

/**
 * Pattern for buoy-ignore comments
 */
export const BUOY_IGNORE_PATTERN = /buoy-ignore|buoy-disable/i;

/**
 * CSS properties that represent colors
 */
export const COLOR_PROPERTIES = new Set([
  "color",
  "background-color",
  "backgroundColor",
  "background",
  "border-color",
  "borderColor",
  "fill",
  "stroke",
  "outline-color",
  "outlineColor",
  "text-decoration-color",
  "textDecorationColor",
  "caret-color",
  "caretColor",
  "accent-color",
  "accentColor",
]);

/**
 * CSS properties that represent spacing
 */
export const SPACING_PROPERTIES = new Set([
  "padding",
  "padding-top",
  "paddingTop",
  "padding-right",
  "paddingRight",
  "padding-bottom",
  "paddingBottom",
  "padding-left",
  "paddingLeft",
  "margin",
  "margin-top",
  "marginTop",
  "margin-right",
  "marginRight",
  "margin-bottom",
  "marginBottom",
  "margin-left",
  "marginLeft",
  "gap",
  "row-gap",
  "rowGap",
  "column-gap",
  "columnGap",
  "width",
  "height",
  "min-width",
  "minWidth",
  "min-height",
  "minHeight",
  "max-width",
  "maxWidth",
  "max-height",
  "maxHeight",
  "top",
  "right",
  "bottom",
  "left",
  "inset",
]);

/**
 * CSS properties that represent font sizes
 */
export const FONT_SIZE_PROPERTIES = new Set([
  "font-size",
  "fontSize",
]);

/**
 * Map of style properties to their hardcoded value types.
 * Used by React scanner for JSX style prop detection.
 */
export const STYLE_PROPERTY_TYPES: Record<string, HardcodedValue["type"]> = {
  // Colors
  color: "color",
  backgroundColor: "color",
  background: "color",
  borderColor: "color",
  fill: "color",
  stroke: "color",
  // Spacing
  padding: "spacing",
  paddingTop: "spacing",
  paddingRight: "spacing",
  paddingBottom: "spacing",
  paddingLeft: "spacing",
  margin: "spacing",
  marginTop: "spacing",
  marginRight: "spacing",
  marginBottom: "spacing",
  marginLeft: "spacing",
  gap: "spacing",
  width: "spacing",
  height: "spacing",
  top: "spacing",
  right: "spacing",
  bottom: "spacing",
  left: "spacing",
  // Typography
  fontSize: "fontSize",
  fontFamily: "fontFamily",
  // Effects
  boxShadow: "shadow",
  textShadow: "shadow",
  // Border
  border: "border",
  borderWidth: "border",
  borderRadius: "border",
};

/**
 * Check if a value looks like a design token or CSS variable (should be skipped)
 */
export function isDesignToken(value: string): boolean {
  return (
    value.startsWith("var(") ||
    value.startsWith("$") ||
    value.includes("token") ||
    value.startsWith("theme.") ||
    value.startsWith("--")
  );
}

/**
 * Determine if a CSS value is hardcoded and what type it is.
 * Returns null if the value is a design token or variable.
 *
 * This is the shared implementation used by Vue, Svelte, and Angular scanners.
 */
export function getHardcodedValueType(
  property: string,
  value: string,
): HardcodedValue["type"] | null {
  // Skip CSS variables and design tokens
  if (isDesignToken(value)) {
    return null;
  }

  // Normalize property name (handle both kebab-case and camelCase)
  const normalizedProp = property.toLowerCase().replace(/-/g, "");

  // Color properties
  if (COLOR_PROPERTIES.has(property) || COLOR_PROPERTIES.has(normalizedProp)) {
    if (COLOR_VALUE_REGEX.test(value)) {
      return "color";
    }
  }

  // Spacing properties
  if (SPACING_PROPERTIES.has(property) || SPACING_PROPERTIES.has(normalizedProp)) {
    if (SPACING_VALUE_REGEX.test(value)) {
      return "spacing";
    }
  }

  // Font size properties
  if (FONT_SIZE_PROPERTIES.has(property) || FONT_SIZE_PROPERTIES.has(normalizedProp)) {
    if (FONT_SIZE_VALUE_REGEX.test(value)) {
      return "fontSize";
    }
  }

  return null;
}

/**
 * Check if a value matches color patterns
 */
export function isHardcodedColor(value: string): boolean {
  if (isDesignToken(value)) return false;
  return COLOR_VALUE_REGEX.test(value);
}

/**
 * Check if a value matches spacing patterns
 */
export function isHardcodedSpacing(value: string): boolean {
  if (isDesignToken(value)) return false;
  return SPACING_VALUE_REGEX.test(value);
}

/**
 * Check if a value matches font size patterns
 */
export function isHardcodedFontSize(value: string): boolean {
  if (isDesignToken(value)) return false;
  return FONT_SIZE_VALUE_REGEX.test(value);
}
