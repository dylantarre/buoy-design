import { describe, it, expect } from 'vitest';
import {
  createScannerSignalCollector,
  type ScannerSignalCollector,
} from './scanner-integration.js';
import type { SignalContext } from './types.js';

describe('ScannerSignalCollector', () => {
  it('collects color signals from values', () => {
    const collector = createScannerSignalCollector('react', 'src/Button.tsx');

    collector.collectFromValue('#3B82F6', 'color', 10);
    collector.collectFromValue('#fff', 'backgroundColor', 20);

    const signals = collector.getSignals();
    expect(signals).toHaveLength(2);
    expect(signals[0].type).toBe('color-value');
    expect(signals[1].type).toBe('color-value');
  });

  it('collects spacing signals from values', () => {
    const collector = createScannerSignalCollector('react', 'src/Button.tsx');

    collector.collectFromValue('16px', 'padding', 10);
    collector.collectFromValue('1.5rem', 'margin', 20);

    const signals = collector.getSignals();
    expect(signals).toHaveLength(2);
    expect(signals[0].type).toBe('spacing-value');
    expect(signals[1].type).toBe('spacing-value');
  });

  it('collects font signals from values', () => {
    const collector = createScannerSignalCollector('react', 'src/Button.tsx');

    collector.collectFromValue('14px', 'fontSize', 10);
    collector.collectFromValue('"Inter", sans-serif', 'fontFamily', 20);
    collector.collectFromValue('600', 'fontWeight', 30);

    const signals = collector.getSignals();
    expect(signals).toHaveLength(3);
    expect(signals[0].type).toBe('font-size');
    expect(signals[1].type).toBe('font-family');
    expect(signals[2].type).toBe('font-weight');
  });

  it('collects component definition signals', () => {
    const collector = createScannerSignalCollector('react', 'src/Button.tsx');

    collector.collectComponentDef('Button', 5, {
      exportName: 'Button',
      propsCount: 3,
    });

    const signals = collector.getSignals();
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe('component-def');
    expect(signals[0].value).toBe('Button');
    expect(signals[0].metadata.exportName).toBe('Button');
  });

  it('collects component usage signals', () => {
    const collector = createScannerSignalCollector('react', 'src/App.tsx');

    collector.collectComponentUsage('Button', 15, { props: ['size', 'variant'] });

    const signals = collector.getSignals();
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe('component-usage');
  });

  it('collects token definition signals', () => {
    const collector = createScannerSignalCollector('css', 'src/tokens.css');

    collector.collectTokenDef('--primary', '#3B82F6', 5);

    const signals = collector.getSignals();
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe('token-definition');
    expect(signals[0].metadata.tokenName).toBe('--primary');
    expect(signals[0].metadata.tokenValue).toBe('#3B82F6');
  });

  it('collects token usage signals', () => {
    const collector = createScannerSignalCollector('react', 'src/Button.tsx');

    collector.collectTokenUsage('var(--primary)', 10, 'color');

    const signals = collector.getSignals();
    expect(signals).toHaveLength(1);
    expect(signals[0].type).toBe('token-usage');
  });

  it('uses correct context for framework', () => {
    const reactCollector = createScannerSignalCollector('react', 'src/Button.tsx');
    reactCollector.collectFromValue('#fff', 'color', 10);

    const tailwindCollector = createScannerSignalCollector('tailwind', 'src/Button.tsx');
    tailwindCollector.collectFromValue('#fff', 'color', 10);

    expect(reactCollector.getSignals()[0].context.framework).toBe('react');
    expect(tailwindCollector.getSignals()[0].context.framework).toBe('tailwind');
  });

  it('skips tokenized values for hardcoded detection', () => {
    const collector = createScannerSignalCollector('react', 'src/Button.tsx');

    collector.collectFromValue('var(--primary)', 'color', 10);
    collector.collectFromValue('theme.colors.primary', 'color', 20);

    const signals = collector.getSignals();
    // These should not produce color-value signals since they're tokenized
    expect(signals.every(s => s.type !== 'color-value')).toBe(true);
  });

  it('provides stats summary', () => {
    const collector = createScannerSignalCollector('react', 'src/Button.tsx');

    collector.collectFromValue('#fff', 'color', 10);
    collector.collectFromValue('16px', 'padding', 20);
    collector.collectFromValue('14px', 'fontSize', 30);
    collector.collectComponentDef('Button', 5, {});

    const stats = collector.getStats();
    expect(stats.total).toBe(4);
    expect(stats.byType['color-value']).toBe(1);
    expect(stats.byType['spacing-value']).toBe(1);
    expect(stats.byType['font-size']).toBe(1);
    expect(stats.byType['component-def']).toBe(1);
  });
});
