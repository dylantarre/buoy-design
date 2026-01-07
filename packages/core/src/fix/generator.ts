/**
 * Fix Generator
 *
 * Generates Fix objects from DriftSignals by matching hardcoded values to design tokens.
 */

import type { DriftSignal, DesignToken } from "../models/index.js";
import type {
  Fix,
  FixGeneratorOptions,
  ConfidenceLevel,
} from "../models/fix.js";
import { createFixId, meetsConfidenceThreshold } from "../models/fix.js";
import { scoreConfidence } from "./confidence.js";

/**
 * Supported fix types for V1
 */
const SUPPORTED_FIX_TYPES = [
  "hardcoded-color",
  "hardcoded-spacing",
  "hardcoded-radius",
  "hardcoded-font-size",
] as const;

type SupportedFixType = (typeof SUPPORTED_FIX_TYPES)[number];

/**
 * Generate fixes from drift signals
 */
export function generateFixes(
  drifts: DriftSignal[],
  tokens: DesignToken[],
  options: FixGeneratorOptions = {},
): Fix[] {
  const {
    types = [...SUPPORTED_FIX_TYPES],
    minConfidence = "low",
    includeFiles = [],
    excludeFiles = [],
  } = options;

  const fixes: Fix[] = [];

  for (const drift of drifts) {
    // Filter by drift type
    if (!isSupportedFixType(drift.type)) continue;
    if (!types.includes(drift.type as SupportedFixType)) continue;

    // Filter by file patterns
    const file = drift.source.location?.split(":")[0] || "";
    if (!matchesFilePatterns(file, includeFiles, excludeFiles)) continue;

    // Try to generate a fix
    const fix = generateFixForDrift(drift, tokens);
    if (!fix) continue;

    // Filter by confidence
    if (!meetsConfidenceThreshold(fix.confidence, minConfidence)) continue;

    fixes.push(fix);
  }

  // Sort by confidence (exact first) then by file
  return fixes.sort((a, b) => {
    const confidenceOrder = { low: 0, medium: 1, high: 2, exact: 3 };
    const confDiff =
      confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
    if (confDiff !== 0) return confDiff;
    return a.file.localeCompare(b.file);
  });
}

/**
 * Generate a fix for a single drift signal
 */
function generateFixForDrift(
  drift: DriftSignal,
  tokens: DesignToken[],
): Fix | null {
  // Extract the hardcoded value from drift details
  const hardcodedValue = getHardcodedValue(drift);
  if (!hardcodedValue) return null;

  // Find the best matching token
  const match = findBestTokenMatch(hardcodedValue, drift.type, tokens);
  if (!match) return null;

  // Parse location
  const location = parseLocation(drift.source.location);
  if (!location) return null;

  // Generate replacement
  const replacement = generateReplacement(match.token, drift.type);
  if (!replacement) return null;

  return {
    id: createFixId(location.file, location.line, location.column),
    driftSignalId: drift.id,
    confidence: match.confidence.level,
    confidenceScore: match.confidence.score,
    file: location.file,
    line: location.line,
    column: location.column,
    original: hardcodedValue,
    replacement,
    reason: match.confidence.reason,
    fixType: drift.type as Fix["fixType"],
    tokenName: match.token.name,
  };
}

/**
 * Check if drift type is supported for fixing
 */
function isSupportedFixType(type: string): type is SupportedFixType {
  return SUPPORTED_FIX_TYPES.includes(type as SupportedFixType);
}

/**
 * Check if file matches include/exclude patterns
 */
function matchesFilePatterns(
  file: string,
  includePatterns: string[],
  excludePatterns: string[],
): boolean {
  // If no include patterns, include all
  if (includePatterns.length > 0) {
    const included = includePatterns.some((pattern) =>
      simpleGlobMatch(file, pattern),
    );
    if (!included) return false;
  }

  // Check exclude patterns
  if (excludePatterns.length > 0) {
    const excluded = excludePatterns.some((pattern) =>
      simpleGlobMatch(file, pattern),
    );
    if (excluded) return false;
  }

  return true;
}

/**
 * Simple glob-like pattern matching
 * Supports * (any chars except /) and ** (any chars including /)
 */
function simpleGlobMatch(file: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special regex chars
    .replace(/\*\*/g, "{{GLOBSTAR}}") // Placeholder for **
    .replace(/\*/g, "[^/]*") // * matches anything except /
    .replace(/{{GLOBSTAR}}/g, ".*"); // ** matches anything including /

  const regex = new RegExp(`^${regexStr}$|/${regexStr}$|^${regexStr}/`);
  return regex.test(file);
}

/**
 * Extract hardcoded value from drift signal
 */
function getHardcodedValue(drift: DriftSignal): string | null {
  // Check details.actual first (the hardcoded value found)
  if (drift.details?.actual && typeof drift.details.actual === "string") {
    return drift.details.actual;
  }

  // Try to extract from message
  // Common patterns: "Found hardcoded color #ffffff", "value '#3b82f6'"
  const hexMatch = drift.message.match(/#[0-9a-fA-F]{3,8}\b/);
  if (hexMatch) return hexMatch[0];

  const rgbMatch = drift.message.match(/rgba?\s*\([^)]+\)/i);
  if (rgbMatch) return rgbMatch[0];

  const pxMatch = drift.message.match(/\b\d+(?:\.\d+)?px\b/);
  if (pxMatch) return pxMatch[0];

  return null;
}

/**
 * Find the best matching token for a hardcoded value
 */
function findBestTokenMatch(
  value: string,
  driftType: string,
  tokens: DesignToken[],
): {
  token: DesignToken;
  confidence: ReturnType<typeof scoreConfidence>;
} | null {
  const relevantTokens = filterTokensByType(tokens, driftType);
  if (relevantTokens.length === 0) return null;

  let bestMatch: {
    token: DesignToken;
    confidence: ReturnType<typeof scoreConfidence>;
  } | null = null;

  for (const token of relevantTokens) {
    const confidence = scoreConfidence(value, token, driftType);
    if (!bestMatch || confidence.score > bestMatch.confidence.score) {
      bestMatch = { token, confidence };
    }
  }

  // Only return if we have a reasonable match
  if (bestMatch && bestMatch.confidence.score >= 40) {
    return bestMatch;
  }

  return null;
}

/**
 * Filter tokens by drift type
 */
function filterTokensByType(
  tokens: DesignToken[],
  driftType: string,
): DesignToken[] {
  switch (driftType) {
    case "hardcoded-color":
      return tokens.filter((t) => t.category === "color");
    case "hardcoded-spacing":
    case "hardcoded-radius":
      return tokens.filter((t) => t.category === "spacing");
    case "hardcoded-font-size":
      return tokens.filter(
        (t) => t.category === "typography" || t.category === "sizing",
      );
    default:
      return [];
  }
}

/**
 * Generate replacement string for a token
 */
function generateReplacement(
  token: DesignToken,
  driftType: string,
): string | null {
  // Default to CSS custom property
  const cssVarName = tokenToCssVar(token.name);

  switch (driftType) {
    case "hardcoded-color":
      return `var(${cssVarName})`;
    case "hardcoded-spacing":
    case "hardcoded-radius":
    case "hardcoded-font-size":
      return `var(${cssVarName})`;
    default:
      return null;
  }
}

/**
 * Convert token name to CSS custom property name
 */
function tokenToCssVar(name: string): string {
  // If already has -- prefix, use as-is
  if (name.startsWith("--")) return name;

  // Convert camelCase or dot notation to kebab-case
  const kebab = name
    .replace(/\./g, "-")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase();

  return `--${kebab}`;
}

/**
 * Parse location string into file, line, column
 */
function parseLocation(
  location: string | undefined,
): { file: string; line: number; column: number } | null {
  if (!location) return null;

  // Format: "file/path.tsx:10:5" or "file/path.tsx:10"
  const match = location.match(/^(.+?):(\d+)(?::(\d+))?$/);
  if (!match) return null;

  return {
    file: match[1]!,
    line: parseInt(match[2]!, 10),
    column: match[3] ? parseInt(match[3], 10) : 1,
  };
}

/**
 * Get summary of fixes grouped by type and confidence
 */
export function summarizeFixes(fixes: Fix[]): {
  total: number;
  byConfidence: Record<ConfidenceLevel, number>;
  byType: Record<string, number>;
  highConfidenceCount: number;
} {
  const byConfidence: Record<ConfidenceLevel, number> = {
    low: 0,
    medium: 0,
    high: 0,
    exact: 0,
  };

  const byType: Record<string, number> = {};

  for (const fix of fixes) {
    const conf = fix.confidence;
    byConfidence[conf] = (byConfidence[conf] || 0) + 1;
    byType[fix.fixType] = (byType[fix.fixType] || 0) + 1;
  }

  return {
    total: fixes.length,
    byConfidence,
    byType,
    highConfidenceCount: byConfidence.high || 0,
  };
}
