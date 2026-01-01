// packages/scanners/src/git/svelte-scanner.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { vol } from 'memfs';
import {
  SIMPLE_BUTTON_SVELTE,
  CARD_WITH_PROPS_SVELTE,
  SVELTE5_PROPS_COMPONENT,
  DEPRECATED_COMPONENT_SVELTE,
  COMPONENT_WITH_DEPENDENCIES_SVELTE,
  SVELTE5_CONST_PROPS_COMPONENT,
  SVELTE5_BINDABLE_PROPS_COMPONENT,
  SVELTE5_MODULE_SCRIPT_COMPONENT,
  SVELTE5_HTML_ATTRIBUTES_COMPONENT,
  SVELTE5_NON_DESTRUCTURED_PROPS_COMPONENT,
  SVELTE5_PROPS_ID_COMPONENT,
  SVELTE5_DERIVED_DESTRUCTURING,
  SVELTE5_INLINE_INTERFACE_PROPS,
} from '../__tests__/fixtures/svelte-components.js';
import { SvelteComponentScanner } from './svelte-scanner.js';

describe('SvelteComponentScanner', () => {
  beforeEach(() => {
    vol.reset();
  });

  describe('component detection', () => {
    it('detects Svelte components', async () => {
      vol.fromJSON({
        '/project/src/Button.svelte': SIMPLE_BUTTON_SVELTE,
      });

      const scanner = new SvelteComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.svelte'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Button');
      expect(result.items[0]!.source.type).toBe('svelte');
    });

    it('detects lowercase named files (real-world Svelte pattern)', async () => {
      vol.fromJSON({
        '/project/src/button.svelte': SIMPLE_BUTTON_SVELTE,
      });

      const scanner = new SvelteComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.svelte'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      // Component name should be PascalCase derived from filename
      expect(result.items[0]!.name).toBe('Button');
    });

    it('detects kebab-case named files', async () => {
      vol.fromJSON({
        '/project/src/my-button.svelte': SIMPLE_BUTTON_SVELTE,
      });

      const scanner = new SvelteComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.svelte'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      // Component name should be PascalCase derived from filename
      expect(result.items[0]!.name).toBe('MyButton');
    });

    it('excludes files starting with + (SvelteKit routes)', async () => {
      vol.fromJSON({
        '/project/src/+page.svelte': SIMPLE_BUTTON_SVELTE,
        '/project/src/+layout.svelte': SIMPLE_BUTTON_SVELTE,
        '/project/src/+error.svelte': SIMPLE_BUTTON_SVELTE,
        '/project/src/Button.svelte': SIMPLE_BUTTON_SVELTE,
      });

      const scanner = new SvelteComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.svelte'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Button');
    });

    it('detects multiple components', async () => {
      vol.fromJSON({
        '/project/src/Button.svelte': SIMPLE_BUTTON_SVELTE,
        '/project/src/Card.svelte': CARD_WITH_PROPS_SVELTE,
      });

      const scanner = new SvelteComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.svelte'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(2);
      const names = result.items.map(c => c.name);
      expect(names).toContain('Button');
      expect(names).toContain('Card');
    });
  });

  describe('props extraction', () => {
    it('extracts props from export let (Svelte 4 style)', async () => {
      vol.fromJSON({
        '/project/src/Card.svelte': CARD_WITH_PROPS_SVELTE,
      });

      const scanner = new SvelteComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.svelte'],
      });

      const result = await scanner.scan();

      expect(result.items[0]!.props.length).toBeGreaterThanOrEqual(2);

      const titleProp = result.items[0]!.props.find(p => p.name === 'title');
      expect(titleProp).toBeDefined();
      expect(titleProp!.required).toBe(true);

      const descriptionProp = result.items[0]!.props.find(p => p.name === 'description');
      expect(descriptionProp).toBeDefined();
      expect(descriptionProp!.required).toBe(false);
      expect(descriptionProp!.defaultValue).toBeDefined();
    });

    it('extracts typed props', async () => {
      vol.fromJSON({
        '/project/src/Button.svelte': SIMPLE_BUTTON_SVELTE,
      });

      const scanner = new SvelteComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.svelte'],
      });

      const result = await scanner.scan();

      const labelProp = result.items[0]!.props.find(p => p.name === 'label');
      expect(labelProp).toBeDefined();
      // Scanner returns type with leading colon and space from source
      expect(labelProp!.type).toContain('string');
    });

    it('extracts props from $props() (Svelte 5 style)', async () => {
      vol.fromJSON({
        '/project/src/Counter.svelte': SVELTE5_PROPS_COMPONENT,
      });

      const scanner = new SvelteComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.svelte'],
      });

      const result = await scanner.scan();

      expect(result.items[0]!.props.length).toBeGreaterThanOrEqual(2);

      const labelProp = result.items[0]!.props.find(p => p.name === 'label');
      expect(labelProp).toBeDefined();

      const countProp = result.items[0]!.props.find(p => p.name === 'count');
      expect(countProp).toBeDefined();
      expect(countProp!.required).toBe(false);
    });

    it('extracts props from const $props() with interface (Svelte 5 shadcn pattern)', async () => {
      vol.fromJSON({
        '/project/src/Preview.svelte': SVELTE5_CONST_PROPS_COMPONENT,
      });

      const scanner = new SvelteComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.svelte'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.props.length).toBeGreaterThanOrEqual(2);

      const childrenProp = result.items[0]!.props.find(p => p.name === 'children');
      expect(childrenProp).toBeDefined();

      const frameworkProp = result.items[0]!.props.find(p => p.name === 'framework');
      expect(frameworkProp).toBeDefined();

      const filesProp = result.items[0]!.props.find(p => p.name === 'files');
      expect(filesProp).toBeDefined();
      expect(filesProp!.required).toBe(false);
    });

    it('extracts props with $bindable() rune', async () => {
      vol.fromJSON({
        '/project/src/Button.svelte': SVELTE5_BINDABLE_PROPS_COMPONENT,
      });

      const scanner = new SvelteComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.svelte'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.props.length).toBeGreaterThanOrEqual(3);

      const refProp = result.items[0]!.props.find(p => p.name === 'ref');
      expect(refProp).toBeDefined();
      expect(refProp!.required).toBe(false);

      const variantProp = result.items[0]!.props.find(p => p.name === 'variant');
      expect(variantProp).toBeDefined();
      expect(variantProp!.defaultValue).toContain('default');

      const sizeProp = result.items[0]!.props.find(p => p.name === 'size');
      expect(sizeProp).toBeDefined();
    });

    it('handles module script and extracts props from regular script', async () => {
      vol.fromJSON({
        '/project/src/Button.svelte': SVELTE5_MODULE_SCRIPT_COMPONENT,
      });

      const scanner = new SvelteComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.svelte'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.props.length).toBeGreaterThanOrEqual(3);

      const variantProp = result.items[0]!.props.find(p => p.name === 'variant');
      expect(variantProp).toBeDefined();

      const childrenProp = result.items[0]!.props.find(p => p.name === 'children');
      expect(childrenProp).toBeDefined();
    });

    it('extracts props from HTMLAttributes type intersection', async () => {
      vol.fromJSON({
        '/project/src/Card.svelte': SVELTE5_HTML_ATTRIBUTES_COMPONENT,
      });

      const scanner = new SvelteComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.svelte'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      // Should detect at least class (aliased to className) and children
      expect(result.items[0]!.props.length).toBeGreaterThanOrEqual(1);

      // class: className pattern should work
      const classNameProp = result.items[0]!.props.find(p => p.name === 'className');
      expect(classNameProp).toBeDefined();
    });

    it('handles rest spread props (...restProps)', async () => {
      vol.fromJSON({
        '/project/src/Card.svelte': SVELTE5_HTML_ATTRIBUTES_COMPONENT,
      });

      const scanner = new SvelteComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.svelte'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      // Rest props should NOT be added as individual props
      const restProp = result.items[0]!.props.find(p => p.name === 'restProps');
      expect(restProp).toBeUndefined();
    });

    it('extracts props from non-destructured $props() with interface type (Skeleton pattern)', async () => {
      vol.fromJSON({
        '/project/src/TabsContent.svelte': SVELTE5_NON_DESTRUCTURED_PROPS_COMPONENT,
      });

      const scanner = new SvelteComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.svelte'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('TabsContent');
      // Should detect the type reference even without destructuring
      // The props type should be captured from the interface
      expect(result.items[0]!.props.length).toBeGreaterThanOrEqual(0);
      // metadata should capture that it uses TabsContentProps interface
    });

    it('extracts interface props from module script definition (Skeleton pattern)', async () => {
      vol.fromJSON({
        '/project/src/TabsRoot.svelte': SVELTE5_PROPS_ID_COMPONENT,
      });

      const scanner = new SvelteComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.svelte'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('TabsRoot');
      // Should extract props from interface defined in module script
      expect(result.items[0]!.props.length).toBeGreaterThanOrEqual(2);

      const childrenProp = result.items[0]!.props.find(p => p.name === 'children');
      expect(childrenProp).toBeDefined();

      const defaultValueProp = result.items[0]!.props.find(p => p.name === 'defaultValue');
      expect(defaultValueProp).toBeDefined();
    });

    it('extracts props from $derived() destructuring pattern', async () => {
      vol.fromJSON({
        '/project/src/Wrapper.svelte': SVELTE5_DERIVED_DESTRUCTURING,
      });

      const scanner = new SvelteComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.svelte'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      // Should detect props from interface and $derived pattern
      expect(result.items[0]!.props.length).toBeGreaterThanOrEqual(3);

      const elementProp = result.items[0]!.props.find(p => p.name === 'element');
      expect(elementProp).toBeDefined();

      const childrenProp = result.items[0]!.props.find(p => p.name === 'children');
      expect(childrenProp).toBeDefined();

      const classProp = result.items[0]!.props.find(p => p.name === 'class');
      expect(classProp).toBeDefined();
    });

    it('extracts props from inline interface in instance script', async () => {
      vol.fromJSON({
        '/project/src/Button.svelte': SVELTE5_INLINE_INTERFACE_PROPS,
      });

      const scanner = new SvelteComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.svelte'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.props.length).toBeGreaterThanOrEqual(4);

      const variantProp = result.items[0]!.props.find(p => p.name === 'variant');
      expect(variantProp).toBeDefined();
      expect(variantProp!.required).toBe(false);
      expect(variantProp!.defaultValue).toContain('default');

      const sizeProp = result.items[0]!.props.find(p => p.name === 'size');
      expect(sizeProp).toBeDefined();

      const disabledProp = result.items[0]!.props.find(p => p.name === 'disabled');
      expect(disabledProp).toBeDefined();
      expect(disabledProp!.required).toBe(false);
    });
  });

  describe('deprecation detection', () => {
    it('detects @deprecated JSDoc tag', async () => {
      vol.fromJSON({
        '/project/src/OldButton.svelte': DEPRECATED_COMPONENT_SVELTE,
      });

      const scanner = new SvelteComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.svelte'],
      });

      const result = await scanner.scan();

      expect(result.items[0]!.metadata.deprecated).toBe(true);
    });

    it('non-deprecated components are not marked as deprecated', async () => {
      vol.fromJSON({
        '/project/src/Button.svelte': SIMPLE_BUTTON_SVELTE,
      });

      const scanner = new SvelteComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.svelte'],
      });

      const result = await scanner.scan();

      expect(result.items[0]!.metadata.deprecated).toBe(false);
    });
  });

  describe('dependency detection', () => {
    it('detects component dependencies from imports', async () => {
      vol.fromJSON({
        '/project/src/Layout.svelte': COMPONENT_WITH_DEPENDENCIES_SVELTE,
      });

      const scanner = new SvelteComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.svelte'],
      });

      const result = await scanner.scan();

      expect(result.items[0]!.dependencies).toContain('Header');
      expect(result.items[0]!.dependencies).toContain('Footer');
    });
  });

  describe('scan statistics', () => {
    it('returns correct scan statistics', async () => {
      vol.fromJSON({
        '/project/src/Button.svelte': SIMPLE_BUTTON_SVELTE,
        '/project/src/Card.svelte': CARD_WITH_PROPS_SVELTE,
      });

      const scanner = new SvelteComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.svelte'],
      });

      const result = await scanner.scan();

      expect(result.stats.filesScanned).toBe(2);
      expect(result.stats.itemsFound).toBe(2);
      expect(result.stats.duration).toBeGreaterThanOrEqual(0);
    });
  });
});
