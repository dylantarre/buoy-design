import { Scanner, ScanResult, ScannerConfig } from '../base/scanner.js';
import type { Component, PropDefinition } from '@buoy-design/core';
import { createComponentId } from '@buoy-design/core';
import { readFile } from 'fs/promises';
import { relative, basename } from 'path';
import {
  createScannerSignalCollector,
  type ScannerSignalCollector,
  type SignalEnrichedScanResult,
  type CollectorStats,
} from '../signals/scanner-integration.js';
import {
  createSignalAggregator,
  type SignalAggregator,
  type RawSignal,
} from '../signals/index.js';

// Template types that should always be treated as components regardless of path
// (based on file extension matching the framework)
const ALWAYS_COMPONENT_TYPES = ['astro', 'marko'];

// Template types that need content validation to confirm framework usage
// (because .tsx/.ts files could be any framework)
const NEEDS_CONTENT_VALIDATION = ['solid', 'qwik', 'lit', 'fast', 'stencil'];

// Framework-specific validation patterns
const FRAMEWORK_VALIDATION: Record<string, { patterns: RegExp[]; minMatches: number }> = {
  solid: {
    patterns: [
      /import\s+.*from\s+['"]solid-js/,                    // Solid imports
      /@jsxImportSource\s+solid-js/,                       // JSX pragma
      /createSignal|createEffect|createMemo|createResource/,
      /createStore|createMutable/,
      /import\s+.*from\s+['"]solid-js\/store/,
      /import\s+.*from\s+['"]solid-js\/web/,
    ],
    minMatches: 1,  // Need at least one solid-specific pattern
  },
  qwik: {
    patterns: [
      /import\s+.*from\s+['"]@builder\.io\/qwik/,          // Qwik imports
      /import\s+.*from\s+['"]@qwik/,                       // Qwik short imports
      /component\$/,                                        // Qwik component marker
      /useSignal|useStore|useComputed\$/,
      /useTask\$|useVisibleTask\$/,
      /routeLoader\$|routeAction\$|server\$/,
    ],
    minMatches: 1,
  },
  lit: {
    patterns: [
      /import\s+.*from\s+['"]lit/,                         // Lit imports
      /@customElement\(/,                                   // Decorator
      /extends\s+LitElement/,                               // Base class
      /html`/,                                              // Template literal
    ],
    minMatches: 2,  // Need Lit import + one of the patterns
  },
  fast: {
    patterns: [
      /import\s+.*from\s+['"]@microsoft\/fast-element/,    // FAST imports
      /@customElement\(/,
      /extends\s+FASTElement/,
    ],
    minMatches: 1,
  },
  stencil: {
    patterns: [
      /import\s+.*from\s+['"]@stencil\/core/,              // Stencil imports
      /@Component\(\s*\{/,                                  // Decorator
      /tag:\s*['"]/,                                        // Tag definition
      /@Prop\(\)/,                                          // Property decorator
      /@State\(\)/,                                         // State decorator
    ],
    minMatches: 1,
  },
};

export type TemplateType =
  // Server-side templates
  | 'blade' | 'erb' | 'twig' | 'php' | 'html' | 'njk' | 'razor' | 'hbs' | 'mustache'
  | 'ejs' | 'pug' | 'liquid' | 'slim' | 'haml' | 'jinja' | 'django' | 'thymeleaf'
  | 'freemarker' | 'go-template' | 'edge' | 'eta' | 'heex' | 'velocity' | 'xslt'
  // JS frameworks
  | 'astro' | 'solid' | 'qwik' | 'marko' | 'lit' | 'fast' | 'angular' | 'stencil'
  | 'alpine' | 'htmx'
  // Static site generators
  | 'hugo' | 'jekyll' | 'eleventy' | 'shopify'
  // Documentation
  | 'markdown' | 'mdx' | 'asciidoc'
  // Graphics
  | 'svg'
  // Data templates
  | 'yaml-template' | 'json-template';

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
      /import\s+(\w+)\s+from\s+['"][^'"]+\.(tsx|jsx|vue|svelte)['"]/g, // Framework component imports
      /<([A-Z]\w+)/g,                            // <ComponentName
      /Astro\.slots/g,                           // Astro.slots
      /Astro\.self/g,                            // Recursive component pattern
      /Astro\.props/g,                           // Props access pattern
      /client:(load|idle|visible|media|only)/g, // Island architecture directives
      /transition:(name|animate|persist)/g,      // View Transitions API
      /set:(html|text)/g,                        // Content directives
      /define:vars/g,                            // Variable passing to scripts/styles
      /<slot\s*(?:name=['"]([^'"]+)['"])?/gi,   // Named and default slots
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
      /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,       // import Component from './Component'
      /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g, // import { Component } from './Component'
      /<([A-Z]\w+)/g,                                    // <ComponentName
      /export\s+(const|function|default)/g,              // export const/function/default
      /export\s+const\s+(\w+)/g,                         // Named exports
      /^---[\s\S]*?---/m,                                // Frontmatter block
      /\{\/\*.*?\*\/\}/g,                                // JSX comments
      /<\s*Fragment\s*>/gi,                              // Fragment component
    ],
  },
  // Additional JS frameworks
  solid: {
    ext: 'tsx',
    patterns: [
      /import\s+.*from\s+['"]solid-js['"]/g,                    // Solid core imports
      /import\s+.*from\s+['"]solid-js\/store['"]/g,             // Solid store imports
      /import\s+.*from\s+['"]solid-js\/web['"]/g,               // Solid web imports
      /createSignal|createEffect|createMemo|createResource/g,    // Reactivity primitives
      /createStore|createMutable|produce|reconcile/g,            // Store primitives
      /createContext|useContext/g,                               // Context API
      /onMount|onCleanup|onError/g,                              // Lifecycle hooks
      /Show|For|Switch|Match|Index|ErrorBoundary|Suspense/g,    // Control flow components
      /Dynamic|Portal/g,                                         // Special components
      /batch|untrack|on|startTransition/g,                       // Reactive utilities
      /<([A-Z]\w+)/g,                                            // JSX components
    ],
  },
  qwik: {
    ext: 'tsx',
    patterns: [
      /import\s+.*from\s+['"]@builder\.io\/qwik['"]/g,           // Qwik core imports
      /import\s+.*from\s+['"]@builder\.io\/qwik-city['"]/g,      // Qwik City imports
      /component\$|useSignal|useStore|useComputed\$/g,            // Core reactivity
      /useTask\$|useVisibleTask\$|useResource\$/g,                // Tasks and resources
      /useNavigate|useLocation|useContent/g,                      // Qwik City hooks
      /routeLoader\$|routeAction\$|server\$/g,                    // Server functions
      /Slot|SSRStream|Resource/g,                                 // Built-in components
      /\$\s*\(/g,                                                 // Inline $ handlers
      /<([A-Z]\w+)/g,                                            // JSX components
    ],
  },
  marko: {
    ext: 'marko',
    patterns: [
      /<(\w+)\s+\.\.\./g,                        // <component ...>
      /\$\{.*\}/g,                               // ${expression}
      /<await>/g,                                // <await>
      /<if\(.*\)>/g,                             // <if(condition)>
      /<for\(.*\)>/g,                            // <for(item of items)>
      /<while\(.*\)>/g,                          // <while(condition)>
      /<macro\|([^|]+)\|/g,                      // <macro|name|>
      /<include\(['"]([^'"]+)['"]\)/g,           // <include('path')>
      /class\s+{\s*\n/g,                         // Marko class component
      /static\s+component/g,                     // Static component marker
    ],
  },
  lit: {
    ext: 'ts',
    patterns: [
      /@customElement\(['"]([^'"]+)['"]\)/g,     // @customElement('my-element')
      /html`/g,                                  // html`` template literal
      /css`/g,                                   // css`` template literal
      /LitElement/g,                             // extends LitElement
    ],
  },
  fast: {
    ext: 'ts',
    patterns: [
      /@customElement\(/g,                       // @customElement({...})
      /FASTElement/g,                            // extends FASTElement
      /html`/g,                                  // html`` template literal
    ],
  },
  // Additional server-side templates
  edge: {
    ext: 'edge',
    patterns: [
      /@include\(['"]([^'"]+)['"]\)/g,           // @include('partial')
      /@layout\(['"]([^'"]+)['"]\)/g,            // @layout('layouts/main')
      /@component\(['"]([^'"]+)['"]\)/g,         // @component('component')
      /@section\(['"]([^'"]+)['"]\)/g,           // @section('content')
    ],
  },
  eta: {
    ext: 'eta',
    patterns: [
      /<%~?\s*include\s*\(\s*['"]([^'"]+)['"]/g, // <%~ include('partial') %>
      /<%~?\s*layout\s*\(\s*['"]([^'"]+)['"]/g,  // <%~ layout('layout') %>
    ],
  },
  heex: {
    ext: 'heex',
    patterns: [
      /<\.(\w+)/g,                               // <.component_name>
      /<([A-Z]\w+\.\w+)/g,                       // <Module.Component>
      /<:(\w+)/g,                                // <:slot_name>
    ],
  },
  velocity: {
    ext: 'vm',
    patterns: [
      /#parse\s*\(\s*['"]([^'"]+)['"]\s*\)/g,    // #parse("header.vm")
      /#include\s*\(\s*['"]([^'"]+)['"]\s*\)/g,  // #include("file.vm")
      /#macro\s*\(\s*(\w+)/g,                    // #macro(name)
    ],
  },
  xslt: {
    ext: 'xsl',
    patterns: [
      /<xsl:include\s+href=['"]([^'"]+)['"]/g,   // <xsl:include href="file.xsl">
      /<xsl:import\s+href=['"]([^'"]+)['"]/g,    // <xsl:import href="file.xsl">
      /<xsl:template\s+name=['"]([^'"]+)['"]/g,  // <xsl:template name="name">
      /<xsl:call-template\s+name=['"]([^'"]+)['"]/g, // <xsl:call-template name="name">
    ],
  },
  // Static site generators
  hugo: {
    ext: 'html',
    patterns: [
      /\{\{\s*partial\s+['"]([^'"]+)['"]/g,      // {{ partial "header" }}
      /\{\{\s*template\s+['"]([^'"]+)['"]/g,     // {{ template "name" }}
      /\{\{\s*block\s+['"]([^'"]+)['"]/g,        // {{ block "main" }}
      /\{\{\s*define\s+['"]([^'"]+)['"]/g,       // {{ define "name" }}
    ],
  },
  jekyll: {
    ext: 'html',
    patterns: [
      /\{%\s*include\s+([^\s%]+)/g,              // {% include header.html %}
      /layout:\s*(\w+)/g,                        // layout: default
    ],
  },
  eleventy: {
    ext: 'njk',
    patterns: [
      /\{%\s*include\s+['"]([^'"]+)['"]/g,       // {% include 'partial.njk' %}
      /\{%\s*extends\s+['"]([^'"]+)['"]/g,       // {% extends 'base.njk' %}
      /\{%\s*macro\s+(\w+)/g,                    // {% macro name %}
    ],
  },
  shopify: {
    ext: 'liquid',
    patterns: [
      /\{%\s*render\s+['"]([^'"]+)['"]/g,        // {% render 'snippet' %}
      /\{%\s*section\s+['"]([^'"]+)['"]/g,       // {% section 'section-name' %}
      /\{%\s*include\s+['"]([^'"]+)['"]/g,       // {% include 'snippet' %}
      /\{%\s*layout\s+['"]([^'"]+)['"]/g,        // {% layout 'theme' %}
    ],
  },
  // Documentation
  asciidoc: {
    ext: 'adoc',
    patterns: [
      /include::([^\[]+)\[/g,                    // include::file.adoc[]
      /^=+\s+(.+)/gm,                            // = Heading
      /\[\[(\w+)\]\]/g,                          // [[anchor]]
    ],
  },
  // Data templates
  'yaml-template': {
    ext: 'yaml',
    patterns: [
      /\$\{\{.*\}\}/g,                           // ${{ expression }}
      /\{\{\s*\.\w+/g,                           // {{ .Values.x }}
      /\{\{-?\s*include/g,                       // {{- include "name" }}
    ],
  },
  'json-template': {
    ext: 'json',
    patterns: [
      /\$\{[^}]+\}/g,                            // ${variable}
      /\{\{[^}]+\}\}/g,                          // {{variable}}
    ],
  },
  // Additional JS frameworks
  angular: {
    ext: 'component.ts',
    patterns: [
      /@Component\(\{/g,                         // @Component({
      /templateUrl:\s*['"]([^'"]+)['"]/g,        // templateUrl: 'template.html'
      /selector:\s*['"]([^'"]+)['"]/g,           // selector: 'app-name'
      /<([a-z]+-[a-z-]+)/g,                      // <app-component>
    ],
  },
  stencil: {
    ext: 'tsx',
    patterns: [
      /@Component\(\{/g,                         // @Component({
      /tag:\s*['"]([^'"]+)['"]/g,                // tag: 'my-component'
      /@Prop\(\)/g,                              // @Prop()
      /@State\(\)/g,                             // @State()
    ],
  },
  alpine: {
    ext: 'html',
    patterns: [
      /x-data\s*=\s*["'][^"']*["']/g,            // x-data="..."
      /x-bind:/g,                                // x-bind:
      /x-on:/g,                                  // x-on:
      /@click/g,                                 // @click
      /x-show/g,                                 // x-show
      /x-if/g,                                   // x-if
      /x-for/g,                                  // x-for
    ],
  },
  htmx: {
    ext: 'html',
    patterns: [
      /hx-get\s*=\s*["'][^"']*["']/g,            // hx-get="..."
      /hx-post\s*=\s*["'][^"']*["']/g,           // hx-post="..."
      /hx-trigger/g,                             // hx-trigger
      /hx-target/g,                              // hx-target
      /hx-swap/g,                                // hx-swap
      /hx-push-url/g,                            // hx-push-url
    ],
  },
  svg: {
    ext: 'svg',
    patterns: [
      /<svg[^>]*>/g,                             // <svg ...>
      /<use\s+[^>]*href\s*=\s*["']([^"']+)["']/g, // <use href="...">
      /<symbol\s+id\s*=\s*["']([^"']+)["']/g,    // <symbol id="...">
      /<defs>/g,                                 // <defs>
    ],
  },
};

export class TemplateScanner extends Scanner<Component, TemplateScannerConfig> {
  /** Aggregator for collecting signals across all scanned files */
  private signalAggregator: SignalAggregator = createSignalAggregator();

  async scan(): Promise<ScanResult<Component>> {
    // Clear signals from previous scan
    this.signalAggregator.clear();

    const templateConfig = TEMPLATE_CONFIG[this.config.templateType];
    const ext = templateConfig?.ext || this.config.templateType;
    const patterns = this.config.include || [`**/*.${ext}`];

    // Wrapper to convert single result to array for runScan compatibility
    const parseFileAsArray = async (file: string): Promise<Component[]> => {
      const result = await this.parseFile(file);
      return result ? [result] : [];
    };

    // Use cache if available
    if (this.config.cache) {
      return this.runScanWithCache(parseFileAsArray, patterns);
    }

    return this.runScan(parseFileAsArray, patterns);
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
    return this.config.templateType;
  }

  private async parseFile(filePath: string): Promise<Component | null> {
    const content = await readFile(filePath, 'utf-8');
    const relativePath = relative(this.config.projectRoot, filePath);

    // Create signal collector for this file (use null for template frameworks not in the core Framework type)
    const signalCollector = createScannerSignalCollector(null, relativePath);

    // Generate component name from file path
    // e.g., resources/views/components/button.blade.php -> Button
    // e.g., app/views/shared/_header.html.erb -> Header
    const name = this.extractComponentName(filePath);

    // Skip non-component files (layouts, pages, etc.)
    if (!this.isLikelyComponent(filePath, content)) {
      // Still add signals even if we skip the component
      this.signalAggregator.addEmitter(relativePath, signalCollector.getEmitter());
      return null;
    }

    const dependencies = this.extractDependencies(content, signalCollector);

    // Extract props based on template type
    const props = this.extractProps(content);

    const source: TemplateSource = {
      type: this.config.templateType,
      path: relativePath,
      exportName: name,
      line: 1,
    };

    // Emit component definition signal
    signalCollector.collectComponentDef(name, 1, {
      propsCount: props.length,
      dependencyCount: dependencies.length,
      templateType: this.config.templateType,
    });

    // Add this file's signals to the aggregator
    this.signalAggregator.addEmitter(relativePath, signalCollector.getEmitter());

    return {
      id: createComponentId(source as any, name),
      name,
      source: source as any,
      props,
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

  /**
   * Extract props from template content based on template type
   */
  private extractProps(content: string): PropDefinition[] {
    if (this.config.templateType === 'astro') {
      return this.extractAstroProps(content);
    }
    // Other template types could be added here
    return [];
  }

  /**
   * Extract props from Astro component frontmatter
   * Supports:
   * - `interface Props { ... }`
   * - `interface Props extends SomeType { ... }` (interface with extends clause)
   * - `type Props = { ... }`
   * - `export type Props = { ... }`
   * - `type Props = (SomeType | OtherType) & { ... }` (intersection with inline object)
   * - `type Props = SomeType & { ... }` (simple intersection)
   * - `type Props = SomeType | OtherType` (union types - no inline props)
   */
  private extractAstroProps(content: string): PropDefinition[] {
    const props: PropDefinition[] = [];

    // Extract frontmatter (between --- delimiters)
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatterMatch || !frontmatterMatch[1]) return props;

    const frontmatter = frontmatterMatch[1];

    // Pattern 1: Direct inline props - interface Props { ... } or type Props = { ... }
    // Also supports export keyword: export type Props = { ... }
    const directPropsMatch = frontmatter.match(/(?:export\s+)?(?:interface|type)\s+Props\s*(?:=\s*)?\{/);
    if (directPropsMatch && directPropsMatch.index !== undefined) {
      const startIndex = directPropsMatch.index + directPropsMatch[0].length;
      const propsBlock = this.extractBalancedBraces(frontmatter, startIndex);
      if (propsBlock) {
        return this.parseTopLevelProps(propsBlock);
      }
    }

    // Pattern 2: Interface with extends clause - interface Props extends SomeType { ... }
    // Supports generic types like: interface Props extends Omit<HTMLAttributes<'pre'>, 'lang'> { ... }
    const interfaceExtendsMatch = frontmatter.match(/interface\s+Props\s+extends\s+[^{]+\{/);
    if (interfaceExtendsMatch && interfaceExtendsMatch.index !== undefined) {
      const matchEnd = interfaceExtendsMatch.index + interfaceExtendsMatch[0].length;
      const propsBlock = this.extractBalancedBraces(frontmatter, matchEnd);
      if (propsBlock) {
        return this.parseTopLevelProps(propsBlock);
      }
    }

    // Pattern 3: Intersection type with inline props at the end
    // e.g., type Props = (SomeType | OtherType) & { formats?: string[] }
    // or: export type Props = SomeType & { extraProp: string }
    const intersectionMatch = frontmatter.match(/(?:export\s+)?type\s+Props\s*=\s*[^;{]+&\s*\{/);
    if (intersectionMatch && intersectionMatch.index !== undefined) {
      // Find the last { in the match to get the inline object part
      const matchEnd = intersectionMatch.index + intersectionMatch[0].length;
      const propsBlock = this.extractBalancedBraces(frontmatter, matchEnd);
      if (propsBlock) {
        return this.parseTopLevelProps(propsBlock);
      }
    }

    // Pattern 4: Union or external type reference (no inline props to extract)
    // e.g., type Props = LocalImageProps | RemoteImageProps
    // We can still record the type reference for traceability
    const typeRefMatch = frontmatter.match(/(?:export\s+)?type\s+Props\s*=\s*([^;{]+);/);
    if (typeRefMatch && typeRefMatch[1]) {
      // This is a type alias to external types - no inline props available
      // Could potentially add a metadata field to track the referenced types
      return [];
    }

    return props;
  }

  /**
   * Extract content within balanced braces starting from a given index
   */
  private extractBalancedBraces(text: string, startIndex: number): string | null {
    let depth = 1;
    let index = startIndex;

    while (index < text.length && depth > 0) {
      const char = text[index];
      if (char === '{') depth++;
      else if (char === '}') depth--;
      index++;
    }

    if (depth !== 0) return null;

    // Return content excluding the final closing brace
    return text.slice(startIndex, index - 1);
  }

  /**
   * Parse only top-level props from a Props block, ignoring nested object members
   */
  private parseTopLevelProps(propsBlock: string): PropDefinition[] {
    const props: PropDefinition[] = [];
    let index = 0;
    const length = propsBlock.length;

    while (index < length) {
      // Skip whitespace
      while (index < length && /\s/.test(propsBlock[index]!)) index++;
      if (index >= length) break;

      // Parse prop name
      const nameMatch = propsBlock.slice(index).match(/^(\w+)(\?)?:\s*/);
      if (!nameMatch) {
        // Not a prop definition, skip to next line
        while (index < length && propsBlock[index] !== '\n') index++;
        index++;
        continue;
      }

      const propName = nameMatch[1]!;
      const isOptional = nameMatch[2] === '?';
      index += nameMatch[0].length;

      // Extract the type, handling nested braces and generics
      const typeResult = this.extractPropType(propsBlock, index);
      if (!typeResult) break;

      const { type, endIndex } = typeResult;
      index = endIndex;

      props.push({
        name: propName,
        type: type.trim(),
        required: !isOptional,
        defaultValue: undefined,
      });
    }

    return props;
  }

  /**
   * Extract a property type, handling nested braces, generics, and complex types
   */
  private extractPropType(text: string, startIndex: number): { type: string; endIndex: number } | null {
    let index = startIndex;
    let depth = 0;
    let angleBracketDepth = 0;
    let parenDepth = 0;
    const length = text.length;
    const start = startIndex;

    while (index < length) {
      const char = text[index]!;
      const prevChar = index > 0 ? text[index - 1] : '';

      // Track nested structures
      if (char === '{') depth++;
      else if (char === '}') {
        if (depth === 0) break; // End of Props block
        depth--;
      } else if (char === '<' && prevChar !== '=') {
        // Don't count < in arrow functions (=>)
        angleBracketDepth++;
      } else if (char === '>' && prevChar !== '=') {
        // Don't count > in arrow functions (=>)
        if (angleBracketDepth > 0) angleBracketDepth--;
      } else if (char === '(') parenDepth++;
      else if (char === ')') parenDepth--;

      // Semi-colon or newline at depth 0 ends the prop type
      if (depth === 0 && angleBracketDepth === 0 && parenDepth === 0) {
        if (char === ';' || char === '\n') {
          const type = text.slice(start, index);
          return { type, endIndex: index + 1 };
        }
      }

      index++;
    }

    // Handle case where we reached end of block
    if (index > start) {
      const type = text.slice(start, index);
      return { type, endIndex: index };
    }

    return null;
  }

  private extractComponentName(filePath: string): string {
    let name = basename(filePath);

    // Remove extensions (handle compound extensions first, then simple ones)
    name = name.replace(/\.(blade\.php|html\.erb|html\.twig|component\.ts|component\.html)$/i, '');
    name = name.replace(/\.(php|html|njk|astro|tsx|jsx|marko|svelte|vue|ts|js)$/i, '');

    // Remove partial prefix (Rails convention)
    name = name.replace(/^_/, '');

    // Convert to PascalCase
    name = name
      .split(/[-_.]/)
      .map(s => s.charAt(0).toUpperCase() + s.slice(1))
      .join('');

    return name;
  }

  private isLikelyComponent(filePath: string, content: string): boolean {
    const lowerPath = filePath.toLowerCase();
    const pathParts = lowerPath.split('/');

    // For framework-specific file extensions (Astro, Marko),
    // always treat files as components since the extension confirms the framework
    if (ALWAYS_COMPONENT_TYPES.includes(this.config.templateType)) {
      // For Astro specifically, all .astro files are components (including layouts and pages)
      // They can all be imported and reused
      return true;
    }

    // For frameworks that use generic .tsx/.ts extensions,
    // validate the file actually uses that framework
    if (NEEDS_CONTENT_VALIDATION.includes(this.config.templateType)) {
      const validation = FRAMEWORK_VALIDATION[this.config.templateType];
      if (validation) {
        let matchCount = 0;
        for (const pattern of validation.patterns) {
          if (pattern.test(content)) {
            matchCount++;
            if (matchCount >= validation.minMatches) {
              return true;
            }
          }
        }
        // File doesn't use this framework
        return false;
      }
    }

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

  private extractDependencies(
    content: string,
    signalCollector?: ScannerSignalCollector,
  ): string[] {
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
          // Emit component usage signal
          signalCollector?.collectComponentUsage(depName, 1);
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
