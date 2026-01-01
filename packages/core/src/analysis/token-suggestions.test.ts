// packages/core/src/analysis/token-suggestions.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { TokenSuggestionService } from "./token-suggestions.js";
import type { DesignToken } from "../models/index.js";

describe("TokenSuggestionService", () => {
  let service: TokenSuggestionService;

  beforeEach(() => {
    service = new TokenSuggestionService();
  });

  describe("normalizeColor", () => {
    it("normalizes 6-digit hex colors", () => {
      expect(service.normalizeColor("#ff6b6b")).toBe("#ff6b6b");
      expect(service.normalizeColor("#FF6B6B")).toBe("#ff6b6b");
      expect(service.normalizeColor("  #aabbcc  ")).toBe("#aabbcc");
    });

    it("expands 3-digit hex colors", () => {
      expect(service.normalizeColor("#abc")).toBe("#aabbcc");
      expect(service.normalizeColor("#f00")).toBe("#ff0000");
      expect(service.normalizeColor("#FFF")).toBe("#ffffff");
    });

    it("converts rgb colors to hex", () => {
      expect(service.normalizeColor("rgb(255, 107, 107)")).toBe("#ff6b6b");
      expect(service.normalizeColor("rgb(0, 0, 0)")).toBe("#000000");
      expect(service.normalizeColor("rgb(255, 255, 255)")).toBe("#ffffff");
    });

    it("converts rgba colors to hex (ignoring alpha)", () => {
      expect(service.normalizeColor("rgba(255, 107, 107, 0.5)")).toBe("#ff6b6b");
      expect(service.normalizeColor("rgba(0, 0, 0, 1)")).toBe("#000000");
    });

    it("returns null for invalid colors", () => {
      expect(service.normalizeColor("invalid")).toBeNull();
      expect(service.normalizeColor("#gg0000")).toBeNull();
      expect(service.normalizeColor("")).toBeNull();
    });

    it("resolves named CSS colors", () => {
      expect(service.normalizeColor("red")).toBe("#ff0000");
      expect(service.normalizeColor("blue")).toBe("#0000ff");
      expect(service.normalizeColor("rebeccapurple")).toBe("#663399");
    });
  });

  describe("hexToRgb", () => {
    it("parses valid hex colors", () => {
      expect(service.hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0 });
      expect(service.hexToRgb("#00ff00")).toEqual({ r: 0, g: 255, b: 0 });
      expect(service.hexToRgb("#0000ff")).toEqual({ r: 0, g: 0, b: 255 });
      expect(service.hexToRgb("#ffffff")).toEqual({ r: 255, g: 255, b: 255 });
      expect(service.hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
    });

    it("returns null for invalid hex", () => {
      expect(service.hexToRgb("ff0000")).toBeNull();
      expect(service.hexToRgb("#fff")).toBeNull();
      expect(service.hexToRgb("invalid")).toBeNull();
    });
  });

  describe("colorSimilarity", () => {
    it("returns 1 for identical colors", () => {
      expect(service.colorSimilarity("#ff6b6b", "#ff6b6b")).toBe(1);
      expect(service.colorSimilarity("#000000", "#000000")).toBe(1);
    });

    it("returns 0 for maximum distance colors", () => {
      // Black vs white should be close to 0
      const similarity = service.colorSimilarity("#000000", "#ffffff");
      expect(similarity).toBeLessThan(0.1);
    });

    it("returns high similarity for close colors", () => {
      // Very similar reds
      const similarity = service.colorSimilarity("#ff6b6b", "#ff6c6c");
      expect(similarity).toBeGreaterThan(0.99);
    });

    it("returns low similarity for very different colors", () => {
      // Red vs blue
      const similarity = service.colorSimilarity("#ff0000", "#0000ff");
      expect(similarity).toBeLessThan(0.5);
    });
  });

  describe("normalizeSpacing", () => {
    it("normalizes px values", () => {
      expect(service.normalizeSpacing("16px")).toBe(16);
      expect(service.normalizeSpacing("24px")).toBe(24);
      expect(service.normalizeSpacing("8.5px")).toBe(8.5);
    });

    it("normalizes values without units as px", () => {
      expect(service.normalizeSpacing("16")).toBe(16);
      expect(service.normalizeSpacing("8")).toBe(8);
    });

    it("converts rem to px", () => {
      expect(service.normalizeSpacing("1rem")).toBe(16); // 1rem = 16px
      expect(service.normalizeSpacing("2rem")).toBe(32);
      expect(service.normalizeSpacing("0.5rem")).toBe(8);
    });

    it("converts em to px", () => {
      expect(service.normalizeSpacing("1em")).toBe(16);
      expect(service.normalizeSpacing("1.5em")).toBe(24);
    });

    it("returns null for invalid spacing", () => {
      expect(service.normalizeSpacing("invalid")).toBeNull();
      expect(service.normalizeSpacing("100%")).toBeNull();
      expect(service.normalizeSpacing("auto")).toBeNull();
    });
  });

  describe("toPx", () => {
    it("returns px values unchanged", () => {
      expect(service.toPx(16, "px")).toBe(16);
      expect(service.toPx(24, "px")).toBe(24);
    });

    it("converts rem to px", () => {
      expect(service.toPx(1, "rem")).toBe(16);
      expect(service.toPx(2, "rem")).toBe(32);
    });

    it("converts em to px", () => {
      expect(service.toPx(1, "em")).toBe(16);
      expect(service.toPx(2, "em")).toBe(32);
    });
  });

  describe("findColorTokenSuggestions", () => {
    const colorTokens: DesignToken[] = [
      {
        id: "token:primary",
        name: "primary",
        value: { type: "color", hex: "#ff6b6b" },
        source: { type: "css", path: "tokens.css" },
        metadata: {},
        scannedAt: new Date(),
      },
      {
        id: "token:secondary",
        name: "secondary",
        value: { type: "color", hex: "#4ecdc4" },
        source: { type: "css", path: "tokens.css" },
        metadata: {},
        scannedAt: new Date(),
      },
      {
        id: "token:danger",
        name: "danger",
        value: { type: "color", hex: "#ff0000" },
        source: { type: "css", path: "tokens.css" },
        metadata: {},
        scannedAt: new Date(),
      },
    ];

    it("finds exact color matches", () => {
      const suggestions = service.findColorTokenSuggestions(
        "#ff6b6b",
        colorTokens,
      );
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]!.suggestedToken).toBe("primary");
      expect(suggestions[0]!.confidence).toBe(1);
    });

    it("finds similar colors with high confidence", () => {
      const suggestions = service.findColorTokenSuggestions(
        "#ff6c6c", // Very close to #ff6b6b
        colorTokens,
      );
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0]!.suggestedToken).toBe("primary");
      expect(suggestions[0]!.confidence).toBeGreaterThan(0.99);
    });

    it("returns empty array for colors with no similar tokens", () => {
      const suggestions = service.findColorTokenSuggestions(
        "#123456", // Very different from all tokens
        colorTokens,
      );
      expect(suggestions).toHaveLength(0);
    });

    it("returns empty array for invalid colors", () => {
      const suggestions = service.findColorTokenSuggestions(
        "invalid",
        colorTokens,
      );
      expect(suggestions).toHaveLength(0);
    });

    it("respects maxSuggestions limit", () => {
      const suggestions = service.findColorTokenSuggestions(
        "#ff6b6b",
        colorTokens,
        1,
      );
      expect(suggestions.length).toBeLessThanOrEqual(1);
    });

    it("sorts suggestions by confidence", () => {
      const suggestions = service.findColorTokenSuggestions(
        "#ff0000", // Matches danger exactly
        colorTokens,
      );
      // Should be sorted by confidence descending
      for (let i = 1; i < suggestions.length; i++) {
        expect(suggestions[i - 1]!.confidence).toBeGreaterThanOrEqual(
          suggestions[i]!.confidence,
        );
      }
    });
  });

  describe("findSpacingTokenSuggestions", () => {
    const spacingTokens: DesignToken[] = [
      {
        id: "token:spacing-1",
        name: "spacing-1",
        value: { type: "spacing", value: 4, unit: "px" },
        source: { type: "css", path: "tokens.css" },
        metadata: {},
        scannedAt: new Date(),
      },
      {
        id: "token:spacing-2",
        name: "spacing-2",
        value: { type: "spacing", value: 8, unit: "px" },
        source: { type: "css", path: "tokens.css" },
        metadata: {},
        scannedAt: new Date(),
      },
      {
        id: "token:spacing-4",
        name: "spacing-4",
        value: { type: "spacing", value: 16, unit: "px" },
        source: { type: "css", path: "tokens.css" },
        metadata: {},
        scannedAt: new Date(),
      },
      {
        id: "token:spacing-rem",
        name: "spacing-rem",
        value: { type: "spacing", value: 1, unit: "rem" },
        source: { type: "css", path: "tokens.css" },
        metadata: {},
        scannedAt: new Date(),
      },
    ];

    it("finds exact spacing matches", () => {
      const suggestions = service.findSpacingTokenSuggestions(
        "8px",
        spacingTokens,
      );
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]!.suggestedToken).toBe("spacing-2");
      expect(suggestions[0]!.confidence).toBe(1);
    });

    it("finds equivalent values in different units", () => {
      // 16px = 1rem, spacing-4 is 16px, spacing-rem is 1rem (16px)
      const suggestions = service.findSpacingTokenSuggestions(
        "1rem",
        spacingTokens,
      );
      expect(suggestions.length).toBeGreaterThan(0);
      // Both spacing-4 (16px) and spacing-rem (1rem=16px) should match
      const tokenNames = suggestions.map((s) => s.suggestedToken);
      expect(tokenNames).toContain("spacing-4");
      expect(tokenNames).toContain("spacing-rem");
    });

    it("returns empty array for values with no similar tokens", () => {
      const suggestions = service.findSpacingTokenSuggestions(
        "100px", // No 100px token
        spacingTokens,
      );
      expect(suggestions).toHaveLength(0);
    });

    it("returns empty array for invalid spacing", () => {
      const suggestions = service.findSpacingTokenSuggestions(
        "auto",
        spacingTokens,
      );
      expect(suggestions).toHaveLength(0);
    });

    it("respects maxSuggestions limit", () => {
      const suggestions = service.findSpacingTokenSuggestions(
        "16px",
        spacingTokens,
        1,
      );
      expect(suggestions.length).toBeLessThanOrEqual(1);
    });
  });

  describe("generateTokenSuggestions", () => {
    const tokens: DesignToken[] = [
      {
        id: "token:primary",
        name: "primary",
        value: { type: "color", hex: "#ff6b6b" },
        source: { type: "css", path: "tokens.css" },
        metadata: {},
        scannedAt: new Date(),
      },
      {
        id: "token:spacing-2",
        name: "spacing-2",
        value: { type: "spacing", value: 8, unit: "px" },
        source: { type: "css", path: "tokens.css" },
        metadata: {},
        scannedAt: new Date(),
      },
    ];

    it("generates suggestions for color values", () => {
      const hardcodedValues = [
        {
          type: "color",
          value: "#ff6b6b",
          property: "color",
          location: "Button.tsx:10",
        },
      ];

      const suggestions = service.generateTokenSuggestions(
        hardcodedValues,
        tokens,
      );

      expect(suggestions.has("#ff6b6b")).toBe(true);
      expect(suggestions.get("#ff6b6b")![0]!.suggestedToken).toBe("primary");
    });

    it("generates suggestions for spacing values", () => {
      const hardcodedValues = [
        {
          type: "spacing",
          value: "8px",
          property: "padding",
          location: "Button.tsx:12",
        },
      ];

      const suggestions = service.generateTokenSuggestions(
        hardcodedValues,
        tokens,
      );

      expect(suggestions.has("8px")).toBe(true);
      expect(suggestions.get("8px")![0]!.suggestedToken).toBe("spacing-2");
    });

    it("generates suggestions for fontSize values", () => {
      const hardcodedValues = [
        {
          type: "fontSize",
          value: "8px",
          property: "fontSize",
          location: "Button.tsx:15",
        },
      ];

      const suggestions = service.generateTokenSuggestions(
        hardcodedValues,
        tokens,
      );

      expect(suggestions.has("8px")).toBe(true);
    });

    it("skips values with no matching tokens", () => {
      const hardcodedValues = [
        {
          type: "color",
          value: "#123456",
          property: "color",
          location: "Button.tsx:10",
        },
      ];

      const suggestions = service.generateTokenSuggestions(
        hardcodedValues,
        tokens,
      );

      expect(suggestions.has("#123456")).toBe(false);
    });

    it("handles mixed value types", () => {
      const hardcodedValues = [
        {
          type: "color",
          value: "#ff6b6b",
          property: "color",
          location: "Button.tsx:10",
        },
        {
          type: "spacing",
          value: "8px",
          property: "padding",
          location: "Button.tsx:12",
        },
        {
          type: "other",
          value: "solid",
          property: "borderStyle",
          location: "Button.tsx:14",
        },
      ];

      const suggestions = service.generateTokenSuggestions(
        hardcodedValues,
        tokens,
      );

      expect(suggestions.has("#ff6b6b")).toBe(true);
      expect(suggestions.has("8px")).toBe(true);
      expect(suggestions.has("solid")).toBe(false);
    });
  });

  describe("P0 Edge Cases", () => {
    describe("null/undefined handling", () => {
      it("handles null color input", () => {
        expect(service.normalizeColor(null as unknown as string)).toBeNull();
      });

      it("handles undefined color input", () => {
        expect(service.normalizeColor(undefined as unknown as string)).toBeNull();
      });

      it("handles null spacing input", () => {
        expect(service.normalizeSpacing(null as unknown as string)).toBeNull();
      });

      it("handles undefined spacing input", () => {
        expect(service.normalizeSpacing(undefined as unknown as string)).toBeNull();
      });
    });

    describe("HSL color support", () => {
      it("normalizes HSL to hex", () => {
        expect(service.normalizeColor("hsl(0, 100%, 50%)")).toBe("#ff0000");
        expect(service.normalizeColor("hsl(120, 100%, 50%)")).toBe("#00ff00");
        expect(service.normalizeColor("hsl(240, 100%, 50%)")).toBe("#0000ff");
      });

      it("normalizes HSLA to hex (ignoring alpha)", () => {
        expect(service.normalizeColor("hsla(0, 100%, 50%, 0.5)")).toBe("#ff0000");
        expect(service.normalizeColor("hsla(240, 100%, 50%, 0.8)")).toBe("#0000ff");
      });

      it("handles edge HSL values", () => {
        expect(service.normalizeColor("hsl(0, 0%, 0%)")).toBe("#000000");
        expect(service.normalizeColor("hsl(0, 0%, 100%)")).toBe("#ffffff");
        expect(service.normalizeColor("hsl(180, 100%, 50%)")).toBe("#00ffff"); // cyan
      });
    });

    describe("8-digit hex support", () => {
      it("strips alpha from 8-digit hex", () => {
        expect(service.normalizeColor("#3b82f6ff")).toBe("#3b82f6");
        expect(service.normalizeColor("#ff000080")).toBe("#ff0000");
        expect(service.normalizeColor("#00000000")).toBe("#000000");
      });
    });

    describe("negative spacing", () => {
      it("handles negative pixel values", () => {
        expect(service.normalizeSpacing("-8px")).toBe(-8);
        expect(service.normalizeSpacing("-16px")).toBe(-16);
      });

      it("handles negative rem values", () => {
        expect(service.normalizeSpacing("-1rem")).toBe(-16);
        expect(service.normalizeSpacing("-0.5rem")).toBe(-8);
      });

      it("handles negative unitless values", () => {
        expect(service.normalizeSpacing("-4")).toBe(-4);
      });
    });

    describe("sort stability", () => {
      it("sorts equal-confidence tokens alphabetically", () => {
        const tokens: DesignToken[] = [
          {
            id: "token:zulu",
            name: "zulu",
            value: { type: "color", hex: "#ff0000" },
            source: { type: "css", path: "tokens.css" },
            metadata: {},
            scannedAt: new Date(),
          },
          {
            id: "token:alpha",
            name: "alpha",
            value: { type: "color", hex: "#ff0000" },
            source: { type: "css", path: "tokens.css" },
            metadata: {},
            scannedAt: new Date(),
          },
          {
            id: "token:mike",
            name: "mike",
            value: { type: "color", hex: "#ff0000" },
            source: { type: "css", path: "tokens.css" },
            metadata: {},
            scannedAt: new Date(),
          },
        ];

        const suggestions = service.findColorTokenSuggestions("#ff0000", tokens);
        expect(suggestions[0]!.suggestedToken).toBe("alpha");
        expect(suggestions[1]!.suggestedToken).toBe("mike");
        expect(suggestions[2]!.suggestedToken).toBe("zulu");
      });

      it("sorts spacing tokens with equal confidence alphabetically", () => {
        const tokens: DesignToken[] = [
          {
            id: "token:spacing-z",
            name: "spacing-z",
            value: { type: "spacing", value: 8, unit: "px" },
            source: { type: "css", path: "tokens.css" },
            metadata: {},
            scannedAt: new Date(),
          },
          {
            id: "token:spacing-a",
            name: "spacing-a",
            value: { type: "spacing", value: 8, unit: "px" },
            source: { type: "css", path: "tokens.css" },
            metadata: {},
            scannedAt: new Date(),
          },
        ];

        const suggestions = service.findSpacingTokenSuggestions("8px", tokens);
        expect(suggestions[0]!.suggestedToken).toBe("spacing-a");
        expect(suggestions[1]!.suggestedToken).toBe("spacing-z");
      });
    });
  });
});
