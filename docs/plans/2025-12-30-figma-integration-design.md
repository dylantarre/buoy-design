# Design Token Integration Design

**Date:** 2025-12-30
**Status:** Phase 1-2 Complete, Phase 3 Pending
**Purpose:** Integrate Buoy with design tools (Figma, Tokens Studio) to detect drift between design tokens and code

---

## Approach: No Enterprise Required

Instead of requiring Figma Enterprise for the Variables REST API, we support:

1. **[Tokens Studio](https://tokens.studio/)** - Free Figma plugin, exports to JSON, syncs with Git
2. **[W3C DTCG Format](https://www.designtokens.org/TR/drafts/format/)** - Standard JSON format, tool-agnostic
3. **Style Dictionary** - Transform tokens to any format

This means designers export tokens → Buoy imports → compares with code.

---

## Research Summary

### Existing Tools Analyzed

#### 1. [Design Lint](https://github.com/destefanis/design-lint)
Open source Figma plugin that finds missing styles.

**What it checks:**
- Missing text styles (typography not using design system)
- Missing fill styles (colors not bound to variables)
- Missing stroke styles
- Missing effect styles (shadows, blurs)
- Invalid border radius values

**How it works:**
```
1. Traverses selected Figma nodes
2. Routes each node type to specific linting functions:
   - Text → checkType(), checkFills(), checkEffects(), checkStrokes()
   - Frame → checkFills(), checkEffects(), checkStrokes()
   - Rectangle → similar to Frame
   - Shape → lintShapeRules()
3. Each function checks if properties are bound to styles/variables
4. Creates error objects: { node, type, message, value }
5. Groups errors by node ID for display
```

**Key insight:** Checks if values are "bound" to design tokens, not just if they exist.

#### 2. [Figma Component Audit Widget](https://github.com/louriach/Figma-Widget-Design-system-audit)
Widget that audits design system completeness.

**What it audits:**
- **Quick scan:** Total pages, unique components, variants, missing metadata
- **Deep analysis:** Hardcoded properties, missing descriptions, publishing status

**Unbound properties detected:**
- Fill colors without variables
- Typography without variables
- Spacing without tokens
- Effects without styles
- Border radius/stroke width without variables

**Performance strategy:**
- Chunked loading (5 components at a time)
- Conditional rendering
- Warning thresholds (>100 components)

**Key insight:** "Unbound" = hardcoded value instead of design token reference.

---

## Supported Token Formats

### 1. W3C DTCG Format (Standard)

The [W3C Design Tokens Community Group](https://www.designtokens.org/TR/drafts/format/) format is the emerging standard.

**Structure:**
```json
{
  "colors": {
    "$type": "color",
    "primary": {
      "500": {
        "$value": "#3b82f6",
        "$description": "Primary brand color"
      }
    }
  },
  "spacing": {
    "$type": "dimension",
    "sm": { "$value": "8px" },
    "md": { "$value": "16px" }
  }
}
```

**Key rules:**
- `$value` is required (identifies a token)
- `$type` can be inherited from parent groups
- Aliases use curly braces: `{ "$value": "{colors.primary.500}" }`

**Token types:**
| Type | Example Value |
|------|---------------|
| `color` | `"#3b82f6"` or `{"components": [0.23, 0.51, 0.96]}` |
| `dimension` | `"16px"` or `{"value": 16, "unit": "px"}` |
| `fontFamily` | `"Inter"` or `["Inter", "sans-serif"]` |
| `fontWeight` | `700` or `"bold"` |
| `number` | `1.5` (unitless, e.g., line-height) |
| `duration` | `"200ms"` |
| `shadow` | `{ "color": "#000", "offsetX": "0px", ... }` |
| `border` | `{ "color": "#000", "width": "1px", "style": "solid" }` |
| `typography` | `{ "fontFamily": "Inter", "fontSize": "16px", ... }` |

### 2. Tokens Studio Format (Legacy)

[Tokens Studio](https://docs.tokens.studio/) uses a similar but slightly different format:

```json
{
  "colors": {
    "primary": {
      "500": {
        "value": "#3b82f6",
        "type": "color"
      }
    }
  },
  "spacing": {
    "sm": {
      "value": "8",
      "type": "spacing"
    }
  }
}
```

**Key differences from DTCG:**
- Uses `value` instead of `$value`
- Uses `type` instead of `$type`
- Spacing values are often unitless strings

### 3. Style Dictionary Format

[Style Dictionary](https://amzn.github.io/style-dictionary/) is the de-facto build tool:

```json
{
  "color": {
    "primary": {
      "500": { "value": "#3b82f6" }
    }
  }
}
```

Buoy will detect format automatically based on `$value` vs `value` presence.

---

## Workflow

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Tokens Studio  │     │                  │     │                  │
│   (Figma plugin) │────▶│   tokens.json    │────▶│   buoy compare   │
│                  │     │   (exported)     │     │                  │
└──────────────────┘     └──────────────────┘     └────────┬─────────┘
                                                           │
┌──────────────────┐                                       ▼
│   Your Code      │     ┌──────────────────┐     ┌──────────────────┐
│   (CSS/SCSS/JS)  │────▶│   buoy sweep      │────▶│   Drift Report   │
│                  │     │   (extract)      │     │                  │
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

**Designer workflow:**
1. Define tokens in Tokens Studio (Figma)
2. Export to `tokens.json` (or sync to Git repo)
3. Commit to repository

**Developer workflow:**
1. `buoy compare --tokens tokens.json`
2. See what's different between design and code
3. Fix drift or update tokens

## Figma Plugin (buoy-figma)

A Figma plugin that runs inside Figma - no export/import needed.

### What It Does

1. **Lint for unbound values** - Like Design Lint, but integrated with Buoy
2. **Compare against code** - Fetch code tokens from your repo and compare
3. **Show coverage** - Which tokens are actually used in code?
4. **Quick fixes** - Create missing variables from hardcoded values

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Figma Plugin (UI)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Lint Tab  │  │ Compare Tab │  │ Coverage Tab│         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└────────────────────────────┬────────────────────────────────┘
                             │ Plugin API
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Figma Sandbox                            │
│  • Traverse nodes                                           │
│  • Check variable bindings                                  │
│  • Read local variables                                     │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTP (optional)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                 Buoy API (optional)                         │
│  • Fetch code tokens from repo                              │
│  • Compare and return drift                                 │
└─────────────────────────────────────────────────────────────┘
```

### Plugin Features

#### 1. Lint Mode (Offline)
Works without any external connection - just like Design Lint.

```
Unbound Values Found: 23
━━━━━━━━━━━━━━━━━━━━━

⚠ Button/Primary
  └─ Fill: #3b82f6 (not bound to variable)

⚠ Card/Header
  └─ Font size: 24px (not bound to variable)
  └─ Corner radius: 8px (not bound to variable)

[Create Variables] [Ignore Selected]
```

#### 2. Compare Mode (Online)
Connects to your repo to compare against code tokens.

```
Token Comparison
━━━━━━━━━━━━━━━━

✓ Matching: 45 tokens
⚠ Changed:  3 tokens
✗ Missing:  2 tokens (in code, not in Figma)
+ Extra:    4 tokens (in Figma, not in code)

[Show Details] [Export Report]
```

#### 3. Coverage Mode
Shows which Figma variables are actually used in code.

```
Variable Usage
━━━━━━━━━━━━━━

colors/primary/500     ████████████████ 47 usages
colors/primary/600     ████████         23 usages
colors/accent/500      ██               5 usages
colors/deprecated/old  ░░               0 usages ⚠

[Show unused] [Export CSV]
```

### Tech Stack

```
figma-plugin/
├── manifest.json         # Plugin config
├── src/
│   ├── ui.tsx           # React UI (runs in iframe)
│   ├── code.ts          # Plugin sandbox code
│   ├── linting/
│   │   ├── fills.ts     # Check fill bindings
│   │   ├── text.ts      # Check text style bindings
│   │   ├── effects.ts   # Check effect bindings
│   │   └── radius.ts    # Check radius bindings
│   └── api/
│       └── client.ts    # Optional Buoy API client
└── package.json
```

**Dependencies:**
- `@figma/plugin-typings` - Figma API types
- `react` + `react-dom` - UI
- `@create-figma-plugin/ui` - Figma-styled components (optional)

### Linting Implementation

Based on [Design Lint](https://github.com/destefanis/design-lint):

```typescript
// Check if a fill is bound to a variable
function checkFills(node: SceneNode, errors: LintError[]): void {
  if (!('fills' in node)) return;

  const fills = node.fills as Paint[];
  if (!fills || fills.length === 0) return;

  // Check if fills are bound to variables
  const boundVariables = node.boundVariables?.fills;

  for (let i = 0; i < fills.length; i++) {
    const fill = fills[i];
    if (fill.visible === false) continue;

    // Skip if bound to a variable
    if (boundVariables?.[i]) continue;

    // Skip images/videos
    if (fill.type === 'IMAGE' || fill.type === 'VIDEO') continue;

    // This fill is not bound - it's hardcoded
    errors.push({
      node,
      type: 'fill',
      message: 'Fill not bound to variable',
      value: fill.type === 'SOLID' ? rgbToHex(fill.color) : 'gradient',
    });
  }
}
```

### Node Type Routing

```typescript
function lintNode(node: SceneNode): LintError[] {
  const errors: LintError[] = [];

  switch (node.type) {
    case 'TEXT':
      checkTextStyles(node, errors);
      checkFills(node, errors);
      checkEffects(node, errors);
      break;
    case 'FRAME':
    case 'COMPONENT':
    case 'INSTANCE':
      checkFills(node, errors);
      checkStrokes(node, errors);
      checkEffects(node, errors);
      checkRadius(node, errors);
      break;
    case 'RECTANGLE':
    case 'ELLIPSE':
    case 'POLYGON':
    case 'STAR':
    case 'VECTOR':
      checkFills(node, errors);
      checkStrokes(node, errors);
      checkEffects(node, errors);
      break;
    case 'LINE':
      checkStrokes(node, errors);
      break;
  }

  return errors;
}
```

---

## CLI Commands

### Primary Command: `buoy compare`

Compare design tokens (from JSON) against code tokens:

```bash
# Compare tokens.json against code
buoy compare --tokens tokens.json

# Compare with specific token sets
buoy compare --tokens tokens.json --set global --set components

# CI mode with exit codes
buoy compare --tokens tokens.json --fail-on changed

# Output as JSON for tooling
buoy compare --tokens tokens.json --json
```

### Supporting Commands

```bash
# Import and display tokens from a file
buoy tokens import tokens.json

# Show what tokens would be generated from code
buoy tokens extract --format dtcg

# Validate a tokens file
buoy tokens validate tokens.json
```

### Drift Types

| Drift Type | Description | Example |
|------------|-------------|---------|
| `token-missing` | Token in design but not in code | `colors.accent` not implemented |
| `token-changed` | Token exists but value differs | Design: `#3b82f6`, Code: `#2563eb` |
| `token-extra` | Token in code but not in design | `--legacy-blue` not in design file |
| `token-renamed` | Similar value, different name | Design: `primary-500`, Code: `blue-500` |
| `token-unused` | Token defined but never used | `--spacing-xxxl` has 0 usages |

---

## Implementation Plan

### Phase 1: Token JSON Parser

Create `packages/core/src/tokens/parser.ts`:

```typescript
export function parseTokenFile(content: string): DesignToken[] {
  const json = JSON.parse(content);

  // Auto-detect format
  const format = detectFormat(json);

  switch (format) {
    case 'dtcg':
      return parseDTCG(json);
    case 'tokens-studio':
      return parseTokensStudio(json);
    case 'style-dictionary':
      return parseStyleDictionary(json);
  }
}

function detectFormat(json: object): 'dtcg' | 'tokens-studio' | 'style-dictionary' {
  // DTCG uses $value
  if (hasNestedProperty(json, '$value')) return 'dtcg';
  // Tokens Studio uses value + type
  if (hasNestedProperty(json, 'type')) return 'tokens-studio';
  // Style Dictionary uses just value
  return 'style-dictionary';
}
```

### Phase 2: CLI Compare Command

Add `apps/cli/src/commands/compare.ts`:

```typescript
export function createCompareCommand(): Command {
  return new Command('compare')
    .description('Compare design tokens against code')
    .requiredOption('--tokens <path>', 'Path to tokens JSON file')
    .option('--set <names...>', 'Token sets to include')
    .option('--fail-on <types...>', 'Fail on drift types')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      // 1. Parse token file
      const designTokens = parseTokenFile(options.tokens);

      // 2. Scan code for tokens
      const codeTokens = await scanCodeTokens();

      // 3. Compare
      const drift = compareTokens(designTokens, codeTokens);

      // 4. Output
      displayDrift(drift, options);
    });
}
```

### Phase 3: Figma Plugin

Create `packages/figma-plugin/`:

```
packages/figma-plugin/
├── manifest.json
├── package.json
├── tsconfig.json
├── src/
│   ├── code.ts              # Runs in Figma sandbox
│   ├── ui.tsx               # React UI
│   ├── linting/
│   │   ├── index.ts         # Main linting orchestrator
│   │   ├── fills.ts         # Check fill bindings
│   │   ├── text.ts          # Check text bindings
│   │   ├── effects.ts       # Check effect bindings
│   │   ├── strokes.ts       # Check stroke bindings
│   │   └── radius.ts        # Check radius values
│   ├── comparison/
│   │   └── compare.ts       # Compare with code tokens
│   └── types.ts             # Shared types
└── esbuild.config.js
```

### Phase 4: Compare Mode (Plugin ↔ Code)

Two options for plugin-to-code comparison:

**Option A: Static tokens.json in repo**
```
1. Designer exports tokens.json from Figma
2. Developer commits to repo
3. Plugin fetches tokens.json from GitHub raw URL
4. Compare against local variables
```

**Option B: Buoy API**
```
1. Run `buoy serve` locally or use hosted API
2. API exposes /tokens endpoint
3. Plugin calls API to get code tokens
4. Compare in real-time
```

Recommend Option A first (simpler, no server needed).

---

## Output Formats

### Pull Output (Table)
```
Figma Tokens: design-system-v2
==============================

Colors (12)
  color/primary/500     #3b82f6     --color-primary-500
  color/primary/600     #2563eb     --color-primary-600
  ...

Spacing (8)
  spacing/xs            4px         --spacing-xs
  spacing/sm            8px         --spacing-sm
  ...
```

### Compare Output
```
Figma vs Code Comparison
========================

✓ Matched: 45 tokens
⚠ Changed: 3 tokens
  color/primary/500
    Figma:  #3b82f6
    Code:   #2563EB

✗ Missing from Figma: 2 tokens
  --color-accent
  --spacing-xl

+ Extra in Figma: 4 tokens
  color/semantic/success
  color/semantic/warning
  ...
```

### CI Output (JSON)
```json
{
  "matched": 45,
  "changed": 3,
  "missingFromFigma": 2,
  "extraInFigma": 4,
  "drift": [
    {
      "type": "figma-changed",
      "token": "color/primary/500",
      "figmaValue": "#3b82f6",
      "codeValue": "#2563eb"
    }
  ]
}
```

---

## Configuration

```javascript
// buoy.config.mjs
export default {
  figma: {
    // Required: access token
    accessToken: process.env.FIGMA_ACCESS_TOKEN,

    // Files to sync
    files: [
      { key: 'abc123', name: 'Design System' },
      { key: 'xyz789', name: 'Brand Tokens' },
    ],

    // Mode mapping
    modes: {
      'Light': 'default',
      'Dark': 'dark',
    },

    // Token naming
    codeSyntax: 'WEB',  // Use Figma's WEB code syntax

    // Ignore patterns
    ignore: [
      'deprecated/*',
      '_internal/*',
    ],
  }
}
```

---

## Decisions Made

### Plugin Distribution: Figma Community (Public)
Buoy is free, so the plugin should be free and public. Submit to Figma Community for discoverability.

### Token Matching: Cascading Strategy (All 3)

Use all matching strategies in order of confidence:

```
1. Exact name match (highest confidence)
   design: colors/primary/500
   code:   --colors-primary-500
   → MATCH (normalized names equal)

2. Value match (medium confidence)
   design: colors/primary/500 = #3b82f6
   code:   --brand-blue = #3b82f6
   → MATCH (same value, flag as "renamed")

3. Fuzzy match (lowest confidence)
   design: colors/primary/500 = #3b82f6
   code:   --primary-blue = #3B82F6
   → MATCH (case-insensitive, flag as "similar")
```

**Output shows confidence:**
```
Token Comparison
════════════════

Exact matches:     42 tokens
Renamed:            3 tokens (same value, different name)
Similar:            2 tokens (fuzzy match)
Missing in code:    5 tokens
Extra in code:      1 token
```

---

## Open Questions

1. **Mode/theme handling:** How to map Tokens Studio "sets" to code themes?
   - Separate token files per theme
   - Single file with mode prefixes
   - Use DTCG `$extensions` for mode data

2. **Alias resolution:** Should we resolve aliases or preserve references?
   - Resolved: easier to compare actual values
   - Preserved: shows semantic structure, catches broken refs

---

## Success Criteria

1. ✅ Import tokens from Tokens Studio / W3C DTCG JSON files
2. ✅ `buoy compare --tokens tokens.json` shows drift
3. ✅ CI mode with exit codes for automation
4. ✅ Figma plugin finds unbound/hardcoded values
5. ✅ Plugin compares Figma variables against code tokens
6. ✅ Works without Figma Enterprise

---

## Configuration

```javascript
// buoy.config.mjs
export default {
  tokens: {
    // Path to design tokens file
    source: './tokens/tokens.json',

    // Token set(s) to use
    sets: ['global', 'components'],

    // Format (auto-detected if not specified)
    format: 'dtcg', // or 'tokens-studio', 'style-dictionary'

    // How to match tokens to code
    matching: {
      // Normalize names for comparison
      normalizeName: (name) => name.toLowerCase().replace(/[\/\.]/g, '-'),

      // Ignore certain tokens
      ignore: ['deprecated/*', '_internal/*'],
    },
  }
}
```

---

## Implementation Status

### ✅ Phase 1: Token JSON Parser (Complete)

Implemented in `packages/core/src/tokens/parser.ts`:
- Auto-detects format (W3C DTCG, Tokens Studio, Style Dictionary)
- Parses all three formats into unified DesignToken model
- Handles nested tokens with type inheritance (DTCG `$type`)
- Preserves metadata (`$description`, `$deprecated`)
- 18 tests covering all parsing scenarios

### ✅ Phase 2: CLI Compare Command (Complete)

Implemented in `apps/cli/src/commands/compare.ts`:
- `buoy compare design-tokens.json` - Compare design tokens against codebase
- Cascading matching: exact name → value match → fuzzy match
- Detects: matches, value drift, missing tokens, orphans
- `--json` flag for machine-readable output
- `--strict` flag for CI (exit 1 if any drift)
- `--verbose` flag for detailed match information

Token comparison logic in `packages/core/src/tokens/comparison.ts`:
- 16 tests covering all comparison scenarios

### ⏳ Phase 3: Figma Plugin (Pending)

Not yet started. Will create Figma Community plugin for:
- Linting unbound values (like Design Lint)
- Comparing Figma variables against code tokens
- Showing token coverage

---

## References

- [Design Lint](https://github.com/destefanis/design-lint) - Linting patterns
- [Figma Component Audit](https://github.com/louriach/Figma-Widget-Design-system-audit) - Audit patterns
- [W3C DTCG Format](https://www.designtokens.org/TR/drafts/format/) - Standard token format
- [Tokens Studio](https://docs.tokens.studio/) - Free Figma plugin for tokens
- [Style Dictionary](https://amzn.github.io/style-dictionary/) - Token build tool
- [Figma Plugin API](https://www.figma.com/plugin-docs/) - Plugin development docs
