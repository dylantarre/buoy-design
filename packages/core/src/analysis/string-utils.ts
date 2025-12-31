/**
 * String utility functions for component and token comparison
 */

/**
 * Calculate string similarity using Levenshtein distance
 * Returns a value between 0 (completely different) and 1 (identical)
 */
export function stringSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(0),
  );

  for (let i = 0; i <= a.length; i++) dp[i]![0] = i;
  for (let j = 0; j <= b.length; j++) dp[0]![j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1, // deletion
        dp[i]![j - 1]! + 1, // insertion
        dp[i - 1]![j - 1]! + cost, // substitution
      );
    }
  }

  return dp[a.length]![b.length]!;
}

/**
 * Normalize a component name for comparison
 * Strips common prefixes/suffixes and converts to lowercase
 */
export function normalizeForComparison(name: string): string {
  return name
    .replace(/^(I|Abstract|Base)/i, "") // Strip common prefixes
    .replace(/(Component|View|Container|Wrapper)$/i, "") // Strip common suffixes
    .toLowerCase()
    .replace(/[-_]/g, ""); // Remove separators
}
