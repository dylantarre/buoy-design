import { z } from 'zod';

// Token value types
export const ColorValueSchema = z.object({
  type: z.literal('color'),
  hex: z.string(),
  rgba: z.object({
    r: z.number(),
    g: z.number(),
    b: z.number(),
    a: z.number(),
  }).optional(),
});

export const SpacingValueSchema = z.object({
  type: z.literal('spacing'),
  value: z.number(),
  unit: z.enum(['px', 'rem', 'em']),
});

export const TypographyValueSchema = z.object({
  type: z.literal('typography'),
  fontFamily: z.string(),
  fontSize: z.number(),
  fontWeight: z.number(),
  lineHeight: z.number().optional(),
  letterSpacing: z.number().optional(),
});

export const ShadowValueSchema = z.object({
  type: z.literal('shadow'),
  x: z.number(),
  y: z.number(),
  blur: z.number(),
  spread: z.number(),
  color: z.string(),
});

export const BorderValueSchema = z.object({
  type: z.literal('border'),
  width: z.number(),
  style: z.enum(['solid', 'dashed', 'dotted', 'none']),
  color: z.string(),
  radius: z.number().optional(),
});

export const RawValueSchema = z.object({
  type: z.literal('raw'),
  value: z.string(),
});

export const TokenValueSchema = z.discriminatedUnion('type', [
  ColorValueSchema,
  SpacingValueSchema,
  TypographyValueSchema,
  ShadowValueSchema,
  BorderValueSchema,
  RawValueSchema,
]);

// Token source types
export const CssTokenSourceSchema = z.object({
  type: z.literal('css'),
  path: z.string(),
  selector: z.string().optional(),
  line: z.number().optional(),
});

export const JsonTokenSourceSchema = z.object({
  type: z.literal('json'),
  path: z.string(),
  key: z.string().optional(),
});

export const ScssTokenSourceSchema = z.object({
  type: z.literal('scss'),
  path: z.string(),
  variableName: z.string(),
  line: z.number().optional(),
});

export const FigmaTokenSourceSchema = z.object({
  type: z.literal('figma'),
  fileKey: z.string(),
  variableId: z.string().optional(),
  collectionName: z.string().optional(),
});

export const TypeScriptTokenSourceSchema = z.object({
  type: z.literal('typescript'),
  path: z.string(),
  typeName: z.string(),
  line: z.number().optional(),
});

export const TokenSourceSchema = z.discriminatedUnion('type', [
  CssTokenSourceSchema,
  JsonTokenSourceSchema,
  ScssTokenSourceSchema,
  FigmaTokenSourceSchema,
  TypeScriptTokenSourceSchema,
]);

// Token category
export const TokenCategorySchema = z.enum([
  'color',
  'spacing',
  'typography',
  'shadow',
  'border',
  'sizing',
  'motion',
  'other',
]);

// Token metadata
export const TokenMetadataSchema = z.object({
  deprecated: z.boolean().optional(),
  deprecationReason: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// Main Token schema
export const DesignTokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: TokenCategorySchema,
  value: TokenValueSchema,
  source: TokenSourceSchema,
  aliases: z.array(z.string()),
  usedBy: z.array(z.string()),
  metadata: TokenMetadataSchema,
  scannedAt: z.date(),
});

// Types
export type ColorValue = z.infer<typeof ColorValueSchema>;
export type SpacingValue = z.infer<typeof SpacingValueSchema>;
export type TypographyValue = z.infer<typeof TypographyValueSchema>;
export type ShadowValue = z.infer<typeof ShadowValueSchema>;
export type BorderValue = z.infer<typeof BorderValueSchema>;
export type RawValue = z.infer<typeof RawValueSchema>;
export type TokenValue = z.infer<typeof TokenValueSchema>;
export type CssTokenSource = z.infer<typeof CssTokenSourceSchema>;
export type JsonTokenSource = z.infer<typeof JsonTokenSourceSchema>;
export type ScssTokenSource = z.infer<typeof ScssTokenSourceSchema>;
export type FigmaTokenSource = z.infer<typeof FigmaTokenSourceSchema>;
export type TypeScriptTokenSource = z.infer<typeof TypeScriptTokenSourceSchema>;
export type TokenSource = z.infer<typeof TokenSourceSchema>;
export type TokenCategory = z.infer<typeof TokenCategorySchema>;
export type TokenMetadata = z.infer<typeof TokenMetadataSchema>;
export type DesignToken = z.infer<typeof DesignTokenSchema>;

// Helper to create token ID
export function createTokenId(source: TokenSource, name: string): string {
  switch (source.type) {
    case 'css':
      return `css:${source.path}:${name}`;
    case 'json':
      return `json:${source.path}:${name}`;
    case 'scss':
      return `scss:${source.path}:${source.variableName}`;
    case 'figma':
      return `figma:${source.fileKey}:${source.variableId || name}`;
    case 'typescript':
      return `typescript:${source.path}:${source.typeName}:${name}`;
  }
}

// Helper to normalize token name for matching
export function normalizeTokenName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-_\s.]/g, '');
}

// Helper to compare token values
export function tokensMatch(a: TokenValue, b: TokenValue): boolean {
  if (a.type !== b.type) return false;

  switch (a.type) {
    case 'color':
      return a.hex.toLowerCase() === (b as ColorValue).hex.toLowerCase();
    case 'spacing':
      return a.value === (b as SpacingValue).value && a.unit === (b as SpacingValue).unit;
    case 'typography':
      const bTypo = b as TypographyValue;
      return (
        a.fontFamily === bTypo.fontFamily &&
        a.fontSize === bTypo.fontSize &&
        a.fontWeight === bTypo.fontWeight
      );
    case 'shadow':
      const bShadow = b as ShadowValue;
      return (
        a.x === bShadow.x &&
        a.y === bShadow.y &&
        a.blur === bShadow.blur &&
        a.spread === bShadow.spread &&
        a.color.toLowerCase() === bShadow.color.toLowerCase()
      );
    case 'border':
      const bBorder = b as BorderValue;
      return (
        a.width === bBorder.width &&
        a.style === bBorder.style &&
        a.color.toLowerCase() === bBorder.color.toLowerCase()
      );
    case 'raw':
      return a.value === (b as RawValue).value;
    default:
      return false;
  }
}
