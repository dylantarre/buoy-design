# AI Guardrails for Design System Compliance

> **Date:** 2026-01-06
> **Status:** Design Specification
> **Goal:** Make Buoy an AI agent's best friend for design system compliance

---

## Executive Summary

AI coding tools generate code at unprecedented speed—but they don't know your design system exists. They'll write `#3b82f6` when you have `--color-primary`. They'll use `padding: 17px` when your spacing scale is multiples of 4.

**Key Statistics (2025):**
- **4x more code cloning** with AI assistance
- **30-50% of AI code** contains quality issues
- **60% of teams** have no process for reviewing AI code
- MCP adopted by OpenAI, Cursor, Windsurf, Replit

This document defines a comprehensive feature set for keeping AI agents on track with design systems. The core insight: **AI needs guardrails, not just detection.** We provide guardrails through multiple channels:

1. **Setup Wizard** - One-click AI guardrails configuration via `buoy begin`
2. **Skills** - Teach AI HOW to use the design system (progressive disclosure)
3. **MCP Server** - Provide runtime access to tokens, components, patterns
4. **CLAUDE.md Generation** - Embed design system rules in project context
5. **Sub Agents** - Specialized agents for design system tasks
6. **Tokens as Context** - Rich token format optimized for AI understanding
7. **Deterministic CI** - Exit codes that enforce compliance

---

## Feature Matrix

| Feature | Type | Status | AI Benefit |
|---------|------|--------|------------|
| `buoy begin` wizard | CLI | Enhanced | One-click AI guardrails setup |
| `buoy skill spill` | CLI | New | Generates portable design system skill |
| `buoy context` | CLI | New | Generates CLAUDE.md section for design system |
| MCP Server | Package | Planned | Real-time token/component queries |
| Token Context Format | Core | New | W3C-compatible tokens with intent |
| `buoy lighthouse` exit codes | CLI | Exists | Deterministic CI validation |
| `buoy check` | CLI | Exists | Pre-commit hook validation |
| Sub Agents | Integration | New | Specialized design system agents |

---

## 1. Design System Skill (`buoy skill spill`)

### Purpose

Generate a portable skill that teaches AI agents how to use the design system. Skills use **progressive disclosure** - loading context only when needed.

### Command

```bash
# Export skill to local project
buoy skill spill --output .claude/skills/design-system/

# Export with specific sections
buoy skill spill --sections tokens,components,patterns

# Export to global skills directory
buoy skill spill --global
```

### Generated Structure

```
.claude/skills/design-system/
├── SKILL.md                    # Entry point, skill metadata
├── tokens/
│   ├── colors.md               # Color tokens with usage guidance
│   ├── spacing.md              # Spacing scale
│   ├── typography.md           # Font stacks, sizes, weights
│   └── _index.md               # Quick reference, when to dive deeper
├── components/
│   ├── _inventory.md           # All components, brief descriptions
│   ├── Button.md               # Deep dive: props, variants, examples
│   ├── Card.md
│   └── ...
├── patterns/
│   ├── _common.md              # Most-used patterns
│   ├── forms.md                # Form patterns
│   ├── navigation.md           # Nav patterns
│   └── danger-zone.md          # Destructive action patterns
├── anti-patterns/
│   ├── _avoid.md               # Things to never do
│   └── accessibility.md        # A11y violations to avoid
└── philosophy/
    └── principles.md           # The WHY behind decisions
```

### SKILL.md Template

```markdown
---
name: design-system
description: Use when building UI components, styling, or layouts
triggers:
  - building UI
  - styling components
  - adding colors
  - creating layouts
  - form design
---

# {Project Name} Design System

This skill provides design system context for AI code generation.

## Quick Start

1. **Before generating UI code**, check `components/_inventory.md`
2. **For styling**, use tokens from `tokens/_index.md`
3. **For patterns**, see `patterns/_common.md`

## Rules

1. NEVER hardcode colors - use tokens from `tokens/colors.md`
2. NEVER use arbitrary spacing - use scale from `tokens/spacing.md`
3. NEVER create new components without checking inventory first
4. ALWAYS follow accessibility patterns in `anti-patterns/accessibility.md`

## Progressive Loading

- Start with `_index.md` files for quick reference
- Load specific files when you need details
- The `_avoid.md` file lists what NEVER to do

## Feedback Loop

If you create something not in the design system:
1. Check if a similar component exists
2. If truly new, flag for design system team review
3. Use closest existing pattern as base

## Validation

Run `buoy check` before committing to validate compliance.
```

### Token File Format (tokens/colors.md)

```markdown
# Color Tokens

## Primary Colors

| Token | Value | Usage | Avoid |
|-------|-------|-------|-------|
| `color-primary` | #2563EB | Primary CTAs, submit buttons | Decorative use, backgrounds |
| `color-primary-hover` | #1D4ED8 | Hover state for primary elements | Non-interactive elements |

## Semantic Colors

| Token | Value | Intent | Usage |
|-------|-------|--------|-------|
| `color-success` | #059669 | Positive outcome | Confirmation, success messages |
| `color-error` | #DC2626 | Error, destructive | Errors, delete actions |
| `color-warning` | #D97706 | Caution needed | Warnings, pending states |

## When to Use What

- **Primary actions**: `color-primary` (one per section)
- **Confirmations**: `color-success` (not for CTAs)
- **Destructive**: `color-error` (always with confirmation pattern)

## Common Mistakes

❌ Using hex values directly: `style={{ color: '#2563EB' }}`
✅ Using token: `className="text-primary"` or `color={tokens.primary}`
```

---

## 2. CLAUDE.md Generation (`buoy context`)

### Purpose

Generate a design system section for the project's CLAUDE.md file. This embeds design system rules directly in the project context that Claude automatically reads.

### Command

```bash
# Generate CLAUDE.md section
buoy context --output stdout >> CLAUDE.md

# Generate and append automatically
buoy context --append

# Generate with specific detail level
buoy context --detail minimal|standard|comprehensive
```

### Generated Content

```markdown
## Design System Rules

This project uses the Acme Design System. Follow these rules:

### Component Usage

Use components from `@acme/ui`. Check before creating:
- Button, Card, Modal, Input, Select, Table, Tabs
- See full inventory: `buoy sweep --components`

### Token Requirements

**NEVER hardcode these values:**
- Colors: Use `tokens.color.*` or `text-*`/`bg-*` classes
- Spacing: Use `tokens.space.*` or spacing classes (p-4, gap-8)
- Typography: Use `tokens.font.*` or text classes

**Quick Reference:**
- Primary: `color-primary` (#2563EB)
- Error: `color-error` (#DC2626)
- Spacing scale: 0, 1, 2, 4, 6, 8, 12, 16, 24, 32, 48, 64

### Validation

Run before committing:
```bash
buoy check          # Quick validation
buoy drift check    # Detailed drift analysis
```

### Anti-Patterns

AVOID:
- `<div onClick>` - Use `<Button>` or `<button>`
- Inline styles for colors/spacing
- Creating component variants that exist
- Arbitrary Tailwind values (`p-[13px]`)
```

---

## 3. MCP Server (`@buoy-design/mcp`)

*(Detailed in AI Context Layer design, summarized here for completeness)*

### Purpose

Provide real-time design system context to AI tools via Model Context Protocol.

### Resources

| Resource | Description |
|----------|-------------|
| `tokens://all` | All design tokens with intent |
| `tokens://{category}` | Tokens by category |
| `components://inventory` | Component catalog |
| `components://{name}` | Component details |
| `patterns://all` | Pattern library |
| `antipatterns://all` | Things to avoid |

### Tools

| Tool | Purpose |
|------|---------|
| `find_component` | Find best component for use case |
| `validate_code` | Check code against design system |
| `resolve_token` | Find token for hardcoded value |
| `suggest_fix` | Get fix suggestion for drift |

### Claude Code Integration

```json
// .claude/settings.json
{
  "mcpServers": {
    "buoy": {
      "command": "npx",
      "args": ["@buoy-design/mcp", "serve"]
    }
  }
}
```

---

## 4. Token Context Format

### Purpose

Export tokens in a format optimized for AI understanding, following W3C DTCG standards with extended intent metadata.

### Command

```bash
# Export for AI consumption
buoy tokens export --format ai-context --output tokens.json

# Export as skill-compatible markdown
buoy tokens export --format skill-md --output ./tokens/
```

### AI Context Format

```json
{
  "$schema": "https://buoy.design/schemas/ai-context-tokens.json",
  "version": "1.0",
  "tokens": {
    "color": {
      "primary": {
        "$value": "#2563EB",
        "$type": "color",
        "$intent": {
          "hierarchy": "primary-action",
          "emotion": ["trust", "confidence"],
          "constraint": "one-per-screen"
        },
        "$usage": "Primary CTAs, submit buttons, links",
        "$avoid": "Decorative elements, backgrounds, text",
        "$examples": [
          "<Button variant=\"primary\">Submit</Button>",
          "className=\"text-primary\""
        ],
        "$substitutes": ["color-action", "color-brand"],
        "$deprecated": false
      }
    },
    "spacing": {
      "4": {
        "$value": "16px",
        "$type": "dimension",
        "$intent": {
          "relationship": "related-elements",
          "density": "standard"
        },
        "$usage": "Between related form fields, card padding",
        "$scale-position": 5,
        "$common-pairs": ["spacing-2", "spacing-8"]
      }
    }
  },
  "philosophy": {
    "principles": [
      {
        "name": "Clarity over cleverness",
        "meaning": "Prefer explicit patterns over abstractions",
        "implication": "Use semantic tokens, not arbitrary values"
      }
    ]
  }
}
```

---

## 5. Sub Agents

### Purpose

Specialized agents for design system tasks, invoked via Task tool.

### Agent Definitions

#### Design Validator Agent

```typescript
// Task: subagent_type = 'design-validator'
{
  description: "Validates code against design system",
  tools: ["Read", "Grep", "Glob", "Bash"],
  prompt: `
    Analyze the given code for design system compliance:
    1. Check for hardcoded color values (not tokens)
    2. Check for arbitrary spacing values
    3. Verify component usage matches inventory
    4. Flag accessibility anti-patterns

    Return structured findings with:
    - Issue location (file:line)
    - Issue type (token-violation, component-mismatch, etc.)
    - Suggested fix with design system alternative
  `
}
```

#### Token Advisor Agent

```typescript
// Task: subagent_type = 'token-advisor'
{
  description: "Suggests tokens for hardcoded values",
  tools: ["Read", "Grep"],
  prompt: `
    Given a hardcoded value, find the best matching token:
    1. Exact match in token catalog
    2. Closest match with similarity score
    3. Alternative tokens if no exact match
    4. Explanation of token intent
  `
}
```

#### Pattern Matcher Agent

```typescript
// Task: subagent_type = 'pattern-matcher'
{
  description: "Finds existing patterns for UI needs",
  tools: ["Read", "Grep", "Glob"],
  prompt: `
    Given a UI requirement:
    1. Search existing patterns in design system
    2. Find similar implementations in codebase
    3. Recommend pattern with usage example
    4. Note any customization needed
  `
}
```

---

## 6. Deterministic CI Checks

### Existing Features (Enhanced)

```bash
# CI command with strict exit codes
buoy lighthouse --fail-on-new-drift

# Exit codes:
# 0 = No drift
# 1 = New drift detected
# 2 = Configuration error
```

### New CI Features

```bash
# Threshold-based failure
buoy lighthouse --max-drift 10 --max-critical 0

# Format for CI parsing
buoy lighthouse --format github-annotations

# Integration with PR comments
buoy lighthouse --github-comment --github-token $TOKEN
```

### GitHub Action

```yaml
# .github/workflows/design-drift.yml
name: Design System Drift Check

on: [pull_request]

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: buoy-design/action@v1
        with:
          command: ci
          fail-on-new-drift: true
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

---

## 7. Feedback Loops

### Purpose

Enable AI to self-correct using Buoy validation.

### Pattern: Validate → Fix → Repeat

```typescript
// Skill instruction for AI
`
After generating UI code, validate with Buoy:

1. Run: buoy check path/to/file.tsx
2. If drift detected, read the suggestions
3. Apply fixes using design system tokens
4. Re-run: buoy check path/to/file.tsx
5. Repeat until no drift

Example:
$ buoy check src/Button.tsx
⚠ Hardcoded color #2563EB at line 15
  → Use token: color-primary

Fix: Change style={{ color: '#2563EB' }} to className="text-primary"
`
```

### AI-Friendly Output Mode

```bash
# Output optimized for AI parsing
buoy check --format ai-feedback
```

```json
{
  "file": "src/Button.tsx",
  "issues": [
    {
      "line": 15,
      "column": 10,
      "type": "hardcoded-color",
      "severity": "warning",
      "current": "#2563EB",
      "suggested": "color-primary",
      "fix": {
        "type": "replace",
        "old": "style={{ color: '#2563EB' }}",
        "new": "className=\"text-primary\""
      }
    }
  ],
  "summary": {
    "total": 1,
    "fixable": 1,
    "critical": 0
  }
}
```

---

## 8. Integration Touchpoints

### CLAUDE.md Auto-Update

```bash
# Hook to update CLAUDE.md when design system changes
buoy context --watch --append-to CLAUDE.md
```

### Pre-Commit Hook

```bash
# .husky/pre-commit
buoy check --staged --fail-on-critical
```

### IDE Integration

```json
// .vscode/settings.json
{
  "buoy.enableInlineHints": true,
  "buoy.showTokenSuggestions": true,
  "buoy.mcpServer.enabled": true
}
```

---

## 9. Setup Wizard Integration (`buoy begin`)

### Purpose

Automatically configure AI guardrails during initial project setup. When users run `buoy begin`, the wizard should offer AI guardrails setup as a first-class option alongside CI integration.

### Menu Integration

Add "Set up AI guardrails" to the main menu:

```
┌─────────────────────────────────────────────────────────┐
│  What would you like to do?                             │
├─────────────────────────────────────────────────────────┤
│  ○ Review critical issues (3)                           │
│  ○ Review all drift (7)                                 │
│  ○ Save configuration                                   │
│  ○ Set up CI integration                                │
│  ● Set up AI guardrails          ← NEW                  │
│  ○ Learn more about Buoy                                │
│  ○ Exit                                                 │
└─────────────────────────────────────────────────────────┘
```

### Wizard Flow

```typescript
// apps/cli/src/wizard/ai-guardrails-generator.ts

export async function setupAIGuardrails(cwd: string): Promise<void> {
  sectionHeader('Set Up AI Guardrails');

  info('AI tools generate code 10x faster—and 10x more drift.');
  info('Guardrails help AI use your design system correctly.');
  console.log('');

  // Show what was detected
  const detected = await detectDesignSystemAssets(cwd);
  showDetectedAssets(detected);

  // Ask what to set up
  const action = await showMenu<'all' | 'skill' | 'context' | 'customize' | 'skip'>('', [
    { label: 'Set up everything (Recommended)', value: 'all' },
    { label: 'Just the skill', value: 'skill' },
    { label: 'Just CLAUDE.md', value: 'context' },
    { label: 'Customize', value: 'customize' },
    { label: 'Skip for now', value: 'skip' },
  ]);

  if (action === 'skip') return;

  // Execute the appropriate commands
  if (action === 'all' || action === 'skill') {
    await exportSkill(cwd, detected);
  }

  if (action === 'all' || action === 'context') {
    await generateContext(cwd, detected);
  }

  if (action === 'customize') {
    await customizeGuardrails(cwd, detected);
  }

  showGuardrailsSuccess(action);
}
```

### Detection Phase

Before showing options, detect what's available:

```typescript
interface DetectedAssets {
  tokens: {
    colors: number;
    spacing: number;
    typography: number;
    total: number;
  };
  components: {
    count: number;
    frameworks: string[];
  };
  patterns: {
    forms: boolean;
    navigation: boolean;
    cards: boolean;
    modals: boolean;
  };
  existing: {
    skill: boolean;      // .claude/skills/design-system exists
    claudeMd: boolean;   // CLAUDE.md exists
    mcpConfig: boolean;  // .claude/settings.json has buoy
  };
}

async function detectDesignSystemAssets(cwd: string): Promise<DetectedAssets> {
  // Scan tokens
  const tokenScanner = new TokenScanner(cwd);
  const tokens = await tokenScanner.scan();

  // Scan components
  const orchestrator = new ScanOrchestrator(config);
  const { components } = await orchestrator.scanComponents();

  // Detect patterns from component usage
  const patterns = detectPatterns(components);

  // Check existing guardrails
  const existing = {
    skill: existsSync(join(cwd, '.claude/skills/design-system/SKILL.md')),
    claudeMd: existsSync(join(cwd, 'CLAUDE.md')),
    mcpConfig: checkMcpConfig(cwd),
  };

  return { tokens, components, patterns, existing };
}
```

### Display Detected Assets

```
┌─────────────────────────────────────────────────────────┐
│  Set Up AI Guardrails                                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  AI tools generate code 10x faster—and 10x more drift.  │
│  Guardrails help AI use your design system correctly.   │
│                                                         │
│  This will:                                             │
│    • Generate a design system skill for AI agents       │
│    • Add design system rules to CLAUDE.md               │
│    • (Optional) Configure MCP server for Claude Code    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Detected:                                        │    │
│  │   • 24 color tokens                              │    │
│  │   • 8 spacing tokens                             │    │
│  │   • 15 components (React)                        │    │
│  │   • 3 patterns (forms, cards, navigation)        │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ○ Set up everything (Recommended)                      │
│  ○ Just the skill                                       │
│  ○ Just CLAUDE.md                                       │
│  ○ Customize                                            │
│  ○ Skip for now                                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Success Output

After setup completes:

```
  ✓ Created .claude/skills/design-system/
      • SKILL.md (entry point)
      • tokens/ (24 tokens with usage guidance)
      • components/ (15 components)
      • patterns/ (3 patterns)
      • anti-patterns/ (accessibility, common mistakes)

  ✓ Updated CLAUDE.md with design system rules

  AI agents will now:
    • Load your design system skill when building UI
    • See token rules in project context
    • Get validation feedback from buoy check

  Next steps:
    • Run 'buoy check' after AI generates code
    • Update guardrails when design system changes:
      buoy skill spill && buoy context --append
```

### Customize Flow

When user selects "Customize":

```
┌─────────────────────────────────────────────────────────┐
│  Customize AI Guardrails                                │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  What to include in the skill?                          │
│                                                         │
│  [x] Color tokens (24 found)                            │
│  [x] Spacing tokens (8 found)                           │
│  [x] Typography tokens (6 found)                        │
│  [x] Component inventory (15 components)                │
│  [x] Usage patterns                                     │
│  [x] Anti-patterns & accessibility rules                │
│  [ ] Full component documentation (larger context)      │
│                                                         │
│  Where to create the skill?                             │
│                                                         │
│  ○ .claude/skills/design-system/ (Recommended)          │
│  ○ Global skills (~/.claude/skills/)                    │
│  ○ Custom path...                                       │
│                                                         │
│  CLAUDE.md options:                                     │
│                                                         │
│  ○ Append to existing CLAUDE.md                         │
│  ○ Create new CLAUDE.md                                 │
│  ○ Skip CLAUDE.md                                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### State Tracking

Add to wizard state:

```typescript
interface WizardState {
  configSaved: boolean;
  ciSetup: boolean;
  criticalReviewed: boolean;
  allReviewed: boolean;
  aiGuardrailsSetup: boolean;  // NEW
}

// Check existing setup
const state: WizardState = {
  // ...existing
  aiGuardrailsSetup: existsSync(join(cwd, '.claude/skills/design-system/SKILL.md')),
};
```

### Menu Action

```typescript
type MenuAction =
  | 'review-critical'
  | 'review-all'
  | 'save-config'
  | 'setup-ci'
  | 'setup-ai-guardrails'  // NEW
  | 'learn-more'
  | 'exit';

// In showMainMenu()
if (!state.aiGuardrailsSetup) {
  options.push({
    label: 'Set up AI guardrails',
    value: 'setup-ai-guardrails',
  });
}

// In menuLoop()
case 'setup-ai-guardrails': {
  await setupAIGuardrails(cwd);
  state.aiGuardrailsSetup = true;
  if (!(await askAnythingElse())) return;
  break;
}
```

### File Structure

```
apps/cli/src/wizard/
├── menu.ts
├── issue-reviewer.ts
├── ci-generator.ts
├── ai-guardrails-generator.ts   # NEW
└── index.ts
```

### Commands Triggered

The wizard internally calls these commands:

```bash
# Behind the scenes when "Set up everything" is selected:
buoy skill spill --output .claude/skills/design-system/
buoy context --append

# With customize options:
buoy skill spill \
  --output .claude/skills/design-system/ \
  --sections tokens,components,patterns,anti-patterns

buoy context --detail standard --append
```

---

## Implementation Priority

### Phase 1: Foundation (Week 1-2)
1. `buoy skill spill` - Generate portable skill
2. `buoy context` - Generate CLAUDE.md section
3. `buoy begin` wizard integration - "Set up AI guardrails" menu option
4. `buoy check --format ai-feedback` - AI-friendly output

### Phase 2: Context (Week 3-4)
5. Token context format with intent
6. Enhanced CI exit codes and thresholds
7. GitHub Action for PR comments

### Phase 3: Intelligence (Week 5-6)
8. MCP server basic resources
9. Sub agent definitions
10. Feedback loop documentation

### Phase 4: Polish (Week 7-8)
11. MCP server tools
12. IDE integrations
13. Watch mode and auto-update

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Drift Prevention Rate | 80% | Drift caught before commit vs after |
| AI Code Acceptance | 90% | % of AI code accepted first try |
| Token Usage | 95% | % of color/spacing using tokens |
| Skill Adoption | 50% | % of AI sessions using skill |

---

## Summary: The Guardrail Stack

```
┌─────────────────────────────────────────────────────────┐
│                    AI Agent Session                      │
├─────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │
│  │  Skill  │  │ CLAUDE  │  │   MCP   │  │   Sub   │    │
│  │ (Learn) │  │.md (See)│  │ (Query) │  │ Agents  │    │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘    │
│       │            │            │            │          │
│       └────────────┴─────┬──────┴────────────┘          │
│                          │                              │
│                    ┌─────▼─────┐                        │
│                    │ Generated │                        │
│                    │   Code    │                        │
│                    └─────┬─────┘                        │
│                          │                              │
│                    ┌─────▼─────┐                        │
│                    │buoy check │◄──── Feedback Loop     │
│                    └─────┬─────┘                        │
│                          │                              │
│              ┌───────────┼───────────┐                  │
│              │           │           │                  │
│         ┌────▼────┐ ┌────▼────┐ ┌────▼────┐            │
│         │  Pass   │ │  Fix &  │ │ Flag for│            │
│         │         │ │ Retry   │ │ Review  │            │
│         └─────────┘ └─────────┘ └─────────┘            │
├─────────────────────────────────────────────────────────┤
│                    CI/CD Pipeline                        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │
│  │ buoy lighthouse │──│ Exit    │──│ PR      │──│ Block   │    │
│  │         │  │ Codes   │  │ Comment │  │ Merge   │    │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## Gap Analysis: What's Missing

Based on research of ecosystem best practices, these gaps have been identified:

| Gap | Impact | Priority | Reference |
|-----|--------|----------|-----------|
| **Token intent not exported** | AI knows values but not WHY | High | - |
| **No ESLint plugin** | No IDE-level enforcement | High | [Backlight ESLint](https://backlight.dev/blog/best-practices-w-eslint-part-1) |
| **No GitHub Action** | Manual CLI installation in CI | High | Standard practice |
| **Pre-commit setup undocumented** | Users don't know how to install | High | [pre-commit.com](https://pre-commit.com/) |
| **No Stylelint plugin** | CSS token validation missing | Medium | [stylelint-design-tokens-plugin](https://github.com/LasaleFamine/stylelint-design-tokens-plugin) |
| **README not updated** | New features invisible | Medium | User feedback |
| **No streaming validation** | Bad code generated before correction | Medium | [MCP docs](https://www.anthropic.com/engineering/code-execution-with-mcp) |

---

## ESLint Plugin: `eslint-plugin-buoy`

### Rules

| Rule | Description | Fixable |
|------|-------------|---------|
| `buoy/no-hardcoded-colors` | Disallow hex/rgb colors in JSX | Yes |
| `buoy/no-hardcoded-spacing` | Disallow arbitrary pixel values | Yes |
| `buoy/use-design-components` | Prefer design system components | No |
| `buoy/no-div-button` | Disallow `<div onClick>` | Yes |

### Configuration

```javascript
// .eslintrc.js
module.exports = {
  plugins: ['buoy'],
  rules: {
    'buoy/no-hardcoded-colors': 'error',
    'buoy/no-hardcoded-spacing': 'warn',
    'buoy/use-design-components': ['error', {
      Button: ['button', 'div[onClick]'],
      Input: ['input'],
    }],
  },
  settings: {
    buoy: {
      tokensPath: './design-tokens.json',
    },
  },
};
```

### Implementation

```typescript
// packages/eslint-plugin-buoy/src/rules/no-hardcoded-colors.ts
export const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow hardcoded color values' },
    fixable: 'code',
  },
  create(context) {
    const tokens = loadTokens(context.settings.buoy?.tokensPath);
    return {
      Literal(node) {
        if (typeof node.value === 'string' && isHexColor(node.value)) {
          const suggestion = findClosestToken(node.value, tokens);
          context.report({
            node,
            message: `Use design token instead of "${node.value}"`,
            fix: suggestion ? (fixer) => fixer.replaceText(node, suggestion) : undefined,
          });
        }
      },
    };
  },
};
```

---

## Stylelint Plugin: `stylelint-plugin-buoy`

### Rules

| Rule | Description |
|------|-------------|
| `buoy/use-design-tokens` | All color/spacing must use CSS variables |
| `buoy/no-arbitrary-values` | No magic numbers outside token scale |

### Configuration

```javascript
// .stylelintrc.js
module.exports = {
  plugins: ['stylelint-plugin-buoy'],
  rules: {
    'buoy/use-design-tokens': [true, {
      tokensPath: './design-tokens.json',
      severity: 'error',
    }],
  },
};
```

---

## GitHub Action: `buoy-design/buoy-action`

### Usage

```yaml
# .github/workflows/design-check.yml
name: Design System Check

on: [pull_request]

jobs:
  buoy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: buoy-design/buoy-action@v1
        with:
          fail-on: warning  # or 'critical', 'none'
          comment: true     # Post PR comment
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Action Definition

```yaml
# action.yml
name: 'Buoy Design Check'
description: 'Check for design system drift in pull requests'
inputs:
  fail-on:
    description: 'Severity level to fail on (critical, warning, info, none)'
    default: 'critical'
  comment:
    description: 'Post results as PR comment'
    default: 'true'
runs:
  using: 'composite'
  steps:
    - run: npx @buoy-design/cli ci --fail-on ${{ inputs.fail-on }}
      shell: bash
```

---

## Pre-commit Configuration

### Setup

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: buoy-check
        name: Buoy Design Check
        entry: npx @buoy-design/cli check --staged --fail-on critical
        language: system
        types: [javascript, typescript, tsx, jsx, css, scss]
        pass_filenames: false
```

### Installation

```bash
# Install pre-commit
pip install pre-commit

# Install hooks
pre-commit install

# Run manually
pre-commit run buoy-check
```

---

## Research Sources

| Source | Key Insight |
|--------|-------------|
| [Anthropic Claude Code Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices) | CLAUDE.md should be 100-200 lines max; use folder-specific files for details |
| [Using CLAUDE.md Files](https://claude.com/blog/using-claude-md-files) | Skills and custom commands for reusable context |
| [MCP Specification 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18) | Resources for static context, Tools for active queries |
| [The MCP's Impact on 2025](https://www.thoughtworks.com/en-us/insights/blog/generative-ai/model-context-protocol-mcp-impact-2025) | MCP is "USB-C port of AI applications" |
| [ESLint for Design Systems](https://backlight.dev/blog/best-practices-w-eslint-part-1) | Custom ESLint rules enforce design system component usage |
| [stylelint-design-tokens-plugin](https://github.com/LasaleFamine/stylelint-design-tokens-plugin) | Validate CSS uses only defined design tokens |
| [pre-commit.com](https://pre-commit.com/) | Keep hooks fast (<2s); comprehensive checks belong in CI |
| [Qodo AI Code Reviews](https://www.qodo.ai/blog/ai-code-reviews-enforce-compliance-coding-standards/) | AI code needs multi-layer validation: lint + SAST + review |

---

## Appendix: Best Practices Summary

### For AI Agents

1. **Load the design system skill first** before generating UI
2. **Query MCP for components** before creating new ones
3. **Use tokens always** - never hardcode colors, spacing, typography
4. **Run validation** after generating code
5. **Self-correct** using Buoy feedback
6. **Flag unknowns** instead of inventing patterns

### For Design System Teams

1. **Keep CLAUDE.md updated** with `buoy context --append`
2. **Export skills** when design system changes
3. **Set CI thresholds** appropriate for team maturity
4. **Review flagged items** from AI submissions
5. **Document intent** not just values

### For Developers

1. **Install pre-commit hooks** for early feedback
2. **Use IDE integration** for inline hints
3. **Check before AI generates** that skill is loaded
4. **Review AI output** against design system
5. **Trust but verify** - AI + Buoy = confidence

---

*This specification defines Buoy's role as the AI agent's guardrail for design system compliance. Implementation should prioritize the skill and context generation features that provide immediate value with minimal infrastructure.*
