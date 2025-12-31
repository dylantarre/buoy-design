// Token comparison - compares design tokens from different sources
// Supports cascading matching: exact name → value match → fuzzy match

import type { DesignToken, TokenValue } from '../models/token.js';

export type MatchType = 'exact' | 'value' | 'fuzzy';

export interface TokenMatch {
  designToken: DesignToken;
  codeToken: DesignToken;
  matchType: MatchType;
  valueDrift: boolean;
}

export interface TokenComparisonSummary {
  totalDesignTokens: number;
  totalCodeTokens: number;
  matched: number;
  matchedWithDrift: number;
  missing: number;
  orphan: number;
}

export interface TokenComparisonResult {
  matches: TokenMatch[];
  missingTokens: DesignToken[];
  orphanTokens: DesignToken[];
  summary: TokenComparisonSummary;
}

/**
 * Compare design tokens from two sources
 * @param designTokens - Tokens from the design system (source of truth)
 * @param codeTokens - Tokens extracted from code
 * @returns Comparison result with matches, missing tokens, and orphans
 */
export function compareTokens(
  designTokens: DesignToken[],
  codeTokens: DesignToken[]
): TokenComparisonResult {
  const matches: TokenMatch[] = [];
  const matchedCodeTokenIds = new Set<string>();
  const matchedDesignTokenIds = new Set<string>();

  // Build lookup maps for code tokens
  const codeByName = new Map<string, DesignToken>();
  const codeByNormalizedName = new Map<string, DesignToken>();
  const codeByValueKey = new Map<string, DesignToken[]>();

  for (const token of codeTokens) {
    codeByName.set(token.name, token);
    codeByNormalizedName.set(normalizeName(token.name), token);

    const valueKey = getValueKey(token.value);
    if (!codeByValueKey.has(valueKey)) {
      codeByValueKey.set(valueKey, []);
    }
    codeByValueKey.get(valueKey)!.push(token);
  }

  // Pass 1: Exact name matches
  for (const designToken of designTokens) {
    const codeToken = codeByName.get(designToken.name);
    if (codeToken && !matchedCodeTokenIds.has(codeToken.id)) {
      matches.push({
        designToken,
        codeToken,
        matchType: 'exact',
        valueDrift: !valuesEqual(designToken.value, codeToken.value),
      });
      matchedCodeTokenIds.add(codeToken.id);
      matchedDesignTokenIds.add(designToken.id);
    }
  }

  // Pass 2: Value matches (for unmatched tokens)
  for (const designToken of designTokens) {
    if (matchedDesignTokenIds.has(designToken.id)) continue;

    const valueKey = getValueKey(designToken.value);
    const candidates = codeByValueKey.get(valueKey) || [];

    for (const codeToken of candidates) {
      if (!matchedCodeTokenIds.has(codeToken.id)) {
        matches.push({
          designToken,
          codeToken,
          matchType: 'value',
          valueDrift: false, // Values match by definition
        });
        matchedCodeTokenIds.add(codeToken.id);
        matchedDesignTokenIds.add(designToken.id);
        break;
      }
    }
  }

  // Pass 3: Fuzzy name matches (for still unmatched tokens)
  for (const designToken of designTokens) {
    if (matchedDesignTokenIds.has(designToken.id)) continue;

    const normalizedDesignName = normalizeName(designToken.name);

    for (const codeToken of codeTokens) {
      if (matchedCodeTokenIds.has(codeToken.id)) continue;

      const normalizedCodeName = normalizeName(codeToken.name);
      if (normalizedDesignName === normalizedCodeName) {
        matches.push({
          designToken,
          codeToken,
          matchType: 'fuzzy',
          valueDrift: !valuesEqual(designToken.value, codeToken.value),
        });
        matchedCodeTokenIds.add(codeToken.id);
        matchedDesignTokenIds.add(designToken.id);
        break;
      }
    }
  }

  // Identify missing tokens (in design but not matched to code)
  const missingTokens = designTokens.filter(
    (token) => !matchedDesignTokenIds.has(token.id)
  );

  // Identify orphan tokens (in code but not matched to design)
  const orphanTokens = codeTokens.filter(
    (token) => !matchedCodeTokenIds.has(token.id)
  );

  // Calculate summary statistics
  const matchedWithDrift = matches.filter((m) => m.valueDrift).length;

  return {
    matches,
    missingTokens,
    orphanTokens,
    summary: {
      totalDesignTokens: designTokens.length,
      totalCodeTokens: codeTokens.length,
      matched: matches.length,
      matchedWithDrift,
      missing: missingTokens.length,
      orphan: orphanTokens.length,
    },
  };
}

/**
 * Normalize a token name for fuzzy matching
 * - Lowercase
 * - Replace separators (., -, _) with a common separator
 */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[.\-_]/g, '.');
}

/**
 * Get a unique key for a token value (for value-based matching)
 */
function getValueKey(value: TokenValue): string {
  if (value.type === 'color') {
    return `color:${value.hex.toLowerCase()}`;
  }
  if (value.type === 'spacing') {
    return `spacing:${value.value}${value.unit}`;
  }
  if (value.type === 'raw') {
    return `raw:${value.value}`;
  }
  return `unknown:${JSON.stringify(value)}`;
}

/**
 * Check if two token values are equal
 */
function valuesEqual(a: TokenValue, b: TokenValue): boolean {
  if (a.type !== b.type) return false;

  if (a.type === 'color' && b.type === 'color') {
    return a.hex.toLowerCase() === b.hex.toLowerCase();
  }

  if (a.type === 'spacing' && b.type === 'spacing') {
    return a.value === b.value && a.unit === b.unit;
  }

  if (a.type === 'raw' && b.type === 'raw') {
    return a.value === b.value;
  }

  return false;
}
