/**
 * CSS Value Parser
 * Extracts design values (colors, spacing, fonts, radii) from CSS text.
 * Framework-agnostic - works on any CSS string.
 */

/** What type of value this is */
export type ValueCategory = 'color' | 'spacing' | 'sizing' | 'font-size' | 'font-family' | 'radius' | 'breakpoint' | 'other';

/** What purpose this value serves (more granular than category) */
export type ValueContext =
  | 'spacing'      // padding, margin, gap - internal component spacing
  | 'sizing'       // width, height - dimensional constraints
  | 'position'     // top, right, bottom, left - positioning
  | 'breakpoint'   // media query values
  | 'color'        // all color values
  | 'typography'   // font-size, line-height
  | 'radius'       // border-radius
  | 'other';

export interface ExtractedValue {
  property: string;
  value: string;
  rawValue: string;
  category: ValueCategory;
  context: ValueContext;
  line?: number;
  column?: number;
}

export interface ParseResult {
  values: ExtractedValue[];
  errors: string[];
}

// CSS color keywords (subset of most common)
const CSS_COLORS = new Set([
  'transparent', 'currentcolor', 'inherit',
  'black', 'white', 'red', 'green', 'blue', 'yellow', 'orange', 'purple',
  'pink', 'brown', 'gray', 'grey', 'cyan', 'magenta', 'lime', 'maroon',
  'navy', 'olive', 'teal', 'aqua', 'fuchsia', 'silver',
]);

// Properties that accept color values
const COLOR_PROPERTIES = new Set([
  'color', 'background', 'background-color', 'border-color',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'outline-color', 'text-decoration-color', 'fill', 'stroke',
  'box-shadow', 'text-shadow', 'caret-color', 'accent-color',
]);

// Properties for actual spacing (padding, margin, gap)
const SPACING_PROPERTIES = new Set([
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'margin-block', 'margin-inline', 'margin-block-start', 'margin-block-end',
  'margin-inline-start', 'margin-inline-end',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'padding-block', 'padding-inline', 'padding-block-start', 'padding-block-end',
  'padding-inline-start', 'padding-inline-end',
  'gap', 'row-gap', 'column-gap', 'grid-gap',
]);

// Properties for sizing (width, height)
const SIZING_PROPERTIES = new Set([
  'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
  'flex-basis', 'block-size', 'inline-size',
]);

// Properties for positioning
const POSITION_PROPERTIES = new Set([
  'top', 'right', 'bottom', 'left',
  'inset', 'inset-block', 'inset-inline',
  'inset-block-start', 'inset-block-end', 'inset-inline-start', 'inset-inline-end',
]);

// Properties for font sizes
const FONT_SIZE_PROPERTIES = new Set(['font-size', 'line-height']);

// Properties for border radius
const RADIUS_PROPERTIES = new Set([
  'border-radius',
  'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-left-radius', 'border-bottom-right-radius',
]);

/**
 * Parse CSS text and extract design values
 */
export function parseCssValues(cssText: string): ParseResult {
  const values: ExtractedValue[] = [];
  const errors: string[] = [];

  // Extract breakpoints from media queries
  const breakpoints = extractMediaQueryBreakpoints(cssText);
  values.push(...breakpoints);

  // Match property: value pairs
  const propertyRegex = /([a-z-]+)\s*:\s*([^;{}]+)/gi;
  let match;

  while ((match = propertyRegex.exec(cssText)) !== null) {
    const property = match[1]?.toLowerCase().trim();
    const rawValue = match[2]?.trim();
    if (!property || !rawValue) continue;

    // Skip CSS variables and calc expressions for now
    if (rawValue.startsWith('var(') || rawValue.startsWith('calc(')) {
      continue;
    }

    const { category, context } = categorizeProperty(property);
    if (category === 'other') continue;

    // For color properties, extract color values
    if (category === 'color') {
      const colors = extractColorValues(rawValue);
      for (const color of colors) {
        values.push({
          property,
          value: color,
          rawValue,
          category: 'color',
          context: 'color',
        });
      }
    }
    // For spacing/sizing/font-size/radius, extract numeric values
    else {
      const numerics = extractNumericValues(rawValue);
      for (const numeric of numerics) {
        values.push({
          property,
          value: numeric,
          rawValue,
          category,
          context,
        });
      }
    }
  }

  return { values, errors };
}

/**
 * Extract breakpoint values from @media queries
 */
function extractMediaQueryBreakpoints(cssText: string): ExtractedValue[] {
  const breakpoints: ExtractedValue[] = [];

  // Match @media queries with width conditions
  // Matches: @media (min-width: 768px), @media screen and (max-width: 1024px), etc.
  const mediaQueryRegex = /@media[^{]*\{/gi;
  let match;

  while ((match = mediaQueryRegex.exec(cssText)) !== null) {
    const mediaQuery = match[0];

    // Extract min-width values
    const minWidthRegex = /min-width\s*:\s*(\d+(?:\.\d+)?)(px|rem|em)/gi;
    let widthMatch;
    while ((widthMatch = minWidthRegex.exec(mediaQuery)) !== null) {
      const num = widthMatch[1];
      const unit = widthMatch[2];
      if (!num || !unit) continue;
      const value = num + unit.toLowerCase();
      breakpoints.push({
        property: 'min-width',
        value,
        rawValue: mediaQuery.trim(),
        category: 'breakpoint',
        context: 'breakpoint',
      });
    }

    // Extract max-width values
    const maxWidthRegex = /max-width\s*:\s*(\d+(?:\.\d+)?)(px|rem|em)/gi;
    while ((widthMatch = maxWidthRegex.exec(mediaQuery)) !== null) {
      const num = widthMatch[1];
      const unit = widthMatch[2];
      if (!num || !unit) continue;
      const value = num + unit.toLowerCase();
      breakpoints.push({
        property: 'max-width',
        value,
        rawValue: mediaQuery.trim(),
        category: 'breakpoint',
        context: 'breakpoint',
      });
    }
  }

  return breakpoints;
}

interface PropertyInfo {
  category: ValueCategory;
  context: ValueContext;
}

/**
 * Categorize a CSS property by type and context
 */
function categorizeProperty(property: string): PropertyInfo {
  if (COLOR_PROPERTIES.has(property)) {
    return { category: 'color', context: 'color' };
  }
  if (SPACING_PROPERTIES.has(property)) {
    return { category: 'spacing', context: 'spacing' };
  }
  if (SIZING_PROPERTIES.has(property)) {
    return { category: 'sizing', context: 'sizing' };
  }
  if (POSITION_PROPERTIES.has(property)) {
    return { category: 'spacing', context: 'position' };
  }
  if (FONT_SIZE_PROPERTIES.has(property)) {
    return { category: 'font-size', context: 'typography' };
  }
  if (RADIUS_PROPERTIES.has(property)) {
    return { category: 'radius', context: 'radius' };
  }
  if (property === 'font-family') {
    return { category: 'font-family', context: 'typography' };
  }
  return { category: 'other', context: 'other' };
}

/**
 * Extract color values from a CSS value string
 */
function extractColorValues(value: string): string[] {
  const colors: string[] = [];

  // Hex colors: #rgb, #rrggbb, #rrggbbaa
  const hexRegex = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/gi;
  let match;
  while ((match = hexRegex.exec(value)) !== null) {
    colors.push(match[0].toLowerCase());
  }

  // RGB/RGBA
  const rgbRegex = /rgba?\s*\([^)]+\)/gi;
  while ((match = rgbRegex.exec(value)) !== null) {
    colors.push(normalizeRgb(match[0]));
  }

  // HSL/HSLA
  const hslRegex = /hsla?\s*\([^)]+\)/gi;
  while ((match = hslRegex.exec(value)) !== null) {
    colors.push(match[0].toLowerCase());
  }

  // OKLCH
  const oklchRegex = /oklch\s*\([^)]+\)/gi;
  while ((match = oklchRegex.exec(value)) !== null) {
    colors.push(match[0].toLowerCase());
  }

  // Named colors (only if no other colors found)
  if (colors.length === 0) {
    const words = value.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (CSS_COLORS.has(word)) {
        colors.push(word);
      }
    }
  }

  return colors;
}

/**
 * Extract numeric values with units from a CSS value string
 */
function extractNumericValues(value: string): string[] {
  const numerics: string[] = [];

  // Match numbers with units: 16px, 1.5rem, 0.5em, etc.
  const numericRegex = /(-?\d*\.?\d+)(px|rem|em|%|vh|vw|ch|ex|vmin|vmax)\b/gi;
  let match;
  while ((match = numericRegex.exec(value)) !== null) {
    numerics.push(match[0].toLowerCase());
  }

  // Also match unitless 0
  if (/\b0\b/.test(value) && numerics.length === 0) {
    numerics.push('0');
  }

  return numerics;
}

/**
 * Normalize RGB color format
 */
function normalizeRgb(rgb: string): string {
  return rgb.toLowerCase().replace(/\s+/g, '');
}

/**
 * Normalize a hex color to 6-digit format
 */
export function normalizeHexColor(hex: string): string {
  hex = hex.toLowerCase();
  if (hex.length === 4) {
    // #rgb → #rrggbb
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return hex;
}

/**
 * Convert hex to RGB values
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  hex = normalizeHexColor(hex).replace('#', '');
  if (hex.length !== 6) return null;

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  return { r, g, b };
}

/**
 * Parse a spacing value to pixels (approximate for rem/em)
 */
export function spacingToPx(value: string, baseFontSize = 16): number | null {
  const match = value.match(/^(-?\d*\.?\d+)(px|rem|em)?$/i);
  if (!match || !match[1]) return null;

  const num = parseFloat(match[1]);
  const unit = (match[2] ?? 'px').toLowerCase();

  switch (unit) {
    case 'px':
      return num;
    case 'rem':
    case 'em':
      return num * baseFontSize;
    default:
      return null;
  }
}

/**
 * Group extracted values by category
 */
export function groupByCategory(values: ExtractedValue[]): Record<string, ExtractedValue[]> {
  const grouped: Record<string, ExtractedValue[]> = {};

  for (const value of values) {
    const category = value.category;
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category]!.push(value);
  }

  return grouped;
}

/**
 * Count occurrences of each unique value
 */
export function countOccurrences(values: ExtractedValue[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const v of values) {
    const key = `${v.category}:${v.value}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return counts;
}
