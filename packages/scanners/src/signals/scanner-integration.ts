import { createSignalEmitter, type SignalEmitter } from './emitter.js';
import {
  type RawSignal,
  type SignalContext,
  type SignalType,
  type Framework,
  type FileType,
  createSignalId,
} from './types.js';
import { extractColorSignals } from './extractors/color.js';
import { extractSpacingSignals } from './extractors/spacing.js';
import {
  extractFontSizeSignals,
  extractFontFamilySignals,
  extractFontWeightSignals,
} from './extractors/typography.js';

/**
 * Properties that indicate specific value types
 */
const COLOR_PROPERTIES = new Set([
  'color',
  'backgroundColor',
  'background',
  'borderColor',
  'fill',
  'stroke',
  'outlineColor',
  'textDecorationColor',
  'caretColor',
  'accentColor',
]);

const SPACING_PROPERTIES = new Set([
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'paddingInline',
  'paddingBlock',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginInline',
  'marginBlock',
  'gap',
  'rowGap',
  'columnGap',
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'top',
  'right',
  'bottom',
  'left',
  'inset',
  'size',
]);

/**
 * Stats about collected signals
 */
export interface CollectorStats {
  total: number;
  byType: Partial<Record<SignalType, number>>;
}

/**
 * Collector for gathering signals during a scan operation
 */
export interface ScannerSignalCollector {
  /**
   * Collect signals from a CSS/style value.
   * Automatically determines signal type from property name and value format.
   */
  collectFromValue(value: string, property: string, line: number): void;

  /**
   * Collect a component definition signal
   */
  collectComponentDef(
    name: string,
    line: number,
    metadata?: Record<string, unknown>,
  ): void;

  /**
   * Collect a component usage signal
   */
  collectComponentUsage(
    name: string,
    line: number,
    metadata?: Record<string, unknown>,
  ): void;

  /**
   * Collect a token definition signal
   */
  collectTokenDef(
    tokenName: string,
    tokenValue: string,
    line: number,
    metadata?: Record<string, unknown>,
  ): void;

  /**
   * Collect a token usage signal
   */
  collectTokenUsage(
    usage: string,
    line: number,
    property?: string,
    metadata?: Record<string, unknown>,
  ): void;

  /**
   * Collect a class pattern signal (for Tailwind)
   */
  collectClassPattern(
    classes: string,
    line: number,
    metadata?: Record<string, unknown>,
  ): void;

  /**
   * Get all collected signals
   */
  getSignals(): RawSignal[];

  /**
   * Get statistics about collected signals
   */
  getStats(): CollectorStats;

  /**
   * Get the underlying emitter (for aggregation)
   */
  getEmitter(): SignalEmitter;
}

/**
 * Determine file type from path
 */
function getFileType(path: string): FileType {
  if (path.endsWith('.tsx')) return 'tsx';
  if (path.endsWith('.jsx')) return 'jsx';
  if (path.endsWith('.ts')) return 'ts';
  if (path.endsWith('.js')) return 'js';
  if (path.endsWith('.vue')) return 'vue';
  if (path.endsWith('.svelte')) return 'svelte';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.scss')) return 'scss';
  if (path.endsWith('.less')) return 'less';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.html')) return 'html';
  if (path.includes('.config.')) return 'config';
  return 'ts'; // default
}

/**
 * Create a signal collector for a specific scanner and file
 */
export function createScannerSignalCollector(
  framework: Framework,
  filePath: string,
): ScannerSignalCollector {
  const emitter = createSignalEmitter();
  const fileType = getFileType(filePath);

  const baseContext: SignalContext = {
    fileType,
    framework,
    scope: 'component',
    isTokenized: false,
  };

  return {
    collectFromValue(value: string, property: string, line: number): void {
      // Determine what type of value this is based on property
      if (COLOR_PROPERTIES.has(property)) {
        const signals = extractColorSignals(value, filePath, line, property, {
          ...baseContext,
          scope: 'inline',
        });
        signals.forEach(s => emitter.emit(s));
      } else if (SPACING_PROPERTIES.has(property)) {
        const signals = extractSpacingSignals(value, filePath, line, property, {
          ...baseContext,
          scope: 'inline',
        });
        signals.forEach(s => emitter.emit(s));
      } else if (property === 'fontSize') {
        const signals = extractFontSizeSignals(value, filePath, line, {
          ...baseContext,
          scope: 'inline',
        });
        signals.forEach(s => emitter.emit(s));
      } else if (property === 'fontFamily') {
        const signals = extractFontFamilySignals(value, filePath, line, {
          ...baseContext,
          scope: 'inline',
        });
        signals.forEach(s => emitter.emit(s));
      } else if (property === 'fontWeight') {
        const signals = extractFontWeightSignals(value, filePath, line, {
          ...baseContext,
          scope: 'inline',
        });
        signals.forEach(s => emitter.emit(s));
      } else {
        // Try to detect value type from format
        const colorSignals = extractColorSignals(value, filePath, line, property, {
          ...baseContext,
          scope: 'inline',
        });
        if (colorSignals.length > 0) {
          colorSignals.forEach(s => emitter.emit(s));
          return;
        }

        const spacingSignals = extractSpacingSignals(value, filePath, line, property, {
          ...baseContext,
          scope: 'inline',
        });
        if (spacingSignals.length > 0) {
          spacingSignals.forEach(s => emitter.emit(s));
        }
      }
    },

    collectComponentDef(
      name: string,
      line: number,
      metadata: Record<string, unknown> = {},
    ): void {
      const signal: RawSignal = {
        id: createSignalId('component-def', filePath, line, name),
        type: 'component-def',
        value: name,
        location: { path: filePath, line },
        context: { ...baseContext, scope: 'global' },
        metadata: { ...metadata, componentName: name },
      };
      emitter.emit(signal);
    },

    collectComponentUsage(
      name: string,
      line: number,
      metadata: Record<string, unknown> = {},
    ): void {
      const signal: RawSignal = {
        id: createSignalId('component-usage', filePath, line, name),
        type: 'component-usage',
        value: name,
        location: { path: filePath, line },
        context: { ...baseContext, scope: 'component' },
        metadata: { ...metadata, componentName: name },
      };
      emitter.emit(signal);
    },

    collectTokenDef(
      tokenName: string,
      tokenValue: string,
      line: number,
      metadata: Record<string, unknown> = {},
    ): void {
      const signal: RawSignal = {
        id: createSignalId('token-definition', filePath, line, tokenName),
        type: 'token-definition',
        value: `${tokenName}: ${tokenValue}`,
        location: { path: filePath, line },
        context: { ...baseContext, scope: 'global', isTokenized: true },
        metadata: { ...metadata, tokenName, tokenValue },
      };
      emitter.emit(signal);
    },

    collectTokenUsage(
      usage: string,
      line: number,
      property?: string,
      metadata: Record<string, unknown> = {},
    ): void {
      const signal: RawSignal = {
        id: createSignalId('token-usage', filePath, line, usage),
        type: 'token-usage',
        value: usage,
        location: { path: filePath, line },
        context: { ...baseContext, scope: 'inline', isTokenized: true },
        metadata: { ...metadata, property },
      };
      emitter.emit(signal);
    },

    collectClassPattern(
      classes: string,
      line: number,
      metadata: Record<string, unknown> = {},
    ): void {
      const signal: RawSignal = {
        id: createSignalId('class-pattern', filePath, line, classes),
        type: 'class-pattern',
        value: classes,
        location: { path: filePath, line },
        context: { ...baseContext, scope: 'inline' },
        metadata,
      };
      emitter.emit(signal);
    },

    getSignals(): RawSignal[] {
      return emitter.getSignals();
    },

    getStats(): CollectorStats {
      const signals = emitter.getSignals();
      const byType: Partial<Record<SignalType, number>> = {};

      for (const signal of signals) {
        byType[signal.type] = (byType[signal.type] || 0) + 1;
      }

      return {
        total: signals.length,
        byType,
      };
    },

    getEmitter(): SignalEmitter {
      return emitter;
    },
  };
}

/**
 * Extended scan result that includes signals
 */
export interface SignalEnrichedScanResult<T> {
  items: T[];
  signals: RawSignal[];
  signalStats: CollectorStats;
}
