# Plugin Architecture & GitHub Action Design

**Date:** 2025-12-28
**Status:** Approved
**Goal:** Keep Buoy small and fast with auto-detection and plugin suggestions

---

## Problem Statement

Current architecture bundles all scanners (React, Vue, Svelte, Angular, etc.) into `@buoy/cli`. Users download parsers for frameworks they don't use, increasing install size and startup time.

For CI integration, we need a GitHub Action that:
- Posts PR comments with drift summary + top issues
- Supports zero-config with smart defaults
- Allows workflow input overrides

---

## Design Decisions

1. **Plugin architecture** over feature flags — keeps core lean, users install only what they need
2. **Auto-detection** — core detects frameworks, suggests relevant plugins
3. **PR comments as MVP** — visible, immediate value, no baseline tracking needed
4. **Zero-config with overrides** — works out of the box, customizable via workflow inputs

---

## Architecture Overview

```
@buoy/cli (core) - ~50KB
├── detect/           # Lightweight framework detection (globs + package.json)
├── plugins/          # Plugin loader & registry
├── engine/           # SemanticDiffEngine (drift analysis)
├── config/           # buoy.config.mjs loading
└── commands/         # init, ci, scan, drift (delegates to plugins)

@buoy/plugin-react    # React/Next.js scanner
@buoy/plugin-vue      # Vue/Nuxt scanner
@buoy/plugin-svelte   # Svelte/SvelteKit scanner
@buoy/plugin-tailwind # Tailwind token extraction
@buoy/plugin-css      # CSS variables / vanilla CSS
@buoy/plugin-figma    # Figma API integration
@buoy/plugin-github   # PR comments, check runs
```

---

## Plugin Interface

```typescript
interface BuoyPlugin {
  name: string;
  version: string;

  // What this plugin handles
  detects?: string[];        // ['react', 'next']

  // Scanning
  scan?: (config: ScanConfig) => Promise<Component[] | Token[]>;

  // CI integrations
  report?: (results: DriftResult, context: CIContext) => Promise<void>;
}
```

---

## User Experience: Detect → Suggest → Install

```bash
$ buoy init

Scanning project...

Detected:
  ✓ React (src/components/**/*.tsx)
  ✓ Tailwind (tailwind.config.js)
  ✓ CSS Variables (src/styles/tokens.css)

Recommended plugins:
  npm install @buoy/plugin-react @buoy/plugin-tailwind @buoy/plugin-css

Install now? [Y/n]
```

Detection is cheap (glob patterns + package.json checks). No parsing until plugins are installed.

---

## `buoy lighthouse` Command

```bash
buoy lighthouse [options]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--fail-on` | `critical` | Exit 1 if drift at this severity or higher |
| `--format` | `json` | Output format: `json` or `summary` |
| `--quiet` | `false` | Suppress non-essential output |

**JSON Output Structure:**
```json
{
  "version": "0.0.1",
  "timestamp": "2025-12-28T...",
  "summary": {
    "total": 12,
    "critical": 1,
    "warning": 8,
    "info": 3
  },
  "topIssues": [
    {
      "type": "accessibility-conflict",
      "severity": "critical",
      "component": "Button",
      "message": "Missing aria-label on interactive element",
      "file": "src/components/Button.tsx",
      "line": 42,
      "suggestion": "Add aria-label prop"
    }
  ],
  "exitCode": 1
}
```

**Exit Codes:**
- `0` — No drift at or above `--fail-on` threshold
- `1` — Drift found at or above threshold

---

## GitHub Action

**Repository:** `buoy-dev/buoy-action`

### action.yml

```yaml
name: 'Buoy Design Drift Check'
description: 'Detect design system drift in your PRs'
branding:
  icon: 'anchor'
  color: 'blue'

inputs:
  plugins:
    description: 'Plugins to install (auto-detected if omitted)'
    required: false
  pr-comment:
    description: 'Post PR comment with results'
    default: 'true'
  fail-on:
    description: 'Fail if drift at this severity: critical, warning, info, none'
    default: 'critical'
  working-directory:
    description: 'Directory to run in'
    default: '.'

runs:
  using: 'node20'
  main: 'dist/index.js'
```

### User Workflow

```yaml
name: Design Drift Check
on: [pull_request]

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: buoy-dev/buoy-action@v1
        with:
          pr-comment: true
          fail-on: critical
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## PR Comment Format

```markdown
## 🔱 Buoy Drift Report

**3 issues found** (1 critical, 2 warnings)

### Critical

| Component | Issue | File |
|-----------|-------|------|
| `Button` | Missing aria-label on interactive element | `src/components/Button.tsx:42` |

### Warnings

| Component | Issue | File |
|-----------|-------|------|
| `Card` | Hardcoded color `#3B82F6` instead of token | `src/components/Card.tsx:15` |
| `Header` | Using deprecated `spacing-sm` token | `src/components/Header.tsx:8` |

<details>
<summary>3 info-level issues</summary>

- `Avatar`: Naming inconsistency (expected PascalCase)
- `modal`: Orphaned component (not in design system)
- `--color-accent`: Orphaned token (unused)

</details>

---
<sub>🔱 <a href="https://github.com/buoy-dev/buoy">Buoy</a> · <a href="#">View full report</a> · <a href="#">Configure</a></sub>
```

**Behavior:**
- Only posts if drift found (no noise on clean PRs)
- Updates existing comment on new commits (doesn't spam)
- Collapses info-level to keep focus on actionable items

---

## Configuration

### buoy.config.mjs

```javascript
export default {
  project: { name: 'my-app' },

  // Plugins auto-detected, or specify explicitly
  plugins: ['@buoy/plugin-react', '@buoy/plugin-tailwind'],

  ci: {
    failOn: 'critical',  // critical | warning | info | none
    prComment: true,
  },

  drift: {
    ignore: ['**/test/**'],
    severity: {
      'accessibility-conflict': 'critical',
      'hardcoded-value': 'warning'
    }
  }
}
```

### Priority Order

CLI flags > workflow inputs > buoy.config.mjs > defaults

---

## Implementation Phases

### Phase 1: Core Plugin System
- Extract plugin interface from existing scanner code
- Create plugin loader in `@buoy/cli`
- Convert React scanner to `@buoy/plugin-react` as proof of concept
- `buoy init` detects frameworks and suggests plugins

### Phase 2: `buoy lighthouse` Command
- JSON output for CI consumption
- Exit codes based on `--fail-on` threshold
- Quiet mode for clean CI logs

### Phase 3: GitHub Plugin
- `@buoy/plugin-github` package
- PR comment posting via GitHub API
- Comment update on subsequent commits
- Check run integration (optional)

### Phase 4: GitHub Action Wrapper
- `buoy-dev/buoy-action` repository
- Auto-detect and install plugins
- Wire up `buoy lighthouse` with plugin-github

---

## Success Criteria

- [ ] `buoy init` detects frameworks and suggests plugins
- [ ] `@buoy/plugin-react` works as standalone package
- [ ] `buoy lighthouse` outputs valid JSON with correct exit codes
- [ ] GitHub Action posts PR comments on drift detection
- [ ] Core CLI stays under 100KB (without plugins)
