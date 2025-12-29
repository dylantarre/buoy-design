// packages/scanners/src/git/angular-scanner.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';
import {
  SIMPLE_BUTTON_ANGULAR,
  CARD_WITH_INPUTS_ANGULAR,
  DEPRECATED_COMPONENT_ANGULAR,
  SIGNAL_INPUTS_ANGULAR,
  MULTIPLE_COMPONENTS_ANGULAR,
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
      expect(nameProp!.type).toBe('Signal');

      const ageProp = result.items[0]!.props.find(p => p.name === 'age');
      expect(ageProp).toBeDefined();
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
});
