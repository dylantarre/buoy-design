/**
 * Shared parser utilities for framework scanners.
 */

/**
 * Extract matched content with proper brace balancing.
 * Handles nested braces like: { cb: () => { value: string } }
 *
 * @param content The string to search in
 * @param startIndex The index of the opening brace
 * @returns The content between the braces (excluding braces themselves), or null if unbalanced
 */
export function extractBalancedBraces(
  content: string,
  startIndex: number,
): string | null {
  if (content[startIndex] !== "{") return null;

  let depth = 0;
  let i = startIndex;

  while (i < content.length) {
    const char = content[i];
    if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        // Return content between braces (excluding the braces themselves)
        return content.substring(startIndex + 1, i);
      }
    }
    i++;
  }

  return null; // Unbalanced braces
}

/**
 * Depth tracking characters for parsing nested structures.
 * Positive values increase depth, negative values decrease.
 */
export const DEPTH_CHARS: Record<string, number> = {
  "{": 1,
  "}": -1,
  "(": 1,
  ")": -1,
  "<": 1,
  ">": -1,
  "[": 1,
  "]": -1,
};

/**
 * Track nesting depth when parsing a string.
 * Stops at a delimiter character when depth is 0.
 *
 * @param content The string to parse
 * @param startIndex Where to start parsing
 * @param delimiters Characters that stop parsing when depth is 0
 * @returns The extracted content and the index where parsing stopped
 */
export function extractWithDepthTracking(
  content: string,
  startIndex: number,
  delimiters: string[],
): { value: string; endIndex: number } {
  let value = "";
  let depth = 0;
  let i = startIndex;

  while (i < content.length) {
    const char = content[i];

    if (char !== undefined && char in DEPTH_CHARS) {
      depth += DEPTH_CHARS[char] ?? 0;
    }

    // Stop at delimiter only when not nested
    if (depth === 0 && char !== undefined && delimiters.includes(char)) {
      break;
    }

    value += char;
    i++;
  }

  return { value: value.trim(), endIndex: i };
}
