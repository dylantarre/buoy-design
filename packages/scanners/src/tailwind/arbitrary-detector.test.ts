// packages/scanners/src/tailwind/arbitrary-detector.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ArbitraryValueDetector } from "./arbitrary-detector.js";
import * as fs from "fs";
import * as glob from "glob";

// Mock fs and glob
vi.mock("fs", () => ({
  readFileSync: vi.fn(),
}));

vi.mock("glob", () => ({
  glob: vi.fn(),
}));

describe("ArbitraryValueDetector", () => {
  const mockProjectRoot = "/test/project";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("detect", () => {
    it("detects hardcoded color values", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Button.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="bg-[#ff6b6b] text-[#333]">
          Button
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      const colorValues = values.filter((v) => v.type === "color");
      expect(colorValues).toHaveLength(2);
      expect(colorValues.map((v) => v.value)).toContain("#ff6b6b");
      expect(colorValues.map((v) => v.value)).toContain("#333");
    });

    it("detects rgb/rgba color values", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Card.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="bg-[rgb(255,107,107)] border-[rgba(0,0,0,0.5)]">
          Card
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      const colorValues = values.filter((v) => v.type === "color");
      expect(colorValues).toHaveLength(2);
    });

    it("ignores css variable references", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Theme.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="bg-[var(--primary-color)] text-[var(--text-color)]">
          Theme
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      const colorValues = values.filter((v) => v.type === "color");
      expect(colorValues).toHaveLength(0);
    });

    it("detects spacing arbitrary values", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Layout.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="p-[17px] m-[2rem] gap-[10px]">
          Layout
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      const spacingValues = values.filter((v) => v.type === "spacing");
      expect(spacingValues).toHaveLength(3);
      expect(spacingValues.map((v) => v.value)).toContain("17px");
      expect(spacingValues.map((v) => v.value)).toContain("2rem");
      expect(spacingValues.map((v) => v.value)).toContain("10px");
    });

    it("detects size arbitrary values", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Box.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="w-[100px] h-[50vh] min-w-[300px]">
          Box
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      const sizeValues = values.filter((v) => v.type === "size");
      expect(sizeValues).toHaveLength(3);
      expect(sizeValues.map((v) => v.value)).toContain("100px");
      expect(sizeValues.map((v) => v.value)).toContain("50vh");
      expect(sizeValues.map((v) => v.value)).toContain("300px");
    });

    it("detects font size arbitrary values", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Text.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <span className="text-[14px] text-[1.5rem]">
          Text
        </span>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      const sizeValues = values.filter((v) => v.type === "size");
      expect(sizeValues).toHaveLength(2);
    });

    it("provides correct line and column information", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Button.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(
        `line1\nline2\n<div className="bg-[#ff6b6b]">`,
      );

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      expect(values).toHaveLength(1);
      expect(values[0]!.line).toBe(3);
      expect(values[0]!.column).toBeGreaterThan(0);
    });

    it("returns empty array when no files match", async () => {
      vi.mocked(glob.glob).mockResolvedValue([]);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      expect(values).toEqual([]);
    });

    it("uses custom include patterns", async () => {
      vi.mocked(glob.glob).mockResolvedValue([]);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
        include: ["**/*.blade.php"],
      });

      await detector.detect();

      expect(glob.glob).toHaveBeenCalledWith(
        "**/*.blade.php",
        expect.objectContaining({ cwd: mockProjectRoot }),
      );
    });

    it("uses custom exclude patterns", async () => {
      vi.mocked(glob.glob).mockResolvedValue([]);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
        exclude: ["**/vendor/**"],
      });

      await detector.detect();

      expect(glob.glob).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          ignore: ["**/vendor/**"],
        }),
      );
    });

    it("deduplicates files from multiple patterns", async () => {
      vi.mocked(glob.glob)
        .mockResolvedValueOnce([
          "/test/project/src/Button.tsx",
          "/test/project/src/Card.tsx",
        ])
        .mockResolvedValueOnce([
          "/test/project/src/Button.tsx", // duplicate
          "/test/project/src/Modal.tsx",
        ]);

      vi.mocked(fs.readFileSync).mockReturnValue("");

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
        include: ["**/*.tsx", "**/*.jsx"],
      });

      await detector.detect();

      // readFileSync should be called 3 times (deduplicated)
      expect(fs.readFileSync).toHaveBeenCalledTimes(3);
    });
  });

  describe("detectAsDriftSignals", () => {
    it("converts arbitrary values to drift signals", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Button.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="bg-[#ff6b6b] p-[17px] w-[100px]">
          Button
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const signals = await detector.detectAsDriftSignals();

      // Should create drift signals grouped by type per file
      expect(signals.length).toBeGreaterThan(0);
      expect(signals.every((s) => s.type === "hardcoded-value")).toBe(true);
    });

    it("creates separate signals for each value type", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Mixed.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="bg-[#ff6b6b] p-[17px] w-[100px]">
          Mixed
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const signals = await detector.detectAsDriftSignals();

      // Should have signals for color, spacing, and size
      expect(signals).toHaveLength(3);
    });

    it("assigns warning severity to color values", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Color.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(
        `<div className="bg-[#ff6b6b]">`,
      );

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const signals = await detector.detectAsDriftSignals();
      const colorSignal = signals.find((s) =>
        s.details.actual?.includes("color"),
      );

      expect(colorSignal?.severity).toBe("warning");
    });

    it("assigns info severity to spacing/size values", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Spacing.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`<div className="p-[17px]">`);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const signals = await detector.detectAsDriftSignals();
      const spacingSignal = signals.find((s) =>
        s.details.actual?.includes("spacing"),
      );

      expect(spacingSignal?.severity).toBe("info");
    });

    it("includes example values in signal details", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Multi.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="bg-[#111] bg-[#222] bg-[#333] bg-[#444] bg-[#555] bg-[#666]">
          Multi
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const signals = await detector.detectAsDriftSignals();
      const colorSignal = signals.find((s) =>
        s.details.actual?.includes("color"),
      );

      expect(colorSignal?.details.suggestions).toBeDefined();
      expect(colorSignal?.details.suggestions?.[2]).toContain("bg-[#");
    });

    it("sets correct source location", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Button.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(
        `line1\nline2\n<div className="bg-[#ff6b6b]">`,
      );

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const signals = await detector.detectAsDriftSignals();

      expect(signals[0]!.source.location).toBe("src/Button.tsx:3");
    });
  });
});
