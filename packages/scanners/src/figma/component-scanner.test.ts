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
            documentationLinks: ['https://docs.example.com/button'],
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
});
