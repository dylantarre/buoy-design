import { Scanner, ScanResult, ScannerConfig, ScanError, ScanStats } from '../base/scanner.js';
import type { Component, PropDefinition } from '@buoy-design/core';
import { createComponentId } from '@buoy-design/core';
import * as ts from 'typescript';
import { glob } from 'glob';
import { readFileSync } from 'fs';
import { relative } from 'path';

export interface WebComponentScannerConfig extends ScannerConfig {
  framework?: 'lit' | 'stencil' | 'auto';
}

interface WebComponentSource {
  type: 'lit' | 'stencil';
  path: string;
  exportName: string;
  tagName: string;
  line: number;
}

interface ComponentMetadataExtended {
  deprecated?: boolean;
  tags: string[];
  watchers?: string[];
  methods?: string[];
  listeners?: string[];
  formAssociated?: boolean;
}

export class WebComponentScanner extends Scanner<Component, WebComponentScannerConfig> {
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
    return this.config.framework || 'webcomponent';
  }

  private async findComponentFiles(): Promise<string[]> {
    const patterns = this.config.include || ['**/*.ts', '**/*.tsx'];
    const ignore = this.config.exclude || [
      '**/node_modules/**',
      '**/*.spec.ts',
      '**/*.test.ts',
      '**/*.d.ts',
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

    return [...new Set(allFiles)];
  }

  private async parseFile(filePath: string): Promise<Component[]> {
    const content = readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    const components: Component[] = [];
    const relativePath = relative(this.config.projectRoot, filePath);

    // Detect framework from imports
    const isLit = content.includes('lit') || content.includes('LitElement');
    const isStencil = content.includes('@stencil/core');

    // Track customElements.define() calls for non-decorator Lit patterns
    const customElementsDefines = new Map<string, string>();
    this.findCustomElementsDefines(sourceFile, customElementsDefines);

    const visit = (node: ts.Node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        if (isLit) {
          const comp = this.extractLitComponent(node, sourceFile, relativePath, customElementsDefines);
          if (comp) components.push(comp);
        } else if (isStencil) {
          const comp = this.extractStencilComponent(node, sourceFile, relativePath);
          if (comp) components.push(comp);
        }
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);
    return components;
  }

  private findCustomElementsDefines(
    sourceFile: ts.SourceFile,
    customElementsDefines: Map<string, string>
  ): void {
    const visit = (node: ts.Node) => {
      // Look for customElements.define('tag-name', ClassName)
      if (ts.isCallExpression(node)) {
        const expr = node.expression;
        if (ts.isPropertyAccessExpression(expr)) {
          const obj = expr.expression;
          const prop = expr.name;
          if (ts.isIdentifier(obj) && obj.text === 'customElements' && prop.text === 'define') {
            const args = node.arguments;
            if (args.length >= 2) {
              const tagNameArg = args[0];
              const classArg = args[1];
              if (tagNameArg && ts.isStringLiteral(tagNameArg) && classArg && ts.isIdentifier(classArg)) {
                customElementsDefines.set(classArg.text, tagNameArg.text);
              }
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
  }

  private extractLitComponent(
    node: ts.ClassDeclaration,
    sourceFile: ts.SourceFile,
    relativePath: string,
    customElementsDefines: Map<string, string>
  ): Component | null {
    if (!node.name) return null;

    const className = node.name.getText(sourceFile);

    // Check if extends LitElement or any class ending in Element (custom base classes)
    const extendsLit = node.heritageClauses?.some(clause => {
      return clause.types.some(type => {
        const text = type.expression.getText(sourceFile);
        return text === 'LitElement' || text.endsWith('Element');
      });
    });

    // Check for @customElement decorator
    const hasCustomElementDecorator = this.hasLitCustomElementDecorator(node);

    // Check if registered via customElements.define()
    const hasCustomElementsDefine = customElementsDefines.has(className);

    if (!extendsLit && !hasCustomElementDecorator && !hasCustomElementsDefine) return null;

    const tagName = this.extractLitTagName(node, sourceFile) ||
                    customElementsDefines.get(className) ||
                    this.toKebabCase(className);
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

    const source: WebComponentSource = {
      type: 'lit',
      path: relativePath,
      exportName: className,
      tagName,
      line,
    };

    // Extract properties from both decorators and static properties
    const decoratorProps = this.extractLitDecoratorProperties(node, sourceFile);
    const staticProps = this.extractLitStaticProperties(node, sourceFile);
    const props = [...decoratorProps, ...staticProps];

    return {
      id: createComponentId(source as any, className),
      name: className,
      source: source as any,
      props,
      variants: [],
      tokens: [],
      dependencies: [],
      metadata: {
        deprecated: this.hasDeprecatedTag(node),
        tags: [],
      },
      scannedAt: new Date(),
    };
  }

  private hasLitCustomElementDecorator(node: ts.ClassDeclaration): boolean {
    const decorators = ts.getDecorators(node);
    if (!decorators) return false;

    return decorators.some(d => {
      if (ts.isCallExpression(d.expression)) {
        const expr = d.expression.expression;
        return ts.isIdentifier(expr) && expr.text === 'customElement';
      }
      return false;
    });
  }

  private extractLitTagName(node: ts.ClassDeclaration, _sourceFile: ts.SourceFile): string | null {
    const decorators = ts.getDecorators(node);
    if (!decorators) return null;

    for (const decorator of decorators) {
      if (ts.isCallExpression(decorator.expression)) {
        const expr = decorator.expression.expression;
        if (ts.isIdentifier(expr) && expr.text === 'customElement') {
          const arg = decorator.expression.arguments[0];
          if (arg && ts.isStringLiteral(arg)) {
            return arg.text;
          }
        }
      }
    }

    return null;
  }

  private extractLitDecoratorProperties(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): PropDefinition[] {
    const props: PropDefinition[] = [];

    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;

      const decorators = ts.getDecorators(member);
      if (!decorators) continue;

      for (const decorator of decorators) {
        if (!ts.isCallExpression(decorator.expression)) continue;
        const expr = decorator.expression.expression;
        if (!ts.isIdentifier(expr)) continue;

        const decoratorName = expr.text;
        if (decoratorName === 'property' || decoratorName === 'state') {
          const propName = member.name.getText(sourceFile);
          const propType = this.extractLitPropertyType(decorator, member, sourceFile);

          props.push({
            name: propName,
            type: propType,
            required: !member.initializer && !member.questionToken,
            defaultValue: member.initializer?.getText(sourceFile),
          });
        }
      }
    }

    return props;
  }

  private extractLitPropertyType(
    decorator: ts.Decorator,
    member: ts.PropertyDeclaration,
    sourceFile: ts.SourceFile
  ): string {
    // First try to get type from decorator options { type: String }
    if (ts.isCallExpression(decorator.expression)) {
      const args = decorator.expression.arguments;
      if (args.length > 0) {
        const config = args[0];
        if (config && ts.isObjectLiteralExpression(config)) {
          for (const prop of config.properties) {
            if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
              if (prop.name.text === 'type') {
                return prop.initializer.getText(sourceFile);
              }
            }
          }
        }
      }
    }

    // Fall back to TypeScript type annotation
    if (member.type) {
      return member.type.getText(sourceFile);
    }

    return 'unknown';
  }

  private extractLitStaticProperties(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): PropDefinition[] {
    const props: PropDefinition[] = [];

    for (const member of node.members) {
      // Look for static properties = { ... }
      if (!ts.isPropertyDeclaration(member)) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;
      if (member.name.text !== 'properties') continue;

      // Check if it's static
      const isStatic = member.modifiers?.some(m => m.kind === ts.SyntaxKind.StaticKeyword);
      if (!isStatic) continue;

      // Extract properties from the object literal
      if (member.initializer && ts.isObjectLiteralExpression(member.initializer)) {
        for (const prop of member.initializer.properties) {
          if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
            const propName = prop.name.text;
            let propType = 'unknown';

            // Extract type from property config
            if (ts.isObjectLiteralExpression(prop.initializer)) {
              for (const configProp of prop.initializer.properties) {
                if (ts.isPropertyAssignment(configProp) && ts.isIdentifier(configProp.name)) {
                  if (configProp.name.text === 'type') {
                    propType = configProp.initializer.getText(sourceFile);
                  }
                }
              }
            }

            props.push({
              name: propName,
              type: propType,
              required: false,
            });
          }
        }
      }
    }

    return props;
  }

  private extractStencilComponent(
    node: ts.ClassDeclaration,
    sourceFile: ts.SourceFile,
    relativePath: string
  ): Component | null {
    if (!node.name) return null;

    // Check for @Component decorator
    const componentDecorator = this.findStencilComponentDecorator(node);
    if (!componentDecorator) return null;

    const name = node.name.getText(sourceFile);
    const tagName = this.extractStencilTagName(componentDecorator, sourceFile) || this.toKebabCase(name);
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

    const source: WebComponentSource = {
      type: 'stencil',
      path: relativePath,
      exportName: name,
      tagName,
      line,
    };

    const props = this.extractStencilProps(node, sourceFile);
    const states = this.extractStencilStates(node, sourceFile);
    const events = this.extractStencilEvents(node, sourceFile);
    const watchers = this.extractStencilWatchers(node, sourceFile);
    const methods = this.extractStencilMethods(node, sourceFile);
    const listeners = this.extractStencilListeners(node, sourceFile);
    const formAssociated = this.extractStencilFormAssociated(componentDecorator, sourceFile);

    const metadata: ComponentMetadataExtended = {
      deprecated: this.hasDeprecatedTag(node),
      tags: [],
      watchers: watchers.length > 0 ? watchers : undefined,
      methods: methods.length > 0 ? methods : undefined,
      listeners: listeners.length > 0 ? listeners : undefined,
      formAssociated: formAssociated || undefined,
    };

    return {
      id: createComponentId(source as any, name),
      name,
      source: source as any,
      props: [...props, ...states, ...events],
      variants: [],
      tokens: [],
      dependencies: [],
      metadata: metadata as any,
      scannedAt: new Date(),
    };
  }

  private findStencilComponentDecorator(node: ts.ClassDeclaration): ts.Decorator | undefined {
    const decorators = ts.getDecorators(node);
    if (!decorators) return undefined;

    return decorators.find(d => {
      if (ts.isCallExpression(d.expression)) {
        const expr = d.expression.expression;
        return ts.isIdentifier(expr) && expr.text === 'Component';
      }
      return false;
    });
  }

  private extractStencilTagName(decorator: ts.Decorator, _sourceFile: ts.SourceFile): string | null {
    if (!ts.isCallExpression(decorator.expression)) return null;

    const args = decorator.expression.arguments;
    if (args.length === 0) return null;

    const config = args[0];
    if (!config || !ts.isObjectLiteralExpression(config)) return null;

    for (const prop of config.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        if (prop.name.text === 'tag' && ts.isStringLiteral(prop.initializer)) {
          return prop.initializer.text;
        }
      }
    }

    return null;
  }

  private extractStencilFormAssociated(decorator: ts.Decorator, _sourceFile: ts.SourceFile): boolean {
    if (!ts.isCallExpression(decorator.expression)) return false;

    const args = decorator.expression.arguments;
    if (args.length === 0) return false;

    const config = args[0];
    if (!config || !ts.isObjectLiteralExpression(config)) return false;

    for (const prop of config.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        if (prop.name.text === 'formAssociated') {
          if (prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private extractStencilProps(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): PropDefinition[] {
    const props: PropDefinition[] = [];

    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;

      const decorators = ts.getDecorators(member);
      if (!decorators) continue;

      const hasProp = decorators.some(d => {
        if (ts.isCallExpression(d.expression)) {
          const expr = d.expression.expression;
          return ts.isIdentifier(expr) && expr.text === 'Prop';
        }
        if (ts.isIdentifier(d.expression)) {
          return d.expression.text === 'Prop';
        }
        return false;
      });

      if (hasProp) {
        const propName = member.name.getText(sourceFile);
        const propType = member.type ? member.type.getText(sourceFile) : 'unknown';

        props.push({
          name: propName,
          type: propType,
          required: !member.initializer && !member.questionToken,
          defaultValue: member.initializer?.getText(sourceFile),
        });
      }
    }

    return props;
  }

  private extractStencilStates(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): PropDefinition[] {
    const states: PropDefinition[] = [];

    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;

      const decorators = ts.getDecorators(member);
      if (!decorators) continue;

      const hasState = decorators.some(d => {
        if (ts.isCallExpression(d.expression)) {
          const expr = d.expression.expression;
          return ts.isIdentifier(expr) && expr.text === 'State';
        }
        if (ts.isIdentifier(d.expression)) {
          return d.expression.text === 'State';
        }
        return false;
      });

      if (hasState) {
        const propName = member.name.getText(sourceFile);
        const propType = member.type ? member.type.getText(sourceFile) : 'unknown';

        states.push({
          name: propName,
          type: propType,
          required: false,
          defaultValue: member.initializer?.getText(sourceFile),
          description: 'Internal state',
        });
      }
    }

    return states;
  }

  private extractStencilEvents(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): PropDefinition[] {
    const events: PropDefinition[] = [];

    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;

      const decorators = ts.getDecorators(member);
      if (!decorators) continue;

      const hasEvent = decorators.some(d => {
        if (ts.isCallExpression(d.expression)) {
          const expr = d.expression.expression;
          return ts.isIdentifier(expr) && expr.text === 'Event';
        }
        if (ts.isIdentifier(d.expression)) {
          return d.expression.text === 'Event';
        }
        return false;
      });

      if (hasEvent) {
        const propName = member.name.getText(sourceFile);

        events.push({
          name: propName,
          type: 'EventEmitter',
          required: false,
          description: 'Stencil event',
        });
      }
    }

    return events;
  }

  private extractStencilWatchers(node: ts.ClassDeclaration, _sourceFile: ts.SourceFile): string[] {
    const watchers: string[] = [];

    for (const member of node.members) {
      if (!ts.isMethodDeclaration(member)) continue;

      const decorators = ts.getDecorators(member);
      if (!decorators) continue;

      for (const decorator of decorators) {
        if (ts.isCallExpression(decorator.expression)) {
          const expr = decorator.expression.expression;
          if (ts.isIdentifier(expr) && expr.text === 'Watch') {
            const args = decorator.expression.arguments;
            if (args.length > 0 && ts.isStringLiteral(args[0]!)) {
              watchers.push(args[0].text);
            }
          }
        }
      }
    }

    return watchers;
  }

  private extractStencilMethods(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): string[] {
    const methods: string[] = [];

    for (const member of node.members) {
      if (!ts.isMethodDeclaration(member)) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;

      const decorators = ts.getDecorators(member);
      if (!decorators) continue;

      const hasMethod = decorators.some(d => {
        if (ts.isCallExpression(d.expression)) {
          const expr = d.expression.expression;
          return ts.isIdentifier(expr) && expr.text === 'Method';
        }
        if (ts.isIdentifier(d.expression)) {
          return d.expression.text === 'Method';
        }
        return false;
      });

      if (hasMethod) {
        methods.push(member.name.getText(sourceFile));
      }
    }

    return methods;
  }

  private extractStencilListeners(node: ts.ClassDeclaration, _sourceFile: ts.SourceFile): string[] {
    const listeners: string[] = [];

    for (const member of node.members) {
      if (!ts.isMethodDeclaration(member)) continue;

      const decorators = ts.getDecorators(member);
      if (!decorators) continue;

      for (const decorator of decorators) {
        if (ts.isCallExpression(decorator.expression)) {
          const expr = decorator.expression.expression;
          if (ts.isIdentifier(expr) && expr.text === 'Listen') {
            const args = decorator.expression.arguments;
            if (args.length > 0 && ts.isStringLiteral(args[0]!)) {
              listeners.push(args[0].text);
            }
          }
        }
      }
    }

    return listeners;
  }

  private hasDeprecatedTag(node: ts.ClassDeclaration): boolean {
    const jsDocs = ts.getJSDocTags(node);
    return jsDocs.some(tag => tag.tagName.text === 'deprecated');
  }

  private toKebabCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
      .toLowerCase();
  }
}
