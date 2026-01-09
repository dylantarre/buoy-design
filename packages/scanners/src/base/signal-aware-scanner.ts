import { Scanner, ScannerConfig } from "./scanner.js";
import {
  createSignalAggregator,
  type SignalAggregator,
  type RawSignal,
} from "../signals/index.js";
import type { CollectorStats, SignalEnrichedScanResult } from "../signals/scanner-integration.js";
import type { SignalEmitter } from "../signals/emitter.js";

/**
 * Base scanner class with built-in signal collection support.
 * Extends the base Scanner with methods for collecting and aggregating
 * signals during scanning operations.
 *
 * Scanners that need signal collection should extend this class instead
 * of the base Scanner class.
 */
export abstract class SignalAwareScanner<
  T,
  C extends ScannerConfig = ScannerConfig,
> extends Scanner<T, C> {
  /** Aggregator for collecting signals across all scanned files */
  protected signalAggregator: SignalAggregator = createSignalAggregator();

  /**
   * Clear signals before starting a new scan.
   * Call this at the start of scan() to reset state.
   */
  protected clearSignals(): void {
    this.signalAggregator.clear();
  }

  /**
   * Add signals from a file's emitter to the aggregator.
   * Call this at the end of parseFile() to collect the file's signals.
   *
   * @param filePath The relative file path (used as key)
   * @param emitter The signal emitter from the file's collector
   */
  protected addSignals(filePath: string, emitter: SignalEmitter): void {
    this.signalAggregator.addEmitter(filePath, emitter);
  }

  /**
   * Scan and return signals along with items.
   * This is the signal-enriched version of scan().
   */
  async scanWithSignals(): Promise<SignalEnrichedScanResult<T>> {
    const result = await this.scan();
    return {
      ...result,
      signals: this.signalAggregator.getAllSignals(),
      signalStats: {
        total: this.signalAggregator.getStats().total,
        byType: this.signalAggregator.getStats().byType,
      },
    };
  }

  /**
   * Get signals collected during the last scan.
   * Call after scan() to retrieve signals.
   */
  getCollectedSignals(): RawSignal[] {
    return this.signalAggregator.getAllSignals();
  }

  /**
   * Get signal statistics from the last scan.
   */
  getSignalStats(): CollectorStats {
    const stats = this.signalAggregator.getStats();
    return {
      total: stats.total,
      byType: stats.byType,
    };
  }
}
