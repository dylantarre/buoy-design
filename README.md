# 🛟 Buoy

**Catch design drift before it ships.**

AI coding tools are fast—but they don't know your design system. They'll write `#3b82f6` when you have `--color-primary`. They'll use `padding: 17px` when your spacing scale is multiples of 4.

Buoy watches for these issues and helps you fix them.

```
src/components/Button.tsx:24
  ⚠ hardcoded-value: #3b82f6 → var(--color-primary) (92% match)
```

## Quick Start

```bash
# Interactive setup wizard
npx @buoy-design/cli begin

# Or jump straight in (zero config!)
npx @buoy-design/cli sweep
```

No config needed. Buoy auto-detects your framework and starts working immediately.

## What It Catches

| Issue | Example |
|-------|---------|
| **Hardcoded colors** | `#ff0000` instead of `var(--color-primary)` |
| **Arbitrary spacing** | `padding: 17px` instead of design scale |
| **Tailwind escape hatches** | `p-[13px]` instead of `p-4` |
| **Naming inconsistencies** | `ButtonNew`, `ButtonV2`, `ButtonOld` |
| **Framework sprawl** | React + Vue + jQuery in same codebase |
| **Detached components** | Instances without main component |

## Commands

### Getting Started

| Command | Purpose |
|---------|---------|
| `buoy begin` | Interactive wizard to get started with Buoy |
| `buoy sweep` | Scan components and tokens, visual health check |
| `buoy dock` | Initialize Buoy in your project |

### Drift Detection

| Command | Purpose |
|---------|---------|
| `buoy drift` | Detect and manage design system drift |
| `buoy check` | Fast pre-commit hook check |
| `buoy lighthouse` | CI mode with GitHub PR comments |
| `buoy fix` | Suggest and apply fixes for drift issues |
| `buoy baseline` | Accept current drift, flag only new issues |

### AI Integration

| Command | Purpose |
|---------|---------|
| `buoy onboard` | Set up AI guardrails (skills, hooks, CLAUDE.md) |
| `buoy skill` | Generate design system skills for AI agents |
| `buoy context` | Generate design system context for CLAUDE.md |
| `buoy explain [target]` | AI-powered investigation of drift |
| `buoy commands` | Install Claude Code slash commands |

### Design Tokens

| Command | Purpose |
|---------|---------|
| `buoy tokens` | Generate tokens from existing code |
| `buoy anchor` | Analyze code and establish design tokens |
| `buoy compare <file>` | Compare tokens against codebase |
| `buoy import <file>` | Import tokens from external sources |

### Analysis

| Command | Purpose |
|---------|---------|
| `buoy audit` | Full design system health audit |
| `buoy graph` | Build and query the design system knowledge graph |
| `buoy history` | View scan history and trends |
| `buoy learn` | Analyze drift history for patterns and learnings |
| `buoy plugins` | Show available scanners and plugins |

### Buoy Cloud

| Command | Purpose |
|---------|---------|
| `buoy login` | Authenticate with Buoy Cloud |
| `buoy link` | Connect project to Buoy Cloud |
| `buoy sync` | Sync scans to cloud dashboard |
| `buoy billing` | Manage subscription and billing |
| `buoy github` | Manage GitHub App integration |

## The `begin` Command

Interactive wizard that gets you up and running:

```bash
buoy begin
```

```
🛟 Welcome to Buoy

Let's get your project set up for design drift detection.

Scanning project...

✓ Detected frameworks:
  • React (package.json)
  • Tailwind CSS (tailwind.config.js)

✓ Found 2 token files:
  • src/styles/variables.css
  • tailwind.config.js

? What would you like to do?
  ❯ Run a quick scan to see current drift
    Set up CI integration
    Configure Figma connection
    Save configuration to buoy.config.mjs
```

The wizard walks you through:
- **Framework detection** — Confirms what Buoy found
- **Token discovery** — Shows your design tokens
- **Quick scan** — Immediate drift report
- **CI setup** — GitHub Actions configuration
- **Figma connection** — Link your design files

## The `sweep` Command

Get a quick visual health check:

```bash
buoy sweep
```

```
⚡ Zero-config mode
   Auto-detected:
   • React (package.json)
   • Tailwind CSS (tailwind.config.js)
   • 2 token file(s)

Component Coverage
                                    47/52 components · 90% aligned
⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛀ ⛁ ⛁
⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛀

✓ Good coverage. Minor drift to review.
```

## The `explain` Command

AI-powered investigation of your design system:

```bash
# Explain a specific file
buoy explain src/components/Button.tsx

# Explain specific drift
buoy explain drift:abc123

# Explain everything
buoy explain --all
```

Returns natural language explanations with fix suggestions.

## The `drift check` Command

Detailed drift analysis with actionable suggestions:

```bash
buoy drift check
```

```
━━━ CRITICAL (1) ━━━

! #1 Accessibility Issue
  Component: LoginForm
  Location:  src/components/LoginForm.tsx:42
  Issue:     Missing aria-label on interactive element

  Actions:
    1. Add aria-label to button element
    2. Run accessibility audit

━━━ WARNING (3) ━━━

~ #2 Using wrong color/size
  Component: Button
  Location:  src/components/Button.tsx:24
  Issue:     Hardcoded color #3b82f6 should use design token

  Actions:
    1. Replace hardcoded colors with design tokens
    2. Example: Change #3b82f6 → var(--color-primary)
```

### Output Formats

```bash
buoy drift check --json          # JSON for CI pipelines
buoy drift check --markdown      # Markdown for docs
buoy drift check --html          # HTML report (shareable with designers)
buoy drift check --agent         # Optimized for AI agents
```

The `--html` flag generates a beautiful, designer-friendly report:

```bash
buoy drift check --html report.html
# ✓ HTML report saved to report.html
```

### Ignoring Specific Lines

Use `// buoy-ignore` to skip detection on specific lines:

```tsx
// buoy-ignore
<div style={{ color: '#ff0000' }}>Intentionally hardcoded</div>

{/* buoy-ignore */}
<Box backgroundColor="#custom" />
```

## Figma Plugin

Buoy includes a Figma plugin that analyzes your design files:

- **Health Score** — See how well-structured your design system is
- **Color Analysis** — Find duplicate and similar colors
- **Typography Check** — Identify orphaned text nodes
- **Spacing Audit** — Verify consistent spacing scale
- **Auto Dashboard** — Creates a health report page in your Figma file

The plugin syncs with Buoy Cloud to keep designers and developers aligned.

## CI Integration

### GitHub Actions

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

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run Buoy
        run: npx @buoy-design/cli ci
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Options

```bash
buoy lighthouse                      # Comment on PR, don't fail
buoy lighthouse --fail-on critical   # Fail on critical issues only
buoy lighthouse --fail-on warning    # Strict mode
```

## AI Guardrails

Keep AI coding assistants (Copilot, Claude, Cursor) aligned with your design system:

```bash
# Full AI onboarding - skills, hooks, and CLAUDE.md
buoy onboard

# Install Claude Code hooks for auto-injection
buoy onboard --claude-hooks

# Run MCP server for real-time context
npx @buoy-design/mcp serve
```

### What `buoy onboard` Creates

- **AI Skill** - Design system knowledge for Claude Code
- **Claude Hooks** - Auto-inject context at session start
- **CLAUDE.md** - Project-specific AI instructions
- **Slash Commands** - `/contribution-loop` and more

### MCP Server

The MCP server provides real-time design system context to AI agents:

```json
{
  "mcpServers": {
    "buoy": {
      "command": "npx",
      "args": ["@buoy-design/mcp", "serve"]
    }
  }
}
```

**Resources:** `tokens://all`, `components://inventory`, `patterns://all`

**Tools:** `find_component`, `validate_code`, `resolve_token`, `suggest_fix`

## Configuration

Works without config, but you can save settings:

```bash
buoy dock
```

Creates `buoy.config.mjs`:

```js
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

## Supported Frameworks

**Components:** React, Vue, Svelte, Angular, Lit, Stencil, Alpine, HTMX

**Templates:** Blade, ERB, Twig, Razor, Jinja, Handlebars, EJS, Pug

**Tokens:** CSS variables, SCSS, Tailwind config, JSON, Style Dictionary

**Design Tools:** Figma (plugin + API integration)

## Philosophy

**Inform by default, block by choice.**

Buoy shows you what's happening without getting in your way. Teams adopt enforcement when they're ready:

```bash
buoy sweep                  # Just show me
buoy lighthouse                      # Comment on PR, don't fail
buoy lighthouse --fail-on critical   # Fail on critical only
buoy lighthouse --fail-on warning    # Strict mode
```

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Run CLI locally
node apps/cli/dist/bin.js sweep
```

## Packages

| Package | Description |
|---------|-------------|
| `@buoy-design/cli` | Command-line interface |
| `@buoy-design/core` | Domain models and drift detection engine |
| `@buoy-design/scanners` | Framework-specific code scanners |
| `@buoy-design/mcp` | MCP server for AI agent integration |
| `@buoy-design/db` | SQLite persistence |

## License

MIT
