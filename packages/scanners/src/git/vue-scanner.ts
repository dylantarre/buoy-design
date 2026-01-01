import { Scanner, ScanResult, ScannerConfig } from "../base/scanner.js";
import type { Component, PropDefinition, VueSource } from "@buoy-design/core";
import { createComponentId } from "@buoy-design/core";
import { readFile } from "fs/promises";
import { relative, basename } from "path";
import { extractBalancedBraces } from "../utils/parser-utils.js";

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

export class VueComponentScanner extends Scanner<Component, VueScannerConfig> {
  /** Default file patterns for Vue components */
  private static readonly DEFAULT_PATTERNS = ["**/*.vue"];

  async scan(): Promise<ScanResult<Component>> {
    return this.runScan(
      (file) => this.parseFile(file),
      VueComponentScanner.DEFAULT_PATTERNS,
    );
  }

  getSourceType(): string {
    return "vue";
  }

  private async parseFile(filePath: string): Promise<Component[]> {
    const content = await readFile(filePath, "utf-8");
    const relativePath = relative(this.config.projectRoot, filePath);

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

    const props = this.extractProps(scriptContent, isSetup);
    const dependencies = this.extractDependencies(content);
    const metadata = this.extractMetadata(scriptContent, content, isSetup, scriptAttrs, props);

    // Use defineOptions name if available (Element Plus pattern), otherwise use filename
    // Also check for Options API name: { name: 'ComponentName' }
    const componentName = metadata.defineOptionsName ||
      this.extractOptionsApiName(scriptContent) ||
      fileBaseName;

    // Only process PascalCase component names
    // Either the filename starts with uppercase OR defineOptions/Options API provides a PascalCase name
    if (!/^[A-Z]/.test(componentName)) return [];

    const source: VueSource = {
      type: "vue",
      path: relativePath,
      exportName: componentName,
      line: 1,
    };

    return [
      {
        id: createComponentId(source, componentName),
        name: componentName,
        source,
        props,
        variants: [],
        tokens: [],
        dependencies,
        metadata,
        scannedAt: new Date(),
      },
    ];
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
   * Parse TypeScript props string into individual prop definitions.
   * Handles complex types like: { cb: () => void, data: { nested: string } }
   */
  private parseTypeProps(propsContent: string): PropDefinition[] {
    const props: PropDefinition[] = [];
    let i = 0;

    while (i < propsContent.length) {
      // Skip whitespace
      while (i < propsContent.length && /\s/.test(propsContent[i] ?? "")) i++;
      if (i >= propsContent.length) break;

      // Match prop name
      const nameMatch = propsContent.substring(i).match(/^(\w+)(\?)?:\s*/);
      if (!nameMatch || !nameMatch[1]) {
        // Skip to next comma or end
        while (i < propsContent.length && propsContent[i] !== "," && propsContent[i] !== ";") i++;
        i++; // skip delimiter
        continue;
      }

      const propName = nameMatch[1];
      const isOptional = !!nameMatch[2];
      i += nameMatch[0].length;

      // Now extract the type - need to handle nested braces, parens, brackets, and generics
      let typeStr = "";
      let depth = 0;
      const openChars = new Set(["{", "(", "<", "["]);
      const closeChars = new Set(["}", ")", "]"]);

      while (i < propsContent.length) {
        const char = propsContent[i];
        if (char === undefined) break;

        if (openChars.has(char)) {
          depth++;
        } else if (closeChars.has(char)) {
          depth--;
        } else if (char === ">") {
          // Only treat > as closing if we're inside a generic (depth > 0) and it's not part of =>
          if (depth > 0 && propsContent[i - 1] !== "=") {
            depth--;
          }
        }

        // Stop at comma or semicolon only when not nested
        if (depth === 0 && (char === "," || char === ";")) {
          i++; // skip the delimiter
          break;
        }

        typeStr += char;
        i++;
      }

      typeStr = typeStr.trim();
      if (propName && typeStr) {
        props.push({
          name: propName,
          type: typeStr,
          required: !isOptional,
        });
      }
    }

    return props;
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
        // Look for the interface definition
        const interfaceName = withDefaultsMatch[1];
        const interfaceMatch = scriptContent.match(
          new RegExp(`interface\\s+${interfaceName}\\s*\\{([^}]+)\\}`),
        );
        if (interfaceMatch?.[1]) {
          const parsedProps = this.parseTypeProps(interfaceMatch[1]);
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
      // Options API: props: { ... } or props: [...]
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
    }

    return props;
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

    // Second pass: Match simple props: propName: Type (not followed by an object)
    const simpleMatch = propsStr.matchAll(
      /(\w+):\s*(String|Number|Boolean|Array|Object|Function)(?!\s*as\s+PropType)(?:\s*,|\s*$|\s*\n)/g,
    );
    for (const m of simpleMatch) {
      if (m[1] && m[2]) {
        const propName = m[1];
        // Skip 'type' keyword (it's part of complex prop definition)
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
  }

  private extractDependencies(content: string): string[] {
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
        if (m[1]) deps.add(m[1]);
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
        }
      }
    }

    return Array.from(deps);
  }

  private hasDeprecatedComment(content: string): boolean {
    return content.includes("@deprecated") || content.includes("* @deprecated");
  }
}
