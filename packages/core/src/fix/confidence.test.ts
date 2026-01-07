import { describe, it, expect } from "vitest";
import {
  scoreConfidence,
  scoreColorConfidence,
  scoreSpacingConfidence,
} from "./confidence.js";
import type { DesignToken, ColorValue, SpacingValue } from "../models/index.js";

// Helper to create a color token
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

// Helper to create a spacing token
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

describe("scoreColorConfidence", () => {
  it("returns 100% for exact hex match", () => {
    const token = createColorToken("--color-primary", "#3b82f6");
    const result = scoreColorConfidence("#3b82f6", token);

    expect(result.score).toBe(100);
    expect(result.level).toBe("exact");
    expect(result.reason).toContain("Exact match");
  });

  it("returns 100% for case-insensitive hex match", () => {
    const token = createColorToken("--color-primary", "#3b82f6");
    const result = scoreColorConfidence("#3B82F6", token);

    expect(result.score).toBe(100);
    expect(result.level).toBe("exact");
  });

  it("expands 3-char hex to 6-char for comparison", () => {
    const token = createColorToken("--color-white", "#ffffff");
    const result = scoreColorConfidence("#fff", token);

    expect(result.score).toBe(100);
    expect(result.level).toBe("exact");
  });

  it("converts rgb() to hex for comparison", () => {
    const token = createColorToken("--color-red", "#ff0000");
    const result = scoreColorConfidence("rgb(255, 0, 0)", token);

    expect(result.score).toBe(100);
    expect(result.level).toBe("exact");
  });

  it("converts rgba() to hex (ignoring alpha)", () => {
    const token = createColorToken("--color-red", "#ff0000");
    const result = scoreColorConfidence("rgba(255, 0, 0, 0.5)", token);

    expect(result.score).toBe(100);
    expect(result.level).toBe("exact");
  });

  it("returns high confidence for very close colors", () => {
    const token = createColorToken("--color-primary", "#3b82f6");
    const result = scoreColorConfidence("#3b82f7", token); // 1 off in blue

    expect(result.level).toBe("high");
    expect(result.score).toBeGreaterThanOrEqual(95);
  });

  it("returns medium confidence for similar colors", () => {
    const token = createColorToken("--color-primary", "#3b82f6");
    const result = scoreColorConfidence("#3b72f6", token); // Slightly different

    // May be high or medium depending on distance
    expect(["high", "medium"]).toContain(result.level);
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it("returns low confidence for different colors", () => {
    const token = createColorToken("--color-primary", "#3b82f6"); // Blue
    const result = scoreColorConfidence("#ff0000", token); // Red

    expect(result.level).toBe("low");
    expect(result.score).toBeLessThan(70);
  });

  it("returns 0 for non-color tokens", () => {
    const spacingToken = createSpacingToken("--spacing-4", 16);
    const result = scoreColorConfidence("#ff0000", spacingToken);

    expect(result.score).toBe(0);
    expect(result.level).toBe("low");
    expect(result.reason).toContain("not a color");
  });
});

describe("scoreSpacingConfidence", () => {
  it("returns 100% for exact px match", () => {
    const token = createSpacingToken("--spacing-4", 16);
    const result = scoreSpacingConfidence("16px", token);

    expect(result.score).toBe(100);
    expect(result.level).toBe("exact");
    expect(result.reason).toContain("Exact match");
  });

  it("returns high confidence for 1px difference", () => {
    const token = createSpacingToken("--spacing-4", 16);
    const result = scoreSpacingConfidence("15px", token);

    expect(result.level).toBe("high");
    expect(result.score).toBeGreaterThanOrEqual(95);
  });

  it("returns high confidence for 2px difference", () => {
    const token = createSpacingToken("--spacing-4", 16);
    const result = scoreSpacingConfidence("14px", token);

    expect(result.level).toBe("high");
    expect(result.score).toBeGreaterThanOrEqual(90);
  });

  it("returns medium confidence for ~10% difference", () => {
    const token = createSpacingToken("--spacing-8", 32);
    const result = scoreSpacingConfidence("35px", token);

    expect(["high", "medium"]).toContain(result.level);
  });

  it("returns low confidence for large difference", () => {
    const token = createSpacingToken("--spacing-4", 16);
    const result = scoreSpacingConfidence("32px", token); // 100% difference

    expect(result.level).toBe("low");
  });

  it("handles rem values (assumes 16px base)", () => {
    const token = createSpacingToken("--spacing-4", 16);
    const result = scoreSpacingConfidence("1rem", token);

    expect(result.score).toBe(100);
    expect(result.level).toBe("exact");
  });

  it("handles em values", () => {
    const token = createSpacingToken("--spacing-8", 32);
    const result = scoreSpacingConfidence("2em", token);

    expect(result.score).toBe(100);
    expect(result.level).toBe("exact");
  });

  it("handles unitless values as px", () => {
    const token = createSpacingToken("--spacing-4", 16);
    const result = scoreSpacingConfidence("16", token);

    expect(result.score).toBe(100);
    expect(result.level).toBe("exact");
  });

  it("returns 0 for non-spacing tokens", () => {
    const colorToken = createColorToken("--color-primary", "#3b82f6");
    const result = scoreSpacingConfidence("16px", colorToken);

    expect(result.score).toBe(0);
    expect(result.level).toBe("low");
    expect(result.reason).toContain("not a spacing");
  });

  it("returns 0 for unparseable values", () => {
    const token = createSpacingToken("--spacing-4", 16);
    const result = scoreSpacingConfidence("invalid", token);

    expect(result.score).toBe(0);
    expect(result.level).toBe("low");
  });
});

describe("scoreConfidence", () => {
  it("delegates to scoreColorConfidence for hardcoded-color", () => {
    const token = createColorToken("--color-primary", "#3b82f6");
    const result = scoreConfidence("#3b82f6", token, "hardcoded-color");

    expect(result.score).toBe(100);
    expect(result.level).toBe("exact");
  });

  it("delegates to scoreSpacingConfidence for hardcoded-spacing", () => {
    const token = createSpacingToken("--spacing-4", 16);
    const result = scoreConfidence("16px", token, "hardcoded-spacing");

    expect(result.score).toBe(100);
    expect(result.level).toBe("exact");
  });

  it("delegates to scoreSpacingConfidence for hardcoded-radius", () => {
    const token = createSpacingToken("--radius-md", 8);
    const result = scoreConfidence("8px", token, "hardcoded-radius");

    expect(result.score).toBe(100);
    expect(result.level).toBe("exact");
  });

  it("delegates to scoreSpacingConfidence for hardcoded-font-size", () => {
    const token = createSpacingToken("--font-size-base", 16);
    const result = scoreConfidence("16px", token, "hardcoded-font-size");

    expect(result.score).toBe(100);
    expect(result.level).toBe("exact");
  });

  it("returns 0 for unknown fix types", () => {
    const token = createColorToken("--color-primary", "#3b82f6");
    const result = scoreConfidence("#3b82f6", token, "unknown-type");

    expect(result.score).toBe(0);
    expect(result.level).toBe("low");
    expect(result.reason).toContain("Unknown fix type");
  });
});
