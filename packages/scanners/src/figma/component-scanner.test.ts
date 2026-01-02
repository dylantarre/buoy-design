import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FigmaComponentScanner, FigmaScannerConfig } from './component-scanner.js';
import { FigmaClient, FigmaFile, FigmaNode } from './client.js';

// Mock the FigmaClient
vi.mock('./client.js', async () => {
  const actual = await vi.importActual('./client.js');
  return {
    ...actual,
    FigmaClient: vi.fn(),
  };
});

describe('FigmaComponentScanner', () => {
  let mockClient: { getFile: ReturnType<typeof vi.fn>; getFigmaUrl: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      getFile: vi.fn(),
      getFigmaUrl: vi.fn((fileKey: string, nodeId: string) =>
        `https://www.figma.com/file/${fileKey}?node-id=${nodeId}`
      ),
    };
    (FigmaClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockClient);
  });

  const createScanner = (config: Partial<FigmaScannerConfig> = {}): FigmaComponentScanner => {
    return new FigmaComponentScanner({
      accessToken: 'test-token',
      fileKeys: ['test-file-key'],
      ...config,
    });
  };

  const createFigmaFile = (children: FigmaNode[]): FigmaFile => ({
    name: 'Test File',
    document: {
      id: '0:0',
      name: 'Document',
      type: 'DOCUMENT',
      children: [
        {
          id: '1:1',
          name: 'Components',
          type: 'CANVAS',
          children,
        },
      ],
    },
    components: {},
    styles: {},
  });

  describe('basic component detection', () => {
    it('detects COMPONENT nodes', async () => {
      const file = createFigmaFile([
        {
          id: '2:1',
          name: 'Button',
          type: 'COMPONENT',
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Button');
      expect(result.items[0]!.source.type).toBe('figma');
    });

    it('detects COMPONENT_SET nodes', async () => {
      const file = createFigmaFile([
        {
          id: '3:1',
          name: 'Button',
          type: 'COMPONENT_SET',
          children: [
            {
              id: '3:2',
              name: 'State=Default',
              type: 'COMPONENT',
            },
            {
              id: '3:3',
              name: 'State=Hover',
              type: 'COMPONENT',
            },
          ],
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      // Should detect the COMPONENT_SET as a component
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      const buttonSet = result.items.find(c => c.name === 'Button' && c.metadata.tags?.includes('component-set'));
      expect(buttonSet).toBeDefined();
    });
  });

  describe('variant detection', () => {
    it('extracts variants from COMPONENT_SET children by parsing variant names', async () => {
      const file = createFigmaFile([
        {
          id: '4:1',
          name: 'Button',
          type: 'COMPONENT_SET',
          children: [
            {
              id: '4:2',
              name: 'Size=Small, State=Default',
              type: 'COMPONENT',
            },
            {
              id: '4:3',
              name: 'Size=Large, State=Default',
              type: 'COMPONENT',
            },
            {
              id: '4:4',
              name: 'Size=Small, State=Hover',
              type: 'COMPONENT',
            },
            {
              id: '4:5',
              name: 'Size=Large, State=Hover',
              type: 'COMPONENT',
            },
          ],
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const buttonSet = result.items.find(c => c.name === 'Button');
      expect(buttonSet).toBeDefined();
      expect(buttonSet!.variants.length).toBe(4);

      // Check that variants have correct props extracted
      const smallDefault = buttonSet!.variants.find(v => v.name === 'Size=Small, State=Default');
      expect(smallDefault).toBeDefined();
      expect(smallDefault!.props).toEqual({ Size: 'Small', State: 'Default' });
    });

    it('extracts variants from componentPropertyDefinitions with VARIANT type', async () => {
      const file = createFigmaFile([
        {
          id: '5:1',
          name: 'Button',
          type: 'COMPONENT_SET',
          componentPropertyDefinitions: {
            'Size': {
              type: 'VARIANT',
              defaultValue: 'Medium',
              variantOptions: ['Small', 'Medium', 'Large'],
            },
            'State': {
              type: 'VARIANT',
              defaultValue: 'Default',
              variantOptions: ['Default', 'Hover', 'Pressed', 'Disabled'],
            },
          },
          children: [],
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button');
      expect(button).toBeDefined();

      // Should have variants for each option
      const sizeVariants = button!.variants.filter(v => v.name.startsWith('Size='));
      expect(sizeVariants.length).toBe(3);

      const stateVariants = button!.variants.filter(v => v.name.startsWith('State='));
      expect(stateVariants.length).toBe(4);
    });
  });

  describe('property detection', () => {
    it('extracts TEXT properties', async () => {
      const file = createFigmaFile([
        {
          id: '6:1',
          name: 'Button',
          type: 'COMPONENT',
          componentPropertyDefinitions: {
            'Label': {
              type: 'TEXT',
              defaultValue: 'Click me',
            },
          },
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button');
      expect(button).toBeDefined();
      expect(button!.props).toContainEqual(
        expect.objectContaining({
          name: 'Label',
          type: 'string',
          defaultValue: 'Click me',
        })
      );
    });

    it('extracts BOOLEAN properties', async () => {
      const file = createFigmaFile([
        {
          id: '7:1',
          name: 'Button',
          type: 'COMPONENT',
          componentPropertyDefinitions: {
            'Show Icon': {
              type: 'BOOLEAN',
              defaultValue: true,
            },
          },
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button');
      expect(button).toBeDefined();
      expect(button!.props).toContainEqual(
        expect.objectContaining({
          name: 'Show Icon',
          type: 'boolean',
          defaultValue: true,
        })
      );
    });

    it('extracts INSTANCE_SWAP properties', async () => {
      const file = createFigmaFile([
        {
          id: '8:1',
          name: 'Button',
          type: 'COMPONENT',
          componentPropertyDefinitions: {
            'Icon': {
              type: 'INSTANCE_SWAP',
              defaultValue: 'some-icon-id',
            },
          },
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button');
      expect(button).toBeDefined();
      expect(button!.props).toContainEqual(
        expect.objectContaining({
          name: 'Icon',
          type: 'ReactNode',
        })
      );
    });
  });

  describe('naming convention handling', () => {
    it('cleans component names with slash prefixes', async () => {
      const file = createFigmaFile([
        {
          id: '9:1',
          name: 'Components / Buttons / Primary Button',
          type: 'COMPONENT',
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      expect(result.items[0]!.name).toBe('Primary Button');
    });

    it('cleans component names with variant suffixes', async () => {
      const file = createFigmaFile([
        {
          id: '10:1',
          name: 'Button, State=Default, Size=Medium',
          type: 'COMPONENT',
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      expect(result.items[0]!.name).toBe('Button');
    });

    it('detects naming inconsistencies in component hierarchy', async () => {
      const file = createFigmaFile([
        {
          id: '11:1',
          name: 'Button',
          type: 'COMPONENT_SET',
          children: [
            {
              id: '11:2',
              name: 'size=small, state=default', // lowercase
              type: 'COMPONENT',
            },
            {
              id: '11:3',
              name: 'Size=Large, State=Default', // PascalCase
              type: 'COMPONENT',
            },
          ],
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button');
      expect(button).toBeDefined();

      // Should detect and flag naming inconsistencies
      expect(button!.metadata.tags).toContain('naming-inconsistency');
    });
  });

  describe('component hierarchy', () => {
    it('detects deeply nested components', async () => {
      const file = createFigmaFile([
        {
          id: '12:1',
          name: 'Frame',
          type: 'FRAME',
          children: [
            {
              id: '12:2',
              name: 'Group',
              type: 'GROUP',
              children: [
                {
                  id: '12:3',
                  name: 'DeepButton',
                  type: 'COMPONENT',
                },
              ],
            },
          ],
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('DeepButton');
    });

    it('searches all pages when componentPageName is not found', async () => {
      const file: FigmaFile = {
        name: 'Test File',
        document: {
          id: '0:0',
          name: 'Document',
          type: 'DOCUMENT',
          children: [
            {
              id: '1:1',
              name: 'Design Page',
              type: 'CANVAS',
              children: [
                {
                  id: '1:2',
                  name: 'OtherButton',
                  type: 'COMPONENT',
                },
              ],
            },
            {
              id: '2:1',
              name: 'Library',
              type: 'CANVAS',
              children: [
                {
                  id: '2:2',
                  name: 'LibraryButton',
                  type: 'COMPONENT',
                },
              ],
            },
          ],
        },
        components: {},
        styles: {},
      };
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      expect(result.items).toHaveLength(2);
      const names = result.items.map(c => c.name);
      expect(names).toContain('OtherButton');
      expect(names).toContain('LibraryButton');
    });
  });

  describe('component metadata enrichment', () => {
    it('extracts component description from file metadata', async () => {
      const file: FigmaFile = {
        name: 'Test File',
        document: {
          id: '0:0',
          name: 'Document',
          type: 'DOCUMENT',
          children: [
            {
              id: '1:1',
              name: 'Components',
              type: 'CANVAS',
              children: [
                {
                  id: '2:1',
                  name: 'Button',
                  type: 'COMPONENT',
                  componentId: 'btn-component-key',
                },
              ],
            },
          ],
        },
        components: {
          '2:1': {
            key: 'btn-component-key',
            name: 'Button',
            description: 'A primary button component for user actions',
            documentationLinks: [], // No links, just description
          },
        },
        styles: {},
      };
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button');
      expect(button).toBeDefined();
      expect(button!.metadata.documentation).toBe('A primary button component for user actions');
    });

    it('detects component-set tag for COMPONENT_SET types', async () => {
      const file = createFigmaFile([
        {
          id: '14:1',
          name: 'Button',
          type: 'COMPONENT_SET',
          children: [],
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      expect(result.items[0]!.metadata.tags).toContain('component-set');
    });
  });

  describe('variant property deduplication', () => {
    it('deduplicates variant properties extracted from different sources', async () => {
      const file = createFigmaFile([
        {
          id: '15:1',
          name: 'Button',
          type: 'COMPONENT_SET',
          componentPropertyDefinitions: {
            'Size': {
              type: 'VARIANT',
              defaultValue: 'Medium',
              variantOptions: ['Small', 'Medium', 'Large'],
            },
          },
          children: [
            {
              id: '15:2',
              name: 'Size=Small',
              type: 'COMPONENT',
            },
            {
              id: '15:3',
              name: 'Size=Medium',
              type: 'COMPONENT',
            },
            {
              id: '15:4',
              name: 'Size=Large',
              type: 'COMPONENT',
            },
          ],
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button');
      expect(button).toBeDefined();

      // Should deduplicate variants - only 3 unique size variants
      const sizeVariants = button!.variants.filter(v => v.name.includes('Size='));
      expect(sizeVariants.length).toBe(3);
    });
  });

  describe('error handling', () => {
    it('handles API errors gracefully', async () => {
      mockClient.getFile.mockRejectedValue(new Error('API rate limit exceeded'));

      const scanner = createScanner();
      const result = await scanner.scan();

      expect(result.items).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.code).toBe('FIGMA_API_ERROR');
      expect(result.errors[0]!.message).toContain('API rate limit exceeded');
    });

    it('continues scanning other files when one fails', async () => {
      mockClient.getFile
        .mockRejectedValueOnce(new Error('File not found'))
        .mockResolvedValueOnce(createFigmaFile([
          {
            id: '16:1',
            name: 'Button',
            type: 'COMPONENT',
          },
        ]));

      const scanner = createScanner({ fileKeys: ['bad-file', 'good-file'] });
      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.stats.filesScanned).toBe(1);
    });
  });

  describe('multiple component property types', () => {
    it('handles components with mixed property types', async () => {
      const file = createFigmaFile([
        {
          id: '17:1',
          name: 'IconButton',
          type: 'COMPONENT',
          componentPropertyDefinitions: {
            'Label': {
              type: 'TEXT',
              defaultValue: 'Click',
            },
            'Show Label': {
              type: 'BOOLEAN',
              defaultValue: true,
            },
            'Icon': {
              type: 'INSTANCE_SWAP',
              defaultValue: 'default-icon-id',
            },
            'Size': {
              type: 'VARIANT',
              defaultValue: 'Medium',
              variantOptions: ['Small', 'Medium', 'Large'],
            },
          },
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const iconButton = result.items.find(c => c.name === 'IconButton');
      expect(iconButton).toBeDefined();

      // Should have 3 props (TEXT, BOOLEAN, INSTANCE_SWAP) - VARIANT goes to variants
      expect(iconButton!.props).toHaveLength(3);

      // Should have 3 variants (Size options)
      expect(iconButton!.variants).toHaveLength(3);
    });
  });

  describe('variant value inconsistency detection', () => {
    it('detects inconsistent variant value formats (short vs full names)', async () => {
      const file = createFigmaFile([
        {
          id: '18:1',
          name: 'Button',
          type: 'COMPONENT_SET',
          componentPropertyDefinitions: {
            'Size': {
              type: 'VARIANT',
              defaultValue: 'md',
              variantOptions: ['sm', 'md', 'lg'], // short format
            },
            'State': {
              type: 'VARIANT',
              defaultValue: 'Default',
              variantOptions: ['Default', 'Hover', 'Pressed'], // full names
            },
          },
          children: [],
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button');
      expect(button).toBeDefined();
      // Should detect value format inconsistency
      expect(button!.metadata.tags).toContain('variant-value-inconsistency');
    });

    it('does not flag consistent short format variant values', async () => {
      const file = createFigmaFile([
        {
          id: '19:1',
          name: 'Button',
          type: 'COMPONENT_SET',
          componentPropertyDefinitions: {
            'Size': {
              type: 'VARIANT',
              defaultValue: 'md',
              variantOptions: ['sm', 'md', 'lg'],
            },
            'Weight': {
              type: 'VARIANT',
              defaultValue: 'reg',
              variantOptions: ['lt', 'reg', 'bd'],
            },
          },
          children: [],
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button');
      expect(button).toBeDefined();
      expect(button!.metadata.tags).not.toContain('variant-value-inconsistency');
    });
  });

  describe('documentation links extraction', () => {
    it('includes documentation links in the component documentation field', async () => {
      const file: FigmaFile = {
        name: 'Test File',
        document: {
          id: '0:0',
          name: 'Document',
          type: 'DOCUMENT',
          children: [
            {
              id: '1:1',
              name: 'Components',
              type: 'CANVAS',
              children: [
                {
                  id: '20:1',
                  name: 'Button',
                  type: 'COMPONENT',
                },
              ],
            },
          ],
        },
        components: {
          '20:1': {
            key: 'btn-key-123',
            name: 'Button',
            description: 'Primary button component',
            documentationLinks: [
              'https://docs.example.com/button',
              'https://storybook.example.com/button',
            ],
          },
        },
        styles: {},
      };
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button');
      expect(button).toBeDefined();
      // Documentation should include the description and links
      expect(button!.metadata.documentation).toContain('Primary button component');
      expect(button!.metadata.documentation).toContain('https://docs.example.com/button');
    });
  });

  describe('component key tagging', () => {
    it('adds component-key tag with key value for version tracking', async () => {
      const file: FigmaFile = {
        name: 'Test File',
        document: {
          id: '0:0',
          name: 'Document',
          type: 'DOCUMENT',
          children: [
            {
              id: '1:1',
              name: 'Components',
              type: 'CANVAS',
              children: [
                {
                  id: '21:1',
                  name: 'Button',
                  type: 'COMPONENT',
                },
              ],
            },
          ],
        },
        components: {
          '21:1': {
            key: 'abc123def456',
            name: 'Button',
            description: 'Button component',
            documentationLinks: [],
          },
        },
        styles: {},
      };
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button');
      expect(button).toBeDefined();
      // Component key should be stored as a tag for version tracking
      expect(button!.metadata.tags).toContainEqual(expect.stringMatching(/^component-key:abc123def456$/));
    });
  });

  describe('variant property naming convention detection', () => {
    it('detects mixed naming conventions in variant property names', async () => {
      const file = createFigmaFile([
        {
          id: '22:1',
          name: 'Button',
          type: 'COMPONENT_SET',
          componentPropertyDefinitions: {
            'Size': {  // PascalCase
              type: 'VARIANT',
              defaultValue: 'Medium',
              variantOptions: ['Small', 'Medium', 'Large'],
            },
            'buttonState': {  // camelCase
              type: 'VARIANT',
              defaultValue: 'default',
              variantOptions: ['default', 'hover', 'pressed'],
            },
            'icon-position': {  // kebab-case
              type: 'VARIANT',
              defaultValue: 'left',
              variantOptions: ['left', 'right'],
            },
          },
          children: [],
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button');
      expect(button).toBeDefined();
      // Should detect mixed naming conventions
      expect(button!.metadata.tags).toContain('mixed-naming-convention');
    });

    it('does not flag consistent PascalCase naming', async () => {
      const file = createFigmaFile([
        {
          id: '23:1',
          name: 'Button',
          type: 'COMPONENT_SET',
          componentPropertyDefinitions: {
            'Size': {
              type: 'VARIANT',
              defaultValue: 'Medium',
              variantOptions: ['Small', 'Medium', 'Large'],
            },
            'State': {
              type: 'VARIANT',
              defaultValue: 'Default',
              variantOptions: ['Default', 'Hover', 'Pressed'],
            },
            'IconPosition': {
              type: 'VARIANT',
              defaultValue: 'Left',
              variantOptions: ['Left', 'Right'],
            },
          },
          children: [],
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button');
      expect(button).toBeDefined();
      expect(button!.metadata.tags).not.toContain('mixed-naming-convention');
    });
  });

  describe('component hierarchy path tracking', () => {
    it('adds hierarchy path as a tag for organization tracking', async () => {
      const file = createFigmaFile([
        {
          id: '24:1',
          name: 'Forms',
          type: 'FRAME',
          children: [
            {
              id: '24:2',
              name: 'Inputs',
              type: 'FRAME',
              children: [
                {
                  id: '24:3',
                  name: 'TextField',
                  type: 'COMPONENT',
                },
              ],
            },
          ],
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const textField = result.items.find(c => c.name === 'TextField');
      expect(textField).toBeDefined();
      // Hierarchy path should be stored as a tag
      expect(textField!.metadata.tags).toContainEqual(expect.stringMatching(/^hierarchy:Forms\/Inputs\/TextField$/));
    });
  });

  describe('empty component set detection', () => {
    it('flags component sets with no variant children', async () => {
      const file = createFigmaFile([
        {
          id: '25:1',
          name: 'EmptyButton',
          type: 'COMPONENT_SET',
          children: [], // No children - unusual for a COMPONENT_SET
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'EmptyButton');
      expect(button).toBeDefined();
      expect(button!.metadata.tags).toContain('empty-component-set');
    });
  });

  describe('default variant detection', () => {
    it('identifies the default variant based on componentPropertyDefinitions defaultValue', async () => {
      const file = createFigmaFile([
        {
          id: '26:1',
          name: 'Button',
          type: 'COMPONENT_SET',
          componentPropertyDefinitions: {
            'Size': {
              type: 'VARIANT',
              defaultValue: 'Medium',
              variantOptions: ['Small', 'Medium', 'Large'],
            },
            'State': {
              type: 'VARIANT',
              defaultValue: 'Default',
              variantOptions: ['Default', 'Hover', 'Pressed'],
            },
          },
          children: [
            { id: '26:2', name: 'Size=Small, State=Default', type: 'COMPONENT' },
            { id: '26:3', name: 'Size=Medium, State=Default', type: 'COMPONENT' },
            { id: '26:4', name: 'Size=Large, State=Default', type: 'COMPONENT' },
            { id: '26:5', name: 'Size=Small, State=Hover', type: 'COMPONENT' },
            { id: '26:6', name: 'Size=Medium, State=Hover', type: 'COMPONENT' },
            { id: '26:7', name: 'Size=Large, State=Hover', type: 'COMPONENT' },
            { id: '26:8', name: 'Size=Small, State=Pressed', type: 'COMPONENT' },
            { id: '26:9', name: 'Size=Medium, State=Pressed', type: 'COMPONENT' },
            { id: '26:10', name: 'Size=Large, State=Pressed', type: 'COMPONENT' },
          ],
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button' && c.metadata.tags?.includes('component-set'));
      expect(button).toBeDefined();
      // Should have a tag indicating the default variant
      expect(button!.metadata.tags).toContainEqual(expect.stringMatching(/^default-variant:/));
    });
  });

  describe('incomplete variant matrix detection', () => {
    it('flags component sets with missing variant combinations', async () => {
      const file = createFigmaFile([
        {
          id: '27:1',
          name: 'Button',
          type: 'COMPONENT_SET',
          componentPropertyDefinitions: {
            'Size': {
              type: 'VARIANT',
              defaultValue: 'Medium',
              variantOptions: ['Small', 'Medium', 'Large'], // 3 options
            },
            'State': {
              type: 'VARIANT',
              defaultValue: 'Default',
              variantOptions: ['Default', 'Hover', 'Pressed'], // 3 options = 9 total combinations
            },
          },
          children: [
            // Only 5 variants instead of 9
            { id: '27:2', name: 'Size=Small, State=Default', type: 'COMPONENT' },
            { id: '27:3', name: 'Size=Medium, State=Default', type: 'COMPONENT' },
            { id: '27:4', name: 'Size=Large, State=Default', type: 'COMPONENT' },
            { id: '27:5', name: 'Size=Small, State=Hover', type: 'COMPONENT' },
            { id: '27:6', name: 'Size=Medium, State=Hover', type: 'COMPONENT' },
            // Missing: Large+Hover, Small+Pressed, Medium+Pressed, Large+Pressed
          ],
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button' && c.metadata.tags?.includes('component-set'));
      expect(button).toBeDefined();
      // Should detect incomplete variant matrix
      expect(button!.metadata.tags).toContain('incomplete-variant-matrix');
    });

    it('does not flag component sets with complete variant matrix', async () => {
      const file = createFigmaFile([
        {
          id: '28:1',
          name: 'Button',
          type: 'COMPONENT_SET',
          componentPropertyDefinitions: {
            'Size': {
              type: 'VARIANT',
              defaultValue: 'Medium',
              variantOptions: ['Small', 'Large'], // 2 options
            },
            'State': {
              type: 'VARIANT',
              defaultValue: 'Default',
              variantOptions: ['Default', 'Hover'], // 2 options = 4 total
            },
          },
          children: [
            { id: '28:2', name: 'Size=Small, State=Default', type: 'COMPONENT' },
            { id: '28:3', name: 'Size=Large, State=Default', type: 'COMPONENT' },
            { id: '28:4', name: 'Size=Small, State=Hover', type: 'COMPONENT' },
            { id: '28:5', name: 'Size=Large, State=Hover', type: 'COMPONENT' },
          ],
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button' && c.metadata.tags?.includes('component-set'));
      expect(button).toBeDefined();
      expect(button!.metadata.tags).not.toContain('incomplete-variant-matrix');
    });
  });

  describe('NUMBER property type support', () => {
    it('extracts NUMBER properties with correct type mapping', async () => {
      const file = createFigmaFile([
        {
          id: '29:1',
          name: 'Slider',
          type: 'COMPONENT',
          componentPropertyDefinitions: {
            'Min Value': {
              type: 'NUMBER',
              defaultValue: 0,
            },
            'Max Value': {
              type: 'NUMBER',
              defaultValue: 100,
            },
            'Step': {
              type: 'NUMBER',
              defaultValue: 1,
            },
          },
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const slider = result.items.find(c => c.name === 'Slider');
      expect(slider).toBeDefined();
      expect(slider!.props).toContainEqual(
        expect.objectContaining({
          name: 'Min Value',
          type: 'number',
          defaultValue: 0,
        })
      );
      expect(slider!.props).toContainEqual(
        expect.objectContaining({
          name: 'Max Value',
          type: 'number',
          defaultValue: 100,
        })
      );
    });
  });

  describe('INSTANCE_SWAP preferred values', () => {
    it('extracts preferred values for INSTANCE_SWAP properties', async () => {
      const file = createFigmaFile([
        {
          id: '30:1',
          name: 'IconButton',
          type: 'COMPONENT',
          componentPropertyDefinitions: {
            'Icon': {
              type: 'INSTANCE_SWAP',
              defaultValue: 'icon-123',
              preferredValues: [
                { type: 'COMPONENT', key: 'icon-star' },
                { type: 'COMPONENT', key: 'icon-heart' },
                { type: 'COMPONENT', key: 'icon-settings' },
              ],
            },
          },
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const iconButton = result.items.find(c => c.name === 'IconButton');
      expect(iconButton).toBeDefined();
      // Should extract INSTANCE_SWAP with preferred values info
      const iconProp = iconButton!.props.find(p => p.name === 'Icon');
      expect(iconProp).toBeDefined();
      expect(iconProp!.type).toBe('ReactNode');
      // Preferred values should be captured in description or metadata
      expect(iconProp!.description).toContain('icon-star');
    });
  });

  describe('property description extraction', () => {
    it('extracts descriptions from componentPropertyDefinitions', async () => {
      const file = createFigmaFile([
        {
          id: '31:1',
          name: 'Button',
          type: 'COMPONENT',
          componentPropertyDefinitions: {
            'Label': {
              type: 'TEXT',
              defaultValue: 'Click me',
              description: 'The text displayed on the button',
            },
            'Disabled': {
              type: 'BOOLEAN',
              defaultValue: false,
              description: 'Whether the button is disabled and non-interactive',
            },
          },
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button');
      expect(button).toBeDefined();

      const labelProp = button!.props.find(p => p.name === 'Label');
      expect(labelProp).toBeDefined();
      expect(labelProp!.description).toBe('The text displayed on the button');

      const disabledProp = button!.props.find(p => p.name === 'Disabled');
      expect(disabledProp).toBeDefined();
      expect(disabledProp!.description).toBe('Whether the button is disabled and non-interactive');
    });
  });

  describe('published component detection', () => {
    it('detects components published to team library', async () => {
      const file: FigmaFile = {
        name: 'Test File',
        document: {
          id: '0:0',
          name: 'Document',
          type: 'DOCUMENT',
          children: [
            {
              id: '1:1',
              name: 'Components',
              type: 'CANVAS',
              children: [
                {
                  id: '32:1',
                  name: 'Button',
                  type: 'COMPONENT',
                },
              ],
            },
          ],
        },
        components: {
          '32:1': {
            key: 'published-btn-key',
            name: 'Button',
            description: 'A published button',
            documentationLinks: [],
            remote: true, // Indicates this is a published component
          },
        },
        styles: {},
      };
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button');
      expect(button).toBeDefined();
      expect(button!.metadata.tags).toContain('published');
    });

    it('does not flag local-only components as published', async () => {
      const file: FigmaFile = {
        name: 'Test File',
        document: {
          id: '0:0',
          name: 'Document',
          type: 'DOCUMENT',
          children: [
            {
              id: '1:1',
              name: 'Components',
              type: 'CANVAS',
              children: [
                {
                  id: '33:1',
                  name: 'LocalButton',
                  type: 'COMPONENT',
                },
              ],
            },
          ],
        },
        components: {
          '33:1': {
            key: 'local-btn-key',
            name: 'LocalButton',
            description: 'A local button',
            documentationLinks: [],
            // remote: false or not present
          },
        },
        styles: {},
      };
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'LocalButton');
      expect(button).toBeDefined();
      expect(button!.metadata.tags).not.toContain('published');
    });
  });

  describe('duplicate property name detection', () => {
    it('flags components with duplicate property names across different types', async () => {
      const file = createFigmaFile([
        {
          id: '34:1',
          name: 'BadButton',
          type: 'COMPONENT_SET',
          componentPropertyDefinitions: {
            'Size': {
              type: 'VARIANT',
              defaultValue: 'Medium',
              variantOptions: ['Small', 'Medium', 'Large'],
            },
            'size': { // Same name different case - potential issue
              type: 'TEXT',
              defaultValue: 'large',
            },
          },
          children: [],
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'BadButton');
      expect(button).toBeDefined();
      expect(button!.metadata.tags).toContain('duplicate-property-name');
    });
  });

  describe('variant property category extraction', () => {
    it('extracts variant property categories (dimensions) from componentPropertyDefinitions', async () => {
      const file = createFigmaFile([
        {
          id: '35:1',
          name: 'Button',
          type: 'COMPONENT_SET',
          componentPropertyDefinitions: {
            'Size': {
              type: 'VARIANT',
              defaultValue: 'Medium',
              variantOptions: ['Small', 'Medium', 'Large'],
            },
            'State': {
              type: 'VARIANT',
              defaultValue: 'Default',
              variantOptions: ['Default', 'Hover', 'Pressed', 'Disabled'],
            },
            'Type': {
              type: 'VARIANT',
              defaultValue: 'Primary',
              variantOptions: ['Primary', 'Secondary', 'Tertiary'],
            },
          },
          children: [],
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button');
      expect(button).toBeDefined();
      // Should have tags for each variant dimension/category
      expect(button!.metadata.tags).toContainEqual(expect.stringMatching(/^variant-dimension:Size\[3\]$/));
      expect(button!.metadata.tags).toContainEqual(expect.stringMatching(/^variant-dimension:State\[4\]$/));
      expect(button!.metadata.tags).toContainEqual(expect.stringMatching(/^variant-dimension:Type\[3\]$/));
    });
  });

  describe('single variant component set detection', () => {
    it('flags component sets with only one variant child', async () => {
      const file = createFigmaFile([
        {
          id: '36:1',
          name: 'SingleButton',
          type: 'COMPONENT_SET',
          componentPropertyDefinitions: {
            'State': {
              type: 'VARIANT',
              defaultValue: 'Default',
              variantOptions: ['Default'], // Only one option
            },
          },
          children: [
            { id: '36:2', name: 'State=Default', type: 'COMPONENT' },
          ],
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'SingleButton' && c.metadata.tags?.includes('component-set'));
      expect(button).toBeDefined();
      // A component set with only one variant should be flagged - probably should just be a COMPONENT
      expect(button!.metadata.tags).toContain('single-variant');
    });

    it('does not flag component sets with multiple variants', async () => {
      const file = createFigmaFile([
        {
          id: '37:1',
          name: 'Button',
          type: 'COMPONENT_SET',
          componentPropertyDefinitions: {
            'State': {
              type: 'VARIANT',
              defaultValue: 'Default',
              variantOptions: ['Default', 'Hover'],
            },
          },
          children: [
            { id: '37:2', name: 'State=Default', type: 'COMPONENT' },
            { id: '37:3', name: 'State=Hover', type: 'COMPONENT' },
          ],
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button' && c.metadata.tags?.includes('component-set'));
      expect(button).toBeDefined();
      expect(button!.metadata.tags).not.toContain('single-variant');
    });
  });

  describe('bound variables detection', () => {
    it('detects components with bound design token variables', async () => {
      const file = createFigmaFile([
        {
          id: '38:1',
          name: 'TokenButton',
          type: 'COMPONENT',
          boundVariables: {
            fills: [{ id: 'color-primary', type: 'VARIABLE_ALIAS' }],
          },
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'TokenButton');
      expect(button).toBeDefined();
      // Should detect and tag components with bound variables
      expect(button!.metadata.tags).toContain('uses-variables');
    });

    it('does not flag components without bound variables', async () => {
      const file = createFigmaFile([
        {
          id: '39:1',
          name: 'HardcodedButton',
          type: 'COMPONENT',
          // No boundVariables
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'HardcodedButton');
      expect(button).toBeDefined();
      expect(button!.metadata.tags).not.toContain('uses-variables');
    });
  });

  describe('exposed nested instance properties detection', () => {
    it('detects components that expose nested instance properties', async () => {
      const file = createFigmaFile([
        {
          id: '40:1',
          name: 'CardWithButton',
          type: 'COMPONENT',
          componentPropertyDefinitions: {
            'Button#Icon': {  // Exposed from nested Button component's Icon property
              type: 'INSTANCE_SWAP',
              defaultValue: 'icon-default',
            },
            'Button#Label': {  // Exposed from nested Button component's Label property
              type: 'TEXT',
              defaultValue: 'Click me',
            },
          },
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const card = result.items.find(c => c.name === 'CardWithButton');
      expect(card).toBeDefined();
      // Should detect exposed nested instance properties (contains # in name)
      expect(card!.metadata.tags).toContain('exposes-nested-properties');
    });
  });

  describe('deeply nested component hierarchy detection', () => {
    it('adds depth information for deeply nested components', async () => {
      const file = createFigmaFile([
        {
          id: '41:1',
          name: 'Level1',
          type: 'FRAME',
          children: [
            {
              id: '41:2',
              name: 'Level2',
              type: 'FRAME',
              children: [
                {
                  id: '41:3',
                  name: 'Level3',
                  type: 'FRAME',
                  children: [
                    {
                      id: '41:4',
                      name: 'Level4',
                      type: 'FRAME',
                      children: [
                        {
                          id: '41:5',
                          name: 'DeeplyNestedButton',
                          type: 'COMPONENT',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'DeeplyNestedButton');
      expect(button).toBeDefined();
      // Should have a depth tag indicating nesting level
      expect(button!.metadata.tags).toContainEqual(expect.stringMatching(/^depth:[45]$/));
    });
  });

  describe('orphan component detection', () => {
    it('flags standalone components that could be part of a component set', async () => {
      // Multiple components with the same base name and similar variant-like naming
      const file = createFigmaFile([
        {
          id: '42:1',
          name: 'Button/Primary',
          type: 'COMPONENT',
        },
        {
          id: '42:2',
          name: 'Button/Secondary',
          type: 'COMPONENT',
        },
        {
          id: '42:3',
          name: 'Button/Tertiary',
          type: 'COMPONENT',
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      // All these buttons share the same base name - they could be variants in a COMPONENT_SET
      const buttons = result.items.filter(c => c.name === 'Primary' || c.name === 'Secondary' || c.name === 'Tertiary');
      expect(buttons.length).toBe(3);
      // Each should be tagged as potentially an orphan variant
      buttons.forEach(button => {
        expect(button!.metadata.tags).toContain('potential-variant');
      });
    });

    it('does not flag unrelated standalone components', async () => {
      const file = createFigmaFile([
        {
          id: '43:1',
          name: 'Button',
          type: 'COMPONENT',
        },
        {
          id: '43:2',
          name: 'Card',
          type: 'COMPONENT',
        },
        {
          id: '43:3',
          name: 'Avatar',
          type: 'COMPONENT',
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      // These have different base names - no pattern suggesting they should be variants
      result.items.forEach(component => {
        expect(component.metadata.tags).not.toContain('potential-variant');
      });
    });
  });

  describe('variant value ordering detection', () => {
    it('detects variant values that follow a size progression', async () => {
      const file = createFigmaFile([
        {
          id: '44:1',
          name: 'Button',
          type: 'COMPONENT_SET',
          componentPropertyDefinitions: {
            'Size': {
              type: 'VARIANT',
              defaultValue: 'Medium',
              variantOptions: ['XSmall', 'Small', 'Medium', 'Large', 'XLarge'], // Follows size progression
            },
          },
          children: [],
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button');
      expect(button).toBeDefined();
      // Should detect size-based ordering pattern
      expect(button!.metadata.tags).toContain('size-progression');
    });

    it('detects out-of-order size variant values', async () => {
      const file = createFigmaFile([
        {
          id: '45:1',
          name: 'Button',
          type: 'COMPONENT_SET',
          componentPropertyDefinitions: {
            'Size': {
              type: 'VARIANT',
              defaultValue: 'Medium',
              variantOptions: ['Large', 'Small', 'Medium', 'XLarge', 'XSmall'], // Out of order
            },
          },
          children: [],
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button');
      expect(button).toBeDefined();
      // Should detect out-of-order size values
      expect(button!.metadata.tags).toContain('unordered-size-variants');
    });
  });

  describe('boolean property visibility detection', () => {
    it('detects boolean properties named for visibility', async () => {
      const file = createFigmaFile([
        {
          id: '46:1',
          name: 'Button',
          type: 'COMPONENT',
          componentPropertyDefinitions: {
            'Show Icon': {
              type: 'BOOLEAN',
              defaultValue: true,
            },
            'Has Badge': {
              type: 'BOOLEAN',
              defaultValue: false,
            },
            'Icon Visible': {
              type: 'BOOLEAN',
              defaultValue: true,
            },
          },
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button');
      expect(button).toBeDefined();
      // Should extract boolean visibility props count
      expect(button!.metadata.tags).toContainEqual(expect.stringMatching(/^visibility-toggles:3$/));
    });
  });

  describe('containing frame extraction', () => {
    it('extracts the containing frame name for organization', async () => {
      const file = createFigmaFile([
        {
          id: '47:1',
          name: 'Forms',
          type: 'FRAME',
          children: [
            {
              id: '47:2',
              name: 'TextField',
              type: 'COMPONENT',
            },
          ],
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const textField = result.items.find(c => c.name === 'TextField');
      expect(textField).toBeDefined();
      // Should have containing frame tag
      expect(textField!.metadata.tags).toContainEqual(expect.stringMatching(/^containing-frame:Forms$/));
    });
  });

  describe('deprecated component detection', () => {
    it('detects components marked as deprecated in description', async () => {
      const file: FigmaFile = {
        name: 'Test File',
        document: {
          id: '0:0',
          name: 'Document',
          type: 'DOCUMENT',
          children: [
            {
              id: '1:1',
              name: 'Components',
              type: 'CANVAS',
              children: [
                {
                  id: '48:1',
                  name: 'OldButton',
                  type: 'COMPONENT',
                },
              ],
            },
          ],
        },
        components: {
          '48:1': {
            key: 'old-btn-key',
            name: 'OldButton',
            description: '[DEPRECATED] Use NewButton instead. This component will be removed.',
            documentationLinks: [],
          },
        },
        styles: {},
      };
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'OldButton');
      expect(button).toBeDefined();
      expect(button!.metadata.tags).toContain('deprecated');
    });

    it('detects components with deprecated naming prefix', async () => {
      const file = createFigmaFile([
        {
          id: '49:1',
          name: '_deprecated/LegacyCard',
          type: 'COMPONENT',
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const card = result.items.find(c => c.name === 'LegacyCard');
      expect(card).toBeDefined();
      expect(card!.metadata.tags).toContain('deprecated');
    });
  });

  describe('boolean variant anti-pattern detection', () => {
    it('detects VARIANT properties with true/false values that should be BOOLEAN', async () => {
      const file = createFigmaFile([
        {
          id: '50:1',
          name: 'Button',
          type: 'COMPONENT_SET',
          componentPropertyDefinitions: {
            'Disabled': {
              type: 'VARIANT',
              defaultValue: 'false',
              variantOptions: ['true', 'false'], // Should be a BOOLEAN property
            },
            'Size': {
              type: 'VARIANT',
              defaultValue: 'Medium',
              variantOptions: ['Small', 'Medium', 'Large'],
            },
          },
          children: [],
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button');
      expect(button).toBeDefined();
      expect(button!.metadata.tags).toContain('boolean-variant-antipattern');
    });

    it('does not flag VARIANT properties with non-boolean values', async () => {
      const file = createFigmaFile([
        {
          id: '51:1',
          name: 'Button',
          type: 'COMPONENT_SET',
          componentPropertyDefinitions: {
            'Size': {
              type: 'VARIANT',
              defaultValue: 'Medium',
              variantOptions: ['Small', 'Medium', 'Large'],
            },
          },
          children: [],
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button');
      expect(button).toBeDefined();
      expect(button!.metadata.tags).not.toContain('boolean-variant-antipattern');
    });
  });

  describe('excessive variant dimensions detection', () => {
    it('flags component sets with too many variant dimensions', async () => {
      const file = createFigmaFile([
        {
          id: '52:1',
          name: 'ComplexButton',
          type: 'COMPONENT_SET',
          componentPropertyDefinitions: {
            'Size': { type: 'VARIANT', defaultValue: 'Medium', variantOptions: ['Small', 'Medium', 'Large'] },
            'State': { type: 'VARIANT', defaultValue: 'Default', variantOptions: ['Default', 'Hover', 'Pressed'] },
            'Type': { type: 'VARIANT', defaultValue: 'Primary', variantOptions: ['Primary', 'Secondary'] },
            'Theme': { type: 'VARIANT', defaultValue: 'Light', variantOptions: ['Light', 'Dark'] },
            'Icon': { type: 'VARIANT', defaultValue: 'None', variantOptions: ['None', 'Left', 'Right'] },
          },
          children: [],
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'ComplexButton');
      expect(button).toBeDefined();
      // 5 variant dimensions is excessive
      expect(button!.metadata.tags).toContain('excessive-variants');
    });

    it('does not flag component sets with reasonable variant dimensions', async () => {
      const file = createFigmaFile([
        {
          id: '53:1',
          name: 'Button',
          type: 'COMPONENT_SET',
          componentPropertyDefinitions: {
            'Size': { type: 'VARIANT', defaultValue: 'Medium', variantOptions: ['Small', 'Medium', 'Large'] },
            'State': { type: 'VARIANT', defaultValue: 'Default', variantOptions: ['Default', 'Hover', 'Pressed'] },
          },
          children: [],
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button');
      expect(button).toBeDefined();
      expect(button!.metadata.tags).not.toContain('excessive-variants');
    });
  });

  describe('missing description detection', () => {
    it('flags components with no description', async () => {
      const file: FigmaFile = {
        name: 'Test File',
        document: {
          id: '0:0',
          name: 'Document',
          type: 'DOCUMENT',
          children: [
            {
              id: '1:1',
              name: 'Components',
              type: 'CANVAS',
              children: [
                {
                  id: '54:1',
                  name: 'UndocumentedButton',
                  type: 'COMPONENT',
                },
              ],
            },
          ],
        },
        components: {
          '54:1': {
            key: 'undoc-btn-key',
            name: 'UndocumentedButton',
            description: '',  // Empty description
            documentationLinks: [],
          },
        },
        styles: {},
      };
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'UndocumentedButton');
      expect(button).toBeDefined();
      expect(button!.metadata.tags).toContain('missing-description');
    });

    it('does not flag components with descriptions', async () => {
      const file: FigmaFile = {
        name: 'Test File',
        document: {
          id: '0:0',
          name: 'Document',
          type: 'DOCUMENT',
          children: [
            {
              id: '1:1',
              name: 'Components',
              type: 'CANVAS',
              children: [
                {
                  id: '55:1',
                  name: 'DocumentedButton',
                  type: 'COMPONENT',
                },
              ],
            },
          ],
        },
        components: {
          '55:1': {
            key: 'doc-btn-key',
            name: 'DocumentedButton',
            description: 'A well-documented button component for user interactions.',
            documentationLinks: [],
          },
        },
        styles: {},
      };
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'DocumentedButton');
      expect(button).toBeDefined();
      expect(button!.metadata.tags).not.toContain('missing-description');
    });
  });

  describe('slot pattern detection', () => {
    it('detects components following slot naming patterns', async () => {
      const file = createFigmaFile([
        {
          id: '56:1',
          name: '.SlotIcon',
          type: 'COMPONENT',
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const slot = result.items.find(c => c.name === '.SlotIcon');
      expect(slot).toBeDefined();
      expect(slot!.metadata.tags).toContain('slot-component');
    });

    it('detects components with _slot suffix', async () => {
      const file = createFigmaFile([
        {
          id: '57:1',
          name: 'Icon_slot',
          type: 'COMPONENT',
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const slot = result.items.find(c => c.name === 'Icon_slot');
      expect(slot).toBeDefined();
      expect(slot!.metadata.tags).toContain('slot-component');
    });
  });

  describe('inconsistent boolean naming detection', () => {
    it('detects inconsistent boolean property naming patterns', async () => {
      const file = createFigmaFile([
        {
          id: '58:1',
          name: 'Button',
          type: 'COMPONENT',
          componentPropertyDefinitions: {
            'isDisabled': {  // camelCase with 'is' prefix
              type: 'BOOLEAN',
              defaultValue: false,
            },
            'Show Icon': {  // Sentence case with 'Show' prefix
              type: 'BOOLEAN',
              defaultValue: true,
            },
            'hasTooltip': {  // camelCase with 'has' prefix
              type: 'BOOLEAN',
              defaultValue: false,
            },
          },
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button');
      expect(button).toBeDefined();
      // Should detect mixed boolean naming patterns
      expect(button!.metadata.tags).toContain('inconsistent-boolean-naming');
    });

    it('does not flag consistent boolean naming', async () => {
      const file = createFigmaFile([
        {
          id: '59:1',
          name: 'Button',
          type: 'COMPONENT',
          componentPropertyDefinitions: {
            'Show Icon': {
              type: 'BOOLEAN',
              defaultValue: true,
            },
            'Show Badge': {
              type: 'BOOLEAN',
              defaultValue: false,
            },
            'Show Label': {
              type: 'BOOLEAN',
              defaultValue: true,
            },
          },
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button');
      expect(button).toBeDefined();
      expect(button!.metadata.tags).not.toContain('inconsistent-boolean-naming');
    });
  });

  describe('variant complexity score', () => {
    it('calculates and tags variant complexity for large matrices', async () => {
      const file = createFigmaFile([
        {
          id: '60:1',
          name: 'Button',
          type: 'COMPONENT_SET',
          componentPropertyDefinitions: {
            'Size': { type: 'VARIANT', defaultValue: 'Medium', variantOptions: ['Small', 'Medium', 'Large', 'XLarge'] },
            'State': { type: 'VARIANT', defaultValue: 'Default', variantOptions: ['Default', 'Hover', 'Pressed', 'Disabled'] },
            'Type': { type: 'VARIANT', defaultValue: 'Primary', variantOptions: ['Primary', 'Secondary', 'Tertiary'] },
          },
          children: [],
        },
      ]);
      mockClient.getFile.mockResolvedValue(file);

      const scanner = createScanner();
      const result = await scanner.scan();

      const button = result.items.find(c => c.name === 'Button');
      expect(button).toBeDefined();
      // 4 * 4 * 3 = 48 potential combinations
      expect(button!.metadata.tags).toContainEqual(expect.stringMatching(/^variant-complexity:\d+$/));
    });
  });
});
