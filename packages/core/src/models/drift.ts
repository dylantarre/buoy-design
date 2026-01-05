import { z } from "zod";

// Drift types
export const DriftTypeSchema = z.enum([
  "deprecated-pattern",
  "accessibility-conflict",
  "semantic-mismatch",
  "orphaned-component",
  "orphaned-token",
  "value-divergence",
  "naming-inconsistency",
  "missing-documentation",
  "hardcoded-value",
  "framework-sprawl",
  "unused-component",
  "unused-token",
  "color-contrast",
]);

// Severity levels
export const SeveritySchema = z.enum(["info", "warning", "critical"]);

// Drift source reference
export const DriftSourceSchema = z.object({
  entityType: z.enum(["component", "token"]),
  entityId: z.string(),
  entityName: z.string(),
  location: z.string(),
});

// Git context for drift forensics (used by `buoy drift explain`)
export const GitContextSchema = z.object({
  // Who last modified this code and when
  blame: z
    .object({
      author: z.string(),
      email: z.string().optional(),
      date: z.date(),
      commitHash: z.string(),
      commitMessage: z.string(),
    })
    .optional(),
  // What the code looked like before the drift was introduced
  previousValue: z.string().optional(),
  // PR/MR context if available
  pullRequest: z
    .object({
      number: z.number(),
      title: z.string(),
      url: z.string().optional(),
    })
    .optional(),
  // Full history of changes to this line/file (most recent first)
  history: z
    .array(
      z.object({
        commitHash: z.string(),
        author: z.string(),
        date: z.date(),
        message: z.string(),
      }),
    )
    .optional(),
});

// Drift details
export const DriftDetailsSchema = z.object({
  expected: z.unknown().optional(),
  actual: z.unknown().optional(),
  diff: z.string().optional(),
  affectedFiles: z.array(z.string()).optional(),
  suggestions: z.array(z.string()).optional(),
  claudeAnalysis: z.string().optional(),
  // For prop type inconsistency
  usedIn: z.array(z.string()).optional(),
  // For duplicate detection
  relatedComponents: z.array(z.string()).optional(),
  // For framework sprawl
  frameworks: z
    .array(
      z.object({
        name: z.string(),
        version: z.string().optional(),
      }),
    )
    .optional(),
  // Git context for understanding how/why drift was introduced
  // Populated by scanner when git info is available, used by `drift explain`
  gitContext: GitContextSchema.optional(),
  // Actionable token suggestions for hardcoded values
  // Format: "hardcodedValue → tokenName (confidence% match)"
  tokenSuggestions: z.array(z.string()).optional(),
});

// Drift resolution
export const DriftResolutionTypeSchema = z.enum([
  "ignored",
  "fixed",
  "documented",
]);

export const DriftResolutionSchema = z.object({
  type: DriftResolutionTypeSchema,
  reason: z.string().optional(),
  resolvedBy: z.string().optional(),
  resolvedAt: z.date(),
});

// Main DriftSignal schema
export const DriftSignalSchema = z.object({
  id: z.string(),
  type: DriftTypeSchema,
  severity: SeveritySchema,
  source: DriftSourceSchema,
  target: DriftSourceSchema.optional(),
  message: z.string(),
  details: DriftDetailsSchema,
  detectedAt: z.date(),
  resolvedAt: z.date().optional(),
  resolution: DriftResolutionSchema.optional(),
});

// Types
export type DriftType = z.infer<typeof DriftTypeSchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type DriftSource = z.infer<typeof DriftSourceSchema>;
export type GitContext = z.infer<typeof GitContextSchema>;
export type DriftDetails = z.infer<typeof DriftDetailsSchema>;
export type DriftResolutionType = z.infer<typeof DriftResolutionTypeSchema>;
export type DriftResolution = z.infer<typeof DriftResolutionSchema>;
export type DriftSignal = z.infer<typeof DriftSignalSchema>;

// Helper to create drift ID (legacy - path-based, breaks on refactor)
export function createDriftId(
  type: DriftType,
  sourceId: string,
  targetId?: string,
): string {
  const base = `drift:${type}:${sourceId}`;
  return targetId ? `${base}:${targetId}` : base;
}

/**
 * Create a content-based drift ID that's stable across refactors.
 * Uses the drift content (type, entity name, values) rather than file paths.
 * This means renaming a file won't break the baseline.
 */
export function createStableDriftId(
  type: DriftType,
  entityName: string,
  details?: {
    expected?: unknown;
    actual?: unknown;
    property?: string;
  }
): string {
  // Build a content fingerprint that doesn't depend on file paths
  const parts = [
    type,
    entityName,
    details?.property,
    typeof details?.expected === 'string' ? details.expected : JSON.stringify(details?.expected),
    typeof details?.actual === 'string' ? details.actual : JSON.stringify(details?.actual),
  ].filter(Boolean);

  // Simple hash function for the content
  const content = parts.join('|');
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Return a readable ID with the hash
  return `drift:${type}:${entityName}:${Math.abs(hash).toString(16)}`;
}

// Helper to get severity weight for sorting
export function getSeverityWeight(severity: Severity): number {
  switch (severity) {
    case "critical":
      return 3;
    case "warning":
      return 2;
    case "info":
      return 1;
  }
}

// Helper to get default severity for drift type
export function getDefaultSeverity(type: DriftType): Severity {
  switch (type) {
    case "accessibility-conflict":
    case "color-contrast":
      return "critical";
    case "deprecated-pattern":
    case "semantic-mismatch":
    case "value-divergence":
    case "hardcoded-value":
    case "framework-sprawl":
    case "unused-component":
      return "warning";
    case "orphaned-component":
    case "orphaned-token":
    case "naming-inconsistency":
    case "missing-documentation":
    case "unused-token":
      return "info";
  }
}

// Human-readable drift type labels
export const DRIFT_TYPE_LABELS: Record<DriftType, string> = {
  "deprecated-pattern": "Deprecated Pattern",
  "accessibility-conflict": "Accessibility Conflict",
  "semantic-mismatch": "Semantic Mismatch",
  "orphaned-component": "Orphaned Component",
  "orphaned-token": "Orphaned Token",
  "value-divergence": "Value Divergence",
  "naming-inconsistency": "Naming Inconsistency",
  "missing-documentation": "Missing Documentation",
  "hardcoded-value": "Hardcoded Value",
  "framework-sprawl": "Framework Sprawl",
  "unused-component": "Unused Component",
  "unused-token": "Unused Token",
  "color-contrast": "Color Contrast",
};

/**
 * Drift Type Descriptions
 *
 * Used for documentation and explaining drift signals to users.
 */
export const DRIFT_TYPE_DESCRIPTIONS: Record<DriftType, string> = {
  "deprecated-pattern":
    "Component uses patterns marked as deprecated in the design system",
  "accessibility-conflict":
    "ARIA attributes, color contrast, or keyboard navigation differs from design system specs",
  "semantic-mismatch":
    "Component or token naming doesn't match the design system's semantic conventions",
  "orphaned-component":
    "Component exists in code but not in the design system (missing from Figma/Storybook)",
  "orphaned-token":
    "Token exists in code but not in the canonical token source",
  "value-divergence":
    "Component prop or token value differs from the canonical design system source",
  "naming-inconsistency":
    "Naming conventions vary across components (e.g., isDisabled vs disabled vs isActive)",
  "missing-documentation":
    "Component lacks required documentation, storybook stories, or usage examples",
  "hardcoded-value":
    "Magic numbers, hex colors, or pixel values that should use design tokens",
  "framework-sprawl":
    "Multiple UI frameworks detected that may indicate migration issues",
  "unused-component":
    "Component is defined but never imported or used elsewhere in the codebase",
  "unused-token":
    "Design token is defined but never referenced in components or stylesheets",
  "color-contrast":
    "Color combinations fail WCAG accessibility contrast ratio requirements",
};

// Human-readable severity labels
export const SEVERITY_LABELS: Record<Severity, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
};
