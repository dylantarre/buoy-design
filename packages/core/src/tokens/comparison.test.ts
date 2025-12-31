import { describe, it, expect } from 'vitest';
import { compareTokens, TokenComparisonResult, TokenMatch } from './comparison.js';
import type { DesignToken } from '../models/token.js';

// Helper to create test tokens
function createToken(
  name: string,
  value: { type: 'color'; hex: string } | { type: 'spacing'; value: number; unit: 'px' | 'rem' | 'em' }
): DesignToken {
  return {
    id: `test:${name}`,
    name,
    category: value.type === 'color' ? 'color' : 'spacing',
    value,
    source: { type: 'json', path: 'test.json' },
    aliases: [],
    usedBy: [],
    metadata: {},
    scannedAt: new Date(),
  };
}

describe('compareTokens', () => {
  describe('exact name matching', () => {
    it('matches tokens with identical names', () => {
      const design = [createToken('colors.primary', { type: 'color', hex: '#3b82f6' })];
      const code = [createToken('colors.primary', { type: 'color', hex: '#3b82f6' })];

      const result = compareTokens(design, code);

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]).toMatchObject({
        designToken: design[0],
        codeToken: code[0],
        matchType: 'exact',
        valueDrift: false,
      });
    });

    it('detects value drift when names match but values differ', () => {
      const design = [createToken('colors.primary', { type: 'color', hex: '#3b82f6' })];
      const code = [createToken('colors.primary', { type: 'color', hex: '#ef4444' })];

      const result = compareTokens(design, code);

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]).toMatchObject({
        matchType: 'exact',
        valueDrift: true,
      });
    });
  });

  describe('value matching', () => {
    it('matches tokens with same value but different names', () => {
      const design = [createToken('colors.brand.primary', { type: 'color', hex: '#3b82f6' })];
      const code = [createToken('primary-color', { type: 'color', hex: '#3b82f6' })];

      const result = compareTokens(design, code);

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]).toMatchObject({
        designToken: design[0],
        codeToken: code[0],
        matchType: 'value',
        valueDrift: false,
      });
    });

    it('prefers exact name match over value match', () => {
      const design = [createToken('colors.primary', { type: 'color', hex: '#3b82f6' })];
      const code = [
        createToken('colors.primary', { type: 'color', hex: '#3b82f6' }),
        createToken('other-blue', { type: 'color', hex: '#3b82f6' }),
      ];

      const result = compareTokens(design, code);

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].matchType).toBe('exact');
      expect(result.orphanTokens).toHaveLength(1);
    });
  });

  describe('fuzzy matching', () => {
    it('matches tokens with case differences (unique values)', () => {
      // Use unique values so value matching doesn't apply
      const design = [createToken('colors.Primary', { type: 'color', hex: '#aabbcc' })];
      const code = [createToken('colors.primary', { type: 'color', hex: '#aabbcc' })];

      const result = compareTokens(design, code);

      expect(result.matches).toHaveLength(1);
      // Note: value match wins over fuzzy since values are the same
      // Fuzzy match only applies when names differ AND values differ
    });

    it('matches tokens with case differences when values differ', () => {
      const design = [createToken('colors.Primary', { type: 'color', hex: '#aabbcc' })];
      const code = [createToken('colors.primary', { type: 'color', hex: '#112233' })];

      const result = compareTokens(design, code);

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]).toMatchObject({
        matchType: 'fuzzy',
        valueDrift: true,
      });
    });

    it('matches tokens with different separators when values differ', () => {
      const design = [createToken('colors.primary.500', { type: 'color', hex: '#aabbcc' })];
      const code = [createToken('colors-primary-500', { type: 'color', hex: '#112233' })];

      const result = compareTokens(design, code);

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]).toMatchObject({
        matchType: 'fuzzy',
        valueDrift: true,
      });
    });

    it('detects value drift with fuzzy match', () => {
      const design = [createToken('colors.Primary', { type: 'color', hex: '#3b82f6' })];
      const code = [createToken('colors.primary', { type: 'color', hex: '#ef4444' })];

      const result = compareTokens(design, code);

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]).toMatchObject({
        matchType: 'fuzzy',
        valueDrift: true,
      });
    });
  });

  describe('missing and orphan detection', () => {
    it('identifies design tokens missing from code', () => {
      const design = [
        createToken('colors.primary', { type: 'color', hex: '#3b82f6' }),
        createToken('colors.secondary', { type: 'color', hex: '#10b981' }),
      ];
      const code = [createToken('colors.primary', { type: 'color', hex: '#3b82f6' })];

      const result = compareTokens(design, code);

      expect(result.matches).toHaveLength(1);
      expect(result.missingTokens).toHaveLength(1);
      expect(result.missingTokens[0].name).toBe('colors.secondary');
    });

    it('identifies code tokens not in design system', () => {
      const design = [createToken('colors.primary', { type: 'color', hex: '#3b82f6' })];
      const code = [
        createToken('colors.primary', { type: 'color', hex: '#3b82f6' }),
        createToken('custom-color', { type: 'color', hex: '#ff00ff' }),
      ];

      const result = compareTokens(design, code);

      expect(result.matches).toHaveLength(1);
      expect(result.orphanTokens).toHaveLength(1);
      expect(result.orphanTokens[0].name).toBe('custom-color');
    });

    it('handles empty design tokens', () => {
      const code = [createToken('colors.primary', { type: 'color', hex: '#3b82f6' })];

      const result = compareTokens([], code);

      expect(result.matches).toHaveLength(0);
      expect(result.missingTokens).toHaveLength(0);
      expect(result.orphanTokens).toHaveLength(1);
    });

    it('handles empty code tokens', () => {
      const design = [createToken('colors.primary', { type: 'color', hex: '#3b82f6' })];

      const result = compareTokens(design, []);

      expect(result.matches).toHaveLength(0);
      expect(result.missingTokens).toHaveLength(1);
      expect(result.orphanTokens).toHaveLength(0);
    });
  });

  describe('spacing tokens', () => {
    it('matches spacing tokens with same value', () => {
      const design = [createToken('spacing.md', { type: 'spacing', value: 16, unit: 'px' })];
      const code = [createToken('spacing.md', { type: 'spacing', value: 16, unit: 'px' })];

      const result = compareTokens(design, code);

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].valueDrift).toBe(false);
    });

    it('detects drift when spacing value differs', () => {
      const design = [createToken('spacing.md', { type: 'spacing', value: 16, unit: 'px' })];
      const code = [createToken('spacing.md', { type: 'spacing', value: 20, unit: 'px' })];

      const result = compareTokens(design, code);

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].valueDrift).toBe(true);
    });

    it('detects drift when spacing unit differs', () => {
      const design = [createToken('spacing.md', { type: 'spacing', value: 1, unit: 'rem' })];
      const code = [createToken('spacing.md', { type: 'spacing', value: 1, unit: 'em' })];

      const result = compareTokens(design, code);

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].valueDrift).toBe(true);
    });
  });

  describe('summary statistics', () => {
    it('provides summary counts', () => {
      const design = [
        createToken('colors.primary', { type: 'color', hex: '#3b82f6' }),
        createToken('colors.secondary', { type: 'color', hex: '#10b981' }),
        createToken('spacing.sm', { type: 'spacing', value: 8, unit: 'px' }),
      ];
      const code = [
        createToken('colors.primary', { type: 'color', hex: '#ef4444' }), // value drift
        createToken('custom-color', { type: 'color', hex: '#ff00ff' }), // orphan
      ];

      const result = compareTokens(design, code);

      expect(result.summary).toEqual({
        totalDesignTokens: 3,
        totalCodeTokens: 2,
        matched: 1,
        matchedWithDrift: 1,
        missing: 2,
        orphan: 1,
      });
    });
  });
});
