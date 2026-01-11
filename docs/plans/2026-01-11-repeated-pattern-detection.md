# Repeated Pattern Detection

**Status:** Implemented (exact + tight matching modes)
**Feature flag:** Experimental

## Overview

Detect className patterns that repeat across the codebase and suggest extracting them into reusable components or utility classes.

```
src/components/Card.tsx:15
  repeated-pattern (experimental): "flex items-center gap-2"
  → Appears 5 times across 3 files
  → Consider extracting to a component
```

## Configuration

```js
// buoy.config.mjs
export default {
  experimental: {
    repeatedPatternDetection: true, // opt-in
  },
  drift: {
    types: {
      "repeated-pattern": {
        enabled: true,           // can disable even when experimental enabled
        severity: "info",        // info | warning | critical
        minOccurrences: 3,       // threshold before flagging
        matching: "exact",       // exact | tight | loose
      },
      // All other drift types also configurable:
      "hardcoded-value": { enabled: true, severity: "warning" },
      "naming-inconsistency": { enabled: false }, // disable entirely
      // ... etc
    }
  }
}
```

## CLI Usage

```bash
# Try without config changes
buoy show drift --experimental
buoy scan --experimental
buoy check --experimental

# Or enable in config for persistent use
```

The `--experimental` flag works on: `show`, `scan`, `check`, `fix`

## Matching Modes

### Exact (default)

Classes must match exactly, order ignored.

```
"flex gap-2 items-center" = "items-center flex gap-2"
"flex gap-2 items-center" ≠ "flex gap-4 items-center"
```

### Tight

Same core pattern, allows variation in common properties. Groups variants together and suggests component props.

```
These patterns:
  "flex items-center gap-2 shadow-sm"
  "flex items-center gap-2 shadow-lg"

→ Grouped as ONE pattern
→ Suggestion: "Consider component with 'shadow' prop"
```

**Variant categories (tight mode):**
- `shadow-{size}` — shadow-sm, shadow, shadow-md, shadow-lg, shadow-xl
- `rounded-{size}` — rounded-sm, rounded, rounded-md, etc.
- `gap-{size}`, `p-{size}`, `m-{size}` — spacing scale
- `text-{color}`, `bg-{color}` — color variants
- `{breakpoint}:*` — sm:, md:, lg:, xl: prefixes

### Loose

Reserved for future. Placeholder for fuzzy/subset matching.

## Detection Algorithm

```
1. EXTRACT
   Use existing extractors from class-pattern.ts:
   - extractStaticClassStrings() → cn(), clsx(), cva() calls
   - extractClassPatterns() → template literal patterns

2. NORMALIZE
   - Sort classes alphabetically
   - If tight mode: replace variants with {placeholder}
     "shadow-sm" → "shadow-{size}"

3. GROUP
   Hash normalized patterns, count occurrences
   Map<normalizedPattern, { count, locations, variants }>

4. FILTER
   Keep patterns where count >= minOccurrences

5. CLASSIFY
   Determine suggestion type:
   - 1-3 classes → "Consider a utility class"
   - 4+ classes → "Consider extracting to component"
   - Has variants → "Consider component with props: X, Y"
```

**What gets extracted:**
- `className="flex items-center gap-2"` ✓
- `cn("flex", "items-center", condition && "gap-2")` ✓ (static parts)
- `className={styles.card}` ✗ (CSS modules reference)
- `className={dynamicVar}` ✗ (fully dynamic)

## Drift Signal Structure

```typescript
{
  id: "drift:repeated-pattern:flex-gap-2-items-center:a1b2c3",
  type: "repeated-pattern",
  severity: "info",
  source: {
    entityType: "component",
    entityId: "pattern:flex-gap-2-items-center",
    entityName: "flex gap-2 items-center",
    location: "src/components/Card.tsx:15"  // first occurrence
  },
  message: "Pattern 'flex gap-2 items-center' appears 5 times",
  details: {
    occurrences: 5,
    locations: [
      "src/components/Card.tsx:15",
      "src/components/Badge.tsx:8",
      "src/pages/Dashboard.tsx:42",
    ],
    variants: ["gap-2", "gap-4"],  // if tight mode
    suggestions: [
      "Consider extracting to a reusable component",
      "Or create a utility class: .flex-row-centered"
    ]
  }
}
```

## CI Behavior

Experimental drift types **do not fail** `buoy check`. They report only.

| Config | --experimental | Result |
|--------|----------------|--------|
| Not set | Not passed | Feature disabled |
| Not set | Passed | Feature enabled for this run |
| `true` | Not passed | Feature enabled |
| `false` | Passed | Flag overrides, enabled |

## Files to Modify

```
packages/core/src/models/drift.ts
  └── Add "repeated-pattern" to DriftTypeSchema

packages/core/src/analysis/pattern-analyzer.ts (new)
  └── normalizeClassPattern()
  └── groupPatterns()
  └── detectRepeatedPatterns()

packages/scanners/src/extractors/class-pattern.ts
  └── Already exists - wire into pattern-analyzer

apps/cli/src/config/schema.ts
  └── Add experimental config
  └── Add per-type drift config

apps/cli/src/commands/*.ts (show, scan, check, fix)
  └── Add --experimental flag
```

## Broader Config Change

All drift types become enable/disable configurable:

```js
drift: {
  types: {
    "hardcoded-value": { enabled: true, severity: "warning" },
    "naming-inconsistency": { enabled: true, severity: "info" },
    "framework-sprawl": { enabled: false },
    "repeated-pattern": { enabled: true, minOccurrences: 3 },
    // ... all drift types
  }
}
```

When `enabled: false`, the analyzer is **skipped entirely** (not run then filtered).

## Future Considerations

- **Loose mode**: Subset/fuzzy matching for patterns with 80%+ class overlap
- **Library patterns**: Compare against known component patterns from shadcn/Radix/etc
- **Auto-fix**: Generate component extraction scaffolding
