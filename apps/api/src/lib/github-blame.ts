/**
 * GitHub Blame API
 *
 * Fetches git blame data to attribute drift signals to authors.
 * Uses GraphQL API for efficient blame lookups.
 */

import type { DriftSignal } from './scanner.js';

const GITHUB_GRAPHQL_API = 'https://api.github.com/graphql';

export interface BlameLine {
  lineNumber: number;
  author: string;
  commitSha: string;
}

export interface BlameResult {
  lines: Map<number, string>; // lineNumber → author name
}

interface BlameRange {
  startingLine: number;
  endingLine: number;
  commit: {
    oid: string;
    author: {
      name: string;
    };
  };
}

interface GraphQLBlameResponse {
  data?: {
    repository?: {
      object?: {
        blame?: {
          ranges: BlameRange[];
        };
      };
    };
  };
  errors?: Array<{ message: string }>;
}

/**
 * GraphQL query for file blame
 */
const BLAME_QUERY = `
query GetBlame($owner: String!, $repo: String!, $ref: String!, $path: String!) {
  repository(owner: $owner, name: $repo) {
    object(expression: $ref) {
      ... on Commit {
        blame(path: $path) {
          ranges {
            startingLine
            endingLine
            commit {
              oid
              author {
                name
              }
            }
          }
        }
      }
    }
  }
}
`;

/**
 * Fetch blame data for a file
 */
export async function getFileBlame(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  token: string
): Promise<BlameResult> {
  const response = await fetch(GITHUB_GRAPHQL_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Buoy-Design-Drift',
    },
    body: JSON.stringify({
      query: BLAME_QUERY,
      variables: { owner, repo, ref, path },
    }),
  });

  if (!response.ok) {
    console.warn(`Blame API failed for ${path}: ${response.status}`);
    return { lines: new Map() };
  }

  const result = (await response.json()) as GraphQLBlameResponse;

  if (result.errors) {
    console.warn(`Blame API errors for ${path}:`, result.errors);
    return { lines: new Map() };
  }

  const ranges = result.data?.repository?.object?.blame?.ranges ?? [];
  const lines = new Map<number, string>();

  // Expand ranges into line-by-line map
  for (const range of ranges) {
    const author = range.commit.author.name;
    for (let line = range.startingLine; line <= range.endingLine; line++) {
      lines.set(line, author);
    }
  }

  return { lines };
}

/**
 * Enrich drift signals with author information from git blame
 *
 * Only fetches blame for files that have signals (efficient).
 */
export async function enrichSignalsWithAuthors(
  signals: DriftSignal[],
  owner: string,
  repo: string,
  ref: string,
  token: string
): Promise<DriftSignal[]> {
  if (signals.length === 0) {
    return signals;
  }

  // Get unique files that have signals
  const filesWithSignals = [...new Set(signals.map((s) => s.file))];

  // Fetch blame for each file (could parallelize, but keeping simple for rate limits)
  const blameByFile = new Map<string, Map<number, string>>();

  for (const file of filesWithSignals) {
    try {
      const blame = await getFileBlame(owner, repo, file, ref, token);
      blameByFile.set(file, blame.lines);
    } catch (err) {
      console.warn(`Failed to get blame for ${file}:`, err);
      blameByFile.set(file, new Map());
    }
  }

  // Enrich each signal with author
  return signals.map((signal) => ({
    ...signal,
    author: blameByFile.get(signal.file)?.get(signal.line) ?? 'Unknown',
  }));
}
