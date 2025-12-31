import { Scanner, ScanResult, ScannerConfig, ScanError, ScanStats } from '../base/scanner.js';
import type { Component } from '@buoy-design/core';
import { createComponentId } from '@buoy-design/core';
import { glob } from 'glob';
import { readFileSync } from 'fs';
import { relative, basename } from 'path';

export type TemplateType = 'blade' | 'erb' | 'twig' | 'php' | 'html' | 'njk' | 'razor' | 'hbs' | 'mustache' | 'ejs' | 'pug' | 'liquid' | 'slim' | 'haml' | 'jinja' | 'django' | 'thymeleaf' | 'freemarker' | 'go-template' | 'astro' | 'markdown' | 'mdx';

export interface TemplateScannerConfig extends ScannerConfig {
  templateType: TemplateType;
}

interface TemplateSource {
  type: TemplateType;
  path: string;
  exportName: string;
  line: number;
}

// Map template types to file extensions and patterns
const TEMPLATE_CONFIG: Record<string, { ext: string; patterns: RegExp[] }> = {
  blade: {
    ext: 'blade.php',
    patterns: [
      /@component\(['"]([^'"]+)['"]/g,           // @component('name')
      /@include\(['"]([^'"]+)['"]/g,             // @include('name')
      /<x-([a-z0-9-:.]+)/gi,                     // <x-component-name>
      /@livewire\(['"]([^'"]+)['"]/g,            // @livewire('name')
    ],
  },
  erb: {
    ext: 'html.erb',
    patterns: [
      /render\s+partial:\s*['"]([^'"]+)['"]/g,   // render partial: 'name'
      /render\s*\(\s*['"]([^'"]+)['"]/g,         // render('name') or render 'name'
      /render\s+['"]([^'"]+)['"]/g,              // render 'name'
    ],
  },
  twig: {
    ext: 'html.twig',
    patterns: [
      /\{%\s*include\s+['"]([^'"]+)['"]/g,       // {% include 'name' %}
      /\{%\s*embed\s+['"]([^'"]+)['"]/g,         // {% embed 'name' %}
      /\{%\s*extends\s+['"]([^'"]+)['"]/g,       // {% extends 'name' %}
      /\{\{\s*include\(['"]([^'"]+)['"]/g,       // {{ include('name') }}
    ],
  },
  php: {
    ext: 'php',
    patterns: [
      /include\s*\(\s*['"]([^'"]+)['"]/g,        // include('file.php')
      /include_once\s*\(\s*['"]([^'"]+)['"]/g,   // include_once('file.php')
      /require\s*\(\s*['"]([^'"]+)['"]/g,        // require('file.php')
      /require_once\s*\(\s*['"]([^'"]+)['"]/g,   // require_once('file.php')
    ],
  },
  html: {
    ext: 'html',
    patterns: [
      /\{\{\s*template\s+['"]([^'"]+)['"]/g,     // {{ template "name" }} (Go)
      /\{\{\s*partial\s+['"]([^'"]+)['"]/g,      // {{ partial "name" }} (Hugo)
      /\{%\s*include\s+['"]([^'"]+)['"]/g,       // {% include 'name' %} (Jekyll/Liquid)
    ],
  },
  njk: {
    ext: 'njk',
    patterns: [
      /\{%\s*include\s+['"]([^'"]+)['"]/g,       // {% include 'name' %}
      /\{%\s*extends\s+['"]([^'"]+)['"]/g,       // {% extends 'name' %}
      /\{%\s*macro\s+(\w+)/g,                    // {% macro name() %}
    ],
  },
  razor: {
    ext: 'cshtml',
    patterns: [
      /@Html\.Partial\(['"]([^'"]+)['"]/g,       // @Html.Partial("_PartialView")
      /@await Html\.PartialAsync\(['"]([^'"]+)['"]/g, // @await Html.PartialAsync("_PartialView")
      /<partial\s+name=['"]([^'"]+)['"]/gi,      // <partial name="_PartialView" />
      /@await Component\.InvokeAsync\(['"]([^'"]+)['"]/g, // @await Component.InvokeAsync("ComponentName")
      /@\{?\s*Layout\s*=\s*['"]([^'"]+)['"]/g,   // Layout = "_Layout"
      /@section\s+(\w+)/g,                       // @section SectionName
    ],
  },
  hbs: {
    ext: 'hbs',
    patterns: [
      /\{\{>\s*([^\s}]+)/g,                      // {{> partialName}}
      /\{\{#>\s*([^\s}]+)/g,                     // {{#> partialBlock}}
      /\{\{partial\s+['"]([^'"]+)['"]/g,         // {{partial "name"}}
    ],
  },
  ejs: {
    ext: 'ejs',
    patterns: [
      /<%[-_]?\s*include\s*\(\s*['"]([^'"]+)['"]/g, // <%- include('partial') %>
      /<%[-_]?\s*include\s+['"]([^'"]+)['"]/g,     // <% include 'partial' %>
    ],
  },
  pug: {
    ext: 'pug',
    patterns: [
      /include\s+([^\s\n]+)/g,                   // include partialFile
      /extends\s+([^\s\n]+)/g,                   // extends layoutFile
      /mixin\s+(\w+)/g,                          // mixin mixinName
      /\+(\w+)/g,                                // +mixinCall
      /block\s+(\w+)/g,                          // block blockName
    ],
  },
  liquid: {
    ext: 'liquid',
    patterns: [
      /\{%\s*include\s+['"]?([^'"%\s]+)/g,       // {% include 'snippet' %}
      /\{%\s*render\s+['"]?([^'"%\s]+)/g,        // {% render 'snippet' %}
      /\{%\s*section\s+['"]?([^'"%\s]+)/g,       // {% section 'section-name' %}
      /\{%\s*layout\s+['"]?([^'"%\s]+)/g,        // {% layout 'theme' %}
    ],
  },
  slim: {
    ext: 'slim',
    patterns: [
      /=\s*render\s+['"]([^'"]+)['"]/g,          // = render 'partial'
      /=\s*render\s+partial:\s*['"]([^'"]+)['"]/g, // = render partial: 'partial'
    ],
  },
  haml: {
    ext: 'haml',
    patterns: [
      /=\s*render\s+['"]([^'"]+)['"]/g,          // = render 'partial'
      /=\s*render\s+partial:\s*['"]([^'"]+)['"]/g, // = render partial: 'partial'
    ],
  },
  mustache: {
    ext: 'mustache',
    patterns: [
      /\{\{>\s*([^\s}]+)/g,                      // {{> partialName}}
      /\{\{<\s*([^\s}]+)/g,                      // {{< parentName}}
    ],
  },
  jinja: {
    ext: 'jinja2',
    patterns: [
      /\{%\s*include\s+['"]([^'"]+)['"]/g,       // {% include 'name' %}
      /\{%\s*extends\s+['"]([^'"]+)['"]/g,       // {% extends 'name' %}
      /\{%\s*import\s+['"]([^'"]+)['"]/g,        // {% import 'name' %}
      /\{%\s*from\s+['"]([^'"]+)['"]/g,          // {% from 'name' import ... %}
      /\{%\s*macro\s+(\w+)/g,                    // {% macro name() %}
    ],
  },
  django: {
    ext: 'html',
    patterns: [
      /\{%\s*include\s+['"]([^'"]+)['"]/g,       // {% include 'name' %}
      /\{%\s*extends\s+['"]([^'"]+)['"]/g,       // {% extends 'name' %}
      /\{%\s*block\s+(\w+)/g,                    // {% block name %}
    ],
  },
  thymeleaf: {
    ext: 'html',
    patterns: [
      /th:replace=['"]([^'"]+)['"]/g,            // th:replace="fragments/header"
      /th:insert=['"]([^'"]+)['"]/g,             // th:insert="fragments/header"
      /th:include=['"]([^'"]+)['"]/g,            // th:include="fragments/header"
      /th:fragment=['"]([^'"]+)['"]/g,           // th:fragment="header"
      /layout:decorate=['"]([^'"]+)['"]/g,       // layout:decorate="~{layouts/main}"
    ],
  },
  freemarker: {
    ext: 'ftl',
    patterns: [
      /<#include\s+['"]([^'"]+)['"]/g,           // <#include "header.ftl">
      /<#import\s+['"]([^'"]+)['"]/g,            // <#import "lib.ftl" as lib>
      /<#macro\s+(\w+)/g,                        // <#macro name>
      /<@(\w+)/g,                                // <@macroName>
    ],
  },
  'go-template': {
    ext: 'tmpl',
    patterns: [
      /\{\{\s*template\s+['"]([^'"]+)['"]/g,     // {{ template "name" }}
      /\{\{\s*block\s+['"]([^'"]+)['"]/g,        // {{ block "name" }}
      /\{\{\s*define\s+['"]([^'"]+)['"]/g,       // {{ define "name" }}
    ],
  },
  astro: {
    ext: 'astro',
    patterns: [
      /import\s+(\w+)\s+from\s+['"][^'"]+\.astro['"]/g, // import Component from './Component.astro'
      /<([A-Z]\w+)/g,                            // <ComponentName
      /Astro\.slots/g,                           // Astro.slots
    ],
  },
  markdown: {
    ext: 'md',
    patterns: [
      /\[([^\]]+)\]\(([^)]+)\)/g,                // [text](link)
      /^#{1,6}\s+(.+)/gm,                        // # Heading
    ],
  },
  mdx: {
    ext: 'mdx',
    patterns: [
      /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g, // import Component from './Component'
      /<([A-Z]\w+)/g,                            // <ComponentName
      /export\s+(const|function|default)/g,     // export const/function/default
    ],
  },
};

export class TemplateScanner extends Scanner<Component, TemplateScannerConfig> {
  async scan(): Promise<ScanResult<Component>> {
    const startTime = Date.now();
    const files = await this.findTemplateFiles();
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
    return this.config.templateType;
  }

  private async findTemplateFiles(): Promise<string[]> {
    const templateConfig = TEMPLATE_CONFIG[this.config.templateType];
    const ext = templateConfig?.ext || this.config.templateType;

    const patterns = this.config.include || [`**/*.${ext}`];
    const ignore = this.config.exclude || [
      '**/node_modules/**',
      '**/vendor/**',
      '**/cache/**',
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
    const content = readFileSync(filePath, 'utf-8');
    const relativePath = relative(this.config.projectRoot, filePath);

    // Generate component name from file path
    // e.g., resources/views/components/button.blade.php -> Button
    // e.g., app/views/shared/_header.html.erb -> Header
    const name = this.extractComponentName(filePath);

    // Skip non-component files (layouts, pages, etc.)
    if (!this.isLikelyComponent(filePath, content)) {
      return null;
    }

    const dependencies = this.extractDependencies(content);

    const source: TemplateSource = {
      type: this.config.templateType,
      path: relativePath,
      exportName: name,
      line: 1,
    };

    return {
      id: createComponentId(source as any, name),
      name,
      source: source as any,
      props: [], // Templates don't have typed props in the same way
      variants: [],
      tokens: [],
      dependencies,
      metadata: {
        deprecated: content.includes('@deprecated') || content.includes('DEPRECATED'),
        tags: [],
      },
      scannedAt: new Date(),
    };
  }

  private extractComponentName(filePath: string): string {
    let name = basename(filePath);

    // Remove extensions
    name = name.replace(/\.(blade\.php|html\.erb|html\.twig|php|html|njk)$/i, '');

    // Remove partial prefix (Rails convention)
    name = name.replace(/^_/, '');

    // Convert to PascalCase
    name = name
      .split(/[-_.]/)
      .map(s => s.charAt(0).toUpperCase() + s.slice(1))
      .join('');

    return name;
  }

  private isLikelyComponent(filePath: string, _content: string): boolean {
    const lowerPath = filePath.toLowerCase();
    const pathParts = lowerPath.split('/');

    // Paths that indicate reusable components
    const componentIndicators = [
      'component', 'components',
      'partial', 'partials',
      'shared',
      '_includes', 'includes',
      'ui',
      'atoms', 'molecules', 'organisms',
      'widgets', 'blocks', 'elements',
    ];

    // Check for component indicators in path
    if (componentIndicators.some(ci => pathParts.some(p => p.includes(ci)))) {
      return true;
    }

    // Check for partial prefix (Rails convention: _partial.html.erb)
    if (basename(filePath).startsWith('_')) {
      return true;
    }

    // Paths that indicate pages/layouts (not reusable components)
    const pageIndicators = [
      'layout', 'layouts',
      'page', 'pages',
      'views',  // ASP.NET/Rails views folder
      'areas',  // ASP.NET areas
      'email', 'mail', 'emails',
    ];

    if (pageIndicators.some(pi => pathParts.some(p => p === pi))) {
      return false;
    }

    // Default: don't include without explicit component indicators
    return false;
  }

  private extractDependencies(content: string): string[] {
    const deps: Set<string> = new Set();
    const templateConfig = TEMPLATE_CONFIG[this.config.templateType];

    if (!templateConfig) return [];

    for (const pattern of templateConfig.patterns) {
      // Reset regex lastIndex for each use
      pattern.lastIndex = 0;
      let match;

      while ((match = pattern.exec(content)) !== null) {
        if (match[1]) {
          // Extract the dependency name and convert to PascalCase
          const depPath = match[1];
          const depName = this.pathToComponentName(depPath);
          deps.add(depName);
        }
      }
    }

    return Array.from(deps);
  }

  private pathToComponentName(path: string): string {
    // Get the last part of the path
    const parts = path.split(/[\/\.]/);
    let name = parts[parts.length - 1] || parts[parts.length - 2] || path;

    // Remove partial prefix
    name = name.replace(/^_/, '');

    // Convert to PascalCase
    return name
      .split(/[-_]/)
      .map(s => s.charAt(0).toUpperCase() + s.slice(1))
      .join('');
  }
}
