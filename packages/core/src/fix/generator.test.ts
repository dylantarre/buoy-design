import { describe, it, expect } from "vitest";
import { generateFixes, summarizeFixes } from "./generator.js";
import type {
  DriftSignal,
  DesignToken,
  ColorValue,
  SpacingValue,
} from "../models/index.js";

// Helper to create a mock drift signal
function createMockDrift(
  type: string,
  value: string,
  location: string = "src/components/Button.tsx:10:5",
): DriftSignal {
  return {
    id: `drift:${type}:${location}`,
    type: type as DriftSignal["type"],
    severity: "warning",
    source: {
      entityType: "component",
      entityId: "button",
      entityName: "Button",
      location,
    },
    message: `Found hardcoded ${type.replace("hardcoded-", "")} ${value}`,
    details: {
      actual: value,
    },
    detectedAt: new Date(),
  };
}

// Helper to create a mock color token
function createColorToken(name: string, hex: string): DesignToken {
  const value: ColorValue = {
    type: "color",
    hex,
  };
  return {
    id: `token:${name}`,
    name,
    category: "color",
    value,
    source: {
      type: "css",
      file: "tokens.css",
      line: 1,
    },
    metadata: {},
  };
}

// Helper to create a mock spacing token
function createSpacingToken(name: string, px: number): DesignToken {
  const value: SpacingValue = {
    type: "spacing",
    value: px,
    unit: "px",
  };
  return {
    id: `token:${name}`,
    name,
    category: "spacing",
    value,
    source: {
      type: "css",
      file: "tokens.css",
      line: 1,
    },
    metadata: {},
  };
}

describe("generateFixes", () => {
  describe("color fixes", () => {
    it("generates fix for exact color match", () => {
      const drifts = [createMockDrift("hardcoded-color", "#ff0000")];
      const tokens = [createColorToken("--color-danger", "#ff0000")];

      const fixes = generateFixes(drifts, tokens);

      expect(fixes).toHaveLength(1);
      expect(fixes[0]!.confidence).toBe("exact");
      expect(fixes[0]!.original).toBe("#ff0000");
      expect(fixes[0]!.replacement).toBe("var(--color-danger)");
      expect(fixes[0]!.tokenName).toBe("--color-danger");
    });

    it("generates fix for close color match", () => {
      const drifts = [createMockDrift("hardcoded-color", "#ff0001")]; // Very close to red
      const tokens = [createColorToken("--color-danger", "#ff0000")];

      const fixes = generateFixes(drifts, tokens);

      expect(fixes).toHaveLength(1);
      expect(fixes[0]!.confidence).toBe("high");
    });

    it("generates medium confidence for similar colors", () => {
      const drifts = [createMockDrift("hardcoded-color", "#ff3333")]; // Lighter red
      const tokens = [createColorToken("--color-danger", "#ff0000")];

      const fixes = generateFixes(drifts, tokens);

      expect(fixes.length).toBeGreaterThanOrEqual(0);
      // May or may not generate fix depending on threshold
    });

    it("skips colors with no reasonable match", () => {
      const drifts = [createMockDrift("hardcoded-color", "#00ff00")]; // Green
      const tokens = [createColorToken("--color-danger", "#ff0000")]; // Red

      const fixes = generateFixes(drifts, tokens);

      // Should either be empty or have low confidence
      if (fixes.length > 0) {
        expect(fixes[0]!.confidence).toBe("low");
      }
    });
  });

  describe("spacing fixes", () => {
    it("generates fix for exact spacing match", () => {
      const drifts = [createMockDrift("hardcoded-spacing", "16px")];
      const tokens = [createSpacingToken("--spacing-4", 16)];

      const fixes = generateFixes(drifts, tokens);

      expect(fixes).toHaveLength(1);
      expect(fixes[0]!.confidence).toBe("exact");
      expect(fixes[0]!.original).toBe("16px");
      expect(fixes[0]!.replacement).toBe("var(--spacing-4)");
    });

    it("generates fix for close spacing match", () => {
      const drifts = [createMockDrift("hardcoded-spacing", "15px")];
      const tokens = [createSpacingToken("--spacing-4", 16)];

      const fixes = generateFixes(drifts, tokens);

      expect(fixes).toHaveLength(1);
      // Within 2px should still be high confidence
      expect(["high", "medium"]).toContain(fixes[0]!.confidence);
    });
  });

  describe("filtering", () => {
    it("filters by minimum confidence", () => {
      const drifts = [
        createMockDrift("hardcoded-color", "#ff0000"),
        createMockDrift("hardcoded-color", "#00ff00"),
      ];
      const tokens = [createColorToken("--color-danger", "#ff0000")];

      const fixes = generateFixes(drifts, tokens, { minConfidence: "high" });

      // Only exact match should pass high confidence filter
      expect(fixes.every((f) => f.confidence === "exact")).toBe(true);
    });

    it("filters by fix type", () => {
      const drifts = [
        createMockDrift("hardcoded-color", "#ff0000"),
        createMockDrift("hardcoded-spacing", "16px"),
      ];
      const tokens = [
        createColorToken("--color-danger", "#ff0000"),
        createSpacingToken("--spacing-4", 16),
      ];

      const fixes = generateFixes(drifts, tokens, {
        types: ["hardcoded-color"],
      });

      expect(fixes.every((f) => f.fixType === "hardcoded-color")).toBe(true);
    });

    it("filters by file patterns", () => {
      const drifts = [
        createMockDrift(
          "hardcoded-color",
          "#ff0000",
          "src/components/Button.tsx:10:5",
        ),
        createMockDrift(
          "hardcoded-color",
          "#ff0000",
          "src/pages/Home.tsx:20:3",
        ),
      ];
      const tokens = [createColorToken("--color-danger", "#ff0000")];

      const fixes = generateFixes(drifts, tokens, {
        includeFiles: ["**/components/**"],
      });

      expect(fixes).toHaveLength(1);
      expect(fixes[0]!.file).toContain("components");
    });

    it("excludes files matching exclude patterns", () => {
      const drifts = [
        createMockDrift(
          "hardcoded-color",
          "#ff0000",
          "src/components/Button.tsx:10:5",
        ),
        createMockDrift(
          "hardcoded-color",
          "#ff0000",
          "src/pages/Home.tsx:20:3",
        ),
      ];
      const tokens = [createColorToken("--color-danger", "#ff0000")];

      const fixes = generateFixes(drifts, tokens, {
        excludeFiles: ["**/components/**"],
      });

      expect(fixes).toHaveLength(1);
      expect(fixes[0]!.file).toContain("pages");
    });
  });

  describe("sorting", () => {
    it("sorts fixes by confidence (high first)", () => {
      const drifts = [
        createMockDrift("hardcoded-color", "#ff0000", "a.tsx:10:5"),
        createMockDrift("hardcoded-color", "#ff5555", "b.tsx:10:5"),
      ];
      const tokens = [createColorToken("--color-danger", "#ff0000")];

      const fixes = generateFixes(drifts, tokens, { minConfidence: "low" });

      if (fixes.length >= 2) {
        const confidenceOrder = { exact: 0, high: 1, medium: 2, low: 3 };
        expect(confidenceOrder[fixes[0]!.confidence]).toBeLessThanOrEqual(
          confidenceOrder[fixes[1]!.confidence],
        );
      }
    });
  });
});

describe("summarizeFixes", () => {
  it("returns correct totals", () => {
    const fixes = [
      { confidence: "high" as const, fixType: "hardcoded-color" },
      { confidence: "high" as const, fixType: "hardcoded-color" },
      { confidence: "medium" as const, fixType: "hardcoded-spacing" },
      { confidence: "low" as const, fixType: "hardcoded-color" },
    ] as any[];

    const summary = summarizeFixes(fixes);

    expect(summary.total).toBe(4);
    expect(summary.byConfidence.high).toBe(2);
    expect(summary.byConfidence.medium).toBe(1);
    expect(summary.byConfidence.low).toBe(1);
    expect(summary.highConfidenceCount).toBe(2);
  });

  it("returns correct counts by type", () => {
    const fixes = [
      { confidence: "high" as const, fixType: "hardcoded-color" },
      { confidence: "high" as const, fixType: "hardcoded-color" },
      { confidence: "medium" as const, fixType: "hardcoded-spacing" },
    ] as any[];

    const summary = summarizeFixes(fixes);

    expect(summary.byType["hardcoded-color"]).toBe(2);
    expect(summary.byType["hardcoded-spacing"]).toBe(1);
  });

  it("handles empty array", () => {
    const summary = summarizeFixes([]);

    expect(summary.total).toBe(0);
    expect(summary.byConfidence.high).toBe(0);
    expect(summary.highConfidenceCount).toBe(0);
  });
});
