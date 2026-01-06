# Design Value Extraction & Drift Detection

## Overview

Enable Buoy to extract hardcoded design values from any template framework, generate design tokens from existing patterns, and detect drift when new code diverges from established tokens.

**Initial Target**: Lambgoat.Web (ASP.NET Razor with ~250 .cshtml files)
**Architecture**: Generic extractors that work across 40+ template types

## Multi-Framework Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              CSS Value Parser (generic)                     │
│   Extracts colors, spacing, fonts from any CSS text         │
│   Input: "color: #69c; padding: 16px"                       │
│   Output: [{ property: 'color', value: '#69c' }, ...]       │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ normalized CSS text
┌───────────────────────────┴─────────────────────────────────┐
│              Style Text Extractors (by syntax family)       │
├───────────────────┬───────────────────┬─────────────────────┤
│   HTML-like       │   JSX Objects     │   Directive-based   │
│   style="..."     │   style={{ }}     │   [style.x]="..."   │
├───────────────────┼───────────────────┼─────────────────────┤
│ Razor, Blade,     │ React, Solid,     │ Angular, Vue        │
│ ERB, Twig, PHP,   │ Qwik, Preact      │ bindings            │
│ EJS, Pug, Liquid, │                   │                     │
│ Jinja, Django,    │                   │                     │
│ Thymeleaf, etc.   │                   │                     │
└───────────────────┴───────────────────┴─────────────────────┘
```

### Syntax Families

| Family | Pattern | Frameworks |
|--------|---------|------------|
| HTML-like | `style="color: red"` | Razor, Blade, ERB, Twig, PHP, EJS, Pug, Liquid, Jinja, Django, Thymeleaf, Freemarker, Handlebars, Mustache, Nunjucks, Hugo, Jekyll, Eleventy |
| JSX Objects | `style={{ color: 'red' }}` | React, Solid, Qwik, Preact, Astro (JSX) |
| Vue Bindings | `:style="{ color: 'red' }"` | Vue |
| Angular Directives | `[style.color]="'red'"` | Angular |
| Svelte | `style:color="red"` | Svelte |

### Why This Works

1. **CSS parsing is universal** - Once you have `color: #69c`, parsing is identical everywhere
2. **Syntax families reduce complexity** - 3-4 extractors cover 40+ template types
3. **Framework-specific only when needed** - Angular's `[style.prop]` is the main edge case

## Phase 1: Extraction

### Sources to Scan

1. **CSS Files**
   - `wwwroot/css/site.css` (primary stylesheet)
   - Any additional CSS files in wwwroot

2. **Razor Templates**
   - `Views/**/*.cshtml`
   - `Areas/**/*.cshtml`
   - `Pages/**/*.cshtml` (if present)
   - `Shared/**/*.cshtml`

### Values to Extract

| Category | Patterns | Examples |
|----------|----------|----------|
| Colors | `#rgb`, `#rrggbb`, `rgb()`, `rgba()`, `hsl()`, named colors | `#69c`, `#0077cc`, `rgb(255,191,0)` |
| Spacing | `px`, `rem`, `em` values in margin/padding/gap | `16px`, `1rem`, `24px` |
| Font Sizes | `font-size` declarations | `14px`, `0.875rem` |
| Border Radius | `border-radius` values | `12px`, `0.5rem` |
| Font Families | `font-family` declarations | `"Helvetica Neue", sans-serif` |

### Extraction Approach

```typescript
interface ExtractedValue {
  value: string;           // Raw value: "#69c"
  property: string;        // CSS property: "color"
  location: {
    file: string;          // "Views/Home/Index.cshtml"
    line: number;          // 42
    context: 'inline' | 'css' | 'style-block';
  };
  occurrences: number;     // How many times this exact value appears
}
```

**Inline Style Regex** (for Razor):
```regex
style\s*=\s*["']([^"']+)["']
```

**CSS Property Extraction**:
```regex
(color|background(?:-color)?|border(?:-color)?|fill|stroke):\s*([^;}\n]+)
(margin|padding|gap|top|right|bottom|left|width|height):\s*([^;}\n]+)
font-size:\s*([^;}\n]+)
border-radius:\s*([^;}\n]+)
```

## Phase 2: Tokenization

### Token Structure

Following design-system-skills conventions (OKLCH colors, t-shirt spacing):

```css
:root {
  /* Colors - 11-step scale (50-950) */
  --color-primary-500: oklch(55% 0.12 230);   /* base #69c */
  --color-primary-700: oklch(37% 0.10 230);   /* hover #0077cc */
  --color-neutral-50: oklch(97% 0 0);         /* light bg #f7f7f7 */
  --color-neutral-900: oklch(20% 0 0);        /* text #333 */
  --color-accent-500: oklch(80% 0.15 85);     /* gold #FFBF00 */

  /* Spacing - t-shirt sizes */
  --spacing-xs: 4px;    /* 0.25rem */
  --spacing-sm: 8px;    /* 0.5rem */
  --spacing-md: 16px;   /* 1rem */
  --spacing-lg: 24px;   /* 1.5rem */
  --spacing-xl: 40px;   /* 2.5rem */
  --spacing-2xl: 64px;  /* 4rem */

  /* Typography */
  --font-size-xs: 10px;
  --font-size-sm: 13px;
  --font-size-base: 14px;
  --font-size-lg: 18px;
  --font-size-xl: 24px;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 12px;
  --radius-lg: 24px;
  --radius-full: 9999px;

  /* Semantic Aliases */
  --color-link: var(--color-primary-500);
  --color-link-hover: var(--color-primary-700);
  --color-text: var(--color-neutral-900);
  --color-bg: var(--color-neutral-50);
}
```

### Clustering Algorithm

1. **Group by property type** (colors, spacing, font-size, etc.)
2. **Cluster similar values**:
   - Colors: Delta E < 5 in OKLCH space
   - Spacing: Within 2px of each other
3. **Pick representative value** (most common in cluster)
4. **Assign token name** based on scale position

### Output

Generate `design-tokens.css` with extracted tokens:
```bash
buoy tokenize --output wwwroot/css/design-tokens.css
```

Also output JSON for tooling:
```json
{
  "colors": {
    "primary-500": { "value": "#69c", "oklch": "oklch(55% 0.12 230)", "occurrences": 47 }
  },
  "spacing": {
    "md": { "value": "16px", "occurrences": 123 }
  }
}
```

## Phase 3: Enforcement

### Drift Detection Rules

| Drift Type | Trigger | Severity |
|------------|---------|----------|
| `hardcoded-color` | Color value that matches a token | warning |
| `hardcoded-spacing` | Spacing value that matches a token | warning |
| `hardcoded-font-size` | Font size that matches a token | info |
| `unknown-value` | Value doesn't match any token | info |
| `deprecated-pattern` | Using old class/pattern | warning |

### Drift Signal Format

```typescript
interface DriftSignal {
  type: 'hardcoded-color' | 'hardcoded-spacing' | 'unknown-value' | ...;
  severity: 'info' | 'warning' | 'critical';
  location: {
    file: string;
    line: number;
    column: number;
  };
  found: string;           // "color: #0077cc"
  suggested?: string;      // "var(--color-primary-700)"
  message: string;
}
```

### CLI Output

```
$ buoy drift check

DRIFT REPORT - Lambgoat.Web
═══════════════════════════════════════════════════════════════

Views/Home/Index.cshtml:42
  ⚠ hardcoded-color: color: #0077cc
    → Use var(--color-primary-700)

Views/Shared/_Layout.cshtml:118
  ℹ unknown-spacing: margin: 17px
    → No matching token. Consider --spacing-md (16px) or --spacing-lg (24px)

wwwroot/css/site.css:256
  ⚠ hardcoded-spacing: padding: 16px
    → Use var(--spacing-md)

───────────────────────────────────────────────────────────────
Summary: 2 warnings, 1 info
```

### Enforcement Modes

Configure in `buoy.config.mjs`:

```javascript
export default {
  project: { name: 'Lambgoat.Web' },
  drift: {
    mode: 'warn',  // 'audit' | 'warn' | 'strict'
    severity: {
      'hardcoded-color': 'warning',
      'hardcoded-spacing': 'warning',
      'unknown-value': 'info',
    },
    ignore: [
      { type: 'hardcoded-color', pattern: '**/vendor/**' },
    ],
  },
};
```

| Mode | Behavior |
|------|----------|
| `audit` | Report all drift, exit 0 |
| `warn` | Report + exit 1 on critical |
| `strict` | Exit 1 on any warning or critical |

### CI Integration

```bash
# In GitHub Actions
- run: buoy lighthouse --fail-on warning
```

GitHub PR comment (via `--github-comment`):
```markdown
## Buoy Drift Report

| File | Issue | Suggestion |
|------|-------|------------|
| Views/Home/Index.cshtml:42 | hardcoded-color `#0077cc` | `var(--color-primary-700)` |
```

## Implementation Plan

### Step 1: CSS Value Parser (Generic Core)
- Create `packages/core/src/extraction/css-parser.ts`
- Parse CSS property-value pairs from any CSS text
- Extract colors, spacing, fonts, radii
- Return `ExtractedValue[]` with property metadata

```typescript
// packages/core/src/extraction/css-parser.ts
export function parseCssValues(cssText: string): ExtractedValue[];
export function normalizeColor(value: string): string;  // → oklch
export function normalizeSpacing(value: string): string; // → px
```

### Step 2: Style Text Extractors (By Syntax Family)
- Create `packages/scanners/src/extractors/` directory

```typescript
// packages/scanners/src/extractors/html-style.ts
// Covers: Razor, Blade, ERB, Twig, PHP, EJS, Pug, Liquid, etc.
export function extractHtmlStyleAttributes(content: string): StyleMatch[];

// packages/scanners/src/extractors/jsx-style.ts
// Covers: React, Solid, Qwik, Preact
export function extractJsxStyleObjects(content: string): StyleMatch[];

// packages/scanners/src/extractors/directive-style.ts
// Covers: Angular [style.x], Vue :style
export function extractDirectiveStyles(content: string): StyleMatch[];

// packages/scanners/src/extractors/svelte-style.ts
// Covers: Svelte style:prop
export function extractSvelteStyles(content: string): StyleMatch[];
```

### Step 3: Framework Router
- Create `packages/scanners/src/extractors/index.ts`
- Route template type to correct extractor(s)

```typescript
export function extractStyles(content: string, templateType: TemplateType): StyleMatch[] {
  switch (getSyntaxFamily(templateType)) {
    case 'html-like': return extractHtmlStyleAttributes(content);
    case 'jsx': return extractJsxStyleObjects(content);
    case 'directive': return extractDirectiveStyles(content);
    case 'svelte': return extractSvelteStyles(content);
  }
}
```

### Step 4: Token Generator
- Create `packages/core/src/tokenization/generator.ts`
- Cluster similar values (Delta E for colors, threshold for spacing)
- Output CSS custom properties and JSON

### Step 5: Drift Detector
- Extend `SemanticDiffEngine` to compare values against tokens
- Generate `DriftSignal` for hardcoded values with token matches

### Step 6: CLI Commands
- `buoy extract` - Show all hardcoded values found
- `buoy tokenize` - Generate tokens from extractions
- `buoy drift check` - Compare against established tokens

## Success Criteria

1. Running `buoy extract` on Lambgoat shows all inline styles and CSS values
2. Running `buoy tokenize` generates a valid `design-tokens.css`
3. Running `buoy drift check` reports hardcoded values that should use tokens
4. CI can block PRs with `buoy lighthouse --fail-on warning`
