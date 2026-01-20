import { SignalAwareScanner, ScanResult, ScannerConfig } from "../base/index.js";
import type {
  Component,
  PropDefinition,
  ReactSource,
  HardcodedValue,
} from "@buoy-design/core";
import { createComponentId } from "@buoy-design/core";
import * as ts from "typescript";
import { readFile } from "fs/promises";
import { relative } from "path";
import {
  createScannerSignalCollector,
  type ScannerSignalCollector,
} from "../signals/scanner-integration.js";

// Patterns for detecting hardcoded values
const COLOR_PATTERNS = [
  /^#[0-9a-fA-F]{3,8}$/, // Hex colors
  /^rgb\s*\(/i, // rgb()
  /^rgba\s*\(/i, // rgba()
  /^hsl\s*\(/i, // hsl()
  /^hsla\s*\(/i, // hsla()
];

// Pattern for buoy-ignore comments
const BUOY_IGNORE_PATTERN = /buoy-ignore|buoy-disable/i;

const SPACING_PATTERNS = [
  /^\d+(\.\d+)?(px|rem|em|vh|vw|%)$/, // Numeric with units
];

const FONT_SIZE_PATTERNS = [
  /^\d+(\.\d+)?(px|rem|em|pt)$/, // Font sizes
];

// Style properties that commonly contain design tokens
const STYLE_PROPERTIES: Record<string, HardcodedValue["type"]> = {
  color: "color",
  backgroundColor: "color",
  background: "color",
  borderColor: "color",
  fill: "color",
  stroke: "color",
  padding: "spacing",
  paddingTop: "spacing",
  paddingRight: "spacing",
  paddingBottom: "spacing",
  paddingLeft: "spacing",
  margin: "spacing",
  marginTop: "spacing",
  marginRight: "spacing",
  marginBottom: "spacing",
  marginLeft: "spacing",
  gap: "spacing",
  width: "spacing",
  height: "spacing",
  top: "spacing",
  right: "spacing",
  bottom: "spacing",
  left: "spacing",
  fontSize: "fontSize",
  fontFamily: "fontFamily",
  boxShadow: "shadow",
  textShadow: "shadow",
  border: "border",
  borderWidth: "border",
  borderRadius: "border",
};

export interface ReactScannerConfig extends ScannerConfig {
  designSystemPackage?: string;
  componentPatterns?: string[];
}

export class ReactComponentScanner extends SignalAwareScanner<
  Component,
  ReactScannerConfig
> {
  /** Default file patterns for React components */
  private static readonly DEFAULT_PATTERNS = ["**/*.tsx", "**/*.jsx", "**/*.ts", "**/*.js"];

  async scan(): Promise<ScanResult<Component>> {
    // Clear signals from previous scan
    this.clearSignals();

    // Use cache if available
    let result: ScanResult<Component>;
    if (this.config.cache) {
      result = await this.runScanWithCache(
        (file) => this.parseFile(file),
        ReactComponentScanner.DEFAULT_PATTERNS,
      );
    } else {
      result = await this.runScan(
        (file) => this.parseFile(file),
        ReactComponentScanner.DEFAULT_PATTERNS,
      );
    }

    // Post-process: detect and mark compound component groups based on shared prefixes
    result.items = this.detectCompoundGroups(result.items);

    return result;
  }

  /**
   * Detect compound component groups based on shared prefixes from the same file.
   * e.g., Select, SelectTrigger, SelectContent from select.tsx → group under "Select"
   */
  private detectCompoundGroups(components: Component[]): Component[] {
    // Group components by source file
    const byFile = new Map<string, Component[]>();
    for (const comp of components) {
      if (comp.source.type !== "react") continue;
      const filePath = comp.source.path;
      if (!byFile.has(filePath)) {
        byFile.set(filePath, []);
      }
      byFile.get(filePath)!.push(comp);
    }

    // For each file, detect shared prefix groups
    for (const [_filePath, fileComponents] of byFile) {
      if (fileComponents.length < 2) continue;

      // Skip if already has compound component tags (processed by Object.assign or namespace detection)
      const hasExistingCompound = fileComponents.some(
        (c) =>
          c.metadata.tags?.includes("compound-component") ||
          c.metadata.tags?.includes("compound-component-namespace"),
      );
      if (hasExistingCompound) continue;

      // Find potential root components (shortest names that are prefixes of others)
      const names = fileComponents.map((c) => c.name);
      const potentialRoots = this.findCompoundRoots(names);

      // Mark components with their compound group
      for (const root of potentialRoots) {
        const groupMembers = fileComponents.filter(
          (c) => c.name === root || c.name.startsWith(root),
        );

        // Only create a group if there are at least 2 members (root + 1 sub-component)
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

    return components;
  }

  /**
   * Find potential compound component roots from a list of names.
   * A root is a name that is a prefix of at least one other name.
   * e.g., ["Select", "SelectTrigger", "SelectContent"] → ["Select"]
   */
  private findCompoundRoots(names: string[]): string[] {
    const roots: string[] = [];
    const sortedNames = [...names].sort((a, b) => a.length - b.length);

    for (const name of sortedNames) {
      // Check if this name is a prefix of any other name
      const hasSubComponents = sortedNames.some(
        (other) =>
          other !== name &&
          other.startsWith(name) &&
          // Ensure it's a proper prefix (next char is uppercase = new word)
          other.length > name.length &&
          /^[A-Z]/.test(other[name.length]!),
      );

      if (hasSubComponents) {
        // Don't add if it's already a sub-component of an existing root
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
    return "react";
  }

  /**
   * Check if a node is at module scope (direct child of SourceFile)
   * This prevents detecting inner components defined inside factory functions
   */
  private isAtModuleScope(node: ts.Node): boolean {
    let current = node.parent;
    while (current) {
      // If we hit a function (arrow, expression, or declaration), we're not at module scope
      if (
        ts.isFunctionDeclaration(current) ||
        ts.isFunctionExpression(current) ||
        ts.isArrowFunction(current) ||
        ts.isMethodDeclaration(current)
      ) {
        return false;
      }
      // If we hit the source file directly, we're at module scope
      if (ts.isSourceFile(current)) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  private async parseFile(filePath: string): Promise<Component[]> {
    const content = await readFile(filePath, "utf-8");
    // Determine script kind based on file extension
    // Use JSX for .js files too since they may contain JSX (common in older React codebases)
    let scriptKind: ts.ScriptKind;
    if (filePath.endsWith(".tsx")) {
      scriptKind = ts.ScriptKind.TSX;
    } else if (filePath.endsWith(".jsx") || filePath.endsWith(".js")) {
      scriptKind = ts.ScriptKind.JSX;
    } else {
      scriptKind = ts.ScriptKind.TS;
    }

    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      scriptKind,
    );

    const components: Component[] = [];
    const relativePath = relative(this.config.projectRoot, filePath);

    // Create signal collector for this file
    const signalCollector = createScannerSignalCollector('react', relativePath);

    // Track compound component namespaces: { "Menu": ["Button", "Item"] }
    const compoundComponents: Map<string, Set<string>> = new Map();
    // Track component references for resolving Object.assign
    const componentNames: Set<string> = new Set();

    const visit = (node: ts.Node) => {
      // Function declarations: function Button() {}
      // Only detect at module scope to avoid inner components in factories
      if (ts.isFunctionDeclaration(node) && node.name) {
        if (this.isAtModuleScope(node) && this.isReactComponent(node, sourceFile)) {
          const comp = this.extractFunctionComponent(
            node,
            sourceFile,
            relativePath,
            signalCollector,
          );
          if (comp) {
            components.push(comp);
            componentNames.add(comp.name);
          }
        }
      }

      // Variable declarations: const Button = () => {} or const Button = function() {}
      // Only detect at module scope to avoid inner components in factories
      if (ts.isVariableStatement(node) && this.isAtModuleScope(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.initializer) {

            // Check for Object.assign(Component, { ... }) pattern
            const compoundInfo = this.extractCompoundComponentFromObjectAssign(
              decl,
              sourceFile,
              relativePath,
            );
            if (compoundInfo) {
              // Add the namespace component
              components.push(compoundInfo.namespaceComponent);
              componentNames.add(compoundInfo.namespaceComponent.name);
              // Emit signal for namespace component
              signalCollector.collectComponentDef(
                compoundInfo.namespaceComponent.name,
                compoundInfo.namespaceComponent.source.type === 'react'
                  ? compoundInfo.namespaceComponent.source.line || 1
                  : 1,
                { isCompoundNamespace: true },
              );
              // Track sub-components for this namespace
              if (!compoundComponents.has(compoundInfo.namespaceComponent.name)) {
                compoundComponents.set(compoundInfo.namespaceComponent.name, new Set());
              }
              for (const subName of compoundInfo.subComponentNames) {
                compoundComponents.get(compoundInfo.namespaceComponent.name)!.add(subName);
              }
            } else if (this.isReactComponentExpression(decl.initializer, sourceFile)) {
              const comp = this.extractVariableComponent(
                decl,
                sourceFile,
                relativePath,
                signalCollector,
              );
              if (comp) {
                components.push(comp);
                componentNames.add(comp.name);
              }
            }
          }
        }
      }

      // Namespace export: export * as Accordion from "./namespace"
      // This creates compound component namespaces like Accordion.Root, Accordion.Item
      if (ts.isExportDeclaration(node) && node.exportClause) {
        // Check for namespace export: export * as X from "..."
        if (ts.isNamespaceExport(node.exportClause)) {
          const namespaceName = node.exportClause.name.getText(sourceFile);
          // Only process if uppercase (component naming convention)
          if (/^[A-Z]/.test(namespaceName)) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
            const source: ReactSource = {
              type: "react",
              path: relativePath,
              exportName: namespaceName,
              line,
            };

            // Create namespace component
            const namespaceComponent: Component = {
              id: createComponentId(source, namespaceName),
              name: namespaceName,
              source,
              props: [],
              variants: [],
              tokens: [],
              dependencies: [],
              metadata: {
                tags: ["compound-component-namespace", "namespace-export"],
              },
              scannedAt: new Date(),
            };
            components.push(namespaceComponent);
            componentNames.add(namespaceName);

            // Emit signal for namespace component
            signalCollector.collectComponentDef(namespaceName, line, {
              isCompoundNamespace: true,
              isNamespaceExport: true,
            });
          }
        }
      }

      // Property assignment: Dialog.Title = DialogTitle
      if (ts.isExpressionStatement(node)) {
        const expr = node.expression;
        if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
          const left = expr.left;
          // Check for Component.SubComponent pattern
          if (ts.isPropertyAccessExpression(left)) {
            const objName = left.expression.getText(sourceFile);
            const propName = left.name.getText(sourceFile);

            // Only process if the property name starts with uppercase (sub-component)
            if (/^[A-Z]/.test(propName)) {
              if (!compoundComponents.has(objName)) {
                compoundComponents.set(objName, new Set());
              }
              compoundComponents.get(objName)!.add(propName);
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);

    // Post-process: Add compound sub-components with namespace prefix
    for (const [namespace, subNames] of compoundComponents) {
      for (const subName of subNames) {
        const compoundName = `${namespace}.${subName}`;

        // Find the original component to get its metadata
        const originalComponent = components.find((c) => c.name === subName);

        // Get line from original component's source if it's a React source
        let line = 1;
        if (originalComponent && originalComponent.source.type === "react") {
          line = originalComponent.source.line || 1;
        }
        const source: ReactSource = {
          type: "react",
          path: relativePath,
          exportName: compoundName,
          line,
        };

        components.push({
          id: createComponentId(source, compoundName),
          name: compoundName,
          source,
          props: originalComponent?.props || [],
          variants: [],
          tokens: [],
          dependencies: originalComponent?.dependencies || [],
          metadata: {
            tags: ["compound-component"],
            ...(originalComponent?.metadata || {}),
          },
          scannedAt: new Date(),
        });

        // Emit compound component signal
        signalCollector.collectComponentDef(compoundName, line, {
          isCompound: true,
          namespace,
        });
      }
    }

    // Add this file's signals to the aggregator
    this.addSignals(relativePath, signalCollector.getEmitter());

    return components;
  }

  /**
   * Extract compound component from Object.assign(Component, { ... }) pattern
   */
  private extractCompoundComponentFromObjectAssign(
    node: ts.VariableDeclaration,
    sourceFile: ts.SourceFile,
    relativePath: string,
  ): { namespaceComponent: Component; subComponentNames: string[] } | null {
    if (!ts.isIdentifier(node.name)) return null;
    if (!node.initializer) return null;

    // Check for Object.assign call
    if (!ts.isCallExpression(node.initializer)) return null;

    const callExpr = node.initializer;
    const callee = callExpr.expression;

    // Check if it's Object.assign
    if (!ts.isPropertyAccessExpression(callee)) return null;
    if (callee.expression.getText(sourceFile) !== "Object") return null;
    if (callee.name.getText(sourceFile) !== "assign") return null;

    // Need at least 2 arguments: base component and object with sub-components
    if (callExpr.arguments.length < 2) return null;

    const namespaceName = node.name.getText(sourceFile);

    // Check for uppercase first letter
    if (!/^[A-Z]/.test(namespaceName)) return null;

    // Get sub-component names from the object literal (second argument)
    const subComponentNames: string[] = [];
    const secondArg = callExpr.arguments[1] as ts.Expression | undefined;

    if (secondArg && ts.isObjectLiteralExpression(secondArg)) {
      for (const prop of secondArg.properties) {
        if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
          if (prop.name) {
            const propName = prop.name.getText(sourceFile);
            if (propName && /^[A-Z]/.test(propName)) {
              subComponentNames.push(propName);
            }
          }
        }
      }
    }

    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

    const source: ReactSource = {
      type: "react",
      path: relativePath,
      exportName: namespaceName,
      line,
    };

    const namespaceComponent: Component = {
      id: createComponentId(source, namespaceName),
      name: namespaceName,
      source,
      props: [],
      variants: [],
      tokens: [],
      dependencies: [],
      metadata: {
        tags: ["compound-component-namespace"],
      },
      scannedAt: new Date(),
    };

    return { namespaceComponent, subComponentNames };
  }

  private isReactComponent(
    node: ts.FunctionDeclaration,
    sourceFile: ts.SourceFile,
  ): boolean {
    // Check if function name starts with uppercase (React convention)
    if (!node.name) return false;
    const name = node.name.getText(sourceFile);
    if (!/^[A-Z]/.test(name)) return false;

    // Check if it returns JSX
    if (this.returnsJsx(node)) {
      return true;
    }

    // Check if it has a React-related return type (for .ts files without JSX)
    if (node.type) {
      const returnType = node.type.getText(sourceFile);
      if (
        returnType.includes("ReactNode") ||
        returnType.includes("ReactElement") ||
        returnType.includes("JSX.Element") ||
        returnType.includes("React.FC") ||
        returnType.includes("React.FunctionComponent")
      ) {
        return true;
      }
    }

    return false;
  }

  private isReactComponentExpression(
    node: ts.Expression,
    sourceFile: ts.SourceFile,
  ): boolean {
    // Handle type assertions: const X = forwardRef(...) as SomeType
    // Unwrap the AsExpression to check the inner expression
    if (ts.isAsExpression(node)) {
      return this.isReactComponentExpression(node.expression, sourceFile);
    }

    // Handle parenthesized expressions: const X = (forwardRef(...))
    if (ts.isParenthesizedExpression(node)) {
      return this.isReactComponentExpression(node.expression, sourceFile);
    }

    // Arrow function or function expression
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      // Check for JSX first
      if (this.returnsJsx(node)) {
        return true;
      }
      // Check for React-related return type (for .ts files without JSX)
      if (node.type) {
        const returnType = node.type.getText(sourceFile);
        if (
          returnType.includes("ReactNode") ||
          returnType.includes("ReactElement") ||
          returnType.includes("JSX.Element") ||
          returnType.includes("React.FC") ||
          returnType.includes("React.FunctionComponent")
        ) {
          return true;
        }
      }
      return false;
    }

    // Call expressions: forwardRef, memo, factory patterns, etc.
    if (ts.isCallExpression(node)) {
      const callText = node.expression.getText(sourceFile);

      // React.forwardRef or React.memo
      if (
        callText.includes("forwardRef") ||
        callText.includes("memo") ||
        callText.includes("React.forwardRef") ||
        callText.includes("React.memo")
      ) {
        return true;
      }

      // Mantine: polymorphicFactory<T>() pattern and factory<T>() pattern
      if (callText.includes("polymorphicFactory") || callText === "factory") {
        return true;
      }

      // Chakra UI: createRecipeContext() and createSlotRecipeContext() patterns
      // Also check for withContext, withProvider, and withRootProvider patterns commonly used with these
      if (
        callText.includes("createRecipeContext") ||
        callText.includes("createSlotRecipeContext") ||
        callText.includes("withContext") ||
        callText.includes("withProvider") ||
        callText.includes("withRootProvider")
      ) {
        return true;
      }

      // Chakra UI: chakra() styled component factory pattern
      // e.g., export const Center = chakra("div", { ... })
      if (callText === "chakra") {
        return true;
      }

      // shadcn/ui: cva() class-variance-authority pattern
      if (callText === "cva") {
        return true;
      }

      // React.lazy() for code splitting
      if (callText === "lazy" || callText === "React.lazy") {
        return true;
      }

      // styled-components and emotion patterns: styled(), styled.div, etc.
      if (
        callText === "styled" ||
        callText.startsWith("styled.") ||
        callText.includes("styled(")
      ) {
        return true;
      }

      // Generic component creation patterns
      if (
        callText.includes("createComponent") ||
        callText.includes("createStyledComponent") ||
        callText.includes("createBox") ||
        callText.includes("createIcon")
      ) {
        return true;
      }

      // Radix UI and Ark UI patterns
      if (
        callText.includes("Primitive.") ||
        callText.includes("ark.") ||
        callText.includes("Ark.")
      ) {
        return true;
      }
    }

    return false;
  }

  private returnsJsx(
    node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  ): boolean {
    let hasJsx = false;

    const checkNode = (n: ts.Node) => {
      if (
        ts.isJsxElement(n) ||
        ts.isJsxSelfClosingElement(n) ||
        ts.isJsxFragment(n)
      ) {
        hasJsx = true;
        return;
      }
      ts.forEachChild(n, checkNode);
    };

    if (node.body) {
      checkNode(node.body);
    }

    return hasJsx;
  }

  private extractFunctionComponent(
    node: ts.FunctionDeclaration,
    sourceFile: ts.SourceFile,
    relativePath: string,
    signalCollector: ScannerSignalCollector,
  ): Component | null {
    if (!node.name) return null;

    const name = node.name.getText(sourceFile);
    const props = this.extractProps(node.parameters, sourceFile);
    const line =
      sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line +
      1;

    const source: ReactSource = {
      type: "react",
      path: relativePath,
      exportName: name,
      line,
    };

    const hardcodedValues = this.extractHardcodedValues(node, sourceFile, signalCollector);
    const dependencies = this.extractDependencies(node, sourceFile, signalCollector);

    // Emit component definition signal
    signalCollector.collectComponentDef(name, line, {
      propsCount: props.length,
      hasHardcodedValues: hardcodedValues.length > 0,
      dependencyCount: dependencies.length,
    });

    return {
      id: createComponentId(source, name),
      name,
      source,
      props,
      variants: [],
      tokens: [],
      dependencies,
      metadata: {
        deprecated: this.hasDeprecatedTag(node, sourceFile),
        tags: this.extractTags(node, sourceFile),
        hardcodedValues:
          hardcodedValues.length > 0 ? hardcodedValues : undefined,
      },
      scannedAt: new Date(),
    };
  }

  private extractVariableComponent(
    node: ts.VariableDeclaration,
    sourceFile: ts.SourceFile,
    relativePath: string,
    signalCollector: ScannerSignalCollector,
  ): Component | null {
    if (!ts.isIdentifier(node.name)) return null;

    const name = node.name.getText(sourceFile);

    // Check for uppercase first letter
    if (!/^[A-Z]/.test(name)) return null;

    const line =
      sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line +
      1;

    const source: ReactSource = {
      type: "react",
      path: relativePath,
      exportName: name,
      line,
    };

    let props: PropDefinition[] = [];
    const init = node.initializer;

    if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
      props = this.extractProps(init.parameters, sourceFile);
    }

    const hardcodedValues = this.extractHardcodedValues(node, sourceFile, signalCollector);

    // Emit component definition signal
    signalCollector.collectComponentDef(name, line, {
      propsCount: props.length,
      hasHardcodedValues: hardcodedValues.length > 0,
    });

    return {
      id: createComponentId(source, name),
      name,
      source,
      props,
      variants: [],
      tokens: [],
      dependencies: [],
      metadata: {
        tags: [],
        hardcodedValues:
          hardcodedValues.length > 0 ? hardcodedValues : undefined,
      },
      scannedAt: new Date(),
    };
  }

  private extractProps(
    parameters: ts.NodeArray<ts.ParameterDeclaration>,
    sourceFile: ts.SourceFile,
  ): PropDefinition[] {
    const props: PropDefinition[] = [];

    // Usually the first parameter is props
    const propsParam = parameters[0];
    if (!propsParam) return props;

    // Check for destructured props or typed props
    const typeNode = propsParam.type;

    if (typeNode && ts.isTypeLiteralNode(typeNode)) {
      for (const member of typeNode.members) {
        if (ts.isPropertySignature(member) && member.name) {
          props.push({
            name: member.name.getText(sourceFile),
            type: member.type ? member.type.getText(sourceFile) : "unknown",
            required: !member.questionToken,
          });
        }
      }
    } else if (typeNode && ts.isTypeReferenceNode(typeNode)) {
      // Reference to an interface/type - we just note the type name
      props.push({
        name: "props",
        type: typeNode.getText(sourceFile),
        required: true,
      });
    }

    // Handle destructured props: ({ onClick, disabled })
    if (ts.isObjectBindingPattern(propsParam.name)) {
      for (const element of propsParam.name.elements) {
        if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
          props.push({
            name: element.name.getText(sourceFile),
            type: "unknown",
            required: !element.initializer,
            defaultValue: element.initializer
              ? element.initializer.getText(sourceFile)
              : undefined,
          });
        }
      }
    }

    return props;
  }

  private extractDependencies(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    signalCollector?: ScannerSignalCollector,
  ): string[] {
    const deps: Set<string> = new Set();

    const visit = (n: ts.Node) => {
      // Find JSX elements that reference other components
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
        const tagName = n.tagName.getText(sourceFile);
        // Only include PascalCase names (components, not HTML elements)
        if (/^[A-Z]/.test(tagName)) {
          deps.add(tagName);
          // Emit component usage signal
          if (signalCollector) {
            const line = sourceFile.getLineAndCharacterOfPosition(n.getStart(sourceFile)).line + 1;
            signalCollector.collectComponentUsage(tagName, line);
          }
        }
      }
      ts.forEachChild(n, visit);
    };

    visit(node);
    return Array.from(deps);
  }

  private hasDeprecatedTag(node: ts.Node, sourceFile: ts.SourceFile): boolean {
    const jsDocs = ts.getJSDocTags(node);
    return jsDocs.some(
      (tag) => tag.tagName.getText(sourceFile) === "deprecated",
    );
  }

  private extractTags(node: ts.Node, sourceFile: ts.SourceFile): string[] {
    const tags: string[] = [];
    const jsDocs = ts.getJSDocTags(node);

    for (const tag of jsDocs) {
      const tagName = tag.tagName.getText(sourceFile);
      if (tagName !== "param" && tagName !== "returns" && tagName !== "type") {
        tags.push(tagName);
      }
    }

    return tags;
  }

  /**
   * Check if a node has a buoy-ignore comment on the same line or preceding line
   */
  private hasIgnoreComment(node: ts.Node, sourceFile: ts.SourceFile): boolean {
    const nodeStart = node.getStart(sourceFile);
    const lineNumber = sourceFile.getLineAndCharacterOfPosition(nodeStart).line;
    const fullText = sourceFile.getFullText();

    // Get the text of the current line and previous line
    const lines = fullText.split('\n');
    const currentLine = lines[lineNumber] || '';
    const previousLine = lineNumber > 0 ? lines[lineNumber - 1] || '' : '';

    // Check for buoy-ignore comment
    return BUOY_IGNORE_PATTERN.test(currentLine) || BUOY_IGNORE_PATTERN.test(previousLine);
  }

  private extractHardcodedValues(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    signalCollector?: ScannerSignalCollector,
  ): HardcodedValue[] {
    const hardcoded: HardcodedValue[] = [];

    const visit = (n: ts.Node) => {
      // Skip if node has buoy-ignore comment
      if (this.hasIgnoreComment(n, sourceFile)) {
        return;
      }

      // Check JSX attributes for style prop
      if (ts.isJsxAttribute(n)) {
        const attrName = n.name.getText(sourceFile);

        // style={{ color: '#fff', padding: '8px' }}
        if (attrName === "style" && n.initializer) {
          const styleValues = this.extractStyleObjectValues(
            n.initializer,
            sourceFile,
            signalCollector,
          );
          hardcoded.push(...styleValues);
        }

        // Direct color/size props like color="#fff" or size={16}
        if (
          ["color", "bg", "backgroundColor", "fill", "stroke"].includes(
            attrName,
          )
        ) {
          const value = this.getJsxAttributeValue(n, sourceFile);
          if (value && this.isHardcodedColor(value)) {
            const line =
              sourceFile.getLineAndCharacterOfPosition(n.getStart(sourceFile))
                .line + 1;
            hardcoded.push({
              type: "color",
              value,
              property: attrName,
              location: `line ${line}`,
            });
            // Emit signal for hardcoded color
            signalCollector?.collectFromValue(value, attrName, line);
          }
        }

        // Size props
        if (
          ["size", "width", "height", "padding", "margin", "gap"].includes(
            attrName,
          )
        ) {
          const value = this.getJsxAttributeValue(n, sourceFile);
          if (value && this.isHardcodedSpacing(value)) {
            const line =
              sourceFile.getLineAndCharacterOfPosition(n.getStart(sourceFile))
                .line + 1;
            hardcoded.push({
              type: "spacing",
              value,
              property: attrName,
              location: `line ${line}`,
            });
            // Emit signal for hardcoded spacing
            signalCollector?.collectFromValue(value, attrName, line);
          }
        }
      }

      ts.forEachChild(n, visit);
    };

    visit(node);

    // Deduplicate by value+property
    const seen = new Set<string>();
    return hardcoded.filter((h) => {
      const key = `${h.property}:${h.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private extractStyleObjectValues(
    initializer: ts.JsxAttributeValue,
    sourceFile: ts.SourceFile,
    signalCollector?: ScannerSignalCollector,
  ): HardcodedValue[] {
    const values: HardcodedValue[] = [];

    const processObject = (obj: ts.ObjectLiteralExpression) => {
      for (const prop of obj.properties) {
        if (ts.isPropertyAssignment(prop) && prop.name) {
          const propName = prop.name.getText(sourceFile);
          const valueType = STYLE_PROPERTIES[propName];

          if (valueType && prop.initializer) {
            const value = this.getLiteralValue(prop.initializer, sourceFile);
            if (value && this.isHardcodedValue(value, valueType)) {
              const line =
                sourceFile.getLineAndCharacterOfPosition(
                  prop.getStart(sourceFile),
                ).line + 1;
              values.push({
                type: valueType,
                value,
                property: propName,
                location: `line ${line}`,
              });
              // Emit signal for the hardcoded value
              signalCollector?.collectFromValue(value, propName, line);
            }
          }
        }
      }
    };

    // style={{ ... }}
    if (ts.isJsxExpression(initializer) && initializer.expression) {
      if (ts.isObjectLiteralExpression(initializer.expression)) {
        processObject(initializer.expression);
      }
    }

    return values;
  }

  private getJsxAttributeValue(
    attr: ts.JsxAttribute,
    sourceFile: ts.SourceFile,
  ): string | null {
    if (!attr.initializer) return null;

    // color="red" or color="#fff"
    if (ts.isStringLiteral(attr.initializer)) {
      return attr.initializer.text;
    }

    // color={...}
    if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
      return this.getLiteralValue(attr.initializer.expression, sourceFile);
    }

    return null;
  }

  private getLiteralValue(
    node: ts.Expression,
    sourceFile: ts.SourceFile,
  ): string | null {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return node.text;
    }
    if (ts.isNumericLiteral(node)) {
      return node.text;
    }
    // Template literal with static content
    if (ts.isTemplateExpression(node)) {
      // Only if it's a simple template
      const text = node.getText(sourceFile);
      if (!text.includes("${")) {
        return text.slice(1, -1); // Remove backticks
      }
    }
    return null;
  }

  private isHardcodedValue(
    value: string,
    type: HardcodedValue["type"],
  ): boolean {
    // Skip CSS variables and token references
    if (
      value.includes("var(--") ||
      value.includes("theme.") ||
      value.includes("tokens.")
    ) {
      return false;
    }

    switch (type) {
      case "color":
        return this.isHardcodedColor(value);
      case "spacing":
      case "fontSize":
        return this.isHardcodedSpacing(value);
      case "fontFamily":
        // Font families are often hardcoded, only flag if it's a system font
        return !value.includes("var(--") && !value.includes("inherit");
      default:
        return false;
    }
  }

  private isHardcodedColor(value: string): boolean {
    // Skip CSS variables and token references
    if (
      value.includes("var(--") ||
      value.includes("theme.") ||
      value.includes("tokens.")
    ) {
      return false;
    }
    // Skip named colors that might be intentional (inherit, transparent, currentColor)
    if (
      ["inherit", "transparent", "currentColor", "initial", "unset"].includes(
        value,
      )
    ) {
      return false;
    }
    return COLOR_PATTERNS.some((p) => p.test(value));
  }

  private isHardcodedSpacing(value: string): boolean {
    // Skip CSS variables and token references
    if (
      value.includes("var(--") ||
      value.includes("theme.") ||
      value.includes("tokens.")
    ) {
      return false;
    }
    // Skip common non-token values
    if (["auto", "inherit", "0", "100%", "50%"].includes(value)) {
      return false;
    }
    return (
      SPACING_PATTERNS.some((p) => p.test(value)) ||
      FONT_SIZE_PATTERNS.some((p) => p.test(value))
    );
  }
}
