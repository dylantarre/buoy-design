# Repeated Pattern Detection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add experimental `repeated-pattern` drift type that detects className patterns appearing 3+ times across the codebase.

**Architecture:** New analyzer in `packages/core/src/analysis/analyzers/` that extracts className strings, normalizes them (sort order), groups by occurrence, and generates drift signals. Wire into SemanticDiffEngine and gate behind `--experimental` flag.

**Tech Stack:** TypeScript, Zod for config schema, existing class-pattern.ts extractors

---

## Task 1: Add "repeated-pattern" drift type

**Files:**
- Modify: `packages/core/src/models/drift.ts`

**Step 1: Write the failing test**

Create test file:

```typescript
// packages/core/src/models/drift.test.ts
import { describe, it, expect } from "vitest";
import { DriftTypeSchema, getDefaultSeverity, DRIFT_TYPE_LABELS, DRIFT_TYPE_DESCRIPTIONS } from "./drift.js";

describe("repeated-pattern drift type", () => {
  it("should be a valid drift type", () => {
    const result = DriftTypeSchema.safeParse("repeated-pattern");
    expect(result.success).toBe(true);
  });

  it("should have info as default severity", () => {
    expect(getDefaultSeverity("repeated-pattern")).toBe("info");
  });

  it("should have a label", () => {
    expect(DRIFT_TYPE_LABELS["repeated-pattern"]).toBe("Repeated Pattern");
  });

  it("should have a description", () => {
    expect(DRIFT_TYPE_DESCRIPTIONS["repeated-pattern"]).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @ahoybuoy/core test -- drift.test.ts`
Expected: FAIL - "repeated-pattern" not in schema

**Step 3: Write minimal implementation**

In `packages/core/src/models/drift.ts`, add to DriftTypeSchema:

```typescript
export const DriftTypeSchema = z.enum([
  "deprecated-pattern",
  "accessibility-conflict",
  "semantic-mismatch",
  "orphaned-component",
  "orphaned-token",
  "value-divergence",
  "naming-inconsistency",
  "missing-documentation",
  "hardcoded-value",
  "framework-sprawl",
  "unused-component",
  "unused-token",
  "color-contrast",
  "repeated-pattern",  // ADD THIS
]);
```

Add to `getDefaultSeverity`:

```typescript
case "repeated-pattern":
  return "info";
```

Add to `DRIFT_TYPE_LABELS`:

```typescript
"repeated-pattern": "Repeated Pattern",
```

Add to `DRIFT_TYPE_DESCRIPTIONS`:

```typescript
"repeated-pattern":
  "ClassName pattern appears multiple times across the codebase and could be extracted into a component or utility class",
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @ahoybuoy/core test -- drift.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/src/models/drift.ts packages/core/src/models/drift.test.ts
git commit -m "feat(core): add repeated-pattern drift type"
```

---

## Task 2: Add experimental config schema

**Files:**
- Modify: `apps/cli/src/config/schema.ts`

**Step 1: Write the failing test**

```typescript
// apps/cli/src/config/__tests__/schema.test.ts
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
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @ahoybuoy/cli test -- schema.test.ts`
Expected: FAIL - experimental not in schema

**Step 3: Write minimal implementation**

In `apps/cli/src/config/schema.ts`, add:

```typescript
// Experimental features config
export const ExperimentalConfigSchema = z.object({
  repeatedPatternDetection: z.boolean().default(false),
}).default({});

// Per-drift-type config
export const DriftTypeConfigSchema = z.object({
  enabled: z.boolean().default(true),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  // Type-specific options
  minOccurrences: z.number().min(2).optional(), // for repeated-pattern
  matching: z.enum(['exact', 'tight', 'loose']).optional(), // for repeated-pattern
}).passthrough(); // Allow additional options

// Update DriftConfigSchema
export const DriftConfigSchema = z.object({
  ignore: z.array(DriftIgnoreSchema).default([]),
  severity: z.record(z.enum(['info', 'warning', 'critical'])).default({}),
  aggregation: AggregationConfigSchema.default({}),
  types: z.record(DriftTypeConfigSchema).default({}), // ADD THIS
});

// Update BuoyConfigSchema
export const BuoyConfigSchema = z.object({
  project: ProjectConfigSchema,
  sources: SourcesConfigSchema.default({}),
  drift: DriftConfigSchema.default({}),
  claude: ClaudeConfigSchema.default({}),
  output: OutputConfigSchema.default({}),
  experimental: ExperimentalConfigSchema.default({}), // ADD THIS
});

// Add types
export type ExperimentalConfig = z.infer<typeof ExperimentalConfigSchema>;
export type DriftTypeConfig = z.infer<typeof DriftTypeConfigSchema>;
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @ahoybuoy/cli test -- schema.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/cli/src/config/schema.ts apps/cli/src/config/__tests__/schema.test.ts
git commit -m "feat(cli): add experimental and per-drift-type config schema"
```

---

## Task 3: Create pattern-analyzer module

**Files:**
- Create: `packages/core/src/analysis/analyzers/pattern-analyzer.ts`
- Create: `packages/core/src/analysis/analyzers/pattern-analyzer.test.ts`
- Modify: `packages/core/src/analysis/analyzers/index.ts`

**Step 1: Write the failing test**

```typescript
// packages/core/src/analysis/analyzers/pattern-analyzer.test.ts
import { describe, it, expect } from "vitest";
import {
  normalizeClassPattern,
  groupPatterns,
  detectRepeatedPatterns,
  type ClassOccurrence,
} from "./pattern-analyzer.js";

describe("normalizeClassPattern", () => {
  it("should sort classes alphabetically", () => {
    expect(normalizeClassPattern("flex items-center gap-2")).toBe("flex gap-2 items-center");
  });

  it("should handle single class", () => {
    expect(normalizeClassPattern("flex")).toBe("flex");
  });

  it("should trim whitespace", () => {
    expect(normalizeClassPattern("  flex   gap-2  ")).toBe("flex gap-2");
  });
});

describe("groupPatterns", () => {
  it("should group identical patterns", () => {
    const occurrences: ClassOccurrence[] = [
      { classes: "flex gap-2", file: "a.tsx", line: 1 },
      { classes: "gap-2 flex", file: "b.tsx", line: 5 },
      { classes: "flex gap-2", file: "c.tsx", line: 10 },
    ];
    const groups = groupPatterns(occurrences, "exact");
    expect(groups.size).toBe(1);
    expect(groups.get("flex gap-2")?.length).toBe(3);
  });
});

describe("detectRepeatedPatterns", () => {
  it("should return patterns appearing 3+ times by default", () => {
    const occurrences: ClassOccurrence[] = [
      { classes: "flex gap-2", file: "a.tsx", line: 1 },
      { classes: "flex gap-2", file: "b.tsx", line: 5 },
      { classes: "flex gap-2", file: "c.tsx", line: 10 },
      { classes: "p-4", file: "d.tsx", line: 1 },
    ];
    const drifts = detectRepeatedPatterns(occurrences, { minOccurrences: 3 });
    expect(drifts.length).toBe(1);
    expect(drifts[0]!.message).toContain("flex gap-2");
    expect(drifts[0]!.message).toContain("3 times");
  });

  it("should respect minOccurrences option", () => {
    const occurrences: ClassOccurrence[] = [
      { classes: "flex gap-2", file: "a.tsx", line: 1 },
      { classes: "flex gap-2", file: "b.tsx", line: 5 },
    ];
    const drifts = detectRepeatedPatterns(occurrences, { minOccurrences: 2 });
    expect(drifts.length).toBe(1);
  });

  it("should suggest utility for simple patterns", () => {
    const occurrences: ClassOccurrence[] = [
      { classes: "flex", file: "a.tsx", line: 1 },
      { classes: "flex", file: "b.tsx", line: 5 },
      { classes: "flex", file: "c.tsx", line: 10 },
    ];
    const drifts = detectRepeatedPatterns(occurrences, { minOccurrences: 3 });
    expect(drifts[0]!.details.suggestions).toContain(
      expect.stringContaining("utility")
    );
  });

  it("should suggest component for complex patterns", () => {
    const occurrences: ClassOccurrence[] = [
      { classes: "flex items-center gap-2 text-sm font-medium", file: "a.tsx", line: 1 },
      { classes: "flex items-center gap-2 text-sm font-medium", file: "b.tsx", line: 5 },
      { classes: "flex items-center gap-2 text-sm font-medium", file: "c.tsx", line: 10 },
    ];
    const drifts = detectRepeatedPatterns(occurrences, { minOccurrences: 3 });
    expect(drifts[0]!.details.suggestions).toContain(
      expect.stringContaining("component")
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @ahoybuoy/core test -- pattern-analyzer.test.ts`
Expected: FAIL - module not found

**Step 3: Write minimal implementation**

```typescript
// packages/core/src/analysis/analyzers/pattern-analyzer.ts
/**
 * Pattern Analyzer
 *
 * Detects repeated className patterns across the codebase.
 * Suggests extracting common patterns into components or utility classes.
 */

import type { DriftSignal } from "../../models/index.js";
import { createDriftId } from "../../models/index.js";

export interface ClassOccurrence {
  classes: string;
  file: string;
  line: number;
}

export interface PatternAnalyzerOptions {
  minOccurrences?: number;
  matching?: "exact" | "tight" | "loose";
}

/**
 * Normalize a className string by sorting classes alphabetically.
 * "flex items-center gap-2" -> "flex gap-2 items-center"
 */
export function normalizeClassPattern(classes: string): string {
  return classes
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

/**
 * Group occurrences by normalized pattern.
 */
export function groupPatterns(
  occurrences: ClassOccurrence[],
  _matching: "exact" | "tight" | "loose" = "exact"
): Map<string, ClassOccurrence[]> {
  const groups = new Map<string, ClassOccurrence[]>();

  for (const occ of occurrences) {
    const normalized = normalizeClassPattern(occ.classes);
    if (!normalized) continue;

    const existing = groups.get(normalized) || [];
    existing.push(occ);
    groups.set(normalized, existing);
  }

  return groups;
}

/**
 * Detect repeated patterns and generate drift signals.
 */
export function detectRepeatedPatterns(
  occurrences: ClassOccurrence[],
  options: PatternAnalyzerOptions = {}
): DriftSignal[] {
  const { minOccurrences = 3, matching = "exact" } = options;
  const groups = groupPatterns(occurrences, matching);
  const drifts: DriftSignal[] = [];

  for (const [pattern, locations] of groups) {
    if (locations.length < minOccurrences) continue;

    const classCount = pattern.split(" ").length;
    const isSimple = classCount <= 3;
    const firstLocation = locations[0]!;

    const suggestions = isSimple
      ? ["Consider creating a utility class for this pattern"]
      : ["Consider extracting this pattern into a reusable component"];

    drifts.push({
      id: createDriftId("repeated-pattern", pattern.replace(/\s+/g, "-")),
      type: "repeated-pattern",
      severity: "info",
      source: {
        entityType: "component",
        entityId: `pattern:${pattern.replace(/\s+/g, "-")}`,
        entityName: pattern,
        location: `${firstLocation.file}:${firstLocation.line}`,
      },
      message: `Pattern "${pattern}" appears ${locations.length} times across ${new Set(locations.map(l => l.file)).size} files`,
      details: {
        occurrences: locations.length,
        locations: locations.map((l) => `${l.file}:${l.line}`),
        suggestions,
      },
      detectedAt: new Date(),
    });
  }

  return drifts;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @ahoybuoy/core test -- pattern-analyzer.test.ts`
Expected: PASS

**Step 5: Export from index**

In `packages/core/src/analysis/analyzers/index.ts`:

```typescript
export * from "./naming-analyzer.js";
export * from "./duplicate-detector.js";
export * from "./prop-analyzer.js";
export * from "./accessibility-analyzer.js";
export * from "./pattern-analyzer.js";  // ADD THIS
```

**Step 6: Commit**

```bash
git add packages/core/src/analysis/analyzers/pattern-analyzer.ts \
        packages/core/src/analysis/analyzers/pattern-analyzer.test.ts \
        packages/core/src/analysis/analyzers/index.ts
git commit -m "feat(core): add pattern-analyzer for repeated className detection"
```

---

## Task 4: Add --experimental flag to show command

**Files:**
- Modify: `apps/cli/src/commands/show.ts`

**Step 1: Write the failing test**

```typescript
// apps/cli/src/commands/__tests__/show.test.ts
import { describe, it, expect } from "vitest";
import { createShowCommand } from "../show.js";

describe("show command", () => {
  it("should have --experimental option", () => {
    const cmd = createShowCommand();
    const options = cmd.options.map(o => o.long);
    expect(options).toContain("--experimental");
  });

  it("drift subcommand should inherit --experimental", () => {
    const cmd = createShowCommand();
    const driftCmd = cmd.commands.find(c => c.name() === "drift");
    expect(driftCmd).toBeDefined();
    // Parent option should be accessible
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @ahoybuoy/cli test -- show.test.ts`
Expected: FAIL - --experimental not found

**Step 3: Write minimal implementation**

In `apps/cli/src/commands/show.ts`, add option to main command:

```typescript
export function createShowCommand(): Command {
  const cmd = new Command("show")
    .description("Show design system information")
    .option("--json", "Output as JSON (default)")
    .option("--no-cache", "Disable incremental scanning cache")
    .option("--experimental", "Enable experimental features");  // ADD THIS
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @ahoybuoy/cli test -- show.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/cli/src/commands/show.ts apps/cli/src/commands/__tests__/show.test.ts
git commit -m "feat(cli): add --experimental flag to show command"
```

---

## Task 5: Add --experimental flag to scan, check, fix commands

**Files:**
- Modify: `apps/cli/src/commands/scan.ts`
- Modify: `apps/cli/src/commands/check.ts`
- Modify: `apps/cli/src/commands/fix.ts`

**Step 1: Add flag to each command**

In `apps/cli/src/commands/scan.ts`:

```typescript
.option("--experimental", "Enable experimental features")
```

In `apps/cli/src/commands/check.ts`:

```typescript
.option("--experimental", "Enable experimental features")
```

In `apps/cli/src/commands/fix.ts`:

```typescript
.option("--experimental", "Enable experimental features")
```

**Step 2: Run tests**

Run: `pnpm --filter @ahoybuoy/cli test`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/cli/src/commands/scan.ts apps/cli/src/commands/check.ts apps/cli/src/commands/fix.ts
git commit -m "feat(cli): add --experimental flag to scan, check, fix commands"
```

---

## Task 6: Wire pattern detection into DriftAnalysisService

**Files:**
- Modify: `apps/cli/src/services/drift-analysis.ts`
- Read: `packages/scanners/src/extractors/class-pattern.ts` (use extractStaticClassStrings)

**Step 1: Write the failing test**

```typescript
// apps/cli/src/services/__tests__/drift-analysis.test.ts (add to existing)
import { describe, it, expect } from "vitest";

describe("DriftAnalysisService experimental features", () => {
  it("should detect repeated patterns when experimental enabled", async () => {
    // This test requires mocking file system
    // For now, test the integration point exists
    const { DriftAnalysisService } = await import("../drift-analysis.js");
    const service = new DriftAnalysisService({
      project: { name: "test" },
      experimental: { repeatedPatternDetection: true },
    });
    expect(service).toBeDefined();
  });
});
```

**Step 2: Implement pattern detection integration**

In `apps/cli/src/services/drift-analysis.ts`, add:

```typescript
import { detectRepeatedPatterns, type ClassOccurrence } from "@ahoybuoy/core";
import { extractStaticClassStrings } from "@ahoybuoy/scanners";
import { glob } from "glob";
import { readFile } from "fs/promises";

// In analyze() method, after other drift detection:

// Experimental: repeated pattern detection
if (this.config.experimental?.repeatedPatternDetection || options.experimental) {
  const patternConfig = this.config.drift?.types?.["repeated-pattern"] ?? {};
  if (patternConfig.enabled !== false) {
    const patternDrifts = await this.detectRepeatedPatterns(patternConfig);
    drifts.push(...patternDrifts);
  }
}

// Add private method:
private async detectRepeatedPatterns(config: {
  minOccurrences?: number;
  matching?: "exact" | "tight" | "loose";
}): Promise<DriftSignal[]> {
  const occurrences: ClassOccurrence[] = [];

  // Find all source files
  const patterns = ["**/*.tsx", "**/*.jsx", "**/*.vue", "**/*.svelte"];
  const ignore = ["**/node_modules/**", "**/dist/**", "**/.next/**"];

  const files = await glob(patterns, {
    cwd: process.cwd(),
    ignore,
    absolute: true
  });

  for (const file of files) {
    try {
      const content = await readFile(file, "utf-8");
      const relativePath = file.replace(process.cwd() + "/", "");

      // Extract static class strings
      const classStrings = extractStaticClassStrings(content);

      for (const cs of classStrings) {
        // Combine all classes into a single string
        const allClasses = cs.classes.join(" ");
        if (allClasses.trim()) {
          occurrences.push({
            classes: allClasses,
            file: relativePath,
            line: cs.line,
          });
        }
      }
    } catch {
      // Skip files that can't be read
    }
  }

  return detectRepeatedPatterns(occurrences, {
    minOccurrences: config.minOccurrences ?? 3,
    matching: config.matching ?? "exact",
  });
}
```

**Step 3: Run tests**

Run: `pnpm --filter @ahoybuoy/cli test`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/cli/src/services/drift-analysis.ts apps/cli/src/services/__tests__/drift-analysis.test.ts
git commit -m "feat(cli): wire pattern detection into DriftAnalysisService"
```

---

## Task 7: Update design doc and build

**Files:**
- Modify: `docs/plans/2026-01-11-repeated-pattern-detection.md`

**Step 1: Update status to "Implemented"**

**Step 2: Build and verify**

Run: `pnpm build`
Expected: SUCCESS

**Step 3: Manual test**

Run: `node apps/cli/dist/bin.js show drift --experimental`
Expected: Should show repeated-pattern drifts if any exist

**Step 4: Commit**

```bash
git add -f docs/plans/2026-01-11-repeated-pattern-detection.md
git commit -m "docs: mark repeated-pattern detection as implemented"
```

---

## Task 8: Add tight matching mode (stretch goal)

**Files:**
- Modify: `packages/core/src/analysis/analyzers/pattern-analyzer.ts`

**Step 1: Write the failing test**

```typescript
// Add to pattern-analyzer.test.ts
describe("tight matching mode", () => {
  it("should group patterns with shadow variants together", () => {
    const occurrences: ClassOccurrence[] = [
      { classes: "flex items-center shadow-sm", file: "a.tsx", line: 1 },
      { classes: "flex items-center shadow-lg", file: "b.tsx", line: 5 },
      { classes: "flex items-center shadow-xl", file: "c.tsx", line: 10 },
    ];
    const groups = groupPatterns(occurrences, "tight");
    expect(groups.size).toBe(1);
  });

  it("should identify variants in the result", () => {
    const occurrences: ClassOccurrence[] = [
      { classes: "flex gap-2", file: "a.tsx", line: 1 },
      { classes: "flex gap-4", file: "b.tsx", line: 5 },
      { classes: "flex gap-6", file: "c.tsx", line: 10 },
    ];
    const drifts = detectRepeatedPatterns(occurrences, {
      minOccurrences: 3,
      matching: "tight"
    });
    expect(drifts[0]!.details.variants).toContain("gap-2");
    expect(drifts[0]!.details.variants).toContain("gap-4");
  });
});
```

**Step 2: Implement tight matching**

Add variant categories and normalization:

```typescript
// Variant categories for tight matching
const VARIANT_PATTERNS = {
  shadow: /^shadow(-sm|-md|-lg|-xl|-2xl|-none)?$/,
  rounded: /^rounded(-sm|-md|-lg|-xl|-2xl|-full|-none)?$/,
  gap: /^gap-\d+$/,
  p: /^p[xytblr]?-\d+$/,
  m: /^m[xytblr]?-\d+$/,
  text: /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)$/,
  bg: /^bg-[a-z]+-\d+$/,
  textColor: /^text-[a-z]+-\d+$/,
};

function normalizeTight(classes: string): { normalized: string; variants: string[] } {
  const classList = classes.trim().split(/\s+/).filter(Boolean);
  const normalized: string[] = [];
  const variants: string[] = [];

  for (const cls of classList) {
    let matched = false;
    for (const [category, pattern] of Object.entries(VARIANT_PATTERNS)) {
      if (pattern.test(cls)) {
        normalized.push(`{${category}}`);
        variants.push(cls);
        matched = true;
        break;
      }
    }
    if (!matched) {
      normalized.push(cls);
    }
  }

  return {
    normalized: normalized.sort().join(" "),
    variants,
  };
}
```

**Step 3: Run tests**

Run: `pnpm --filter @ahoybuoy/core test -- pattern-analyzer.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/core/src/analysis/analyzers/pattern-analyzer.ts \
        packages/core/src/analysis/analyzers/pattern-analyzer.test.ts
git commit -m "feat(core): add tight matching mode for pattern detection"
```

---

## Summary

| Task | Description | Est. Time |
|------|-------------|-----------|
| 1 | Add repeated-pattern drift type | 5 min |
| 2 | Add experimental config schema | 10 min |
| 3 | Create pattern-analyzer module | 15 min |
| 4 | Add --experimental to show | 5 min |
| 5 | Add --experimental to scan/check/fix | 5 min |
| 6 | Wire into DriftAnalysisService | 15 min |
| 7 | Update docs and verify | 5 min |
| 8 | Tight matching (stretch) | 20 min |

**Total: ~80 minutes**
