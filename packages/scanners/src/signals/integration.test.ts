import { describe, it, expect } from 'vitest';
import {
  createSignalEmitter,
  createSignalAggregator,
  extractColorSignals,
  extractSpacingSignals,
  extractFontSizeSignals,
  type SignalContext,
} from './index.js';

describe('signals module integration', () => {
  it('exports all signal utilities', () => {
    expect(createSignalEmitter).toBeDefined();
    expect(createSignalAggregator).toBeDefined();
    expect(extractColorSignals).toBeDefined();
    expect(extractSpacingSignals).toBeDefined();
    expect(extractFontSizeSignals).toBeDefined();
  });

  it('works end-to-end', () => {
    const context: SignalContext = {
      fileType: 'tsx',
      framework: 'react',
      scope: 'inline',
      isTokenized: false,
    };

    const emitter = createSignalEmitter();

    // Extract signals
    const colorSignals = extractColorSignals('#3B82F6', 'Button.tsx', 10, 'color', context);
    const spacingSignals = extractSpacingSignals('16px', 'Button.tsx', 11, 'padding', context);

    // Emit them
    for (const signal of colorSignals) emitter.emit(signal);
    for (const signal of spacingSignals) emitter.emit(signal);

    // Aggregate
    const aggregator = createSignalAggregator();
    aggregator.addEmitter('react', emitter);

    // Verify
    const allSignals = aggregator.getAllSignals();
    expect(allSignals).toHaveLength(2);

    const stats = aggregator.getStats();
    expect(stats.total).toBe(2);
    expect(stats.byType['color-value']).toBe(1);
    expect(stats.byType['spacing-value']).toBe(1);
  });
});
