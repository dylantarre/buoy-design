import { Scanner, ScanResult, ScannerConfig, ScanError, ScanStats } from '../base/scanner.js';
import type { Component, PropDefinition, VariantDefinition, FigmaSource } from '@buoy-design/core';
import { createComponentId } from '@buoy-design/core';
import { FigmaClient, FigmaNode, FigmaFile, FigmaComponentMeta } from './client.js';

export interface FigmaScannerConfig extends ScannerConfig {
  accessToken: string;
  fileKeys: string[];
  componentPageName?: string;
}

export class FigmaComponentScanner extends Scanner<Component, FigmaScannerConfig> {
  private client: FigmaClient;

  constructor(config: FigmaScannerConfig) {
    super(config);
    this.client = new FigmaClient(config.accessToken);
  }

  async scan(): Promise<ScanResult<Component>> {
    const startTime = Date.now();
    const components: Component[] = [];
    const errors: ScanError[] = [];
    let filesScanned = 0;

    for (const fileKey of this.config.fileKeys) {
      try {
        const file = await this.client.getFile(fileKey);
        const fileComponents = this.extractComponents(file, fileKey);
        components.push(...fileComponents);
        filesScanned++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({
          file: fileKey,
          message,
          code: 'FIGMA_API_ERROR',
        });
      }
    }

    const stats: ScanStats = {
      filesScanned,
      itemsFound: components.length,
      duration: Date.now() - startTime,
    };

    return { items: components, errors, stats };
  }

  getSourceType(): string {
    return 'figma';
  }

  private extractComponents(file: FigmaFile, fileKey: string): Component[] {
    const components: Component[] = [];
    const pageName = this.config.componentPageName?.toLowerCase() || 'components';
    const document = file.document;

    // Find the components page
    const componentPage = document.children.find(
      page => page.name.toLowerCase() === pageName
    );

    if (!componentPage || !componentPage.children) {
      // Search all pages if no specific component page found
      for (const page of document.children) {
        if (page.children) {
          this.findComponentsRecursive(page.children, fileKey, file.components, components);
        }
      }
    } else {
      this.findComponentsRecursive(componentPage.children, fileKey, file.components, components);
    }

    return components;
  }

  private findComponentsRecursive(
    nodes: FigmaNode[],
    fileKey: string,
    componentsMeta: Record<string, FigmaComponentMeta>,
    components: Component[]
  ): void {
    for (const node of nodes) {
      // COMPONENT_SET is a group of variants
      if (node.type === 'COMPONENT_SET') {
        const component = this.nodeToComponent(node, fileKey, true, componentsMeta);
        components.push(component);
      }
      // COMPONENT is a single component
      else if (node.type === 'COMPONENT') {
        const component = this.nodeToComponent(node, fileKey, false, componentsMeta);
        components.push(component);
      }

      // Recurse into children
      if (node.children) {
        this.findComponentsRecursive(node.children, fileKey, componentsMeta, components);
      }
    }
  }

  private nodeToComponent(
    node: FigmaNode,
    fileKey: string,
    isComponentSet: boolean,
    componentsMeta: Record<string, FigmaComponentMeta>
  ): Component {
    const source: FigmaSource = {
      type: 'figma',
      fileKey,
      nodeId: node.id,
      url: this.client.getFigmaUrl(fileKey, node.id),
    };

    const props = this.extractProps(node);
    const variants = this.extractVariants(node);

    // Get component metadata from file-level components record
    const meta = componentsMeta[node.id];
    const documentation = meta?.description || undefined;

    // Detect naming inconsistencies in component set children
    const tags = isComponentSet ? ['component-set'] : [];
    if (isComponentSet && this.hasNamingInconsistency(node)) {
      tags.push('naming-inconsistency');
    }

    return {
      id: createComponentId(source, node.name),
      name: this.cleanComponentName(node.name),
      source,
      props,
      variants,
      tokens: [],
      dependencies: [],
      metadata: {
        tags,
        documentation,
      },
      scannedAt: new Date(),
    };
  }

  /**
   * Detect naming inconsistencies in component set children.
   * Checks if variant property names use inconsistent casing patterns.
   */
  private hasNamingInconsistency(node: FigmaNode): boolean {
    if (!node.children || node.children.length === 0) {
      return false;
    }

    const propertyNameCases: Map<string, Set<string>> = new Map();

    for (const child of node.children) {
      if (child.type === 'COMPONENT') {
        const parts = child.name.split(',');
        for (const part of parts) {
          const [key] = part.split('=').map(s => s.trim());
          if (key) {
            const normalizedKey = key.toLowerCase();
            if (!propertyNameCases.has(normalizedKey)) {
              propertyNameCases.set(normalizedKey, new Set());
            }
            propertyNameCases.get(normalizedKey)!.add(key);
          }
        }
      }
    }

    // If any normalized property name has multiple different casings, it's inconsistent
    for (const casings of propertyNameCases.values()) {
      if (casings.size > 1) {
        return true;
      }
    }

    return false;
  }

  private cleanComponentName(name: string): string {
    // Remove any variant suffixes like "Button, State=Hover, Size=Large"
    const baseName = name.split(',')[0] ?? name;
    // Remove any slash prefixes like "Components / Button"
    const parts = baseName.trim().split('/');
    return (parts[parts.length - 1] ?? baseName).trim();
  }

  private extractProps(node: FigmaNode): PropDefinition[] {
    const props: PropDefinition[] = [];

    if (node.componentPropertyDefinitions) {
      for (const [key, def] of Object.entries(node.componentPropertyDefinitions)) {
        // Skip VARIANT type properties - they go to variants, not props
        if (def.type === 'VARIANT') {
          continue;
        }
        props.push({
          name: key,
          type: this.mapFigmaType(def.type),
          required: true,
          defaultValue: def.defaultValue,
        });
      }
    }

    return props;
  }

  private extractVariants(node: FigmaNode): VariantDefinition[] {
    const variantMap = new Map<string, VariantDefinition>();

    if (node.componentPropertyDefinitions) {
      // Find properties that are VARIANT type
      for (const [key, def] of Object.entries(node.componentPropertyDefinitions)) {
        if (def.type === 'VARIANT' && def.variantOptions) {
          for (const option of def.variantOptions) {
            const variantName = `${key}=${option}`;
            variantMap.set(variantName, {
              name: variantName,
              props: { [key]: option },
            });
          }
        }
      }
    }

    // Also extract variants from component set children
    if (node.type === 'COMPONENT_SET' && node.children) {
      for (const child of node.children) {
        if (child.type === 'COMPONENT') {
          // Parse variant props from name like "State=Hover, Size=Large"
          const variantProps = this.parseVariantName(child.name);
          if (Object.keys(variantProps).length > 0) {
            // Use the full child name as key to deduplicate
            // Only add if not already covered by componentPropertyDefinitions
            if (!variantMap.has(child.name)) {
              variantMap.set(child.name, {
                name: child.name,
                props: variantProps,
              });
            }
          }
        }
      }
    }

    return Array.from(variantMap.values());
  }

  private parseVariantName(name: string): Record<string, unknown> {
    const props: Record<string, unknown> = {};
    const parts = name.split(',');

    for (const part of parts) {
      const [key, value] = part.split('=').map(s => s.trim());
      if (key && value) {
        props[key] = value;
      }
    }

    return props;
  }

  private mapFigmaType(figmaType: string): string {
    const typeMap: Record<string, string> = {
      TEXT: 'string',
      BOOLEAN: 'boolean',
      VARIANT: 'enum',
      INSTANCE_SWAP: 'ReactNode',
    };
    return typeMap[figmaType] || figmaType.toLowerCase();
  }
}
