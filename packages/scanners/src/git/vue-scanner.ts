import { Scanner, ScanResult, ScannerConfig, ScanError, ScanStats } from '../base/scanner.js';
import type { Component, PropDefinition, VueSource } from '@buoy/core';
import { createComponentId } from '@buoy/core';
import { glob } from 'glob';
import { readFile } from 'fs/promises';
import { relative, basename } from 'path';

export interface VueScannerConfig extends ScannerConfig {
  designSystemPackage?: string;
}

export class VueComponentScanner extends Scanner<Component, VueScannerConfig> {
  async scan(): Promise<ScanResult<Component>> {
    const startTime = Date.now();
    const files = await this.findComponentFiles();
    const components: Component[] = [];
    const errors: ScanError[] = [];

    for (const file of files) {
      try {
        const parsed = await this.parseFile(file);
        if (parsed) components.push(parsed);
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
    return 'vue';
  }

  private async findComponentFiles(): Promise<string[]> {
    const patterns = this.config.include || ['**/*.vue'];
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

    return [...new Set(allFiles)];
  }

  private async parseFile(filePath: string): Promise<Component | null> {
    const content = await readFile(filePath, 'utf-8');
    const relativePath = relative(this.config.projectRoot, filePath);

    // Extract component name from filename (e.g., MyButton.vue -> MyButton)
    const name = basename(filePath, '.vue');

    // Only process PascalCase component names
    if (!/^[A-Z]/.test(name)) return null;

    // Extract script content
    const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    const scriptSetupMatch = content.match(/<script\s+setup[^>]*>([\s\S]*?)<\/script>/);

    const scriptContent = scriptSetupMatch?.[1] || scriptMatch?.[1] || '';

    const props = this.extractProps(scriptContent, !!scriptSetupMatch);
    const dependencies = this.extractDependencies(content);

    const source: VueSource = {
      type: 'vue',
      path: relativePath,
      exportName: name,
      line: 1,
    };

    return {
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
      },
      scannedAt: new Date(),
    };
  }

  /**
   * Extract matched content with proper brace balancing.
   * Handles nested braces like: { cb: () => { value: string } }
   */
  private extractBalancedBraces(content: string, startIndex: number): string | null {
    if (content[startIndex] !== '{') return null;

    let depth = 0;
    let i = startIndex;

    while (i < content.length) {
      const char = content[i];
      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          // Return content between braces (excluding the braces themselves)
          return content.substring(startIndex + 1, i);
        }
      }
      i++;
    }

    return null; // Unbalanced braces
  }

  /**
   * Parse TypeScript props string into individual prop definitions.
   * Handles complex types like: { cb: () => void, data: { nested: string } }
   */
  private parseTypeProps(propsContent: string): PropDefinition[] {
    const props: PropDefinition[] = [];
    let i = 0;

    while (i < propsContent.length) {
      // Skip whitespace
      while (i < propsContent.length && /\s/.test(propsContent[i] ?? '')) i++;
      if (i >= propsContent.length) break;

      // Match prop name
      const nameMatch = propsContent.substring(i).match(/^(\w+)(\?)?:\s*/);
      if (!nameMatch || !nameMatch[1]) {
        // Skip to next comma or end
        while (i < propsContent.length && propsContent[i] !== ',') i++;
        i++; // skip comma
        continue;
      }

      const propName = nameMatch[1];
      const isOptional = !!nameMatch[2];
      i += nameMatch[0].length;

      // Now extract the type - need to handle nested braces, parens, and generics
      let typeStr = '';
      let depth = 0;
      const depthChars: Record<string, number> = { '{': 1, '}': -1, '(': 1, ')': -1, '<': 1, '>': -1 };

      while (i < propsContent.length) {
        const char = propsContent[i];
        if (char === undefined) break;

        if (char in depthChars) {
          depth += depthChars[char] ?? 0;
        }

        // Stop at comma or semicolon only when not nested
        if (depth === 0 && (char === ',' || char === ';')) {
          i++; // skip the delimiter
          break;
        }

        typeStr += char;
        i++;
      }

      typeStr = typeStr.trim();
      if (propName && typeStr) {
        props.push({
          name: propName,
          type: typeStr,
          required: !isOptional,
        });
      }
    }

    return props;
  }

  private extractProps(scriptContent: string, isSetup: boolean): PropDefinition[] {
    const props: PropDefinition[] = [];

    if (isSetup) {
      // Vue 3 <script setup> with defineProps
      // defineProps<{ title: string, count?: number }>()
      // Need to handle nested types like: defineProps<{ cb: () => { value: string } }>()
      const typePropsStartMatch = scriptContent.match(/defineProps<\{/);
      if (typePropsStartMatch) {
        const startIdx = scriptContent.indexOf('defineProps<{') + 'defineProps<'.length;
        const propsContent = this.extractBalancedBraces(scriptContent, startIdx);
        if (propsContent) {
          const parsedProps = this.parseTypeProps(propsContent);
          props.push(...parsedProps);
        }
      }

      // defineProps({ title: String, count: { type: Number, required: false } })
      if (props.length === 0) {
        const objPropsStartMatch = scriptContent.match(/defineProps\(\{/);
        if (objPropsStartMatch) {
          const startIdx = scriptContent.indexOf('defineProps({') + 'defineProps('.length;
          const propsContent = this.extractBalancedBraces(scriptContent, startIdx);
          if (propsContent) {
            this.parseObjectProps(propsContent, props);
          }
        }
      }

      // defineProps(['title', 'count'])
      const arrayPropsMatch = scriptContent.match(/defineProps\(\[([^\]]+)\]\)/);
      if (arrayPropsMatch && arrayPropsMatch[1] && props.length === 0) {
        const propNames = arrayPropsMatch[1].match(/['"](\w+)['"]/g);
        if (propNames) {
          for (const p of propNames) {
            props.push({
              name: p.replace(/['"]/g, ''),
              type: 'unknown',
              required: false,
            });
          }
        }
      }
    } else {
      // Options API: props: { ... } or props: [...]
      const propsObjStartMatch = scriptContent.match(/props:\s*\{/);
      if (propsObjStartMatch && propsObjStartMatch.index !== undefined) {
        const braceIdx = scriptContent.indexOf('{', propsObjStartMatch.index);
        const propsContent = this.extractBalancedBraces(scriptContent, braceIdx);
        if (propsContent) {
          this.parseObjectProps(propsContent, props);
        }
      }

      const propsArrayMatch = scriptContent.match(/props:\s*\[([^\]]+)\]/);
      if (propsArrayMatch && propsArrayMatch[1] && props.length === 0) {
        const propNames = propsArrayMatch[1].match(/['"](\w+)['"]/g);
        if (propNames) {
          for (const p of propNames) {
            props.push({
              name: p.replace(/['"]/g, ''),
              type: 'unknown',
              required: false,
            });
          }
        }
      }
    }

    return props;
  }

  private parseObjectProps(propsStr: string, props: PropDefinition[]): void {
    // Match: propName: Type or propName: { type: Type, required: true }
    const simpleMatch = propsStr.matchAll(/(\w+):\s*(String|Number|Boolean|Array|Object|Function)/g);
    for (const m of simpleMatch) {
      if (m[1] && m[2]) {
        props.push({
          name: m[1],
          type: m[2].toLowerCase(),
          required: false,
        });
      }
    }

    // Match complex props: propName: { type: Type, required: true/false }
    const complexMatch = propsStr.matchAll(/(\w+):\s*\{[^}]*type:\s*(\w+)[^}]*\}/g);
    for (const m of complexMatch) {
      if (m[1] && m[2]) {
        const isRequired = propsStr.includes(`${m[1]}:`) &&
          propsStr.substring(propsStr.indexOf(`${m[1]}:`)).match(/required:\s*true/);

        // Avoid duplicates
        if (!props.some(p => p.name === m[1])) {
          props.push({
            name: m[1],
            type: m[2].toLowerCase(),
            required: !!isRequired,
          });
        }
      }
    }
  }

  private extractDependencies(content: string): string[] {
    const deps: Set<string> = new Set();

    // Find component usage in template: <ComponentName or <component-name
    const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/);
    if (templateMatch && templateMatch[1]) {
      const template = templateMatch[1];

      // PascalCase components
      const pascalMatches = template.matchAll(/<([A-Z][a-zA-Z0-9]+)/g);
      for (const m of pascalMatches) {
        if (m[1]) deps.add(m[1]);
      }

      // kebab-case components (convert to PascalCase)
      const kebabMatches = template.matchAll(/<([a-z]+-[a-z0-9-]+)/g);
      for (const m of kebabMatches) {
        if (m[1]) {
          const pascal = m[1].split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
          deps.add(pascal);
        }
      }
    }

    return Array.from(deps);
  }

  private hasDeprecatedComment(content: string): boolean {
    return content.includes('@deprecated') || content.includes('* @deprecated');
  }
}
