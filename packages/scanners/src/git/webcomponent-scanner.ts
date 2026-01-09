import { SignalAwareScanner, ScanResult, ScannerConfig } from '../base/index.js';
import type { Component, PropDefinition } from '@buoy-design/core';
import { createComponentId } from '@buoy-design/core';
import * as ts from 'typescript';
import { readFileSync } from 'fs';
import { relative } from 'path';
import {
  createScannerSignalCollector,
} from '../signals/scanner-integration.js';

export interface WebComponentScannerConfig extends ScannerConfig {
  framework?: 'lit' | 'stencil' | 'auto';
}

interface WebComponentSource {
  type: 'lit' | 'stencil' | 'vanilla' | 'fast' | 'stencil-functional' | 'haunted' | 'hybrids';
  path: string;
  exportName: string;
  tagName: string;
  line: number;
}

interface JsDocEvent {
  name: string;
  type?: string;
  description?: string;
}

interface JsDocSlot {
  name: string;
  description?: string;
}

interface JsDocCssProperty {
  name: string;
  description?: string;
  default?: string;
  syntax?: string;
}

interface JsDocCssPart {
  name: string;
  description?: string;
}

interface QueryDefinition {
  name: string;
  type: 'query' | 'queryAll' | 'queryAsync' | 'queryAssignedElements' | 'queryAssignedNodes';
  selector?: string;
  slot?: string;
  flatten?: boolean;
  cached?: boolean;
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
  controllers?: string[];
  queries?: QueryDefinition[];
  // JSDoc metadata
  summary?: string;
  events?: JsDocEvent[];
  slots?: JsDocSlot[];
  cssProperties?: JsDocCssProperty[];
  cssParts?: JsDocCssPart[];
}

interface ExtendedPropDefinition extends PropDefinition {
  mutable?: boolean;
  reflect?: boolean;
  attribute?: string;
  eventName?: string;
  bubbles?: boolean;
  composed?: boolean;
  cancelable?: boolean;
}

export class WebComponentScanner extends SignalAwareScanner<Component, WebComponentScannerConfig> {
  /** Default file patterns for web components */
  private static readonly DEFAULT_PATTERNS = ['**/*.ts', '**/*.tsx'];

  async scan(): Promise<ScanResult<Component>> {
    // Clear signals from previous scan
    this.clearSignals();

    const patterns = this.config.include || WebComponentScanner.DEFAULT_PATTERNS;

    // Use cache if available
    if (this.config.cache) {
      return this.runScanWithCache(
        (file) => this.parseFile(file),
        patterns,
      );
    }

    return this.runScan(
      (file) => this.parseFile(file),
      patterns,
    );
  }

  getSourceType(): string {
    return this.config.framework || 'webcomponent';
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

    // Create signal collector for this file (use 'vanilla' as framework since webcomponents are vanilla JS)
    const signalCollector = createScannerSignalCollector('vanilla', relativePath);

    // Detect framework from imports
    const isLit = content.includes('lit') || content.includes('LitElement');
    const isStencil = content.includes('@stencil/core');
    const isFast = content.includes('@microsoft/fast-element');
    const isHaunted = content.includes('haunted');
    const isHybrids = content.includes('hybrids');

    // Track customElements.define() calls for non-decorator Lit patterns and vanilla components
    const customElementsDefines = new Map<string, string>();
    this.findCustomElementsDefines(sourceFile, customElementsDefines);

    // Track Haunted component() calls
    const hauntedComponents = new Map<string, string>();
    if (isHaunted) {
      this.findHauntedComponents(sourceFile, hauntedComponents);
    }

    // Track Hybrids define() calls
    const hybridsDefines = new Map<string, { tagName: string; props: string[] }>();
    if (isHybrids) {
      this.findHybridsDefines(sourceFile, hybridsDefines);
    }

    // Track interfaces for Stencil functional components
    const interfaces = new Map<string, ts.InterfaceDeclaration>();
    this.findInterfaces(sourceFile, interfaces);

    // Track FAST Element compose() and define() calls
    const fastComposeDefines = new Map<string, string>();
    if (isFast) {
      this.findFastComposeDefines(sourceFile, fastComposeDefines);
    }

    // Track anonymous class expressions in customElements.define()
    const anonymousDefines = isLit || !isStencil && !isFast
      ? this.findAnonymousCustomElementsDefines(sourceFile)
      : [];

    // Process anonymous class expressions first
    for (const { tagName, classExpr } of anonymousDefines) {
      const comp = this.extractLitComponentFromClassExpression(classExpr, sourceFile, relativePath, tagName);
      if (comp) components.push(comp);
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

      // Detect Haunted functional components
      if (isHaunted) {
        const hauntedComp = this.extractHauntedComponent(node, sourceFile, relativePath, hauntedComponents);
        if (hauntedComp) components.push(hauntedComp);
      }

      // Detect Hybrids components
      if (isHybrids) {
        const hybridsComp = this.extractHybridsComponent(node, sourceFile, relativePath, hybridsDefines);
        if (hybridsComp) components.push(hybridsComp);
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);

    // Emit component definition signals for all found components
    for (const comp of components) {
      const framework = isLit ? 'lit' : isStencil ? 'stencil' : isFast ? 'fast' : isHaunted ? 'haunted' : isHybrids ? 'hybrids' : 'vanilla';
      const sourceLine = 'line' in comp.source ? (comp.source as any).line : 1;
      signalCollector.collectComponentDef(comp.name, sourceLine, {
        propsCount: comp.props.length,
        dependencyCount: comp.dependencies.length,
        framework,
        tagName: (comp.source as any).tagName,
      });
    }

    // Add this file's signals to the aggregator
    this.addSignals(relativePath, signalCollector.getEmitter());

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

  /**
   * Find customElements.define() calls with inline class expressions
   * E.g., customElements.define('tag-name', class extends LitElement { ... })
   */
  private findAnonymousCustomElementsDefines(
    sourceFile: ts.SourceFile
  ): Array<{ tagName: string; classExpr: ts.ClassExpression }> {
    const results: Array<{ tagName: string; classExpr: ts.ClassExpression }> = [];

    const visit = (node: ts.Node) => {
      // Look for customElements.define('tag-name', class extends ... { ... })
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
              if (tagNameArg && ts.isStringLiteral(tagNameArg) && classArg && ts.isClassExpression(classArg)) {
                results.push({ tagName: tagNameArg.text, classExpr: classArg });
              }
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
    return results;
  }

  /**
   * Extract a Lit component from an anonymous class expression
   * E.g., customElements.define('tag-name', class extends LitElement { ... })
   */
  private extractLitComponentFromClassExpression(
    classExpr: ts.ClassExpression,
    sourceFile: ts.SourceFile,
    relativePath: string,
    tagName: string
  ): Component | null {
    // Check if extends LitElement or any class ending in Element
    const extendsLit = classExpr.heritageClauses?.some(clause => {
      return clause.types.some(type => {
        const text = type.expression.getText(sourceFile);
        return text === 'LitElement' || text.endsWith('Element');
      });
    });

    if (!extendsLit) return null;

    // Use tag name converted to PascalCase as the component name
    const className = classExpr.name?.getText(sourceFile) || this.toPascalCase(tagName);
    const line = sourceFile.getLineAndCharacterOfPosition(classExpr.getStart(sourceFile)).line + 1;

    const source: WebComponentSource = {
      type: 'lit',
      path: relativePath,
      exportName: className,
      tagName,
      line,
    };

    // Extract properties from decorators
    const props = this.extractLitDecoratorPropertiesFromExpression(classExpr, sourceFile);

    const metadata: ComponentMetadataExtended = {
      deprecated: false,
      tags: [],
    };

    return {
      id: createComponentId(source as any, className),
      name: className,
      source: source as any,
      props,
      variants: [],
      tokens: [],
      dependencies: [],
      metadata: metadata as any,
      scannedAt: new Date(),
    };
  }

  /**
   * Extract decorated properties from a class expression (similar to extractLitDecoratorProperties but for ClassExpression)
   */
  private extractLitDecoratorPropertiesFromExpression(
    node: ts.ClassExpression,
    sourceFile: ts.SourceFile
  ): PropDefinition[] {
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
        // Support @property, @state, and legacy @internalProperty
        if (decoratorName === 'property' || decoratorName === 'state' || decoratorName === 'internalProperty') {
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

    // Detect reactive controllers used in the component
    const controllers = this.extractLitControllers(node, sourceFile);

    // Extract query decorators (@query, @queryAll, @queryAssignedElements, etc.)
    const queries = this.extractLitQueries(node, sourceFile);

    // Extract JSDoc metadata
    const jsDocMetadata = this.extractJsDocMetadata(node);

    const metadata: ComponentMetadataExtended = {
      deprecated: this.hasDeprecatedTag(node),
      tags: [],
      controllers: controllers.length > 0 ? controllers : undefined,
      queries: queries.length > 0 ? queries : undefined,
      ...jsDocMetadata,
    };

    return {
      id: createComponentId(source as any, className),
      name: className,
      source: source as any,
      props,
      variants: [],
      tokens: [],
      dependencies: [],
      metadata: metadata as any,
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
        // Support @property, @state, and legacy @internalProperty (Lit 2.x)
        if (decoratorName === 'property' || decoratorName === 'state' || decoratorName === 'internalProperty') {
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

    // Extract JSDoc metadata
    const jsDocMetadata = this.extractJsDocMetadata(node);

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
      ...jsDocMetadata,
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

  private extractStencilProps(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): ExtendedPropDefinition[] {
    const props: ExtendedPropDefinition[] = [];

    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;

      const decorators = ts.getDecorators(member);
      if (!decorators) continue;

      // Find the @Prop decorator
      const propDecorator = decorators.find(d => {
        if (ts.isCallExpression(d.expression)) {
          const expr = d.expression.expression;
          return ts.isIdentifier(expr) && expr.text === 'Prop';
        }
        if (ts.isIdentifier(d.expression)) {
          return d.expression.text === 'Prop';
        }
        return false;
      });

      if (propDecorator) {
        const propName = member.name.getText(sourceFile);
        const propType = member.type ? member.type.getText(sourceFile) : 'unknown';

        // Extract @Prop options: mutable, reflect, attribute
        const options = this.extractStencilPropOptions(propDecorator);

        const prop: ExtendedPropDefinition = {
          name: propName,
          type: propType,
          required: !member.initializer && !member.questionToken,
          defaultValue: member.initializer?.getText(sourceFile),
        };

        // Add options if present
        if (options.mutable !== undefined) prop.mutable = options.mutable;
        if (options.reflect !== undefined) prop.reflect = options.reflect;
        if (options.attribute !== undefined) prop.attribute = options.attribute;

        props.push(prop);
      }
    }

    return props;
  }

  private extractStencilPropOptions(decorator: ts.Decorator): { mutable?: boolean; reflect?: boolean; attribute?: string } {
    const options: { mutable?: boolean; reflect?: boolean; attribute?: string } = {};

    if (!ts.isCallExpression(decorator.expression)) return options;

    const args = decorator.expression.arguments;
    if (args.length === 0) return options;

    const config = args[0];
    if (!config || !ts.isObjectLiteralExpression(config)) return options;

    for (const prop of config.properties) {
      if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;

      const propName = prop.name.text;
      if (propName === 'mutable' && prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
        options.mutable = true;
      }
      if (propName === 'reflect' && prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
        options.reflect = true;
      }
      if (propName === 'attribute' && ts.isStringLiteral(prop.initializer)) {
        options.attribute = prop.initializer.text;
      }
    }

    return options;
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

  private extractStencilEvents(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): ExtendedPropDefinition[] {
    const events: ExtendedPropDefinition[] = [];

    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;

      const decorators = ts.getDecorators(member);
      if (!decorators) continue;

      // Find the @Event decorator
      const eventDecorator = decorators.find(d => {
        if (ts.isCallExpression(d.expression)) {
          const expr = d.expression.expression;
          return ts.isIdentifier(expr) && expr.text === 'Event';
        }
        if (ts.isIdentifier(d.expression)) {
          return d.expression.text === 'Event';
        }
        return false;
      });

      if (eventDecorator) {
        const propName = member.name.getText(sourceFile);

        // Extract @Event options: eventName, bubbles, composed, cancelable
        const options = this.extractStencilEventOptions(eventDecorator);

        const event: ExtendedPropDefinition = {
          name: propName,
          type: 'EventEmitter',
          required: false,
          description: 'Stencil event',
        };

        // Add options if present
        if (options.eventName !== undefined) event.eventName = options.eventName;
        if (options.bubbles !== undefined) event.bubbles = options.bubbles;
        if (options.composed !== undefined) event.composed = options.composed;
        if (options.cancelable !== undefined) event.cancelable = options.cancelable;

        events.push(event);
      }
    }

    return events;
  }

  private extractStencilEventOptions(decorator: ts.Decorator): { eventName?: string; bubbles?: boolean; composed?: boolean; cancelable?: boolean } {
    const options: { eventName?: string; bubbles?: boolean; composed?: boolean; cancelable?: boolean } = {};

    if (!ts.isCallExpression(decorator.expression)) return options;

    const args = decorator.expression.arguments;
    if (args.length === 0) return options;

    const config = args[0];
    if (!config || !ts.isObjectLiteralExpression(config)) return options;

    for (const prop of config.properties) {
      if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;

      const propName = prop.name.text;
      if (propName === 'eventName' && ts.isStringLiteral(prop.initializer)) {
        options.eventName = prop.initializer.text;
      }
      if (propName === 'bubbles') {
        if (prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
          options.bubbles = true;
        } else if (prop.initializer.kind === ts.SyntaxKind.FalseKeyword) {
          options.bubbles = false;
        }
      }
      if (propName === 'composed' && prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
        options.composed = true;
      }
      if (propName === 'cancelable' && prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
        options.cancelable = true;
      }
    }

    return options;
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

    // Extract JSDoc metadata
    const jsDocMetadata = this.extractJsDocMetadata(node);

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
        ...jsDocMetadata,
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

  // ============================================
  // Lit Reactive Controller Detection
  // ============================================

  private extractLitControllers(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): string[] {
    const controllers: string[] = [];

    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      if (!member.initializer) continue;

      // Look for: new SomeController(this, ...)
      if (ts.isNewExpression(member.initializer)) {
        const expr = member.initializer.expression;
        if (ts.isIdentifier(expr)) {
          const controllerName = expr.getText(sourceFile);
          // Controller classes typically end with 'Controller'
          if (controllerName.endsWith('Controller')) {
            controllers.push(controllerName);
          }
        }
      }
    }

    return controllers;
  }

  // ============================================
  // Lit Query Decorator Extraction
  // ============================================

  private extractLitQueries(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): QueryDefinition[] {
    const queries: QueryDefinition[] = [];

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
        const propName = member.name.getText(sourceFile);

        switch (decoratorName) {
          case 'query': {
            const query = this.parseQueryDecorator(decorator, propName, 'query');
            if (query) queries.push(query);
            break;
          }
          case 'queryAll': {
            const query = this.parseQueryDecorator(decorator, propName, 'queryAll');
            if (query) queries.push(query);
            break;
          }
          case 'queryAsync': {
            const query = this.parseQueryDecorator(decorator, propName, 'queryAsync');
            if (query) queries.push(query);
            break;
          }
          case 'queryAssignedElements': {
            const query = this.parseQueryAssignedDecorator(decorator, propName, 'queryAssignedElements');
            if (query) queries.push(query);
            break;
          }
          case 'queryAssignedNodes': {
            const query = this.parseQueryAssignedDecorator(decorator, propName, 'queryAssignedNodes');
            if (query) queries.push(query);
            break;
          }
        }
      }
    }

    return queries;
  }

  private parseQueryDecorator(
    decorator: ts.Decorator,
    propName: string,
    type: 'query' | 'queryAll' | 'queryAsync'
  ): QueryDefinition | null {
    if (!ts.isCallExpression(decorator.expression)) return null;

    const args = decorator.expression.arguments;
    if (args.length === 0) return null;

    // First arg is the selector
    const selectorArg = args[0];
    if (!selectorArg || !ts.isStringLiteral(selectorArg)) return null;

    const query: QueryDefinition = {
      name: propName,
      type,
      selector: selectorArg.text,
    };

    // Second arg (optional) is the cache flag for @query
    if (type === 'query' && args.length > 1) {
      const cacheArg = args[1];
      if (cacheArg && cacheArg.kind === ts.SyntaxKind.TrueKeyword) {
        query.cached = true;
      }
    }

    return query;
  }

  private parseQueryAssignedDecorator(
    decorator: ts.Decorator,
    propName: string,
    type: 'queryAssignedElements' | 'queryAssignedNodes'
  ): QueryDefinition | null {
    if (!ts.isCallExpression(decorator.expression)) return null;

    const query: QueryDefinition = {
      name: propName,
      type,
    };

    const args = decorator.expression.arguments;
    if (args.length === 0) return query;

    // First arg is options object { slot?: string, flatten?: boolean }
    const optionsArg = args[0];
    if (optionsArg && ts.isObjectLiteralExpression(optionsArg)) {
      for (const prop of optionsArg.properties) {
        if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;

        const propKey = prop.name.text;
        if (propKey === 'slot' && ts.isStringLiteral(prop.initializer)) {
          query.slot = prop.initializer.text;
        }
        if (propKey === 'flatten' && prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
          query.flatten = true;
        }
        if (propKey === 'selector' && ts.isStringLiteral(prop.initializer)) {
          query.selector = prop.initializer.text;
        }
      }
    }

    return query;
  }

  // ============================================
  // Haunted.js Component Detection
  // ============================================

  private findHauntedComponents(
    sourceFile: ts.SourceFile,
    hauntedComponents: Map<string, string>
  ): void {
    const visit = (node: ts.Node) => {
      // Look for: customElements.define('tag-name', component(FunctionName))
      if (ts.isCallExpression(node)) {
        const expr = node.expression;
        if (ts.isPropertyAccessExpression(expr)) {
          const obj = expr.expression;
          const prop = expr.name;
          if (ts.isIdentifier(obj) && obj.text === 'customElements' && prop.text === 'define') {
            const args = node.arguments;
            if (args.length >= 2) {
              const tagNameArg = args[0];
              const componentArg = args[1];

              if (tagNameArg && ts.isStringLiteral(tagNameArg)) {
                // Check if second arg is component(FunctionName)
                if (componentArg && ts.isCallExpression(componentArg)) {
                  const componentCallExpr = componentArg.expression;
                  if (ts.isIdentifier(componentCallExpr) && componentCallExpr.text === 'component') {
                    const funcArg = componentArg.arguments[0];
                    if (funcArg && ts.isIdentifier(funcArg)) {
                      hauntedComponents.set(funcArg.text, tagNameArg.text);
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

  private extractHauntedComponent(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    relativePath: string,
    hauntedComponents: Map<string, string>
  ): Component | null {
    // Look for function declarations that are registered with component()
    if (!ts.isFunctionDeclaration(node)) return null;
    if (!node.name) return null;

    const funcName = node.name.getText(sourceFile);
    if (!hauntedComponents.has(funcName)) return null;

    const tagName = hauntedComponents.get(funcName)!;
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

    const source: WebComponentSource = {
      type: 'haunted',
      path: relativePath,
      exportName: funcName,
      tagName,
      line,
    };

    // Extract props from function parameters if destructured
    const props = this.extractHauntedProps(node, sourceFile);

    return {
      id: createComponentId(source as any, funcName),
      name: funcName,
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

  private extractHauntedProps(node: ts.FunctionDeclaration, sourceFile: ts.SourceFile): PropDefinition[] {
    const props: PropDefinition[] = [];

    // Check first parameter for destructured props
    if (node.parameters.length > 0) {
      const firstParam = node.parameters[0];
      if (firstParam && ts.isObjectBindingPattern(firstParam.name)) {
        for (const element of firstParam.name.elements) {
          if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
            const propName = element.name.getText(sourceFile);
            props.push({
              name: propName,
              type: 'unknown',
              required: !element.initializer,
            });
          }
        }
      }
    }

    return props;
  }

  // ============================================
  // Hybrids.js Component Detection
  // ============================================

  private findHybridsDefines(
    sourceFile: ts.SourceFile,
    hybridsDefines: Map<string, { tagName: string; props: string[] }>
  ): void {
    const visit = (node: ts.Node) => {
      // Look for: define({ tag: 'tag-name', prop1: value1, ... })
      // or: export default define<Interface>({ tag: 'tag-name', ... })
      if (ts.isCallExpression(node)) {
        const expr = node.expression;
        let isDefine = false;

        if (ts.isIdentifier(expr) && expr.text === 'define') {
          isDefine = true;
        }

        if (isDefine && node.arguments.length > 0) {
          const config = node.arguments[0];
          if (config && ts.isObjectLiteralExpression(config)) {
            let tagName: string | null = null;
            const props: string[] = [];

            for (const prop of config.properties) {
              if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                const propName = prop.name.text;
                if (propName === 'tag' && ts.isStringLiteral(prop.initializer)) {
                  tagName = prop.initializer.text;
                } else if (propName !== 'render' && propName !== 'tag') {
                  // Non-render, non-tag properties are component props
                  props.push(propName);
                }
              }
            }

            if (tagName) {
              // Try to extract component name from interface type or use tag name
              const componentName = this.extractHybridsComponentName(node, sourceFile) ||
                                    this.toPascalCase(tagName);
              hybridsDefines.set(componentName, { tagName, props });
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
  }

  private extractHybridsComponentName(callExpr: ts.CallExpression, _sourceFile: ts.SourceFile): string | null {
    // Check for type argument: define<SimpleCounter>(...)
    if (callExpr.typeArguments && callExpr.typeArguments.length > 0) {
      const typeArg = callExpr.typeArguments[0];
      if (typeArg && ts.isTypeReferenceNode(typeArg)) {
        const typeName = typeArg.typeName;
        if (ts.isIdentifier(typeName)) {
          return typeName.text;
        }
      }
    }
    return null;
  }

  private extractHybridsComponent(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    relativePath: string,
    hybridsDefines: Map<string, { tagName: string; props: string[] }>
  ): Component | null {
    // We need to find the define() call and extract component info
    // This is called for each node, but we only want to process once
    if (!ts.isExportAssignment(node) && !ts.isVariableStatement(node)) {
      // Check if this is a define() call at top level
      if (!ts.isExpressionStatement(node)) return null;
      if (!ts.isCallExpression(node.expression)) return null;

      const expr = node.expression.expression;
      if (!ts.isIdentifier(expr) || expr.text !== 'define') return null;
    }

    // For export default define(...), we already processed in findHybridsDefines
    // Return the first component found
    for (const [name, info] of hybridsDefines) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

      const source: WebComponentSource = {
        type: 'hybrids',
        path: relativePath,
        exportName: name,
        tagName: info.tagName,
        line,
      };

      const props: PropDefinition[] = info.props.map(propName => ({
        name: propName,
        type: 'unknown',
        required: false,
      }));

      // Remove from map so we don't process again
      hybridsDefines.delete(name);

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

  private toPascalCase(str: string): string {
    return str
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  // ============================================
  // JSDoc Metadata Extraction
  // ============================================

  private extractJsDocMetadata(node: ts.ClassDeclaration): Partial<ComponentMetadataExtended> {
    const jsDocComments = ts.getJSDocCommentsAndTags(node);
    const result: Partial<ComponentMetadataExtended> = {};

    for (const comment of jsDocComments) {
      if (ts.isJSDoc(comment)) {
        // Process JSDoc tags
        if (comment.tags) {
          for (const tag of comment.tags) {
            const tagName = tag.tagName.text.toLowerCase();
            const tagComment = this.getTagComment(tag);

            switch (tagName) {
              case 'summary':
                result.summary = tagComment;
                break;
              case 'fires': {
                const event = this.parseFiresTag(tagComment);
                if (event) {
                  if (!result.events) result.events = [];
                  result.events.push(event);
                }
                break;
              }
              case 'slot': {
                const slot = this.parseSlotTag(tagComment);
                if (slot) {
                  if (!result.slots) result.slots = [];
                  result.slots.push(slot);
                }
                break;
              }
              case 'cssproperty':
              case 'cssprop':
              case 'css-property': {
                const cssProp = this.parseCssPropertyTag(tagComment);
                if (cssProp) {
                  if (!result.cssProperties) result.cssProperties = [];
                  result.cssProperties.push(cssProp);
                }
                break;
              }
              case 'csspart':
              case 'css-part': {
                const cssPart = this.parseCssPartTag(tagComment);
                if (cssPart) {
                  if (!result.cssParts) result.cssParts = [];
                  result.cssParts.push(cssPart);
                }
                break;
              }
            }
          }
        }
      }
    }

    return result;
  }

  private getTagComment(tag: ts.JSDocTag): string {
    if (!tag.comment) return '';

    if (typeof tag.comment === 'string') {
      return tag.comment.trim();
    }

    // Handle JSDocComment (array of JSDocText/JSDocLink nodes)
    return tag.comment
      .map(node => {
        // JSDocText nodes have a 'text' property
        if ('text' in node && typeof node.text === 'string') {
          return node.text;
        }
        return '';
      })
      .join('')
      .trim();
  }

  /**
   * Parse @fires tag
   * Formats:
   * - @fires event-name - Description
   * - @fires event-name {CustomEvent<Type>} - Description
   * - @fires {CustomEvent<Type>} event-name - Description
   */
  private parseFiresTag(text: string): JsDocEvent | null {
    if (!text) return null;

    let name: string | undefined;
    let type: string | undefined;
    let description: string | undefined;

    // Try format: {Type} event-name - Description (type first)
    // Use a more permissive regex that handles nested braces
    const typeFirstMatch = text.match(/^(\{.+?\})\s+(\S+)(?:\s+-\s+(.*))?$/);
    if (typeFirstMatch) {
      // Extract the type without the outer braces
      const typeWithBraces = typeFirstMatch[1]!;
      type = typeWithBraces.slice(1, -1);
      name = typeFirstMatch[2]!;
      description = typeFirstMatch[3]?.trim();
    }
    // Try format: event-name {Type} - Description (name first, type second)
    // Need to find the type section which starts with { and ends at the last }
    else {
      const nameTypeMatch = text.match(/^(\S+)\s+(\{.+\})(?:\s+-\s+(.*))?$/);
      if (nameTypeMatch) {
        // Extract the type without the outer braces
        const typeWithBraces = nameTypeMatch[2]!;
        type = typeWithBraces.slice(1, -1);
        name = nameTypeMatch[1]!;
        description = nameTypeMatch[3]?.trim();
      }
      // Try format: event-name - Description (using " - " as separator)
      else {
        const dashMatch = text.match(/^(\S+)\s+-\s+(.*)$/);
        if (dashMatch) {
          name = dashMatch[1]!;
          description = dashMatch[2]?.trim();
        }
        // Simple format: just event-name (no description)
        else {
          const simpleMatch = text.match(/^(\S+)$/);
          if (simpleMatch) {
            name = simpleMatch[1]!;
          }
        }
      }
    }

    // Validate the event name - must be a valid identifier or kebab-case name
    // Skip if name ends with punctuation (likely parsed from comment text)
    if (!name || /[.!?,;:]$/.test(name)) {
      return null;
    }

    return { name, type, description };
  }

  /**
   * Parse @slot tag
   * Formats:
   * - @slot - Description (default slot)
   * - @slot slot-name - Description
   * - @slot slot-name Description (without dash)
   */
  private parseSlotTag(text: string): JsDocSlot | null {
    if (!text && text !== '') return null;

    // Default slot: starts with "- " or is empty
    if (text === '' || text.startsWith('- ')) {
      return {
        name: '',
        description: text.startsWith('- ') ? text.slice(2).trim() : undefined,
      };
    }

    // Named slot with dash separator: slot-name - Description
    const dashMatch = text.match(/^(\S+)\s+-\s+(.*)$/);
    if (dashMatch) {
      return {
        name: dashMatch[1]!,
        description: dashMatch[2]?.trim(),
      };
    }

    // Named slot without dash separator: slot-name Description
    const spaceMatch = text.match(/^(\S+)(?:\s+(.*))?$/);
    if (spaceMatch) {
      return {
        name: spaceMatch[1]!,
        description: spaceMatch[2]?.trim(),
      };
    }

    return null;
  }

  /**
   * Parse @cssProperty/@cssProp tag
   * Formats:
   * - @cssProperty --name - Description
   * - @cssProperty [--name=default] - Description
   * - @cssProperty {<syntax>} --name - Description
   */
  private parseCssPropertyTag(text: string): JsDocCssProperty | null {
    if (!text) return null;

    // Try format with syntax: {<syntax>} --name - Description
    const syntaxMatch = text.match(/^\{([^}]+)\}\s+(--\S+)(?:\s+-\s+(.*))?$/);
    if (syntaxMatch) {
      return {
        name: syntaxMatch[2]!,
        syntax: syntaxMatch[1],
        description: syntaxMatch[3]?.trim(),
      };
    }

    // Try format with default: [--name=default] - Description
    const defaultMatch = text.match(/^\[(--[^=\]]+)(?:=([^\]]*))?\](?:\s+-\s+(.*))?$/);
    if (defaultMatch) {
      return {
        name: defaultMatch[1]!,
        default: defaultMatch[2],
        description: defaultMatch[3]?.trim(),
      };
    }

    // Try simple format: --name - Description (with " - " separator)
    const dashMatch = text.match(/^(--\S+)\s+-\s+(.*)$/);
    if (dashMatch) {
      return {
        name: dashMatch[1]!,
        description: dashMatch[2]?.trim(),
      };
    }

    // Simple format: just --name (no description)
    const simpleMatch = text.match(/^(--\S+)$/);
    if (simpleMatch) {
      return {
        name: simpleMatch[1]!,
      };
    }

    return null;
  }

  /**
   * Parse @cssPart tag
   * Formats:
   * - @cssPart name - Description
   * - @cssPart name Description (without dash)
   */
  private parseCssPartTag(text: string): JsDocCssPart | null {
    if (!text) return null;

    // With dash separator: name - Description
    const dashMatch = text.match(/^(\S+)\s+-\s+(.*)$/);
    if (dashMatch) {
      return {
        name: dashMatch[1]!,
        description: dashMatch[2]?.trim(),
      };
    }

    // Without dash separator: name Description
    const spaceMatch = text.match(/^(\S+)(?:\s+(.*))?$/);
    if (spaceMatch) {
      return {
        name: spaceMatch[1]!,
        description: spaceMatch[2]?.trim(),
      };
    }

    return null;
  }
}
