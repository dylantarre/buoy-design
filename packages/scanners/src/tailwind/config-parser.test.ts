// packages/scanners/src/tailwind/config-parser.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TailwindConfigParser } from './config-parser.js';
import * as fs from 'fs';

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

describe('TailwindConfigParser', () => {
  const mockProjectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tailwind v3 JS config parsing', () => {
    it('finds tailwind.config.js', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/tailwind.config.js';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        module.exports = {
          theme: {
            extend: {
              colors: {
                primary: '#3b82f6',
              },
            },
          },
        };
      `);

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      expect(result).not.toBeNull();
      expect(result?.configPath).toBe('/test/project/tailwind.config.js');
    });

    it('extracts colors from theme.extend.colors', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/tailwind.config.js';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        module.exports = {
          theme: {
            extend: {
              colors: {
                primary: '#3b82f6',
                secondary: '#64748b',
              },
            },
          },
        };
      `);

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      expect(result?.theme.colors).toEqual({
        primary: '#3b82f6',
        secondary: '#64748b',
      });
    });

    it('extracts nested color scales', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/tailwind.config.js';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        module.exports = {
          theme: {
            extend: {
              colors: {
                brand: {
                  '50': '#f0f9ff',
                  '100': '#e0f2fe',
                  '500': '#0ea5e9',
                },
              },
            },
          },
        };
      `);

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      expect(result?.theme.colors).toHaveProperty('brand');
      expect((result?.theme.colors as Record<string, Record<string, string>>)?.brand).toEqual({
        '50': '#f0f9ff',
        '100': '#e0f2fe',
        '500': '#0ea5e9',
      });
    });

    it('converts theme to design tokens', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/tailwind.config.js';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        module.exports = {
          theme: {
            extend: {
              colors: {
                primary: '#3b82f6',
              },
              spacing: {
                '18': '4.5rem',
              },
            },
          },
        };
      `);

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      expect(result?.tokens).toHaveLength(2);

      const colorToken = result?.tokens.find(t => t.name === 'tw-primary');
      expect(colorToken).toBeDefined();
      expect(colorToken?.category).toBe('color');

      const spacingToken = result?.tokens.find(t => t.name === 'tw-spacing-18');
      expect(spacingToken).toBeDefined();
      expect(spacingToken?.category).toBe('spacing');
    });
  });

  describe('Tailwind v4 CSS config parsing', () => {
    it('finds globals.css with @import "tailwindcss"', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (path === '/test/project/tailwind.config.js') return false;
        if (path === '/test/project/tailwind.config.ts') return false;
        if (path === '/test/project/tailwind.config.mjs') return false;
        if (path === '/test/project/tailwind.config.cjs') return false;
        return false;
      });

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      // Should return null when no v3 config found (before v4 support)
      expect(result).toBeNull();
    });

    it('extracts tokens from @theme inline block', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/app/globals.css';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
@import "tailwindcss";

@theme inline {
  --color-primary: oklch(0.488 0.243 264.376);
  --color-secondary: oklch(0.97 0 0);
  --radius-lg: 0.5rem;
  --spacing-18: 4.5rem;
}
      `);

      const parser = new TailwindConfigParser(mockProjectRoot, {
        cssConfigPaths: ['/test/project/app/globals.css'],
      });
      const result = await parser.parse();

      expect(result).not.toBeNull();
      expect(result?.tokens.length).toBeGreaterThan(0);

      const primaryToken = result?.tokens.find(t => t.name.includes('primary'));
      expect(primaryToken).toBeDefined();
      expect(primaryToken?.category).toBe('color');
    });

    it('extracts CSS custom properties from :root', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/app/globals.css';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
@import "tailwindcss";

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --radius: 0.625rem;
}
      `);

      const parser = new TailwindConfigParser(mockProjectRoot, {
        cssConfigPaths: ['/test/project/app/globals.css'],
      });
      const result = await parser.parse();

      expect(result).not.toBeNull();
      expect(result?.tokens.length).toBeGreaterThanOrEqual(4);

      const bgToken = result?.tokens.find(t => t.name.includes('background'));
      expect(bgToken).toBeDefined();
    });

    it('extracts dark mode tokens from .dark selector', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/app/globals.css';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
@import "tailwindcss";

:root {
  --background: oklch(1 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
}
      `);

      const parser = new TailwindConfigParser(mockProjectRoot, {
        cssConfigPaths: ['/test/project/app/globals.css'],
      });
      const result = await parser.parse();

      expect(result).not.toBeNull();

      // Should have both light and dark tokens
      const bgTokens = result?.tokens.filter(t => t.name.includes('background'));
      expect(bgTokens?.length).toBeGreaterThanOrEqual(1);
    });

    it('extracts custom variants from @custom-variant', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/app/globals.css';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));
@custom-variant style-vega (&:where(.style-vega *));
      `);

      const parser = new TailwindConfigParser(mockProjectRoot, {
        cssConfigPaths: ['/test/project/app/globals.css'],
      });
      const result = await parser.parse();

      expect(result).not.toBeNull();
      // Custom variants should be tracked in metadata
      expect(result?.theme.customVariants).toContain('dark');
      expect(result?.theme.customVariants).toContain('style-vega');
    });

    it('parses oklch color values correctly', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/app/globals.css';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
@import "tailwindcss";

@theme inline {
  --color-destructive: oklch(0.577 0.245 27.325);
}
      `);

      const parser = new TailwindConfigParser(mockProjectRoot, {
        cssConfigPaths: ['/test/project/app/globals.css'],
      });
      const result = await parser.parse();

      const destructiveToken = result?.tokens.find(t => t.name.includes('destructive'));
      expect(destructiveToken).toBeDefined();
      // oklch values are stored as raw since the schema doesn't support oklch directly
      expect(destructiveToken?.value).toEqual({
        type: 'raw',
        value: 'oklch(0.577 0.245 27.325)',
      });
      expect(destructiveToken?.metadata?.tags).toContain('oklch');
    });

    it('handles var() references in @theme block', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/app/globals.css';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
@import "tailwindcss";

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
}

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
}
      `);

      const parser = new TailwindConfigParser(mockProjectRoot, {
        cssConfigPaths: ['/test/project/app/globals.css'],
      });
      const result = await parser.parse();

      expect(result).not.toBeNull();

      // Should recognize that --color-background references --background
      const bgToken = result?.tokens.find(t => t.name.includes('background'));
      expect(bgToken).toBeDefined();
    });

    it('extracts @utility definitions', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/app/globals.css';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
@import "tailwindcss";

@utility container {
  @apply mx-auto max-w-[1400px] px-4 lg:px-8;
}

@utility no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
      `);

      const parser = new TailwindConfigParser(mockProjectRoot, {
        cssConfigPaths: ['/test/project/app/globals.css'],
      });
      const result = await parser.parse();

      expect(result).not.toBeNull();
      expect(result?.theme.utilities).toContain('container');
      expect(result?.theme.utilities).toContain('no-scrollbar');
    });

    it('auto-discovers CSS files when no v3 config exists', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (path === '/test/project/tailwind.config.js') return false;
        if (path === '/test/project/tailwind.config.ts') return false;
        if (path === '/test/project/tailwind.config.mjs') return false;
        if (path === '/test/project/tailwind.config.cjs') return false;
        if (path === '/test/project/app/globals.css') return true;
        if (path === '/test/project/src/styles/globals.css') return true;
        return false;
      });

      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (String(path).includes('globals.css')) {
          return `@import "tailwindcss";

@theme inline {
  --color-primary: oklch(0.5 0.2 250);
}`;
        }
        return '';
      });

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      // Should auto-discover and parse v4 CSS config
      expect(result).not.toBeNull();
    });
  });
});
