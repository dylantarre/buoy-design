// apps/cli/src/config/__tests__/loader.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig, getConfigPath } from "../loader.js";
import { existsSync, readFileSync } from "fs";
import { resolve, basename } from "path";

// Mock fs module
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

describe("Config Loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getConfigPath", () => {
    it("finds buoy.config.mjs first", () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return String(path).endsWith("buoy.config.mjs");
      });

      const result = getConfigPath("/test/project");

      expect(result).toBe(resolve("/test/project", "buoy.config.mjs"));
    });

    it("finds buoy.config.js when mjs not present", () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return String(path).endsWith("buoy.config.js");
      });

      const result = getConfigPath("/test/project");

      expect(result).toBe(resolve("/test/project", "buoy.config.js"));
    });

    it("finds buoy.config.ts", () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return String(path).endsWith("buoy.config.ts");
      });

      const result = getConfigPath("/test/project");

      expect(result).toBe(resolve("/test/project", "buoy.config.ts"));
    });

    it("finds .buoyrc.json", () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return String(path).endsWith(".buoyrc.json");
      });

      const result = getConfigPath("/test/project");

      expect(result).toBe(resolve("/test/project", ".buoyrc.json"));
    });

    it("finds .buoyrc", () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return String(path).endsWith(".buoyrc");
      });

      const result = getConfigPath("/test/project");

      expect(result).toBe(resolve("/test/project", ".buoyrc"));
    });

    it("returns null when no config file exists", () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = getConfigPath("/test/project");

      expect(result).toBeNull();
    });

    it("uses cwd by default", () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const originalCwd = process.cwd();

      getConfigPath();

      expect(existsSync).toHaveBeenCalledWith(
        expect.stringContaining(originalCwd),
      );
    });
  });

  describe("loadConfig", () => {
    it("returns default config when no file exists", async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = await loadConfig("/test/project");

      expect(result.configPath).toBeNull();
      expect(result.config).toBeDefined();
      expect(result.config.project.name).toBe("project");
    });

    it("loads JSON config from .buoyrc.json", async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return String(path).endsWith(".buoyrc.json");
      });

      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          project: { name: "test-project" },
          sources: {},
        }),
      );

      const result = await loadConfig("/test/project");

      expect(result.configPath).toBe(resolve("/test/project", ".buoyrc.json"));
      expect(result.config.project.name).toBe("test-project");
    });

    it("loads JSON config from .buoyrc", async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return String(path).endsWith(".buoyrc");
      });

      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          project: { name: "rc-project" },
          sources: {},
        }),
      );

      const result = await loadConfig("/test/project");

      expect(result.configPath).toBe(resolve("/test/project", ".buoyrc"));
      expect(result.config.project.name).toBe("rc-project");
    });

    it("throws on invalid JSON", async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return String(path).endsWith(".buoyrc.json");
      });

      vi.mocked(readFileSync).mockReturnValue("{ invalid json }");

      await expect(loadConfig("/test/project")).rejects.toThrow(
        /Invalid JSON in/,
      );
    });

    it("throws on schema validation failure with helpful message", async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return String(path).endsWith(".buoyrc.json");
      });

      // Missing required 'project' field
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          invalidField: true,
        }),
      );

      await expect(loadConfig("/test/project")).rejects.toThrow(
        /Invalid config.*Configuration error/s,
      );
    });

    it("uses directory name as default project name", async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = await loadConfig("/path/to/my-app");

      expect(result.config.project.name).toBe("my-app");
    });
  });
});
