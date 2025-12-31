import type { DesignToken, DriftSignal } from '@buoy-design/core';
import { TailwindConfigParser } from './config-parser.js';
import { ArbitraryValueDetector } from './arbitrary-detector.js';

export interface TailwindScannerConfig {
  projectRoot: string;
  include?: string[];
  exclude?: string[];
  /** Whether to scan for arbitrary values (default: true) */
  detectArbitraryValues?: boolean;
  /** Whether to extract theme tokens from config (default: true) */
  extractThemeTokens?: boolean;
}

export interface TailwindScanResult {
  tokens: DesignToken[];
  drifts: DriftSignal[];
  configPath: string | null;
  stats: {
    filesScanned: number;
    arbitraryValuesFound: number;
    tokensExtracted: number;
  };
}

export class TailwindScanner {
  private config: TailwindScannerConfig;

  constructor(config: TailwindScannerConfig) {
    this.config = {
      detectArbitraryValues: true,
      extractThemeTokens: true,
      ...config,
    };
  }

  async scan(): Promise<TailwindScanResult> {
    const result: TailwindScanResult = {
      tokens: [],
      drifts: [],
      configPath: null,
      stats: {
        filesScanned: 0,
        arbitraryValuesFound: 0,
        tokensExtracted: 0,
      },
    };

    // Extract theme tokens from tailwind.config.js
    if (this.config.extractThemeTokens) {
      const parser = new TailwindConfigParser(this.config.projectRoot);
      const parsed = await parser.parse();

      if (parsed) {
        result.tokens = parsed.tokens;
        result.configPath = parsed.configPath;
        result.stats.tokensExtracted = parsed.tokens.length;
      }
    }

    // Detect arbitrary values in source files
    if (this.config.detectArbitraryValues) {
      const detector = new ArbitraryValueDetector({
        projectRoot: this.config.projectRoot,
        include: this.config.include,
        exclude: this.config.exclude,
      });

      const arbitraryValues = await detector.detect();
      const driftSignals = await detector.detectAsDriftSignals();

      result.drifts = driftSignals;
      result.stats.arbitraryValuesFound = arbitraryValues.length;
      result.stats.filesScanned = new Set(arbitraryValues.map(v => v.file)).size;
    }

    return result;
  }
}
