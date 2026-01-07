/**
 * Confidence scoring for fix suggestions
 *
 * Determines how confident we are that a fix is correct and safe to apply.
 */

import type { DesignToken } from "../models/index.js";
import type { ConfidenceLevel } from "../models/fix.js";

export interface ConfidenceResult {
  level: ConfidenceLevel;
  score: number;
  reason: string;
}

/**
 * Score confidence for a color replacement
 */
export function scoreColorConfidence(
  original: string,
  token: DesignToken,
): ConfidenceResult {
  if (token.value.type !== "color") {
    return { level: "low", score: 0, reason: "Token is not a color" };
  }

  const normalizedOriginal = normalizeColor(original);
  const tokenHex = token.value.hex.toLowerCase();

  // Exact match
  if (normalizedOriginal === tokenHex) {
    return {
      level: "exact",
      score: 100,
      reason: `Exact match to ${token.name}`,
    };
  }

  // Calculate color distance
  const distance = colorDistance(normalizedOriginal, tokenHex);

  if (distance <= 5) {
    // Very close colors (imperceptible difference)
    const score = 98 - distance;
    return {
      level: "high",
      score,
      reason: `Near-exact match to ${token.name} (deltaE: ${distance.toFixed(1)})`,
    };
  }

  if (distance <= 15) {
    // Close colors (slight difference)
    const score = 90 - distance * 2;
    return {
      level: "medium",
      score: Math.max(70, score),
      reason: `Close match to ${token.name} (deltaE: ${distance.toFixed(1)})`,
    };
  }

  if (distance <= 30) {
    // Somewhat similar colors
    const score = 70 - distance;
    return {
      level: "low",
      score: Math.max(40, score),
      reason: `Possible match to ${token.name} (deltaE: ${distance.toFixed(1)})`,
    };
  }

  return {
    level: "low",
    score: 20,
    reason: `Weak match to ${token.name} (deltaE: ${distance.toFixed(1)})`,
  };
}

/**
 * Score confidence for a spacing replacement
 */
export function scoreSpacingConfidence(
  original: string,
  token: DesignToken,
): ConfidenceResult {
  if (token.value.type !== "spacing") {
    return { level: "low", score: 0, reason: "Token is not a spacing value" };
  }

  const originalPx = parseSpacingToPx(original);
  if (originalPx === null) {
    return {
      level: "low",
      score: 0,
      reason: "Could not parse original spacing",
    };
  }

  const tokenPx = convertToPx(token.value.value, token.value.unit);

  // Exact match
  if (originalPx === tokenPx) {
    return {
      level: "exact",
      score: 100,
      reason: `Exact match to ${token.name}`,
    };
  }

  const diff = Math.abs(originalPx - tokenPx);
  const percentDiff = (diff / Math.max(originalPx, tokenPx, 1)) * 100;

  if (diff <= 1) {
    // Within 1px (likely rounding)
    return {
      level: "high",
      score: 98,
      reason: `Near-exact match to ${token.name} (${diff}px difference)`,
    };
  }

  if (diff <= 2) {
    // Within 2px
    return {
      level: "high",
      score: 95,
      reason: `Close match to ${token.name} (${diff}px difference)`,
    };
  }

  if (percentDiff <= 10) {
    // Within 10% difference
    const score = 90 - percentDiff;
    return {
      level: "medium",
      score: Math.max(70, score),
      reason: `Approximate match to ${token.name} (${diff}px / ${percentDiff.toFixed(0)}% difference)`,
    };
  }

  if (percentDiff <= 25) {
    // Within 25% difference
    const score = 70 - percentDiff;
    return {
      level: "low",
      score: Math.max(40, score),
      reason: `Possible match to ${token.name} (${diff}px / ${percentDiff.toFixed(0)}% difference)`,
    };
  }

  return {
    level: "low",
    score: 20,
    reason: `Weak match to ${token.name} (${diff}px difference)`,
  };
}

/**
 * Score confidence for any fix type
 */
export function scoreConfidence(
  original: string,
  token: DesignToken,
  fixType: string,
): ConfidenceResult {
  switch (fixType) {
    case "hardcoded-color":
      return scoreColorConfidence(original, token);
    case "hardcoded-spacing":
    case "hardcoded-radius":
    case "hardcoded-font-size":
      return scoreSpacingConfidence(original, token);
    default:
      return { level: "low", score: 0, reason: "Unknown fix type" };
  }
}

// Helper functions

/**
 * Normalize color to lowercase hex
 */
function normalizeColor(color: string): string {
  const trimmed = color.trim().toLowerCase();

  // Already hex
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed;
  }
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    // Expand shorthand
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  if (/^#[0-9a-f]{8}$/i.test(trimmed)) {
    // Strip alpha
    return trimmed.slice(0, 7);
  }

  // RGB/RGBA
  const rgbMatch = trimmed.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]!, 10).toString(16).padStart(2, "0");
    const g = parseInt(rgbMatch[2]!, 10).toString(16).padStart(2, "0");
    const b = parseInt(rgbMatch[3]!, 10).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  }

  return trimmed;
}

/**
 * Calculate color distance (simplified deltaE)
 */
function colorDistance(hex1: string, hex2: string): number {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);

  if (!rgb1 || !rgb2) return 100;

  // Simple Euclidean distance in RGB space
  const distance = Math.sqrt(
    Math.pow(rgb1.r - rgb2.r, 2) +
      Math.pow(rgb1.g - rgb2.g, 2) +
      Math.pow(rgb1.b - rgb2.b, 2),
  );

  // Normalize to 0-100 scale (max distance is ~441)
  return (distance / 441) * 100;
}

/**
 * Convert hex to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) return null;
  return {
    r: parseInt(match[1]!, 16),
    g: parseInt(match[2]!, 16),
    b: parseInt(match[3]!, 16),
  };
}

/**
 * Parse spacing value to pixels
 */
function parseSpacingToPx(value: string): number | null {
  const match = value.trim().match(/^(-?[\d.]+)\s*(px|rem|em)?$/i);
  if (!match) return null;

  const num = parseFloat(match[1]!);
  const unit = (match[2] || "px").toLowerCase();

  return convertToPx(num, unit as "px" | "rem" | "em");
}

/**
 * Convert value to pixels
 */
function convertToPx(value: number, unit: "px" | "rem" | "em"): number {
  switch (unit) {
    case "rem":
    case "em":
      return value * 16; // Assume 16px base
    default:
      return value;
  }
}
