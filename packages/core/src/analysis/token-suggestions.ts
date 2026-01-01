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

      if (similarity >= TOKEN_SUGGESTION_CONFIG.colorSimilarityThreshold) {
        // Only suggest tokens with >= 80% similarity
        suggestions.push({
          hardcodedValue,
          suggestedToken: token.name,
          tokenValue: token.value.hex,
          confidence: similarity,
        });
      }
    }

    // Sort by confidence (stable: alphabetical tiebreaker) and return top suggestions
    return suggestions
      .sort((a, b) => {
        const diff = b.confidence - a.confidence;
        return diff !== 0 ? diff : a.suggestedToken.localeCompare(b.suggestedToken);
      })
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

      if (similarity >= TOKEN_SUGGESTION_CONFIG.spacingSimilarityThreshold) {
        // Only suggest tokens with >= 90% similarity for spacing
        suggestions.push({
          hardcodedValue,
          suggestedToken: token.name,
          tokenValue: `${tokenValue}${tokenUnit}`,
          confidence: similarity,
        });
      }
    }

    // Sort by confidence (stable: alphabetical tiebreaker) and return top suggestions
    return suggestions
      .sort((a, b) => {
        const diff = b.confidence - a.confidence;
        return diff !== 0 ? diff : a.suggestedToken.localeCompare(b.suggestedToken);
      })
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
    if (!color || typeof color !== "string") return null;
    const trimmed = color.trim().toLowerCase();

    // Already hex
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
      return trimmed;
    }
    if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
      // Expand shorthand hex
      return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
    }

    // 8-digit hex with alpha - strip alpha channel
    if (/^#[0-9a-f]{8}$/i.test(trimmed)) {
      return trimmed.slice(0, 7);
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

    // HSL/HSLA
    const hslMatch = trimmed.match(
      /hsla?\s*\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%(?:\s*,\s*[\d.]+)?\s*\)/,
    );
    if (hslMatch) {
      const h = parseInt(hslMatch[1]!, 10);
      const s = parseInt(hslMatch[2]!, 10);
      const l = parseInt(hslMatch[3]!, 10);
      return this.hslToHex(h, s, l);
    }

    // Named CSS colors
    const namedColor = this.resolveNamedColor(trimmed);
    if (namedColor) return namedColor;

    return null;
  }

  /**
   * Convert HSL to hex color
   */
  private hslToHex(h: number, s: number, l: number): string {
    const sNorm = s / 100;
    const lNorm = l / 100;

    const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = lNorm - c / 2;

    let r = 0,
      g = 0,
      b = 0;
    if (h < 60) {
      r = c;
      g = x;
      b = 0;
    } else if (h < 120) {
      r = x;
      g = c;
      b = 0;
    } else if (h < 180) {
      r = 0;
      g = c;
      b = x;
    } else if (h < 240) {
      r = 0;
      g = x;
      b = c;
    } else if (h < 300) {
      r = x;
      g = 0;
      b = c;
    } else {
      r = c;
      g = 0;
      b = x;
    }

    const toHex = (n: number) =>
      Math.round((n + m) * 255)
        .toString(16)
        .padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  /**
   * Resolve named CSS colors to hex
   */
  private resolveNamedColor(name: string): string | null {
    const colors: Record<string, string> = {
      // Primary colors
      red: "#ff0000",
      green: "#008000",
      blue: "#0000ff",
      // Common colors
      white: "#ffffff",
      black: "#000000",
      gray: "#808080",
      grey: "#808080",
      // Extended colors
      orange: "#ffa500",
      yellow: "#ffff00",
      purple: "#800080",
      pink: "#ffc0cb",
      cyan: "#00ffff",
      magenta: "#ff00ff",
      // Design-specific
      rebeccapurple: "#663399",
      dodgerblue: "#1e90ff",
      tomato: "#ff6347",
      coral: "#ff7f50",
      gold: "#ffd700",
      silver: "#c0c0c0",
      navy: "#000080",
      teal: "#008080",
      maroon: "#800000",
      olive: "#808000",
      transparent: "#00000000",
    };
    return colors[name] ?? null;
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
    if (!value || typeof value !== "string") return null;
    const match = value.trim().match(/^(-?[\d.]+)\s*(px|rem|em)?$/i);
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
