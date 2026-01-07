import { describe, it, expect } from "vitest";
import {
  generateContext,
  generateMinimalContext,
  generateComprehensiveContext,
  type ContextData,
} from "../context-generator.js";
import type {
  Component,
  DesignToken,
  DriftSignal,
  ColorValue,
  SpacingValue,
} from "@buoy-design/core";

// Helper to create mock component
function createMockComponent(
  name: string,
  framework: string = "react",
): Component {
  return {
    id: `component:${name}`,
    name,
    source: {
      type: framework as "react",
      path: `src/components/${name}.tsx`,
    },
    props: [],
    variants: [],
    tokens: [],
    metadata: {},
  };
}

// Helper to create mock color token
function createColorToken(name: string, hex: string): DesignToken {
  const value: ColorValue = { type: "color", hex };
  return {
    id: `token:${name}`,
    name,
    category: "color",
    value,
    source: { type: "css", file: "tokens.css", line: 1 },
    metadata: {},
  };
}

// Helper to create mock spacing token
function createSpacingToken(name: string, px: number): DesignToken {
  const value: SpacingValue = { type: "spacing", value: px, unit: "px" };
  return {
    id: `token:${name}`,
    name,
    category: "spacing",
    value,
    source: { type: "css", file: "tokens.css", line: 1 },
    metadata: {},
  };
}

// Helper to create mock drift signal
function createMockDrift(type: string, message: string): DriftSignal {
  return {
    id: `drift:${type}`,
    type: type as DriftSignal["type"],
    severity: "warning",
    source: {
      entityType: "component",
      entityId: "button",
      entityName: "Button",
      location: "src/Button.tsx:10:5",
    },
    message,
    details: {},
    detectedAt: new Date(),
  };
}

describe("generateContext", () => {
  const baseData: ContextData = {
    tokens: [
      createColorToken("--color-primary", "#2563EB"),
      createColorToken("--color-error", "#DC2626"),
      createSpacingToken("--spacing-4", 16),
      createSpacingToken("--spacing-8", 32),
    ],
    components: [
      createMockComponent("Button"),
      createMockComponent("Card"),
      createMockComponent("Modal"),
    ],
    projectName: "Test Project",
  };

  describe("header", () => {
    it("includes project name in header", () => {
      const result = generateContext(baseData);
      expect(result.content).toContain("Test Project Design System");
    });

    it("includes design system rules header", () => {
      const result = generateContext(baseData);
      expect(result.content).toContain("## Design System Rules");
    });
  });

  describe("component section", () => {
    it("includes component usage section", () => {
      const result = generateContext(baseData);
      expect(result.content).toContain("### Component Usage");
    });

    it("lists component names", () => {
      const result = generateContext(baseData);
      expect(result.content).toContain("Button");
      expect(result.content).toContain("Card");
      expect(result.content).toContain("Modal");
    });

    it("groups components by framework", () => {
      const data: ContextData = {
        ...baseData,
        components: [
          createMockComponent("Button", "react"),
          createMockComponent("VueButton", "vue"),
        ],
      };

      const result = generateContext(data);
      expect(result.content).toContain("React");
      expect(result.content).toContain("Vue");
    });

    it("excludes components when option is false", () => {
      const result = generateContext(baseData, { includeComponents: false });
      expect(result.content).not.toContain("### Component Usage");
    });
  });

  describe("token section", () => {
    it("includes token requirements section", () => {
      const result = generateContext(baseData);
      expect(result.content).toContain("### Token Requirements");
    });

    it("warns against hardcoding values", () => {
      const result = generateContext(baseData);
      expect(result.content).toContain("NEVER hardcode");
    });

    it("shows color tokens in quick reference", () => {
      const result = generateContext(baseData, { detailLevel: "standard" });
      expect(result.content).toContain("--color-primary");
      expect(result.content).toContain("#2563EB");
    });

    it("shows spacing tokens in quick reference", () => {
      const result = generateContext(baseData, { detailLevel: "standard" });
      expect(result.content).toContain("Spacing scale");
    });

    it("excludes tokens when option is false", () => {
      const result = generateContext(baseData, { includeTokens: false });
      expect(result.content).not.toContain("### Token Requirements");
    });

    it("shows all tokens in comprehensive mode", () => {
      const result = generateContext(baseData, {
        detailLevel: "comprehensive",
      });
      expect(result.content).toContain("**All Tokens:**");
      expect(result.content).toContain("| Token | Value | Category |");
    });
  });

  describe("anti-patterns section", () => {
    it("includes anti-patterns section", () => {
      const result = generateContext(baseData);
      expect(result.content).toContain("### Anti-Patterns");
    });

    it("includes common anti-patterns", () => {
      const result = generateContext(baseData);
      expect(result.content).toContain("AVOID:");
      expect(result.content).toContain("<div onClick>");
      expect(result.content).toContain("Inline styles");
    });

    it("includes drift-based anti-patterns", () => {
      const data: ContextData = {
        ...baseData,
        drifts: [
          createMockDrift("hardcoded-value", "Found hardcoded color #ff0000"),
        ],
      };

      const result = generateContext(data, { detailLevel: "standard" });
      expect(result.content).toContain("Detected issues");
      expect(result.content).toContain("Hardcoded color");
    });
  });

  describe("validation section", () => {
    it("includes validation section", () => {
      const result = generateContext(baseData);
      expect(result.content).toContain("### Validation");
    });

    it("shows buoy check command", () => {
      const result = generateContext(baseData);
      expect(result.content).toContain("buoy check");
    });

    it("shows buoy show drift command", () => {
      const result = generateContext(baseData);
      expect(result.content).toContain("buoy show drift");
    });

    it("excludes validation when option is false", () => {
      const result = generateContext(baseData, { includeValidation: false });
      expect(result.content).not.toContain("### Validation");
    });
  });

  describe("detail levels", () => {
    it("minimal level produces shorter output", () => {
      const minimal = generateContext(baseData, { detailLevel: "minimal" });
      const standard = generateContext(baseData, { detailLevel: "standard" });

      expect(minimal.content.length).toBeLessThan(standard.content.length);
    });

    it("comprehensive level produces longer output", () => {
      const standard = generateContext(baseData, { detailLevel: "standard" });
      const comprehensive = generateContext(baseData, {
        detailLevel: "comprehensive",
      });

      expect(comprehensive.content.length).toBeGreaterThan(
        standard.content.length,
      );
    });
  });

  describe("stats", () => {
    it("returns correct token count", () => {
      const result = generateContext(baseData);
      expect(result.stats.tokenCount).toBe(4);
    });

    it("returns correct component count", () => {
      const result = generateContext(baseData);
      expect(result.stats.componentCount).toBe(3);
    });

    it("returns anti-pattern count from drifts", () => {
      const data: ContextData = {
        ...baseData,
        drifts: [
          createMockDrift("hardcoded-value", "test"),
          createMockDrift("hardcoded-value", "test2"),
        ],
      };

      const result = generateContext(data);
      expect(result.stats.antiPatternCount).toBe(2);
    });
  });
});

describe("generateMinimalContext", () => {
  it("uses minimal detail level", () => {
    const data: ContextData = {
      tokens: [createColorToken("--color-primary", "#2563EB")],
      components: [createMockComponent("Button")],
      projectName: "Test",
    };

    const result = generateMinimalContext(data);
    // Minimal doesn't include quick reference
    expect(result).not.toContain("**Quick Reference:**");
  });
});

describe("generateComprehensiveContext", () => {
  it("uses comprehensive detail level", () => {
    const data: ContextData = {
      tokens: [createColorToken("--color-primary", "#2563EB")],
      components: [createMockComponent("Button")],
      projectName: "Test",
    };

    const result = generateComprehensiveContext(data);
    expect(result).toContain("**All Tokens:**");
  });
});
