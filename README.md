# Buoy

**Design system safety for AI-assisted development.**

AI coding tools are fast, but they don't know your design system. They'll write `#3b82f6` when you have `--color-primary`. They'll use `padding: 17px` when your spacing scale is multiples of 4.

Buoy catches these issues before they ship—and if you don't have a design system yet, it'll create one for you.

```
src/Button.tsx:24
  #3b82f6 → Use var(--color-primary) instead (92% match)
```

## Two Modes

### 1. Check Mode — You have a design system

Buoy scans your code and flags anything that doesn't use your tokens:

```bash
npx @buoy-design/cli status
```

```
Component Alignment
                                    47/52 components · 90% aligned
⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛀ ⛁ ⛁
⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛀

✓ Good alignment. Minor drift to review.
```

### 2. Architect Mode — You need a design system

Buoy analyzes your codebase and creates one:

```bash
npx @buoy-design/cli architect
```

```
Design System Diagnosis
───────────────────────

Maturity Score: ███░░░░░░░ 30/100
Level: Emerging

CSS Analysis
Unique Colors: 47
Unique Spacing Values: 23
Tokenization: 12%

Recommendations
  🔴 Create design tokens
     47 unique colors found. Consolidate to ~8-12 for consistency.

✓ Generated design-tokens.css
```

## Quick Start

```bash
# See your design system health
npx @buoy-design/cli status

# Get detailed drift report
npx @buoy-design/cli drift check

# Create a design system from scratch
npx @buoy-design/cli architect
```

No config needed. Buoy auto-detects your framework.

## What It Catches

| Issue | Example |
|-------|---------|
| **Hardcoded colors** | `#ff0000` instead of `var(--color-primary)` |
| **Arbitrary spacing** | `padding: 17px` instead of design scale |
| **Tailwind escape hatches** | `p-[13px]` instead of `p-4` |
| **Naming inconsistencies** | `ButtonNew`, `ButtonV2`, `ButtonOld` |
| **Framework mixing** | React + Vue + jQuery in same codebase |

## Commands

| Command | Purpose |
|---------|---------|
| `buoy status` | Visual health check |
| `buoy drift check` | Detailed issues with fix suggestions |
| `buoy architect` | Create design system + PR |
| `buoy tokens` | Generate tokens from existing code |
| `buoy ci` | CI mode with GitHub PR comments |
| `buoy baseline` | Accept current state, flag only new drift |

## CI Integration

```yaml
name: Design System Check
on: [pull_request]

jobs:
  buoy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: dylantarre/buoy@main
        with:
          mode: ci
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

Or run architect mode to auto-create design tokens:

```yaml
- uses: dylantarre/buoy@main
  with:
    mode: architect
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Architect Mode Details

The `architect` command does more than generate tokens—it diagnoses your entire design system maturity:

1. **Scans CSS** — extracts all hardcoded colors, spacing, fonts
2. **Analyzes git history** — understands team size and patterns
3. **Scores maturity** — 0-100 based on tokenization and consistency
4. **Recommends next steps** — tailored to your team size
5. **Creates PR** — with design tokens ready to merge

**Maturity Levels:**

| Score | Level | Meaning |
|-------|-------|---------|
| 80-100 | Optimized | Consistent tokens, good coverage |
| 60-79 | Managed | Most values tokenized |
| 40-59 | Defined | Some tokens, inconsistent usage |
| 20-39 | Emerging | Few tokens, mostly hardcoded |
| 0-19 | None | No design system detected |

**Team-Aware:**

- Small teams (1-3): Recommends simple color + spacing tokens
- Medium teams (4-10): Adds documentation and tooling suggestions
- Large teams (10+): Full governance and component library guidance

## Supported Frameworks

**Components:** React, Vue, Svelte, Angular, Lit, Stencil, Alpine, HTMX

**Templates:** Blade, ERB, Twig, Razor, Jinja, Handlebars, EJS, Pug

**Tokens:** CSS variables, SCSS, Tailwind config, JSON, Style Dictionary

**Design Tools:** Figma (optional integration)

## Configuration

Works without config, but you can save settings:

```bash
npx @buoy-design/cli init
```

```js
// buoy.config.mjs
export default {
  project: { name: 'my-app' },
  sources: {
    react: {
      enabled: true,
      include: ['src/**/*.tsx'],
      exclude: ['**/*.test.*'],
    },
    tokens: {
      enabled: true,
      files: ['design-tokens.css'],
    },
  },
};
```

## Philosophy

**Inform by default, block by choice.**

```bash
buoy status                  # Just show me
buoy ci                      # Comment on PR, don't fail
buoy ci --fail-on critical   # Fail on critical only
buoy ci --fail-on warning    # Strict mode
```

Teams adopt enforcement when they're ready.

## License

MIT
