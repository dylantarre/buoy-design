import { readFileSync, existsSync } from 'fs';
import { resolve, relative } from 'path';
import { glob } from 'glob';
import type { DesignToken, TokenSource } from '@buoy-design/core';
import { createTokenId } from '@buoy-design/core';

export interface TailwindTheme {
  colors: Record<string, string | Record<string, string>>;
  spacing: Record<string, string>;
  fontSize: Record<string, string | [string, Record<string, string>]>;
  fontFamily: Record<string, string[]>;
  borderRadius: Record<string, string>;
  boxShadow: Record<string, string>;
  customVariants?: string[];
  utilities?: string[];
}

export interface ParsedTailwindConfig {
  theme: Partial<TailwindTheme>;
  tokens: DesignToken[];
  configPath: string;
  version: 3 | 4;
}

export interface TailwindConfigParserOptions {
  cssConfigPaths?: string[];
}

export class TailwindConfigParser {
  private projectRoot: string;
  private options: TailwindConfigParserOptions;

  constructor(projectRoot: string, options: TailwindConfigParserOptions = {}) {
    this.projectRoot = projectRoot;
    this.options = options;
  }

  async parse(): Promise<ParsedTailwindConfig | null> {
    // Try v3 JS/TS config first
    const v3ConfigPath = this.findV3ConfigFile();
    if (v3ConfigPath) {
      try {
        const theme = await this.extractThemeFromJS(v3ConfigPath);
        const tokens = this.themeToTokens(theme, v3ConfigPath);

        return {
          theme,
          tokens,
          configPath: v3ConfigPath,
          version: 3,
        };
      } catch (err) {
        console.error('Failed to parse Tailwind v3 config:', err);
      }
    }

    // Try v4 CSS config
    const v4ConfigPath = await this.findV4CSSFile();
    if (v4ConfigPath) {
      try {
        const { theme, tokens } = await this.extractFromCSS(v4ConfigPath);

        return {
          theme,
          tokens,
          configPath: v4ConfigPath,
          version: 4,
        };
      } catch (err) {
        console.error('Failed to parse Tailwind v4 config:', err);
      }
    }

    return null;
  }

  private findV3ConfigFile(): string | null {
    const configNames = [
      'tailwind.config.js',
      'tailwind.config.ts',
      'tailwind.config.mjs',
      'tailwind.config.cjs',
    ];

    for (const name of configNames) {
      const path = resolve(this.projectRoot, name);
      if (existsSync(path)) {
        return path;
      }
    }

    return null;
  }

  private async findV4CSSFile(): Promise<string | null> {
    // If CSS paths are provided, use those
    if (this.options.cssConfigPaths?.length) {
      for (const cssPath of this.options.cssConfigPaths) {
        if (existsSync(cssPath)) {
          const content = readFileSync(cssPath, 'utf-8');
          if (this.isTailwindV4CSS(content)) {
            return cssPath;
          }
        }
      }
    }

    // Auto-discover CSS files - check common locations first
    const cssPatterns = [
      'app/globals.css',
      'src/app/globals.css',
      'styles/globals.css',
      'src/styles/globals.css',
      'src/index.css',
      'app/global.css',
      'styles/global.css',
    ];

    for (const pattern of cssPatterns) {
      const path = resolve(this.projectRoot, pattern);
      if (existsSync(path)) {
        const content = readFileSync(path, 'utf-8');
        if (this.isTailwindV4CSS(content)) {
          return path;
        }
      }
    }

    // Try glob search, prioritizing files with @theme blocks
    try {
      const files = await glob('**/*.css', {
        cwd: this.projectRoot,
        ignore: [
          '**/node_modules/**',
          '**/dist/**',
          '**/build/**',
          '**/templates/**',
          '**/fixtures/**',
          '**/test/**',
          '**/tests/**',
          '**/.next/**',
          '**/coverage/**',
        ],
        absolute: true,
      });

      // Sort candidates by content quality (prefer files with @theme blocks)
      const candidates: Array<{ path: string; score: number }> = [];

      for (const file of files) {
        try {
          const content = readFileSync(file, 'utf-8');
          if (this.isTailwindV4CSS(content)) {
            let score = 0;
            // Prefer files with @theme blocks
            if (content.includes('@theme')) score += 100;
            // Prefer files with :root variables
            if (content.includes(':root')) score += 50;
            // Prefer files with more content
            score += Math.min(content.length / 100, 50);
            // Prefer files in app/ or styles/ directories
            if (file.includes('/app/') || file.includes('/styles/')) score += 20;
            candidates.push({ path: file, score });
          }
        } catch {
          // Skip unreadable files
        }
      }

      // Return the highest scoring candidate
      if (candidates.length > 0) {
        candidates.sort((a, b) => b.score - a.score);
        return candidates[0]!.path;
      }
    } catch {
      // Glob failed, skip
    }

    return null;
  }

  private isTailwindV4CSS(content: string): boolean {
    // Check for v4 indicators
    return (
      content.includes('@import "tailwindcss"') ||
      content.includes("@import 'tailwindcss'") ||
      content.includes('@theme') ||
      content.includes('@custom-variant') ||
      content.includes('@utility')
    );
  }

  private async extractFromCSS(
    cssPath: string
  ): Promise<{ theme: Partial<TailwindTheme>; tokens: DesignToken[] }> {
    const content = readFileSync(cssPath, 'utf-8');
    const relativePath = relative(this.projectRoot, cssPath);
    const source: TokenSource = { type: 'css', path: relativePath };

    const theme: Partial<TailwindTheme> = {
      colors: {},
      spacing: {},
      fontSize: {},
      fontFamily: {},
      borderRadius: {},
      boxShadow: {},
      customVariants: [],
      utilities: [],
    };

    const tokens: DesignToken[] = [];

    // Extract @theme inline blocks
    const themeBlocks = this.extractThemeBlocks(content);
    for (const block of themeBlocks) {
      const blockTokens = this.parseThemeBlock(block, source);
      tokens.push(...blockTokens);

      // Also populate theme object
      for (const token of blockTokens) {
        this.addToTheme(theme, token);
      }
    }

    // Extract :root CSS variables
    const rootVars = this.extractRootVariables(content);
    for (const [name, value] of Object.entries(rootVars)) {
      const token = this.cssVarToToken(name, value, source, 'light');
      if (token) {
        tokens.push(token);
        this.addToTheme(theme, token);
      }
    }

    // Extract .dark CSS variables
    const darkVars = this.extractDarkVariables(content);
    for (const [name, value] of Object.entries(darkVars)) {
      const token = this.cssVarToToken(name, value, source, 'dark');
      if (token) {
        tokens.push(token);
      }
    }

    // Extract @custom-variant declarations
    const customVariants = this.extractCustomVariants(content);
    theme.customVariants = customVariants;

    // Extract @utility declarations
    const utilities = this.extractUtilities(content);
    theme.utilities = utilities;

    return { theme, tokens };
  }

  private extractThemeBlocks(content: string): string[] {
    const blocks: string[] = [];
    const regex = /@theme\s+inline\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/gs;

    let match;
    while ((match = regex.exec(content)) !== null) {
      blocks.push(match[1] || '');
    }

    return blocks;
  }

  private parseThemeBlock(block: string, source: TokenSource): DesignToken[] {
    const tokens: DesignToken[] = [];

    // Match CSS custom property declarations
    const propRegex = /--([\w-]+):\s*([^;]+);/g;

    let match;
    while ((match = propRegex.exec(block)) !== null) {
      const name = match[1]!;
      const value = match[2]!.trim();

      const token = this.themeVarToToken(name, value, source);
      if (token) {
        tokens.push(token);
      }
    }

    return tokens;
  }

  private themeVarToToken(
    name: string,
    value: string,
    source: TokenSource
  ): DesignToken | null {
    // Parse the variable name to determine category
    const category = this.inferCategoryFromName(name);

    // Handle var() references - store as raw with reference info in tags
    if (value.startsWith('var(')) {
      const refMatch = value.match(/var\(--([^)]+)\)/);
      const refName = refMatch?.[1] || value;
      return {
        id: createTokenId(source, `tw-${name}`),
        name: `tw-${name}`,
        category: category === 'other' || category === 'typography' ? 'color' : category,
        value: { type: 'raw', value },
        source,
        aliases: [name, refName],
        usedBy: [],
        metadata: { tags: ['tailwind', 'v4', 'reference'] },
        scannedAt: new Date(),
      };
    }

    // Parse color values (hex, rgb, rgba, hsl, oklch, etc.)
    if (category === 'color') {
      return this.createColorToken(name, value, source, 'v4');
    }

    // Parse spacing/sizing values
    if (category === 'spacing' || category === 'border') {
      return this.createV4SpacingToken(name, value, source, category);
    }

    // Default raw token
    return {
      id: createTokenId(source, `tw-${name}`),
      name: `tw-${name}`,
      category: 'color',
      value: { type: 'raw', value },
      source,
      aliases: [name],
      usedBy: [],
      metadata: { tags: ['tailwind', 'v4'] },
      scannedAt: new Date(),
    };
  }

  private inferCategoryFromName(
    name: string
  ): 'color' | 'spacing' | 'border' | 'typography' | 'other' {
    if (
      name.startsWith('color-') ||
      name.includes('background') ||
      name.includes('foreground') ||
      name.includes('primary') ||
      name.includes('secondary') ||
      name.includes('accent') ||
      name.includes('muted') ||
      name.includes('destructive') ||
      name.includes('border') ||
      name.includes('input') ||
      name.includes('ring') ||
      name.includes('chart-') ||
      name.includes('sidebar') ||
      name.includes('surface') ||
      name.includes('code') ||
      name.includes('selection') ||
      name.includes('popover') ||
      name.includes('card')
    ) {
      return 'color';
    }

    if (
      name.startsWith('spacing-') ||
      name.startsWith('breakpoint-') ||
      name.includes('gap') ||
      name.includes('padding') ||
      name.includes('margin')
    ) {
      return 'spacing';
    }

    if (name.startsWith('radius-') || name.includes('border-radius')) {
      return 'border';
    }

    if (
      name.startsWith('font-') ||
      name.startsWith('text-') ||
      name.includes('leading') ||
      name.includes('tracking')
    ) {
      return 'typography';
    }

    return 'other';
  }

  private createV4SpacingToken(
    name: string,
    value: string,
    source: TokenSource,
    category: 'spacing' | 'border'
  ): DesignToken {
    const numMatch = value.match(/^([\d.]+)(rem|px|em|%)?$/);
    if (numMatch) {
      const num = parseFloat(numMatch[1]!);
      const rawUnit = numMatch[2] || 'px';
      // Only use valid spacing units, fall back to raw for %
      if (rawUnit === 'rem' || rawUnit === 'px' || rawUnit === 'em') {
        return {
          id: createTokenId(source, `tw-${name}`),
          name: `tw-${name}`,
          category,
          value: { type: 'spacing', value: num, unit: rawUnit },
          source,
          aliases: [name],
          usedBy: [],
          metadata: { tags: ['tailwind', 'v4'] },
          scannedAt: new Date(),
        };
      }
    }

    // Handle calc() expressions
    if (value.startsWith('calc(')) {
      return {
        id: createTokenId(source, `tw-${name}`),
        name: `tw-${name}`,
        category,
        value: { type: 'raw', value },
        source,
        aliases: [name],
        usedBy: [],
        metadata: { tags: ['tailwind', 'v4', 'calc'] },
        scannedAt: new Date(),
      };
    }

    return {
      id: createTokenId(source, `tw-${name}`),
      name: `tw-${name}`,
      category,
      value: { type: 'raw', value },
      source,
      aliases: [name],
      usedBy: [],
      metadata: { tags: ['tailwind', 'v4'] },
      scannedAt: new Date(),
    };
  }

  private extractRootVariables(content: string): Record<string, string> {
    const vars: Record<string, string> = {};

    // Match :root { ... }
    const rootMatch = content.match(/:root\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/s);
    if (rootMatch) {
      const block = rootMatch[1]!;
      const propRegex = /--([\w-]+):\s*([^;]+);/g;

      let match;
      while ((match = propRegex.exec(block)) !== null) {
        vars[match[1]!] = match[2]!.trim();
      }
    }

    return vars;
  }

  private extractDarkVariables(content: string): Record<string, string> {
    const vars: Record<string, string> = {};

    // Match .dark { ... }
    const darkMatch = content.match(/\.dark\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/s);
    if (darkMatch) {
      const block = darkMatch[1]!;
      const propRegex = /--([\w-]+):\s*([^;]+);/g;

      let match;
      while ((match = propRegex.exec(block)) !== null) {
        vars[match[1]!] = match[2]!.trim();
      }
    }

    return vars;
  }

  private cssVarToToken(
    name: string,
    value: string,
    source: TokenSource,
    mode: 'light' | 'dark'
  ): DesignToken | null {
    const category = this.inferCategoryFromCSSVar(name);

    // Skip non-semantic variables
    if (category === 'other') {
      return null;
    }

    const tokenName = mode === 'dark' ? `tw-${name}-dark` : `tw-${name}`;

    if (category === 'color') {
      return this.createColorToken(name, value, source, 'v4', mode);
    }

    if (category === 'spacing' || category === 'border') {
      return this.createV4SpacingToken(tokenName.replace('tw-', ''), value, source, category);
    }

    return {
      id: createTokenId(source, tokenName),
      name: tokenName,
      category,
      value: { type: 'raw', value },
      source,
      aliases: mode === 'dark' ? [`${name}-dark`] : [name],
      usedBy: [],
      metadata: { tags: ['tailwind', 'v4', mode] },
      scannedAt: new Date(),
    };
  }

  private inferCategoryFromCSSVar(
    name: string
  ): 'color' | 'spacing' | 'border' | 'typography' | 'other' {
    // Common shadcn/tailwind v4 variable names
    const colorVars = [
      'background',
      'foreground',
      'primary',
      'secondary',
      'accent',
      'muted',
      'destructive',
      'border',
      'input',
      'ring',
      'card',
      'popover',
      'sidebar',
      'surface',
      'code',
      'selection',
      'chart-',
    ];

    for (const cv of colorVars) {
      if (name === cv || name.startsWith(`${cv}-`)) {
        return 'color';
      }
    }

    if (name.startsWith('radius')) {
      return 'border';
    }

    if (name.startsWith('spacing') || name.startsWith('gap')) {
      return 'spacing';
    }

    if (name.startsWith('font') || name.startsWith('text')) {
      return 'typography';
    }

    return 'other';
  }

  private extractCustomVariants(content: string): string[] {
    const variants: string[] = [];
    const regex = /@custom-variant\s+([\w-]+)/g;

    let match;
    while ((match = regex.exec(content)) !== null) {
      variants.push(match[1]!);
    }

    return variants;
  }

  private extractUtilities(content: string): string[] {
    const utilities: string[] = [];
    const regex = /@utility\s+([\w-]+)/g;

    let match;
    while ((match = regex.exec(content)) !== null) {
      utilities.push(match[1]!);
    }

    return utilities;
  }

  private addToTheme(theme: Partial<TailwindTheme>, token: DesignToken): void {
    if (token.category === 'color') {
      const name = token.name.replace('tw-', '').replace('-dark', '');
      if (typeof token.value === 'object' && 'hex' in token.value) {
        theme.colors![name] = token.value.hex;
      } else if (typeof token.value === 'object' && token.value.type === 'raw') {
        // Store raw value (including oklch) as-is
        theme.colors![name] = token.value.value;
      }
    } else if (token.category === 'spacing') {
      const name = token.name.replace('tw-spacing-', '').replace('tw-', '');
      if (typeof token.value === 'object' && token.value.type === 'spacing') {
        theme.spacing![name] = `${token.value.value}${token.value.unit || ''}`;
      }
    } else if (token.category === 'border') {
      const name = token.name.replace('tw-radius-', '').replace('tw-', '');
      if (typeof token.value === 'object' && token.value.type === 'spacing') {
        theme.borderRadius![name] = `${token.value.value}${token.value.unit || ''}`;
      } else if (typeof token.value === 'object' && token.value.type === 'raw') {
        theme.borderRadius![name] = token.value.value;
      }
    }
  }

  // ============ V3 JS Config Parsing ============

  private async extractThemeFromJS(configPath: string): Promise<Partial<TailwindTheme>> {
    const content = readFileSync(configPath, 'utf-8');

    const theme: Partial<TailwindTheme> = {
      colors: {},
      spacing: {},
      fontSize: {},
      fontFamily: {},
      borderRadius: {},
      boxShadow: {},
    };

    // Extract colors from theme.extend.colors or theme.colors
    const colorMatches = this.extractObjectFromConfig(content, 'colors');
    if (colorMatches) {
      theme.colors = this.parseObjectLiteral(colorMatches);
    }

    // Extract spacing
    const spacingMatches = this.extractObjectFromConfig(content, 'spacing');
    if (spacingMatches) {
      theme.spacing = this.parseObjectLiteral(spacingMatches);
    }

    // Extract fontSize
    const fontSizeMatches = this.extractObjectFromConfig(content, 'fontSize');
    if (fontSizeMatches) {
      theme.fontSize = this.parseObjectLiteral(fontSizeMatches);
    }

    // Extract fontFamily
    const fontFamilyMatches = this.extractObjectFromConfig(content, 'fontFamily');
    if (fontFamilyMatches) {
      theme.fontFamily = this.parseObjectLiteral(fontFamilyMatches);
    }

    // Extract borderRadius
    const borderRadiusMatches = this.extractObjectFromConfig(content, 'borderRadius');
    if (borderRadiusMatches) {
      theme.borderRadius = this.parseObjectLiteral(borderRadiusMatches);
    }

    // Extract boxShadow
    const boxShadowMatches = this.extractObjectFromConfig(content, 'boxShadow');
    if (boxShadowMatches) {
      theme.boxShadow = this.parseObjectLiteral(boxShadowMatches);
    }

    return theme;
  }

  private extractObjectFromConfig(content: string, key: string): string | null {
    const patterns = [
      new RegExp(`${key}:\\s*\\{([^{}]*(?:\\{[^{}]*\\}[^{}]*)*)\\}`, 's'),
      new RegExp(`['"]${key}['"]:\\s*\\{([^{}]*(?:\\{[^{}]*\\}[^{}]*)*)\\}`, 's'),
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1] || null;
      }
    }

    return null;
  }

  private parseObjectLiteral(content: string): Record<string, any> {
    const result: Record<string, any> = {};

    // Simple key-value extraction
    const kvPattern = /['"]?(\w+[-\w]*)['"]?\s*:\s*['"]([^'"]+)['"]/g;
    let match;

    while ((match = kvPattern.exec(content)) !== null) {
      result[match[1]!] = match[2];
    }

    // Also try to match nested objects for color scales
    const nestedPattern = /['"]?(\w+[-\w]*)['"]?\s*:\s*\{([^{}]+)\}/g;
    while ((match = nestedPattern.exec(content)) !== null) {
      const nestedObj: Record<string, string> = {};
      const nestedContent = match[2]!;
      const nestedKv = /['"]?(\w+[-\w]*)['"]?\s*:\s*['"]([^'"]+)['"]/g;
      let nestedMatch;
      while ((nestedMatch = nestedKv.exec(nestedContent)) !== null) {
        nestedObj[nestedMatch[1]!] = nestedMatch[2]!;
      }
      if (Object.keys(nestedObj).length > 0) {
        result[match[1]!] = nestedObj;
      }
    }

    return result;
  }

  private themeToTokens(theme: Partial<TailwindTheme>, configPath: string): DesignToken[] {
    const tokens: DesignToken[] = [];
    const relativePath = configPath.replace(this.projectRoot + '/', '');

    const source: TokenSource = {
      type: 'json',
      path: relativePath,
    };

    // Convert colors to tokens
    if (theme.colors) {
      for (const [name, value] of Object.entries(theme.colors)) {
        if (typeof value === 'string') {
          tokens.push(this.createColorToken(name, value, source, 'v3'));
        } else if (typeof value === 'object') {
          for (const [shade, color] of Object.entries(value)) {
            tokens.push(this.createColorToken(`${name}-${shade}`, color, source, 'v3'));
          }
        }
      }
    }

    // Convert spacing to tokens
    if (theme.spacing) {
      for (const [name, value] of Object.entries(theme.spacing)) {
        tokens.push(this.createSpacingToken(name, value, source));
      }
    }

    // Convert boxShadow to tokens
    if (theme.boxShadow) {
      for (const [name, value] of Object.entries(theme.boxShadow)) {
        tokens.push(this.createShadowToken(name, value, source));
      }
    }

    // Convert borderRadius to tokens
    if (theme.borderRadius) {
      for (const [name, value] of Object.entries(theme.borderRadius)) {
        tokens.push(this.createRawToken(`radius-${name}`, value, 'border', source));
      }
    }

    return tokens;
  }

  private createColorToken(
    name: string,
    value: string,
    source: TokenSource,
    version: 'v3' | 'v4',
    mode?: 'light' | 'dark'
  ): DesignToken {
    const tokenName = mode === 'dark' ? `tw-${name}-dark` : `tw-${name}`;
    const tags = ['tailwind', version];
    if (mode) tags.push(mode);

    // Check for oklch colors (v4) - store as raw since schema doesn't support oklch
    if (value.startsWith('oklch(')) {
      return {
        id: createTokenId(source, tokenName),
        name: tokenName,
        category: 'color',
        value: { type: 'raw', value },
        source,
        aliases: mode === 'dark' ? [`${name}-dark`] : [name],
        usedBy: [],
        metadata: { tags: [...tags, 'oklch'] },
        scannedAt: new Date(),
      };
    }

    // Check for var() references - store as raw with reference info in aliases
    if (value.startsWith('var(')) {
      const refMatch = value.match(/var\(--([^)]+)\)/);
      const refName = refMatch?.[1] || '';
      return {
        id: createTokenId(source, tokenName),
        name: tokenName,
        category: 'color',
        value: { type: 'raw', value },
        source,
        aliases: mode === 'dark' ? [`${name}-dark`, refName] : [name, refName],
        usedBy: [],
        metadata: { tags: [...tags, 'reference'] },
        scannedAt: new Date(),
      };
    }

    // Hex, rgb, hsl colors
    return {
      id: createTokenId(source, tokenName),
      name: tokenName,
      category: 'color',
      value: { type: 'color', hex: value },
      source,
      aliases: mode === 'dark' ? [`${name}-dark`] : [name],
      usedBy: [],
      metadata: { tags },
      scannedAt: new Date(),
    };
  }

  private createSpacingToken(name: string, value: string, source: TokenSource): DesignToken {
    const numMatch = value.match(/^([\d.]+)(rem|px|em)?$/);
    if (numMatch) {
      const num = parseFloat(numMatch[1]!);
      const unit = (numMatch[2] as 'rem' | 'px' | 'em') || 'px';
      return {
        id: createTokenId(source, `tw-spacing-${name}`),
        name: `tw-spacing-${name}`,
        category: 'spacing',
        value: { type: 'spacing', value: num, unit },
        source,
        aliases: [name],
        usedBy: [],
        metadata: { tags: ['tailwind'] },
        scannedAt: new Date(),
      };
    }

    return this.createRawToken(`spacing-${name}`, value, 'spacing', source);
  }

  private createShadowToken(name: string, value: string, source: TokenSource): DesignToken {
    return {
      id: createTokenId(source, `tw-shadow-${name}`),
      name: `tw-shadow-${name}`,
      category: 'shadow',
      value: { type: 'raw', value },
      source,
      aliases: [name],
      usedBy: [],
      metadata: { tags: ['tailwind'] },
      scannedAt: new Date(),
    };
  }

  private createRawToken(
    name: string,
    value: string,
    category: 'spacing' | 'border' | 'other',
    source: TokenSource
  ): DesignToken {
    return {
      id: createTokenId(source, `tw-${name}`),
      name: `tw-${name}`,
      category,
      value: { type: 'raw', value },
      source,
      aliases: [],
      usedBy: [],
      metadata: { tags: ['tailwind'] },
      scannedAt: new Date(),
    };
  }
}
