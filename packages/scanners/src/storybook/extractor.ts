import { Scanner, ScanResult, ScannerConfig, ScanError, ScanStats } from '../base/scanner.js';
import type { Component, StorybookSource, PropDefinition } from '@buoy-design/core';
import { createComponentId } from '@buoy-design/core';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, relative } from 'path';
import * as ts from 'typescript';

export interface StorybookScannerConfig extends ScannerConfig {
  url?: string;
  staticDir?: string;
  /** Bearer token for authentication */
  authToken?: string;
  /** Custom header name for auth (defaults to 'Authorization') */
  authHeader?: string;
}

interface StorybookIndex {
  v: number;
  entries: Record<string, StorybookEntry>;
}

interface StorybookEntry {
  id: string;
  title: string;
  name: string;
  importPath: string;
  tags?: string[];
  type: 'story' | 'docs';
  componentPath?: string; // v5+ includes path to component source
}

export interface StoryFileScannerConfig extends ScannerConfig {
  /** Story file patterns to include */
  include?: string[];
  /** Patterns to exclude */
  exclude?: string[];
}

interface StoryMeta {
  title: string;
  component?: string;
  tags?: string[];
  argTypes?: Record<string, ArgTypeInfo>;
  hasDecorators?: boolean;
  hasParameters?: boolean;
  subcomponents?: string[];
  hasLoaders?: boolean;
  hasBeforeEach?: boolean;
  docsDescription?: string;
}

interface ArgTypeInfo {
  control?: string | { type: string };
  options?: string[];
  description?: string;
}

interface StoryVariant {
  name: string;
  hasPlayFunction?: boolean;
  hasRenderFunction?: boolean;
  hasBeforeEach?: boolean;
  tags?: string[];
  args?: Record<string, unknown>;
  description?: string;
}

/** Default exclusions for story file scanning - does NOT exclude *.stories.* files */
const STORY_SCANNER_EXCLUDES = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/coverage/**',
];

/**
 * Scans .stories.{ts,tsx,js,jsx} files to extract component metadata.
 * This scanner parses Component Story Format (CSF) files directly from source code.
 */
export class StoryFileScanner extends Scanner<Component, StoryFileScannerConfig> {
  /** Default file patterns for story files */
  private static readonly DEFAULT_PATTERNS = [
    '**/*.stories.tsx',
    '**/*.stories.ts',
    '**/*.stories.jsx',
    '**/*.stories.js',
  ];

  constructor(config: StoryFileScannerConfig) {
    // Override exclude patterns to not exclude story files
    super({
      ...config,
      exclude: config.exclude ?? STORY_SCANNER_EXCLUDES,
    });
  }

  async scan(): Promise<ScanResult<Component>> {
    return this.runScan(
      (file) => this.parseStoryFile(file),
      StoryFileScanner.DEFAULT_PATTERNS,
    );
  }

  getSourceType(): string {
    return 'storybook';
  }

  /**
   * Get story patterns from .storybook/main.ts config file
   */
  async getStoryPatternsFromConfig(): Promise<string[]> {
    const mainPaths = [
      resolve(this.config.projectRoot, '.storybook/main.ts'),
      resolve(this.config.projectRoot, '.storybook/main.js'),
      resolve(this.config.projectRoot, '.storybook/main.mjs'),
    ];

    for (const mainPath of mainPaths) {
      if (existsSync(mainPath)) {
        try {
          const content = await readFile(mainPath, 'utf-8');
          return this.extractStoriesPatterns(content);
        } catch {
          // Continue to next file
        }
      }
    }

    return [];
  }

  private extractStoriesPatterns(content: string): string[] {
    const patterns: string[] = [];

    // Parse the config file to extract stories patterns
    const sourceFile = ts.createSourceFile(
      'main.ts',
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    const visit = (node: ts.Node) => {
      // Look for stories: [...] property
      if (ts.isPropertyAssignment(node) && node.name) {
        const propName = node.name.getText(sourceFile);
        if (propName === 'stories' && ts.isArrayLiteralExpression(node.initializer)) {
          for (const element of node.initializer.elements) {
            if (ts.isStringLiteral(element)) {
              patterns.push(element.text);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);
    return patterns;
  }

  private async parseStoryFile(filePath: string): Promise<Component[]> {
    const content = await readFile(filePath, 'utf-8');
    const isTypeScript = filePath.endsWith('.tsx') || filePath.endsWith('.ts');
    const isJSX = filePath.endsWith('.tsx') || filePath.endsWith('.jsx');

    let scriptKind: ts.ScriptKind;
    if (isTypeScript && isJSX) {
      scriptKind = ts.ScriptKind.TSX;
    } else if (isTypeScript) {
      scriptKind = ts.ScriptKind.TS;
    } else if (isJSX) {
      scriptKind = ts.ScriptKind.JSX;
    } else {
      scriptKind = ts.ScriptKind.JS;
    }

    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      scriptKind,
    );

    const relativePath = relative(this.config.projectRoot, filePath);

    // Check if this is a CSF4 file (uses preview.meta() pattern)
    const isCSF4 = this.isCSF4File(sourceFile);

    // Extract meta from default export or CSF4 pattern
    const meta = isCSF4
      ? this.extractCSF4Meta(sourceFile, relativePath)
      : this.extractMeta(sourceFile, relativePath);
    if (!meta) {
      return []; // Not a valid story file
    }

    // Extract story variants from named exports or CSF4 pattern
    const variants = isCSF4
      ? this.extractCSF4StoryVariants(sourceFile)
      : this.extractStoryVariants(sourceFile);

    // Determine component name from meta
    const componentName = meta.component || this.getComponentNameFromTitle(meta.title);

    // Build storybook URL with path embedded for traceability
    const storyUrl = `file://${relativePath}`;

    const source: StorybookSource = {
      type: 'storybook',
      storyId: this.createStoryId(meta.title, 'default'),
      kind: meta.title,
      url: storyUrl,
    };

    // Extract props from argTypes
    const props = this.extractPropsFromArgTypes(meta.argTypes);

    // Parse hierarchy from title
    const hierarchy = meta.title.split('/').map(s => s.trim());

    // Build tags that include storybook metadata
    const tags = [...(meta.tags || [])];
    if (meta.hasDecorators) {
      tags.push('has-decorators');
    }
    if (meta.hasParameters) {
      tags.push('has-parameters');
    }
    if (meta.hasLoaders) {
      tags.push('has-loaders');
    }
    if (meta.hasBeforeEach) {
      tags.push('has-beforeEach');
    }
    // Add hierarchy as tags for searchability
    tags.push(`storybook-title:${meta.title}`);
    if (meta.component) {
      tags.push(`storybook-component:${meta.component}`);
    }
    // Add subcomponents as tags
    if (meta.subcomponents) {
      for (const subcomp of meta.subcomponents) {
        tags.push(`storybook-subcomponent:${subcomp}`);
      }
    }
    // Add hierarchy levels as tags
    hierarchy.forEach((level, index) => {
      tags.push(`storybook-level-${index}:${level}`);
    });

    // Build documentation from docs description if available
    let documentation = `Storybook: ${meta.title}${meta.component ? ` (component: ${meta.component})` : ''}`;
    if (meta.docsDescription) {
      documentation = meta.docsDescription;
    }

    // Build dependencies from subcomponents
    const dependencies: string[] = meta.subcomponents ? [...meta.subcomponents] : [];

    const component: Component = {
      id: createComponentId(source, componentName),
      name: componentName,
      source,
      props,
      variants: variants.map(v => ({
        name: v.name,
        props: {
          ...(v.args || {}),
          hasPlayFunction: v.hasPlayFunction,
          hasRenderFunction: v.hasRenderFunction,
          hasBeforeEach: v.hasBeforeEach,
          description: v.description,
        },
      })),
      tokens: [],
      dependencies,
      metadata: {
        tags,
        documentation,
      },
      scannedAt: new Date(),
    };

    return [component];
  }

  private extractMeta(sourceFile: ts.SourceFile, relativePath: string): StoryMeta | null {
    let meta: StoryMeta | null = null;

    const visit = (node: ts.Node) => {
      // Look for: const meta = { ... }; export default meta;
      // Process variable declarations first
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            const name = decl.name.getText(sourceFile);
            if (name === 'meta' && decl.initializer) {
              const parsed = this.parseMetaObject(decl.initializer, sourceFile);
              if (parsed) {
                meta = parsed;
              }
            }
          }
        }
      }

      // Look for: export default { title: 'X', component: Y, ... }
      // Only use this if we don't already have a meta from variable declaration
      if (ts.isExportAssignment(node) && !node.isExportEquals && !meta) {
        const parsed = this.parseMetaObject(node.expression, sourceFile);
        if (parsed) {
          meta = parsed;
        }
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);

    // If we have meta but no title (or empty title), try to infer from file path (CSF3 auto-title)
    const result = meta as StoryMeta | null;
    if (result && result.title === '') {
      result.title = this.inferTitleFromPath(relativePath, result.component);
    }

    return result;
  }

  /**
   * Check if this is a CSF4 file (uses preview.meta() pattern)
   */
  private isCSF4File(sourceFile: ts.SourceFile): boolean {
    let hasDefinePreview = false;

    const visit = (node: ts.Node) => {
      // Look for definePreview or __definePreview calls
      if (ts.isCallExpression(node)) {
        const callText = node.expression.getText(sourceFile);
        if (callText === 'definePreview' || callText === '__definePreview') {
          hasDefinePreview = true;
          return;
        }
      }
      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);
    return hasDefinePreview;
  }

  /**
   * Extract meta from CSF4 pattern: const meta = preview.meta({...})
   */
  private extractCSF4Meta(sourceFile: ts.SourceFile, relativePath: string): StoryMeta | null {
    // Find the meta object literal from preview.meta() call
    const metaObjectLiteral = this.findCSF4MetaObjectLiteral(sourceFile);
    if (!metaObjectLiteral) {
      return null;
    }

    const meta = this.parseMetaObjectLiteral(metaObjectLiteral, sourceFile);

    // Infer title from file path if not provided
    if (meta.title === '') {
      meta.title = this.inferTitleFromPath(relativePath, meta.component);
    }

    return meta;
  }

  /**
   * Find the object literal argument passed to preview.meta()
   */
  private findCSF4MetaObjectLiteral(sourceFile: ts.SourceFile): ts.ObjectLiteralExpression | null {
    let result: ts.ObjectLiteralExpression | null = null;

    const visit = (node: ts.Node) => {
      if (result) return; // Already found

      // Look for: const meta = preview.meta({...})
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            const name = decl.name.getText(sourceFile);
            if (name === 'meta' && decl.initializer) {
              // Check if it's a call expression like preview.meta({...})
              if (ts.isCallExpression(decl.initializer)) {
                const callExpr = decl.initializer;
                // Check if it's *.meta() pattern
                if (ts.isPropertyAccessExpression(callExpr.expression)) {
                  const methodName = callExpr.expression.name.getText(sourceFile);
                  if (methodName === 'meta' && callExpr.arguments.length > 0) {
                    const arg = callExpr.arguments[0];
                    if (arg && ts.isObjectLiteralExpression(arg)) {
                      result = arg;
                      return;
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
    return result;
  }

  /**
   * Parse an object literal into StoryMeta (shared between CSF3 and CSF4)
   */
  private parseMetaObjectLiteral(node: ts.ObjectLiteralExpression, sourceFile: ts.SourceFile): StoryMeta {
    const meta: StoryMeta = {
      title: '',
    };

    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop) || !prop.name) continue;

      const propName = prop.name.getText(sourceFile);

      switch (propName) {
        case 'title':
          if (ts.isStringLiteral(prop.initializer)) {
            meta.title = prop.initializer.text;
          }
          break;

        case 'component':
          meta.component = prop.initializer.getText(sourceFile);
          break;

        case 'tags':
          if (ts.isArrayLiteralExpression(prop.initializer)) {
            meta.tags = [];
            for (const elem of prop.initializer.elements) {
              if (ts.isStringLiteral(elem)) {
                meta.tags.push(elem.text);
              }
            }
          }
          break;

        case 'argTypes':
          if (ts.isObjectLiteralExpression(prop.initializer)) {
            meta.argTypes = this.parseArgTypes(prop.initializer, sourceFile);
          }
          break;

        case 'decorators':
          meta.hasDecorators = true;
          break;

        case 'parameters':
          meta.hasParameters = true;
          if (ts.isObjectLiteralExpression(prop.initializer)) {
            const docsDesc = this.extractDocsDescription(prop.initializer, sourceFile);
            if (docsDesc) {
              meta.docsDescription = docsDesc;
            }
          }
          break;

        case 'subcomponents':
          if (ts.isObjectLiteralExpression(prop.initializer)) {
            meta.subcomponents = [];
            for (const subProp of prop.initializer.properties) {
              if (ts.isPropertyAssignment(subProp) || ts.isShorthandPropertyAssignment(subProp)) {
                if (subProp.name) {
                  meta.subcomponents.push(subProp.name.getText(sourceFile));
                }
              }
            }
          }
          break;

        case 'loaders':
          meta.hasLoaders = true;
          break;

        case 'beforeEach':
          meta.hasBeforeEach = true;
          break;
      }
    }

    return meta;
  }

  /**
   * Extract CSF4 story variants from meta.story() calls
   */
  private extractCSF4StoryVariants(sourceFile: ts.SourceFile): StoryVariant[] {
    const variants: StoryVariant[] = [];

    const visit = (node: ts.Node) => {
      // Look for: export const Primary = meta.story({...})
      if (ts.isVariableStatement(node)) {
        const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
        if (!isExported) {
          ts.forEachChild(node, visit);
          return;
        }

        for (const decl of node.declarationList.declarations) {
          if (!ts.isIdentifier(decl.name)) continue;

          const name = decl.name.getText(sourceFile);
          // Skip meta, preview, etc.
          if (name === 'meta' || name === 'preview') continue;
          // Check if it looks like a story name (uppercase first letter)
          if (!/^[A-Z]/.test(name)) continue;

          if (decl.initializer && ts.isCallExpression(decl.initializer)) {
            const callExpr = decl.initializer;
            // Check if it's meta.story({...}) pattern
            if (ts.isPropertyAccessExpression(callExpr.expression)) {
              const methodName = callExpr.expression.name.getText(sourceFile);
              const objectName = callExpr.expression.expression.getText(sourceFile);

              if (methodName === 'story' && objectName === 'meta' && callExpr.arguments.length > 0) {
                const arg = callExpr.arguments[0];
                if (arg && ts.isObjectLiteralExpression(arg)) {
                  const variant = this.parseCSF4StoryObject(name, arg, sourceFile);
                  variants.push(variant);
                }
              }
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);
    return variants;
  }

  /**
   * Parse a CSF4 story object (the argument to meta.story())
   */
  private parseCSF4StoryObject(name: string, node: ts.ObjectLiteralExpression, sourceFile: ts.SourceFile): StoryVariant {
    const variant: StoryVariant = { name };

    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop) && !ts.isMethodDeclaration(prop)) continue;
      if (!prop.name) continue;

      const propName = prop.name.getText(sourceFile);

      switch (propName) {
        case 'play':
          variant.hasPlayFunction = true;
          break;

        case 'render':
          variant.hasRenderFunction = true;
          break;

        case 'args':
          if (ts.isPropertyAssignment(prop) && ts.isObjectLiteralExpression(prop.initializer)) {
            variant.args = this.parseArgsObject(prop.initializer, sourceFile);
          }
          break;

        case 'tags':
          if (ts.isPropertyAssignment(prop) && ts.isArrayLiteralExpression(prop.initializer)) {
            variant.tags = [];
            for (const elem of prop.initializer.elements) {
              if (ts.isStringLiteral(elem)) {
                variant.tags.push(elem.text);
              }
            }
          }
          break;

        case 'beforeEach':
          variant.hasBeforeEach = true;
          break;

        case 'parameters':
          if (ts.isPropertyAssignment(prop) && ts.isObjectLiteralExpression(prop.initializer)) {
            const storyDesc = this.extractStoryDescription(prop.initializer, sourceFile);
            if (storyDesc) {
              variant.description = storyDesc;
            }
          }
          break;

        case 'name':
          // CSF4 story can have a 'name' property to override the display name
          if (ts.isPropertyAssignment(prop) && ts.isStringLiteral(prop.initializer)) {
            variant.name = prop.initializer.text;
          }
          break;
      }
    }

    return variant;
  }

  /**
   * Infers a Storybook title from the file path (CSF3 auto-title feature)
   * e.g., src/components/Button.stories.tsx -> components/Button
   */
  private inferTitleFromPath(relativePath: string, componentName?: string): string {
    // Remove common prefixes like src/, lib/, app/
    let path = relativePath
      .replace(/^(src|lib|app)\//, '')
      // Remove .stories.{ts,tsx,js,jsx} suffix
      .replace(/\.stories\.(tsx?|jsx?|mjs)$/, '');

    // Get the directory path and filename
    const parts = path.split('/');
    const fileName = parts.pop() || '';
    const dirPath = parts.join('/');

    // Use component name if available, otherwise use filename
    const componentTitle = componentName || fileName;

    // Build the title: directory/ComponentName
    return dirPath ? `${dirPath}/${componentTitle}` : componentTitle;
  }

  private parseMetaObject(node: ts.Expression, sourceFile: ts.SourceFile): StoryMeta | null {
    // Handle "satisfies Meta<T>" pattern
    if (ts.isSatisfiesExpression(node)) {
      return this.parseMetaObject(node.expression, sourceFile);
    }

    // Handle "as Meta<T>" pattern
    if (ts.isAsExpression(node)) {
      return this.parseMetaObject(node.expression, sourceFile);
    }

    if (!ts.isObjectLiteralExpression(node)) {
      return null;
    }

    const meta: StoryMeta = {
      title: '',
    };

    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop) || !prop.name) continue;

      const propName = prop.name.getText(sourceFile);

      switch (propName) {
        case 'title':
          if (ts.isStringLiteral(prop.initializer)) {
            meta.title = prop.initializer.text;
          }
          break;

        case 'component':
          meta.component = prop.initializer.getText(sourceFile);
          break;

        case 'tags':
          if (ts.isArrayLiteralExpression(prop.initializer)) {
            meta.tags = [];
            for (const elem of prop.initializer.elements) {
              if (ts.isStringLiteral(elem)) {
                meta.tags.push(elem.text);
              }
            }
          }
          break;

        case 'argTypes':
          if (ts.isObjectLiteralExpression(prop.initializer)) {
            meta.argTypes = this.parseArgTypes(prop.initializer, sourceFile);
          }
          break;

        case 'decorators':
          meta.hasDecorators = true;
          break;

        case 'parameters':
          meta.hasParameters = true;
          // Extract docs.description.component if present
          if (ts.isObjectLiteralExpression(prop.initializer)) {
            const docsDesc = this.extractDocsDescription(prop.initializer, sourceFile);
            if (docsDesc) {
              meta.docsDescription = docsDesc;
            }
          }
          break;

        case 'subcomponents':
          if (ts.isObjectLiteralExpression(prop.initializer)) {
            meta.subcomponents = [];
            for (const subProp of prop.initializer.properties) {
              if (ts.isPropertyAssignment(subProp) || ts.isShorthandPropertyAssignment(subProp)) {
                if (subProp.name) {
                  meta.subcomponents.push(subProp.name.getText(sourceFile));
                }
              }
            }
          }
          break;

        case 'loaders':
          meta.hasLoaders = true;
          break;

        case 'beforeEach':
          meta.hasBeforeEach = true;
          break;
      }
    }

    // Allow meta without title (for auto-title)
    return meta.title || meta.component ? meta : null;
  }

  /**
   * Extract docs.description.component from parameters
   */
  private extractDocsDescription(parametersNode: ts.ObjectLiteralExpression, sourceFile: ts.SourceFile): string | undefined {
    for (const prop of parametersNode.properties) {
      if (!ts.isPropertyAssignment(prop) || !prop.name) continue;

      const propName = prop.name.getText(sourceFile);
      if (propName === 'docs' && ts.isObjectLiteralExpression(prop.initializer)) {
        for (const docsProp of prop.initializer.properties) {
          if (!ts.isPropertyAssignment(docsProp) || !docsProp.name) continue;

          const docsName = docsProp.name.getText(sourceFile);
          if (docsName === 'description' && ts.isObjectLiteralExpression(docsProp.initializer)) {
            for (const descProp of docsProp.initializer.properties) {
              if (!ts.isPropertyAssignment(descProp) || !descProp.name) continue;

              const descName = descProp.name.getText(sourceFile);
              if (descName === 'component' && ts.isStringLiteral(descProp.initializer)) {
                return descProp.initializer.text;
              }
            }
          }
        }
      }
    }
    return undefined;
  }

  /**
   * Extract docs.description.story from story-level parameters
   */
  private extractStoryDescription(parametersNode: ts.ObjectLiteralExpression, sourceFile: ts.SourceFile): string | undefined {
    for (const prop of parametersNode.properties) {
      if (!ts.isPropertyAssignment(prop) || !prop.name) continue;

      const propName = prop.name.getText(sourceFile);
      if (propName === 'docs' && ts.isObjectLiteralExpression(prop.initializer)) {
        for (const docsProp of prop.initializer.properties) {
          if (!ts.isPropertyAssignment(docsProp) || !docsProp.name) continue;

          const docsName = docsProp.name.getText(sourceFile);
          if (docsName === 'description' && ts.isObjectLiteralExpression(docsProp.initializer)) {
            for (const descProp of docsProp.initializer.properties) {
              if (!ts.isPropertyAssignment(descProp) || !descProp.name) continue;

              const descName = descProp.name.getText(sourceFile);
              if (descName === 'story') {
                // Handle string literal
                if (ts.isStringLiteral(descProp.initializer)) {
                  return descProp.initializer.text;
                }
                // Handle template literal
                if (ts.isNoSubstitutionTemplateLiteral(descProp.initializer)) {
                  return descProp.initializer.text;
                }
                // Handle template string with backticks
                if (ts.isTemplateExpression(descProp.initializer)) {
                  // For complex template strings, get the raw text
                  return descProp.initializer.getText(sourceFile).slice(1, -1);
                }
              }
            }
          }
        }
      }
    }
    return undefined;
  }

  private parseArgTypes(node: ts.ObjectLiteralExpression, sourceFile: ts.SourceFile): Record<string, ArgTypeInfo> {
    const argTypes: Record<string, ArgTypeInfo> = {};

    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop) || !prop.name) continue;

      const argName = prop.name.getText(sourceFile);
      const argInfo: ArgTypeInfo = {};

      if (ts.isObjectLiteralExpression(prop.initializer)) {
        for (const argProp of prop.initializer.properties) {
          if (!ts.isPropertyAssignment(argProp) || !argProp.name) continue;

          const argPropName = argProp.name.getText(sourceFile);

          if (argPropName === 'control') {
            if (ts.isStringLiteral(argProp.initializer)) {
              argInfo.control = argProp.initializer.text;
            } else if (ts.isObjectLiteralExpression(argProp.initializer)) {
              for (const ctrlProp of argProp.initializer.properties) {
                if (ts.isPropertyAssignment(ctrlProp) && ctrlProp.name?.getText(sourceFile) === 'type') {
                  if (ts.isStringLiteral(ctrlProp.initializer)) {
                    argInfo.control = { type: ctrlProp.initializer.text };
                  }
                }
              }
            }
          }

          if (argPropName === 'options' && ts.isArrayLiteralExpression(argProp.initializer)) {
            argInfo.options = [];
            for (const opt of argProp.initializer.elements) {
              if (ts.isStringLiteral(opt)) {
                argInfo.options.push(opt.text);
              }
            }
          }
        }
      }

      argTypes[argName] = argInfo;
    }

    return argTypes;
  }

  private extractStoryVariants(sourceFile: ts.SourceFile): StoryVariant[] {
    const variants: StoryVariant[] = [];
    const templateBindings = new Map<string, string>(); // Template name -> Story export name
    const storyNameOverrides = new Map<string, string>(); // export name -> storyName override

    const visit = (node: ts.Node) => {
      // CSF3: export const Primary: Story = { ... }
      // CSF3: export const Primary = { args: { ... } }
      // CSF1: export const Primary = () => <Component />
      if (ts.isVariableStatement(node)) {
        const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
        if (!isExported) {
          ts.forEachChild(node, visit);
          return;
        }

        for (const decl of node.declarationList.declarations) {
          if (!ts.isIdentifier(decl.name)) continue;

          const name = decl.name.getText(sourceFile);

          // Skip 'default' export and 'meta' variable
          if (name === 'default' || name === 'meta') continue;

          // Check if it looks like a story (uppercase first letter, has object initializer or is a template)
          if (!/^[A-Z]/.test(name)) continue;

          const variant = this.parseStoryVariant(name, decl.initializer, sourceFile);
          if (variant) {
            variants.push(variant);
          }

          // Check for Template.bind() pattern (CSF2)
          if (decl.initializer && ts.isCallExpression(decl.initializer)) {
            const callExpr = decl.initializer;
            if (ts.isPropertyAccessExpression(callExpr.expression)) {
              const method = callExpr.expression.name.getText(sourceFile);
              if (method === 'bind') {
                const templateName = callExpr.expression.expression.getText(sourceFile);
                templateBindings.set(name, templateName);
                if (!variant) {
                  variants.push({ name });
                }
              }
            }
          }
        }
      }

      // Handle named re-exports: export { ButtonBasic as Basic } from 'source'
      if (ts.isExportDeclaration(node)) {
        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          for (const element of node.exportClause.elements) {
            const exportName = element.name.getText(sourceFile);
            // Use the exported name (alias) as the variant name
            if (/^[A-Z]/.test(exportName)) {
              variants.push({ name: exportName });
            }
          }
        }
      }

      // Look for story.args = { ... }, story.play = async () => { ... }, or story.storyName = '...'
      if (ts.isExpressionStatement(node)) {
        const expr = node.expression;
        if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
          if (ts.isPropertyAccessExpression(expr.left)) {
            const storyName = expr.left.expression.getText(sourceFile);
            const propName = expr.left.name.getText(sourceFile);

            const existingVariant = variants.find(v => v.name === storyName);
            if (existingVariant) {
              if (propName === 'play') {
                existingVariant.hasPlayFunction = true;
              }
              if (propName === 'args' && ts.isObjectLiteralExpression(expr.right)) {
                existingVariant.args = this.parseArgsObject(expr.right, sourceFile);
              }
              // Handle storyName override: Story.storyName = 'Custom Name'
              if (propName === 'storyName' && ts.isStringLiteral(expr.right)) {
                storyNameOverrides.set(storyName, expr.right.text);
              }
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);

    // Apply storyName overrides
    for (const variant of variants) {
      const override = storyNameOverrides.get(variant.name);
      if (override) {
        variant.name = override;
      }
    }

    return variants;
  }

  private parseStoryVariant(name: string, initializer: ts.Expression | undefined, sourceFile: ts.SourceFile): StoryVariant | null {
    if (!initializer) return null;

    const variant: StoryVariant = { name };

    // Handle type assertions and satisfies
    let expr = initializer;
    if (ts.isAsExpression(expr)) {
      expr = expr.expression;
    }
    if (ts.isSatisfiesExpression(expr)) {
      expr = expr.expression;
    }

    if (ts.isObjectLiteralExpression(expr)) {
      for (const prop of expr.properties) {
        if (!ts.isPropertyAssignment(prop) && !ts.isMethodDeclaration(prop)) continue;
        if (!prop.name) continue;

        const propName = prop.name.getText(sourceFile);

        if (propName === 'play') {
          variant.hasPlayFunction = true;
        }

        if (propName === 'render') {
          variant.hasRenderFunction = true;
        }

        if (propName === 'args' && ts.isPropertyAssignment(prop) && ts.isObjectLiteralExpression(prop.initializer)) {
          variant.args = this.parseArgsObject(prop.initializer, sourceFile);
        }

        if (propName === 'tags' && ts.isPropertyAssignment(prop) && ts.isArrayLiteralExpression(prop.initializer)) {
          variant.tags = [];
          for (const elem of prop.initializer.elements) {
            if (ts.isStringLiteral(elem)) {
              variant.tags.push(elem.text);
            }
          }
        }

        if (propName === 'beforeEach') {
          variant.hasBeforeEach = true;
        }

        // Extract story-level description from parameters.docs.description.story
        if (propName === 'parameters' && ts.isPropertyAssignment(prop) && ts.isObjectLiteralExpression(prop.initializer)) {
          const storyDesc = this.extractStoryDescription(prop.initializer, sourceFile);
          if (storyDesc) {
            variant.description = storyDesc;
          }
        }
      }

      return variant;
    }

    // Arrow function or function expression - could be CSF1 story or CSF2 template
    // CSF1 stories are exported directly, templates are typically not exported
    // Since we only get here for exported functions, treat them as CSF1 stories
    if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
      // This is a CSF1 arrow function story: export const Story = () => <Component />
      // or a CSF2 story with globals access: export const Story: StoryFn = (args, { globals }) => ...
      return variant;
    }

    return variant;
  }

  private parseArgsObject(node: ts.ObjectLiteralExpression, sourceFile: ts.SourceFile): Record<string, unknown> {
    const args: Record<string, unknown> = {};

    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) continue;
      if (!prop.name) continue;

      const propName = prop.name.getText(sourceFile);

      if (ts.isPropertyAssignment(prop)) {
        args[propName] = this.getLiteralValue(prop.initializer, sourceFile);
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        args[propName] = propName; // Use the name as placeholder
      }
    }

    return args;
  }

  private getLiteralValue(node: ts.Expression, sourceFile: ts.SourceFile): unknown {
    if (ts.isStringLiteral(node)) {
      return node.text;
    }
    if (ts.isNumericLiteral(node)) {
      return parseFloat(node.text);
    }
    if (node.kind === ts.SyntaxKind.TrueKeyword) {
      return true;
    }
    if (node.kind === ts.SyntaxKind.FalseKeyword) {
      return false;
    }
    if (node.kind === ts.SyntaxKind.NullKeyword) {
      return null;
    }
    // For complex values, return the text representation
    return node.getText(sourceFile);
  }

  private extractPropsFromArgTypes(argTypes?: Record<string, ArgTypeInfo>): PropDefinition[] {
    if (!argTypes) return [];

    return Object.entries(argTypes).map(([name, info]) => {
      let type = 'unknown';

      if (info.control) {
        if (typeof info.control === 'string') {
          type = info.control;
        } else if (typeof info.control === 'object' && info.control.type) {
          type = info.control.type;
        }
      }

      if (info.options && info.options.length > 0) {
        type = info.options.map(o => `'${o}'`).join(' | ');
      }

      return {
        name,
        type,
        required: false, // argTypes don't indicate required, so default to false
      };
    });
  }

  private getComponentNameFromTitle(title: string): string {
    const parts = title.split('/');
    return parts[parts.length - 1]?.trim() || title;
  }

  private createStoryId(title: string, storyName: string): string {
    const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const normalizedName = storyName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `${normalizedTitle}--${normalizedName}`;
  }
}

/**
 * Scans Storybook static builds (index.json/stories.json) or running servers.
 * Use StoryFileScanner for scanning .stories.* source files directly.
 */
export class StorybookScanner extends Scanner<Component, StorybookScannerConfig> {
  async scan(): Promise<ScanResult<Component>> {
    const startTime = Date.now();
    const components: Component[] = [];
    const errors: ScanError[] = [];

    try {
      const index = await this.fetchStoriesIndex();
      const extractedComponents = this.extractComponents(index);
      components.push(...extractedComponents);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({
        message,
        code: 'STORYBOOK_INDEX_ERROR',
      });
    }

    const stats: ScanStats = {
      filesScanned: 1,
      itemsFound: components.length,
      duration: Date.now() - startTime,
    };

    return { items: components, errors, stats };
  }

  getSourceType(): string {
    return 'storybook';
  }

  private getFetchOptions(): RequestInit {
    if (!this.config.authToken) {
      return {};
    }

    const headerName = this.config.authHeader || 'Authorization';
    const headerValue = headerName === 'Authorization'
      ? `Bearer ${this.config.authToken}`
      : this.config.authToken;

    return {
      headers: {
        [headerName]: headerValue,
      },
    };
  }

  private async fetchStoriesIndex(): Promise<StorybookIndex> {
    // Try to read from static directory first
    if (this.config.staticDir) {
      const indexPath = resolve(this.config.staticDir, 'index.json');
      if (existsSync(indexPath)) {
        const content = await readFile(indexPath, 'utf-8');
        return JSON.parse(content);
      }

      // Try stories.json for older Storybook versions
      const storiesPath = resolve(this.config.staticDir, 'stories.json');
      if (existsSync(storiesPath)) {
        const content = await readFile(storiesPath, 'utf-8');
        return this.convertLegacyFormat(JSON.parse(content));
      }

      throw new Error(`No index.json or stories.json found in ${this.config.staticDir}`);
    }

    // Fetch from running Storybook server
    if (this.config.url) {
      const fetchOptions = this.getFetchOptions();

      // Try index.json (Storybook 7+)
      try {
        const response = await fetch(`${this.config.url}/index.json`, fetchOptions);
        if (response.ok) {
          return response.json() as Promise<StorybookIndex>;
        }
      } catch {
        // Try stories.json fallback
      }

      // Try stories.json (older versions)
      const response = await fetch(`${this.config.url}/stories.json`, fetchOptions);
      if (!response.ok) {
        throw new Error(`Failed to fetch Storybook index: ${response.status}`);
      }

      const data = (await response.json()) as { stories: Record<string, unknown> };
      return this.convertLegacyFormat(data);
    }

    throw new Error('Either url or staticDir must be configured for Storybook scanner');
  }

  private convertLegacyFormat(data: { stories: Record<string, unknown> }): StorybookIndex {
    const entries: Record<string, StorybookEntry> = {};

    for (const [id, story] of Object.entries(data.stories)) {
      const storyData = story as { title?: string; name?: string; importPath?: string; kind?: string; story?: string };
      entries[id] = {
        id,
        title: storyData.title || storyData.kind || 'Unknown',
        name: storyData.name || storyData.story || 'Default',
        importPath: storyData.importPath || '',
        type: 'story',
      };
    }

    return { v: 3, entries };
  }

  private extractComponents(index: StorybookIndex): Component[] {
    const componentMap = new Map<string, Component>();

    for (const [, entry] of Object.entries(index.entries)) {
      // Skip docs entries
      if (entry.type === 'docs') continue;

      // Extract component ID from title (e.g., "Components/Button" -> "components-button")
      const componentId = entry.title.replace(/\//g, '-').toLowerCase();

      if (!componentMap.has(componentId)) {
        const source: StorybookSource = {
          type: 'storybook',
          storyId: entry.id,
          kind: entry.title,
          url: this.getStorybookUrl(entry.id),
        };

        // Extract component name from title
        const titleParts = entry.title.split('/');
        const name = titleParts[titleParts.length - 1] ?? entry.title;

        // Build tags from entry tags, and add componentPath if available (v5+)
        const tags = [...(entry.tags || [])];
        if (entry.componentPath) {
          tags.push(`storybook-componentPath:${entry.componentPath}`);
        }

        componentMap.set(componentId, {
          id: createComponentId(source, name),
          name: name,
          source,
          props: [],
          variants: [],
          tokens: [],
          dependencies: [],
          metadata: {
            tags,
          },
          scannedAt: new Date(),
        });
      }

      // Add story as a variant
      const component = componentMap.get(componentId)!;
      component.variants.push({
        name: entry.name,
        props: {},
      });
    }

    return Array.from(componentMap.values());
  }

  private getStorybookUrl(storyId: string): string {
    const baseUrl = this.config.url || '';
    return `${baseUrl}/?path=/story/${storyId}`;
  }
}
