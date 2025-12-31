// packages/core/src/analysis/semantic-diff.test.ts
import { describe, it, expect } from "vitest";
import { SemanticDiffEngine } from "./semantic-diff.js";
import type {
  Component,
  ComponentMetadata,
  DesignToken,
} from "../models/index.js";

describe("SemanticDiffEngine", () => {
  const engine = new SemanticDiffEngine();

  describe("checkFrameworkSprawl", () => {
    it("returns null for single framework", () => {
      const result = engine.checkFrameworkSprawl([
        { name: "react", version: "18.2.0" },
      ]);
      expect(result).toBeNull();
    });

    it("returns null for empty frameworks", () => {
      const result = engine.checkFrameworkSprawl([]);
      expect(result).toBeNull();
    });

    it("detects sprawl with two UI frameworks", () => {
      const result = engine.checkFrameworkSprawl([
        { name: "react", version: "18.2.0" },
        { name: "vue", version: "3.0.0" },
      ]);
      expect(result).not.toBeNull();
      expect(result?.type).toBe("framework-sprawl");
      expect(result?.severity).toBe("warning");
      expect(result?.message).toContain("2 UI frameworks");
    });

    it("ignores non-UI frameworks", () => {
      const result = engine.checkFrameworkSprawl([
        { name: "react", version: "18.2.0" },
        { name: "express", version: "4.0.0" },
      ]);
      expect(result).toBeNull();
    });

    it("detects sprawl with meta-frameworks", () => {
      const result = engine.checkFrameworkSprawl([
        { name: "nextjs", version: "14.0.0" },
        { name: "nuxt", version: "3.0.0" },
      ]);
      expect(result).not.toBeNull();
      expect(result?.message).toContain("nextjs");
      expect(result?.message).toContain("nuxt");
    });
  });

  describe("compareComponents", () => {
    it("matches components with exact names", () => {
      const source = [createMockComponent("Button", "react")];
      const target = [createMockComponent("Button", "figma")];

      const result = engine.compareComponents(source, target);

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]!.matchType).toBe("exact");
      expect(result.matches[0]!.confidence).toBe(1);
      expect(result.orphanedSource).toHaveLength(0);
      expect(result.orphanedTarget).toHaveLength(0);
    });

    it("identifies orphaned source components", () => {
      const source = [
        createMockComponent("Button", "react"),
        createMockComponent("Card", "react"),
      ];
      const target = [createMockComponent("Button", "figma")];

      const result = engine.compareComponents(source, target);

      expect(result.orphanedSource).toHaveLength(1);
      expect(result.orphanedSource[0]!.name).toBe("Card");
    });

    it("identifies orphaned target components", () => {
      const source = [createMockComponent("Button", "react")];
      const target = [
        createMockComponent("Button", "figma"),
        createMockComponent("Modal", "figma"),
      ];

      const result = engine.compareComponents(source, target);

      expect(result.orphanedTarget).toHaveLength(1);
      expect(result.orphanedTarget[0]!.name).toBe("Modal");
    });

    it("generates drift signals for orphaned components", () => {
      const source = [createMockComponent("UniqueComponent", "react")];
      const target: Component[] = [];

      const result = engine.compareComponents(source, target);

      expect(result.drifts).toHaveLength(1);
      expect(result.drifts[0]!.type).toBe("orphaned-component");
    });
  });

  describe("analyzeComponents", () => {
    describe("deprecated patterns", () => {
      it("detects deprecated components", () => {
        const components = [
          createMockComponentWithMetadata("OldButton", { deprecated: true }),
        ];

        const result = engine.analyzeComponents(components, {
          checkDeprecated: true,
        });

        expect(result.drifts).toHaveLength(1);
        expect(result.drifts[0]!.type).toBe("deprecated-pattern");
        expect(result.drifts[0]!.severity).toBe("warning");
      });

      it("includes deprecation reason in suggestions", () => {
        const components = [
          createMockComponentWithMetadata("OldButton", {
            deprecated: true,
            deprecationReason: "Use NewButton instead",
          }),
        ];

        const result = engine.analyzeComponents(components, {
          checkDeprecated: true,
        });

        expect(result.drifts[0]!.details.suggestions).toContain(
          "Use NewButton instead",
        );
      });
    });

    describe("hardcoded values", () => {
      it("detects hardcoded colors", () => {
        const components = [
          createMockComponentWithMetadata("Button", {
            hardcodedValues: [
              {
                type: "color",
                value: "#ff0000",
                property: "backgroundColor",
                location: "line 10",
              },
            ],
          }),
        ];

        const result = engine.analyzeComponents(components, {});

        const colorDrift = result.drifts.find(
          (d) => d.type === "hardcoded-value" && d.message.includes("color"),
        );
        expect(colorDrift).toBeDefined();
        expect(colorDrift?.severity).toBe("warning");
      });

      it("provides actionable token suggestions when tokens available", () => {
        const components = [
          createMockComponentWithMetadata("Button", {
            hardcodedValues: [
              {
                type: "color",
                value: "#ff0000",
                property: "backgroundColor",
                location: "line 10",
              },
              {
                type: "color",
                value: "#0066cc",
                property: "color",
                location: "line 15",
              },
            ],
          }),
        ];

        const availableTokens = [
          createMockToken("--color-danger", "#ff0000", "css"),
          createMockToken("--color-primary", "#0066cc", "css"),
          createMockToken("--color-secondary", "#666666", "css"),
        ];

        const result = engine.analyzeComponents(components, {
          availableTokens,
        });

        const colorDrift = result.drifts.find(
          (d) => d.type === "hardcoded-value" && d.message.includes("color"),
        );
        expect(colorDrift).toBeDefined();
        expect(colorDrift?.details.tokenSuggestions).toBeDefined();
        expect(colorDrift?.details.tokenSuggestions).toHaveLength(2);
        expect(colorDrift?.details.tokenSuggestions?.[0]).toContain(
          "--color-danger",
        );
        expect(colorDrift?.details.tokenSuggestions?.[1]).toContain(
          "--color-primary",
        );
      });
    });
  });

  describe("token suggestions", () => {
    it("finds exact color matches", () => {
      const tokens = [
        createMockToken("--color-red", "#ff0000", "css"),
        createMockToken("--color-blue", "#0000ff", "css"),
      ];

      const suggestions = engine.findColorTokenSuggestions("#ff0000", tokens);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]?.suggestedToken).toBe("--color-red");
      expect(suggestions[0]?.confidence).toBe(1);
    });

    it("finds similar color matches", () => {
      const tokens = [
        createMockToken("--color-red", "#ff0000", "css"),
        createMockToken("--color-red-dark", "#cc0000", "css"),
      ];

      const suggestions = engine.findColorTokenSuggestions("#ee0000", tokens);

      expect(suggestions.length).toBeGreaterThan(0);
      // Should suggest #ff0000 as closer match
      expect(suggestions[0]?.confidence).toBeGreaterThan(0.9);
    });

    it("normalizes hex color formats", () => {
      const tokens = [createMockToken("--color-red", "#ff0000", "css")];

      // Test shorthand hex
      const shorthand = engine.findColorTokenSuggestions("#f00", tokens);
      expect(shorthand).toHaveLength(1);
      expect(shorthand[0]?.confidence).toBe(1);

      // Test rgb()
      const rgb = engine.findColorTokenSuggestions("rgb(255, 0, 0)", tokens);
      expect(rgb).toHaveLength(1);
      expect(rgb[0]?.confidence).toBe(1);
    });

    it("finds spacing token matches", () => {
      const tokens: DesignToken[] = [
        {
          id: "spacing:small",
          name: "--spacing-small",
          value: { type: "spacing", value: 8, unit: "px" },
          category: "spacing",
          source: { type: "css", path: "tokens.css" },
          aliases: [],
          usedBy: [],
          metadata: {},
          scannedAt: new Date(),
        },
        {
          id: "spacing:medium",
          name: "--spacing-medium",
          value: { type: "spacing", value: 16, unit: "px" },
          category: "spacing",
          source: { type: "css", path: "tokens.css" },
          aliases: [],
          usedBy: [],
          metadata: {},
          scannedAt: new Date(),
        },
      ];

      const suggestions = engine.findSpacingTokenSuggestions("16px", tokens);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]?.suggestedToken).toBe("--spacing-medium");
      expect(suggestions[0]?.confidence).toBe(1);
    });
  });

  describe("compareTokens", () => {
    it("matches tokens with same names", () => {
      const source = [createMockToken("--primary-color", "#0066cc", "css")];
      const target = [createMockToken("--primary-color", "#0066cc", "figma")];

      const result = engine.compareTokens(source, target);

      expect(result.matches).toHaveLength(1);
      expect(result.drifts).toHaveLength(0);
    });

    it("detects value divergence", () => {
      const source = [createMockToken("--primary-color", "#0066cc", "css")];
      const target = [createMockToken("--primary-color", "#ff0000", "figma")];

      const result = engine.compareTokens(source, target);

      expect(result.matches).toHaveLength(1);
      expect(result.drifts).toHaveLength(1);
      expect(result.drifts[0]!.type).toBe("value-divergence");
    });

    it("identifies orphaned tokens", () => {
      const source = [
        createMockToken("--primary-color", "#0066cc", "css"),
        createMockToken("--secondary-color", "#666666", "css"),
      ];
      const target = [createMockToken("--primary-color", "#0066cc", "figma")];

      const result = engine.compareTokens(source, target);

      expect(result.orphanedSource).toHaveLength(1);
      expect(result.orphanedSource[0]!.name).toBe("--secondary-color");
    });
  });

  describe("performance", () => {
    it("handles large component sets efficiently", () => {
      // Create 500 source and 500 target components
      const sourceComponents: Component[] = [];
      const targetComponents: Component[] = [];

      for (let i = 0; i < 500; i++) {
        sourceComponents.push(createMockComponent(`Component${i}`, "react"));
        targetComponents.push(createMockComponent(`Component${i}`, "figma"));
      }

      // Add some unique components to test orphan detection
      for (let i = 500; i < 550; i++) {
        sourceComponents.push(createMockComponent(`UniqueSource${i}`, "react"));
        targetComponents.push(createMockComponent(`UniqueTarget${i}`, "figma"));
      }

      const startTime = performance.now();
      const result = engine.compareComponents(
        sourceComponents,
        targetComponents,
      );
      const endTime = performance.now();
      const duration = endTime - startTime;

      // Verify correctness
      expect(result.matches).toHaveLength(500);
      expect(result.orphanedSource).toHaveLength(50);
      expect(result.orphanedTarget).toHaveLength(50);

      // Performance assertion: should complete in under 500ms
      // With O(n²) this would take several seconds for 1000 components
      expect(duration).toBeLessThan(500);

      // Log performance for visibility
      console.log(
        `Performance: 550+550 components matched in ${duration.toFixed(2)}ms`,
      );
    });

    it("caches normalized names correctly", () => {
      // Create components with similar names to test caching
      const source = [
        createMockComponent("MyButton", "react"),
        createMockComponent("my-button", "react"),
        createMockComponent("my_button", "react"),
      ];
      const target = [createMockComponent("mybutton", "figma")];

      const result = engine.compareComponents(source, target);

      // All three should match the same target (first one wins)
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]!.source.name).toBe("MyButton");
    });
  });

  describe("duplicate detection", () => {
    it("does NOT flag compound components as duplicates (Button vs ButtonGroup)", () => {
      const components = [
        createMockComponent("Button", "react"),
        createMockComponent("ButtonGroup", "react"),
      ];

      // Analyze should not produce duplicate warnings for compound components
      const result = engine.analyzeComponents(components, {
        checkNaming: true,
      });

      // Filter for naming-inconsistency drift signals about potential duplicates
      const duplicateDrifts = result.drifts.filter(
        (d) =>
          d.type === "naming-inconsistency" &&
          d.message.toLowerCase().includes("duplicate"),
      );

      expect(duplicateDrifts).toHaveLength(0);
    });

    it("does NOT flag Card vs CardHeader/CardBody/CardFooter as duplicates", () => {
      const components = [
        createMockComponent("Card", "react"),
        createMockComponent("CardHeader", "react"),
        createMockComponent("CardBody", "react"),
        createMockComponent("CardFooter", "react"),
      ];

      const result = engine.analyzeComponents(components, {
        checkNaming: true,
      });

      const duplicateDrifts = result.drifts.filter(
        (d) =>
          d.type === "naming-inconsistency" &&
          d.message.toLowerCase().includes("duplicate"),
      );

      expect(duplicateDrifts).toHaveLength(0);
    });

    it("does NOT flag Modal vs ModalTrigger/ModalContent/ModalOverlay as duplicates", () => {
      const components = [
        createMockComponent("Modal", "react"),
        createMockComponent("ModalTrigger", "react"),
        createMockComponent("ModalContent", "react"),
        createMockComponent("ModalOverlay", "react"),
      ];

      const result = engine.analyzeComponents(components, {
        checkNaming: true,
      });

      const duplicateDrifts = result.drifts.filter(
        (d) =>
          d.type === "naming-inconsistency" &&
          d.message.toLowerCase().includes("duplicate"),
      );

      expect(duplicateDrifts).toHaveLength(0);
    });

    it("DOES flag version duplicates like Button vs ButtonNew", () => {
      const components = [
        createMockComponent("Button", "react"),
        createMockComponent("ButtonNew", "react"),
      ];

      const result = engine.analyzeComponents(components, {
        checkNaming: true,
      });

      const duplicateDrifts = result.drifts.filter(
        (d) =>
          d.type === "naming-inconsistency" &&
          d.message.toLowerCase().includes("duplicate"),
      );

      expect(duplicateDrifts.length).toBeGreaterThan(0);
    });

    it("DOES flag legacy duplicates like Card vs CardLegacy", () => {
      const components = [
        createMockComponent("Card", "react"),
        createMockComponent("CardLegacy", "react"),
      ];

      const result = engine.analyzeComponents(components, {
        checkNaming: true,
      });

      const duplicateDrifts = result.drifts.filter(
        (d) =>
          d.type === "naming-inconsistency" &&
          d.message.toLowerCase().includes("duplicate"),
      );

      expect(duplicateDrifts.length).toBeGreaterThan(0);
    });

    it("DOES flag versioned duplicates like Input vs InputV2", () => {
      const components = [
        createMockComponent("Input", "react"),
        createMockComponent("InputV2", "react"),
      ];

      const result = engine.analyzeComponents(components, {
        checkNaming: true,
      });

      const duplicateDrifts = result.drifts.filter(
        (d) =>
          d.type === "naming-inconsistency" &&
          d.message.toLowerCase().includes("duplicate"),
      );

      expect(duplicateDrifts.length).toBeGreaterThan(0);
    });

    it("does NOT flag unrelated components with similar prefixes", () => {
      const components = [
        createMockComponent("Tab", "react"),
        createMockComponent("Table", "react"),
        createMockComponent("Tabs", "react"),
      ];

      const result = engine.analyzeComponents(components, {
        checkNaming: true,
      });

      const duplicateDrifts = result.drifts.filter(
        (d) =>
          d.type === "naming-inconsistency" &&
          d.message.toLowerCase().includes("duplicate"),
      );

      expect(duplicateDrifts).toHaveLength(0);
    });
  });
});

// Helper functions

function createMockComponent(name: string, type: "react" | "figma"): Component {
  const source =
    type === "react"
      ? { type: "react" as const, path: `src/${name}.tsx`, exportName: name }
      : { type: "figma" as const, fileKey: "abc", nodeId: "1:1" };

  return {
    id: `${type}:${name}`,
    name,
    source,
    props: [],
    variants: [],
    tokens: [],
    dependencies: [],
    metadata: {},
    scannedAt: new Date(),
  };
}

function createMockComponentWithMetadata(
  name: string,
  metadata: Partial<ComponentMetadata>,
): Component {
  return {
    ...createMockComponent(name, "react"),
    metadata,
  };
}

function createMockToken(
  name: string,
  hexValue: string,
  type: "css" | "figma",
): DesignToken {
  const source =
    type === "css"
      ? { type: "css" as const, path: "tokens.css" }
      : { type: "figma" as const, fileKey: "abc" };

  return {
    id: `${type}:${name}`,
    name,
    value: { type: "color" as const, hex: hexValue },
    category: "color",
    source,
    aliases: [],
    usedBy: [],
    metadata: {},
    scannedAt: new Date(),
  };
}
