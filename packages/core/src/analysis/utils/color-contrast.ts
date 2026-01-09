/**
 * WCAG Color Contrast Utilities
 *
 * Provides functions for calculating color contrast ratios according to
 * WCAG 2.0 guidelines for accessibility compliance.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Calculate relative luminance for WCAG contrast ratio
 * https://www.w3.org/TR/WCAG20/#relativeluminancedef
 */
export function getRelativeLuminance(r: number, g: number, b: number): number {
  const normalize = (c: number) => {
    const sRGB = c / 255;
    return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  };

  const rs = normalize(r);
  const gs = normalize(g);
  const bs = normalize(b);

  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate WCAG contrast ratio between two colors
 * https://www.w3.org/TR/WCAG20/#contrast-ratiodef
 */
export function getContrastRatio(color1: RGB, color2: RGB): number {
  const l1 = getRelativeLuminance(color1.r, color1.g, color1.b);
  const l2 = getRelativeLuminance(color2.r, color2.g, color2.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Parse hex color to RGB
 */
export function hexToRgb(hex: string): RGB | null {
  const normalized = hex.replace(/^#/, '');

  // Handle 3-digit hex
  if (normalized.length === 3) {
    const [r, g, b] = normalized.split('').map(c => parseInt(c + c, 16));
    return { r: r!, g: g!, b: b! };
  }

  // Handle 6-digit hex
  if (normalized.length === 6) {
    const r = parseInt(normalized.substring(0, 2), 16);
    const g = parseInt(normalized.substring(2, 4), 16);
    const b = parseInt(normalized.substring(4, 6), 16);
    return { r, g, b };
  }

  return null;
}

/**
 * Parse rgb/rgba string to RGB
 */
export function parseRgbString(rgbString: string): RGB | null {
  const match = rgbString.match(/rgba?\((\d+),?\s*(\d+),?\s*(\d+)/);
  if (!match) return null;

  return {
    r: parseInt(match[1]!),
    g: parseInt(match[2]!),
    b: parseInt(match[3]!),
  };
}

/**
 * Common named colors for basic color parsing
 */
const NAMED_COLORS: Record<string, RGB> = {
  'white': { r: 255, g: 255, b: 255 },
  'black': { r: 0, g: 0, b: 0 },
  'red': { r: 255, g: 0, b: 0 },
  'green': { r: 0, g: 128, b: 0 },
  'blue': { r: 0, g: 0, b: 255 },
  'transparent': { r: 255, g: 255, b: 255 }, // Treat as white for contrast purposes
};

/**
 * Convert color value to RGB
 * Supports hex (#fff, #ffffff), rgb(), rgba(), and common named colors
 */
export function colorToRgb(color: string): RGB | null {
  if (color.startsWith('#')) {
    return hexToRgb(color);
  }
  if (color.startsWith('rgb')) {
    return parseRgbString(color);
  }

  return NAMED_COLORS[color.toLowerCase()] || null;
}

/**
 * WCAG contrast level thresholds
 */
export const WCAG_THRESHOLDS = {
  AA_NORMAL_TEXT: 4.5,
  AA_LARGE_TEXT: 3,
  AAA_NORMAL_TEXT: 7,
  AAA_LARGE_TEXT: 4.5,
} as const;

/**
 * Check if a contrast ratio meets WCAG AA requirements
 */
export function meetsWCAG_AA(ratio: number, isLargeText = false): boolean {
  return ratio >= (isLargeText ? WCAG_THRESHOLDS.AA_LARGE_TEXT : WCAG_THRESHOLDS.AA_NORMAL_TEXT);
}

/**
 * Check if a contrast ratio meets WCAG AAA requirements
 */
export function meetsWCAG_AAA(ratio: number, isLargeText = false): boolean {
  return ratio >= (isLargeText ? WCAG_THRESHOLDS.AAA_LARGE_TEXT : WCAG_THRESHOLDS.AAA_NORMAL_TEXT);
}
