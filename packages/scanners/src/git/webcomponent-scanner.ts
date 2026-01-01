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
  type: 'lit' | 'stencil' | 'vanilla' | 'fast' | 'stencil-functional';
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
  hasElement?: boolean;
  shadowMode?: 'shadow' | 'scoped' | 'none';
  assetsDirs?: string[];
  styleUrls?: string | Record<string, string>;
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
    const isFast = content.includes('@microsoft/fast-element');

    // Track customElements.define() calls for non-decorator Lit patterns and vanilla components
    const customElementsDefines = new Map<string, string>();
    this.findCustomElementsDefines(sourceFile, customElementsDefines);

    // Track interfaces for Stencil functional components
    const interfaces = new Map<string, ts.InterfaceDeclaration>();
    this.findInterfaces(sourceFile, interfaces);

    // Track FAST Element compose() and define() calls
    const fastComposeDefines = new Map<string, string>();
    if (isFast) {
      this.findFastComposeDefines(sourceFile, fastComposeDefines);
    }

    const visit = (node: ts.Node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        if (isFast) {
          const comp = this.extractFastComponent(node, sourceFile, relativePath, fastComposeDefines);
          if (comp) components.push(comp);
        } else if (isLit) {
          const comp = this.extractLitComponent(node, sourceFile, relativePath, customElementsDefines);
          if (comp) components.push(comp);
        } else if (isStencil) {
          const comp = this.extractStencilComponent(node, sourceFile, relativePath);
          if (comp) components.push(comp);
        } else {
          // Try vanilla web component detection
          const comp = this.extractVanillaComponent(node, sourceFile, relativePath, customElementsDefines);
          if (comp) components.push(comp);
        }
      }

      // Detect Stencil functional components
      if (isStencil) {
        const funcComp = this.extractStencilFunctionalComponent(node, sourceFile, relativePath, interfaces);
        if (funcComp) components.push(funcComp);
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);
    return components;
  }

  private findInterfaces(
    sourceFile: ts.SourceFile,
    interfaces: Map<string, ts.InterfaceDeclaration>
  ): void {
    const visit = (node: ts.Node) => {
      if (ts.isInterfaceDeclaration(node)) {
        interfaces.set(node.name.text, node);
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
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
    const hasElement = this.hasStencilElement(node);
    const shadowMode = this.extractStencilShadowMode(componentDecorator, sourceFile);
    const assetsDirs = this.extractStencilAssetsDirs(componentDecorator, sourceFile);
    const styleUrls = this.extractStencilStyleUrls(componentDecorator, sourceFile);

    const metadata: ComponentMetadataExtended = {
      deprecated: this.hasDeprecatedTag(node),
      tags: [],
      watchers: watchers.length > 0 ? watchers : undefined,
      methods: methods.length > 0 ? methods : undefined,
      listeners: listeners.length > 0 ? listeners : undefined,
      formAssociated: formAssociated || undefined,
      hasElement: hasElement || undefined,
      shadowMode,
      assetsDirs: assetsDirs.length > 0 ? assetsDirs : undefined,
      styleUrls: styleUrls || undefined,
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

  private hasStencilElement(node: ts.ClassDeclaration): boolean {
    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member)) continue;

      const decorators = ts.getDecorators(member);
      if (!decorators) continue;

      const hasElement = decorators.some(d => {
        if (ts.isCallExpression(d.expression)) {
          const expr = d.expression.expression;
          return ts.isIdentifier(expr) && expr.text === 'Element';
        }
        if (ts.isIdentifier(d.expression)) {
          return d.expression.text === 'Element';
        }
        return false;
      });

      if (hasElement) return true;
    }
    return false;
  }

  private extractStencilShadowMode(
    decorator: ts.Decorator,
    _sourceFile: ts.SourceFile
  ): 'shadow' | 'scoped' | 'none' | undefined {
    if (!ts.isCallExpression(decorator.expression)) return undefined;

    const args = decorator.expression.arguments;
    if (args.length === 0) return undefined;

    const config = args[0];
    if (!config || !ts.isObjectLiteralExpression(config)) return undefined;

    let hasShadow = false;
    let hasScoped = false;

    for (const prop of config.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        if (prop.name.text === 'shadow') {
          if (prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
            hasShadow = true;
          }
        }
        if (prop.name.text === 'scoped') {
          if (prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
            hasScoped = true;
          }
        }
      }
    }

    if (hasShadow) return 'shadow';
    if (hasScoped) return 'scoped';
    return undefined;
  }

  private extractStencilAssetsDirs(
    decorator: ts.Decorator,
    _sourceFile: ts.SourceFile
  ): string[] {
    if (!ts.isCallExpression(decorator.expression)) return [];

    const args = decorator.expression.arguments;
    if (args.length === 0) return [];

    const config = args[0];
    if (!config || !ts.isObjectLiteralExpression(config)) return [];

    for (const prop of config.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        if (prop.name.text === 'assetsDirs' && ts.isArrayLiteralExpression(prop.initializer)) {
          const dirs: string[] = [];
          for (const element of prop.initializer.elements) {
            if (ts.isStringLiteral(element)) {
              dirs.push(element.text);
            }
          }
          return dirs;
        }
      }
    }

    return [];
  }

  private extractStencilStyleUrls(
    decorator: ts.Decorator,
    _sourceFile: ts.SourceFile
  ): string | Record<string, string> | undefined {
    if (!ts.isCallExpression(decorator.expression)) return undefined;

    const args = decorator.expression.arguments;
    if (args.length === 0) return undefined;

    const config = args[0];
    if (!config || !ts.isObjectLiteralExpression(config)) return undefined;

    for (const prop of config.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        // Single styleUrl
        if (prop.name.text === 'styleUrl' && ts.isStringLiteral(prop.initializer)) {
          return prop.initializer.text;
        }
        // Multiple styleUrls as object { ios: '...', md: '...' }
        if (prop.name.text === 'styleUrls' && ts.isObjectLiteralExpression(prop.initializer)) {
          const urls: Record<string, string> = {};
          for (const urlProp of prop.initializer.properties) {
            if (ts.isPropertyAssignment(urlProp) && ts.isIdentifier(urlProp.name)) {
              if (ts.isStringLiteral(urlProp.initializer)) {
                urls[urlProp.name.text] = urlProp.initializer.text;
              }
            }
          }
          return Object.keys(urls).length > 0 ? urls : undefined;
        }
        // styleUrls as array
        if (prop.name.text === 'styleUrls' && ts.isArrayLiteralExpression(prop.initializer)) {
          const urls: string[] = [];
          for (const element of prop.initializer.elements) {
            if (ts.isStringLiteral(element)) {
              urls.push(element.text);
            }
          }
          return urls.length === 1 ? urls[0] : urls.join(',');
        }
      }
    }

    return undefined;
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

  // ============================================
  // Vanilla Web Component Detection
  // ============================================

  private extractVanillaComponent(
    node: ts.ClassDeclaration,
    sourceFile: ts.SourceFile,
    relativePath: string,
    customElementsDefines: Map<string, string>
  ): Component | null {
    if (!node.name) return null;

    const className = node.name.getText(sourceFile);

    // Check if extends HTMLElement
    const extendsHTMLElement = node.heritageClauses?.some(clause => {
      return clause.types.some(type => {
        const text = type.expression.getText(sourceFile);
        return text === 'HTMLElement';
      });
    });

    // Must extend HTMLElement and be registered via customElements.define()
    if (!extendsHTMLElement) return null;
    if (!customElementsDefines.has(className)) return null;

    const tagName = customElementsDefines.get(className)!;
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

    const source: WebComponentSource = {
      type: 'vanilla',
      path: relativePath,
      exportName: className,
      tagName,
      line,
    };

    // Extract observedAttributes as props
    const props = this.extractVanillaObservedAttributes(node, sourceFile);

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

  private extractVanillaObservedAttributes(
    node: ts.ClassDeclaration,
    _sourceFile: ts.SourceFile
  ): PropDefinition[] {
    const props: PropDefinition[] = [];

    for (const member of node.members) {
      // Look for static get observedAttributes() { return [...] }
      if (!ts.isGetAccessor(member)) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;
      if (member.name.text !== 'observedAttributes') continue;

      // Check if it's static
      const isStatic = member.modifiers?.some(m => m.kind === ts.SyntaxKind.StaticKeyword);
      if (!isStatic) continue;

      // Find the return statement with array
      if (member.body) {
        for (const statement of member.body.statements) {
          if (ts.isReturnStatement(statement) && statement.expression) {
            if (ts.isArrayLiteralExpression(statement.expression)) {
              for (const element of statement.expression.elements) {
                if (ts.isStringLiteral(element)) {
                  props.push({
                    name: element.text,
                    type: 'string',
                    required: false,
                  });
                }
              }
            }
          }
        }
      }
    }

    return props;
  }

  // ============================================
  // FAST Element Detection
  // ============================================

  private findFastComposeDefines(
    sourceFile: ts.SourceFile,
    fastComposeDefines: Map<string, string>
  ): void {
    const visit = (node: ts.Node) => {
      // Look for ClassName.compose({ name: 'tag-name', ... })
      if (ts.isCallExpression(node)) {
        const expr = node.expression;
        if (ts.isPropertyAccessExpression(expr)) {
          const methodName = expr.name.text;
          if (methodName === 'compose' || methodName === 'define') {
            const obj = expr.expression;
            let className: string | null = null;

            // Handle: ClassName.compose()
            if (ts.isIdentifier(obj)) {
              className = obj.text;
            }
            // Handle: FASTElement.define(ClassName, { name: '...' })
            if (methodName === 'define' && ts.isIdentifier(obj) && obj.text === 'FASTElement') {
              const args = node.arguments;
              if (args.length >= 1 && ts.isIdentifier(args[0]!)) {
                className = args[0].text;
                // Check for name in config object (second arg)
                if (args.length >= 2 && ts.isObjectLiteralExpression(args[1]!)) {
                  for (const prop of args[1].properties) {
                    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                      if (prop.name.text === 'name' && ts.isStringLiteral(prop.initializer)) {
                        fastComposeDefines.set(className, prop.initializer.text);
                        return;
                      }
                    }
                  }
                }
              }
            }

            // Extract tag name from compose({ name: '...' }) config
            if (className) {
              const args = node.arguments;
              if (args.length >= 1 && ts.isObjectLiteralExpression(args[0]!)) {
                for (const prop of args[0].properties) {
                  if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                    if (prop.name.text === 'name' && ts.isStringLiteral(prop.initializer)) {
                      fastComposeDefines.set(className, prop.initializer.text);
                      break;
                    }
                  }
                }
              }
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
  }

  private extractFastComponent(
    node: ts.ClassDeclaration,
    sourceFile: ts.SourceFile,
    relativePath: string,
    fastComposeDefines: Map<string, string> = new Map()
  ): Component | null {
    if (!node.name) return null;

    const className = node.name.getText(sourceFile);

    // Check for @customElement decorator
    const customElementDecorator = this.findFastCustomElementDecorator(node);

    // Check for compose() or define() pattern
    const hasComposeOrDefine = fastComposeDefines.has(className);

    // Check if extends FASTElement
    const extendsFast = node.heritageClauses?.some(clause => {
      return clause.types.some(type => {
        const text = type.expression.getText(sourceFile);
        return text === 'FASTElement' || text.endsWith('Element');
      });
    });

    // Need either decorator, compose/define, or extends FASTElement
    if (!customElementDecorator && !hasComposeOrDefine && !extendsFast) return null;

    // For non-decorator patterns, we must have compose/define or extend FASTElement
    if (!customElementDecorator && !hasComposeOrDefine) {
      // Only classes that extend FASTElement but have no registration pattern are not components
      if (!extendsFast) return null;
      // If it extends FASTElement but has no registration, skip it (it might be a base class)
      return null;
    }

    let tagName: string | null = null;

    // Try to get tag name from decorator first
    if (customElementDecorator) {
      tagName = this.extractFastTagName(customElementDecorator, sourceFile);
    }

    // Fall back to compose/define pattern
    if (!tagName && hasComposeOrDefine) {
      tagName = fastComposeDefines.get(className) || null;
    }

    // Fall back to kebab-case of class name
    if (!tagName) {
      tagName = this.toKebabCase(className);
    }

    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

    const source: WebComponentSource = {
      type: 'fast',
      path: relativePath,
      exportName: className,
      tagName,
      line,
    };

    // Extract @attr and @observable properties
    const props = this.extractFastProperties(node, sourceFile);

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

  private findFastCustomElementDecorator(node: ts.ClassDeclaration): ts.Decorator | undefined {
    const decorators = ts.getDecorators(node);
    if (!decorators) return undefined;

    return decorators.find(d => {
      if (ts.isCallExpression(d.expression)) {
        const expr = d.expression.expression;
        return ts.isIdentifier(expr) && expr.text === 'customElement';
      }
      return false;
    });
  }

  private extractFastTagName(decorator: ts.Decorator, _sourceFile: ts.SourceFile): string | null {
    if (!ts.isCallExpression(decorator.expression)) return null;

    const args = decorator.expression.arguments;
    if (args.length === 0) return null;

    const arg = args[0];
    // String literal: @customElement('my-element')
    if (arg && ts.isStringLiteral(arg)) {
      return arg.text;
    }
    // Object literal: @customElement({ name: 'my-element', ... })
    if (arg && ts.isObjectLiteralExpression(arg)) {
      for (const prop of arg.properties) {
        if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
          if (prop.name.text === 'name' && ts.isStringLiteral(prop.initializer)) {
            return prop.initializer.text;
          }
        }
      }
    }

    return null;
  }

  private extractFastProperties(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): PropDefinition[] {
    const props: PropDefinition[] = [];

    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;

      const decorators = ts.getDecorators(member);
      if (!decorators) continue;

      for (const decorator of decorators) {
        let decoratorName: string | null = null;

        if (ts.isCallExpression(decorator.expression)) {
          const expr = decorator.expression.expression;
          if (ts.isIdentifier(expr)) {
            decoratorName = expr.text;
          }
        } else if (ts.isIdentifier(decorator.expression)) {
          decoratorName = decorator.expression.text;
        }

        if (decoratorName === 'attr' || decoratorName === 'observable') {
          const propName = member.name.getText(sourceFile);
          const propType = member.type ? member.type.getText(sourceFile) : 'unknown';

          props.push({
            name: propName,
            type: propType,
            required: !member.initializer && !member.questionToken,
            defaultValue: member.initializer?.getText(sourceFile),
            description: decoratorName === 'observable' ? 'Observable property' : undefined,
          });
        }
      }
    }

    return props;
  }

  // ============================================
  // Stencil Functional Component Detection
  // ============================================

  private extractStencilFunctionalComponent(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    relativePath: string,
    interfaces: Map<string, ts.InterfaceDeclaration>
  ): Component | null {
    // Look for: export const Name: FunctionalComponent<Props> = ...
    if (!ts.isVariableStatement(node)) return null;

    const exportModifier = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exportModifier) return null;

    for (const decl of node.declarationList.declarations) {
      if (!ts.isVariableDeclaration(decl)) continue;
      if (!decl.name || !ts.isIdentifier(decl.name)) continue;

      // Check type annotation for FunctionalComponent
      if (!decl.type) continue;

      const typeText = decl.type.getText(sourceFile);
      if (!typeText.includes('FunctionalComponent')) continue;

      const name = decl.name.getText(sourceFile);
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

      // Extract props interface name from FunctionalComponent<Props>
      let propsInterfaceName: string | null = null;
      if (ts.isTypeReferenceNode(decl.type)) {
        const typeArgs = decl.type.typeArguments;
        if (typeArgs && typeArgs.length > 0) {
          const typeArg = typeArgs[0];
          if (typeArg && ts.isTypeReferenceNode(typeArg)) {
            const typeName = typeArg.typeName;
            if (ts.isIdentifier(typeName)) {
              propsInterfaceName = typeName.getText(sourceFile);
            }
          }
        }
      }

      const source: WebComponentSource = {
        type: 'stencil-functional',
        path: relativePath,
        exportName: name,
        tagName: this.toKebabCase(name),
        line,
      };

      // Extract props from interface
      const props = propsInterfaceName
        ? this.extractPropsFromInterface(interfaces.get(propsInterfaceName), sourceFile)
        : [];

      return {
        id: createComponentId(source as any, name),
        name,
        source: source as any,
        props,
        variants: [],
        tokens: [],
        dependencies: [],
        metadata: {
          deprecated: false,
          tags: [],
        },
        scannedAt: new Date(),
      };
    }

    return null;
  }

  private extractPropsFromInterface(
    iface: ts.InterfaceDeclaration | undefined,
    sourceFile: ts.SourceFile
  ): PropDefinition[] {
    if (!iface) return [];

    const props: PropDefinition[] = [];

    for (const member of iface.members) {
      if (!ts.isPropertySignature(member)) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;

      const propName = member.name.getText(sourceFile);
      const propType = member.type ? member.type.getText(sourceFile) : 'unknown';
      const isOptional = !!member.questionToken;

      props.push({
        name: propName,
        type: propType,
        required: !isOptional,
      });
    }

    return props;
  }
}
