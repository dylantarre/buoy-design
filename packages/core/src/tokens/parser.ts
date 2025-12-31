// Token file parser - supports DTCG, Tokens Studio, and Style Dictionary formats

import type { DesignToken, TokenValue, TokenCategory } from '../models/token.js';

export type TokenFormat = 'dtcg' | 'tokens-studio' | 'style-dictionary';

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
interface JsonObject {
  [key: string]: JsonValue;
}

/**
 * Detect the format of a token JSON object
 */
export function detectFormat(json: object): TokenFormat {
  // DTCG uses $value
  if (hasNestedProperty(json, '$value')) {
    return 'dtcg';
  }

  // Tokens Studio uses value + type
  if (hasNestedProperty(json, 'type') && hasNestedProperty(json, 'value')) {
    return 'tokens-studio';
  }

  // Style Dictionary uses just value
  return 'style-dictionary';
}

/**
 * Check if an object has a nested property anywhere in its tree
 */
function hasNestedProperty(obj: unknown, prop: string): boolean {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (key === prop) {
      return true;
    }
    if (hasNestedProperty(value, prop)) {
      return true;
    }
  }

  return false;
}

/**
 * Parse a token file and return DesignTokens
 */
export function parseTokenFile(content: string): DesignToken[] {
  const json = JSON.parse(content) as JsonObject;

  if (Object.keys(json).length === 0) {
    return [];
  }

  const format = detectFormat(json);

  switch (format) {
    case 'dtcg':
      return parseDTCG(json);
    case 'tokens-studio':
      return parseTokensStudio(json);
    case 'style-dictionary':
      return parseStyleDictionary(json);
  }
}

/**
 * Parse W3C DTCG format tokens
 */
function parseDTCG(json: JsonObject, path: string[] = [], inheritedType?: string): DesignToken[] {
  const tokens: DesignToken[] = [];

  for (const [key, value] of Object.entries(json)) {
    // Skip $ properties at root level (like $description on the file)
    if (key.startsWith('$')) {
      continue;
    }

    if (typeof value !== 'object' || value === null) {
      continue;
    }

    const obj = value as JsonObject;
    const currentPath = [...path, key];

    // Check if this is a token (has $value)
    if ('$value' in obj) {
      const type = (obj.$type as string) || inheritedType;
      const token = createDesignToken(
        currentPath.join('.'),
        obj.$value as string | number | JsonObject,
        type,
        {
          description: obj.$description as string | undefined,
          deprecated: obj.$deprecated as boolean | undefined,
        }
      );
      tokens.push(token);
    } else {
      // This is a group - recurse with inherited type
      const groupType = (obj.$type as string) || inheritedType;
      tokens.push(...parseDTCG(obj, currentPath, groupType));
    }
  }

  return tokens;
}

/**
 * Parse Tokens Studio format tokens
 */
function parseTokensStudio(json: JsonObject, path: string[] = []): DesignToken[] {
  const tokens: DesignToken[] = [];

  for (const [key, value] of Object.entries(json)) {
    if (typeof value !== 'object' || value === null) {
      continue;
    }

    const obj = value as JsonObject;
    const currentPath = [...path, key];

    // Check if this is a token (has value + type)
    if ('value' in obj && 'type' in obj) {
      const token = createDesignToken(
        currentPath.join('.'),
        obj.value as string | number | JsonObject,
        obj.type as string,
        {
          description: obj.description as string | undefined,
        }
      );
      tokens.push(token);
    } else if ('value' in obj) {
      // Has value but no type - still a token
      const token = createDesignToken(
        currentPath.join('.'),
        obj.value as string | number | JsonObject,
        undefined,
        {
          description: obj.description as string | undefined,
        }
      );
      tokens.push(token);
    } else {
      // This is a group - recurse
      tokens.push(...parseTokensStudio(obj, currentPath));
    }
  }

  return tokens;
}

/**
 * Parse Style Dictionary format tokens
 */
function parseStyleDictionary(json: JsonObject, path: string[] = []): DesignToken[] {
  const tokens: DesignToken[] = [];

  for (const [key, value] of Object.entries(json)) {
    if (typeof value !== 'object' || value === null) {
      continue;
    }

    const obj = value as JsonObject;
    const currentPath = [...path, key];

    // Check if this is a token (has value)
    if ('value' in obj) {
      // Infer type from path
      const inferredType = inferTypeFromPath(currentPath);
      const token = createDesignToken(
        currentPath.join('.'),
        obj.value as string | number | JsonObject,
        inferredType,
        {
          description: obj.description as string | undefined,
        }
      );
      tokens.push(token);
    } else {
      // This is a group - recurse
      tokens.push(...parseStyleDictionary(obj, currentPath));
    }
  }

  return tokens;
}

/**
 * Infer token type from path
 */
function inferTypeFromPath(path: string[]): string | undefined {
  const firstSegment = path[0]?.toLowerCase();

  const typeMap: Record<string, string> = {
    color: 'color',
    colors: 'color',
    spacing: 'dimension',
    space: 'dimension',
    size: 'dimension',
    fontsize: 'typography',  // fontSize maps to typography, not dimension
    font: 'typography',
    typography: 'typography',
    radius: 'dimension',
    shadow: 'shadow',
    border: 'border',
  };

  return typeMap[firstSegment || ''];
}

/**
 * Create a DesignToken from parsed data
 */
function createDesignToken(
  name: string,
  rawValue: string | number | JsonObject,
  type: string | undefined,
  meta: { description?: string; deprecated?: boolean }
): DesignToken {
  const category = mapTypeToCategory(type, name, rawValue);
  const value = parseTokenValue(rawValue, category);

  return {
    id: `json:imported:${name}`,
    name,
    category,
    value,
    source: {
      type: 'json',
      path: 'imported',
    },
    aliases: [],
    usedBy: [],
    metadata: {
      description: meta.description,
      deprecated: meta.deprecated,
    },
    scannedAt: new Date(),
  };
}

/**
 * Map token type to Buoy category
 */
function mapTypeToCategory(type: string | undefined, name: string, rawValue: unknown): TokenCategory {
  if (!type) {
    // Infer from value or name
    if (typeof rawValue === 'string' && rawValue.startsWith('#')) {
      return 'color';
    }
    const nameLower = name.toLowerCase();
    if (nameLower.includes('color')) return 'color';
    if (nameLower.includes('spacing') || nameLower.includes('space')) return 'spacing';
    if (nameLower.includes('font') || nameLower.includes('size')) return 'typography';
    return 'other';
  }

  const typeMap: Record<string, TokenCategory> = {
    color: 'color',
    dimension: 'spacing',
    spacing: 'spacing',
    fontFamily: 'typography',
    fontWeight: 'typography',
    fontSize: 'typography',
    typography: 'typography',
    shadow: 'shadow',
    border: 'border',
    number: 'other',
    string: 'other',
  };

  return typeMap[type] || 'other';
}

/**
 * Parse raw value into TokenValue
 */
function parseTokenValue(rawValue: string | number | JsonObject, category: TokenCategory): TokenValue {
  if (category === 'color') {
    const hex = typeof rawValue === 'string' ? rawValue : '#000000';
    return {
      type: 'color',
      hex: hex.toLowerCase(),
    };
  }

  if (category === 'spacing' || category === 'sizing') {
    const { value, unit } = parseDimension(rawValue);
    return {
      type: 'spacing',
      value,
      unit,
    };
  }

  // Default to raw value
  return {
    type: 'raw',
    value: typeof rawValue === 'object' ? JSON.stringify(rawValue) : String(rawValue),
  };
}

/**
 * Parse a dimension value like "16px" or "8"
 */
function parseDimension(rawValue: string | number | JsonObject): { value: number; unit: 'px' | 'rem' | 'em' } {
  if (typeof rawValue === 'number') {
    return { value: rawValue, unit: 'px' };
  }

  if (typeof rawValue === 'object' && 'value' in rawValue) {
    return {
      value: Number(rawValue.value),
      unit: (rawValue.unit as 'px' | 'rem' | 'em') || 'px',
    };
  }

  const str = String(rawValue);
  const match = str.match(/^([\d.]+)(px|rem|em)?$/);

  if (match) {
    return {
      value: parseFloat(match[1] || '0'),
      unit: (match[2] as 'px' | 'rem' | 'em') || 'px',
    };
  }

  return { value: 0, unit: 'px' };
}
