import { Scanner, ScanResult, ScannerConfig } from "../base/scanner.js";
import type {
  Component,
  PropDefinition,
  SvelteSource,
} from "@buoy-design/core";
import { createComponentId } from "@buoy-design/core";
import { readFile } from "fs/promises";
import { relative, basename } from "path";
import { extractBalancedBraces } from "../utils/parser-utils.js";

export interface SvelteScannerConfig extends ScannerConfig {
  designSystemPackage?: string;
}

export class SvelteComponentScanner extends Scanner<
  Component,
  SvelteScannerConfig
> {
  /** Default file patterns for Svelte components */
  private static readonly DEFAULT_PATTERNS = ["**/*.svelte"];

  async scan(): Promise<ScanResult<Component>> {
    return this.runScan(
      (file) => this.parseFile(file),
      SvelteComponentScanner.DEFAULT_PATTERNS,
    );
  }

  getSourceType(): string {
    return "svelte";
  }

  private async parseFile(filePath: string): Promise<Component[]> {
    const content = await readFile(filePath, "utf-8");
    const relativePath = relative(this.config.projectRoot, filePath);

    // Extract component name from filename (e.g., MyButton.svelte -> MyButton)
    const name = basename(filePath, ".svelte");

    // Only process PascalCase component names
    if (!/^[A-Z]/.test(name)) return [];

    // Extract script content
    const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    const scriptContent = scriptMatch?.[1] || "";

    const props = this.extractProps(scriptContent);
    const dependencies = this.extractDependencies(content);

    const source: SvelteSource = {
      type: "svelte",
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
   * Parse Svelte 5 $props() destructuring with proper handling of nested types.
   * Handles: let { cb = () => {}, data: { nested } = {} } = $props();
   */
  private parseSvelte5Props(propsContent: string): PropDefinition[] {
    const props: PropDefinition[] = [];
    let i = 0;

    const charAt = (idx: number): string => propsContent.charAt(idx);

    while (i < propsContent.length) {
      // Skip whitespace
      while (i < propsContent.length && /\s/.test(charAt(i))) i++;
      if (i >= propsContent.length) break;

      // Match prop name
      const nameMatch = propsContent.substring(i).match(/^(\w+)/);
      if (!nameMatch || !nameMatch[1]) {
        // Skip to next comma or end
        while (i < propsContent.length && charAt(i) !== ",") i++;
        i++; // skip comma
        continue;
      }

      const propName = nameMatch[1];
      i += nameMatch[0].length;

      // Skip whitespace
      while (i < propsContent.length && /\s/.test(charAt(i))) i++;

      let propType = "unknown";
      let defaultValue: string | undefined;

      // Check for type annotation (: Type) - but NOT destructuring rename
      if (charAt(i) === ":") {
        // Peek ahead to see if this is a type annotation or destructuring
        const afterColon = propsContent.substring(i + 1).trimStart();
        if (afterColon.startsWith("{")) {
          // This is destructuring rename, skip this prop
          i++; // skip ':'
          while (i < propsContent.length && /\s/.test(charAt(i))) i++;
          // Skip the nested braces
          if (charAt(i) === "{") {
            const nested = extractBalancedBraces(propsContent, i);
            if (nested !== null) {
              i += nested.length + 2; // +2 for the braces
            }
          }
          // Skip to comma
          while (i < propsContent.length && charAt(i) !== ",") i++;
          if (charAt(i) === ",") i++;
          continue;
        }

        i++; // skip ':'
        // Skip whitespace
        while (i < propsContent.length && /\s/.test(charAt(i))) i++;

        // Extract type with proper nesting
        let typeStr = "";
        let depth = 0;
        const typeDepthChars: { [key: string]: number } = {
          "{": 1,
          "}": -1,
          "(": 1,
          ")": -1,
          "<": 1,
          ">": -1,
        };

        while (i < propsContent.length) {
          const char = charAt(i);
          const depthDelta = typeDepthChars[char];

          if (depthDelta !== undefined) {
            depth += depthDelta;
          }

          // Stop at comma or '=' only when not nested
          if (depth === 0 && (char === "," || char === "=")) {
            break;
          }

          typeStr += char;
          i++;
        }

        propType = typeStr.trim() || "unknown";
      }

      // Skip whitespace
      while (i < propsContent.length && /\s/.test(charAt(i))) i++;

      // Check for default value (= value)
      if (charAt(i) === "=") {
        i++; // skip '='
        // Skip whitespace
        while (i < propsContent.length && /\s/.test(charAt(i))) i++;

        // Extract default value with proper nesting
        let valueStr = "";
        let depth = 0;
        const valueDepthChars: { [key: string]: number } = {
          "{": 1,
          "}": -1,
          "(": 1,
          ")": -1,
          "<": 1,
          ">": -1,
          "[": 1,
          "]": -1,
        };

        while (i < propsContent.length) {
          const char = charAt(i);
          const depthDelta = valueDepthChars[char];

          if (depthDelta !== undefined) {
            depth += depthDelta;
          }

          // Stop at comma only when not nested
          if (depth === 0 && char === ",") {
            break;
          }

          valueStr += char;
          i++;
        }

        defaultValue = valueStr.trim() || undefined;
      }

      // Skip comma
      if (charAt(i) === ",") i++;

      props.push({
        name: propName,
        type: propType,
        required: !defaultValue,
        defaultValue,
      });
    }

    return props;
  }

  /**
   * Extract type from export let statement, handling nested types.
   * Handles: export let cb: () => { value: string };
   */
  private extractTypeFromExportLet(typeAndRest: string): {
    type: string;
    rest: string;
  } {
    let typeStr = "";
    let depth = 0;
    let i = 0;
    const depthChars: { [key: string]: number } = {
      "{": 1,
      "}": -1,
      "(": 1,
      ")": -1,
      "<": 1,
      ">": -1,
    };

    const charAt = (idx: number): string => typeAndRest.charAt(idx);

    while (i < typeAndRest.length) {
      const char = charAt(i);
      const depthDelta = depthChars[char];

      if (depthDelta !== undefined) {
        depth += depthDelta;
      }

      // Stop at '=' or ';' only when not nested
      if (depth === 0 && (char === "=" || char === ";")) {
        break;
      }

      typeStr += char;
      i++;
    }

    return {
      type: typeStr.trim() || "unknown",
      rest: typeAndRest.substring(i),
    };
  }

  private extractProps(scriptContent: string): PropDefinition[] {
    const props: PropDefinition[] = [];

    // Svelte 4 and earlier: export let propName = defaultValue;
    // Match: export let propName; or export let propName = value; or export let propName: Type;
    // Need to handle nested types like: export let cb: () => { value: string };
    const exportLetRegex = /export\s+let\s+(\w+)\s*([:=;])/g;
    let match;

    while ((match = exportLetRegex.exec(scriptContent)) !== null) {
      const propName = match[1];
      const nextChar = match[2];
      if (!propName) continue;

      let propType = "unknown";
      let defaultValue: string | undefined;

      if (nextChar === ":") {
        // Has type annotation
        const afterColon = scriptContent.substring(
          match.index + match[0].length - 1,
        );
        const { type, rest } = this.extractTypeFromExportLet(afterColon);
        propType = type;

        // Check for default value after the type
        const defaultMatch = rest.match(/^\s*=\s*([^;]+);/);
        if (defaultMatch && defaultMatch[1]) {
          defaultValue = defaultMatch[1].trim();
        }
      } else if (nextChar === "=") {
        // Has default value but no type
        const afterEquals = scriptContent.substring(
          match.index + match[0].length - 1,
        );
        const defaultMatch = afterEquals.match(/^\s*([^;]+);/);
        if (defaultMatch && defaultMatch[1]) {
          defaultValue = defaultMatch[1].trim();
        }
      }
      // If nextChar is ';', no type and no default value

      props.push({
        name: propName,
        type: propType,
        required: !defaultValue,
        defaultValue,
      });
    }

    // Svelte 5 runes: let { propName = default } = $props();
    // Need to handle nested types like: let { cb = () => {} } = $props();
    if (scriptContent.includes("$props()")) {
      // Find the $props() call and work backwards to find the matching brace
      const propsCallIdx = scriptContent.indexOf("$props()");
      const letBraceMatch = scriptContent
        .substring(0, propsCallIdx)
        .match(/let\s*\{/);

      if (letBraceMatch && letBraceMatch.index !== undefined) {
        const braceStartIdx = scriptContent.indexOf("{", letBraceMatch.index);
        const propsContent = extractBalancedBraces(
          scriptContent,
          braceStartIdx,
        );

        if (propsContent) {
          const svelte5Props = this.parseSvelte5Props(propsContent);
          // Only add if we haven't already found props via export let
          if (props.length === 0) {
            props.push(...svelte5Props);
          }
        }
      }
    }

    return props;
  }

  private extractDependencies(content: string): string[] {
    const deps: Set<string> = new Set();

    // Find component imports
    const importMatches = content.matchAll(
      /import\s+(\w+)\s+from\s+['"]\.[^'"]+\.svelte['"]/g,
    );
    for (const m of importMatches) {
      if (m[1] && /^[A-Z]/.test(m[1])) {
        deps.add(m[1]);
      }
    }

    // Find component usage in template: <ComponentName
    const componentUsage = content.matchAll(/<([A-Z][a-zA-Z0-9]+)/g);
    for (const m of componentUsage) {
      if (m[1]) deps.add(m[1]);
    }

    return Array.from(deps);
  }

  private hasDeprecatedComment(content: string): boolean {
    return content.includes("@deprecated") || content.includes("* @deprecated");
  }
}
