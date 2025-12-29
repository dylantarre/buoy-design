import { z } from 'zod';

// Component source location types
export const ReactSourceSchema = z.object({
  type: z.literal('react'),
  path: z.string(),
  exportName: z.string(),
  line: z.number().optional(),
});

export const FigmaSourceSchema = z.object({
  type: z.literal('figma'),
  fileKey: z.string(),
  nodeId: z.string(),
  url: z.string().optional(),
});

export const StorybookSourceSchema = z.object({
  type: z.literal('storybook'),
  storyId: z.string(),
  kind: z.string(),
  url: z.string().optional(),
});

export const VueSourceSchema = z.object({
  type: z.literal('vue'),
  path: z.string(),
  exportName: z.string(),
  line: z.number().optional(),
});

export const SvelteSourceSchema = z.object({
  type: z.literal('svelte'),
  path: z.string(),
  exportName: z.string(),
  line: z.number().optional(),
});

export const ComponentSourceSchema = z.discriminatedUnion('type', [
  ReactSourceSchema,
  FigmaSourceSchema,
  StorybookSourceSchema,
  VueSourceSchema,
  SvelteSourceSchema,
]);

// Prop definitions
export const PropDefinitionSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  defaultValue: z.unknown().optional(),
  description: z.string().optional(),
});

// Variant definitions
export const VariantDefinitionSchema = z.object({
  name: z.string(),
  props: z.record(z.unknown()),
});

// Token references within components
export const TokenReferenceSchema = z.object({
  tokenId: z.string(),
  tokenName: z.string(),
  usage: z.enum(['color', 'spacing', 'typography', 'shadow', 'border', 'other']),
  location: z.string(),
});

// Accessibility info
export const AccessibilityInfoSchema = z.object({
  hasAriaLabel: z.boolean().optional(),
  hasRole: z.boolean().optional(),
  issues: z.array(z.string()).optional(),
});

// Hardcoded style value (could be a token)
export const HardcodedValueSchema = z.object({
  type: z.enum(['color', 'spacing', 'fontSize', 'fontFamily', 'shadow', 'border', 'other']),
  value: z.string(),
  property: z.string(), // e.g., 'backgroundColor', 'padding', 'color'
  location: z.string(), // line:column or description
});

// Component metadata
export const ComponentMetadataSchema = z.object({
  deprecated: z.boolean().optional(),
  deprecationReason: z.string().optional(),
  tags: z.array(z.string()).optional(),
  accessibility: AccessibilityInfoSchema.optional(),
  documentation: z.string().optional(),
  hardcodedValues: z.array(HardcodedValueSchema).optional(),
});

// Main Component schema
export const ComponentSchema = z.object({
  id: z.string(),
  name: z.string(),
  source: ComponentSourceSchema,
  props: z.array(PropDefinitionSchema),
  variants: z.array(VariantDefinitionSchema),
  tokens: z.array(TokenReferenceSchema),
  dependencies: z.array(z.string()),
  metadata: ComponentMetadataSchema,
  scannedAt: z.date(),
});

// Types
export type ReactSource = z.infer<typeof ReactSourceSchema>;
export type FigmaSource = z.infer<typeof FigmaSourceSchema>;
export type StorybookSource = z.infer<typeof StorybookSourceSchema>;
export type VueSource = z.infer<typeof VueSourceSchema>;
export type SvelteSource = z.infer<typeof SvelteSourceSchema>;
export type ComponentSource = z.infer<typeof ComponentSourceSchema>;
export type PropDefinition = z.infer<typeof PropDefinitionSchema>;
export type VariantDefinition = z.infer<typeof VariantDefinitionSchema>;
export type TokenReference = z.infer<typeof TokenReferenceSchema>;
export type AccessibilityInfo = z.infer<typeof AccessibilityInfoSchema>;
export type HardcodedValue = z.infer<typeof HardcodedValueSchema>;
export type ComponentMetadata = z.infer<typeof ComponentMetadataSchema>;
export type Component = z.infer<typeof ComponentSchema>;

// Helper to create component ID
export function createComponentId(source: ComponentSource, _name: string): string {
  switch (source.type) {
    case 'react':
      return `react:${source.path}:${source.exportName}`;
    case 'figma':
      return `figma:${source.fileKey}:${source.nodeId}`;
    case 'storybook':
      return `storybook:${source.storyId}`;
    case 'vue':
      return `vue:${source.path}:${source.exportName}`;
    case 'svelte':
      return `svelte:${source.path}:${source.exportName}`;
  }
}

// Helper to normalize component name for matching
export function normalizeComponentName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-_\s]/g, '')
    .replace(/component$/i, '');
}
