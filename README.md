# Buoy

**Design drift detection for the AI era.**

Buoy catches when AI tools (Copilot, Claude, Cursor) and developers diverge from your design system—before code ships.

```bash
# Zero config. Just run it.
$ npx @buoy-design/cli status

⚡ Zero-config mode
   Auto-detected:
   • react (Found "react" in package.json)

Component Alignment
                                        47/52 components · 90% aligned
⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛀ ⛁ ⛁
⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛀
...

✓ Good alignment. Minor drift to review.
```

## Why Buoy?

**ESLint tells you a color is hardcoded. Buoy tells you which token it should be.**

- Compares code against your design system (not just syntax rules)
- Works across React, Vue, Svelte, Angular, templates
- Tracks alignment over time (not just point-in-time errors)
- Informs by default, blocks by choice

## Quick Start

```bash
# Run immediately - no config needed
npx @buoy-design/cli status

# See what tokens you should create
npx @buoy-design/cli tokens --dry-run

# Save configuration for your team
npx @buoy-design/cli init
```

## What It Detects

| Drift Type | Example |
|------------|---------|
| **Hardcoded values** | `#ff0000` instead of `var(--color-primary)` |
| **Naming inconsistencies** | `ButtonNew`, `ButtonV2`, `ButtonOld` |
| **Value divergence** | Code says `#3b82f6`, Figma says `#2563eb` |
| **Framework sprawl** | React + Vue + jQuery in one codebase |
| **Deprecated patterns** | Components marked `@deprecated` still in use |
| **Accessibility gaps** | Missing aria-labels on interactive elements |

## Commands

| Command | Description |
|---------|-------------|
| `buoy status` | Visual alignment grid (works without config) |
| `buoy scan` | Inventory components and tokens |
| `buoy tokens` | Generate design tokens from hardcoded values |
| `buoy drift check` | Detailed drift signals with fixes |
| `buoy ci` | CI output with exit codes + GitHub PR comments |
| `buoy init` | Save detected config to `buoy.config.mjs` |
| `buoy baseline` | Accept existing drift, track only new issues |

## Zero-Config Mode

Buoy auto-detects your project and runs immediately:

```bash
npx @buoy-design/cli status   # Works without buoy.config.mjs
npx @buoy-design/cli scan     # Auto-detects React, Vue, Svelte, etc.
npx @buoy-design/cli tokens   # Extracts tokens from your code
```

When you're ready to customize, run `buoy init` to save configuration.

## Generate Tokens From Your Code

Don't have a design system? Buoy extracts one from your existing code:

```bash
$ buoy tokens

⚡ Zero-config mode
   Auto-detected:
   • react

Token Generation
────────────────
Files scanned: 47
Values found: 156
Tokens generated: 42
Coverage: 89%

✓ Created design-tokens.css
```

Output formats: CSS variables, JSON, or Tailwind config.

## CI Integration

```bash
# Basic (exits 1 on critical issues)
buoy ci

# Strict mode (exits 1 on any warning)
buoy ci --fail-on warning

# Post results to GitHub PR
buoy ci --github-token $TOKEN --github-repo owner/repo --github-pr $PR_NUMBER
```

**GitHub Actions:**

```yaml
name: Design Drift
on: [pull_request]

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx @buoy-design/cli ci
```

## Supported Frameworks

**Components:** React, Vue, Svelte, Angular, Lit, Stencil, Alpine, HTMX

**Templates:** Blade, ERB, Twig, Razor, Jinja, Handlebars, EJS, Pug

**Tokens:** CSS variables, SCSS, Tailwind, JSON, Style Dictionary

**Design Tools:** Figma (optional, requires API key)

## Configuration

After `buoy init`:

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

**Buoy informs by default, blocks by choice.**

```bash
buoy status          # Just show me (default)
buoy ci              # Comment on PR, don't fail
buoy ci --fail-on critical   # Fail only on critical
buoy ci --fail-on warning    # Strict mode
```

Teams climb the enforcement ladder when they're ready.

## Documentation

- [CLAUDE.md](./CLAUDE.md) — Development guide
- [docs/ROADMAP.md](./docs/ROADMAP.md) — Planned features

## License

MIT
