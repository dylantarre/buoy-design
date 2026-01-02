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
  CHAKRA_STYLED_FACTORY,
  CHAKRA_STYLED_FACTORY_WITH_VARIANTS,
  MANTINE_FACTORY,
  MANTINE_FACTORY_WITH_STATICS,
  CHAKRA_WITH_PROVIDER_STRING_ARGS,
  REACT_FC_ANNOTATED_COMPONENT,
  MEMO_FORWARD_REF_COMPONENT,
  FORWARD_REF_NAMED_FUNCTION,
  FUNCTION_DECLARATION_WITH_JSX,
  MULTI_PATTERN_FILE,
  CHAKRA_V3_WITH_CONTEXT_STRING_ELEMENT,
  RADIX_NAMED_ALIAS_EXPORTS,
  ARK_UI_WRAPPED_COMPONENT_PATTERN,
  CHAKRA_ELEMENT_STYLE,
  NESTED_HOC_PATTERN,
  REACT_LAZY_COMPONENT,
  FACTORY_WITH_INNER_COMPONENTS,
  CHAKRA_WITH_ROOT_PROVIDER,
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

  describe('styled component factory detection', () => {
    it('detects Chakra UI chakra() styled factory pattern', async () => {
      vol.fromJSON({
        '/project/src/Center.tsx': CHAKRA_STYLED_FACTORY,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Center');
      expect(result.items[0]!.source.type).toBe('react');
    });

    it('detects Chakra UI chakra() with variants', async () => {
      vol.fromJSON({
        '/project/src/InputElement.tsx': CHAKRA_STYLED_FACTORY_WITH_VARIANTS,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('InputElement');
      expect(result.items[0]!.source.type).toBe('react');
    });

    it('detects Mantine factory<Type>() pattern', async () => {
      vol.fromJSON({
        '/project/src/Month.tsx': MANTINE_FACTORY,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Month');
      expect(result.items[0]!.source.type).toBe('react');
    });

    it('detects Mantine factory with static components', async () => {
      vol.fromJSON({
        '/project/src/DatePicker.tsx': MANTINE_FACTORY_WITH_STATICS,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();
      const componentNames = result.items.map(c => c.name);

      // Should detect both DatePicker and DatePickerInput, plus compound DatePicker.Input
      expect(componentNames).toContain('DatePicker');
      expect(componentNames).toContain('DatePickerInput');
      expect(componentNames).toContain('DatePicker.Input');
    });
  });

  describe('Chakra v3 withProvider/withContext with string args', () => {
    it('detects withProvider with string element arguments', async () => {
      vol.fromJSON({
        '/project/src/Card.tsx': CHAKRA_WITH_PROVIDER_STRING_ARGS,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();
      const componentNames = result.items.map(c => c.name);

      // Should detect all withProvider/withContext components
      expect(componentNames).toContain('CardRoot');
      expect(componentNames).toContain('CardBody');
      expect(componentNames).toContain('CardHeader');
    });
  });

  describe('React.FC type annotated components', () => {
    it('detects React.FC annotated functional components', async () => {
      vol.fromJSON({
        '/project/src/TooltipProvider.tsx': REACT_FC_ANNOTATED_COMPONENT,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('TooltipProvider');
      expect(result.items[0]!.source.type).toBe('react');
    });
  });

  describe('memo wrapped components', () => {
    it('detects memo(forwardRef(...)) pattern', async () => {
      vol.fromJSON({
        '/project/src/MemoizedButton.tsx': MEMO_FORWARD_REF_COMPONENT,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('MemoizedButton');
      expect(result.items[0]!.source.type).toBe('react');
    });
  });

  describe('forwardRef with named function expression', () => {
    it('detects forwardRef(function ComponentName(...))', async () => {
      vol.fromJSON({
        '/project/src/Button.tsx': FORWARD_REF_NAMED_FUNCTION,
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
  });

  describe('function declaration components', () => {
    it('detects function Button({...}) declarations with JSX', async () => {
      vol.fromJSON({
        '/project/src/button.tsx': FUNCTION_DECLARATION_WITH_JSX,
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
  });

  describe('mixed pattern detection', () => {
    it('detects multiple component patterns in same file', async () => {
      vol.fromJSON({
        '/project/src/components.tsx': MULTI_PATTERN_FILE,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();
      const componentNames = result.items.map(c => c.name);

      // Should detect all four components
      expect(componentNames).toContain('Container'); // React.FC
      expect(componentNames).toContain('Wrapper');   // Arrow function
      expect(componentNames).toContain('Card');      // memo(forwardRef)
      expect(componentNames).toContain('Footer');    // Function declaration
    });
  });

  describe('Chakra v3 withContext/withProvider with string element', () => {
    it('detects withContext<Type>("element") pattern', async () => {
      vol.fromJSON({
        '/project/src/Kbd.tsx': CHAKRA_V3_WITH_CONTEXT_STRING_ELEMENT,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Kbd');
      expect(result.items[0]!.source.type).toBe('react');
    });
  });

  describe('Ark UI wrapped component patterns', () => {
    it('detects withProvider/withContext wrapping external components', async () => {
      vol.fromJSON({
        '/project/src/Accordion.tsx': ARK_UI_WRAPPED_COMPONENT_PATTERN,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();
      const componentNames = result.items.map(c => c.name);

      // Should detect all components
      expect(componentNames).toContain('AccordionRoot');
      expect(componentNames).toContain('AccordionItem');
      expect(componentNames).toContain('AccordionItemBody');
    });
  });

  describe('Radix named alias exports', () => {
    it('detects components and their named aliases', async () => {
      vol.fromJSON({
        '/project/src/Tooltip.tsx': RADIX_NAMED_ALIAS_EXPORTS,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();
      const componentNames = result.items.map(c => c.name);

      // Should detect original components
      expect(componentNames).toContain('TooltipProvider');
      expect(componentNames).toContain('Tooltip');
      expect(componentNames).toContain('TooltipTrigger');
      expect(componentNames).toContain('TooltipContent');

      // Aliases should NOT be detected as separate components (they're references to existing ones)
      // We only want the 4 original components, not the 4 aliases
      expect(result.items).toHaveLength(4);
    });
  });

  describe('chakra.element JSX style', () => {
    it('detects components using chakra.button style JSX', async () => {
      vol.fromJSON({
        '/project/src/Button.tsx': CHAKRA_ELEMENT_STYLE,
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
  });

  describe('complex nested HOC patterns', () => {
    it('detects memo(forwardRef(...)) as type assertion pattern', async () => {
      vol.fromJSON({
        '/project/src/Button.tsx': NESTED_HOC_PATTERN,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();
      const componentNames = result.items.map(c => c.name);

      // Should detect ComplexButton (memo + forwardRef + as assertion)
      expect(componentNames).toContain('ComplexButton');
      // TrackedCard uses a custom HOC which may or may not be detected depending on analysis depth
    });
  });

  describe('React.lazy component detection', () => {
    it('detects React.lazy() wrapped components for code splitting', async () => {
      vol.fromJSON({
        '/project/src/Lazy.tsx': REACT_LAZY_COMPONENT,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();
      const componentNames = result.items.map(c => c.name);

      // Should detect lazy-loaded components
      expect(componentNames).toContain('LazyButton');
      expect(componentNames).toContain('LazyCard');
      expect(componentNames).toContain('LazyModal');
    });
  });

  describe('inner component false positive prevention', () => {
    it('does not detect components defined inside factory functions', async () => {
      vol.fromJSON({
        '/project/src/Factory.tsx': FACTORY_WITH_INNER_COMPONENTS,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();
      const componentNames = result.items.map(c => c.name);

      // Should ONLY detect the top-level exported Button component
      expect(componentNames).toContain('Button');

      // Should NOT detect inner components defined inside createRecipeContext, withProvider, or withContext
      expect(componentNames).not.toContain('StyledComponent');
      expect(componentNames).not.toContain('ProviderComponent');
      expect(componentNames).not.toContain('ContextComponent');

      // Should only have 1 component
      expect(result.items).toHaveLength(1);
    });
  });

  describe('Chakra v3 withRootProvider pattern', () => {
    it('detects withRootProvider wrapping Ark UI components', async () => {
      vol.fromJSON({
        '/project/src/Drawer.tsx': CHAKRA_WITH_ROOT_PROVIDER,
      });

      const scanner = new ReactComponentScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
      });

      const result = await scanner.scan();
      const componentNames = result.items.map(c => c.name);

      // Should detect all withRootProvider and withContext components
      expect(componentNames).toContain('DrawerRootProvider');
      expect(componentNames).toContain('DrawerRoot');
      expect(componentNames).toContain('DrawerTrigger');
      expect(result.items).toHaveLength(3);
    });
  });
});
