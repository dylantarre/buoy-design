import { Scanner, ScanResult, ScannerConfig } from "../base/scanner.js";
import type { Component, PropDefinition } from "@buoy-design/core";
import { createComponentId } from "@buoy-design/core";
import * as ts from "typescript";
import { readFileSync } from "fs";
import { relative } from "path";

export interface AngularScannerConfig extends ScannerConfig {
  designSystemPackage?: string;
}

interface AngularSource {
  type: "angular";
  path: string;
  exportName: string;
  selector: string;
  line: number;
}

export class AngularComponentScanner extends Scanner<
  Component,
  AngularScannerConfig
> {
  /** Default file patterns for Angular components */
  private static readonly DEFAULT_PATTERNS = ["**/*.component.ts"];

  async scan(): Promise<ScanResult<Component>> {
    return this.runScan(
      (file) => this.parseFile(file),
      AngularComponentScanner.DEFAULT_PATTERNS,
    );
  }

  getSourceType(): string {
    return "angular";
  }

  private async parseFile(filePath: string): Promise<Component[]> {
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

    const visit = (node: ts.Node) => {
      // Find classes with @Component decorator
      if (ts.isClassDeclaration(node) && node.name) {
        const componentDecorator = this.findComponentDecorator(node);
        if (componentDecorator) {
          const comp = this.extractComponent(
            node,
            componentDecorator,
            sourceFile,
            relativePath,
          );
          if (comp) components.push(comp);
        }
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);
    return components;
  }

  private findComponentDecorator(
    node: ts.ClassDeclaration,
  ): ts.Decorator | undefined {
    const modifiers = ts.getDecorators(node);
    if (!modifiers) return undefined;

    return modifiers.find((decorator) => {
      if (ts.isCallExpression(decorator.expression)) {
        const expr = decorator.expression.expression;
        return ts.isIdentifier(expr) && expr.text === "Component";
      }
      return false;
    });
  }

  private extractComponent(
    node: ts.ClassDeclaration,
    decorator: ts.Decorator,
    sourceFile: ts.SourceFile,
    relativePath: string,
  ): Component | null {
    if (!node.name) return null;

    const name = node.name.getText(sourceFile);
    const selector = this.extractSelector(decorator, sourceFile);
    const line =
      sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line +
      1;

    const source: AngularSource = {
      type: "angular",
      path: relativePath,
      exportName: name,
      selector: selector || name.replace("Component", "").toLowerCase(),
      line,
    };

    const props = this.extractInputs(node, sourceFile);
    const outputs = this.extractOutputs(node, sourceFile);

    return {
      id: createComponentId(source as any, name),
      name,
      source: source as any,
      props: [...props, ...outputs],
      variants: [],
      tokens: [],
      dependencies: [],
      metadata: {
        deprecated: this.hasDeprecatedDecorator(node),
        tags: [],
      },
      scannedAt: new Date(),
    };
  }

  private extractSelector(
    decorator: ts.Decorator,
    _sourceFile: ts.SourceFile,
  ): string | null {
    if (!ts.isCallExpression(decorator.expression)) return null;

    const args = decorator.expression.arguments;
    if (args.length === 0) return null;

    const config = args[0];
    if (!config || !ts.isObjectLiteralExpression(config)) return null;

    for (const prop of config.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        if (
          prop.name.text === "selector" &&
          ts.isStringLiteral(prop.initializer)
        ) {
          return prop.initializer.text;
        }
      }
    }

    return null;
  }

  private extractInputs(
    node: ts.ClassDeclaration,
    sourceFile: ts.SourceFile,
  ): PropDefinition[] {
    const inputs: PropDefinition[] = [];

    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;

      const decorators = ts.getDecorators(member);
      if (!decorators) continue;

      const hasInput = decorators.some((d) => {
        if (ts.isCallExpression(d.expression)) {
          const expr = d.expression.expression;
          return ts.isIdentifier(expr) && expr.text === "Input";
        }
        if (ts.isIdentifier(d.expression)) {
          return d.expression.text === "Input";
        }
        return false;
      });

      if (hasInput) {
        const propName = member.name.getText(sourceFile);
        const propType = member.type
          ? member.type.getText(sourceFile)
          : "unknown";
        const hasDefault = !!member.initializer;

        inputs.push({
          name: propName,
          type: propType,
          required: !hasDefault && !member.questionToken,
          defaultValue: member.initializer?.getText(sourceFile),
        });
      }
    }

    // Also check for input() signal syntax (Angular 17+)
    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;

      if (member.initializer && ts.isCallExpression(member.initializer)) {
        const callExpr = member.initializer.expression;
        if (ts.isIdentifier(callExpr) && callExpr.text === "input") {
          const propName = member.name.getText(sourceFile);
          inputs.push({
            name: propName,
            type: "Signal",
            required: false,
          });
        }
      }
    }

    return inputs;
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

      const hasOutput = decorators.some((d) => {
        if (ts.isCallExpression(d.expression)) {
          const expr = d.expression.expression;
          return ts.isIdentifier(expr) && expr.text === "Output";
        }
        if (ts.isIdentifier(d.expression)) {
          return d.expression.text === "Output";
        }
        return false;
      });

      if (hasOutput) {
        const propName = member.name.getText(sourceFile);

        outputs.push({
          name: propName,
          type: "EventEmitter",
          required: false,
          description: "Output event",
        });
      }
    }

    // Also check for output() signal syntax (Angular 17+)
    for (const member of node.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      if (!member.name || !ts.isIdentifier(member.name)) continue;

      if (member.initializer && ts.isCallExpression(member.initializer)) {
        const callExpr = member.initializer.expression;
        if (ts.isIdentifier(callExpr) && callExpr.text === "output") {
          const propName = member.name.getText(sourceFile);
          outputs.push({
            name: propName,
            type: "OutputSignal",
            required: false,
          });
        }
      }
    }

    return outputs;
  }

  private hasDeprecatedDecorator(node: ts.ClassDeclaration): boolean {
    const jsDocs = ts.getJSDocTags(node);
    return jsDocs.some((tag) => tag.tagName.text === "deprecated");
  }
}
