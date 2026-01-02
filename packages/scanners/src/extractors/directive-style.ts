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
 * [style.--custom-prop]="value" (CSS custom properties)
 * '[style.x]': 'value' (host binding syntax in decorators)
 */
export function extractAngularStyleBindings(content: string): StyleMatch[] {
  const matches: StyleMatch[] = [];
  const lines = content.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]!;
    let match;

    // Match [style.property]="value" with double quotes
    // Handles: regular props, hyphenated props, CSS custom properties (--var)
    const doubleQuoteRegex =
      /\[style\.((?:--)?[a-zA-Z][a-zA-Z0-9-]*)(?:\.([a-zA-Z%]+))?\]\s*=\s*"([^"]*)"/g;

    while ((match = doubleQuoteRegex.exec(line)) !== null) {
      const prop = match[1];
      const unit = match[2];
      let value = match[3];

      if (!prop || value === undefined) continue;

      matches.push(
        processAngularMatch(prop, unit, value, lineNum, match.index)
      );
    }

    // Match [style.property]='value' with single quotes (less common)
    const singleQuoteRegex =
      /\[style\.((?:--)?[a-zA-Z][a-zA-Z0-9-]*)(?:\.([a-zA-Z%]+))?\]\s*=\s*'([^']*)'/g;

    while ((match = singleQuoteRegex.exec(line)) !== null) {
      const prop = match[1];
      const unit = match[2];
      let value = match[3];

      if (!prop || value === undefined) continue;

      matches.push(
        processAngularMatch(prop, unit, value, lineNum, match.index)
      );
    }

    // Match Angular host binding syntax: '[style.x]': 'value'
    // Used in @Component({ host: { '[style.x]': 'expr' } })
    const hostBindingRegex =
      /'\[style\.((?:--)?[a-zA-Z][a-zA-Z0-9-]*)(?:\.([a-zA-Z%]+))?\]'\s*:\s*'([^']*)'/g;

    while ((match = hostBindingRegex.exec(line)) !== null) {
      const prop = match[1];
      const unit = match[2];
      let value = match[3];

      if (!prop || value === undefined) continue;

      // Handle value extraction - host bindings may have double quotes around string values
      value = value.trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }

      // If there's a unit suffix (like px, em, rem, %)
      if (unit && CSS_UNITS.has(unit)) {
        if (/^-?\d+\.?\d*$/.test(value)) {
          value = `${value}${unit}`;
        } else {
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

    // Match @HostBinding('style.property') decorator syntax
    // @HostBinding('style.height') height: string;
    // @HostBinding('style.width.px') width: number;
    // @HostBinding('style.--custom-prop') customProp: string;
    // @HostBinding('style') get hostStyle() {
    // Supports both single and double quotes around the binding string
    const hostBindingDecoratorRegex =
      /@HostBinding\s*\(\s*['"]style(?:\.((?:--)?[a-zA-Z][a-zA-Z0-9-]*)(?:\.([a-zA-Z%]+))?)?['"]\s*\)/g;

    while ((match = hostBindingDecoratorRegex.exec(line)) !== null) {
      const prop = match[1]; // May be undefined for @HostBinding('style')
      const unit = match[2];

      if (!prop) {
        // @HostBinding('style') - binding entire style object
        matches.push({
          css: '[style-object]',
          line: lineNum + 1,
          column: match.index + 1,
          context: 'inline',
        });
      } else {
        // @HostBinding('style.property') or @HostBinding('style.property.unit')
        let value = '[bound]';
        if (unit && CSS_UNITS.has(unit)) {
          value = `[bound] ${unit}`;
        }

        matches.push({
          css: `${prop}: ${value}`,
          line: lineNum + 1,
          column: match.index + 1,
          context: 'inline',
        });
      }
    }
  }

  return matches;
}

/**
 * Process an Angular style match and return a StyleMatch
 */
function processAngularMatch(
  prop: string,
  unit: string | undefined,
  rawValue: string,
  lineNum: number,
  column: number
): StyleMatch {
  let value = rawValue.trim();

  // Remove surrounding single quotes from string literals like "'red'" -> "red"
  if (value.startsWith("'") && value.endsWith("'")) {
    value = value.slice(1, -1);
  }
  // Also handle nested double quotes like '"none"' -> "none"
  if (value.startsWith('"') && value.endsWith('"')) {
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

  return {
    css: `${prop}: ${value}`,
    line: lineNum + 1,
    column: column + 1,
    context: 'inline',
  };
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
 * :style='{ color: "red" }' (single-quoted attribute)
 * :style="`color: red`" (template literals)
 * :style="[{ color: 'red' }, styleObj]" (array bindings)
 * :style="{ opacity: isHovering ? 1 : 0 }" (dynamic values)
 * :style="style" (direct variable/computed property binding)
 * :style="'color: red'" (string literal binding)
 * :style="isActive ? activeStyle : inactiveStyle" (ternary bindings)
 * Multi-line support
 */
export function extractVueStyleBindings(content: string): StyleMatch[] {
  const matches: StyleMatch[] = [];
  let match;
  // Track what we've already processed to avoid duplicates
  const processedRanges: Array<{ start: number; end: number }> = [];

  const isOverlapping = (start: number, end: number): boolean => {
    return processedRanges.some(
      (r) =>
        (start >= r.start && start < r.end) ||
        (end > r.start && end <= r.end) ||
        (start <= r.start && end >= r.end)
    );
  };

  // Match :style="{ ... }" or v-bind:style="{ ... }" - including multi-line (double-quoted)
  const vueStyleObjectDoubleQuoteRegex =
    /(?::|v-bind:)style\s*=\s*"\{([\s\S]*?)\}"/g;

  while ((match = vueStyleObjectDoubleQuoteRegex.exec(content)) !== null) {
    const objectContent = match[1];
    if (!objectContent) continue;

    const css = parseStyleObjectExtended(objectContent);
    if (css) {
      const beforeMatch = content.slice(0, match.index);
      const lineNum = beforeMatch.split('\n').length;

      processedRanges.push({
        start: match.index,
        end: match.index + match[0].length,
      });
      matches.push({
        css,
        line: lineNum,
        column: 1,
        context: 'inline',
      });
    }
  }

  // Match :style='{ ... }' or v-bind:style='{ ... }' (single-quoted attribute)
  const vueStyleObjectSingleQuoteRegex =
    /(?::|v-bind:)style\s*=\s*'\{([\s\S]*?)\}'/g;

  while ((match = vueStyleObjectSingleQuoteRegex.exec(content)) !== null) {
    const objectContent = match[1];
    if (!objectContent) continue;

    const css = parseStyleObjectExtended(objectContent);
    if (css) {
      const beforeMatch = content.slice(0, match.index);
      const lineNum = beforeMatch.split('\n').length;

      processedRanges.push({
        start: match.index,
        end: match.index + match[0].length,
      });
      matches.push({
        css,
        line: lineNum,
        column: 1,
        context: 'inline',
      });
    }
  }

  // Match :style="[...]" or v-bind:style="[...]" (array bindings)
  // Extract objects from array binding
  const vueStyleArrayRegex = /(?::|v-bind:)style\s*=\s*"\[([\s\S]*?)\]"/g;

  while ((match = vueStyleArrayRegex.exec(content)) !== null) {
    const arrayContent = match[1];
    if (!arrayContent) continue;

    processedRanges.push({
      start: match.index,
      end: match.index + match[0].length,
    });

    // Extract all object literals from the array
    const objectMatches = arrayContent.match(/\{[^{}]*\}/g);
    if (objectMatches) {
      for (const objMatch of objectMatches) {
        // Remove surrounding braces to get content
        const objContent = objMatch.slice(1, -1);
        const css = parseStyleObjectExtended(objContent);
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
    }
  }

  // Match :style="`...`" or v-bind:style="`...`" (template literals in double quotes)
  // Template literals may contain ${...} expressions
  // Use \x60 (hex for backtick) to avoid regex literal parsing issues with backticks
  const templateLiteralDoubleQuoteRegex =
    /(?::|v-bind:)style\s*=\s*"\x60([^\x60]*)\x60"/g;
  while ((match = templateLiteralDoubleQuoteRegex.exec(content)) !== null) {
    const templateContent = match[1];
    if (!templateContent) continue;

    const beforeMatch = content.slice(0, match.index);
    const lineNum = beforeMatch.split('\n').length;

    processedRanges.push({
      start: match.index,
      end: match.index + match[0].length,
    });
    matches.push({
      css: templateContent.trim(),
      line: lineNum,
      column: 1,
      context: 'inline',
    });
  }

  // Match :style='`...`' (template literals in single quotes)
  const templateLiteralSingleQuoteRegex =
    /(?::|v-bind:)style\s*=\s*'\x60([^\x60]*)\x60'/g;
  while ((match = templateLiteralSingleQuoteRegex.exec(content)) !== null) {
    const templateContent = match[1];
    if (!templateContent) continue;

    const beforeMatch = content.slice(0, match.index);
    const lineNum = beforeMatch.split('\n').length;

    processedRanges.push({
      start: match.index,
      end: match.index + match[0].length,
    });
    matches.push({
      css: templateContent.trim(),
      line: lineNum,
      column: 1,
      context: 'inline',
    });
  }

  // Match :style="'...'" or v-bind:style="'...'" (string literal bindings)
  // The value is a CSS string wrapped in single quotes inside double quotes
  const stringLiteralDoubleQuoteRegex =
    /(?::|v-bind:)style\s*=\s*"'([^']+)'"/g;
  while ((match = stringLiteralDoubleQuoteRegex.exec(content)) !== null) {
    if (isOverlapping(match.index, match.index + match[0].length)) continue;

    const cssString = match[1];
    if (!cssString) continue;

    const beforeMatch = content.slice(0, match.index);
    const lineNum = beforeMatch.split('\n').length;

    processedRanges.push({
      start: match.index,
      end: match.index + match[0].length,
    });
    matches.push({
      css: cssString.trim(),
      line: lineNum,
      column: 1,
      context: 'inline',
    });
  }

  // Match :style='"..."' (string literal with double quotes inside single quotes)
  const stringLiteralSingleQuoteRegex =
    /(?::|v-bind:)style\s*=\s*'"([^"]+)"'/g;
  while ((match = stringLiteralSingleQuoteRegex.exec(content)) !== null) {
    if (isOverlapping(match.index, match.index + match[0].length)) continue;

    const cssString = match[1];
    if (!cssString) continue;

    const beforeMatch = content.slice(0, match.index);
    const lineNum = beforeMatch.split('\n').length;

    processedRanges.push({
      start: match.index,
      end: match.index + match[0].length,
    });
    matches.push({
      css: cssString.trim(),
      line: lineNum,
      column: 1,
      context: 'inline',
    });
  }

  // Match ternary expressions: :style="condition ? a : b"
  // This captures the entire ternary for indication purposes
  const ternaryStyleRegex =
    /(?::|v-bind:)style\s*=\s*"([^"]*\?[^"]*:[^"]*)"/g;
  while ((match = ternaryStyleRegex.exec(content)) !== null) {
    if (isOverlapping(match.index, match.index + match[0].length)) continue;

    const ternaryExpr = match[1];
    if (!ternaryExpr) continue;

    const beforeMatch = content.slice(0, match.index);
    const lineNum = beforeMatch.split('\n').length;

    processedRanges.push({
      start: match.index,
      end: match.index + match[0].length,
    });
    matches.push({
      css: '[ternary]',
      line: lineNum,
      column: 1,
      context: 'inline',
    });
  }

  // Match direct variable/computed property bindings: :style="varName" or :style="obj.prop"
  // Must NOT be an object literal, array, template literal, or string literal
  // Pattern: starts with letter or _, may contain dots for property access, may end with ()
  const computedStyleRegex =
    /(?::|v-bind:)style\s*=\s*"([a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*(?:\(\))?)"/g;
  while ((match = computedStyleRegex.exec(content)) !== null) {
    if (isOverlapping(match.index, match.index + match[0].length)) continue;

    const varName = match[1];
    if (!varName) continue;

    const beforeMatch = content.slice(0, match.index);
    const lineNum = beforeMatch.split('\n').length;

    processedRanges.push({
      start: match.index,
      end: match.index + match[0].length,
    });
    matches.push({
      css: `[computed: ${varName}]`,
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
 * Extended style object parser that handles Vue's dynamic values
 * Supports: quoted values, template literals, ternary expressions, function calls
 * { opacity: isHovering ? 1 : 0 } → "opacity: [dynamic]"
 * { background: `rgb(${r}, ${g}, ${b})` } → "background: rgb(${r}, ${g}, ${b})"
 */
function parseStyleObjectExtended(objectContent: string): string {
  const cssProps: string[] = [];

  // First, try to match quoted string values (standard case)
  // 'property': 'value' or property: 'value' or "property": "value"
  const quotedPropRegex = /['"]?([a-zA-Z-]+)['"]?\s*:\s*['"]([^'"]+)['"]/g;
  let match;
  const processedProps = new Set<string>();

  while ((match = quotedPropRegex.exec(objectContent)) !== null) {
    const prop = match[1];
    const value = match[2];

    if (!prop || !value) continue;

    // Skip dynamic expressions (but allow color names and CSS keywords)
    if (
      /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value) &&
      !isColorName(value) &&
      !isCssKeyword(value)
    ) {
      continue;
    }

    cssProps.push(`${prop}: ${value}`);
    processedProps.add(prop);
  }

  // Match template literal values: property: `...`
  const templateLiteralRegex = /['"]?([a-zA-Z-]+)['"]?\s*:\s*`([^`]*)`/g;
  while ((match = templateLiteralRegex.exec(objectContent)) !== null) {
    const prop = match[1];
    const value = match[2];

    if (!prop || processedProps.has(prop)) continue;

    cssProps.push(`${prop}: ${value}`);
    processedProps.add(prop);
  }

  // Match dynamic values: property: expression (no quotes)
  // This catches ternary expressions, function calls, variables, etc.
  // Pattern: property: (anything until comma or end of object)
  const dynamicPropRegex =
    /['"]?([a-zA-Z-]+)['"]?\s*:\s*([^,'"}`][^,}]*?)(?:,|\s*$)/g;
  while ((match = dynamicPropRegex.exec(objectContent)) !== null) {
    const prop = match[1];
    const value = match[2]?.trim();

    if (!prop || !value || processedProps.has(prop)) continue;

    // Skip if this is a quoted value we should have caught earlier
    if (value.startsWith("'") || value.startsWith('"')) continue;

    cssProps.push(`${prop}: [dynamic]`);
    processedProps.add(prop);
  }

  return cssProps.join('; ');
}

/**
 * Check if a value is a CSS keyword (not a variable)
 */
function isCssKeyword(value: string): boolean {
  const keywords = new Set([
    // Display
    'block',
    'inline',
    'inline-block',
    'inline-flex',
    'inline-grid',
    'flex',
    'grid',
    'contents',
    'flow-root',
    'table',
    'table-row',
    'table-cell',
    'list-item',
    // Visibility
    'none',
    'hidden',
    'visible',
    'collapse',
    // Position
    'absolute',
    'relative',
    'fixed',
    'sticky',
    'static',
    // Box sizing
    'border-box',
    'content-box',
    // Text alignment
    'left',
    'right',
    'center',
    'justify',
    'start',
    'end',
    // Vertical alignment
    'top',
    'middle',
    'bottom',
    'baseline',
    'sub',
    'super',
    'text-top',
    'text-bottom',
    // Flexbox direction
    'row',
    'row-reverse',
    'column',
    'column-reverse',
    // Flexbox wrap
    'wrap',
    'nowrap',
    'wrap-reverse',
    // Flexbox/Grid alignment
    'stretch',
    'space-between',
    'space-around',
    'space-evenly',
    'flex-start',
    'flex-end',
    // Overflow
    'scroll',
    'clip',
    'overlay',
    // Cursor
    'pointer',
    'default',
    'move',
    'text',
    'wait',
    'help',
    'crosshair',
    'not-allowed',
    'grab',
    'grabbing',
    'zoom-in',
    'zoom-out',
    'progress',
    'cell',
    'copy',
    'alias',
    'context-menu',
    'vertical-text',
    'no-drop',
    'all-scroll',
    'col-resize',
    'row-resize',
    'n-resize',
    's-resize',
    'e-resize',
    'w-resize',
    'ne-resize',
    'nw-resize',
    'se-resize',
    'sw-resize',
    'ew-resize',
    'ns-resize',
    'nesw-resize',
    'nwse-resize',
    // White space
    'normal',
    'pre',
    'pre-wrap',
    'pre-line',
    'break-spaces',
    // Word break / overflow wrap
    'break-word',
    'break-all',
    'keep-all',
    'anywhere',
    // Text overflow
    'ellipsis',
    // Text transform
    'uppercase',
    'lowercase',
    'capitalize',
    'full-width',
    'full-size-kana',
    // Text decoration
    'underline',
    'overline',
    'line-through',
    'blink',
    'dotted',
    'dashed',
    'solid',
    'double',
    'wavy',
    // Font style
    'italic',
    'oblique',
    // Font weight
    'bold',
    'bolder',
    'lighter',
    // Generic keywords
    'auto',
    'inherit',
    'initial',
    'unset',
    'revert',
    'revert-layer',
    // Object fit
    'fill',
    'contain',
    'cover',
    'scale-down',
    // Background
    'repeat',
    'repeat-x',
    'repeat-y',
    'no-repeat',
    'round',
    'space',
    'local',
    'scroll',
    'fixed',
    'padding-box',
    'border-box',
    'content-box',
    // Resize
    'both',
    'horizontal',
    'vertical',
    // User select
    'all',
    'contain',
    // Pointer events
    'painted',
    'stroke',
    'visiblePainted',
    'visibleFill',
    'visibleStroke',
    // Writing mode / direction
    'ltr',
    'rtl',
    'horizontal-tb',
    'vertical-rl',
    'vertical-lr',
    // Mix blend mode
    'multiply',
    'screen',
    'overlay',
    'darken',
    'lighten',
    'color-dodge',
    'color-burn',
    'hard-light',
    'soft-light',
    'difference',
    'exclusion',
    'hue',
    'saturation',
    'color',
    'luminosity',
    // Animation
    'running',
    'paused',
    'forwards',
    'backwards',
    'alternate',
    'alternate-reverse',
    'infinite',
    'linear',
    'ease',
    'ease-in',
    'ease-out',
    'ease-in-out',
    'step-start',
    'step-end',
  ]);
  return keywords.has(value.toLowerCase());
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
