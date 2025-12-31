// packages/scanners/src/git/react-scanner.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { vol } from 'memfs';
import {
  SIMPLE_BUTTON,
  ARROW_COMPONENT,
  HARDCODED_STYLES,
  DEPRECATED_COMPONENT,
  MANTINE_POLYMORPHIC_FACTORY,
  CHAKRA_RECIPE_CONTEXT,
  CHAKRA_SLOT_RECIPE_CONTEXT,
  SHADCN_CVA,
  WITH_CONTEXT_PATTERN,
  WITH_PROVIDER_PATTERN,
} from '../__tests__/fixtures/react-components.js';
import { ReactComponentScanner } from './react-scanner.js';

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
      expect(result.items[0]!.name).toBe('Button');
      expect(result.items[0]!.source.type).toBe('react');
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
      expect(result.items[0]!.name).toBe('Card');
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
      const hardcoded = result.items[0]!.metadata.hardcodedValues || [];

      expect(hardcoded).toContainEqual(
        expect.objectContaining({ type: 'color', value: '#ff0000' })
      );
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
      const hardcoded = result.items[0]!.metadata.hardcodedValues || [];

      expect(hardcoded).toContainEqual(
        expect.objectContaining({ type: 'spacing', value: '8px' })
      );
    });
  });

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

      expect(result.items[0]!.metadata.deprecated).toBe(true);
    });
  });

  describe('modern factory pattern detection', () => {
    it('detects Mantine polymorphicFactory components', async () => {
      vol.fromJSON({
        '/project/src/Button.tsx': MANTINE_POLYMORPHIC_FACTORY,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Button');
      expect(result.items[0]!.source.type).toBe('react');
    });

    it('detects Chakra UI createRecipeContext pattern', async () => {
      vol.fromJSON({
        '/project/src/Button.tsx': CHAKRA_RECIPE_CONTEXT,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      // Should detect the forwardRef component
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      const buttonComponent = result.items.find(c => c.name === 'Button');
      expect(buttonComponent).toBeDefined();
      expect(buttonComponent!.source.type).toBe('react');
    });

    it('detects Chakra UI createSlotRecipeContext pattern with withContext', async () => {
      vol.fromJSON({
        '/project/src/Card.tsx': CHAKRA_SLOT_RECIPE_CONTEXT,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Card');
      expect(result.items[0]!.source.type).toBe('react');
    });

    it('detects shadcn/ui cva pattern with forwardRef component', async () => {
      vol.fromJSON({
        '/project/src/button.tsx': SHADCN_CVA,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      // cva is used for styling, the Button component uses forwardRef
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Button');
      expect(result.items[0]!.source.type).toBe('react');
    });

    it('detects withContext pattern', async () => {
      vol.fromJSON({
        '/project/src/Tooltip.tsx': WITH_CONTEXT_PATTERN,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Tooltip');
      expect(result.items[0]!.source.type).toBe('react');
    });

    it('detects withProvider pattern', async () => {
      vol.fromJSON({
        '/project/src/ThemeableButton.tsx': WITH_PROVIDER_PATTERN,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('ThemeableButton');
      expect(result.items[0]!.source.type).toBe('react');
    });
  });
});
