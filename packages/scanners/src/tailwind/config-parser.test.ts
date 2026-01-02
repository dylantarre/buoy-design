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

    it('extracts HSL color values', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/tailwind.config.js';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        module.exports = {
          theme: {
            extend: {
              colors: {
                gray: {
                  50: "hsl(204 20% 99%)",
                  100: "hsl(204 20% 96%)",
                  500: "hsl(204 4% 32%)",
                },
              },
            },
          },
        };
      `);

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      expect(result?.theme.colors).toHaveProperty('gray');
      const gray = result?.theme.colors?.gray as Record<string, string>;
      expect(gray?.['50']).toBe('hsl(204 20% 99%)');
      expect(gray?.['100']).toBe('hsl(204 20% 96%)');
      expect(gray?.['500']).toBe('hsl(204 4% 32%)');

      // Should create tokens for each shade
      const gray50Token = result?.tokens.find(t => t.name === 'tw-gray-50');
      expect(gray50Token).toBeDefined();
      expect(gray50Token?.metadata?.tags).toContain('hsl');
    });

    it('extracts boxShadow from theme', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/tailwind.config.js';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        module.exports = {
          theme: {
            boxShadow: {
              sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
              DEFAULT: "0 1px 3px 0 rgb(0 0 0 / 0.1)",
              lg: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
              button: "inset 0 -1px 2px 0 rgb(0 0 0 / 0.05)",
            },
          },
        };
      `);

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      expect(result?.theme.boxShadow).toHaveProperty('sm');
      expect(result?.theme.boxShadow).toHaveProperty('DEFAULT');
      expect(result?.theme.boxShadow).toHaveProperty('lg');
      expect(result?.theme.boxShadow).toHaveProperty('button');

      const smShadow = result?.tokens.find(t => t.name === 'tw-shadow-sm');
      expect(smShadow).toBeDefined();
      expect(smShadow?.category).toBe('shadow');
    });

    it('extracts dropShadow from theme', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/tailwind.config.js';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        module.exports = {
          theme: {
            dropShadow: {
              sm: "drop-shadow(0 1px 1px rgb(0 0 0 / 0.05))",
              DEFAULT: "drop-shadow(0 1px 2px rgb(0 0 0 / 0.1))",
              lg: "drop-shadow(0 10px 8px rgb(0 0 0 / 0.04))",
            },
          },
        };
      `);

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      expect(result?.theme.dropShadow).toHaveProperty('sm');
      expect(result?.theme.dropShadow).toHaveProperty('DEFAULT');
      expect(result?.theme.dropShadow).toHaveProperty('lg');

      const smDrop = result?.tokens.find(t => t.name === 'tw-drop-shadow-sm');
      expect(smDrop).toBeDefined();
      expect(smDrop?.category).toBe('shadow');
    });

    it('extracts fontFamily arrays', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/tailwind.config.js';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        module.exports = {
          theme: {
            fontFamily: {
              mono: ["Menlo", "Consolas", "Courier New", "monospace"],
              sans: ["Inter", "ui-sans-serif", "system-ui"],
            },
          },
        };
      `);

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      expect(result?.theme.fontFamily).toHaveProperty('mono');
      expect(result?.theme.fontFamily).toHaveProperty('sans');
      expect(Array.isArray(result?.theme.fontFamily?.mono)).toBe(true);
      expect(result?.theme.fontFamily?.mono).toContain('Menlo');
      expect(result?.theme.fontFamily?.mono).toContain('monospace');

      const monoToken = result?.tokens.find(t => t.name === 'tw-font-mono');
      expect(monoToken).toBeDefined();
      expect(monoToken?.category).toBe('typography');
    });

    it('extracts keyframes from theme.extend', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/tailwind.config.js';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        module.exports = {
          theme: {
            extend: {
              keyframes: {
                heartbeat: {
                  "0%": { transform: "scale(1)" },
                  "50%": { transform: "scale(1.2)" },
                  "100%": { transform: "scale(1)" },
                },
                fadeIn: {
                  "0%": { opacity: 0 },
                  "100%": { opacity: 1 },
                },
              },
            },
          },
        };
      `);

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      expect(result?.theme.keyframes).toBeDefined();
      expect(result?.theme.keyframes).toContain('heartbeat');
      expect(result?.theme.keyframes).toContain('fadeIn');
    });

    it('extracts animation from theme.extend', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/tailwind.config.js';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        module.exports = {
          theme: {
            extend: {
              animation: {
                heartbeat: "heartbeat 1s ease-in-out infinite",
                fadeIn: "fadeIn 0.5s ease-in-out forwards",
              },
            },
          },
        };
      `);

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      expect(result?.theme.animation).toBeDefined();
      expect(result?.theme.animation?.heartbeat).toBe('heartbeat 1s ease-in-out infinite');
      expect(result?.theme.animation?.fadeIn).toBe('fadeIn 0.5s ease-in-out forwards');
    });

    it('extracts colors with rgb() values', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/tailwind.config.js';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        module.exports = {
          theme: {
            extend: {
              colors: {
                "code-foreground": "rgb(var(--code-foreground) / <alpha-value>)",
                "custom-red": "rgb(255 0 0)",
                "semi-transparent": "rgb(0 0 0 / 50%)",
              },
            },
          },
        };
      `);

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      expect(result?.theme.colors?.['code-foreground']).toBe('rgb(var(--code-foreground) / <alpha-value>)');
      expect(result?.theme.colors?.['custom-red']).toBe('rgb(255 0 0)');
      expect(result?.theme.colors?.['semi-transparent']).toBe('rgb(0 0 0 / 50%)');
    });

    it('extracts deeply nested color scales with many shades', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/tailwind.config.js';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        module.exports = {
          theme: {
            extend: {
              colors: {
                gray: {
                  50: "hsl(204 20% 99%)",
                  100: "hsl(204 20% 96%)",
                  150: "hsl(204 20% 94%)",
                  200: "hsl(204 20% 91%)",
                  250: "hsl(204 20% 88%)",
                  300: "hsl(204 20% 82%)",
                  350: "hsl(204 10% 70%)",
                  400: "hsl(204 8% 50%)",
                  450: "hsl(204 4% 40%)",
                  500: "hsl(204 4% 32%)",
                  550: "hsl(204 4% 28%)",
                  600: "hsl(204 4% 24%)",
                  650: "hsl(204 4% 20%)",
                  700: "hsl(204 4% 16%)",
                  750: "hsl(204 4% 14%)",
                  800: "hsl(204 4% 12%)",
                  850: "hsl(204 4% 10%)",
                  900: "hsl(204 4% 8%)",
                  950: "hsl(204 4% 6%)",
                },
              },
            },
          },
        };
      `);

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      const gray = result?.theme.colors?.gray as Record<string, string>;
      expect(Object.keys(gray || {}).length).toBeGreaterThanOrEqual(15);
      expect(gray?.['150']).toBe('hsl(204 20% 94%)');
      expect(gray?.['350']).toBe('hsl(204 10% 70%)');
      expect(gray?.['950']).toBe('hsl(204 4% 6%)');
    });

    it('extracts plugins array', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/tailwind.config.js';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        module.exports = {
          theme: {},
          plugins: [
            require("tailwindcss-animate"),
            require("@tailwindcss/typography"),
          ],
        };
      `);

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      expect(result?.theme.plugins).toBeDefined();
      expect(result?.theme.plugins).toContain('tailwindcss-animate');
      expect(result?.theme.plugins).toContain('@tailwindcss/typography');
    });

    it('handles multi-line string values in boxShadow', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/tailwind.config.js';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        module.exports = {
          theme: {
            boxShadow: {
              "md-dark":
                "0 4px 6px -1px rgb(0 0 0 / 0.25), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
              input:
                "inset 0 0 0 1px rgba(0 0 0 / 0.1), inset 0 2px 5px 0 rgba(0 0 0 / 0.05)",
            },
          },
        };
      `);

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      expect(result?.theme.boxShadow?.['md-dark']).toBe(
        '0 4px 6px -1px rgb(0 0 0 / 0.25), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
      );
      expect(result?.theme.boxShadow?.['input']).toContain('inset 0 0 0 1px');
    });

    it('extracts maxWidth from theme.extend', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/tailwind.config.js';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        module.exports = {
          theme: {
            extend: {
              maxWidth: {
                "8xl": "90rem",
                "9xl": "100rem",
              },
            },
          },
        };
      `);

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      expect(result?.theme.maxWidth).toBeDefined();
      expect(result?.theme.maxWidth?.['8xl']).toBe('90rem');
      expect(result?.theme.maxWidth?.['9xl']).toBe('100rem');
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

    it('extracts @plugin declarations', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/app/globals.css';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
@import 'tailwindcss';
@plugin '@tailwindcss/forms';
@plugin '@tailwindcss/typography';
@plugin '@headlessui/tailwindcss';
      `);

      const parser = new TailwindConfigParser(mockProjectRoot, {
        cssConfigPaths: ['/test/project/app/globals.css'],
      });
      const result = await parser.parse();

      expect(result).not.toBeNull();
      expect(result?.theme.plugins).toContain('@tailwindcss/forms');
      expect(result?.theme.plugins).toContain('@tailwindcss/typography');
      expect(result?.theme.plugins).toContain('@headlessui/tailwindcss');
    });

    it('parses oklch with alpha values', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/app/globals.css';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
@import "tailwindcss";

.dark {
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --overlay: oklch(0 0 0 / 50%);
}
      `);

      const parser = new TailwindConfigParser(mockProjectRoot, {
        cssConfigPaths: ['/test/project/app/globals.css'],
      });
      const result = await parser.parse();

      expect(result).not.toBeNull();

      const borderToken = result?.tokens.find(t => t.name.includes('border'));
      expect(borderToken).toBeDefined();
      expect(borderToken?.value).toEqual({
        type: 'raw',
        value: 'oklch(1 0 0 / 10%)',
      });
      expect(borderToken?.metadata?.tags).toContain('oklch');
      expect(borderToken?.metadata?.tags).toContain('alpha');
    });

    it('handles var() with fallback values', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/app/globals.css';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
@import "tailwindcss";

@theme inline {
  --color-border: var(--color-gray-200, currentcolor);
  --color-fallback: var(--undefined-var, #ff0000);
}
      `);

      const parser = new TailwindConfigParser(mockProjectRoot, {
        cssConfigPaths: ['/test/project/app/globals.css'],
      });
      const result = await parser.parse();

      expect(result).not.toBeNull();

      const borderToken = result?.tokens.find(t => t.name.includes('border'));
      expect(borderToken).toBeDefined();
      expect(borderToken?.aliases).toContain('color-gray-200');

      const fallbackToken = result?.tokens.find(t => t.name.includes('fallback'));
      expect(fallbackToken).toBeDefined();
      expect(fallbackToken?.metadata?.tags).toContain('fallback');
    });

    it('tracks CSS imports for dependency graph', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/app/globals.css';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "../registry/styles/style-vega.css" layer(base);
@import "../registry/styles/style-nova.css" layer(base);
      `);

      const parser = new TailwindConfigParser(mockProjectRoot, {
        cssConfigPaths: ['/test/project/app/globals.css'],
      });
      const result = await parser.parse();

      expect(result).not.toBeNull();
      expect(result?.theme.imports).toBeDefined();
      expect(result?.theme.imports).toContain('tw-animate-css');
      expect(result?.theme.imports).toContain('shadcn/tailwind.css');
      expect(result?.theme.imports).toContain('../registry/styles/style-vega.css');
    });

    it('extracts breakpoints from @theme block', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/app/globals.css';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
@import "tailwindcss";

@theme inline {
  --breakpoint-3xl: 1600px;
  --breakpoint-4xl: 2000px;
}
      `);

      const parser = new TailwindConfigParser(mockProjectRoot, {
        cssConfigPaths: ['/test/project/app/globals.css'],
      });
      const result = await parser.parse();

      expect(result).not.toBeNull();
      expect(result?.theme.breakpoints).toBeDefined();
      expect(result?.theme.breakpoints?.['3xl']).toBe('1600px');
      expect(result?.theme.breakpoints?.['4xl']).toBe('2000px');
    });

    it('extracts font families from @theme block', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/app/globals.css';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
@import "tailwindcss";

@theme inline {
  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);
  --font-heading: "Cal Sans", sans-serif;
}
      `);

      const parser = new TailwindConfigParser(mockProjectRoot, {
        cssConfigPaths: ['/test/project/app/globals.css'],
      });
      const result = await parser.parse();

      expect(result).not.toBeNull();
      // Font families should be extracted properly
      const headingToken = result?.tokens.find(t => t.name.includes('font-heading'));
      expect(headingToken).toBeDefined();
      expect(headingToken?.category).toBe('typography');
    });

    it('parses calc() expressions in radius values', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/app/globals.css';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
@import "tailwindcss";

@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}
      `);

      const parser = new TailwindConfigParser(mockProjectRoot, {
        cssConfigPaths: ['/test/project/app/globals.css'],
      });
      const result = await parser.parse();

      expect(result).not.toBeNull();

      const smToken = result?.tokens.find(t => t.name.includes('radius-sm'));
      expect(smToken).toBeDefined();
      expect(smToken?.value).toEqual({
        type: 'raw',
        value: 'calc(var(--radius) - 4px)',
      });
      expect(smToken?.metadata?.tags).toContain('calc');
    });
  });

  describe('Theme configuration extraction (v3)', () => {
    it('extracts container configuration with center, padding, and screens', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/tailwind.config.js';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        module.exports = {
          theme: {
            container: {
              center: true,
              padding: "2rem",
              screens: {
                "2xl": "1400px",
              },
            },
          },
        };
      `);

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      expect(result?.theme.container).toBeDefined();
      expect(result?.theme.container?.center).toBe(true);
      expect(result?.theme.container?.padding).toBe('2rem');
      expect(result?.theme.container?.screens?.['2xl']).toBe('1400px');
    });

    it('extracts screens configuration (custom breakpoints)', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/tailwind.config.js';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        module.exports = {
          theme: {
            screens: {
              'sm': '640px',
              'md': '768px',
              'lg': '1024px',
              'xl': '1280px',
              '2xl': '1536px',
              '3xl': '1920px',
            },
            extend: {
              screens: {
                '4xl': '2560px',
              },
            },
          },
        };
      `);

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      expect(result?.theme.screens).toBeDefined();
      expect(result?.theme.screens?.['sm']).toBe('640px');
      expect(result?.theme.screens?.['3xl']).toBe('1920px');
      expect(result?.theme.screens?.['4xl']).toBe('2560px');
    });

    it('extracts darkMode configuration', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/tailwind.config.js';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        module.exports = {
          darkMode: ["class"],
          theme: {
            extend: {},
          },
        };
      `);

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      expect(result?.theme.darkMode).toBeDefined();
      expect(result?.theme.darkMode).toEqual(['class']);
    });

    it('extracts darkMode as string', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/tailwind.config.js';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        module.exports = {
          darkMode: "selector",
          theme: {
            extend: {},
          },
        };
      `);

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      expect(result?.theme.darkMode).toBe('selector');
    });

    it('extracts hsl(var()) wrapped references as proper tokens', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/tailwind.config.js';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        module.exports = {
          theme: {
            extend: {
              colors: {
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                background: "hsl(var(--background))",
              },
            },
          },
        };
      `);

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      const borderToken = result?.tokens.find(t => t.name === 'tw-border');
      expect(borderToken).toBeDefined();
      expect(borderToken?.value).toEqual({ type: 'raw', value: 'hsl(var(--border))' });
      expect(borderToken?.metadata?.tags).toContain('hsl');
      expect(borderToken?.metadata?.tags).toContain('reference');
      expect(borderToken?.aliases).toContain('border');
    });

    it('extracts nested color scales with DEFAULT key correctly', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/tailwind.config.js';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        module.exports = {
          theme: {
            extend: {
              colors: {
                primary: {
                  DEFAULT: "hsl(var(--primary))",
                  foreground: "hsl(var(--primary-foreground))",
                },
                secondary: {
                  DEFAULT: "hsl(var(--secondary))",
                  foreground: "hsl(var(--secondary-foreground))",
                },
                muted: {
                  DEFAULT: "hsl(var(--muted))",
                  foreground: "hsl(var(--muted-foreground))",
                },
              },
            },
          },
        };
      `);

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      // Primary should be extractable via DEFAULT
      const primaryDefault = result?.tokens.find(t => t.name === 'tw-primary');
      expect(primaryDefault).toBeDefined();
      expect(primaryDefault?.value).toEqual({ type: 'raw', value: 'hsl(var(--primary))' });

      const primaryFg = result?.tokens.find(t => t.name === 'tw-primary-foreground');
      expect(primaryFg).toBeDefined();
      expect(primaryFg?.value).toEqual({ type: 'raw', value: 'hsl(var(--primary-foreground))' });

      const mutedFg = result?.tokens.find(t => t.name === 'tw-muted-foreground');
      expect(mutedFg).toBeDefined();
    });

    it('extracts borderRadius with calc() and var() expressions', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/tailwind.config.js';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        module.exports = {
          theme: {
            extend: {
              borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
              },
            },
          },
        };
      `);

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      expect(result?.theme.borderRadius?.['lg']).toBe('var(--radius)');
      expect(result?.theme.borderRadius?.['md']).toBe('calc(var(--radius) - 2px)');
      expect(result?.theme.borderRadius?.['sm']).toBe('calc(var(--radius) - 4px)');

      const mdToken = result?.tokens.find(t => t.name === 'tw-radius-md');
      expect(mdToken).toBeDefined();
      expect(mdToken?.metadata?.tags).toContain('calc');
    });

    it('extracts zIndex values', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/tailwind.config.js';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        module.exports = {
          theme: {
            extend: {
              zIndex: {
                "60": "60",
                "70": "70",
                "80": "80",
              },
            },
          },
        };
      `);

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      expect(result?.theme.zIndex).toBeDefined();
      expect(result?.theme.zIndex?.['60']).toBe('60');
      expect(result?.theme.zIndex?.['80']).toBe('80');
    });

    it('extracts lineHeight values', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/tailwind.config.js';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        module.exports = {
          theme: {
            extend: {
              lineHeight: {
                "tight": "1.25",
                "relaxed": "1.75",
              },
            },
          },
        };
      `);

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      expect(result?.theme.lineHeight).toBeDefined();
      expect(result?.theme.lineHeight?.['tight']).toBe('1.25');
      expect(result?.theme.lineHeight?.['relaxed']).toBe('1.75');
    });

    it('extracts letterSpacing values', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/tailwind.config.js';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        module.exports = {
          theme: {
            extend: {
              letterSpacing: {
                "tighter": "-0.05em",
                "wider": "0.05em",
              },
            },
          },
        };
      `);

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      expect(result?.theme.letterSpacing).toBeDefined();
      expect(result?.theme.letterSpacing?.['tighter']).toBe('-0.05em');
      expect(result?.theme.letterSpacing?.['wider']).toBe('0.05em');
    });

    it('extracts opacity values', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/tailwind.config.js';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        module.exports = {
          theme: {
            extend: {
              opacity: {
                "15": "0.15",
                "35": "0.35",
                "85": "0.85",
              },
            },
          },
        };
      `);

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      expect(result?.theme.opacity).toBeDefined();
      expect(result?.theme.opacity?.['15']).toBe('0.15');
      expect(result?.theme.opacity?.['85']).toBe('0.85');
    });

    it('extracts transitionDuration values', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/tailwind.config.js';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
        module.exports = {
          theme: {
            extend: {
              transitionDuration: {
                "400": "400ms",
                "600": "600ms",
              },
            },
          },
        };
      `);

      const parser = new TailwindConfigParser(mockProjectRoot);
      const result = await parser.parse();

      expect(result?.theme.transitionDuration).toBeDefined();
      expect(result?.theme.transitionDuration?.['400']).toBe('400ms');
      expect(result?.theme.transitionDuration?.['600']).toBe('600ms');
    });
  });

  describe('Tailwind v4 @theme block variations', () => {
    it('parses @theme block without inline keyword', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/app/globals.css';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
@import "tailwindcss";

@theme {
  --color-primary: oklch(0.5 0.2 250);
  --color-secondary: oklch(0.7 0.1 200);
  --radius-lg: 0.5rem;
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
    });

    it('handles @theme reference keyword', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/app/globals.css';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
@import "tailwindcss";

@theme reference {
  --color-*: initial;
  --font-*: initial;
}

@theme inline {
  --color-primary: #3b82f6;
}
      `);

      const parser = new TailwindConfigParser(mockProjectRoot, {
        cssConfigPaths: ['/test/project/app/globals.css'],
      });
      const result = await parser.parse();

      expect(result).not.toBeNull();
      // Should extract from @theme inline but skip @theme reference
      const primaryToken = result?.tokens.find(t => t.name.includes('primary'));
      expect(primaryToken).toBeDefined();
    });

    it('parses @source directive for content paths', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/app/globals.css';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
@import "tailwindcss";

@source "../components/**/*.tsx";
@source "../lib/**/*.ts";

@theme inline {
  --color-brand: #ff6b6b;
}
      `);

      const parser = new TailwindConfigParser(mockProjectRoot, {
        cssConfigPaths: ['/test/project/app/globals.css'],
      });
      const result = await parser.parse();

      expect(result).not.toBeNull();
      // Source paths should be tracked in theme
      expect(result?.theme).toBeDefined();
    });

    it('extracts CSS variables from @layer base with :root', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/app/globals.css';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
@import "tailwindcss";

@layer base {
  :root {
    --background: oklch(1 0 0);
    --foreground: oklch(0.1 0 0);
    --radius: 0.5rem;
  }

  .dark {
    --background: oklch(0.1 0 0);
    --foreground: oklch(0.9 0 0);
  }
}
      `);

      const parser = new TailwindConfigParser(mockProjectRoot, {
        cssConfigPaths: ['/test/project/app/globals.css'],
      });
      const result = await parser.parse();

      expect(result).not.toBeNull();

      // Should extract from :root within @layer base
      const bgToken = result?.tokens.find(t => t.name.includes('background') && !t.name.includes('dark'));
      expect(bgToken).toBeDefined();

      // Should also extract dark mode tokens
      const darkBgToken = result?.tokens.find(t => t.name.includes('background') && t.name.includes('dark'));
      expect(darkBgToken).toBeDefined();
    });

    it('handles color-mix() expressions', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/app/globals.css';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
@import "tailwindcss";

@theme inline {
  --color-overlay: color-mix(in oklch, var(--background) 50%, transparent);
}
      `);

      const parser = new TailwindConfigParser(mockProjectRoot, {
        cssConfigPaths: ['/test/project/app/globals.css'],
      });
      const result = await parser.parse();

      expect(result).not.toBeNull();

      const overlayToken = result?.tokens.find(t => t.name.includes('overlay'));
      expect(overlayToken).toBeDefined();
      expect(overlayToken?.value).toHaveProperty('type', 'raw');
    });

    it('parses multiple @theme blocks in the same file', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/app/globals.css';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
@import "tailwindcss";

@theme inline {
  --color-primary: #3b82f6;
}

@theme inline {
  --color-secondary: #64748b;
  --spacing-18: 4.5rem;
}
      `);

      const parser = new TailwindConfigParser(mockProjectRoot, {
        cssConfigPaths: ['/test/project/app/globals.css'],
      });
      const result = await parser.parse();

      expect(result).not.toBeNull();
      expect(result?.tokens.length).toBeGreaterThanOrEqual(3);

      const primaryToken = result?.tokens.find(t => t.name.includes('primary'));
      const secondaryToken = result?.tokens.find(t => t.name.includes('secondary'));
      const spacingToken = result?.tokens.find(t => t.name.includes('spacing-18'));

      expect(primaryToken).toBeDefined();
      expect(secondaryToken).toBeDefined();
      expect(spacingToken).toBeDefined();
    });

    it('handles @variant directive for custom variants', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/test/project/app/globals.css';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`
@import "tailwindcss";

@variant dark (&:where(.dark, .dark *));
@variant print (@media print);
      `);

      const parser = new TailwindConfigParser(mockProjectRoot, {
        cssConfigPaths: ['/test/project/app/globals.css'],
      });
      const result = await parser.parse();

      expect(result).not.toBeNull();
      // @variant should be extracted like @custom-variant
      expect(result?.theme.customVariants).toBeDefined();
    });
  });
});
