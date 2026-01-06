# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Buoy is a design drift detection tool for AI-generated code. It scans codebases to catch when developers (especially AI tools like Copilot/Claude) diverge from design system patterns before code ships.

## Common Commands

```bash
# Build all packages (required before running CLI)
pnpm build

# Build specific package
pnpm --filter @buoy/cli build
pnpm --filter @buoy/core build

# Run CLI locally (after building)
node apps/cli/dist/bin.js <command>

# Type checking
pnpm typecheck

# Run tests
pnpm test

# Format code
pnpm format

# Watch mode development
pnpm dev
```

## Architecture

This is a TypeScript monorepo using pnpm workspaces and Turbo.

### Package Structure

```
apps/cli/          # @buoy-design/cli - CLI application (entry point: bin.js)
packages/core/     # @buoy-design/core - Domain models, drift detection engine
packages/scanners/ # @buoy-design/scanners - Framework-specific code scanners (React, Vue, Svelte, Angular, Tailwind, etc.)
packages/db/       # @buoy-design/db - SQLite persistence via Drizzle
```

### Key Data Flow

1. **CLI commands** (`apps/cli/src/commands/`) parse args and orchestrate
2. **Scanners** (`packages/scanners/`) extract Components and DesignTokens from source files
3. **SemanticDiffEngine** (`packages/core/src/analysis/`) compares sources and produces DriftSignals
4. **Reporters** (`apps/cli/src/output/`) format output (table, JSON, markdown)
5. **Integrations** (`apps/cli/src/integrations/`) post results (GitHub PR comments)

### Core Domain Models (packages/core/src/models/)

- **Component**: Represents UI components from any framework (React, Vue, Svelte, etc.)
- **DesignToken**: Color, spacing, typography values from CSS/JSON/Figma
- **DriftSignal**: A detected issue (hardcoded-value, naming-inconsistency, deprecated-pattern, etc.)

### Built-in Scanners

All framework scanners are built-in (no plugins needed):
- **React/Vue/Svelte/Angular** - Component scanning in `packages/scanners/src/git/`
- **Tailwind** - Config parsing and arbitrary value detection in `packages/scanners/src/tailwind/`
- **Tokens** - CSS/SCSS/JSON token extraction in `packages/scanners/src/git/token-scanner.ts`
- **Templates** - Blade/ERB/Twig template scanning

### Optional Integrations

External services that require API keys are in `packages/scanners/`:
- **Figma** - Connect to Figma API for token comparison
- **Storybook** - Scan stories for component coverage

## CLI Commands

| Command | Purpose |
|---------|---------|
| `buoy begin` | Interactive wizard to get started with Buoy |
| `buoy status` | Visual coverage grid (works without config - zero-config mode) |
| `buoy scan` | Scan components and tokens (works without config) |
| `buoy tokens` | Generate design tokens from hardcoded values (works without config) |
| `buoy drift check` | Detailed drift signals with filtering |
| `buoy ci` | CI-optimized output with exit codes, GitHub PR integration |
| `buoy init` | Save auto-detected config to buoy.config.mjs |
| `buoy baseline` | Accept existing drift, track only new issues |
| `buoy check` | Pre-commit hook friendly drift check |
| `buoy explain` | AI-powered investigation (experimental) |

### Zero-Config Mode

`buoy status`, `buoy scan`, and `buoy tokens` work without any configuration:
- Auto-detects frameworks from package.json
- Scans standard paths (src/, components/, etc.)
- Shows hint to run `buoy init` to save config

## Configuration

Config lives in `buoy.config.mjs` (ESM). Schema defined in `apps/cli/src/config/schema.ts`.

## Adding Features

### New Drift Detection Type
1. Add to `DriftTypeSchema` in `packages/core/src/models/drift.ts`
2. Implement detection in `packages/core/src/analysis/semantic-diff.ts`

### New Framework Scanner
1. Create scanner in `packages/scanners/src/git/`
2. Export from `packages/scanners/src/git/index.ts`
3. Add detection in `apps/cli/src/detect/project-detector.ts`
4. Wire into scan/status commands

### New Integration
1. Add scanner in `packages/scanners/src/<name>/`
2. Export from `packages/scanners/src/index.ts`
3. Wire into CLI commands as needed

## Testing

```bash
# Run all tests
pnpm test

# Use test-fixture/ directory for manual CLI testing
node apps/cli/dist/bin.js status
```

## Output Modes

All commands support `--json` for machine-readable output. The `setJsonMode()` function in `apps/cli/src/output/reporters.ts` suppresses decorative output when enabled.
