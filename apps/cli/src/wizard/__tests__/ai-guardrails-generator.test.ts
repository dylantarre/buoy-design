import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setupAIGuardrails } from "../ai-guardrails-generator.js";

// Mock dependencies
vi.mock("fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

vi.mock("../menu.js", () => ({
  showMenu: vi.fn(),
  sectionHeader: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  bulletList: vi.fn(),
}));

vi.mock("../../scan/orchestrator.js", () => {
  const mockScanResult = {
    components: [
      {
        id: "component:Button",
        name: "Button",
        source: { type: "react", path: "src/Button.tsx" },
        props: [],
        variants: [],
        tokens: [],
        metadata: {},
      },
    ],
    tokens: [
      {
        id: "token:--color-primary",
        name: "--color-primary",
        category: "color",
        value: { type: "color", hex: "#3b82f6" },
        source: { type: "css", file: "tokens.css", line: 1 },
        metadata: {},
      },
      {
        id: "token:--spacing-4",
        name: "--spacing-4",
        category: "spacing",
        value: { type: "spacing", value: 16, unit: "px" },
        source: { type: "css", file: "tokens.css", line: 2 },
        metadata: {},
      },
    ],
    errors: [],
  };

  return {
    ScanOrchestrator: class MockScanOrchestrator {
      scan() {
        return Promise.resolve(mockScanResult);
      }
    },
  };
});

vi.mock("@buoy-design/core/analysis", () => {
  return {
    SemanticDiffEngine: class MockSemanticDiffEngine {
      analyzeComponents() {
        return { drifts: [] };
      }
    },
  };
});

vi.mock("../../services/context-generator.js", () => {
  return {
    generateContext: () => ({
      content: "## Design System Rules\n\nTest content",
      stats: { tokenCount: 2, componentCount: 1, antiPatternCount: 0 },
    }),
  };
});

import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  appendFileSync,
} from "fs";
import { showMenu } from "../menu.js";
import type { BuoyConfig } from "../../config/schema.js";

describe("AI Guardrails Generator", () => {
  const mockConfig: BuoyConfig = {
    sources: {
      react: { include: ["src/**/*.tsx"] },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no existing files
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue("{}");
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("setupAIGuardrails", () => {
    it("returns early when user selects skip", async () => {
      vi.mocked(showMenu).mockResolvedValueOnce("skip");

      const result = await setupAIGuardrails("/test/project", mockConfig);

      expect(result.skillExported).toBe(false);
      expect(result.contextGenerated).toBe(false);
    });

    it("exports skill when user selects skill option", async () => {
      vi.mocked(showMenu).mockResolvedValueOnce("skill");

      const result = await setupAIGuardrails("/test/project", mockConfig);

      expect(result.skillExported).toBe(true);
      expect(result.contextGenerated).toBe(false);
      expect(mkdirSync).toHaveBeenCalled();
      expect(writeFileSync).toHaveBeenCalled();
    });

    it("generates context when user selects context option", async () => {
      vi.mocked(showMenu).mockResolvedValueOnce("context");

      const result = await setupAIGuardrails("/test/project", mockConfig);

      expect(result.skillExported).toBe(false);
      expect(result.contextGenerated).toBe(true);
      expect(writeFileSync).toHaveBeenCalled();
    });

    it("exports both skill and context when user selects both", async () => {
      vi.mocked(showMenu).mockResolvedValueOnce("both");

      const result = await setupAIGuardrails("/test/project", mockConfig);

      expect(result.skillExported).toBe(true);
      expect(result.contextGenerated).toBe(true);
    });

    it("creates skill directory structure", async () => {
      vi.mocked(showMenu).mockResolvedValueOnce("skill");

      await setupAIGuardrails("/test/project", mockConfig);

      expect(mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining(".claude/skills/design-system"),
        { recursive: true },
      );
    });

    it("creates token reference files", async () => {
      vi.mocked(showMenu).mockResolvedValueOnce("skill");

      await setupAIGuardrails("/test/project", mockConfig);

      // Should create tokens directory and files
      expect(mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining("tokens"),
        { recursive: true },
      );
    });

    it("appends to existing CLAUDE.md", async () => {
      vi.mocked(showMenu).mockResolvedValueOnce("context");
      vi.mocked(existsSync).mockImplementation((path) => {
        if (String(path).includes("CLAUDE.md")) return true;
        return false;
      });
      vi.mocked(readFileSync).mockReturnValue("# Existing Content\n");

      await setupAIGuardrails("/test/project", mockConfig);

      // Check appendFileSync was called with CLAUDE.md path and design system content
      const appendCall = vi.mocked(appendFileSync).mock.calls[0];
      expect(appendCall).toBeDefined();
      expect(String(appendCall[0])).toContain("CLAUDE.md");
      expect(String(appendCall[1])).toContain("Design System Rules");
    });

    it("skips context if design system section already exists", async () => {
      vi.mocked(showMenu).mockResolvedValueOnce("context");
      vi.mocked(existsSync).mockImplementation((path) => {
        if (String(path).includes("CLAUDE.md")) return true;
        return false;
      });
      vi.mocked(readFileSync).mockReturnValue("## Design System Rules\n");

      const result = await setupAIGuardrails("/test/project", mockConfig);

      expect(result.contextGenerated).toBe(false);
      expect(appendFileSync).not.toHaveBeenCalled();
    });

    it("creates new CLAUDE.md if not exists", async () => {
      vi.mocked(showMenu).mockResolvedValueOnce("context");
      vi.mocked(existsSync).mockReturnValue(false);

      await setupAIGuardrails("/test/project", mockConfig);

      // Check writeFileSync was called with CLAUDE.md path and project instructions
      const writeCall = vi
        .mocked(writeFileSync)
        .mock.calls.find((call) => String(call[0]).includes("CLAUDE.md"));
      expect(writeCall).toBeDefined();
      expect(String(writeCall![1])).toContain("Project Instructions");
    });

    it("generates SKILL.md with correct structure", async () => {
      vi.mocked(showMenu).mockResolvedValueOnce("skill");

      await setupAIGuardrails("/test/project", mockConfig);

      const skillWriteCall = vi
        .mocked(writeFileSync)
        .mock.calls.find((call) => String(call[0]).includes("SKILL.md"));

      expect(skillWriteCall).toBeDefined();
      const content = skillWriteCall![1] as string;
      expect(content).toContain("---");
      expect(content).toContain("name:");
      expect(content).toContain("description:");
      expect(content).toContain("Quick Reference");
      expect(content).toContain("Rules");
    });

    it("includes tokens in SKILL.md", async () => {
      vi.mocked(showMenu).mockResolvedValueOnce("skill");

      await setupAIGuardrails("/test/project", mockConfig);

      const skillWriteCall = vi
        .mocked(writeFileSync)
        .mock.calls.find((call) => String(call[0]).includes("SKILL.md"));

      const content = skillWriteCall![1] as string;
      expect(content).toContain("--color-primary");
      expect(content).toContain("#3b82f6");
    });

    it("includes components in SKILL.md", async () => {
      vi.mocked(showMenu).mockResolvedValueOnce("skill");

      await setupAIGuardrails("/test/project", mockConfig);

      const skillWriteCall = vi
        .mocked(writeFileSync)
        .mock.calls.find((call) => String(call[0]).includes("SKILL.md"));

      const content = skillWriteCall![1] as string;
      expect(content).toContain("Button");
      expect(content).toContain("Components (1)");
    });

    it("gets project name from package.json", async () => {
      vi.mocked(showMenu).mockResolvedValueOnce("skill");
      vi.mocked(existsSync).mockImplementation((path) => {
        if (String(path).includes("package.json")) return true;
        return false;
      });
      vi.mocked(readFileSync).mockImplementation((path) => {
        if (String(path).includes("package.json")) {
          return JSON.stringify({ name: "@my-org/my-project" });
        }
        return "{}";
      });

      await setupAIGuardrails("/test/project", mockConfig);

      const skillWriteCall = vi
        .mocked(writeFileSync)
        .mock.calls.find((call) => String(call[0]).includes("SKILL.md"));

      const content = skillWriteCall![1] as string;
      expect(content).toContain("My Project");
    });
  });

  describe("skill content", () => {
    it("includes validation commands", async () => {
      vi.mocked(showMenu).mockResolvedValueOnce("skill");

      await setupAIGuardrails("/test/project", mockConfig);

      const skillWriteCall = vi
        .mocked(writeFileSync)
        .mock.calls.find((call) => String(call[0]).includes("SKILL.md"));

      const content = skillWriteCall![1] as string;
      expect(content).toContain("buoy check");
      expect(content).toContain("buoy show drift");
    });

    it("includes rules about hardcoding", async () => {
      vi.mocked(showMenu).mockResolvedValueOnce("skill");

      await setupAIGuardrails("/test/project", mockConfig);

      const skillWriteCall = vi
        .mocked(writeFileSync)
        .mock.calls.find((call) => String(call[0]).includes("SKILL.md"));

      const content = skillWriteCall![1] as string;
      expect(content).toContain("NEVER hardcode");
    });
  });

  describe("token files", () => {
    it("creates colors.md with token table", async () => {
      vi.mocked(showMenu).mockResolvedValueOnce("skill");

      await setupAIGuardrails("/test/project", mockConfig);

      const colorsWriteCall = vi
        .mocked(writeFileSync)
        .mock.calls.find((call) => String(call[0]).includes("colors.md"));

      expect(colorsWriteCall).toBeDefined();
      const content = colorsWriteCall![1] as string;
      expect(content).toContain("Color Tokens");
      expect(content).toContain("| Token | Value |");
      expect(content).toContain("--color-primary");
    });

    it("creates spacing.md with token table", async () => {
      vi.mocked(showMenu).mockResolvedValueOnce("skill");

      await setupAIGuardrails("/test/project", mockConfig);

      const spacingWriteCall = vi
        .mocked(writeFileSync)
        .mock.calls.find((call) => String(call[0]).includes("spacing.md"));

      expect(spacingWriteCall).toBeDefined();
      const content = spacingWriteCall![1] as string;
      expect(content).toContain("Spacing Tokens");
      expect(content).toContain("--spacing-4");
      expect(content).toContain("16px");
    });
  });
});
