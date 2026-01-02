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

// =====================================
// NEW TESTS FOR REAL-WORLD PATTERNS
// =====================================

describe('Angular advanced patterns from angular/components', () => {
  describe('hyphenated property names with units', () => {
    it('extracts [style.margin-left.px] with value', () => {
      const content = `<div [style.margin-left.px]="10"></div>`;
      const result = extractAngularStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('margin-left: 10px');
    });

    it('extracts [style.margin-right.px] with variable', () => {
      const content = `<div [style.margin-right.px]="_container._contentMargins.right"></div>`;
      const result = extractAngularStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('margin-right:');
    });

    it('extracts [style.background-color] with CSS variable', () => {
      const content = `<div [style.background-color]="'var(--mat-sys-primary)'"></div>`;
      const result = extractAngularStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('background-color: var(--mat-sys-primary)');
    });

    it('extracts [style.margin-bottom.px] with item.margin', () => {
      const content = `<div [style.margin-bottom.px]="item.margin"></div>`;
      const result = extractAngularStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('margin-bottom:');
    });
  });

  describe('CSS custom properties (--var)', () => {
    it('extracts [style.--mat-tab-animation-duration]', () => {
      const content = `<div [style.--mat-tab-animation-duration]="animationDuration"></div>`;
      const result = extractAngularStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('--mat-tab-animation-duration:');
    });

    it('extracts [style.--custom-prop] with string value', () => {
      const content = `<div [style.--custom-prop]="'300ms'"></div>`;
      const result = extractAngularStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('--custom-prop: 300ms');
    });
  });

  describe('single-quoted attribute values', () => {
    it('extracts [style.color] with single-quoted attribute', () => {
      const content = `<div [style.color]='red'></div>`;
      const result = extractAngularStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('color: red');
    });

    it('extracts [style.width.px] with single-quoted attribute', () => {
      const content = `<div [style.width.px]='100'></div>`;
      const result = extractAngularStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('width: 100px');
    });
  });

  describe('Angular host binding syntax', () => {
    it('extracts host binding style.filter', () => {
      const content = `'[style.filter]': 'filter',`;
      const result = extractAngularStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('filter:');
    });

    it('extracts host binding style.outline with string', () => {
      const content = `'[style.outline]': '"none"',`;
      const result = extractAngularStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('outline: none');
    });

    it('extracts host binding style.width.px', () => {
      const content = `'[style.width.px]': 'width',`;
      const result = extractAngularStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('width:');
    });

    it('extracts host binding style.background-image with function call', () => {
      const content = `'[style.background-image]': '_getBackgroundImage()',`;
      const result = extractAngularStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('background-image:');
    });
  });

  describe('complex visibility expressions', () => {
    it('extracts [style.visibility] with complex ternary', () => {
      const content = `<div [style.visibility]="node.expandable ? 'visible' : 'hidden'"></div>`;
      const result = extractAngularStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('visibility:');
    });

    it('extracts [style.display] with ternary and flex', () => {
      const content = `<div [style.display]="shouldRender(node) ? 'flex' : 'none'"></div>`;
      const result = extractAngularStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('display:');
    });
  });
});

describe('Vue advanced patterns from vuetifyjs/vuetify', () => {
  describe('opacity expressions', () => {
    it('extracts :style with opacity ternary', () => {
      const content = `<div :style="{ opacity: isHovering || isCopying ? 1 : 0 }"></div>`;
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      // Should at least detect the style object, even if value is dynamic
    });
  });

  describe('CSS functions with expressions', () => {
    it('extracts :style with rgb() function containing variables', () => {
      const content = `<div :style="{ background: \`rgb(\${red}, \${green}, \${blue})\` }"></div>`;
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      // Should detect the style object
    });

    it('extracts :style with linear-gradient containing interpolation', () => {
      const content = `<div :style="{ background: \`linear-gradient(0deg, \${gradient})\` }"></div>`;
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      // Should detect the style object
    });
  });

  describe('grid and display styles', () => {
    it('extracts :style with display grid', () => {
      const content = `<div :style="{ width: '100%', display: 'grid' }"></div>`;
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('width: 100%');
      expect(result[0]!.css).toContain('display: grid');
    });
  });

  describe('function call values in :style', () => {
    it('extracts :style with dynamic top value', () => {
      const content = `<div :style="{ top: nowY() }"></div>`;
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      // Should detect the style object with function call
    });
  });

  describe('animationDuration style', () => {
    it('extracts :style with animationDuration variable', () => {
      const content = `<div :style="{ animationDuration: animationDuration }"></div>`;
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      // Should detect the style object
    });
  });

  describe('CSS custom properties in Vue :style', () => {
    it('extracts --progress CSS variable from :style object', () => {
      const content = `<div :style="{ '--progress': 'calc(50 * 1%)' }"></div>`;
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('--progress');
    });

    it('extracts multiple CSS custom properties', () => {
      const content = `<div :style="{ '--v-video-aspect-ratio': '16/9', '--v-btn-height': '48px' }"></div>`;
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('--v-video-aspect-ratio');
      expect(result[0]!.css).toContain('--v-btn-height');
    });

    it('extracts CSS custom property with template literal value', () => {
      const content = '<div :style="{ \'--v-icon-btn-rotate\': `${degrees}deg` }"></div>';
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('--v-icon-btn-rotate');
    });

    it('extracts CSS custom property with dynamic expression value', () => {
      const content = `<div :style="{ '--v-date-picker-days-in-week': weekdays.length }"></div>`;
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('--v-date-picker-days-in-week');
    });

    it('extracts CSS custom property mixed with regular properties', () => {
      const content = `<div :style="{
        width: '100%',
        '--progress': '50%',
        display: 'grid'
      }"></div>`;
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('width: 100%');
      expect(result[0]!.css).toContain('--progress');
      expect(result[0]!.css).toContain('display: grid');
    });
  });

  describe('Vue :style with single-quoted attribute', () => {
    it('extracts :style with single-quoted attribute value', () => {
      const content = `<div :style='{ color: "red" }'></div>`;
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('color: red');
    });

    it('extracts v-bind:style with single-quoted attribute value', () => {
      const content = `<div v-bind:style='{ padding: "16px" }'></div>`;
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('padding: 16px');
    });
  });

  describe('Vue :style array binding', () => {
    it('extracts objects from :style array binding', () => {
      const content = `<div :style="[{ color: 'red' }, { padding: '16px' }]"></div>`;
      const result = extractVueStyleBindings(content);
      expect(result.length).toBeGreaterThanOrEqual(1);
      // Should extract styles from array elements
    });
  });

  describe('Vue :style with CSS keyword values', () => {
    it('extracts textAlign center', () => {
      const content = `<div :style="{ textAlign: 'center' }"></div>`;
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('textAlign: center');
    });

    it('extracts textAlign left/right/justify', () => {
      const content = `<div :style="{ textAlign: 'left' }"></div>`;
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('textAlign: left');
    });

    it('extracts flexDirection row/column', () => {
      const content = `<div :style="{ flexDirection: 'column' }"></div>`;
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('flexDirection: column');
    });

    it('extracts flexWrap wrap/nowrap', () => {
      const content = `<div :style="{ flexWrap: 'wrap' }"></div>`;
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('flexWrap: wrap');
    });

    it('extracts justifyContent values', () => {
      const content = `<div :style="{ justifyContent: 'space-between' }"></div>`;
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('justifyContent: space-between');
    });

    it('extracts alignItems values', () => {
      const content = `<div :style="{ alignItems: 'stretch' }"></div>`;
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('alignItems: stretch');
    });

    it('extracts overflow scroll/clip', () => {
      const content = `<div :style="{ overflow: 'scroll' }"></div>`;
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('overflow: scroll');
    });

    it('extracts cursor pointer/default', () => {
      const content = `<div :style="{ cursor: 'pointer' }"></div>`;
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('cursor: pointer');
    });

    it('extracts whiteSpace nowrap/normal', () => {
      const content = `<div :style="{ whiteSpace: 'nowrap' }"></div>`;
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('whiteSpace: nowrap');
    });

    it('extracts boxSizing border-box', () => {
      const content = `<div :style="{ boxSizing: 'border-box' }"></div>`;
      const result = extractVueStyleBindings(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('boxSizing: border-box');
    });
  });
});
