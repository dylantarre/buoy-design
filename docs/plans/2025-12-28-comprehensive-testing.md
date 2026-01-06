# Buoy Comprehensive Testing Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish comprehensive test coverage for the Buoy design drift detection tool, covering unit tests, integration tests, and end-to-end tests for all packages.

**Architecture:** Test pyramid approach - extensive unit tests for core logic, integration tests for scanners and plugins, E2E tests for CLI commands. All tests use Vitest with TypeScript, mocking external dependencies (filesystem, GitHub API, Figma API).

**Tech Stack:** Vitest, @vitest/coverage-v8, memfs (virtual filesystem), msw (API mocking)

---

## Phase 1: Test Infrastructure Setup

### Task 1.1: Add Vitest to Root Workspace

**Files:**
- Create: `vitest.workspace.ts`
- Modify: `package.json`

**Step 1: Add test dependencies to root package.json**

```json
{
  "devDependencies": {
    "vitest": "^2.1.0",
    "@vitest/coverage-v8": "^2.1.0"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

**Step 2: Create vitest workspace config**

```typescript
// vitest.workspace.ts
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/core',
  'packages/scanners',
  'packages/db',
  'packages/plugin-react',
  'packages/plugin-github',
  'apps/cli',
]);
```

**Step 3: Run pnpm install**

Run: `pnpm install`

**Step 4: Commit**

```bash
git add package.json vitest.workspace.ts pnpm-lock.yaml
git commit -m "chore: add vitest workspace configuration"
```

---

### Task 1.2: Configure @buoy/core for Testing

**Files:**
- Create: `packages/core/vitest.config.ts`
- Modify: `packages/core/package.json`

**Step 1: Add vitest config for core package**

```typescript
// packages/core/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
    },
  },
});
```

**Step 2: Add test script to package.json**

Add to `packages/core/package.json` scripts:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

**Step 3: Commit**

```bash
git add packages/core/vitest.config.ts packages/core/package.json
git commit -m "chore(core): add vitest configuration"
```

---

### Task 1.3: Configure Remaining Packages for Testing

**Files:**
- Create: `packages/scanners/vitest.config.ts`
- Create: `packages/plugin-github/vitest.config.ts`
- Create: `apps/cli/vitest.config.ts`
- Modify: Each package.json

Repeat the vitest config pattern for each package. For scanners, add memfs mock:

```typescript
// packages/scanners/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
```

**Step: Commit**

```bash
git add packages/*/vitest.config.ts apps/cli/vitest.config.ts
git commit -m "chore: add vitest configuration to all packages"
```

---

## Phase 2: Core Package Unit Tests

### Task 2.1: Test Drift Model Helpers

**Files:**
- Create: `packages/core/src/models/drift.test.ts`
- Test: `packages/core/src/models/drift.ts`

**Step 1: Write the failing tests**

```typescript
// packages/core/src/models/drift.test.ts
import { describe, it, expect } from 'vitest';
import {
  createDriftId,
  getSeverityWeight,
  getDefaultSeverity,
} from './drift.js';

describe('drift model helpers', () => {
  describe('createDriftId', () => {
    it('creates id with source only', () => {
      const id = createDriftId('hardcoded-value', 'component-123');
      expect(id).toBe('drift:hardcoded-value:component-123');
    });

    it('creates id with source and target', () => {
      const id = createDriftId('semantic-mismatch', 'src-1', 'tgt-2');
      expect(id).toBe('drift:semantic-mismatch:src-1:tgt-2');
    });
  });

  describe('getSeverityWeight', () => {
    it('returns 3 for critical', () => {
      expect(getSeverityWeight('critical')).toBe(3);
    });

    it('returns 2 for warning', () => {
      expect(getSeverityWeight('warning')).toBe(2);
    });

    it('returns 1 for info', () => {
      expect(getSeverityWeight('info')).toBe(1);
    });
  });

  describe('getDefaultSeverity', () => {
    it('returns critical for accessibility-conflict', () => {
      expect(getDefaultSeverity('accessibility-conflict')).toBe('critical');
    });

    it('returns warning for hardcoded-value', () => {
      expect(getDefaultSeverity('hardcoded-value')).toBe('warning');
    });

    it('returns info for naming-inconsistency', () => {
      expect(getDefaultSeverity('naming-inconsistency')).toBe('info');
    });
  });
});
```

**Step 2: Run test to verify it passes**

Run: `pnpm --filter @buoy/core test`
Expected: PASS (these test existing implementation)

**Step 3: Commit**

```bash
git add packages/core/src/models/drift.test.ts
git commit -m "test(core): add drift model helper tests"
```

---

### Task 2.2: Test Component Model Helpers

**Files:**
- Create: `packages/core/src/models/component.test.ts`
- Test: `packages/core/src/models/component.ts`

**Step 1: Write the tests**

```typescript
// packages/core/src/models/component.test.ts
import { describe, it, expect } from 'vitest';
import { createComponentId, normalizeComponentName } from './component.js';
import type { ReactSource, FigmaSource, VueSource } from './component.js';

describe('component model helpers', () => {
  describe('createComponentId', () => {
    it('creates id for React component', () => {
      const source: ReactSource = {
        type: 'react',
        path: 'src/Button.tsx',
        exportName: 'Button',
      };
      const id = createComponentId(source, 'Button');
      expect(id).toBe('react:src/Button.tsx:Button');
    });

    it('creates id for Figma component', () => {
      const source: FigmaSource = {
        type: 'figma',
        fileKey: 'abc123',
        nodeId: '1:23',
      };
      const id = createComponentId(source, 'Button');
      expect(id).toBe('figma:abc123:1:23');
    });

    it('creates id for Vue component', () => {
      const source: VueSource = {
        type: 'vue',
        path: 'src/Button.vue',
        exportName: 'default',
      };
      const id = createComponentId(source, 'Button');
      expect(id).toBe('vue:src/Button.vue:default');
    });
  });

  describe('normalizeComponentName', () => {
    it('lowercases names', () => {
      expect(normalizeComponentName('Button')).toBe('button');
    });

    it('removes hyphens', () => {
      expect(normalizeComponentName('my-button')).toBe('mybutton');
    });

    it('removes underscores', () => {
      expect(normalizeComponentName('my_button')).toBe('mybutton');
    });

    it('removes spaces', () => {
      expect(normalizeComponentName('My Button')).toBe('mybutton');
    });

    it('removes Component suffix', () => {
      expect(normalizeComponentName('ButtonComponent')).toBe('button');
    });

    it('handles complex names', () => {
      expect(normalizeComponentName('Primary-Button_Component')).toBe('primarybutton');
    });
  });
});
```

**Step 2: Run test**

Run: `pnpm --filter @buoy/core test`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/core/src/models/component.test.ts
git commit -m "test(core): add component model helper tests"
```

---

### Task 2.3: Test Token Model Helpers

**Files:**
- Create: `packages/core/src/models/token.test.ts`
- Test: `packages/core/src/models/token.ts`

**Step 1: Write the tests**

```typescript
// packages/core/src/models/token.test.ts
import { describe, it, expect } from 'vitest';
import { createTokenId, normalizeTokenName, tokensMatch } from './token.js';

describe('token model helpers', () => {
  describe('createTokenId', () => {
    it('creates id for CSS token', () => {
      const id = createTokenId('css', 'variables.css', '--primary-color');
      expect(id).toBe('css:variables.css:--primary-color');
    });

    it('creates id for Figma token', () => {
      const id = createTokenId('figma', 'abc123', 'Primary/500');
      expect(id).toBe('figma:abc123:Primary/500');
    });
  });

  describe('normalizeTokenName', () => {
    it('lowercases names', () => {
      expect(normalizeTokenName('--Primary-Color')).toBe('--primary-color');
    });

    it('handles CSS variable format', () => {
      expect(normalizeTokenName('--spacing-lg')).toBe('--spacing-lg');
    });
  });

  describe('tokensMatch', () => {
    it('matches identical colors', () => {
      expect(tokensMatch('#ffffff', '#ffffff')).toBe(true);
    });

    it('matches equivalent hex colors (case insensitive)', () => {
      expect(tokensMatch('#FFFFFF', '#ffffff')).toBe(true);
    });

    it('detects different colors', () => {
      expect(tokensMatch('#ffffff', '#000000')).toBe(false);
    });

    it('matches identical spacing', () => {
      expect(tokensMatch('16px', '16px')).toBe(true);
    });

    it('detects different spacing', () => {
      expect(tokensMatch('16px', '24px')).toBe(false);
    });
  });
});
```

**Step 2: Run test**

Run: `pnpm --filter @buoy/core test`

**Step 3: Commit**

```bash
git add packages/core/src/models/token.test.ts
git commit -m "test(core): add token model helper tests"
```

---

### Task 2.4: Test SemanticDiffEngine - Framework Sprawl Detection

**Files:**
- Create: `packages/core/src/analysis/semantic-diff.test.ts`
- Test: `packages/core/src/analysis/semantic-diff.ts`

**Step 1: Write the tests**

```typescript
// packages/core/src/analysis/semantic-diff.test.ts
import { describe, it, expect } from 'vitest';
import { SemanticDiffEngine } from './semantic-diff.js';

describe('SemanticDiffEngine', () => {
  const engine = new SemanticDiffEngine();

  describe('checkFrameworkSprawl', () => {
    it('returns null for single framework', () => {
      const result = engine.checkFrameworkSprawl([
        { name: 'react', version: '18.2.0' },
      ]);
      expect(result).toBeNull();
    });

    it('returns null for empty frameworks', () => {
      const result = engine.checkFrameworkSprawl([]);
      expect(result).toBeNull();
    });

    it('detects sprawl with two UI frameworks', () => {
      const result = engine.checkFrameworkSprawl([
        { name: 'react', version: '18.2.0' },
        { name: 'vue', version: '3.0.0' },
      ]);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('framework-sprawl');
      expect(result?.severity).toBe('warning');
      expect(result?.message).toContain('2 UI frameworks');
    });

    it('ignores non-UI frameworks', () => {
      const result = engine.checkFrameworkSprawl([
        { name: 'react', version: '18.2.0' },
        { name: 'express', version: '4.0.0' },
      ]);
      expect(result).toBeNull();
    });

    it('detects sprawl with meta-frameworks', () => {
      const result = engine.checkFrameworkSprawl([
        { name: 'nextjs', version: '14.0.0' },
        { name: 'nuxt', version: '3.0.0' },
      ]);
      expect(result).not.toBeNull();
      expect(result?.message).toContain('nextjs');
      expect(result?.message).toContain('nuxt');
    });
  });
});
```

**Step 2: Run test**

Run: `pnpm --filter @buoy/core test`

**Step 3: Commit**

```bash
git add packages/core/src/analysis/semantic-diff.test.ts
git commit -m "test(core): add framework sprawl detection tests"
```

---

### Task 2.5: Test SemanticDiffEngine - Component Comparison

**Files:**
- Modify: `packages/core/src/analysis/semantic-diff.test.ts`

**Step 1: Add component comparison tests**

```typescript
// Add to semantic-diff.test.ts

describe('compareComponents', () => {
  it('matches components with exact names', () => {
    const source = [createMockComponent('Button', 'react')];
    const target = [createMockComponent('Button', 'figma')];

    const result = engine.compareComponents(source, target);

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].matchType).toBe('exact');
    expect(result.matches[0].confidence).toBe(1);
    expect(result.orphanedSource).toHaveLength(0);
    expect(result.orphanedTarget).toHaveLength(0);
  });

  it('identifies orphaned source components', () => {
    const source = [
      createMockComponent('Button', 'react'),
      createMockComponent('Card', 'react'),
    ];
    const target = [createMockComponent('Button', 'figma')];

    const result = engine.compareComponents(source, target);

    expect(result.orphanedSource).toHaveLength(1);
    expect(result.orphanedSource[0].name).toBe('Card');
  });

  it('identifies orphaned target components', () => {
    const source = [createMockComponent('Button', 'react')];
    const target = [
      createMockComponent('Button', 'figma'),
      createMockComponent('Modal', 'figma'),
    ];

    const result = engine.compareComponents(source, target);

    expect(result.orphanedTarget).toHaveLength(1);
    expect(result.orphanedTarget[0].name).toBe('Modal');
  });

  it('generates drift signals for orphaned components', () => {
    const source = [createMockComponent('UniqueComponent', 'react')];
    const target: Component[] = [];

    const result = engine.compareComponents(source, target);

    expect(result.drifts).toHaveLength(1);
    expect(result.drifts[0].type).toBe('orphaned-component');
  });
});

// Helper function
function createMockComponent(name: string, type: 'react' | 'figma'): Component {
  const source = type === 'react'
    ? { type: 'react' as const, path: `src/${name}.tsx`, exportName: name }
    : { type: 'figma' as const, fileKey: 'abc', nodeId: '1:1' };

  return {
    id: `${type}:${name}`,
    name,
    source,
    props: [],
    variants: [],
    tokens: [],
    dependencies: [],
    metadata: {},
    scannedAt: new Date(),
  };
}
```

**Step 2: Run test**

Run: `pnpm --filter @buoy/core test`

**Step 3: Commit**

```bash
git add packages/core/src/analysis/semantic-diff.test.ts
git commit -m "test(core): add component comparison tests"
```

---

### Task 2.6: Test SemanticDiffEngine - Component Analysis

**Files:**
- Modify: `packages/core/src/analysis/semantic-diff.test.ts`

**Step 1: Add component analysis tests**

```typescript
// Add to semantic-diff.test.ts

describe('analyzeComponents', () => {
  describe('deprecated patterns', () => {
    it('detects deprecated components', () => {
      const components = [
        createMockComponentWithMetadata('OldButton', { deprecated: true }),
      ];

      const result = engine.analyzeComponents(components, { checkDeprecated: true });

      expect(result.drifts).toHaveLength(1);
      expect(result.drifts[0].type).toBe('deprecated-pattern');
      expect(result.drifts[0].severity).toBe('warning');
    });

    it('includes deprecation reason in suggestions', () => {
      const components = [
        createMockComponentWithMetadata('OldButton', {
          deprecated: true,
          deprecationReason: 'Use NewButton instead',
        }),
      ];

      const result = engine.analyzeComponents(components, { checkDeprecated: true });

      expect(result.drifts[0].details.suggestions).toContain('Use NewButton instead');
    });
  });

  describe('hardcoded values', () => {
    it('detects hardcoded colors', () => {
      const components = [
        createMockComponentWithMetadata('Button', {
          hardcodedValues: [
            { type: 'color', value: '#ff0000', property: 'backgroundColor', location: 'line 10' },
          ],
        }),
      ];

      const result = engine.analyzeComponents(components, {});

      const colorDrift = result.drifts.find(d =>
        d.type === 'hardcoded-value' && d.message.includes('color')
      );
      expect(colorDrift).toBeDefined();
      expect(colorDrift?.severity).toBe('warning');
    });

    it('detects hardcoded spacing', () => {
      const components = [
        createMockComponentWithMetadata('Button', {
          hardcodedValues: [
            { type: 'spacing', value: '16px', property: 'padding', location: 'line 15' },
          ],
        }),
      ];

      const result = engine.analyzeComponents(components, {});

      const spacingDrift = result.drifts.find(d =>
        d.type === 'hardcoded-value' && d.message.includes('size')
      );
      expect(spacingDrift).toBeDefined();
      expect(spacingDrift?.severity).toBe('info');
    });
  });

  describe('naming consistency', () => {
    it('detects naming outliers', () => {
      const components = [
        createMockComponent('Button', 'react'),
        createMockComponent('Card', 'react'),
        createMockComponent('Modal', 'react'),
        createMockComponent('dropdown', 'react'), // lowercase outlier
      ];

      const result = engine.analyzeComponents(components, { checkNaming: true });

      const namingDrift = result.drifts.find(d =>
        d.type === 'naming-inconsistency' && d.message.includes('dropdown')
      );
      expect(namingDrift).toBeDefined();
    });
  });

  describe('duplicate detection', () => {
    it('detects potential duplicates', () => {
      const components = [
        createMockComponent('Button', 'react'),
        createMockComponent('ButtonNew', 'react'),
        createMockComponent('ButtonV2', 'react'),
      ];

      const result = engine.analyzeComponents(components, {});

      const dupDrift = result.drifts.find(d =>
        d.message.includes('duplicate')
      );
      expect(dupDrift).toBeDefined();
    });
  });
});

function createMockComponentWithMetadata(name: string, metadata: Partial<ComponentMetadata>): Component {
  return {
    ...createMockComponent(name, 'react'),
    metadata,
  };
}
```

**Step 2: Run test**

Run: `pnpm --filter @buoy/core test`

**Step 3: Commit**

```bash
git add packages/core/src/analysis/semantic-diff.test.ts
git commit -m "test(core): add component analysis tests"
```

---

### Task 2.7: Test SemanticDiffEngine - Token Comparison

**Files:**
- Modify: `packages/core/src/analysis/semantic-diff.test.ts`

**Step 1: Add token comparison tests**

```typescript
// Add to semantic-diff.test.ts

describe('compareTokens', () => {
  it('matches tokens with same names', () => {
    const source = [createMockToken('--primary-color', '#0066cc', 'css')];
    const target = [createMockToken('--primary-color', '#0066cc', 'figma')];

    const result = engine.compareTokens(source, target);

    expect(result.matches).toHaveLength(1);
    expect(result.drifts).toHaveLength(0);
  });

  it('detects value divergence', () => {
    const source = [createMockToken('--primary-color', '#0066cc', 'css')];
    const target = [createMockToken('--primary-color', '#ff0000', 'figma')];

    const result = engine.compareTokens(source, target);

    expect(result.matches).toHaveLength(1);
    expect(result.drifts).toHaveLength(1);
    expect(result.drifts[0].type).toBe('value-divergence');
  });

  it('identifies orphaned tokens', () => {
    const source = [
      createMockToken('--primary-color', '#0066cc', 'css'),
      createMockToken('--secondary-color', '#666666', 'css'),
    ];
    const target = [createMockToken('--primary-color', '#0066cc', 'figma')];

    const result = engine.compareTokens(source, target);

    expect(result.orphanedSource).toHaveLength(1);
    expect(result.orphanedSource[0].name).toBe('--secondary-color');
  });
});

function createMockToken(name: string, value: string, type: 'css' | 'figma'): DesignToken {
  const source = type === 'css'
    ? { type: 'css' as const, path: 'tokens.css' }
    : { type: 'figma' as const, fileKey: 'abc' };

  return {
    id: `${type}:${name}`,
    name,
    value,
    category: 'color',
    source,
    aliases: [],
    usedIn: [],
    scannedAt: new Date(),
  };
}
```

**Step 2: Run test**

Run: `pnpm --filter @buoy/core test`

**Step 3: Commit**

```bash
git add packages/core/src/analysis/semantic-diff.test.ts
git commit -m "test(core): add token comparison tests"
```

---

## Phase 3: Scanner Unit Tests

### Task 3.1: Create Test Fixtures and Setup

**Files:**
- Create: `packages/scanners/src/__tests__/setup.ts`
- Create: `packages/scanners/src/__tests__/fixtures/`

**Step 1: Create test setup with virtual filesystem**

```typescript
// packages/scanners/src/__tests__/setup.ts
import { vi } from 'vitest';

// Mock fs/promises for scanner tests
vi.mock('fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

// Reset filesystem between tests
beforeEach(() => {
  // Clear virtual filesystem
});
```

**Step 2: Create fixture files**

```typescript
// packages/scanners/src/__tests__/fixtures/react-components.ts
export const SIMPLE_BUTTON = `
import React from 'react';

export function Button({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick}>{children}</button>;
}
`;

export const ARROW_COMPONENT = `
import React from 'react';

export const Card = ({ title }: { title: string }) => {
  return <div className="card">{title}</div>;
};
`;

export const HARDCODED_STYLES = `
import React from 'react';

export function Badge({ label }: { label: string }) {
  return (
    <span style={{ backgroundColor: '#ff0000', padding: '8px' }}>
      {label}
    </span>
  );
}
`;

export const DEPRECATED_COMPONENT = `
import React from 'react';

/**
 * @deprecated Use NewButton instead
 */
export function OldButton({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick}>Click</button>;
}
`;
```

**Step 3: Commit**

```bash
git add packages/scanners/src/__tests__/
git commit -m "test(scanners): add test setup and fixtures"
```

---

### Task 3.2: Test ReactComponentScanner - Basic Parsing

**Files:**
- Create: `packages/scanners/src/git/react-scanner.test.ts`

**Step 1: Write the tests**

```typescript
// packages/scanners/src/git/react-scanner.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ReactComponentScanner } from './react-scanner.js';
import { vol } from 'memfs';
import {
  SIMPLE_BUTTON,
  ARROW_COMPONENT,
  HARDCODED_STYLES,
  DEPRECATED_COMPONENT,
} from '../__tests__/fixtures/react-components.js';

describe('ReactComponentScanner', () => {
  beforeEach(() => {
    vol.reset();
  });

  describe('component detection', () => {
    it('detects function declaration components', async () => {
      vol.fromJSON({
        '/project/src/Button.tsx': SIMPLE_BUTTON,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Button');
      expect(result.items[0].source.type).toBe('react');
    });

    it('detects arrow function components', async () => {
      vol.fromJSON({
        '/project/src/Card.tsx': ARROW_COMPONENT,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Card');
    });

    it('ignores non-component functions', async () => {
      vol.fromJSON({
        '/project/src/utils.tsx': `
          export function formatDate(date: Date): string {
            return date.toISOString();
          }
        `,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(0);
    });

    it('ignores lowercase named functions', async () => {
      vol.fromJSON({
        '/project/src/helper.tsx': `
          export function button() {
            return <button>Click</button>;
          }
        `,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(0);
    });
  });
});
```

**Step 2: Run test**

Run: `pnpm --filter @buoy/scanners test`

**Step 3: Commit**

```bash
git add packages/scanners/src/git/react-scanner.test.ts
git commit -m "test(scanners): add React component detection tests"
```

---

### Task 3.3: Test ReactComponentScanner - Props Extraction

**Files:**
- Modify: `packages/scanners/src/git/react-scanner.test.ts`

**Step 1: Add props extraction tests**

```typescript
// Add to react-scanner.test.ts

describe('props extraction', () => {
  it('extracts typed props', async () => {
    vol.fromJSON({
      '/project/src/Button.tsx': `
        interface ButtonProps {
          onClick: () => void;
          disabled?: boolean;
          children: React.ReactNode;
        }

        export function Button({ onClick, disabled, children }: ButtonProps) {
          return <button onClick={onClick} disabled={disabled}>{children}</button>;
        }
      `,
    });

    const scanner = new ReactComponentScanner({
      projectRoot: '/project',
      include: ['src/**/*.tsx'],
    });

    const result = await scanner.scan();

    expect(result.items[0].props).toContainEqual(
      expect.objectContaining({ name: 'onClick', required: true })
    );
    expect(result.items[0].props).toContainEqual(
      expect.objectContaining({ name: 'disabled', required: false })
    );
  });

  it('extracts inline typed props', async () => {
    vol.fromJSON({
      '/project/src/Input.tsx': SIMPLE_BUTTON,
    });

    const scanner = new ReactComponentScanner({
      projectRoot: '/project',
      include: ['src/**/*.tsx'],
    });

    const result = await scanner.scan();

    expect(result.items[0].props.length).toBeGreaterThan(0);
  });

  it('extracts destructured props with defaults', async () => {
    vol.fromJSON({
      '/project/src/Button.tsx': `
        export function Button({ size = 'medium', variant = 'primary' }) {
          return <button className={\`btn-\${size} btn-\${variant}\`}>Click</button>;
        }
      `,
    });

    const scanner = new ReactComponentScanner({
      projectRoot: '/project',
      include: ['src/**/*.tsx'],
    });

    const result = await scanner.scan();

    expect(result.items[0].props).toContainEqual(
      expect.objectContaining({ name: 'size', defaultValue: "'medium'" })
    );
  });
});
```

**Step 2: Run test**

Run: `pnpm --filter @buoy/scanners test`

**Step 3: Commit**

```bash
git add packages/scanners/src/git/react-scanner.test.ts
git commit -m "test(scanners): add props extraction tests"
```

---

### Task 3.4: Test ReactComponentScanner - Hardcoded Value Detection

**Files:**
- Modify: `packages/scanners/src/git/react-scanner.test.ts`

**Step 1: Add hardcoded value tests**

```typescript
// Add to react-scanner.test.ts

describe('hardcoded value detection', () => {
  it('detects hex colors in style prop', async () => {
    vol.fromJSON({
      '/project/src/Badge.tsx': HARDCODED_STYLES,
    });

    const scanner = new ReactComponentScanner({
      projectRoot: '/project',
      include: ['src/**/*.tsx'],
    });

    const result = await scanner.scan();
    const hardcoded = result.items[0].metadata.hardcodedValues || [];

    expect(hardcoded).toContainEqual(
      expect.objectContaining({ type: 'color', value: '#ff0000' })
    );
  });

  it('detects rgb colors', async () => {
    vol.fromJSON({
      '/project/src/Box.tsx': `
        export function Box() {
          return <div style={{ backgroundColor: 'rgb(255, 0, 0)' }}>Box</div>;
        }
      `,
    });

    const scanner = new ReactComponentScanner({
      projectRoot: '/project',
      include: ['src/**/*.tsx'],
    });

    const result = await scanner.scan();
    const hardcoded = result.items[0].metadata.hardcodedValues || [];

    expect(hardcoded.some(h => h.type === 'color')).toBe(true);
  });

  it('detects hardcoded spacing', async () => {
    vol.fromJSON({
      '/project/src/Badge.tsx': HARDCODED_STYLES,
    });

    const scanner = new ReactComponentScanner({
      projectRoot: '/project',
      include: ['src/**/*.tsx'],
    });

    const result = await scanner.scan();
    const hardcoded = result.items[0].metadata.hardcodedValues || [];

    expect(hardcoded).toContainEqual(
      expect.objectContaining({ type: 'spacing', value: '8px' })
    );
  });

  it('ignores CSS variables', async () => {
    vol.fromJSON({
      '/project/src/Token.tsx': `
        export function Token() {
          return <div style={{ color: 'var(--primary)' }}>Token</div>;
        }
      `,
    });

    const scanner = new ReactComponentScanner({
      projectRoot: '/project',
      include: ['src/**/*.tsx'],
    });

    const result = await scanner.scan();
    const hardcoded = result.items[0].metadata.hardcodedValues || [];

    expect(hardcoded).toHaveLength(0);
  });

  it('ignores theme references', async () => {
    vol.fromJSON({
      '/project/src/Themed.tsx': `
        export function Themed({ theme }) {
          return <div style={{ color: theme.colors.primary }}>Themed</div>;
        }
      `,
    });

    const scanner = new ReactComponentScanner({
      projectRoot: '/project',
      include: ['src/**/*.tsx'],
    });

    const result = await scanner.scan();
    const hardcoded = result.items[0].metadata.hardcodedValues || [];

    expect(hardcoded).toHaveLength(0);
  });
});
```

**Step 2: Run test**

Run: `pnpm --filter @buoy/scanners test`

**Step 3: Commit**

```bash
git add packages/scanners/src/git/react-scanner.test.ts
git commit -m "test(scanners): add hardcoded value detection tests"
```

---

### Task 3.5: Test ReactComponentScanner - Deprecation Detection

**Files:**
- Modify: `packages/scanners/src/git/react-scanner.test.ts`

**Step 1: Add deprecation tests**

```typescript
// Add to react-scanner.test.ts

describe('deprecation detection', () => {
  it('detects @deprecated JSDoc tag', async () => {
    vol.fromJSON({
      '/project/src/OldButton.tsx': DEPRECATED_COMPONENT,
    });

    const scanner = new ReactComponentScanner({
      projectRoot: '/project',
      include: ['src/**/*.tsx'],
    });

    const result = await scanner.scan();

    expect(result.items[0].metadata.deprecated).toBe(true);
  });

  it('extracts deprecation tags', async () => {
    vol.fromJSON({
      '/project/src/OldButton.tsx': DEPRECATED_COMPONENT,
    });

    const scanner = new ReactComponentScanner({
      projectRoot: '/project',
      include: ['src/**/*.tsx'],
    });

    const result = await scanner.scan();

    expect(result.items[0].metadata.tags).toContain('deprecated');
  });

  it('does not mark non-deprecated components', async () => {
    vol.fromJSON({
      '/project/src/Button.tsx': SIMPLE_BUTTON,
    });

    const scanner = new ReactComponentScanner({
      projectRoot: '/project',
      include: ['src/**/*.tsx'],
    });

    const result = await scanner.scan();

    expect(result.items[0].metadata.deprecated).toBeFalsy();
  });
});
```

**Step 2: Run test**

Run: `pnpm --filter @buoy/scanners test`

**Step 3: Commit**

```bash
git add packages/scanners/src/git/react-scanner.test.ts
git commit -m "test(scanners): add deprecation detection tests"
```

---

### Task 3.6: Test ReactComponentScanner - File Filtering

**Files:**
- Modify: `packages/scanners/src/git/react-scanner.test.ts`

**Step 1: Add file filtering tests**

```typescript
// Add to react-scanner.test.ts

describe('file filtering', () => {
  it('excludes test files by default', async () => {
    vol.fromJSON({
      '/project/src/Button.tsx': SIMPLE_BUTTON,
      '/project/src/Button.test.tsx': `
        import { Button } from './Button';
        test('renders', () => {});
      `,
    });

    const scanner = new ReactComponentScanner({
      projectRoot: '/project',
      include: ['src/**/*.tsx'],
    });

    const result = await scanner.scan();

    expect(result.items).toHaveLength(1);
    expect(result.items[0].source.path).not.toContain('.test.');
  });

  it('excludes story files by default', async () => {
    vol.fromJSON({
      '/project/src/Button.tsx': SIMPLE_BUTTON,
      '/project/src/Button.stories.tsx': `
        export default { title: 'Button' };
      `,
    });

    const scanner = new ReactComponentScanner({
      projectRoot: '/project',
      include: ['src/**/*.tsx'],
    });

    const result = await scanner.scan();

    expect(result.items).toHaveLength(1);
  });

  it('excludes node_modules by default', async () => {
    vol.fromJSON({
      '/project/src/Button.tsx': SIMPLE_BUTTON,
      '/project/node_modules/some-lib/Button.tsx': SIMPLE_BUTTON,
    });

    const scanner = new ReactComponentScanner({
      projectRoot: '/project',
      include: ['**/*.tsx'],
    });

    const result = await scanner.scan();

    expect(result.items).toHaveLength(1);
  });

  it('respects custom exclude patterns', async () => {
    vol.fromJSON({
      '/project/src/Button.tsx': SIMPLE_BUTTON,
      '/project/src/internal/Secret.tsx': SIMPLE_BUTTON,
    });

    const scanner = new ReactComponentScanner({
      projectRoot: '/project',
      include: ['src/**/*.tsx'],
      exclude: ['**/internal/**'],
    });

    const result = await scanner.scan();

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Button');
  });
});
```

**Step 2: Run test**

Run: `pnpm --filter @buoy/scanners test`

**Step 3: Commit**

```bash
git add packages/scanners/src/git/react-scanner.test.ts
git commit -m "test(scanners): add file filtering tests"
```

---

### Task 3.7: Test TokenScanner

**Files:**
- Create: `packages/scanners/src/git/token-scanner.test.ts`

**Step 1: Write the tests**

```typescript
// packages/scanners/src/git/token-scanner.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { TokenScanner } from './token-scanner.js';
import { vol } from 'memfs';

describe('TokenScanner', () => {
  beforeEach(() => {
    vol.reset();
  });

  describe('CSS variable parsing', () => {
    it('extracts CSS custom properties', async () => {
      vol.fromJSON({
        '/project/tokens/colors.css': `
          :root {
            --primary-color: #0066cc;
            --secondary-color: #666666;
            --spacing-sm: 8px;
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: '/project',
        include: ['tokens/**/*.css'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(3);
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: '--primary-color',
          value: '#0066cc',
          category: 'color',
        })
      );
    });

    it('categorizes tokens by type', async () => {
      vol.fromJSON({
        '/project/tokens/vars.css': `
          :root {
            --color-primary: #0066cc;
            --spacing-md: 16px;
            --font-size-base: 14px;
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: '/project',
        include: ['tokens/**/*.css'],
      });

      const result = await scanner.scan();

      const colorToken = result.items.find(t => t.name.includes('color'));
      const spacingToken = result.items.find(t => t.name.includes('spacing'));
      const fontToken = result.items.find(t => t.name.includes('font'));

      expect(colorToken?.category).toBe('color');
      expect(spacingToken?.category).toBe('spacing');
      expect(fontToken?.category).toBe('typography');
    });
  });

  describe('JSON token parsing', () => {
    it('extracts tokens from design tokens JSON', async () => {
      vol.fromJSON({
        '/project/tokens/tokens.json': JSON.stringify({
          color: {
            primary: { value: '#0066cc' },
            secondary: { value: '#666666' },
          },
          spacing: {
            sm: { value: '8px' },
            md: { value: '16px' },
          },
        }),
      });

      const scanner = new TokenScanner({
        projectRoot: '/project',
        include: ['tokens/**/*.json'],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('SCSS variable parsing', () => {
    it('extracts SCSS variables', async () => {
      vol.fromJSON({
        '/project/tokens/variables.scss': `
          $primary-color: #0066cc;
          $secondary-color: #666666;
          $spacing-sm: 8px;
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: '/project',
        include: ['tokens/**/*.scss'],
      });

      const result = await scanner.scan();

      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: '$primary-color',
          value: '#0066cc',
        })
      );
    });
  });
});
```

**Step 2: Run test**

Run: `pnpm --filter @buoy/scanners test`

**Step 3: Commit**

```bash
git add packages/scanners/src/git/token-scanner.test.ts
git commit -m "test(scanners): add token scanner tests"
```

---

## Phase 4: Plugin Tests

### Task 4.1: Test GitHub Plugin - Formatter

**Files:**
- Create: `packages/plugin-github/src/__tests__/formatter.test.ts`

**Step 1: Write the tests**

```typescript
// packages/plugin-github/src/__tests__/formatter.test.ts
import { describe, it, expect } from 'vitest';
import { formatDriftReport } from '../formatter.js';
import type { DriftSignal } from '@buoy/core';

describe('GitHub formatter', () => {
  describe('formatDriftReport', () => {
    it('formats empty results as success', () => {
      const result = formatDriftReport([]);

      expect(result).toContain('No design drift detected');
      expect(result).toContain(':white_check_mark:');
    });

    it('groups issues by severity', () => {
      const signals: DriftSignal[] = [
        createMockDrift('critical', 'Critical issue'),
        createMockDrift('warning', 'Warning issue'),
        createMockDrift('info', 'Info issue'),
      ];

      const result = formatDriftReport(signals);

      expect(result).toContain('Critical');
      expect(result).toContain('Warning');
      expect(result).toContain('Info');
    });

    it('includes severity icons', () => {
      const signals: DriftSignal[] = [
        createMockDrift('critical', 'Critical issue'),
      ];

      const result = formatDriftReport(signals);

      // Red circle for critical
      expect(result).toMatch(/🔴|:red_circle:/);
    });

    it('formats as markdown table', () => {
      const signals: DriftSignal[] = [
        createMockDrift('warning', 'Hardcoded color detected'),
      ];

      const result = formatDriftReport(signals);

      expect(result).toContain('|');
      expect(result).toContain('---');
    });

    it('includes summary counts', () => {
      const signals: DriftSignal[] = [
        createMockDrift('critical', 'Issue 1'),
        createMockDrift('critical', 'Issue 2'),
        createMockDrift('warning', 'Issue 3'),
      ];

      const result = formatDriftReport(signals);

      expect(result).toContain('2');  // critical count
      expect(result).toContain('1');  // warning count
    });

    it('includes buoy marker for comment updates', () => {
      const signals: DriftSignal[] = [];
      const result = formatDriftReport(signals);

      expect(result).toContain('<!-- buoy-drift-report -->');
    });
  });
});

function createMockDrift(severity: 'critical' | 'warning' | 'info', message: string): DriftSignal {
  return {
    id: `drift-${Math.random()}`,
    type: 'hardcoded-value',
    severity,
    source: {
      entityType: 'component',
      entityId: 'comp-1',
      entityName: 'Button',
      location: 'src/Button.tsx:10',
    },
    message,
    details: {},
    detectedAt: new Date(),
  };
}
```

**Step 2: Run test**

Run: `pnpm --filter @buoy/plugin-github test`

**Step 3: Commit**

```bash
git add packages/plugin-github/src/__tests__/formatter.test.ts
git commit -m "test(plugin-github): add formatter tests"
```

---

### Task 4.2: Test GitHub Plugin - API Integration

**Files:**
- Create: `packages/plugin-github/src/__tests__/github.test.ts`

**Step 1: Write the tests with MSW mocking**

```typescript
// packages/plugin-github/src/__tests__/github.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubPlugin } from '../github.js';

// Mock Octokit
vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    rest: {
      issues: {
        listComments: vi.fn(),
        createComment: vi.fn(),
        updateComment: vi.fn(),
      },
    },
  })),
}));

describe('GitHubPlugin', () => {
  let plugin: GitHubPlugin;
  let mockOctokit: any;

  beforeEach(() => {
    vi.clearAllMocks();
    plugin = new GitHubPlugin({
      token: 'test-token',
      owner: 'test-owner',
      repo: 'test-repo',
    });
    mockOctokit = (plugin as any).octokit;
  });

  describe('report', () => {
    it('creates new comment when none exists', async () => {
      mockOctokit.rest.issues.listComments.mockResolvedValue({
        data: [],
      });
      mockOctokit.rest.issues.createComment.mockResolvedValue({
        data: { id: 123 },
      });

      await plugin.report({
        prNumber: 42,
        drifts: [],
      });

      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'test-owner',
          repo: 'test-repo',
          issue_number: 42,
        })
      );
    });

    it('updates existing comment when found', async () => {
      mockOctokit.rest.issues.listComments.mockResolvedValue({
        data: [
          { id: 456, body: '<!-- buoy-drift-report -->\nOld report' },
        ],
      });
      mockOctokit.rest.issues.updateComment.mockResolvedValue({
        data: { id: 456 },
      });

      await plugin.report({
        prNumber: 42,
        drifts: [],
      });

      expect(mockOctokit.rest.issues.updateComment).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'test-owner',
          repo: 'test-repo',
          comment_id: 456,
        })
      );
      expect(mockOctokit.rest.issues.createComment).not.toHaveBeenCalled();
    });

    it('handles API errors gracefully', async () => {
      mockOctokit.rest.issues.listComments.mockRejectedValue(
        new Error('API rate limit exceeded')
      );

      await expect(plugin.report({
        prNumber: 42,
        drifts: [],
      })).rejects.toThrow('API rate limit exceeded');
    });
  });
});
```

**Step 2: Run test**

Run: `pnpm --filter @buoy/plugin-github test`

**Step 3: Commit**

```bash
git add packages/plugin-github/src/__tests__/github.test.ts
git commit -m "test(plugin-github): add API integration tests"
```

---

## Phase 5: CLI Command Tests

### Task 5.1: Refactor CI Command for Testability

Before testing CLI commands, we need to extract testable logic.

**Files:**
- Modify: `apps/cli/src/commands/ci.ts`
- Create: `apps/cli/src/commands/ci.logic.ts`

**Step 1: Extract logic to separate module**

```typescript
// apps/cli/src/commands/ci.logic.ts
import type { DriftSignal, Severity } from '@buoy/core';

export interface CIResult {
  version: string;
  timestamp: string;
  summary: {
    total: number;
    critical: number;
    warning: number;
    info: number;
  };
  topIssues: DriftSignal[];
  exitCode: number;
}

export function buildCIResult(
  drifts: DriftSignal[],
  failOn: Severity | 'none'
): CIResult {
  const summary = {
    total: drifts.length,
    critical: drifts.filter(d => d.severity === 'critical').length,
    warning: drifts.filter(d => d.severity === 'warning').length,
    info: drifts.filter(d => d.severity === 'info').length,
  };

  const exitCode = calculateExitCode(summary, failOn);

  return {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    summary,
    topIssues: drifts.slice(0, 10),
    exitCode,
  };
}

export function calculateExitCode(
  summary: { critical: number; warning: number; info: number },
  failOn: Severity | 'none'
): number {
  if (failOn === 'none') return 0;
  if (failOn === 'critical' && summary.critical > 0) return 1;
  if (failOn === 'warning' && (summary.critical > 0 || summary.warning > 0)) return 1;
  if (failOn === 'info' && (summary.critical > 0 || summary.warning > 0 || summary.info > 0)) return 1;
  return 0;
}
```

**Step 2: Commit**

```bash
git add apps/cli/src/commands/ci.logic.ts
git commit -m "refactor(cli): extract CI logic for testability"
```

---

### Task 5.2: Test CI Command Logic

**Files:**
- Replace: `apps/cli/src/commands/__tests__/ci.test.ts`

**Step 1: Write comprehensive tests**

```typescript
// apps/cli/src/commands/__tests__/ci.test.ts
import { describe, it, expect } from 'vitest';
import { buildCIResult, calculateExitCode } from '../ci.logic.js';
import type { DriftSignal } from '@buoy/core';

describe('CI command logic', () => {
  describe('calculateExitCode', () => {
    it('returns 0 when fail-on is none', () => {
      const summary = { critical: 5, warning: 10, info: 20 };
      expect(calculateExitCode(summary, 'none')).toBe(0);
    });

    it('returns 1 when fail-on is critical and critical exists', () => {
      const summary = { critical: 1, warning: 0, info: 0 };
      expect(calculateExitCode(summary, 'critical')).toBe(1);
    });

    it('returns 0 when fail-on is critical and only warnings exist', () => {
      const summary = { critical: 0, warning: 5, info: 0 };
      expect(calculateExitCode(summary, 'critical')).toBe(0);
    });

    it('returns 1 when fail-on is warning and warning exists', () => {
      const summary = { critical: 0, warning: 1, info: 0 };
      expect(calculateExitCode(summary, 'warning')).toBe(1);
    });

    it('returns 1 when fail-on is warning and critical exists', () => {
      const summary = { critical: 1, warning: 0, info: 0 };
      expect(calculateExitCode(summary, 'warning')).toBe(1);
    });

    it('returns 0 when fail-on is warning and only info exists', () => {
      const summary = { critical: 0, warning: 0, info: 5 };
      expect(calculateExitCode(summary, 'warning')).toBe(0);
    });

    it('returns 1 when fail-on is info and any issues exist', () => {
      const summary = { critical: 0, warning: 0, info: 1 };
      expect(calculateExitCode(summary, 'info')).toBe(1);
    });

    it('returns 0 when no issues and fail-on is info', () => {
      const summary = { critical: 0, warning: 0, info: 0 };
      expect(calculateExitCode(summary, 'info')).toBe(0);
    });
  });

  describe('buildCIResult', () => {
    it('includes version field', () => {
      const result = buildCIResult([], 'critical');
      expect(result.version).toBe('1.0.0');
    });

    it('includes timestamp', () => {
      const result = buildCIResult([], 'critical');
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('calculates correct summary counts', () => {
      const drifts = [
        createDrift('critical'),
        createDrift('critical'),
        createDrift('warning'),
        createDrift('info'),
        createDrift('info'),
        createDrift('info'),
      ];

      const result = buildCIResult(drifts, 'none');

      expect(result.summary.total).toBe(6);
      expect(result.summary.critical).toBe(2);
      expect(result.summary.warning).toBe(1);
      expect(result.summary.info).toBe(3);
    });

    it('limits topIssues to 10', () => {
      const drifts = Array(20).fill(null).map(() => createDrift('warning'));

      const result = buildCIResult(drifts, 'none');

      expect(result.topIssues).toHaveLength(10);
    });

    it('sets correct exit code based on fail-on', () => {
      const drifts = [createDrift('warning')];

      const resultCritical = buildCIResult(drifts, 'critical');
      const resultWarning = buildCIResult(drifts, 'warning');

      expect(resultCritical.exitCode).toBe(0);
      expect(resultWarning.exitCode).toBe(1);
    });
  });
});

function createDrift(severity: 'critical' | 'warning' | 'info'): DriftSignal {
  return {
    id: `drift-${Math.random()}`,
    type: 'hardcoded-value',
    severity,
    source: {
      entityType: 'component',
      entityId: 'comp-1',
      entityName: 'Button',
      location: 'src/Button.tsx:10',
    },
    message: 'Test drift',
    details: {},
    detectedAt: new Date(),
  };
}
```

**Step 2: Run test**

Run: `pnpm --filter @buoy/cli test`

**Step 3: Commit**

```bash
git add apps/cli/src/commands/__tests__/ci.test.ts
git commit -m "test(cli): add CI command logic tests"
```

---

### Task 5.3: Test Drift Command Output Formatting

**Files:**
- Create: `apps/cli/src/output/__tests__/reporters.test.ts`

**Step 1: Write the tests**

```typescript
// apps/cli/src/output/__tests__/reporters.test.ts
import { describe, it, expect } from 'vitest';
import { formatTable, formatJson, formatMarkdown } from '../reporters.js';
import type { DriftSignal } from '@buoy/core';

describe('drift output reporters', () => {
  describe('formatJson', () => {
    it('returns valid JSON string', () => {
      const drifts: DriftSignal[] = [createDrift('warning')];
      const output = formatJson(drifts);

      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('includes all drift fields', () => {
      const drifts: DriftSignal[] = [createDrift('critical')];
      const output = formatJson(drifts);
      const parsed = JSON.parse(output);

      expect(parsed[0]).toHaveProperty('id');
      expect(parsed[0]).toHaveProperty('type');
      expect(parsed[0]).toHaveProperty('severity');
      expect(parsed[0]).toHaveProperty('message');
    });
  });

  describe('formatMarkdown', () => {
    it('includes header', () => {
      const output = formatMarkdown([]);
      expect(output).toContain('# Drift Report');
    });

    it('formats drifts as list', () => {
      const drifts: DriftSignal[] = [createDrift('warning')];
      const output = formatMarkdown(drifts);

      expect(output).toContain('-');
      expect(output).toContain('warning');
    });

    it('groups by severity', () => {
      const drifts: DriftSignal[] = [
        createDrift('critical'),
        createDrift('warning'),
      ];
      const output = formatMarkdown(drifts);

      expect(output).toContain('## Critical');
      expect(output).toContain('## Warnings');
    });
  });

  describe('formatTable', () => {
    it('includes column headers', () => {
      const output = formatTable([]);
      expect(output).toMatch(/severity|type|message/i);
    });

    it('formats each drift as row', () => {
      const drifts: DriftSignal[] = [
        createDrift('critical'),
        createDrift('warning'),
      ];
      const output = formatTable(drifts);

      expect(output).toContain('critical');
      expect(output).toContain('warning');
    });
  });
});

function createDrift(severity: 'critical' | 'warning' | 'info'): DriftSignal {
  return {
    id: `drift-${severity}`,
    type: 'hardcoded-value',
    severity,
    source: {
      entityType: 'component',
      entityId: 'comp-1',
      entityName: 'Button',
      location: 'src/Button.tsx:10',
    },
    message: `${severity} issue detected`,
    details: {},
    detectedAt: new Date(),
  };
}
```

**Step 2: Run test**

Run: `pnpm --filter @buoy/cli test`

**Step 3: Commit**

```bash
git add apps/cli/src/output/__tests__/reporters.test.ts
git commit -m "test(cli): add output formatter tests"
```

---

## Phase 6: Integration Tests

### Task 6.1: Create Integration Test Setup

**Files:**
- Create: `apps/cli/src/__tests__/integration/setup.ts`
- Create: `apps/cli/src/__tests__/integration/fixtures/`

**Step 1: Create test setup**

```typescript
// apps/cli/src/__tests__/integration/setup.ts
import { vol } from 'memfs';
import { vi } from 'vitest';

// Create a realistic project structure for integration tests
export function createMockProject() {
  vol.reset();
  vol.fromJSON({
    '/project/package.json': JSON.stringify({
      name: 'test-project',
      dependencies: {
        react: '^18.2.0',
        'react-dom': '^18.2.0',
      },
    }),
    '/project/buoy.config.mjs': `
      export default {
        project: { name: 'test-project' },
        sources: {
          react: {
            enabled: true,
            include: ['src/**/*.tsx'],
          },
        },
      };
    `,
    '/project/src/Button.tsx': `
      export function Button({ onClick, children }) {
        return <button onClick={onClick}>{children}</button>;
      }
    `,
    '/project/src/Card.tsx': `
      export function Card({ title }) {
        return (
          <div style={{ backgroundColor: '#ffffff', padding: '16px' }}>
            {title}
          </div>
        );
      }
    `,
    '/project/src/tokens.css': `
      :root {
        --primary-color: #0066cc;
        --spacing-md: 16px;
      }
    `,
  });
}
```

**Step 2: Commit**

```bash
git add apps/cli/src/__tests__/integration/
git commit -m "test(cli): add integration test setup"
```

---

### Task 6.2: Integration Test - Scan Command

**Files:**
- Create: `apps/cli/src/__tests__/integration/scan.test.ts`

**Step 1: Write integration tests**

```typescript
// apps/cli/src/__tests__/integration/scan.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createMockProject } from './setup.js';
import { runScan } from '../../commands/scan.js';

describe('scan command integration', () => {
  beforeEach(() => {
    createMockProject();
  });

  it('discovers React components', async () => {
    const result = await runScan({
      projectRoot: '/project',
      sources: ['react'],
      format: 'json',
    });

    const components = JSON.parse(result);
    expect(components).toHaveLength(2);
    expect(components.map((c: any) => c.name)).toContain('Button');
    expect(components.map((c: any) => c.name)).toContain('Card');
  });

  it('detects hardcoded values in components', async () => {
    const result = await runScan({
      projectRoot: '/project',
      sources: ['react'],
      format: 'json',
    });

    const components = JSON.parse(result);
    const card = components.find((c: any) => c.name === 'Card');

    expect(card.metadata.hardcodedValues).toBeDefined();
    expect(card.metadata.hardcodedValues.length).toBeGreaterThan(0);
  });

  it('returns scan statistics', async () => {
    const result = await runScan({
      projectRoot: '/project',
      sources: ['react'],
      format: 'json',
      includeStats: true,
    });

    const output = JSON.parse(result);
    expect(output.stats).toBeDefined();
    expect(output.stats.filesScanned).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test**

Run: `pnpm --filter @buoy/cli test`

**Step 3: Commit**

```bash
git add apps/cli/src/__tests__/integration/scan.test.ts
git commit -m "test(cli): add scan command integration tests"
```

---

### Task 6.3: Integration Test - Drift Check

**Files:**
- Create: `apps/cli/src/__tests__/integration/drift.test.ts`

**Step 1: Write integration tests**

```typescript
// apps/cli/src/__tests__/integration/drift.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createMockProject } from './setup.js';
import { runDriftCheck } from '../../commands/drift.js';

describe('drift check integration', () => {
  beforeEach(() => {
    createMockProject();
  });

  it('detects hardcoded values as drift', async () => {
    const result = await runDriftCheck({
      projectRoot: '/project',
      format: 'json',
    });

    const drifts = JSON.parse(result);
    const hardcodedDrifts = drifts.filter(
      (d: any) => d.type === 'hardcoded-value'
    );

    expect(hardcodedDrifts.length).toBeGreaterThan(0);
  });

  it('filters by severity', async () => {
    const result = await runDriftCheck({
      projectRoot: '/project',
      format: 'json',
      severity: 'critical',
    });

    const drifts = JSON.parse(result);
    const nonCritical = drifts.filter(
      (d: any) => d.severity !== 'critical'
    );

    expect(nonCritical).toHaveLength(0);
  });

  it('filters by drift type', async () => {
    const result = await runDriftCheck({
      projectRoot: '/project',
      format: 'json',
      type: 'hardcoded-value',
    });

    const drifts = JSON.parse(result);
    const otherTypes = drifts.filter(
      (d: any) => d.type !== 'hardcoded-value'
    );

    expect(otherTypes).toHaveLength(0);
  });

  it('respects ignore patterns from config', async () => {
    // Add ignore pattern to config
    // ... modify mock project config

    const result = await runDriftCheck({
      projectRoot: '/project',
      format: 'json',
    });

    const drifts = JSON.parse(result);
    // Verify ignored patterns are not in results
  });
});
```

**Step 2: Run test**

Run: `pnpm --filter @buoy/cli test`

**Step 3: Commit**

```bash
git add apps/cli/src/__tests__/integration/drift.test.ts
git commit -m "test(cli): add drift check integration tests"
```

---

## Phase 7: End-to-End Tests

### Task 7.1: E2E Test - Full CI Pipeline

**Files:**
- Create: `apps/cli/src/__tests__/e2e/ci-pipeline.test.ts`

**Step 1: Write E2E tests**

```typescript
// apps/cli/src/__tests__/e2e/ci-pipeline.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('E2E: CI Pipeline', () => {
  let projectDir: string;

  beforeEach(() => {
    // Create real temp directory
    projectDir = mkdtempSync(join(tmpdir(), 'buoy-test-'));

    // Create realistic project structure
    mkdirSync(join(projectDir, 'src'), { recursive: true });

    writeFileSync(
      join(projectDir, 'package.json'),
      JSON.stringify({
        name: 'e2e-test-project',
        dependencies: { react: '^18.2.0' },
      })
    );

    writeFileSync(
      join(projectDir, 'buoy.config.mjs'),
      `export default {
        project: { name: 'e2e-test' },
        sources: { react: { enabled: true, include: ['src/**/*.tsx'] } },
      };`
    );

    writeFileSync(
      join(projectDir, 'src/Button.tsx'),
      `export function Button({ onClick }) {
        return <button style={{ color: '#ff0000' }} onClick={onClick}>Click</button>;
      }`
    );
  });

  it('runs full scan and returns JSON', () => {
    const output = execSync(`npx buoy sweep --json`, {
      cwd: projectDir,
      encoding: 'utf-8',
    });

    const result = JSON.parse(output);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('runs drift check and exits with correct code', () => {
    // With hardcoded values, should find drift
    const result = execSync(`npx buoy lighthouse --fail-on=none --json`, {
      cwd: projectDir,
      encoding: 'utf-8',
    });

    const output = JSON.parse(result);
    expect(output.summary.total).toBeGreaterThan(0);
    expect(output.exitCode).toBe(0); // fail-on=none
  });

  it('fails CI when drift found and fail-on=warning', () => {
    expect(() => {
      execSync(`npx buoy lighthouse --fail-on=warning`, {
        cwd: projectDir,
        encoding: 'utf-8',
      });
    }).toThrow();
  });
});
```

**Step 2: Run test**

Run: `pnpm --filter @buoy/cli test:e2e`

**Step 3: Commit**

```bash
git add apps/cli/src/__tests__/e2e/ci-pipeline.test.ts
git commit -m "test(cli): add E2E CI pipeline tests"
```

---

## Test Coverage Goals

| Package | Target Coverage | Priority Tests |
|---------|----------------|----------------|
| @buoy/core | 90%+ | SemanticDiffEngine, model helpers |
| @buoy/scanners | 85%+ | ReactComponentScanner, TokenScanner |
| @buoy/plugin-github | 80%+ | Formatter, API calls |
| @buoy/cli | 80%+ | CI command, drift check |

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run specific package tests
pnpm --filter @buoy/core test
pnpm --filter @buoy/scanners test
pnpm --filter @buoy/cli test

# Run E2E tests only
pnpm --filter @buoy/cli test:e2e

# Watch mode during development
pnpm test:watch
```

---

Plan complete and saved to `docs/plans/2025-12-28-comprehensive-testing.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
