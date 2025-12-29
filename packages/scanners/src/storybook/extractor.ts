import { Scanner, ScanResult, ScannerConfig, ScanError, ScanStats } from '../base/scanner.js';
import type { Component, StorybookSource } from '@buoy/core';
import { createComponentId } from '@buoy/core';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';

export interface StorybookScannerConfig extends ScannerConfig {
  url?: string;
  staticDir?: string;
}

interface StorybookIndex {
  v: number;
  entries: Record<string, StorybookEntry>;
}

interface StorybookEntry {
  id: string;
  title: string;
  name: string;
  importPath: string;
  tags?: string[];
  type: 'story' | 'docs';
}

export class StorybookScanner extends Scanner<Component, StorybookScannerConfig> {
  async scan(): Promise<ScanResult<Component>> {
    const startTime = Date.now();
    const components: Component[] = [];
    const errors: ScanError[] = [];

    try {
      const index = await this.fetchStoriesIndex();
      const extractedComponents = this.extractComponents(index);
      components.push(...extractedComponents);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({
        message,
        code: 'STORYBOOK_INDEX_ERROR',
      });
    }

    const stats: ScanStats = {
      filesScanned: 1,
      itemsFound: components.length,
      duration: Date.now() - startTime,
    };

    return { items: components, errors, stats };
  }

  getSourceType(): string {
    return 'storybook';
  }

  private async fetchStoriesIndex(): Promise<StorybookIndex> {
    // Try to read from static directory first
    if (this.config.staticDir) {
      const indexPath = resolve(this.config.staticDir, 'index.json');
      if (existsSync(indexPath)) {
        const content = await readFile(indexPath, 'utf-8');
        return JSON.parse(content);
      }

      // Try stories.json for older Storybook versions
      const storiesPath = resolve(this.config.staticDir, 'stories.json');
      if (existsSync(storiesPath)) {
        const content = await readFile(storiesPath, 'utf-8');
        return this.convertLegacyFormat(JSON.parse(content));
      }

      throw new Error(`No index.json or stories.json found in ${this.config.staticDir}`);
    }

    // Fetch from running Storybook server
    if (this.config.url) {
      // Try index.json (Storybook 7+)
      try {
        const response = await fetch(`${this.config.url}/index.json`);
        if (response.ok) {
          return response.json() as Promise<StorybookIndex>;
        }
      } catch {
        // Try stories.json fallback
      }

      // Try stories.json (older versions)
      const response = await fetch(`${this.config.url}/stories.json`);
      if (!response.ok) {
        throw new Error(`Failed to fetch Storybook index: ${response.status}`);
      }

      const data = (await response.json()) as { stories: Record<string, unknown> };
      return this.convertLegacyFormat(data);
    }

    throw new Error('Either url or staticDir must be configured for Storybook scanner');
  }

  private convertLegacyFormat(data: { stories: Record<string, unknown> }): StorybookIndex {
    const entries: Record<string, StorybookEntry> = {};

    for (const [id, story] of Object.entries(data.stories)) {
      const storyData = story as { title?: string; name?: string; importPath?: string; kind?: string; story?: string };
      entries[id] = {
        id,
        title: storyData.title || storyData.kind || 'Unknown',
        name: storyData.name || storyData.story || 'Default',
        importPath: storyData.importPath || '',
        type: 'story',
      };
    }

    return { v: 3, entries };
  }

  private extractComponents(index: StorybookIndex): Component[] {
    const componentMap = new Map<string, Component>();

    for (const [, entry] of Object.entries(index.entries)) {
      // Skip docs entries
      if (entry.type === 'docs') continue;

      // Extract component ID from title (e.g., "Components/Button" -> "components-button")
      const componentId = entry.title.replace(/\//g, '-').toLowerCase();

      if (!componentMap.has(componentId)) {
        const source: StorybookSource = {
          type: 'storybook',
          storyId: entry.id,
          kind: entry.title,
          url: this.getStorybookUrl(entry.id),
        };

        // Extract component name from title
        const titleParts = entry.title.split('/');
        const name = titleParts[titleParts.length - 1] ?? entry.title;

        componentMap.set(componentId, {
          id: createComponentId(source, name),
          name: name,
          source,
          props: [],
          variants: [],
          tokens: [],
          dependencies: [],
          metadata: {
            tags: entry.tags || [],
          },
          scannedAt: new Date(),
        });
      }

      // Add story as a variant
      const component = componentMap.get(componentId)!;
      component.variants.push({
        name: entry.name,
        props: {},
      });
    }

    return Array.from(componentMap.values());
  }

  private getStorybookUrl(storyId: string): string {
    const baseUrl = this.config.url || '';
    return `${baseUrl}/?path=/story/${storyId}`;
  }
}
