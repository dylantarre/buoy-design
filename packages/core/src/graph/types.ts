/**
 * Design System Knowledge Graph Types
 *
 * Defines all node and edge types for the graph representation
 * of design system entities and their relationships.
 */

// ============================================================================
// Node Types
// ============================================================================

export type NodeType =
  // Core design system
  | 'Token'
  | 'Component'
  | 'Variant'
  | 'PropType'
  // Code structure
  | 'File'
  | 'Directory'
  | 'Export'
  | 'Function'
  | 'Hook'
  | 'Context'
  // Styling
  | 'CSSVariable'
  | 'CSSClass'
  | 'Selector'
  | 'MediaQuery'
  // Git
  | 'Commit'
  | 'Developer'
  | 'Branch'
  | 'Tag'
  // GitHub
  | 'PR'
  | 'Review'
  | 'Comment'
  | 'Issue'
  | 'Label'
  // Dependencies
  | 'Package'
  | 'Config'
  // Quality
  | 'Story'
  | 'TestFile'
  | 'TestCase'
  // Buoy
  | 'DriftSignal'
  | 'Intent'
  | 'Feedback';

// ============================================================================
// Edge Types
// ============================================================================

export type EdgeType =
  // Containment
  | 'CONTAINS'
  | 'EXPORTS'
  | 'DEFINES'
  // Dependencies
  | 'IMPORTS'
  | 'DEPENDS_ON'
  | 'USES'
  | 'RENDERS'
  | 'EXTENDS'
  | 'CALLS'
  | 'PROVIDES'
  | 'CONSUMES'
  // Styling
  | 'STYLED_BY'
  | 'APPLIES'
  | 'RESPONSIVE_AT'
  | 'OVERRIDES'
  | 'REFERENCES'
  | 'DRIFTS_FROM'
  // Git history
  | 'AUTHORED'
  | 'CHANGED'
  | 'ADDED'
  | 'DELETED'
  | 'BELONGS_TO'
  | 'TAGGED'
  | 'PARENT_OF'
  // GitHub
  | 'OPENED'
  | 'INCLUDES'
  | 'MERGED_TO'
  | 'REVIEWED'
  | 'COMMENTED_ON'
  | 'CLOSES'
  | 'LABELED_WITH'
  | 'ASSIGNED_TO'
  // Quality
  | 'TESTED_BY'
  | 'DOCUMENTED_BY'
  | 'COVERS'
  // Buoy
  | 'FLAGGED_IN'
  | 'AFFECTS'
  | 'RESOLVED_BY'
  | 'APPROVED_BY'
  | 'APPLIES_TO'
  | 'REACTED_TO';

// ============================================================================
// Node Attributes
// ============================================================================

export interface BaseNodeAttributes {
  type: NodeType;
  name: string;
  createdAt?: Date;
}

export interface TokenNodeAttributes extends BaseNodeAttributes {
  type: 'Token';
  category: string;
  value: string;
  source: string;
  isW3C?: boolean;
}

export interface ComponentNodeAttributes extends BaseNodeAttributes {
  type: 'Component';
  filePath: string;
  framework: string;
  props?: string[];
  variants?: string[];
}

export interface FileNodeAttributes extends BaseNodeAttributes {
  type: 'File';
  path: string;
  extension: string;
  lineCount?: number;
}

export interface CommitNodeAttributes extends BaseNodeAttributes {
  type: 'Commit';
  sha: string;
  message: string;
  author: string;
  authorEmail?: string;
  timestamp: Date;
}

export interface DeveloperNodeAttributes extends BaseNodeAttributes {
  type: 'Developer';
  email: string;
  githubLogin?: string;
  commitCount: number;
}

export interface PRNodeAttributes extends BaseNodeAttributes {
  type: 'PR';
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  authorLogin?: string;
}

export interface DriftSignalNodeAttributes extends BaseNodeAttributes {
  type: 'DriftSignal';
  driftType: string;
  severity: string;
  message: string;
  resolved: boolean;
}

export interface IntentNodeAttributes extends BaseNodeAttributes {
  type: 'Intent';
  entityType: string;
  decision: string;
  status: string;
}

export type NodeAttributes =
  | TokenNodeAttributes
  | ComponentNodeAttributes
  | FileNodeAttributes
  | CommitNodeAttributes
  | DeveloperNodeAttributes
  | PRNodeAttributes
  | DriftSignalNodeAttributes
  | IntentNodeAttributes
  | BaseNodeAttributes;

// ============================================================================
// Edge Attributes
// ============================================================================

export interface BaseEdgeAttributes {
  type: EdgeType;
  createdAt?: Date;
}

export interface UsageEdgeAttributes extends BaseEdgeAttributes {
  type: 'USES';
  usageType?: 'css-var' | 'tailwind' | 'js-import' | 'hardcoded';
  lineNumber?: number;
  context?: string;
}

export interface ChangedEdgeAttributes extends BaseEdgeAttributes {
  type: 'CHANGED' | 'ADDED' | 'DELETED';
  additions?: number;
  deletions?: number;
}

export interface ImportsEdgeAttributes extends BaseEdgeAttributes {
  type: 'IMPORTS';
  importType: 'default' | 'named' | 'namespace' | 'side-effect';
  importedNames?: string[];
}

export interface DriftsFromEdgeAttributes extends BaseEdgeAttributes {
  type: 'DRIFTS_FROM';
  expectedValue: string;
  actualValue: string;
  driftType: string;
}

export type EdgeAttributes =
  | UsageEdgeAttributes
  | ChangedEdgeAttributes
  | ImportsEdgeAttributes
  | DriftsFromEdgeAttributes
  | BaseEdgeAttributes;

// ============================================================================
// Graph Configuration
// ============================================================================

export interface GraphBuildOptions {
  projectId: string;
  includeGitHistory?: boolean;
  includePRs?: boolean;
  includeTests?: boolean;
  includeStories?: boolean;
  since?: Date;
}

export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  nodesByType: Record<NodeType, number>;
  edgesByType: Record<EdgeType, number>;
}

// ============================================================================
// Query Results
// ============================================================================

export interface ImpactAnalysis {
  directDependents: string[];
  transitiveDependents: string[];
  affectedFiles: string[];
  affectedComponents: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

export interface OwnershipInfo {
  primaryAuthor: string;
  contributors: Array<{ name: string; commits: number }>;
  lastModified: Date;
  totalCommits: number;
}

export interface UsageInfo {
  usageCount: number;
  usedIn: Array<{
    file: string;
    line?: number;
    type: string;
  }>;
  unusedSince?: Date;
}
