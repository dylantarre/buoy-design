import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { DesignToken, TokenSource } from '@buoy-design/core';
import { createTokenId } from '@buoy-design/core';

export interface TailwindTheme {
  colors: Record<string, string | Record<string, string>>;
  spacing: Record<string, string>;
  fontSize: Record<string, string | [string, Record<string, string>]>;
  fontFamily: Record<string, string[]>;
  borderRadius: Record<string, string>;
  boxShadow: Record<string, string>;
}

export interface ParsedTailwindConfig {
  theme: Partial<TailwindTheme>;
  tokens: DesignToken[];
  configPath: string;
}

export class TailwindConfigParser {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async parse(): Promise<ParsedTailwindConfig | null> {
    const configPath = this.findConfigFile();
    if (!configPath) {
      return null;
    }

    try {
      const theme = await this.extractTheme(configPath);
      const tokens = this.themeToTokens(theme, configPath);

      return {
        theme,
        tokens,
        configPath,
      };
    } catch (err) {
      console.error('Failed to parse Tailwind config:', err);
      return null;
    }
  }

  private findConfigFile(): string | null {
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

  private async extractTheme(configPath: string): Promise<Partial<TailwindTheme>> {
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
          tokens.push(this.createColorToken(name, value, source));
        } else if (typeof value === 'object') {
          for (const [shade, color] of Object.entries(value)) {
            tokens.push(this.createColorToken(`${name}-${shade}`, color, source));
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

  private createColorToken(name: string, hex: string, source: TokenSource): DesignToken {
    return {
      id: createTokenId(source, `tw-${name}`),
      name: `tw-${name}`,
      category: 'color',
      value: { type: 'color', hex },
      source,
      aliases: [name],
      usedBy: [],
      metadata: { tags: ['tailwind'] },
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
