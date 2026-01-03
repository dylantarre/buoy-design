# Buoy Marketing Site Specification

> **For Landing Page Designers** — Complete specification for buoy.design
>
> Site architecture, SEO strategy, page copy, and design guidelines
> Last updated: December 28, 2024

---

## Brand Foundation

### Core Message
**Tagline:** "Design drift detection for the AI era"

**Value Prop:** AI writes code fast. Buoy catches design drift faster.

**Tone:** Technical but approachable. Confident but not arrogant. Developer-first.

### Brand Colors (Suggested)
| Token | Value | Usage |
|-------|-------|-------|
| `--primary` | `#0066FF` | CTAs, links, accents |
| `--primary-dark` | `#0052CC` | Hover states |
| `--secondary` | `#10B981` | Success, positive metrics |
| `--warning` | `#F59E0B` | Warning severity |
| `--critical` | `#EF4444` | Critical severity |
| `--neutral-900` | `#111827` | Headings |
| `--neutral-600` | `#4B5563` | Body text |
| `--neutral-100` | `#F3F4F6` | Backgrounds |

### Logo Concepts
- Buoy icon (nautical buoy shape)
- Represents: safety, visibility, guidance in rough waters
- Consider: animated wave effect on hover

---

## Site Architecture

### Complete Sitemap

```
buoy.design/
├── / (Homepage)
├── /features/
│   ├── /features/drift-detection
│   ├── /features/hardcoded-values
│   ├── /features/duplicate-detection
│   ├── /features/naming-consistency
│   ├── /features/prop-consistency
│   ├── /features/accessibility-checks
│   ├── /features/framework-sprawl
│   ├── /features/coverage
│   ├── /features/ci
│   ├── /features/github-action
│   ├── /features/bootstrap
│   └── /features/build
├── /integrations/
│   ├── /integrations/react
│   ├── /integrations/vue
│   ├── /integrations/svelte
│   ├── /integrations/angular
│   ├── /integrations/nextjs
│   ├── /integrations/figma
│   ├── /integrations/storybook
│   ├── /integrations/tailwind
│   ├── /integrations/chakra-ui
│   ├── /integrations/material-ui
│   ├── /integrations/shadcn
│   └── /integrations/github
├── /use-cases/
│   ├── /use-cases/design-system-teams
│   ├── /use-cases/frontend-teams
│   ├── /use-cases/modernization
│   ├── /use-cases/enterprise
│   └── /use-cases/agencies
├── /compare/
│   ├── /compare/manual-audits
│   ├── /compare/figma-plugins
│   ├── /compare/eslint
│   ├── /compare/chromatic
│   └── /compare/style-dictionary
├── /docs/ (external link to docs site)
├── /pricing/
├── /blog/
├── /about/
├── /contact/
└── /demo/
```

---

## SEO Foundation

### Technical SEO Requirements

1. **Performance**
   - Lighthouse score > 90 on all metrics
   - First Contentful Paint < 1.5s
   - Largest Contentful Paint < 2.5s
   - Static site generation (Next.js SSG or Astro)

2. **Crawlability**
   - XML sitemap at `/sitemap.xml`
   - robots.txt with sitemap reference
   - Canonical URLs on all pages
   - Clean URL structure (no trailing slashes)

3. **Structured Data**
   - Organization schema on homepage
   - SoftwareApplication schema on product pages
   - FAQPage schema on feature pages
   - BreadcrumbList on all inner pages
   - Article schema on blog posts

4. **Meta Tags Template**
```html
<title>{Page Title} | Buoy - Design Drift Detection</title>
<meta name="description" content="{155 chars max}">
<meta name="keywords" content="{primary keyword}, {secondary keywords}">
<link rel="canonical" href="https://buoy.design{path}">

<!-- Open Graph -->
<meta property="og:title" content="{Page Title}">
<meta property="og:description" content="{description}">
<meta property="og:image" content="https://buoy.design/og/{page-slug}.png">
<meta property="og:url" content="https://buoy.design{path}">
<meta property="og:type" content="website">

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{Page Title}">
<meta name="twitter:description" content="{description}">
<meta name="twitter:image" content="https://buoy.design/og/{page-slug}.png">
```

### Keyword Strategy

#### Primary Keywords (Own These)
| Keyword | Monthly Volume | Difficulty | Target Page |
|---------|---------------|------------|-------------|
| design drift | 50 | Low | / |
| design drift detection | 30 | Low | /features/drift-detection |
| design system adoption | 500 | Medium | /use-cases/design-system-teams |
| hardcoded values react | 200 | Low | /features/hardcoded-values |
| design system metrics | 300 | Medium | /features/coverage |

#### Long-Tail Keywords (50+ pages of content)
| Keyword | Target Page |
|---------|-------------|
| detect hardcoded colors in react | /features/hardcoded-values |
| find duplicate components codebase | /features/duplicate-detection |
| design system ci cd github action | /features/github-action |
| react component prop consistency | /features/prop-consistency |
| copilot code design system problems | /features/drift-detection |
| AI generated code design inconsistency | / |
| design system adoption metrics tools | /features/coverage |
| figma to code comparison tool | /integrations/figma |
| storybook component drift | /integrations/storybook |
| tailwind design token extraction | /integrations/tailwind |
| chakra ui component audit | /integrations/chakra-ui |
| material ui design system migration | /integrations/material-ui |
| vue component library health | /integrations/vue |
| angular design system tools | /integrations/angular |
| svelte component consistency | /integrations/svelte |
| nextjs design system integration | /integrations/nextjs |
| legacy code modernization tracking | /use-cases/modernization |
| design system governance enterprise | /use-cases/enterprise |
| agency design system workflow | /use-cases/agencies |
| chromatic alternative free | /compare/chromatic |
| eslint design system rules | /compare/eslint |
| style dictionary alternative | /compare/style-dictionary |
| manual design audit alternative | /compare/manual-audits |
| extract design tokens from code | /features/bootstrap |
| generate design system AI | /features/build |
| create design tokens cli | /features/bootstrap |
| component naming convention checker | /features/naming-consistency |
| accessibility component audit | /features/accessibility-checks |
| multiple frameworks same codebase | /features/framework-sprawl |

---

## Page Specifications

### Homepage (/)

#### SEO
```yaml
title: "Buoy - Design Drift Detection for the AI Era"
description: "AI writes code fast. Buoy catches design drift faster. Scan your codebase for hardcoded values, duplicate components, and design system violations."
keywords: "design drift, design drift detection, AI code consistency, design system tools"
```

#### Hero Section
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  AI writes code fast.                                       │
│  Buoy catches design drift faster.                          │
│                                                             │
│  Your team ships code 10x faster with AI. But Copilot       │
│  doesn't know your design system. Buoy scans your codebase  │
│  and shows what's drifting before it ships.                 │
│                                                             │
│  [Get your first scan in 2 minutes]  [View on GitHub]       │
│                                                             │
│  npx @buoy/cli scan                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Social Proof Bar
```
┌─────────────────────────────────────────────────────────────┐
│  Trusted by teams at: [Logo] [Logo] [Logo] [Logo] [Logo]    │
│                                                             │
│  "Finally, metrics for design system adoption" - @handle    │
└─────────────────────────────────────────────────────────────┘
```

#### Problem Statement Section
**Headline:** "AI-generated code is drifting from your design system"

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Before AI:                                                 │
│  Developer → Check design system → Use component → Ship     │
│                                                             │
│  With AI:                                                   │
│  Developer → Ask Claude → Get code → Ship → 🚨 Drift        │
│                                                             │
│  AI code characteristics:                                   │
│  ✓ Works correctly                                          │
│  ✓ Passes code review                                       │
│  ✗ Uses #3b82f6 not var(--primary)                         │
│  ✗ Recreates Button instead of importing                   │
│  ✗ Ignores your naming conventions                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Feature Grid
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  What Buoy Detects                                          │
│                                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │ Hardcoded   │ │ Duplicate   │ │ Naming      │           │
│  │ Values      │ │ Components  │ │ Drift       │           │
│  │             │ │             │ │             │           │
│  │ #ff0000     │ │ Button      │ │ btn vs      │           │
│  │ 16px        │ │ ButtonNew   │ │ Button      │           │
│  │ Arial       │ │ MyButton    │ │             │           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
│                                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │ Prop        │ │ Deprecated  │ │ Framework   │           │
│  │ Mismatches  │ │ Patterns    │ │ Sprawl      │           │
│  │             │ │             │ │             │           │
│  │ onClick vs  │ │ @deprecated │ │ React +     │           │
│  │ onPress     │ │ components  │ │ Vue + ...   │           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### How It Works Section
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Three commands. Full visibility.                           │
│                                                             │
│  1. Scan                                                    │
│     $ buoy scan                                             │
│     → Discovers all components and tokens                   │
│                                                             │
│  2. Check                                                   │
│     $ buoy drift check                                      │
│     → Analyzes for drift signals                            │
│                                                             │
│  3. Status                                                  │
│     $ buoy status                                           │
│     → Shows adoption coverage                               │
│                                                             │
│  [See full documentation →]                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Terminal Demo Section
**Interactive terminal showing real output from `buoy drift check`**

```
┌─────────────────────────────────────────────────────────────┐
│  $ buoy drift check                                         │
│                                                             │
│  ⚓ Scanning for design drift...                            │
│                                                             │
│  Found 23 drift signals                                     │
│                                                             │
│  CRITICAL (2)                                               │
│  ├─ Button: Missing aria-label on interactive element       │
│  └─ Modal: Accessibility conflict with focus trap           │
│                                                             │
│  WARNING (8)                                                │
│  ├─ Card: Hardcoded color #ffffff (use --bg-surface)        │
│  ├─ Badge: Hardcoded spacing 8px (use --spacing-sm)        │
│  ├─ Header: Deprecated component, use NavBar                │
│  └─ ... and 5 more                                          │
│                                                             │
│  INFO (13)                                                  │
│  └─ 13 naming inconsistencies detected                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Integration Logos Section
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Works with your stack                                      │
│                                                             │
│  [React] [Vue] [Svelte] [Angular] [Next.js]                │
│                                                             │
│  [Figma] [Storybook] [Tailwind] [Chakra] [MUI]             │
│                                                             │
│  [GitHub Actions]                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### CTA Section
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Get your first scan in 2 minutes                           │
│                                                             │
│  Free. Open source. No signup required.                     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ npx @buoy/cli scan                                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Copy command]  [View on GitHub]  [Read the docs]          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Footer
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Product          Resources        Company      Connect     │
│  ─────────        ─────────        ───────      ───────     │
│  Features         Docs             About        GitHub      │
│  Integrations     Blog             Contact      Twitter     │
│  Pricing          Changelog        Careers      Discord     │
│  Use Cases        Community                                 │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  © 2024 Buoy. Open source under MIT License.               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### Feature Pages Template

Each feature page follows this structure for maximum SEO value:

#### /features/hardcoded-values

```yaml
title: "Detect Hardcoded Colors & Values in React | Buoy"
description: "Find hardcoded colors, spacing, and font sizes in your React, Vue, and Svelte components. Replace magic values with design tokens automatically."
keywords: "hardcoded colors react, detect hardcoded values, design tokens enforcement"
```

**Hero:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Find hardcoded values before they multiply                 │
│                                                             │
│  AI-generated code uses #3b82f6 instead of var(--primary). │
│  Buoy finds every hardcoded color, spacing, and font size   │
│  hiding in your codebase.                                   │
│                                                             │
│  [Get started free]                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**What It Detects:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Hardcoded Value Types                                      │
│                                                             │
│  🎨 Colors                                                  │
│     #ffffff, rgb(255,255,255), hsl(0,0%,100%)              │
│                                                             │
│  📐 Spacing                                                 │
│     16px, 1.5rem, 24px                                      │
│                                                             │
│  🔤 Typography                                              │
│     14px, Arial, font-weight: 600                           │
│                                                             │
│  🌓 Shadows                                                 │
│     box-shadow: 0 2px 4px rgba(0,0,0,0.1)                  │
│                                                             │
│  📏 Border                                                  │
│     1px solid #ccc, border-radius: 4px                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Code Example:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Before: Hardcoded values everywhere                        │
│  ─────────────────────────────────────                      │
│  export function Card({ title }) {                          │
│    return (                                                 │
│      <div style={{                                          │
│        backgroundColor: '#ffffff',  // ⚠️ Hardcoded        │
│        padding: '16px',             // ⚠️ Hardcoded        │
│        borderRadius: '8px'          // ⚠️ Hardcoded        │
│      }}>                                                    │
│        {title}                                              │
│      </div>                                                 │
│    );                                                       │
│  }                                                          │
│                                                             │
│  After: Using design tokens                                 │
│  ─────────────────────────────                              │
│  export function Card({ title }) {                          │
│    return (                                                 │
│      <div style={{                                          │
│        backgroundColor: 'var(--bg-surface)',               │
│        padding: 'var(--spacing-md)',                        │
│        borderRadius: 'var(--radius-md)'                     │
│      }}>                                                    │
│        {title}                                              │
│      </div>                                                 │
│    );                                                       │
│  }                                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Terminal Output:**
```
┌─────────────────────────────────────────────────────────────┐
│  $ buoy drift check --type hardcoded-value                  │
│                                                             │
│  Found 47 hardcoded values                                  │
│                                                             │
│  src/components/Card.tsx:12                                 │
│  ├─ backgroundColor: #ffffff (use --bg-surface)             │
│  ├─ padding: 16px (use --spacing-md)                        │
│  └─ borderRadius: 8px (use --radius-md)                     │
│                                                             │
│  src/components/Button.tsx:8                                │
│  ├─ color: #0066ff (use --primary)                          │
│  └─ fontSize: 14px (use --text-sm)                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**FAQ Section (for FAQ schema):**
```
Q: What counts as a hardcoded value?
A: Any color (#hex, rgb, hsl), spacing (px, rem, em), or typography value that isn't using a CSS variable, theme token, or design system reference.

Q: Does Buoy support CSS-in-JS?
A: Yes. Buoy detects hardcoded values in styled-components, Emotion, inline styles, and CSS modules.

Q: Can I ignore certain hardcoded values?
A: Yes. Use buoy.config.mjs to define ignore patterns for intentional values like transparent, inherit, or specific hex codes.

Q: What frameworks does this work with?
A: React, Vue, Svelte, Angular, and vanilla CSS/SCSS files.
```

**Related Features:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Related Features                                           │
│                                                             │
│  [Bootstrap] Extract tokens from existing hardcoded values  │
│  [Coverage] See which components use design tokens          │
│  [CI] Block PRs with new hardcoded values                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### /features/drift-detection

```yaml
title: "Design Drift Detection for React, Vue & Svelte | Buoy"
description: "Automatically detect when AI-generated code drifts from your design system. Find hardcoded values, naming inconsistencies, and deprecated patterns."
keywords: "design drift detection, AI code consistency, design system enforcement"
```

**Hero:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Catch design drift before it ships                         │
│                                                             │
│  AI-generated code looks right but ignores your design      │
│  system. Buoy scans your codebase and shows exactly         │
│  what's diverging.                                          │
│                                                             │
│  [Get started free]                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Drift Types Detected:**
| Type | Severity | Description |
|------|----------|-------------|
| Hardcoded Values | Warning | Colors, spacing, fonts not using tokens |
| Duplicate Components | Warning | Similar components that should be consolidated |
| Naming Inconsistency | Info | Component/prop names that don't match conventions |
| Deprecated Patterns | Warning | Components marked @deprecated still in use |
| Prop Type Mismatch | Warning | Same prop with different types across components |
| Accessibility Conflict | Critical | Missing ARIA labels, focus issues |
| Framework Sprawl | Warning | Multiple UI frameworks in same codebase |
| Orphaned Components | Info | Components in code but not in design |

---

### /features/duplicate-detection

```yaml
title: "Find Duplicate React Components in Your Codebase | Buoy"
description: "Detect duplicate and near-duplicate components in your React, Vue, and Svelte codebase. Consolidate Button, ButtonNew, MyButton into one."
keywords: "duplicate components react, find duplicate code, component consolidation"
```

**Hero:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Find duplicate components hiding in your codebase          │
│                                                             │
│  Button, ButtonNew, ButtonV2, MyButton.                     │
│  Buoy finds components that do the same thing and should    │
│  be consolidated.                                           │
│                                                             │
│  [Get started free]                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Detection Logic:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  How Buoy Detects Duplicates                                │
│                                                             │
│  1. Similar Names                                           │
│     Button, ButtonNew, ButtonV2 → Same base name            │
│                                                             │
│  2. Matching Props                                          │
│     Components with 70%+ prop overlap                       │
│                                                             │
│  3. Same Dependencies                                       │
│     Import the same child components                        │
│                                                             │
│  4. Naming Patterns                                         │
│     *New, *V2, *Legacy, *Updated suffixes                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### /features/naming-consistency

```yaml
title: "Check Component Naming Conventions Automatically | Buoy"
description: "Enforce consistent naming conventions across your React components. Detect PascalCase vs camelCase vs kebab-case drift automatically."
keywords: "component naming conventions, react naming rules, code consistency tools"
```

---

### /features/prop-consistency

```yaml
title: "Detect Prop Type Inconsistencies Across Components | Buoy"
description: "Find when the same prop has different types in different components. onClick vs onPress, size as string vs number. Enforce consistency."
keywords: "react prop types, typescript prop consistency, component API design"
```

---

### /features/accessibility-checks

```yaml
title: "Accessibility Component Audit for React | Buoy"
description: "Detect missing ARIA labels, focus issues, and accessibility conflicts in your React component library. Ship inclusive components."
keywords: "react accessibility audit, aria label checker, a11y component testing"
```

---

### /features/framework-sprawl

```yaml
title: "Detect Multiple UI Frameworks in Your Codebase | Buoy"
description: "React + Vue + Svelte in the same project? Buoy detects framework sprawl and helps you consolidate to a single UI framework."
keywords: "multiple frameworks same project, react vue migration, frontend framework consolidation"
```

---

### /features/coverage

```yaml
title: "Design System Adoption Metrics & Coverage | Buoy"
description: "Measure design system adoption with real data. See which teams use components, token coverage, and adoption trends over time."
keywords: "design system adoption metrics, component usage tracking, design system ROI"
```

**Hero:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Measure adoption with real data                            │
│                                                             │
│  "We think we have 60% adoption" isn't good enough.         │
│  Buoy gives you the actual numbers.                         │
│                                                             │
│  [Get started free]                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Status Grid Example:**
```
┌─────────────────────────────────────────────────────────────┐
│  $ buoy status                                              │
│                                                             │
│  Design System Coverage                                     │
│  ═══════════════════════════════════════                   │
│                                                             │
│  Components: 47% ████████░░░░░░░░░░                        │
│  Tokens:     63% ████████████░░░░░░                        │
│  Overall:    52% ██████████░░░░░░░░                        │
│                                                             │
│  By Source:                                                 │
│  ├─ src/components/    78% ███████████████░                │
│  ├─ src/features/      34% ██████░░░░░░░░░                 │
│  └─ src/pages/         23% ████░░░░░░░░░░░                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### /features/ci

```yaml
title: "Design System CI/CD Checks | Buoy"
description: "Add design drift detection to your CI pipeline. Block PRs with critical drift. Get JSON output for custom integrations."
keywords: "design system ci cd, component library checks, automated design review"
```

---

### /features/github-action

```yaml
title: "Buoy GitHub Action - Design Drift PR Comments | Buoy"
description: "Add one workflow file. Get design drift reports on every pull request. Block merges on critical drift. Free forever."
keywords: "github action design system, design system pr checks, component library github action"
```

**Hero:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Catch design drift in every PR                             │
│                                                             │
│  Add one workflow file. Get drift reports on every pull     │
│  request. No server required.                               │
│                                                             │
│  [Add to your repo]                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Installation:**
```yaml
# .github/workflows/buoy.yml
name: Design Drift Check
on: [pull_request]

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: buoy-dev/buoy-action@v1
        with:
          fail-on: critical  # or 'warning', 'info', 'none'
```

**PR Comment Preview:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ## Buoy Drift Report                                       │
│                                                             │
│  | Severity | Count |                                       │
│  |----------|-------|                                       │
│  | 🔴 Critical | 0 |                                        │
│  | 🟡 Warning | 3 |                                         │
│  | 🟢 Info | 7 |                                            │
│                                                             │
│  ### Warnings                                               │
│  - `Card.tsx:12` Hardcoded color #ffffff                    │
│  - `Badge.tsx:8` Hardcoded spacing 8px                      │
│  - `Header.tsx:3` Using deprecated NavHeader                │
│                                                             │
│  ---                                                        │
│  📊 View trends over time → (requires Buoy Cloud)          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### /features/bootstrap

```yaml
title: "Extract Design Tokens from Existing Code | Buoy"
description: "Turn hardcoded colors, spacing, and fonts into design tokens. Scan your codebase and generate tokens.json, CSS variables, or Tailwind config."
keywords: "extract design tokens, create design tokens cli, hardcoded to design tokens"
```

**Hero:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Turn your hardcoded values into design tokens              │
│                                                             │
│  You have colors and spacing scattered everywhere.          │
│  Buoy extracts them into a token file in seconds.           │
│                                                             │
│  $ buoy bootstrap                                           │
│                                                             │
│  [Get started free]                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### /features/build

```yaml
title: "Generate Design System with AI | Buoy"
description: "Create a complete design system with AI. One command generates tokens, CSS variables, and Tailwind config. Powered by Claude."
keywords: "ai design system generator, generate design tokens ai, create design system cli"
```

**Hero:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Generate a design system with AI                           │
│                                                             │
│  Describe your style. Get tokens, CSS variables, and        │
│  Tailwind config. Powered by Claude.                        │
│                                                             │
│  $ buoy build --style minimal --primary "#3b82f6"           │
│                                                             │
│  [Try it now]                                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Integration Pages

### /integrations/react

```yaml
title: "React Component Drift Detection | Buoy"
description: "Scan React and JSX/TSX files for design drift. Detect hardcoded styles, duplicate components, and prop inconsistencies in your React codebase."
keywords: "react design system, react component audit, react code consistency"
```

**Content:**
- React-specific scanning features
- JSX/TSX support
- Props extraction
- styled-components/Emotion support
- React.memo and forwardRef detection
- Example buoy.config.mjs for React

---

### /integrations/vue

```yaml
title: "Vue Component Drift Detection | Buoy"
description: "Scan Vue SFC files for design drift. Detect hardcoded styles in template, script, and style blocks."
keywords: "vue design system, vue component audit, vue code consistency"
```

---

### /integrations/svelte

```yaml
title: "Svelte Component Drift Detection | Buoy"
description: "Scan Svelte files for design drift. Detect hardcoded styles and component inconsistencies in your Svelte codebase."
keywords: "svelte design system, svelte component audit, svelte code consistency"
```

---

### /integrations/angular

```yaml
title: "Angular Component Drift Detection | Buoy"
description: "Scan Angular components for design drift. Detect hardcoded styles in component templates and stylesheets."
keywords: "angular design system, angular component audit, angular code consistency"
```

---

### /integrations/nextjs

```yaml
title: "Next.js Design System Integration | Buoy"
description: "Design drift detection for Next.js applications. Scan pages, components, and app router for design system violations."
keywords: "nextjs design system, next.js component audit, next.js code consistency"
```

---

### /integrations/figma

```yaml
title: "Figma to Code Comparison | Buoy"
description: "Compare your Figma designs to your code implementation. Find components in Figma that aren't in code, and code that's drifted from design."
keywords: "figma to code, figma code comparison, design to code sync"
```

---

### /integrations/storybook

```yaml
title: "Storybook Component Drift Detection | Buoy"
description: "Scan your Storybook for design drift. Compare documented components to actual implementations across your codebase."
keywords: "storybook audit, storybook component drift, storybook consistency"
```

---

### /integrations/tailwind

```yaml
title: "Tailwind CSS Design Token Extraction | Buoy"
description: "Extract design tokens from Tailwind config. Detect when developers use arbitrary values instead of your Tailwind theme."
keywords: "tailwind design tokens, tailwind config extraction, tailwind consistency"
```

---

### /integrations/chakra-ui

```yaml
title: "Chakra UI Component Audit | Buoy"
description: "Audit your Chakra UI usage for design drift. Detect hardcoded values that should use Chakra theme tokens."
keywords: "chakra ui audit, chakra ui design tokens, chakra ui consistency"
```

---

### /integrations/material-ui

```yaml
title: "Material UI Design System Audit | Buoy"
description: "Audit MUI usage for design drift. Detect sx prop values that should use theme spacing, colors, and typography."
keywords: "material ui audit, mui design tokens, material ui consistency"
```

---

### /integrations/shadcn

```yaml
title: "shadcn/ui Component Audit | Buoy"
description: "Audit shadcn/ui usage for design drift. Ensure components use your CSS variables and follow your customizations."
keywords: "shadcn ui audit, shadcn design tokens, shadcn consistency"
```

---

### /integrations/github

```yaml
title: "GitHub Integration for Design Drift | Buoy"
description: "Post drift reports to GitHub PRs. Block merges on critical drift. Track design system health across repositories."
keywords: "github design system, github pr design checks, github action design"
```

---

## Use Case Pages

### /use-cases/design-system-teams

```yaml
title: "Design System Adoption Tools for Teams | Buoy"
description: "Measure design system adoption without manual audits. Track which teams use components, see coverage trends, prove ROI."
keywords: "design system adoption, design system metrics, design system ROI"
```

**Hero:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Measure adoption without manual audits                     │
│                                                             │
│  You built a design system. But is anyone using it?         │
│  Buoy gives you the data to prove ROI.                      │
│                                                             │
│  [Get started free]                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Pain Points:**
- Spending hours on manual audits
- No data on which teams are adopting
- Can't prove ROI of design system investment
- "We think we have 60% adoption" isn't good enough

**Value Props:**
- Automatic adoption percentage
- Per-component usage tracking
- Trend data over time
- Coverage by directory/team

---

### /use-cases/frontend-teams

```yaml
title: "Frontend Component Consistency Tools | Buoy"
description: "Keep components aligned as your frontend team scales. Catch hardcoded values, prop inconsistencies, and naming drift."
keywords: "frontend consistency, component library health, react team tools"
```

---

### /use-cases/modernization

```yaml
title: "Legacy Code Modernization Tracking | Buoy"
description: "Track your frontend migration from legacy to modern design system. Know what's migrated, what's legacy, and what's drifting."
keywords: "legacy modernization tracking, frontend migration, legacy code migration"
```

**Hero:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Track your modernization with data, not guesswork          │
│                                                             │
│  Leadership asks: "How much is migrated?"                   │
│  You say: "We think 60%?"                                   │
│                                                             │
│  Buoy shows exactly what's migrated, what's legacy,         │
│  and what's drifting in the new system.                     │
│                                                             │
│  [Get started free]                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### /use-cases/enterprise

```yaml
title: "Enterprise Design System Governance | Buoy"
description: "Design system governance at scale. Cross-team coverage reports, CI/CD enforcement, and exception documentation."
keywords: "enterprise design system, design system governance, multi-team design system"
```

---

### /use-cases/agencies

```yaml
title: "Agency Design System Workflow | Buoy"
description: "Maintain design consistency across client projects. Per-project configuration, client-ready reports, and handoff documentation."
keywords: "agency design system, client design consistency, agency workflow tools"
```

---

## Comparison Pages

### /compare/manual-audits

```yaml
title: "Buoy vs Manual Design Audits | Automated Design Drift Detection"
description: "Stop spending hours on spreadsheet audits. Buoy runs in seconds, catches everything, and stays current automatically."
keywords: "manual audit alternative, automated design audit, design system audit tool"
```

**Comparison Table:**
| Aspect | Manual Audit | Buoy |
|--------|--------------|------|
| Time | Hours/days | Seconds |
| Coverage | Sampling | Complete |
| Frequency | Quarterly | Every PR |
| Accuracy | Human error | Consistent |
| Cost | High labor | Free |
| Updates | Immediately outdated | Always current |

---

### /compare/figma-plugins

```yaml
title: "Buoy vs Figma Plugins | Code-First Design Drift Detection"
description: "Figma plugins only see Figma. Buoy scans your actual shipped codebase for design drift."
keywords: "figma plugin alternative, code design comparison, figma to code"
```

---

### /compare/eslint

```yaml
title: "Buoy vs ESLint | Design System Context Awareness"
description: "ESLint catches syntax errors. Buoy understands design system context, detecting semantic drift ESLint can't see."
keywords: "eslint design system, eslint alternative, semantic code analysis"
```

---

### /compare/chromatic

```yaml
title: "Buoy vs Chromatic | Structural Drift Detection"
description: "Chromatic catches visual regressions in Storybook. Buoy scans your entire codebase for structural design drift."
keywords: "chromatic alternative, visual regression alternative, design system testing"
```

---

### /compare/style-dictionary

```yaml
title: "Buoy vs Style Dictionary | Drift Detection Not Just Token Transform"
description: "Style Dictionary transforms tokens. Buoy finds where tokens aren't being used. They work great together."
keywords: "style dictionary alternative, design token enforcement, token usage detection"
```

---

## Pricing Page (/pricing)

```yaml
title: "Buoy Pricing | Free Open Source CLI + Cloud"
description: "Free forever open source CLI. Upgrade to Cloud for dashboard, trends, and team features. No credit card required."
keywords: "buoy pricing, design drift tool pricing, design system tool cost"
```

**Content:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Free forever. Upgrade when you're ready.                   │
│                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐          │
│  │ Free                │  │ Pro                 │          │
│  │ $0/forever          │  │ $299/month          │          │
│  │                     │  │                     │          │
│  │ Open source CLI     │  │ Unlimited users     │          │
│  │ Up to 3 users       │  │ Historical trends   │          │
│  │ All drift detection │  │ Figma sync          │          │
│  │ CLI scans           │  │ GitHub App          │          │
│  │ JSON output         │  │ Web dashboard       │          │
│  │                     │  │ Priority support    │          │
│  │ [Install]           │  │ [Start Trial]       │          │
│  └─────────────────────┘  └─────────────────────┘          │
│                                                             │
│  Enterprise: Custom pricing for SSO, multi-repo, SLAs       │
│                                                             │
│  ────────────────────────────────────────────────────────   │
│  No per-seat pricing. Add 50 devs, same $299/month.         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Blog Strategy

### Launch Posts
1. "Introducing Buoy: Design Drift Detection for the AI Era"
2. "Why AI is Making Design Systems Harder to Maintain"
3. "How to Measure Design System Adoption (With Data)"

### SEO-Driven Posts
| Topic | Target Keyword | URL |
|-------|---------------|-----|
| Why design systems fail at 40% adoption | design system adoption | /blog/40-percent-adoption |
| Hardcoded colors are killing your design system | hardcoded colors react | /blog/hardcoded-colors |
| Setting up design system CI/CD | design system ci cd | /blog/design-system-ci |
| Copilot doesn't know your design system | copilot design system | /blog/copilot-design-drift |
| The cost of design inconsistency | design inconsistency cost | /blog/cost-of-inconsistency |
| From Figma to code: Keeping sync | figma to code sync | /blog/figma-code-sync |
| Design system governance for scaling teams | design system governance | /blog/governance |
| Manual audits are broken | design audit automation | /blog/manual-audits-broken |
| Migration tracking with Buoy | frontend migration tracking | /blog/migration-tracking |
| Token extraction from existing code | extract design tokens | /blog/token-extraction |

---

## Technical Implementation Notes

### Recommended Stack
- **Framework:** Astro or Next.js (SSG mode)
- **Styling:** Tailwind CSS
- **Animations:** Framer Motion for terminal demos
- **Code highlighting:** Shiki or Prism
- **Analytics:** Plausible or Simple Analytics (privacy-first)
- **Forms:** Formspree or custom serverless

### Performance Requirements
- Static generation for all pages
- Image optimization (WebP, AVIF)
- Font subsetting
- Lazy loading for below-fold content
- < 100kb JS bundle

### Accessibility Requirements
- WCAG 2.1 AA compliance
- Keyboard navigation for all interactive elements
- Skip to main content link
- Sufficient color contrast
- Screen reader testing

### Open Graph Images
Generate unique OG images for each page:
- `/og/home.png` - Main brand image
- `/og/features-{slug}.png` - Feature screenshots
- `/og/integrations-{slug}.png` - Integration logos
- `/og/use-cases-{slug}.png` - Use case illustrations
- `/og/compare-{slug}.png` - Comparison charts

---

## Content Checklist

### Before Launch
- [ ] All page titles < 60 chars
- [ ] All meta descriptions < 155 chars
- [ ] Canonical URLs on all pages
- [ ] OG images for all pages (1200x630)
- [ ] Structured data validated
- [ ] Mobile responsive tested
- [ ] Lighthouse > 90 all metrics
- [ ] Internal linking between related pages
- [ ] External links to docs/GitHub
- [ ] 404 page with navigation
- [ ] XML sitemap generated
- [ ] robots.txt configured
- [ ] Analytics installed
- [ ] Search console connected

### Launch Day
- [ ] Submit sitemap to Google Search Console
- [ ] Submit sitemap to Bing Webmaster Tools
- [ ] Share on Hacker News
- [ ] Post on Twitter/X
- [ ] Post on LinkedIn
- [ ] Submit to Product Hunt
- [ ] Announce in design system communities

---

## Ongoing SEO Maintenance

### Weekly
- Publish 1-2 blog posts
- Share content on social

### Monthly
- Review Search Console for new keyword opportunities
- Update existing content with new features
- Add new integration/comparison pages as needed

### Quarterly
- Full technical SEO audit
- Content refresh for top pages
- Competitor analysis
