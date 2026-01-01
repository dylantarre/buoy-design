/**
 * Template Class Pattern Extractor
 * Extracts dynamic CSS class patterns from JSX/TSX template literals.
 * Detects patterns like:
 *   - className={`${prefix}-${variant}`}
 *   - className={`btn-${size}`}
 *   - className={clsx(bsPrefix, variant && `${bsPrefix}-${variant}`)}
 *
 * These patterns represent token application and should be tracked
 * for design system analysis.
 */

export interface ClassPatternMatch {
  /** The full pattern expression (e.g., `${prefix}-${variant}`) */
  pattern: string;
  /** The template structure with variables as placeholders (e.g., "{prefix}-{variant}") */
  structure: string;
  /** Variables used in the pattern */
  variables: string[];
  /** Static class name parts (e.g., "btn" in "btn-{size}") */
  staticParts: string[];
  /** Line number where pattern was found */
  line: number;
  /** Column where pattern was found */
  column: number;
  /** The full className value including wrappers like clsx() */
  context: 'template-literal' | 'clsx' | 'classnames' | 'cx' | 'conditional';
}

/**
 * Common class name utility function patterns
 */
const CLASS_UTILITIES = ['clsx', 'classnames', 'classNames', 'cx', 'cn', 'twMerge', 'cva'];

/**
 * Extract template literal class patterns from JSX/TSX content
 */
export function extractClassPatterns(content: string): ClassPatternMatch[] {
  const matches: ClassPatternMatch[] = [];
  const lines = content.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]!;

    // Pattern 1: className={`...${...}...`} - Direct template literal
    const templateMatches = extractTemplateClassNames(line, lineNum + 1);
    matches.push(...templateMatches);

    // Pattern 2: className={clsx(...)} or similar utilities with template literals inside
    const utilityMatches = extractUtilityClassNames(line, lineNum + 1);
    matches.push(...utilityMatches);

    // Pattern 3: className={condition ? `...${...}...` : '...'} - Conditional with templates
    const conditionalMatches = extractConditionalClassNames(line, lineNum + 1);
    matches.push(...conditionalMatches);
  }

  // Also handle multi-line patterns
  const multilineMatches = extractMultilinePatterns(content);
  matches.push(...multilineMatches);

  // Deduplicate by pattern and line
  const seen = new Set<string>();
  return matches.filter(m => {
    const key = `${m.line}:${m.pattern}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Extract template literal class patterns from a single line
 * Matches: className={`prefix-${var}`} or className={`${prefix}-${variant}`}
 */
function extractTemplateClassNames(line: string, lineNum: number): ClassPatternMatch[] {
  const matches: ClassPatternMatch[] = [];

  // Match className={`...`} with template expressions
  const regex = /className\s*=\s*\{`([^`]*\$\{[^`]+)`\}/g;
  let match;

  while ((match = regex.exec(line)) !== null) {
    const templateContent = match[1]!;
    const parsed = parseTemplateContent(templateContent);

    if (parsed.variables.length > 0) {
      matches.push({
        pattern: templateContent,
        structure: parsed.structure,
        variables: parsed.variables,
        staticParts: parsed.staticParts,
        line: lineNum,
        column: match.index + 1,
        context: 'template-literal',
      });
    }
  }

  return matches;
}

/**
 * Extract class patterns from utility functions like clsx(), classnames()
 */
function extractUtilityClassNames(line: string, lineNum: number): ClassPatternMatch[] {
  const matches: ClassPatternMatch[] = [];

  for (const utility of CLASS_UTILITIES) {
    // Match className={clsx(...`${...}`...)}
    const regex = new RegExp(`className\\s*=\\s*\\{${utility}\\s*\\(([^)]*\\$\\{[^)]+)\\)\\}`, 'g');
    let match;

    while ((match = regex.exec(line)) !== null) {
      const content = match[1]!;
      const templateLiterals = extractNestedTemplateLiterals(content);

      for (const template of templateLiterals) {
        const parsed = parseTemplateContent(template);
        if (parsed.variables.length > 0) {
          matches.push({
            pattern: template,
            structure: parsed.structure,
            variables: parsed.variables,
            staticParts: parsed.staticParts,
            line: lineNum,
            column: match.index + 1,
            context: utility === 'clsx' ? 'clsx' : utility === 'cx' ? 'cx' : 'classnames',
          });
        }
      }
    }
  }

  return matches;
}

/**
 * Extract conditional class patterns
 * Matches: className={condition ? `prefix-${var}` : 'default'}
 */
function extractConditionalClassNames(line: string, lineNum: number): ClassPatternMatch[] {
  const matches: ClassPatternMatch[] = [];

  // Match ternary with template literals in className
  const regex = /className\s*=\s*\{[^}]*\?\s*`([^`]*\$\{[^`]+)`[^}]*\}/g;
  let match;

  while ((match = regex.exec(line)) !== null) {
    const templateContent = match[1]!;
    const parsed = parseTemplateContent(templateContent);

    if (parsed.variables.length > 0) {
      matches.push({
        pattern: templateContent,
        structure: parsed.structure,
        variables: parsed.variables,
        staticParts: parsed.staticParts,
        line: lineNum,
        column: match.index + 1,
        context: 'conditional',
      });
    }
  }

  return matches;
}

/**
 * Extract template literals from multi-line content
 */
function extractMultilinePatterns(content: string): ClassPatternMatch[] {
  const matches: ClassPatternMatch[] = [];

  // Find className= and then extract balanced braces content
  const classNameStarts = findAllOccurrences(content, 'className');

  for (const startIdx of classNameStarts) {
    // Find the opening brace
    let i = startIdx + 'className'.length;
    while (i < content.length && content[i] !== '{' && content[i] !== '"' && content[i] !== "'") {
      i++;
    }

    if (content[i] !== '{') continue;

    // Extract balanced brace content
    const braceContent = extractBalancedBracesContent(content, i);
    if (!braceContent || !braceContent.includes('\n')) continue;

    // Find template literals within this multi-line content
    const templateLiterals = extractNestedTemplateLiterals(braceContent);

    for (const template of templateLiterals) {
      const parsed = parseTemplateContent(template);
      if (parsed.variables.length > 0) {
        // Calculate line number
        const beforeMatch = content.slice(0, startIdx);
        const lineNum = beforeMatch.split('\n').length;

        // Determine context
        let context: ClassPatternMatch['context'] = 'template-literal';
        for (const utility of CLASS_UTILITIES) {
          if (braceContent.includes(utility + '(')) {
            context = utility === 'clsx' ? 'clsx' : utility === 'cx' ? 'cx' : 'classnames';
            break;
          }
        }
        if (braceContent.includes('?') && braceContent.includes(':')) {
          context = 'conditional';
        }

        matches.push({
          pattern: template,
          structure: parsed.structure,
          variables: parsed.variables,
          staticParts: parsed.staticParts,
          line: lineNum,
          column: 1,
          context,
        });
      }
    }
  }

  return matches;
}

/**
 * Find all occurrences of a substring in content
 */
function findAllOccurrences(content: string, substring: string): number[] {
  const indices: number[] = [];
  let idx = content.indexOf(substring);
  while (idx !== -1) {
    indices.push(idx);
    idx = content.indexOf(substring, idx + 1);
  }
  return indices;
}

/**
 * Extract content within balanced braces starting at given position
 */
function extractBalancedBracesContent(content: string, startIdx: number): string | null {
  if (content[startIdx] !== '{') return null;

  let depth = 0;
  let i = startIdx;

  while (i < content.length) {
    const char = content[i];

    // Handle string literals to avoid counting braces inside them
    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      i++;
      while (i < content.length) {
        if (content[i] === '\\') {
          i += 2;
          continue;
        }
        if (content[i] === quote) {
          break;
        }
        // Handle template literal expressions
        if (quote === '`' && content[i] === '$' && content[i + 1] === '{') {
          let templateDepth = 1;
          i += 2;
          while (i < content.length && templateDepth > 0) {
            if (content[i] === '{') templateDepth++;
            else if (content[i] === '}') templateDepth--;
            i++;
          }
          continue;
        }
        i++;
      }
      i++;
      continue;
    }

    if (char === '{') depth++;
    else if (char === '}') depth--;

    if (depth === 0) {
      return content.slice(startIdx + 1, i);
    }
    i++;
  }

  return null;
}

/**
 * Extract all template literals from a string (handling nesting)
 */
function extractNestedTemplateLiterals(content: string): string[] {
  const templates: string[] = [];
  let i = 0;

  while (i < content.length) {
    if (content[i] === '`') {
      // Find matching closing backtick
      let j = i + 1;
      let depth = 0;

      while (j < content.length) {
        if (content[j] === '\\') {
          j += 2; // Skip escaped character
          continue;
        }
        if (content[j] === '$' && content[j + 1] === '{') {
          depth++;
          j += 2;
          continue;
        }
        if (content[j] === '}' && depth > 0) {
          depth--;
          j++;
          continue;
        }
        if (content[j] === '`' && depth === 0) {
          const template = content.slice(i + 1, j);
          // Only include if it has template expressions
          if (template.includes('${')) {
            templates.push(template);
          }
          break;
        }
        j++;
      }
      i = j + 1;
    } else {
      i++;
    }
  }

  return templates;
}

/**
 * Parse template literal content to extract structure and variables
 */
function parseTemplateContent(content: string): {
  structure: string;
  variables: string[];
  staticParts: string[];
} {
  const variables: string[] = [];
  const staticParts: string[] = [];
  let structure = '';
  let currentStatic = '';
  let i = 0;

  while (i < content.length) {
    if (content[i] === '$' && content[i + 1] === '{') {
      // Save current static part
      if (currentStatic) {
        staticParts.push(currentStatic);
        currentStatic = '';
      }

      // Find closing brace
      let depth = 1;
      let j = i + 2;
      while (j < content.length && depth > 0) {
        if (content[j] === '{') depth++;
        else if (content[j] === '}') depth--;
        j++;
      }

      const varExpr = content.slice(i + 2, j - 1);
      variables.push(varExpr);

      // Use simplified variable name for structure
      const simpleName = extractSimpleVarName(varExpr);
      structure += `{${simpleName}}`;

      i = j;
    } else {
      currentStatic += content[i];
      structure += content[i];
      i++;
    }
  }

  // Add final static part
  if (currentStatic) {
    staticParts.push(currentStatic);
  }

  return { structure, variables, staticParts };
}

/**
 * Extract a simple variable name from a complex expression
 * Examples:
 *   "prefix" -> "prefix"
 *   "prefix || 'btn'" -> "prefix"
 *   "variant && `${bsPrefix}-${variant}`" -> "variant"
 */
function extractSimpleVarName(expr: string): string {
  // Strip conditional expressions
  const cleaned = expr
    .replace(/\s*\|\|.*$/, '')  // Remove || fallback
    .replace(/\s*&&.*$/, '')    // Remove && guard
    .replace(/\s*\?.*$/, '')    // Remove ternary
    .trim();

  // Extract just the identifier
  const identMatch = cleaned.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
  return identMatch ? identMatch[1]! : expr;
}

/**
 * Analyze patterns to identify potential token mappings
 */
export function analyzePatternForTokens(match: ClassPatternMatch): {
  potentialTokenType: 'variant' | 'size' | 'color' | 'state' | 'modifier' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  suggestedTokenName?: string;
} {
  const varNames = match.variables.map(v => v.toLowerCase());

  // Check for variant patterns
  if (varNames.some(v => v.includes('variant') || v.includes('type') || v.includes('kind'))) {
    return { potentialTokenType: 'variant', confidence: 'high' };
  }

  // Check for size patterns
  if (varNames.some(v => v.includes('size') || v.includes('sz'))) {
    return { potentialTokenType: 'size', confidence: 'high' };
  }

  // Check for color patterns
  if (varNames.some(v => v.includes('color') || v.includes('theme') || v.includes('palette'))) {
    return { potentialTokenType: 'color', confidence: 'high' };
  }

  // Check for state patterns
  if (varNames.some(v => v.includes('state') || v.includes('active') || v.includes('disabled'))) {
    return { potentialTokenType: 'state', confidence: 'high' };
  }

  // Check common prefixes that suggest variants
  const staticLower = match.staticParts.map(s => s.toLowerCase()).join('');
  if (staticLower.includes('btn') || staticLower.includes('button')) {
    return { potentialTokenType: 'variant', confidence: 'medium' };
  }
  if (staticLower.includes('text') || staticLower.includes('bg')) {
    return { potentialTokenType: 'color', confidence: 'medium' };
  }

  return { potentialTokenType: 'unknown', confidence: 'low' };
}

// ============================================================================
// CVA (class-variance-authority) Pattern Extraction
// ============================================================================

/**
 * Represents a parsed CVA (class-variance-authority) pattern
 */
export interface CvaPattern {
  /** Variable name assigned to the cva result (e.g., "buttonVariants") */
  name: string;
  /** Base classes applied to all variants */
  baseClasses: string[];
  /** Variant definitions with their option names */
  variants?: Record<string, string[]>;
  /** Default variant selections */
  defaultVariants?: Record<string, string>;
  /** All semantic design tokens found in the CVA definition */
  semanticTokens: string[];
  /** Line number where pattern was found */
  line: number;
}

/**
 * Extract CVA patterns from TypeScript/JSX content
 * Handles patterns like:
 *   const buttonVariants = cva("base-classes", { variants: {...} })
 */
export function extractCvaPatterns(content: string): CvaPattern[] {
  const patterns: CvaPattern[] = [];

  // Match: const/let/var <name> = cva(...)
  const cvaRegex = /(?:const|let|var)\s+(\w+)\s*=\s*cva\s*\(/g;
  let match;

  while ((match = cvaRegex.exec(content)) !== null) {
    const name = match[1]!;
    const startIndex = match.index + match[0].length - 1; // Position at opening paren

    // Extract the full cva() call content with balanced parentheses
    const cvaContent = extractBalancedParensContent(content, startIndex);
    if (!cvaContent) continue;

    // Calculate line number
    const beforeMatch = content.slice(0, match.index);
    const lineNum = beforeMatch.split('\n').length;

    // Parse the CVA content
    const parsed = parseCvaContent(cvaContent);

    patterns.push({
      name,
      baseClasses: parsed.baseClasses,
      variants: parsed.variants,
      defaultVariants: parsed.defaultVariants,
      semanticTokens: parsed.semanticTokens,
      line: lineNum,
    });
  }

  return patterns;
}

/**
 * Extract content within balanced parentheses starting at given position
 */
function extractBalancedParensContent(content: string, startIdx: number): string | null {
  if (content[startIdx] !== '(') return null;

  let depth = 0;
  let i = startIdx;

  while (i < content.length) {
    const char = content[i];

    // Handle string literals
    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      i++;
      while (i < content.length) {
        if (content[i] === '\\') {
          i += 2;
          continue;
        }
        if (content[i] === quote) break;
        // Handle template literal expressions
        if (quote === '`' && content[i] === '$' && content[i + 1] === '{') {
          let templateDepth = 1;
          i += 2;
          while (i < content.length && templateDepth > 0) {
            if (content[i] === '{') templateDepth++;
            else if (content[i] === '}') templateDepth--;
            i++;
          }
          continue;
        }
        i++;
      }
      i++;
      continue;
    }

    if (char === '(') depth++;
    else if (char === ')') depth--;

    if (depth === 0) {
      return content.slice(startIdx + 1, i);
    }
    i++;
  }

  return null;
}

/**
 * Parse the content of a cva() call
 */
function parseCvaContent(content: string): {
  baseClasses: string[];
  variants?: Record<string, string[]>;
  defaultVariants?: Record<string, string>;
  semanticTokens: string[];
} {
  const allClasses: string[] = [];
  const semanticTokens = new Set<string>();

  // Extract base classes (first string argument)
  const baseMatch = content.match(/^\s*["'`]([^"'`]*)["'`]/);
  const baseClasses = baseMatch ? baseMatch[1]!.split(/\s+/).filter(Boolean) : [];
  allClasses.push(...baseClasses);

  // Extract variant definitions
  const variants: Record<string, string[]> = {};
  const defaultVariants: Record<string, string> = {};

  // Find the variants object in the content
  const variantsStartIdx = content.indexOf('variants');
  if (variantsStartIdx !== -1) {
    // Find the opening brace after 'variants:'
    let braceIdx = content.indexOf('{', variantsStartIdx + 8);
    if (braceIdx !== -1) {
      // Extract balanced braces content for the variants object
      const variantsContent = extractBalancedBracesContentForVariants(content, braceIdx);

      if (variantsContent) {
        // Parse each variant category (e.g., variant: {...}, size: {...})
        parseVariantCategories(variantsContent, variants, allClasses);
      }
    }
  }

  // Extract defaultVariants
  const defaultsMatch = content.match(/defaultVariants\s*:\s*\{([^}]*)\}/);
  if (defaultsMatch) {
    const defaultsContent = defaultsMatch[1]!;
    const defaultRegex = /(\w+)\s*:\s*["'](\w+)["']/g;
    let defaultMatch;

    while ((defaultMatch = defaultRegex.exec(defaultsContent)) !== null) {
      defaultVariants[defaultMatch[1]!] = defaultMatch[2]!;
    }
  }

  // Extract semantic tokens from all classes
  for (const cls of allClasses) {
    const tokens = extractSemanticTokens(cls);
    tokens.forEach(t => semanticTokens.add(t));
  }

  return {
    baseClasses,
    variants: Object.keys(variants).length > 0 ? variants : undefined,
    defaultVariants: Object.keys(defaultVariants).length > 0 ? defaultVariants : undefined,
    semanticTokens: Array.from(semanticTokens),
  };
}

/**
 * Extract balanced braces content, handling nested braces
 */
function extractBalancedBracesContentForVariants(content: string, startIdx: number): string | null {
  if (content[startIdx] !== '{') return null;

  let depth = 0;
  let i = startIdx;

  while (i < content.length) {
    const char = content[i];

    // Handle string literals
    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      i++;
      while (i < content.length && content[i] !== quote) {
        if (content[i] === '\\') {
          i += 2;
          continue;
        }
        i++;
      }
      i++;
      continue;
    }

    if (char === '{') depth++;
    else if (char === '}') depth--;

    if (depth === 0) {
      return content.slice(startIdx + 1, i);
    }
    i++;
  }

  return null;
}

/**
 * Parse variant categories from variants object content
 */
function parseVariantCategories(
  content: string,
  variants: Record<string, string[]>,
  allClasses: string[]
): void {
  // Find each category: name: { ... }
  let i = 0;
  while (i < content.length) {
    // Skip whitespace and commas
    while (i < content.length && /[\s,]/.test(content[i]!)) i++;

    // Try to match category name
    const nameMatch = content.slice(i).match(/^(\w+)\s*:/);
    if (!nameMatch) break;

    const categoryName = nameMatch[1]!;
    i += nameMatch[0].length;

    // Skip whitespace
    while (i < content.length && /\s/.test(content[i]!)) i++;

    // Find opening brace
    if (content[i] !== '{') {
      // Not an object, skip
      i++;
      continue;
    }

    // Extract category content
    const categoryContent = extractBalancedBracesContentForVariants(content, i);
    if (!categoryContent) break;

    // Parse options within this category
    const optionNames: string[] = [];
    parseVariantOptions(categoryContent, optionNames, allClasses);

    if (optionNames.length > 0) {
      variants[categoryName] = optionNames;
    }

    // Move past the closing brace
    i += categoryContent.length + 2;
  }
}

/**
 * Parse variant options from category content
 */
function parseVariantOptions(
  content: string,
  optionNames: string[],
  allClasses: string[]
): void {
  // Match patterns like: optionName: "classes" or "option-name": "classes"
  const optionRegex = /["']?(\w+(?:-\w+)*)["']?\s*:\s*(?:\n\s*)?["'`]([^"'`]*)["'`]/g;
  let match;

  while ((match = optionRegex.exec(content)) !== null) {
    const optionName = match[1]!;
    const classes = match[2]!;

    if (!optionNames.includes(optionName)) {
      optionNames.push(optionName);
    }
    allClasses.push(...classes.split(/\s+/).filter(Boolean));
  }
}

// ============================================================================
// Semantic Tailwind Token Extraction
// ============================================================================

/**
 * Known semantic token names in Tailwind/shadcn design systems
 * These are custom colors that reference CSS variables, not color scales
 */
const SEMANTIC_TOKEN_NAMES = new Set([
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
  'sidebar',
  'sidebar-foreground',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-accent',
  'sidebar-accent-foreground',
  'sidebar-border',
  'sidebar-ring',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
]);

/**
 * Extract semantic design tokens from a Tailwind class string
 * Recognizes patterns like bg-primary, text-muted-foreground, border-input, etc.
 */
export function extractSemanticTokens(classString: string): string[] {
  const tokens = new Set<string>();

  // Split by whitespace to get individual classes
  const classes = classString.split(/\s+/).filter(Boolean);

  for (const cls of classes) {
    // Remove variants like hover:, focus:, dark:, etc.
    const baseClass = cls.replace(/^(?:[\w-]+:)+/, '');

    // Extract token from color utilities: bg-{token}, text-{token}, border-{token}, etc.
    const colorUtilityMatch = baseClass.match(
      /^(?:bg|text|border|ring|outline|shadow|accent|fill|stroke|caret|decoration|divide|placeholder)-(.+?)(?:\/[\d.]+)?$/
    );

    if (colorUtilityMatch) {
      const potentialToken = colorUtilityMatch[1]!;

      // Check if this is a known semantic token or follows semantic naming
      if (isSemanticToken(potentialToken)) {
        tokens.add(potentialToken);
      }
    }

    // Handle focus-visible:ring-{token}
    const focusRingMatch = baseClass.match(/^ring-(.+?)(?:\/[\d.]+)?$/);
    if (focusRingMatch && isSemanticToken(focusRingMatch[1]!)) {
      tokens.add(focusRingMatch[1]!);
    }
  }

  return Array.from(tokens);
}

/**
 * Check if a token name is a semantic design token
 */
function isSemanticToken(name: string): boolean {
  // Direct match
  if (SEMANTIC_TOKEN_NAMES.has(name)) {
    return true;
  }

  // Check for -foreground suffix pattern
  if (name.endsWith('-foreground')) {
    const base = name.replace(/-foreground$/, '');
    if (SEMANTIC_TOKEN_NAMES.has(base) || SEMANTIC_TOKEN_NAMES.has(name)) {
      return true;
    }
  }

  // Reject color scales like gray-300, blue-500, etc.
  if (/^(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+$/.test(name)) {
    return false;
  }

  // Reject pure color names
  if (/^(?:white|black|transparent|current|inherit)$/.test(name)) {
    return false;
  }

  // Accept custom tokens that look semantic (simple names without numbers)
  if (/^[a-z]+(?:-[a-z]+)*$/.test(name) && !name.match(/\d/)) {
    // If it ends with foreground or is a known UI element name, it's likely semantic
    if (name.endsWith('-foreground') || ['background', 'foreground', 'border', 'ring', 'input'].includes(name)) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// Static Class String Extraction
// ============================================================================

/**
 * Represents extracted static class strings from utility function calls
 */
export interface StaticClassStrings {
  /** The utility function used (cn, clsx, classNames, etc.) */
  utility: string;
  /** All static class names extracted */
  classes: string[];
  /** Semantic tokens found in the classes */
  semanticTokens: string[];
  /** Line number where pattern was found */
  line: number;
}

/**
 * Extract static class strings from className utility function calls
 * Handles: cn("static-classes"), classNames("...", variable), clsx("...", ...)
 */
export function extractStaticClassStrings(content: string): StaticClassStrings[] {
  const results: StaticClassStrings[] = [];
  const utilities = ['cn', 'clsx', 'classnames', 'classNames', 'cx', 'twMerge'];

  for (const utility of utilities) {
    // Find className={utility(...)} patterns
    const classNameRegex = new RegExp(`className\\s*=\\s*\\{\\s*${utility}\\s*\\(`, 'g');
    let match;

    while ((match = classNameRegex.exec(content)) !== null) {
      const startIndex = match.index + match[0].length - 1; // Position at opening paren

      // Extract balanced parentheses content
      const parenContent = extractBalancedParensContent(content, startIndex);
      if (!parenContent) continue;

      // Calculate line number
      const beforeMatch = content.slice(0, match.index);
      const lineNum = beforeMatch.split('\n').length;

      // Extract all string literals from the content
      const allClasses: string[] = [];
      const stringRegex = /["'`]([^"'`]+)["'`]/g;
      let stringMatch;

      while ((stringMatch = stringRegex.exec(parenContent)) !== null) {
        const classes = stringMatch[1]!.split(/\s+/).filter(Boolean);
        allClasses.push(...classes);
      }

      if (allClasses.length > 0) {
        // Extract semantic tokens
        const semanticTokens = new Set<string>();
        for (const cls of allClasses) {
          const tokens = extractSemanticTokens(cls);
          tokens.forEach(t => semanticTokens.add(t));
        }

        results.push({
          utility,
          classes: allClasses,
          semanticTokens: Array.from(semanticTokens),
          line: lineNum,
        });
      }
    }
  }

  return results;
}

// ============================================================================
// BEM-like Semantic Class Extraction
// ============================================================================

/**
 * Represents a BEM-like semantic class extracted from content
 *
 * shadcn-ui/ui v4 uses a consistent naming pattern:
 *   cn-{block}
 *   cn-{block}-{element}
 *   cn-{block}-{element}-{modifier}
 *
 * Examples:
 *   cn-card, cn-card-header, cn-card-title
 *   cn-tabs, cn-tabs-list, cn-tabs-trigger
 *   cn-tabs-list-variant-default, cn-button-group-orientation-horizontal
 */
export interface BemSemanticClass {
  /** The full class name (e.g., "cn-card-header") */
  fullClass: string;
  /** The prefix used (default: "cn") */
  prefix: string;
  /** The component/block name (e.g., "card" or "alert-dialog") */
  componentName: string;
  /** The BEM block (first part after prefix) */
  block: string;
  /** The BEM element (optional second part) */
  element?: string;
  /** The BEM modifier (optional, e.g., "variant-default") */
  modifier?: string;
  /** Line number where class was found */
  line: number;
}

/**
 * Known modifier categories that indicate variant patterns
 * These help distinguish between elements and modifiers
 */
const KNOWN_MODIFIER_PREFIXES = [
  'variant',
  'size',
  'orientation',
  'state',
  'color',
  'theme',
  'mode',
];

/**
 * Extract BEM-like semantic classes with "cn-" prefix from content
 * These are the design system component classes used by shadcn-ui v4
 */
export function extractBemSemanticClasses(content: string, prefix: string = 'cn'): BemSemanticClass[] {
  return extractCustomPrefixClasses(content, prefix);
}

/**
 * Extract BEM-like semantic classes with a custom prefix from content
 * Supports patterns like:
 *   ui-button, ui-button-group
 *   cn-card, cn-card-header
 *   ui-active:bg-blue-500 (headlessui variant prefixes)
 */
export function extractCustomPrefixClasses(content: string, prefix: string): BemSemanticClass[] {
  const results: BemSemanticClass[] = [];
  const seen = new Set<string>();
  const lines = content.split('\n');

  // Pattern for classes with the given prefix
  // Matches: prefix-word, prefix-word-word, prefix-word-word-word, etc.
  // Also matches variant prefixes like ui-active: or ui-not-active:
  const classRegex = new RegExp(`\\b(${prefix}-[a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?::|\\s|"|'|\`|$)`, 'gi');

  // Also look for ui-focus-visible: and similar Tailwind variant prefixes from headlessui
  const variantPrefixRegex = new RegExp(`\\b(${prefix}-[a-z][a-z0-9-]*)(?=:)`, 'gi');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]!;

    // Find all prefixed classes
    let match;

    // Standard class names
    while ((match = classRegex.exec(line)) !== null) {
      const fullClass = match[1]!.toLowerCase();

      if (!seen.has(fullClass)) {
        seen.add(fullClass);
        const parsed = parseBemClass(fullClass, prefix);
        if (parsed) {
          results.push({
            ...parsed,
            line: lineNum + 1,
          });
        }
      }
    }

    // Variant prefix patterns (like ui-active:bg-blue-500)
    classRegex.lastIndex = 0; // Reset regex state
    while ((match = variantPrefixRegex.exec(line)) !== null) {
      const fullClass = match[1]!.toLowerCase();

      if (!seen.has(fullClass)) {
        seen.add(fullClass);
        const parsed = parseBemClass(fullClass, prefix);
        if (parsed) {
          results.push({
            ...parsed,
            line: lineNum + 1,
          });
        }
      }
    }
    variantPrefixRegex.lastIndex = 0; // Reset regex state
  }

  return results;
}

/**
 * Parse a BEM-like class name into its components
 *
 * Examples:
 *   cn-card -> block: card
 *   cn-card-header -> block: card, element: header
 *   cn-tabs-list-variant-default -> block: tabs, element: list, modifier: variant-default
 *   cn-alert-dialog -> componentName: alert-dialog, block: alert-dialog
 *   cn-alert-dialog-overlay -> componentName: alert-dialog, block: alert-dialog, element: overlay
 */
function parseBemClass(className: string, prefix: string): Omit<BemSemanticClass, 'line'> | null {
  if (!className.startsWith(`${prefix}-`)) {
    return null;
  }

  // Remove the prefix
  const withoutPrefix = className.slice(prefix.length + 1);
  const parts = withoutPrefix.split('-');

  if (parts.length === 0 || !parts[0]) {
    return null;
  }

  // Heuristic: Find where the modifier starts (if any)
  // Modifiers are typically prefixed with known words like 'variant', 'orientation', etc.
  let modifierStartIdx = -1;
  for (let i = 0; i < parts.length; i++) {
    if (KNOWN_MODIFIER_PREFIXES.includes(parts[i]!)) {
      modifierStartIdx = i;
      break;
    }
  }

  let block: string;
  let element: string | undefined;
  let modifier: string | undefined;

  if (modifierStartIdx >= 0) {
    // We have a modifier
    modifier = parts.slice(modifierStartIdx).join('-');

    // Everything before the modifier is block-element
    const blockElementParts = parts.slice(0, modifierStartIdx);

    if (blockElementParts.length === 1) {
      block = blockElementParts[0]!;
    } else if (blockElementParts.length >= 2) {
      // Try to identify compound component names (e.g., "alert-dialog")
      // Last part is likely the element
      element = blockElementParts[blockElementParts.length - 1];
      block = blockElementParts.slice(0, -1).join('-');
    } else {
      block = '';
    }
  } else {
    // No modifier found
    // Heuristic: If we have 2+ parts, last is likely element
    // But for compound names like "alert-dialog", we need smarter detection

    // Known compound component names (could be extended)
    const knownElements = [
      'header', 'footer', 'content', 'title', 'description', 'body',
      'overlay', 'trigger', 'action', 'cancel', 'media', 'list',
      'item', 'separator', 'group', 'text', 'portal', 'panel',
      'panels', 'indicator', 'input', 'label', 'message', 'icon',
    ];

    // Find the last part that looks like an element name
    let elementIdx = -1;
    for (let i = parts.length - 1; i >= 1; i--) {
      if (knownElements.includes(parts[i]!)) {
        elementIdx = i;
        break;
      }
    }

    if (elementIdx >= 0) {
      element = parts.slice(elementIdx).join('-');
      block = parts.slice(0, elementIdx).join('-');
    } else if (parts.length === 1) {
      block = parts[0]!;
    } else {
      // Fallback: treat as compound block name
      block = parts.join('-');
    }
  }

  // Determine the component name (the main block without elements/modifiers)
  const componentName = block || parts[0]!;

  return {
    fullClass: className,
    prefix,
    componentName,
    block,
    element,
    modifier,
  };
}

// ============================================================================
// Data Attribute Selector Pattern Extraction
// ============================================================================

/**
 * Represents a Tailwind data attribute selector pattern
 * Used for detecting patterns like:
 *   - data-[disabled]:opacity-50
 *   - data-[state=closed]:hidden
 *   - group-data-[active=true]/dropdown-menu-item:opacity-100
 *   - has-data-[slot=card-action]:grid-cols-[1fr_auto]
 */
export interface DataAttributePattern {
  /** The full class pattern (e.g., "data-[state=closed]:hidden") */
  fullPattern: string;
  /** The data attribute name (e.g., "state", "disabled", "slot") */
  attribute: string;
  /** The attribute value if specified (e.g., "closed", "true") */
  value?: string;
  /** For group-data-[*]/name patterns, the group name */
  groupName?: string;
  /** The variant prefix used (data, group-data, has-data, group-has-data) */
  variantPrefix: 'data' | 'group-data' | 'has-data' | 'group-has-data' | '*:data';
  /** Semantic category inferred from attribute name */
  semanticCategory?: 'state' | 'variant' | 'size' | 'layout' | 'slot' | 'position' | 'other';
  /** Line number where pattern was found */
  line: number;
}

/**
 * Known semantic attribute names mapped to categories
 */
const DATA_ATTRIBUTE_CATEGORIES: Record<string, DataAttributePattern['semanticCategory']> = {
  // State attributes
  'state': 'state',
  'open': 'state',
  'closed': 'state',
  'checked': 'state',
  'selected': 'state',
  'active': 'state',
  'disabled': 'state',
  'expanded': 'state',
  'highlighted': 'state',
  'pressed': 'state',
  'focus': 'state',
  'hover': 'state',
  // Variant attributes
  'variant': 'variant',
  'theme': 'variant',
  'color': 'variant',
  // Size attributes
  'size': 'size',
  // Layout attributes
  'orientation': 'layout',
  'collapsible': 'layout',
  'align': 'layout',
  'direction': 'layout',
  // Slot attributes
  'slot': 'slot',
  // Position attributes
  'side': 'position',
  'position': 'position',
  'placement': 'position',
};

/**
 * Extract data attribute selector patterns from content
 * Handles patterns like:
 *   - data-[attr]:utility
 *   - data-[attr=value]:utility
 *   - group-data-[attr=value]/name:utility
 *   - has-data-[attr=value]:utility
 */
export function extractDataAttributePatterns(content: string): DataAttributePattern[] {
  const results: DataAttributePattern[] = [];
  const seen = new Set<string>();
  const lines = content.split('\n');

  // Pattern to match all data-* variants:
  // - data-[attr]:utility or data-[attr=value]:utility
  // - group-data-[attr=value]:utility or group-data-[attr=value]/name:utility
  // - has-data-[attr=value]:utility
  // - group-has-data-[attr=value]/name:utility
  // - *:data-[attr=value]:utility
  const dataPatternRegex = /(\*:|group-has-data-|group-data-|has-data-|data-)\[([a-zA-Z][\w-]*)(?:=([^\]]+))?\](?:\/([a-zA-Z][\w-]*))?:/g;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]!;
    let match;

    while ((match = dataPatternRegex.exec(line)) !== null) {
      const fullMatch = match[0];
      const prefix = match[1]!;
      const attribute = match[2]!;
      const value = match[3];
      const groupName = match[4];

      // Create a unique key for deduplication
      const key = `${attribute}:${value || ''}:${groupName || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Determine the variant prefix type
      let variantPrefix: DataAttributePattern['variantPrefix'];
      if (prefix === '*:') {
        variantPrefix = '*:data';
      } else if (prefix === 'group-has-data-') {
        variantPrefix = 'group-has-data';
      } else if (prefix === 'group-data-') {
        variantPrefix = 'group-data';
      } else if (prefix === 'has-data-') {
        variantPrefix = 'has-data';
      } else {
        variantPrefix = 'data';
      }

      // Determine semantic category
      const semanticCategory = DATA_ATTRIBUTE_CATEGORIES[attribute.toLowerCase()] || 'other';

      results.push({
        fullPattern: fullMatch,
        attribute,
        value,
        groupName,
        variantPrefix,
        semanticCategory,
        line: lineNum + 1,
      });
    }

    // Reset regex lastIndex for the next line
    dataPatternRegex.lastIndex = 0;
  }

  return results;
}

// ============================================================================
// HeadlessUI Variant Prefix Extraction
// ============================================================================

/**
 * Represents a HeadlessUI state variant prefix
 * Used for detecting patterns like:
 *   - ui-active:bg-blue-500
 *   - ui-not-active:bg-gray-100
 *   - ui-focus-visible:ring-2
 */
export interface HeadlessUIVariant {
  /** The full variant prefix (e.g., "ui-active", "ui-not-open") */
  fullPrefix: string;
  /** The state name (e.g., "active", "open", "focus-visible") */
  state: string;
  /** Whether this is a negated variant (ui-not-*) */
  negated: boolean;
  /** The utility class applied (e.g., "bg-blue-500") */
  utility: string;
  /** Line number where pattern was found */
  line: number;
}

/**
 * Known HeadlessUI state variants
 */
const HEADLESSUI_STATES = [
  'open',
  'checked',
  'selected',
  'active',
  'disabled',
  'focus-visible',
];

/**
 * Extract HeadlessUI variant prefixes from content
 * Handles patterns like:
 *   - ui-active:bg-blue-500
 *   - ui-not-active:bg-gray-100
 *   - ui-focus-visible:ring-2
 *   - hui-active:bg-blue-500 (custom prefix)
 */
export function extractHeadlessUIVariants(content: string, prefix: string = 'ui'): HeadlessUIVariant[] {
  const results: HeadlessUIVariant[] = [];
  const seen = new Set<string>();
  const lines = content.split('\n');

  // Build pattern for all states
  const statesPattern = HEADLESSUI_STATES.join('|');

  // Match: prefix-state:utility or prefix-not-state:utility
  const variantRegex = new RegExp(
    `\\b(${prefix}-(?:not-)?(${statesPattern})):([a-zA-Z][\\w-/.]*)`,
    'g'
  );

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]!;
    let match;

    while ((match = variantRegex.exec(line)) !== null) {
      const fullPrefix = match[1]!;
      const state = match[2]!;
      const utility = match[3]!;
      const negated = fullPrefix.includes('-not-');

      // Create a unique key for deduplication based on state and negation
      const key = `${state}:${negated}:${lineNum}`;
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({
        fullPrefix,
        state,
        negated,
        utility,
        line: lineNum + 1,
      });
    }

    // Reset regex lastIndex for the next line
    variantRegex.lastIndex = 0;
  }

  return results;
}

// ============================================================================
// Group/Peer Variant Name Extraction
// ============================================================================

/**
 * Represents a named group/peer/container variant
 * Used for detecting patterns like:
 *   - group/card
 *   - peer/input
 *   - @container/card-header
 *   - group-hover/button:scale-105
 */
export interface GroupPeerVariant {
  /** The type of variant (group, peer, container) */
  type: 'group' | 'peer' | 'container';
  /** The custom name assigned (e.g., "card", "input", "card-header") */
  name: string;
  /** The variant modifier if present (e.g., "hover", "focus") */
  modifier?: string;
  /** The full pattern found */
  fullPattern: string;
  /** Line number where pattern was found */
  line: number;
}

/**
 * Extract named group/peer/container variants from content
 * Handles patterns like:
 *   - group/name
 *   - peer/name
 *   - @container/name
 *   - group-hover/name:utility
 *   - peer-focus/name:utility
 *   - @sm/name:utility
 */
export function extractGroupPeerVariants(content: string): GroupPeerVariant[] {
  const results: GroupPeerVariant[] = [];
  const seen = new Set<string>();
  const lines = content.split('\n');

  // Pattern 1: Simple group/name, peer/name, @container/name
  const simplePatternRegex = /\b(group|peer|@container)\/([a-zA-Z][\w-]*)/g;

  // Pattern 2: group-modifier/name or peer-modifier/name with optional :utility
  const modifierPatternRegex = /\b(group|peer)-([a-zA-Z][\w]*)\/([a-zA-Z][\w-]*)(?::[a-zA-Z][\w-/.]*)?/g;

  // Pattern 3: @size/name container queries
  const containerQueryRegex = /@([a-z]+)\/([a-zA-Z][\w-]*)(?::[a-zA-Z][\w-/.]*)?/g;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum]!;

    // Extract simple patterns
    let match;
    while ((match = simplePatternRegex.exec(line)) !== null) {
      const typeStr = match[1]!;
      const name = match[2]!;

      const type: GroupPeerVariant['type'] =
        typeStr === '@container' ? 'container' :
        typeStr === 'peer' ? 'peer' : 'group';

      const key = `${type}:${name}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          type,
          name,
          fullPattern: match[0],
          line: lineNum + 1,
        });
      }
    }
    simplePatternRegex.lastIndex = 0;

    // Extract modifier patterns (group-hover/name)
    while ((match = modifierPatternRegex.exec(line)) !== null) {
      const typeStr = match[1]!;
      const modifier = match[2]!;
      const name = match[3]!;

      const type: GroupPeerVariant['type'] = typeStr === 'peer' ? 'peer' : 'group';

      const key = `${type}:${name}:${modifier}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          type,
          name,
          modifier,
          fullPattern: match[0],
          line: lineNum + 1,
        });
      }
    }
    modifierPatternRegex.lastIndex = 0;

    // Extract container query patterns (@sm/name)
    while ((match = containerQueryRegex.exec(line)) !== null) {
      const size = match[1]!;
      const name = match[2]!;

      // Skip if it's just @container which is handled above
      if (size === 'container') continue;

      const key = `container:${name}:${size}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          type: 'container',
          name,
          modifier: size,
          fullPattern: match[0],
          line: lineNum + 1,
        });
      }
    }
    containerQueryRegex.lastIndex = 0;
  }

  return results;
}
