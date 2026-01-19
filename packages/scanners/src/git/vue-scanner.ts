import { SignalAwareScanner, ScanResult, ScannerConfig } from "../base/index.js";
import type { Component, PropDefinition, VueSource, HardcodedValue } from "@buoy-design/core";
import { createComponentId } from "@buoy-design/core";
import { readFile } from "fs/promises";
import { relative, basename, dirname, resolve } from "path";
import {
  extractBalancedBraces,
  parseTypeScriptInterfaceProps,
} from "../utils/parser-utils.js";
import { getHardcodedValueType } from "../patterns/index.js";
import { existsSync } from "fs";
import {
  createScannerSignalCollector,
  type ScannerSignalCollector,
} from "../signals/scanner-integration.js";

export interface VueScannerConfig extends ScannerConfig {
  designSystemPackage?: string;
}

interface VueMetadata {
  deprecated: boolean;
  tags: string[];
  extendsComponent?: string;
  defineOptionsName?: string;
  /** External props reference (e.g., 'buttonProps' when using defineProps(buttonProps)) */
  externalPropsRef?: string;
  /** Props that map to design system tokens (color, variant, size, etc.) */
  styleProps?: string[];
  /** Subcomponents exposed via defineExpose for compound component pattern */
  subComponents?: string[];
  /** Generic type parameter from script setup generic="T" */
  genericType?: string;
  /** Emits defined via defineEmits */
  emits?: string[];
}

export class VueComponentScanner extends SignalAwareScanner<Component, VueScannerConfig> {
  /** Default file patterns for Vue components (includes TSX for defineComponent) */
  private static readonly DEFAULT_PATTERNS = ["**/*.vue", "**/*.tsx"];

  async scan(): Promise<ScanResult<Component>> {
    // Clear signals from previous scan
    this.clearSignals();

    // Use cache if available
    const result = this.config.cache
      ? await this.runScanWithCache(
          (file) => this.parseFile(file),
          VueComponentScanner.DEFAULT_PATTERNS,
        )
      : await this.runScan(
          (file) => this.parseFile(file),
          VueComponentScanner.DEFAULT_PATTERNS,
        );

    // Post-process: resolve extends inheritance
    this.resolveExtendsInheritance(result.items);

    // Post-process: detect compound component groups
    this.detectCompoundGroups(result.items);

    return result;
  }

  /**
   * Resolve props inheritance from extends pattern (PrimeVue).
   * Components that use `extends: BaseComponent` inherit props from the base.
   */
  private resolveExtendsInheritance(components: Component[]): void {
    // Build a map of component names to their props for quick lookup
    const componentMap = new Map<string, Component>();
    for (const comp of components) {
      componentMap.set(comp.name, comp);
    }

    // Find components that extend others and merge props
    for (const comp of components) {
      // Cast metadata to VueMetadata to access Vue-specific fields
      const metadata = comp.metadata as VueMetadata;
      const extendsName = metadata.extendsComponent;
      if (extendsName && comp.props.length === 0) {
        const baseComponent = componentMap.get(extendsName);
        if (baseComponent && baseComponent.props.length > 0) {
          // Inherit props from base component
          comp.props = [...baseComponent.props];
        }
      }
    }
  }

  /**
   * Detect compound component groups based on shared prefixes from the same file.
   * e.g., Select, SelectTrigger, SelectContent from select.vue → group under "Select"
   */
  private detectCompoundGroups(components: Component[]): void {
    // Group components by source file directory (Vue components are usually one per file,
    // but compound components are often in the same directory)
    const byDir = new Map<string, Component[]>();
    for (const comp of components) {
      if (comp.source.type !== "vue") continue;
      const filePath = comp.source.path;
      const dirPath = dirname(filePath);
      if (!byDir.has(dirPath)) {
        byDir.set(dirPath, []);
      }
      byDir.get(dirPath)!.push(comp);
    }

    // For each directory, detect shared prefix groups
    for (const [_dirPath, dirComponents] of byDir) {
      if (dirComponents.length < 2) continue;

      // Skip if already has compound component tags
      const hasExistingCompound = dirComponents.some(
        (c) =>
          c.metadata.tags?.includes("compound-component") ||
          c.metadata.tags?.includes("compound-component-namespace"),
      );
      if (hasExistingCompound) continue;

      const names = dirComponents.map((c) => c.name);
      const potentialRoots = this.findCompoundRoots(names);

      for (const root of potentialRoots) {
        const groupMembers = dirComponents.filter(
          (c) => c.name === root || c.name.startsWith(root),
        );

        if (groupMembers.length >= 2) {
          for (const member of groupMembers) {
            member.metadata.compoundGroup = root;
            if (member.name === root) {
              member.metadata.isCompoundRoot = true;
            }
          }
        }
      }
    }
  }

  /**
   * Find potential compound component roots from a list of names.
   * A root is a name that has other names starting with it (e.g., "Select" for "SelectTrigger").
   */
  private findCompoundRoots(names: string[]): string[] {
    const roots: string[] = [];
    const sortedNames = [...names].sort((a, b) => a.length - b.length);

    for (const name of sortedNames) {
      // Check if this name has sub-components (other names that start with this name)
      const hasSubComponents = sortedNames.some(
        (other) =>
          other !== name &&
          other.startsWith(name) &&
          other.length > name.length &&
          // Next character must be uppercase (e.g., SelectTrigger, not Selectall)
          /^[A-Z]/.test(other[name.length]!),
      );

      if (hasSubComponents) {
        // Don't add if this name is a sub-component of an existing root
        const isSubOfExisting = roots.some(
          (root) => name.startsWith(root) && name.length > root.length,
        );
        if (!isSubOfExisting) {
          roots.push(name);
        }
      }
    }

    return roots;
  }

  getSourceType(): string {
    return "vue";
  }

  private async parseFile(filePath: string): Promise<Component[]> {
    const content = await readFile(filePath, "utf-8");
    const relativePath = relative(this.config.projectRoot, filePath);

    // Handle TSX files with defineComponent (Vue TSX pattern)
    if (filePath.endsWith('.tsx')) {
      return this.parseTsxFile(filePath, content, relativePath);
    }

    // Create signal collector for this file
    const signalCollector = createScannerSignalCollector('vue', relativePath);

    // Extract component name from filename (e.g., MyButton.vue -> MyButton)
    const fileBaseName = basename(filePath, ".vue");

    // Extract script content - get both the script tag and its content
    // The setup attribute can appear anywhere in the script tag attributes (e.g., <script lang="ts" setup>)
    const scriptMatch = content.match(/<script([^>]*)>([\s\S]*?)<\/script>/);
    const scriptSetupMatch = content.match(
      /<script([^>]*\bsetup\b[^>]*)>([\s\S]*?)<\/script>/,
    );

    const scriptAttrs = scriptSetupMatch?.[1] || scriptMatch?.[1] || "";
    const scriptContent = scriptSetupMatch?.[2] || scriptMatch?.[2] || "";
    const isSetup = !!scriptSetupMatch;

    let props = this.extractProps(scriptContent, isSetup);

    // If no props found inline, try to resolve from external file (Element Plus pattern)
    if (props.length === 0) {
      if (isSetup) {
        // Script setup: defineProps(variableName) pattern
        const externalProps = await this.resolveExternalProps(scriptContent, filePath);
        if (externalProps.length > 0) {
          props = externalProps;
        }
      } else {
        // Options API: props: variableName pattern
        const externalProps = await this.resolveExternalPropsOptionsApi(scriptContent, filePath);
        if (externalProps.length > 0) {
          props = externalProps;
        }
      }
    }

    // Extract defineModel props (Vue 3.4+) - these create two-way bound props
    if (isSetup) {
      const modelProps = this.extractDefineModel(scriptContent);
      if (modelProps.length > 0) {
        props = [...props, ...modelProps];
      }
    }

    const dependencies = this.extractDependencies(content, signalCollector);
    const metadata = this.extractMetadata(scriptContent, content, isSetup, scriptAttrs, props);

    // Use defineOptions name if available (Element Plus pattern), otherwise use filename
    // Also check for Options API name: { name: 'ComponentName' }
    const componentName = metadata.defineOptionsName ||
      this.extractOptionsApiName(scriptContent) ||
      fileBaseName;

    // Only process PascalCase component names
    // Either the filename starts with uppercase OR defineOptions/Options API provides a PascalCase name
    if (!/^[A-Z]/.test(componentName)) {
      // Still add signals even if we don't return the component
      this.addSignals(relativePath, signalCollector.getEmitter());
      return [];
    }

    const source: VueSource = {
      type: "vue",
      path: relativePath,
      exportName: componentName,
      line: 1,
    };

    // Extract hardcoded values from template
    const hardcodedValues = this.extractHardcodedValuesFromTemplate(content, signalCollector);

    // Emit component definition signal
    signalCollector.collectComponentDef(componentName, 1, {
      propsCount: props.length,
      hasHardcodedValues: hardcodedValues.length > 0,
      dependencyCount: dependencies.length,
      isSetup,
    });

    // Add this file's signals to the aggregator
    this.addSignals(relativePath, signalCollector.getEmitter());

    return [
      {
        id: createComponentId(source, componentName),
        name: componentName,
        source,
        props,
        variants: [],
        tokens: [],
        dependencies,
        metadata: {
          ...metadata,
          hardcodedValues: hardcodedValues.length > 0 ? hardcodedValues : undefined,
        },
        scannedAt: new Date(),
      },
    ];
  }

  /**
   * Parse TSX files for Vue defineComponent pattern.
   * Vue components can be written in TSX using defineComponent({ name: '...', ... })
   */
  private async parseTsxFile(
    _filePath: string,
    content: string,
    relativePath: string,
  ): Promise<Component[]> {
    // Check if this file uses Vue's defineComponent
    if (!content.includes('defineComponent')) {
      return [];
    }

    // Verify it's a Vue defineComponent, not just any function
    // Must have 'defineComponent' imported from 'vue' or used with component options
    const hasVueImport = /from\s+['"]vue['"]/.test(content);
    const hasDefineComponentCall = /defineComponent\s*\(\s*\{/.test(content);

    if (!hasVueImport || !hasDefineComponentCall) {
      return [];
    }

    // Create signal collector for this file
    const signalCollector = createScannerSignalCollector('vue', relativePath);

    // Extract component name from defineComponent({ name: '...' })
    const nameMatch = content.match(
      /defineComponent\s*\(\s*\{[^}]*?name:\s*['"]([^'"]+)['"]/s,
    );

    if (!nameMatch?.[1]) {
      this.addSignals(relativePath, signalCollector.getEmitter());
      return [];
    }

    const componentName = nameMatch[1];

    // Only process PascalCase component names
    if (!/^[A-Z]/.test(componentName)) {
      this.addSignals(relativePath, signalCollector.getEmitter());
      return [];
    }

    // Extract props from defineComponent
    const props = this.extractDefineComponentProps(content);

    // Extract dependencies from JSX usage
    const dependencies = this.extractJsxDependencies(content, signalCollector);

    const source: VueSource = {
      type: "vue",
      path: relativePath,
      exportName: componentName,
      line: 1,
    };

    // Emit component definition signal
    signalCollector.collectComponentDef(componentName, 1, {
      propsCount: props.length,
      hasHardcodedValues: false,
      dependencyCount: dependencies.length,
      isSetup: true,
    });

    this.addSignals(relativePath, signalCollector.getEmitter());

    return [
      {
        id: createComponentId(source, componentName),
        name: componentName,
        source,
        props,
        variants: [],
        tokens: [],
        dependencies,
        metadata: {
          deprecated: content.includes('@deprecated'),
          tags: ['tsx'],
        },
        scannedAt: new Date(),
      },
    ];
  }

  /**
   * Extract props from defineComponent({ props: ... })
   */
  private extractDefineComponentProps(content: string): PropDefinition[] {
    const props: PropDefinition[] = [];

    // Match props: propsVariable (imported props definition)
    const propsRefMatch = content.match(
      /defineComponent\s*\(\s*\{[^}]*?props:\s*([a-zA-Z_]\w*)\s*[,}]/s,
    );
    if (propsRefMatch?.[1]) {
      // Try to find the props definition in the file
      const propsVarName = propsRefMatch[1];
      const propsDefMatch = content.match(
        new RegExp(`const\\s+${propsVarName}\\s*=\\s*\\{([^}]+)\\}`, 's'),
      );
      if (propsDefMatch?.[1]) {
        this.parseObjectProps(propsDefMatch[1], props);
      }
    }

    // Match inline props: { ... }
    const inlinePropsMatch = content.match(
      /defineComponent\s*\(\s*\{[^}]*?props:\s*\{([^}]+)\}/s,
    );
    if (inlinePropsMatch?.[1] && props.length === 0) {
      this.parseObjectProps(inlinePropsMatch[1], props);
    }

    return props;
  }

  /**
   * Extract component dependencies from JSX usage in TSX files
   */
  private extractJsxDependencies(
    content: string,
    signalCollector?: ScannerSignalCollector,
  ): string[] {
    const deps: Set<string> = new Set();

    // Match JSX component usage: <ComponentName or <Component.Name
    const jsxMatches = content.matchAll(/<([A-Z][a-zA-Z0-9]*(?:\.[A-Z][a-zA-Z0-9]*)?)/g);
    for (const m of jsxMatches) {
      const match = m[1];
      if (match) {
        const componentName = match.split('.')[0]; // Get base component name
        if (componentName) {
          deps.add(componentName);
          signalCollector?.collectComponentUsage(componentName, 1);
        }
      }
    }

    return Array.from(deps);
  }

  /**
   * Extract component name from Options API: export default { name: 'ComponentName' }
   */
  private extractOptionsApiName(scriptContent: string): string | undefined {
    const nameMatch = scriptContent.match(
      /(?:export\s+default|defineComponent)\s*\(\s*\{[^}]*name:\s*['"]([^'"]+)['"]/,
    );
    return nameMatch?.[1];
  }

  /** Known style-related prop names that map to theme tokens */
  private static readonly STYLE_PROP_NAMES = new Set([
    'color', 'variant', 'size', 'elevation', 'rounded', 'outlined',
    'dense', 'disabled', 'loading', 'flat', 'raised', 'text', 'plain',
    'severity', 'theme', 'dark', 'light', 'filled', 'tonal', 'block',
    'stacked', 'slim', 'shaped', 'tile', 'border', 'density',
  ]);

  /**
   * Extract metadata from component including extends, defineOptions, and deprecation
   */
  private extractMetadata(
    scriptContent: string,
    fullContent: string,
    isSetup: boolean,
    scriptAttrs: string,
    props: PropDefinition[],
  ): VueMetadata {
    const metadata: VueMetadata = {
      deprecated: this.hasDeprecatedComment(fullContent),
      tags: [],
    };

    // Detect defineOptions({ name: 'ComponentName' }) pattern
    const defineOptionsMatch = scriptContent.match(
      /defineOptions\s*\(\s*\{[^}]*name:\s*['"]([^'"]+)['"]/,
    );
    if (defineOptionsMatch?.[1]) {
      metadata.defineOptionsName = defineOptionsMatch[1];
    } else {
      // Detect defineOptions({ name: VARIABLE }) pattern (Element Plus style)
      const defineOptionsVarMatch = scriptContent.match(
        /defineOptions\s*\(\s*\{[^}]*name:\s*([A-Z_][A-Z0-9_]*)\s*[,}]/,
      );
      if (defineOptionsVarMatch?.[1]) {
        const varName = defineOptionsVarMatch[1];
        // Look for const VARIABLE = 'value' or const VARIABLE = "value"
        const varValueRegex = new RegExp(
          `const\\s+${varName}\\s*=\\s*['"]([^'"]+)['"]`,
        );
        const varValueMatch = scriptContent.match(varValueRegex);
        if (varValueMatch?.[1]) {
          metadata.defineOptionsName = varValueMatch[1];
        }
      }
    }

    // Detect extends pattern (Options API)
    if (!isSetup) {
      const extendsMatch = scriptContent.match(
        /extends:\s*([A-Z][a-zA-Z0-9]*)/,
      );
      if (extendsMatch?.[1]) {
        metadata.extendsComponent = extendsMatch[1];
      }
    }

    // Detect external props reference: defineProps(variableName)
    if (isSetup) {
      // Match defineProps(identifier) but not defineProps({ or defineProps<
      const externalPropsMatch = scriptContent.match(
        /defineProps\s*\(\s*([a-zA-Z_]\w*)\s*\)/,
      );
      if (externalPropsMatch?.[1]) {
        metadata.externalPropsRef = externalPropsMatch[1];
      }
    }

    // Detect style props from prop definitions
    const styleProps = props
      .map(p => p.name)
      .filter(name => VueComponentScanner.STYLE_PROP_NAMES.has(name.toLowerCase()));
    if (styleProps.length > 0) {
      metadata.styleProps = styleProps;
    }

    // Detect compound component pattern via defineExpose
    const exposeMatch = scriptContent.match(
      /defineExpose\s*\(\s*\{([^}]+)\}/,
    );
    if (exposeMatch?.[1]) {
      const subComponents: string[] = [];
      const propMatches = exposeMatch[1].matchAll(
        /(\w+):\s*([A-Z][a-zA-Z0-9]*)/g,
      );
      for (const m of propMatches) {
        if (m[2]) {
          subComponents.push(m[2]);
        }
      }
      if (subComponents.length > 0) {
        metadata.subComponents = subComponents;
      }
    }

    // Detect generic component type parameter: <script setup generic="T extends...">
    const genericMatch = scriptAttrs.match(
      /generic\s*=\s*["']([^"']+)["']/,
    );
    if (genericMatch?.[1]) {
      metadata.genericType = genericMatch[1];
    }

    // Extract emits from defineEmits
    const emits = this.extractEmits(scriptContent);
    if (emits.length > 0) {
      metadata.emits = emits;
    }

    return metadata;
  }

  /**
   * Extract emit names from defineEmits declarations
   */
  private extractEmits(scriptContent: string): string[] {
    const emits: string[] = [];

    // defineEmits<{ (e: 'click', ...): void; (e: 'focus'): void }>()
    const typeEmitsMatch = scriptContent.match(
      /defineEmits\s*<\s*\{([^}]+)\}\s*>\s*\(\s*\)/,
    );
    if (typeEmitsMatch?.[1]) {
      const eventMatches = typeEmitsMatch[1].matchAll(
        /\(\s*e:\s*['"]([^'"]+)['"]/g,
      );
      for (const m of eventMatches) {
        if (m[1]) {
          emits.push(m[1]);
        }
      }
    }

    // defineEmits(['click', 'focus'])
    const arrayEmitsMatch = scriptContent.match(
      /defineEmits\s*\(\s*\[([^\]]+)\]\s*\)/,
    );
    if (arrayEmitsMatch?.[1] && emits.length === 0) {
      const eventNames = arrayEmitsMatch[1].matchAll(/['"]([^'"]+)['"]/g);
      for (const m of eventNames) {
        if (m[1]) {
          emits.push(m[1]);
        }
      }
    }

    return emits;
  }

  /**
   * Extract props from defineModel declarations (Vue 3.4+)
   * defineModel creates two-way binding props that map to modelValue by default
   *
   * Patterns:
   *   defineModel<string>()                    -> modelValue: string (optional)
   *   defineModel('count', { type: Number })   -> count: number (optional)
   *   defineModel<string>('search')            -> search: string (optional)
   *   defineModel<string>({ required: true })  -> modelValue: string (required)
   */
  private extractDefineModel(scriptContent: string): PropDefinition[] {
    const props: PropDefinition[] = [];

    // Match all defineModel calls
    // Pattern 1: defineModel<Type>() or defineModel<Type>({ ... })
    // Pattern 2: defineModel('name', { ... }) or defineModel<Type>('name', { ... })
    const defineModelRegex = /defineModel\s*(?:<([^>]+)>)?\s*\(\s*(?:['"]([^'"]+)['"])?\s*(?:,?\s*\{([^}]*)\})?\s*\)/g;

    for (const match of scriptContent.matchAll(defineModelRegex)) {
      const genericType = match[1]?.trim();
      const propName = match[2]?.trim() || 'modelValue';
      const optionsStr = match[3] || '';

      // Determine the type
      let type = 'unknown';
      if (genericType) {
        type = genericType;
      } else {
        // Check for type in options: { type: Number }
        const typeMatch = optionsStr.match(/type:\s*(\w+)/);
        if (typeMatch?.[1]) {
          type = typeMatch[1].toLowerCase();
        }
      }

      // Check if required
      const isRequired = /required:\s*true/.test(optionsStr);

      props.push({
        name: propName,
        type,
        required: isRequired,
      });
    }

    return props;
  }

  /**
   * Parse TypeScript props string into individual prop definitions.
   * Handles complex types like: { cb: () => void, data: { nested: string } }
   */
  private parseTypeProps(propsContent: string): PropDefinition[] {
    // Use shared utility from parser-utils (eliminates ~65 lines of duplication)
    return parseTypeScriptInterfaceProps(propsContent);
  }

  /**
   * Extract props from an inline interface definition.
   * Handles nested types with balanced braces.
   */
  private extractInterfaceProps(scriptContent: string, interfaceName: string): PropDefinition[] {
    // Find the interface definition start
    const interfaceRegex = new RegExp(`interface\\s+${interfaceName}\\s*\\{`);
    const match = scriptContent.match(interfaceRegex);
    if (!match || match.index === undefined) {
      return [];
    }

    // Find the opening brace position
    const braceStart = scriptContent.indexOf("{", match.index);
    if (braceStart === -1) {
      return [];
    }

    // Extract balanced braces content
    const propsContent = extractBalancedBraces(scriptContent, braceStart);
    if (!propsContent) {
      return [];
    }

    return this.parseTypeProps(propsContent);
  }

  private extractProps(
    scriptContent: string,
    isSetup: boolean,
  ): PropDefinition[] {
    const props: PropDefinition[] = [];

    if (isSetup) {
      // Vue 3 <script setup> with defineProps
      // Handle withDefaults(defineProps<Props>(), { ... }) pattern first
      const withDefaultsMatch = scriptContent.match(
        /withDefaults\s*\(\s*defineProps<(\w+)>\s*\(\s*\)/,
      );
      if (withDefaultsMatch?.[1]) {
        // Look for the interface definition with balanced braces (handles nested types)
        const interfaceName = withDefaultsMatch[1];
        const parsedProps = this.extractInterfaceProps(scriptContent, interfaceName);
        if (parsedProps.length > 0) {
          props.push(...parsedProps);
        }
      }

      // defineProps<{ title: string, count?: number }>()
      // Need to handle nested types like: defineProps<{ cb: () => { value: string } }>()
      if (props.length === 0) {
        const typePropsStartMatch = scriptContent.match(/defineProps<\{/);
        if (typePropsStartMatch) {
          const startIdx =
            scriptContent.indexOf("defineProps<{") + "defineProps<".length;
          const propsContent = extractBalancedBraces(
            scriptContent,
            startIdx,
          );
          if (propsContent) {
            const parsedProps = this.parseTypeProps(propsContent);
            props.push(...parsedProps);
          }
        }
      }

      // defineProps<InterfaceName>() where InterfaceName is defined inline
      if (props.length === 0) {
        const interfacePropsMatch = scriptContent.match(
          /defineProps<(\w+)>\s*\(\s*\)/,
        );
        if (interfacePropsMatch?.[1]) {
          const interfaceName = interfacePropsMatch[1];
          const parsedProps = this.extractInterfaceProps(scriptContent, interfaceName);
          if (parsedProps.length > 0) {
            props.push(...parsedProps);
          }
        }
      }

      // defineProps({ title: String, count: { type: Number, required: false } })
      if (props.length === 0) {
        const objPropsStartMatch = scriptContent.match(/defineProps\(\{/);
        if (objPropsStartMatch) {
          const startIdx =
            scriptContent.indexOf("defineProps({") + "defineProps(".length;
          const propsContent = extractBalancedBraces(
            scriptContent,
            startIdx,
          );
          if (propsContent) {
            this.parseObjectProps(propsContent, props);
          }
        }
      }

      // defineProps(['title', 'count'])
      const arrayPropsMatch = scriptContent.match(
        /defineProps\(\[([^\]]+)\]\)/,
      );
      if (arrayPropsMatch && arrayPropsMatch[1] && props.length === 0) {
        const propNames = arrayPropsMatch[1].match(/['"](\w+)['"]/g);
        if (propNames) {
          for (const p of propNames) {
            props.push({
              name: p.replace(/['"]/g, ""),
              type: "unknown",
              required: false,
            });
          }
        }
      }
    } else {
      // Options API: props: { ... } or props: [...] or props: variableName
      const propsObjStartMatch = scriptContent.match(/props:\s*\{/);
      if (propsObjStartMatch && propsObjStartMatch.index !== undefined) {
        const braceIdx = scriptContent.indexOf("{", propsObjStartMatch.index);
        const propsContent = extractBalancedBraces(
          scriptContent,
          braceIdx,
        );
        if (propsContent) {
          this.parseObjectProps(propsContent, props);
        }
      }

      const propsArrayMatch = scriptContent.match(/props:\s*\[([^\]]+)\]/);
      if (propsArrayMatch && propsArrayMatch[1] && props.length === 0) {
        const propNames = propsArrayMatch[1].match(/['"](\w+)['"]/g);
        if (propNames) {
          for (const p of propNames) {
            props.push({
              name: p.replace(/['"]/g, ""),
              type: "unknown",
              required: false,
            });
          }
        }
      }

      // Note: props: variableName pattern is handled in parseFile via resolveExternalPropsOptionsApi
    }

    return props;
  }

  /**
   * Resolve props from external TypeScript file for Options API
   * Handles: props: variableName where variableName is imported from a .ts file
   * This is common in Element Plus's defineComponent pattern.
   */
  private async resolveExternalPropsOptionsApi(
    scriptContent: string,
    vueFilePath: string,
  ): Promise<PropDefinition[]> {
    // Match props: identifier (but not props: { or props: [)
    // Also match defineComponent({ props: identifier })
    const externalPropsMatch = scriptContent.match(
      /props:\s*([a-zA-Z_]\w*)(?:\s*,|\s*\})/,
    );
    if (!externalPropsMatch?.[1]) {
      return [];
    }

    const propsVarName = externalPropsMatch[1];
    return this.resolveExternalPropsFromImport(scriptContent, vueFilePath, propsVarName);
  }

  /**
   * Resolve props from external TypeScript file (Element Plus pattern)
   * Handles: defineProps(variableName) where variableName is imported from a .ts file
   */
  private async resolveExternalProps(
    scriptContent: string,
    vueFilePath: string,
  ): Promise<PropDefinition[]> {
    // Match defineProps(identifier) but not defineProps({ or defineProps<
    const externalPropsMatch = scriptContent.match(
      /defineProps\s*\(\s*([a-zA-Z_]\w*)\s*\)/,
    );
    if (!externalPropsMatch?.[1]) {
      return [];
    }

    const propsVarName = externalPropsMatch[1];
    return this.resolveExternalPropsFromImport(scriptContent, vueFilePath, propsVarName);
  }

  /**
   * Common logic to resolve props from an imported variable name
   */
  private async resolveExternalPropsFromImport(
    scriptContent: string,
    vueFilePath: string,
    propsVarName: string,
  ): Promise<PropDefinition[]> {
    let importPath: string | undefined;
    let isDefaultImport = false;

    // First, try to match named import: import { rateProps } from './rate'
    const namedImportRegex = new RegExp(
      `import\\s*\\{[^}]*\\b${propsVarName}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`,
    );
    const namedImportMatch = scriptContent.match(namedImportRegex);
    if (namedImportMatch?.[1]) {
      importPath = namedImportMatch[1];
    }

    // If not found, try to match default import: import defaultProps from './defaults'
    if (!importPath) {
      const defaultImportRegex = new RegExp(
        `import\\s+${propsVarName}\\s+from\\s*['"]([^'"]+)['"]`,
      );
      const defaultImportMatch = scriptContent.match(defaultImportRegex);
      if (defaultImportMatch?.[1]) {
        importPath = defaultImportMatch[1];
        isDefaultImport = true;
      }
    }

    if (!importPath) {
      return [];
    }

    // Resolve the TypeScript file path
    const vueDir = dirname(vueFilePath);
    let tsFilePath = resolve(vueDir, importPath);

    // Handle relative imports without extension
    if (!tsFilePath.endsWith('.ts') && !tsFilePath.endsWith('.js')) {
      // Try .ts first, then .js
      if (existsSync(tsFilePath + '.ts')) {
        tsFilePath = tsFilePath + '.ts';
      } else if (existsSync(tsFilePath + '.js')) {
        tsFilePath = tsFilePath + '.js';
      } else {
        return [];
      }
    }

    // Check if file exists
    if (!existsSync(tsFilePath)) {
      return [];
    }

    try {
      const tsContent = await readFile(tsFilePath, "utf-8");
      if (isDefaultImport) {
        return this.parseDefaultExportPropsFile(tsContent);
      }
      return this.parseExternalPropsFile(tsContent, propsVarName);
    } catch {
      return [];
    }
  }

  /**
   * Parse props from an external TypeScript file with default export
   * Handles patterns like:
   *   export default { data: { type: Array }, ... }
   */
  private parseDefaultExportPropsFile(content: string): PropDefinition[] {
    const props: PropDefinition[] = [];

    // Match: export default { ... }
    const defaultExportMatch = content.match(/export\s+default\s*\{/);
    if (!defaultExportMatch || defaultExportMatch.index === undefined) {
      return [];
    }

    // Find the opening brace position
    const braceStart = content.indexOf('{', defaultExportMatch.index);
    if (braceStart === -1) {
      return [];
    }

    // Extract the balanced braces content
    const propsContent = extractBalancedBraces(content, braceStart);
    if (!propsContent) {
      return [];
    }

    // Parse the props from the object
    this.parseElementPlusProps(propsContent, props);

    return props;
  }

  /**
   * Parse props from an external TypeScript file (Element Plus buildProps pattern)
   * Handles patterns like:
   *   export const rateProps = buildProps({ ... })
   *   export const rateProps = { ... }
   */
  private parseExternalPropsFile(
    content: string,
    propsVarName: string,
  ): PropDefinition[] {
    const props: PropDefinition[] = [];

    // Match: export const rateProps = buildProps({ ... }) or export const rateProps = { ... }
    // We need to find the props object definition
    const propsDefRegex = new RegExp(
      `(?:export\\s+)?const\\s+${propsVarName}\\s*=\\s*(?:buildProps\\s*)?\\(\\s*\\{`,
    );
    const match = content.match(propsDefRegex);
    if (!match || match.index === undefined) {
      return [];
    }

    // Find the opening brace position
    const braceStart = content.indexOf('{', match.index);
    if (braceStart === -1) {
      return [];
    }

    // Extract the balanced braces content
    const propsContent = extractBalancedBraces(content, braceStart);
    if (!propsContent) {
      return [];
    }

    // Parse the props from the object
    this.parseElementPlusProps(propsContent, props);

    return props;
  }

  /**
   * Parse Element Plus style props object
   * Handles patterns like:
   *   modelValue: { type: Number, default: 0 }
   *   disabled: { type: Boolean, default: undefined }
   *   allowHalf: Boolean
   *   height: [String, Number]
   */
  private parseElementPlusProps(propsStr: string, props: PropDefinition[]): void {
    const seenProps = new Set<string>();

    // First pass: Match complex props with object definition
    // propName: { type: Type, ... }
    const complexRegex = /(\w+):\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
    for (const m of propsStr.matchAll(complexRegex)) {
      if (m[1] && m[2]) {
        const propName = m[1];
        const propContent = m[2];

        // Skip if prop name is 'type' (nested definition)
        if (propName === 'type') continue;

        // Extract type from the prop definition
        const typeMatch = propContent.match(/type:\s*(\w+)/);
        if (typeMatch?.[1]) {
          const isRequired = /required:\s*true/.test(propContent);

          if (!seenProps.has(propName)) {
            seenProps.add(propName);
            props.push({
              name: propName,
              type: typeMatch[1].toLowerCase(),
              required: isRequired,
            });
          }
        }
      }
    }

    // Second pass: Match shorthand props (propName: Type)
    // allowHalf: Boolean, showText: Boolean
    const simpleRegex = /(\w+):\s*(String|Number|Boolean|Array|Object|Function)(?:\s*,|\s*$|\s*\n)/g;
    for (const m of propsStr.matchAll(simpleRegex)) {
      if (m[1] && m[2]) {
        const propName = m[1];
        // Skip 'type' keyword
        if (propName === 'type') continue;

        if (!seenProps.has(propName)) {
          seenProps.add(propName);
          props.push({
            name: propName,
            type: m[2].toLowerCase(),
            required: false,
          });
        }
      }
    }

    // Third pass: Match array type shorthand (propName: [Type1, Type2])
    // height: [String, Number], maxHeight: [String, Number]
    const arrayTypeRegex = /(\w+):\s*\[([^\]]+)\](?:\s*,|\s*$|\s*\n)/g;
    for (const m of propsStr.matchAll(arrayTypeRegex)) {
      if (m[1] && m[2]) {
        const propName = m[1];
        const typesContent = m[2];

        // Skip 'type' keyword
        if (propName === 'type') continue;

        if (!seenProps.has(propName)) {
          // Extract type names from the array
          const types = typesContent
            .split(',')
            .map(t => t.trim().toLowerCase())
            .filter(t => t.length > 0);

          seenProps.add(propName);
          props.push({
            name: propName,
            type: types.join(' | '),
            required: false,
          });
        }
      }
    }
  }

  /**
   * Check if a position in a string is inside a nested brace block.
   * Used to distinguish `type: String` as a prop name vs. inside `{ type: String }`.
   */
  private isInsideNestedBraces(content: string, position: number): boolean {
    let depth = 0;
    for (let i = 0; i < position; i++) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') depth--;
    }
    // If depth > 0, we're inside a nested brace block
    return depth > 0;
  }

  private parseObjectProps(propsStr: string, props: PropDefinition[]): void {
    const seenProps = new Set<string>();

    // First pass: Match complex props: propName: { type: Type, required: true/false }
    // This includes PropType patterns like: type: String as PropType<string>
    const complexMatch = propsStr.matchAll(
      /(\w+):\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g,
    );
    for (const m of complexMatch) {
      if (m[1] && m[2]) {
        const propName = m[1];
        const propContent = m[2];

        // Skip if prop name is 'type' (this is a nested type definition)
        if (propName === 'type') continue;

        // Extract type from the prop definition
        // Handle single type: type: String
        // Handle array type: type: [String, Number]
        const typeMatch = propContent.match(/type:\s*(\w+)/);
        const arrayTypeMatch = propContent.match(/type:\s*\[([^\]]+)\]/);

        let typeStr: string | undefined;
        if (arrayTypeMatch?.[1]) {
          // Array type like [String, Number] - take the first type or join them
          const types = arrayTypeMatch[1].split(',').map(t => t.trim().toLowerCase());
          typeStr = types.join(' | ');
        } else if (typeMatch?.[1]) {
          typeStr = typeMatch[1].toLowerCase();
        }

        if (typeStr) {
          const isRequired = /required:\s*true/.test(propContent);

          if (!seenProps.has(propName)) {
            seenProps.add(propName);
            props.push({
              name: propName,
              type: typeStr,
              required: isRequired,
            });
          }
        }
      }
    }

    // Second pass: Match simple props: propName: Type (not followed by an object)
    const simpleMatch = propsStr.matchAll(
      /(\w+):\s*(String|Number|Boolean|Array|Object|Function)(?!\s*as\s+PropType)(?:\s*,|\s*$|\s*\n)/g,
    );
    for (const m of simpleMatch) {
      if (m[1] && m[2] && m.index !== undefined) {
        const propName = m[1];

        // Only skip 'type' if it's inside a nested brace block (i.e., part of a complex prop definition)
        // Don't skip if it's at the top level (i.e., 'type' is the actual prop name)
        if (propName === 'type' && this.isInsideNestedBraces(propsStr, m.index)) {
          continue;
        }

        if (!seenProps.has(propName)) {
          seenProps.add(propName);
          props.push({
            name: propName,
            type: m[2].toLowerCase(),
            required: false,
          });
        }
      }
    }

    // Third pass: Match props with null type (any type): propName: null
    // Skip Vue prop option keywords (type, default, required, validator)
    const reservedPropKeywords = new Set(['type', 'default', 'required', 'validator']);
    const nullMatch = propsStr.matchAll(
      /(\w+):\s*null(?:\s*,|\s*$|\s*\n)/g,
    );
    for (const m of nullMatch) {
      if (m[1] && m.index !== undefined) {
        const propName = m[1];

        // Skip reserved keywords when inside nested braces (they're prop options, not prop names)
        if (reservedPropKeywords.has(propName) && this.isInsideNestedBraces(propsStr, m.index)) {
          continue;
        }

        if (!seenProps.has(propName)) {
          seenProps.add(propName);
          props.push({
            name: propName,
            type: 'any',
            required: false,
          });
        }
      }
    }
  }

  private extractDependencies(
    content: string,
    signalCollector?: ScannerSignalCollector,
  ): string[] {
    const deps: Set<string> = new Set();

    // Find component usage in template: <ComponentName or <component-name
    const templateMatch = content.match(
      /<template[^>]*>([\s\S]*?)<\/template>/,
    );
    if (templateMatch && templateMatch[1]) {
      const template = templateMatch[1];

      // PascalCase components
      const pascalMatches = template.matchAll(/<([A-Z][a-zA-Z0-9]+)/g);
      for (const m of pascalMatches) {
        if (m[1]) {
          deps.add(m[1]);
          // Emit component usage signal
          signalCollector?.collectComponentUsage(m[1], 1);
        }
      }

      // kebab-case components (convert to PascalCase)
      const kebabMatches = template.matchAll(/<([a-z]+-[a-z0-9-]+)/g);
      for (const m of kebabMatches) {
        if (m[1]) {
          const pascal = m[1]
            .split("-")
            .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
            .join("");
          deps.add(pascal);
          // Emit component usage signal
          signalCollector?.collectComponentUsage(pascal, 1);
        }
      }
    }

    return Array.from(deps);
  }

  private hasDeprecatedComment(content: string): boolean {
    return content.includes("@deprecated") || content.includes("* @deprecated");
  }

  /**
   * Extract hardcoded color and spacing values from Vue template.
   * Detects patterns like:
   * - style="color: #FF0000"
   * - :style="{ color: '#FF0000', padding: '16px' }"
   */
  private extractHardcodedValuesFromTemplate(
    content: string,
    signalCollector?: ScannerSignalCollector,
  ): HardcodedValue[] {
    const hardcoded: HardcodedValue[] = [];
    const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/);
    if (!templateMatch) return hardcoded;

    const template = templateMatch[1] || "";

    // Pattern 1: Inline style attribute: style="color: #FF0000; padding: 16px"
    const inlineStyleRegex = /style="([^"]+)"/g;
    let match;
    while ((match = inlineStyleRegex.exec(template)) !== null) {
      const styleContent = match[1];
      if (styleContent) {
        // Parse CSS properties
        const propertyRegex = /([a-z-]+)\s*:\s*([^;]+)/g;
        let propMatch;
        while ((propMatch = propertyRegex.exec(styleContent)) !== null) {
          const [, property, value] = propMatch;
          if (property && value) {
            const trimmedValue = value.trim();
            const hardcodedType = getHardcodedValueType(property, trimmedValue);
            if (hardcodedType) {
              hardcoded.push({
                type: hardcodedType,
                value: trimmedValue,
                property,
                location: "template",
              });
              // Emit signal for hardcoded value
              signalCollector?.collectFromValue(trimmedValue, property, 1);
            }
          }
        }
      }
    }

    // Pattern 2: Vue style binding: :style="{ color: '#FF0000', padding: '16px' }"
    const styleBindingRegex = /:style="?\{([^}]+)\}"?/g;
    while ((match = styleBindingRegex.exec(template)) !== null) {
      const bindingContent = match[1];
      if (bindingContent) {
        // Parse object properties: color: '#FF0000', padding: '16px'
        const propRegex = /([a-zA-Z-]+)\s*:\s*['"]([^'"]+)['"]/g;
        let propMatch;
        while ((propMatch = propRegex.exec(bindingContent)) !== null) {
          const [, property, value] = propMatch;
          if (property && value) {
            const hardcodedType = getHardcodedValueType(property, value);
            if (hardcodedType) {
              hardcoded.push({
                type: hardcodedType,
                value,
                property,
                location: "template",
              });
              // Emit signal for hardcoded value
              signalCollector?.collectFromValue(value, property, 1);
            }
          }
        }
      }
    }

    // Deduplicate by property:value
    const seen = new Set<string>();
    return hardcoded.filter((h) => {
      const key = `${h.property}:${h.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
