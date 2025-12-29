// packages/scanners/src/git/vue-scanner.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { vol } from 'memfs';
import {
  SIMPLE_BUTTON_VUE,
  CARD_WITH_PROPS_VUE,
  BADGE_WITH_STYLES_VUE,
  DEPRECATED_COMPONENT_VUE,
  OPTIONS_API_COMPONENT_VUE,
  COMPONENT_WITH_DEPENDENCIES_VUE,
} from '../__tests__/fixtures/vue-components.js';
import { VueComponentScanner } from './vue-scanner.js';

describe('VueComponentScanner', () => {
  beforeEach(() => {
    vol.reset();
  });

  describe('component detection', () => {
    it('detects Vue SFC components', async () => {
      vol.fromJSON({
        '/project/src/Button.vue': SIMPLE_BUTTON_VUE,
      });

      const scanner = new VueComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.vue'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Button');
      expect(result.items[0]!.source.type).toBe('vue');
    });

    it('ignores lowercase named files', async () => {
      vol.fromJSON({
        '/project/src/utils.vue': SIMPLE_BUTTON_VUE,
      });

      const scanner = new VueComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.vue'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(0);
    });

    it('detects multiple components', async () => {
      vol.fromJSON({
        '/project/src/Button.vue': SIMPLE_BUTTON_VUE,
        '/project/src/Card.vue': CARD_WITH_PROPS_VUE,
      });

      const scanner = new VueComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.vue'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(2);
      const names = result.items.map(c => c.name);
      expect(names).toContain('Button');
      expect(names).toContain('Card');
    });
  });

  describe('props extraction', () => {
    it('extracts props from defineProps with TypeScript generics', async () => {
      vol.fromJSON({
        '/project/src/Card.vue': CARD_WITH_PROPS_VUE,
      });

      const scanner = new VueComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.vue'],
      });

      const result = await scanner.scan();

      expect(result.items[0]!.props.length).toBeGreaterThan(0);

      const titleProp = result.items[0]!.props.find(p => p.name === 'title');
      expect(titleProp).toBeDefined();
      expect(titleProp!.type).toBe('string');
      expect(titleProp!.required).toBe(true);

      const subtitleProp = result.items[0]!.props.find(p => p.name === 'subtitle');
      expect(subtitleProp).toBeDefined();
      expect(subtitleProp!.required).toBe(false);
    });

    it('extracts props from Options API', async () => {
      vol.fromJSON({
        '/project/src/MessageDisplay.vue': OPTIONS_API_COMPONENT_VUE,
      });

      const scanner = new VueComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.vue'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.props.length).toBeGreaterThan(0);

      const messageProp = result.items[0]!.props.find(p => p.name === 'message');
      expect(messageProp).toBeDefined();
      expect(messageProp!.required).toBe(true);
    });
  });

  describe('deprecation detection', () => {
    it('detects @deprecated JSDoc tag', async () => {
      vol.fromJSON({
        '/project/src/OldButton.vue': DEPRECATED_COMPONENT_VUE,
      });

      const scanner = new VueComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.vue'],
      });

      const result = await scanner.scan();

      expect(result.items[0]!.metadata.deprecated).toBe(true);
    });

    it('non-deprecated components are not marked as deprecated', async () => {
      vol.fromJSON({
        '/project/src/Button.vue': SIMPLE_BUTTON_VUE,
      });

      const scanner = new VueComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.vue'],
      });

      const result = await scanner.scan();

      expect(result.items[0]!.metadata.deprecated).toBe(false);
    });
  });

  describe('dependency detection', () => {
    it('detects component dependencies from template', async () => {
      vol.fromJSON({
        '/project/src/Layout.vue': COMPONENT_WITH_DEPENDENCIES_VUE,
      });

      const scanner = new VueComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.vue'],
      });

      const result = await scanner.scan();

      expect(result.items[0]!.dependencies).toContain('HeaderBar');
      expect(result.items[0]!.dependencies).toContain('FooterBar');
      // kebab-case is converted to PascalCase
      expect(result.items[0]!.dependencies).toContain('SidebarMenu');
    });
  });

  describe('scan statistics', () => {
    it('returns correct scan statistics', async () => {
      vol.fromJSON({
        '/project/src/Button.vue': SIMPLE_BUTTON_VUE,
        '/project/src/Card.vue': CARD_WITH_PROPS_VUE,
      });

      const scanner = new VueComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.vue'],
      });

      const result = await scanner.scan();

      expect(result.stats.filesScanned).toBe(2);
      expect(result.stats.itemsFound).toBe(2);
      expect(result.stats.duration).toBeGreaterThanOrEqual(0);
    });
  });
});
