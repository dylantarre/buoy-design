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
  LIT_SIGNAL_WATCHER,
  LIT_CONTEXT,
  LIT_LOCALIZED,
  VANILLA_WEB_COMPONENT,
  LIT_STANDARD_DECORATORS,
  FAST_ELEMENT_COMPONENT,
  STENCIL_WITH_MIXIN,
  STENCIL_FUNCTIONAL,
  LIT_EVENT_OPTIONS,
  LIT_QUERY_ASYNC,
  STENCIL_WITH_SLOTS,
  FAST_ELEMENT_COMPOSE,
  FAST_ELEMENT_DEFINE,
  LIT_WITH_MIXINS,
  STENCIL_MULTI_STYLES,
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

  describe('modern Lit patterns', () => {
    it('detects Lit components using SignalWatcher mixin', async () => {
      vol.fromJSON({
        '/project/src/signal-counter.ts': LIT_SIGNAL_WATCHER,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('SignalCounter');
      expect(result.items[0]!.source.tagName).toBe('signal-counter');
      expect(result.items[0]!.source.type).toBe('lit');
    });

    it('detects Lit components with @provide and @consume context decorators', async () => {
      vol.fromJSON({
        '/project/src/theme.ts': LIT_CONTEXT,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(2);
      expect(result.items.map(c => c.name)).toContain('ThemeProvider');
      expect(result.items.map(c => c.name)).toContain('ThemeConsumer');
      // Should detect provide/consume decorated properties
      const provider = result.items.find(c => c.name === 'ThemeProvider');
      expect(provider!.props.some(p => p.name === 'theme')).toBe(true);
    });

    it('detects Lit components with @localized decorator', async () => {
      vol.fromJSON({
        '/project/src/greeting.ts': LIT_LOCALIZED,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('LocalizedGreeting');
      expect(result.items[0]!.source.tagName).toBe('localized-greeting');
    });

    it('detects TypeScript 5 standard decorators with accessor keyword', async () => {
      vol.fromJSON({
        '/project/src/modern.ts': LIT_STANDARD_DECORATORS,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('ModernElement');
      // Should detect accessor properties
      const props = result.items[0]!.props;
      expect(props).toContainEqual(expect.objectContaining({ name: 'title' }));
      expect(props).toContainEqual(expect.objectContaining({ name: 'count' }));
      expect(props).toContainEqual(expect.objectContaining({ name: 'active' }));
    });

    it('detects Lit components with @eventOptions decorator', async () => {
      vol.fromJSON({
        '/project/src/scroll.ts': LIT_EVENT_OPTIONS,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('ScrollListener');
    });

    it('detects Lit components with @queryAsync decorator', async () => {
      vol.fromJSON({
        '/project/src/async-dialog.ts': LIT_QUERY_ASYNC,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('AsyncDialog');
    });
  });

  describe('vanilla web components', () => {
    it('detects vanilla web components extending HTMLElement', async () => {
      vol.fromJSON({
        '/project/src/vanilla-button.ts': VANILLA_WEB_COMPONENT,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('MyVanillaButton');
      expect(result.items[0]!.source.tagName).toBe('my-vanilla-button');
      expect(result.items[0]!.source.type).toBe('vanilla');
    });

    it('extracts observedAttributes as props from vanilla components', async () => {
      vol.fromJSON({
        '/project/src/vanilla-button.ts': VANILLA_WEB_COMPONENT,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();
      const props = result.items[0]!.props;

      expect(props).toContainEqual(expect.objectContaining({ name: 'label' }));
      expect(props).toContainEqual(expect.objectContaining({ name: 'disabled' }));
    });
  });

  describe('FAST Element detection', () => {
    it('detects FAST Element components with @customElement decorator', async () => {
      vol.fromJSON({
        '/project/src/fast-button.ts': FAST_ELEMENT_COMPONENT,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('MyFastButton');
      expect(result.items[0]!.source.tagName).toBe('my-fast-button');
      expect(result.items[0]!.source.type).toBe('fast');
    });

    it('detects @attr and @observable decorators in FAST components', async () => {
      vol.fromJSON({
        '/project/src/fast-button.ts': FAST_ELEMENT_COMPONENT,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();
      const props = result.items[0]!.props;

      expect(props).toContainEqual(expect.objectContaining({ name: 'label' }));
      expect(props).toContainEqual(expect.objectContaining({ name: 'disabled' }));
      expect(props).toContainEqual(expect.objectContaining({ name: 'count' }));
    });
  });

  describe('advanced Stencil patterns', () => {
    it('detects Stencil components using Mixin pattern', async () => {
      vol.fromJSON({
        '/project/src/mixed.tsx': STENCIL_WITH_MIXIN,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('MyMixedComponent');
      expect(result.items[0]!.source.tagName).toBe('my-mixed-component');
    });

    it('detects Stencil functional components', async () => {
      vol.fromJSON({
        '/project/src/greeting.tsx': STENCIL_FUNCTIONAL,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Greeting');
      expect(result.items[0]!.source.type).toBe('stencil-functional');
    });

    it('extracts props from Stencil functional component interface', async () => {
      vol.fromJSON({
        '/project/src/greeting.tsx': STENCIL_FUNCTIONAL,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();
      const props = result.items[0]!.props;

      expect(props).toContainEqual(expect.objectContaining({ name: 'name', required: true }));
      expect(props).toContainEqual(expect.objectContaining({ name: 'greeting', required: false }));
    });
  });

  describe('Stencil component metadata', () => {
    it('extracts @Element decorator reference in metadata', async () => {
      vol.fromJSON({
        '/project/src/my-dropdown.tsx': STENCIL_WITH_ELEMENT_LISTEN,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.metadata.hasElement).toBe(true);
    });

    it('extracts shadow mode from @Component config', async () => {
      vol.fromJSON({
        '/project/src/my-component.tsx': STENCIL_BASIC_COMPONENT,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items[0]!.metadata.shadowMode).toBe('shadow');
    });

    it('extracts scoped mode from @Component config', async () => {
      vol.fromJSON({
        '/project/src/my-scoped-button.tsx': STENCIL_SCOPED,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items[0]!.metadata.shadowMode).toBe('scoped');
    });

    it('extracts assetsDirs from @Component config', async () => {
      vol.fromJSON({
        '/project/src/my-card.tsx': STENCIL_WITH_SLOTS,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items[0]!.metadata.assetsDirs).toEqual(['assets']);
    });

    it('extracts styleUrls object from @Component config', async () => {
      vol.fromJSON({
        '/project/src/themed-button.tsx': STENCIL_MULTI_STYLES,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items[0]!.metadata.styleUrls).toEqual({
        ios: 'themed-button.ios.css',
        md: 'themed-button.md.css',
      });
    });
  });

  describe('FAST Element compose/define patterns', () => {
    it('detects FAST Element components using compose() pattern', async () => {
      vol.fromJSON({
        '/project/src/modern-fast-button.ts': FAST_ELEMENT_COMPOSE,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('ModernFastButton');
      expect(result.items[0]!.source.tagName).toBe('modern-fast-button');
      expect(result.items[0]!.source.type).toBe('fast');
    });

    it('extracts @attr and @observable from compose() pattern components', async () => {
      vol.fromJSON({
        '/project/src/modern-fast-button.ts': FAST_ELEMENT_COMPOSE,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();
      const props = result.items[0]!.props;

      expect(props).toContainEqual(expect.objectContaining({ name: 'appearance' }));
      expect(props).toContainEqual(expect.objectContaining({ name: 'disabled' }));
      expect(props).toContainEqual(expect.objectContaining({ name: 'loading' }));
    });

    it('detects FAST Element components using FASTElement.define() pattern', async () => {
      vol.fromJSON({
        '/project/src/fast-card.ts': FAST_ELEMENT_DEFINE,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('FastCard');
      expect(result.items[0]!.source.tagName).toBe('fast-card');
      expect(result.items[0]!.source.type).toBe('fast');
    });
  });

  describe('Lit mixin patterns', () => {
    it('detects Lit components using mixin composition', async () => {
      vol.fromJSON({
        '/project/src/mixed-button.ts': LIT_WITH_MIXINS,
      });

      const scanner = new WebComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('MixedButton');
      expect(result.items[0]!.source.tagName).toBe('mixed-button');
    });
  });
});
