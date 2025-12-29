import { Scanner, ScanResult, ScannerConfig, ScanError, ScanStats } from '../base/scanner.js';
import type {
  DesignToken,
  TokenCategory,
  TokenValue,
  JsonTokenSource,
  CssTokenSource,
} from '@buoy/core';
import { createTokenId } from '@buoy/core';
import { glob } from 'glob';
import { readFile } from 'fs/promises';
import { relative, extname } from 'path';

export interface TokenScannerConfig extends ScannerConfig {
  files?: string[];
  cssVariablePrefix?: string;
}

export class TokenScanner extends Scanner<DesignToken, TokenScannerConfig> {
  async scan(): Promise<ScanResult<DesignToken>> {
    const startTime = Date.now();
    const tokenMap = new Map<string, DesignToken>(); // Dedupe by ID
    const errors: ScanError[] = [];
    const scannedFiles = new Set<string>();

    // Helper to add tokens with deduplication
    const addTokens = (newTokens: DesignToken[]) => {
      for (const token of newTokens) {
        if (!tokenMap.has(token.id)) {
          tokenMap.set(token.id, token);
        }
      }
    };

    // Helper to scan a file (with tracking to avoid re-scanning)
    const scanFile = async (file: string) => {
      if (scannedFiles.has(file)) return;
      scannedFiles.add(file);

      const ext = extname(file);
      if (ext === '.json') {
        addTokens(await this.parseJsonTokenFile(file));
      } else if (ext === '.css' || ext === '.scss') {
        addTokens(await this.parseCssVariables(file));
      }
    };

    // Scan explicitly configured files first (higher priority)
    if (this.config.files && this.config.files.length > 0) {
      for (const pattern of this.config.files) {
        const matches = await glob(pattern, {
          cwd: this.config.projectRoot,
          absolute: true,
        });

        for (const file of matches) {
          try {
            await scanFile(file);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            errors.push({ file, message, code: 'PARSE_ERROR' });
          }
        }
      }
    } else {
      // Only scan default patterns if no explicit files configured
      // Scan JSON token files
      const jsonFiles = await this.findTokenFiles(['**/*.tokens.json', '**/tokens.json', '**/tokens/**/*.json']);
      for (const file of jsonFiles) {
        try {
          await scanFile(file);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push({ file, message, code: 'JSON_PARSE_ERROR' });
        }
      }

      // Scan CSS files for variables
      const cssFiles = await this.findTokenFiles(['**/*.css', '**/*.scss']);
      for (const file of cssFiles) {
        try {
          await scanFile(file);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push({ file, message, code: 'CSS_PARSE_ERROR' });
        }
      }
    }

    const tokens = Array.from(tokenMap.values());
    const stats: ScanStats = {
      filesScanned: scannedFiles.size,
      itemsFound: tokens.length,
      duration: Date.now() - startTime,
    };

    return { items: tokens, errors, stats };
  }

  getSourceType(): string {
    return 'tokens';
  }

  private async findTokenFiles(patterns: string[]): Promise<string[]> {
    const allFiles: string[] = [];
    const ignore = this.config.exclude || ['**/node_modules/**', '**/dist/**'];

    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: this.config.projectRoot,
        ignore,
        absolute: true,
      });
      allFiles.push(...matches);
    }

    return [...new Set(allFiles)];
  }

  private async parseJsonTokenFile(filePath: string): Promise<DesignToken[]> {
    const content = await readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    const relativePath = relative(this.config.projectRoot, filePath);
    const tokens: DesignToken[] = [];

    const processTokens = (obj: Record<string, unknown>, prefix: string = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const tokenName = prefix ? `${prefix}.${key}` : key;

        if (this.isTokenValue(value)) {
          const token = this.createTokenFromJson(tokenName, value, relativePath);
          if (token) tokens.push(token);
        } else if (typeof value === 'object' && value !== null) {
          processTokens(value as Record<string, unknown>, tokenName);
        }
      }
    };

    processTokens(data);
    return tokens;
  }

  private isTokenValue(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null) return false;
    const obj = value as Record<string, unknown>;

    // Check for common token formats
    // Style Dictionary format: { value: "...", type: "..." }
    if ('value' in obj) return true;

    // Direct value format: { $value: "..." }
    if ('$value' in obj) return true;

    return false;
  }

  private createTokenFromJson(
    name: string,
    value: Record<string, unknown>,
    filePath: string
  ): DesignToken | null {
    const rawValue = (value.value || value.$value) as string | number | undefined;
    const type = (value.type || value.$type || this.inferCategory(name, rawValue)) as string;

    if (rawValue === undefined) return null;

    const source: JsonTokenSource = {
      type: 'json',
      path: filePath,
      key: name,
    };

    const tokenValue = this.parseTokenValue(type, rawValue);

    return {
      id: createTokenId(source, name),
      name,
      category: this.normalizeCategory(type),
      value: tokenValue,
      source,
      aliases: [],
      usedBy: [],
      metadata: {
        description: value.description as string | undefined,
      },
      scannedAt: new Date(),
    };
  }

  private async parseCssVariables(filePath: string): Promise<DesignToken[]> {
    const content = await readFile(filePath, 'utf-8');
    const relativePath = relative(this.config.projectRoot, filePath);
    const tokens: DesignToken[] = [];

    // Remove CSS comments before parsing to avoid matching inside comments
    const contentWithoutComments = this.stripCssComments(content);

    // Extract CSS custom properties using a robust parser
    const cssVariables = this.extractCssVariables(contentWithoutComments, content);

    for (const { name, value, lineNumber } of cssVariables) {
      const prefix = this.config.cssVariablePrefix;

      // Skip if prefix is configured and doesn't match
      if (prefix && !name.startsWith(prefix.replace(/^--/, ''))) {
        continue;
      }

      const cleanName = name.trim();
      const cleanValue = value.trim();

      const source: CssTokenSource = {
        type: 'css',
        path: relativePath,
        line: lineNumber,
      };

      const category = this.inferCategory(cleanName, cleanValue);
      const tokenValue = this.parseTokenValue(category, cleanValue);

      tokens.push({
        id: createTokenId(source, cleanName),
        name: `--${cleanName}`,
        category: this.normalizeCategory(category),
        value: tokenValue,
        source,
        aliases: [],
        usedBy: [],
        metadata: {},
        scannedAt: new Date(),
      });
    }

    // Extract SCSS variables using a robust parser
    const scssVariables = this.extractScssVariables(contentWithoutComments, content);

    for (const { name, value, lineNumber } of scssVariables) {
      const cleanName = name.trim();
      const cleanValue = value.trim();

      const source: CssTokenSource = {
        type: 'css',
        path: relativePath,
        line: lineNumber,
      };

      const category = this.inferCategory(cleanName, cleanValue);
      const tokenValue = this.parseTokenValue(category, cleanValue);

      tokens.push({
        id: createTokenId(source, cleanName),
        name: `$${cleanName}`,
        category: this.normalizeCategory(category),
        value: tokenValue,
        source,
        aliases: [],
        usedBy: [],
        metadata: {},
        scannedAt: new Date(),
      });
    }

    return tokens;
  }

  /**
   * Strip CSS comments from content, preserving line structure
   * for accurate line number calculation
   */
  private stripCssComments(content: string): string {
    let result = '';
    let i = 0;
    while (i < content.length) {
      // Check for comment start
      if (content[i] === '/' && content[i + 1] === '*') {
        // Find comment end
        let j = i + 2;
        while (j < content.length && !(content[j] === '*' && content[j + 1] === '/')) {
          // Preserve newlines so line numbers stay accurate
          if (content[j] === '\n') {
            result += '\n';
          }
          j++;
        }
        // Skip past closing */
        i = j + 2;
      } else {
        result += content[i];
        i++;
      }
    }
    return result;
  }

  /**
   * Extract CSS custom properties handling:
   * - Multi-line values (gradients, box-shadows)
   * - Values containing semicolons in url() or content strings
   */
  private extractCssVariables(
    contentWithoutComments: string,
    originalContent: string
  ): Array<{ name: string; value: string; lineNumber: number }> {
    const results: Array<{ name: string; value: string; lineNumber: number }> = [];

    // Match the variable declaration start: --name:
    const varStartRegex = /--([a-zA-Z0-9-_]+)\s*:/g;
    let match;

    while ((match = varStartRegex.exec(contentWithoutComments)) !== null) {
      const name = match[1];
      if (!name) continue;

      const valueStart = match.index + match[0].length;
      const value = this.extractCssValue(contentWithoutComments, valueStart);

      if (value !== null) {
        // Calculate line number from original content
        const lineNumber = originalContent.slice(0, match.index).split('\n').length;
        results.push({ name, value, lineNumber });
      }
    }

    return results;
  }

  /**
   * Extract SCSS variables handling multi-line values and strings
   */
  private extractScssVariables(
    contentWithoutComments: string,
    originalContent: string
  ): Array<{ name: string; value: string; lineNumber: number }> {
    const results: Array<{ name: string; value: string; lineNumber: number }> = [];

    // Match the variable declaration start: $name:
    const varStartRegex = /\$([a-zA-Z0-9-_]+)\s*:/g;
    let match;

    while ((match = varStartRegex.exec(contentWithoutComments)) !== null) {
      const name = match[1];
      if (!name) continue;

      const valueStart = match.index + match[0].length;
      const value = this.extractCssValue(contentWithoutComments, valueStart);

      if (value !== null) {
        // Calculate line number from original content
        const lineNumber = originalContent.slice(0, match.index).split('\n').length;
        results.push({ name, value, lineNumber });
      }
    }

    return results;
  }

  /**
   * Extract a CSS value starting at the given position, handling:
   * - Nested parentheses (for url(), calc(), etc.)
   * - Quoted strings (which may contain semicolons)
   * - Multi-line values
   * Returns null if no valid value found
   */
  private extractCssValue(content: string, startIndex: number): string | null {
    let i = startIndex;
    let value = '';
    let parenDepth = 0;
    let inString: string | null = null; // null, '"', or "'"

    // Skip leading whitespace
    while (i < content.length && /\s/.test(content[i]!)) {
      i++;
    }

    while (i < content.length) {
      const char = content[i]!;

      // Handle string literals
      if (inString) {
        value += char;
        if (char === inString && content[i - 1] !== '\\') {
          inString = null;
        }
        i++;
        continue;
      }

      // Check for string start
      if (char === '"' || char === "'") {
        inString = char;
        value += char;
        i++;
        continue;
      }

      // Track parentheses depth
      if (char === '(') {
        parenDepth++;
        value += char;
        i++;
        continue;
      }

      if (char === ')') {
        parenDepth--;
        value += char;
        i++;
        continue;
      }

      // Semicolon ends the value only if we're not inside parentheses or strings
      if (char === ';' && parenDepth === 0) {
        break;
      }

      // Handle closing brace (end of rule block) - value ends without semicolon
      if (char === '}' && parenDepth === 0) {
        break;
      }

      value += char;
      i++;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private inferCategory(name: string, value: unknown): string {
    const nameLower = name.toLowerCase();
    const valueStr = String(value).toLowerCase();

    // Infer from name
    if (nameLower.includes('color') || nameLower.includes('background') || nameLower.includes('fill')) {
      return 'color';
    }
    if (nameLower.includes('spacing') || nameLower.includes('gap') || nameLower.includes('margin') || nameLower.includes('padding')) {
      return 'spacing';
    }
    if (nameLower.includes('font') || nameLower.includes('text') || nameLower.includes('typography')) {
      return 'typography';
    }
    if (nameLower.includes('shadow') || nameLower.includes('elevation')) {
      return 'shadow';
    }
    if (nameLower.includes('border') || nameLower.includes('radius')) {
      return 'border';
    }
    if (nameLower.includes('size') || nameLower.includes('width') || nameLower.includes('height')) {
      return 'sizing';
    }
    if (nameLower.includes('animation') || nameLower.includes('duration') || nameLower.includes('timing')) {
      return 'motion';
    }

    // Infer from value
    if (valueStr.startsWith('#') || valueStr.startsWith('rgb') || valueStr.startsWith('hsl')) {
      return 'color';
    }
    if (/^\d+(px|rem|em)$/.test(valueStr)) {
      return 'spacing';
    }

    return 'other';
  }

  private normalizeCategory(type: string): TokenCategory {
    const lower = type.toLowerCase();
    const mapping: Record<string, TokenCategory> = {
      color: 'color',
      colours: 'color',
      spacing: 'spacing',
      space: 'spacing',
      typography: 'typography',
      font: 'typography',
      shadow: 'shadow',
      boxshadow: 'shadow',
      border: 'border',
      borderradius: 'border',
      sizing: 'sizing',
      size: 'sizing',
      motion: 'motion',
      animation: 'motion',
      duration: 'motion',
    };

    return mapping[lower] || 'other';
  }

  private parseTokenValue(category: string, rawValue: string | number): TokenValue {
    const valueStr = String(rawValue).trim();

    if (category === 'color') {
      return {
        type: 'color',
        hex: this.normalizeColor(valueStr),
      };
    }

    if (category === 'spacing' || category === 'sizing') {
      const match = valueStr.match(/^(\d+(?:\.\d+)?)(px|rem|em)?$/);
      if (match && match[1]) {
        return {
          type: 'spacing',
          value: parseFloat(match[1]),
          unit: (match[2] as 'px' | 'rem' | 'em') || 'px',
        };
      }
    }

    // Default to raw value
    return {
      type: 'raw',
      value: valueStr,
    };
  }

  private normalizeColor(value: string): string {
    // Already a hex color
    if (/^#[0-9a-fA-F]{3,8}$/.test(value)) {
      return value.toLowerCase();
    }

    // Could add rgb/hsl conversion here
    return value;
  }
}
