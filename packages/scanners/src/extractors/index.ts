/**
 * Framework Router
 * Routes template types to the appropriate style extractor.
 */

import { extractAllHtmlStyles, type StyleMatch } from './html-style.js';
import { extractJsxStyleObjects } from './jsx-style.js';
import { extractDirectiveStyles, extractAngularStyleBindings, extractVueStyleBindings } from './directive-style.js';

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
      // For now, just use HTML-like extraction
      // TODO: Add style:prop extraction
      return extractAllHtmlStyles(content);

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
export { extractClassPatterns, analyzePatternForTokens, type ClassPatternMatch } from './class-pattern.js';
