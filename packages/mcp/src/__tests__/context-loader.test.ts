import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fs module
vi.mock("fs", () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

import { readFileSync, existsSync } from "fs";
import {
  loadDesignSystemContext,
  getTokensByCategory,
  findComponent,
  searchComponents,
} from "../context-loader.js";

describe("Context Loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(false);
  });

  describe("loadDesignSystemContext", () => {
    it("loads project name from package.json", async () => {
      vi.mocked(existsSync).mockImplementation((path) =>
        String(path).includes("package.json"),
      );
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({ name: "my-design-system" }),
      );

      const context = await loadDesignSystemContext("/project");

      expect(context.projectName).toBe("my-design-system");
    });

    it('defaults to "Design System" when no package.json', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const context = await loadDesignSystemContext("/project");

      expect(context.projectName).toBe("Design System");
    });

    it("includes lastUpdated timestamp", async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const context = await loadDesignSystemContext("/project");

      expect(context.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("loads tokens from design-tokens.json", async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const p = String(path);
        return p.includes("package.json") || p.includes("design-tokens.json");
      });
      vi.mocked(readFileSync).mockImplementation((path) => {
        const p = String(path);
        if (p.includes("package.json")) {
          return JSON.stringify({ name: "test" });
        }
        if (p.includes("design-tokens.json")) {
          return JSON.stringify({
            tokens: {
              color: {
                primary: {
                  $value: "#2563EB",
                  $usage: "Primary actions",
                },
              },
            },
          });
        }
        return "";
      });

      const context = await loadDesignSystemContext("/project");

      expect(context.tokens).toHaveLength(1);
      expect(context.tokens[0]!.name).toBe("primary");
      expect(context.tokens[0]!.value).toBe("#2563EB");
    });

    it("loads tokens from ai-context format", async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        const p = String(path);
        return (
          p.includes("package.json") || p.includes("tokens-ai-context.json")
        );
      });
      vi.mocked(readFileSync).mockImplementation((path) => {
        const p = String(path);
        if (p.includes("package.json")) {
          return JSON.stringify({ name: "test" });
        }
        if (p.includes("tokens-ai-context.json")) {
          return JSON.stringify({
            tokens: {
              color: {
                "color-primary": {
                  $value: "#2563EB",
                  $intent: { hierarchy: "primary-action" },
                  $usage: "Primary CTAs",
                  $avoid: "Decorative use",
                },
              },
              spacing: {
                "space-4": {
                  $value: "16px",
                  $intent: { relationship: "related-elements" },
                },
              },
            },
          });
        }
        return "";
      });

      const context = await loadDesignSystemContext("/project");

      expect(context.tokens).toHaveLength(2);

      const colorToken = context.tokens.find((t) => t.name === "color-primary");
      expect(colorToken?.intent?.hierarchy).toBe("primary-action");
      expect(colorToken?.usage).toBe("Primary CTAs");
      expect(colorToken?.avoid).toBe("Decorative use");
    });

    it("includes anti-patterns", async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const context = await loadDesignSystemContext("/project");

      expect(context.antiPatterns.length).toBeGreaterThan(0);
      expect(context.antiPatterns[0]).toHaveProperty("name");
      expect(context.antiPatterns[0]).toHaveProperty("avoid");
      expect(context.antiPatterns[0]).toHaveProperty("instead");
    });
  });

  describe("getTokensByCategory", () => {
    it("filters tokens by category", () => {
      const context = {
        tokens: [
          { name: "primary", value: "#2563EB", category: "color" as const },
          { name: "secondary", value: "#64748B", category: "color" as const },
          { name: "space-4", value: "16px", category: "spacing" as const },
        ],
        components: [],
        patterns: [],
        antiPatterns: [],
        projectName: "Test",
        lastUpdated: new Date().toISOString(),
      };

      const colors = getTokensByCategory(context, "color");
      const spacing = getTokensByCategory(context, "spacing");

      expect(colors).toHaveLength(2);
      expect(spacing).toHaveLength(1);
    });

    it("returns empty array for unknown category", () => {
      const context = {
        tokens: [
          { name: "primary", value: "#2563EB", category: "color" as const },
        ],
        components: [],
        patterns: [],
        antiPatterns: [],
        projectName: "Test",
        lastUpdated: new Date().toISOString(),
      };

      const result = getTokensByCategory(context, "shadow");

      expect(result).toHaveLength(0);
    });
  });

  describe("findComponent", () => {
    const context = {
      tokens: [],
      components: [
        {
          name: "Button",
          framework: "react",
          props: ["variant", "size"],
          path: "",
        },
        { name: "Card", framework: "react", props: ["title"], path: "" },
        {
          name: "Input",
          framework: "react",
          props: ["type", "placeholder"],
          path: "",
        },
      ],
      patterns: [],
      antiPatterns: [],
      projectName: "Test",
      lastUpdated: new Date().toISOString(),
    };

    it("finds component by exact name", () => {
      const result = findComponent(context, "Button");
      expect(result?.name).toBe("Button");
    });

    it("finds component case-insensitively", () => {
      const result = findComponent(context, "button");
      expect(result?.name).toBe("Button");
    });

    it("returns undefined for unknown component", () => {
      const result = findComponent(context, "Unknown");
      expect(result).toBeUndefined();
    });
  });

  describe("searchComponents", () => {
    const context = {
      tokens: [],
      components: [
        {
          name: "Button",
          framework: "react",
          props: ["variant", "size"],
          description: "Clickable button",
          path: "",
        },
        {
          name: "IconButton",
          framework: "react",
          props: ["icon"],
          description: "Button with icon",
          path: "",
        },
        {
          name: "Card",
          framework: "react",
          props: ["title"],
          description: "Content container",
          path: "",
        },
        {
          name: "Input",
          framework: "react",
          props: ["type"],
          description: "Form input field",
          path: "",
        },
      ],
      patterns: [],
      antiPatterns: [],
      projectName: "Test",
      lastUpdated: new Date().toISOString(),
    };

    it("searches by name", () => {
      const result = searchComponents(context, "button");
      expect(result).toHaveLength(2);
      expect(result.map((c) => c.name)).toContain("Button");
      expect(result.map((c) => c.name)).toContain("IconButton");
    });

    it("searches by description", () => {
      const result = searchComponents(context, "container");
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe("Card");
    });

    it("searches by props", () => {
      const result = searchComponents(context, "variant");
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe("Button");
    });

    it("returns empty array for no matches", () => {
      const result = searchComponents(context, "nonexistent");
      expect(result).toHaveLength(0);
    });
  });
});
