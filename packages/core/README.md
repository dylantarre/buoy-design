# @ahoybuoy/core

Core domain models and drift detection engine for Buoy.

## Installation

```bash
npm install @ahoybuoy/core
```

## Usage

```typescript
import { SemanticDiffEngine } from '@ahoybuoy/core/analysis';
import { generateFixes } from '@ahoybuoy/core';
import type { Component, DriftSignal, Fix } from '@ahoybuoy/core';

// Analyze components for drift
const engine = new SemanticDiffEngine();
const result = engine.analyzeComponents(components, {
  checkDeprecated: true,
  checkNaming: true,
});

console.log(result.drifts); // DriftSignal[]

// Generate fixes for drift signals
const fixes = generateFixes(drifts, tokens);
console.log(fixes); // Fix[]
```

## Models

- **Component** - UI components from any framework
- **DesignToken** - Color, spacing, typography values
- **DriftSignal** - Detected inconsistencies
- **Fix** - Proposed fix with confidence score

## Confidence Levels

Fix suggestions include a confidence level:

| Level | Score | Meaning |
|-------|-------|---------|
| `exact` | 100% | Value exactly matches a design token |
| `high` | 95-99% | Very close match, safe to auto-apply |
| `medium` | 70-94% | Close match, review recommended |
| `low` | <70% | Ambiguous, manual review required |

## Links

- [Buoy CLI](https://www.npmjs.com/package/@ahoybuoy/cli)
- [Documentation](https://buoy.design/docs)
