# @ahoybuoy/cli

Catch design drift before it ships. Buoy scans your codebase to find where AI-generated code diverges from your design system.

## Quick Start

```bash
npx @ahoybuoy/cli begin
```

This scans your project and walks you through setup.

## What It Finds

- **Hardcoded colors** like `#3b82f6` instead of design tokens
- **Magic numbers** like `padding: 17px` instead of spacing variables
- **AI-generated code** that ignores your team's patterns

## Commands

| Command | Purpose |
|---------|---------|
| `buoy begin` | Interactive setup wizard |
| `buoy show all` | Scan for components, tokens, and drift |
| `buoy check` | Pre-commit drift validation |
| `buoy fix` | Auto-fix drift issues |
| `buoy dock` | Configure project (agents, hooks, etc.) |
| `buoy ship` | Cloud features (login, GitHub bot, billing) |

## Fix Command

The `buoy fix` command suggests and applies fixes for design drift:

```bash
buoy fix                    # Preview fixable issues
buoy fix --dry-run          # Show detailed diffs
buoy fix --apply            # Apply high-confidence fixes
buoy fix --confidence=exact # Only exact matches (safest)
```

### Confidence Levels

| Level | Score | Description |
|-------|-------|-------------|
| **exact** | 100% | Value exactly matches a design token |
| **high** | 95-99% | Very close match, safe to auto-apply |
| **medium** | 70-94% | Close match, review recommended |
| **low** | <70% | Ambiguous, manual review required |

## AI Integration

Buoy works great with AI coding tools:

```bash
# Set up AI agents with design system context
buoy dock agents

# Generate CLAUDE.md context
buoy dock context
```

## Zero Config

Buoy auto-detects your framework (React, Vue, Svelte, Angular, Astro) and scans standard paths. No configuration required to get started.

## Links

- [Documentation](https://buoy.design/docs)
- [GitHub](https://github.com/ahoybuoy/buoy)
