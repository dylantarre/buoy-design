import { Scanner, ScanResult, ScannerConfig } from "../base/scanner.js";
import type { Component, PropDefinition, VueSource } from "@buoy-design/core";
import { createComponentId } from "@buoy-design/core";
import { readFile } from "fs/promises";
import { relative, basename } from "path";
import { extractBalancedBraces } from "../utils/parser-utils.js";

export interface VueScannerConfig extends ScannerConfig {
  designSystemPackage?: string;
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
    const name = basename(filePath, ".vue");

    // Only process PascalCase component names
    if (!/^[A-Z]/.test(name)) return [];

    // Extract script content
    const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    const scriptSetupMatch = content.match(
      /<script\s+setup[^>]*>([\s\S]*?)<\/script>/,
    );

    const scriptContent = scriptSetupMatch?.[1] || scriptMatch?.[1] || "";

    const props = this.extractProps(scriptContent, !!scriptSetupMatch);
    const dependencies = this.extractDependencies(content);

    const source: VueSource = {
      type: "vue",
      path: relativePath,
      exportName: name,
      line: 1,
    };

    return [
      {
        id: createComponentId(source, name),
        name,
        source,
        props,
        variants: [],
        tokens: [],
        dependencies,
        metadata: {
          deprecated: this.hasDeprecatedComment(content),
          tags: [],
        },
        scannedAt: new Date(),
      },
    ];
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
        while (i < propsContent.length && propsContent[i] !== ",") i++;
        i++; // skip comma
        continue;
      }

      const propName = nameMatch[1];
      const isOptional = !!nameMatch[2];
      i += nameMatch[0].length;

      // Now extract the type - need to handle nested braces, parens, and generics
      let typeStr = "";
      let depth = 0;
      const depthChars: Record<string, number> = {
        "{": 1,
        "}": -1,
        "(": 1,
        ")": -1,
        "<": 1,
        ">": -1,
      };

      while (i < propsContent.length) {
        const char = propsContent[i];
        if (char === undefined) break;

        if (char in depthChars) {
          depth += depthChars[char] ?? 0;
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
      // defineProps<{ title: string, count?: number }>()
      // Need to handle nested types like: defineProps<{ cb: () => { value: string } }>()
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
    // Match: propName: Type or propName: { type: Type, required: true }
    const simpleMatch = propsStr.matchAll(
      /(\w+):\s*(String|Number|Boolean|Array|Object|Function)/g,
    );
    for (const m of simpleMatch) {
      if (m[1] && m[2]) {
        props.push({
          name: m[1],
          type: m[2].toLowerCase(),
          required: false,
        });
      }
    }

    // Match complex props: propName: { type: Type, required: true/false }
    const complexMatch = propsStr.matchAll(
      /(\w+):\s*\{[^}]*type:\s*(\w+)[^}]*\}/g,
    );
    for (const m of complexMatch) {
      if (m[1] && m[2]) {
        const isRequired =
          propsStr.includes(`${m[1]}:`) &&
          propsStr
            .substring(propsStr.indexOf(`${m[1]}:`))
            .match(/required:\s*true/);

        // Avoid duplicates
        if (!props.some((p) => p.name === m[1])) {
          props.push({
            name: m[1],
            type: m[2].toLowerCase(),
            required: !!isRequired,
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
