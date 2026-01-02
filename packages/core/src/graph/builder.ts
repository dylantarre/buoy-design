/**
 * Graph Builder
 *
 * Constructs the design system knowledge graph from SQLite data.
 * Uses graphology for in-memory graph operations.
 */

import GraphConstructor from 'graphology';
import type { Attributes, AbstractGraph } from 'graphology-types';
import type {
  NodeType,
  EdgeType,
  NodeAttributes,
  EdgeAttributes,
  GraphBuildOptions,
  GraphStats,
} from './types.js';

// Type alias for our graph - using AbstractGraph from graphology-types
export type DesignSystemGraph = AbstractGraph<NodeAttributes, EdgeAttributes>;

// Cast constructor for use
const Graph = GraphConstructor as unknown as new <N extends Attributes, E extends Attributes>(
  options?: { multi?: boolean; type?: string; allowSelfLoops?: boolean }
) => AbstractGraph<N, E>;

// ============================================================================
// Graph Creation
// ============================================================================

/**
 * Create an empty directed multigraph for the design system
 */
export function createGraph(): DesignSystemGraph {
  return new Graph<NodeAttributes, EdgeAttributes>({
    multi: true,
    type: 'directed',
    allowSelfLoops: false,
  });
}

/**
 * Generate a unique node ID
 */
export function nodeId(type: NodeType, id: string): string {
  return `${type.toLowerCase()}:${id}`;
}

/**
 * Generate a unique edge ID
 */
export function edgeId(type: EdgeType, sourceId: string, targetId: string): string {
  return `${type.toLowerCase()}:${sourceId}:${targetId}`;
}

// ============================================================================
// Node Operations
// ============================================================================

/**
 * Add a node to the graph if it doesn't exist
 */
export function addNode(
  graph: DesignSystemGraph,
  type: NodeType,
  id: string,
  attributes: Omit<NodeAttributes, 'type'>
): string {
  const nid = nodeId(type, id);

  if (!graph.hasNode(nid)) {
    graph.addNode(nid, {
      ...attributes,
      type,
    } as NodeAttributes);
  }

  return nid;
}

/**
 * Update node attributes
 */
export function updateNode(
  graph: DesignSystemGraph,
  nid: string,
  attributes: Partial<NodeAttributes>
): void {
  if (graph.hasNode(nid)) {
    graph.mergeNodeAttributes(nid, attributes);
  }
}

/**
 * Get all nodes of a specific type
 */
export function getNodesByType(
  graph: DesignSystemGraph,
  type: NodeType
): string[] {
  return graph.filterNodes(
    (_node: string, attrs: Attributes) => (attrs as NodeAttributes).type === type
  );
}

// ============================================================================
// Edge Operations
// ============================================================================

/**
 * Add an edge to the graph
 */
export function addEdge(
  graph: DesignSystemGraph,
  type: EdgeType,
  sourceId: string,
  targetId: string,
  attributes?: Omit<EdgeAttributes, 'type'>
): string | null {
  // Ensure both nodes exist
  if (!graph.hasNode(sourceId) || !graph.hasNode(targetId)) {
    return null;
  }

  const eid = edgeId(type, sourceId, targetId);

  // Check if edge already exists
  if (!graph.hasEdge(eid)) {
    graph.addEdgeWithKey(eid, sourceId, targetId, {
      ...attributes,
      type,
      createdAt: attributes?.createdAt ?? new Date(),
    } as EdgeAttributes);
  }

  return eid;
}

/**
 * Get all edges of a specific type
 */
export function getEdgesByType(
  graph: DesignSystemGraph,
  type: EdgeType
): string[] {
  return graph.filterEdges(
    (_edge: string, attrs: Attributes) => (attrs as EdgeAttributes).type === type
  );
}

/**
 * Get all outgoing edges of a specific type from a node
 */
export function getOutEdgesByType(
  graph: DesignSystemGraph,
  nid: string,
  type: EdgeType
): string[] {
  if (!graph.hasNode(nid)) return [];

  return graph.filterOutEdges(
    nid,
    (_edge: string, attrs: Attributes) => (attrs as EdgeAttributes).type === type
  );
}

/**
 * Get all incoming edges of a specific type to a node
 */
export function getInEdgesByType(
  graph: DesignSystemGraph,
  nid: string,
  type: EdgeType
): string[] {
  if (!graph.hasNode(nid)) return [];

  return graph.filterInEdges(
    nid,
    (_edge: string, attrs: Attributes) => (attrs as EdgeAttributes).type === type
  );
}

// ============================================================================
// Graph Stats
// ============================================================================

/**
 * Get statistics about the graph
 */
export function getGraphStats(graph: DesignSystemGraph): GraphStats {
  const nodesByType: Partial<Record<NodeType, number>> = {};
  const edgesByType: Partial<Record<EdgeType, number>> = {};

  graph.forEachNode((_node: string, attrs: Attributes) => {
    const nodeType = (attrs as NodeAttributes).type;
    nodesByType[nodeType] = (nodesByType[nodeType] ?? 0) + 1;
  });

  graph.forEachEdge((_edge: string, attrs: Attributes) => {
    const edgeType = (attrs as EdgeAttributes).type;
    edgesByType[edgeType] = (edgesByType[edgeType] ?? 0) + 1;
  });

  return {
    nodeCount: graph.order,
    edgeCount: graph.size,
    nodesByType: nodesByType as Record<NodeType, number>,
    edgesByType: edgesByType as Record<EdgeType, number>,
  };
}

// ============================================================================
// Serialization
// ============================================================================

/**
 * Export graph to JSON format
 */
export function exportToJSON(graph: DesignSystemGraph): object {
  return graph.export();
}

/**
 * Import graph from JSON format
 */
export function importFromJSON(
  data: ReturnType<DesignSystemGraph['export']>
): DesignSystemGraph {
  const graph = createGraph();
  graph.import(data);
  return graph;
}

/**
 * Export graph to DOT format for visualization
 */
export function exportToDOT(graph: DesignSystemGraph): string {
  const lines: string[] = ['digraph DesignSystem {'];
  lines.push('  rankdir=LR;');
  lines.push('  node [shape=box];');
  lines.push('');

  // Define node styles by type
  const nodeStyles: Partial<Record<NodeType, string>> = {
    Token: 'style=filled,fillcolor="#e3f2fd"',
    Component: 'style=filled,fillcolor="#e8f5e9"',
    File: 'style=filled,fillcolor="#fff3e0"',
    Commit: 'style=filled,fillcolor="#fce4ec"',
    Developer: 'style=filled,fillcolor="#f3e5f5"',
    DriftSignal: 'style=filled,fillcolor="#ffebee"',
  };

  // Add nodes
  graph.forEachNode((node: string, attrs: Attributes) => {
    const nodeAttrs = attrs as NodeAttributes;
    const style = nodeStyles[nodeAttrs.type] ?? '';
    const label = nodeAttrs.name.replace(/"/g, '\\"');
    lines.push(`  "${node}" [label="${label}" ${style}];`);
  });

  lines.push('');

  // Add edges
  graph.forEachEdge(
    (_edge: string, attrs: Attributes, source: string, target: string) => {
      const edgeAttrs = attrs as EdgeAttributes;
      const label = edgeAttrs.type;
      lines.push(`  "${source}" -> "${target}" [label="${label}"];`);
    }
  );

  lines.push('}');
  return lines.join('\n');
}

/**
 * Export graph to Cytoscape format for web visualization
 */
export function exportToCytoscape(graph: DesignSystemGraph): object {
  const elements: Array<{ data: object; group: 'nodes' | 'edges' }> = [];

  graph.forEachNode((node: string, attrs: Attributes) => {
    elements.push({
      group: 'nodes',
      data: {
        id: node,
        ...attrs,
      },
    });
  });

  graph.forEachEdge(
    (_edge: string, attrs: Attributes, source: string, target: string) => {
      elements.push({
        group: 'edges',
        data: {
          id: _edge,
          source,
          target,
          ...attrs,
        },
      });
    }
  );

  return { elements };
}

// ============================================================================
// Graph Builder Class
// ============================================================================

/**
 * Builder class for constructing the graph incrementally
 */
export class GraphBuilder {
  private graph: DesignSystemGraph;
  public readonly projectId: string;

  constructor(options: GraphBuildOptions) {
    this.graph = createGraph();
    this.projectId = options.projectId;
  }

  /**
   * Add a token node
   */
  addToken(
    id: string,
    name: string,
    category: string,
    value: string,
    source: string,
    isW3C = false
  ): string {
    return addNode(this.graph, 'Token', id, {
      name,
      category,
      value,
      source,
      isW3C,
    } as Omit<NodeAttributes, 'type'>);
  }

  /**
   * Add a component node
   */
  addComponent(
    id: string,
    name: string,
    filePath: string,
    framework: string,
    props?: string[],
    variants?: string[]
  ): string {
    return addNode(this.graph, 'Component', id, {
      name,
      filePath,
      framework,
      props,
      variants,
    } as Omit<NodeAttributes, 'type'>);
  }

  /**
   * Add a file node
   */
  addFile(id: string, path: string, lineCount?: number): string {
    const extension = path.split('.').pop() ?? '';
    const name = path.split('/').pop() ?? path;

    return addNode(this.graph, 'File', id, {
      name,
      path,
      extension,
      lineCount,
    } as Omit<NodeAttributes, 'type'>);
  }

  /**
   * Add a commit node
   */
  addCommit(
    sha: string,
    message: string,
    author: string,
    authorEmail: string | undefined,
    timestamp: Date
  ): string {
    return addNode(this.graph, 'Commit', sha, {
      name: (message.split('\n')[0] ?? '').slice(0, 50),
      sha,
      message,
      author,
      authorEmail,
      timestamp,
    } as Omit<NodeAttributes, 'type'>);
  }

  /**
   * Add a developer node
   */
  addDeveloper(
    id: string,
    name: string,
    email: string,
    githubLogin?: string,
    commitCount = 0
  ): string {
    return addNode(this.graph, 'Developer', id, {
      name,
      email,
      githubLogin,
      commitCount,
    } as Omit<NodeAttributes, 'type'>);
  }

  /**
   * Add a PR node
   */
  addPR(
    id: string,
    number: number,
    title: string,
    state: 'open' | 'closed' | 'merged',
    authorLogin?: string
  ): string {
    return addNode(this.graph, 'PR', id, {
      name: `#${number}: ${title.slice(0, 50)}`,
      number,
      title,
      state,
      authorLogin,
    } as Omit<NodeAttributes, 'type'>);
  }

  /**
   * Add a drift signal node
   */
  addDriftSignal(
    id: string,
    driftType: string,
    severity: string,
    message: string,
    resolved = false
  ): string {
    return addNode(this.graph, 'DriftSignal', id, {
      name: message.slice(0, 50),
      driftType,
      severity,
      message,
      resolved,
    } as Omit<NodeAttributes, 'type'>);
  }

  /**
   * Add an edge between nodes
   */
  addEdge(
    type: EdgeType,
    sourceId: string,
    targetId: string,
    attributes?: Omit<EdgeAttributes, 'type'>
  ): string | null {
    return addEdge(this.graph, type, sourceId, targetId, attributes);
  }

  /**
   * Get the built graph
   */
  build(): DesignSystemGraph {
    return this.graph;
  }

  /**
   * Get graph statistics
   */
  getStats(): GraphStats {
    return getGraphStats(this.graph);
  }
}
