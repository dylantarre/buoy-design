/**
 * HTML-like Style Extractor
 * Extracts style="..." attributes from HTML-like templates.
 * Covers: Razor, Blade, ERB, Twig, PHP, EJS, Pug, Liquid, Jinja, Django,
 * Thymeleaf, Freemarker, Handlebars, Mustache, Nunjucks, Hugo, Jekyll, Eleventy
 */

export interface StyleMatch {
  css: string;
  line: number;
  column: number;
  context: 'inline' | 'style-block';
}

/**
 * Calculate line and column numbers from a position in the content
 */
function getLineAndColumn(content: string, position: number): { line: number; column: number } {
  const beforeMatch = content.slice(0, position);
  const lines = beforeMatch.split('\n');
  const line = lines.length;
  const lastLine = lines[lines.length - 1] || '';
  const column = lastLine.length + 1;
  return { line, column };
}

/**
 * Marker used to replace stripped content while preserving positions
 * Uses null characters which won't appear in actual content
 */
const STRIPPED_MARKER = '\0';

/**
 * Remove HTML comments from content while preserving line numbers
 * Replaces comment content with null characters to maintain position tracking
 */
function stripHtmlComments(content: string): string {
  // Match HTML comments: <!-- ... -->
  // Using [\s\S] to match across newlines
  return content.replace(/<!--[\s\S]*?-->/g, (match) => {
    // Replace with same-length string of markers to preserve positions
    return STRIPPED_MARKER.repeat(match.length);
  });
}

/**
 * Remove script tag contents from content while preserving line numbers
 * This prevents extracting style strings that appear inside JavaScript code
 */
function stripScriptTags(content: string): string {
  // Match script tags with any attributes: <script...>...</script>
  // Case insensitive, handles multiline content
  return content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, (match) => {
    // Replace with same-length string of markers to preserve positions
    return STRIPPED_MARKER.repeat(match.length);
  });
}

/**
 * Remove textarea tag contents from content while preserving line numbers
 * Textarea content is text, not rendered HTML, so we shouldn't extract styles from it
 */
function stripTextareaTags(content: string): string {
  // Match textarea tags with any attributes: <textarea...>...</textarea>
  // Case insensitive, handles multiline content
  return content.replace(/<textarea[^>]*>[\s\S]*?<\/textarea>/gi, (match) => {
    // Replace with same-length string of markers to preserve positions
    return STRIPPED_MARKER.repeat(match.length);
  });
}

/**
 * Strip CDATA wrappers from CSS content
 * CDATA sections are used in SVG/XML to escape CSS, but the wrapper isn't valid CSS
 */
function stripCdataWrapper(css: string): string {
  // Match <![CDATA[ ... ]]> wrapper and extract content
  // Handle whitespace around the wrapper
  const cdataMatch = css.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  if (cdataMatch) {
    return cdataMatch[1]!.trim();
  }
  return css;
}

/**
 * Preprocess content by removing comments, script tags, and textarea tags
 * This ensures we don't extract styles from non-HTML contexts
 */
function preprocessContent(content: string): string {
  // Order matters: strip comments first, then script/textarea tags
  let processed = stripHtmlComments(content);
  processed = stripScriptTags(processed);
  processed = stripTextareaTags(processed);
  return processed;
}

/**
 * Extract inline style attributes from HTML-like content
 * Supports multi-line style attributes by processing the entire content at once.
 */
export function extractHtmlStyleAttributes(content: string): StyleMatch[] {
  const matches: StyleMatch[] = [];

  // Preprocess to remove comments and script tags
  const processedContent = preprocessContent(content);

  // Match style="..." with double quotes
  // Use negative lookbehind to avoid matching data-style, ng-style, v-bind:style, :style, etc.
  // Use [\s\S] instead of [^"] to allow newlines in the value
  const doubleQuoteRegex = /(?<![:\w-])style\s*=\s*"((?:[^"\\]|\\.)*)"/gi;
  let match;

  while ((match = doubleQuoteRegex.exec(processedContent)) !== null) {
    const css = match[1];
    // Skip empty or whitespace-only values, and values that contain null markers
    if (css && css.trim() && !css.includes(STRIPPED_MARKER)) {
      // Use original content for line calculation to get correct line numbers
      const { line, column } = getLineAndColumn(content, match.index);
      matches.push({
        css,
        line,
        column,
        context: 'inline',
      });
    }
  }

  // Match style='...' with single quotes (allows nested double quotes)
  // Use [\s\S] instead of [^'] to allow newlines in the value
  const singleQuoteRegex = /(?<![:\w-])style\s*=\s*'((?:[^'\\]|\\.)*)'/gi;
  while ((match = singleQuoteRegex.exec(processedContent)) !== null) {
    const css = match[1];
    // Skip empty or whitespace-only values, and values that contain null markers
    if (css && css.trim() && !css.includes(STRIPPED_MARKER)) {
      // Use original content for line calculation to get correct line numbers
      const { line, column } = getLineAndColumn(content, match.index);
      matches.push({
        css,
        line,
        column,
        context: 'inline',
      });
    }
  }

  return matches;
}

/**
 * Extract <style> block contents from HTML-like content
 */
export function extractStyleBlocks(content: string): StyleMatch[] {
  const matches: StyleMatch[] = [];

  // Preprocess to remove comments and script tags
  const processedContent = preprocessContent(content);

  // Match <style>...</style> blocks
  const styleBlockRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let match;

  while ((match = styleBlockRegex.exec(processedContent)) !== null) {
    let css = match[1];
    // Skip empty or whitespace-only values, and values that contain null markers
    if (css && css.trim() && !css.includes(STRIPPED_MARKER)) {
      // Use original content for line calculation to get correct line numbers
      const beforeMatch = content.slice(0, match.index);
      const lineNum = beforeMatch.split('\n').length;

      // Strip CDATA wrappers from SVG/XML style blocks
      css = stripCdataWrapper(css.trim());

      // Skip if stripping CDATA left us with empty content
      if (css) {
        matches.push({
          css,
          line: lineNum,
          column: 1,
          context: 'style-block',
        });
      }
    }
  }

  return matches;
}

/**
 * Extract all styles from HTML-like content (inline + blocks)
 */
export function extractAllHtmlStyles(content: string): StyleMatch[] {
  return [
    ...extractHtmlStyleAttributes(content),
    ...extractStyleBlocks(content),
  ];
}
