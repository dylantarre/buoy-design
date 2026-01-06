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
import {
  MATCHING_CONFIG,
  NAMING_CONFIG,
  getOutlierThreshold,
} from "./config.js";

// Re-export TokenSuggestion type for backward compatibility
export type { TokenSuggestion } from "./token-suggestions.js";

/**
 * Calculate relative luminance for WCAG contrast ratio
 * https://www.w3.org/TR/WCAG20/#relativeluminancedef
 */
function getRelativeLuminance(r: number, g: number, b: number): number {
  const normalize = (c: number) => {
    const sRGB = c / 255;
    return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  };

  const rs = normalize(r);
  const gs = normalize(g);
  const bs = normalize(b);

  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate WCAG contrast ratio between two colors
 * https://www.w3.org/TR/WCAG20/#contrast-ratiodef
 */
function getContrastRatio(
  color1: { r: number; g: number; b: number },
  color2: { r: number; g: number; b: number },
): number {
  const l1 = getRelativeLuminance(color1.r, color1.g, color1.b);
  const l2 = getRelativeLuminance(color2.r, color2.g, color2.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Parse hex color to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.replace(/^#/, '');

  // Handle 3-digit hex
  if (normalized.length === 3) {
    const [r, g, b] = normalized.split('').map(c => parseInt(c + c, 16));
    return { r: r!, g: g!, b: b! };
  }

  // Handle 6-digit hex
  if (normalized.length === 6) {
    const r = parseInt(normalized.substring(0, 2), 16);
    const g = parseInt(normalized.substring(2, 4), 16);
    const b = parseInt(normalized.substring(4, 6), 16);
    return { r, g, b };
  }

  return null;
}

/**
 * Parse rgb/rgba string to RGB
 */
function parseRgbString(rgbString: string): { r: number; g: number; b: number } | null {
  const match = rgbString.match(/rgba?\((\d+),?\s*(\d+),?\s*(\d+)/);
  if (!match) return null;

  return {
    r: parseInt(match[1]!),
    g: parseInt(match[2]!),
    b: parseInt(match[3]!),
  };
}

/**
 * Convert color value to RGB
 */
function colorToRgb(color: string): { r: number; g: number; b: number } | null {
  if (color.startsWith('#')) {
    return hexToRgb(color);
  }
  if (color.startsWith('rgb')) {
    return parseRgbString(color);
  }

  // Named colors (common ones)
  const namedColors: Record<string, { r: number; g: number; b: number }> = {
    'white': { r: 255, g: 255, b: 255 },
    'black': { r: 0, g: 0, b: 0 },
    'red': { r: 255, g: 0, b: 0 },
    'green': { r: 0, g: 128, b: 0 },
    'blue': { r: 0, g: 0, b: 255 },
    'transparent': { r: 255, g: 255, b: 255 }, // Treat as white for contrast purposes
  };

  return namedColors[color.toLowerCase()] || null;
}

/**
 * Semantic suffixes that represent legitimate separate components.
 * Components with these suffixes are NOT duplicates of their base component.
 * e.g., Button vs ButtonGroup are distinct components, not duplicates.
 */
const SEMANTIC_COMPONENT_SUFFIXES = [
  // Compound component patterns
  "group",
  "list",
  "item",
  "items",
  "container",
  "wrapper",
  "provider",
  "context",
  // Layout parts
  "header",
  "footer",
  "body",
  "content",
  "section",
  "sidebar",
  "panel",
  // Specific UI patterns
  "trigger",
  "target",
  "overlay",
  "portal",
  "root",
  "slot",
  "action",
  "actions",
  "icon",
  "label",
  "text",
  "title",
  "description",
  "separator",
  "divider",
  // Size/state variants that are distinct components
  "small",
  "large",
  "mini",
  "skeleton",
  "placeholder",
  "loading",
  "error",
  "empty",
  // Form-related
  "input",
  "field",
  "control",
  "message",
  "helper",
  "hint",
  // Navigation
  "link",
  "menu",
  "submenu",
  "tab",
  "tabs",
  // Data display
  "cell",
  "row",
  "column",
  "columns",
  "head",
  "view",
] as const;

/**
 * Version/status suffixes that indicate potential duplicates.
 * Components with ONLY these suffixes are likely duplicates.
 * e.g., Button vs ButtonNew, Card vs CardLegacy
 */
const VERSION_SUFFIXES_PATTERN =
  /(New|Old|V\d+|Legacy|Updated|Deprecated|Beta|Alpha|Experimental|Next|Previous|Original|Backup|Copy|Clone|Alt|Alternative|Temp|Temporary|WIP|Draft)$/i;

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
  /** Available design tokens to suggest as replacements for hardcoded values */
  availableTokens?: DesignToken[];
}

// TokenSuggestion is now imported from ./token-suggestions.js

interface NamingPatternAnalysis {
  patterns: {
    PascalCase: number;
    camelCase: number;
    "kebab-case": number;
    snake_case: number;
    other: number;
  };
  dominant:
    | "PascalCase"
    | "camelCase"
    | "kebab-case"
    | "snake_case"
    | "other"
    | null;
  total: number;
}

interface PropTypeUsage {
  types: Map<string, { count: number; examples: string[] }>;
  total: number;
}

// Framework info for sprawl detection
export interface FrameworkInfo {
  name: string;
  version: string;
}

export class SemanticDiffEngine {
  // Caches for O(1) lookups instead of repeated computations
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

  /**
   * Cached version of normalizeComponentName to avoid repeated string operations
   */
  private cachedNormalizeName(name: string): string {
    let normalized = this.nameCache.get(name);
    if (normalized === undefined) {
      normalized = normalizeComponentName(name);
      this.nameCache.set(name, normalized);
    }
    return normalized;
  }

  /**
   * Get pre-computed component metadata for faster similarity calculations
   */
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

  /**
   * Clear caches to prevent memory leaks between operations
   */
  private clearCaches(): void {
    this.nameCache.clear();
    this.componentMetadataCache.clear();
  }

  /**
   * Check for framework sprawl - multiple UI frameworks in one codebase
   */
  checkFrameworkSprawl(frameworks: FrameworkInfo[]): DriftSignal | null {
    // Only count UI/component frameworks, not backend frameworks
    const uiFrameworkNames = [
      "react",
      "vue",
      "svelte",
      "angular",
      "solid",
      "preact",
      "lit",
      "stencil",
      "nextjs",
      "nuxt",
      "astro",
      "remix",
      "sveltekit",
      "gatsby",
      "react-native",
      "expo",
      "flutter",
    ];

    const uiFrameworks = frameworks.filter((f) =>
      uiFrameworkNames.includes(f.name),
    );

    if (uiFrameworks.length <= 1) {
      return null; // No sprawl
    }

    const frameworkNames = uiFrameworks.map((f) => f.name);
    const primaryFramework = uiFrameworks[0]!;

    return {
      id: createDriftId(
        "framework-sprawl",
        "project",
        frameworkNames.join("-"),
      ),
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
        frameworks: uiFrameworks.map((f) => ({
          name: f.name,
          version: f.version,
        })),
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
   * Optimized with Map-based indexing for O(n+m) instead of O(n×m)
   */
  compareComponents(
    sourceComponents: Component[],
    targetComponents: Component[],
    options: DiffOptions = {},
  ): SemanticDiffResult {
    const matches: ComponentMatch[] = [];
    const matchedSourceIds = new Set<string>();
    const matchedTargetIds = new Set<string>();

    // Build target component lookup map for O(1) exact matching - O(m) one-time cost
    const targetNameMap = new Map<string, Component>();
    for (const target of targetComponents) {
      const normalizedName = this.cachedNormalizeName(target.name);
      targetNameMap.set(normalizedName, target);
    }

    // Phase 1: Exact name matches - O(n) instead of O(n × m)
    for (const source of sourceComponents) {
      const normalizedName = this.cachedNormalizeName(source.name);
      const exactMatch = targetNameMap.get(normalizedName);

      if (exactMatch && !matchedTargetIds.has(exactMatch.id)) {
        matches.push(this.createMatch(source, exactMatch, "exact"));
        matchedSourceIds.add(source.id);
        matchedTargetIds.add(exactMatch.id);
      }
    }

    // Phase 2: Fuzzy matching for remaining - optimized candidate tracking
    const unmatchedTargetMap = new Map<string, Component>();
    for (const target of targetComponents) {
      if (!matchedTargetIds.has(target.id)) {
        unmatchedTargetMap.set(target.id, target);
      }
    }

    const minConfidence =
      options.minMatchConfidence || MATCHING_CONFIG.minMatchConfidence;
    for (const source of sourceComponents) {
      if (matchedSourceIds.has(source.id)) continue;

      // Convert to array only for remaining unmatched targets
      const candidates = Array.from(unmatchedTargetMap.values());
      const bestMatch = this.findBestMatch(source, candidates);

      if (bestMatch && bestMatch.confidence >= minConfidence) {
        matches.push(bestMatch);
        matchedSourceIds.add(source.id);
        matchedTargetIds.add(bestMatch.target.id);
        // Remove matched target to prevent re-matching and reduce candidates
        unmatchedTargetMap.delete(bestMatch.target.id);
      }
    }

    // Phase 3: Generate drift signals
    const orphanedSource = sourceComponents.filter(
      (c) => !matchedSourceIds.has(c.id),
    );
    const orphanedTarget = targetComponents.filter(
      (c) => !matchedTargetIds.has(c.id),
    );
    const drifts = this.generateComponentDrifts(
      matches,
      orphanedSource,
      orphanedTarget,
    );

    // Clear caches to prevent memory leaks
    this.clearCaches();

    return {
      matches,
      orphanedSource,
      orphanedTarget,
      drifts,
    };
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
      const target = targetTokens.find(
        (t) => normalizeTokenName(t.name) === sourceName,
      );

      if (!target) continue;

      matchedSourceIds.add(source.id);
      matchedTargetIds.add(target.id);
      matches.push({ source, target });

      // Check for value divergence
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

    // Orphaned tokens
    const orphanedSource = sourceTokens.filter(
      (t) => !matchedSourceIds.has(t.id),
    );
    const orphanedTarget = targetTokens.filter(
      (t) => !matchedTargetIds.has(t.id),
    );

    for (const token of orphanedSource) {
      drifts.push({
        id: createDriftId("orphaned-token", token.id),
        type: "orphaned-token",
        severity: "info",
        source: this.tokenToDriftSource(token),
        message: `Token "${token.name}" exists in ${token.source.type} but not in design`,
        details: {
          suggestions: ["Add token to design system or remove if unused"],
        },
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
        details: {
          suggestions: ["Implement token in code or mark as planned"],
        },
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

    // First pass: collect patterns across all components
    const namingPatterns = this.detectNamingPatterns(components);
    const propTypeMap = this.buildPropTypeMap(components);
    const propNamingMap = this.buildPropNamingMap(components);

    for (const component of components) {
      // Check for deprecation
      if (options.checkDeprecated && component.metadata.deprecated) {
        drifts.push({
          id: createDriftId("deprecated-pattern", component.id),
          type: "deprecated-pattern",
          severity: "warning",
          source: this.componentToDriftSource(component),
          message: `Component "${component.name}" is marked as deprecated`,
          details: {
            suggestions: [
              component.metadata.deprecationReason ||
                "Migrate to recommended alternative",
            ],
          },
          detectedAt: new Date(),
        });
      }

      // Check naming consistency (against project's own patterns, not arbitrary rules)
      if (options.checkNaming) {
        const namingIssue = this.checkNamingConsistency(
          component.name,
          namingPatterns,
        );
        if (namingIssue) {
          drifts.push({
            id: createDriftId("naming-inconsistency", component.id),
            type: "naming-inconsistency",
            severity: "info",
            source: this.componentToDriftSource(component),
            message: namingIssue.message,
            details: {
              suggestions: [namingIssue.suggestion],
            },
            detectedAt: new Date(),
          });
        }
      }

      // Check for prop type inconsistencies across components
      for (const prop of component.props) {
        const typeConflict = this.checkPropTypeConsistency(prop, propTypeMap);
        if (typeConflict) {
          drifts.push({
            id: createDriftId("semantic-mismatch", component.id, prop.name),
            type: "semantic-mismatch",
            severity: "warning",
            source: this.componentToDriftSource(component),
            message: `Prop "${prop.name}" in "${component.name}" uses type "${prop.type}" but other components use "${typeConflict.dominantType}"`,
            details: {
              expected: typeConflict.dominantType,
              actual: prop.type,
              usedIn: typeConflict.examples,
              suggestions: [
                "Standardize prop types across components for consistency",
              ],
            },
            detectedAt: new Date(),
          });
        }
      }

      // Check for inconsistent prop naming patterns (onClick vs handleClick)
      const propNamingIssues = this.checkPropNamingConsistency(
        component,
        propNamingMap,
      );
      for (const issue of propNamingIssues) {
        drifts.push({
          id: createDriftId(
            "naming-inconsistency",
            component.id,
            issue.propName,
          ),
          type: "naming-inconsistency",
          severity: "info",
          source: this.componentToDriftSource(component),
          message: issue.message,
          details: {
            suggestions: [issue.suggestion],
          },
          detectedAt: new Date(),
        });
      }

      // Check for accessibility issues
      if (options.checkAccessibility) {
        const a11yIssues = this.checkAccessibility(component);
        for (const issue of a11yIssues) {
          drifts.push({
            id: createDriftId("accessibility-conflict", component.id),
            type: "accessibility-conflict",
            severity: "critical",
            source: this.componentToDriftSource(component),
            message: `Component "${component.name}" has accessibility issues: ${issue}`,
            details: {
              suggestions: [
                "Fix accessibility issue to ensure inclusive design",
              ],
            },
            detectedAt: new Date(),
          });
        }
      }

      // Check for hardcoded values that should be tokens
      if (
        component.metadata.hardcodedValues &&
        component.metadata.hardcodedValues.length > 0
      ) {
        const hardcoded = component.metadata.hardcodedValues;
        const colorCount = hardcoded.filter((h) => h.type === "color").length;
        const spacingCount = hardcoded.filter(
          (h) => h.type === "spacing" || h.type === "fontSize",
        ).length;

        // Generate token suggestions if available tokens provided
        const tokenSuggestions = options.availableTokens
          ? this.generateTokenSuggestions(hardcoded, options.availableTokens)
          : new Map<string, TokenSuggestion[]>();

        // Group by type for cleaner messaging
        if (colorCount > 0) {
          const colorValues = hardcoded.filter((h) => h.type === "color");

          // Build actionable suggestions
          const suggestions: string[] = [];
          const tokenReplacements: string[] = [];

          for (const cv of colorValues) {
            const suggs = tokenSuggestions.get(cv.value);
            if (suggs && suggs.length > 0) {
              const bestMatch = suggs[0]!;
              tokenReplacements.push(
                `${cv.value} → ${bestMatch.suggestedToken} (${Math.round(bestMatch.confidence * 100)}% match)`,
              );
            }
          }

          if (tokenReplacements.length > 0) {
            suggestions.push(
              `Suggested replacements:\n  ${tokenReplacements.join("\n  ")}`,
            );
          } else {
            suggestions.push(
              "Replace hardcoded colors with design tokens (e.g., var(--primary) or theme.colors.primary)",
            );
          }

          drifts.push({
            id: createDriftId("hardcoded-value", component.id, "color"),
            type: "hardcoded-value",
            severity: "warning",
            source: this.componentToDriftSource(component),
            message: `Component "${component.name}" has ${colorCount} hardcoded color${colorCount > 1 ? "s" : ""}: ${colorValues.map((h) => h.value).join(", ")}`,
            details: {
              suggestions,
              affectedFiles: colorValues.map(
                (h) => `${h.property}: ${h.value} (${h.location})`,
              ),
              tokenSuggestions:
                tokenReplacements.length > 0 ? tokenReplacements : undefined,
            },
            detectedAt: new Date(),
          });
        }

        if (spacingCount > 0) {
          const spacingValues = hardcoded.filter(
            (h) => h.type === "spacing" || h.type === "fontSize",
          );

          // Build actionable suggestions
          const suggestions: string[] = [];
          const tokenReplacements: string[] = [];

          for (const sv of spacingValues) {
            const suggs = tokenSuggestions.get(sv.value);
            if (suggs && suggs.length > 0) {
              const bestMatch = suggs[0]!;
              tokenReplacements.push(
                `${sv.value} → ${bestMatch.suggestedToken} (${Math.round(bestMatch.confidence * 100)}% match)`,
              );
            }
          }

          if (tokenReplacements.length > 0) {
            suggestions.push(
              `Suggested replacements:\n  ${tokenReplacements.join("\n  ")}`,
            );
          } else {
            suggestions.push("Consider using spacing tokens for consistency");
          }

          drifts.push({
            id: createDriftId("hardcoded-value", component.id, "spacing"),
            type: "hardcoded-value",
            severity: "info",
            source: this.componentToDriftSource(component),
            message: `Component "${component.name}" has ${spacingCount} hardcoded size value${spacingCount > 1 ? "s" : ""}: ${spacingValues.map((h) => h.value).join(", ")}`,
            details: {
              suggestions,
              affectedFiles: spacingValues.map(
                (h) => `${h.property}: ${h.value} (${h.location})`,
              ),
              tokenSuggestions:
                tokenReplacements.length > 0 ? tokenReplacements : undefined,
            },
            detectedAt: new Date(),
          });
        }
      }

      // Check for color contrast issues
      if (options.checkAccessibility) {
        const contrastIssues = this.checkColorContrast(component);
        drifts.push(...contrastIssues);
      }
    }

    // Cross-component checks

    // Check for potential duplicate components
    const duplicates = this.detectPotentialDuplicates(components);
    for (const dup of duplicates) {
      drifts.push({
        id: createDriftId(
          "naming-inconsistency",
          dup.components[0]!.id,
          "duplicate",
        ),
        type: "naming-inconsistency",
        severity: "warning",
        source: this.componentToDriftSource(dup.components[0]!),
        message: `Potential duplicate components: ${dup.components.map((c) => c.name).join(", ")}`,
        details: {
          suggestions: [
            "Consider consolidating these components or clarifying their distinct purposes",
          ],
          relatedComponents: dup.components.map((c) => c.name),
        },
        detectedAt: new Date(),
      });
    }

    return { drifts };
  }

  /**
   * Detect the dominant naming patterns in the codebase
   */
  private detectNamingPatterns(components: Component[]): NamingPatternAnalysis {
    const patterns = {
      PascalCase: 0,
      camelCase: 0,
      "kebab-case": 0,
      snake_case: 0,
      other: 0,
    };

    for (const comp of components) {
      const pattern = this.identifyNamingPattern(comp.name);
      patterns[pattern]++;
    }

    // Find dominant pattern (must exceed threshold to be considered dominant)
    const total = components.length;
    let dominant: keyof typeof patterns | null = null;
    let dominantCount = 0;

    for (const [pattern, count] of Object.entries(patterns)) {
      if (
        count > dominantCount &&
        count / total > NAMING_CONFIG.dominantPatternThreshold
      ) {
        dominant = pattern as keyof typeof patterns;
        dominantCount = count;
      }
    }

    return { patterns, dominant, total };
  }

  private identifyNamingPattern(
    name: string,
  ): "PascalCase" | "camelCase" | "kebab-case" | "snake_case" | "other" {
    if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) return "PascalCase";
    if (/^[a-z][a-zA-Z0-9]*$/.test(name)) return "camelCase";
    if (/^[a-z][a-z0-9-]*$/.test(name)) return "kebab-case";
    if (/^[a-z][a-z0-9_]*$/.test(name)) return "snake_case";
    return "other";
  }

  private checkNamingConsistency(
    name: string,
    patterns: NamingPatternAnalysis,
  ): { message: string; suggestion: string } | null {
    if (!patterns.dominant) return null; // No clear pattern, don't flag

    const thisPattern = this.identifyNamingPattern(name);
    if (thisPattern === patterns.dominant) return null;

    // Only flag if this is a clear outlier
    const outlierThreshold = getOutlierThreshold(patterns.total);
    if (patterns.patterns[patterns.dominant]! < outlierThreshold) return null;

    return {
      message: `Component "${name}" uses ${thisPattern} but ${Math.round((patterns.patterns[patterns.dominant]! / patterns.total) * 100)}% of components use ${patterns.dominant}`,
      suggestion: `Consider renaming to match project convention (${patterns.dominant})`,
    };
  }

  /**
   * Build a map of prop names to their types across all components
   */
  private buildPropTypeMap(
    components: Component[],
  ): Map<string, PropTypeUsage> {
    const map = new Map<string, PropTypeUsage>();

    for (const comp of components) {
      for (const prop of comp.props) {
        const normalizedName = prop.name.toLowerCase();
        if (!map.has(normalizedName)) {
          map.set(normalizedName, { types: new Map(), total: 0 });
        }
        const usage = map.get(normalizedName)!;
        const typeCount = usage.types.get(prop.type) || {
          count: 0,
          examples: [],
        };
        typeCount.count++;
        if (typeCount.examples.length < 3) {
          typeCount.examples.push(comp.name);
        }
        usage.types.set(prop.type, typeCount);
        usage.total++;
      }
    }

    return map;
  }

  private checkPropTypeConsistency(
    prop: { name: string; type: string },
    propTypeMap: Map<string, PropTypeUsage>,
  ): { dominantType: string; examples: string[] } | null {
    const usage = propTypeMap.get(prop.name.toLowerCase());
    if (!usage || usage.total < 3) return null; // Not enough data

    // Find dominant type
    let dominantType = "";
    let dominantCount = 0;
    for (const [type, data] of usage.types) {
      if (data.count > dominantCount) {
        dominantType = type;
        dominantCount = data.count;
      }
    }

    // Only flag if this prop's type differs and dominant exceeds threshold
    if (prop.type === dominantType) return null;
    if (
      dominantCount / usage.total <
      NAMING_CONFIG.establishedConventionThreshold
    )
      return null;

    const examples = usage.types.get(dominantType)?.examples || [];
    return { dominantType, examples };
  }

  /**
   * Build a map of semantic prop purposes to their naming patterns
   */
  private buildPropNamingMap(components: Component[]): Map<string, string[]> {
    const map = new Map<string, string[]>();

    // Group props by semantic purpose
    const clickHandlers: string[] = [];
    const changeHandlers: string[] = [];

    for (const comp of components) {
      for (const prop of comp.props) {
        const lower = prop.name.toLowerCase();
        if (lower.includes("click") || lower.includes("press")) {
          clickHandlers.push(prop.name);
        }
        if (lower.includes("change")) {
          changeHandlers.push(prop.name);
        }
      }
    }

    map.set("click", clickHandlers);
    map.set("change", changeHandlers);

    return map;
  }

  private checkPropNamingConsistency(
    component: Component,
    propNamingMap: Map<string, string[]>,
  ): Array<{ propName: string; message: string; suggestion: string }> {
    const issues: Array<{
      propName: string;
      message: string;
      suggestion: string;
    }> = [];

    for (const prop of component.props) {
      const lower = prop.name.toLowerCase();

      // Check click handler naming
      if (lower.includes("click") || lower.includes("press")) {
        const allClickHandlers = propNamingMap.get("click") || [];
        if (allClickHandlers.length >= 5) {
          const dominant = this.findDominantPropPattern(allClickHandlers);
          if (dominant && !prop.name.startsWith(dominant.prefix)) {
            const dominantPct = Math.round(
              (dominant.count / allClickHandlers.length) * 100,
            );
            if (dominantPct >= 70) {
              issues.push({
                propName: prop.name,
                message: `"${prop.name}" in "${component.name}" - ${dominantPct}% of click handlers use "${dominant.prefix}..." pattern`,
                suggestion: `Consider using "${dominant.prefix}${prop.name.replace(/^(on|handle)/i, "")}" for consistency`,
              });
            }
          }
        }
      }
    }

    return issues;
  }

  private findDominantPropPattern(
    propNames: string[],
  ): { prefix: string; count: number } | null {
    const prefixes: Record<string, number> = {};

    for (const name of propNames) {
      if (name.startsWith("on")) prefixes["on"] = (prefixes["on"] || 0) + 1;
      else if (name.startsWith("handle"))
        prefixes["handle"] = (prefixes["handle"] || 0) + 1;
    }

    let dominant: { prefix: string; count: number } | null = null;
    for (const [prefix, count] of Object.entries(prefixes)) {
      if (!dominant || count > dominant.count) {
        dominant = { prefix, count };
      }
    }

    return dominant;
  }

  /**
   * Detect potential duplicate components based on similar names.
   * Only flags true duplicates like Button vs ButtonNew or Card vs CardLegacy.
   * Does NOT flag compound components like Button vs ButtonGroup or Card vs CardHeader.
   */
  private detectPotentialDuplicates(
    components: Component[],
  ): Array<{ components: Component[] }> {
    const duplicates: Array<{ components: Component[] }> = [];
    const processed = new Set<string>();

    for (const comp of components) {
      if (processed.has(comp.id)) continue;

      // Extract base name and check if it has a version suffix
      const { baseName, hasVersionSuffix } = this.extractBaseName(comp.name);

      const similar = components.filter((c) => {
        if (c.id === comp.id) return false;

        const other = this.extractBaseName(c.name);

        // Only match if base names are identical
        if (baseName !== other.baseName || baseName.length < 3) {
          return false;
        }

        // At least one component must have a version suffix to be a duplicate
        // This prevents Button vs ButtonGroup from matching
        // But allows Button vs ButtonNew to match
        return hasVersionSuffix || other.hasVersionSuffix;
      });

      if (similar.length > 0) {
        const group = [comp, ...similar];
        group.forEach((c) => processed.add(c.id));
        duplicates.push({ components: group });
      }
    }

    return duplicates;
  }

  /**
   * Extract the base name from a component name, stripping version suffixes.
   * Returns whether the name had a version suffix (indicating potential duplicate).
   */
  private extractBaseName(name: string): {
    baseName: string;
    hasVersionSuffix: boolean;
  } {
    const lowerName = name.toLowerCase();

    // Check if the name ends with a semantic suffix (legitimate separate component)
    for (const suffix of SEMANTIC_COMPONENT_SUFFIXES) {
      if (
        lowerName.endsWith(suffix) &&
        lowerName.length > suffix.length &&
        // Ensure the suffix is at a word boundary (e.g., "ButtonGroup" not "Buttong")
        // Use [a-z0-9] to handle names like "Button2Group" where digit precedes suffix
        lowerName[lowerName.length - suffix.length - 1]?.match(/[a-z0-9]/)
      ) {
        // This is a compound component, not a duplicate candidate
        // Return the full name as the base (it's distinct)
        return { baseName: lowerName, hasVersionSuffix: false };
      }
    }

    // Check for version suffixes that indicate duplicates
    const hasVersionSuffix = VERSION_SUFFIXES_PATTERN.test(name);
    const strippedName = name
      .replace(VERSION_SUFFIXES_PATTERN, "")
      .replace(/\d+$/, "") // Strip trailing numbers
      .toLowerCase();

    return { baseName: strippedName, hasVersionSuffix };
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

  private findBestMatch(
    source: Component,
    candidates: Component[],
  ): ComponentMatch | null {
    let bestMatch: ComponentMatch | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      const score = this.calculateSimilarity(source, candidate);
      if (score > bestScore) {
        bestScore = score;
        const matchType =
          score > MATCHING_CONFIG.similarMatchThreshold ? "similar" : "partial";
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

    // Name similarity (Levenshtein-based)
    score += weights.name * this.stringSimilarity(a.name, b.name);

    // Use pre-computed metadata for faster overlap calculation
    const aMeta = this.getComponentMetadata(a);
    const bMeta = this.getComponentMetadata(b);

    // Props overlap (using pre-computed Sets)
    const propsIntersection = [...aMeta.props].filter((p) =>
      bMeta.props.has(p),
    ).length;
    const propsUnion = new Set([...aMeta.props, ...bMeta.props]).size;
    score +=
      weights.props * (propsUnion > 0 ? propsIntersection / propsUnion : 0);

    // Variant overlap (using pre-computed Sets)
    const variantsIntersection = [...aMeta.variants].filter((v) =>
      bMeta.variants.has(v),
    ).length;
    const variantsUnion = new Set([...aMeta.variants, ...bMeta.variants]).size;
    score +=
      weights.variants *
      (variantsUnion > 0 ? variantsIntersection / variantsUnion : 0);

    // Dependencies overlap (using pre-computed Sets)
    const depsIntersection = [...aMeta.dependencies].filter((d) =>
      bMeta.dependencies.has(d),
    ).length;
    const depsUnion = new Set([...aMeta.dependencies, ...bMeta.dependencies])
      .size;
    score +=
      weights.dependencies * (depsUnion > 0 ? depsIntersection / depsUnion : 0);

    return score;
  }

  private stringSimilarity(a: string, b: string): number {
    return calcStringSimilarity(a.toLowerCase(), b.toLowerCase());
  }

  private findDifferences(
    source: Component,
    target: Component,
  ): ComponentDifference[] {
    const differences: ComponentDifference[] = [];

    // Compare props
    const sourceProps = new Map(
      source.props.map((p) => [p.name.toLowerCase(), p]),
    );
    const targetProps = new Map(
      target.props.map((p) => [p.name.toLowerCase(), p]),
    );

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

    // Drifts from matches with significant differences
    for (const match of matches) {
      const significantDiffs = match.differences.filter(
        (d) => d.severity === "warning" || d.severity === "critical",
      );

      if (significantDiffs.length > 0) {
        drifts.push({
          id: createDriftId(
            "semantic-mismatch",
            match.source.id,
            match.target.id,
          ),
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

    // Orphaned source components
    for (const comp of orphanedSource) {
      drifts.push({
        id: createDriftId("orphaned-component", comp.id),
        type: "orphaned-component",
        severity: "warning",
        source: this.componentToDriftSource(comp),
        message: `Component "${comp.name}" exists in ${comp.source.type} but has no match in design`,
        details: {
          suggestions: [
            "Add component to Figma or document as intentional deviation",
          ],
        },
        detectedAt: new Date(),
      });
    }

    // Orphaned target components
    for (const comp of orphanedTarget) {
      drifts.push({
        id: createDriftId("orphaned-component", comp.id),
        type: "orphaned-component",
        severity: "info",
        source: this.componentToDriftSource(comp),
        message: `Component "${comp.name}" exists in design but not implemented`,
        details: {
          suggestions: ["Implement component or mark as planned"],
        },
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
      // Handle all file-based sources (react, vue, svelte, astro, angular, templates, etc.)
      location = comp.source.line
        ? `${comp.source.path}:${comp.source.line}`
        : comp.source.path;
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
    if (
      token.source.type === "json" ||
      token.source.type === "css" ||
      token.source.type === "scss"
    ) {
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

  private checkAccessibility(component: Component): string[] {
    const issues: string[] = [];

    // Check if interactive components have required ARIA props
    const interactiveComponents = [
      "Button",
      "Link",
      "Input",
      "Select",
      "Checkbox",
      "Radio",
    ];
    const isInteractive = interactiveComponents.some((ic) =>
      component.name.toLowerCase().includes(ic.toLowerCase()),
    );

    if (isInteractive) {
      const hasAriaLabel = component.props.some(
        (p) =>
          p.name.toLowerCase().includes("arialabel") ||
          p.name.toLowerCase().includes("aria-label"),
      );
      const hasChildren = component.props.some(
        (p) => p.name.toLowerCase() === "children",
      );

      if (
        !hasAriaLabel &&
        !hasChildren &&
        component.metadata.accessibility?.issues
      ) {
        issues.push(...component.metadata.accessibility.issues);
      }
    }

    return issues;
  }

  /**
   * Check for color contrast issues in component
   * Detects foreground/background color pairs that fail WCAG contrast ratios
   */
  private checkColorContrast(component: Component): DriftSignal[] {
    const drifts: DriftSignal[] = [];

    if (!component.metadata.hardcodedValues) {
      return drifts;
    }

    const colorValues = component.metadata.hardcodedValues.filter(
      (h) => h.type === "color",
    );

    // Look for color/background-color pairs
    const colorsByProperty = new Map<string, typeof colorValues>();
    for (const cv of colorValues) {
      const prop = cv.property.toLowerCase();
      if (!colorsByProperty.has(prop)) {
        colorsByProperty.set(prop, []);
      }
      colorsByProperty.get(prop)!.push(cv);
    }

    const foregroundColors = colorsByProperty.get("color") || [];
    const backgroundColors =
      colorsByProperty.get("background-color") ||
      colorsByProperty.get("background") ||
      [];

    // Check contrast ratio for each foreground/background pair
    for (const fg of foregroundColors) {
      for (const bg of backgroundColors) {
        const fgRgb = colorToRgb(fg.value);
        const bgRgb = colorToRgb(bg.value);

        if (!fgRgb || !bgRgb) continue;

        const ratio = getContrastRatio(fgRgb, bgRgb);

        // WCAG AA requires 4.5:1 for normal text, 3:1 for large text
        // WCAG AAA requires 7:1 for normal text, 4.5:1 for large text
        const minRatioAA = 4.5;
        const minRatioAAA = 7;

        if (ratio < minRatioAA) {
          const level = ratio < 3 ? "WCAG AA and AAA" : "WCAG AAA";
          drifts.push({
            id: createDriftId("color-contrast", component.id, `${fg.value}-${bg.value}`),
            type: "color-contrast",
            severity: "critical",
            source: this.componentToDriftSource(component),
            message: `Component "${component.name}" has insufficient color contrast: ${fg.value} on ${bg.value} (ratio: ${ratio.toFixed(2)}:1)`,
            details: {
              expected: `Minimum ${minRatioAA}:1 for WCAG AA, ${minRatioAAA}:1 for AAA`,
              actual: `${ratio.toFixed(2)}:1`,
              suggestions: [
                `Fails ${level} - adjust colors to meet minimum ${minRatioAA}:1 ratio`,
                "Use a contrast checker tool to find accessible color combinations",
                "Consider using design system color tokens with built-in contrast ratios",
              ],
              affectedFiles: [
                `${fg.location}: ${fg.property}: ${fg.value}`,
                `${bg.location}: ${bg.property}: ${bg.value}`,
              ],
            },
            detectedAt: new Date(),
          });
        }
      }
    }

    return drifts;
  }

  /**
   * Check for unused components
   * Components that are defined but never imported/used elsewhere
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
   * Design tokens that are defined but never referenced
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

  /**
   * Find token suggestions for a hardcoded color value
   * Delegates to TokenSuggestionService
   */
  findColorTokenSuggestions(
    hardcodedValue: string,
    tokens: DesignToken[],
    maxSuggestions: number = 3,
  ): TokenSuggestion[] {
    return this.tokenSuggestionService.findColorTokenSuggestions(
      hardcodedValue,
      tokens,
      maxSuggestions,
    );
  }

  /**
   * Find token suggestions for a hardcoded spacing value
   * Delegates to TokenSuggestionService
   */
  findSpacingTokenSuggestions(
    hardcodedValue: string,
    tokens: DesignToken[],
    maxSuggestions: number = 3,
  ): TokenSuggestion[] {
    return this.tokenSuggestionService.findSpacingTokenSuggestions(
      hardcodedValue,
      tokens,
      maxSuggestions,
    );
  }

  /**
   * Generate actionable suggestions for hardcoded values
   * Delegates to TokenSuggestionService
   */
  generateTokenSuggestions(
    hardcodedValues: Array<{
      type: string;
      value: string;
      property: string;
      location: string;
    }>,
    tokens: DesignToken[],
  ): Map<string, TokenSuggestion[]> {
    return this.tokenSuggestionService.generateTokenSuggestions(
      hardcodedValues,
      tokens,
    );
  }
}
