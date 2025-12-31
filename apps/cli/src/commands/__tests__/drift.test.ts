// apps/cli/src/commands/__tests__/drift.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import type { BuoyConfig } from "../../config/schema.js";
import type { DriftSignal, Component, Severity } from "@buoy-design/core";

// Mock modules before importing the command
vi.mock("../../config/loader.js", () => ({
  loadConfig: vi.fn(),
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

vi.mock("@buoy-design/core/analysis", () => ({
  SemanticDiffEngine: vi.fn(),
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
  formatDriftTable: vi.fn(() => "Drift Table"),
  formatDriftList: vi.fn(() => "Drift List"),
  formatJson: vi.fn((data) => JSON.stringify(data, null, 2)),
  formatMarkdown: vi.fn(() => "# Drift Report\n\nMarkdown content"),
}));

// Import after mocks are set up
import { createDriftCommand } from "../drift.js";
import { loadConfig } from "../../config/loader.js";
import * as scanners from "@buoy-design/scanners/git";
import * as analysis from "@buoy-design/core/analysis";
import * as reporters from "../../output/reporters.js";
import * as formatters from "../../output/formatters.js";

// Type the mocked functions
const mockLoadConfig = vi.mocked(loadConfig);

// Helper to create a test program
function createTestProgram(): Command {
  const program = new Command();
  program.exitOverride(); // Prevent process.exit
  program.configureOutput({
    writeErr: () => {}, // Suppress error output
    writeOut: () => {}, // Suppress output
  });
  program.addCommand(createDriftCommand());
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

// Helper to create drift signals
function createDrift(
  severity: Severity,
  type: string = "hardcoded-value",
  entityName: string = "Button",
): DriftSignal {
  return {
    id: `drift-${Math.random().toString(36).slice(2)}`,
    type: type as DriftSignal["type"],
    severity,
    source: {
      entityType: "component",
      entityId: `comp-${entityName}`,
      entityName,
      location: `src/${entityName}.tsx:10`,
    },
    message: `Test drift for ${entityName}`,
    details: {},
    detectedAt: new Date(),
  };
}

describe("drift command", () => {
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
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    process.cwd = originalCwd;
  });

  describe("command structure", () => {
    it("creates drift command with correct subcommands", () => {
      const cmd = createDriftCommand();

      expect(cmd.name()).toBe("drift");
      expect(cmd.description()).toBe("Detect and manage design system drift");

      // Get subcommands - only 'check' is implemented
      // 'explain' and 'resolve' are planned but not yet implemented
      const subcommands = cmd.commands.map((c) => c.name());
      expect(subcommands).toContain("check");
      expect(subcommands).toHaveLength(1);
    });

    it("check subcommand has correct options", () => {
      const cmd = createDriftCommand();
      const checkCmd = cmd.commands.find((c) => c.name() === "check");

      expect(checkCmd).toBeDefined();
      const optionNames = checkCmd!.options.map((o) =>
        o.long?.replace("--", ""),
      );

      expect(optionNames).toContain("severity");
      expect(optionNames).toContain("type");
      expect(optionNames).toContain("json");
      expect(optionNames).toContain("markdown");
      expect(optionNames).toContain("compact");
      expect(optionNames).toContain("verbose");
    });
  });

  describe("drift check - basic execution", () => {
    beforeEach(() => {
      // Setup default mocks for successful execution
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
          items: [createMockComponent("Button"), createMockComponent("Card")],
          errors: [],
          stats: { filesScanned: 2, itemsFound: 2, duration: 100 },
        }),
      };

      (
        scanners.ReactComponentScanner as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockReactScanner);

      const mockEngine = {
        analyzeComponents: vi.fn().mockReturnValue({
          drifts: [createDrift("warning"), createDrift("info")],
        }),
      };

      (
        analysis.SemanticDiffEngine as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockEngine);
    });

    it("executes drift check successfully", async () => {
      const program = createTestProgram();
      await program.parseAsync(["node", "test", "drift", "check"]);

      expect(mockLoadConfig).toHaveBeenCalled();
      expect(scanners.ReactComponentScanner).toHaveBeenCalled();
      expect(analysis.SemanticDiffEngine).toHaveBeenCalled();
      expect(reporters.header).toHaveBeenCalledWith("Drift Analysis");
    });

    it("displays summary statistics", async () => {
      const program = createTestProgram();
      await program.parseAsync(["node", "test", "drift", "check"]);

      expect(reporters.keyValue).toHaveBeenCalledWith(
        "Components scanned",
        "2",
      );
      expect(reporters.keyValue).toHaveBeenCalledWith("Critical", "0");
      expect(reporters.keyValue).toHaveBeenCalledWith("Warning", "1");
      expect(reporters.keyValue).toHaveBeenCalledWith("Info", "1");
    });

    it("uses detailed list format by default", async () => {
      const program = createTestProgram();
      await program.parseAsync(["node", "test", "drift", "check"]);

      expect(formatters.formatDriftList).toHaveBeenCalled();
      expect(formatters.formatDriftTable).not.toHaveBeenCalled();
    });

    it("shows success message when no drift detected", async () => {
      // Override the config to include a token reference source
      // (success message only shows when a reference source is configured)
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ["src/**/*.tsx"], exclude: [] },
            tokens: { enabled: true, files: ["design-tokens.css"] },
          },
        }),
        configPath: "/test/buoy.config.js",
      });

      const mockEngine = {
        analyzeComponents: vi.fn().mockReturnValue({ drifts: [] }),
      };

      (
        analysis.SemanticDiffEngine as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockEngine);

      const program = createTestProgram();
      await program.parseAsync(["node", "test", "drift", "check"]);

      expect(reporters.success).toHaveBeenCalledWith(
        "No drift detected. Your design system is aligned!",
      );
    });

    it("shows warning when critical issues exist", async () => {
      const mockEngine = {
        analyzeComponents: vi.fn().mockReturnValue({
          drifts: [createDrift("critical"), createDrift("warning")],
        }),
      };

      (
        analysis.SemanticDiffEngine as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockEngine);

      const program = createTestProgram();
      await program.parseAsync(["node", "test", "drift", "check"]);

      expect(reporters.warning).toHaveBeenCalledWith(
        "1 critical issues require attention.",
      );
    });
  });

  describe("drift check - output formats", () => {
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

      const mockEngine = {
        analyzeComponents: vi.fn().mockReturnValue({
          drifts: [createDrift("warning")],
        }),
      };

      (
        analysis.SemanticDiffEngine as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockEngine);
    });

    it("outputs JSON when --json flag is provided", async () => {
      const program = createTestProgram();
      await program.parseAsync(["node", "test", "drift", "check", "--json"]);

      expect(reporters.setJsonMode).toHaveBeenCalledWith(true);
      expect(formatters.formatJson).toHaveBeenCalled();

      // Verify JSON was output to console
      const jsonCalls = consoleLogSpy.mock.calls.filter((call) => {
        try {
          const parsed = JSON.parse(call[0] as string);
          return parsed && typeof parsed === "object" && "drifts" in parsed;
        } catch {
          return false;
        }
      });

      expect(jsonCalls.length).toBeGreaterThan(0);
    });

    it("outputs markdown when --markdown flag is provided", async () => {
      const program = createTestProgram();
      await program.parseAsync([
        "node",
        "test",
        "drift",
        "check",
        "--markdown",
      ]);

      expect(formatters.formatMarkdown).toHaveBeenCalled();
    });

    it("uses compact table format when --compact flag is provided", async () => {
      const program = createTestProgram();
      await program.parseAsync(["node", "test", "drift", "check", "--compact"]);

      expect(formatters.formatDriftTable).toHaveBeenCalled();
      expect(formatters.formatDriftList).not.toHaveBeenCalled();
    });

    it("JSON output includes summary with counts", async () => {
      const program = createTestProgram();
      await program.parseAsync(["node", "test", "drift", "check", "--json"]);

      const formatJsonCall = vi.mocked(formatters.formatJson).mock.calls[0];
      expect(formatJsonCall).toBeDefined();

      const data = formatJsonCall![0] as {
        drifts: DriftSignal[];
        summary: Record<string, number>;
      };
      expect(data).toHaveProperty("drifts");
      expect(data).toHaveProperty("summary");
      expect(data.summary).toHaveProperty("critical");
      expect(data.summary).toHaveProperty("warning");
      expect(data.summary).toHaveProperty("info");
    });
  });

  describe("drift check - severity filtering", () => {
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

    it("filters drifts by --severity critical", async () => {
      const mockEngine = {
        analyzeComponents: vi.fn().mockReturnValue({
          drifts: [
            createDrift("critical"),
            createDrift("warning"),
            createDrift("info"),
          ],
        }),
      };

      (
        analysis.SemanticDiffEngine as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockEngine);

      const program = createTestProgram();
      await program.parseAsync([
        "node",
        "test",
        "drift",
        "check",
        "--severity",
        "critical",
      ]);

      // Only critical should be counted
      expect(reporters.keyValue).toHaveBeenCalledWith("Critical", "1");
      expect(reporters.keyValue).toHaveBeenCalledWith("Warning", "0");
      expect(reporters.keyValue).toHaveBeenCalledWith("Info", "0");
    });

    it("filters drifts by --severity warning (includes critical)", async () => {
      const mockEngine = {
        analyzeComponents: vi.fn().mockReturnValue({
          drifts: [
            createDrift("critical"),
            createDrift("warning"),
            createDrift("warning"),
            createDrift("info"),
          ],
        }),
      };

      (
        analysis.SemanticDiffEngine as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockEngine);

      const program = createTestProgram();
      await program.parseAsync([
        "node",
        "test",
        "drift",
        "check",
        "--severity",
        "warning",
      ]);

      // Critical and warning should be counted
      expect(reporters.keyValue).toHaveBeenCalledWith("Critical", "1");
      expect(reporters.keyValue).toHaveBeenCalledWith("Warning", "2");
      expect(reporters.keyValue).toHaveBeenCalledWith("Info", "0");
    });

    it("shows all drifts with --severity info", async () => {
      const mockEngine = {
        analyzeComponents: vi.fn().mockReturnValue({
          drifts: [
            createDrift("critical"),
            createDrift("warning"),
            createDrift("info"),
            createDrift("info"),
          ],
        }),
      };

      (
        analysis.SemanticDiffEngine as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockEngine);

      const program = createTestProgram();
      await program.parseAsync([
        "node",
        "test",
        "drift",
        "check",
        "--severity",
        "info",
      ]);

      expect(reporters.keyValue).toHaveBeenCalledWith("Critical", "1");
      expect(reporters.keyValue).toHaveBeenCalledWith("Warning", "1");
      expect(reporters.keyValue).toHaveBeenCalledWith("Info", "2");
    });
  });

  describe("drift check - type filtering", () => {
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

    it("filters drifts by --type", async () => {
      const mockEngine = {
        analyzeComponents: vi.fn().mockReturnValue({
          drifts: [
            createDrift("warning", "hardcoded-value"),
            createDrift("warning", "naming-inconsistency"),
            createDrift("warning", "hardcoded-value"),
          ],
        }),
      };

      (
        analysis.SemanticDiffEngine as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockEngine);

      const program = createTestProgram();
      await program.parseAsync([
        "node",
        "test",
        "drift",
        "check",
        "--type",
        "hardcoded-value",
      ]);

      // Only hardcoded-value drifts should remain (2 warnings)
      expect(reporters.keyValue).toHaveBeenCalledWith("Warning", "2");
    });

    it("combines --severity and --type filters", async () => {
      const mockEngine = {
        analyzeComponents: vi.fn().mockReturnValue({
          drifts: [
            createDrift("critical", "hardcoded-value"),
            createDrift("warning", "hardcoded-value"),
            createDrift("critical", "naming-inconsistency"),
            createDrift("info", "hardcoded-value"),
          ],
        }),
      };

      (
        analysis.SemanticDiffEngine as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockEngine);

      const program = createTestProgram();
      await program.parseAsync([
        "node",
        "test",
        "drift",
        "check",
        "--type",
        "hardcoded-value",
        "--severity",
        "warning",
      ]);

      // Only critical and warning hardcoded-value drifts
      expect(reporters.keyValue).toHaveBeenCalledWith("Critical", "1");
      expect(reporters.keyValue).toHaveBeenCalledWith("Warning", "1");
      expect(reporters.keyValue).toHaveBeenCalledWith("Info", "0");
    });
  });

  describe("drift check - ignore rules", () => {
    it("applies ignore rules from config", async () => {
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ["src/**/*.tsx"], exclude: [] },
          },
          drift: {
            ignore: [{ type: "hardcoded-value", pattern: "Legacy.*" }],
            severity: {},
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

      const mockEngine = {
        analyzeComponents: vi.fn().mockReturnValue({
          drifts: [
            createDrift("warning", "hardcoded-value", "Button"),
            createDrift("warning", "hardcoded-value", "LegacyButton"),
            createDrift("warning", "naming-inconsistency", "LegacyCard"),
          ],
        }),
      };

      (
        analysis.SemanticDiffEngine as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockEngine);

      const program = createTestProgram();
      await program.parseAsync(["node", "test", "drift", "check"]);

      // LegacyButton hardcoded-value should be ignored, but LegacyCard naming issue should remain
      expect(reporters.keyValue).toHaveBeenCalledWith("Warning", "2");
    });

    it("ignores all drifts of a type without pattern", async () => {
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ["src/**/*.tsx"], exclude: [] },
          },
          drift: {
            ignore: [
              { type: "hardcoded-value" }, // No pattern - ignore all
            ],
            severity: {},
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

      const mockEngine = {
        analyzeComponents: vi.fn().mockReturnValue({
          drifts: [
            createDrift("warning", "hardcoded-value", "Button"),
            createDrift("warning", "hardcoded-value", "Card"),
            createDrift("info", "naming-inconsistency", "Input"),
          ],
        }),
      };

      (
        analysis.SemanticDiffEngine as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockEngine);

      const program = createTestProgram();
      await program.parseAsync(["node", "test", "drift", "check"]);

      // All hardcoded-value drifts should be ignored
      expect(reporters.keyValue).toHaveBeenCalledWith("Warning", "0");
      expect(reporters.keyValue).toHaveBeenCalledWith("Info", "1");
    });
  });

  describe("drift check - error handling", () => {
    it("handles config load failure", async () => {
      mockLoadConfig.mockRejectedValue(new Error("Config file not found"));

      const program = createTestProgram();

      try {
        await program.parseAsync(["node", "test", "drift", "check"]);
      } catch {
        // Expected because of exitOverride
      }

      expect(reporters.error).toHaveBeenCalledWith(
        expect.stringContaining("Drift check failed:"),
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it("handles scanner failure gracefully", async () => {
      // With the ScanOrchestrator, scanner failures are collected into errors array
      // rather than crashing the entire operation. This allows partial results.
      // Include a token reference source so success message is shown when no drift detected
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: true, include: ["src/**/*.tsx"], exclude: [] },
            tokens: { enabled: true, files: ["design-tokens.css"] },
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

      // Analysis engine should still be called (with empty components)
      const mockEngine = {
        analyzeComponents: vi.fn().mockReturnValue({ drifts: [] }),
      };
      (
        analysis.SemanticDiffEngine as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockEngine);

      const program = createTestProgram();

      // Should complete without throwing - scanner errors are handled gracefully
      await program.parseAsync(["node", "test", "drift", "check"]);

      // The analysis engine should still run (with zero components from failed scanner)
      expect(mockEngine.analyzeComponents).toHaveBeenCalledWith([], {
        checkDeprecated: true,
        checkNaming: true,
        checkDocumentation: true,
      });

      // Should show success message since no drift was found (no components to analyze)
      expect(reporters.success).toHaveBeenCalled();
    });

    it("shows full error with --verbose flag", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const testError = new Error("Detailed error message");

      mockLoadConfig.mockRejectedValue(testError);

      const program = createTestProgram();

      try {
        await program.parseAsync([
          "node",
          "test",
          "drift",
          "check",
          "--verbose",
        ]);
      } catch {
        // Expected
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith(testError);
      consoleErrorSpy.mockRestore();
    });
  });

  describe("drift check - analysis options", () => {
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

    it("passes correct analysis options to SemanticDiffEngine", async () => {
      const analyzeComponentsMock = vi.fn().mockReturnValue({ drifts: [] });
      const mockEngine = { analyzeComponents: analyzeComponentsMock };

      (
        analysis.SemanticDiffEngine as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockEngine);

      const program = createTestProgram();
      await program.parseAsync(["node", "test", "drift", "check"]);

      expect(analyzeComponentsMock).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          checkDeprecated: true,
          checkNaming: true,
          checkDocumentation: true,
        }),
      );
    });
  });

  // NOTE: Tests for 'drift explain' and 'drift resolve' subcommands have been removed
  // because those commands are not yet implemented. They will be added when the commands
  // are properly implemented with full functionality (Claude API for explain, persistence for resolve).

  describe("drift check - scanner configuration", () => {
    it("only scans when react source is enabled", async () => {
      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: { enabled: false, include: ["src/**/*.tsx"], exclude: [] },
          },
        }),
        configPath: "/test/buoy.config.js",
      });

      const mockReactScanner = {
        scan: vi.fn().mockResolvedValue({
          items: [],
          errors: [],
          stats: { filesScanned: 0, itemsFound: 0, duration: 0 },
        }),
      };

      (
        scanners.ReactComponentScanner as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockReactScanner);

      const mockEngine = {
        analyzeComponents: vi.fn().mockReturnValue({ drifts: [] }),
      };

      (
        analysis.SemanticDiffEngine as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockEngine);

      const program = createTestProgram();
      await program.parseAsync(["node", "test", "drift", "check"]);

      // Scanner should not be called when source is disabled
      expect(mockReactScanner.scan).not.toHaveBeenCalled();
    });

    it("passes correct scanner configuration", async () => {
      const include = ["components/**/*.tsx"];
      const exclude = ["**/*.test.tsx"];
      const designSystemPackage = "@company/ds";

      mockLoadConfig.mockResolvedValue({
        config: createMockConfig({
          sources: {
            react: {
              enabled: true,
              include,
              exclude,
              designSystemPackage,
            },
          },
        }),
        configPath: "/test/buoy.config.js",
      });

      const mockReactScanner = {
        scan: vi.fn().mockResolvedValue({
          items: [],
          errors: [],
          stats: { filesScanned: 0, itemsFound: 0, duration: 0 },
        }),
      };

      (
        scanners.ReactComponentScanner as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(
        (config: {
          include: string[];
          exclude: string[];
          designSystemPackage: string;
        }) => {
          expect(config.include).toEqual(include);
          expect(config.exclude).toEqual(exclude);
          expect(config.designSystemPackage).toBe(designSystemPackage);
          return mockReactScanner;
        },
      );

      const mockEngine = {
        analyzeComponents: vi.fn().mockReturnValue({ drifts: [] }),
      };

      (
        analysis.SemanticDiffEngine as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockEngine);

      const program = createTestProgram();
      await program.parseAsync(["node", "test", "drift", "check"]);

      expect(scanners.ReactComponentScanner).toHaveBeenCalled();
    });
  });

  describe("summary calculation", () => {
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

    it("correctly counts drifts by severity", async () => {
      const mockEngine = {
        analyzeComponents: vi.fn().mockReturnValue({
          drifts: [
            createDrift("critical"),
            createDrift("critical"),
            createDrift("warning"),
            createDrift("warning"),
            createDrift("warning"),
            createDrift("info"),
          ],
        }),
      };

      (
        analysis.SemanticDiffEngine as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockEngine);

      const program = createTestProgram();
      await program.parseAsync(["node", "test", "drift", "check"]);

      expect(reporters.keyValue).toHaveBeenCalledWith("Critical", "2");
      expect(reporters.keyValue).toHaveBeenCalledWith("Warning", "3");
      expect(reporters.keyValue).toHaveBeenCalledWith("Info", "1");
    });

    it("JSON output includes correct summary", async () => {
      const mockEngine = {
        analyzeComponents: vi.fn().mockReturnValue({
          drifts: [
            createDrift("critical"),
            createDrift("warning"),
            createDrift("warning"),
            createDrift("info"),
          ],
        }),
      };

      (
        analysis.SemanticDiffEngine as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(() => mockEngine);

      const program = createTestProgram();
      await program.parseAsync(["node", "test", "drift", "check", "--json"]);

      const formatJsonCall = vi.mocked(formatters.formatJson).mock.calls[0];
      const data = formatJsonCall![0] as {
        summary: { critical: number; warning: number; info: number };
      };

      expect(data.summary.critical).toBe(1);
      expect(data.summary.warning).toBe(2);
      expect(data.summary.info).toBe(1);
    });
  });
});
