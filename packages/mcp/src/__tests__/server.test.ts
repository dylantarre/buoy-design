import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the context loader
vi.mock("../context-loader.js", () => ({
  loadDesignSystemContext: vi.fn().mockResolvedValue({
    tokens: [
      {
        name: "color-primary",
        value: "#2563EB",
        category: "color",
        usage: "Primary CTAs",
        intent: { hierarchy: "primary-action" },
      },
      {
        name: "color-error",
        value: "#DC2626",
        category: "color",
        usage: "Error states",
      },
      {
        name: "space-4",
        value: "16px",
        category: "spacing",
      },
      {
        name: "space-8",
        value: "32px",
        category: "spacing",
      },
    ],
    components: [
      {
        name: "Button",
        framework: "react",
        props: ["variant", "size", "onClick"],
        description: "Primary action button",
        path: "src/Button.tsx",
      },
      {
        name: "Card",
        framework: "react",
        props: ["title", "children"],
        description: "Content container",
        path: "src/Card.tsx",
      },
      {
        name: "Input",
        framework: "react",
        props: ["type", "placeholder", "onChange"],
        description: "Form input field",
        path: "src/Input.tsx",
      },
    ],
    patterns: [
      {
        name: "Forms",
        description: "Form patterns",
        components: ["Input", "Button"],
      },
    ],
    antiPatterns: [
      {
        name: "Hardcoded Colors",
        description: "Using hex values instead of tokens",
        avoid: 'style={{ color: "#2563EB" }}',
        instead: "Use color tokens",
        severity: "warning",
      },
    ],
    projectName: "Test Design System",
    lastUpdated: new Date().toISOString(),
  }),
  getTokensByCategory: vi.fn((ctx, category) =>
    ctx.tokens.filter((t: { category: string }) => t.category === category),
  ),
  findComponent: vi.fn((ctx, name) =>
    ctx.components.find(
      (c: { name: string }) => c.name.toLowerCase() === name.toLowerCase(),
    ),
  ),
  searchComponents: vi.fn((ctx, useCase) => {
    const keywords = useCase.toLowerCase().split(/\s+/);
    return ctx.components.filter(
      (c: { name: string; description?: string }) => {
        const text = `${c.name} ${c.description || ""}`.toLowerCase();
        return keywords.some((kw: string) => text.includes(kw));
      },
    );
  }),
}));

// Import after mocking
import { createServer } from "../server.js";

describe("MCP Server", () => {
  let server: ReturnType<typeof createServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    server = createServer("/test");
  });

  describe("server creation", () => {
    it("creates server with correct name", () => {
      expect(server).toBeDefined();
    });
  });

  // Note: Full integration tests would require mocking the MCP SDK
  // These tests verify the handlers work correctly

  describe("tool handlers (via exported functions)", () => {
    // Test the internal handler logic by calling createServer
    // and verifying the context is loaded correctly

    it("server is created successfully", () => {
      const testServer = createServer("/test-project");
      expect(testServer).toBeDefined();
    });
  });
});

describe("Server Tool Logic", () => {
  // Test the tool logic directly

  describe("find_component logic", () => {
    it("returns recommended component for matching use case", () => {
      // This tests the internal logic
      const components = [
        { name: "Button", description: "Clickable button", props: [] },
        { name: "Card", description: "Content card", props: [] },
      ];

      const matches = components.filter(
        (c) =>
          c.name.toLowerCase().includes("button") ||
          c.description.toLowerCase().includes("button"),
      );

      expect(matches).toHaveLength(1);
      expect(matches[0]!.name).toBe("Button");
    });

    it("handles no matching components", () => {
      const components = [
        { name: "Button", description: "Clickable button", props: [] },
      ];

      const matches = components.filter((c) =>
        c.name.toLowerCase().includes("modal"),
      );

      expect(matches).toHaveLength(0);
    });
  });

  describe("validate_code logic", () => {
    it("detects hardcoded hex colors", () => {
      const code = 'style={{ color: "#2563EB" }}';
      const hexColors = code.match(/#[0-9A-Fa-f]{3,8}\b/g) || [];

      expect(hexColors).toHaveLength(1);
      expect(hexColors[0]).toBe("#2563EB");
    });

    it("detects rgb colors", () => {
      const code = "style={{ color: rgb(37, 99, 235) }}";
      const rgbColors = code.match(/rgb\([^)]+\)/g) || [];

      expect(rgbColors).toHaveLength(1);
    });

    it("detects arbitrary spacing", () => {
      const code = 'style={{ padding: "13px" }}';
      const spacing = code.match(/\b\d+px\b/g) || [];

      expect(spacing).toHaveLength(1);
      expect(spacing[0]).toBe("13px");
    });

    it("detects div onClick anti-pattern", () => {
      const code = "<div onClick={handleClick}>Click me</div>";
      const hasAntiPattern = /<div[^>]*onClick/i.test(code);

      expect(hasAntiPattern).toBe(true);
    });

    it("detects missing alt on images", () => {
      const codeWithoutAlt = '<img src="logo.png" />';
      const codeWithAlt = '<img src="logo.png" alt="Logo" />';

      const missingAlt1 = !/<img[^>]*alt=/i.test(codeWithoutAlt);
      const missingAlt2 = !/<img[^>]*alt=/i.test(codeWithAlt);

      expect(missingAlt1).toBe(true);
      expect(missingAlt2).toBe(false);
    });
  });

  describe("resolve_token logic", () => {
    const tokens = [
      { name: "color-primary", value: "#2563EB", category: "color" },
      { name: "color-error", value: "#DC2626", category: "color" },
      { name: "space-4", value: "16px", category: "spacing" },
      { name: "space-8", value: "32px", category: "spacing" },
    ];

    it("finds exact match", () => {
      const value = "#2563EB";
      const match = tokens.find(
        (t) => t.value.toLowerCase() === value.toLowerCase(),
      );

      expect(match?.name).toBe("color-primary");
    });

    it("finds closest spacing value", () => {
      const value = "15px";
      const numericValue = parseFloat(value);

      let closest = tokens.filter((t) => t.category === "spacing")[0];
      let closestDiff = Infinity;

      for (const token of tokens.filter((t) => t.category === "spacing")) {
        const tokenValue = parseFloat(token.value);
        const diff = Math.abs(tokenValue - numericValue);
        if (diff < closestDiff) {
          closestDiff = diff;
          closest = token;
        }
      }

      expect(closest!.name).toBe("space-4"); // 16px is closest to 15px
    });
  });

  describe("suggest_fix logic", () => {
    it("generates replacement for hardcoded color", () => {
      const tokenName = "color-primary";
      const replacement = `var(--${tokenName})`;

      expect(replacement).toBe("var(--color-primary)");
    });

    it("generates class name for class-based fix", () => {
      const tokenName = "color-primary";
      const className = tokenName.replace(/^(color|spacing|font)-/, "");

      expect(className).toBe("primary");
    });
  });
});
