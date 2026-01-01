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
  DEFINE_PROPS_VARIABLE_VUE,
  OPTIONS_API_EXTENDS_VUE,
  NESTED_TYPE_PROPS_VUE,
  WITH_DEFAULTS_PROPS_VUE,
  DESTRUCTURED_DEFINE_PROPS_VUE,
  ARRAY_PROPS_OPTIONS_API_VUE,
  PROP_TYPE_IMPORT_VUE,
  EXTERNAL_PROPS_IMPORT_VUE,
  STYLE_PROPS_VUE,
  COMPOUND_COMPONENT_VUE,
  GENERIC_COMPONENT_VUE,
  EMITS_VALIDATION_VUE,
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

  describe('advanced props extraction', () => {
    it('extracts complex nested type props with callbacks', async () => {
      vol.fromJSON({
        '/project/src/ComplexCard.vue': NESTED_TYPE_PROPS_VUE,
      });

      const scanner = new VueComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.vue'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.props.length).toBe(4);

      const titleProp = result.items[0]!.props.find(p => p.name === 'title');
      expect(titleProp).toBeDefined();
      expect(titleProp!.type).toBe('string');
      expect(titleProp!.required).toBe(true);

      const onClickProp = result.items[0]!.props.find(p => p.name === 'onClick');
      expect(onClickProp).toBeDefined();
      expect(onClickProp!.type).toBe('() => void');
      expect(onClickProp!.required).toBe(true);

      const dataProp = result.items[0]!.props.find(p => p.name === 'data');
      expect(dataProp).toBeDefined();
      expect(dataProp!.type).toContain('items');
      expect(dataProp!.required).toBe(true);

      const optionalProp = result.items[0]!.props.find(p => p.name === 'optional');
      expect(optionalProp).toBeDefined();
      expect(optionalProp!.required).toBe(false);
    });

    it('extracts props from withDefaults pattern', async () => {
      vol.fromJSON({
        '/project/src/MessageCard.vue': WITH_DEFAULTS_PROPS_VUE,
      });

      const scanner = new VueComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.vue'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.props.length).toBe(3);

      const messageProp = result.items[0]!.props.find(p => p.name === 'message');
      expect(messageProp).toBeDefined();
      expect(messageProp!.type).toBe('string');
      expect(messageProp!.required).toBe(true);

      const countProp = result.items[0]!.props.find(p => p.name === 'count');
      expect(countProp).toBeDefined();
      expect(countProp!.required).toBe(false);
    });

    it('extracts props from destructured defineProps', async () => {
      vol.fromJSON({
        '/project/src/NameCard.vue': DESTRUCTURED_DEFINE_PROPS_VUE,
      });

      const scanner = new VueComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.vue'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.props.length).toBe(2);

      const nameProp = result.items[0]!.props.find(p => p.name === 'name');
      expect(nameProp).toBeDefined();
      expect(nameProp!.type).toBe('string');
      expect(nameProp!.required).toBe(true);

      const ageProp = result.items[0]!.props.find(p => p.name === 'age');
      expect(ageProp).toBeDefined();
      expect(ageProp!.required).toBe(false);
    });

    it('extracts props from Options API with array syntax', async () => {
      vol.fromJSON({
        '/project/src/SimpleCard.vue': ARRAY_PROPS_OPTIONS_API_VUE,
      });

      const scanner = new VueComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.vue'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.props.length).toBe(3);

      const titleProp = result.items[0]!.props.find(p => p.name === 'title');
      expect(titleProp).toBeDefined();
    });

    it('extracts props from defineComponent with PropType', async () => {
      vol.fromJSON({
        '/project/src/ConfigButton.vue': PROP_TYPE_IMPORT_VUE,
      });

      const scanner = new VueComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.vue'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.props.length).toBe(3);

      const labelProp = result.items[0]!.props.find(p => p.name === 'label');
      expect(labelProp).toBeDefined();

      const configProp = result.items[0]!.props.find(p => p.name === 'config');
      expect(configProp).toBeDefined();

      const severityProp = result.items[0]!.props.find(p => p.name === 'severity');
      expect(severityProp).toBeDefined();
    });

    it('detects extends pattern but still parses the component', async () => {
      vol.fromJSON({
        '/project/src/Button.vue': OPTIONS_API_EXTENDS_VUE,
      });

      const scanner = new VueComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.vue'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Button');
      // extends components should record the base component as metadata
      expect(result.items[0]!.metadata.extendsComponent).toBe('BaseButton');
    });

    it('detects defineOptions name override', async () => {
      vol.fromJSON({
        '/project/src/Button.vue': DEFINE_PROPS_VARIABLE_VUE,
      });

      const scanner = new VueComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.vue'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      // Component name should be from defineOptions, not filename
      expect(result.items[0]!.metadata.defineOptionsName).toBe('ElButton');
    });

    it('detects external props reference', async () => {
      vol.fromJSON({
        '/project/src/Button.vue': EXTERNAL_PROPS_IMPORT_VUE,
      });

      const scanner = new VueComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.vue'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.metadata.defineOptionsName).toBe('ElButton');
      // Should record that props come from external source
      expect(result.items[0]!.metadata.externalPropsRef).toBe('buttonProps');
    });

    it('detects style-related props as theme tokens', async () => {
      vol.fromJSON({
        '/project/src/StyledButton.vue': STYLE_PROPS_VUE,
      });

      const scanner = new VueComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.vue'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      const props = result.items[0]!.props;

      // color prop should be detected with union type
      const colorProp = props.find(p => p.name === 'color');
      expect(colorProp).toBeDefined();
      expect(colorProp!.type).toContain('primary');

      // variant prop
      const variantProp = props.find(p => p.name === 'variant');
      expect(variantProp).toBeDefined();
      expect(variantProp!.type).toContain('filled');

      // size prop
      const sizeProp = props.find(p => p.name === 'size');
      expect(sizeProp).toBeDefined();

      // Check metadata for style props detection
      expect(result.items[0]!.metadata.styleProps).toContain('color');
      expect(result.items[0]!.metadata.styleProps).toContain('variant');
      expect(result.items[0]!.metadata.styleProps).toContain('size');
    });

    it('detects compound component with subcomponents', async () => {
      vol.fromJSON({
        '/project/src/Card.vue': COMPOUND_COMPONENT_VUE,
      });

      const scanner = new VueComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.vue'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.metadata.defineOptionsName).toBe('Card');
      // Should detect subcomponents from defineExpose
      expect(result.items[0]!.metadata.subComponents).toContain('CardHeader');
      expect(result.items[0]!.metadata.subComponents).toContain('CardBody');
      expect(result.items[0]!.metadata.subComponents).toContain('CardFooter');
    });

    it('detects generic component type parameter', async () => {
      vol.fromJSON({
        '/project/src/GenericList.vue': GENERIC_COMPONENT_VUE,
      });

      const scanner = new VueComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.vue'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      // Should detect the generic type parameter
      expect(result.items[0]!.metadata.genericType).toBe('T extends { id: string }');

      // Props should still be extracted
      const itemProp = result.items[0]!.props.find(p => p.name === 'item');
      expect(itemProp).toBeDefined();
      expect(itemProp!.type).toBe('T');
    });

    it('extracts emits from defineEmits with type signature', async () => {
      vol.fromJSON({
        '/project/src/EventButton.vue': EMITS_VALIDATION_VUE,
      });

      const scanner = new VueComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.vue'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      // Should extract emit definitions
      expect(result.items[0]!.metadata.emits).toContain('click');
      expect(result.items[0]!.metadata.emits).toContain('update:modelValue');
      expect(result.items[0]!.metadata.emits).toContain('focus');
    });
  });
});
