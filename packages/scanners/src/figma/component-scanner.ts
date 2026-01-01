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
    components: Component[],
    parentPath: string[] = []
  ): void {
    for (const node of nodes) {
      const currentPath = [...parentPath, node.name];

      // COMPONENT_SET is a group of variants
      if (node.type === 'COMPONENT_SET') {
        const component = this.nodeToComponent(node, fileKey, true, componentsMeta, currentPath);
        components.push(component);
      }
      // COMPONENT is a single component
      else if (node.type === 'COMPONENT') {
        const component = this.nodeToComponent(node, fileKey, false, componentsMeta, currentPath);
        components.push(component);
      }

      // Recurse into children
      if (node.children) {
        this.findComponentsRecursive(node.children, fileKey, componentsMeta, components, currentPath);
      }
    }
  }

  private nodeToComponent(
    node: FigmaNode,
    fileKey: string,
    isComponentSet: boolean,
    componentsMeta: Record<string, FigmaComponentMeta>,
    hierarchyPath: string[] = []
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

    // Build documentation string including links
    let documentation = meta?.description || undefined;
    if (meta?.documentationLinks?.length) {
      const linksSection = meta.documentationLinks.join('\n');
      documentation = documentation
        ? `${documentation}\n\nDocumentation:\n${linksSection}`
        : `Documentation:\n${linksSection}`;
    }

    // Detect naming inconsistencies in component set children
    const tags: string[] = isComponentSet ? ['component-set'] : [];
    if (isComponentSet && this.hasNamingInconsistency(node)) {
      tags.push('naming-inconsistency');
    }

    // Detect empty component sets
    if (isComponentSet && (!node.children || node.children.length === 0)) {
      tags.push('empty-component-set');
    }

    // Detect variant value format inconsistencies
    if (isComponentSet && this.hasVariantValueInconsistency(node)) {
      tags.push('variant-value-inconsistency');
    }

    // Detect mixed naming conventions in property names
    if (isComponentSet && this.hasMixedNamingConvention(node)) {
      tags.push('mixed-naming-convention');
    }

    // Add component key as tag for version tracking
    if (meta?.key) {
      tags.push(`component-key:${meta.key}`);
    }

    // Add hierarchy path as tag for organization tracking
    if (hierarchyPath.length > 0) {
      tags.push(`hierarchy:${hierarchyPath.join('/')}`);
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

  /**
   * Detect variant value format inconsistencies.
   * Checks if variant values use inconsistent formats across properties
   * (e.g., short format "sm/md/lg" vs full names "Small/Medium/Large").
   */
  private hasVariantValueInconsistency(node: FigmaNode): boolean {
    if (!node.componentPropertyDefinitions) {
      return false;
    }

    const variantFormats: ('short' | 'full')[] = [];

    for (const [, def] of Object.entries(node.componentPropertyDefinitions)) {
      if (def.type === 'VARIANT' && def.variantOptions) {
        const format = this.detectValueFormat(def.variantOptions);
        if (format !== 'mixed') {
          variantFormats.push(format);
        }
      }
    }

    // If we have both short and full formats, it's inconsistent
    if (variantFormats.length >= 2) {
      const hasShort = variantFormats.includes('short');
      const hasFull = variantFormats.includes('full');
      return hasShort && hasFull;
    }

    return false;
  }

  /**
   * Detect the format of variant values.
   * Short format: 2-3 character lowercase values (sm, md, lg, xs, xl, etc.)
   * Full format: Capitalized words (Small, Medium, Large, Default, etc.)
   */
  private detectValueFormat(values: string[]): 'short' | 'full' | 'mixed' {
    let shortCount = 0;
    let fullCount = 0;

    for (const value of values) {
      // Short format: 2-4 chars, all lowercase
      if (/^[a-z]{2,4}$/.test(value)) {
        shortCount++;
      }
      // Full format: starts with capital, more than 4 chars or contains spaces
      else if (/^[A-Z][a-zA-Z]*(\s[A-Z][a-zA-Z]*)*$/.test(value) && value.length > 3) {
        fullCount++;
      }
    }

    if (shortCount === values.length) return 'short';
    if (fullCount === values.length) return 'full';
    return 'mixed';
  }

  /**
   * Detect mixed naming conventions in variant property names.
   * Checks for inconsistent use of PascalCase, camelCase, or kebab-case.
   */
  private hasMixedNamingConvention(node: FigmaNode): boolean {
    if (!node.componentPropertyDefinitions) {
      return false;
    }

    const conventions = new Set<string>();

    for (const key of Object.keys(node.componentPropertyDefinitions)) {
      const def = node.componentPropertyDefinitions[key];
      if (def?.type === 'VARIANT') {
        const convention = this.detectNamingConvention(key);
        conventions.add(convention);
      }
    }

    // If we have more than one naming convention, it's mixed
    return conventions.size > 1;
  }

  /**
   * Detect the naming convention of a property name.
   */
  private detectNamingConvention(name: string): string {
    // kebab-case: contains hyphen
    if (name.includes('-')) {
      return 'kebab-case';
    }

    // PascalCase: starts with uppercase, no hyphens
    if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) {
      return 'PascalCase';
    }

    // camelCase: starts with lowercase, contains uppercase
    if (/^[a-z][a-zA-Z0-9]*$/.test(name) && /[A-Z]/.test(name)) {
      return 'camelCase';
    }

    // lowercase: all lowercase
    if (/^[a-z]+$/.test(name)) {
      return 'lowercase';
    }

    // Other/unknown
    return 'other';
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
