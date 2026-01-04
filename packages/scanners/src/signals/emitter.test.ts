import { describe, it, expect } from 'vitest';
import { createSignalEmitter } from './emitter.js';
import type { RawSignal } from './types.js';

describe('SignalEmitter', () => {
  it('emits and collects signals', () => {
    const emitter = createSignalEmitter();

    emitter.emit({
      id: 'test-1',
      type: 'color-value',
      value: '#fff',
      location: { path: 'test.tsx', line: 1 },
      context: {
        fileType: 'tsx',
        framework: 'react',
        scope: 'inline',
        isTokenized: false,
      },
      metadata: {},
    });

    emitter.emit({
      id: 'test-2',
      type: 'spacing-value',
      value: '8px',
      location: { path: 'test.tsx', line: 2 },
      context: {
        fileType: 'tsx',
        framework: 'react',
        scope: 'inline',
        isTokenized: false,
      },
      metadata: {},
    });

    const signals = emitter.getSignals();
    expect(signals).toHaveLength(2);
    expect(signals[0].type).toBe('color-value');
    expect(signals[1].type).toBe('spacing-value');
  });

  it('clears signals', () => {
    const emitter = createSignalEmitter();

    emitter.emit({
      id: 'test-1',
      type: 'color-value',
      value: '#fff',
      location: { path: 'test.tsx', line: 1 },
      context: {
        fileType: 'tsx',
        framework: 'react',
        scope: 'inline',
        isTokenized: false,
      },
      metadata: {},
    });

    expect(emitter.getSignals()).toHaveLength(1);
    emitter.clear();
    expect(emitter.getSignals()).toHaveLength(0);
  });

  it('deduplicates by ID', () => {
    const emitter = createSignalEmitter();

    const signal: RawSignal = {
      id: 'same-id',
      type: 'color-value',
      value: '#fff',
      location: { path: 'test.tsx', line: 1 },
      context: {
        fileType: 'tsx',
        framework: 'react',
        scope: 'inline',
        isTokenized: false,
      },
      metadata: {},
    };

    emitter.emit(signal);
    emitter.emit(signal);
    emitter.emit(signal);

    expect(emitter.getSignals()).toHaveLength(1);
  });

  it('filters signals by type', () => {
    const emitter = createSignalEmitter();

    emitter.emit({
      id: 'color-1',
      type: 'color-value',
      value: '#fff',
      location: { path: 'test.tsx', line: 1 },
      context: { fileType: 'tsx', framework: 'react', scope: 'inline', isTokenized: false },
      metadata: {},
    });

    emitter.emit({
      id: 'spacing-1',
      type: 'spacing-value',
      value: '8px',
      location: { path: 'test.tsx', line: 2 },
      context: { fileType: 'tsx', framework: 'react', scope: 'inline', isTokenized: false },
      metadata: {},
    });

    emitter.emit({
      id: 'color-2',
      type: 'color-value',
      value: '#000',
      location: { path: 'test.tsx', line: 3 },
      context: { fileType: 'tsx', framework: 'react', scope: 'inline', isTokenized: false },
      metadata: {},
    });

    const colorSignals = emitter.getSignalsByType('color-value');
    expect(colorSignals).toHaveLength(2);
    expect(colorSignals.every(s => s.type === 'color-value')).toBe(true);
  });
});
