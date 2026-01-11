import { describe, it, expect } from "vitest";
import { BuoyConfigSchema } from "../schema.js";

describe("experimental config", () => {
  it("should accept experimental.repeatedPatternDetection", () => {
    const config = {
      project: { name: "test" },
      experimental: {
        repeatedPatternDetection: true,
      },
    };
    const result = BuoyConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.experimental?.repeatedPatternDetection).toBe(true);
    }
  });

  it("should accept drift.types configuration", () => {
    const config = {
      project: { name: "test" },
      drift: {
        types: {
          "repeated-pattern": {
            enabled: true,
            severity: "warning",
            minOccurrences: 5,
            matching: "tight",
          },
          "hardcoded-value": {
            enabled: false,
          },
        },
      },
    };
    const result = BuoyConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});
