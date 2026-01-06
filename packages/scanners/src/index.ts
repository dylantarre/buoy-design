// Base
export { Scanner, type ScannerConfig, type ScanResult, type ScanError, type ScanStats } from './base/index.js';

// Style extractors
export * from './extractors/index.js';

// Git/local scanners
export { ReactComponentScanner, type ReactScannerConfig } from './git/index.js';
export { TokenScanner, type TokenScannerConfig } from './git/index.js';

// Figma scanner
export { FigmaClient, FigmaComponentScanner, type FigmaScannerConfig } from './figma/index.js';

// Storybook scanner
export { StorybookScanner, type StorybookScannerConfig } from './storybook/index.js';

// Tailwind scanner
export { TailwindScanner, TailwindConfigParser, ArbitraryValueDetector } from './tailwind/index.js';
export type { TailwindScannerConfig, TailwindScanResult, TailwindTheme, ArbitraryValue, SemanticToken } from './tailwind/index.js';

// CSS analyzer
export { CssScanner, analyzeCss, mergeAnalyses } from './css/index.js';
export type { CssScannerOptions, CssScanResult, CssAnalysis, ColorValue, SpacingValue, FontValue } from './css/index.js';

// Plugin adapter
export { createPluginFromScanner } from './plugin-adapter.js';

// Cache (Incremental Scanning)
export { ScanCache, type ScanCacheData, type FileCacheEntry, type CacheCheckResult, type CacheOptions, CACHE_VERSION } from './cache/index.js';

// Signals (Pattern Mining Engine)
export {
  // Types
  type RawSignal,
  type SignalType,
  type SignalContext,
  type SourceLocation,
  type FileType,
  type Framework,
  type Scope,
  RawSignalSchema,
  SignalTypeSchema,
  createSignalId,
  // Emitter
  type SignalEmitter,
  createSignalEmitter,
  // Aggregator
  type SignalAggregator,
  type SignalStats,
  createSignalAggregator,
  // Extractors
  extractColorSignals,
  extractSpacingSignals,
  extractFontSizeSignals,
  extractFontFamilySignals,
  extractFontWeightSignals,
} from './signals/index.js';
