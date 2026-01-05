# Designer Dashboard & Figma Widget Design

## Overview

This document defines the designer-facing surfaces for Buoy. While the CLI and PR comments serve developers, designers need their own touchpoints that fit their workflow (primarily Figma).

**Two surfaces:**
1. **Figma Widget** — Minimal, lives on the canvas, alerts when attention needed
2. **Web Dashboard** — Full experience for triage, configuration, and exploration

---

## 1. Figma Widget

### Why a Widget (Not a Plugin)

Figma plugins require manual opening and close when another plugin opens. Widgets persist on the canvas and are visible to anyone viewing the file without needing to "open" anything.

Reference: [Widgets vs Plugins](https://www.figma.com/widget-docs/widgets-vs-plugins/)

### Behavior

- Designer drops widget into their design file once
- Widget polls Buoy API for status
- Shows health at a glance
- Displays 🛟 with alert count when issues need attention
- Click expands to summary panel
- "View Details" links to full dashboard

### Widget States

**Healthy State:**
```
┌──────────────────────┐
│  🛟  Design System   │
│     Health: 94%      │
│                      │
│  All clear           │
│                      │
│  [View Dashboard →]  │
└──────────────────────┘
```

**Attention Needed State:**
```
┌──────────────────────┐
│  🛟  Design System   │
│     Health: 87%      │
│                      │
│  ● 2 items need      │
│    your attention    │
│                      │
│  [View Dashboard →]  │
└──────────────────────┘
```

**Expanded Summary (on click):**
```
┌──────────────────────────────────────┐
│  🛟  Design System Health: 87%       │
├──────────────────────────────────────┤
│                                      │
│  Needs Your Eye:                     │
│                                      │
│  🆕 New component: <ProductBadge>    │
│     Created by AI in checkout flow   │
│                                      │
│  🎨 Undefined token: #3B82F6         │
│     Used 3 times, not in palette     │
│                                      │
│  [View Full Dashboard →]             │
│                                      │
└──────────────────────────────────────┘
```

### Alert Triggers

The 🛟 indicator appears when:

| Trigger | Description |
|---------|-------------|
| New "rogue" component | AI created component not in design system |
| Undefined token | Color/spacing/etc. used but not in token set |
| Large deviation | 20+ drift signals in one PR |
| Health drop | Design system health drops below threshold (e.g., <80%) |
| Significant guardrail catch | AI tried something that needed blocking |

---

## 2. Web Dashboard

### Design Philosophy

The dashboard serves designers who:
1. Want a **quick health check** (glance and leave)
2. Need to **triage an inbox** (review and act on items)
3. Occasionally **configure guardrails** (adjust AI rules)
4. Sometimes **deep dive** (explore the full system)

Priority order: 1 > 2 > 3 > 4

### Layout Structure

Single page scroll:
```
┌─────────────────────────────────────┐
│  Header (logo, user, settings)      │
├─────────────────────────────────────┤
│  Hero: Health Summary               │
│  (style varies — see options below) │
├─────────────────────────────────────┤
│  Inbox: "Needs Your Eye"            │
│  (actionable items)                 │
├─────────────────────────────────────┤
│  AI Guardrails + Deep Dive          │
│  (side by side cards)               │
├─────────────────────────────────────┤
│  Recent Activity                    │
└─────────────────────────────────────┘
```

---

## 3. Dashboard Style Options

Designers can choose their preferred dashboard style. All three share the same functionality but differ in visual presentation of the hero section.

### Style 1: Ring (Zen/Focused)

**Vibe:** Calm, centered, almost meditative. The ring is the focal point.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  ◉ Buoy                                          Sarah ▾    ⚙    ?             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│                         ┌─────────────────────────────────────────┐             │
│                         │                                         │             │
│                         │              ╭─────────╮                │             │
│                         │              │         │                │             │
│                         │              │   94%   │                │             │
│                         │              │  ●●●●○  │                │             │
│                         │              │         │                │             │
│                         │              ╰─────────╯                │             │
│                         │                                         │             │
│                         │        Your design system is            │             │
│                         │          looking great today            │             │
│                         │                                         │             │
│                         │   ┌─────────┐  ┌─────────┐  ┌─────────┐ │             │
│                         │   │   47    │  │    2    │  │    5    │ │             │
│                         │   │  ───    │  │   ───   │  │   ───   │ │             │
│                         │   │   52    │  │  inbox  │  │  tokens │ │             │
│                         │   │components│ │  items  │  │  to     │ │             │
│                         │   │ aligned │  │         │  │  define │ │             │
│                         │   └─────────┘  └─────────┘  └─────────┘ │             │
│                         │                                         │             │
│                         └─────────────────────────────────────────┘             │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Health message varies by score:**
- 90%+: "looking great today"
- 70-89%: "doing well, a few things to check"
- Below 70%: "needs some love — let's fix it together"

---

### Style 2: Bar (Dashboard/Linear)

**Vibe:** Progress-oriented, satisfying bar fill, traditional dashboard feel.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  🌊 Buoy                                              [Settings ⚙]  [Help ?]   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                         │   │
│  │  Your Design System Health                                              │   │
│  │                                                                         │   │
│  │  ████████████████████████████████████████░░░░░░░  87%                   │   │
│  │                                                                         │   │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐      │   │
│  │  │    47 / 52       │  │       3          │  │      12          │      │   │
│  │  │   components     │  │  need attention  │  │   tokens drifted │      │   │
│  │  │    aligned       │  │                  │  │                  │      │   │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘      │   │
│  │                                                                         │   │
│  │  Last scan: 2 hours ago  •  Next auto-scan: 4 hours                    │   │
│  │                                                                         │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

### Style 3: Cards (Modular/Scannable)

**Vibe:** Personalized greeting, four equal-weight cards, info-dense but scannable.

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│  ◉ Buoy                                                    [Alex K ▾]  [?]  [Settings]   │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  Good morning, Alex                                                    Last sync: 2m ago │
│  Your design system is looking healthy today ✨                                          │
│                                                                                          │
│  ┌─────────────────────┬─────────────────────┬─────────────────────┬───────────────────┐ │
│  │                     │                     │                     │                   │ │
│  │        94%          │       47/52         │      2 items        │     12 caught     │ │
│  │                     │                     │                     │                   │ │
│  │   System Health     │  Components Live    │   Need Your Eye     │   By Guardrails   │ │
│  │                     │                     │                     │     this week     │ │
│  │   ↑ 3% this week    │   5 in review       │                     │                   │ │
│  └─────────────────────┴─────────────────────┴─────────────────────┴───────────────────┘ │
│                                                                                          │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Shared Sections (All Styles)

### Triage Inbox: "Needs Your Eye"

```
📥 Needs Your Eye  (3)                                              [View all →]

┌────────────────────────────────────────────────────────────────────────────────────┐
│ 🆕 NEW COMPONENT                                                      2 hours ago │
│                                                                                    │
│   ProductCard variant spotted in checkout flow                                     │
│   AI created this during the sprint. Looks like a keeper?                          │
│                                                                                    │
│   Found in: src/components/checkout/ProductCard.tsx                                │
│   PR: #482 by @jamie                                                               │
│                                                                                    │
│   [Preview]     [Add to System ✓]     [Mark as One-off]     [Ignore]               │
└────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────────┐
│ 🎨 UNDEFINED TOKEN                                                    5 hours ago │
│                                                                                    │
│   Color #3B82F6 used 14 times but isn't in your palette                           │
│   Closest match: --color-blue-500 (#3B81F5) — just 1 shade off!                   │
│                                                                                    │
│   ████ #3B82F6 (used)    vs    ████ #3B81F5 (--color-blue-500)                    │
│                                                                                    │
│   [Add as New Token]     [Map to Existing]     [Ask Dev to Fix]                    │
└────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────────┐
│ ⚡ GUARDRAIL CATCH                                                     yesterday  │
│                                                                                    │
│   AI tried to use 18px padding (your system uses 16px or 20px)                    │
│   Buoy suggested the fix and the dev accepted it — nice!                           │
│                                                                                    │
│   ✅ Resolved automatically                                [View Details]  [Nice!] │
└────────────────────────────────────────────────────────────────────────────────────┘
```

**Empty State:**
```
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
    All caught up! Nothing needs your attention right now. 🎉
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

---

### AI Guardrails Configuration

```
┌──────────────────────────────────┐  ┌──────────────────────────────────────────────────┐
│                                  │  │                                                  │
│  Active Rules             3/5   │  │  How strict should Buoy be?                      │
│  ─────────────────────────────  │  │                                                  │
│                                  │  │  ○ Relaxed — Flag only major issues             │
│  ✓ Block hardcoded colors       │  │  ● Balanced — Flag deviations, suggest fixes    │
│  ✓ Require spacing tokens       │  │  ○ Strict — Block PRs with any drift            │
│  ✓ Check component naming       │  │                                                  │
│  ○ Enforce typography           │  │  Currently: AI tools get gentle nudges and      │
│  ○ Validate border radius       │  │  suggestions. Major issues need your review.    │
│                                  │  │                                                  │
│  [Edit Rules →]                 │  │  [Adjust Sensitivity →]                          │
└──────────────────────────────────┘  └──────────────────────────────────────────────────┘
```

---

### Deep Dive Navigation

```
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│                     │  │                     │  │                     │
│  📊 Token Usage     │  │  🧩 Component Map   │  │  📈 Drift History   │
│                     │  │                     │  │                     │
│  See which tokens   │  │  Visual map of all  │  │  How drift has      │
│  are used where,    │  │  components and     │  │  trended over time  │
│  and which are      │  │  their adoption     │  │  across your repos  │
│  orphaned           │  │  status             │  │                     │
│                     │  │                     │  │                     │
│  [Explore →]        │  │  [Explore →]        │  │  [Explore →]        │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
```

---

### Recent Activity

```
Recent Activity                                                           [View All →]

✓  <CardHeader> added to system by you                                      2 days ago
✓  Guardrail caught 5px border-radius, dev fixed it                         3 days ago
✓  New token --spacing-2xs approved                                         4 days ago
○  <DataTable> marked as one-off (not added to system)                      5 days ago
```

---

## 5. Voice & Tone Guidelines

Per the [Sparking Joy Design Doc](./2026-01-04-sparking-joy-design.md), the dashboard uses warm, supportive language:

| Instead of...        | We say...                          |
|---------------------|-------------------------------------|
| "Compliance: 94%"   | "System Health: 94%"                |
| "3 violations"      | "3 items need your eye"             |
| "Unauthorized"      | "New component created by AI"       |
| "Token not allowed" | "This color isn't in your palette yet" |
| "Enforcement level" | "How strict should Buoy be?"        |
| "Auto-remediated"   | "Buoy suggested the fix — nice!"    |

---

## 6. Implementation Strategy

### Parallel Agent Development

To save development time, **implement all three dashboard styles simultaneously using parallel agents**. Since the styles share:
- Same data requirements
- Same API endpoints
- Same shared sections (inbox, guardrails, deep dive)
- Only differ in hero presentation

**Recommended approach:**

1. **Agent 1**: Build shared components (inbox, guardrails, activity feed)
2. **Agent 2**: Build Ring style hero
3. **Agent 3**: Build Bar style hero
4. **Agent 4**: Build Cards style hero

All four agents work in parallel. The shared components agent may need to finish first if heroes depend on shared utilities, but the three hero agents can run simultaneously.

**Style selection** can be stored in user preferences and simply swap which hero component renders:

```tsx
// Pseudocode
function Dashboard({ style }: { style: 'ring' | 'bar' | 'cards' }) {
  return (
    <Layout>
      {style === 'ring' && <RingHero data={healthData} />}
      {style === 'bar' && <BarHero data={healthData} />}
      {style === 'cards' && <CardsHero data={healthData} />}

      <Inbox items={inboxItems} />
      <GuardrailsConfig config={guardrails} />
      <DeepDiveNav />
      <RecentActivity items={activity} />
    </Layout>
  )
}
```

### Figma Widget

Separate implementation track:
- Uses Figma Widget API
- Polls Buoy API for status
- Links to dashboard URL

---

## 7. API Requirements

The dashboard needs these endpoints:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Overall health %, component coverage |
| `GET /api/inbox` | Items needing designer attention |
| `GET /api/guardrails` | Current guardrail configuration |
| `PATCH /api/guardrails` | Update guardrail settings |
| `POST /api/inbox/:id/action` | Take action on inbox item (approve, ignore, etc.) |
| `GET /api/activity` | Recent activity feed |
| `GET /api/tokens` | Token inventory for deep dive |
| `GET /api/components` | Component map for deep dive |
| `GET /api/drift/history` | Drift trend data |

---

## 8. Success Metrics

| Metric | Target |
|--------|--------|
| Time to "inbox zero" | < 5 minutes for typical session |
| Glance time for health check | < 5 seconds |
| Designer return rate | Daily active during active development |
| Guardrail adjustment frequency | Low (set once, rarely changed) |
| "Nice!" button clicks | High (shows feature is valued) |

---

## Next Steps

1. Finalize Figma widget API integration approach
2. Design API schema for dashboard endpoints
3. Implement dashboard styles in parallel (see Section 6)
4. Build Figma widget
5. User testing with real designers
