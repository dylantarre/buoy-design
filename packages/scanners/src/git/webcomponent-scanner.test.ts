// packages/scanners/src/git/webcomponent-scanner.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';
import {
  LIT_BASIC_COMPONENT,
  LIT_WITH_STATE,
  LIT_STATIC_PROPERTIES,
  LIT_WITH_QUERY,
  LIT_EXTENDS_CUSTOM_BASE,
  LIT_DEPRECATED,
  LIT_ATTRIBUTE_CONFIG,
  STENCIL_BASIC_COMPONENT,
  STENCIL_WITH_STATE_WATCH,
  STENCIL_WITH_EVENTS,
  STENCIL_WITH_METHOD,
  STENCIL_WITH_ELEMENT_LISTEN,
  STENCIL_SCOPED,
  STENCIL_FORM_ASSOCIATED,
  STENCIL_DEPRECATED,
} from '../__tests__/fixtures/webcomponent-components.js';
import { WebComponentScanner } from './webcomponent-scanner.js';

// Mock synchronous fs for WebComponent scanner (it uses readFileSync)
vi.mock('fs', async () => {
  const memfs = await import('memfs');
  return {
    ...memfs.fs,
    default: memfs.fs,
  };
});

describe('WebComponentScanner', () => {
  beforeEach(() => {
    vol.reset();
  });

  describe('Lit component detection', () => {
    it('detects basic Lit component with @customElement decorator', async () => {
      vol.fromJSON({
        '/project/src/my-button.ts': LIT_BASIC_COMPONENT,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('MyButton');
      expect(result.items[0]!.source.type).toBe('lit');
      expect(result.items[0]!.source.tagName).toBe('my-button');
    });

    it('detects @property decorators in Lit components', async () => {
      vol.fromJSON({
        '/project/src/my-button.ts': LIT_BASIC_COMPONENT,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();
      const props = result.items[0]!.props;

      expect(props).toContainEqual(
        expect.objectContaining({ name: 'label', type: 'String' })
      );
      expect(props).toContainEqual(
        expect.objectContaining({ name: 'disabled', type: 'Boolean' })
      );
    });

    it('detects @state decorator for internal reactive state', async () => {
      vol.fromJSON({
        '/project/src/my-counter.ts': LIT_WITH_STATE,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();
      const props = result.items[0]!.props;

      // @state should be detected but marked as internal
      expect(props.some(p => p.name === '_count')).toBe(true);
      expect(props.some(p => p.name === '_active')).toBe(true);
    });

    it('detects static properties pattern (non-decorator style)', async () => {
      vol.fromJSON({
        '/project/src/my-card.ts': LIT_STATIC_PROPERTIES,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('MyCard');
      expect(result.items[0]!.source.tagName).toBe('my-card');
    });

    it('detects properties from static properties pattern', async () => {
      vol.fromJSON({
        '/project/src/my-card.ts': LIT_STATIC_PROPERTIES,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();
      const props = result.items[0]!.props;

      expect(props).toContainEqual(
        expect.objectContaining({ name: 'title' })
      );
      expect(props).toContainEqual(
        expect.objectContaining({ name: 'description' })
      );
    });

    it('detects @query and related decorators', async () => {
      vol.fromJSON({
        '/project/src/my-dialog.ts': LIT_WITH_QUERY,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('MyDialog');
      // Should detect properties, not just query decorators
      expect(result.items[0]!.props).toContainEqual(
        expect.objectContaining({ name: 'open' })
      );
    });

    it('detects components extending custom base classes', async () => {
      vol.fromJSON({
        '/project/src/my-special-button.ts': LIT_EXTENDS_CUSTOM_BASE,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('MySpecialButton');
    });

    it('detects @deprecated JSDoc tag on Lit components', async () => {
      vol.fromJSON({
        '/project/src/my-old-button.ts': LIT_DEPRECATED,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items[0]!.metadata.deprecated).toBe(true);
    });

    it('detects attribute configuration options', async () => {
      vol.fromJSON({
        '/project/src/data-viewer.ts': LIT_ATTRIBUTE_CONFIG,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();
      const props = result.items[0]!.props;

      expect(props).toContainEqual(
        expect.objectContaining({ name: 'dataId' })
      );
      expect(props).toContainEqual(
        expect.objectContaining({ name: 'complexData' })
      );
      expect(props).toContainEqual(
        expect.objectContaining({ name: 'active' })
      );
    });
  });

  describe('Stencil component detection', () => {
    it('detects basic Stencil component with @Component decorator', async () => {
      vol.fromJSON({
        '/project/src/my-component.tsx': STENCIL_BASIC_COMPONENT,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('MyComponent');
      expect(result.items[0]!.source.type).toBe('stencil');
      expect(result.items[0]!.source.tagName).toBe('my-component');
    });

    it('detects @Prop decorators in Stencil components', async () => {
      vol.fromJSON({
        '/project/src/my-component.tsx': STENCIL_BASIC_COMPONENT,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();
      const props = result.items[0]!.props;

      expect(props).toContainEqual(
        expect.objectContaining({ name: 'first' })
      );
      expect(props).toContainEqual(
        expect.objectContaining({ name: 'last' })
      );
    });

    it('detects @State decorator for internal state', async () => {
      vol.fromJSON({
        '/project/src/my-counter.tsx': STENCIL_WITH_STATE_WATCH,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();
      const props = result.items[0]!.props;

      // State should be detected
      expect(props.some(p => p.name === 'count')).toBe(true);
      expect(props.some(p => p.name === '_isActive')).toBe(true);
    });

    it('detects @Watch decorators', async () => {
      vol.fromJSON({
        '/project/src/my-counter.tsx': STENCIL_WITH_STATE_WATCH,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      // Watch should be captured in metadata
      expect(result.items[0]!.metadata.watchers || []).toContain('initialValue');
      expect(result.items[0]!.metadata.watchers || []).toContain('count');
    });

    it('detects @Event decorators', async () => {
      vol.fromJSON({
        '/project/src/my-form.tsx': STENCIL_WITH_EVENTS,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();
      const props = result.items[0]!.props;

      expect(props).toContainEqual(
        expect.objectContaining({
          name: 'formSubmit',
          type: 'EventEmitter',
        })
      );
      expect(props).toContainEqual(
        expect.objectContaining({
          name: 'formCancel',
          type: 'EventEmitter',
        })
      );
    });

    it('detects @Method decorators as public API', async () => {
      vol.fromJSON({
        '/project/src/my-modal.tsx': STENCIL_WITH_METHOD,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      // Methods should be captured in metadata
      expect(result.items[0]!.metadata.methods || []).toContain('open');
      expect(result.items[0]!.metadata.methods || []).toContain('close');
      expect(result.items[0]!.metadata.methods || []).toContain('toggle');
    });

    it('detects @Element and @Listen decorators', async () => {
      vol.fromJSON({
        '/project/src/my-dropdown.tsx': STENCIL_WITH_ELEMENT_LISTEN,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      // Listen handlers should be captured in metadata
      expect(result.items[0]!.metadata.listeners || []).toContain('click');
      expect(result.items[0]!.metadata.listeners || []).toContain('keydown');
    });

    it('detects scoped style components (not shadow)', async () => {
      vol.fromJSON({
        '/project/src/my-scoped-button.tsx': STENCIL_SCOPED,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.source.tagName).toBe('my-scoped-button');
    });

    it('detects mutable and reflect prop options', async () => {
      vol.fromJSON({
        '/project/src/my-scoped-button.tsx': STENCIL_SCOPED,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();
      const props = result.items[0]!.props;

      // Should capture mutable props
      expect(props).toContainEqual(
        expect.objectContaining({ name: 'count' })
      );
      expect(props).toContainEqual(
        expect.objectContaining({ name: 'color' })
      );
    });

    it('detects form-associated components', async () => {
      vol.fromJSON({
        '/project/src/my-input.tsx': STENCIL_FORM_ASSOCIATED,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.metadata.formAssociated).toBe(true);
    });

    it('detects @deprecated JSDoc tag on Stencil components', async () => {
      vol.fromJSON({
        '/project/src/my-old-component.tsx': STENCIL_DEPRECATED,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items[0]!.metadata.deprecated).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles files without web components gracefully', async () => {
      vol.fromJSON({
        '/project/src/utils.ts': `
          export function formatDate(date: Date): string {
            return date.toISOString();
          }
        `,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('ignores test files by default', async () => {
      vol.fromJSON({
        '/project/src/my-button.test.ts': LIT_BASIC_COMPONENT,
        '/project/src/my-button.spec.ts': LIT_BASIC_COMPONENT,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(0);
    });

    it('handles mixed Lit and Stencil in same project', async () => {
      vol.fromJSON({
        '/project/src/lit-button.ts': LIT_BASIC_COMPONENT,
        '/project/src/stencil-component.tsx': STENCIL_BASIC_COMPONENT,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts', 'src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(2);
      const types = result.items.map(c => c.source.type);
      expect(types).toContain('lit');
      expect(types).toContain('stencil');
    });
  });
});
