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
  COMPOUND_COMPONENT_OBJECT_ASSIGN,
  COMPOUND_COMPONENT_PROPERTY_ASSIGNMENT,
  COMPOUND_COMPONENT_REACT_BOOTSTRAP,
  FORWARD_REF_WITH_DISPLAYNAME,
  FORWARD_REF_WITH_DISPLAYNAME_NO_ASSERTION,
  FORWARD_REF_TYPED_WITH_DISPLAYNAME,
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

  describe('compound component detection', () => {
    it('detects compound components via Object.assign pattern', async () => {
      vol.fromJSON({
        '/project/src/Menu.tsx': COMPOUND_COMPONENT_OBJECT_ASSIGN,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();
      const componentNames = result.items.map(c => c.name);

      // Should detect the namespace component and all sub-components
      expect(componentNames).toContain('Menu');
      expect(componentNames).toContain('Menu.Button');
      expect(componentNames).toContain('Menu.Item');
      expect(componentNames).toContain('Menu.Separator');
    });

    it('detects compound components via property assignment', async () => {
      vol.fromJSON({
        '/project/src/Dialog.tsx': COMPOUND_COMPONENT_PROPERTY_ASSIGNMENT,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();
      const componentNames = result.items.map(c => c.name);

      // Should detect Dialog and its sub-components
      expect(componentNames).toContain('Dialog');
      expect(componentNames).toContain('Dialog.Title');
      expect(componentNames).toContain('Dialog.Content');
      expect(componentNames).toContain('Dialog.Footer');
    });

    it('detects React Bootstrap style compound components', async () => {
      vol.fromJSON({
        '/project/src/Card.tsx': COMPOUND_COMPONENT_REACT_BOOTSTRAP,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();
      const componentNames = result.items.map(c => c.name);

      // Should detect Card and its sub-components
      expect(componentNames).toContain('Card');
      expect(componentNames).toContain('Card.Header');
      expect(componentNames).toContain('Card.Body');
      expect(componentNames).toContain('Card.Footer');
    });
  });

  describe('forwardRef with displayName detection', () => {
    it('detects forwardRef with type assertion and displayName (Primer pattern)', async () => {
      vol.fromJSON({
        '/project/src/Token.tsx': FORWARD_REF_WITH_DISPLAYNAME,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Token');
      expect(result.items[0]!.source.type).toBe('react');
    });

    it('detects forwardRef with displayName but no type assertion', async () => {
      vol.fromJSON({
        '/project/src/IconButton.tsx': FORWARD_REF_WITH_DISPLAYNAME_NO_ASSERTION,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('IconButton');
      expect(result.items[0]!.source.type).toBe('react');
    });

    it('detects forwardRef with inline typing and displayName', async () => {
      vol.fromJSON({
        '/project/src/Link.tsx': FORWARD_REF_TYPED_WITH_DISPLAYNAME,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Link');
      expect(result.items[0]!.source.type).toBe('react');
    });
  });
});
