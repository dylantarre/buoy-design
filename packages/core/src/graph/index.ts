/**
 * Design System Knowledge Graph
 *
 * A graph-based representation of the design system that enables
 * powerful queries about relationships, impact, and ownership.
 */

// Types
export * from './types.js';

// Graph building
export {
  createGraph,
  nodeId,
  edgeId,
  addNode,
  updateNode,
  addEdge,
  getNodesByType,
  getEdgesByType,
  getOutEdgesByType,
  getInEdgesByType,
  getGraphStats,
  exportToJSON,
  importFromJSON,
  exportToDOT,
  exportToCytoscape,
  GraphBuilder,
} from './builder.js';

// Queries
export {
  // Token queries
  findTokenUsages,
  findUnusedTokens,
  findDriftingTokens,
  // Component queries
  findComponentRenderers,
  findUntestedComponents,
  findUndocumentedComponents,
  // Impact analysis
  analyzeImpact,
  // Ownership
  findOwnership,
  findDriftAuthor,
  // Pattern detection
  findRepeatOffenders,
  findDeprecatedUsages,
  // PR analysis
  findDriftInPR,
  findFilesChangedInPR,
  // Coverage
  calculateCoverage,
} from './queries.js';
