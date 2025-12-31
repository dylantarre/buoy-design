// packages/core/src/tokenization/generator.test.ts
import { describe, it, expect } from 'vitest';
import { generateTokens } from './generator.js';
import type { ExtractedValue } from '../extraction/css-parser.js';

describe('generateTokens', () => {
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
});
