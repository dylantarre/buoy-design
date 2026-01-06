# Buoy Roadmap

> Planned features and future development
> Last updated: December 29, 2024

---

## Current Version

### Done

- CLI commands: `init`, `scan`, `status`, `tokens`, `drift check`, `ci`, `check`, `baseline`, `build`
- **Zero-config mode** - `buoy sweep`, `buoy sweep`, `buoy tokens` work without any config file
- Framework detection (30+ frameworks)
- Component scanners (React, Vue, Svelte, Angular, Web Components, Templates)
- Token detection (CSS, SCSS, JSON, Tailwind)
- Design system package detection
- Drift detection (naming, props, duplicates, hardcoded values, a11y, framework-sprawl)
- Visual coverage grid
- JSON output
- **`buoy lighthouse` command** with exit codes, severity thresholds, and JSON output
- **GitHub PR comments** integration
- **`buoy tokens`** command to extract and generate tokens from existing code (replaces bootstrap/tokenize)
- **`buoy build`** AI-powered design system generator
- **Figma scanner** for cross-source component comparison
- **Storybook scanner** for documentation verification
- **Tailwind plugin** (`@buoy-design/plugin-tailwind`) for arbitrary value drift detection
- **React plugin** (`@buoy-design/plugin-react`) for React/Next.js/Remix scanning
- **Plugin auto-discovery** from `@buoy-design/plugin-*` packages
- **`buoy explain`** AI-powered investigation of why code is structured the way it is

---

## Near-Term (Next Up)

### 1. Pre-commit Hook Integration ✅ DONE

**URL:** `/features/pre-commit`
**Headline:** "Catch drift before it's committed"
**Pain:** Drift gets caught too late in CI
**Value:** Block commits with critical drift, instant feedback
**Priority:** **Critical** — Shift left, catch early

**Deliverables:**

- [x] `buoy check` command (fast, exit codes only)
- [x] Pre-commit hook setup in `buoy init`
- [x] `.buoy/hooks/pre-commit` script generation
- [x] `--staged` flag to only check staged files

**Usage:**

```bash
# In .pre-commit-config.yaml
- repo: local
  hooks:
    - id: buoy
      name: buoy drift check
      entry: buoy check --staged --fail-on critical
      language: system

# Or via buoy init
buoy init --hooks  # Sets up pre-commit hook
```

### 2. Watch Mode

**URL:** `/features/watch`
**Headline:** "Real-time drift detection"
**Pain:** Have to run CLI manually to see issues
**Value:** Continuous feedback as you code
**Priority:** **High** — Better local DX

**Deliverables:**

- [ ] `buoy watch` command
- [ ] File system watcher (chokidar)
- [ ] Debounced re-scanning on file changes
- [ ] Clear terminal output with live updates

**Usage:**

```bash
buoy watch              # Watch current directory
buoy watch src/         # Watch specific path
buoy watch --quiet      # Only show when drift found
```

### 3. GitHub Action Wrapper

**URL:** `/integrations/github-action`
**Headline:** "Zero-config CI for GitHub repos"
**Pain:** Setting up `buoy lighthouse` manually in workflows is friction
**Value:** One-line GitHub Action with sensible defaults
**Priority:** **High**

**Deliverables:**

- [ ] GitHub Action wrapper (`buoy-dev/buoy-action`)
- [ ] Auto-detect config or use defaults
- [ ] Marketplace listing with documentation

**GitHub Action:**

```yaml
- uses: buoy-dev/buoy-action@v1
  with:
    fail-on: critical
```

### 4. Diff-Only Mode for CI

**URL:** `/features/diff-mode`
**Headline:** "Only report new drift in PRs"
**Pain:** Existing drift in codebase drowns out new issues
**Value:** Focus on what changed, not legacy problems
**Priority:** **High**

**Deliverables:**

- [ ] `buoy lighthouse --diff <base-ref>` flag
- [ ] Git diff integration to scope file analysis
- [ ] Only report drift in changed files

### 5. HTMX + Alpine.js Detection

**URL:** `/integrations/htmx`
**Headline:** "HTML-first framework support"
**Pain:** Server-side projects with modern JS need coverage too
**Value:** Detect HTMX attributes and Alpine directives
**Priority:** Medium

### 6. Qwik Scanner

**URL:** `/integrations/qwik`
**Headline:** "Qwik component scanning"
**Pain:** Emerging framework needs support
**Value:** Full component analysis for Qwik projects
**Priority:** Medium

### 7. Figma CLI Integration

**URL:** `/integrations/figma-cli`
**Headline:** "Use Figma scanner from the CLI"
**Pain:** Figma scanner exists but not wired into `buoy sweep`
**Value:** Seamless Figma source in scan workflow
**Priority:** Medium

**Deliverables:**

- [ ] Add Figma as a source type in `buoy.config.mjs`
- [ ] Wire FigmaComponentScanner into scan command
- [ ] Support `FIGMA_TOKEN` environment variable

---

## Mid-Term

### Buoy Pro: Managed PR Comments

**URL:** `/pro`
**Headline:** "Automatic PR comments for your team"
**Pain:** Self-hosted GitHub tokens are friction for teams
**Value:** One-click GitHub App installation, we handle the infra
**Priority:** Revenue opportunity (after proving core value)

**How it works:**

- User installs Buoy GitHub App on their repo
- `buoy lighthouse` in GitHub Actions sends drift to our API
- API posts PR comment via the App
- Subscription unlocks the service

**Note:** The free self-hosted path (`plugin-github` with your own token) always works. This is the managed/paid option for teams who want zero config.

### AI-Powered Explanations ✅ DONE

**URL:** `/features/ai-explanations`
**Headline:** "Understand why code exists"
**Pain:** Drift signals need context to fix
**Value:** `buoy explain <target>` investigates git history, architecture, code, and conventions
**Priority:** Medium

**Usage:**
```bash
buoy explain src/components/Button.tsx   # Explain a file
buoy explain src/components/             # Explain a directory
buoy explain --all                       # Explain entire design system
buoy explain --save                      # Save to .buoy/explain/
```

### Intent Memory

**URL:** `/features/intent`
**Headline:** "Document intentional deviations"
**Pain:** Not all drift is bad - some is intentional
**Value:** Record why something differs, suppress false positives
**Priority:** Medium

### Database Persistence

**URL:** `/features/database`
**Headline:** "Track drift over time"
**Pain:** Each scan is ephemeral
**Value:** SQLite storage for history, trends, snapshots
**Priority:** Medium

---

## Long-Term

### MCP Server

**URL:** `/features/mcp-server`
**Headline:** "Design system context for AI agents"
**Pain:** AI assistants don't know your design system
**Value:** Expose design system as MCP tools for Claude, Cursor, etc.
**Priority:** Future

### Agent Skills

**URL:** `/features/agent-skills`
**Headline:** "Teachable design system behaviors"
**Pain:** Design system rules are tribal knowledge
**Value:** Define skills that AI agents can execute
**Priority:** Future

### VS Code Extension

**URL:** `/integrations/vscode`
**Headline:** "See drift warnings inline"
**Pain:** Have to run CLI to see issues
**Value:** Real-time drift warnings as you code
**Priority:** Future

### Slack Alerts

**URL:** `/integrations/slack`
**Headline:** "Get notified when drift is detected"
**Pain:** Drift accumulates silently
**Value:** Webhook alerts for new drift signals
**Priority:** Future

### Trend Analytics

**URL:** `/features/trends`
**Headline:** "Track adoption over time"
**Pain:** No way to measure design system ROI
**Value:** Historical charts showing alignment % improvement
**Priority:** Future

### Team Dashboard

**URL:** `/features/dashboard`
**Headline:** "Design system health for everyone"
**Pain:** CLI not accessible to designers, PMs
**Value:** Web UI with coverage rings, drift lists, intent recording
**Priority:** Future

---

## Native Mobile (Long-Term)

### SwiftUI

**URL:** `/integrations/swiftui`
**Headline:** "iOS native component detection"
**Keywords:** SwiftUI, iOS, Apple, native
**Priority:** Future

### Jetpack Compose

**URL:** `/integrations/jetpack-compose`
**Headline:** "Android native component detection"
**Keywords:** Jetpack Compose, Android, Kotlin, native
**Priority:** Future

### Kotlin Multiplatform

**URL:** `/integrations/kotlin-multiplatform`
**Headline:** "KMP project support"
**Keywords:** Kotlin Multiplatform, KMP, cross-platform
**Priority:** Future

### .NET MAUI

**URL:** `/integrations/maui`
**Headline:** ".NET MAUI project support"
**Keywords:** .NET MAUI, Xamarin, C#, cross-platform
**Priority:** Future

---

## Additional Design Systems (As Requested)

- Vuetify
- Semantic UI
- Fluent UI
- DaisyUI
- PrimeVue / PrimeNG
- Quasar
- Headless UI
- React Aria
- Arco Design
- Element Plus
