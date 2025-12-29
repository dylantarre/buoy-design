import { Scanner, ScanResult, ScannerConfig, ScanError, ScanStats } from '../base/scanner.js';
import type { Component, PropDefinition, ReactSource, HardcodedValue } from '@buoy/core';
import { createComponentId } from '@buoy/core';
import * as ts from 'typescript';
import { glob } from 'glob';
import { readFile } from 'fs/promises';
import { relative } from 'path';

// Patterns for detecting hardcoded values
const COLOR_PATTERNS = [
  /^#[0-9a-fA-F]{3,8}$/,                    // Hex colors
  /^rgb\s*\(/i,                              // rgb()
  /^rgba\s*\(/i,                             // rgba()
  /^hsl\s*\(/i,                              // hsl()
  /^hsla\s*\(/i,                             // hsla()
];

const SPACING_PATTERNS = [
  /^\d+(\.\d+)?(px|rem|em|vh|vw|%)$/,       // Numeric with units
];

const FONT_SIZE_PATTERNS = [
  /^\d+(\.\d+)?(px|rem|em|pt)$/,            // Font sizes
];

// Style properties that commonly contain design tokens
const STYLE_PROPERTIES: Record<string, HardcodedValue['type']> = {
  color: 'color',
  backgroundColor: 'color',
  background: 'color',
  borderColor: 'color',
  fill: 'color',
  stroke: 'color',
  padding: 'spacing',
  paddingTop: 'spacing',
  paddingRight: 'spacing',
  paddingBottom: 'spacing',
  paddingLeft: 'spacing',
  margin: 'spacing',
  marginTop: 'spacing',
  marginRight: 'spacing',
  marginBottom: 'spacing',
  marginLeft: 'spacing',
  gap: 'spacing',
  width: 'spacing',
  height: 'spacing',
  top: 'spacing',
  right: 'spacing',
  bottom: 'spacing',
  left: 'spacing',
  fontSize: 'fontSize',
  fontFamily: 'fontFamily',
  boxShadow: 'shadow',
  textShadow: 'shadow',
  border: 'border',
  borderWidth: 'border',
  borderRadius: 'border',
};

export interface ReactScannerConfig extends ScannerConfig {
  designSystemPackage?: string;
  componentPatterns?: string[];
}

export class ReactComponentScanner extends Scanner<Component, ReactScannerConfig> {
  async scan(): Promise<ScanResult<Component>> {
    const startTime = Date.now();
    const files = await this.findComponentFiles();
    const components: Component[] = [];
    const errors: ScanError[] = [];

    for (const file of files) {
      try {
        const parsed = await this.parseFile(file);
        components.push(...parsed);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({
          file,
          message,
          code: 'PARSE_ERROR',
        });
      }
    }

    const stats: ScanStats = {
      filesScanned: files.length,
      itemsFound: components.length,
      duration: Date.now() - startTime,
    };

    return { items: components, errors, stats };
  }

  getSourceType(): string {
    return 'react';
  }

  private async findComponentFiles(): Promise<string[]> {
    const patterns = this.config.include || ['**/*.tsx', '**/*.jsx'];
    const ignore = this.config.exclude || [
      '**/node_modules/**',
      '**/*.test.*',
      '**/*.spec.*',
      '**/*.stories.*',
      '**/dist/**',
      '**/build/**',
    ];

    const allFiles: string[] = [];

    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: this.config.projectRoot,
        ignore,
        absolute: true,
      });
      allFiles.push(...matches);
    }

    // Deduplicate
    return [...new Set(allFiles)];
  }

  private async parseFile(filePath: string): Promise<Component[]> {
    const content = await readFile(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.JSX
    );

    const components: Component[] = [];
    const relativePath = relative(this.config.projectRoot, filePath);

    const visit = (node: ts.Node) => {
      // Function declarations: function Button() {}
      if (ts.isFunctionDeclaration(node) && node.name) {
        if (this.isReactComponent(node, sourceFile)) {
          const comp = this.extractFunctionComponent(node, sourceFile, relativePath);
          if (comp) components.push(comp);
        }
      }

      // Variable declarations: const Button = () => {} or const Button = function() {}
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.initializer) {
            if (this.isReactComponentExpression(decl.initializer, sourceFile)) {
              const comp = this.extractVariableComponent(decl, sourceFile, relativePath);
              if (comp) components.push(comp);
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);
    return components;
  }

  private isReactComponent(node: ts.FunctionDeclaration, sourceFile: ts.SourceFile): boolean {
    // Check if function name starts with uppercase (React convention)
    if (!node.name) return false;
    const name = node.name.getText(sourceFile);
    if (!/^[A-Z]/.test(name)) return false;

    // Check if it returns JSX
    return this.returnsJsx(node);
  }

  private isReactComponentExpression(
    node: ts.Expression,
    sourceFile: ts.SourceFile
  ): boolean {
    // Arrow function or function expression
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      return this.returnsJsx(node);
    }

    // React.forwardRef or React.memo
    if (ts.isCallExpression(node)) {
      const callText = node.expression.getText(sourceFile);
      if (
        callText.includes('forwardRef') ||
        callText.includes('memo') ||
        callText.includes('React.forwardRef') ||
        callText.includes('React.memo')
      ) {
        return true;
      }
    }

    return false;
  }

  private returnsJsx(
    node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression
  ): boolean {
    let hasJsx = false;

    const checkNode = (n: ts.Node) => {
      if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) {
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
    relativePath: string
  ): Component | null {
    if (!node.name) return null;

    const name = node.name.getText(sourceFile);
    const props = this.extractProps(node.parameters, sourceFile);
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

    const source: ReactSource = {
      type: 'react',
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
        hardcodedValues: hardcodedValues.length > 0 ? hardcodedValues : undefined,
      },
      scannedAt: new Date(),
    };
  }

  private extractVariableComponent(
    node: ts.VariableDeclaration,
    sourceFile: ts.SourceFile,
    relativePath: string
  ): Component | null {
    if (!ts.isIdentifier(node.name)) return null;

    const name = node.name.getText(sourceFile);

    // Check for uppercase first letter
    if (!/^[A-Z]/.test(name)) return null;

    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

    const source: ReactSource = {
      type: 'react',
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
        hardcodedValues: hardcodedValues.length > 0 ? hardcodedValues : undefined,
      },
      scannedAt: new Date(),
    };
  }

  private extractProps(
    parameters: ts.NodeArray<ts.ParameterDeclaration>,
    sourceFile: ts.SourceFile
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
            type: member.type ? member.type.getText(sourceFile) : 'unknown',
            required: !member.questionToken,
          });
        }
      }
    } else if (typeNode && ts.isTypeReferenceNode(typeNode)) {
      // Reference to an interface/type - we just note the type name
      props.push({
        name: 'props',
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
            type: 'unknown',
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

  private extractDependencies(node: ts.Node, sourceFile: ts.SourceFile): string[] {
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
    return jsDocs.some(tag => tag.tagName.getText(sourceFile) === 'deprecated');
  }

  private extractTags(node: ts.Node, sourceFile: ts.SourceFile): string[] {
    const tags: string[] = [];
    const jsDocs = ts.getJSDocTags(node);

    for (const tag of jsDocs) {
      const tagName = tag.tagName.getText(sourceFile);
      if (tagName !== 'param' && tagName !== 'returns' && tagName !== 'type') {
        tags.push(tagName);
      }
    }

    return tags;
  }

  private extractHardcodedValues(node: ts.Node, sourceFile: ts.SourceFile): HardcodedValue[] {
    const hardcoded: HardcodedValue[] = [];

    const visit = (n: ts.Node) => {
      // Check JSX attributes for style prop
      if (ts.isJsxAttribute(n)) {
        const attrName = n.name.getText(sourceFile);

        // style={{ color: '#fff', padding: '8px' }}
        if (attrName === 'style' && n.initializer) {
          const styleValues = this.extractStyleObjectValues(n.initializer, sourceFile);
          hardcoded.push(...styleValues);
        }

        // Direct color/size props like color="#fff" or size={16}
        if (['color', 'bg', 'backgroundColor', 'fill', 'stroke'].includes(attrName)) {
          const value = this.getJsxAttributeValue(n, sourceFile);
          if (value && this.isHardcodedColor(value)) {
            const line = sourceFile.getLineAndCharacterOfPosition(n.getStart(sourceFile)).line + 1;
            hardcoded.push({
              type: 'color',
              value,
              property: attrName,
              location: `line ${line}`,
            });
          }
        }

        // Size props
        if (['size', 'width', 'height', 'padding', 'margin', 'gap'].includes(attrName)) {
          const value = this.getJsxAttributeValue(n, sourceFile);
          if (value && this.isHardcodedSpacing(value)) {
            const line = sourceFile.getLineAndCharacterOfPosition(n.getStart(sourceFile)).line + 1;
            hardcoded.push({
              type: 'spacing',
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
    return hardcoded.filter(h => {
      const key = `${h.property}:${h.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private extractStyleObjectValues(initializer: ts.JsxAttributeValue, sourceFile: ts.SourceFile): HardcodedValue[] {
    const values: HardcodedValue[] = [];

    const processObject = (obj: ts.ObjectLiteralExpression) => {
      for (const prop of obj.properties) {
        if (ts.isPropertyAssignment(prop) && prop.name) {
          const propName = prop.name.getText(sourceFile);
          const valueType = STYLE_PROPERTIES[propName];

          if (valueType && prop.initializer) {
            const value = this.getLiteralValue(prop.initializer, sourceFile);
            if (value && this.isHardcodedValue(value, valueType)) {
              const line = sourceFile.getLineAndCharacterOfPosition(prop.getStart(sourceFile)).line + 1;
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

  private getJsxAttributeValue(attr: ts.JsxAttribute, sourceFile: ts.SourceFile): string | null {
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

  private getLiteralValue(node: ts.Expression, sourceFile: ts.SourceFile): string | null {
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
      if (!text.includes('${')) {
        return text.slice(1, -1); // Remove backticks
      }
    }
    return null;
  }

  private isHardcodedValue(value: string, type: HardcodedValue['type']): boolean {
    // Skip CSS variables and token references
    if (value.includes('var(--') || value.includes('theme.') || value.includes('tokens.')) {
      return false;
    }

    switch (type) {
      case 'color':
        return this.isHardcodedColor(value);
      case 'spacing':
      case 'fontSize':
        return this.isHardcodedSpacing(value);
      case 'fontFamily':
        // Font families are often hardcoded, only flag if it's a system font
        return !value.includes('var(--') && !value.includes('inherit');
      default:
        return false;
    }
  }

  private isHardcodedColor(value: string): boolean {
    // Skip CSS variables and token references
    if (value.includes('var(--') || value.includes('theme.') || value.includes('tokens.')) {
      return false;
    }
    // Skip named colors that might be intentional (inherit, transparent, currentColor)
    if (['inherit', 'transparent', 'currentColor', 'initial', 'unset'].includes(value)) {
      return false;
    }
    return COLOR_PATTERNS.some(p => p.test(value));
  }

  private isHardcodedSpacing(value: string): boolean {
    // Skip CSS variables and token references
    if (value.includes('var(--') || value.includes('theme.') || value.includes('tokens.')) {
      return false;
    }
    // Skip common non-token values
    if (['auto', 'inherit', '0', '100%', '50%'].includes(value)) {
      return false;
    }
    return SPACING_PATTERNS.some(p => p.test(value)) || FONT_SIZE_PATTERNS.some(p => p.test(value));
  }
}
