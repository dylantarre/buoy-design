// apps/cli/src/commands/__tests__/scan.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import type { BuoyConfig } from "../../config/schema.js";
import type { Component, DesignToken } from "@buoy-design/core";

// Mock modules before importing the command
vi.mock("../../config/loader.js", () => ({
  loadConfig: vi.fn(),
  getConfigPath: vi.fn(),
}));

vi.mock("../../config/auto-detect.js", () => ({
  buildAutoConfig: vi.fn(),
}));

vi.mock("@buoy-design/scanners/git", () => ({
  ReactComponentScanner: vi.fn(),
  VueComponentScanner: vi.fn(),
  SvelteComponentScanner: vi.fn(),
  AngularComponentScanner: vi.fn(),
  WebComponentScanner: vi.fn(),
  TemplateScanner: vi.fn(),
  TokenScanner: vi.fn(),
}));

vi.mock("@buoy-design/scanners", () => ({
  ScanCache: vi.fn().mockImplementation(() => ({
    load: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn(),
    checkFiles: vi
      .fn()
      .mockResolvedValue({
        filesToScan: [],
        cachedFiles: [],
        cachedEntries: [],
      }),
    storeResult: vi.fn().mockResolvedValue(undefined),
    getCachedResult: vi.fn().mockReturnValue(null),
    getStats: vi.fn().mockReturnValue({ entryCount: 0, totalSize: 0 }),
  })),
}));

vi.mock("../../output/reporters.js", () => ({
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    text: "",
  })),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  header: vi.fn(),
  keyValue: vi.fn(),
  newline: vi.fn(),
  setJsonMode: vi.fn(),
}));

vi.mock("../../output/formatters.js", () => ({
  formatComponentTable: vi.fn(() => "Component Table"),
  formatTokenTable: vi.fn(() => "Token Table"),
}));

vi.mock("../../store/index.js", () => ({
  createStore: vi.fn(() => ({
    getOrCreateProject: vi
      .fn()
      .mockResolvedValue({ id: "test-project-id", name: "test-project" }),
    startScan: vi
      .fn()
      .mockResolvedValue({ id: "test-scan-id", status: "running" }),
    completeScan: vi.fn().mockResolvedValue(undefined),
    failScan: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  })),
  getProjectName: vi.fn(() => "test-project"),
  wouldUseCloud: vi.fn(() => false),
}));

vi.mock("../../insights/index.js", () => ({
  discoverProject: vi.fn().mockResolvedValue({
    frameworks: [],
    hasPackageJson: true,
    hasTsConfig: false,
    tokenFiles: [],
    componentPaths: [],
    suggestions: [],
  }),
  formatInsightsBlock: vi.fn(() => "Insights block"),
  promptNextAction: vi.fn().mockResolvedValue(null),
  isTTY: vi.fn(() => false),
}));

// Import after mocks are set up
import { createScanCommand } from "../scan.js";
import { loadConfig, getConfigPath } from "../../config/loader.js";
import { buildAutoConfig } from "../../config/auto-detect.js";
import * as scanners from "@buoy-design/scanners/git";
import * as reporters from "../../output/reporters.js";
import * as formatters from "../../output/formatters.js";

// Type the mocked functions
const mockLoadConfig = vi.mocked(loadConfig);
const mockGetConfigPath = vi.mocked(getConfigPath);
const mockBuildAutoConfig = vi.mocked(buildAutoConfig);

// Helper to create a test program
function createTestProgram(): Command {
  const program = new Command();
  program.exitOverride(); // Prevent process.exit
  program.configureOutput({
    writeErr: () => {}, // Suppress error output
    writeOut: () => {}, // Suppress output
  });
  program.addCommand(createScanCommand());
  return program;
}

// Helper to create mock config
function createMockConfig(overrides: Partial<BuoyConfig> = {}): BuoyConfig {
  return {
    project: { name: "test-project" },
    sources: {},
    drift: { ignore: [], severity: {} },
    claude: { enabled: false, model: "claude-sonnet-4-20250514" },
    output: { format: "table", colors: true },
    ...overrides,
  };
}

// Helper to create mock component
function createMockComponent(name: string): Component {
  return {
    id: `comp-${name}`,
    name,
    source: {
      type: "react",
      path: `src/${name}.tsx`,
      exportName: name,
      line: 1,
    },
    props: [{ name: "onClick", type: "() => void", required: false }],
    variants: [],
    tokens: [],
    dependencies: [],
    metadata: { tags: [] },
    scannedAt: new Date(),
  };
}

// Helper to create mock token
function createMockToken(name: string): DesignToken {
  return {
    id: `token-${name}`,
    name,
    category: "color",
    value: { type: "color", hex: "#3b82f6", r: 59, g: 130, b: 246, a: 1 },
    source: { type: "css", path: "tokens.css", line: 1 },
    metadata: {},
    scannedAt: new Date(),
  };
}

describe("scan command", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let originalCwd: () => string;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    originalCwd = process.cwd;
    process.cwd = vi.fn().mockReturnValue("/test/project");

    // Default: assume config file exists (getConfigPath returns path)
    mockGetConfigPath.mockReturnValue("/test/buoy.config.js");

    // Default auto-config mock (used when no config file exists)
    mockBuildAutoConfig.mockResolvedValue({
      config: createMockConfig({ sources: {} }),
      detected: [],
      tokenFiles: [],
      monorepo: null,
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    process.cwd = originalCwd;
  });

  describe("argument parsing", () => {
    it("creates scan command with correct options", () => {
      const cmd = createScanCommand();

      expect(cmd.name()).toBe("sweep");
      expect(cmd.description()).toBe(
        "Sweep your codebase for components and tokens",
      );

      const options = cmd.options;
      const optionNames = options.map((o) => o.long?.replace("--", ""));

      expect(optionNames).toContain("source");
      expect(optionNames).toContain("json");
      expect(optionNames).toContain("verbose");
    });

    it("parses --source option with single source", async () => {
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ["src/**/*.tsx"], exclude: [] },
          },
        }),
        configPath: "/test/buoy.config.js",
      });

      const mockReactScanner = {
        scan: vi.fn().mockResolvedValue({
          items: [createMockComponent("Button")],
          errors: [],
          stats: { filesScanned: 1, itemsFound: 1, duration: 100 },
        }),
      };

      (
        scanners.ReactComponentScanner as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockReactScanner);

      const program = createTestProgram();
      await program.parseAsync(["node", "test", "scan", "-s", "react"]);

      expect(mockReactScanner.scan).toHaveBeenCalled();
    });

    it("parses --source option with multiple sources", async () => {
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ["src/**/*.tsx"], exclude: [] },
            tokens: { enabled: true, files: ["tokens.css"] },
          },
        }),
        configPath: "/test/buoy.config.js",
      });

      const mockReactScanner = {
        scan: vi.fn().mockResolvedValue({
          items: [createMockComponent("Button")],
          errors: [],
          stats: { filesScanned: 1, itemsFound: 1, duration: 100 },
        }),
      };

      const mockTokenScanner = {
        scan: vi.fn().mockResolvedValue({
          items: [createMockToken("primary")],
          errors: [],
          stats: { filesScanned: 1, itemsFound: 1, duration: 50 },
        }),
      };

      (
        scanners.ReactComponentScanner as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockReactScanner);
      (
        scanners.TokenScanner as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockTokenScanner);

      const program = createTestProgram();
      await program.parseAsync([
        "node",
        "test",
        "scan",
        "-s",
        "react",
        "-s",
        "tokens",
      ]);

      expect(mockReactScanner.scan).toHaveBeenCalled();
      expect(mockTokenScanner.scan).toHaveBeenCalled();
    });
  });

  describe("source auto-detection", () => {
    it("scans enabled sources from config when no --source specified", async () => {
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ["src/**/*.tsx"], exclude: [] },
            vue: { enabled: true, include: ["src/**/*.vue"], exclude: [] },
          },
        }),
        configPath: "/test/buoy.config.js",
      });

      const mockReactScanner = {
        scan: vi.fn().mockResolvedValue({
          items: [],
          errors: [],
          stats: { filesScanned: 0, itemsFound: 0, duration: 100 },
        }),
      };

      const mockVueScanner = {
        scan: vi.fn().mockResolvedValue({
          items: [],
          errors: [],
          stats: { filesScanned: 0, itemsFound: 0, duration: 100 },
        }),
      };

      (
        scanners.ReactComponentScanner as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockReactScanner);
      (
        scanners.VueComponentScanner as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockVueScanner);

      const program = createTestProgram();
      await program.parseAsync(["node", "test", "scan"]);

      expect(mockReactScanner.scan).toHaveBeenCalled();
      expect(mockVueScanner.scan).toHaveBeenCalled();
    });

    it("does not scan disabled sources", async () => {
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ["src/**/*.tsx"], exclude: [] },
            vue: { enabled: false, include: ["src/**/*.vue"], exclude: [] },
          },
        }),
        configPath: "/test/buoy.config.js",
      });

      const mockReactScanner = {
        scan: vi.fn().mockResolvedValue({
          items: [],
          errors: [],
          stats: { filesScanned: 0, itemsFound: 0, duration: 100 },
        }),
      };

      const mockVueScanner = {
        scan: vi.fn().mockResolvedValue({
          items: [],
          errors: [],
          stats: { filesScanned: 0, itemsFound: 0, duration: 100 },
        }),
      };

      (
        scanners.ReactComponentScanner as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockReactScanner);
      (
        scanners.VueComponentScanner as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockVueScanner);

      const program = createTestProgram();
      await program.parseAsync(["node", "test", "scan"]);

      expect(mockReactScanner.scan).toHaveBeenCalled();
      expect(mockVueScanner.scan).not.toHaveBeenCalled();
    });
  });

  describe("output formats", () => {
    beforeEach(() => {
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ["src/**/*.tsx"], exclude: [] },
          },
        }),
        configPath: "/test/buoy.config.js",
      });

      const mockReactScanner = {
        scan: vi.fn().mockResolvedValue({
          items: [createMockComponent("Button")],
          errors: [],
          stats: { filesScanned: 1, itemsFound: 1, duration: 100 },
        }),
      };

      (
        scanners.ReactComponentScanner as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockReactScanner);
    });

    it("outputs JSON when --json flag is provided", async () => {
      const program = createTestProgram();
      await program.parseAsync(["node", "test", "scan", "--json"]);

      expect(reporters.setJsonMode).toHaveBeenCalledWith(true);

      // Check that console.log was called with JSON output
      const jsonCalls = consoleLogSpy.mock.calls.filter((call) => {
        try {
          JSON.parse(call[0] as string);
          return true;
        } catch {
          return false;
        }
      });

      expect(jsonCalls.length).toBeGreaterThan(0);
    });

    it("outputs table format by default", async () => {
      const program = createTestProgram();
      await program.parseAsync(["node", "test", "scan"]);

      expect(reporters.header).toHaveBeenCalledWith("Scan Results");
      expect(reporters.keyValue).toHaveBeenCalledWith("Components found", "1");
      expect(formatters.formatComponentTable).toHaveBeenCalled();
    });

    it("shows verbose output when --verbose flag is provided", async () => {
      const program = createTestProgram();
      await program.parseAsync(["node", "test", "scan", "--verbose"]);

      expect(reporters.info).toHaveBeenCalledWith(
        expect.stringContaining("Using config:"),
      );
    });
  });

  describe("scanner configuration", () => {
    it("passes include patterns to react scanner", async () => {
      const include = ["components/**/*.tsx", "pages/**/*.tsx"];
      const exclude = ["**/*.test.tsx"];

      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include, exclude },
          },
        }),
        configPath: "/test/buoy.config.js",
      });

      const mockReactScanner = {
        scan: vi.fn().mockResolvedValue({
          items: [],
          errors: [],
          stats: { filesScanned: 0, itemsFound: 0, duration: 100 },
        }),
      };

      (
        scanners.ReactComponentScanner as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(
        (config: { include: string[]; exclude: string[] }) => {
          expect(config.include).toEqual(include);
          expect(config.exclude).toEqual(exclude);
          return mockReactScanner;
        },
      );

      const program = createTestProgram();
      await program.parseAsync(["node", "test", "scan", "-s", "react"]);

      expect(scanners.ReactComponentScanner).toHaveBeenCalled();
    });

    it("passes designSystemPackage to react scanner", async () => {
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: {
              enabled: true,
              include: ["src/**/*.tsx"],
              exclude: [],
              designSystemPackage: "@company/design-system",
            },
          },
        }),
        configPath: "/test/buoy.config.js",
      });

      const mockReactScanner = {
        scan: vi.fn().mockResolvedValue({
          items: [],
          errors: [],
          stats: { filesScanned: 0, itemsFound: 0, duration: 100 },
        }),
      };

      (
        scanners.ReactComponentScanner as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation((config: { designSystemPackage: string }) => {
        expect(config.designSystemPackage).toBe("@company/design-system");
        return mockReactScanner;
      });

      const program = createTestProgram();
      await program.parseAsync(["node", "test", "scan", "-s", "react"]);

      expect(scanners.ReactComponentScanner).toHaveBeenCalled();
    });

    it("passes cssVariablePrefix to token scanner", async () => {
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            tokens: {
              enabled: true,
              files: ["styles/tokens.css"],
              cssVariablePrefix: "ds-",
            },
          },
        }),
        configPath: "/test/buoy.config.js",
      });

      const mockTokenScanner = {
        scan: vi.fn().mockResolvedValue({
          items: [],
          errors: [],
          stats: { filesScanned: 0, itemsFound: 0, duration: 50 },
        }),
      };

      (
        scanners.TokenScanner as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(
        (config: { files: string[]; cssVariablePrefix: string }) => {
          expect(config.files).toEqual(["styles/tokens.css"]);
          expect(config.cssVariablePrefix).toBe("ds-");
          return mockTokenScanner;
        },
      );

      const program = createTestProgram();
      await program.parseAsync(["node", "test", "scan", "-s", "tokens"]);

      expect(scanners.TokenScanner).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("handles missing config with zero-config mode", async () => {
      // No config file found - fall back to auto-detection
      mockGetConfigPath.mockReturnValue(null);
      mockBuildAutoConfig.mockResolvedValue({
        config: createMockConfig({ sources: {} }), // No sources detected
        detected: [],
        tokenFiles: [],
        monorepo: null,
      });

      const program = createTestProgram();
      await program.parseAsync(["node", "test", "scan"]);

      // When no frameworks detected, shows insights block instead of warning
      // The current behavior shows project insights to guide the user
      const { formatInsightsBlock } = await import("../../insights/index.js");
      expect(formatInsightsBlock).toHaveBeenCalled();
    });

    it("handles config with no enabled sources", async () => {
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({ sources: {} }),
        configPath: "/test/buoy.config.js",
      });
      mockGetConfigPath.mockReturnValue("/test/buoy.config.js");

      const program = createTestProgram();
      await program.parseAsync(["node", "test", "scan"]);

      // When no sources enabled, shows insights block to guide the user
      const { formatInsightsBlock } = await import("../../insights/index.js");
      expect(formatInsightsBlock).toHaveBeenCalled();
    });

    it("reports scanner errors in results", async () => {
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ["src/**/*.tsx"], exclude: [] },
          },
        }),
        configPath: "/test/buoy.config.js",
      });

      const mockReactScanner = {
        scan: vi.fn().mockResolvedValue({
          items: [createMockComponent("Button")],
          errors: [
            {
              file: "src/Broken.tsx",
              message: "Syntax error",
              code: "PARSE_ERROR",
            },
          ],
          stats: { filesScanned: 2, itemsFound: 1, duration: 100 },
        }),
      };

      (
        scanners.ReactComponentScanner as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockReactScanner);

      const program = createTestProgram();
      await program.parseAsync(["node", "test", "scan"]);

      expect(reporters.keyValue).toHaveBeenCalledWith("Errors", "1");
      expect(reporters.header).toHaveBeenCalledWith("Errors");
    });

    it("handles scanner exceptions gracefully", async () => {
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ["src/**/*.tsx"], exclude: [] },
          },
        }),
        configPath: "/test/buoy.config.js",
      });

      const mockReactScanner = {
        scan: vi.fn().mockRejectedValue(new Error("Scanner crashed")),
      };

      (
        scanners.ReactComponentScanner as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockReactScanner);

      const program = createTestProgram();

      // When scanner crashes, the error is caught and results are still displayed
      // The orchestrator catches scanner errors and adds them to the errors array
      await program.parseAsync(["node", "test", "scan"]);

      // Scanner was attempted
      expect(mockReactScanner.scan).toHaveBeenCalled();
    });

    it("exits with code 1 on fatal config load error", async () => {
      mockLoadConfig.mockRejectedValue(new Error("Failed to parse config"));

      const program = createTestProgram();

      try {
        await program.parseAsync(["node", "test", "scan"]);
      } catch {
        // Expected because of exitOverride
      }

      expect(reporters.error).toHaveBeenCalledWith(
        expect.stringContaining("Scan failed:"),
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe("result aggregation", () => {
    it("aggregates components from multiple scanners", async () => {
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ["src/**/*.tsx"], exclude: [] },
            vue: { enabled: true, include: ["src/**/*.vue"], exclude: [] },
          },
        }),
        configPath: "/test/buoy.config.js",
      });

      const mockReactScanner = {
        scan: vi.fn().mockResolvedValue({
          items: [createMockComponent("Button"), createMockComponent("Card")],
          errors: [],
          stats: { filesScanned: 2, itemsFound: 2, duration: 100 },
        }),
      };

      const mockVueScanner = {
        scan: vi.fn().mockResolvedValue({
          items: [
            {
              ...createMockComponent("Modal"),
              source: {
                type: "vue",
                path: "src/Modal.vue",
                exportName: "Modal",
                line: 1,
              },
            },
          ],
          errors: [],
          stats: { filesScanned: 1, itemsFound: 1, duration: 50 },
        }),
      };

      (
        scanners.ReactComponentScanner as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockReactScanner);
      (
        scanners.VueComponentScanner as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockVueScanner);

      const program = createTestProgram();
      await program.parseAsync(["node", "test", "scan"]);

      expect(reporters.keyValue).toHaveBeenCalledWith("Components found", "3");
    });

    it("aggregates tokens from token scanner", async () => {
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            tokens: { enabled: true, files: ["tokens.css"] },
          },
        }),
        configPath: "/test/buoy.config.js",
      });

      const mockTokenScanner = {
        scan: vi.fn().mockResolvedValue({
          items: [
            createMockToken("primary"),
            createMockToken("secondary"),
            createMockToken("accent"),
          ],
          errors: [],
          stats: { filesScanned: 1, itemsFound: 3, duration: 50 },
        }),
      };

      (
        scanners.TokenScanner as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockTokenScanner);

      const program = createTestProgram();
      await program.parseAsync(["node", "test", "scan"]);

      expect(reporters.keyValue).toHaveBeenCalledWith("Tokens found", "3");
      expect(formatters.formatTokenTable).toHaveBeenCalled();
    });
  });

  describe("framework-specific scanners", () => {
    it("scans svelte source with correct scanner", async () => {
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            svelte: {
              enabled: true,
              include: ["src/**/*.svelte"],
              exclude: [],
            },
          },
        }),
        configPath: "/test/buoy.config.js",
      });

      const mockScanner = {
        scan: vi.fn().mockResolvedValue({
          items: [createMockComponent("TestComponent")],
          errors: [],
          stats: { filesScanned: 1, itemsFound: 1, duration: 100 },
        }),
      };

      (
        scanners.SvelteComponentScanner as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockScanner);

      const program = createTestProgram();
      await program.parseAsync(["node", "test", "scan", "-s", "svelte"]);

      expect(scanners.SvelteComponentScanner).toHaveBeenCalled();
      expect(mockScanner.scan).toHaveBeenCalled();
    });

    it("scans angular source with correct scanner", async () => {
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            angular: {
              enabled: true,
              include: ["src/**/*.component.ts"],
              exclude: [],
            },
          },
        }),
        configPath: "/test/buoy.config.js",
      });

      const mockScanner = {
        scan: vi.fn().mockResolvedValue({
          items: [createMockComponent("TestComponent")],
          errors: [],
          stats: { filesScanned: 1, itemsFound: 1, duration: 100 },
        }),
      };

      (
        scanners.AngularComponentScanner as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockScanner);

      const program = createTestProgram();
      await program.parseAsync(["node", "test", "scan", "-s", "angular"]);

      expect(scanners.AngularComponentScanner).toHaveBeenCalled();
      expect(mockScanner.scan).toHaveBeenCalled();
    });

    it("scans webcomponent source with correct scanner", async () => {
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            webcomponent: {
              enabled: true,
              include: ["src/**/*.ts"],
              exclude: [],
              framework: "auto",
            },
          },
        }),
        configPath: "/test/buoy.config.js",
      });

      const mockScanner = {
        scan: vi.fn().mockResolvedValue({
          items: [createMockComponent("TestComponent")],
          errors: [],
          stats: { filesScanned: 1, itemsFound: 1, duration: 100 },
        }),
      };

      (
        scanners.WebComponentScanner as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockScanner);

      const program = createTestProgram();
      await program.parseAsync(["node", "test", "scan", "-s", "webcomponent"]);

      expect(scanners.WebComponentScanner).toHaveBeenCalled();
      expect(mockScanner.scan).toHaveBeenCalled();
    });

    it("scans templates with correct scanner and type", async () => {
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            templates: {
              enabled: true,
              include: ["resources/views/**/*.blade.php"],
              exclude: [],
              type: "blade",
            },
          },
        }),
        configPath: "/test/buoy.config.js",
      });

      const mockTemplateScanner = {
        scan: vi.fn().mockResolvedValue({
          items: [],
          errors: [],
          stats: { filesScanned: 0, itemsFound: 0, duration: 100 },
        }),
      };

      (
        scanners.TemplateScanner as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation((config: { templateType: string }) => {
        expect(config.templateType).toBe("blade");
        return mockTemplateScanner;
      });

      const program = createTestProgram();
      await program.parseAsync(["node", "test", "scan", "-s", "templates"]);

      expect(scanners.TemplateScanner).toHaveBeenCalled();
    });

    it("scans web components with framework option", async () => {
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            webcomponent: {
              enabled: true,
              include: ["src/**/*.ts"],
              exclude: [],
              framework: "lit",
            },
          },
        }),
        configPath: "/test/buoy.config.js",
      });

      const mockWebComponentScanner = {
        scan: vi.fn().mockResolvedValue({
          items: [],
          errors: [],
          stats: { filesScanned: 0, itemsFound: 0, duration: 100 },
        }),
      };

      (
        scanners.WebComponentScanner as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation((config: { framework: string }) => {
        expect(config.framework).toBe("lit");
        return mockWebComponentScanner;
      });

      const program = createTestProgram();
      await program.parseAsync(["node", "test", "scan", "-s", "webcomponent"]);

      expect(scanners.WebComponentScanner).toHaveBeenCalled();
    });
  });

  describe("JSON output structure", () => {
    it("outputs valid JSON with expected structure", async () => {
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ["src/**/*.tsx"], exclude: [] },
            tokens: { enabled: true, files: ["tokens.css"] },
          },
        }),
        configPath: "/test/buoy.config.js",
      });

      const mockComponent = createMockComponent("Button");
      const mockToken = createMockToken("primary");

      const mockReactScanner = {
        scan: vi.fn().mockResolvedValue({
          items: [mockComponent],
          errors: [
            {
              file: "src/Broken.tsx",
              message: "Parse error",
              code: "PARSE_ERROR",
            },
          ],
          stats: { filesScanned: 2, itemsFound: 1, duration: 100 },
        }),
      };

      const mockTokenScanner = {
        scan: vi.fn().mockResolvedValue({
          items: [mockToken],
          errors: [],
          stats: { filesScanned: 1, itemsFound: 1, duration: 50 },
        }),
      };

      (
        scanners.ReactComponentScanner as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockReactScanner);
      (
        scanners.TokenScanner as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockTokenScanner);

      const program = createTestProgram();
      await program.parseAsync(["node", "test", "scan", "--json"]);

      // Find the JSON output call
      const jsonCall = consoleLogSpy.mock.calls.find((call) => {
        try {
          const parsed = JSON.parse(call[0] as string);
          // Make sure it's the results object, not some other JSON
          return parsed && typeof parsed === "object" && "components" in parsed;
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();

      const output = JSON.parse(jsonCall![0] as string);
      expect(output).toHaveProperty("components");
      expect(output).toHaveProperty("tokens");
      expect(output).toHaveProperty("errors");
      expect(Array.isArray(output.components)).toBe(true);
      expect(Array.isArray(output.tokens)).toBe(true);
      expect(Array.isArray(output.errors)).toBe(true);
      expect(output.components.length).toBe(1);
      expect(output.tokens.length).toBe(1);
      expect(output.errors.length).toBe(1);
    });
  });
});
