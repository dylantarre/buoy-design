import { z } from 'zod';

// Base component source config (shared by all component scanners)
export const ComponentSourceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  include: z.array(z.string()),
  exclude: z.array(z.string()).default(['**/*.test.*', '**/*.spec.*', '**/*.stories.*']),
  designSystemPackage: z.string().optional(),
});

// React source config
export const ReactConfigSchema = ComponentSourceConfigSchema.extend({
  include: z.array(z.string()).default(['src/**/*.tsx', 'src/**/*.jsx']),
});

// Vue source config
export const VueConfigSchema = ComponentSourceConfigSchema.extend({
  include: z.array(z.string()).default(['src/**/*.vue']),
});

// Svelte source config
export const SvelteConfigSchema = ComponentSourceConfigSchema.extend({
  include: z.array(z.string()).default(['src/**/*.svelte']),
});

// Angular source config
export const AngularConfigSchema = ComponentSourceConfigSchema.extend({
  include: z.array(z.string()).default(['src/**/*.component.ts']),
});

// Web component source config (Lit, Stencil)
export const WebComponentConfigSchema = ComponentSourceConfigSchema.extend({
  include: z.array(z.string()).default(['src/**/*.ts']),
  framework: z.enum(['lit', 'stencil', 'auto']).default('auto'),
});

// Template source config (Blade, ERB, Twig, etc.)
export const TemplateConfigSchema = z.object({
  enabled: z.boolean().default(true),
  include: z.array(z.string()),
  exclude: z.array(z.string()).default(['**/vendor/**', '**/cache/**']),
  type: z.enum(['blade', 'erb', 'twig', 'php', 'html', 'njk', 'razor', 'hbs', 'mustache', 'ejs', 'pug', 'liquid', 'slim', 'haml', 'jinja', 'django', 'thymeleaf', 'freemarker', 'go-template', 'astro', 'markdown', 'mdx']),
});

// Figma source config
export const FigmaConfigSchema = z.object({
  enabled: z.boolean().default(false),
  accessToken: z.string().optional(),
  fileKeys: z.array(z.string()).default([]),
  componentPageName: z.string().default('Components'),
  tokenPageName: z.string().default('Design Tokens'),
});

// Storybook source config
export const StorybookConfigSchema = z.object({
  enabled: z.boolean().default(false),
  url: z.string().optional(),
  staticDir: z.string().optional(),
});

// Token source config
export const TokenConfigSchema = z.object({
  enabled: z.boolean().default(true),
  files: z.array(z.string()).default([]),
  cssVariablePrefix: z.string().optional(),
});

// Sources config
export const SourcesConfigSchema = z.object({
  // JS Frameworks
  react: ReactConfigSchema.optional(),
  vue: VueConfigSchema.optional(),
  svelte: SvelteConfigSchema.optional(),
  angular: AngularConfigSchema.optional(),
  webcomponent: WebComponentConfigSchema.optional(),
  // Templates
  templates: TemplateConfigSchema.optional(),
  // Design tools
  figma: FigmaConfigSchema.optional(),
  storybook: StorybookConfigSchema.optional(),
  tokens: TokenConfigSchema.optional(),
});

// Drift ignore pattern
export const DriftIgnoreSchema = z.object({
  type: z.string(),
  pattern: z.string().optional(),
  reason: z.string().optional(),
});

// Drift config
export const DriftConfigSchema = z.object({
  ignore: z.array(DriftIgnoreSchema).default([]),
  severity: z.record(z.enum(['info', 'warning', 'critical'])).default({}),
});

// Claude config
export const ClaudeConfigSchema = z.object({
  enabled: z.boolean().default(false),
  model: z.string().default('claude-sonnet-4-20250514'),
  autoExplain: z
    .object({
      enabled: z.boolean().default(false),
      minSeverity: z.enum(['info', 'warning', 'critical']).default('warning'),
    })
    .optional(),
});

// Project config
export const ProjectConfigSchema = z.object({
  name: z.string(),
  apiEndpoint: z.string().optional(),
});

// Output config
export const OutputConfigSchema = z.object({
  format: z.enum(['table', 'json', 'markdown']).default('table'),
  colors: z.boolean().default(true),
});

// Main config schema
export const BuoyConfigSchema = z.object({
  project: ProjectConfigSchema,
  sources: SourcesConfigSchema.default({}),
  drift: DriftConfigSchema.default({}),
  claude: ClaudeConfigSchema.default({}),
  output: OutputConfigSchema.default({}),
});

// Types
export type ComponentSourceConfig = z.infer<typeof ComponentSourceConfigSchema>;
export type ReactConfig = z.infer<typeof ReactConfigSchema>;
export type VueConfig = z.infer<typeof VueConfigSchema>;
export type SvelteConfig = z.infer<typeof SvelteConfigSchema>;
export type AngularConfig = z.infer<typeof AngularConfigSchema>;
export type WebComponentConfig = z.infer<typeof WebComponentConfigSchema>;
export type TemplateConfig = z.infer<typeof TemplateConfigSchema>;
export type FigmaConfig = z.infer<typeof FigmaConfigSchema>;
export type StorybookConfig = z.infer<typeof StorybookConfigSchema>;
export type TokenConfig = z.infer<typeof TokenConfigSchema>;
export type SourcesConfig = z.infer<typeof SourcesConfigSchema>;
export type DriftIgnore = z.infer<typeof DriftIgnoreSchema>;
export type DriftConfig = z.infer<typeof DriftConfigSchema>;
export type ClaudeConfig = z.infer<typeof ClaudeConfigSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type OutputConfig = z.infer<typeof OutputConfigSchema>;
export type BuoyConfig = z.infer<typeof BuoyConfigSchema>;

// Helper to define config (for user-facing config files)
export function defineConfig(config: BuoyConfig): BuoyConfig {
  return BuoyConfigSchema.parse(config);
}
