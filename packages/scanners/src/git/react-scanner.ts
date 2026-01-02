import { Scanner, ScanResult, ScannerConfig } from "../base/scanner.js";
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

// Patterns for detecting hardcoded values
const COLOR_PATTERNS = [
  /^#[0-9a-fA-F]{3,8}$/, // Hex colors
  /^rgb\s*\(/i, // rgb()
  /^rgba\s*\(/i, // rgba()
  /^hsl\s*\(/i, // hsl()
  /^hsla\s*\(/i, // hsla()
];

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

export class ReactComponentScanner extends Scanner<
  Component,
  ReactScannerConfig
> {
  /** Default file patterns for React components */
  private static readonly DEFAULT_PATTERNS = ["**/*.tsx", "**/*.jsx"];

  async scan(): Promise<ScanResult<Component>> {
    return this.runScan(
      (file) => this.parseFile(file),
      ReactComponentScanner.DEFAULT_PATTERNS,
    );
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
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.JSX,
    );

    const components: Component[] = [];
    const relativePath = relative(this.config.projectRoot, filePath);

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
              );
              if (comp) {
                components.push(comp);
                componentNames.add(comp.name);
              }
            }
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
      }
    }

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
    return this.returnsJsx(node);
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
      return this.returnsJsx(node);
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

    const hardcodedValues = this.extractHardcodedValues(node, sourceFile);

    return {
      id: createComponentId(source, name),
      name,
      source,
      props,
      variants: [],
      tokens: [],
      dependencies: this.extractDependencies(node, sourceFile),
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

    const hardcodedValues = this.extractHardcodedValues(node, sourceFile);

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
  ): string[] {
    const deps: Set<string> = new Set();

    const visit = (n: ts.Node) => {
      // Find JSX elements that reference other components
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
        const tagName = n.tagName.getText(sourceFile);
        // Only include PascalCase names (components, not HTML elements)
        if (/^[A-Z]/.test(tagName)) {
          deps.add(tagName);
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

  private extractHardcodedValues(
    node: ts.Node,
    sourceFile: ts.SourceFile,
  ): HardcodedValue[] {
    const hardcoded: HardcodedValue[] = [];

    const visit = (n: ts.Node) => {
      // Check JSX attributes for style prop
      if (ts.isJsxAttribute(n)) {
        const attrName = n.name.getText(sourceFile);

        // style={{ color: '#fff', padding: '8px' }}
        if (attrName === "style" && n.initializer) {
          const styleValues = this.extractStyleObjectValues(
            n.initializer,
            sourceFile,
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
