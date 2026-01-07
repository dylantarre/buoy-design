/**
 * Types for Buoy MCP server
 */

import type { DriftSignal } from "@buoy-design/core";

/**
 * Token with AI-friendly intent metadata
 */
export interface TokenWithIntent {
  name: string;
  value: string;
  category: "color" | "spacing" | "typography" | "radius" | "shadow";
  intent?: {
    hierarchy?: string;
    relationship?: string;
    density?: string;
    emotion?: string[];
  };
  usage?: string;
  avoid?: string;
  examples?: string[];
  deprecated?: boolean;
}

/**
 * Component summary for inventory
 */
export interface ComponentSummary {
  name: string;
  framework: string;
  props: string[];
  variants?: string[];
  path: string;
  description?: string;
}

/**
 * Pattern definition
 */
export interface Pattern {
  name: string;
  description: string;
  components: string[];
  example?: string;
  usage?: string;
}

/**
 * Anti-pattern to avoid
 */
export interface AntiPattern {
  name: string;
  description: string;
  avoid: string;
  instead: string;
  severity: "critical" | "warning" | "info";
}

/**
 * Design system context for MCP resources
 */
export interface DesignSystemContext {
  tokens: TokenWithIntent[];
  components: ComponentSummary[];
  patterns: Pattern[];
  antiPatterns: AntiPattern[];
  projectName: string;
  lastUpdated: string;
}

/**
 * Find component request
 */
export interface FindComponentRequest {
  useCase: string;
  constraints?: string[];
}

/**
 * Find component response
 */
export interface FindComponentResponse {
  recommended: ComponentSummary | null;
  alternatives: ComponentSummary[];
  reasoning: string;
  /** No Dead Ends: Guidance when no results found */
  guidance?: {
    suggestion: string;
    availableComponents: string;
    nextSteps: string[];
  };
}

/**
 * Validate code request
 */
export interface ValidateCodeRequest {
  code: string;
  filePath?: string;
}

/**
 * Validate code response
 */
export interface ValidateCodeResponse {
  valid: boolean;
  issues: Array<{
    type: string;
    severity: "critical" | "warning" | "info";
    message: string;
    line?: number;
    suggestion?: string;
  }>;
  summary: {
    total: number;
    critical: number;
    warning: number;
    info: number;
  };
  /** No Dead Ends: Context about what was checked */
  context?: {
    checksPerformed: string[];
    tokensAvailable: number;
    componentsKnown: number;
    guidance: string;
  };
}

/**
 * Resolve token request
 */
export interface ResolveTokenRequest {
  value: string;
  context?: "color" | "spacing" | "typography";
}

/**
 * Resolve token response
 */
export interface ResolveTokenResponse {
  exactMatch: TokenWithIntent | null;
  closestMatches: Array<{
    token: TokenWithIntent;
    similarity: number;
  }>;
  suggestion: string;
  /** No Dead Ends: Guidance when no match found */
  guidance?: {
    tokenCount: number;
    availableCategories: string[];
    nextSteps: string[];
  };
}

/**
 * Suggest fix request
 */
export interface SuggestFixRequest {
  drift: DriftSignal;
}

/**
 * Suggest fix response
 */
export interface SuggestFixResponse {
  fix: {
    type: "replace" | "remove" | "add";
    original: string;
    replacement: string;
    confidence: number;
  } | null;
  explanation: string;
  alternatives?: string[];
  /** No Dead Ends: Guidance when no fix found */
  guidance?: {
    tokenCount: number;
    categorySearched: string;
    nextSteps: string[];
  };
}
