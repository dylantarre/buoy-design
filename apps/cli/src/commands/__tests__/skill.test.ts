import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import type { Component, DesignToken, DriftSignal } from "@buoy-design/core";

// Mock modules before imports
vi.mock("../../config/loader.js", () => ({
  loadConfig: vi.fn(),
  getConfigPath: vi.fn(),
}));

vi.mock("../../config/auto-detect.js", () => ({
  buildAutoConfig: vi.fn(),
}));

vi.mock("../../scan/orchestrator.js", () => ({
  ScanOrchestrator: vi.fn(),
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

vi.mock("../../wizard/menu.js", () => ({
  bulletList: vi.fn(),
}));

vi.mock("fs", async () => {
  const actual = await vi.importActual("fs");
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

vi.mock("os", () => ({
  homedir: vi.fn().mockReturnValue("/home/testuser"),
}));

// Import after mocks
import { createSkillCommand } from "../skill.js";
import * as config from "../../config/loader.js";
import * as autoDetect from "../../config/auto-detect.js";
import * as orchestrator from "../../scan/orchestrator.js";
import * as analysis from "@buoy-design/core/analysis";
import * as reporters from "../../output/reporters.js";
import * as fs from "fs";

const mockLoadConfig = config.loadConfig as ReturnType<typeof vi.fn>;
const mockGetConfigPath = config.getConfigPath as ReturnType<typeof vi.fn>;
const mockBuildAutoConfig = autoDetect.buildAutoConfig as ReturnType<
  typeof vi.fn
>;
const mockScanOrchestrator = orchestrator.ScanOrchestrator as ReturnType<
  typeof vi.fn
>;
const mockSemanticDiffEngine = analysis.SemanticDiffEngine as ReturnType<
  typeof vi.fn
>;
const mockWriteFileSync = fs.writeFileSync as ReturnType<typeof vi.fn>;
const mockMkdirSync = fs.mkdirSync as ReturnType<typeof vi.fn>;

// Helper to create test program
function createTestProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({ writeErr: () => {}, writeOut: () => {} });
  program.addCommand(createSkillCommand());
  return program;
}

// Mock data factories
function createMockConfig() {
  return {
    project: { name: "test-project" },
    sources: {
      react: { enabled: true, include: ["src/**/*.tsx"], exclude: [] },
    },
    drift: { ignore: [], severity: {} },
    claude: { enabled: false, model: "claude-sonnet-4-20250514" },
    output: { format: "table", colors: true },
  };
}

function createMockToken(
  name: string,
  category: "color" | "spacing" | "typography",
  value: string | number,
): DesignToken {
  const baseToken = {
    id: `test:${category}:${name}`,
    name,
    category,
    aliases: [],
    usedBy: [],
    metadata: {},
    scannedAt: new Date(),
    source: { type: "css" as const, path: "tokens.css" },
  };

  if (category === "color") {
    return {
      ...baseToken,
      value: { type: "color" as const, hex: value as string },
    };
  } else if (category === "spacing") {
    return {
      ...baseToken,
      value: {
        type: "spacing" as const,
        value: value as number,
        unit: "px" as const,
      },
    };
  } else {
    return {
      ...baseToken,
      value: {
        type: "typography" as const,
        fontFamily: value as string,
        fontSize: 16,
        fontWeight: 400,
      },
    };
  }
}

function createMockComponent(name: string): Component {
  return {
    id: `react:src/${name}.tsx:${name}`,
    name,
    source: {
      type: "react",
      path: `src/${name}.tsx`,
      exportName: name,
      line: 1,
    },
    props: [],
    variants: [],
    tokens: [],
    dependencies: [],
    metadata: { tags: [] },
    scannedAt: new Date(),
  };
}

function createMockDrift(type: string, severity: "warning"): DriftSignal {
  return {
    id: `drift-${Math.random().toString(36).slice(2)}`,
    type: type as DriftSignal["type"],
    severity,
    source: {
      entityType: "component",
      entityId: "comp-Button",
      entityName: "Button",
      location: "src/Button.tsx:10",
    },
    message: `Test drift: ${type}`,
    details: {},
    detectedAt: new Date(),
  };
}

function setupMocks(
  components: Component[] = [],
  tokens: DesignToken[] = [],
  drifts: DriftSignal[] = [],
) {
  mockGetConfigPath.mockReturnValue("/test/.buoy.yaml");
  mockLoadConfig.mockResolvedValue({
    config: createMockConfig(),
    configPath: "/test/.buoy.yaml",
  });

  const mockOrchestrator = {
    scanComponents: vi.fn().mockResolvedValue({ components, errors: [] }),
    scanTokens: vi.fn().mockResolvedValue({ tokens, errors: [] }),
    scan: vi.fn().mockResolvedValue({ components, tokens, errors: [] }),
  };
  mockScanOrchestrator.mockImplementation(() => mockOrchestrator);

  const mockEngine = {
    analyzeComponents: vi.fn().mockReturnValue({ drifts }),
  };
  mockSemanticDiffEngine.mockImplementation(() => mockEngine);
}

// Spies
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

describe("skill command", () => {
  describe("command structure", () => {
    it("creates command with correct name", () => {
      const cmd = createSkillCommand();
      expect(cmd.name()).toBe("skill");
    });

    it("has description", () => {
      const cmd = createSkillCommand();
      expect(cmd.description()).toContain("skill");
    });

    it("has spill subcommand", () => {
      const cmd = createSkillCommand();
      const subcommands = cmd.commands.map((c) => c.name());
      expect(subcommands).toContain("spill");
    });

    it("spill command has alias export", () => {
      const cmd = createSkillCommand();
      const spillCmd = cmd.commands.find((c) => c.name() === "spill");
      expect(spillCmd).toBeDefined();
      expect(spillCmd!.aliases()).toContain("export");
    });
  });

  describe("spill subcommand", () => {
    describe("options", () => {
      it("has --output option", () => {
        const cmd = createSkillCommand();
        const spillCmd = cmd.commands.find((c) => c.name() === "spill");
        const options = spillCmd?.options.map((o) => o.long?.replace("--", ""));
        expect(options).toContain("output");
      });

      it("has --global option", () => {
        const cmd = createSkillCommand();
        const spillCmd = cmd.commands.find((c) => c.name() === "spill");
        const options = spillCmd?.options.map((o) => o.long?.replace("--", ""));
        expect(options).toContain("global");
      });

      it("has --sections option", () => {
        const cmd = createSkillCommand();
        const spillCmd = cmd.commands.find((c) => c.name() === "spill");
        const options = spillCmd?.options.map((o) => o.long?.replace("--", ""));
        expect(options).toContain("sections");
      });

      it("has --dry-run option", () => {
        const cmd = createSkillCommand();
        const spillCmd = cmd.commands.find((c) => c.name() === "spill");
        const options = spillCmd?.options.map((o) => o.long?.replace("--", ""));
        expect(options).toContain("dry-run");
      });

      it("has --json option", () => {
        const cmd = createSkillCommand();
        const spillCmd = cmd.commands.find((c) => c.name() === "spill");
        const options = spillCmd?.options.map((o) => o.long?.replace("--", ""));
        expect(options).toContain("json");
      });
    });

    describe("execution", () => {
      it("scans components and tokens", async () => {
        setupMocks(
          [createMockComponent("Button")],
          [createMockToken("primary", "color", "#2563EB")],
        );

        const program = createTestProgram();
        await program.parseAsync([
          "node",
          "test",
          "skill",
          "spill",
          "--dry-run",
        ]);

        expect(mockScanOrchestrator).toHaveBeenCalled();
      });

      it("runs drift analysis", async () => {
        setupMocks(
          [createMockComponent("Button")],
          [createMockToken("primary", "color", "#2563EB")],
        );

        const program = createTestProgram();
        await program.parseAsync([
          "node",
          "test",
          "skill",
          "spill",
          "--dry-run",
        ]);

        expect(mockSemanticDiffEngine).toHaveBeenCalled();
      });

      it("writes files when not dry-run", async () => {
        setupMocks(
          [createMockComponent("Button")],
          [createMockToken("primary", "color", "#2563EB")],
        );

        const program = createTestProgram();
        await program.parseAsync(["node", "test", "skill", "spill"]);

        expect(mockMkdirSync).toHaveBeenCalled();
        expect(mockWriteFileSync).toHaveBeenCalled();
      });

      it("does not write files in dry-run mode", async () => {
        setupMocks(
          [createMockComponent("Button")],
          [createMockToken("primary", "color", "#2563EB")],
        );

        const program = createTestProgram();
        await program.parseAsync([
          "node",
          "test",
          "skill",
          "spill",
          "--dry-run",
        ]);

        expect(mockWriteFileSync).not.toHaveBeenCalled();
      });

      it("outputs JSON when --json flag is provided", async () => {
        setupMocks(
          [createMockComponent("Button")],
          [createMockToken("primary", "color", "#2563EB")],
        );

        const program = createTestProgram();
        await program.parseAsync([
          "node",
          "test",
          "skill",
          "export",
          "--json",
          "--dry-run",
        ]);

        expect(reporters.setJsonMode).toHaveBeenCalledWith(true);

        // Verify JSON output
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

      it("uses global path when --global specified", async () => {
        setupMocks();

        const program = createTestProgram();
        await program.parseAsync([
          "node",
          "test",
          "skill",
          "export",
          "--global",
        ]);

        // Should include home directory in path
        const writeCalls = mockWriteFileSync.mock.calls;
        const paths = writeCalls.map((c) => c[0] as string);
        expect(paths.some((p) => p.includes("/home/testuser"))).toBe(true);
      });

      it("uses custom output path when --output specified", async () => {
        setupMocks();

        const program = createTestProgram();
        await program.parseAsync([
          "node",
          "test",
          "skill",
          "export",
          "--output",
          "custom/path",
        ]);

        const writeCalls = mockWriteFileSync.mock.calls;
        const paths = writeCalls.map((c) => c[0] as string);
        expect(paths.some((p) => p.includes("custom/path"))).toBe(true);
      });

      it("filters sections when --sections specified", async () => {
        setupMocks(
          [createMockComponent("Button")],
          [createMockToken("primary", "color", "#2563EB")],
          [createMockDrift("hardcoded-value", "warning")],
        );

        const program = createTestProgram();
        await program.parseAsync([
          "node",
          "test",
          "skill",
          "export",
          "--sections",
          "tokens",
        ]);

        const writeCalls = mockWriteFileSync.mock.calls;
        const paths = writeCalls.map((c) => c[0] as string);

        // Should have token files
        expect(paths.some((p) => p.includes("tokens/"))).toBe(true);
        // Should NOT have component files
        expect(paths.some((p) => p.includes("components/"))).toBe(false);
      });
    });

    describe("output generation", () => {
      it("generates SKILL.md", async () => {
        setupMocks();

        const program = createTestProgram();
        await program.parseAsync(["node", "test", "skill", "spill"]);

        const writeCalls = mockWriteFileSync.mock.calls;
        const paths = writeCalls.map((c) => c[0] as string);
        expect(paths.some((p) => p.endsWith("SKILL.md"))).toBe(true);
      });

      it("generates tokens/_index.md", async () => {
        setupMocks([], [createMockToken("primary", "color", "#2563EB")]);

        const program = createTestProgram();
        await program.parseAsync(["node", "test", "skill", "spill"]);

        const writeCalls = mockWriteFileSync.mock.calls;
        const paths = writeCalls.map((c) => c[0] as string);
        expect(paths.some((p) => p.includes("tokens/_index.md"))).toBe(true);
      });

      it("generates tokens/colors.md", async () => {
        setupMocks([], [createMockToken("primary", "color", "#2563EB")]);

        const program = createTestProgram();
        await program.parseAsync(["node", "test", "skill", "spill"]);

        const writeCalls = mockWriteFileSync.mock.calls;
        const paths = writeCalls.map((c) => c[0] as string);
        expect(paths.some((p) => p.includes("tokens/colors.md"))).toBe(true);
      });

      it("generates components/_inventory.md", async () => {
        setupMocks([createMockComponent("Button")]);

        const program = createTestProgram();
        await program.parseAsync(["node", "test", "skill", "spill"]);

        const writeCalls = mockWriteFileSync.mock.calls;
        const paths = writeCalls.map((c) => c[0] as string);
        expect(paths.some((p) => p.includes("components/_inventory.md"))).toBe(
          true,
        );
      });

      it("generates anti-patterns/_avoid.md", async () => {
        setupMocks([], [], [createMockDrift("hardcoded-value", "warning")]);

        const program = createTestProgram();
        await program.parseAsync(["node", "test", "skill", "spill"]);

        const writeCalls = mockWriteFileSync.mock.calls;
        const paths = writeCalls.map((c) => c[0] as string);
        expect(paths.some((p) => p.includes("anti-patterns/_avoid.md"))).toBe(
          true,
        );
      });
    });

    describe("error handling", () => {
      it("handles empty scan results gracefully", async () => {
        setupMocks([], [], []);

        const program = createTestProgram();
        await program.parseAsync(["node", "test", "skill", "spill"]);

        // Should still succeed and write files
        expect(mockWriteFileSync).toHaveBeenCalled();
      });

      it("reports errors on scan failure", async () => {
        mockGetConfigPath.mockReturnValue("/test/.buoy.yaml");
        mockLoadConfig.mockResolvedValue({
          config: createMockConfig(),
          configPath: "/test/.buoy.yaml",
        });

        const mockOrchestrator = {
          scan: vi.fn().mockRejectedValue(new Error("Scan failed")),
        };
        mockScanOrchestrator.mockImplementation(() => mockOrchestrator);

        const program = createTestProgram();

        try {
          await program.parseAsync(["node", "test", "skill", "export"]);
        } catch {
          // Expected due to exitOverride
        }

        expect(reporters.error).toHaveBeenCalledWith(
          expect.stringContaining("Scan failed"),
        );
      });

      it("shows success message on completion", async () => {
        setupMocks(
          [createMockComponent("Button")],
          [createMockToken("primary", "color", "#2563EB")],
        );

        const program = createTestProgram();
        await program.parseAsync(["node", "test", "skill", "spill"]);

        expect(reporters.success).toHaveBeenCalled();
      });
    });

    describe("content quality", () => {
      it("includes token values in output", async () => {
        setupMocks([], [createMockToken("primary", "color", "#2563EB")]);

        const program = createTestProgram();
        await program.parseAsync(["node", "test", "skill", "spill"]);

        const writeCalls = mockWriteFileSync.mock.calls;
        const colorFile = writeCalls.find((c) =>
          (c[0] as string).includes("colors.md"),
        );
        expect(colorFile).toBeDefined();
        expect(colorFile![1]).toContain("#2563EB");
      });

      it("includes component names in inventory", async () => {
        setupMocks([
          createMockComponent("Button"),
          createMockComponent("Card"),
        ]);

        const program = createTestProgram();
        await program.parseAsync(["node", "test", "skill", "spill"]);

        const writeCalls = mockWriteFileSync.mock.calls;
        const inventoryFile = writeCalls.find((c) =>
          (c[0] as string).includes("_inventory.md"),
        );
        expect(inventoryFile).toBeDefined();
        expect(inventoryFile![1]).toContain("Button");
        expect(inventoryFile![1]).toContain("Card");
      });
    });
  });
});
