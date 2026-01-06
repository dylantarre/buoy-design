import { Scanner, ScanResult, ScannerConfig } from "../base/scanner.js";
import type { Component, PropDefinition, HardcodedValue } from "@buoy-design/core";
import { createComponentId } from "@buoy-design/core";
import * as ts from "typescript";
import { readFileSync } from "fs";
import { relative } from "path";
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

/** Extended PropDefinition with deprecated field for Angular scanner */
interface ExtendedPropDefinition extends PropDefinition {
  deprecated?: boolean;
}

export interface AngularScannerConfig extends ScannerConfig {
  designSystemPackage?: string;
}

interface AngularSource {
  type: "angular";
  path: string;
  exportName: string;
  selector: string;
  selectors?: string[];
  line: number;
  exportAs?: string;
}

export class AngularComponentScanner extends Scanner<
  Component,
  AngularScannerConfig
> {
  /**
   * Default file patterns for Angular components.
   * Includes both standard *.component.ts and any *.ts files to catch
   * Angular Material-style naming (e.g., button.ts, tab.ts)
   */
  private static readonly DEFAULT_PATTERNS = ["**/*.ts"];

  /** Aggregator for collecting signals across all scanned files */
  private signalAggregator: SignalAggregator = createSignalAggregator();

  async scan(): Promise<ScanResult<Component>> {
    // Clear signals from previous scan
    this.signalAggregator.clear();

    // Use cache if available
    if (this.config.cache) {
      return this.runScanWithCache(
        (file) => this.parseFile(file),
        AngularComponentScanner.DEFAULT_PATTERNS,
      );
    }

    return this.runScan(
      (file) => this.parseFile(file),
      AngularComponentScanner.DEFAULT_PATTERNS,
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
    return "angular";
  }

  private async parseFile(filePath: string): Promise<Component[]> {
    try {
      const content = readFileSync(filePath, "utf-8");
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );

      const components: Component[] = [];
      const relativePath = relative(this.config.projectRoot, filePath);

      // Create signal collector for this file
      const signalCollector = createScannerSignalCollector('angular', relativePath);

      const visit = (node: ts.Node) => {
        // Find classes with @Component or @Directive decorator
        if (ts.isClassDeclaration(node) && node.name) {
          const decorator = this.findAngularDecorator(node);
          if (decorator) {
            const comp = this.extractComponent(
              node,
              decorator,
              sourceFile,
              relativePath,
              signalCollector,
            );
            if (comp) components.push(comp);
          }
        }

        ts.forEachChild(node, visit);
      };

      ts.forEachChild(sourceFile, visit);

      // Add this file's signals to the aggregator
      this.signalAggregator.addEmitter(relativePath, signalCollector.getEmitter());

      return components;
    } catch (error) {
      // Log error and return empty array for graceful degradation
      console.warn(`Failed to parse Angular component ${filePath}:`, error instanceof Error ? error.message : error);
      return [];
    }
  }

  /**
   * Find @Component or @Directive decorator on a class
   */
  private findAngularDecorator(
    node: ts.ClassDeclaration,
  ): ts.Decorator | undefined {
    const modifiers = ts.getDecorators(node);
    if (!modifiers) return undefined;

    return modifiers.find((decorator) => {
      if (ts.isCallExpression(decorator.expression)) {
        const expr = decorator.expression.expression;
        return (
          ts.isIdentifier(expr) &&
          (expr.text === "Component" || expr.text === "Directive")
        );
      }
      return false;
    });
  }

  private extractComponent(
    node: ts.ClassDeclaration,
    decorator: ts.Decorator,
    sourceFile: ts.SourceFile,
    relativePath: string,
    signalCollector?: ScannerSignalCollector,
  ): Component | null {
    if (!node.name) return null;

    const name = node.name.getText(sourceFile);
    const { primary: primarySelector, all: allSelectors } = this.extractSelectors(
      decorator,
      sourceFile,
    );
    const exportAs = this.extractExportAs(decorator, sourceFile);
    const line =
      sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line +
      1;

    const source: AngularSource = {
      type: "angular",
      path: relativePath,
      exportName: name,
      selector: primarySelector || name.replace("Component", "").toLowerCase(),
      selectors: allSelectors.length > 1 ? allSelectors : undefined,
      line,
      exportAs,
    };

    // Extract inputs from @Input decorators and class members
    const props = this.extractInputs(node, sourceFile);
    // Extract inputs defined in decorator metadata (inputs: [...])
    const metadataInputs = this.extractDecoratorMetadataInputs(
      decorator,
      sourceFile,
    );
    const outputs = this.extractOutputs(node, sourceFile);
    // Extract outputs defined in decorator metadata (outputs: [...])
    const metadataOutputs = this.extractDecoratorMetadataOutputs(
      decorator,
      sourceFile,
    );
    const modelSignals = this.extractModelSignals(node, sourceFile);
    // Extract signal queries (viewChild, viewChildren, contentChild, contentChildren)
    const signalQueries = this.extractSignalQueries(node, sourceFile);

    // Extract hostDirectives as dependencies
    const hostDirectives = this.extractHostDirectives(decorator, sourceFile);

    // Extract hardcoded values from template
    const hardcodedValues = this.extractHardcodedValuesFromTemplate(decorator, signalCollector);

    const allProps = [...props, ...metadataInputs, ...outputs, ...metadataOutputs, ...modelSignals, ...signalQueries];

    // Emit component definition signal
    signalCollector?.collectComponentDef(name, line, {
      propsCount: allProps.length,
      hasHardcodedValues: hardcodedValues.length > 0,
      dependencyCount: hostDirectives.length,
      selector: primarySelector,
    });

    // Emit component usage signals for host directives (dependencies)
    for (const dep of hostDirectives) {
      signalCollector?.collectComponentUsage(dep, line);
    }

    return {
      id: createComponentId(source as any, name),
      name,
      source: source as any,
      props: allProps,
      variants: [],
      tokens: [],
      dependencies: hostDirectives,
      metadata: {
        deprecated: this.hasDeprecatedDecorator(node),
        tags: [],
        hardcodedValues: hardcodedValues.length > 0 ? hardcodedValues : undefined,
      },
      scannedAt: new Date(),
    };
  }

  /**
   * Extract selectors from decorator metadata.
   * Returns the primary selector and an array of all selectors (if multiple).
   * Multiple selectors are comma-separated, e.g., 'p-iconfield, p-iconField, p-icon-field'
   */
  private extractSelectors(
    decorator: ts.Decorator,
    _sourceFile: ts.SourceFile,
  ): { primary: string | null; all: string[] } {
    if (!ts.isCallExpression(decorator.expression)) {
      return { primary: null, all: [] };
    }

    const args = decorator.expression.arguments;
    if (args.length === 0) return { primary: null, all: [] };

    const config = args[0];
    if (!config || !ts.isObjectLiteralExpression(config)) {
      return { primary: null, all: [] };
    }

    for (const prop of config.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        if (
          prop.name.text === "selector" &&
          ts.isStringLiteral(prop.initializer)
        ) {
          const rawSelector = prop.initializer.text;
          // Parse comma-separated selectors, handling whitespace and newlines
          const selectors = rawSelector
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

          return {
            primary: selectors[0] || null,
            all: selectors,
          };
        }
      }
    }

    return { primary: null, all: [] };
  }

  /**
   * Extract exportAs from decorator metadata
   */
  private extractExportAs(
    decorator: ts.Decorator,
    _sourceFile: ts.SourceFile,
  ): string | undefined {
    if (!ts.isCallExpression(decorator.expression)) return undefined;

    const args = decorator.expression.arguments;
    if (args.length === 0) return undefined;

    const config = args[0];
    if (!config || !ts.isObjectLiteralExpression(config)) return undefined;

    for (const prop of config.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        if (
          prop.name.text === "exportAs" &&
          ts.isStringLiteral(prop.initializer)
        ) {
          return prop.initializer.text;
        }
      }
    }

    return undefined;
  }

  /**
   * Extract inputs defined in decorator metadata: inputs: ['name', { name: 'x', alias: 'y' }]
   */
  private extractDecoratorMetadataInputs(
    decorator: ts.Decorator,
    _sourceFile: ts.SourceFile,
  ): ExtendedPropDefinition[] {
    const inputs: ExtendedPropDefinition[] = [];

    if (!ts.isCallExpression(decorator.expression)) return inputs;

    const args = decorator.expression.arguments;
    if (args.length === 0) return inputs;

    const config = args[0];
    if (!config || !ts.isObjectLiteralExpression(config)) return inputs;

    for (const prop of config.properties) {
      if (
        ts.isPropertyAssignment(prop) &&
        ts.isIdentifier(prop.name) &&
        prop.name.text === "inputs" &&
        ts.isArrayLiteralExpression(prop.initializer)
      ) {
        for (const element of prop.initializer.elements) {
          // String form: 'inputName'
          if (ts.isStringLiteral(element)) {
            inputs.push({
              name: element.text,
              type: "unknown",
              required: false,
            });
          }
          // Object form: { name: 'inputName', alias: 'aliasName' }
          else if (ts.isObjectLiteralExpression(element)) {
            let inputName: string | undefined;
            let alias: string | undefined;

            for (const objProp of element.properties) {
              if (
                ts.isPropertyAssignment(objProp) &&
                ts.isIdentifier(objProp.name)
              ) {
                if (
                  objProp.name.text === "name" &&
                  ts.isStringLiteral(objProp.initializer)
                ) {
                  inputName = objProp.initializer.text;
                } else if (
                  objProp.name.text === "alias" &&
                  ts.isStringLiteral(objProp.initializer)
                ) {
                  alias = objProp.initializer.text;
                }
              }
            }

            if (inputName) {
              const inputProp: ExtendedPropDefinition = {
                name: inputName,
                type: "unknown",
                required: false,
              };
              if (alias) {
                inputProp.description = `Alias: ${alias}`;
              }
              inputs.push(inputProp);
            }
          }
        }
      }
    }

    return inputs;
  }

  /**
   * Extract outputs defined in decorator metadata: outputs: ['outputName', 'outputName2']
   */
  private extractDecoratorMetadataOutputs(
    decorator: ts.Decorator,
    _sourceFile: ts.SourceFile,
  ): ExtendedPropDefinition[] {
    const outputs: ExtendedPropDefinition[] = [];

    if (!ts.isCallExpression(decorator.expression)) return outputs;

    const args = decorator.expression.arguments;
    if (args.length === 0) return outputs;

    const config = args[0];
    if (!config || !ts.isObjectLiteralExpression(config)) return outputs;

    for (const prop of config.properties) {
      if (
        ts.isPropertyAssignment(prop) &&
        ts.isIdentifier(prop.name) &&
        prop.name.text === "outputs" &&
        ts.isArrayLiteralExpression(prop.initializer)
      ) {
        for (const element of prop.initializer.elements) {
          // String form: 'outputName' or 'outputName: aliasName'
          if (ts.isStringLiteral(element)) {
            const outputText = element.text;
            // Handle aliased outputs: 'internalName: externalAlias'
            const colonIndex = outputText.indexOf(":");
            let outputName: string;
            let alias: string | undefined;

            if (colonIndex > -1) {
              outputName = outputText.substring(0, colonIndex).trim();
              alias = outputText.substring(colonIndex + 1).trim();
            } else {
              outputName = outputText.trim();
            }

            const outputProp: ExtendedPropDefinition = {
              name: outputName,
              type: "EventEmitter",
              required: false,
              description: alias ? `Output event (alias: ${alias})` : "Output event",
            };
            outputs.push(outputProp);
          }
          // Object form: { name: 'outputName', alias: 'aliasName' }
          else if (ts.isObjectLiteralExpression(element)) {
            let outputName: string | undefined;
            let alias: string | undefined;

            for (const objProp of element.properties) {
              if (
                ts.isPropertyAssignment(objProp) &&
                ts.isIdentifier(objProp.name)
              ) {
                if (
                  objProp.name.text === "name" &&
                  ts.isStringLiteral(objProp.initializer)
                ) {
                  outputName = objProp.initializer.text;
                } else if (
                  objProp.name.text === "alias" &&
                  ts.isStringLiteral(objProp.initializer)
                ) {
                  alias = objProp.initializer.text;
                }
              }
            }

            if (outputName) {
              const outputProp: ExtendedPropDefinition = {
                name: outputName,
                type: "EventEmitter",
                required: false,
                description: alias ? `Output event (alias: ${alias})` : "Output event",
              };
              outputs.push(outputProp);
            }
          }
        }
      }
    }

    return outputs;
  }

  /**
   * Extract hostDirectives from decorator metadata as dependencies
   */
  private extractHostDirectives(
    decorator: ts.Decorator,
    _sourceFile: ts.SourceFile,
  ): string[] {
    const dependencies: string[] = [];

    if (!ts.isCallExpression(decorator.expression)) return dependencies;

    const args = decorator.expression.arguments;
    if (args.length === 0) return dependencies;

    const config = args[0];
    if (!config || !ts.isObjectLiteralExpression(config)) return dependencies;

    for (const prop of config.properties) {
      if (
        ts.isPropertyAssignment(prop) &&
        ts.isIdentifier(prop.name) &&
        prop.name.text === "hostDirectives" &&
        ts.isArrayLiteralExpression(prop.initializer)
      ) {
        for (const element of prop.initializer.elements) {
          // Simple reference: Bind
          if (ts.isIdentifier(element)) {
            dependencies.push(element.text);
          }
          // Complex form: { directive: SomeDirective, inputs: [...], outputs: [...] }
          else if (ts.isObjectLiteralExpression(element)) {
            for (const objProp of element.properties) {
              if (
                ts.isPropertyAssignment(objProp) &&
                ts.isIdentifier(objProp.name) &&
                objProp.name.text === "directive" &&
                ts.isIdentifier(objProp.initializer)
              ) {
                dependencies.push(objProp.initializer.text);
              }
            }
          }
        }
      }
    }

    return dependencies;
  }

  /**
   * Extract input decorator options like alias, transform, required
   */
  private extractInputDecoratorOptions(
    decorator: ts.Decorator,
    sourceFile: ts.SourceFile,
  ): {
    alias?: string;
    required?: boolean;
    transform?: string;
  } {
    if (!ts.isCallExpression(decorator.expression)) {
      return {};
    }

    const args = decorator.expression.arguments;
    if (args.length === 0) return {};

    const firstArg = args[0];

    // @Input('alias') - string argument
    if (firstArg && ts.isStringLiteral(firstArg)) {
      return { alias: firstArg.text };
    }

    // @Input({ transform: booleanAttribute, required: true }) - object argument
    if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
      const result: { alias?: string; required?: boolean; transform?: string } =
        {};

      for (const prop of firstArg.properties) {
        if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
          const propName = prop.name.text;

          if (propName === "alias" && ts.isStringLiteral(prop.initializer)) {
            result.alias = prop.initializer.text;
          } else if (propName === "required") {
            result.required =
              prop.initializer.kind === ts.SyntaxKind.TrueKeyword;
          } else if (propName === "transform") {
            if (ts.isIdentifier(prop.initializer)) {
              result.transform = prop.initializer.getText(sourceFile);
            } else if (ts.isArrowFunction(prop.initializer)) {
              // For arrow functions, try to detect booleanAttribute/numberAttribute calls
              const inferredTransform = this.inferTransformFromArrowFunction(
                prop.initializer,
                sourceFile,
              );
              if (inferredTransform) {
                result.transform = inferredTransform;
              }
            }
          }
        }
      }

      return result;
    }

    return {};
  }

  /**
   * Check if a property member has @deprecated JSDoc tag
   */
  private hasDeprecatedJSDoc(node: ts.Node): boolean {
    const jsDocs = ts.getJSDocTags(node);
    return jsDocs.some((tag) => tag.tagName.text === "deprecated");
  }

  private extractInputs(
    node: ts.ClassDeclaration,
    sourceFile: ts.SourceFile,
  ): ExtendedPropDefinition[] {
    const inputs: ExtendedPropDefinition[] = [];

    for (const member of node.members) {
      // Handle property declarations with @Input decorator
      if (ts.isPropertyDeclaration(member)) {
        if (!member.name || !ts.isIdentifier(member.name)) continue;

        const decorators = ts.getDecorators(member);
        if (!decorators) continue;

        const inputDecorator = decorators.find((d) => {
          if (ts.isCallExpression(d.expression)) {
            const expr = d.expression.expression;
            return ts.isIdentifier(expr) && expr.text === "Input";
          }
          if (ts.isIdentifier(d.expression)) {
            return d.expression.text === "Input";
          }
          return false;
        });

        if (inputDecorator) {
          const propName = member.name.getText(sourceFile);
          const options = this.extractInputDecoratorOptions(
            inputDecorator,
            sourceFile,
          );
          const hasDefault = !!member.initializer;
          const isDeprecated = this.hasDeprecatedJSDoc(member);

          // Determine type - use transform type if available
          let propType = member.type
            ? member.type.getText(sourceFile)
            : "unknown";

          if (options.transform === "booleanAttribute") {
            propType = "boolean";
          } else if (options.transform === "numberAttribute") {
            propType = "number";
          }

          const prop: ExtendedPropDefinition = {
            name: propName,
            type: propType,
            required:
              options.required ?? (!hasDefault && !member.questionToken),
            defaultValue: member.initializer?.getText(sourceFile),
          };

          // Add alias info to description if present
          if (options.alias) {
            prop.description = `Alias: ${options.alias}`;
          }

          // Mark deprecated props
          if (isDeprecated) {
            prop.deprecated = true;
          }

          inputs.push(prop);
        }
      }

      // Handle getter/setter inputs (Angular Material pattern)
      if (ts.isGetAccessor(member)) {
        if (!member.name || !ts.isIdentifier(member.name)) continue;

        const decorators = ts.getDecorators(member);
        if (!decorators) continue;

        const inputDecorator = decorators.find((d) => {
          if (ts.isCallExpression(d.expression)) {
            const expr = d.expression.expression;
            return ts.isIdentifier(expr) && expr.text === "Input";
          }
          if (ts.isIdentifier(d.expression)) {
            return d.expression.text === "Input";
          }
          return false;
        });

        if (inputDecorator) {
          const propName = member.name.getText(sourceFile);
          const options = this.extractInputDecoratorOptions(
            inputDecorator,
            sourceFile,
          );

          // Get type from getter return type
          const propType = member.type
            ? member.type.getText(sourceFile)
            : "unknown";

          const prop: ExtendedPropDefinition = {
            name: propName,
            type: propType,
            required: options.required ?? false,
          };

          if (options.alias) {
            prop.description = `Alias: ${options.alias}`;
          }

          if (this.hasDeprecatedJSDoc(member)) {
            prop.deprecated = true;
          }

          inputs.push(prop);
        }
      }
    }

    // Check for input() signal syntax (Angular 17+)
    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;

      if (member.initializer && ts.isCallExpression(member.initializer)) {
        const callExpr = member.initializer.expression;

        // input<T>() or input(defaultValue) or input(defaultValue, { options })
        if (ts.isIdentifier(callExpr) && callExpr.text === "input") {
          const propName = member.name.getText(sourceFile);
          const args = member.initializer.arguments;

          // Extract signal input options (transform, alias)
          const signalOptions = this.extractSignalInputOptions(
            args,
            sourceFile,
          );

          // Determine type from explicit type annotation on member, type args, or transform
          let signalType: string;
          if (signalOptions.transform === "booleanAttribute") {
            signalType = "boolean";
          } else if (signalOptions.transform === "numberAttribute") {
            signalType = "number";
          } else if (member.type) {
            // Check for InputSignal<T> or InputSignalWithTransform<T, U> type annotations
            const typeText = member.type.getText(sourceFile);
            if (typeText.startsWith("InputSignalWithTransform<")) {
              // Extract first type param from InputSignalWithTransform<T, U>
              const match = typeText.match(/InputSignalWithTransform<([^,>]+)/);
              signalType = match?.[1] ? `Signal<${match[1].trim()}>` : "Signal";
            } else if (typeText.startsWith("InputSignal<")) {
              // Extract type param from InputSignal<T>
              const match = typeText.match(/InputSignal<(.+)>/);
              signalType = match?.[1] ? `Signal<${match[1].trim()}>` : "Signal";
            } else {
              signalType = typeText;
            }
          } else {
            const typeArgs = member.initializer.typeArguments;
            const firstTypeArg = typeArgs?.[0];
            signalType = firstTypeArg
              ? `Signal<${firstTypeArg.getText(sourceFile)}>`
              : "Signal";
          }

          // Get default value (first non-options argument)
          const hasDefault = args.length > 0;
          const defaultArg = args[0];
          const isDefaultArgOptions =
            defaultArg && ts.isObjectLiteralExpression(defaultArg);

          const prop: ExtendedPropDefinition = {
            name: propName,
            type: signalType,
            required: false,
            defaultValue:
              hasDefault && defaultArg && !isDefaultArgOptions
                ? defaultArg.getText(sourceFile)
                : undefined,
          };

          // Add alias info if present
          if (signalOptions.alias) {
            prop.description = `Alias: ${signalOptions.alias}`;
          }

          inputs.push(prop);
        }

        // input.required<T>() or input.required<T>({ options })
        if (
          ts.isPropertyAccessExpression(callExpr) &&
          ts.isIdentifier(callExpr.expression) &&
          callExpr.expression.text === "input" &&
          callExpr.name.text === "required"
        ) {
          const propName = member.name.getText(sourceFile);
          const args = member.initializer.arguments;

          // Extract signal input options (alias)
          const signalOptions = this.extractSignalInputOptions(
            args,
            sourceFile,
          );

          // Determine type
          let signalType: string;
          if (member.type) {
            const typeText = member.type.getText(sourceFile);
            if (typeText.startsWith("InputSignal<")) {
              const match = typeText.match(/InputSignal<(.+)>/);
              signalType = match?.[1] ? `Signal<${match[1].trim()}>` : "Signal";
            } else {
              signalType = typeText;
            }
          } else {
            const typeArgs = member.initializer.typeArguments;
            const firstTypeArg = typeArgs?.[0];
            signalType = firstTypeArg
              ? `Signal<${firstTypeArg.getText(sourceFile)}>`
              : "Signal";
          }

          const prop: ExtendedPropDefinition = {
            name: propName,
            type: signalType,
            required: true,
          };

          // Add alias info if present
          if (signalOptions.alias) {
            prop.description = `Alias: ${signalOptions.alias}`;
          }

          inputs.push(prop);
        }
      }
    }

    return inputs;
  }

  /**
   * Extract options from signal input() calls like input(default, { alias, transform })
   */
  private extractSignalInputOptions(
    args: ts.NodeArray<ts.Expression>,
    sourceFile: ts.SourceFile,
  ): { alias?: string; transform?: string } {
    const result: { alias?: string; transform?: string } = {};

    // Options can be in the second argument (input(default, { options }))
    // or the first argument if no default (input({ options }))
    for (const arg of args) {
      if (ts.isObjectLiteralExpression(arg)) {
        for (const prop of arg.properties) {
          if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
            const propName = prop.name.text;

            if (propName === "alias" && ts.isStringLiteral(prop.initializer)) {
              result.alias = prop.initializer.text;
            } else if (propName === "transform") {
              if (ts.isIdentifier(prop.initializer)) {
                result.transform = prop.initializer.getText(sourceFile);
              } else if (ts.isArrowFunction(prop.initializer)) {
                // For arrow functions, try to detect booleanAttribute/numberAttribute calls
                const inferredTransform = this.inferTransformFromArrowFunction(
                  prop.initializer,
                  sourceFile,
                );
                if (inferredTransform) {
                  result.transform = inferredTransform;
                }
              }
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * Analyze an arrow function to detect if it calls booleanAttribute or numberAttribute
   * Returns the inferred transform type if found
   */
  private inferTransformFromArrowFunction(
    arrow: ts.ArrowFunction,
    _sourceFile: ts.SourceFile,
  ): string | undefined {
    let foundTransform: string | undefined;

    const visit = (node: ts.Node) => {
      // Look for call expressions to booleanAttribute or numberAttribute
      if (ts.isCallExpression(node)) {
        const expr = node.expression;
        if (ts.isIdentifier(expr)) {
          if (expr.text === "booleanAttribute") {
            foundTransform = "booleanAttribute";
          } else if (expr.text === "numberAttribute") {
            foundTransform = "numberAttribute";
          }
        }
      }

      if (!foundTransform) {
        ts.forEachChild(node, visit);
      }
    };

    visit(arrow.body);
    return foundTransform;
  }

  private extractOutputs(
    node: ts.ClassDeclaration,
    sourceFile: ts.SourceFile,
  ): PropDefinition[] {
    const outputs: PropDefinition[] = [];

    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;

      const decorators = ts.getDecorators(member);
      if (!decorators) continue;

      // Find @Output decorator and extract alias if present
      const outputDecorator = decorators.find((d) => {
        if (ts.isCallExpression(d.expression)) {
          const expr = d.expression.expression;
          return ts.isIdentifier(expr) && expr.text === "Output";
        }
        if (ts.isIdentifier(d.expression)) {
          return d.expression.text === "Output";
        }
        return false;
      });

      if (outputDecorator) {
        const propName = member.name.getText(sourceFile);
        const alias = this.extractOutputDecoratorAlias(outputDecorator);

        outputs.push({
          name: propName,
          type: "EventEmitter",
          required: false,
          description: alias ? `Output event (alias: ${alias})` : "Output event",
        });
      }
    }

    // Check for output() signal syntax (Angular 17+)
    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;

      if (member.initializer && ts.isCallExpression(member.initializer)) {
        const callExpr = member.initializer.expression;
        if (ts.isIdentifier(callExpr) && callExpr.text === "output") {
          const propName = member.name.getText(sourceFile);

          // Check for OutputEmitterRef type annotation
          let outputType = "OutputSignal";
          if (member.type) {
            const typeText = member.type.getText(sourceFile);
            if (typeText.startsWith("OutputEmitterRef<")) {
              outputType = "OutputEmitterRef";
            }
          }

          outputs.push({
            name: propName,
            type: outputType,
            required: false,
          });
        }
      }
    }

    return outputs;
  }

  /**
   * Extract alias from @Output decorator: @Output('aliasName')
   */
  private extractOutputDecoratorAlias(decorator: ts.Decorator): string | undefined {
    if (!ts.isCallExpression(decorator.expression)) {
      return undefined;
    }

    const args = decorator.expression.arguments;
    if (args.length === 0) return undefined;

    const firstArg = args[0];

    // @Output('alias') - string argument
    if (firstArg && ts.isStringLiteral(firstArg)) {
      return firstArg.text;
    }

    return undefined;
  }

  /**
   * Extract model() signals for two-way binding (Angular 17+)
   */
  private extractModelSignals(
    node: ts.ClassDeclaration,
    sourceFile: ts.SourceFile,
  ): PropDefinition[] {
    const models: PropDefinition[] = [];

    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;

      if (member.initializer && ts.isCallExpression(member.initializer)) {
        const callExpr = member.initializer.expression;

        // model<T>() - optional model with default
        if (ts.isIdentifier(callExpr) && callExpr.text === "model") {
          const propName = member.name.getText(sourceFile);
          const typeArgs = member.initializer.typeArguments;
          const firstTypeArg = typeArgs?.[0];
          const signalType = firstTypeArg
            ? `ModelSignal<${firstTypeArg.getText(sourceFile)}>`
            : "ModelSignal";

          const args = member.initializer.arguments;
          const hasDefault = args.length > 0;
          const defaultArg = args[0];

          models.push({
            name: propName,
            type: signalType,
            required: false,
            defaultValue:
              hasDefault && defaultArg
                ? defaultArg.getText(sourceFile)
                : undefined,
          });
        }

        // model.required<T>() - required model
        if (
          ts.isPropertyAccessExpression(callExpr) &&
          ts.isIdentifier(callExpr.expression) &&
          callExpr.expression.text === "model" &&
          callExpr.name.text === "required"
        ) {
          const propName = member.name.getText(sourceFile);
          const typeArgs = member.initializer.typeArguments;
          const firstTypeArg = typeArgs?.[0];
          const signalType = firstTypeArg
            ? `ModelSignal<${firstTypeArg.getText(sourceFile)}>`
            : "ModelSignal";

          models.push({
            name: propName,
            type: signalType,
            required: true,
          });
        }
      }
    }

    return models;
  }

  /**
   * Extract Angular 17+ signal queries: viewChild, viewChildren, contentChild, contentChildren
   */
  private extractSignalQueries(
    node: ts.ClassDeclaration,
    sourceFile: ts.SourceFile,
  ): PropDefinition[] {
    const queries: PropDefinition[] = [];

    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;

      if (member.initializer && ts.isCallExpression(member.initializer)) {
        const propName = member.name.getText(sourceFile);
        const callExpr = member.initializer.expression;

        // viewChild() or contentChild()
        if (ts.isIdentifier(callExpr)) {
          const funcName = callExpr.text;
          if (funcName === "viewChild" || funcName === "contentChild") {
            const queryType = this.getSignalQueryType(member, sourceFile, false);
            queries.push({
              name: propName,
              type: queryType,
              required: false,
              description: `${funcName} query`,
            });
          } else if (funcName === "viewChildren" || funcName === "contentChildren") {
            const queryType = this.getSignalQueryType(member, sourceFile, true);
            queries.push({
              name: propName,
              type: queryType,
              required: false,
              description: `${funcName} query`,
            });
          }
        }

        // viewChild.required() or contentChild.required()
        if (
          ts.isPropertyAccessExpression(callExpr) &&
          ts.isIdentifier(callExpr.expression) &&
          callExpr.name.text === "required"
        ) {
          const baseName = callExpr.expression.text;
          if (baseName === "viewChild" || baseName === "contentChild") {
            const queryType = this.getSignalQueryType(member, sourceFile, false);
            queries.push({
              name: propName,
              type: queryType,
              required: true,
              description: `${baseName}.required query`,
            });
          }
        }
      }
    }

    return queries;
  }

  /**
   * Determine the type for a signal query based on type annotations or type arguments
   */
  private getSignalQueryType(
    member: ts.PropertyDeclaration,
    sourceFile: ts.SourceFile,
    isMultiple: boolean,
  ): string {
    // Check for explicit type annotation
    if (member.type) {
      const typeText = member.type.getText(sourceFile);
      // If it's already a Signal type, use it
      if (typeText.includes("Signal")) {
        return typeText;
      }
    }

    // Check for type arguments on the call expression
    if (member.initializer && ts.isCallExpression(member.initializer)) {
      const typeArgs = member.initializer.typeArguments;
      if (typeArgs && typeArgs.length > 0) {
        const firstTypeArg = typeArgs[0];
        if (firstTypeArg) {
          const innerType = firstTypeArg.getText(sourceFile);
          if (isMultiple) {
            return `Signal<readonly ${innerType}[]>`;
          }
          return `Signal<${innerType} | undefined>`;
        }
      }
    }

    // Default signal type
    return isMultiple ? "Signal<readonly unknown[]>" : "Signal<unknown | undefined>";
  }

  private hasDeprecatedDecorator(node: ts.ClassDeclaration): boolean {
    const jsDocs = ts.getJSDocTags(node);
    return jsDocs.some((tag) => tag.tagName.text === "deprecated");
  }

  /**
   * Extract hardcoded color and spacing values from Angular template.
   * Detects patterns like:
   * - style="color: #FF0000"
   * - [style]="{ color: '#FF0000' }"
   * - [ngStyle]="{ 'background-color': '#FF0000' }"
   */
  private extractHardcodedValuesFromTemplate(
    decorator: ts.Decorator,
    signalCollector?: ScannerSignalCollector,
  ): HardcodedValue[] {
    const hardcoded: HardcodedValue[] = [];

    // Extract template string from decorator
    let templateContent: string | null = null;

    if (ts.isCallExpression(decorator.expression)) {
      const args = decorator.expression.arguments;
      const firstArg = args[0];
      if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
        for (const prop of firstArg.properties) {
          if (
            ts.isPropertyAssignment(prop) &&
            ts.isIdentifier(prop.name) &&
            prop.name.text === "template" &&
            ts.isStringLiteral(prop.initializer)
          ) {
            templateContent = prop.initializer.text;
            break;
          }
        }
      }
    }

    if (!templateContent) return hardcoded;

    // Pattern 1: Inline style attribute: style="color: #FF0000; padding: 16px"
    const inlineStyleRegex = /style="([^"]+)"/g;
    let match;
    while ((match = inlineStyleRegex.exec(templateContent)) !== null) {
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

    // Pattern 2: Angular style binding: [style]="{ color: '#FF0000', padding: '16px' }"
    const styleBindingRegex = /\[style\]="?\{([^}]+)\}"?/g;
    while ((match = styleBindingRegex.exec(templateContent)) !== null) {
      const bindingContent = match[1];
      if (bindingContent) {
        // Parse object properties: color: '#FF0000', padding: '16px'
        const propRegex = /([a-zA-Z-]+)\s*:\s*['"]([^'"]+)['"]/g;
        let propMatch;
        while ((propMatch = propRegex.exec(bindingContent)) !== null) {
          const [, property, value] = propMatch;
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
      }
    }

    // Pattern 3: Angular ngStyle directive: [ngStyle]="{ 'background-color': '#FF0000' }"
    const ngStyleRegex = /\[ngStyle\]="?\{([^}]+)\}"?/g;
    while ((match = ngStyleRegex.exec(templateContent)) !== null) {
      const bindingContent = match[1];
      if (bindingContent) {
        // Parse object properties: 'background-color': '#FF0000'
        const propRegex = /['"]([a-zA-Z-]+)['"]\s*:\s*['"]([^'"]+)['"]/g;
        let propMatch;
        while ((propMatch = propRegex.exec(bindingContent)) !== null) {
          const [, property, value] = propMatch;
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
