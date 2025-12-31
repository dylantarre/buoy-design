/**
 * Token suggestion utilities for finding design token replacements
 * for hardcoded values in components.
 */
import type { DesignToken } from "../models/index.js";
import { TOKEN_SUGGESTION_CONFIG } from "./config.js";

export interface TokenSuggestion {
  hardcodedValue: string;
  suggestedToken: string;
  tokenValue: string;
  confidence: number;
}

/**
 * Service for finding design token suggestions to replace hardcoded values
 */
export class TokenSuggestionService {
  /**
   * Find token suggestions for a hardcoded color value
   */
  findColorTokenSuggestions(
    hardcodedValue: string,
    tokens: DesignToken[],
    maxSuggestions: number = TOKEN_SUGGESTION_CONFIG.maxSuggestions,
  ): TokenSuggestion[] {
    const suggestions: TokenSuggestion[] = [];
    const normalizedInput = this.normalizeColor(hardcodedValue);

    if (!normalizedInput) return suggestions;

    for (const token of tokens) {
      if (token.value.type !== "color") continue;

      const tokenHex = token.value.hex.toLowerCase();
      const similarity = this.colorSimilarity(normalizedInput, tokenHex);

      if (similarity > TOKEN_SUGGESTION_CONFIG.colorSimilarityThreshold) {
        // Only suggest tokens with > 80% similarity
        suggestions.push({
          hardcodedValue,
          suggestedToken: token.name,
          tokenValue: token.value.hex,
          confidence: similarity,
        });
      }
    }

    // Sort by confidence and return top suggestions
    return suggestions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxSuggestions);
  }

  /**
   * Find token suggestions for a hardcoded spacing value
   */
  findSpacingTokenSuggestions(
    hardcodedValue: string,
    tokens: DesignToken[],
    maxSuggestions: number = TOKEN_SUGGESTION_CONFIG.maxSuggestions,
  ): TokenSuggestion[] {
    const suggestions: TokenSuggestion[] = [];
    const normalizedInput = this.normalizeSpacing(hardcodedValue);

    if (normalizedInput === null) return suggestions;

    for (const token of tokens) {
      if (token.value.type !== "spacing") continue;

      const tokenValue = token.value.value;
      const tokenUnit = token.value.unit;

      // Convert to comparable units (px)
      const tokenPx = this.toPx(tokenValue, tokenUnit);
      const similarity =
        1 -
        Math.abs(normalizedInput - tokenPx) /
          Math.max(normalizedInput, tokenPx, 1);

      if (similarity > TOKEN_SUGGESTION_CONFIG.spacingSimilarityThreshold) {
        // Only suggest tokens with > 90% similarity for spacing
        suggestions.push({
          hardcodedValue,
          suggestedToken: token.name,
          tokenValue: `${tokenValue}${tokenUnit}`,
          confidence: similarity,
        });
      }
    }

    return suggestions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxSuggestions);
  }

  /**
   * Generate actionable suggestions for hardcoded values
   */
  generateTokenSuggestions(
    hardcodedValues: Array<{
      type: string;
      value: string;
      property: string;
      location: string;
    }>,
    tokens: DesignToken[],
  ): Map<string, TokenSuggestion[]> {
    const suggestions = new Map<string, TokenSuggestion[]>();

    for (const hv of hardcodedValues) {
      let tokenSuggestions: TokenSuggestion[] = [];

      if (hv.type === "color") {
        tokenSuggestions = this.findColorTokenSuggestions(hv.value, tokens);
      } else if (hv.type === "spacing" || hv.type === "fontSize") {
        tokenSuggestions = this.findSpacingTokenSuggestions(hv.value, tokens);
      }

      if (tokenSuggestions.length > 0) {
        suggestions.set(hv.value, tokenSuggestions);
      }
    }

    return suggestions;
  }

  /**
   * Normalize a color string to hex format
   */
  normalizeColor(color: string): string | null {
    const trimmed = color.trim().toLowerCase();

    // Already hex
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
      return trimmed;
    }
    if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
      // Expand shorthand hex
      return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
    }

    // RGB/RGBA
    const rgbMatch = trimmed.match(
      /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/,
    );
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]!, 10).toString(16).padStart(2, "0");
      const g = parseInt(rgbMatch[2]!, 10).toString(16).padStart(2, "0");
      const b = parseInt(rgbMatch[3]!, 10).toString(16).padStart(2, "0");
      return `#${r}${g}${b}`;
    }

    return null;
  }

  /**
   * Calculate color similarity (0-1) between two hex colors
   */
  colorSimilarity(hex1: string, hex2: string): number {
    const rgb1 = this.hexToRgb(hex1);
    const rgb2 = this.hexToRgb(hex2);

    if (!rgb1 || !rgb2) return 0;

    // Calculate Euclidean distance in RGB space
    const distance = Math.sqrt(
      Math.pow(rgb1.r - rgb2.r, 2) +
        Math.pow(rgb1.g - rgb2.g, 2) +
        Math.pow(rgb1.b - rgb2.b, 2),
    );

    // Max distance is sqrt(255^2 * 3) ≈ 441.67
    const maxDistance = 441.67;
    return 1 - distance / maxDistance;
  }

  /**
   * Convert hex to RGB
   */
  hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const match = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!match) return null;
    return {
      r: parseInt(match[1]!, 16),
      g: parseInt(match[2]!, 16),
      b: parseInt(match[3]!, 16),
    };
  }

  /**
   * Normalize a spacing string to pixels
   */
  normalizeSpacing(value: string): number | null {
    const match = value.trim().match(/^([\d.]+)\s*(px|rem|em)?$/i);
    if (!match) return null;

    const num = parseFloat(match[1]!);
    const unit = (match[2] || "px").toLowerCase();

    return this.toPx(num, unit as "px" | "rem" | "em");
  }

  /**
   * Convert spacing value to pixels
   */
  toPx(value: number, unit: "px" | "rem" | "em"): number {
    switch (unit) {
      case "rem":
        return value * TOKEN_SUGGESTION_CONFIG.baseFontSizePx;
      case "em":
        return value * TOKEN_SUGGESTION_CONFIG.baseFontSizePx;
      default:
        return value;
    }
  }
}
