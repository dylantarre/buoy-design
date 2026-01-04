/**
 * Tests for PR comment formatting
 */

import { describe, it, expect } from 'vitest';
import {
  formatPRComment,
  formatCommentWithMarker,
  isBuoyComment,
  BUOY_COMMENT_MARKER,
  type CommentData,
} from '../src/lib/pr-comment.js';
import type { DriftSignal } from '../src/lib/scanner.js';

describe('formatPRComment', () => {
  describe('no drift detected', () => {
    it('shows success message when no signals', () => {
      const data: CommentData = {
        signals: [],
        baselineCount: 0,
      };

      const comment = formatPRComment(data);

      expect(comment).toContain('No new design drift detected');
      expect(comment).toContain(':white_check_mark:');
      expect(comment).toContain('Buoy Design Drift Report');
    });

    it('includes footer with link', () => {
      const data: CommentData = {
        signals: [],
        baselineCount: 0,
      };

      const comment = formatPRComment(data);

      expect(comment).toContain('Buoy');
      expect(comment).toContain('https://buoy.design');
      expect(comment).toContain('https://app.buoy.design/settings');
    });
  });

  describe('new drift detected', () => {
    it('shows count of new issues', () => {
      const signals: DriftSignal[] = [
        {
          type: 'hardcoded-color',
          severity: 'warning',
          file: 'Button.tsx',
          line: 10,
          value: '#3b82f6',
          message: 'Hardcoded color #3b82f6',
          author: 'Alice',
        },
        {
          type: 'arbitrary-tailwind',
          severity: 'info',
          file: 'Card.tsx',
          line: 20,
          value: 'p-[17px]',
          message: 'Arbitrary spacing',
          author: 'Bob',
        },
      ];

      const data: CommentData = { signals, baselineCount: 0 };
      const comment = formatPRComment(data);

      expect(comment).toContain('2 new issues');
    });

    it('uses singular for one issue', () => {
      const signals: DriftSignal[] = [
        {
          type: 'hardcoded-color',
          severity: 'warning',
          file: 'Button.tsx',
          line: 10,
          value: '#fff',
          message: 'Hardcoded color',
          author: 'Alice',
        },
      ];

      const data: CommentData = { signals, baselineCount: 0 };
      const comment = formatPRComment(data);

      expect(comment).toContain('1 new issue');
      expect(comment).not.toContain('1 new issues');
    });

    it('groups signals by author', () => {
      const signals: DriftSignal[] = [
        {
          type: 'hardcoded-color',
          severity: 'warning',
          file: 'Button.tsx',
          line: 10,
          value: '#fff',
          message: 'Color 1',
          author: 'Alice',
        },
        {
          type: 'hardcoded-color',
          severity: 'warning',
          file: 'Card.tsx',
          line: 20,
          value: '#000',
          message: 'Color 2',
          author: 'Alice',
        },
        {
          type: 'inline-style',
          severity: 'warning',
          file: 'Modal.tsx',
          line: 30,
          value: 'style={{ ... }}',
          message: 'Inline style',
          author: 'Bob',
        },
      ];

      const data: CommentData = { signals, baselineCount: 0 };
      const comment = formatPRComment(data);

      expect(comment).toContain('### Alice (2 issues)');
      expect(comment).toContain('### Bob (1 issue)');
    });

    it('sorts authors by issue count (most first)', () => {
      const signals: DriftSignal[] = [
        { type: 'hardcoded-color', severity: 'warning', file: 'A.tsx', line: 1, value: '#fff', message: 'A', author: 'Alice' },
        { type: 'hardcoded-color', severity: 'warning', file: 'B.tsx', line: 2, value: '#000', message: 'B', author: 'Bob' },
        { type: 'hardcoded-color', severity: 'warning', file: 'C.tsx', line: 3, value: '#333', message: 'C', author: 'Bob' },
        { type: 'hardcoded-color', severity: 'warning', file: 'D.tsx', line: 4, value: '#666', message: 'D', author: 'Bob' },
      ];

      const data: CommentData = { signals, baselineCount: 0 };
      const comment = formatPRComment(data);

      const bobIndex = comment.indexOf('### Bob (3 issues)');
      const aliceIndex = comment.indexOf('### Alice (1 issue)');

      expect(bobIndex).toBeGreaterThan(-1);
      expect(aliceIndex).toBeGreaterThan(-1);
      expect(bobIndex).toBeLessThan(aliceIndex); // Bob comes first
    });

    it('sorts signals by severity (error, warning, info)', () => {
      const signals: DriftSignal[] = [
        { type: 'arbitrary-tailwind', severity: 'info', file: 'A.tsx', line: 1, value: 'p-[17px]', message: 'Info', author: 'Alice' },
        { type: 'inline-style', severity: 'warning', file: 'B.tsx', line: 2, value: 'style={{}}', message: 'Warning', author: 'Alice' },
        { type: 'hardcoded-color', severity: 'error', file: 'C.tsx', line: 3, value: '#fff', message: 'Error', author: 'Alice' },
      ];

      const data: CommentData = { signals, baselineCount: 0 };
      const comment = formatPRComment(data);

      // Extract table rows to check order
      const errorIndex = comment.indexOf('| :x:');
      const warningIndex = comment.indexOf('| :warning:');
      const infoIndex = comment.indexOf('| :information_source:');

      expect(errorIndex).toBeLessThan(warningIndex);
      expect(warningIndex).toBeLessThan(infoIndex);
    });

    it('includes file, line, and message in table', () => {
      const signals: DriftSignal[] = [
        {
          type: 'hardcoded-color',
          severity: 'warning',
          file: 'Button.tsx',
          line: 42,
          value: '#3b82f6',
          message: 'Hardcoded color #3b82f6',
          author: 'Alice',
        },
      ];

      const data: CommentData = { signals, baselineCount: 0 };
      const comment = formatPRComment(data);

      expect(comment).toContain('`Button.tsx`');
      expect(comment).toContain('42');
      expect(comment).toContain('Hardcoded color #3b82f6');
    });

    it('includes suggestion when present', () => {
      const signals: DriftSignal[] = [
        {
          type: 'hardcoded-color',
          severity: 'warning',
          file: 'Button.tsx',
          line: 10,
          value: '#fff',
          message: 'Hardcoded color',
          suggestion: 'Use a design token',
          author: 'Alice',
        },
      ];

      const data: CommentData = { signals, baselineCount: 0 };
      const comment = formatPRComment(data);

      expect(comment).toContain('Use a design token');
    });

    it('truncates author signal list at 15 items', () => {
      const signals: DriftSignal[] = Array.from({ length: 20 }, (_, i) => ({
        type: 'hardcoded-color' as const,
        severity: 'warning' as const,
        file: `File${i}.tsx`,
        line: i,
        value: '#fff',
        message: `Issue ${i}`,
        author: 'Alice',
      }));

      const data: CommentData = { signals, baselineCount: 0 };
      const comment = formatPRComment(data);

      expect(comment).toContain('...and 5 more');
    });

    it('handles signals without author', () => {
      const signals: DriftSignal[] = [
        {
          type: 'hardcoded-color',
          severity: 'warning',
          file: 'Button.tsx',
          line: 10,
          value: '#fff',
          message: 'Color',
          // No author field
        },
      ];

      const data: CommentData = { signals, baselineCount: 0 };
      const comment = formatPRComment(data);

      expect(comment).toContain('### Unknown (1 issue)');
    });
  });

  describe('diff from previous push', () => {
    it('shows remaining and fixed counts', () => {
      const previousSignals: DriftSignal[] = [
        { type: 'hardcoded-color', severity: 'warning', file: 'A.tsx', line: 1, value: '#fff', message: 'A', author: 'Alice' },
        { type: 'hardcoded-color', severity: 'warning', file: 'B.tsx', line: 2, value: '#000', message: 'B', author: 'Alice' },
        { type: 'hardcoded-color', severity: 'warning', file: 'C.tsx', line: 3, value: '#333', message: 'C', author: 'Alice' },
      ];

      const signals: DriftSignal[] = [
        { type: 'hardcoded-color', severity: 'warning', file: 'A.tsx', line: 1, value: '#fff', message: 'A', author: 'Alice' },
      ];

      const data: CommentData = { signals, previousSignals, baselineCount: 0 };
      const comment = formatPRComment(data);

      expect(comment).toContain('1 issue remaining');
      expect(comment).toContain('2 fixed since last push');
    });

    it('shows fixed items section', () => {
      const previousSignals: DriftSignal[] = [
        { type: 'hardcoded-color', severity: 'warning', file: 'Fixed.tsx', line: 10, value: '#fff', message: 'Fixed issue', author: 'Alice' },
        { type: 'hardcoded-color', severity: 'warning', file: 'Remaining.tsx', line: 20, value: '#000', message: 'Remaining', author: 'Alice' },
      ];

      const signals: DriftSignal[] = [
        { type: 'hardcoded-color', severity: 'warning', file: 'Remaining.tsx', line: 20, value: '#000', message: 'Remaining', author: 'Alice' },
      ];

      const data: CommentData = { signals, previousSignals, baselineCount: 0 };
      const comment = formatPRComment(data);

      expect(comment).toContain('### :white_check_mark: Fixed');
      expect(comment).toContain('~~`Fixed.tsx:10`~~');
      expect(comment).toContain('Fixed issue');
    });

    it('truncates fixed items at 5', () => {
      const previousSignals: DriftSignal[] = Array.from({ length: 10 }, (_, i) => ({
        type: 'hardcoded-color' as const,
        severity: 'warning' as const,
        file: `Fixed${i}.tsx`,
        line: i,
        value: '#fff',
        message: `Fixed ${i}`,
        author: 'Alice',
      }));

      // Keep one signal remaining so we show the diff section
      const signals: DriftSignal[] = [previousSignals[0]!];

      const data: CommentData = { signals, previousSignals, baselineCount: 0 };
      const comment = formatPRComment(data);

      expect(comment).toContain('...and 4 more');
    });
  });

  describe('truncation notice', () => {
    it('shows truncation message when truncated', () => {
      const data: CommentData = {
        signals: [],
        baselineCount: 0,
        truncated: true,
        scannedCount: 20,
        totalCount: 50,
      };

      const comment = formatPRComment(data);

      expect(comment).toContain('Scanned 20 of 50 changed files');
      expect(comment).toContain('rate limited');
    });

    it('does not show truncation when not truncated', () => {
      const data: CommentData = {
        signals: [],
        baselineCount: 0,
        truncated: false,
        scannedCount: 10,
        totalCount: 10,
      };

      const comment = formatPRComment(data);

      expect(comment).not.toContain('Scanned');
      expect(comment).not.toContain('rate limited');
    });
  });

  describe('baseline section', () => {
    it('shows baseline count when present', () => {
      const data: CommentData = {
        signals: [],
        baselineCount: 42,
      };

      const comment = formatPRComment(data);

      expect(comment).toContain('Baseline: 42 pre-existing issues');
      expect(comment).toContain('<details>');
      expect(comment).toContain('buoy baseline reset');
    });

    it('uses singular for one baseline issue', () => {
      const data: CommentData = {
        signals: [],
        baselineCount: 1,
      };

      const comment = formatPRComment(data);

      expect(comment).toContain('Baseline: 1 pre-existing issue');
      expect(comment).not.toContain('1 pre-existing issues');
    });

    it('does not show baseline section when zero', () => {
      const data: CommentData = {
        signals: [],
        baselineCount: 0,
      };

      const comment = formatPRComment(data);

      expect(comment).not.toContain('Baseline:');
      expect(comment).not.toContain('pre-existing');
    });
  });

  describe('deferred scan', () => {
    it('formats deferred message with reset time', () => {
      const resetAt = new Date('2025-01-04T15:30:00Z');

      const data: CommentData = {
        signals: [],
        baselineCount: 0,
        deferred: true,
        deferredResetAt: resetAt,
      };

      const comment = formatPRComment(data);

      expect(comment).toContain('Scan deferred');
      expect(comment).toContain('rate limit reached');
      expect(comment).toContain('Will scan automatically after');
    });

    it('does not show normal content when deferred', () => {
      const resetAt = new Date('2025-01-04T15:30:00Z');

      const signals: DriftSignal[] = [
        { type: 'hardcoded-color', severity: 'warning', file: 'A.tsx', line: 1, value: '#fff', message: 'A', author: 'Alice' },
      ];

      const data: CommentData = {
        signals,
        baselineCount: 10,
        deferred: true,
        deferredResetAt: resetAt,
      };

      const comment = formatPRComment(data);

      expect(comment).toContain('Scan deferred');
      expect(comment).not.toContain('new issues');
      expect(comment).not.toContain('Baseline:');
    });
  });

  describe('severity icons', () => {
    it('shows error icon for error severity', () => {
      const signals: DriftSignal[] = [
        { type: 'hardcoded-color', severity: 'error', file: 'A.tsx', line: 1, value: '#fff', message: 'Error', author: 'Alice' },
      ];

      const data: CommentData = { signals, baselineCount: 0 };
      const comment = formatPRComment(data);

      expect(comment).toContain(':x:');
    });

    it('shows warning icon for warning severity', () => {
      const signals: DriftSignal[] = [
        { type: 'hardcoded-color', severity: 'warning', file: 'A.tsx', line: 1, value: '#fff', message: 'Warning', author: 'Alice' },
      ];

      const data: CommentData = { signals, baselineCount: 0 };
      const comment = formatPRComment(data);

      expect(comment).toContain(':warning:');
    });

    it('shows info icon for info severity', () => {
      const signals: DriftSignal[] = [
        { type: 'arbitrary-tailwind', severity: 'info', file: 'A.tsx', line: 1, value: 'p-[17px]', message: 'Info', author: 'Alice' },
      ];

      const data: CommentData = { signals, baselineCount: 0 };
      const comment = formatPRComment(data);

      expect(comment).toContain(':information_source:');
    });
  });
});

describe('formatCommentWithMarker', () => {
  it('prepends marker to formatted comment', () => {
    const data: CommentData = {
      signals: [],
      baselineCount: 0,
    };

    const comment = formatCommentWithMarker(data);

    expect(comment.startsWith(BUOY_COMMENT_MARKER)).toBe(true);
    expect(comment).toContain('Buoy Design Drift Report');
  });

  it('marker is on first line', () => {
    const data: CommentData = {
      signals: [],
      baselineCount: 0,
    };

    const comment = formatCommentWithMarker(data);
    const firstLine = comment.split('\n')[0];

    expect(firstLine).toBe(BUOY_COMMENT_MARKER);
  });
});

describe('isBuoyComment', () => {
  it('detects comment with marker', () => {
    const comment = `${BUOY_COMMENT_MARKER}\n## Buoy Design Drift Report`;

    expect(isBuoyComment(comment)).toBe(true);
  });

  it('detects comment with heading (fallback)', () => {
    const comment = `## :ring_buoy: Buoy Design Drift Report\n\nSome content`;

    expect(isBuoyComment(comment)).toBe(true);
  });

  it('rejects non-buoy comment', () => {
    const comment = `## Some Other Comment\n\nNot from Buoy`;

    expect(isBuoyComment(comment)).toBe(false);
  });

  it('rejects empty comment', () => {
    expect(isBuoyComment('')).toBe(false);
  });
});
