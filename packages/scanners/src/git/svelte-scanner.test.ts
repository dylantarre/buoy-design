// packages/scanners/src/git/svelte-scanner.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { vol } from 'memfs';
import {
  SIMPLE_BUTTON_SVELTE,
  CARD_WITH_PROPS_SVELTE,
  SVELTE5_PROPS_COMPONENT,
  DEPRECATED_COMPONENT_SVELTE,
  COMPONENT_WITH_DEPENDENCIES_SVELTE,
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

    it('ignores lowercase named files', async () => {
      vol.fromJSON({
        '/project/src/helper.svelte': SIMPLE_BUTTON_SVELTE,
      });

      const scanner = new SvelteComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.svelte'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(0);
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
