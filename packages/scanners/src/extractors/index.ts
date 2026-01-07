/**
 * Framework Router
 * Routes template types to the appropriate style extractor.
 */

import { extractAllHtmlStyles, type StyleMatch } from './html-style.js';
import { extractJsxStyleObjects } from './jsx-style.js';
import { extractDirectiveStyles, extractAngularStyleBindings, extractVueStyleBindings } from './directive-style.js';

/**
 * Extract Svelte style directives (style:prop={value} and style:prop="value")
 * Examples:
 *   <div style:color="red">
 *   <div style:padding={padding}>
 *   <div style:background-color="#fff">
 */
function extractSvelteStyleDirectives(content: string): StyleMatch[] {
  const matches: StyleMatch[] = [];
  
  // Match style:property="value" or style:property={value}
  // Handles kebab-case properties like style:background-color
  const styleDirectiveRegex = /style:([a-z-]+)=(?:{([^}]+)}|"([^"]+)"|'([^']+)')/g;
  
  let match;
  while ((match = styleDirectiveRegex.exec(content)) !== null) {
    const property = match[1];
    // Value can be in curly braces {value}, double quotes "value", or single quotes 'value'
    const value = match[2] || match[3] || match[4];
    
    if (!property || !value) continue;
    
    // Skip dynamic expressions in curly braces that are likely variables
    if (match[2] && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value.trim())) {
      // This is a variable reference, skip it
      continue;
    }
    
    // Calculate line and column
    const beforeMatch = content.slice(0, match.index);
    const lines = beforeMatch.split('\n');
    const line = lines.length;
    const lastLine = lines[lines.length - 1] || '';
    const column = lastLine.length + 1;
    
    matches.push({
      css: `${property}: ${value.trim()}`,
      line,
      column,
      context: 'inline',
    });
  }
  
  return matches;
}

export { type StyleMatch } from './html-style.js';

/**
 * Syntax family for template types
 */
export type SyntaxFamily = 'html-like' | 'jsx' | 'vue' | 'angular' | 'svelte';

/**
 * Template types supported by the extractors
 */
export type TemplateType =
  // Server-side templates (HTML-like)
  | 'blade' | 'erb' | 'twig' | 'php' | 'html' | 'njk' | 'razor' | 'hbs' | 'mustache'
  | 'ejs' | 'pug' | 'liquid' | 'slim' | 'haml' | 'jinja' | 'django' | 'thymeleaf'
  | 'freemarker' | 'go-template' | 'edge' | 'eta' | 'heex' | 'velocity' | 'xslt'
  // JS frameworks
  | 'astro' | 'solid' | 'qwik' | 'marko' | 'lit' | 'fast' | 'angular' | 'stencil'
  | 'alpine' | 'htmx' | 'react' | 'preact'
  // Vue/Svelte (special handling)
  | 'vue' | 'svelte'
  // Static site generators
  | 'hugo' | 'jekyll' | 'eleventy' | 'shopify'
  // Documentation
  | 'markdown' | 'mdx' | 'asciidoc'
  // Graphics
  | 'svg'
  // Data templates
  | 'yaml-template' | 'json-template'
  // CSS files
  | 'css' | 'scss' | 'sass' | 'less';

/**
 * Determine the syntax family for a template type
 */
export function getSyntaxFamily(templateType: TemplateType): SyntaxFamily {
  switch (templateType) {
    // JSX-based frameworks
    case 'react':
    case 'preact':
    case 'solid':
    case 'qwik':
    case 'astro':
    case 'mdx':
      return 'jsx';

    // Vue
    case 'vue':
      return 'vue';

    // Angular
    case 'angular':
      return 'angular';

    // Svelte
    case 'svelte':
      return 'svelte';

    // Everything else is HTML-like
    default:
      return 'html-like';
  }
}

/**
 * Extract styles from content based on template type
 */
export function extractStyles(content: string, templateType: TemplateType): StyleMatch[] {
  const family = getSyntaxFamily(templateType);

  switch (family) {
    case 'jsx':
      // JSX can have both style={{ }} and style="..." (in Astro/MDX)
      return [
        ...extractJsxStyleObjects(content),
        ...extractAllHtmlStyles(content),
      ];

    case 'vue':
      // Vue has :style bindings, v-bind:style, and plain style
      return [
        ...extractVueStyleBindings(content),
        ...extractAllHtmlStyles(content),
      ];

    case 'angular':
      // Angular has [style.x], [ngStyle], and plain style
      return [
        ...extractAngularStyleBindings(content),
        ...extractDirectiveStyles(content),
        ...extractAllHtmlStyles(content),
      ];

    case 'svelte':
      // Svelte has style:prop and plain style
      return [
        ...extractSvelteStyleDirectives(content),
        ...extractAllHtmlStyles(content),
      ];

    case 'html-like':
    default:
      return extractAllHtmlStyles(content);
  }
}

/**
 * Extract styles from a CSS file (just returns the content as-is)
 */
export function extractCssFileStyles(content: string): StyleMatch[] {
  return [{
    css: content,
    line: 1,
    column: 1,
    context: 'style-block',
  }];
}

// Re-export individual extractors for direct use
export { extractAllHtmlStyles, extractHtmlStyleAttributes, extractStyleBlocks } from './html-style.js';
export { extractJsxStyleObjects } from './jsx-style.js';
export { extractDirectiveStyles, extractAngularStyleBindings, extractVueStyleBindings, extractNgStyleBindings } from './directive-style.js';
export {
  extractClassPatterns,
  analyzePatternForTokens,
  extractCvaPatterns,
  extractSemanticTokens,
  extractStaticClassStrings,
  extractBemSemanticClasses,
  extractCustomPrefixClasses,
  extractDataAttributePatterns,
  extractHeadlessUIVariants,
  extractGroupPeerVariants,
  extractDataSlotAttributes,
  extractShortFormDataPatterns,
  extractDynamicDataAttributes,
  extractRenderPropClassNames,
  type ClassPatternMatch,
  type CvaPattern,
  type StaticClassStrings,
  type BemSemanticClass,
  type DataAttributePattern,
  type HeadlessUIVariant,
  type GroupPeerVariant,
  type DataSlotAttribute,
  type ShortFormDataPattern,
  type DynamicDataAttribute,
  type RenderPropClassName,
  type ConditionalClass,
} from './class-pattern.js';
