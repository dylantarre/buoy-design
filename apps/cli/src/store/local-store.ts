/**
 * LocalScanStore - Stub implementation.
 *
 * Local history has been removed in favor of cloud storage.
 * This stub exists for API compatibility - use `buoy ahoy login` for persistent history.
 */

import type { Component, DesignToken, DriftSignal } from '@ahoybuoy/core';
import type {
  ScanStore,
  StoredProject,
  StoredScan,
  ScanResults,
  ScanDiff,
  ScanSnapshot,
  ProjectConfig,
} from './types.js';

export interface LocalStoreConfig {
  dbPath?: string;
  inMemory?: boolean;
}

/**
 * Stub implementation that doesn't persist data.
 * Use CloudScanStore (via `buoy ahoy login`) for persistent history.
 */
export class LocalScanStore implements ScanStore {
  private projects = new Map<string, StoredProject>();
  private scansData = new Map<string, StoredScan>();

  constructor(_config: LocalStoreConfig = {}) {
    // No-op - no local persistence
  }

  async getOrCreateProject(name: string, config?: ProjectConfig): Promise<StoredProject> {
    const existing = this.projects.get(name);
    if (existing) return existing;

    const now = new Date();
    const project: StoredProject = {
      id: `proj_${Math.random().toString(36).slice(2, 10)}`,
      name,
      repoUrl: config?.repoUrl,
      figmaFileKeys: config?.figmaFileKeys,
      storybookUrl: config?.storybookUrl,
      config: config?.config,
      createdAt: now,
      updatedAt: now,
    };

    this.projects.set(name, project);
    return project;
  }

  async getProject(projectId: string): Promise<StoredProject | null> {
    for (const project of this.projects.values()) {
      if (project.id === projectId) return project;
    }
    return null;
  }

  async startScan(projectId: string, sources: string[]): Promise<StoredScan> {
    const now = new Date();
    const scan: StoredScan = {
      id: `scan_${Math.random().toString(36).slice(2, 10)}`,
      projectId,
      status: 'running',
      sources,
      startedAt: now,
      createdAt: now,
    };

    this.scansData.set(scan.id, scan);
    return scan;
  }

  async completeScan(scanId: string, _results: ScanResults): Promise<void> {
    const scan = this.scansData.get(scanId);
    if (scan) {
      scan.status = 'completed';
      scan.completedAt = new Date();
    }
  }

  async failScan(scanId: string, error: string): Promise<void> {
    const scan = this.scansData.get(scanId);
    if (scan) {
      scan.status = 'failed';
      scan.errors = [error];
      scan.completedAt = new Date();
    }
  }

  async getLatestScan(_projectId: string): Promise<StoredScan | null> {
    return null; // No persistence
  }

  async getScans(_projectId: string, _limit?: number): Promise<StoredScan[]> {
    return []; // No persistence
  }

  async getScan(scanId: string): Promise<StoredScan | null> {
    return this.scansData.get(scanId) || null;
  }

  async getComponents(_scanId: string): Promise<Component[]> {
    return []; // No persistence
  }

  async getTokens(_scanId: string): Promise<DesignToken[]> {
    return []; // No persistence
  }

  async getDriftSignals(_scanId: string): Promise<DriftSignal[]> {
    return []; // No persistence
  }

  async getSnapshots(_projectId: string, _limit?: number): Promise<ScanSnapshot[]> {
    return []; // No persistence
  }

  async compareScan(_currentScanId: string, _previousScanId: string): Promise<ScanDiff> {
    return {
      added: { components: [], tokens: [], drifts: [] },
      removed: { components: [], tokens: [], drifts: [] },
      modified: { components: [], tokens: [] },
    };
  }

  close(): void {
    // No-op
  }
}
