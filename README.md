# Buoy

[![GitHub App](https://img.shields.io/badge/GitHub%20App-Marketplace-blue?logo=github)](https://github.com/marketplace/buoy-design)

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
npx @ahoybuoy/cli begin

# Or see your design system immediately (zero config!)
npx @ahoybuoy/cli show all
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
│   ├── config              # Create .buoy.yaml
│   ├── skills              # Create AI agent skills
│   ├── agents              # Set up AI agents
│   ├── context             # Generate CLAUDE.md context
│   └── hooks               # Set up hooks (--claude for self-validating AI)
├── check                   # Pre-commit drift check
├── baseline                # Accept existing drift
│   ├── create              # Create baseline (requires --reason)
│   ├── show                # View current baseline
│   ├── update              # Add new drift (requires --reason)
│   └── clear               # Remove baseline
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

1. `.buoy.yaml` — Project configuration
2. AI agent skills — For Claude Code, Copilot, etc.
3. CLAUDE.md context — Design system documentation
4. Git hooks — Pre-commit drift checking

### Configure severities per drift type

```yaml
# .buoy.yaml
project:
  name: my-app

drift:
  severity:
    hardcoded-value: critical
    naming-inconsistency: warning
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
buoy baseline create -r "Legacy code before design system"  # Accept current drift with reason
buoy baseline update -r "Third-party components"            # Add new drift to baseline
buoy baseline show                                          # View baseline with reasons
buoy check                                                  # Only fails on new drift
```

A reason is required when creating or updating baselines to maintain accountability.

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
      - run: npx @ahoybuoy/cli check
```

### PR Comments with Buoy Cloud

```bash
# Set up GitHub PR bot
buoy ahoy login
buoy ahoy github
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

### Self-Validating Agents (Claude Code)

Turn Claude Code into a self-correcting agent. When Claude writes a component, Buoy checks it and feeds corrections back automatically:

```bash
buoy dock hooks --claude
```

This installs a PostToolUse hook that:

1. Claude writes/edits a component file
2. Hook runs `buoy check` on the modified file
3. If drift detected, feedback returns to Claude
4. Claude self-corrects without prompting

Example feedback Claude receives:

```
⚠️ Design drift detected in Button.tsx:

• hardcoded-value: Component "Button" has 3 hardcoded colors: #3b82f6, #ffffff, #1e40af

Run `buoy show drift` for full details.
```

Works with React, Vue, Svelte, and Angular components. Skips test files and configs.

### MCP Server

The MCP server provides real-time design system context to AI agents:

```json
{
  "mcpServers": {
    "buoy": {
      "command": "npx",
      "args": ["@ahoybuoy/mcp", "serve"]
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

Creates `.buoy.yaml`:

```yaml
project:
  name: my-app

sources:
  react:
    enabled: true
    include:
      - src/**/*.tsx
    exclude:
      - "**/*.test.*"
  tokens:
    enabled: true
    files:
      - design-tokens.css
```

## Buoy Cloud

Ship your drift detection to the cloud:

```bash
buoy ahoy login             # Authenticate
buoy ahoy status            # View account, bot, sync status
buoy ahoy github            # Set up GitHub PR bot
buoy ahoy billing           # Manage subscription
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
| `@ahoybuoy/cli`      | Command-line interface                   |
| `@ahoybuoy/core`     | Domain models and drift detection engine |
| `@ahoybuoy/scanners` | Framework-specific code scanners         |
| `@ahoybuoy/mcp`      | MCP server for AI agent integration      |
| `@ahoybuoy/agents`   | Sub-agent definitions for AI assistants  |
| `@ahoybuoy/db`       | SQLite persistence for local scans       |

## License

MIT
