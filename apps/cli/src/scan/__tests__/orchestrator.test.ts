// apps/cli/src/scan/__tests__/orchestrator.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ScanOrchestrator } from "../orchestrator.js";
import type { BuoyConfig } from "../../config/schema.js";

// Use vi.hoisted to create mocks that can be referenced in vi.mock
const { mockScanners, mockState } = vi.hoisted(() => {
  const state = {
    react: { items: [{ id: "comp:react:Button", name: "Button", source: { type: "react", path: "src/Button.tsx" } }], errors: [] as unknown[], reject: null as Error | null },
    vue: { items: [{ id: "comp:vue:Card", name: "Card", source: { type: "vue", path: "src/Card.vue" } }], errors: [] as unknown[], reject: null as Error | null },
    svelte: { items: [] as unknown[], errors: [] as unknown[], reject: null as Error | null },
    angular: { items: [] as unknown[], errors: [] as unknown[], reject: null as Error | null },
    webcomponent: { items: [] as unknown[], errors: [] as unknown[], reject: null as Error | null },
    template: { items: [] as unknown[], errors: [] as unknown[], reject: null as Error | null },
    token: { items: [{ id: "token:primary", name: "primary", value: { type: "color", hex: "#ff6b6b" } }], errors: [] as unknown[], reject: null as Error | null },
  };

  const createScanner = (key: keyof typeof state) => {
    return class MockScanner {
      scan() {
        const s = state[key];
        if (s.reject) {
          return Promise.reject(s.reject);
        }
        return Promise.resolve({ items: s.items, errors: s.errors });
      }
    };
  };

  return {
    mockState: state,
    mockScanners: {
      ReactComponentScanner: createScanner("react"),
      VueComponentScanner: createScanner("vue"),
      SvelteComponentScanner: createScanner("svelte"),
      AngularComponentScanner: createScanner("angular"),
      WebComponentScanner: createScanner("webcomponent"),
      TemplateScanner: createScanner("template"),
      TokenScanner: createScanner("token"),
    },
  };
});

// Mock the @buoy-design/scanners/git module
vi.mock("@buoy-design/scanners/git", () => mockScanners);

describe("ScanOrchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset all mock state to defaults
    mockState.react.reject = null;
    mockState.vue.reject = null;
    mockState.svelte.reject = null;
    mockState.angular.reject = null;
    mockState.webcomponent.reject = null;
    mockState.template.reject = null;
    mockState.token.reject = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createConfig = (
    overrides: Partial<BuoyConfig> = {},
  ): BuoyConfig => ({
    project: { name: "test-project" },
    sources: {},
    drift: { ignore: [], severity: {} },
    claude: { enabled: false, model: "claude-sonnet-4-20250514" },
    output: { format: "table", colors: true },
    ...overrides,
  });

  describe("getEnabledSources", () => {
    it("returns empty array when no sources enabled", () => {
      const config = createConfig();
      const orchestrator = new ScanOrchestrator(config);

      const sources = orchestrator.getEnabledSources();

      expect(sources).toEqual([]);
    });

    it("includes react when enabled", () => {
      const config = createConfig({
        sources: {
          react: {
            enabled: true,
            include: ["src/**/*.tsx"],
            exclude: [],
          },
        },
      });
      const orchestrator = new ScanOrchestrator(config);

      const sources = orchestrator.getEnabledSources();

      expect(sources).toContain("react");
    });

    it("includes vue when enabled", () => {
      const config = createConfig({
        sources: {
          vue: {
            enabled: true,
            include: ["src/**/*.vue"],
            exclude: [],
          },
        },
      });
      const orchestrator = new ScanOrchestrator(config);

      const sources = orchestrator.getEnabledSources();

      expect(sources).toContain("vue");
    });

    it("includes svelte when enabled", () => {
      const config = createConfig({
        sources: {
          svelte: {
            enabled: true,
            include: ["src/**/*.svelte"],
            exclude: [],
          },
        },
      });
      const orchestrator = new ScanOrchestrator(config);

      const sources = orchestrator.getEnabledSources();

      expect(sources).toContain("svelte");
    });

    it("includes angular when enabled", () => {
      const config = createConfig({
        sources: {
          angular: {
            enabled: true,
            include: ["src/**/*.component.ts"],
            exclude: [],
          },
        },
      });
      const orchestrator = new ScanOrchestrator(config);

      const sources = orchestrator.getEnabledSources();

      expect(sources).toContain("angular");
    });

    it("includes webcomponent when enabled", () => {
      const config = createConfig({
        sources: {
          webcomponent: {
            enabled: true,
            include: ["src/**/*.ts"],
            exclude: [],
            framework: "auto",
          },
        },
      });
      const orchestrator = new ScanOrchestrator(config);

      const sources = orchestrator.getEnabledSources();

      expect(sources).toContain("webcomponent");
    });

    it("includes templates when enabled", () => {
      const config = createConfig({
        sources: {
          templates: {
            enabled: true,
            include: ["views/**/*.blade.php"],
            exclude: [],
            type: "blade",
          },
        },
      });
      const orchestrator = new ScanOrchestrator(config);

      const sources = orchestrator.getEnabledSources();

      expect(sources).toContain("templates");
    });

    it("includes tokens when enabled", () => {
      const config = createConfig({
        sources: {
          tokens: {
            enabled: true,
            files: ["tokens.css"],
          },
        },
      });
      const orchestrator = new ScanOrchestrator(config);

      const sources = orchestrator.getEnabledSources();

      expect(sources).toContain("tokens");
    });

    it("includes figma when enabled", () => {
      const config = createConfig({
        sources: {
          figma: {
            enabled: true,
            fileKeys: ["abc123"],
            componentPageName: "Components",
            tokenPageName: "Design Tokens",
          },
        },
      });
      const orchestrator = new ScanOrchestrator(config);

      const sources = orchestrator.getEnabledSources();

      expect(sources).toContain("figma");
    });

    it("includes storybook when enabled", () => {
      const config = createConfig({
        sources: {
          storybook: {
            enabled: true,
            url: "http://localhost:6006",
          },
        },
      });
      const orchestrator = new ScanOrchestrator(config);

      const sources = orchestrator.getEnabledSources();

      expect(sources).toContain("storybook");
    });

    it("returns multiple enabled sources", () => {
      const config = createConfig({
        sources: {
          react: {
            enabled: true,
            include: ["src/**/*.tsx"],
            exclude: [],
          },
          tokens: {
            enabled: true,
            files: ["tokens.css"],
          },
        },
      });
      const orchestrator = new ScanOrchestrator(config);

      const sources = orchestrator.getEnabledSources();

      expect(sources).toContain("react");
      expect(sources).toContain("tokens");
    });

    it("excludes disabled sources", () => {
      const config = createConfig({
        sources: {
          react: {
            enabled: false,
            include: ["src/**/*.tsx"],
            exclude: [],
          },
          vue: {
            enabled: true,
            include: ["src/**/*.vue"],
            exclude: [],
          },
        },
      });
      const orchestrator = new ScanOrchestrator(config);

      const sources = orchestrator.getEnabledSources();

      expect(sources).not.toContain("react");
      expect(sources).toContain("vue");
    });
  });

  describe("scan", () => {
    it("returns empty result when no sources enabled", async () => {
      const config = createConfig();
      const orchestrator = new ScanOrchestrator(config);

      const result = await orchestrator.scan();

      expect(result.components).toEqual([]);
      expect(result.tokens).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it("scans react components", async () => {
      const config = createConfig({
        sources: {
          react: {
            enabled: true,
            include: ["src/**/*.tsx"],
            exclude: [],
          },
        },
      });
      const orchestrator = new ScanOrchestrator(config);

      const result = await orchestrator.scan();

      expect(result.components).toHaveLength(1);
      expect(result.components[0]!.name).toBe("Button");
    });

    it("scans tokens", async () => {
      const config = createConfig({
        sources: {
          tokens: {
            enabled: true,
            files: ["tokens.css"],
          },
        },
      });
      const orchestrator = new ScanOrchestrator(config);

      const result = await orchestrator.scan();

      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]!.name).toBe("primary");
    });

    it("scans multiple sources and combines results", async () => {
      const config = createConfig({
        sources: {
          react: {
            enabled: true,
            include: ["src/**/*.tsx"],
            exclude: [],
          },
          vue: {
            enabled: true,
            include: ["src/**/*.vue"],
            exclude: [],
          },
          tokens: {
            enabled: true,
            files: ["tokens.css"],
          },
        },
      });
      const orchestrator = new ScanOrchestrator(config);

      const result = await orchestrator.scan();

      expect(result.components).toHaveLength(2); // Button + Card
      expect(result.tokens).toHaveLength(1);
    });

    it("respects specific sources option", async () => {
      const config = createConfig({
        sources: {
          react: {
            enabled: true,
            include: ["src/**/*.tsx"],
            exclude: [],
          },
          vue: {
            enabled: true,
            include: ["src/**/*.vue"],
            exclude: [],
          },
        },
      });
      const orchestrator = new ScanOrchestrator(config);

      const result = await orchestrator.scan({ sources: ["react"] });

      expect(result.components).toHaveLength(1);
      expect(result.components[0]!.name).toBe("Button");
    });

    it("calls onProgress callback", async () => {
      const config = createConfig({
        sources: {
          react: {
            enabled: true,
            include: ["src/**/*.tsx"],
            exclude: [],
          },
        },
      });
      const orchestrator = new ScanOrchestrator(config);
      const onProgress = vi.fn();

      await orchestrator.scan({ onProgress });

      expect(onProgress).toHaveBeenCalledWith("Scanning react...");
    });

    it("catches scanner errors and adds to errors array", async () => {
      // Configure the mock to reject
      mockState.react.reject = new Error("Scanner failed");

      const config = createConfig({
        sources: {
          react: {
            enabled: true,
            include: ["src/**/*.tsx"],
            exclude: [],
          },
        },
      });
      const orchestrator = new ScanOrchestrator(config);

      const result = await orchestrator.scan();

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.source).toBe("react");
      expect(result.errors[0]!.message).toBe("Scanner failed");
    });
  });

  describe("scanComponents", () => {
    it("excludes token sources", async () => {
      const config = createConfig({
        sources: {
          react: {
            enabled: true,
            include: ["src/**/*.tsx"],
            exclude: [],
          },
          tokens: {
            enabled: true,
            files: ["tokens.css"],
          },
        },
      });
      const orchestrator = new ScanOrchestrator(config);

      const result = await orchestrator.scanComponents();

      expect(result.components).toHaveLength(1);
      // Should not call token scanner, so checking if any components returned
    });

    it("respects specific sources but filters out tokens", async () => {
      const config = createConfig({
        sources: {
          react: {
            enabled: true,
            include: ["src/**/*.tsx"],
            exclude: [],
          },
          tokens: {
            enabled: true,
            files: ["tokens.css"],
          },
        },
      });
      const orchestrator = new ScanOrchestrator(config);

      const result = await orchestrator.scanComponents({
        sources: ["react", "tokens"],
      });

      // tokens should be filtered out
      expect(result.components).toHaveLength(1);
    });
  });

  describe("scanTokens", () => {
    it("scans only token sources", async () => {
      const config = createConfig({
        sources: {
          react: {
            enabled: true,
            include: ["src/**/*.tsx"],
            exclude: [],
          },
          tokens: {
            enabled: true,
            files: ["tokens.css"],
          },
        },
      });
      const orchestrator = new ScanOrchestrator(config);

      const result = await orchestrator.scanTokens();

      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]!.name).toBe("primary");
    });
  });
});
