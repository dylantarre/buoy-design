import type { RawSignal, SignalType } from './types.js';

/**
 * Interface for emitting and collecting signals during scanning
 */
export interface SignalEmitter {
  /** Emit a signal (deduplicates by ID) */
  emit(signal: RawSignal): void;

  /** Get all collected signals */
  getSignals(): RawSignal[];

  /** Get signals filtered by type */
  getSignalsByType(type: SignalType): RawSignal[];

  /** Clear all collected signals */
  clear(): void;

  /** Get count of signals by type */
  getCounts(): Partial<Record<SignalType, number>>;
}

/**
 * Create a new signal emitter
 */
export function createSignalEmitter(): SignalEmitter {
  const signals = new Map<string, RawSignal>();

  return {
    emit(signal: RawSignal): void {
      // Deduplicate by ID
      if (!signals.has(signal.id)) {
        signals.set(signal.id, signal);
      }
    },

    getSignals(): RawSignal[] {
      return Array.from(signals.values());
    },

    getSignalsByType(type: SignalType): RawSignal[] {
      return Array.from(signals.values()).filter(s => s.type === type);
    },

    clear(): void {
      signals.clear();
    },

    getCounts(): Partial<Record<SignalType, number>> {
      const counts: Partial<Record<SignalType, number>> = {};
      for (const signal of signals.values()) {
        counts[signal.type] = (counts[signal.type] || 0) + 1;
      }
      return counts;
    },
  };
}
