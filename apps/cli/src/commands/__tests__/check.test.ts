// apps/cli/src/commands/__tests__/check.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import {
  getStagedFiles,
  filterScannableFiles,
  isFromStagedFile,
  formatAiFeedback,
} from "../check.js";
import type { DriftSignal } from "@buoy-design/core";

// Mock execSync for git commands
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execSync: vi.fn(),
  };
});

describe("check command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getStagedFiles", () => {
    it("parses staged files from git output", () => {
      const mockGitOutput = "src/Button.tsx\nsrc/Card.tsx\npackage.json\n";
      vi.mocked(execSync).mockReturnValue(mockGitOutput);

      const files = getStagedFiles();

      expect(files).toEqual(["src/Button.tsx", "src/Card.tsx", "package.json"]);
    });

    it("returns empty array on git error", () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error("Not a git repository");
      });

      const result = getStagedFiles();

      expect(result).toEqual([]);
    });

    it("handles empty git output", () => {
      vi.mocked(execSync).mockReturnValue("");

      const result = getStagedFiles();

      expect(result).toEqual([]);
    });

    it("trims whitespace from file names", () => {
      vi.mocked(execSync).mockReturnValue(
        "  src/Button.tsx  \n  src/Card.tsx  \n",
      );

      const result = getStagedFiles();

      expect(result).toEqual(["src/Button.tsx", "src/Card.tsx"]);
    });
  });

  describe("filterScannableFiles", () => {
    it("includes React/TS files", () => {
      const files = ["src/Button.tsx", "src/utils.ts", "README.md"];
      const result = filterScannableFiles(files);
      expect(result).toEqual(["src/Button.tsx", "src/utils.ts"]);
    });

    it("includes Vue and Svelte files", () => {
      const files = ["src/Button.vue", "src/Card.svelte", "package.json"];
      const result = filterScannableFiles(files);
      expect(result).toContain("src/Button.vue");
      expect(result).toContain("src/Card.svelte");
    });

    it("includes token files", () => {
      const files = ["styles/tokens.css", "tokens/colors.json", "theme.scss"];
      const result = filterScannableFiles(files);
      expect(result).toHaveLength(3);
    });

    it("excludes non-scannable files", () => {
      const files = ["README.md", "LICENSE", ".gitignore", "image.png"];
      const result = filterScannableFiles(files);
      expect(result).toEqual([]);
    });

    it("includes template files", () => {
      const files = [
        "views/home.blade.php",
        "templates/layout.erb",
        "views/page.twig",
        "includes/header.njk",
      ];
      const result = filterScannableFiles(files);
      expect(result).toHaveLength(4);
    });
  });

  describe("isFromStagedFile", () => {
    const createMockDrift = (location?: string): DriftSignal => ({
      id: "test-drift",
      type: "hardcoded-value",
      severity: "warning",
      source: {
        entityType: "component",
        entityId: "test",
        entityName: "Button",
        location: location ?? "",
      },
      message: "Test drift",
      details: {},
      detectedAt: new Date(),
    });

    it("matches exact file path", () => {
      const drift = createMockDrift("src/Button.tsx:10");
      const stagedFiles = ["src/Button.tsx"];

      expect(isFromStagedFile(drift, stagedFiles)).toBe(true);
    });

    it("returns true for drifts without location", () => {
      const drift = createMockDrift(undefined);
      const stagedFiles = ["src/Card.tsx"];

      expect(isFromStagedFile(drift, stagedFiles)).toBe(true);
    });

    it("returns false when file not in staged list", () => {
      const drift = createMockDrift("src/Button.tsx:10");
      const stagedFiles = ["src/Card.tsx", "src/Modal.tsx"];

      expect(isFromStagedFile(drift, stagedFiles)).toBe(false);
    });

    it("handles partial path matches", () => {
      const drift = createMockDrift("components/Button.tsx:5");
      const stagedFiles = ["src/components/Button.tsx"];

      // Should match because stagedFile ends with the drift's file path
      expect(isFromStagedFile(drift, stagedFiles)).toBe(true);
    });
  });

  describe("exit codes", () => {
    const SEVERITY_ORDER = {
      info: 0,
      warning: 1,
      critical: 2,
    };

    type Severity = "info" | "warning" | "critical";

    function calculateExitCode(
      drifts: Array<{ severity: Severity }>,
      failOn: Severity | "none",
    ): number {
      if (failOn === "none") return 0;

      const threshold = SEVERITY_ORDER[failOn];
      const hasFailure = drifts.some(
        (d) => SEVERITY_ORDER[d.severity] >= threshold,
      );
      return hasFailure ? 1 : 0;
    }

    it("returns 0 when fail-on is none", () => {
      const drifts = [{ severity: "critical" as Severity }];
      expect(calculateExitCode(drifts, "none")).toBe(0);
    });

    it("returns 1 when critical drift found with fail-on critical", () => {
      const drifts = [{ severity: "critical" as Severity }];
      expect(calculateExitCode(drifts, "critical")).toBe(1);
    });

    it("returns 0 when only warnings with fail-on critical", () => {
      const drifts = [{ severity: "warning" as Severity }];
      expect(calculateExitCode(drifts, "critical")).toBe(0);
    });

    it("returns 1 when warning found with fail-on warning", () => {
      const drifts = [{ severity: "warning" as Severity }];
      expect(calculateExitCode(drifts, "warning")).toBe(1);
    });

    it("returns 1 when critical found with fail-on warning", () => {
      const drifts = [{ severity: "critical" as Severity }];
      expect(calculateExitCode(drifts, "warning")).toBe(1);
    });

    it("returns 0 when only info with fail-on warning", () => {
      const drifts = [{ severity: "info" as Severity }];
      expect(calculateExitCode(drifts, "warning")).toBe(0);
    });

    it("returns 1 when any drift with fail-on info", () => {
      const drifts = [{ severity: "info" as Severity }];
      expect(calculateExitCode(drifts, "info")).toBe(1);
    });

    it("returns 0 when no drifts", () => {
      expect(calculateExitCode([], "critical")).toBe(0);
      expect(calculateExitCode([], "warning")).toBe(0);
      expect(calculateExitCode([], "info")).toBe(0);
    });
  });

  describe("formatAiFeedback", () => {
    const createMockDrift = (
      overrides?: Partial<DriftSignal>,
    ): DriftSignal => ({
      id: "test-drift",
      type: "hardcoded-value",
      severity: "warning",
      source: {
        entityType: "component",
        entityId: "test",
        entityName: "Button",
        location: "src/Button.tsx:10:5",
      },
      message: "Hardcoded color #ff0000",
      details: {
        actual: "#ff0000",
        suggestions: ["color-error", "color-danger"],
      },
      detectedAt: new Date(),
      ...overrides,
    });

    it("returns valid JSON", () => {
      const drifts = [createMockDrift()];
      const summary = { critical: 0, warning: 1, info: 0, total: 1 };

      const result = formatAiFeedback(drifts, 1, summary);
      const parsed = JSON.parse(result);

      expect(parsed).toHaveProperty("passed");
      expect(parsed).toHaveProperty("issues");
      expect(parsed).toHaveProperty("summary");
      expect(parsed).toHaveProperty("instructions");
    });

    it("sets passed to true when exitCode is 0", () => {
      const summary = { critical: 0, warning: 0, info: 0, total: 0 };

      const result = formatAiFeedback([], 0, summary);
      const parsed = JSON.parse(result);

      expect(parsed.passed).toBe(true);
    });

    it("sets passed to false when exitCode is 1", () => {
      const drifts = [createMockDrift()];
      const summary = { critical: 0, warning: 1, info: 0, total: 1 };

      const result = formatAiFeedback(drifts, 1, summary);
      const parsed = JSON.parse(result);

      expect(parsed.passed).toBe(false);
    });

    it("includes file, line, and column from location", () => {
      const drifts = [createMockDrift()];
      const summary = { critical: 0, warning: 1, info: 0, total: 1 };

      const result = formatAiFeedback(drifts, 1, summary);
      const parsed = JSON.parse(result);

      expect(parsed.issues[0].file).toBe("src/Button.tsx");
      expect(parsed.issues[0].line).toBe(10);
      expect(parsed.issues[0].column).toBe(5);
    });

    it("includes fix object when suggestions available", () => {
      const drifts = [createMockDrift()];
      const summary = { critical: 0, warning: 1, info: 0, total: 1 };

      const result = formatAiFeedback(drifts, 1, summary);
      const parsed = JSON.parse(result);

      expect(parsed.issues[0].fix).toEqual({
        type: "replace",
        old: "#ff0000",
        new: "color-error",
        snippet: expect.stringContaining("src/Button.tsx"),
      });
    });

    it("uses first suggestion from suggestions array", () => {
      const drifts = [
        createMockDrift({
          details: {
            actual: "#123456",
            suggestions: ["color-primary", "color-secondary"],
          },
        }),
      ];
      const summary = { critical: 0, warning: 1, info: 0, total: 1 };

      const result = formatAiFeedback(drifts, 1, summary);
      const parsed = JSON.parse(result);

      expect(parsed.issues[0].suggested).toBe("color-primary");
    });

    it("includes summary counts", () => {
      const drifts = [
        createMockDrift({ severity: "critical" }),
        createMockDrift({ severity: "warning" }),
        createMockDrift({ severity: "info" }),
      ];
      const summary = { critical: 1, warning: 1, info: 1, total: 3 };

      const result = formatAiFeedback(drifts, 1, summary);
      const parsed = JSON.parse(result);

      expect(parsed.summary.total).toBe(3);
      expect(parsed.summary.critical).toBe(1);
      expect(parsed.summary.warning).toBe(1);
      expect(parsed.summary.info).toBe(1);
    });

    it("counts fixable issues correctly", () => {
      const drifts = [
        createMockDrift({ details: { suggestions: ["token-1"] } }),
        createMockDrift({ details: {} }), // No suggestions
      ];
      const summary = { critical: 0, warning: 2, info: 0, total: 2 };

      const result = formatAiFeedback(drifts, 1, summary);
      const parsed = JSON.parse(result);

      expect(parsed.summary.fixable).toBe(1);
    });

    it("provides success instructions when passed", () => {
      const summary = { critical: 0, warning: 0, info: 0, total: 0 };

      const result = formatAiFeedback([], 0, summary);
      const parsed = JSON.parse(result);

      expect(parsed.instructions).toContain("passed");
    });

    it("provides fix instructions when failed", () => {
      const drifts = [createMockDrift()];
      const summary = { critical: 0, warning: 1, info: 0, total: 1 };

      const result = formatAiFeedback(drifts, 1, summary);
      const parsed = JSON.parse(result);

      expect(parsed.instructions).toContain("violations detected");
      expect(parsed.instructions).toContain("buoy check");
    });
  });
});
