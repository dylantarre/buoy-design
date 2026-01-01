/**
 * Tests for Directive Style Extractor
 * Covers Vue :style, v-bind:style, Angular [style.x], [ngStyle] bindings
 */

import { describe, it, expect } from 'vitest';
import {
  extractAngularStyleBindings,
  extractNgStyleBindings,
  extractVueStyleBindings,
  extractDirectiveStyles,
} from './directive-style.js';

describe('extractAngularStyleBindings', () => {
  describe('basic [style.property] bindings', () => {
    it('extracts [style.background] with string literal', () => {
      const content = `<div [style.background]="'red'"></div>`;
      const result = extractAngularStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('background: red');
    });

    it('extracts [style.color] with hex value', () => {
      const content = `<div [style.color]="'#ff0000'"></div>`;
      const result = extractAngularStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('color: #ff0000');
    });

    it('extracts multiple style bindings on same element', () => {
      const content = `<div [style.width]="'100px'" [style.height]="'50px'"></div>`;
      const result = extractAngularStyleBindings(content);
      expect(result).toHaveLength(2);
    });
  });

  describe('[style.property.unit] bindings (Angular-specific)', () => {
    it('extracts [style.height.px] with numeric value', () => {
      const content = `<div [style.height.px]="size"></div>`;
      const result = extractAngularStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('height: size px');
    });

    it('extracts [style.width.px] with literal number', () => {
      const content = `<div [style.width.px]="100"></div>`;
      const result = extractAngularStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('width: 100px');
    });

    it('extracts [style.marginTop.px] with expression', () => {
      const content = `<div [style.marginTop.px]="isMobile() ? 56 : 0"></div>`;
      const result = extractAngularStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('marginTop:');
    });

    it('extracts [style.fontSize.em] with value', () => {
      const content = `<div [style.fontSize.em]="1.5"></div>`;
      const result = extractAngularStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('fontSize: 1.5em');
    });

    it('extracts [style.padding.rem] with value', () => {
      const content = `<div [style.padding.rem]="2"></div>`;
      const result = extractAngularStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('padding: 2rem');
    });

    it('extracts [style.width.%] (percent unit)', () => {
      const content = `<div [style.width.%]="50"></div>`;
      const result = extractAngularStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('width: 50%');
    });
  });

  describe('ternary expressions', () => {
    it('extracts style with ternary returning string literals', () => {
      const content = `<div [style.display]="visible ? 'block' : 'none'"></div>`;
      const result = extractAngularStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('display:');
    });
  });
});

describe('extractNgStyleBindings', () => {
  it('extracts [ngStyle] with object literal', () => {
    const content = `<div [ngStyle]="{ 'color': 'red', 'padding': '16px' }"></div>`;
    const result = extractNgStyleBindings(content);
    expect(result).toHaveLength(1);
    expect(result[0]!.css).toContain('color: red');
    expect(result[0]!.css).toContain('padding: 16px');
  });

  it('extracts [ngStyle] with camelCase properties', () => {
    const content = `<div [ngStyle]="{ 'backgroundColor': '#fff', 'fontSize': '14px' }"></div>`;
    const result = extractNgStyleBindings(content);
    expect(result).toHaveLength(1);
    expect(result[0]!.css).toContain('backgroundColor: #fff');
  });
});

describe('extractVueStyleBindings', () => {
  describe('basic :style bindings', () => {
    it('extracts :style with simple object', () => {
      const content = `<div :style="{ color: 'red' }"></div>`;
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('color: red');
    });

    it('extracts v-bind:style with object', () => {
      const content = `<div v-bind:style="{ backgroundColor: '#fff' }"></div>`;
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('backgroundColor: #fff');
    });

    it('extracts :style with multiple properties', () => {
      const content = `<div :style="{ color: 'red', padding: '16px' }"></div>`;
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('color: red');
      expect(result[0]!.css).toContain('padding: 16px');
    });
  });

  describe('template literal style bindings', () => {
    it('extracts :style with simple template literal', () => {
      const content = '<div :style="`color: red`"></div>';
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('color: red');
    });

    it('extracts :style with template literal containing expression', () => {
      const content = '<div :style="`right: ${offset}px`"></div>';
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('right:');
    });

    it('extracts :style with template literal containing calc', () => {
      const content = '<div :style="`right: calc(${review} - 32px)`"></div>';
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('right:');
      expect(result[0]!.css).toContain('calc');
    });
  });

  describe('multi-line style objects', () => {
    it('extracts :style spanning multiple lines', () => {
      const content = `<div
        :style="{
          background: gradient.length > 1
            ? \`linear-gradient(0deg, \${gradient})\`
            : gradient[0],
          border: '2px solid'
        }"
      ></div>`;
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('border: 2px solid');
    });

    it('extracts multi-line :style with simple properties', () => {
      const content = `<v-card
        :style="{
          minHeight: '100%',
          padding: '16px'
        }"
      ></v-card>`;
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('minHeight: 100%');
      expect(result[0]!.css).toContain('padding: 16px');
    });
  });

  describe('plain style attributes', () => {
    it('extracts plain style attribute', () => {
      const content = `<div style="color: red; padding: 16px"></div>`;
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('color: red; padding: 16px');
    });

    it('does not duplicate :style as plain style', () => {
      const content = `<div :style="{ color: 'red' }"></div>`;
      const result = extractVueStyleBindings(content);
      // Should only have one result from the :style binding
      expect(result).toHaveLength(1);
    });
  });
});

describe('extractDirectiveStyles (combined)', () => {
  it('extracts Angular and Vue styles from mixed content', () => {
    const content = `
      <div [style.color]="'red'"></div>
      <div :style="{ padding: '16px' }"></div>
    `;
    const result = extractDirectiveStyles(content);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('returns correct line numbers', () => {
    const content = `line1
line2
<div [style.color]="'red'"></div>`;
    const result = extractDirectiveStyles(content);
    expect(result).toHaveLength(1);
    expect(result[0]!.line).toBe(3);
  });
});
