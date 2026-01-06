# The Intent Carrier: Design Meaning That Survives

> **Date:** 2026-01-05
> **Status:** Vision Document
> **Parent:** [Master Vision](./2026-01-05-master-vision.md)

---

## Overview

The biggest loss in design-to-code handoff isn't pixels—it's **intent**. Designers know WHY something is blue, WHY spacing is 16px, WHY this button is prominent. But that knowledge dies in Figma.

**Core Insight:** Every design decision has a reason. That reason should travel with the decision.

---

## What Is Design Intent?

When a designer makes a button blue, they're not thinking "hex #2563EB". They're thinking:

- "This is the primary action—the ONE thing I want users to do"
- "This blue conveys trust and professionalism for our financial app"
- "It needs to be prominent but not aggressive"
- "It follows our accessibility requirements for WCAG AA"
- "It's part of a visual hierarchy where secondary actions are ghost buttons"

When that design becomes code, all of this evaporates. What survives:

```css
background-color: #2563EB;
```

The AI coding assistant sees a color. The junior developer sees a color. **Nobody sees the intent.**

---

## The Layers of Intent

### 1. Hierarchy Intent
- "This is the primary action on this page"
- "These items are equal weight"
- "This content is supplementary"

### 2. Emotional Intent
- "This should feel trustworthy and stable"
- "This should create urgency without anxiety"
- "This should feel playful and approachable"

### 3. Brand Intent
- "This is our signature interaction"
- "This differentiates us from competitors"
- "This reinforces our 'precision' brand attribute"

### 4. Accessibility Intent
- "This contrast ratio is intentional for low-vision users"
- "This touch target is sized for motor accessibility"
- "This animation can be reduced for motion sensitivity"

### 5. Behavioral Intent
- "This should draw the eye first"
- "This should feel clickable/tappable"
- "This should indicate loading state is possible"

### 6. Contextual Intent
- "This only appears when user is authenticated"
- "This changes meaning in dark mode"
- "This is the mobile-equivalent of the desktop sidebar"

---

## The Intent Protocol

### Layer 1: Figma Annotation

Designers annotate intent directly in Figma:

```yaml
component: PrimaryButton
intent:
  hierarchy: primary-action
  emotion: [trust, confidence]
  brand: signature-cta
  accessibility:
    min-contrast: 4.5:1
    touch-target: 44px
  behavior:
    draws-attention: true
    indicates-progress: true
  context:
    usage: "Use for the single most important action per screen"
    avoid: "Never use more than one primary button in a form"
```

### Layer 2: Token Export

Intent travels WITH tokens:

```javascript
export const tokens = {
  colors: {
    'action-primary': {
      value: '#2563EB',
      intent: {
        hierarchy: 'primary-action',
        emotion: ['trust', 'confidence'],
        usage: 'Primary CTAs, submit buttons, main navigation actions',
        avoid: 'Decorative elements, backgrounds, secondary actions',
        wcag: 'AA-large-text',
        brand: 'Signature blue - approved by brand team Q3 2024'
      }
    },
    'action-destructive': {
      value: '#DC2626',
      intent: {
        hierarchy: 'primary-action',
        emotion: ['warning', 'irreversibility'],
        usage: 'Delete, remove, cancel subscription',
        requires: 'Confirmation dialog for destructive actions'
      }
    }
  }
}
```

### Layer 3: Code Components

Components carry intent as metadata:

```tsx
/**
 * @intent-hierarchy primary-action
 * @intent-emotion trust, confidence
 * @intent-usage Primary CTAs - one per screen/form maximum
 * @intent-avoid Multiple primary buttons in same view
 */
export function Button({ variant = 'primary', ...props }) {
  // Implementation
}

// Or as runtime metadata
Button.designIntent = {
  hierarchy: 'primary-action',
  emotion: ['trust', 'confidence'],
  usage: 'Primary CTAs - one per screen/form maximum',
  constraints: ['max-one-per-view']
};
```

### Layer 4: AI Context

When AI tools encounter code, they receive rich context:

```markdown
## Design System Context

### Color: action-primary (#2563EB)
- **Purpose**: Primary call-to-action
- **Emotion**: Trust, confidence, professionalism
- **Usage**: Main submit buttons, primary navigation
- **Constraint**: Maximum ONE primary action per screen
- **Brand note**: "Our signature blue - differentiates us from competitor red tones"

### When generating code:
- If user asks for "a button", clarify: primary or secondary?
- If you see multiple primary buttons, flag this as a design violation
- If hardcoding #2563EB, use `var(--action-primary)` instead
```

---

## Intent-Aware Development

### Scenario: Developer Adding a Button

**Without Intent:**
```
Developer: "I need a button here"
AI: "Here's a button with Tailwind classes"
Result: Random styling, no hierarchy consideration
```

**With Intent:**
```
Developer: "I need a button here"

AI: "I see this page already has a primary action ('Submit Order').
What's the intent of this new button?

1. Secondary action (complements primary) → outline variant
2. Tertiary/ghost (less important) → ghost variant
3. Destructive (irreversible action) → destructive variant
4. This SHOULD be the primary action → let's discuss hierarchy

The current primary action 'Submit Order' has intent:
'Final conversion action - highest visual prominence'"

Developer: "It's for applying a coupon code"

AI: "That's a secondary action - it supports the purchase but
isn't the main goal. Using secondary variant:

<Button variant="secondary">Apply Coupon</Button>

This maintains visual hierarchy with Submit Order as primary."
```

### Scenario: Code Review with Intent

```
PR Review: Add promotional banner

⚠️  Intent Violation Detected

Line 34: <div className="bg-blue-500">

This uses the same blue as action-primary but:
- Context: Decorative banner background
- Intent mismatch: action-primary is for CTAs, not backgrounds

Suggestion: Use 'surface-accent' (#DBEAFE) for decorative backgrounds.
This preserves brand blue association without implying clickability.

Intent note from design system:
"action-primary should only be used where clicking is expected.
For decorative brand color, use surface-accent variants."
```

---

## The Intent Schema

```typescript
interface DesignIntent {
  // Visual hierarchy role
  hierarchy?:
    | 'primary-action'
    | 'secondary-action'
    | 'tertiary-action'
    | 'destructive-action'
    | 'navigation'
    | 'content-primary'
    | 'content-secondary'
    | 'decorative';

  // Emotional qualities
  emotion?: Array<
    | 'trust' | 'confidence' | 'urgency' | 'calm'
    | 'playful' | 'serious' | 'premium' | 'warning'
  >;

  // Brand meaning
  brand?: {
    attribute?: string;      // "precision", "innovation"
    signature?: boolean;     // Brand differentiator?
    approved?: string;       // "Brand team Q3 2024"
  };

  // Usage guidance
  usage?: string;            // When TO use
  avoid?: string;            // When NOT to use
  constraints?: string[];    // "one per screen"

  // Accessibility
  accessibility?: {
    role?: string;
    contrast?: string;
    touchTarget?: string;
    motionSafe?: boolean;
  };

  // Relationships
  pairs_with?: string[];     // Works well with
  replaces?: string;         // Supersedes what?

  // Origin
  source?: {
    figma?: string;          // Figma link
    author?: string;
    rationale?: string;      // WHY this exists
  };
}
```

---

## Implementation in Buoy

### New Command: `buoy intent`

```bash
# Show intent for a token/component
$ buoy intent --token action-primary

Token: action-primary
Value: #2563EB
Hierarchy: primary-action
Emotion: trust, confidence
Usage: Primary CTAs, submit buttons, main actions
Avoid: Backgrounds, decorative elements, secondary actions
Constraint: Maximum one primary action per screen
Source: Figma/Design-System-v3 (Sarah Chen, 2024-03-15)
Rationale: "Blue chosen for trust association in financial context"

Used in codebase: 47 locations
  ✓ 43 match intent (buttons, CTAs)
  ⚠ 4 potential misuse (review recommended)
```

```bash
# Analyze intent coverage
$ buoy intent --coverage

Intent Coverage Report:
  Tokens with intent: 34/52 (65%)
  Components with intent: 12/28 (43%)

Missing intent (high priority):
  - spacing-4: Used 234 times, no documented purpose
  - gray-500: Used for both text and borders (ambiguous)

Actions:
  1. Run 'buoy intent --generate' to infer intent from usage
  2. Export to Figma plugin for designer annotation
```

```bash
# Generate intent from patterns
$ buoy intent --generate

Analyzing 1,247 component usages...

Inferred Intent (confidence > 80%):

1. Token: text-gray-900 (94% confidence)
   Inferred hierarchy: content-primary
   Evidence: Used for headings (89%), primary body text (11%)

2. Token: text-gray-500 (87% confidence)
   Inferred hierarchy: content-tertiary
   Evidence: Metadata (67%), timestamps (22%), placeholders (11%)

Save inferred intent? [Y/n]
```

### New Drift Type: Intent Violation

```typescript
type DriftType =
  | 'hardcoded-value'
  | 'naming-inconsistency'
  | 'deprecated-pattern'
  | 'intent-violation'      // NEW: Using token against its intent
  | 'hierarchy-violation'   // NEW: Multiple primary actions
  | 'emotion-mismatch';     // NEW: Using "trust" color for error
```

### Intent-Aware Scan

```bash
$ buoy sweep --check-intent

INTENT VIOLATIONS:

1. src/pages/Pricing.tsx:45
   Multiple primary actions detected (intent: one per screen)

   Found 3 primary buttons:
   - "Start Free Trial" (line 45) ← Keep as primary
   - "Contact Sales" (line 67) ← Suggest: secondary
   - "Compare Plans" (line 89) ← Suggest: ghost

2. src/components/Alert.tsx:23
   Emotion mismatch: Using 'trust' color for error state

   <div className="bg-blue-500"> {/* Error banner */}

   Intent conflict:
   - bg-blue-500 intent: trust, confidence, positive
   - Error context intent: warning, attention, problem

   Suggestion: Use 'feedback-error' (#DC2626)
```

---

## Figma Plugin: Intent Annotator

### Quick Intent Panel

When designer selects a component:

```
┌─────────────────────────────────────┐
│ Intent Annotator                    │
├─────────────────────────────────────┤
│ Component: PrimaryButton            │
│                                     │
│ Hierarchy: [Primary Action ▼]       │
│                                     │
│ Emotion: [trust] [confidence] [+]   │
│                                     │
│ Usage:                              │
│ ┌─────────────────────────────────┐ │
│ │ Main CTA for form submission.   │ │
│ │ One per screen maximum.         │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ☑ Sync to design tokens            │
│ ☑ Include in developer handoff     │
│                                     │
│ [Save Intent]                       │
└─────────────────────────────────────┘
```

### Intent Suggestions

Plugin analyzes patterns and suggests:

```
💡 Intent Suggestion

You've used this blue (#2563EB) on 12 buttons labeled:
"Submit", "Continue", "Save", "Confirm"

Suggested intent:
  Hierarchy: Primary Action
  Emotion: Trust, Commitment
  Constraint: One per screen

[Accept] [Modify] [Dismiss]
```

---

## The Transformation

### Before Intent Carrier

**Designer**: "I made this blue because it's trustworthy"
**Figma**: Stores hex #2563EB
**Token export**: `--primary-blue: #2563EB`
**Developer**: "I need a button, I'll use primary-blue"
**AI**: "Here's a blue button"
**Result**: 3 blue buttons competing for attention

### After Intent Carrier

**Designer**: "This is the primary action" → Annotates intent
**Figma**: Stores intent + visual
**Token export**: `--action-primary` with full metadata
**Developer**: "I need a button for X"
**AI**: "What's the intent? Is this the main action or supporting?"
**Buoy scan**: "⚠️ Two primary buttons detected"
**Result**: Clear visual hierarchy, design rationale preserved

---

## Success Metrics

- **Intent Coverage**: % of tokens with documented intent
- **Intent Match Rate**: % of usage that matches declared intent
- **AI Awareness**: % of AI suggestions that consider intent
- **Violation Prevention**: Intent violations caught before merge
- **Designer-Developer Alignment**: Survey—"Developer understood my intent"

---

*The Intent Carrier doesn't just prevent drift—it preserves design intelligence. It turns ephemeral opinions into durable, machine-readable, AI-consumable knowledge.*
