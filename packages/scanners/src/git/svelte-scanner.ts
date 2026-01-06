import { Scanner, ScanResult, ScannerConfig } from "../base/scanner.js";
import type {
  Component,
  PropDefinition,
  SvelteSource,
  HardcodedValue,
} from "@buoy-design/core";
import { createComponentId } from "@buoy-design/core";
import { readFile } from "fs/promises";
import { relative, basename } from "path";
import {
  extractBalancedBraces,
  extractBalancedExpression,
} from "../utils/parser-utils.js";
import {
  createScannerSignalCollector,
  type ScannerSignalCollector,
  type SignalEnrichedScanResult,
  type CollectorStats,
} from "../signals/scanner-integration.js";
import {
  createSignalAggregator,
  type SignalAggregator,
  type RawSignal,
} from "../signals/index.js";

export interface SvelteScannerConfig extends ScannerConfig {
  designSystemPackage?: string;
}

export class SvelteComponentScanner extends Scanner<
  Component,
  SvelteScannerConfig
> {
  /** Default file patterns for Svelte components */
  private static readonly DEFAULT_PATTERNS = ["**/*.svelte"];

  /** Aggregator for collecting signals across all scanned files */
  private signalAggregator: SignalAggregator = createSignalAggregator();

  async scan(): Promise<ScanResult<Component>> {
    // Clear signals from previous scan
    this.signalAggregator.clear();

    // Use cache if available
    if (this.config.cache) {
      return this.runScanWithCache(
        (file) => this.parseFile(file),
        SvelteComponentScanner.DEFAULT_PATTERNS,
      );
    }

    return this.runScan(
      (file) => this.parseFile(file),
      SvelteComponentScanner.DEFAULT_PATTERNS,
    );
  }

  /**
   * Scan and return signals along with components.
   * This is the signal-enriched version of scan().
   */
  async scanWithSignals(): Promise<SignalEnrichedScanResult<Component>> {
    const result = await this.scan();
    return {
      ...result,
      signals: this.signalAggregator.getAllSignals(),
      signalStats: {
        total: this.signalAggregator.getStats().total,
        byType: this.signalAggregator.getStats().byType,
      },
    };
  }

  /**
   * Get signals collected during the last scan.
   * Call after scan() to retrieve signals.
   */
  getCollectedSignals(): RawSignal[] {
    return this.signalAggregator.getAllSignals();
  }

  /**
   * Get signal statistics from the last scan.
   */
  getSignalStats(): CollectorStats {
    const stats = this.signalAggregator.getStats();
    return {
      total: stats.total,
      byType: stats.byType,
    };
  }

  getSourceType(): string {
    return "svelte";
  }

  private async parseFile(filePath: string): Promise<Component[]> {
    const content = await readFile(filePath, "utf-8");
    const relativePath = relative(this.config.projectRoot, filePath);

    // Create signal collector for this file
    const signalCollector = createScannerSignalCollector('svelte', relativePath);

    // Extract component name from filename (e.g., MyButton.svelte -> MyButton)
    const rawName = basename(filePath, ".svelte");

    // Skip SvelteKit route files (+page.svelte, +layout.svelte, +error.svelte, etc.)
    if (rawName.startsWith("+")) {
      // Still add signals even if we skip the component
      this.signalAggregator.addEmitter(relativePath, signalCollector.getEmitter());
      return [];
    }

    // Convert filename to PascalCase component name
    // Handles: button -> Button, my-button -> MyButton, myButton -> MyButton
    const name = this.toPascalCase(rawName);

    // Extract script content (excluding module scripts)
    const scriptContent = this.extractInstanceScriptContent(content);
    // Also get module script for interface definitions
    const moduleScriptContent = this.extractModuleScriptContent(content);

    const props = this.extractProps(scriptContent, moduleScriptContent);
    const dependencies = this.extractDependencies(content, signalCollector);
    const hardcodedValues = this.extractHardcodedValuesFromTemplate(content, signalCollector);

    const source: SvelteSource = {
      type: "svelte",
      path: relativePath,
      exportName: name,
      line: 1,
    };

    // Emit component definition signal
    signalCollector.collectComponentDef(name, 1, {
      propsCount: props.length,
      hasHardcodedValues: hardcodedValues.length > 0,
      dependencyCount: dependencies.length,
    });

    // Add this file's signals to the aggregator
    this.signalAggregator.addEmitter(relativePath, signalCollector.getEmitter());

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
          hardcodedValues: hardcodedValues.length > 0 ? hardcodedValues : undefined,
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
    // Use shared utility from parser-utils (eliminates ~40 lines of duplication)
    const { value, endIndex } = extractBalancedExpression(content, startIdx, [","]);
    return {
      value: value.length > 0 ? value : undefined,
      endIndex,
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
    // Use shared utility from parser-utils (eliminates ~40 lines of duplication)
    const { value: typeStr, endIndex } = extractBalancedExpression(
      typeAndRest,
      0,
      ["=", ";"],
    );

    return {
      type: typeStr || "unknown",
      rest: typeAndRest.substring(endIndex),
    };
  }

  private extractProps(
    scriptContent: string,
    moduleScriptContent: string = "",
  ): PropDefinition[] {
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

          // Look for type annotation after the destructuring
          // Handles: }: TypeName = $props() OR }: { prop: type } = $props() OR }: Type & { prop: type } = $props()
          const afterBrace = scriptContent.substring(
            braceStartIdx + propsContent.length + 2,
          );

          // Check for type annotation (starts with ':')
          const colonMatch = afterBrace.match(/^\s*:/);
          if (colonMatch) {
            const afterColon = afterBrace.substring(colonMatch[0].length);

            // Check if this is an inline object type or intersection ending with inline object
            // Pattern: { prop: type; } = $props() or Type & { prop: type; } = $props()
            const beforePropsInType = afterColon.substring(
              0,
              afterColon.indexOf("$props()"),
            );

            // Find the top-level inline object type by looking for { at depth 0 after & or at start
            // We need to track nesting depth to skip nested { inside <...> generics
            let targetBraceIdx = -1;
            let depth = 0;
            let afterAmpersand = false;

            for (let i = 0; i < beforePropsInType.length; i++) {
              const char = beforePropsInType[i];
              if (char === "<" || char === "(") {
                depth++;
              } else if (char === ">" || char === ")") {
                depth--;
              } else if (char === "&" && depth === 0) {
                afterAmpersand = true;
              } else if (char === "{" && depth === 0) {
                // This is a top-level brace
                // If it's the start of an inline object type (after & or at start without a type name before)
                const beforeBrace = beforePropsInType.substring(0, i).trim();
                if (
                  afterAmpersand ||
                  beforeBrace === "" ||
                  beforeBrace.endsWith("&")
                ) {
                  targetBraceIdx = i;
                }
              }
            }

            if (targetBraceIdx !== -1) {
              const inlineObjectContent = extractBalancedBraces(
                afterColon,
                targetBraceIdx,
              );
              if (inlineObjectContent) {
                const inlineTypeProps =
                  this.extractPropsFromInlineObjectType(inlineObjectContent);
                // Merge type information into our props
                if (inlineTypeProps.length > 0) {
                  const typeMap = new Map(
                    inlineTypeProps.map((p) => [p.name, p]),
                  );
                  for (const prop of props) {
                    const typeDef = typeMap.get(prop.name);
                    if (typeDef) {
                      // Update type if still unknown
                      if (prop.type === "unknown") {
                        prop.type = typeDef.type;
                      }
                      // Also update required status if type definition says optional
                      if (!typeDef.required && prop.required) {
                        prop.required = false;
                      }
                    }
                  }
                }
              }
            }

            // Also check for named type annotation: }: TypeName = $props()
            const typeAnnotationMatch = afterColon.match(
              /^\s*(\w+)\s*=\s*\$props\(\)/,
            );
            if (typeAnnotationMatch && typeAnnotationMatch[1]) {
              const typeName = typeAnnotationMatch[1];
              const allScript = moduleScriptContent + "\n" + scriptContent;
              const typeProps = this.extractPropsFromTypeDefinition(
                allScript,
                typeName,
              );

              // Merge type information from type definition into our props
              if (typeProps.length > 0) {
                const typeMap = new Map(typeProps.map((p) => [p.name, p]));
                for (const prop of props) {
                  const typeDef = typeMap.get(prop.name);
                  if (typeDef && prop.type === "unknown") {
                    prop.type = typeDef.type;
                    // Also update required status if type definition says optional
                    if (!typeDef.required && prop.required) {
                      prop.required = false;
                    }
                  }
                }
              }
            }
          }
        }
      } else {
        // Check for non-destructured $props() pattern (Skeleton pattern):
        // const props: TypeName = $props();
        const nonDestructuredMatch = beforePropsCall.match(
          /(const|let)\s+(\w+)\s*:\s*(\w+)\s*=\s*$/,
        );
        if (nonDestructuredMatch && nonDestructuredMatch[3] && props.length === 0) {
          const typeName = nonDestructuredMatch[3];
          // Try to find the interface/type definition in both scripts
          const allScript = moduleScriptContent + "\n" + scriptContent;
          const typeProps = this.extractPropsFromTypeDefinition(
            allScript,
            typeName,
          );
          props.push(...typeProps);
        }
      }
    }

    // If we still haven't found props, check for interface + $derived pattern
    // Example: const props: Props = $props(); const { a, b } = $derived(props);
    if (props.length === 0 && scriptContent.includes("$derived(")) {
      // Find the variable name used with $props()
      const propsVarMatch = scriptContent.match(
        /(?:const|let)\s+(\w+)\s*(?::\s*(\w+))?\s*=\s*\$props\(\)/,
      );
      if (propsVarMatch && propsVarMatch[1]) {
        const propsVarName = propsVarMatch[1];
        const typeName = propsVarMatch[2];

        // First try to get props from interface/type definition
        if (typeName) {
          const allScript = moduleScriptContent + "\n" + scriptContent;
          const typeProps = this.extractPropsFromTypeDefinition(
            allScript,
            typeName,
          );
          props.push(...typeProps);
        }

        // If we still have no props (interface body was empty), extract from $derived destructuring
        if (props.length === 0) {
          const derivedProps = this.extractPropsFromDerivedDestructuring(
            scriptContent,
            propsVarName,
          );
          props.push(...derivedProps);
        }
      }
    }

    return props;
  }

  /**
   * Extract props from a TypeScript interface definition.
   * Handles: interface Props { name?: type; name: type; }
   */
  private extractPropsFromInterface(
    content: string,
    interfaceName: string,
  ): PropDefinition[] {
    const props: PropDefinition[] = [];

    // Match interface definition with optional extends
    const interfaceRegex = new RegExp(
      `interface\\s+${interfaceName}\\s*(?:extends\\s+[^{]+)?\\{([^}]+)\\}`,
      "s",
    );
    const match = content.match(interfaceRegex);
    if (!match || !match[1]) return props;

    const interfaceBody = match[1];

    // Match prop definitions: propName?: Type; or propName: Type;
    // The last property may not have a trailing semicolon
    const propRegex = /(\w+)(\?)?:\s*([^;,]+)(?:[;,]|$)/g;
    let propMatch;

    while ((propMatch = propRegex.exec(interfaceBody)) !== null) {
      const propName = propMatch[1];
      const isOptional = propMatch[2] === "?";
      const propType = propMatch[3]?.trim() || "unknown";

      if (propName) {
        props.push({
          name: propName,
          type: propType,
          required: !isOptional,
          defaultValue: undefined,
        });
      }
    }

    return props;
  }

  /**
   * Extract props from a TypeScript type alias definition.
   * Handles: type Props = { name?: type; name: type; }
   * Handles: type Props = BaseType & { name?: type; }
   */
  private extractPropsFromTypeAlias(
    content: string,
    typeName: string,
  ): PropDefinition[] {
    const props: PropDefinition[] = [];

    // Find the type alias start
    const typeStartRegex = new RegExp(`type\\s+${typeName}\\s*=\\s*`);
    const typeStartMatch = content.match(typeStartRegex);
    if (!typeStartMatch || typeStartMatch.index === undefined) return props;

    const afterEquals = content.substring(
      typeStartMatch.index + typeStartMatch[0].length,
    );

    // Find the inline object type (the { ... } part)
    // This could be at the start: { prop: type }
    // Or after intersection: BaseType & { prop: type }
    const braceStart = afterEquals.indexOf("{");
    if (braceStart === -1) return props;

    // Extract the balanced braces content
    const objectTypeContent = extractBalancedBraces(afterEquals, braceStart);
    if (!objectTypeContent) return props;

    // Match prop definitions: propName?: Type; or propName: Type;
    // The last property may not have a trailing semicolon
    const propRegex = /(\w+)(\?)?:\s*([^;,]+)(?:[;,]|$)/g;
    let propMatch;

    while ((propMatch = propRegex.exec(objectTypeContent)) !== null) {
      const propName = propMatch[1];
      const isOptional = propMatch[2] === "?";
      const propType = propMatch[3]?.trim() || "unknown";

      if (propName) {
        props.push({
          name: propName,
          type: propType,
          required: !isOptional,
          defaultValue: undefined,
        });
      }
    }

    return props;
  }

  /**
   * Extract props from either interface or type alias.
   */
  private extractPropsFromTypeDefinition(
    content: string,
    typeName: string,
  ): PropDefinition[] {
    // First try interface
    let props = this.extractPropsFromInterface(content, typeName);
    if (props.length > 0) return props;

    // Then try type alias
    props = this.extractPropsFromTypeAlias(content, typeName);
    return props;
  }

  /**
   * Extract props from inline object type annotation.
   * Handles: { propName: type; propName?: type; }
   * Example: let { number, name }: { number: number; name: string } = $props();
   */
  private extractPropsFromInlineObjectType(
    objectContent: string,
  ): PropDefinition[] {
    const props: PropDefinition[] = [];

    // Match prop definitions: propName?: Type; or propName: Type;
    // Handle complex types with generics, unions, etc.
    // The last property may not have a trailing semicolon, so use (;|$) or ([;,]|$)
    // Also handle properties separated by commas in some edge cases
    const propRegex = /(\w+)(\?)?:\s*([^;,]+)(?:[;,]|$)/g;
    let propMatch;

    while ((propMatch = propRegex.exec(objectContent)) !== null) {
      const propName = propMatch[1];
      const isOptional = propMatch[2] === "?";
      const propType = propMatch[3]?.trim() || "unknown";

      if (propName) {
        props.push({
          name: propName,
          type: propType,
          required: !isOptional,
          defaultValue: undefined,
        });
      }
    }

    return props;
  }

  /**
   * Extract props from $derived(varName) destructuring pattern.
   * Handles: const { element, children = null, ...rest } = $derived(props);
   * This is useful when the interface only extends other types and has an empty body.
   */
  private extractPropsFromDerivedDestructuring(
    scriptContent: string,
    propsVarName: string,
  ): PropDefinition[] {
    const props: PropDefinition[] = [];

    // Match: const { ... } = $derived(propsVarName);
    // Need to escape the variable name for regex
    const derivedPattern = new RegExp(
      `(?:const|let)\\s*\\{([^}]+)\\}\\s*=\\s*\\$derived\\(\\s*${propsVarName}\\s*\\)`,
    );
    const derivedMatch = scriptContent.match(derivedPattern);

    if (!derivedMatch || !derivedMatch[1]) {
      return props;
    }

    const destructuredContent = derivedMatch[1];

    // Parse the destructuring content, handling defaults and rest patterns
    // Similar to parseSvelte5Props but for $derived
    let i = 0;
    const charAt = (idx: number): string => destructuredContent.charAt(idx);

    while (i < destructuredContent.length) {
      // Skip whitespace and newlines
      while (i < destructuredContent.length && /\s/.test(charAt(i))) i++;
      if (i >= destructuredContent.length) break;

      // Skip rest spread (...rest)
      if (destructuredContent.substring(i).startsWith("...")) {
        // Skip to end
        break;
      }

      // Match prop name
      const nameMatch = destructuredContent.substring(i).match(/^(\w+)/);
      if (!nameMatch || !nameMatch[1]) {
        // Skip to next comma or end
        while (i < destructuredContent.length && charAt(i) !== ",") i++;
        if (charAt(i) === ",") i++;
        continue;
      }

      const propName = nameMatch[1];
      i += nameMatch[0].length;

      // Skip whitespace
      while (i < destructuredContent.length && /\s/.test(charAt(i))) i++;

      let defaultValue: string | undefined;

      // Check for default value (= value)
      if (charAt(i) === "=") {
        i++; // skip '='
        // Skip whitespace
        while (i < destructuredContent.length && /\s/.test(charAt(i))) i++;

        const { value, endIndex } = this.extractBalancedValue(
          destructuredContent,
          i,
        );
        defaultValue = value;
        i = endIndex;
      }

      // Skip comma
      if (charAt(i) === ",") i++;

      props.push({
        name: propName,
        type: "unknown",
        required: !defaultValue,
        defaultValue,
      });
    }

    return props;
  }

  private extractDependencies(
    content: string,
    signalCollector?: ScannerSignalCollector,
  ): string[] {
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
      if (m[1]) {
        deps.add(m[1]);
        // Emit component usage signal
        signalCollector?.collectComponentUsage(m[1], 1);
      }
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

  /**
   * Extract the module script content (for interface definitions).
   * Module scripts have: <script module> or <script lang="ts" module>
   */
  private extractModuleScriptContent(content: string): string {
    // Match all script tags
    const scriptRegex = /<script([^>]*)>([\s\S]*?)<\/script>/g;
    let match;

    while ((match = scriptRegex.exec(content)) !== null) {
      const attributes = match[1] || "";
      const scriptContent = match[2] || "";

      // Only return module scripts (have "module" attribute)
      if (/\bmodule\b/.test(attributes)) {
        return scriptContent;
      }
    }

    return "";
  }

  /**
   * Extract hardcoded color and spacing values from Svelte template.
   * Detects patterns like:
   * - style="color: #FF0000"
   * - style:color="#FF0000"
   */
  private extractHardcodedValuesFromTemplate(
    content: string,
    signalCollector?: ScannerSignalCollector,
  ): HardcodedValue[] {
    const hardcoded: HardcodedValue[] = [];

    // Pattern 1: Inline style attribute: style="color: #FF0000; padding: 16px"
    const inlineStyleRegex = /style="([^"]+)"/g;
    let match;
    while ((match = inlineStyleRegex.exec(content)) !== null) {
      const styleContent = match[1];
      if (styleContent) {
        // Parse CSS properties
        const propertyRegex = /([a-z-]+)\s*:\s*([^;]+)/g;
        let propMatch;
        while ((propMatch = propertyRegex.exec(styleContent)) !== null) {
          const [, property, value] = propMatch;
          if (property && value) {
            const trimmedValue = value.trim();
            const hardcodedType = this.getHardcodedValueType(property, trimmedValue);
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

    // Pattern 2: Svelte style directives: style:color="#FF0000"
    const styleDirectiveRegex = /style:([a-z-]+)="([^"]+)"/g;
    while ((match = styleDirectiveRegex.exec(content)) !== null) {
      const [, property, value] = match;
      if (property && value) {
        const hardcodedType = this.getHardcodedValueType(property, value);
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

    // Deduplicate by property:value
    const seen = new Set<string>();
    return hardcoded.filter((h) => {
      const key = `${h.property}:${h.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Determine if a CSS value is hardcoded and what type it is.
   * Returns null if the value is a design token or variable.
   */
  private getHardcodedValueType(
    property: string,
    value: string,
  ): "color" | "spacing" | "fontSize" | "other" | null {
    // Skip CSS variables and design tokens
    if (value.startsWith("var(") || value.startsWith("$") || value.includes("token")) {
      return null;
    }

    // Color properties
    const colorProps = ["color", "background-color", "background", "border-color", "fill", "stroke"];
    if (colorProps.includes(property)) {
      // Hex colors, rgb(), rgba(), hsl(), etc.
      if (/^(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|oklch\()/.test(value)) {
        return "color";
      }
    }

    // Spacing properties
    const spacingProps = ["padding", "margin", "gap", "padding-top", "padding-bottom", "padding-left", "padding-right", "margin-top", "margin-bottom", "margin-left", "margin-right"];
    if (spacingProps.includes(property)) {
      // Values with units: 16px, 1rem, 2em, etc.
      if (/^\d+(\.\d+)?(px|rem|em)$/.test(value)) {
        return "spacing";
      }
    }

    // Font size properties
    if (property === "font-size" || property === "fontSize") {
      if (/^\d+(\.\d+)?(px|rem|em|pt)$/.test(value)) {
        return "fontSize";
      }
    }

    return null;
  }
}
