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
    const rawName = basename(filePath, ".svelte");

    // Skip SvelteKit route files (+page.svelte, +layout.svelte, +error.svelte, etc.)
    if (rawName.startsWith("+")) return [];

    // Convert filename to PascalCase component name
    // Handles: button -> Button, my-button -> MyButton, myButton -> MyButton
    const name = this.toPascalCase(rawName);

    // Extract script content (excluding module scripts)
    const scriptContent = this.extractInstanceScriptContent(content);

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
   * Handles: class: className (property renaming)
   * Handles: ...restProps (rest spread - skip)
   * Handles: ref = $bindable(null) ($bindable rune)
   */
  private parseSvelte5Props(propsContent: string): PropDefinition[] {
    const props: PropDefinition[] = [];
    let i = 0;

    const charAt = (idx: number): string => propsContent.charAt(idx);

    while (i < propsContent.length) {
      // Skip whitespace and newlines
      while (i < propsContent.length && /\s/.test(charAt(i))) i++;
      if (i >= propsContent.length) break;

      // Skip rest spread (...restProps)
      if (propsContent.substring(i).startsWith("...")) {
        // Skip to next comma or end
        while (i < propsContent.length && charAt(i) !== ",") i++;
        if (charAt(i) === ",") i++;
        continue;
      }

      // Match prop name (or property being renamed like "class")
      const nameMatch = propsContent.substring(i).match(/^(\w+)/);
      if (!nameMatch || !nameMatch[1]) {
        // Skip to next comma or end
        while (i < propsContent.length && charAt(i) !== ",") i++;
        i++; // skip comma
        continue;
      }

      let propName = nameMatch[1];
      i += nameMatch[0].length;

      // Skip whitespace
      while (i < propsContent.length && /\s/.test(charAt(i))) i++;

      let propType = "unknown";
      let defaultValue: string | undefined;

      // Check for property renaming (class: className) vs type annotation
      if (charAt(i) === ":") {
        // Peek ahead to see if this is a type annotation or property renaming
        const afterColon = propsContent.substring(i + 1).trimStart();

        // Check for property renaming pattern: identifier followed by comma, equals, or end
        const renameMatch = afterColon.match(/^(\w+)\s*([,=]|$)/);
        if (renameMatch && renameMatch[1]) {
          // This is a property rename (e.g., class: className)
          // Use the renamed identifier as the prop name
          propName = renameMatch[1];
          i++; // skip ':'
          while (i < propsContent.length && /\s/.test(charAt(i))) i++;
          i += propName.length; // skip the renamed identifier
          while (i < propsContent.length && /\s/.test(charAt(i))) i++;

          // Check for default value after rename
          if (charAt(i) === "=") {
            i++; // skip '='
            while (i < propsContent.length && /\s/.test(charAt(i))) i++;
            const { value, endIndex } = this.extractBalancedValue(
              propsContent,
              i,
            );
            defaultValue = value;
            i = endIndex;
          }
        } else if (afterColon.startsWith("{")) {
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
        } else {
          // This might be a type annotation in Svelte 4 style - not in destructuring
          // Skip to comma or end
          while (i < propsContent.length && charAt(i) !== ",") i++;
          if (charAt(i) === ",") i++;
          continue;
        }
      }

      // Skip whitespace
      while (i < propsContent.length && /\s/.test(charAt(i))) i++;

      // Check for default value (= value)
      if (charAt(i) === "=") {
        i++; // skip '='
        // Skip whitespace
        while (i < propsContent.length && /\s/.test(charAt(i))) i++;

        const { value, endIndex } = this.extractBalancedValue(propsContent, i);
        defaultValue = value;
        i = endIndex;
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
   * Extract a balanced value (handles nested braces, parens, brackets).
   * Used for extracting default values in $props() destructuring.
   */
  private extractBalancedValue(
    content: string,
    startIdx: number,
  ): { value: string | undefined; endIndex: number } {
    let valueStr = "";
    let depth = 0;
    let i = startIdx;
    const depthChars: { [key: string]: number } = {
      "{": 1,
      "}": -1,
      "(": 1,
      ")": -1,
      "<": 1,
      ">": -1,
      "[": 1,
      "]": -1,
    };

    const charAt = (idx: number): string => content.charAt(idx);

    while (i < content.length) {
      const char = charAt(i);
      const depthDelta = depthChars[char];

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

    const trimmed = valueStr.trim();
    return {
      value: trimmed.length > 0 ? trimmed : undefined,
      endIndex: i,
    };
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

    // Svelte 5 runes: let { propName = default } = $props(); OR const { propName } = $props();
    // Need to handle nested types like: let { cb = () => {} } = $props();
    if (scriptContent.includes("$props()")) {
      // Find the $props() call and work backwards to find the matching brace
      // Match both "let {" and "const {" patterns
      const propsCallIdx = scriptContent.indexOf("$props()");
      const beforePropsCall = scriptContent.substring(0, propsCallIdx);

      // Match the variable declaration with either let or const
      const varBraceMatch = beforePropsCall.match(/(let|const)\s*\{/);

      if (varBraceMatch && varBraceMatch.index !== undefined) {
        const braceStartIdx = beforePropsCall.indexOf("{", varBraceMatch.index);
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

  /**
   * Convert a filename to PascalCase component name.
   * Handles: button -> Button, my-button -> MyButton, myButton -> MyButton
   */
  private toPascalCase(name: string): string {
    // Handle kebab-case and snake_case
    return name
      .split(/[-_]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");
  }

  /**
   * Extract the instance script content (not the module script).
   * Module scripts have: <script module> or <script lang="ts" module>
   * Instance scripts are regular: <script> or <script lang="ts">
   */
  private extractInstanceScriptContent(content: string): string {
    // Match all script tags
    const scriptRegex = /<script([^>]*)>([\s\S]*?)<\/script>/g;
    let match;

    while ((match = scriptRegex.exec(content)) !== null) {
      const attributes = match[1] || "";
      const scriptContent = match[2] || "";

      // Skip module scripts (have "module" attribute)
      if (/\bmodule\b/.test(attributes)) {
        continue;
      }

      // This is the instance script
      return scriptContent;
    }

    return "";
  }
}
