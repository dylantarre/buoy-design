/**
 * Token Generator
 * Clusters extracted design values and generates design tokens.
 */

import type { ExtractedValue } from '../extraction/css-parser.js';
import { hexToRgb, normalizeHexColor, spacingToPx } from '../extraction/css-parser.js';

export interface GeneratedToken {
  name: string;
  value: string;
  category: 'color' | 'spacing' | 'sizing' | 'font-size' | 'radius' | 'breakpoint';
  context: string; // The purpose: 'spacing', 'sizing', 'position', 'breakpoint', etc.
  occurrences: number;
  sources: string[]; // Original values that map to this token
  isOrphan?: boolean; // True if this token needs user adoption into the system
}

export interface TokenizationStats {
  total: number;
  coverage: {
    total: number;
    covered: number;
    percentage: number;
  };
  byCategory: Record<string, {
    input: number;
    uniqueValues: number;
    clustered: number;
    tokenized: number;
    orphaned: number;
    coverage: number; // Percentage of input values covered by primary tokens
  }>;
}

export interface TokenGenerationResult {
  tokens: GeneratedToken[];
  css: string;
  json: Record<string, Record<string, string>>;
  stats: TokenizationStats;
}

export interface TokenGenerationOptions {
  /** Color clustering threshold (Delta E, default 10) */
  colorThreshold?: number;
  /** Spacing clustering threshold (px, default 4) */
  spacingThreshold?: number;
  /** Prefix for CSS custom properties (default empty) */
  prefix?: string;
}

interface CategoryResult {
  tokens: GeneratedToken[];
  stats: {
    input: number;
    uniqueValues: number;
    clustered: number;
    tokenized: number;
    orphaned: number;
    coverage: number; // Percentage of input covered by primary tokens
  };
}

/**
 * Generate design tokens from extracted values
 */
export function generateTokens(
  values: ExtractedValue[],
  options: TokenGenerationOptions = {}
): TokenGenerationResult {
  const {
    colorThreshold = 10,
    spacingThreshold = 4,
    prefix = '',
  } = options;

  const tokens: GeneratedToken[] = [];
  const stats: TokenizationStats = {
    total: values.length,
    coverage: { total: 0, covered: 0, percentage: 0 },
    byCategory: {},
  };

  // Group values by category
  const byCategory: Record<string, ExtractedValue[]> = {};
  for (const value of values) {
    if (!byCategory[value.category]) {
      byCategory[value.category] = [];
    }
    byCategory[value.category]!.push(value);
  }

  // Extract breakpoint values first to filter from sizing
  const breakpointPxValues = new Set<number>();
  if (byCategory['breakpoint']) {
    for (const v of byCategory['breakpoint']) {
      const px = spacingToPx(v.value);
      if (px !== null && px > 0) {
        breakpointPxValues.add(Math.round(px));
      }
    }
  }

  // Generate color tokens
  if (byCategory['color']) {
    const result = generateColorTokens(byCategory['color'], colorThreshold);
    tokens.push(...result.tokens);
    stats.byCategory['color'] = result.stats;
  }

  // Generate spacing tokens (group by context: spacing, sizing, position)
  if (byCategory['spacing']) {
    // Group by context first
    const byContext: Record<string, ExtractedValue[]> = {};
    for (const v of byCategory['spacing']) {
      const ctx = v.context || 'spacing';
      if (!byContext[ctx]) byContext[ctx] = [];
      byContext[ctx]!.push(v);
    }

    // Generate separate scales for spacing context
    if (byContext['spacing']) {
      const result = generateSpacingTokens(byContext['spacing'], spacingThreshold, 'spacing', 'spacing');
      tokens.push(...result.tokens);
      stats.byCategory['spacing'] = result.stats;
    }

    // Generate separate scale for position context
    if (byContext['position']) {
      const result = generateSpacingTokens(byContext['position'], spacingThreshold, 'position', 'spacing');
      tokens.push(...result.tokens);
      stats.byCategory['position'] = result.stats;
    }
  }

  // Generate sizing tokens - FILTER OUT BREAKPOINT VALUES
  if (byCategory['sizing']) {
    const filteredSizing = byCategory['sizing'].filter(v => {
      const px = spacingToPx(v.value);
      if (px === null) return true; // Keep non-numeric
      return !breakpointPxValues.has(Math.round(px));
    });

    if (filteredSizing.length > 0) {
      const result = generateSizingTokens(filteredSizing, spacingThreshold);
      tokens.push(...result.tokens);
      stats.byCategory['sizing'] = result.stats;
    }
  }

  // Generate font-size tokens
  if (byCategory['font-size']) {
    const result = generateFontSizeTokens(byCategory['font-size'], spacingThreshold);
    tokens.push(...result.tokens);
    stats.byCategory['font-size'] = result.stats;
  }

  // Generate radius tokens
  if (byCategory['radius']) {
    const result = generateRadiusTokens(byCategory['radius'], spacingThreshold);
    tokens.push(...result.tokens);
    stats.byCategory['radius'] = result.stats;
  }

  // Generate breakpoint tokens
  if (byCategory['breakpoint']) {
    const result = generateBreakpointTokens(byCategory['breakpoint']);
    tokens.push(...result.tokens);
    stats.byCategory['breakpoint'] = result.stats;
  }

  // Calculate overall coverage
  let totalCovered = 0;
  for (const categoryStats of Object.values(stats.byCategory)) {
    // Coverage is based on how many input values have a token
    // All values in tokenized clusters are "covered"
    const coveredInCategory = Math.round(categoryStats.input * (categoryStats.coverage / 100));
    totalCovered += coveredInCategory;
  }
  stats.coverage = {
    total: values.length,
    covered: totalCovered,
    percentage: values.length > 0 ? Math.round((totalCovered / values.length) * 100) : 0,
  };

  // Generate CSS output
  const css = generateCss(tokens, prefix);

  // Generate JSON output
  const json = generateJson(tokens);

  return { tokens, css, json, stats };
}

/**
 * Generate color tokens by clustering similar colors
 */
function generateColorTokens(values: ExtractedValue[], threshold: number): CategoryResult {
  const inputCount = values.length;

  // Count occurrences of each color
  const colorCounts = new Map<string, number>();
  for (const v of values) {
    const normalized = normalizeColor(v.value);
    colorCounts.set(normalized, (colorCounts.get(normalized) || 0) + 1);
  }

  const uniqueCount = colorCounts.size;

  // Sort by frequency
  const sortedColors = [...colorCounts.entries()]
    .sort((a, b) => b[1] - a[1]);

  // Cluster similar colors
  const clusters: { representative: string; members: string[]; count: number }[] = [];

  for (const [color, count] of sortedColors) {
    // Try to find an existing cluster this color belongs to
    let foundCluster = false;
    for (const cluster of clusters) {
      if (colorsAreSimilar(color, cluster.representative, threshold)) {
        cluster.members.push(color);
        cluster.count += count;
        foundCluster = true;
        break;
      }
    }

    if (!foundCluster) {
      clusters.push({ representative: color, members: [color], count });
    }
  }

  // Sort clusters by total count
  clusters.sort((a, b) => b.count - a.count);

  // Assign token names
  const tokens: GeneratedToken[] = [];
  const tokenizedClusters: typeof clusters = [];
  const orphanClusters: typeof clusters = [];

  // Categorize colors
  const neutrals: typeof clusters = [];
  const primaries: typeof clusters = [];
  const accents: typeof clusters = [];

  for (const cluster of clusters) {
    const rgb = parseColor(cluster.representative);
    if (!rgb) continue;

    const saturation = getColorSaturation(rgb);
    if (saturation < 0.1) {
      neutrals.push(cluster);
    } else if (primaries.length < 3) {
      primaries.push(cluster);
    } else {
      accents.push(cluster);
    }
  }

  // Generate neutral tokens (gray scale) - limit to 11
  const neutralNames = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
  neutrals.sort((a, b) => {
    const rgbA = parseColor(a.representative);
    const rgbB = parseColor(b.representative);
    if (!rgbA || !rgbB) return 0;
    return getLightness(rgbB) - getLightness(rgbA); // Lighter first
  });

  for (let i = 0; i < neutrals.length; i++) {
    const cluster = neutrals[i]!;
    if (i < neutralNames.length) {
      tokens.push({
        name: `color-neutral-${neutralNames[i]}`,
        value: cluster.representative,
        category: 'color',
        context: 'color',
        occurrences: cluster.count,
        sources: cluster.members,
      });
      tokenizedClusters.push(cluster);
    } else {
      // Extra neutrals become orphans
      tokens.push({
        name: `color-orphan-${orphanClusters.length + 1}`,
        value: cluster.representative,
        category: 'color',
        context: 'color',
        occurrences: cluster.count,
        sources: cluster.members,
        isOrphan: true,
      });
      orphanClusters.push(cluster);
    }
  }

  // Generate primary tokens
  if (primaries.length > 0) {
    const primary = primaries[0]!;
    tokens.push({
      name: 'color-primary-500',
      value: primary.representative,
      category: 'color',
      context: 'color',
      occurrences: primary.count,
      sources: primary.members,
    });
    tokenizedClusters.push(primary);
  }

  if (primaries.length > 1) {
    const secondary = primaries[1]!;
    tokens.push({
      name: 'color-secondary-500',
      value: secondary.representative,
      category: 'color',
      context: 'color',
      occurrences: secondary.count,
      sources: secondary.members,
    });
    tokenizedClusters.push(secondary);
  }

  // Additional primaries become orphans
  for (let i = 2; i < primaries.length; i++) {
    const cluster = primaries[i]!;
    tokens.push({
      name: `color-orphan-${orphanClusters.length + 1}`,
      value: cluster.representative,
      category: 'color',
      context: 'color',
      occurrences: cluster.count,
      sources: cluster.members,
      isOrphan: true,
    });
    orphanClusters.push(cluster);
  }

  // Generate accent tokens - primary accents get names, rest become orphans
  for (let i = 0; i < accents.length; i++) {
    const accent = accents[i]!;
    if (i < 3) {
      tokens.push({
        name: `color-accent-${i + 1}`,
        value: accent.representative,
        category: 'color',
        context: 'color',
        occurrences: accent.count,
        sources: accent.members,
      });
      tokenizedClusters.push(accent);
    } else {
      tokens.push({
        name: `color-orphan-${orphanClusters.length + 1}`,
        value: accent.representative,
        category: 'color',
        context: 'color',
        occurrences: accent.count,
        sources: accent.members,
        isOrphan: true,
      });
      orphanClusters.push(accent);
    }
  }

  // Calculate coverage: sum of tokenized cluster counts / total input
  const tokenizedCount = tokenizedClusters.reduce((sum, c) => sum + c.count, 0);
  const coverage = inputCount > 0 ? Math.round((tokenizedCount / inputCount) * 100) : 0;

  return {
    tokens,
    stats: {
      input: inputCount,
      uniqueValues: uniqueCount,
      clustered: clusters.length,
      tokenized: tokenizedClusters.length,
      orphaned: orphanClusters.length,
      coverage,
    },
  };
}

/**
 * Generate spacing tokens using t-shirt sizing
 */
function generateSpacingTokens(
  values: ExtractedValue[],
  threshold: number,
  context: string = 'spacing',
  category: 'spacing' | 'sizing' = 'spacing'
): CategoryResult {
  const inputCount = values.length;

  // Convert all values to pixels and count
  const pxCounts = new Map<number, { count: number; sources: string[] }>();

  for (const v of values) {
    const px = spacingToPx(v.value);
    if (px === null || px < 0) continue;

    const rounded = Math.round(px);
    const existing = pxCounts.get(rounded);
    if (existing) {
      existing.count++;
      if (!existing.sources.includes(v.value)) {
        existing.sources.push(v.value);
      }
    } else {
      pxCounts.set(rounded, { count: 1, sources: [v.value] });
    }
  }

  const uniqueCount = pxCounts.size;

  // Cluster similar values
  const clusters: { value: number; count: number; sources: string[] }[] = [];
  const sortedPx = [...pxCounts.entries()].sort((a, b) => a[0] - b[0]);

  for (const [px, data] of sortedPx) {
    // Never cluster 0 with non-zero values - keep zero separate
    if (px === 0) {
      clusters.push({ value: 0, count: data.count, sources: [...data.sources] });
      continue;
    }

    let foundCluster = false;
    for (const cluster of clusters) {
      // Don't cluster non-zero values with zero
      if (cluster.value === 0) continue;

      if (Math.abs(px - cluster.value) <= threshold) {
        // Use the more common value as representative
        if (data.count > cluster.count) {
          cluster.value = px;
        }
        cluster.count += data.count;
        cluster.sources.push(...data.sources);
        foundCluster = true;
        break;
      }
    }

    if (!foundCluster) {
      clusters.push({ value: px, count: data.count, sources: [...data.sources] });
    }
  }

  // Sort by value
  clusters.sort((a, b) => a.value - b.value);

  // Sort by count to find most used values, take top 10 as primary
  const sortedByCount = [...clusters].sort((a, b) => b.count - a.count);
  const topClusters = sortedByCount.slice(0, 10).sort((a, b) => a.value - b.value);
  const orphanClusters = sortedByCount.slice(10);

  // Assign t-shirt sizes based on position in sorted list
  const sizeNames = ['3xs', '2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'];
  const tokens: GeneratedToken[] = [];

  for (let i = 0; i < topClusters.length; i++) {
    const cluster = topClusters[i]!;
    const sizeName = sizeNames[i] || `${i + 1}`;

    tokens.push({
      name: `${context}-${sizeName}`,
      value: `${cluster.value}px`,
      category,
      context,
      occurrences: cluster.count,
      sources: [...new Set(cluster.sources)],
    });
  }

  // Generate orphan tokens for less common values
  for (let i = 0; i < orphanClusters.length; i++) {
    const cluster = orphanClusters[i]!;
    tokens.push({
      name: `${context}-orphan-${i + 1}`,
      value: `${cluster.value}px`,
      category,
      context,
      occurrences: cluster.count,
      sources: [...new Set(cluster.sources)],
      isOrphan: true,
    });
  }

  // Calculate coverage (primary tokens only)
  const tokenizedCount = topClusters.reduce((sum, c) => sum + c.count, 0);
  const coverage = inputCount > 0 ? Math.round((tokenizedCount / inputCount) * 100) : 0;

  return {
    tokens,
    stats: {
      input: inputCount,
      uniqueValues: uniqueCount,
      clustered: clusters.length,
      tokenized: topClusters.length,
      orphaned: orphanClusters.length,
      coverage,
    },
  };
}

/**
 * Generate sizing tokens (width, height) - different naming convention
 */
function generateSizingTokens(values: ExtractedValue[], threshold: number): CategoryResult {
  const inputCount = values.length;
  const pxCounts = new Map<number, { count: number; sources: string[] }>();

  for (const v of values) {
    const px = spacingToPx(v.value);
    if (px === null || px < 0) continue;

    const rounded = Math.round(px);
    const existing = pxCounts.get(rounded);
    if (existing) {
      existing.count++;
      if (!existing.sources.includes(v.value)) {
        existing.sources.push(v.value);
      }
    } else {
      pxCounts.set(rounded, { count: 1, sources: [v.value] });
    }
  }

  const uniqueCount = pxCounts.size;

  // Cluster similar values
  const clusters: { value: number; count: number; sources: string[] }[] = [];
  const sortedPx = [...pxCounts.entries()].sort((a, b) => a[0] - b[0]);

  for (const [px, data] of sortedPx) {
    // Never cluster 0 with non-zero values - keep zero separate
    if (px === 0) {
      clusters.push({ value: 0, count: data.count, sources: [...data.sources] });
      continue;
    }

    let foundCluster = false;
    for (const cluster of clusters) {
      // Don't cluster non-zero values with zero
      if (cluster.value === 0) continue;

      if (Math.abs(px - cluster.value) <= threshold) {
        if (data.count > cluster.count) {
          cluster.value = px;
        }
        cluster.count += data.count;
        cluster.sources.push(...data.sources);
        foundCluster = true;
        break;
      }
    }

    if (!foundCluster) {
      clusters.push({ value: px, count: data.count, sources: [...data.sources] });
    }
  }

  clusters.sort((a, b) => a.value - b.value);

  // Sizing uses numeric naming: size-1 through size-N
  const sortedByCount = [...clusters].sort((a, b) => b.count - a.count);
  const topClusters = sortedByCount.slice(0, 12).sort((a, b) => a.value - b.value);
  const orphanClusters = sortedByCount.slice(12);

  const tokens: GeneratedToken[] = [];

  for (let i = 0; i < topClusters.length; i++) {
    const cluster = topClusters[i]!;

    tokens.push({
      name: `size-${i + 1}`,
      value: `${cluster.value}px`,
      category: 'sizing',
      context: 'sizing',
      occurrences: cluster.count,
      sources: [...new Set(cluster.sources)],
    });
  }

  // Generate orphan tokens for less common values
  for (let i = 0; i < orphanClusters.length; i++) {
    const cluster = orphanClusters[i]!;
    tokens.push({
      name: `size-orphan-${i + 1}`,
      value: `${cluster.value}px`,
      category: 'sizing',
      context: 'sizing',
      occurrences: cluster.count,
      sources: [...new Set(cluster.sources)],
      isOrphan: true,
    });
  }

  // Calculate coverage (primary tokens only)
  const tokenizedCount = topClusters.reduce((sum, c) => sum + c.count, 0);
  const coverage = inputCount > 0 ? Math.round((tokenizedCount / inputCount) * 100) : 0;

  return {
    tokens,
    stats: {
      input: inputCount,
      uniqueValues: uniqueCount,
      clustered: clusters.length,
      tokenized: topClusters.length,
      orphaned: orphanClusters.length,
      coverage,
    },
  };
}

/**
 * Generate font-size tokens
 */
function generateFontSizeTokens(values: ExtractedValue[], threshold: number): CategoryResult {
  const inputCount = values.length;

  // Similar to spacing, but with font-size naming
  const pxCounts = new Map<number, { count: number; sources: string[] }>();

  for (const v of values) {
    const px = spacingToPx(v.value);
    if (px === null || px <= 0) continue;

    const rounded = Math.round(px);
    const existing = pxCounts.get(rounded);
    if (existing) {
      existing.count++;
      if (!existing.sources.includes(v.value)) {
        existing.sources.push(v.value);
      }
    } else {
      pxCounts.set(rounded, { count: 1, sources: [v.value] });
    }
  }

  const uniqueCount = pxCounts.size;

  // Cluster and sort
  const clusters: { value: number; count: number; sources: string[] }[] = [];
  const sortedPx = [...pxCounts.entries()].sort((a, b) => a[0] - b[0]);

  for (const [px, data] of sortedPx) {
    // Never cluster 0 with non-zero values - keep zero separate
    // (0 values are already filtered above, but guard for safety)
    if (px === 0) {
      clusters.push({ value: 0, count: data.count, sources: [...data.sources] });
      continue;
    }

    let foundCluster = false;
    for (const cluster of clusters) {
      // Don't cluster non-zero values with zero
      if (cluster.value === 0) continue;

      if (Math.abs(px - cluster.value) <= threshold) {
        if (data.count > cluster.count) {
          cluster.value = px;
        }
        cluster.count += data.count;
        cluster.sources.push(...data.sources);
        foundCluster = true;
        break;
      }
    }

    if (!foundCluster) {
      clusters.push({ value: px, count: data.count, sources: [...data.sources] });
    }
  }

  clusters.sort((a, b) => a.value - b.value);

  // Sort by count to find most used values
  const sortedByCount = [...clusters].sort((a, b) => b.count - a.count);
  const topClusters = sortedByCount.slice(0, 10).sort((a, b) => a.value - b.value);
  const orphanClusters = sortedByCount.slice(10);

  // Assign font-size names
  const sizeNames = ['2xs', 'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'];
  const tokens: GeneratedToken[] = [];

  for (let i = 0; i < topClusters.length; i++) {
    const cluster = topClusters[i]!;
    const sizeName = sizeNames[i] || `${i + 1}`;

    tokens.push({
      name: `font-size-${sizeName}`,
      value: `${cluster.value}px`,
      category: 'font-size',
      context: 'typography',
      occurrences: cluster.count,
      sources: [...new Set(cluster.sources)],
    });
  }

  // Generate orphan tokens for less common font sizes
  for (let i = 0; i < orphanClusters.length; i++) {
    const cluster = orphanClusters[i]!;
    tokens.push({
      name: `font-size-orphan-${i + 1}`,
      value: `${cluster.value}px`,
      category: 'font-size',
      context: 'typography',
      occurrences: cluster.count,
      sources: [...new Set(cluster.sources)],
      isOrphan: true,
    });
  }

  // Calculate coverage (primary tokens only)
  const tokenizedCount = topClusters.reduce((sum, c) => sum + c.count, 0);
  const coverage = inputCount > 0 ? Math.round((tokenizedCount / inputCount) * 100) : 0;

  return {
    tokens,
    stats: {
      input: inputCount,
      uniqueValues: uniqueCount,
      clustered: clusters.length,
      tokenized: topClusters.length,
      orphaned: orphanClusters.length,
      coverage,
    },
  };
}

/**
 * Generate radius tokens
 */
function generateRadiusTokens(values: ExtractedValue[], threshold: number): CategoryResult {
  const inputCount = values.length;
  const pxCounts = new Map<number, { count: number; sources: string[] }>();

  for (const v of values) {
    const px = spacingToPx(v.value);
    if (px === null || px < 0) continue;

    const rounded = Math.round(px);
    const existing = pxCounts.get(rounded);
    if (existing) {
      existing.count++;
      if (!existing.sources.includes(v.value)) {
        existing.sources.push(v.value);
      }
    } else {
      pxCounts.set(rounded, { count: 1, sources: [v.value] });
    }
  }

  const uniqueCount = pxCounts.size;

  const clusters: { value: number; count: number; sources: string[] }[] = [];
  const sortedPx = [...pxCounts.entries()].sort((a, b) => a[0] - b[0]);

  for (const [px, data] of sortedPx) {
    // Never cluster 0 with non-zero values - keep zero separate
    if (px === 0) {
      clusters.push({ value: 0, count: data.count, sources: [...data.sources] });
      continue;
    }

    let foundCluster = false;
    for (const cluster of clusters) {
      // Don't cluster non-zero values with zero
      if (cluster.value === 0) continue;

      if (Math.abs(px - cluster.value) <= threshold) {
        if (data.count > cluster.count) {
          cluster.value = px;
        }
        cluster.count += data.count;
        cluster.sources.push(...data.sources);
        foundCluster = true;
        break;
      }
    }

    if (!foundCluster) {
      clusters.push({ value: px, count: data.count, sources: [...data.sources] });
    }
  }

  clusters.sort((a, b) => a.value - b.value);

  // Separate zero cluster from non-zero clusters
  const zeroCluster = clusters.find(c => c.value === 0);
  const nonZeroClusters = clusters.filter(c => c.value > 0);

  // Size names for non-zero values only
  const sizeNames = ['sm', 'md', 'lg', 'xl', '2xl', 'full'];

  const tokens: GeneratedToken[] = [];
  const tokenizedClusters: typeof clusters = [];

  // Handle zero first - only create radius-none if there's actually a 0 value
  if (zeroCluster) {
    tokens.push({
      name: 'radius-none',
      value: '0',
      category: 'radius',
      context: 'radius',
      occurrences: zeroCluster.count,
      sources: [...new Set(zeroCluster.sources)],
    });
    tokenizedClusters.push(zeroCluster);
  }

  // Handle non-zero values with sm, md, lg, etc.
  const nonZeroTokenized = nonZeroClusters.slice(0, sizeNames.length);
  const orphanClusters = nonZeroClusters.slice(sizeNames.length);

  for (let i = 0; i < nonZeroTokenized.length; i++) {
    const cluster = nonZeroTokenized[i]!;
    const sizeName = sizeNames[i]!;
    const value = sizeName === 'full' ? '9999px' : `${cluster.value}px`;

    tokens.push({
      name: `radius-${sizeName}`,
      value,
      category: 'radius',
      context: 'radius',
      occurrences: cluster.count,
      sources: [...new Set(cluster.sources)],
    });
    tokenizedClusters.push(cluster);
  }

  // Generate orphan tokens for extra radius values
  for (let i = 0; i < orphanClusters.length; i++) {
    const cluster = orphanClusters[i]!;
    tokens.push({
      name: `radius-orphan-${i + 1}`,
      value: `${cluster.value}px`,
      category: 'radius',
      context: 'radius',
      occurrences: cluster.count,
      sources: [...new Set(cluster.sources)],
      isOrphan: true,
    });
  }

  // Calculate coverage (primary tokens only)
  const tokenizedCount = tokenizedClusters.reduce((sum, c) => sum + c.count, 0);
  const coverage = inputCount > 0 ? Math.round((tokenizedCount / inputCount) * 100) : 0;

  return {
    tokens,
    stats: {
      input: inputCount,
      uniqueValues: uniqueCount,
      clustered: clusters.length,
      tokenized: tokenizedClusters.length,
      orphaned: orphanClusters.length,
      coverage,
    },
  };
}

/**
 * Generate breakpoint tokens from media query values
 */
function generateBreakpointTokens(values: ExtractedValue[]): CategoryResult {
  const inputCount = values.length;
  const pxCounts = new Map<number, { count: number; sources: string[] }>();

  for (const v of values) {
    const px = spacingToPx(v.value);
    if (px === null || px <= 0) continue;

    const rounded = Math.round(px);
    const existing = pxCounts.get(rounded);
    if (existing) {
      existing.count++;
      if (!existing.sources.includes(v.value)) {
        existing.sources.push(v.value);
      }
    } else {
      pxCounts.set(rounded, { count: 1, sources: [v.value] });
    }
  }

  const uniqueCount = pxCounts.size;

  // Sort by value (ascending for breakpoints)
  const sortedPx = [...pxCounts.entries()].sort((a, b) => a[0] - b[0]);

  // Breakpoints use named conventions: xs, sm, md, lg, xl, 2xl
  const breakpointNames = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'];
  const tokens: GeneratedToken[] = [];
  const tokenizedEntries = sortedPx.slice(0, breakpointNames.length);
  const orphanEntries = sortedPx.slice(breakpointNames.length);

  for (let i = 0; i < tokenizedEntries.length; i++) {
    const [px, data] = tokenizedEntries[i]!;
    tokens.push({
      name: `breakpoint-${breakpointNames[i]}`,
      value: `${px}px`,
      category: 'breakpoint',
      context: 'breakpoint',
      occurrences: data.count,
      sources: [...new Set(data.sources)],
    });
  }

  // Generate orphan tokens for extra breakpoints
  for (let i = 0; i < orphanEntries.length; i++) {
    const [px, data] = orphanEntries[i]!;
    tokens.push({
      name: `breakpoint-orphan-${i + 1}`,
      value: `${px}px`,
      category: 'breakpoint',
      context: 'breakpoint',
      occurrences: data.count,
      sources: [...new Set(data.sources)],
      isOrphan: true,
    });
  }

  // Calculate coverage (primary tokens only)
  const tokenizedCount = tokenizedEntries.reduce((sum, [, data]) => sum + data.count, 0);
  const coverage = inputCount > 0 ? Math.round((tokenizedCount / inputCount) * 100) : 0;

  return {
    tokens,
    stats: {
      input: inputCount,
      uniqueValues: uniqueCount,
      clustered: uniqueCount, // No clustering for breakpoints
      tokenized: tokenizedEntries.length,
      orphaned: orphanEntries.length,
      coverage,
    },
  };
}

/**
 * Generate CSS custom properties
 */
function generateCss(tokens: GeneratedToken[], prefix: string): string {
  const lines = [':root {'];

  // Group by category
  const byCategory: Record<string, GeneratedToken[]> = {};
  for (const token of tokens) {
    if (!byCategory[token.category]) {
      byCategory[token.category] = [];
    }
    byCategory[token.category]!.push(token);
  }

  const categoryOrder = ['color', 'spacing', 'sizing', 'font-size', 'radius', 'breakpoint'];

  const categoryDisplayNames: Record<string, string> = {
    'color': 'Colors',
    'spacing': 'Spacing',
    'sizing': 'Sizing',
    'font-size': 'Font Sizes',
    'radius': 'Border Radii',
    'breakpoint': 'Breakpoints',
  };

  for (const category of categoryOrder) {
    const categoryTokens = byCategory[category];
    if (!categoryTokens || categoryTokens.length === 0) continue;

    const displayName = categoryDisplayNames[category] || `${category.charAt(0).toUpperCase() + category.slice(1)}s`;
    lines.push(`  /* ${displayName} */`);

    for (const token of categoryTokens) {
      const varName = prefix ? `--${prefix}-${token.name}` : `--${token.name}`;
      lines.push(`  ${varName}: ${token.value};`);
    }

    lines.push('');
  }

  lines.push('}');

  return lines.join('\n');
}

/**
 * Generate JSON token format
 */
function generateJson(tokens: GeneratedToken[]): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};

  for (const token of tokens) {
    if (!result[token.category]) {
      result[token.category] = {};
    }
    result[token.category]![token.name] = token.value;
  }

  return result;
}

// Helper functions

function normalizeColor(color: string): string {
  color = color.toLowerCase().trim();

  // Named colors
  const namedColors: Record<string, string> = {
    white: '#ffffff',
    black: '#000000',
    red: '#ff0000',
    green: '#008000',
    blue: '#0000ff',
    transparent: 'transparent',
  };

  if (namedColors[color]) {
    return namedColors[color]!;
  }

  // Normalize hex
  if (color.startsWith('#')) {
    return normalizeHexColor(color);
  }

  return color;
}

function parseColor(color: string): { r: number; g: number; b: number } | null {
  color = normalizeColor(color);

  if (color.startsWith('#')) {
    return hexToRgb(color);
  }

  // Parse rgb()
  const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1]!, 10),
      g: parseInt(rgbMatch[2]!, 10),
      b: parseInt(rgbMatch[3]!, 10),
    };
  }

  return null;
}

function colorsAreSimilar(color1: string, color2: string, threshold: number): boolean {
  const rgb1 = parseColor(color1);
  const rgb2 = parseColor(color2);

  if (!rgb1 || !rgb2) return false;

  // Simple Euclidean distance in RGB space
  const distance = Math.sqrt(
    Math.pow(rgb1.r - rgb2.r, 2) +
    Math.pow(rgb1.g - rgb2.g, 2) +
    Math.pow(rgb1.b - rgb2.b, 2)
  );

  return distance < threshold * 10; // Rough conversion from perceptual threshold
}

function getColorSaturation(rgb: { r: number; g: number; b: number }): number {
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);

  if (max === 0) return 0;

  return (max - min) / max;
}

function getLightness(rgb: { r: number; g: number; b: number }): number {
  return (rgb.r + rgb.g + rgb.b) / 3 / 255;
}
