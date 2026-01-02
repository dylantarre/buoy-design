// packages/scanners/src/storybook/extractor.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { vol } from 'memfs';
import {
  CSF3_BUTTON_STORY,
  CSF2_CARD_STORY,
  STORY_WITH_PLAY,
  STORY_WITH_DECORATORS,
  NESTED_TITLE_STORY,
  JS_STORY_FILE,
  STORY_WITH_RENDER,
  STORY_WITH_TAGS,
  STORYBOOK_INDEX_JSON,
  STORYBOOK_STORIES_JSON,
  STORYBOOK_MAIN_CONFIG,
  CSF3_AUTO_TITLE_STORY,
  STORY_WITH_SUBCOMPONENTS,
  STORY_WITH_DOCS_PARAMS,
  STORY_WITH_LOADERS,
  STORY_WITH_BEFORE_EACH,
  STORYBOOK_INDEX_JSON_V5,
  CSF1_ARROW_FUNCTION_STORY,
  STORY_WITH_STORYNAME,
  STORY_WITH_REEXPORTS,
  STORY_WITH_MIXED_PATTERNS,
  STORY_WITH_GLOBALS,
  CSF4_PREVIEW_STORY,
  CSF4_AUTO_TITLE,
  CSF4_STORYBOOK_IMPORT,
} from '../__tests__/fixtures/storybook-stories.js';
import { StorybookScanner, StoryFileScanner } from './extractor.js';

// fs/promises and glob are already mocked in setup.ts

describe('StorybookScanner', () => {
  beforeEach(() => {
    vol.reset();
  });

  describe('static directory scanning (index.json)', () => {
    it('parses index.json from static directory', async () => {
      vol.fromJSON({
        '/storybook-static/index.json': STORYBOOK_INDEX_JSON,
      });

      const scanner = new StorybookScanner({
        projectRoot: '/project',
        staticDir: '/storybook-static',
      });

      const result = await scanner.scan();

      expect(result.errors).toHaveLength(0);
      expect(result.items.length).toBeGreaterThan(0);

      // Should extract component from Button stories
      const buttonComponent = result.items.find(c => c.name === 'Button');
      expect(buttonComponent).toBeDefined();
      expect(buttonComponent?.source.type).toBe('storybook');
    });

    it('parses legacy stories.json format', async () => {
      vol.fromJSON({
        '/storybook-static/stories.json': STORYBOOK_STORIES_JSON,
      });

      const scanner = new StorybookScanner({
        projectRoot: '/project',
        staticDir: '/storybook-static',
      });

      const result = await scanner.scan();

      expect(result.errors).toHaveLength(0);
      expect(result.items.length).toBeGreaterThan(0);
    });

    it('extracts variants from story entries', async () => {
      vol.fromJSON({
        '/storybook-static/index.json': STORYBOOK_INDEX_JSON,
      });

      const scanner = new StorybookScanner({
        projectRoot: '/project',
        staticDir: '/storybook-static',
      });

      const result = await scanner.scan();

      const buttonComponent = result.items.find(c => c.name === 'Button');
      expect(buttonComponent?.variants).toContainEqual(
        expect.objectContaining({ name: 'Primary' })
      );
      expect(buttonComponent?.variants).toContainEqual(
        expect.objectContaining({ name: 'Secondary' })
      );
    });
  });
});

describe('StoryFileScanner', () => {
  beforeEach(() => {
    vol.reset();
  });

  describe('CSF3 story detection', () => {
    it('detects CSF3 stories with meta object', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': CSF3_BUTTON_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      expect(result.errors).toHaveLength(0);
      expect(result.items.length).toBeGreaterThan(0);

      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories).toBeDefined();
      expect(buttonStories?.source.type).toBe('storybook');
    });

    it('extracts title from meta as tag', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': CSF3_BUTTON_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories?.metadata?.tags).toContain('storybook-title:Components/Button');
    });

    it('extracts story variants', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': CSF3_BUTTON_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories?.variants).toHaveLength(3);
      expect(buttonStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Primary' })
      );
      expect(buttonStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Secondary' })
      );
      expect(buttonStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Large' })
      );
    });

    it('extracts argTypes as props', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': CSF3_BUTTON_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories?.props).toContainEqual(
        expect.objectContaining({ name: 'variant' })
      );
      expect(buttonStories?.props).toContainEqual(
        expect.objectContaining({ name: 'size' })
      );
      expect(buttonStories?.props).toContainEqual(
        expect.objectContaining({ name: 'disabled' })
      );
    });

    it('extracts tags from meta', async () => {
      vol.fromJSON({
        '/project/src/Feature.stories.tsx': STORY_WITH_TAGS,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const featureStories = result.items.find(c => c.name === 'ExperimentalFeature');
      expect(featureStories?.metadata?.tags).toContain('experimental');
      expect(featureStories?.metadata?.tags).toContain('beta');
    });
  });

  describe('CSF2 story detection', () => {
    it('detects CSF2 stories with default export', async () => {
      vol.fromJSON({
        '/project/src/Card.stories.tsx': CSF2_CARD_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      expect(result.errors).toHaveLength(0);
      const cardStories = result.items.find(c => c.name === 'Card');
      expect(cardStories).toBeDefined();
    });

    it('extracts CSF2 story variants from Template.bind()', async () => {
      vol.fromJSON({
        '/project/src/Card.stories.tsx': CSF2_CARD_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const cardStories = result.items.find(c => c.name === 'Card');
      expect(cardStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Default' })
      );
      expect(cardStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Elevated' })
      );
    });
  });

  describe('story hierarchy', () => {
    it('parses nested title hierarchy as tags', async () => {
      vol.fromJSON({
        '/project/src/Tooltip.stories.tsx': NESTED_TITLE_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const tooltipStories = result.items.find(c => c.name === 'Tooltip');
      // Title is stored as a tag
      expect(tooltipStories?.metadata?.tags).toContain('storybook-title:Design System/Primitives/Tooltip');
      // Hierarchy levels are stored as tags
      expect(tooltipStories?.metadata?.tags).toContain('storybook-level-0:Design System');
      expect(tooltipStories?.metadata?.tags).toContain('storybook-level-1:Primitives');
      expect(tooltipStories?.metadata?.tags).toContain('storybook-level-2:Tooltip');
    });
  });

  describe('story metadata', () => {
    it('detects stories with play functions', async () => {
      vol.fromJSON({
        '/project/src/LoginForm.stories.tsx': STORY_WITH_PLAY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const loginStories = result.items.find(c => c.name === 'LoginForm');
      const filledFormVariant = loginStories?.variants.find(v => v.name === 'FilledForm');
      expect(filledFormVariant?.props?.hasPlayFunction).toBe(true);
    });

    it('detects stories with decorators as tag', async () => {
      vol.fromJSON({
        '/project/src/Modal.stories.tsx': STORY_WITH_DECORATORS,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const modalStories = result.items.find(c => c.name === 'Modal');
      expect(modalStories?.metadata?.tags).toContain('has-decorators');
    });

    it('detects stories with render functions', async () => {
      vol.fromJSON({
        '/project/src/Counter.stories.tsx': STORY_WITH_RENDER,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const counterStories = result.items.find(c => c.name === 'Counter');
      const controlledVariant = counterStories?.variants.find(v => v.name === 'Controlled');
      expect(controlledVariant?.props?.hasRenderFunction).toBe(true);
    });
  });

  describe('JavaScript story files', () => {
    it('parses JavaScript story files without types', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.js': JS_STORY_FILE,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.js'],
      });

      const result = await scanner.scan();

      expect(result.errors).toHaveLength(0);
      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories).toBeDefined();
      expect(buttonStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Primary' })
      );
    });
  });

  describe('main.ts config parsing', () => {
    it('extracts story patterns from main config', async () => {
      vol.fromJSON({
        '/project/.storybook/main.ts': STORYBOOK_MAIN_CONFIG,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
      });

      const patterns = await scanner.getStoryPatternsFromConfig();
      expect(patterns).toContain('../src/**/*.mdx');
      expect(patterns).toContain('../src/**/*.stories.@(js|jsx|mjs|ts|tsx)');
    });
  });

  describe('error handling', () => {
    it('handles invalid story files gracefully', async () => {
      vol.fromJSON({
        '/project/src/Broken.stories.tsx': 'export default { invalid syntax',
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      // Should still complete scan, but with no items from the broken file
      // (TypeScript parsing doesn't throw on syntax errors, it creates a partial AST)
      expect(result.items).toHaveLength(0);
    });
  });

  describe('component reference extraction', () => {
    it('extracts component reference from meta as tag', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': CSF3_BUTTON_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories?.metadata?.tags).toContain('storybook-component:Button');
    });
  });

  describe('auto-title detection', () => {
    it('infers title from file path when no title is specified', async () => {
      vol.fromJSON({
        '/project/src/components/Button.stories.tsx': CSF3_AUTO_TITLE_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      expect(result.errors).toHaveLength(0);
      expect(result.items.length).toBeGreaterThan(0);

      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories).toBeDefined();
      // Should infer title from file path: src/components/Button.stories.tsx -> components/Button
      expect(buttonStories?.metadata?.tags).toContain('storybook-title:components/Button');
    });

    it('uses component name as title when component is specified but no title', async () => {
      vol.fromJSON({
        '/project/src/ui/MyButton.stories.tsx': CSF3_AUTO_TITLE_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories).toBeDefined();
      // When component is specified but no title, should use component name with path
      expect(buttonStories?.metadata?.tags).toContain('storybook-title:ui/Button');
    });
  });

  describe('subcomponents extraction', () => {
    it('extracts subcomponents from meta', async () => {
      vol.fromJSON({
        '/project/src/List.stories.tsx': STORY_WITH_SUBCOMPONENTS,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const listStories = result.items.find(c => c.name === 'List');
      expect(listStories).toBeDefined();
      // Should have subcomponents as tags or in metadata
      expect(listStories?.metadata?.tags).toContain('storybook-subcomponent:ListItem');
      expect(listStories?.metadata?.tags).toContain('storybook-subcomponent:ListHeader');
    });

    it('includes subcomponents count in dependencies', async () => {
      vol.fromJSON({
        '/project/src/List.stories.tsx': STORY_WITH_SUBCOMPONENTS,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const listStories = result.items.find(c => c.name === 'List');
      // Subcomponents should be tracked as dependencies
      expect(listStories?.dependencies).toContain('ListItem');
      expect(listStories?.dependencies).toContain('ListHeader');
    });
  });

  describe('docs parameters extraction', () => {
    it('extracts component description from docs parameters', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': STORY_WITH_DOCS_PARAMS,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories).toBeDefined();
      expect(buttonStories?.metadata?.documentation).toContain(
        'A versatile button component for user interactions.'
      );
    });

    it('extracts story-level description from docs parameters', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': STORY_WITH_DOCS_PARAMS,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      const primaryVariant = buttonStories?.variants.find(v => v.name === 'Primary');
      // Story description should be available in variant props
      expect(primaryVariant?.props?.description).toBe(
        'The primary variant is used for main actions.'
      );
    });
  });

  describe('loaders detection', () => {
    it('detects stories with loaders as tag', async () => {
      vol.fromJSON({
        '/project/src/UserProfile.stories.tsx': STORY_WITH_LOADERS,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const userProfileStories = result.items.find(c => c.name === 'UserProfile');
      expect(userProfileStories).toBeDefined();
      expect(userProfileStories?.metadata?.tags).toContain('has-loaders');
    });
  });

  describe('beforeEach detection', () => {
    it('detects stories with beforeEach as tag', async () => {
      vol.fromJSON({
        '/project/src/Form.stories.tsx': STORY_WITH_BEFORE_EACH,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const formStories = result.items.find(c => c.name === 'Form');
      expect(formStories).toBeDefined();
      expect(formStories?.metadata?.tags).toContain('has-beforeEach');
    });

    it('detects story-level beforeEach', async () => {
      vol.fromJSON({
        '/project/src/Form.stories.tsx': STORY_WITH_BEFORE_EACH,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const formStories = result.items.find(c => c.name === 'Form');
      const prefilledVariant = formStories?.variants.find(v => v.name === 'Prefilled');
      expect(prefilledVariant?.props?.hasBeforeEach).toBe(true);
    });
  });

  describe('index.json v5 parsing', () => {
    it('extracts componentPath from v5 entries', async () => {
      vol.fromJSON({
        '/storybook-static/index.json': STORYBOOK_INDEX_JSON_V5,
      });

      const scanner = new StorybookScanner({
        projectRoot: '/project',
        staticDir: '/storybook-static',
      });

      const result = await scanner.scan();

      const buttonComponent = result.items.find(c => c.name === 'Button');
      expect(buttonComponent).toBeDefined();
      // v5 includes componentPath which should be extracted
      expect(buttonComponent?.metadata?.tags).toContain(
        'storybook-componentPath:./src/components/Button.tsx'
      );
    });
  });

  describe('CSF1 arrow function story detection', () => {
    it('detects arrow function stories as variants', async () => {
      vol.fromJSON({
        '/project/src/Alert.stories.tsx': CSF1_ARROW_FUNCTION_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      expect(result.errors).toHaveLength(0);
      const alertStories = result.items.find(c => c.name === 'Alert');
      expect(alertStories).toBeDefined();
      // Arrow function stories should be detected as variants
      expect(alertStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Success' })
      );
      expect(alertStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Warning' })
      );
      expect(alertStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Error' })
      );
    });
  });

  describe('storyName override detection', () => {
    it('extracts storyName overrides from CSF2 patterns', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': STORY_WITH_STORYNAME,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories).toBeDefined();
      // Should use the storyName override as the variant name
      expect(buttonStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Default' })
      );
      expect(buttonStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Interactive' })
      );
    });

    it('detects play function assigned after declaration', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': STORY_WITH_STORYNAME,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      const interactiveVariant = buttonStories?.variants.find(v => v.name === 'Interactive');
      expect(interactiveVariant?.props?.hasPlayFunction).toBe(true);
    });
  });

  describe('re-export story detection', () => {
    it('detects re-exported stories as variants', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': STORY_WITH_REEXPORTS,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      expect(result.errors).toHaveLength(0);
      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories).toBeDefined();
      // Re-exported stories should be detected as variants
      expect(buttonStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Basic' })
      );
      expect(buttonStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Icon' })
      );
      expect(buttonStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Loading' })
      );
    });
  });

  describe('mixed CSF patterns detection', () => {
    it('detects all story types in mixed pattern files', async () => {
      vol.fromJSON({
        '/project/src/Input.stories.tsx': STORY_WITH_MIXED_PATTERNS,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const inputStories = result.items.find(c => c.name === 'Input');
      expect(inputStories).toBeDefined();
      // Should detect all three types: CSF3 object, CSF2 bind, and CSF1 arrow
      expect(inputStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Default' })
      );
      expect(inputStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'WithLabel' })
      );
      expect(inputStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Disabled' })
      );
    });
  });

  describe('globals access detection', () => {
    it('detects stories with globals access', async () => {
      vol.fromJSON({
        '/project/src/LocaleDisplay.stories.tsx': STORY_WITH_GLOBALS,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const localeStories = result.items.find(c => c.name === 'LocaleDisplay');
      expect(localeStories).toBeDefined();
      // Stories accessing globals should be detected
      expect(localeStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Locale Aware' })
      );
      expect(localeStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'WithTheme' })
      );
    });
  });

  describe('CSF4 story format detection', () => {
    it('detects CSF4 stories with preview.meta().story() pattern', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': CSF4_PREVIEW_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      expect(result.errors).toHaveLength(0);
      expect(result.items.length).toBeGreaterThan(0);

      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories).toBeDefined();
      expect(buttonStories?.source.type).toBe('storybook');
    });

    it('extracts CSF4 title from meta', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': CSF4_PREVIEW_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories?.metadata?.tags).toContain('storybook-title:Example/CSF4/Button');
    });

    it('extracts CSF4 story variants from meta.story() calls', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': CSF4_PREVIEW_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      expect(buttonStories?.variants).toHaveLength(4);
      expect(buttonStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Primary' })
      );
      expect(buttonStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'Secondary' })
      );
      expect(buttonStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'WithRender' })
      );
      expect(buttonStories?.variants).toContainEqual(
        expect.objectContaining({ name: 'WithPlay' })
      );
    });

    it('detects CSF4 stories with render functions', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': CSF4_PREVIEW_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      const withRenderVariant = buttonStories?.variants.find(v => v.name === 'WithRender');
      expect(withRenderVariant?.props?.hasRenderFunction).toBe(true);
    });

    it('detects CSF4 stories with play functions', async () => {
      vol.fromJSON({
        '/project/src/Button.stories.tsx': CSF4_PREVIEW_STORY,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const buttonStories = result.items.find(c => c.name === 'Button');
      const withPlayVariant = buttonStories?.variants.find(v => v.name === 'WithPlay');
      expect(withPlayVariant?.props?.hasPlayFunction).toBe(true);
    });

    it('infers CSF4 title from file path when no title specified', async () => {
      vol.fromJSON({
        '/project/src/components/Input.stories.tsx': CSF4_AUTO_TITLE,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThan(0);
      const inputStories = result.items.find(c => c.name === 'Input');
      expect(inputStories).toBeDefined();
      // Should infer title from file path
      expect(inputStories?.metadata?.tags).toContain('storybook-title:components/Input');
    });

    it('extracts CSF4 argTypes as props', async () => {
      vol.fromJSON({
        '/project/src/components/Input.stories.tsx': CSF4_AUTO_TITLE,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      const inputStories = result.items.find(c => c.name === 'Input');
      expect(inputStories?.props).toContainEqual(
        expect.objectContaining({ name: 'size' })
      );
    });

    it('detects CSF4 with definePreview import from storybook package', async () => {
      vol.fromJSON({
        '/project/src/Card.stories.tsx': CSF4_STORYBOOK_IMPORT,
      });

      const scanner = new StoryFileScanner({
        projectRoot: '/project',
        include: ['src/**/*.stories.tsx'],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThan(0);
      const cardStories = result.items.find(c => c.name === 'Card');
      expect(cardStories).toBeDefined();
      expect(cardStories?.metadata?.tags).toContain('storybook-title:Components/Card');
      expect(cardStories?.metadata?.tags).toContain('autodocs');
    });
  });
});
