/**
 * Example Code Analyzer - Example Code vs Production Code Analysis
 *
 * Detects story files and marks components as "example usage".
 * Compares production code against story examples to understand intended usage.
 *
 * Phase 4.3 of BUOY_ROADMAP.md
 */

import type { Component, DriftSignal, ComponentSource } from "../../models/index.js";
import { createStableDriftId } from "../../models/index.js";

/**
 * Safely get path from component source (handles discriminated union)
 */
function getSourcePath(source: ComponentSource): string | null {
  if (source.type === "react" || source.type === "vue" || source.type === "svelte") {
    return source.path;
  }
  return null;
}

// Patterns that identify example/story code
const EXAMPLE_FILE_PATTERNS = [
  /\.stories\.[jt]sx?$/,
  /\.story\.[jt]sx?$/,
  /\.examples?\.[jt]sx?$/,
  /\.demo\.[jt]sx?$/,
  /\.showcase\.[jt]sx?$/,
  /\/stories\//,
  /\/examples?\//,
  /\/demos?\//,
  /\/playground\//,
  /\/sandbox\//,
  /__stories__\//,
  /__examples__\//,
  /\/docs\//,
  /\.mdx$/,
];

// Patterns that identify test code (not example, but also not production)
const TEST_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /\/__tests__\//,
  /\/tests?\//,
  /\.e2e\.[jt]sx?$/,
];

export type ComponentContext = "production" | "example" | "test" | "unknown";

export interface ComponentWithContext extends Component {
  /** Context where this component was found */
  context: ComponentContext;
  /** Related example components (for production components) */
  relatedExamples?: Component[];
  /** Related production components (for example components) */
  relatedProduction?: Component[];
}

/**
 * Determine if a file path is example/story code
 */
export function isExampleFile(path: string): boolean {
  return EXAMPLE_FILE_PATTERNS.some((p) => p.test(path));
}

/**
 * Determine if a file path is test code
 */
export function isTestFile(path: string): boolean {
  return TEST_FILE_PATTERNS.some((p) => p.test(path));
}

/**
 * Classify a component's context based on its file path
 */
export function classifyComponentContext(component: Component): ComponentContext {
  const path = getSourcePath(component.source) || "";

  if (isExampleFile(path)) {
    return "example";
  }
  if (isTestFile(path)) {
    return "test";
  }
  if (path) {
    return "production";
  }
  return "unknown";
}

/**
 * Annotate components with their context and link related components
 */
export function annotateComponentContexts(
  components: Component[],
): ComponentWithContext[] {
  const annotated: ComponentWithContext[] = components.map((c) => ({
    ...c,
    context: classifyComponentContext(c),
  }));

  // Build lookup maps
  const byName = new Map<string, ComponentWithContext[]>();
  for (const comp of annotated) {
    const name = comp.name.toLowerCase();
    const existing = byName.get(name) || [];
    existing.push(comp);
    byName.set(name, existing);
  }

  // Link related components
  for (const comp of annotated) {
    const name = comp.name.toLowerCase();
    const related = byName.get(name) || [];

    if (comp.context === "production") {
      comp.relatedExamples = related.filter((r) => r.context === "example" && r.id !== comp.id);
    } else if (comp.context === "example") {
      comp.relatedProduction = related.filter((r) => r.context === "production" && r.id !== comp.id);
    }
  }

  return annotated;
}

/**
 * Analyze example coverage - which production components have examples
 */
export function analyzeExampleCoverage(
  components: Component[],
): {
  production: Component[];
  withExamples: Component[];
  withoutExamples: Component[];
  exampleOnly: Component[];
  coveragePercent: number;
} {
  const annotated = annotateComponentContexts(components);

  const production = annotated.filter((c) => c.context === "production");
  const withExamples = production.filter((c) => (c.relatedExamples?.length || 0) > 0);
  const withoutExamples = production.filter((c) => (c.relatedExamples?.length || 0) === 0);
  const exampleOnly = annotated.filter(
    (c) => c.context === "example" && (c.relatedProduction?.length || 0) === 0,
  );

  return {
    production,
    withExamples,
    withoutExamples,
    exampleOnly,
    coveragePercent: production.length > 0
      ? Math.round((withExamples.length / production.length) * 100)
      : 100,
  };
}

/**
 * Compare production component against its example usages
 * Detects patterns used in examples that should be in production
 */
export function compareProductionToExamples(
  production: ComponentWithContext,
): Array<{
  type: "missing-variant" | "missing-prop" | "example-only-pattern";
  description: string;
  exampleSource: string;
}> {
  const issues: Array<{
    type: "missing-variant" | "missing-prop" | "example-only-pattern";
    description: string;
    exampleSource: string;
  }> = [];

  if (!production.relatedExamples || production.relatedExamples.length === 0) {
    return issues;
  }

  // Collect all props and variants used in examples
  const exampleProps = new Set<string>();
  const exampleVariants = new Set<string>();

  for (const example of production.relatedExamples) {
    for (const prop of example.props) {
      exampleProps.add(prop.name.toLowerCase());
    }
    for (const variant of example.variants) {
      exampleVariants.add(variant.name.toLowerCase());
    }
  }

  // Compare against production props
  const productionProps = new Set(production.props.map((p) => p.name.toLowerCase()));
  const productionVariants = new Set(production.variants.map((v) => v.name.toLowerCase()));

  // Props in examples but not in production
  for (const prop of exampleProps) {
    if (!productionProps.has(prop)) {
      const exampleComp = production.relatedExamples!.find((e) =>
        e.props.some((p) => p.name.toLowerCase() === prop),
      );
      issues.push({
        type: "missing-prop",
        description: `Prop "${prop}" used in examples but not defined in production component`,
        exampleSource: exampleComp ? getSourcePath(exampleComp.source) || "unknown" : "unknown",
      });
    }
  }

  // Variants in examples but not in production
  for (const variant of exampleVariants) {
    if (!productionVariants.has(variant)) {
      const exampleComp = production.relatedExamples!.find((e) =>
        e.variants.some((v) => v.name.toLowerCase() === variant),
      );
      issues.push({
        type: "missing-variant",
        description: `Variant "${variant}" used in examples but not defined in production component`,
        exampleSource: exampleComp ? getSourcePath(exampleComp.source) || "unknown" : "unknown",
      });
    }
  }

  return issues;
}

/**
 * Check example code compliance and generate drift signals
 */
export function checkExampleCompliance(components: Component[]): DriftSignal[] {
  const drifts: DriftSignal[] = [];
  const coverage = analyzeExampleCoverage(components);

  // Flag production components without examples (info level)
  for (const comp of coverage.withoutExamples) {
    // Skip internal/utility components that typically don't need examples
    const name = comp.name.toLowerCase();
    if (
      name.includes("context") ||
      name.includes("provider") ||
      name.includes("wrapper") ||
      name.includes("internal") ||
      name.includes("utils")
    ) {
      continue;
    }

    drifts.push({
      id: createStableDriftId("missing-documentation", comp.name),
      type: "missing-documentation",
      severity: "info",
      source: {
        entityType: "component",
        entityId: comp.id,
        entityName: comp.name,
        location: getSourcePath(comp.source) || "",
      },
      message: `Component "${comp.name}" has no example/story files`,
      details: {
        suggestions: [
          "Add a .stories.tsx file to document component usage",
          "Create examples showing common use cases",
          "Consider adding to Storybook for interactive documentation",
        ],
      },
      detectedAt: new Date(),
    });
  }

  // Compare production to examples for inconsistencies
  const annotated = annotateComponentContexts(components);
  for (const comp of annotated.filter((c) => c.context === "production")) {
    const issues = compareProductionToExamples(comp);

    for (const issue of issues) {
      drifts.push({
        id: createStableDriftId("semantic-mismatch", comp.name, {
          property: issue.type,
        }),
        type: "semantic-mismatch",
        severity: "warning",
        source: {
          entityType: "component",
          entityId: comp.id,
          entityName: comp.name,
          location: getSourcePath(comp.source) || "",
        },
        message: `${comp.name}: ${issue.description}`,
        details: {
          expected: "Props/variants defined in production should match example usage",
          actual: issue.description,
          affectedFiles: [issue.exampleSource],
          suggestions: [
            "Add missing prop/variant to production component",
            "Update examples to use only defined props/variants",
            "Document any intentional differences",
          ],
        },
        detectedAt: new Date(),
      });
    }
  }

  // Flag example-only components (might be orphaned examples)
  for (const comp of coverage.exampleOnly) {
    drifts.push({
      id: createStableDriftId("orphaned-component", `example:${comp.name}`),
      type: "orphaned-component",
      severity: "info",
      source: {
        entityType: "component",
        entityId: comp.id,
        entityName: comp.name,
        location: getSourcePath(comp.source) || "",
      },
      message: `Example "${comp.name}" has no corresponding production component`,
      details: {
        suggestions: [
          "This might be a planned component - create the production version",
          "If this is a demo-only component, document it as such",
          "Remove if the example is outdated",
        ],
      },
      detectedAt: new Date(),
    });
  }

  return drifts;
}
