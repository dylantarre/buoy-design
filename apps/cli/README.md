# @buoy-design/cli

Catch design drift before it ships. Buoy scans your codebase to find where AI-generated code diverges from your design system.

## Quick Start

```bash
npx @buoy-design/cli begin
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
| `buoy sweep` | Scan for components and tokens |
| `buoy drift check` | Detailed drift report |
| `buoy check` | Pre-commit validation |
| `buoy onboard` | Set up AI guardrails |

## AI Integration

Buoy works great with AI coding tools:

```bash
# Onboard AI to your design system (creates skills + updates CLAUDE.md)
buoy onboard

# Or run them separately:
buoy skill spill     # Generate skill files only
buoy context         # Update CLAUDE.md only
```

## CI/CD

Block PRs that introduce drift:

```bash
buoy lighthouse --init
```

## Zero Config

Buoy auto-detects your framework (React, Vue, Svelte, Angular, Astro) and scans standard paths. No configuration required to get started.

## Links

- [Documentation](https://buoy.design/docs)
- [GitHub](https://github.com/buoy-design/buoy)
