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
