import { describe, it, expect } from 'vitest';
import {
  generateAuditReport,
  calculateHealthScore,
  findCloseMatches,
  type AuditReport,
  type AuditValue,
} from './audit.js';

// Helper to create extracted values
function createValue(
  category: 'color' | 'spacing' | 'typography' | 'radius',
  value: string,
  file: string,
  line: number = 1
): AuditValue {
  return { category, value, file, line };
}

describe('generateAuditReport', () => {
  it('counts unique values by category', () => {
    const values: AuditValue[] = [
      createValue('color', '#3b82f6', 'src/Button.tsx'),
      createValue('color', '#3b82f6', 'src/Card.tsx'), // duplicate
      createValue('color', '#ef4444', 'src/Alert.tsx'),
      createValue('spacing', '16px', 'src/Button.tsx'),
      createValue('spacing', '8px', 'src/Card.tsx'),
    ];

    const report = generateAuditReport(values);

    expect(report.categories.color.uniqueCount).toBe(2);
    expect(report.categories.color.totalUsages).toBe(3);
    expect(report.categories.spacing.uniqueCount).toBe(2);
    expect(report.categories.spacing.totalUsages).toBe(2);
  });

  it('identifies most common values per category', () => {
    const values: AuditValue[] = [
      createValue('color', '#3b82f6', 'src/A.tsx'),
      createValue('color', '#3b82f6', 'src/B.tsx'),
      createValue('color', '#3b82f6', 'src/C.tsx'),
      createValue('color', '#ef4444', 'src/D.tsx'),
    ];

    const report = generateAuditReport(values);

    expect(report.categories.color.mostCommon[0]).toEqual({
      value: '#3b82f6',
      count: 3,
    });
  });

  it('identifies worst offender files', () => {
    const values: AuditValue[] = [
      createValue('color', '#111', 'src/Bad.tsx', 1),
      createValue('color', '#222', 'src/Bad.tsx', 2),
      createValue('color', '#333', 'src/Bad.tsx', 3),
      createValue('color', '#444', 'src/Good.tsx', 1),
    ];

    const report = generateAuditReport(values);

    expect(report.worstFiles[0]).toEqual({
      file: 'src/Bad.tsx',
      issueCount: 3,
    });
  });

  it('provides totals across all categories', () => {
    const values: AuditValue[] = [
      createValue('color', '#3b82f6', 'src/A.tsx'),
      createValue('color', '#ef4444', 'src/B.tsx'),
      createValue('spacing', '16px', 'src/C.tsx'),
    ];

    const report = generateAuditReport(values);

    expect(report.totals.uniqueValues).toBe(3);
    expect(report.totals.totalUsages).toBe(3);
    expect(report.totals.filesAffected).toBe(3);
  });

  it('handles empty input', () => {
    const report = generateAuditReport([]);

    expect(report.totals.uniqueValues).toBe(0);
    expect(report.totals.totalUsages).toBe(0);
    expect(report.score).toBe(100); // Perfect score with no issues
  });
});

describe('findCloseMatches', () => {
  it('finds colors that are close to design tokens', () => {
    const designTokens = ['#3b82f6', '#ef4444'];
    const foundValues = ['#3b83f6', '#3b82f6']; // First is typo

    const matches = findCloseMatches(foundValues, designTokens, 'color');

    expect(matches).toContainEqual({
      value: '#3b83f6',
      closeTo: '#3b82f6',
      distance: expect.any(Number),
    });
  });

  it('does not flag exact matches', () => {
    const designTokens = ['#3b82f6'];
    const foundValues = ['#3b82f6'];

    const matches = findCloseMatches(foundValues, designTokens, 'color');

    expect(matches).toHaveLength(0);
  });

  it('finds spacing values close to a scale', () => {
    const designTokens = ['4px', '8px', '16px', '24px', '32px'];
    const foundValues = ['15px', '17px', '8px'];

    const matches = findCloseMatches(foundValues, designTokens, 'spacing');

    expect(matches).toContainEqual({
      value: '15px',
      closeTo: '16px',
      distance: 1,
    });
    expect(matches).toContainEqual({
      value: '17px',
      closeTo: '16px',
      distance: 1,
    });
  });

  it('returns empty array when no close matches', () => {
    const designTokens = ['#3b82f6'];
    const foundValues = ['#000000']; // Very different

    const matches = findCloseMatches(foundValues, designTokens, 'color');

    expect(matches).toHaveLength(0);
  });
});

describe('calculateHealthScore', () => {
  it('returns 100 for no drift', () => {
    const report: AuditReport = {
      categories: {},
      worstFiles: [],
      totals: { uniqueValues: 0, totalUsages: 0, filesAffected: 0 },
      closeMatches: [],
      score: 0,
    };

    const score = calculateHealthScore(report);

    expect(score).toBe(100);
  });

  it('decreases score based on unique value count', () => {
    const report: AuditReport = {
      categories: {
        color: {
          uniqueCount: 50, // Way too many colors
          totalUsages: 100,
          mostCommon: [],
        },
      },
      worstFiles: [],
      totals: { uniqueValues: 50, totalUsages: 100, filesAffected: 20 },
      closeMatches: [],
      score: 0,
    };

    const score = calculateHealthScore(report);

    expect(score).toBeLessThan(50);
  });

  it('penalizes close matches (likely typos)', () => {
    const report: AuditReport = {
      categories: {
        color: { uniqueCount: 10, totalUsages: 20, mostCommon: [] },
      },
      worstFiles: [],
      totals: { uniqueValues: 10, totalUsages: 20, filesAffected: 5 },
      closeMatches: [
        { value: '#3b83f6', closeTo: '#3b82f6', distance: 1 },
        { value: '#3b84f6', closeTo: '#3b82f6', distance: 2 },
      ],
      score: 0,
    };

    const score = calculateHealthScore(report);

    expect(score).toBeLessThan(90); // Penalized for typos
  });

  it('returns score between 0 and 100', () => {
    const report: AuditReport = {
      categories: {
        color: { uniqueCount: 100, totalUsages: 500, mostCommon: [] },
        spacing: { uniqueCount: 50, totalUsages: 200, mostCommon: [] },
      },
      worstFiles: [{ file: 'bad.tsx', issueCount: 100 }],
      totals: { uniqueValues: 150, totalUsages: 700, filesAffected: 50 },
      closeMatches: Array(20).fill({ value: 'x', closeTo: 'y', distance: 1 }),
      score: 0,
    };

    const score = calculateHealthScore(report);

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
