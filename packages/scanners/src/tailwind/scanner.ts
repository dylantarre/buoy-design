import type { DesignToken, DriftSignal, TokenSource } from '@buoy-design/core';
import { createTokenId } from '@buoy-design/core';
import { TailwindConfigParser } from './config-parser.js';
import { ArbitraryValueDetector } from './arbitrary-detector.js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { glob } from 'glob';

export interface TailwindScannerConfig {
  projectRoot: string;
  include?: string[];
  exclude?: string[];
  /** Whether to scan for arbitrary values (default: true) */
  detectArbitraryValues?: boolean;
  /** Whether to extract theme tokens from config (default: true) */
  extractThemeTokens?: boolean;
  /** Whether to extract semantic tokens from class usage in source files (default: false) */
  extractSemanticTokens?: boolean;
  /** Whether to detect class patterns across components for drift/duplication (default: false) */
  detectClassPatterns?: boolean;
}

/**
 * Represents a semantic design token discovered from Tailwind class usage
 */
export interface SemanticToken {
  /** Token name (e.g., 'primary', 'primary-foreground', 'muted') */
  name: string;
  /** Token category inferred from usage */
  category: 'color' | 'spacing' | 'border' | 'typography' | 'other';
  /** Number of times this token is used */
  usageCount: number;
  /** Files where this token is used */
  usedInFiles: string[];
  /** Example classes using this token */
  exampleClasses: string[];
}

/**
 * Represents a duplicated class pattern found across multiple components
 */
export interface DuplicatedClassPattern {
  /** The repeated class pattern */
  pattern: string;
  /** Files containing this pattern */
  files: string[];
  /** Number of occurrences */
  count: number;
}

/**
 * Represents an inconsistency in variant values across similar components
 */
export interface VariantInconsistency {
  /** Component name (e.g., 'button', 'input') */
  componentName: string;
  /** Variant type (e.g., 'size', 'variant') */
  variantType: string;
  /** Variant key (e.g., 'default', 'sm', 'lg') */
  variantKey: string;
  /** The CSS property that differs (e.g., 'height') */
  property: string;
  /** The different class values found */
  classes: string[];
  /** Files where each variant was found */
  locations: Array<{ file: string; value: string }>;
}

/**
 * Represents a class pattern that could be extracted as a reusable token/utility
 */
export interface ExtractablePattern {
  /** The class pattern that repeats */
  pattern: string;
  /** How many times it's used */
  usageCount: number;
  /** Files where it's used */
  usedInFiles: string[];
  /** Suggested name for the extracted utility */
  suggestedName: string;
  /** Category of the pattern */
  category: 'focus' | 'layout' | 'interactive' | 'typography' | 'other';
}

/**
 * Analysis of class patterns across components
 */
export interface ClassPatternAnalysis {
  /** Duplicated class patterns found across components */
  duplicates: DuplicatedClassPattern[];
  /** Inconsistencies in variant values across similar components */
  variantInconsistencies: VariantInconsistency[];
  /** Patterns that could be extracted as reusable tokens/utilities */
  extractablePatterns: ExtractablePattern[];
}

export interface TailwindScanResult {
  tokens: DesignToken[];
  drifts: DriftSignal[];
  configPath: string | null;
  /** Semantic tokens discovered from Tailwind class usage */
  semanticTokens?: SemanticToken[];
  /** Class pattern analysis results */
  classPatterns?: ClassPatternAnalysis;
  stats: {
    filesScanned: number;
    arbitraryValuesFound: number;
    tokensExtracted: number;
    semanticTokensFound?: number;
    classPatternsAnalyzed?: number;
  };
}

/**
 * Parsed result from Tailwind v4 CSS-based configuration
 */
interface TailwindV4Config {
  configPath: string;
  tokens: DesignToken[];
  hasThemeBlock: boolean;
  hasPlugins: boolean;
  hasCustomVariants: boolean;
  hasUtilities: boolean;
}

export class TailwindScanner {
  private config: TailwindScannerConfig;

  constructor(config: TailwindScannerConfig) {
    this.config = {
      detectArbitraryValues: true,
      extractThemeTokens: true,
      extractSemanticTokens: false,
      detectClassPatterns: false,
      ...config,
    };
  }

  async scan(): Promise<TailwindScanResult> {
    const result: TailwindScanResult = {
      tokens: [],
      drifts: [],
      configPath: null,
      stats: {
        filesScanned: 0,
        arbitraryValuesFound: 0,
        tokensExtracted: 0,
      },
    };

    // Extract theme tokens from config
    if (this.config.extractThemeTokens) {
      // Try traditional tailwind.config.js first
      const parser = new TailwindConfigParser(this.config.projectRoot);
      const parsed = await parser.parse();

      if (parsed) {
        // Config found (v3 or v4)
        result.tokens = parsed.tokens;
        result.configPath = parsed.configPath;
        result.stats.tokensExtracted = parsed.tokens.length;

        // For v4 CSS configs, supplement with additional theme variant tokens
        // that the config-parser may not extract (e.g., [data-theme="dark"], .theme-*)
        // and also extract token references from var() usage
        if (parsed.version === 4 && parsed.configPath) {
          const additionalTokens = await this.extractAdditionalThemeVariants(parsed.configPath);
          if (additionalTokens.length > 0) {
            // Add tokens that don't already exist (by id)
            const existingIds = new Set(result.tokens.map(t => t.id));
            const newTokens = additionalTokens.filter(t => !existingIds.has(t.id));
            result.tokens.push(...newTokens);
            result.stats.tokensExtracted = result.tokens.length;
          }

          // Also extract token references from var() usage (Tailwind v4 implicit tokens)
          const fullPath = resolve(this.config.projectRoot, parsed.configPath);
          try {
            const content = readFileSync(fullPath, 'utf-8');
            const relativePath = parsed.configPath;
            const source: TokenSource = { type: 'css', path: relativePath };
            const tokenReferences = this.extractTokenReferences(content, source);
            if (tokenReferences.length > 0) {
              // Add token references that don't already exist (by id)
              const existingIds = new Set(result.tokens.map(t => t.id));
              const newReferenceTokens = tokenReferences.filter(t => !existingIds.has(t.id));
              result.tokens.push(...newReferenceTokens);
              result.stats.tokensExtracted = result.tokens.length;
            }

            // Follow CSS @import directives to aggregate tokens from imported files
            const importedTokens = this.extractTokensFromCSSImports(
              content,
              fullPath,
              new Set([fullPath])
            );
            if (importedTokens.length > 0) {
              const existingIds2 = new Set(result.tokens.map(t => t.id));
              const newImportedTokens = importedTokens.filter(t => !existingIds2.has(t.id));
              result.tokens.push(...newImportedTokens);
              result.stats.tokensExtracted = result.tokens.length;
            }
          } catch {
            // Ignore read errors
          }
        }
      } else {
        // Try Tailwind v4 CSS-based configuration
        const v4Config = await this.parseTailwindV4Config();
        if (v4Config) {
          result.tokens = v4Config.tokens;
          result.configPath = v4Config.configPath;
          result.stats.tokensExtracted = v4Config.tokens.length;
        }
      }
    }

    // Detect arbitrary values in source files
    if (this.config.detectArbitraryValues) {
      const detector = new ArbitraryValueDetector({
        projectRoot: this.config.projectRoot,
        include: this.config.include,
        exclude: this.config.exclude,
      });

      const arbitraryValues = await detector.detect();
      const driftSignals = await detector.detectAsDriftSignals();

      result.drifts = driftSignals;
      result.stats.arbitraryValuesFound = arbitraryValues.length;
      result.stats.filesScanned = new Set(arbitraryValues.map(v => v.file)).size;
    }

    // Extract semantic tokens from class usage in source files
    if (this.config.extractSemanticTokens) {
      const semanticTokens = await this.extractSemanticTokens();
      result.semanticTokens = semanticTokens;
      result.stats.semanticTokensFound = semanticTokens.length;
    }

    // Detect class patterns across components
    if (this.config.detectClassPatterns) {
      const classPatterns = await this.analyzeClassPatterns();
      result.classPatterns = classPatterns;
      result.stats.classPatternsAnalyzed =
        classPatterns.duplicates.length +
        classPatterns.variantInconsistencies.length +
        classPatterns.extractablePatterns.length;
    }

    // Deduplicate tokens by semantic name to avoid counting the same token multiple times
    // when it appears in multiple CSS files or is extracted by multiple methods
    result.tokens = this.deduplicateTokensBySemanticName(result.tokens);
    result.stats.tokensExtracted = result.tokens.length;

    return result;
  }

  /**
   * Deduplicate tokens by their semantic name.
   * When the same CSS variable (e.g., --background) is defined in multiple files
   * or extracted by multiple methods, keep only the first occurrence.
   * This ensures accurate token counts for design system analysis.
   */
  private deduplicateTokensBySemanticName(tokens: DesignToken[]): DesignToken[] {
    const seen = new Map<string, DesignToken>();

    for (const token of tokens) {
      // Use the token name as the semantic key for deduplication
      // This handles cases like 'tw-background' and 'tw-background-dark'
      if (!seen.has(token.name)) {
        seen.set(token.name, token);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Extract semantic design tokens from Tailwind class usage in source files
   */
  private async extractSemanticTokens(): Promise<SemanticToken[]> {
    const tokenMap = new Map<string, SemanticToken>();

    // File patterns to scan for Tailwind classes
    const sourcePatterns = this.config.include || [
      '**/*.tsx',
      '**/*.jsx',
      '**/*.ts',
      '**/*.js',
      '**/*.vue',
      '**/*.svelte',
    ];

    const exclude = [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/*.test.*',
      '**/*.spec.*',
      ...(this.config.exclude || []),
    ];

    for (const pattern of sourcePatterns) {
      try {
        const files = await glob(pattern, {
          cwd: this.config.projectRoot,
          ignore: exclude,
          absolute: true,
        });

        for (const file of files) {
          const content = readFileSync(file, 'utf-8');
          const relativePath = file.replace(this.config.projectRoot + '/', '');
          this.extractSemanticTokensFromContent(content, relativePath, tokenMap);
        }
      } catch {
        // Continue to next pattern
      }
    }

    return Array.from(tokenMap.values());
  }

  /**
   * Extract semantic tokens from file content
   */
  private extractSemanticTokensFromContent(
    content: string,
    filePath: string,
    tokenMap: Map<string, SemanticToken>
  ): void {
    // Extract all string literals that could contain Tailwind classes
    const classStrings = this.extractClassStrings(content);

    for (const classString of classStrings) {
      const classes = classString.split(/\s+/).filter(Boolean);

      for (const cls of classes) {
        const semanticToken = this.parseSemanticToken(cls);
        if (semanticToken) {
          const existing = tokenMap.get(semanticToken.name);
          if (existing) {
            existing.usageCount++;
            if (!existing.usedInFiles.includes(filePath)) {
              existing.usedInFiles.push(filePath);
            }
            if (existing.exampleClasses.length < 5 && !existing.exampleClasses.includes(cls)) {
              existing.exampleClasses.push(cls);
            }
          } else {
            tokenMap.set(semanticToken.name, {
              ...semanticToken,
              usageCount: 1,
              usedInFiles: [filePath],
              exampleClasses: [cls],
            });
          }
        }
      }
    }
  }

  /**
   * Extract class strings from source code content
   */
  private extractClassStrings(content: string): string[] {
    const classStrings: string[] = [];

    // Match className="..." or class="..."
    const classNameRegex = /(?:className|class)\s*=\s*["']([^"']+)["']/g;
    let match;
    while ((match = classNameRegex.exec(content)) !== null) {
      classStrings.push(match[1]!);
    }

    // Match className={cn(...)} or className={clsx(...)} or className={classNames(...)}
    const cnCallRegex = /(?:cn|clsx|classNames|cva)\s*\(\s*[\s\S]*?\)/g;
    while ((match = cnCallRegex.exec(content)) !== null) {
      // Extract string literals from within the function call
      const innerStrings = this.extractStringsFromFunctionCall(match[0]);
      classStrings.push(...innerStrings);
    }

    // Match cva variant definitions - look for object values that are strings
    const variantRegex = /variants\s*:\s*\{[\s\S]*?\}/g;
    while ((match = variantRegex.exec(content)) !== null) {
      const innerStrings = this.extractStringsFromFunctionCall(match[0]);
      classStrings.push(...innerStrings);
    }

    return classStrings;
  }

  /**
   * Extract string literals from a function call or object
   */
  private extractStringsFromFunctionCall(code: string): string[] {
    const strings: string[] = [];
    // Match both single and double quoted strings
    const stringRegex = /["']([^"']+)["']/g;
    let match;
    while ((match = stringRegex.exec(code)) !== null) {
      strings.push(match[1]!);
    }
    // Match template literals
    const templateRegex = /`([^`]+)`/g;
    while ((match = templateRegex.exec(code)) !== null) {
      strings.push(match[1]!);
    }
    return strings;
  }

  /**
   * Parse a Tailwind class to extract semantic token name
   * Returns null if the class doesn't reference a semantic token
   */
  private parseSemanticToken(cls: string): Omit<SemanticToken, 'usageCount' | 'usedInFiles' | 'exampleClasses'> | null {
    // Known semantic token patterns in shadcn-ui and similar design systems
    const semanticPatterns = [
      // Color tokens: bg-primary, text-foreground, border-input, etc.
      /^(?:bg|text|border|ring|outline|fill|stroke|shadow|from|to|via)-([a-z]+-?[a-z]*(?:-foreground)?)(?:\/\d+)?$/,
      // Hover/focus variants: hover:bg-primary, focus:ring-ring
      /^(?:hover|focus|active|disabled|focus-visible):(?:bg|text|border|ring|outline|fill|stroke|from|to|via)-([a-z]+-?[a-z]*(?:-foreground)?)(?:\/\d+)?$/,
      // Placeholder variants: placeholder:text-muted-foreground
      /^placeholder:(?:text|bg)-([a-z]+-?[a-z]*(?:-foreground)?)(?:\/\d+)?$/,
    ];

    // Known semantic token names from shadcn-ui and common design systems
    const knownSemanticTokens = new Set([
      'primary', 'primary-foreground',
      'secondary', 'secondary-foreground',
      'destructive', 'destructive-foreground',
      'muted', 'muted-foreground',
      'accent', 'accent-foreground',
      'popover', 'popover-foreground',
      'card', 'card-foreground',
      'background', 'foreground',
      'border', 'input', 'ring',
      'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5',
      'sidebar', 'sidebar-foreground',
      'sidebar-primary', 'sidebar-primary-foreground',
      'sidebar-accent', 'sidebar-accent-foreground',
      'sidebar-border', 'sidebar-ring',
    ]);

    for (const pattern of semanticPatterns) {
      const match = cls.match(pattern);
      if (match && match[1]) {
        const tokenName = match[1];
        // Only return if it's a known semantic token or looks like one
        if (knownSemanticTokens.has(tokenName) || this.looksLikeSemanticToken(tokenName)) {
          return {
            name: tokenName,
            category: this.categorizeSemanticToken(tokenName, cls),
          };
        }
      }
    }

    return null;
  }

  /**
   * Check if a token name looks like a semantic design token
   */
  private looksLikeSemanticToken(name: string): boolean {
    // Semantic tokens typically have meaningful names, not utility values
    // Exclude standard Tailwind color names like 'red-500', 'blue-200', etc.
    const utilityColorPattern = /^(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(-\d+)?$/;
    if (utilityColorPattern.test(name)) {
      return false;
    }

    // Semantic tokens usually have descriptive names
    const semanticPatterns = [
      /foreground$/,
      /background$/,
      /^primary/,
      /^secondary/,
      /^accent/,
      /^muted/,
      /^destructive/,
      /^success/,
      /^warning/,
      /^error/,
      /^info/,
      /^surface/,
      /^popover/,
      /^card/,
      /^sidebar/,
      /^input$/,
      /^ring$/,
      /^border$/,
    ];

    return semanticPatterns.some(pattern => pattern.test(name));
  }

  /**
   * Categorize a semantic token based on its name and usage
   */
  private categorizeSemanticToken(name: string, cls: string): 'color' | 'spacing' | 'border' | 'typography' | 'other' {
    // If used with text-*, it's text color
    if (cls.includes('text-')) {
      return 'color';
    }
    // If used with bg-*, it's background color
    if (cls.includes('bg-')) {
      return 'color';
    }
    // Border-related
    if (cls.includes('border-') || name.includes('border')) {
      return name === 'border' ? 'color' : 'border';
    }
    // Ring-related
    if (cls.includes('ring-') || name === 'ring') {
      return 'color';
    }

    // Default based on name
    if (name.includes('foreground') || name.includes('background')) {
      return 'color';
    }

    return 'color';
  }

  /**
   * Extract additional theme variant tokens that the config-parser may not handle
   * (e.g., [data-theme="dark"], .theme-*, and other alternative dark mode patterns)
   */
  private async extractAdditionalThemeVariants(configPath: string): Promise<DesignToken[]> {
    try {
      const fullPath = resolve(this.config.projectRoot, configPath);
      const content = readFileSync(fullPath, 'utf-8');
      const relativePath = configPath;

      const source: TokenSource = {
        type: 'css',
        path: relativePath,
      };

      return this.extractThemeVariantVariables(content, source);
    } catch {
      return [];
    }
  }

  /**
   * Parse Tailwind v4 CSS-based configuration
   * Looks for CSS files with @import "tailwindcss" and extracts theme tokens
   */
  private async parseTailwindV4Config(): Promise<TailwindV4Config | null> {
    // Find CSS files that might contain Tailwind v4 config
    const cssPatterns = [
      'src/styles/globals.css',
      'src/globals.css',
      'app/globals.css',
      'styles/globals.css',
      'src/styles.css',
      'styles.css',
      'src/index.css',
      'src/app.css',
      '**/*.css',
    ];

    const exclude = [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      ...(this.config.exclude || []),
    ];

    for (const pattern of cssPatterns) {
      try {
        const files = await glob(pattern, {
          cwd: this.config.projectRoot,
          ignore: exclude,
          absolute: true,
        });

        for (const file of files) {
          const content = readFileSync(file, 'utf-8');

          // Check if this is a Tailwind v4 CSS file
          if (this.isTailwindV4CSSFile(content)) {
            const tokens = this.extractTokensFromCSS(content, file);
            const relativePath = file.replace(this.config.projectRoot + '/', '');

            return {
              configPath: relativePath,
              tokens,
              hasThemeBlock: /@theme\s+(inline\s+)?{/.test(content),
              hasPlugins: /@plugin\s+['"]/.test(content),
              hasCustomVariants: /@custom-variant\s+/.test(content),
              hasUtilities: /@utility\s+/.test(content),
            };
          }
        }
      } catch {
        // Continue to next pattern
      }
    }

    return null;
  }

  /**
   * Check if a CSS file is a Tailwind v4 configuration file
   */
  private isTailwindV4CSSFile(content: string): boolean {
    // Tailwind v4 uses @import "tailwindcss" or @import 'tailwindcss'
    const hasTailwindImport = /@import\s+['"]tailwindcss['"]/.test(content);

    // Also check for @theme, @plugin, @custom-variant which are v4-specific
    const hasV4Features =
      /@theme\s+(inline\s+)?{/.test(content) ||
      /@plugin\s+['"]/.test(content) ||
      /@custom-variant\s+/.test(content);

    return hasTailwindImport || hasV4Features;
  }

  /**
   * Extract design tokens from Tailwind v4 CSS configuration
   */
  private extractTokensFromCSS(content: string, filePath: string): DesignToken[] {
    const tokens: DesignToken[] = [];
    const relativePath = filePath.replace(this.config.projectRoot + '/', '');

    const source: TokenSource = {
      type: 'css',
      path: relativePath,
    };

    // Extract tokens from @theme inline { } blocks
    const themeTokens = this.extractThemeBlockTokens(content, source);
    tokens.push(...themeTokens);

    // Extract CSS custom properties from :root
    const rootTokens = this.extractRootVariables(content, source);
    tokens.push(...rootTokens);

    // Extract CSS custom properties from theme variant selectors (.dark, [data-theme="dark"], etc.)
    const themeVariantTokens = this.extractThemeVariantVariables(content, source);
    tokens.push(...themeVariantTokens);

    // Extract CSS custom properties from @layer blocks (base, components, utilities)
    const layerTokens = this.extractLayerVariables(content, source);
    tokens.push(...layerTokens);

    // Extract token references from var() usage (Tailwind v4 implicit tokens)
    const tokenReferences = this.extractTokenReferences(content, source);
    tokens.push(...tokenReferences);

    // Follow CSS @import directives to aggregate tokens from imported files
    const importedTokens = this.extractTokensFromCSSImports(content, filePath, new Set([filePath]));
    tokens.push(...importedTokens);

    return tokens;
  }

  /**
   * Extract tokens from CSS files referenced via @import directives.
   * This follows the import chain recursively to aggregate all design tokens.
   * @param content The CSS content to scan for @import directives
   * @param currentFilePath The absolute path of the current CSS file
   * @param visited Set of already visited file paths to prevent cycles
   */
  private extractTokensFromCSSImports(
    content: string,
    currentFilePath: string,
    visited: Set<string>
  ): DesignToken[] {
    const tokens: DesignToken[] = [];

    // Extract @import paths from CSS content
    // Match patterns like:
    // @import "./styles.css";
    // @import "../theme.css" layer(base);
    // @import "path/to/file.css";
    const importRegex = /@import\s+["']([^"']+\.css)["'](?:\s+[^;]*)?;/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1]!;

      // Skip special imports like "tailwindcss"
      if (importPath === 'tailwindcss' || !importPath.endsWith('.css')) {
        continue;
      }

      // Resolve the import path relative to the current file
      const currentDir = dirname(currentFilePath);
      const resolvedPath = this.resolveImportPath(importPath, currentDir);

      // Skip if already visited or file doesn't exist
      if (!resolvedPath || visited.has(resolvedPath)) {
        continue;
      }

      visited.add(resolvedPath);

      try {
        const importedContent = readFileSync(resolvedPath, 'utf-8');
        const relativePath = resolvedPath.replace(this.config.projectRoot + '/', '');

        const source: TokenSource = {
          type: 'css',
          path: relativePath,
        };

        // Extract tokens from the imported file
        // Extract CSS custom properties from :root in imported files
        const rootTokens = this.extractRootVariables(importedContent, source);
        tokens.push(...rootTokens);

        // Extract theme variant tokens (.dark {}, etc.)
        const themeVariantTokens = this.extractThemeVariantVariables(importedContent, source);
        tokens.push(...themeVariantTokens);

        // Extract @layer tokens
        const layerTokens = this.extractLayerVariables(importedContent, source);
        tokens.push(...layerTokens);

        // Extract tokens from @theme blocks (if any)
        const themeBlockTokens = this.extractThemeBlockTokens(importedContent, source);
        tokens.push(...themeBlockTokens);

        // Extract token references from var() usage
        const tokenReferences = this.extractTokenReferences(importedContent, source);
        tokens.push(...tokenReferences);

        // Extract CSS variables from any class selector (like .style-vega {}, .theme-* {})
        const classVariableTokens = this.extractClassVariables(importedContent, source);
        tokens.push(...classVariableTokens);

        // Recursively follow imports in the imported file
        const nestedTokens = this.extractTokensFromCSSImports(importedContent, resolvedPath, visited);
        tokens.push(...nestedTokens);
      } catch {
        // Ignore read errors - file may not exist or be inaccessible
      }
    }

    return tokens;
  }

  /**
   * Resolve a CSS import path relative to a base directory.
   * Handles relative paths (./foo.css, ../bar.css) and bare paths (path/to/file.css).
   */
  private resolveImportPath(importPath: string, baseDir: string): string | null {
    // Handle relative imports
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      const resolved = resolve(baseDir, importPath);
      return existsSync(resolved) ? resolved : null;
    }

    // Handle bare paths - try resolving relative to base dir first
    const resolvedRelative = join(baseDir, importPath);
    if (existsSync(resolvedRelative)) {
      return resolvedRelative;
    }

    // Try resolving relative to project root
    const resolvedFromRoot = resolve(this.config.projectRoot, importPath);
    if (existsSync(resolvedFromRoot)) {
      return resolvedFromRoot;
    }

    return null;
  }

  /**
   * Extract tokens from @theme inline { } blocks
   */
  private extractThemeBlockTokens(content: string, source: TokenSource): DesignToken[] {
    const tokens: DesignToken[] = [];

    // Match @theme inline { ... } or @theme { ... }
    const themeBlockRegex = /@theme\s+(?:inline\s+)?{([^}]+)}/gs;
    let match;

    while ((match = themeBlockRegex.exec(content)) !== null) {
      const blockContent = match[1]!;

      // Extract CSS custom properties from the theme block
      const varRegex = /--([\w-]+):\s*([^;]+);/g;
      let varMatch;

      while ((varMatch = varRegex.exec(blockContent)) !== null) {
        const name = varMatch[1]!;
        const value = varMatch[2]!.trim();

        const token = this.createTokenFromCSSVar(name, value, source, 'theme');
        if (token) {
          tokens.push(token);
        }
      }
    }

    return tokens;
  }

  /**
   * Extract CSS custom properties from :root { } selectors
   */
  private extractRootVariables(content: string, source: TokenSource): DesignToken[] {
    const tokens: DesignToken[] = [];

    // Match :root { ... } blocks (but not those inside @layer blocks, which are handled separately)
    const rootBlockRegex = /:root\s*{([^}]+)}/gs;
    let match;

    while ((match = rootBlockRegex.exec(content)) !== null) {
      const blockContent = match[1]!;

      // Extract CSS custom properties
      const varRegex = /--([\w-]+):\s*([^;]+);/g;
      let varMatch;

      while ((varMatch = varRegex.exec(blockContent)) !== null) {
        const name = varMatch[1]!;
        const value = varMatch[2]!.trim();

        const token = this.createTokenFromCSSVar(name, value, source, 'root');
        if (token) {
          tokens.push(token);
        }
      }
    }

    return tokens;
  }

  /**
   * Extract CSS custom properties from theme variant selectors
   * Handles: .dark { }, [data-theme="dark"] { }, .theme-* { }, :root.dark { }, html.dark { }, etc.
   */
  private extractThemeVariantVariables(content: string, source: TokenSource): DesignToken[] {
    const tokens: DesignToken[] = [];

    // Theme variant patterns - match common dark mode and theme selectors
    // Note: We use a balanced brace approach to handle nested blocks
    const themeVariantPatterns = [
      // .dark { ... } - most common shadcn-ui pattern
      /\.dark\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/gs,
      // [data-theme="dark"] { ... }
      /\[data-theme=["']dark["']\]\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/gs,
      // [data-mode="dark"] { ... }
      /\[data-mode=["']dark["']\]\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/gs,
      // :root.dark { ... }
      /:root\.dark\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/gs,
      // html.dark { ... }
      /html\.dark\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/gs,
      // .theme-dark { ... }
      /\.theme-dark\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/gs,
      // .theme-* { ... } (custom theme classes)
      /\.theme-[\w-]+\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/gs,
    ];

    for (const pattern of themeVariantPatterns) {
      let match;
      // Reset lastIndex for each pattern
      pattern.lastIndex = 0;

      while ((match = pattern.exec(content)) !== null) {
        const blockContent = match[0];
        const innerContent = match[1]!;

        // Determine theme variant name from the selector
        const themeVariant = this.extractThemeVariantName(blockContent);

        // Extract CSS custom properties from this block
        const varRegex = /--([\w-]+):\s*([^;]+);/g;
        let varMatch;

        while ((varMatch = varRegex.exec(innerContent)) !== null) {
          const name = varMatch[1]!;
          const value = varMatch[2]!.trim();

          const token = this.createTokenFromCSSVar(name, value, source, 'root', themeVariant);
          if (token) {
            tokens.push(token);
          }
        }
      }
    }

    return tokens;
  }

  /**
   * Extract theme variant name from a CSS selector
   */
  private extractThemeVariantName(selector: string): string {
    // .dark -> dark
    if (/\.dark\s*\{/.test(selector)) return 'dark';
    // [data-theme="dark"] -> dark
    if (/\[data-theme=["']dark["']\]/.test(selector)) return 'dark';
    // [data-mode="dark"] -> dark
    if (/\[data-mode=["']dark["']\]/.test(selector)) return 'dark';
    // :root.dark or html.dark -> dark
    if (/:root\.dark|html\.dark/.test(selector)) return 'dark';
    // .theme-dark -> dark
    if (/\.theme-dark/.test(selector)) return 'dark';
    // .theme-<name> -> extract name
    const themeMatch = selector.match(/\.theme-([\w-]+)/);
    if (themeMatch) return themeMatch[1]!;

    return 'variant';
  }

  /**
   * Extract CSS custom properties from @layer blocks
   * Handles: @layer base { :root { ... } .dark { ... } }
   */
  private extractLayerVariables(content: string, source: TokenSource): DesignToken[] {
    const tokens: DesignToken[] = [];

    // Match @layer base/components/utilities { ... } blocks
    // We need to handle nested braces properly
    const layerRegex = /@layer\s+(base|components|utilities)\s*\{/g;
    let match;

    while ((match = layerRegex.exec(content)) !== null) {
      const layerName = match[1]!;
      const startIndex = match.index + match[0].length;

      // Find the matching closing brace
      const layerContent = this.extractBalancedBraces(content, startIndex);
      if (!layerContent) continue;

      // Now extract variables from :root and theme variants within this layer
      // Extract :root variables within the layer
      const rootBlockRegex = /:root\s*\{([^}]+)\}/gs;
      let rootMatch;

      while ((rootMatch = rootBlockRegex.exec(layerContent)) !== null) {
        const blockContent = rootMatch[1]!;
        const varRegex = /--([\w-]+):\s*([^;]+);/g;
        let varMatch;

        while ((varMatch = varRegex.exec(blockContent)) !== null) {
          const name = varMatch[1]!;
          const value = varMatch[2]!.trim();

          const token = this.createTokenFromCSSVar(name, value, source, 'root', undefined, layerName);
          if (token) {
            tokens.push(token);
          }
        }
      }

      // Extract .dark variables within the layer
      const darkBlockRegex = /\.dark\s*\{([^}]+)\}/gs;
      let darkMatch;

      while ((darkMatch = darkBlockRegex.exec(layerContent)) !== null) {
        const blockContent = darkMatch[1]!;
        const varRegex = /--([\w-]+):\s*([^;]+);/g;
        let varMatch;

        while ((varMatch = varRegex.exec(blockContent)) !== null) {
          const name = varMatch[1]!;
          const value = varMatch[2]!.trim();

          const token = this.createTokenFromCSSVar(name, value, source, 'root', 'dark', layerName);
          if (token) {
            tokens.push(token);
          }
        }
      }
    }

    return tokens;
  }

  /**
   * Extract CSS custom properties from any class selector.
   * Handles patterns like .style-vega {}, .theme-custom {}, etc.
   * These are common in component style overrides and theme variations.
   */
  private extractClassVariables(content: string, source: TokenSource): DesignToken[] {
    const tokens: DesignToken[] = [];

    // Match class selectors with CSS custom properties
    // Pattern: .class-name { --var: value; }
    const classBlockRegex = /\.([\w-]+)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/gs;
    let match;

    while ((match = classBlockRegex.exec(content)) !== null) {
      const className = match[1]!;
      const blockContent = match[2]!;

      // Skip common non-token class names (utility classes, etc.)
      if (this.isUtilityClassName(className)) {
        continue;
      }

      // Extract CSS custom properties from the block
      const varRegex = /--([\w-]+):\s*([^;]+);/g;
      let varMatch;

      while ((varMatch = varRegex.exec(blockContent)) !== null) {
        const name = varMatch[1]!;
        const value = varMatch[2]!.trim();

        // Create token with class name as context
        const token = this.createTokenFromCSSVar(name, value, source, 'root', className);
        if (token) {
          tokens.push(token);
        }
      }
    }

    return tokens;
  }

  /**
   * Check if a class name looks like a Tailwind utility class (not a component/theme class)
   */
  private isUtilityClassName(className: string): boolean {
    // Tailwind utility prefixes that are NOT component/theme classes
    const utilityPrefixes = [
      'flex', 'grid', 'block', 'inline', 'hidden',
      'w-', 'h-', 'p-', 'm-', 'px-', 'py-', 'mx-', 'my-',
      'bg-', 'text-', 'border-', 'rounded-',
      'absolute', 'relative', 'fixed', 'sticky',
      'top-', 'bottom-', 'left-', 'right-',
      'z-', 'opacity-', 'shadow-',
    ];

    return utilityPrefixes.some(prefix =>
      className === prefix.replace(/-$/, '') || className.startsWith(prefix)
    );
  }

  /**
   * Extract token references from var() usage in CSS content.
   * This detects Tailwind v4 implicit tokens (like --color-gray-200, --spacing-4, etc.)
   * that are referenced via var() but not explicitly defined in the CSS file.
   */
  private extractTokenReferences(content: string, source: TokenSource): DesignToken[] {
    const tokens: DesignToken[] = [];
    const seenTokens = new Set<string>();

    // Match all var(--token-name) or var(--token-name, fallback) patterns
    const varRefRegex = /var\(\s*--([a-zA-Z][a-zA-Z0-9-]*)/g;
    let match;

    while ((match = varRefRegex.exec(content)) !== null) {
      const tokenName = match[1]!;

      // Skip if we've already seen this token
      if (seenTokens.has(tokenName)) continue;
      seenTokens.add(tokenName);

      // Check if this looks like a Tailwind implicit token
      if (this.isTailwindImplicitToken(tokenName)) {
        const category = this.categorizeToken(tokenName);
        const tags = ['tailwind', 'v4', 'reference', 'implicit'];

        tokens.push({
          id: createTokenId(source, `tw-${tokenName}`),
          name: `tw-${tokenName}`,
          category,
          value: { type: 'raw', value: `var(--${tokenName})` },
          source,
          aliases: [tokenName],
          usedBy: [],
          metadata: { tags },
          scannedAt: new Date(),
        });
      }
    }

    return tokens;
  }

  /**
   * Check if a token name looks like a Tailwind v4 implicit token.
   * Tailwind v4 provides implicit tokens for colors, spacing, font, radius, shadow, etc.
   */
  private isTailwindImplicitToken(name: string): boolean {
    // Tailwind v4 implicit color tokens: --color-{color}-{shade}
    const colorPattern = /^color-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)-?\d*$/;
    if (colorPattern.test(name)) return true;

    // Tailwind v4 spacing tokens: --spacing-{size}
    if (/^spacing-\d+(\.\d+)?$/.test(name)) return true;
    if (/^spacing-(px|full)$/.test(name)) return true;

    // Tailwind v4 font tokens: --font-{family}
    if (/^font-(sans|serif|mono)$/.test(name)) return true;

    // Tailwind v4 radius tokens: --radius-{size}
    if (/^radius-(none|sm|md|lg|xl|2xl|3xl|full)$/.test(name)) return true;

    // Tailwind v4 shadow tokens: --shadow-{size}
    if (/^shadow-(none|sm|md|lg|xl|2xl|inner)$/.test(name)) return true;

    // Tailwind v4 text size tokens: --text-{size}
    if (/^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)$/.test(name)) return true;

    // Tailwind v4 width/height/size tokens
    if (/^(width|height|size)-\d+$/.test(name)) return true;

    // Tailwind v4 opacity tokens
    if (/^opacity-\d+$/.test(name)) return true;

    // Tailwind v4 z-index tokens
    if (/^z-\d+$/.test(name)) return true;

    return false;
  }

  /**
   * Extract content within balanced braces starting from a given position
   */
  private extractBalancedBraces(content: string, startIndex: number): string | null {
    let depth = 1;
    let endIndex = startIndex;

    while (depth > 0 && endIndex < content.length) {
      const char = content[endIndex];
      if (char === '{') depth++;
      else if (char === '}') depth--;
      endIndex++;
    }

    if (depth !== 0) return null;

    // Return content without the final closing brace
    return content.substring(startIndex, endIndex - 1);
  }

  /**
   * Create a design token from a CSS custom property
   */
  private createTokenFromCSSVar(
    name: string,
    value: string,
    source: TokenSource,
    origin: 'theme' | 'root',
    themeVariant?: string,
    layer?: string
  ): DesignToken | null {
    // Build tags array
    const tags: string[] = ['tailwind', 'v4', origin];
    if (themeVariant) tags.push(themeVariant);
    if (layer) tags.push(`layer-${layer}`);

    // Build unique token ID - include variant to differentiate light/dark tokens
    const tokenIdSuffix = themeVariant ? `${name}-${themeVariant}` : name;

    // Skip if value is just a var() reference
    if (/^var\(--[^)]+\)$/.test(value)) {
      // Still create a token for mapping purposes
      return {
        id: createTokenId(source, `tw-${tokenIdSuffix}`),
        name: themeVariant ? `tw-${name}-${themeVariant}` : `tw-${name}`,
        category: this.categorizeToken(name),
        value: { type: 'raw', value },
        source,
        aliases: [name],
        usedBy: [],
        metadata: { tags: [...tags, 'reference'] },
        scannedAt: new Date(),
      };
    }

    // Detect token category from name
    const category = this.categorizeToken(name);

    // Parse value based on category
    const tokenValue = this.parseTokenValue(value, category);

    return {
      id: createTokenId(source, `tw-${tokenIdSuffix}`),
      name: themeVariant ? `tw-${name}-${themeVariant}` : `tw-${name}`,
      category,
      value: tokenValue,
      source,
      aliases: [name],
      usedBy: [],
      metadata: { tags },
      scannedAt: new Date(),
    };
  }

  /**
   * Categorize a token based on its CSS variable name
   */
  private categorizeToken(name: string): 'color' | 'spacing' | 'border' | 'typography' | 'other' {
    const lowercaseName = name.toLowerCase();

    // Color-related names
    if (
      lowercaseName.includes('color') ||
      lowercaseName.includes('background') ||
      lowercaseName.includes('foreground') ||
      lowercaseName.includes('primary') ||
      lowercaseName.includes('secondary') ||
      lowercaseName.includes('accent') ||
      lowercaseName.includes('muted') ||
      lowercaseName.includes('destructive') ||
      lowercaseName.includes('border') ||
      lowercaseName.includes('ring') ||
      lowercaseName.includes('chart') ||
      lowercaseName.includes('sidebar') ||
      lowercaseName.includes('popover') ||
      lowercaseName.includes('card') ||
      lowercaseName.includes('input') ||
      lowercaseName.includes('surface') ||
      lowercaseName.includes('selection') ||
      lowercaseName.includes('code')
    ) {
      return 'color';
    }

    // Spacing-related names
    if (
      lowercaseName.includes('spacing') ||
      lowercaseName.includes('gap') ||
      lowercaseName.includes('margin') ||
      lowercaseName.includes('padding') ||
      lowercaseName.includes('breakpoint')
    ) {
      return 'spacing';
    }

    // Border/radius-related names
    if (lowercaseName.includes('radius')) {
      return 'border';
    }

    // Typography-related names
    if (
      lowercaseName.includes('font') ||
      lowercaseName.includes('text') ||
      lowercaseName.includes('letter') ||
      lowercaseName.includes('line')
    ) {
      return 'typography';
    }

    return 'other';
  }

  /**
   * Parse a CSS value into a typed token value
   */
  private parseTokenValue(
    value: string,
    category: string
  ): { type: 'color'; hex: string } | { type: 'spacing'; value: number; unit: 'rem' | 'px' | 'em' } | { type: 'raw'; value: string } {
    // Try to parse as color
    if (category === 'color') {
      // Handle hex colors
      if (value.startsWith('#')) {
        return { type: 'color', hex: value };
      }

      // Handle oklch, rgb, hsl colors - keep as raw for now
      if (value.startsWith('oklch') || value.startsWith('rgb') || value.startsWith('hsl')) {
        return { type: 'raw', value };
      }
    }

    // Try to parse as spacing
    const spacingMatch = value.match(/^([\d.]+)(rem|px|em)$/);
    if (spacingMatch) {
      return {
        type: 'spacing',
        value: parseFloat(spacingMatch[1]!),
        unit: spacingMatch[2] as 'rem' | 'px' | 'em',
      };
    }

    // Default to raw value
    return { type: 'raw', value };
  }

  /**
   * Analyze class patterns across components to detect duplications,
   * variant inconsistencies, and extractable patterns
   */
  private async analyzeClassPatterns(): Promise<ClassPatternAnalysis> {
    const result: ClassPatternAnalysis = {
      duplicates: [],
      variantInconsistencies: [],
      extractablePatterns: [],
    };

    // Collect all class strings from source files
    const fileClassData = await this.collectClassDataFromFiles();

    // Analyze duplicated patterns
    result.duplicates = this.findDuplicatedPatterns(fileClassData);

    // Analyze variant inconsistencies (for cva patterns)
    result.variantInconsistencies = this.findVariantInconsistencies(fileClassData);

    // Find extractable patterns
    result.extractablePatterns = this.findExtractablePatterns(fileClassData);

    return result;
  }

  /**
   * Collect class strings and metadata from source files
   */
  private async collectClassDataFromFiles(): Promise<Map<string, FileClassData>> {
    const fileClassData = new Map<string, FileClassData>();

    const sourcePatterns = this.config.include || [
      '**/*.tsx',
      '**/*.jsx',
      '**/*.ts',
      '**/*.js',
      '**/*.vue',
      '**/*.svelte',
    ];

    const exclude = [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/*.test.*',
      '**/*.spec.*',
      ...(this.config.exclude || []),
    ];

    for (const pattern of sourcePatterns) {
      try {
        const files = await glob(pattern, {
          cwd: this.config.projectRoot,
          ignore: exclude,
          absolute: true,
        });

        for (const file of files) {
          const content = readFileSync(file, 'utf-8');
          const relativePath = file.replace(this.config.projectRoot + '/', '');
          const classData = this.extractClassDataFromFile(content, relativePath);
          if (classData.classStrings.length > 0 || classData.cvaVariants.length > 0) {
            fileClassData.set(relativePath, classData);
          }
        }
      } catch {
        // Continue to next pattern
      }
    }

    return fileClassData;
  }

  /**
   * Extract class data from a single file
   */
  private extractClassDataFromFile(content: string, filePath: string): FileClassData {
    const result: FileClassData = {
      filePath,
      classStrings: [],
      cvaVariants: [],
      componentName: this.extractComponentName(filePath),
    };

    // Extract all class strings
    const classStrings = this.extractClassStrings(content);
    result.classStrings = classStrings;

    // Extract CVA variant definitions
    const cvaVariants = this.extractCvaVariants(content);
    result.cvaVariants = cvaVariants;

    return result;
  }

  /**
   * Extract component name from file path
   */
  private extractComponentName(filePath: string): string {
    const match = filePath.match(/([^/]+)\.tsx?$/);
    if (match) {
      return match[1]!.toLowerCase();
    }
    return filePath;
  }

  /**
   * Extract CVA variant definitions from file content
   */
  private extractCvaVariants(content: string): CvaVariant[] {
    const variants: CvaVariant[] = [];

    // Match cva() calls - more flexible regex for multiline
    const cvaCallRegex = /(?:const|let|var)\s+(\w+)\s*=\s*cva\s*\(/gs;
    let cvaMatch;

    while ((cvaMatch = cvaCallRegex.exec(content)) !== null) {
      const variantName = cvaMatch[1]!;
      const startPos = cvaMatch.index + cvaMatch[0].length;

      // Find the matching closing parenthesis by counting brackets
      let depth = 1;
      let pos = startPos;
      while (depth > 0 && pos < content.length) {
        const char = content[pos];
        if (char === '(' || char === '{' || char === '[') depth++;
        else if (char === ')' || char === '}' || char === ']') depth--;
        pos++;
      }

      const cvaContent = content.substring(startPos, pos - 1);

      // Look for variants: { ... } block within the cva content
      // Use a simpler approach: find "variants:" and then extract the content
      const variantsStartMatch = cvaContent.match(/variants\s*:\s*\{/);
      if (!variantsStartMatch) continue;

      const variantsStart = variantsStartMatch.index! + variantsStartMatch[0].length;

      // Find matching closing brace for the variants block
      let braceDepth = 1;
      let variantsEnd = variantsStart;
      while (braceDepth > 0 && variantsEnd < cvaContent.length) {
        const char = cvaContent[variantsEnd];
        if (char === '{') braceDepth++;
        else if (char === '}') braceDepth--;
        variantsEnd++;
      }

      const variantsBlockContent = cvaContent.substring(variantsStart, variantsEnd - 1);

      // Parse each variant type (size, variant, etc.)
      // Match patterns like: size: { default: "...", sm: "..." }
      const variantTypeStartRegex = /(\w+)\s*:\s*\{/g;
      let variantTypeMatch;

      while ((variantTypeMatch = variantTypeStartRegex.exec(variantsBlockContent)) !== null) {
        const variantType = variantTypeMatch[1]!;
        const typeStart = variantTypeMatch.index + variantTypeMatch[0].length;

        // Find matching closing brace
        let typeDepth = 1;
        let typeEnd = typeStart;
        while (typeDepth > 0 && typeEnd < variantsBlockContent.length) {
          const char = variantsBlockContent[typeEnd];
          if (char === '{') typeDepth++;
          else if (char === '}') typeDepth--;
          typeEnd++;
        }

        const variantValuesContent = variantsBlockContent.substring(typeStart, typeEnd - 1);

        // Extract individual variant values (key: "value")
        const valueRegex = /(\w+(?:-\w+)?)\s*:\s*["'`]([^"'`]*)["'`]/g;
        let valueMatch;

        while ((valueMatch = valueRegex.exec(variantValuesContent)) !== null) {
          variants.push({
            name: variantName,
            type: variantType,
            key: valueMatch[1]!,
            classes: valueMatch[2]!,
          });
        }
      }
    }

    return variants;
  }

  /**
   * Find duplicated class patterns across files
   */
  private findDuplicatedPatterns(fileClassData: Map<string, FileClassData>): DuplicatedClassPattern[] {
    const patternMap = new Map<string, { files: Set<string>; count: number }>();

    for (const [filePath, data] of fileClassData) {
      for (const classString of data.classStrings) {
        // Normalize and find significant patterns (at least 3 classes)
        const normalized = this.normalizeClassString(classString);
        if (normalized.split(' ').length >= 3) {
          const existing = patternMap.get(normalized);
          if (existing) {
            existing.files.add(filePath);
            existing.count++;
          } else {
            patternMap.set(normalized, { files: new Set([filePath]), count: 1 });
          }
        }
      }
    }

    // Filter to patterns found in multiple files
    const duplicates: DuplicatedClassPattern[] = [];
    for (const [pattern, data] of patternMap) {
      if (data.files.size >= 2) {
        duplicates.push({
          pattern,
          files: Array.from(data.files),
          count: data.count,
        });
      }
    }

    // Sort by count descending
    return duplicates.sort((a, b) => b.count - a.count);
  }

  /**
   * Normalize a class string for comparison
   */
  private normalizeClassString(classString: string): string {
    return classString
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(' ');
  }

  /**
   * Find variant inconsistencies across similar components
   */
  private findVariantInconsistencies(fileClassData: Map<string, FileClassData>): VariantInconsistency[] {
    const inconsistencies: VariantInconsistency[] = [];

    // Group files by component name
    const componentVariants = new Map<string, Array<{ file: string; variants: CvaVariant[] }>>();

    for (const [filePath, data] of fileClassData) {
      if (data.cvaVariants.length === 0) continue;

      const componentName = data.componentName;
      const existing = componentVariants.get(componentName);
      if (existing) {
        existing.push({ file: filePath, variants: data.cvaVariants });
      } else {
        componentVariants.set(componentName, [{ file: filePath, variants: data.cvaVariants }]);
      }
    }

    // Find inconsistencies within each component type
    for (const [componentName, files] of componentVariants) {
      if (files.length < 2) continue;

      // Group by variant type and key
      const variantValues = new Map<string, Map<string, Array<{ file: string; classes: string }>>>();

      for (const { file, variants } of files) {
        for (const variant of variants) {
          const typeKey = `${variant.type}:${variant.key}`;
          if (!variantValues.has(typeKey)) {
            variantValues.set(typeKey, new Map());
          }
          const values = variantValues.get(typeKey)!;
          const classKey = variant.classes;
          if (!values.has(classKey)) {
            values.set(classKey, []);
          }
          values.get(classKey)!.push({ file, classes: variant.classes });
        }
      }

      // Find keys with multiple different values
      for (const [typeKey, values] of variantValues) {
        if (values.size > 1) {
          const [variantType, variantKey] = typeKey.split(':');
          const allClasses: string[] = [];
          const locations: Array<{ file: string; value: string }> = [];

          for (const [classes, locs] of values) {
            allClasses.push(classes);
            for (const loc of locs) {
              locations.push({ file: loc.file, value: classes });
            }
          }

          // Detect the property that differs
          const property = this.detectDifferingProperty(allClasses);

          inconsistencies.push({
            componentName,
            variantType: variantType!,
            variantKey: variantKey!,
            property,
            classes: allClasses,
            locations,
          });
        }
      }
    }

    return inconsistencies;
  }

  /**
   * Detect which CSS property differs between class strings
   */
  private detectDifferingProperty(classStrings: string[]): string {
    // Map of Tailwind prefixes to property names
    const propertyMap: Record<string, string> = {
      'h-': 'height',
      'w-': 'width',
      'p-': 'padding',
      'px-': 'padding-x',
      'py-': 'padding-y',
      'm-': 'margin',
      'mx-': 'margin-x',
      'my-': 'margin-y',
      'text-': 'text',
      'bg-': 'background',
      'border-': 'border',
      'rounded-': 'border-radius',
      'ring-': 'ring',
      'gap-': 'gap',
      'size-': 'size',
    };

    // Find classes that differ
    const classSets = classStrings.map(s => new Set(s.split(/\s+/)));
    const allClasses = new Set<string>();
    classSets.forEach(set => set.forEach(c => allClasses.add(c)));

    for (const cls of allClasses) {
      const inAll = classSets.every(set => set.has(cls));
      if (!inAll) {
        // This class differs - find its property
        for (const [prefix, property] of Object.entries(propertyMap)) {
          if (cls.startsWith(prefix)) {
            return property;
          }
        }
      }
    }

    return 'unknown';
  }

  /**
   * Find patterns that could be extracted as reusable utilities
   */
  private findExtractablePatterns(fileClassData: Map<string, FileClassData>): ExtractablePattern[] {
    const patternUsage = new Map<string, { files: Set<string>; count: number }>();

    // Focus on specific extractable patterns (focus rings, interactive states, etc.)
    const extractablePatternGroups = [
      {
        regex: /focus(-visible)?:[^\s]+(\s+focus(-visible)?:[^\s]+)*/g,
        category: 'focus' as const,
        namePrefix: 'focus-ring',
      },
      {
        regex: /ring-\d+\s+ring-[^\s]+(\s+ring-[^\s]+)*/g,
        category: 'focus' as const,
        namePrefix: 'ring-style',
      },
      {
        regex: /flex\s+items-[^\s]+\s+justify-[^\s]+/g,
        category: 'layout' as const,
        namePrefix: 'flex-center',
      },
      {
        regex: /hover:[^\s]+(\s+hover:[^\s]+)*/g,
        category: 'interactive' as const,
        namePrefix: 'hover-effect',
      },
    ];

    for (const [filePath, data] of fileClassData) {
      const fullContent = data.classStrings.join(' ');

      for (const { regex } of extractablePatternGroups) {
        const matches = fullContent.match(regex) || [];
        for (const match of matches) {
          const normalized = match.trim();
          if (normalized.split(/\s+/).length >= 2) {
            const existing = patternUsage.get(normalized);
            if (existing) {
              existing.files.add(filePath);
              existing.count++;
            } else {
              patternUsage.set(normalized, {
                files: new Set([filePath]),
                count: 1,
              });
            }
          }
        }
      }
    }

    // Filter to patterns used multiple times
    const extractable: ExtractablePattern[] = [];
    for (const [pattern, data] of patternUsage) {
      if (data.count >= 2) {
        extractable.push({
          pattern,
          usageCount: data.count,
          usedInFiles: Array.from(data.files),
          suggestedName: this.suggestPatternName(pattern),
          category: this.categorizePattern(pattern),
        });
      }
    }

    // Sort by usage count descending
    return extractable.sort((a, b) => b.usageCount - a.usageCount);
  }

  /**
   * Suggest a name for an extractable pattern
   */
  private suggestPatternName(pattern: string): string {
    if (pattern.includes('focus-visible:ring') || pattern.includes('focus:ring')) {
      return 'focus-ring';
    }
    if (pattern.includes('ring-') && pattern.includes('ring-offset')) {
      return 'ring-outline';
    }
    if (pattern.includes('flex') && pattern.includes('items-center')) {
      return 'flex-center';
    }
    if (pattern.includes('hover:')) {
      return 'hover-state';
    }
    return 'utility-pattern';
  }

  /**
   * Categorize an extractable pattern
   */
  private categorizePattern(pattern: string): 'focus' | 'layout' | 'interactive' | 'typography' | 'other' {
    if (pattern.includes('focus') || pattern.includes('ring')) {
      return 'focus';
    }
    if (pattern.includes('flex') || pattern.includes('grid') || pattern.includes('items-') || pattern.includes('justify-')) {
      return 'layout';
    }
    if (pattern.includes('hover:') || pattern.includes('active:') || pattern.includes('disabled:')) {
      return 'interactive';
    }
    if (pattern.includes('text-') || pattern.includes('font-') || pattern.includes('leading-')) {
      return 'typography';
    }
    return 'other';
  }
}

/**
 * Internal interface for file class data
 */
interface FileClassData {
  filePath: string;
  classStrings: string[];
  cvaVariants: CvaVariant[];
  componentName: string;
}

/**
 * Internal interface for CVA variant data
 */
interface CvaVariant {
  name: string;
  type: string;
  key: string;
  classes: string;
}
