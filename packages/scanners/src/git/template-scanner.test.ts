// packages/scanners/src/git/template-scanner.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { vol } from 'memfs';
import {
  SIMPLE_BUTTON_ASTRO,
  CARD_WITH_PROPS_ASTRO,
  COMPONENT_WITH_TYPE_PROPS_ASTRO,
  DEPRECATED_COMPONENT_ASTRO,
  COMPONENT_WITH_DEPENDENCIES_ASTRO,
  LAYOUT_ASTRO,
  COMPONENT_WITH_SLOTS_ASTRO,
  PAGE_COMPONENT_ASTRO,
  RECURSIVE_COMPONENT_ASTRO,
  COMPONENT_WITH_DIRECTIVES_ASTRO,
  COMPONENT_WITH_TYPE_IMPORTS_ASTRO,
  COMPONENT_WITH_COMPLEX_PROPS_ASTRO,
  COMPONENT_WITH_SLOT_FALLBACK_ASTRO,
  COMPONENT_WITH_MULTI_FRAMEWORK_ASTRO,
} from '../__tests__/fixtures/astro-components.js';
import {
  SIMPLE_COUNTER_SOLID,
  COMPONENT_WITH_EFFECTS_SOLID,
  COMPONENT_WITH_STORE_SOLID,
  COMPONENT_WITH_CONTROL_FLOW_SOLID,
  COMPONENT_WITH_DYNAMIC_SOLID,
  COMPONENT_WITH_ADVANCED_SOLID,
  COMPONENT_WITH_JSX_PRAGMA_SOLID,
  DEPRECATED_COMPONENT_SOLID,
} from '../__tests__/fixtures/solid-components.js';
import {
  SIMPLE_COUNTER_QWIK,
  COMPONENT_WITH_STORE_QWIK,
  COMPONENT_WITH_TASKS_QWIK,
  COMPONENT_WITH_COMPUTED_QWIK,
  COMPONENT_WITH_ROUTE_LOADERS_QWIK,
  COMPONENT_WITH_SLOTS_QWIK,
  DEPRECATED_COMPONENT_QWIK,
  COMPONENT_WITH_INLINE_HANDLERS_QWIK,
} from '../__tests__/fixtures/qwik-components.js';
import { TemplateScanner } from './template-scanner.js';

describe('TemplateScanner - Astro', () => {
  beforeEach(() => {
    vol.reset();
  });

  describe('component detection', () => {
    it('detects Astro components in src/components directory', async () => {
      vol.fromJSON({
        '/project/src/components/Button.astro': SIMPLE_BUTTON_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Button');
      expect(result.items[0]!.source.type).toBe('astro');
    });

    it('detects Astro components in src/layouts directory', async () => {
      vol.fromJSON({
        '/project/src/layouts/Layout.astro': LAYOUT_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Layout');
    });

    it('detects Astro pages as components', async () => {
      vol.fromJSON({
        '/project/src/pages/index.astro': PAGE_COMPONENT_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Index');
    });

    it('detects multiple Astro components', async () => {
      vol.fromJSON({
        '/project/src/components/Button.astro': SIMPLE_BUTTON_ASTRO,
        '/project/src/components/Card.astro': CARD_WITH_PROPS_ASTRO,
        '/project/src/layouts/Layout.astro': LAYOUT_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(3);
      const names = result.items.map(c => c.name);
      expect(names).toContain('Button');
      expect(names).toContain('Card');
      expect(names).toContain('Layout');
    });

    it('detects recursive components using Astro.self', async () => {
      vol.fromJSON({
        '/project/src/components/Comment.astro': RECURSIVE_COMPONENT_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Comment');
      // Recursive component should detect Show and Toggle as dependencies
      expect(result.items[0]!.dependencies).toContain('Show');
      expect(result.items[0]!.dependencies).toContain('Toggle');
    });

    it('detects components with set:html and set:text directives', async () => {
      vol.fromJSON({
        '/project/src/components/Article.astro': COMPONENT_WITH_DIRECTIVES_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.props).toHaveLength(3);
    });
  });

  describe('props extraction', () => {
    it('extracts props from interface Props', async () => {
      vol.fromJSON({
        '/project/src/components/Card.astro': CARD_WITH_PROPS_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.items[0]!.props.length).toBeGreaterThanOrEqual(2);

      const titleProp = result.items[0]!.props.find(p => p.name === 'title');
      expect(titleProp).toBeDefined();
      expect(titleProp!.required).toBe(true);
      expect(titleProp!.type).toBe('string');

      const descriptionProp = result.items[0]!.props.find(p => p.name === 'description');
      expect(descriptionProp).toBeDefined();
      expect(descriptionProp!.required).toBe(false);
    });

    it('extracts props from type Props', async () => {
      vol.fromJSON({
        '/project/src/components/Button.astro': COMPONENT_WITH_TYPE_PROPS_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.items[0]!.props.length).toBeGreaterThanOrEqual(1);

      const sizeProp = result.items[0]!.props.find(p => p.name === 'size');
      expect(sizeProp).toBeDefined();
      expect(sizeProp!.required).toBe(true);

      const disabledProp = result.items[0]!.props.find(p => p.name === 'disabled');
      expect(disabledProp).toBeDefined();
      expect(disabledProp!.required).toBe(false);
    });

    it('extracts complex multiline props', async () => {
      vol.fromJSON({
        '/project/src/components/Complex.astro': COMPONENT_WITH_COMPLEX_PROPS_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.items[0]!.props.length).toBeGreaterThanOrEqual(4);

      const titleProp = result.items[0]!.props.find(p => p.name === 'title');
      expect(titleProp).toBeDefined();
      expect(titleProp!.required).toBe(true);

      const variantProp = result.items[0]!.props.find(p => p.name === 'variant');
      expect(variantProp).toBeDefined();
      expect(variantProp!.required).toBe(true);

      const disabledProp = result.items[0]!.props.find(p => p.name === 'disabled');
      expect(disabledProp).toBeDefined();
      expect(disabledProp!.required).toBe(false);
    });

    it('extracts props with external type references', async () => {
      vol.fromJSON({
        '/project/src/components/TypeImports.astro': COMPONENT_WITH_TYPE_IMPORTS_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.items[0]!.props.length).toBeGreaterThanOrEqual(2);

      const metaProp = result.items[0]!.props.find(p => p.name === 'meta');
      expect(metaProp).toBeDefined();
      expect(metaProp!.type).toBe('PageMeta');

      const authorProp = result.items[0]!.props.find(p => p.name === 'author');
      expect(authorProp).toBeDefined();
      expect(authorProp!.type).toBe('Author');
    });
  });

  describe('deprecation detection', () => {
    it('detects @deprecated JSDoc tag in frontmatter', async () => {
      vol.fromJSON({
        '/project/src/components/OldHeader.astro': DEPRECATED_COMPONENT_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.items[0]!.metadata.deprecated).toBe(true);
    });

    it('non-deprecated components are not marked as deprecated', async () => {
      vol.fromJSON({
        '/project/src/components/Button.astro': SIMPLE_BUTTON_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.items[0]!.metadata.deprecated).toBe(false);
    });
  });

  describe('dependency detection', () => {
    it('detects component dependencies from imports', async () => {
      vol.fromJSON({
        '/project/src/components/Page.astro': COMPONENT_WITH_DEPENDENCIES_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.items[0]!.dependencies).toContain('Header');
      expect(result.items[0]!.dependencies).toContain('Footer');
    });

    it('detects Astro.slots usage', async () => {
      vol.fromJSON({
        '/project/src/components/Container.astro': COMPONENT_WITH_SLOTS_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      // Component should be detected
      expect(result.items).toHaveLength(1);
    });

    it('detects multi-framework dependencies', async () => {
      vol.fromJSON({
        '/project/src/components/MultiFramework.astro': COMPONENT_WITH_MULTI_FRAMEWORK_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      // Should detect React, Vue, Svelte, and Solid component dependencies
      expect(result.items[0]!.dependencies).toContain('ReactCounter');
      expect(result.items[0]!.dependencies).toContain('VueCard');
      expect(result.items[0]!.dependencies).toContain('SvelteButton');
      expect(result.items[0]!.dependencies).toContain('SolidToggle');
    });
  });

  describe('scan statistics', () => {
    it('returns correct scan statistics', async () => {
      vol.fromJSON({
        '/project/src/components/Button.astro': SIMPLE_BUTTON_ASTRO,
        '/project/src/components/Card.astro': CARD_WITH_PROPS_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.stats.filesScanned).toBe(2);
      expect(result.stats.itemsFound).toBe(2);
      expect(result.stats.duration).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('TemplateScanner - Solid', () => {
  beforeEach(() => {
    vol.reset();
  });

  describe('component detection', () => {
    it('detects Solid components with createSignal', async () => {
      vol.fromJSON({
        '/project/src/components/Counter.tsx': SIMPLE_COUNTER_SOLID,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'solid',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Counter');
      expect(result.items[0]!.source.type).toBe('solid');
    });

    it('detects Solid components with createEffect and createMemo', async () => {
      vol.fromJSON({
        '/project/src/components/Calculator.tsx': COMPONENT_WITH_EFFECTS_SOLID,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'solid',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Calculator');
    });

    it('detects Solid components with createStore', async () => {
      vol.fromJSON({
        '/project/src/components/TodoList.tsx': COMPONENT_WITH_STORE_SOLID,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'solid',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('TodoList');
    });

    it('detects Solid components with control flow components', async () => {
      vol.fromJSON({
        '/project/src/components/DataDisplay.tsx': COMPONENT_WITH_CONTROL_FLOW_SOLID,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'solid',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('DataDisplay');
    });

    it('detects Solid components with Dynamic', async () => {
      vol.fromJSON({
        '/project/src/components/DynamicButton.tsx': COMPONENT_WITH_DYNAMIC_SOLID,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'solid',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('DynamicButton');
    });

    it('detects Solid components with advanced patterns (ErrorBoundary, Suspense, Portal)', async () => {
      vol.fromJSON({
        '/project/src/components/DataLoader.tsx': COMPONENT_WITH_ADVANCED_SOLID,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'solid',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('DataLoader');
    });

    it('detects Solid components with JSX pragma', async () => {
      vol.fromJSON({
        '/project/src/components/Card.tsx': COMPONENT_WITH_JSX_PRAGMA_SOLID,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'solid',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Card');
    });
  });

  describe('deprecation detection', () => {
    it('detects @deprecated JSDoc in Solid components', async () => {
      vol.fromJSON({
        '/project/src/components/OldCounter.tsx': DEPRECATED_COMPONENT_SOLID,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'solid',
      });

      const result = await scanner.scan();

      expect(result.items[0]!.metadata.deprecated).toBe(true);
    });
  });
});

describe('TemplateScanner - Qwik', () => {
  beforeEach(() => {
    vol.reset();
  });

  describe('component detection', () => {
    it('detects Qwik components with component$ and useSignal', async () => {
      vol.fromJSON({
        '/project/src/components/Counter.tsx': SIMPLE_COUNTER_QWIK,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'qwik',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Counter');
      expect(result.items[0]!.source.type).toBe('qwik');
    });

    it('detects Qwik components with useStore', async () => {
      vol.fromJSON({
        '/project/src/components/TodoList.tsx': COMPONENT_WITH_STORE_QWIK,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'qwik',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('TodoList');
    });

    it('detects Qwik components with useTask$ and useVisibleTask$', async () => {
      vol.fromJSON({
        '/project/src/components/UserProfile.tsx': COMPONENT_WITH_TASKS_QWIK,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'qwik',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('UserProfile');
    });

    it('detects Qwik components with useComputed$ and useResource$', async () => {
      vol.fromJSON({
        '/project/src/components/DataDisplay.tsx': COMPONENT_WITH_COMPUTED_QWIK,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'qwik',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('DataDisplay');
    });

    it('detects Qwik City components with routeLoader$ and routeAction$', async () => {
      vol.fromJSON({
        '/project/src/routes/product/[id]/index.tsx': COMPONENT_WITH_ROUTE_LOADERS_QWIK,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'qwik',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Index');
    });

    it('detects Qwik components with Slot handling', async () => {
      vol.fromJSON({
        '/project/src/components/Card.tsx': COMPONENT_WITH_SLOTS_QWIK,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'qwik',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Card');
    });

    it('detects Qwik components with inline $ handlers', async () => {
      vol.fromJSON({
        '/project/src/components/Form.tsx': COMPONENT_WITH_INLINE_HANDLERS_QWIK,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'qwik',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Form');
    });
  });

  describe('deprecation detection', () => {
    it('detects @deprecated JSDoc in Qwik components', async () => {
      vol.fromJSON({
        '/project/src/components/OldButton.tsx': DEPRECATED_COMPONENT_QWIK,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'qwik',
      });

      const result = await scanner.scan();

      expect(result.items[0]!.metadata.deprecated).toBe(true);
    });
  });
});
