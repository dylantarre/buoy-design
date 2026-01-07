// Audit report generation - analyzes codebase for design system health

export interface AuditValue {
  category: 'color' | 'spacing' | 'typography' | 'radius';
  value: string;
  file: string;
  line: number;
}

export interface CategoryStats {
  uniqueCount: number;
  totalUsages: number;
  mostCommon: Array<{ value: string; count: number }>;
}

export interface FileIssue {
  file: string;
  issueCount: number;
}

export interface CloseMatch {
  value: string;
  closeTo: string;
  distance: number;
}

export interface AuditReport {
  categories: Record<string, CategoryStats>;
  worstFiles: FileIssue[];
  totals: {
    uniqueValues: number;
    totalUsages: number;
    filesAffected: number;
  };
  closeMatches: CloseMatch[];
  score: number;
}

/**
 * Generate an audit report from extracted values
 */
export function generateAuditReport(values: AuditValue[]): AuditReport {
  if (values.length === 0) {
    return {
      categories: {},
      worstFiles: [],
      totals: { uniqueValues: 0, totalUsages: 0, filesAffected: 0 },
      closeMatches: [],
      score: 100,
    };
  }

  // Group by category
  const byCategory = new Map<string, Map<string, number>>();
  const byFile = new Map<string, number>();
  const allFiles = new Set<string>();

  for (const v of values) {
    // Category stats
    if (!byCategory.has(v.category)) {
      byCategory.set(v.category, new Map());
    }
    const catMap = byCategory.get(v.category)!;
    catMap.set(v.value, (catMap.get(v.value) || 0) + 1);

    // File stats
    byFile.set(v.file, (byFile.get(v.file) || 0) + 1);
    allFiles.add(v.file);
  }

  // Build category stats
  const categories: Record<string, CategoryStats> = {};
  let totalUnique = 0;

  for (const [category, valueMap] of byCategory) {
    const entries = [...valueMap.entries()];
    const uniqueCount = entries.length;
    const totalUsages = entries.reduce((sum, [, count]) => sum + count, 0);

    // Sort by count descending for mostCommon
    const mostCommon = entries
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    categories[category] = { uniqueCount, totalUsages, mostCommon };
    totalUnique += uniqueCount;
  }

  // Build worst files list
  const worstFiles = [...byFile.entries()]
    .map(([file, issueCount]) => ({ file, issueCount }))
    .sort((a, b) => b.issueCount - a.issueCount)
    .slice(0, 10);

  const report: AuditReport = {
    categories,
    worstFiles,
    totals: {
      uniqueValues: totalUnique,
      totalUsages: values.length,
      filesAffected: allFiles.size,
    },
    closeMatches: [],
    score: 0,
  };

  report.score = calculateHealthScore(report);
  return report;
}

/**
 * Find values that are close to design tokens (likely typos)
 */
export function findCloseMatches(
  foundValues: string[],
  designTokens: string[],
  category: 'color' | 'spacing' | 'typography' | 'radius'
): CloseMatch[] {
  const matches: CloseMatch[] = [];
  const tokenSet = new Set(designTokens.map((t) => t.toLowerCase()));

  for (const value of foundValues) {
    const valueLower = value.toLowerCase();

    // Skip exact matches
    if (tokenSet.has(valueLower)) {
      continue;
    }

    // Find closest token
    let closestToken: string | null = null;
    let closestDistance = Infinity;

    for (const token of designTokens) {
      const distance = getDistance(value, token, category);
      if (distance < closestDistance && distance > 0) {
        closestDistance = distance;
        closestToken = token;
      }
    }

    // Only include if close enough (threshold depends on category)
    const threshold = category === 'color' ? 5 : 2;
    if (closestToken && closestDistance <= threshold) {
      matches.push({
        value,
        closeTo: closestToken,
        distance: closestDistance,
      });
    }
  }

  return matches;
}

/**
 * Calculate distance between two values
 */
function getDistance(
  a: string,
  b: string,
  category: 'color' | 'spacing' | 'typography' | 'radius'
): number {
  if (category === 'color') {
    return colorDistance(a, b);
  }

  if (category === 'spacing' || category === 'radius') {
    return numericDistance(a, b);
  }

  // For typography, use simple string comparison
  return a.toLowerCase() === b.toLowerCase() ? 0 : Infinity;
}

/**
 * Calculate color distance (simple hex comparison)
 */
function colorDistance(a: string, b: string): number {
  const hexA = a.replace('#', '').toLowerCase();
  const hexB = b.replace('#', '').toLowerCase();

  if (hexA.length !== 6 || hexB.length !== 6) {
    return Infinity;
  }

  // Count differing characters
  let diff = 0;
  for (let i = 0; i < 6; i++) {
    if (hexA[i] !== hexB[i]) {
      diff++;
    }
  }

  return diff;
}

/**
 * Calculate numeric distance for spacing/radius
 */
function numericDistance(a: string, b: string): number {
  const numA = parseFloat(a);
  const numB = parseFloat(b);

  if (isNaN(numA) || isNaN(numB)) {
    return Infinity;
  }

  return Math.abs(numA - numB);
}

/**
 * Calculate health score (0-100) from audit report
 * 
 * The score reflects how "clean" the codebase is:
 * - 100 = No hardcoded design values found (using tokens properly)
 * - Lower scores = More hardcoded values that should be tokens
 * 
 * Penalties:
 * - Each unique hardcoded value: -3 points
 * - Each file with issues: -1 point  
 * - Extra penalty for files with many issues: -0.5 per issue over 5
 * - Close matches (typos): -5 points each
 */
export function calculateHealthScore(report: AuditReport): number {
  // Perfect score if no issues
  if (report.totals.uniqueValues === 0) {
    return 100;
  }

  let score = 100;

  // Penalize for each unique hardcoded value
  // 2 values = -6, 10 values = -30, 30 values = -90
  score -= report.totals.uniqueValues * 3;

  // Penalize for each file affected (encourages consolidation)
  score -= report.totals.filesAffected;

  // Extra penalty for files with many hardcoded values
  for (const file of report.worstFiles) {
    if (file.issueCount > 5) {
      score -= (file.issueCount - 5) * 0.5;
    }
  }

  // Penalize for close matches (typos) - these are especially bad
  score -= report.closeMatches.length * 5;

  // Clamp to 0-100
  return Math.max(0, Math.min(100, Math.round(score)));
}
