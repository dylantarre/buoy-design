# No Dead Ends: Buoy UX Redesign

**Date:** 2026-01-04
**Status:** Draft
**Author:** Dylan + Claude

## Problem Statement

Users running Buoy commands on new codebases hit frustrating dead ends:

```
$ buoy sweep
Components found: 0
Tokens found: 0
✓ Scan complete
```

This output:
- Teaches nothing about the codebase
- Provides no next steps
- Makes the tool feel broken or useless
- Requires perfect configuration before providing value

Even when `buoy init` correctly detects 66 Astro files, the scan reports zeros because Astro isn't supported yet. The user learns nothing.

## Philosophy

### Core Principle: No Dead Ends

Every command output must answer at least one of:
1. What did I learn about this codebase?
2. What can I do next?
3. Why should I care?

### The Four Pillars

| Pillar | Rule |
|--------|------|
| **Discovery** | Always show what you found, even if it's not what you were looking for |
| **Guidance** | Offer interactive next steps when possible, graceful fallbacks when not |
| **Insight** | Explain the "why" behind zeros and failures, not just the result |
| **Progression** | Each interaction deepens understanding; remember what you've shown |

### Anti-Patterns to Avoid

- "0 found" with no context
- "No issues detected" as if that's the end
- Silent failures or empty outputs
- Requiring perfect setup before providing value

### The Mantra

> "Buoy should feel smarter than you, but it's helping you learn."

---

## Design: Always Show Something

Every command gets a **fallback insight layer**. When the primary purpose finds nothing, it shows what it *did* discover.

### `buoy sweep` Redesign

**Before:**
```
Components found: 0
Tokens found: 0
✓ Scan complete
```

**After:**
```
Scan Results
────────────

Components: 0 (no React/Vue/Svelte scanners matched)
Tokens: 2 values extracted

But here's what I found in your codebase:
  📁 66 Astro files (.astro)
  📁 3 CSS files with 2 unique spacing values
  📁 1 Lit element
  📁 1 Tailwind config

💡 Astro scanning coming soon. Run `buoy audit` to analyze
   your CSS values, or `buoy explain src/components/` to
   investigate with AI.
```

Key changes:
1. **Explain the zero** - "no scanners matched" tells you WHY
2. **Show adjacent discoveries** - what DID we find
3. **Bridge to next action** - what command helps from here

### `buoy explain` Redesign (no target)

**Before:**
```
✓ No drift detected. Your design system is aligned!
```

**After:**
```
Your Codebase at a Glance
─────────────────────────

Structure:
  src/components/   8 Astro components
  src/pages/        58 pages
  src/layouts/      6 layouts
  src/styles/       1 CSS file (global.css)

Design patterns detected:
  • Tailwind for utilities
  • 2 spacing values (8px used 2x)
  • 1 border-radius value (4px)

No drift detected - but that's because scanning is limited.
Run `buoy explain src/components/Header.astro` to investigate
a specific file with AI.
```

### `buoy sweep` Redesign (0 components)

**Before:**
```
ℹ No components found to analyze.
```

**After:**
```
Design System Status
────────────────────

Coverage: N/A (no component scanners active)

But your project has:
  ┌─────────────────────────────────────┐
  │ 66 Astro files    │ ░░░░░░░░░░░░░░ │
  │ 3 CSS files       │ ██░░░░░░░░░░░░ │  2 values extracted
  │ 1 Tailwind config │ ██████████████ │  detected
  └─────────────────────────────────────┘

Next: `buoy audit` analyzes your CSS values
      `buoy tokens` extracts a token system from what exists
```

---

## Design: Guided Discovery Flow

When Buoy detects things it can't fully scan, it offers to help rather than just reporting.

### Interactive Mode (TTY)

```
$ buoy sweep

⚡ Auto-detected: Astro + Tailwind

I found 66 Astro files but don't have an Astro scanner yet.

Would you like me to:
  ❯ Analyze your CSS/Tailwind values instead
    Run AI investigation on a sample component
    Just show me what you found
    Skip for now

[↑↓ to select, enter to confirm]
```

### Non-Interactive Fallback (CI/pipes)

```
$ buoy sweep

⚡ Auto-detected: Astro + Tailwind

Found 66 Astro files (scanner not yet available)
Falling back to CSS/Tailwind analysis...

CSS Analysis:
  • 2 spacing values: 8px (2x)
  • 1 radius value: 4px (1x)

💡 For deeper analysis: buoy explain src/components/
```

---

## Design: Progressive Revelation

Each interaction deepens understanding. Buoy tracks what you've seen in `.buoy/state.json`.

### First Run - Overview

```
$ buoy sweep

First time? Here's your project:
─────────────────────────────────
  Framework:  Astro + Tailwind
  Files:      66 .astro, 3 .css, 1 tailwind.config
  Tokens:     2 spacing, 1 radius (from CSS)

Run again for detailed breakdown, or try:
  buoy audit     → health score + problem areas
  buoy explain   → AI investigation
```

### Second Run - Deeper

```
$ buoy sweep

Design System Status (detailed)
───────────────────────────────

Tokens by category:
  spacing   8px ████████ 2 usages
  radius    4px ████     1 usage

Files by type:
  src/components/  8 files   → Header, Footer, Nav...
  src/pages/       58 files  → index, about, blog/[slug]...
  src/layouts/     6 files   → Base, Post, Page...

Top suggestion: Your spacing is consistent (good!) but
only 2 values found. Run `buoy tokens` to formalize them.
```

### Third Run - Actionable

```
$ buoy sweep

You've seen the overview. Here's what to do:
──────────────────────────────────────────────

  1. ✓ Project detected (Astro + Tailwind)
  2. ◐ Tokens partially extracted (2 spacing, 1 radius)
  3. ○ No component scanning (Astro not yet supported)

Recommended: `buoy tokens --generate` to create buoy.tokens.js
             from your existing values.
```

---

## Implementation Plan

### Phase 1: Fallback Insight Layer
1. Create shared `discoverProject()` function that always finds something
2. Update `scan`, `status`, `explain` to call it when primary results are empty
3. Format discoveries consistently across commands

### Phase 2: Guided Prompts
1. Add `@inquirer/prompts` for interactive menus
2. Detect TTY vs pipe mode
3. Add fallback suggestions for non-interactive mode

### Phase 3: Progressive State
1. Create `.buoy/state.json` schema
2. Track: first run, commands used, insights shown
3. Vary output based on familiarity level

### Phase 4: Cross-Command Coherence
1. Ensure all commands share the same discovery data
2. Create unified "next steps" recommendation engine
3. Add `buoy` (no subcommand) as smart entry point

---

## Success Criteria

- [ ] No command ever outputs just "0 found" without context
- [ ] Every zero result explains WHY and suggests WHAT NEXT
- [ ] First-time users learn something on every command
- [ ] Interactive prompts guide without blocking automation
- [ ] Running the same command twice reveals new depth

---

## Applying to Other Surfaces

This philosophy applies to:
- **Figma Plugin**: Never show "no tokens found" - show what IS in the design
- **GitHub PR Comments**: Don't just report issues, explain the codebase context
- **VS Code Extension**: Hover states and diagnostics should teach, not just flag
- **API Responses**: Include discovery metadata even when primary query is empty
