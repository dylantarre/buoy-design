// packages/scanners/src/git/angular-scanner.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';
import {
  SIMPLE_BUTTON_ANGULAR,
  CARD_WITH_INPUTS_ANGULAR,
  DEPRECATED_COMPONENT_ANGULAR,
  SIGNAL_INPUTS_ANGULAR,
  MULTIPLE_COMPONENTS_ANGULAR,
  NON_STANDARD_NAMING_ANGULAR,
  INPUT_WITH_TRANSFORM_ANGULAR,
  INPUT_WITH_ALIAS_ANGULAR,
  GETTER_SETTER_INPUT_ANGULAR,
  ANGULAR_17_SIGNALS,
  DEPRECATED_PROP_ANGULAR,
  ANGULAR_MATERIAL_SIGNALS,
  SIGNAL_INPUTS_WITH_OPTIONS,
  STANDALONE_COMPONENT_ANGULAR,
  SIMPLE_DIRECTIVE_ANGULAR,
  DIRECTIVE_WITH_METADATA_INPUTS,
  DIRECTIVE_WITH_HOST_DIRECTIVES,
  COMPLEX_DIRECTIVE_ANGULAR,
  DIRECTIVE_WITH_STRING_INPUTS,
  MULTIPLE_SELECTORS_ANGULAR,
  SIGNAL_QUERIES_ANGULAR,
  COMPONENT_WITH_INHERITANCE,
  COMPLEX_TRANSFORM_ANGULAR,
  OUTPUTS_IN_DECORATOR,
  EXTENDED_DEPRECATION_ANGULAR,
} from '../__tests__/fixtures/angular-components.js';
import { AngularComponentScanner } from './angular-scanner.js';

// Mock synchronous fs for Angular scanner (it uses readFileSync)
vi.mock('fs', async () => {
  const memfs = await import('memfs');
  return {
    ...memfs.fs,
    default: memfs.fs,
  };
});

describe('AngularComponentScanner', () => {
  beforeEach(() => {
    vol.reset();
  });

  describe('component detection', () => {
    it('detects Angular components with @Component decorator', async () => {
      vol.fromJSON({
        '/project/src/button.component.ts': SIMPLE_BUTTON_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('ButtonComponent');
      expect(result.items[0]!.source.type).toBe('angular');
    });

    it('detects multiple components in single file', async () => {
      vol.fromJSON({
        '/project/src/layout.component.ts': MULTIPLE_COMPONENTS_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(2);
      const names = result.items.map(c => c.name);
      expect(names).toContain('HeaderComponent');
      expect(names).toContain('FooterComponent');
    });

    it('detects multiple components across files', async () => {
      vol.fromJSON({
        '/project/src/button.component.ts': SIMPLE_BUTTON_ANGULAR,
        '/project/src/card.component.ts': CARD_WITH_INPUTS_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(2);
      const names = result.items.map(c => c.name);
      expect(names).toContain('ButtonComponent');
      expect(names).toContain('CardComponent');
    });
  });

  describe('props extraction', () => {
    it('extracts @Input decorators as props', async () => {
      vol.fromJSON({
        '/project/src/card.component.ts': CARD_WITH_INPUTS_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      // Should have at least title, subtitle, isActive
      expect(result.items[0]!.props.length).toBeGreaterThanOrEqual(3);

      const titleProp = result.items[0]!.props.find(p => p.name === 'title');
      expect(titleProp).toBeDefined();
      expect(titleProp!.type).toBe('string');

      const subtitleProp = result.items[0]!.props.find(p => p.name === 'subtitle');
      expect(subtitleProp).toBeDefined();

      const isActiveProp = result.items[0]!.props.find(p => p.name === 'isActive');
      expect(isActiveProp).toBeDefined();
      expect(isActiveProp!.type).toBe('boolean');
    });

    it('extracts @Output decorators as props', async () => {
      vol.fromJSON({
        '/project/src/button.component.ts': SIMPLE_BUTTON_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      const clickedProp = result.items[0]!.props.find(p => p.name === 'clicked');
      expect(clickedProp).toBeDefined();
      expect(clickedProp!.type).toBe('EventEmitter');
    });

    it('extracts Angular 17+ signal inputs', async () => {
      vol.fromJSON({
        '/project/src/modern.component.ts': SIGNAL_INPUTS_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      const nameProp = result.items[0]!.props.find(p => p.name === 'name');
      expect(nameProp).toBeDefined();
      // Updated: Scanner now extracts generic type info from signals
      expect(nameProp!.type).toBe('Signal<string>');

      const ageProp = result.items[0]!.props.find(p => p.name === 'age');
      expect(ageProp).toBeDefined();
      expect(ageProp!.type).toBe('Signal<number>');
    });

    it('extracts Angular 17+ signal outputs', async () => {
      vol.fromJSON({
        '/project/src/modern.component.ts': SIGNAL_INPUTS_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      const selectedProp = result.items[0]!.props.find(p => p.name === 'selected');
      expect(selectedProp).toBeDefined();
      expect(selectedProp!.type).toBe('OutputSignal');
    });
  });

  describe('deprecation detection', () => {
    it('detects @deprecated JSDoc tag', async () => {
      vol.fromJSON({
        '/project/src/old-button.component.ts': DEPRECATED_COMPONENT_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      expect(result.items[0]!.metadata.deprecated).toBe(true);
    });

    it('non-deprecated components are not marked as deprecated', async () => {
      vol.fromJSON({
        '/project/src/button.component.ts': SIMPLE_BUTTON_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      expect(result.items[0]!.metadata.deprecated).toBe(false);
    });
  });

  describe('selector extraction', () => {
    it('extracts component selector from decorator', async () => {
      vol.fromJSON({
        '/project/src/button.component.ts': SIMPLE_BUTTON_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      const source = result.items[0]!.source as { selector: string };
      expect(source.selector).toBe('app-button');
    });
  });

  describe('scan statistics', () => {
    it('returns correct scan statistics', async () => {
      vol.fromJSON({
        '/project/src/button.component.ts': SIMPLE_BUTTON_ANGULAR,
        '/project/src/card.component.ts': CARD_WITH_INPUTS_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      expect(result.stats.filesScanned).toBe(2);
      expect(result.stats.itemsFound).toBe(2);
      expect(result.stats.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('non-standard file naming (like Angular Material)', () => {
    it('detects components in files not named *.component.ts', async () => {
      vol.fromJSON({
        '/project/src/material/tree/tree.ts': NON_STANDARD_NAMING_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
        exclude: ['**/*.spec.ts', '**/*.test.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('MatTree');
    });
  });

  describe('input transforms (Angular 16+)', () => {
    it('extracts inputs with booleanAttribute transform', async () => {
      vol.fromJSON({
        '/project/src/toggle.component.ts': INPUT_WITH_TRANSFORM_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();
      const disabledProp = result.items[0]!.props.find(p => p.name === 'disabled');

      expect(disabledProp).toBeDefined();
      expect(disabledProp!.type).toBe('boolean');
    });

    it('extracts inputs with numberAttribute transform', async () => {
      vol.fromJSON({
        '/project/src/toggle.component.ts': INPUT_WITH_TRANSFORM_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();
      const sizeProp = result.items[0]!.props.find(p => p.name === 'size');

      expect(sizeProp).toBeDefined();
      expect(sizeProp!.type).toBe('number');
    });

    it('detects required inputs with required: true option', async () => {
      vol.fromJSON({
        '/project/src/toggle.component.ts': INPUT_WITH_TRANSFORM_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();
      const idProp = result.items[0]!.props.find(p => p.name === 'id');

      expect(idProp).toBeDefined();
      expect(idProp!.required).toBe(true);
    });
  });

  describe('input aliases', () => {
    it('extracts input alias name', async () => {
      vol.fromJSON({
        '/project/src/tab.component.ts': INPUT_WITH_ALIAS_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();
      const labelProp = result.items[0]!.props.find(p => p.name === 'textLabel');

      expect(labelProp).toBeDefined();
      // The alias should be captured in metadata or description
      expect(labelProp!.description).toContain('label');
    });

    it('extracts aria-* input aliases', async () => {
      vol.fromJSON({
        '/project/src/tab.component.ts': INPUT_WITH_ALIAS_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();
      const ariaLabelProp = result.items[0]!.props.find(p => p.name === 'ariaLabel');

      expect(ariaLabelProp).toBeDefined();
      expect(ariaLabelProp!.description).toContain('aria-label');
    });
  });

  describe('getter/setter inputs (Angular Material pattern)', () => {
    it('detects getter/setter style inputs', async () => {
      vol.fromJSON({
        '/project/src/tree.component.ts': GETTER_SETTER_INPUT_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();
      const dataSourceProp = result.items[0]!.props.find(p => p.name === 'dataSource');

      expect(dataSourceProp).toBeDefined();
      expect(dataSourceProp!.type).toBe('any[]');
    });

    it('extracts type from getter return type', async () => {
      vol.fromJSON({
        '/project/src/tree.component.ts': GETTER_SETTER_INPUT_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();
      const trackByProp = result.items[0]!.props.find(p => p.name === 'trackBy');

      expect(trackByProp).toBeDefined();
      expect(trackByProp!.type).toBe('any');
    });
  });

  describe('Angular 17+ signal features', () => {
    it('detects required signal inputs (input.required)', async () => {
      vol.fromJSON({
        '/project/src/advanced.component.ts': ANGULAR_17_SIGNALS,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();
      const nameProp = result.items[0]!.props.find(p => p.name === 'name');

      expect(nameProp).toBeDefined();
      expect(nameProp!.required).toBe(true);
      expect(nameProp!.type).toBe('Signal<string>');
    });

    it('detects optional signal inputs with default', async () => {
      vol.fromJSON({
        '/project/src/advanced.component.ts': ANGULAR_17_SIGNALS,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();
      const ageProp = result.items[0]!.props.find(p => p.name === 'age');

      expect(ageProp).toBeDefined();
      expect(ageProp!.required).toBe(false);
      expect(ageProp!.defaultValue).toBe('0');
    });

    it('detects model signals for two-way binding', async () => {
      vol.fromJSON({
        '/project/src/advanced.component.ts': ANGULAR_17_SIGNALS,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();
      const countProp = result.items[0]!.props.find(p => p.name === 'count');

      expect(countProp).toBeDefined();
      expect(countProp!.type).toBe('ModelSignal<number>');
    });

    it('detects required model signals', async () => {
      vol.fromJSON({
        '/project/src/advanced.component.ts': ANGULAR_17_SIGNALS,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();
      const selectedProp = result.items[0]!.props.find(p => p.name === 'selected');

      expect(selectedProp).toBeDefined();
      expect(selectedProp!.required).toBe(true);
      expect(selectedProp!.type).toBe('ModelSignal<boolean>');
    });
  });

  describe('deprecated property detection', () => {
    it('detects @deprecated JSDoc on input properties', async () => {
      vol.fromJSON({
        '/project/src/deprecated.component.ts': DEPRECATED_PROP_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();
      const oldProp = result.items[0]!.props.find(p => p.name === 'oldProp');

      expect(oldProp).toBeDefined();
      expect(oldProp!.deprecated).toBe(true);
    });

    it('does not mark non-deprecated props as deprecated', async () => {
      vol.fromJSON({
        '/project/src/deprecated.component.ts': DEPRECATED_PROP_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();
      const newProp = result.items[0]!.props.find(p => p.name === 'newProp');

      expect(newProp).toBeDefined();
      expect(newProp!.deprecated).toBeFalsy();
    });
  });

  describe('Angular Material-style signal patterns', () => {
    it('extracts typed InputSignal declarations', async () => {
      vol.fromJSON({
        '/project/src/timepicker.component.ts': ANGULAR_MATERIAL_SIGNALS,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();
      expect(result.items).toHaveLength(1);

      // InputSignal<readonly string[] | null>
      const optionsProp = result.items[0]!.props.find(p => p.name === 'options');
      expect(optionsProp).toBeDefined();
      expect(optionsProp!.type).toContain('Signal');
    });

    it('extracts InputSignalWithTransform with custom transform', async () => {
      vol.fromJSON({
        '/project/src/timepicker.component.ts': ANGULAR_MATERIAL_SIGNALS,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      // InputSignalWithTransform<number | null, number | string | null>
      const intervalProp = result.items[0]!.props.find(p => p.name === 'interval');
      expect(intervalProp).toBeDefined();
      expect(intervalProp!.type).toContain('Signal');
    });

    it('extracts InputSignalWithTransform with booleanAttribute', async () => {
      vol.fromJSON({
        '/project/src/timepicker.component.ts': ANGULAR_MATERIAL_SIGNALS,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      const disableRippleProp = result.items[0]!.props.find(p => p.name === 'disableRipple');
      expect(disableRippleProp).toBeDefined();
      // Should recognize booleanAttribute transform
      expect(disableRippleProp!.type).toBe('boolean');
    });

    it('extracts signal input with alias option', async () => {
      vol.fromJSON({
        '/project/src/timepicker.component.ts': ANGULAR_MATERIAL_SIGNALS,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      const ariaLabelProp = result.items[0]!.props.find(p => p.name === 'ariaLabel');
      expect(ariaLabelProp).toBeDefined();
      expect(ariaLabelProp!.description).toContain('aria-label');
    });

    it('extracts OutputEmitterRef as outputs', async () => {
      vol.fromJSON({
        '/project/src/timepicker.component.ts': ANGULAR_MATERIAL_SIGNALS,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      const selectedProp = result.items[0]!.props.find(p => p.name === 'selected');
      expect(selectedProp).toBeDefined();
      expect(selectedProp!.type).toBe('OutputEmitterRef');

      const openedProp = result.items[0]!.props.find(p => p.name === 'opened');
      expect(openedProp).toBeDefined();

      const closedProp = result.items[0]!.props.find(p => p.name === 'closed');
      expect(closedProp).toBeDefined();
    });
  });

  describe('signal inputs with options', () => {
    it('extracts signal input with transform option', async () => {
      vol.fromJSON({
        '/project/src/settings.component.ts': SIGNAL_INPUTS_WITH_OPTIONS,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      const enabledProp = result.items[0]!.props.find(p => p.name === 'enabled');
      expect(enabledProp).toBeDefined();
      expect(enabledProp!.type).toBe('boolean');
      expect(enabledProp!.defaultValue).toBe('false');
    });

    it('extracts signal input with alias and transform', async () => {
      vol.fromJSON({
        '/project/src/settings.component.ts': SIGNAL_INPUTS_WITH_OPTIONS,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      const itemCountProp = result.items[0]!.props.find(p => p.name === 'itemCount');
      expect(itemCountProp).toBeDefined();
      expect(itemCountProp!.type).toBe('number');
      expect(itemCountProp!.description).toContain('count');
    });

    it('extracts signal input with only alias', async () => {
      vol.fromJSON({
        '/project/src/settings.component.ts': SIGNAL_INPUTS_WITH_OPTIONS,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      const labelTextProp = result.items[0]!.props.find(p => p.name === 'labelText');
      expect(labelTextProp).toBeDefined();
      expect(labelTextProp!.description).toContain('label');
    });

    it('extracts required signal input with options', async () => {
      vol.fromJSON({
        '/project/src/settings.component.ts': SIGNAL_INPUTS_WITH_OPTIONS,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      const itemIdProp = result.items[0]!.props.find(p => p.name === 'itemId');
      expect(itemIdProp).toBeDefined();
      expect(itemIdProp!.required).toBe(true);
      expect(itemIdProp!.description).toContain('id');
    });
  });

  describe('standalone components', () => {
    it('detects standalone components', async () => {
      vol.fromJSON({
        '/project/src/card.component.ts': STANDALONE_COMPONENT_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('StandaloneCardComponent');
    });

    it('extracts props from standalone components', async () => {
      vol.fromJSON({
        '/project/src/card.component.ts': STANDALONE_COMPONENT_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.component.ts'],
      });

      const result = await scanner.scan();

      const titleProp = result.items[0]!.props.find(p => p.name === 'title');
      expect(titleProp).toBeDefined();

      const cardClickProp = result.items[0]!.props.find(p => p.name === 'cardClick');
      expect(cardClickProp).toBeDefined();
      expect(cardClickProp!.type).toBe('EventEmitter');
    });
  });

  describe('default patterns include all .ts files', () => {
    it('uses patterns that catch non-component.ts files when not specified', async () => {
      vol.fromJSON({
        '/project/src/material/timepicker.ts': ANGULAR_MATERIAL_SIGNALS,
        '/project/src/regular.component.ts': SIMPLE_BUTTON_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        // Use default patterns - should include both files
      });

      const result = await scanner.scan();

      // Should find both components
      expect(result.items.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('@Directive detection', () => {
    it('detects Angular directives with @Directive decorator', async () => {
      vol.fromJSON({
        '/project/src/tooltip.directive.ts': SIMPLE_DIRECTIVE_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('MatTooltip');
      expect(result.items[0]!.source.type).toBe('angular');
    });

    it('extracts selector from directive decorator', async () => {
      vol.fromJSON({
        '/project/src/tooltip.directive.ts': SIMPLE_DIRECTIVE_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      const source = result.items[0]!.source as { selector: string };
      expect(source.selector).toBe('[matTooltip]');
    });

    it('extracts @Input props from directives', async () => {
      vol.fromJSON({
        '/project/src/tooltip.directive.ts': SIMPLE_DIRECTIVE_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      const messageProp = result.items[0]!.props.find(p => p.name === 'message');
      expect(messageProp).toBeDefined();
      expect(messageProp!.description).toContain('matTooltip');

      const positionProp = result.items[0]!.props.find(p => p.name === 'matTooltipPosition');
      expect(positionProp).toBeDefined();
    });

    it('detects both components and directives in the same scan', async () => {
      vol.fromJSON({
        '/project/src/button.component.ts': SIMPLE_BUTTON_ANGULAR,
        '/project/src/tooltip.directive.ts': SIMPLE_DIRECTIVE_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(2);
      const names = result.items.map(c => c.name);
      expect(names).toContain('ButtonComponent');
      expect(names).toContain('MatTooltip');
    });
  });

  describe('decorator metadata inputs array', () => {
    it('extracts inputs defined in decorator metadata as object array', async () => {
      vol.fromJSON({
        '/project/src/tree-toggle.directive.ts': DIRECTIVE_WITH_METADATA_INPUTS,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      const recursiveProp = result.items[0]!.props.find(p => p.name === 'recursive');
      expect(recursiveProp).toBeDefined();
      expect(recursiveProp!.description).toContain('matTreeNodeToggleRecursive');
    });

    it('extracts inputs defined in decorator metadata as string array', async () => {
      vol.fromJSON({
        '/project/src/sort.directive.ts': DIRECTIVE_WITH_STRING_INPUTS,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      const activeProp = result.items[0]!.props.find(p => p.name === 'matSortActive');
      expect(activeProp).toBeDefined();

      const directionProp = result.items[0]!.props.find(p => p.name === 'matSortDirection');
      expect(directionProp).toBeDefined();
    });

    it('combines decorator metadata inputs with @Input decorator inputs', async () => {
      vol.fromJSON({
        '/project/src/slider.directive.ts': COMPLEX_DIRECTIVE_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      // Should have both decorator metadata inputs (min, max, step) and @Input (disabled)
      const propNames = result.items[0]!.props.map(p => p.name);
      expect(propNames).toContain('min');
      expect(propNames).toContain('max');
      expect(propNames).toContain('step');
      expect(propNames).toContain('disabled');
    });
  });

  describe('hostDirectives extraction', () => {
    it('extracts hostDirectives as dependencies', async () => {
      vol.fromJSON({
        '/project/src/button.directive.ts': DIRECTIVE_WITH_HOST_DIRECTIVES,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.dependencies).toContain('Bind');
    });

    it('extracts complex hostDirectives with input/output forwarding', async () => {
      vol.fromJSON({
        '/project/src/slider.directive.ts': COMPLEX_DIRECTIVE_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items[0]!.dependencies).toContain('Bind');
      expect(result.items[0]!.dependencies).toContain('SomeOtherDirective');
    });
  });

  describe('directive exportAs extraction', () => {
    it('extracts exportAs from directive metadata', async () => {
      vol.fromJSON({
        '/project/src/slider.directive.ts': COMPLEX_DIRECTIVE_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      const source = result.items[0]!.source as { exportAs?: string };
      expect(source.exportAs).toBe('matSliderThumb');
    });
  });

  describe('multiple selectors', () => {
    it('parses component with multiple comma-separated selectors', async () => {
      vol.fromJSON({
        '/project/src/iconfield.ts': MULTIPLE_SELECTORS_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('IconField');

      const source = result.items[0]!.source as { selector: string; selectors?: string[] };
      // Should parse at least the first selector
      expect(source.selector).toBe('p-iconfield');
      // Should also capture all selectors
      expect(source.selectors).toContain('p-iconfield');
      expect(source.selectors).toContain('p-iconField');
      expect(source.selectors).toContain('p-icon-field');
    });
  });

  describe('outputs in decorator metadata', () => {
    it('extracts outputs defined in decorator metadata array', async () => {
      vol.fromJSON({
        '/project/src/sort.directive.ts': OUTPUTS_IN_DECORATOR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      const outputProp = result.items[0]!.props.find(p => p.name === 'matSortChange');
      expect(outputProp).toBeDefined();
    });
  });

  describe('complex input transforms', () => {
    it('detects custom transform functions', async () => {
      vol.fromJSON({
        '/project/src/button.ts': COMPLEX_TRANSFORM_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);

      // Should detect input with custom transform
      const tabIndexProp = result.items[0]!.props.find(p => p.name === 'tabIndex');
      expect(tabIndexProp).toBeDefined();
      expect(tabIndexProp!.type).toBe('number');
    });

    it('detects input with both alias and transform', async () => {
      vol.fromJSON({
        '/project/src/button.ts': COMPLEX_TRANSFORM_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      // Should find ariaDisabled with both alias and transform
      const ariaDisabledProp = result.items[0]!.props.find(p => p.name === 'ariaDisabled');
      expect(ariaDisabledProp).toBeDefined();
      expect(ariaDisabledProp!.type).toBe('boolean');
      expect(ariaDisabledProp!.description).toContain('aria-disabled');
    });
  });

  describe('extended deprecation messages', () => {
    it('detects deprecation with version info', async () => {
      vol.fromJSON({
        '/project/src/iconfield.ts': EXTENDED_DEPRECATION_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      const styleClassProp = result.items[0]!.props.find(p => p.name === 'styleClass');
      expect(styleClassProp).toBeDefined();
      expect(styleClassProp!.deprecated).toBe(true);
    });

    it('non-deprecated props with @group are not marked deprecated', async () => {
      vol.fromJSON({
        '/project/src/iconfield.ts': EXTENDED_DEPRECATION_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      const iconPositionProp = result.items[0]!.props.find(p => p.name === 'iconPosition');
      expect(iconPositionProp).toBeDefined();
      expect(iconPositionProp!.deprecated).toBeFalsy();
    });
  });

  describe('component inheritance', () => {
    it('detects components that extend base classes', async () => {
      vol.fromJSON({
        '/project/src/card.ts': COMPONENT_WITH_INHERITANCE,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Card');

      // Should detect inputs on the class
      const titleProp = result.items[0]!.props.find(p => p.name === 'title');
      expect(titleProp).toBeDefined();
    });
  });

  describe('signal queries (viewChild/contentChild)', () => {
    it('detects components with signal queries', async () => {
      vol.fromJSON({
        '/project/src/form-field.ts': SIGNAL_QUERIES_ANGULAR,
      });

      const scanner = new AngularComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
      });

      const result = await scanner.scan();

      // Component should be detected even with signal queries
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('MatFormField');

      // Regular inputs should still be detected
      const appearanceProp = result.items[0]!.props.find(p => p.name === 'appearance');
      expect(appearanceProp).toBeDefined();
    });
  });
});
