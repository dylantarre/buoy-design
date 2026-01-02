/**
 * Graph Queries
 *
 * Query functions for analyzing the design system graph.
 * Enables questions like "Who introduced this drift?" and "What uses this token?"
 */

import type { Attributes } from 'graphology-types';
import type {
  EdgeType,
  NodeAttributes,
  EdgeAttributes,
  ImpactAnalysis,
  OwnershipInfo,
  UsageInfo,
} from './types.js';
import {
  type DesignSystemGraph,
  nodeId,
  getNodesByType,
  getOutEdgesByType,
  getInEdgesByType,
} from './builder.js';

// ============================================================================
// Token Queries
// ============================================================================

/**
 * Find all usages of a token across the codebase
 */
export function findTokenUsages(
  graph: DesignSystemGraph,
  tokenId: string
): UsageInfo {
  const tid = tokenId.startsWith('token:') ? tokenId : nodeId('Token', tokenId);

  if (!graph.hasNode(tid)) {
    return { usageCount: 0, usedIn: [] };
  }

  const usedIn: UsageInfo['usedIn'] = [];

  // Find all incoming USES edges
  graph.forEachInEdge(
    tid,
    (_edge: string, attrs: Attributes, source: string) => {
      const edgeAttrs = attrs as EdgeAttributes;
      if (edgeAttrs.type === 'USES') {
        const sourceAttrs = graph.getNodeAttributes(source) as NodeAttributes;
        const usageAttrs = attrs as { lineNumber?: number; usageType?: string };
        usedIn.push({
          file: sourceAttrs.name,
          line: usageAttrs.lineNumber,
          type: usageAttrs.usageType ?? 'unknown',
        });
      }
    }
  );

  return {
    usageCount: usedIn.length,
    usedIn,
  };
}

/**
 * Find tokens that are defined but never used
 */
export function findUnusedTokens(graph: DesignSystemGraph): string[] {
  return getNodesByType(graph, 'Token').filter((tid) => {
    const inEdges = getInEdgesByType(graph, tid, 'USES');
    return inEdges.length === 0;
  });
}

/**
 * Find tokens that drift from their W3C definition
 */
export function findDriftingTokens(
  graph: DesignSystemGraph
): Array<{ tokenId: string; expectedValue: string; actualValue: string }> {
  const drifting: Array<{
    tokenId: string;
    expectedValue: string;
    actualValue: string;
  }> = [];

  const driftEdges = graph.filterEdges(
    (_e: string, attrs: Attributes) => (attrs as EdgeAttributes).type === 'DRIFTS_FROM'
  );

  for (const edge of driftEdges) {
    const attrs = graph.getEdgeAttributes(edge) as {
      type: 'DRIFTS_FROM';
      expectedValue: string;
      actualValue: string;
    };
    const source = graph.source(edge);

    drifting.push({
      tokenId: source,
      expectedValue: attrs.expectedValue,
      actualValue: attrs.actualValue,
    });
  }

  return drifting;
}

// ============================================================================
// Component Queries
// ============================================================================

/**
 * Find all components that render a given component
 */
export function findComponentRenderers(
  graph: DesignSystemGraph,
  componentId: string
): string[] {
  const cid = componentId.startsWith('component:')
    ? componentId
    : nodeId('Component', componentId);

  if (!graph.hasNode(cid)) return [];

  const renderers: string[] = [];

  graph.forEachInEdge(
    cid,
    (_edge: string, attrs: Attributes, source: string) => {
      if ((attrs as EdgeAttributes).type === 'RENDERS') {
        renderers.push(source);
      }
    }
  );

  return renderers;
}

/**
 * Find components without test coverage
 */
export function findUntestedComponents(graph: DesignSystemGraph): string[] {
  return getNodesByType(graph, 'Component').filter((cid) => {
    const testEdges = getOutEdgesByType(graph, cid, 'TESTED_BY');
    return testEdges.length === 0;
  });
}

/**
 * Find components without Storybook documentation
 */
export function findUndocumentedComponents(graph: DesignSystemGraph): string[] {
  return getNodesByType(graph, 'Component').filter((cid) => {
    const storyEdges = getOutEdgesByType(graph, cid, 'DOCUMENTED_BY');
    return storyEdges.length === 0;
  });
}

// ============================================================================
// Impact Analysis
// ============================================================================

/**
 * Analyze the impact of changing a token or component
 */
export function analyzeImpact(
  graph: DesignSystemGraph,
  entityId: string,
  maxDepth = 3
): ImpactAnalysis {
  if (!graph.hasNode(entityId)) {
    return {
      directDependents: [],
      transitiveDependents: [],
      affectedFiles: [],
      affectedComponents: [],
      riskLevel: 'low',
    };
  }

  const directDependents: Set<string> = new Set();
  const transitiveDependents: Set<string> = new Set();
  const affectedFiles: Set<string> = new Set();
  const affectedComponents: Set<string> = new Set();

  // BFS traversal for dependents
  const visited = new Set<string>([entityId]);
  const queue: Array<{ node: string; depth: number }> = [
    { node: entityId, depth: 0 },
  ];

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    const { node, depth } = item;

    graph.forEachInEdge(
      node,
      (_edge: string, attrs: Attributes, source: string) => {
        // Only follow dependency edges
        const depEdges: EdgeType[] = ['USES', 'RENDERS', 'IMPORTS', 'EXTENDS'];
        if (!depEdges.includes((attrs as EdgeAttributes).type)) return;

        if (!visited.has(source)) {
          visited.add(source);

          if (depth === 0) {
            directDependents.add(source);
          } else {
            transitiveDependents.add(source);
          }

          const sourceAttrs = graph.getNodeAttributes(source) as NodeAttributes;
          if (sourceAttrs.type === 'File') {
            affectedFiles.add(source);
          } else if (sourceAttrs.type === 'Component') {
            affectedComponents.add(source);
          }

          if (depth < maxDepth) {
            queue.push({ node: source, depth: depth + 1 });
          }
        }
      }
    );
  }

  // Calculate risk level based on impact
  const totalAffected = directDependents.size + transitiveDependents.size;
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  if (totalAffected > 20) riskLevel = 'high';
  else if (totalAffected > 5) riskLevel = 'medium';

  return {
    directDependents: Array.from(directDependents),
    transitiveDependents: Array.from(transitiveDependents),
    affectedFiles: Array.from(affectedFiles),
    affectedComponents: Array.from(affectedComponents),
    riskLevel,
  };
}

// ============================================================================
// Ownership Queries
// ============================================================================

/**
 * Find who owns a file or component based on git history
 */
export function findOwnership(
  graph: DesignSystemGraph,
  entityId: string
): OwnershipInfo | null {
  if (!graph.hasNode(entityId)) return null;

  const contributors: Map<
    string,
    { name: string; commits: number; lastDate: Date }
  > = new Map();
  let lastModified = new Date(0);

  // Find commits that changed this entity
  graph.forEachInEdge(
    entityId,
    (_edge: string, attrs: Attributes, source: string) => {
      const edgeAttrs = attrs as EdgeAttributes;
      if (edgeAttrs.type === 'CHANGED' || edgeAttrs.type === 'ADDED') {
        const commitAttrs = graph.getNodeAttributes(source) as NodeAttributes;
        if (commitAttrs.type !== 'Commit') return;

        const commit = commitAttrs as {
          type: 'Commit';
          name: string;
          author: string;
          timestamp: Date;
        };

        // Track contributor
        const existing = contributors.get(commit.author);
        if (existing) {
          existing.commits++;
          if (commit.timestamp > existing.lastDate) {
            existing.lastDate = commit.timestamp;
          }
        } else {
          contributors.set(commit.author, {
            name: commit.author,
            commits: 1,
            lastDate: commit.timestamp,
          });
        }

        // Track last modified
        if (commit.timestamp > lastModified) {
          lastModified = commit.timestamp;
        }
      }
    }
  );

  if (contributors.size === 0) return null;

  // Sort by commit count
  const sorted = Array.from(contributors.values()).sort(
    (a, b) => b.commits - a.commits
  );

  const primary = sorted[0];
  if (!primary) return null;

  return {
    primaryAuthor: primary.name,
    contributors: sorted.map((c) => ({ name: c.name, commits: c.commits })),
    lastModified,
    totalCommits: sorted.reduce((sum, c) => sum + c.commits, 0),
  };
}

/**
 * Find who introduced a drift signal
 */
export function findDriftAuthor(
  graph: DesignSystemGraph,
  driftSignalId: string
): string | null {
  const did = driftSignalId.startsWith('driftsignal:')
    ? driftSignalId
    : nodeId('DriftSignal', driftSignalId);

  if (!graph.hasNode(did)) return null;

  // DriftSignal → AFFECTS → Entity → CHANGED ← Commit → AUTHORED ← Developer
  const affectedEntities: string[] = [];

  graph.forEachOutEdge(
    did,
    (_edge: string, attrs: Attributes, _source: string, target: string) => {
      if ((attrs as EdgeAttributes).type === 'AFFECTS') {
        affectedEntities.push(target);
      }
    }
  );

  for (const entity of affectedEntities) {
    // Find commits that changed this entity
    const changedEdges = getInEdgesByType(graph, entity, 'CHANGED');

    for (const edge of changedEdges) {
      const commitId = graph.source(edge);

      // Find developer who authored this commit
      const authoredEdges = getInEdgesByType(graph, commitId, 'AUTHORED');

      if (authoredEdges.length > 0) {
        return graph.source(authoredEdges[0]);
      }
    }
  }

  return null;
}

// ============================================================================
// Pattern Detection
// ============================================================================

/**
 * Find files that frequently have drift (repeat offenders)
 */
export function findRepeatOffenders(
  graph: DesignSystemGraph,
  threshold = 3
): Array<{ file: string; driftCount: number }> {
  const driftCounts: Map<string, number> = new Map();

  // Find all drift signals
  const driftNodes = getNodesByType(graph, 'DriftSignal');

  for (const drift of driftNodes) {
    // Find what this drift affects
    graph.forEachOutEdge(
      drift,
      (_edge: string, attrs: Attributes, _source: string, target: string) => {
        if ((attrs as EdgeAttributes).type === 'AFFECTS') {
          const targetAttrs = graph.getNodeAttributes(target) as NodeAttributes;
          if (targetAttrs.type === 'File') {
            driftCounts.set(target, (driftCounts.get(target) ?? 0) + 1);
          }
        }
      }
    );
  }

  // Filter by threshold and sort
  return Array.from(driftCounts.entries())
    .filter(([, count]) => count >= threshold)
    .map(([file, driftCount]) => ({ file, driftCount }))
    .sort((a, b) => b.driftCount - a.driftCount);
}

/**
 * Find deprecated tokens that are still being used
 */
export function findDeprecatedUsages(
  graph: DesignSystemGraph
): Array<{ token: string; usageCount: number; usedIn: string[] }> {
  const deprecated: Array<{
    token: string;
    usageCount: number;
    usedIn: string[];
  }> = [];

  const tokens = getNodesByType(graph, 'Token');

  for (const tid of tokens) {
    const attrs = graph.getNodeAttributes(tid) as NodeAttributes;

    // Check if token is deprecated (could be in metadata or name)
    const isDeprecated =
      attrs.name.includes('deprecated') ||
      attrs.name.startsWith('_') ||
      (attrs as NodeAttributes & { deprecated?: boolean }).deprecated === true;

    if (isDeprecated) {
      const usageInfo = findTokenUsages(graph, tid);

      if (usageInfo.usageCount > 0) {
        deprecated.push({
          token: tid,
          usageCount: usageInfo.usageCount,
          usedIn: usageInfo.usedIn.map((u) => u.file),
        });
      }
    }
  }

  return deprecated;
}

// ============================================================================
// PR Analysis
// ============================================================================

/**
 * Find drift signals in a specific PR
 */
export function findDriftInPR(
  graph: DesignSystemGraph,
  prId: string
): string[] {
  const pid = prId.startsWith('pr:') ? prId : nodeId('PR', prId);

  if (!graph.hasNode(pid)) return [];

  const driftSignals: string[] = [];

  graph.forEachInEdge(
    pid,
    (_edge: string, attrs: Attributes, source: string) => {
      if ((attrs as EdgeAttributes).type === 'FLAGGED_IN') {
        driftSignals.push(source);
      }
    }
  );

  return driftSignals;
}

/**
 * Find what files were changed in a PR
 */
export function findFilesChangedInPR(
  graph: DesignSystemGraph,
  prId: string
): string[] {
  const pid = prId.startsWith('pr:') ? prId : nodeId('PR', prId);

  if (!graph.hasNode(pid)) return [];

  const files: Set<string> = new Set();

  // PR → INCLUDES → Commit → CHANGED → File
  graph.forEachOutEdge(
    pid,
    (_edge: string, attrs: Attributes, _source: string, target: string) => {
      if ((attrs as EdgeAttributes).type === 'INCLUDES') {
        // This is a commit
        graph.forEachOutEdge(
          target,
          (_e2: string, a2: Attributes, _s2: string, t2: string) => {
            const edgeType = (a2 as EdgeAttributes).type;
            if (edgeType === 'CHANGED' || edgeType === 'ADDED') {
              files.add(t2);
            }
          }
        );
      }
    }
  );

  return Array.from(files);
}

// ============================================================================
// Coverage Queries
// ============================================================================

/**
 * Calculate design system coverage metrics
 */
export function calculateCoverage(graph: DesignSystemGraph): {
  tokenCoverage: number;
  componentCoverage: number;
  testCoverage: number;
  storyCoverage: number;
} {
  const tokens = getNodesByType(graph, 'Token');
  const components = getNodesByType(graph, 'Component');

  const usedTokens = tokens.filter((t) => {
    const inEdges = getInEdgesByType(graph, t, 'USES');
    return inEdges.length > 0;
  });

  const testedComponents = components.filter((c) => {
    const testEdges = getOutEdgesByType(graph, c, 'TESTED_BY');
    return testEdges.length > 0;
  });

  const documentedComponents = components.filter((c) => {
    const storyEdges = getOutEdgesByType(graph, c, 'DOCUMENTED_BY');
    return storyEdges.length > 0;
  });

  return {
    tokenCoverage: tokens.length > 0 ? usedTokens.length / tokens.length : 1,
    componentCoverage: 1, // All components are "covered" by definition
    testCoverage:
      components.length > 0 ? testedComponents.length / components.length : 1,
    storyCoverage:
      components.length > 0
        ? documentedComponents.length / components.length
        : 1,
  };
}
