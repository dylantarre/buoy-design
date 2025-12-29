// Component models
export {
  ComponentSchema,
  ComponentSourceSchema,
  ReactSourceSchema,
  FigmaSourceSchema,
  StorybookSourceSchema,
  VueSourceSchema,
  SvelteSourceSchema,
  PropDefinitionSchema,
  VariantDefinitionSchema,
  TokenReferenceSchema,
  AccessibilityInfoSchema,
  HardcodedValueSchema,
  ComponentMetadataSchema,
  createComponentId,
  normalizeComponentName,
} from './component.js';

export type {
  Component,
  ComponentSource,
  ReactSource,
  FigmaSource,
  StorybookSource,
  VueSource,
  SvelteSource,
  PropDefinition,
  VariantDefinition,
  TokenReference,
  AccessibilityInfo,
  HardcodedValue,
  ComponentMetadata,
} from './component.js';

// Token models
export {
  DesignTokenSchema,
  TokenValueSchema,
  ColorValueSchema,
  SpacingValueSchema,
  TypographyValueSchema,
  ShadowValueSchema,
  BorderValueSchema,
  RawValueSchema,
  TokenSourceSchema,
  CssTokenSourceSchema,
  JsonTokenSourceSchema,
  ScssTokenSourceSchema,
  FigmaTokenSourceSchema,
  TokenCategorySchema,
  TokenMetadataSchema,
  createTokenId,
  normalizeTokenName,
  tokensMatch,
} from './token.js';

export type {
  DesignToken,
  TokenValue,
  ColorValue,
  SpacingValue,
  TypographyValue,
  ShadowValue,
  BorderValue,
  RawValue,
  TokenSource,
  CssTokenSource,
  JsonTokenSource,
  ScssTokenSource,
  FigmaTokenSource,
  TokenCategory,
  TokenMetadata,
} from './token.js';

// Drift models
export {
  DriftSignalSchema,
  DriftTypeSchema,
  SeveritySchema,
  DriftSourceSchema,
  SuggestedActionSchema,
  GitContextSchema,
  DriftDetailsSchema,
  DriftResolutionSchema,
  DriftResolutionTypeSchema,
  createDriftId,
  getSeverityWeight,
  getDefaultSeverity,
  DRIFT_TYPE_LABELS,
  SEVERITY_LABELS,
} from './drift.js';

export type {
  DriftSignal,
  DriftType,
  Severity,
  DriftSource,
  SuggestedAction,
  GitContext,
  DriftDetails,
  DriftResolution,
  DriftResolutionType,
} from './drift.js';

// Intent models
export {
  IntentSchema,
  IntentDecisionSchema,
  IntentDecisionTypeSchema,
  IntentStatusSchema,
  IntentAttachmentSchema,
  IntentAttachmentTypeSchema,
  IntentContextSchema,
  createIntentId,
  isIntentExpired,
  intentApplies,
  DECISION_TYPE_LABELS,
  STATUS_LABELS,
} from './intent.js';

export type {
  Intent,
  IntentDecision,
  IntentDecisionType,
  IntentStatus,
  IntentAttachment,
  IntentAttachmentType,
  IntentContext,
} from './intent.js';
