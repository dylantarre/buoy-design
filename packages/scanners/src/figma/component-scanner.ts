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

    // Post-processing: detect potential variants (orphan components that should be in a COMPONENT_SET)
    this.detectPotentialVariants(components);

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

    // Detect incomplete variant matrix
    if (isComponentSet && this.hasIncompleteVariantMatrix(node)) {
      tags.push('incomplete-variant-matrix');
    }

    // Detect duplicate property names (case-insensitive)
    if (this.hasDuplicatePropertyName(node)) {
      tags.push('duplicate-property-name');
    }

    // Add default variant tag for component sets
    if (isComponentSet) {
      const defaultVariant = this.getDefaultVariant(node);
      if (defaultVariant) {
        tags.push(`default-variant:${defaultVariant}`);
      }
    }

    // Add variant dimension tags
    if (isComponentSet && node.componentPropertyDefinitions) {
      for (const [key, def] of Object.entries(node.componentPropertyDefinitions)) {
        if (def.type === 'VARIANT' && def.variantOptions) {
          tags.push(`variant-dimension:${key}[${def.variantOptions.length}]`);
        }
      }
    }

    // Add component key as tag for version tracking
    if (meta?.key) {
      tags.push(`component-key:${meta.key}`);
    }

    // Detect published/remote components
    if (meta?.remote) {
      tags.push('published');
    }

    // Detect deprecated components (from description or naming)
    if (this.isDeprecated(node.name, meta?.description)) {
      tags.push('deprecated');
    }

    // Detect missing descriptions
    if (meta && (!meta.description || meta.description.trim() === '')) {
      tags.push('missing-description');
    }

    // Detect slot components (naming pattern)
    if (this.isSlotComponent(node.name)) {
      tags.push('slot-component');
    }

    // Add hierarchy path as tag for organization tracking
    if (hierarchyPath.length > 0) {
      tags.push(`hierarchy:${hierarchyPath.join('/')}`);
    }

    // Detect single-variant component sets (defeats the purpose of a component set)
    if (isComponentSet && this.isSingleVariant(node)) {
      tags.push('single-variant');
    }

    // Detect boolean variant anti-pattern (VARIANT with true/false values)
    if (isComponentSet && this.hasBooleanVariantAntipattern(node)) {
      tags.push('boolean-variant-antipattern');
    }

    // Detect excessive variant dimensions (complexity indicator)
    if (isComponentSet && this.hasExcessiveVariants(node)) {
      tags.push('excessive-variants');
    }

    // Detect inconsistent boolean property naming
    if (this.hasInconsistentBooleanNaming(node)) {
      tags.push('inconsistent-boolean-naming');
    }

    // Add variant complexity score for component sets
    if (isComponentSet) {
      const complexity = this.calculateVariantComplexity(node);
      if (complexity > 0) {
        tags.push(`variant-complexity:${complexity}`);
      }
    }

    // Detect components using design token variables
    if (node.boundVariables && Object.keys(node.boundVariables).length > 0) {
      tags.push('uses-variables');
    }

    // Detect components that expose nested instance properties (properties with # in name)
    if (this.hasExposedNestedProperties(node)) {
      tags.push('exposes-nested-properties');
    }

    // Add depth tag for deeply nested components
    const depth = hierarchyPath.length;
    if (depth >= 3) {
      tags.push(`depth:${depth}`);
    }

    // Detect size progression patterns in variant values
    if (isComponentSet) {
      const sizeProgression = this.detectSizeProgression(node);
      if (sizeProgression === 'ordered') {
        tags.push('size-progression');
      } else if (sizeProgression === 'unordered') {
        tags.push('unordered-size-variants');
      }
    }

    // Count and tag boolean visibility toggles
    const visibilityToggleCount = this.countVisibilityToggles(node);
    if (visibilityToggleCount > 0) {
      tags.push(`visibility-toggles:${visibilityToggleCount}`);
    }

    // Add containing frame tag (parent frame for organization)
    if (hierarchyPath.length >= 2) {
      // The containing frame is the parent of the component (second-to-last element)
      const containingFrame = hierarchyPath[hierarchyPath.length - 2];
      if (containingFrame) {
        tags.push(`containing-frame:${containingFrame}`);
      }
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

        // Build description, including preferred values for INSTANCE_SWAP
        let description = def.description;
        if (def.type === 'INSTANCE_SWAP' && def.preferredValues?.length) {
          const preferredKeys = def.preferredValues.map(pv => pv.key).join(', ');
          description = description
            ? `${description}\n\nPreferred values: ${preferredKeys}`
            : `Preferred values: ${preferredKeys}`;
        }

        props.push({
          name: key,
          type: this.mapFigmaType(def.type),
          required: true,
          defaultValue: def.defaultValue,
          description,
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
      NUMBER: 'number',
    };
    return typeMap[figmaType] || figmaType.toLowerCase();
  }

  /**
   * Detect incomplete variant matrix.
   * Checks if the actual number of variant children matches the expected
   * count based on the cartesian product of all variant options.
   */
  private hasIncompleteVariantMatrix(node: FigmaNode): boolean {
    if (!node.componentPropertyDefinitions || !node.children) {
      return false;
    }

    // Get all variant properties and their option counts
    const variantDimensions: number[] = [];
    for (const [, def] of Object.entries(node.componentPropertyDefinitions)) {
      if (def.type === 'VARIANT' && def.variantOptions) {
        variantDimensions.push(def.variantOptions.length);
      }
    }

    // If no variant dimensions, no matrix to validate
    if (variantDimensions.length === 0) {
      return false;
    }

    // Calculate expected number of variants (cartesian product)
    const expectedCount = variantDimensions.reduce((acc, count) => acc * count, 1);

    // Count actual COMPONENT children
    const actualCount = node.children.filter(child => child.type === 'COMPONENT').length;

    // If actual count is less than expected, matrix is incomplete
    return actualCount < expectedCount;
  }

  /**
   * Detect duplicate property names (case-insensitive).
   * Flags components where the same property name appears with different casing.
   */
  private hasDuplicatePropertyName(node: FigmaNode): boolean {
    if (!node.componentPropertyDefinitions) {
      return false;
    }

    const normalizedNames = new Map<string, string>();
    for (const key of Object.keys(node.componentPropertyDefinitions)) {
      const normalized = key.toLowerCase();
      if (normalizedNames.has(normalized)) {
        const existingKey = normalizedNames.get(normalized)!;
        if (existingKey !== key) {
          return true;
        }
      }
      normalizedNames.set(normalized, key);
    }

    return false;
  }

  /**
   * Get the default variant for a component set.
   * Returns a string like "Size=Medium, State=Default" based on default values.
   */
  private getDefaultVariant(node: FigmaNode): string | null {
    if (!node.componentPropertyDefinitions) {
      return null;
    }

    const defaultParts: string[] = [];
    for (const [key, def] of Object.entries(node.componentPropertyDefinitions)) {
      if (def.type === 'VARIANT' && def.defaultValue !== undefined) {
        defaultParts.push(`${key}=${def.defaultValue}`);
      }
    }

    return defaultParts.length > 0 ? defaultParts.join(', ') : null;
  }

  /**
   * Detect if a component set has only one variant.
   * A single-variant component set defeats the purpose - it should just be a COMPONENT.
   */
  private isSingleVariant(node: FigmaNode): boolean {
    // Check children count
    if (node.children && node.children.length === 1) {
      return true;
    }

    // Also check componentPropertyDefinitions
    if (node.componentPropertyDefinitions) {
      const variantDefs = Object.values(node.componentPropertyDefinitions).filter(
        def => def.type === 'VARIANT'
      );

      // If all variant dimensions have only one option, it's effectively single variant
      if (variantDefs.length > 0) {
        const allSingleOption = variantDefs.every(
          def => def.variantOptions && def.variantOptions.length === 1
        );
        if (allSingleOption) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Detect if component exposes properties from nested instances.
   * Figma uses # notation for exposed nested properties (e.g., "Button#Icon").
   */
  private hasExposedNestedProperties(node: FigmaNode): boolean {
    if (!node.componentPropertyDefinitions) {
      return false;
    }

    for (const key of Object.keys(node.componentPropertyDefinitions)) {
      if (key.includes('#')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Detect size progression patterns in variant values.
   * Returns 'ordered' if values follow proper size order (xs, sm, md, lg, xl),
   * 'unordered' if size values are present but out of order,
   * null if no size-like values detected.
   */
  private detectSizeProgression(node: FigmaNode): 'ordered' | 'unordered' | null {
    if (!node.componentPropertyDefinitions) {
      return null;
    }

    // Standard size order (lowercase for comparison)
    const sizeOrder = ['2xs', 'xxs', 'xsmall', 'xs', '2xsmall', 'small', 'sm', 'medium', 'md', 'default', 'large', 'lg', 'xlarge', 'xl', '2xl', 'xxl', '2xlarge'];

    // Look for properties that appear to be size-related
    for (const [key, def] of Object.entries(node.componentPropertyDefinitions)) {
      if (def.type !== 'VARIANT' || !def.variantOptions) {
        continue;
      }

      const keyLower = key.toLowerCase();
      if (!keyLower.includes('size') && keyLower !== 'scale') {
        continue;
      }

      const options = def.variantOptions.map(v => v.toLowerCase());

      // Check if these look like size values
      const sizeValues = options.filter(opt =>
        sizeOrder.some(s => opt === s || opt.endsWith(s) || opt.startsWith(s))
      );

      if (sizeValues.length < 2) {
        continue; // Not enough size values to determine order
      }

      // Get indices in standard order
      const indices = sizeValues.map(v => {
        for (let i = 0; i < sizeOrder.length; i++) {
          if (v === sizeOrder[i] || v.endsWith(sizeOrder[i]!) || v.startsWith(sizeOrder[i]!)) {
            return i;
          }
        }
        return -1;
      }).filter(i => i !== -1);

      if (indices.length < 2) {
        continue;
      }

      // Check if indices are in ascending order
      let isOrdered = true;
      for (let i = 1; i < indices.length; i++) {
        if (indices[i]! < indices[i - 1]!) {
          isOrdered = false;
          break;
        }
      }

      return isOrdered ? 'ordered' : 'unordered';
    }

    return null;
  }

  /**
   * Count boolean properties that appear to control visibility.
   * Common patterns: "Show X", "Has X", "X Visible", "Hide X"
   */
  private countVisibilityToggles(node: FigmaNode): number {
    if (!node.componentPropertyDefinitions) {
      return 0;
    }

    const visibilityPatterns = [
      /^show\s/i,
      /^has\s/i,
      /\svisible$/i,
      /^hide\s/i,
      /^display\s/i,
      /^is\s*visible$/i,
      /^visible$/i,
    ];

    let count = 0;
    for (const [key, def] of Object.entries(node.componentPropertyDefinitions)) {
      if (def.type !== 'BOOLEAN') {
        continue;
      }

      const keyLower = key.toLowerCase();
      if (visibilityPatterns.some(pattern => pattern.test(keyLower))) {
        count++;
      }
    }

    return count;
  }

  /**
   * Detect potential variants - standalone COMPONENT nodes that share naming patterns
   * suggesting they should be consolidated into a COMPONENT_SET.
   * Modifies components in place to add 'potential-variant' tag.
   */
  private detectPotentialVariants(components: Component[]): void {
    // Filter to only standalone components (not in a component set)
    const standaloneComponents = components.filter(
      c => !c.metadata.tags?.includes('component-set')
    );

    // Group by base name pattern (e.g., "Button/Primary" -> "Button")
    const baseNameGroups = new Map<string, Component[]>();

    for (const comp of standaloneComponents) {
      // Look for hierarchy patterns from the original name via tags
      const hierarchyTag = comp.metadata.tags?.find(t => t.startsWith('hierarchy:'));
      if (!hierarchyTag) {
        continue;
      }

      const fullPath = hierarchyTag.replace('hierarchy:', '');
      const parts = fullPath.split('/');

      // If there are at least 2 parts and the component is at the end
      if (parts.length >= 2) {
        // The base name is the second-to-last part (parent container)
        const baseName = parts[parts.length - 2];
        if (baseName) {
          if (!baseNameGroups.has(baseName)) {
            baseNameGroups.set(baseName, []);
          }
          baseNameGroups.get(baseName)!.push(comp);
        }
      }
    }

    // Mark components as potential-variant if they share a base name with 2+ other components
    for (const [, group] of baseNameGroups) {
      if (group.length >= 2) {
        for (const comp of group) {
          comp.metadata.tags = comp.metadata.tags || [];
          comp.metadata.tags.push('potential-variant');
        }
      }
    }
  }

  /**
   * Detect if a component is deprecated.
   * Checks both the description and naming conventions.
   */
  private isDeprecated(name: string, description?: string): boolean {
    // Check description for deprecation markers
    if (description) {
      const descLower = description.toLowerCase();
      if (
        descLower.includes('[deprecated]') ||
        descLower.includes('deprecated:') ||
        descLower.startsWith('deprecated') ||
        descLower.includes('⚠️ deprecated') ||
        descLower.includes('do not use')
      ) {
        return true;
      }
    }

    // Check naming conventions for deprecation
    const nameLower = name.toLowerCase();
    if (
      nameLower.startsWith('_deprecated') ||
      nameLower.startsWith('deprecated') ||
      nameLower.includes('/deprecated/') ||
      nameLower.includes('/_deprecated/') ||
      nameLower.startsWith('old-') ||
      nameLower.startsWith('legacy-')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Detect if a component is a slot placeholder component.
   * Common patterns: .SlotName, _slot suffix, placeholder prefix
   */
  private isSlotComponent(name: string): boolean {
    // Dot prefix convention (e.g., ".SlotIcon")
    if (name.startsWith('.')) {
      return true;
    }

    // _slot suffix (e.g., "Icon_slot")
    if (name.toLowerCase().endsWith('_slot')) {
      return true;
    }

    // Placeholder prefix
    if (name.toLowerCase().startsWith('placeholder')) {
      return true;
    }

    // Slot prefix
    if (name.toLowerCase().startsWith('slot-') || name.toLowerCase().startsWith('slot_')) {
      return true;
    }

    return false;
  }

  /**
   * Detect VARIANT properties that should be BOOLEAN properties.
   * If a VARIANT has only "true" and "false" options, it's an anti-pattern.
   */
  private hasBooleanVariantAntipattern(node: FigmaNode): boolean {
    if (!node.componentPropertyDefinitions) {
      return false;
    }

    for (const [, def] of Object.entries(node.componentPropertyDefinitions)) {
      if (def.type !== 'VARIANT' || !def.variantOptions) {
        continue;
      }

      const options = def.variantOptions.map(o => o.toLowerCase());

      // Check if options are exactly true/false (case-insensitive)
      if (
        options.length === 2 &&
        options.includes('true') &&
        options.includes('false')
      ) {
        return true;
      }

      // Also check for yes/no pattern
      if (
        options.length === 2 &&
        options.includes('yes') &&
        options.includes('no')
      ) {
        return true;
      }

      // Check for on/off pattern
      if (
        options.length === 2 &&
        options.includes('on') &&
        options.includes('off')
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Detect excessive variant dimensions.
   * More than 4 variant dimensions indicates high complexity.
   */
  private hasExcessiveVariants(node: FigmaNode): boolean {
    if (!node.componentPropertyDefinitions) {
      return false;
    }

    let variantCount = 0;
    for (const def of Object.values(node.componentPropertyDefinitions)) {
      if (def.type === 'VARIANT') {
        variantCount++;
      }
    }

    // More than 4 variant dimensions is excessive
    return variantCount > 4;
  }

  /**
   * Detect inconsistent boolean property naming patterns.
   * All boolean properties should follow the same convention.
   */
  private hasInconsistentBooleanNaming(node: FigmaNode): boolean {
    if (!node.componentPropertyDefinitions) {
      return false;
    }

    const booleanPatterns: string[] = [];

    for (const [key, def] of Object.entries(node.componentPropertyDefinitions)) {
      if (def.type !== 'BOOLEAN') {
        continue;
      }

      const keyLower = key.toLowerCase();

      // Detect the naming pattern
      if (keyLower.startsWith('is')) {
        booleanPatterns.push('is-prefix');
      } else if (keyLower.startsWith('has')) {
        booleanPatterns.push('has-prefix');
      } else if (keyLower.startsWith('show')) {
        booleanPatterns.push('show-prefix');
      } else if (keyLower.startsWith('hide')) {
        booleanPatterns.push('hide-prefix');
      } else if (keyLower.startsWith('display')) {
        booleanPatterns.push('display-prefix');
      } else if (keyLower.endsWith('visible')) {
        booleanPatterns.push('visible-suffix');
      } else if (keyLower.startsWith('with')) {
        booleanPatterns.push('with-prefix');
      } else {
        booleanPatterns.push('other');
      }
    }

    // If we have 2+ boolean properties and they use different patterns, it's inconsistent
    if (booleanPatterns.length >= 2) {
      const uniquePatterns = new Set(booleanPatterns);
      return uniquePatterns.size > 1;
    }

    return false;
  }

  /**
   * Calculate variant complexity score.
   * The score is the total number of possible variant combinations.
   */
  private calculateVariantComplexity(node: FigmaNode): number {
    if (!node.componentPropertyDefinitions) {
      return 0;
    }

    let complexity = 1;
    let hasVariants = false;

    for (const def of Object.values(node.componentPropertyDefinitions)) {
      if (def.type === 'VARIANT' && def.variantOptions) {
        hasVariants = true;
        complexity *= def.variantOptions.length;
      }
    }

    return hasVariants ? complexity : 0;
  }
}
