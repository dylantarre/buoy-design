import { describe, it, expect } from 'vitest';
import { detectFormat, parseTokenFile } from './parser.js';

describe('detectFormat', () => {
  it('detects W3C DTCG format by $value property', () => {
    const json = {
      colors: {
        primary: {
          $value: '#3b82f6',
          $type: 'color',
        },
      },
    };

    expect(detectFormat(json)).toBe('dtcg');
  });

  it('detects Tokens Studio format by value + type properties', () => {
    const json = {
      colors: {
        primary: {
          value: '#3b82f6',
          type: 'color',
        },
      },
    };

    expect(detectFormat(json)).toBe('tokens-studio');
  });

  it('detects Style Dictionary format by value only', () => {
    const json = {
      color: {
        primary: {
          value: '#3b82f6',
        },
      },
    };

    expect(detectFormat(json)).toBe('style-dictionary');
  });

  it('detects DTCG even when $type is on parent group', () => {
    const json = {
      colors: {
        $type: 'color',
        primary: {
          500: { $value: '#3b82f6' },
          600: { $value: '#2563eb' },
        },
      },
    };

    expect(detectFormat(json)).toBe('dtcg');
  });

  it('handles deeply nested tokens', () => {
    const json = {
      theme: {
        colors: {
          brand: {
            primary: {
              $value: '#3b82f6',
            },
          },
        },
      },
    };

    expect(detectFormat(json)).toBe('dtcg');
  });
});

describe('parseTokenFile', () => {
  describe('DTCG format', () => {
    it('parses a simple color token', () => {
      const content = JSON.stringify({
        colors: {
          primary: {
            $value: '#3b82f6',
            $type: 'color',
          },
        },
      });

      const tokens = parseTokenFile(content);

      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toMatchObject({
        name: 'colors.primary',
        category: 'color',
        value: {
          type: 'color',
          hex: '#3b82f6',
        },
      });
    });

    it('parses nested tokens with inherited $type', () => {
      const content = JSON.stringify({
        colors: {
          $type: 'color',
          primary: {
            500: { $value: '#3b82f6' },
            600: { $value: '#2563eb' },
          },
        },
      });

      const tokens = parseTokenFile(content);

      expect(tokens).toHaveLength(2);
      expect(tokens[0].name).toBe('colors.primary.500');
      expect(tokens[1].name).toBe('colors.primary.600');
    });

    it('parses dimension tokens', () => {
      const content = JSON.stringify({
        spacing: {
          $type: 'dimension',
          sm: { $value: '8px' },
          md: { $value: '16px' },
        },
      });

      const tokens = parseTokenFile(content);

      expect(tokens).toHaveLength(2);
      expect(tokens[0]).toMatchObject({
        name: 'spacing.sm',
        category: 'spacing',
        value: {
          type: 'spacing',
          value: 8,
          unit: 'px',
        },
      });
    });

    it('preserves $description as metadata', () => {
      const content = JSON.stringify({
        colors: {
          primary: {
            $value: '#3b82f6',
            $type: 'color',
            $description: 'Primary brand color',
          },
        },
      });

      const tokens = parseTokenFile(content);

      expect(tokens[0].metadata.description).toBe('Primary brand color');
    });

    it('handles $deprecated flag', () => {
      const content = JSON.stringify({
        colors: {
          oldBlue: {
            $value: '#0000ff',
            $type: 'color',
            $deprecated: true,
          },
        },
      });

      const tokens = parseTokenFile(content);

      expect(tokens[0].metadata.deprecated).toBe(true);
    });
  });

  describe('Tokens Studio format', () => {
    it('parses a simple color token', () => {
      const content = JSON.stringify({
        colors: {
          primary: {
            value: '#3b82f6',
            type: 'color',
          },
        },
      });

      const tokens = parseTokenFile(content);

      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toMatchObject({
        name: 'colors.primary',
        category: 'color',
        value: {
          type: 'color',
          hex: '#3b82f6',
        },
      });
    });

    it('parses spacing tokens (unitless values)', () => {
      const content = JSON.stringify({
        spacing: {
          sm: {
            value: '8',
            type: 'spacing',
          },
        },
      });

      const tokens = parseTokenFile(content);

      expect(tokens[0]).toMatchObject({
        name: 'spacing.sm',
        category: 'spacing',
        value: {
          type: 'spacing',
          value: 8,
          unit: 'px', // defaults to px for unitless
        },
      });
    });

    it('preserves description', () => {
      const content = JSON.stringify({
        colors: {
          primary: {
            value: '#3b82f6',
            type: 'color',
            description: 'Primary brand color',
          },
        },
      });

      const tokens = parseTokenFile(content);

      expect(tokens[0].metadata.description).toBe('Primary brand color');
    });
  });

  describe('Style Dictionary format', () => {
    it('parses a simple color token', () => {
      const content = JSON.stringify({
        color: {
          primary: {
            value: '#3b82f6',
          },
        },
      });

      const tokens = parseTokenFile(content);

      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toMatchObject({
        name: 'color.primary',
        category: 'color', // inferred from path
        value: {
          type: 'color',
          hex: '#3b82f6',
        },
      });
    });

    it('infers category from path', () => {
      const content = JSON.stringify({
        spacing: {
          sm: { value: '8px' },
        },
        fontSize: {
          base: { value: '16px' },
        },
      });

      const tokens = parseTokenFile(content);

      expect(tokens[0].category).toBe('spacing');
      expect(tokens[1].category).toBe('typography');
    });
  });

  describe('edge cases', () => {
    it('throws on invalid JSON', () => {
      expect(() => parseTokenFile('not json')).toThrow();
    });

    it('returns empty array for empty object', () => {
      const tokens = parseTokenFile('{}');
      expect(tokens).toEqual([]);
    });

    it('ignores non-token properties', () => {
      const content = JSON.stringify({
        $description: 'This is a token file',
        colors: {
          primary: {
            $value: '#3b82f6',
            $type: 'color',
          },
        },
      });

      const tokens = parseTokenFile(content);

      expect(tokens).toHaveLength(1);
    });
  });
});
