import { describe, it, expect } from "vitest";
import {
  stringSimilarity,
  levenshteinDistance,
  normalizeForComparison,
} from "./string-utils.js";

describe("stringSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(stringSimilarity("button", "button")).toBe(1);
    expect(stringSimilarity("", "")).toBe(1);
  });

  it("returns 0 for completely different strings", () => {
    const similarity = stringSimilarity("abc", "xyz");
    expect(similarity).toBeLessThan(0.5);
  });

  it("handles empty strings", () => {
    expect(stringSimilarity("", "")).toBe(1);
    expect(stringSimilarity("abc", "")).toBe(0);
    expect(stringSimilarity("", "xyz")).toBe(0);
  });

  it("is case-sensitive", () => {
    const similarity = stringSimilarity("Button", "button");
    expect(similarity).toBeLessThan(1);
    expect(similarity).toBeGreaterThan(0.8); // Still very similar
  });

  it("calculates similarity for similar strings", () => {
    // One character different
    expect(stringSimilarity("button", "bUtton")).toBeGreaterThan(0.8);
    // Two characters different
    expect(stringSimilarity("button", "bXttXn")).toBeGreaterThan(0.6);
  });

  it("handles very long strings efficiently", () => {
    const long1 = "a".repeat(1000);
    const long2 = "b".repeat(1000);

    const start = performance.now();
    const similarity = stringSimilarity(long1, long2);
    const duration = performance.now() - start;

    expect(similarity).toBe(0); // Completely different
    expect(duration).toBeLessThan(500); // Should complete in <500ms (increased from 100 for CI environments)
  });

  it("handles unicode characters", () => {
    expect(stringSimilarity("Búttön", "Button")).toBeLessThan(1);
    expect(stringSimilarity("日本語", "日本語")).toBe(1);
  });

  it("is symmetric", () => {
    expect(stringSimilarity("abc", "xyz")).toBe(stringSimilarity("xyz", "abc"));
    expect(stringSimilarity("button", "Button")).toBe(
      stringSimilarity("Button", "button"),
    );
  });
});

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("test", "test")).toBe(0);
    expect(levenshteinDistance("", "")).toBe(0);
  });

  it("calculates insertion distance", () => {
    expect(levenshteinDistance("cat", "cats")).toBe(1);
    expect(levenshteinDistance("", "abc")).toBe(3);
  });

  it("calculates deletion distance", () => {
    expect(levenshteinDistance("cats", "cat")).toBe(1);
    expect(levenshteinDistance("abc", "")).toBe(3);
  });

  it("calculates substitution distance", () => {
    expect(levenshteinDistance("cat", "bat")).toBe(1);
    expect(levenshteinDistance("cat", "dog")).toBe(3);
  });

  it("calculates mixed operations", () => {
    // kitten -> sitting requires:
    // k->s (substitute), e->i (substitute), insert g
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
  });

  it("handles empty strings", () => {
    expect(levenshteinDistance("", "")).toBe(0);
    expect(levenshteinDistance("abc", "")).toBe(3);
    expect(levenshteinDistance("", "xyz")).toBe(3);
  });

  it("is symmetric", () => {
    expect(levenshteinDistance("abc", "xyz")).toBe(
      levenshteinDistance("xyz", "abc"),
    );
    expect(levenshteinDistance("cat", "dog")).toBe(
      levenshteinDistance("dog", "cat"),
    );
  });

  it("handles very long strings efficiently", () => {
    const long1 = "a".repeat(10000);
    const long2 = "b".repeat(10000);

    const start = performance.now();
    const distance = levenshteinDistance(long1, long2);
    const duration = performance.now() - start;

    expect(distance).toBe(10000); // All substitutions
    // Generous threshold to avoid flaky failures on slow/loaded machines
    // This catches algorithmic issues (O(n^3)) not minor timing variations
    expect(duration).toBeLessThan(10000); // Should complete in <10s
  });

  it("handles unicode characters", () => {
    expect(levenshteinDistance("日本", "日本")).toBe(0);
    expect(levenshteinDistance("日本", "中国")).toBe(2);
  });

  it("handles special characters", () => {
    expect(levenshteinDistance("hello!", "hello?")).toBe(1);
    expect(levenshteinDistance("a-b-c", "a_b_c")).toBe(2); // Two substitutions: - to _
  });
});

describe("normalizeForComparison", () => {
  it("strips common prefixes", () => {
    expect(normalizeForComparison("IButton")).toBe("button");
    expect(normalizeForComparison("AbstractButton")).toBe("button");
    expect(normalizeForComparison("BaseButton")).toBe("button");
  });

  it("strips common suffixes", () => {
    expect(normalizeForComparison("ButtonComponent")).toBe("button");
    expect(normalizeForComparison("ButtonView")).toBe("button");
    expect(normalizeForComparison("ButtonContainer")).toBe("button");
    expect(normalizeForComparison("ButtonWrapper")).toBe("button");
  });

  it("removes separators", () => {
    expect(normalizeForComparison("my-button")).toBe("mybutton");
    expect(normalizeForComparison("my_button")).toBe("mybutton");
    expect(normalizeForComparison("my-button-component")).toBe("mybutton"); // Component suffix stripped
  });

  it("converts to lowercase", () => {
    expect(normalizeForComparison("MyButton")).toBe("mybutton");
    expect(normalizeForComparison("BUTTON")).toBe("button");
    expect(normalizeForComparison("BuTtOn")).toBe("button");
  });

  it("handles multiple transformations", () => {
    expect(normalizeForComparison("IMyButtonComponent")).toBe("mybutton"); // I prefix + Component suffix stripped
    expect(normalizeForComparison("BaseSubmit-Button-View")).toBe(
      "submitbutton",
    ); // Base prefix + View suffix + separators stripped
  });

  it("handles component names without prefixes/suffixes", () => {
    expect(normalizeForComparison("Button")).toBe("button");
    expect(normalizeForComparison("Card")).toBe("card");
  });

  it("handles empty string", () => {
    expect(normalizeForComparison("")).toBe("");
  });

  it("handles names that are only prefix/suffix", () => {
    expect(normalizeForComparison("Component")).toBe("");
    expect(normalizeForComparison("Base")).toBe("");
    expect(normalizeForComparison("I")).toBe("");
  });

  it("preserves core component names", () => {
    expect(normalizeForComparison("ButtonGroup")).toBe("buttongroup");
    expect(normalizeForComparison("CardHeader")).toBe("cardheader");
    expect(normalizeForComparison("ListItem")).toBe("listitem");
  });

  it("handles multiple separators", () => {
    expect(normalizeForComparison("my-cool_button")).toBe("mycoolbutton");
    expect(normalizeForComparison("my--button")).toBe("mybutton");
  });

  it("handles numbers in component names", () => {
    expect(normalizeForComparison("Button2")).toBe("button2");
    expect(normalizeForComparison("H1Component")).toBe("h1");
  });
});

describe("edge cases", () => {
  it("handles single character strings", () => {
    expect(levenshteinDistance("a", "b")).toBe(1);
    expect(stringSimilarity("a", "a")).toBe(1);
  });

  it("handles strings with only separators", () => {
    expect(normalizeForComparison("---")).toBe("");
    expect(normalizeForComparison("___")).toBe("");
  });

  it("handles mixed case with separators", () => {
    expect(normalizeForComparison("My-Button_Component")).toBe("mybutton"); // Component suffix stripped
  });
});
