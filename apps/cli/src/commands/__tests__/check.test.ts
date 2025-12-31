// apps/cli/src/commands/__tests__/check.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import {
  getStagedFiles,
  filterScannableFiles,
  isFromStagedFile,
} from "../check.js";
import type { DriftSignal } from "@buoy-design/core";

// Mock execSync for git commands
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

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
      vi.mocked(execSync).mockReturnValue("  src/Button.tsx  \n  src/Card.tsx  \n");

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
});
