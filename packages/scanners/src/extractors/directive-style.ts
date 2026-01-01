/**
 * Directive Style Extractor
 * Extracts style bindings from Angular and Vue templates.
 * Covers: Angular [style.x]="...", [style.x.unit]="...", [ngStyle]="...", Vue :style="..."
 */

import type { StyleMatch } from './html-style.js';

/**
 * CSS units supported by Angular [style.property.unit] syntax
 */
const CSS_UNITS = new Set([
  'px',
  'em',
  'rem',
  'vh',
  'vw',
  'vmin',
  'vmax',
  '%',
  'pt',
  'pc',
  'in',
  'cm',
  'mm',
  'ex',
  'ch',
  'fr',
  'deg',
  'rad',
  'grad',
  'turn',
  's',
  'ms',
]);

/**
 * Extract Angular-style property bindings
 * [style.color]="'red'" or [style.background-color]="bgColor"
 * [style.height.px]="100" (with unit suffix)
 */
export function extractAngularStyleBindings(content: string): StyleMatch[] {
  const matches: StyleMatch[] = [];
  const lines = content.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]!;

    // Match [style.property]="value" or [style.property.unit]="value"
    // Pattern: [style.prop]="..." or [style.prop.unit]="..."
    const bindingRegex =
      /\[style\.([a-zA-Z-]+)(?:\.([a-zA-Z%]+))?\]\s*=\s*"([^"]*)"/g;
    let match;

    while ((match = bindingRegex.exec(line)) !== null) {
      const prop = match[1];
      const unit = match[2];
      let value = match[3];

      if (!prop || value === undefined) continue;

      // Handle value extraction
      value = value.trim();

      // Remove surrounding single quotes from string literals like "'red'" -> "red"
      if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
      }

      // If there's a unit suffix (like px, em, rem, %)
      if (unit && CSS_UNITS.has(unit)) {
        // Check if value is a number - append unit directly
        if (/^-?\d+\.?\d*$/.test(value)) {
          value = `${value}${unit}`;
        } else {
          // It's an expression - append unit with space for readability
          value = `${value} ${unit}`;
        }
      }

      matches.push({
        css: `${prop}: ${value}`,
        line: lineNum + 1,
        column: match.index + 1,
        context: 'inline',
      });
    }
  }

  return matches;
}

/**
 * Extract Angular [ngStyle] bindings
 * [ngStyle]="{ 'color': 'red', 'padding': '16px' }"
 */
export function extractNgStyleBindings(content: string): StyleMatch[] {
  const matches: StyleMatch[] = [];

  // Match [ngStyle]="{ ... }" - handle multi-line with dotall flag
  const ngStyleRegex = /\[ngStyle\]\s*=\s*"\{([^}]+)\}"/gi;
  let match;

  while ((match = ngStyleRegex.exec(content)) !== null) {
    const objectContent = match[1];
    if (!objectContent) continue;

    const css = parseStyleObject(objectContent);
    if (css) {
      const beforeMatch = content.slice(0, match.index);
      const lineNum = beforeMatch.split('\n').length;

      matches.push({
        css,
        line: lineNum,
        column: 1,
        context: 'inline',
      });
    }
  }

  return matches;
}

/**
 * Extract Vue :style bindings
 * :style="{ color: 'red' }" or v-bind:style="{ ... }"
 * :style="`color: red`" (template literals)
 * Multi-line support
 */
export function extractVueStyleBindings(content: string): StyleMatch[] {
  const matches: StyleMatch[] = [];

  // Match :style="{ ... }" or v-bind:style="{ ... }" - including multi-line
  // Use a more permissive regex that handles nested braces carefully
  const vueStyleObjectRegex = /(?::|v-bind:)style\s*=\s*"\{([\s\S]*?)\}"/g;
  let match;

  while ((match = vueStyleObjectRegex.exec(content)) !== null) {
    const objectContent = match[1];
    if (!objectContent) continue;

    const css = parseStyleObject(objectContent);
    if (css) {
      const beforeMatch = content.slice(0, match.index);
      const lineNum = beforeMatch.split('\n').length;

      matches.push({
        css,
        line: lineNum,
        column: 1,
        context: 'inline',
      });
    }
  }

  // Match :style="`...`" or v-bind:style="`...`" (template literals)
  const templateLiteralRegex = /(?::|v-bind:)style\s*=\s*"`([^`]*)`"/g;
  while ((match = templateLiteralRegex.exec(content)) !== null) {
    const templateContent = match[1];
    if (!templateContent) continue;

    // Template literal content is raw CSS (possibly with ${} expressions)
    // Preserve the content as-is, including ${} placeholders
    const beforeMatch = content.slice(0, match.index);
    const lineNum = beforeMatch.split('\n').length;

    matches.push({
      css: templateContent.trim(),
      line: lineNum,
      column: 1,
      context: 'inline',
    });
  }

  // Also match plain style="..." which Vue also supports
  const plainStyleRegex = /\bstyle\s*=\s*"([^"]+)"/g;
  while ((match = plainStyleRegex.exec(content)) !== null) {
    // Skip if it's a binding (preceded by : or v-bind)
    const beforeMatch = content.slice(
      Math.max(0, match.index - 10),
      match.index
    );
    if (beforeMatch.includes(':') || beforeMatch.includes('v-bind')) continue;

    const css = match[1];
    if (css) {
      const beforeFull = content.slice(0, match.index);
      const lineNum = beforeFull.split('\n').length;

      matches.push({
        css,
        line: lineNum,
        column: 1,
        context: 'inline',
      });
    }
  }

  return matches;
}

/**
 * Extract all directive-based styles (Angular + Vue)
 */
export function extractDirectiveStyles(content: string): StyleMatch[] {
  return [
    ...extractAngularStyleBindings(content),
    ...extractNgStyleBindings(content),
    ...extractVueStyleBindings(content),
  ];
}

/**
 * Parse a style object notation to CSS
 * { 'color': 'red', 'padding': '16px' } → "color: red; padding: 16px"
 * Also handles unquoted keys: { color: 'red' }
 */
function parseStyleObject(objectContent: string): string {
  const cssProps: string[] = [];

  // Match both quoted and unquoted property names
  // 'property': 'value' or property: 'value' or "property": "value"
  const propRegex = /['"]?([a-zA-Z-]+)['"]?\s*:\s*['"]([^'"]+)['"]/g;
  let match;

  while ((match = propRegex.exec(objectContent)) !== null) {
    const prop = match[1];
    const value = match[2];

    if (!prop || !value) continue;

    // Skip dynamic expressions (but allow color names)
    if (
      /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value) &&
      !isColorName(value)
    ) {
      continue;
    }

    cssProps.push(`${prop}: ${value}`);
  }

  return cssProps.join('; ');
}

/**
 * Check if a value is a CSS color name
 */
function isColorName(value: string): boolean {
  const colorNames = new Set([
    'transparent',
    'currentcolor',
    'inherit',
    'black',
    'white',
    'red',
    'green',
    'blue',
    'yellow',
    'orange',
    'purple',
    'pink',
    'brown',
    'gray',
    'grey',
    'cyan',
    'magenta',
    'lime',
    'maroon',
    'navy',
    'olive',
    'teal',
    'aqua',
    'fuchsia',
    'silver',
  ]);
  return colorNames.has(value.toLowerCase());
}
