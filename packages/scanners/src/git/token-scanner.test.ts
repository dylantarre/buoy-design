// packages/scanners/src/git/token-scanner.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { TokenScanner } from './token-scanner.js';
import { vol } from 'memfs';

describe('TokenScanner', () => {
  beforeEach(() => {
    vol.reset();
  });

  describe('CSS variable parsing', () => {
    it('extracts CSS custom properties from :root', async () => {
      vol.fromJSON({
        '/project/tokens/colors.css': `
          :root {
            --primary-color: #0066cc;
            --secondary-color: #666666;
            --spacing-sm: 8px;
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: '/project',
        files: ['tokens/**/*.css'],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(3);
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: '--primary-color',
          category: 'color',
        })
      );
    });

    it('categorizes tokens by name patterns', async () => {
      vol.fromJSON({
        '/project/tokens/vars.css': `
          :root {
            --color-primary: #0066cc;
            --spacing-md: 16px;
            --font-size-base: 14px;
            --shadow-sm: 0 1px 2px rgba(0,0,0,0.1);
            --border-radius: 4px;
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: '/project',
        files: ['tokens/**/*.css'],
      });

      const result = await scanner.scan();

      const colorToken = result.items.find(t => t.name.includes('color'));
      const spacingToken = result.items.find(t => t.name.includes('spacing'));
      const fontToken = result.items.find(t => t.name.includes('font'));
      const shadowToken = result.items.find(t => t.name.includes('shadow'));
      const borderToken = result.items.find(t => t.name.includes('border'));

      expect(colorToken?.category).toBe('color');
      expect(spacingToken?.category).toBe('spacing');
      expect(fontToken?.category).toBe('typography');
      expect(shadowToken?.category).toBe('shadow');
      expect(borderToken?.category).toBe('border');
    });

    it('handles multi-line CSS values', async () => {
      vol.fromJSON({
        '/project/tokens/complex.css': `
          :root {
            --gradient-primary: linear-gradient(
              to right,
              #0066cc,
              #00cc66
            );
            --shadow-lg: 0 4px 6px rgba(0, 0, 0, 0.1),
                         0 2px 4px rgba(0, 0, 0, 0.06);
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: '/project',
        files: ['tokens/**/*.css'],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(2);
      const gradientToken = result.items.find(t => t.name.includes('gradient'));
      expect(gradientToken).toBeDefined();
    });

    it('respects cssVariablePrefix config', async () => {
      vol.fromJSON({
        '/project/tokens/prefixed.css': `
          :root {
            --ds-color-primary: #0066cc;
            --ds-spacing-sm: 8px;
            --other-color: #ff0000;
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: '/project',
        files: ['tokens/**/*.css'],
        cssVariablePrefix: '--ds-',
      });

      const result = await scanner.scan();

      expect(result.items.length).toBe(2);
      expect(result.items.every(t => t.name.startsWith('--ds-'))).toBe(true);
    });

    it('ignores CSS comments', async () => {
      vol.fromJSON({
        '/project/tokens/commented.css': `
          :root {
            /* --commented-out: #ff0000; */
            --active-color: #0066cc;
            /*
             * Multi-line comment
             * --also-commented: #00ff00;
             */
            --another-color: #666666;
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: '/project',
        files: ['tokens/**/*.css'],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBe(2);
      expect(result.items.map(t => t.name)).not.toContain('--commented-out');
      expect(result.items.map(t => t.name)).not.toContain('--also-commented');
    });
  });

  describe('JSON token parsing', () => {
    it('extracts tokens from design tokens JSON format', async () => {
      vol.fromJSON({
        '/project/tokens/tokens.json': JSON.stringify({
          color: {
            primary: { value: '#0066cc' },
            secondary: { value: '#666666' },
          },
          spacing: {
            sm: { value: '8px' },
            md: { value: '16px' },
          },
        }),
      });

      const scanner = new TokenScanner({
        projectRoot: '/project',
        files: ['tokens/**/*.json'],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(4);
    });

    it('handles nested token structures', async () => {
      vol.fromJSON({
        '/project/tokens/nested.json': JSON.stringify({
          color: {
            brand: {
              primary: { value: '#0066cc' },
              secondary: { value: '#00cc66' },
            },
          },
        }),
      });

      const scanner = new TokenScanner({
        projectRoot: '/project',
        files: ['tokens/**/*.json'],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(2);
      // Nested tokens should have dotted names
      const primaryToken = result.items.find(t => t.name.includes('primary'));
      expect(primaryToken?.name).toContain('brand');
    });

    it('supports $value format (W3C Design Tokens)', async () => {
      vol.fromJSON({
        '/project/tokens/w3c.json': JSON.stringify({
          color: {
            primary: { $value: '#0066cc', $type: 'color' },
            secondary: { $value: '#666666', $type: 'color' },
          },
        }),
      });

      const scanner = new TokenScanner({
        projectRoot: '/project',
        files: ['tokens/**/*.json'],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(2);
      expect(result.items[0]!.category).toBe('color');
    });

    it('includes token metadata like description', async () => {
      vol.fromJSON({
        '/project/tokens/described.json': JSON.stringify({
          color: {
            primary: {
              value: '#0066cc',
              description: 'Main brand color',
            },
          },
        }),
      });

      const scanner = new TokenScanner({
        projectRoot: '/project',
        files: ['tokens/**/*.json'],
      });

      const result = await scanner.scan();

      expect(result.items[0]!.metadata.description).toBe('Main brand color');
    });
  });

  describe('SCSS variable parsing', () => {
    it('extracts SCSS variables', async () => {
      vol.fromJSON({
        '/project/tokens/variables.scss': `
          $primary-color: #0066cc;
          $secondary-color: #666666;
          $spacing-sm: 8px;
          $font-size-base: 14px;
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: '/project',
        files: ['tokens/**/*.scss'],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(4);
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: '$primary-color',
        })
      );
    });

    it('categorizes SCSS variables correctly', async () => {
      vol.fromJSON({
        '/project/tokens/categorized.scss': `
          $color-primary: #0066cc;
          $spacing-lg: 24px;
          $font-family-base: 'Arial', sans-serif;
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: '/project',
        files: ['tokens/**/*.scss'],
      });

      const result = await scanner.scan();

      const colorToken = result.items.find(t => t.name.includes('color'));
      const spacingToken = result.items.find(t => t.name.includes('spacing'));
      const fontToken = result.items.find(t => t.name.includes('font'));

      expect(colorToken?.category).toBe('color');
      expect(spacingToken?.category).toBe('spacing');
      expect(fontToken?.category).toBe('typography');
    });

    it('handles SCSS variables with complex values', async () => {
      vol.fromJSON({
        '/project/tokens/complex.scss': `
          $shadow-base: 0 2px 4px rgba(0, 0, 0, 0.1);
          $transition-all: all 0.3s ease-in-out;
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: '/project',
        files: ['tokens/**/*.scss'],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('error handling', () => {
    it('handles invalid JSON gracefully', async () => {
      vol.fromJSON({
        '/project/tokens/invalid.json': '{ invalid json }',
      });

      const scanner = new TokenScanner({
        projectRoot: '/project',
        files: ['tokens/**/*.json'],
      });

      const result = await scanner.scan();

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]!.code).toBe('PARSE_ERROR');
    });

    it('handles empty files', async () => {
      vol.fromJSON({
        '/project/tokens/empty.css': '',
      });

      const scanner = new TokenScanner({
        projectRoot: '/project',
        files: ['tokens/**/*.css'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('handles files with no tokens', async () => {
      vol.fromJSON({
        '/project/tokens/no-tokens.css': `
          body {
            margin: 0;
            padding: 0;
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: '/project',
        files: ['tokens/**/*.css'],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(0);
    });
  });

  describe('scan statistics', () => {
    it('returns scan stats', async () => {
      vol.fromJSON({
        '/project/tokens/colors.css': ':root { --color: #fff; }',
        '/project/tokens/spacing.css': ':root { --space: 8px; }',
      });

      const scanner = new TokenScanner({
        projectRoot: '/project',
        files: ['tokens/**/*.css'],
      });

      const result = await scanner.scan();

      expect(result.stats).toBeDefined();
      expect(result.stats.filesScanned).toBe(2);
      expect(result.stats.itemsFound).toBeGreaterThanOrEqual(2);
      expect(result.stats.duration).toBeGreaterThanOrEqual(0);
    });

    it('tracks duration', async () => {
      vol.fromJSON({
        '/project/tokens/colors.css': ':root { --color: #fff; }',
      });

      const scanner = new TokenScanner({
        projectRoot: '/project',
        files: ['tokens/**/*.css'],
      });

      const result = await scanner.scan();

      expect(typeof result.stats.duration).toBe('number');
    });
  });

  describe('token value parsing', () => {
    it('parses color values correctly', async () => {
      vol.fromJSON({
        '/project/tokens/colors.css': `
          :root {
            --color-hex: #0066cc;
            --color-rgb: rgb(0, 102, 204);
            --color-hsl: hsl(210, 100%, 40%);
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: '/project',
        files: ['tokens/**/*.css'],
      });

      const result = await scanner.scan();

      const hexToken = result.items.find(t => t.name === '--color-hex');
      expect(hexToken?.value.type).toBe('color');
      expect((hexToken?.value as { type: 'color'; hex: string }).hex).toBe('#0066cc');
    });

    it('parses spacing values with units', async () => {
      vol.fromJSON({
        '/project/tokens/spacing.css': `
          :root {
            --spacing-px: 16px;
            --spacing-rem: 1rem;
            --spacing-em: 2em;
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: '/project',
        files: ['tokens/**/*.css'],
      });

      const result = await scanner.scan();

      const pxToken = result.items.find(t => t.name === '--spacing-px');
      expect(pxToken?.value.type).toBe('spacing');
      expect((pxToken?.value as { type: 'spacing'; value: number; unit: string }).value).toBe(16);
      expect((pxToken?.value as { type: 'spacing'; value: number; unit: string }).unit).toBe('px');
    });
  });

  describe('token deduplication', () => {
    it('deduplicates tokens with same ID', async () => {
      vol.fromJSON({
        '/project/tokens/vars.css': `
          :root {
            --color-primary: #0066cc;
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: '/project',
        files: ['tokens/**/*.css', 'tokens/**/*.css'], // Duplicate pattern
      });

      const result = await scanner.scan();

      // Should only have one token despite duplicate pattern
      const primaryTokens = result.items.filter(t => t.name === '--color-primary');
      expect(primaryTokens.length).toBe(1);
    });
  });

  describe('source type', () => {
    it('returns correct source type', () => {
      const scanner = new TokenScanner({
        projectRoot: '/project',
        files: ['tokens/**/*.css'],
      });

      expect(scanner.getSourceType()).toBe('tokens');
    });
  });

  describe('default file patterns', () => {
    it('scans default token file locations when no files specified', async () => {
      vol.fromJSON({
        '/project/tokens/design.tokens.json': JSON.stringify({
          color: { primary: { value: '#0066cc' } },
        }),
        '/project/src/styles/variables.css': `
          :root {
            --color-secondary: #666666;
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: '/project',
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(2);
    });
  });
});
