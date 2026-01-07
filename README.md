# Buoy

**Catch design drift before it ships.**

AI coding tools are fast—but they don't know your design system. They'll write `#3b82f6` when you have `--color-primary`. They'll use `padding: 17px` when your spacing scale is multiples of 4.

Buoy watches for these issues and helps you fix them.

```
src/components/Button.tsx:24
  hardcoded-value: #3b82f6 → var(--color-primary) (92% match)
```

## Quick Start

```bash
# Interactive setup wizard
npx @buoy-design/cli begin

# Or see your design system immediately (zero config!)
npx @buoy-design/cli show all
```

No config needed. Buoy auto-detects your framework and starts working immediately.

## What It Catches

| Issue                       | Example                                     |
| --------------------------- | ------------------------------------------- |
| **Hardcoded colors**        | `#ff0000` instead of `var(--color-primary)` |
| **Arbitrary spacing**       | `padding: 17px` instead of design scale     |
| **Tailwind escape hatches** | `p-[13px]` instead of `p-4`                 |
| **Naming inconsistencies**  | `ButtonNew`, `ButtonV2`, `ButtonOld`        |
| **Framework sprawl**        | React + Vue + jQuery in same codebase       |
| **Detached components**     | Instances without main component            |

## Commands

```
buoy
├── show                    # Read design system info (for AI agents)
│   ├── components          # Components in codebase
│   ├── tokens              # Design tokens found
│   ├── drift               # Design system violations
│   ├── health              # Health score
│   ├── history             # Scan history
│   └── all                 # Everything combined
├── drift                   # Table/markdown/HTML/agent drift output
├── tokens                  # Generate/export design tokens (css/json/tailwind)
├── components              # Component discovery helpers
├── scan                    # Scan codebase for components/tokens
├── commands                # Install/list Claude slash commands
├── begin                   # Interactive wizard
├── dock                    # Configure project
│   ├── config              # Create buoy.config.mjs
│   ├── skills              # Create AI agent skills
│   ├── agents              # Set up AI agents
│   ├── context             # Generate CLAUDE.md context
│   └── hooks               # Set up git hooks
├── check                   # Pre-commit drift check
├── baseline                # Accept existing drift
├── fix                     # Suggest/apply fixes
├── plugins                 # Show available scanners
└── ship                    # Cloud features
    ├── login               # Authenticate
    ├── logout              # Sign out
    ├── status              # Account + bot + sync status
    ├── github              # Set up GitHub PR bot
    ├── gitlab              # Set up GitLab PR bot (soon)
    ├── billing             # Manage subscription
    └── plans               # Compare pricing
```

## For AI Agents

The `show` command outputs JSON for AI agents to consume:

```bash
# Get everything an AI agent needs
buoy show all --json

# Just drift signals
buoy show drift --json

# Components inventory
buoy show components --json
```

Example output:

```json
{
  "components": [...],
  "tokens": [...],
  "drift": {
    "signals": [...],
    "summary": { "total": 12, "critical": 2, "warning": 7, "info": 3 }
  },
  "health": { "score": 78 }
}
```

## Getting Started

### Interactive Wizard

```bash
buoy begin
```

Walks you through:

- **Framework detection** — Confirms what Buoy found
- **Token discovery** — Shows your design tokens
- **Quick scan** — Immediate drift report
- **CI setup** — GitHub Actions configuration
- **Figma connection** — Link your design files

### Configure Your Project

```bash
buoy dock
```

Smart walkthrough that sets up:

1. `buoy.config.mjs` — Project configuration
2. AI agent skills — For Claude Code, Copilot, etc.
3. CLAUDE.md context — Design system documentation
4. Git hooks — Pre-commit drift checking

### Configure severities per drift type

```js
// buoy.config.mjs
export default {
  project: { name: "my-app" },
  drift: {
    severity: {
      "hardcoded-value": "critical",
      "naming-inconsistency": "warning",
    },
  },
};
```

## Drift Detection

### Quick Check

```bash
buoy check
```

Fast pre-commit hook friendly. Exits with error code if drift found.

### Detailed Analysis

```bash
buoy show drift
```

```json
{
  "drifts": [
    {
      "type": "hardcoded-value",
      "severity": "warning",
      "file": "src/components/Button.tsx",
      "line": 24,
      "message": "#3b82f6 should use var(--color-primary)",
      "suggestion": "var(--color-primary)"
    }
  ]
}
```

### Fix Issues

```bash
buoy fix                    # Interactive fix suggestions
buoy fix --dry-run          # Preview changes
buoy fix --auto             # Auto-apply safe fixes
```

### Accept Existing Drift

For brownfield projects, baseline existing issues and only flag new ones:

```bash
buoy baseline               # Accept current drift
buoy check                  # Only fails on new drift
```

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
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npx @buoy-design/cli check
```

### PR Comments with Buoy Cloud

```bash
# Set up GitHub PR bot
buoy ship login
buoy ship github
```

The GitHub bot automatically comments on PRs with drift analysis.

## AI Guardrails

Keep AI coding assistants (Copilot, Claude, Cursor) aligned with your design system:

```bash
# Set up AI agents with design system context
buoy dock agents
```

Creates:

- **AI Skills** — Design system knowledge for Claude Code
- **Claude Hooks** — Auto-inject context at session start
- **CLAUDE.md** — Project-specific AI instructions

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
buoy dock config
```

Creates `buoy.config.mjs`:

```js
export default {
  project: { name: "my-app" },
  sources: {
    react: {
      enabled: true,
      include: ["src/**/*.tsx"],
      exclude: ["**/*.test.*"],
    },
    tokens: {
      enabled: true,
      files: ["design-tokens.css"],
    },
  },
};
```

## Buoy Cloud

Ship your drift detection to the cloud:

```bash
buoy ship login             # Authenticate
buoy ship status            # View account, bot, sync status
buoy ship github            # Set up GitHub PR bot
buoy ship billing           # Manage subscription
```

Features:

- **PR Bot** — Automatic comments on pull requests
- **Dashboard** — View drift trends over time
- **Team sync** — Share results across team members

## Supported Frameworks

**Components:** React, Vue, Svelte, Angular, Lit, Stencil, Alpine, HTMX

**Templates:** Blade, ERB, Twig, Razor, Jinja, Handlebars, EJS, Pug

**Tokens:** CSS variables, SCSS, Tailwind config, JSON, Style Dictionary

**Design Tools:** Figma (plugin + API integration)

## Philosophy

**Inform by default, block by choice.**

Buoy shows you what's happening without getting in your way. Teams adopt enforcement when they're ready:

```bash
buoy show drift             # Just show me
buoy check                  # Pre-commit check (fails on drift)
buoy check --fail-on critical   # Only fail on critical
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
node apps/cli/dist/bin.js show all
```

## Packages

| Package                 | Description                              |
| ----------------------- | ---------------------------------------- |
| `@buoy-design/cli`      | Command-line interface                   |
| `@buoy-design/core`     | Domain models and drift detection engine |
| `@buoy-design/scanners` | Framework-specific code scanners         |
| `@buoy-design/mcp`      | MCP server for AI agent integration      |
| `@buoy-design/db`       | SQLite persistence                       |

## License

MIT
