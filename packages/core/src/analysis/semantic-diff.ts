/**
 * Semantic Diff Engine
 *
 * Orchestrates design drift detection by coordinating specialized analyzers.
 * This is the main entry point for comparing components and detecting issues.
 */

import type {
  Component,
  DesignToken,
  DriftSignal,
  Severity,
  DriftSource,
} from "../models/index.js";
import {
  createDriftId,
  normalizeComponentName,
  normalizeTokenName,
  tokensMatch,
} from "../models/index.js";
import {
  TokenSuggestionService,
  type TokenSuggestion,
} from "./token-suggestions.js";
import { stringSimilarity as calcStringSimilarity } from "./string-utils.js";
import { MATCHING_CONFIG } from "./config.js";

// Import analyzers
import {
  detectNamingPatterns,
  checkNamingConsistency,
} from "./analyzers/naming-analyzer.js";
import {
  detectPotentialDuplicates,
  SEMANTIC_COMPONENT_SUFFIXES,
  VERSION_SUFFIXES_PATTERN,
} from "./analyzers/duplicate-detector.js";
import {
  buildPropTypeMap,
  buildPropNamingMap,
  checkPropTypeConsistency,
  checkPropNamingConsistency,
} from "./analyzers/prop-analyzer.js";
import {
  checkAccessibility,
  checkColorContrast,
} from "./analyzers/accessibility-analyzer.js";

// Re-export for backward compatibility
export type { TokenSuggestion } from "./token-suggestions.js";
export { SEMANTIC_COMPONENT_SUFFIXES, VERSION_SUFFIXES_PATTERN };

export interface ComponentMatch {
  source: Component;
  target: Component;
  confidence: number;
  matchType: "exact" | "similar" | "partial";
  differences: ComponentDifference[];
}

export interface ComponentDifference {
  field: string;
  sourceValue: unknown;
  targetValue: unknown;
  severity: Severity;
}

export interface SemanticDiffResult {
  matches: ComponentMatch[];
  orphanedSource: Component[];
  orphanedTarget: Component[];
  drifts: DriftSignal[];
}

export interface TokenDiffResult {
  matches: { source: DesignToken; target: DesignToken }[];
  orphanedSource: DesignToken[];
  orphanedTarget: DesignToken[];
  drifts: DriftSignal[];
}

export interface DiffOptions {
  minMatchConfidence?: number;
}

export interface AnalysisOptions {
  checkDeprecated?: boolean;
  checkNaming?: boolean;
  checkDocumentation?: boolean;
  checkAccessibility?: boolean;
  deprecatedPatterns?: string[];
  namingConventions?: {
    components?: RegExp;
    tokens?: RegExp;
  };
  availableTokens?: DesignToken[];
}

export interface FrameworkInfo {
  name: string;
  version: string;
}

export class SemanticDiffEngine {
  // Caches for O(1) lookups
  private nameCache = new Map<string, string>();
  private componentMetadataCache = new Map<
    string,
    {
      props: Set<string>;
      variants: Set<string>;
      dependencies: Set<string>;
    }
  >();

  // Delegated services
  private tokenSuggestionService = new TokenSuggestionService();

  private cachedNormalizeName(name: string): string {
    let normalized = this.nameCache.get(name);
    if (normalized === undefined) {
      normalized = normalizeComponentName(name);
      this.nameCache.set(name, normalized);
    }
    return normalized;
  }

  private getComponentMetadata(component: Component) {
    let metadata = this.componentMetadataCache.get(component.id);
    if (!metadata) {
      metadata = {
        props: new Set(component.props.map((p) => p.name.toLowerCase())),
        variants: new Set(component.variants.map((v) => v.name.toLowerCase())),
        dependencies: new Set(
          component.dependencies.map((d) => d.toLowerCase()),
        ),
      };
      this.componentMetadataCache.set(component.id, metadata);
    }
    return metadata;
  }

  private clearCaches(): void {
    this.nameCache.clear();
    this.componentMetadataCache.clear();
  }

  /**
   * Check for framework sprawl - multiple UI frameworks in one codebase
   */
  checkFrameworkSprawl(frameworks: FrameworkInfo[]): DriftSignal | null {
    const uiFrameworkNames = [
      "react", "vue", "svelte", "angular", "solid", "preact", "lit",
      "stencil", "nextjs", "nuxt", "astro", "remix", "sveltekit",
      "gatsby", "react-native", "expo", "flutter",
    ];

    const uiFrameworks = frameworks.filter((f) =>
      uiFrameworkNames.includes(f.name),
    );

    if (uiFrameworks.length <= 1) return null;

    const frameworkNames = uiFrameworks.map((f) => f.name);
    const primaryFramework = uiFrameworks[0]!;

    return {
      id: createDriftId("framework-sprawl", "project", frameworkNames.join("-")),
      type: "framework-sprawl",
      severity: "warning",
      source: {
        entityType: "component",
        entityId: "project",
        entityName: "Project Architecture",
        location: "package.json",
      },
      message: `Framework sprawl detected: ${uiFrameworks.length} UI frameworks in use (${frameworkNames.join(", ")})`,
      details: {
        expected: `Single framework (${primaryFramework.name})`,
        actual: `${uiFrameworks.length} frameworks`,
        frameworks: uiFrameworks.map((f) => ({ name: f.name, version: f.version })),
        suggestions: [
          "Consider consolidating to a single UI framework",
          "Document intentional multi-framework usage if required",
          "Create migration plan if frameworks are being deprecated",
        ],
      },
      detectedAt: new Date(),
    };
  }

  /**
   * Compare components from different sources (e.g., React vs Figma)
   */
  compareComponents(
    sourceComponents: Component[],
    targetComponents: Component[],
    options: DiffOptions = {},
  ): SemanticDiffResult {
    const matches: ComponentMatch[] = [];
    const matchedSourceIds = new Set<string>();
    const matchedTargetIds = new Set<string>();

    // Build target lookup map
    const targetNameMap = new Map<string, Component>();
    for (const target of targetComponents) {
      targetNameMap.set(this.cachedNormalizeName(target.name), target);
    }

    // Phase 1: Exact name matches
    for (const source of sourceComponents) {
      const exactMatch = targetNameMap.get(this.cachedNormalizeName(source.name));
      if (exactMatch && !matchedTargetIds.has(exactMatch.id)) {
        matches.push(this.createMatch(source, exactMatch, "exact"));
        matchedSourceIds.add(source.id);
        matchedTargetIds.add(exactMatch.id);
      }
    }

    // Phase 2: Fuzzy matching for remaining
    const unmatchedTargetMap = new Map<string, Component>();
    for (const target of targetComponents) {
      if (!matchedTargetIds.has(target.id)) {
        unmatchedTargetMap.set(target.id, target);
      }
    }

    const minConfidence = options.minMatchConfidence || MATCHING_CONFIG.minMatchConfidence;
    for (const source of sourceComponents) {
      if (matchedSourceIds.has(source.id)) continue;

      const candidates = Array.from(unmatchedTargetMap.values());
      const bestMatch = this.findBestMatch(source, candidates);

      if (bestMatch && bestMatch.confidence >= minConfidence) {
        matches.push(bestMatch);
        matchedSourceIds.add(source.id);
        matchedTargetIds.add(bestMatch.target.id);
        unmatchedTargetMap.delete(bestMatch.target.id);
      }
    }

    // Phase 3: Generate drift signals
    const orphanedSource = sourceComponents.filter((c) => !matchedSourceIds.has(c.id));
    const orphanedTarget = targetComponents.filter((c) => !matchedTargetIds.has(c.id));
    const drifts = this.generateComponentDrifts(matches, orphanedSource, orphanedTarget);

    this.clearCaches();

    return { matches, orphanedSource, orphanedTarget, drifts };
  }

  /**
   * Compare tokens between sources
   */
  compareTokens(
    sourceTokens: DesignToken[],
    targetTokens: DesignToken[],
  ): TokenDiffResult {
    const matches: { source: DesignToken; target: DesignToken }[] = [];
    const drifts: DriftSignal[] = [];
    const matchedSourceIds = new Set<string>();
    const matchedTargetIds = new Set<string>();

    for (const source of sourceTokens) {
      const sourceName = normalizeTokenName(source.name);
      const target = targetTokens.find((t) => normalizeTokenName(t.name) === sourceName);

      if (!target) continue;

      matchedSourceIds.add(source.id);
      matchedTargetIds.add(target.id);
      matches.push({ source, target });

      if (!tokensMatch(source.value, target.value)) {
        drifts.push({
          id: createDriftId("value-divergence", source.id, target.id),
          type: "value-divergence",
          severity: "warning",
          source: this.tokenToDriftSource(source),
          target: this.tokenToDriftSource(target),
          message: `Token "${source.name}" has different values between sources`,
          details: {
            expected: source.value,
            actual: target.value,
            suggestions: ["Align token values between design and code"],
          },
          detectedAt: new Date(),
        });
      }
    }

    const orphanedSource = sourceTokens.filter((t) => !matchedSourceIds.has(t.id));
    const orphanedTarget = targetTokens.filter((t) => !matchedTargetIds.has(t.id));

    for (const token of orphanedSource) {
      drifts.push({
        id: createDriftId("orphaned-token", token.id),
        type: "orphaned-token",
        severity: "info",
        source: this.tokenToDriftSource(token),
        message: `Token "${token.name}" exists in ${token.source.type} but not in design`,
        details: { suggestions: ["Add token to design system or remove if unused"] },
        detectedAt: new Date(),
      });
    }

    for (const token of orphanedTarget) {
      drifts.push({
        id: createDriftId("orphaned-token", token.id),
        type: "orphaned-token",
        severity: "info",
        source: this.tokenToDriftSource(token),
        message: `Token "${token.name}" exists in design but not implemented`,
        details: { suggestions: ["Implement token in code or mark as planned"] },
        detectedAt: new Date(),
      });
    }

    return { matches, orphanedSource, orphanedTarget, drifts };
  }

  /**
   * Analyze a single set of components for internal drift
   */
  analyzeComponents(
    components: Component[],
    options: AnalysisOptions = {},
  ): { drifts: DriftSignal[] } {
    const drifts: DriftSignal[] = [];

    // Collect patterns using analyzers
    const namingPatterns = detectNamingPatterns(components);
    const propTypeMap = buildPropTypeMap(components);
    const propNamingMap = buildPropNamingMap(components);

    for (const component of components) {
      // Check deprecation
      if (options.checkDeprecated && component.metadata.deprecated) {
        drifts.push(this.createDeprecatedDrift(component));
      }

      // Check naming consistency
      if (options.checkNaming) {
        const namingIssue = checkNamingConsistency(component.name, namingPatterns);
        if (namingIssue) {
          drifts.push(this.createNamingDrift(component, namingIssue));
        }
      }

      // Check prop type consistency
      for (const prop of component.props) {
        const typeConflict = checkPropTypeConsistency(prop, propTypeMap);
        if (typeConflict) {
          drifts.push(this.createPropTypeDrift(component, prop, typeConflict));
        }
      }

      // Check prop naming patterns
      const propNamingIssues = checkPropNamingConsistency(component, propNamingMap);
      for (const issue of propNamingIssues) {
        drifts.push({
          id: createDriftId("naming-inconsistency", component.id, issue.propName),
          type: "naming-inconsistency",
          severity: "info",
          source: this.componentToDriftSource(component),
          message: issue.message,
          details: { suggestions: [issue.suggestion] },
          detectedAt: new Date(),
        });
      }

      // Check accessibility
      if (options.checkAccessibility) {
        const a11yIssues = checkAccessibility(component);
        for (const issue of a11yIssues) {
          drifts.push({
            id: createDriftId("accessibility-conflict", component.id),
            type: "accessibility-conflict",
            severity: "critical",
            source: this.componentToDriftSource(component),
            message: `Component "${component.name}" has accessibility issues: ${issue}`,
            details: { suggestions: ["Fix accessibility issue to ensure inclusive design"] },
            detectedAt: new Date(),
          });
        }

        // Check color contrast
        drifts.push(...checkColorContrast(component));
      }

      // Check hardcoded values
      if (component.metadata.hardcodedValues?.length) {
        drifts.push(...this.analyzeHardcodedValues(component, options));
      }
    }

    // Cross-component checks: duplicates
    const duplicates = detectPotentialDuplicates(components);
    for (const dup of duplicates) {
      drifts.push({
        id: createDriftId("naming-inconsistency", dup.components[0]!.id, "duplicate"),
        type: "naming-inconsistency",
        severity: "warning",
        source: this.componentToDriftSource(dup.components[0]!),
        message: `Potential duplicate components: ${dup.components.map((c) => c.name).join(", ")}`,
        details: {
          suggestions: ["Consider consolidating these components or clarifying their distinct purposes"],
          relatedComponents: dup.components.map((c) => c.name),
        },
        detectedAt: new Date(),
      });
    }

    return { drifts };
  }

  /**
   * Check for unused components
   */
  checkUnusedComponents(
    components: Component[],
    usageMap: Map<string, number>,
  ): DriftSignal[] {
    const drifts: DriftSignal[] = [];

    for (const component of components) {
      const usageCount = usageMap.get(component.id) || usageMap.get(component.name) || 0;
      if (usageCount === 0) {
        drifts.push({
          id: createDriftId("unused-component", component.id),
          type: "unused-component",
          severity: "warning",
          source: this.componentToDriftSource(component),
          message: `Component "${component.name}" is defined but never used`,
          details: {
            suggestions: [
              "Remove component if no longer needed",
              "Export component if it's part of the public API",
              "Add usage in tests or documentation",
            ],
          },
          detectedAt: new Date(),
        });
      }
    }

    return drifts;
  }

  /**
   * Check for unused tokens
   */
  checkUnusedTokens(
    tokens: DesignToken[],
    usageMap: Map<string, number>,
  ): DriftSignal[] {
    const drifts: DriftSignal[] = [];

    for (const token of tokens) {
      const usageCount = usageMap.get(token.id) || usageMap.get(token.name) || 0;
      if (usageCount === 0) {
        drifts.push({
          id: createDriftId("unused-token", token.id),
          type: "unused-token",
          severity: "info",
          source: this.tokenToDriftSource(token),
          message: `Token "${token.name}" is defined but never used`,
          details: {
            suggestions: [
              "Remove token if no longer needed",
              "Document token for future use",
              "Check if token is referenced by name in CSS/JS",
            ],
          },
          detectedAt: new Date(),
        });
      }
    }

    return drifts;
  }

  // Token suggestion methods - delegate to service
  findColorTokenSuggestions(
    hardcodedValue: string,
    tokens: DesignToken[],
    maxSuggestions = 3,
  ): TokenSuggestion[] {
    return this.tokenSuggestionService.findColorTokenSuggestions(hardcodedValue, tokens, maxSuggestions);
  }

  findSpacingTokenSuggestions(
    hardcodedValue: string,
    tokens: DesignToken[],
    maxSuggestions = 3,
  ): TokenSuggestion[] {
    return this.tokenSuggestionService.findSpacingTokenSuggestions(hardcodedValue, tokens, maxSuggestions);
  }

  generateTokenSuggestions(
    hardcodedValues: Array<{ type: string; value: string; property: string; location: string }>,
    tokens: DesignToken[],
  ): Map<string, TokenSuggestion[]> {
    return this.tokenSuggestionService.generateTokenSuggestions(hardcodedValues, tokens);
  }

  // Private helper methods

  private analyzeHardcodedValues(component: Component, options: AnalysisOptions): DriftSignal[] {
    const drifts: DriftSignal[] = [];
    const hardcoded = component.metadata.hardcodedValues!;

    const colorCount = hardcoded.filter((h) => h.type === "color").length;
    const spacingCount = hardcoded.filter((h) => h.type === "spacing" || h.type === "fontSize").length;

    const tokenSuggestions = options.availableTokens
      ? this.generateTokenSuggestions(hardcoded, options.availableTokens)
      : new Map<string, TokenSuggestion[]>();

    if (colorCount > 0) {
      const colorValues = hardcoded.filter((h) => h.type === "color");
      const suggestions: string[] = [];
      const tokenReplacements: string[] = [];

      for (const cv of colorValues) {
        const suggs = tokenSuggestions.get(cv.value);
        if (suggs?.length) {
          const best = suggs[0]!;
          tokenReplacements.push(`${cv.value} → ${best.suggestedToken} (${Math.round(best.confidence * 100)}% match)`);
        }
      }

      suggestions.push(
        tokenReplacements.length > 0
          ? `Suggested replacements:\n  ${tokenReplacements.join("\n  ")}`
          : "Replace hardcoded colors with design tokens"
      );

      drifts.push({
        id: createDriftId("hardcoded-value", component.id, "color"),
        type: "hardcoded-value",
        severity: "warning",
        source: this.componentToDriftSource(component),
        message: `Component "${component.name}" has ${colorCount} hardcoded color${colorCount > 1 ? "s" : ""}: ${colorValues.map((h) => h.value).join(", ")}`,
        details: {
          suggestions,
          affectedFiles: colorValues.map((h) => `${h.property}: ${h.value} (${h.location})`),
          tokenSuggestions: tokenReplacements.length > 0 ? tokenReplacements : undefined,
        },
        detectedAt: new Date(),
      });
    }

    if (spacingCount > 0) {
      const spacingValues = hardcoded.filter((h) => h.type === "spacing" || h.type === "fontSize");
      const suggestions: string[] = [];
      const tokenReplacements: string[] = [];

      for (const sv of spacingValues) {
        const suggs = tokenSuggestions.get(sv.value);
        if (suggs?.length) {
          const best = suggs[0]!;
          tokenReplacements.push(`${sv.value} → ${best.suggestedToken} (${Math.round(best.confidence * 100)}% match)`);
        }
      }

      suggestions.push(
        tokenReplacements.length > 0
          ? `Suggested replacements:\n  ${tokenReplacements.join("\n  ")}`
          : "Consider using spacing tokens for consistency"
      );

      drifts.push({
        id: createDriftId("hardcoded-value", component.id, "spacing"),
        type: "hardcoded-value",
        severity: "info",
        source: this.componentToDriftSource(component),
        message: `Component "${component.name}" has ${spacingCount} hardcoded size value${spacingCount > 1 ? "s" : ""}: ${spacingValues.map((h) => h.value).join(", ")}`,
        details: {
          suggestions,
          affectedFiles: spacingValues.map((h) => `${h.property}: ${h.value} (${h.location})`),
          tokenSuggestions: tokenReplacements.length > 0 ? tokenReplacements : undefined,
        },
        detectedAt: new Date(),
      });
    }

    return drifts;
  }

  private createDeprecatedDrift(component: Component): DriftSignal {
    return {
      id: createDriftId("deprecated-pattern", component.id),
      type: "deprecated-pattern",
      severity: "warning",
      source: this.componentToDriftSource(component),
      message: `Component "${component.name}" is marked as deprecated`,
      details: {
        suggestions: [component.metadata.deprecationReason || "Migrate to recommended alternative"],
      },
      detectedAt: new Date(),
    };
  }

  private createNamingDrift(
    component: Component,
    issue: { message: string; suggestion: string },
  ): DriftSignal {
    return {
      id: createDriftId("naming-inconsistency", component.id),
      type: "naming-inconsistency",
      severity: "info",
      source: this.componentToDriftSource(component),
      message: issue.message,
      details: { suggestions: [issue.suggestion] },
      detectedAt: new Date(),
    };
  }

  private createPropTypeDrift(
    component: Component,
    prop: { name: string; type: string },
    conflict: { dominantType: string; examples: string[] },
  ): DriftSignal {
    return {
      id: createDriftId("semantic-mismatch", component.id, prop.name),
      type: "semantic-mismatch",
      severity: "warning",
      source: this.componentToDriftSource(component),
      message: `Prop "${prop.name}" in "${component.name}" uses type "${prop.type}" but other components use "${conflict.dominantType}"`,
      details: {
        expected: conflict.dominantType,
        actual: prop.type,
        usedIn: conflict.examples,
        suggestions: ["Standardize prop types across components for consistency"],
      },
      detectedAt: new Date(),
    };
  }

  private createMatch(
    source: Component,
    target: Component,
    matchType: "exact" | "similar" | "partial",
  ): ComponentMatch {
    return {
      source,
      target,
      confidence: matchType === "exact" ? 1 : 0,
      matchType,
      differences: this.findDifferences(source, target),
    };
  }

  private findBestMatch(source: Component, candidates: Component[]): ComponentMatch | null {
    let bestMatch: ComponentMatch | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      const score = this.calculateSimilarity(source, candidate);
      if (score > bestScore) {
        bestScore = score;
        const matchType = score > MATCHING_CONFIG.similarMatchThreshold ? "similar" : "partial";
        bestMatch = {
          source,
          target: candidate,
          confidence: score,
          matchType,
          differences: this.findDifferences(source, candidate),
        };
      }
    }

    return bestMatch;
  }

  private calculateSimilarity(a: Component, b: Component): number {
    let score = 0;
    const weights = MATCHING_CONFIG.similarityWeights;

    score += weights.name * calcStringSimilarity(a.name.toLowerCase(), b.name.toLowerCase());

    const aMeta = this.getComponentMetadata(a);
    const bMeta = this.getComponentMetadata(b);

    const propsIntersection = [...aMeta.props].filter((p) => bMeta.props.has(p)).length;
    const propsUnion = new Set([...aMeta.props, ...bMeta.props]).size;
    score += weights.props * (propsUnion > 0 ? propsIntersection / propsUnion : 0);

    const variantsIntersection = [...aMeta.variants].filter((v) => bMeta.variants.has(v)).length;
    const variantsUnion = new Set([...aMeta.variants, ...bMeta.variants]).size;
    score += weights.variants * (variantsUnion > 0 ? variantsIntersection / variantsUnion : 0);

    const depsIntersection = [...aMeta.dependencies].filter((d) => bMeta.dependencies.has(d)).length;
    const depsUnion = new Set([...aMeta.dependencies, ...bMeta.dependencies]).size;
    score += weights.dependencies * (depsUnion > 0 ? depsIntersection / depsUnion : 0);

    return score;
  }

  private findDifferences(source: Component, target: Component): ComponentDifference[] {
    const differences: ComponentDifference[] = [];

    const sourceProps = new Map(source.props.map((p) => [p.name.toLowerCase(), p]));
    const targetProps = new Map(target.props.map((p) => [p.name.toLowerCase(), p]));

    for (const [name, prop] of sourceProps) {
      const targetProp = targetProps.get(name);
      if (!targetProp) {
        differences.push({
          field: `props.${prop.name}`,
          sourceValue: prop,
          targetValue: undefined,
          severity: prop.required ? "warning" : "info",
        });
      } else if (prop.type !== targetProp.type) {
        differences.push({
          field: `props.${prop.name}.type`,
          sourceValue: prop.type,
          targetValue: targetProp.type,
          severity: "warning",
        });
      }
    }

    for (const [name, prop] of targetProps) {
      if (!sourceProps.has(name)) {
        differences.push({
          field: `props.${prop.name}`,
          sourceValue: undefined,
          targetValue: prop,
          severity: "info",
        });
      }
    }

    return differences;
  }

  private generateComponentDrifts(
    matches: ComponentMatch[],
    orphanedSource: Component[],
    orphanedTarget: Component[],
  ): DriftSignal[] {
    const drifts: DriftSignal[] = [];

    for (const match of matches) {
      const significantDiffs = match.differences.filter(
        (d) => d.severity === "warning" || d.severity === "critical",
      );

      if (significantDiffs.length > 0) {
        drifts.push({
          id: createDriftId("semantic-mismatch", match.source.id, match.target.id),
          type: "semantic-mismatch",
          severity: this.getHighestSeverity(match.differences),
          source: this.componentToDriftSource(match.source),
          target: this.componentToDriftSource(match.target),
          message: `Component "${match.source.name}" has ${significantDiffs.length} differences between sources`,
          details: {
            diff: JSON.stringify(match.differences, null, 2),
            suggestions: ["Review component definitions for consistency"],
          },
          detectedAt: new Date(),
        });
      }
    }

    for (const comp of orphanedSource) {
      drifts.push({
        id: createDriftId("orphaned-component", comp.id),
        type: "orphaned-component",
        severity: "warning",
        source: this.componentToDriftSource(comp),
        message: `Component "${comp.name}" exists in ${comp.source.type} but has no match in design`,
        details: { suggestions: ["Add component to Figma or document as intentional deviation"] },
        detectedAt: new Date(),
      });
    }

    for (const comp of orphanedTarget) {
      drifts.push({
        id: createDriftId("orphaned-component", comp.id),
        type: "orphaned-component",
        severity: "info",
        source: this.componentToDriftSource(comp),
        message: `Component "${comp.name}" exists in design but not implemented`,
        details: { suggestions: ["Implement component or mark as planned"] },
        detectedAt: new Date(),
      });
    }

    return drifts;
  }

  private componentToDriftSource(comp: Component): DriftSource {
    let location = "";
    if (comp.source.type === "figma") {
      location = comp.source.url || comp.source.nodeId;
    } else if (comp.source.type === "storybook") {
      location = comp.source.url || comp.source.storyId;
    } else if (comp.source.path) {
      location = comp.source.line ? `${comp.source.path}:${comp.source.line}` : comp.source.path;
    }

    return {
      entityType: "component",
      entityId: comp.id,
      entityName: comp.name,
      location,
    };
  }

  private tokenToDriftSource(token: DesignToken): DriftSource {
    let location = "";
    if (token.source.type === "json" || token.source.type === "css" || token.source.type === "scss") {
      location = token.source.path;
    } else if (token.source.type === "figma") {
      location = token.source.fileKey;
    }

    return {
      entityType: "token",
      entityId: token.id,
      entityName: token.name,
      location,
    };
  }

  private getHighestSeverity(differences: ComponentDifference[]): Severity {
    if (differences.some((d) => d.severity === "critical")) return "critical";
    if (differences.some((d) => d.severity === "warning")) return "warning";
    return "info";
  }
}
