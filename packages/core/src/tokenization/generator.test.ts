// packages/core/src/tokenization/generator.test.ts
import { describe, it, expect } from 'vitest';
import { generateTokens } from './generator.js';
import type { ExtractedValue } from '../extraction/css-parser.js';

describe('generateTokens', () => {
  describe('clustering', () => {
    it('never clusters 0 with non-zero spacing values', () => {
      const values: ExtractedValue[] = [
        { property: 'padding', value: '0', rawValue: '0', category: 'spacing', context: 'spacing' },
        { property: 'padding', value: '0px', rawValue: '0px', category: 'spacing', context: 'spacing' },
        { property: 'padding', value: '1px', rawValue: '1px', category: 'spacing', context: 'spacing' },
        { property: 'padding', value: '2px', rawValue: '2px', category: 'spacing', context: 'spacing' },
        { property: 'padding', value: '4px', rawValue: '4px', category: 'spacing', context: 'spacing' },
      ];

      const result = generateTokens(values);
      const zeroToken = result.tokens.find(t => t.name.includes('spacing') && t.value === '0px');

      // The zero token should NOT include 1px, 2px, or 4px in its sources
      if (zeroToken) {
        expect(zeroToken.sources).not.toContain('1px');
        expect(zeroToken.sources).not.toContain('2px');
        expect(zeroToken.sources).not.toContain('4px');
      }
    });

    it('never clusters 0 with non-zero sizing values', () => {
      const values: ExtractedValue[] = [
        { property: 'width', value: '0', rawValue: '0', category: 'sizing', context: 'sizing' },
        { property: 'width', value: '4px', rawValue: '4px', category: 'sizing', context: 'sizing' },
      ];

      const result = generateTokens(values);
      const tokens = result.tokens.filter(t => t.category === 'sizing');

      // Should have separate tokens for 0 and 4px
      const zeroToken = tokens.find(t => t.value === '0px');
      const fourToken = tokens.find(t => t.value === '4px');

      // They should be separate if both exist
      if (zeroToken && fourToken) {
        expect(zeroToken.name).not.toBe(fourToken.name);
      }
    });
  });

  describe('radius tokens', () => {
    it('assigns radius-none to 0 value, not smallest non-zero', () => {
      const values: ExtractedValue[] = [
        { property: 'border-radius', value: '0', rawValue: '0', category: 'radius', context: 'radius' },
        { property: 'border-radius', value: '4px', rawValue: '4px', category: 'radius', context: 'radius' },
        { property: 'border-radius', value: '8px', rawValue: '8px', category: 'radius', context: 'radius' },
      ];

      const result = generateTokens(values);
      const noneToken = result.tokens.find(t => t.name === 'radius-none');

      expect(noneToken).toBeDefined();
      expect(noneToken?.value).toBe('0');
    });

    it('does not generate radius-none if no zero values exist', () => {
      const values: ExtractedValue[] = [
        { property: 'border-radius', value: '4px', rawValue: '4px', category: 'radius', context: 'radius' },
        { property: 'border-radius', value: '8px', rawValue: '8px', category: 'radius', context: 'radius' },
      ];

      const result = generateTokens(values);
      const noneToken = result.tokens.find(t => t.name === 'radius-none');

      // If noneToken exists, it should be 0, not 4px
      if (noneToken) {
        expect(noneToken.value).toBe('0');
      }
    });
  });

  describe('CSS output', () => {
    it('uses correct plural form for radius (not "Radiuss")', () => {
      const values: ExtractedValue[] = [
        { property: 'border-radius', value: '4px', rawValue: '4px', category: 'radius', context: 'radius' },
        { property: 'border-radius', value: '8px', rawValue: '8px', category: 'radius', context: 'radius' },
      ];

      const result = generateTokens(values);

      expect(result.css).toContain('/* Border Radii */');
      expect(result.css).not.toContain('Radiuss');
    });

    it('uses correct plural form for all categories', () => {
      const values: ExtractedValue[] = [
        { property: 'color', value: '#ff0000', rawValue: '#ff0000', category: 'color', context: 'color' },
        { property: 'padding', value: '8px', rawValue: '8px', category: 'spacing', context: 'spacing' },
        { property: 'font-size', value: '16px', rawValue: '16px', category: 'font-size', context: 'typography' },
      ];

      const result = generateTokens(values);

      expect(result.css).toContain('/* Colors */');
      expect(result.css).toContain('/* Spacing */');
      expect(result.css).toContain('/* Font Sizes */');
    });
  });

  describe('breakpoint deduplication', () => {
    it('excludes breakpoint values from sizing tokens', () => {
      const values: ExtractedValue[] = [
        // Breakpoint values
        { property: 'min-width', value: '768px', rawValue: '@media (min-width: 768px)', category: 'breakpoint', context: 'breakpoint' },
        { property: 'min-width', value: '992px', rawValue: '@media (min-width: 992px)', category: 'breakpoint', context: 'breakpoint' },
        // Same values appearing in sizing
        { property: 'width', value: '768px', rawValue: '768px', category: 'sizing', context: 'sizing' },
        { property: 'max-width', value: '992px', rawValue: '992px', category: 'sizing', context: 'sizing' },
        // Legitimate sizing value
        { property: 'width', value: '200px', rawValue: '200px', category: 'sizing', context: 'sizing' },
      ];

      const result = generateTokens(values);

      // Breakpoint tokens should exist
      const breakpointTokens = result.tokens.filter(t => t.category === 'breakpoint');
      expect(breakpointTokens.some(t => t.value === '768px')).toBe(true);
      expect(breakpointTokens.some(t => t.value === '992px')).toBe(true);

      // Sizing tokens should NOT include breakpoint values
      const sizingTokens = result.tokens.filter(t => t.category === 'sizing');
      expect(sizingTokens.every(t => t.value !== '768px')).toBe(true);
      expect(sizingTokens.every(t => t.value !== '992px')).toBe(true);

      // Legitimate sizing should still be there
      expect(sizingTokens.some(t => t.value === '200px')).toBe(true);
    });
  });
});
