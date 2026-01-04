/**
 * Tests for GitHub Blame API
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getFileBlame,
  enrichSignalsWithAuthors,
  type BlameResult,
} from '../src/lib/github-blame.js';
import type { DriftSignal } from '../src/lib/scanner.js';

describe('getFileBlame', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches blame via GraphQL API', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          repository: {
            object: {
              blame: {
                ranges: [
                  {
                    startingLine: 1,
                    endingLine: 5,
                    commit: {
                      oid: 'abc123',
                      author: {
                        name: 'Alice',
                      },
                    },
                  },
                  {
                    startingLine: 6,
                    endingLine: 10,
                    commit: {
                      oid: 'def456',
                      author: {
                        name: 'Bob',
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    await getFileBlame('owner', 'repo', 'src/Button.tsx', 'main', 'token');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/graphql',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token',
          'Content-Type': 'application/json',
          'User-Agent': 'Buoy-Design-Drift',
        }),
      })
    );

    const body = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body || '{}');
    expect(body.variables).toEqual({
      owner: 'owner',
      repo: 'repo',
      ref: 'main',
      path: 'src/Button.tsx',
    });
  });

  it('returns line-by-line author mapping', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          repository: {
            object: {
              blame: {
                ranges: [
                  {
                    startingLine: 1,
                    endingLine: 3,
                    commit: {
                      oid: 'abc123',
                      author: { name: 'Alice' },
                    },
                  },
                  {
                    startingLine: 4,
                    endingLine: 6,
                    commit: {
                      oid: 'def456',
                      author: { name: 'Bob' },
                    },
                  },
                ],
              },
            },
          },
        },
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const result: BlameResult = await getFileBlame('owner', 'repo', 'file.tsx', 'main', 'token');

    expect(result.lines.get(1)).toBe('Alice');
    expect(result.lines.get(2)).toBe('Alice');
    expect(result.lines.get(3)).toBe('Alice');
    expect(result.lines.get(4)).toBe('Bob');
    expect(result.lines.get(5)).toBe('Bob');
    expect(result.lines.get(6)).toBe('Bob');
  });

  it('handles empty ranges', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          repository: {
            object: {
              blame: {
                ranges: [],
              },
            },
          },
        },
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const result = await getFileBlame('owner', 'repo', 'file.tsx', 'main', 'token');

    expect(result.lines.size).toBe(0);
  });

  it('handles API errors gracefully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    vi.stubGlobal('fetch', mockFetch);

    const result = await getFileBlame('owner', 'repo', 'file.tsx', 'main', 'token');

    expect(result.lines.size).toBe(0);
  });

  it('handles GraphQL errors gracefully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        errors: [
          { message: 'File not found' },
        ],
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const result = await getFileBlame('owner', 'repo', 'missing.tsx', 'main', 'token');

    expect(result.lines.size).toBe(0);
  });

  it('handles missing blame data gracefully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          repository: null,
        },
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const result = await getFileBlame('owner', 'repo', 'file.tsx', 'main', 'token');

    expect(result.lines.size).toBe(0);
  });
});

describe('enrichSignalsWithAuthors', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('enriches signals with author information', async () => {
    const signals: DriftSignal[] = [
      {
        type: 'hardcoded-color',
        severity: 'warning',
        file: 'Button.tsx',
        line: 10,
        value: '#fff',
        message: 'Color 1',
      },
      {
        type: 'hardcoded-color',
        severity: 'warning',
        file: 'Button.tsx',
        line: 20,
        value: '#000',
        message: 'Color 2',
      },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          repository: {
            object: {
              blame: {
                ranges: [
                  {
                    startingLine: 1,
                    endingLine: 15,
                    commit: {
                      oid: 'abc123',
                      author: { name: 'Alice' },
                    },
                  },
                  {
                    startingLine: 16,
                    endingLine: 30,
                    commit: {
                      oid: 'def456',
                      author: { name: 'Bob' },
                    },
                  },
                ],
              },
            },
          },
        },
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const enriched = await enrichSignalsWithAuthors(signals, 'owner', 'repo', 'main', 'token');

    expect(enriched).toHaveLength(2);
    expect(enriched[0]?.author).toBe('Alice'); // Line 10
    expect(enriched[1]?.author).toBe('Bob');   // Line 20
  });

  it('fetches blame for each unique file', async () => {
    const signals: DriftSignal[] = [
      {
        type: 'hardcoded-color',
        severity: 'warning',
        file: 'Button.tsx',
        line: 10,
        value: '#fff',
        message: 'Color 1',
      },
      {
        type: 'hardcoded-color',
        severity: 'warning',
        file: 'Card.tsx',
        line: 5,
        value: '#000',
        message: 'Color 2',
      },
      {
        type: 'hardcoded-color',
        severity: 'warning',
        file: 'Button.tsx',
        line: 20,
        value: '#333',
        message: 'Color 3',
      },
    ];

    const mockFetch = vi.fn().mockImplementation(async (url, options) => {
      const body = JSON.parse(options.body);
      const path = body.variables.path;

      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            repository: {
              object: {
                blame: {
                  ranges: [
                    {
                      startingLine: 1,
                      endingLine: 100,
                      commit: {
                        oid: 'abc123',
                        author: { name: path === 'Button.tsx' ? 'Alice' : 'Bob' },
                      },
                    },
                  ],
                },
              },
            },
          },
        }),
      };
    });

    vi.stubGlobal('fetch', mockFetch);

    const enriched = await enrichSignalsWithAuthors(signals, 'owner', 'repo', 'main', 'token');

    // Should fetch blame for 2 unique files (Button.tsx and Card.tsx)
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(enriched[0]?.author).toBe('Alice'); // Button.tsx
    expect(enriched[1]?.author).toBe('Bob');   // Card.tsx
    expect(enriched[2]?.author).toBe('Alice'); // Button.tsx again
  });

  it('uses "Unknown" author when blame fails', async () => {
    const signals: DriftSignal[] = [
      {
        type: 'hardcoded-color',
        severity: 'warning',
        file: 'Button.tsx',
        line: 10,
        value: '#fff',
        message: 'Color',
      },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    vi.stubGlobal('fetch', mockFetch);

    const enriched = await enrichSignalsWithAuthors(signals, 'owner', 'repo', 'main', 'token');

    expect(enriched[0]?.author).toBe('Unknown');
  });

  it('uses "Unknown" author when line not in blame data', async () => {
    const signals: DriftSignal[] = [
      {
        type: 'hardcoded-color',
        severity: 'warning',
        file: 'Button.tsx',
        line: 100, // Line not in blame ranges
        value: '#fff',
        message: 'Color',
      },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          repository: {
            object: {
              blame: {
                ranges: [
                  {
                    startingLine: 1,
                    endingLine: 50,
                    commit: {
                      oid: 'abc123',
                      author: { name: 'Alice' },
                    },
                  },
                ],
              },
            },
          },
        },
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const enriched = await enrichSignalsWithAuthors(signals, 'owner', 'repo', 'main', 'token');

    expect(enriched[0]?.author).toBe('Unknown');
  });

  it('returns empty array for empty signals', async () => {
    const enriched = await enrichSignalsWithAuthors([], 'owner', 'repo', 'main', 'token');

    expect(enriched).toHaveLength(0);
  });

  it('preserves all original signal properties', async () => {
    const signals: DriftSignal[] = [
      {
        type: 'hardcoded-color',
        severity: 'warning',
        file: 'Button.tsx',
        line: 10,
        column: 15,
        value: '#fff',
        message: 'Hardcoded color',
        suggestion: 'Use a token',
        componentName: 'Button',
      },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          repository: {
            object: {
              blame: {
                ranges: [
                  {
                    startingLine: 1,
                    endingLine: 100,
                    commit: {
                      oid: 'abc123',
                      author: { name: 'Alice' },
                    },
                  },
                ],
              },
            },
          },
        },
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const enriched = await enrichSignalsWithAuthors(signals, 'owner', 'repo', 'main', 'token');

    expect(enriched[0]).toEqual({
      type: 'hardcoded-color',
      severity: 'warning',
      file: 'Button.tsx',
      line: 10,
      column: 15,
      value: '#fff',
      message: 'Hardcoded color',
      suggestion: 'Use a token',
      componentName: 'Button',
      author: 'Alice',
    });
  });
});
