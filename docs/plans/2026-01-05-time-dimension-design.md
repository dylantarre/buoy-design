# The Time Dimension: Component Archaeology and Design System History

> **Date:** 2026-01-05
> **Status:** Vision Document
> **Parent:** [Master Vision](./2026-01-05-master-vision.md)

---

## The Problem We're Solving

Design systems today are **snapshots**—frozen moments pretending to be eternal truths. But design systems are living organisms. They evolve, accumulate cruft, forget their origins, and lose the wisdom of past mistakes.

**The hidden cost**: Every design system carries invisible debt. Why does `Button` have 47 props? Because six different teams added "just one more" over three years. Why don't we use inline icons? Nobody remembers—the person who learned that lesson left in 2021.

Buoy already detects **spatial drift** (divergence across the codebase). Now we add **temporal drift**—divergence across time.

---

## Core Concepts

### 1. Component Archaeology

Every component tells a story. Let's read it.

```
$ buoy archaeology Button

╭─────────────────────────────────────────────────────────────────╮
│  BUTTON ARCHAEOLOGY                                              │
│  Created: 2021-03-14 by @sarah (commit a3f2b1c)                 │
│  Age: 2 years, 9 months | 127 modifications | 12 contributors   │
╰─────────────────────────────────────────────────────────────────╯

EVOLUTION TIMELINE
──────────────────
2021-03    ████ v1.0 - Simple button (3 props: variant, size, disabled)
2021-06    █████ +loading prop (PR #234: "users wanted feedback")
2021-09    ██████ +icon, iconPosition (PR #456: "marketing request")
2022-01    ████████ +tooltip, tooltipPosition (PR #678: "accessibility")
2022-04    █████████ +analytics tracking props (PR #891: "product req")
2022-08    ██████████████ EXPLOSION: +12 props (PR #1205: "rebrand")
2023-02    ████████████████ +leftIcon, rightIcon (deprecated icon)
2023-07    ██████████████████ +as prop (polymorphic - PR #1892)

PROP COMPLEXITY OVER TIME
─────────────────────────
Props: 3 ──▶ 12 ──▶ 27 ──▶ 47
       │     │      │      │
       │     │      │      └── 🔴 Complexity Warning Zone
       │     │      └────────── Migration introduced debt
       │     └────────────────── Feature creep began
       └──────────────────────── Original simplicity

ARCHAEOLOGICAL FINDINGS
───────────────────────
⚠️  DEPRECATED BUT ALIVE: `icon` prop (deprecated 2023-02, still used 847 times)
⚠️  ORPHANED PROP: `analyticsId` added but never used in 18 months
⚠️  COMPLEXITY SPIKE: 2022-08 rebrand added 12 props in one PR
💡 RECOMMENDATION: Button is ready for decomposition into ButtonGroup + IconButton
```

### 2. Decision History (Institutional Memory)

The most valuable knowledge is often "why we DON'T do X."

```
$ buoy history --pattern "inline-styles"

╭─────────────────────────────────────────────────────────────────╮
│  DECISION HISTORY: Inline Styles                                 │
╰─────────────────────────────────────────────────────────────────╯

TIMELINE
────────
2021-05-12  ✅ ADOPTED: "Use inline styles for dynamic values"
            Rationale: CSS-in-JS overhead, simple dynamic theming
            Author: @mike | PR #123 | 👍 12 approvals

2021-11-08  ⚠️ INCIDENT: Production bundle 2.3MB, FCP regression
            Root cause: Inline styles not deduplicated, SSR issues

2021-11-15  🔄 REVERSED: "Migrate to CSS variables for dynamic values"
            Rationale: Performance, SSR compatibility, caching
            Author: @sarah | PR #567 | Migration took 3 sprints

2022-03-20  📝 CODIFIED: "Never use inline styles for themeable values"
            Added to: ARCHITECTURE_DECISIONS.md
            Enforced: ESLint rule `no-inline-theme-values`

CURRENT STATUS: ❌ PROHIBITED
Institutional knowledge strength: HIGH (documented, enforced, tested)
```

### The "Why We Don't" Registry

```
$ buoy why-not "z-index above 100"

╭─────────────────────────────────────────────────────────────────╮
│  WHY WE DON'T: Use z-index values above 100                     │
╰─────────────────────────────────────────────────────────────────╯

HISTORICAL CONTEXT
──────────────────
Date learned: 2022-07-18
Cost of lesson: 3 days debugging, 1 production incident
Original sin: Modal used z-index: 9999, broke third-party widget

THE INCIDENT
────────────
"We had a modal at z-index 9999. Then we added a tooltip at 10000.
Then a notification at 10001. Within 6 months we had values up to
99999 and no one knew what was on top of what. The intercom widget
(z-index 2147483647) was unreachable."
— @james, 2022-07-20

RESOLUTION
──────────
Created z-index scale: base(1), dropdown(10), modal(20), toast(30)
Maximum allowed: 50 (reserved 51-100 for third-party)

SURVIVAL SCORE: 92%
This knowledge has survived 2 team turnovers and 1 reorg.
```

### 3. Future Prediction (Design System Forecasting)

Based on current drift patterns, predict future problems:

```
$ buoy forecast --horizon 6months

╭─────────────────────────────────────────────────────────────────╮
│  DESIGN SYSTEM FORECAST: Next 6 Months                          │
│  Based on: 18 months historical data, current velocity          │
╰─────────────────────────────────────────────────────────────────╯

🔮 PREDICTED PROBLEMS
─────────────────────

1. CARD COMPONENT PROLIFERATION
   Current: 3 card variants (Card, ProductCard, UserCard)
   Trend: +1 new card variant every 2.3 months
   Prediction: 5-6 card variants by Q3 2024
   Confidence: 87%

   💡 INTERVENTION: Create composable Card system NOW
      Estimated effort: 2 weeks
      Cost of delay: 4 weeks migration + ongoing confusion

2. COLOR TOKEN DRIFT
   Current: 12% of colors are hardcoded (not tokens)
   Trend: +0.8% per month
   Prediction: 17% hardcoded by Q3 2024
   Confidence: 73%

   Pattern detected:
   - New hires hardcode colors in first 2 PRs (onboarding gap)
   - Dark mode will break 340+ instances

   💡 INTERVENTION: Onboarding lint rules + PR template checklist
      Estimated effort: 1 day
      Cost of delay: 2 week dark mode migration

ENTROPY PROJECTION
──────────────────
           Now                    +6 months (no intervention)
Design     ████████████░░░░░░░░   ████████████████████░░░░
System     72% consistent         58% consistent
Health

           +6 months (with interventions)
           ████████████████░░░░
           81% consistent
```

### 4. Version Control for Design Decisions

Not just code versions—design decision versions:

```
$ buoy releases

╭─────────────────────────────────────────────────────────────────╮
│  DESIGN SYSTEM RELEASES                                          │
╰─────────────────────────────────────────────────────────────────╯

v4.0.0 (2024-01-15) - "Dark Mode" ═══════════════════════════════
────────────────────────────────────────────────────────────────────
BREAKING CHANGES:
  ✖ Removed: `theme` prop from all components (use ThemeProvider)
  ✖ Removed: Legacy color tokens (gray-100 through gray-900)

ADDED:
  ✚ Color modes: light, dark, high-contrast
  ✚ 48 new semantic color tokens

MIGRATION EFFORT: ~3 days for typical app
ADOPTION: 67% of projects migrated (target: 100% by Q2)

───────────────────────────────────────────────────────────────────
$ buoy diff v3.2.0 v4.0.0

TOKENS DIFF
───────────
- gray-100: #f7fafc          + surface-primary: var(--gray-100)
- gray-900: #1a202c          + text-primary: var(--gray-900)
                             + [dark] text-primary: var(--gray-100)

DECISIONS DIFF
──────────────
+ "Semantic tokens over raw values - always"
+ "Color modes via CSS variables, not prop drilling"
```

### 5. The Living Changelog

Auto-generated from actual usage, not what we intended:

```
$ buoy changelog --month 2024-01

╭─────────────────────────────────────────────────────────────────╮
│  DESIGN SYSTEM CHANGELOG: January 2024                          │
│  Auto-generated from repository analysis                        │
╰─────────────────────────────────────────────────────────────────╯

USAGE CHANGES
─────────────
📈 GROWING                          📉 DECLINING
   Button      +847 uses (+12%)        Modal       -156 uses (-8%)
   Card        +523 uses (+34%)        Tooltip     -89 uses (-4%)
   Badge       +412 uses (+67%)        Tabs        -45 uses (-3%)

🆕 NEW PATTERNS DETECTED (not in design system)
───────────────────────────────────────────────
1. "Skeleton Loading" - appeared 23 times across 4 repos
   First seen: 2024-01-08 in @apps/dashboard
   Authors: @alex, @jordan, @casey

   💡 RECOMMENDATION: Formalize into Skeleton component

⚠️ DRIFT EVENTS
───────────────
- 2024-01-12: 8 hardcoded colors introduced (PR #2356)
- 2024-01-18: Non-standard border-radius (7px) appeared
- 2024-01-23: New z-index value (75) created

🎯 DESIGN SYSTEM HEALTH
───────────────────────
Token coverage:     87% → 84% (⚠️ declining)
Component coverage: 92% → 94% (✅ improving)
Pattern consistency: 78% → 76% (⚠️ declining)
```

---

## CLI Commands

```bash
# Component archaeology
buoy archaeology <component>          # Full evolution history
buoy archaeology <component> --props  # Just prop evolution
buoy archaeology <component> --since 2023-01-01

# Decision history
buoy history                          # All recorded decisions
buoy history --pattern "spacing"      # Search decisions
buoy why-not "inline styles"          # Why we don't do X

# Forecasting
buoy forecast                         # 6-month prediction
buoy forecast --horizon 1year         # Custom horizon
buoy forecast --component Button      # Single component

# Changelog
buoy changelog                        # This month
buoy changelog --month 2024-01        # Specific month

# Releases
buoy releases                         # List all releases
buoy diff v3.0 v4.0                   # Compare versions

# Time machine
buoy sweep --at 2023-06-01           # Status at point in time
buoy sweep --at abc123                 # Status at specific commit
```

---

## The Data Model

```typescript
interface ComponentSnapshot {
  componentId: string;
  timestamp: Date;
  commitSha: string;
  author: string;

  // State at this point in time
  propCount: number;
  props: PropDefinition[];
  complexity: number;
  usageCount: number;

  // What changed
  changeType: 'created' | 'modified' | 'deprecated' | 'removed';
  changeReason?: string;
}

interface DesignDecision {
  id: string;
  pattern: string;
  status: 'proposed' | 'adopted' | 'deprecated' | 'rejected';

  // Timeline
  proposedAt: Date;
  decidedAt?: Date;
  reversedAt?: Date;

  // Context
  rationale: string;
  evidence: Evidence[];
  relatedIncidents: string[];

  // Survival
  lastReinforcedAt: Date;
  survivalScore: number; // 0-100, decays without reinforcement
}

interface DriftTrend {
  type: DriftType;
  dataPoints: Array<{ date: Date; count: number; severity: number }>;
  velocity: number;
  acceleration: number;
  prediction: { horizon: Date; predictedCount: number; confidence: number };
}
```

---

## The Vision

**Today**: Design systems are static documentation fighting against dynamic reality.

**Tomorrow**: Design systems are living histories—they remember why decisions were made, predict where problems are heading, and carry institutional knowledge through team changes.

**The ultimate goal**: When a new developer asks "why don't we use inline styles?", the answer isn't "I don't know, ask Sarah... oh wait, she left." The answer is automatically surfaced with full context, evidence, and survival score.

---

## Success Metrics

- **Decision Survival Rate**: How well does institutional knowledge persist through team changes?
- **Prediction Accuracy**: Did our forecasts prove correct?
- **Time to Discovery**: How fast do teams find relevant historical decisions?
- **Complexity Growth Rate**: Are we controlling prop/variant explosion?
- **Knowledge Retrieval**: Are developers using `buoy why-not` and `buoy history`?

---

*Design systems should be archaeology sites, not museums. Museums show you artifacts. Archaeology tells you the story of how things came to be—and that story is often more valuable than the artifacts themselves.*
