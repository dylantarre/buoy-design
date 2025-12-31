import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { resolve, basename } from 'path';
import { glob } from 'glob';

export interface DetectedProject {
  name: string;
  root: string;
  frameworks: FrameworkInfo[];
  primaryFramework: FrameworkInfo | null;
  components: ComponentLocation[];
  tokens: TokenLocation[];
  storybook: StorybookInfo | null;
  designSystem: DesignSystemInfo | null;
  monorepo: MonorepoInfo | null;
}

export interface FrameworkInfo {
  name:
    // JS Frameworks
    | 'react' | 'vue' | 'svelte' | 'angular' | 'solid' | 'preact'
    // Meta-frameworks
    | 'nextjs' | 'nuxt' | 'astro' | 'remix' | 'sveltekit' | 'gatsby'
    // Mobile
    | 'react-native' | 'flutter' | 'expo'
    // Web Components
    | 'lit' | 'stencil'
    // Server-side
    | 'php' | 'laravel' | 'symfony'
    | 'rails'
    | 'django' | 'flask' | 'fastapi'
    | 'express' | 'nestjs'
    | 'spring' | 'aspnet'
    | 'go'
    // Static site generators
    | 'hugo' | 'jekyll' | 'eleventy';
  version: string;
  typescript: boolean;
  meta?: string; // e.g., "Next.js (React)"
}

export interface ComponentLocation {
  path: string;
  fileCount: number;
  pattern: string;
  type?: 'jsx' | 'tsx' | 'vue' | 'svelte' | 'astro' | 'php' | 'erb' | 'blade' | 'twig' | 'html' | 'njk' | 'razor' | 'hbs' | 'mustache' | 'ejs' | 'pug' | 'liquid' | 'slim' | 'haml' | 'jinja' | 'django' | 'thymeleaf' | 'freemarker' | 'go-template' | 'markdown' | 'mdx';
}

export interface TokenLocation {
  path: string;
  type: 'css' | 'scss' | 'json' | 'js' | 'tailwind';
  name: string;
}

export interface StorybookInfo {
  configPath: string;
  version: string | null;
}

export interface DesignSystemInfo {
  package: string;
  version: string;
  type:
    | 'chakra' | 'mui' | 'antd' | 'radix' | 'shadcn'
    | 'bootstrap' | 'tailwind' | 'bulma' | 'foundation'
    | 'mantine' | 'nextui' | 'primereact' | 'carbon'
    | 'custom';
}

export interface MonorepoInfo {
  type: 'pnpm' | 'yarn' | 'npm' | 'nx' | 'turborepo';
  packages: string[];
}

// Common component directory names (JS frameworks)
const COMPONENT_DIRS = [
  'src/components',
  'components',
  'src/ui',
  'ui',
  'lib/components',
  'lib/ui',
  'app/components',
  'packages/ui/src',
  'packages/components/src',
];

// Template directories for server-side frameworks
const TEMPLATE_DIRS = [
  // PHP
  { dir: 'templates', ext: 'php', type: 'php' as const },
  { dir: 'views', ext: 'php', type: 'php' as const },
  { dir: 'includes', ext: 'php', type: 'php' as const },
  { dir: 'partials', ext: 'php', type: 'php' as const },
  // Laravel Blade
  { dir: 'resources/views', ext: 'blade.php', type: 'blade' as const },
  // Ruby/Rails ERB
  { dir: 'app/views', ext: 'erb', type: 'erb' as const },
  { dir: 'app/views', ext: 'html.erb', type: 'erb' as const },
  // Twig (Symfony)
  { dir: 'templates', ext: 'html.twig', type: 'twig' as const },
  // Django/Jinja/Go/Generic HTML templates
  { dir: 'templates', ext: 'html', type: 'html' as const },
  // Hugo
  { dir: 'layouts', ext: 'html', type: 'html' as const },
  // Jekyll
  { dir: '_layouts', ext: 'html', type: 'html' as const },
  { dir: '_includes', ext: 'html', type: 'html' as const },
  // Eleventy
  { dir: 'src', ext: 'njk', type: 'njk' as const },
  { dir: '_includes', ext: 'njk', type: 'njk' as const },
  // ASP.NET Razor
  { dir: 'Views', ext: 'cshtml', type: 'razor' as const },
  { dir: 'Pages', ext: 'cshtml', type: 'razor' as const },
  { dir: 'Shared', ext: 'cshtml', type: 'razor' as const },
  { dir: 'Areas', ext: 'cshtml', type: 'razor' as const },
  // Handlebars/Mustache
  { dir: 'views', ext: 'hbs', type: 'hbs' as const },
  { dir: 'views', ext: 'handlebars', type: 'hbs' as const },
  { dir: 'templates', ext: 'hbs', type: 'hbs' as const },
  { dir: 'views', ext: 'mustache', type: 'hbs' as const },
  { dir: 'templates', ext: 'mustache', type: 'hbs' as const },
  // EJS (Express.js)
  { dir: 'views', ext: 'ejs', type: 'ejs' as const },
  { dir: 'templates', ext: 'ejs', type: 'ejs' as const },
  // Pug/Jade
  { dir: 'views', ext: 'pug', type: 'pug' as const },
  { dir: 'views', ext: 'jade', type: 'pug' as const },
  { dir: 'templates', ext: 'pug', type: 'pug' as const },
  // Liquid (Shopify, Jekyll)
  { dir: 'templates', ext: 'liquid', type: 'liquid' as const },
  { dir: '_layouts', ext: 'liquid', type: 'liquid' as const },
  { dir: '_includes', ext: 'liquid', type: 'liquid' as const },
  { dir: 'sections', ext: 'liquid', type: 'liquid' as const },
  { dir: 'snippets', ext: 'liquid', type: 'liquid' as const },
  // Slim (Ruby)
  { dir: 'app/views', ext: 'slim', type: 'slim' as const },
  { dir: 'app/views', ext: 'html.slim', type: 'slim' as const },
  // Haml (Ruby)
  { dir: 'app/views', ext: 'haml', type: 'haml' as const },
  { dir: 'app/views', ext: 'html.haml', type: 'haml' as const },
  // Mustache (standalone)
  { dir: 'views', ext: 'mustache', type: 'mustache' as const },
  { dir: 'templates', ext: 'mustache', type: 'mustache' as const },
  // Jinja2 (Python/Flask)
  { dir: 'templates', ext: 'jinja', type: 'jinja' as const },
  { dir: 'templates', ext: 'jinja2', type: 'jinja' as const },
  { dir: 'templates', ext: 'j2', type: 'jinja' as const },
  // Django templates
  { dir: 'templates', ext: 'django', type: 'django' as const },
  { dir: 'templates', ext: 'html', type: 'django' as const }, // Django often uses .html
  // Thymeleaf (Java/Spring)
  { dir: 'src/main/resources/templates', ext: 'html', type: 'thymeleaf' as const },
  { dir: 'templates', ext: 'html', type: 'thymeleaf' as const },
  // Freemarker (Java)
  { dir: 'src/main/resources/templates', ext: 'ftl', type: 'freemarker' as const },
  { dir: 'templates', ext: 'ftl', type: 'freemarker' as const },
  { dir: 'templates', ext: 'ftlh', type: 'freemarker' as const },
  // Go templates
  { dir: 'templates', ext: 'tmpl', type: 'go-template' as const },
  { dir: 'templates', ext: 'gohtml', type: 'go-template' as const },
  { dir: 'web/templates', ext: 'html', type: 'go-template' as const },
  // Astro
  { dir: 'src/components', ext: 'astro', type: 'astro' as const },
  { dir: 'src/pages', ext: 'astro', type: 'astro' as const },
  { dir: 'src/layouts', ext: 'astro', type: 'astro' as const },
  // Markdown/MDX
  { dir: 'docs', ext: 'md', type: 'markdown' as const },
  { dir: 'content', ext: 'md', type: 'markdown' as const },
  { dir: 'src/content', ext: 'md', type: 'markdown' as const },
  { dir: 'docs', ext: 'mdx', type: 'mdx' as const },
  { dir: 'content', ext: 'mdx', type: 'mdx' as const },
  { dir: 'src/content', ext: 'mdx', type: 'mdx' as const },
  { dir: 'src/pages', ext: 'mdx', type: 'mdx' as const },
];

// Token file patterns
const TOKEN_PATTERNS: { pattern: string; type: TokenLocation['type']; name: string }[] = [
  // Standard token files
  { pattern: '**/tokens.json', type: 'json', name: 'Design tokens (JSON)' },
  { pattern: '**/tokens/*.json', type: 'json', name: 'Design tokens (JSON)' },
  { pattern: '**/design-tokens.json', type: 'json', name: 'Design tokens (JSON)' },
  { pattern: '**/design-tokens/*.json', type: 'json', name: 'Design tokens (JSON)' },
  // Style Dictionary
  { pattern: '**/style-dictionary.config.json', type: 'json', name: 'Style Dictionary config' },
  { pattern: '**/style-dictionary.config.js', type: 'js', name: 'Style Dictionary config' },
  { pattern: '**/tokens/**/**.json', type: 'json', name: 'Style Dictionary tokens' },
  // Tokens Studio (Figma plugin)
  { pattern: '**/tokens.json', type: 'json', name: 'Tokens Studio' },
  { pattern: '**/$metadata.json', type: 'json', name: 'Tokens Studio metadata' },
  // W3C Design Token format
  { pattern: '**/*.tokens.json', type: 'json', name: 'W3C Design Tokens' },
  // CSS
  { pattern: '**/variables.css', type: 'css', name: 'CSS variables' },
  { pattern: '**/theme.css', type: 'css', name: 'Theme CSS' },
  { pattern: '**/custom-properties.css', type: 'css', name: 'CSS custom properties' },
  // SCSS/Sass
  { pattern: '**/_variables.scss', type: 'scss', name: 'SCSS variables' },
  { pattern: '**/_tokens.scss', type: 'scss', name: 'SCSS tokens' },
  { pattern: '**/variables.scss', type: 'scss', name: 'SCSS variables' },
  { pattern: '**/_colors.scss', type: 'scss', name: 'SCSS colors' },
  { pattern: '**/_typography.scss', type: 'scss', name: 'SCSS typography' },
  // JS/TS theme files
  { pattern: '**/theme.ts', type: 'js', name: 'Theme config' },
  { pattern: '**/theme.js', type: 'js', name: 'Theme config' },
  { pattern: '**/tokens.ts', type: 'js', name: 'Token definitions' },
  { pattern: '**/tokens.js', type: 'js', name: 'Token definitions' },
  { pattern: '**/theme/index.ts', type: 'js', name: 'Theme index' },
  { pattern: '**/theme/index.js', type: 'js', name: 'Theme index' },
  // Tailwind
  { pattern: 'tailwind.config.js', type: 'tailwind', name: 'Tailwind config' },
  { pattern: 'tailwind.config.ts', type: 'tailwind', name: 'Tailwind config' },
  { pattern: 'tailwind.config.mjs', type: 'tailwind', name: 'Tailwind config' },
  { pattern: 'tailwind.config.cjs', type: 'tailwind', name: 'Tailwind config' },
];

// Design system packages to detect
const DESIGN_SYSTEMS: { package: string; type: DesignSystemInfo['type'] }[] = [
  // React design systems
  { package: '@chakra-ui/react', type: 'chakra' },
  { package: '@mui/material', type: 'mui' },
  { package: '@material-ui/core', type: 'mui' },
  { package: 'antd', type: 'antd' },
  { package: '@radix-ui/react-', type: 'radix' },
  { package: '@shadcn/ui', type: 'shadcn' },
  { package: '@mantine/core', type: 'mantine' },
  { package: '@nextui-org/react', type: 'nextui' },
  { package: 'primereact', type: 'primereact' },
  { package: '@carbon/react', type: 'carbon' },
  // CSS frameworks
  { package: 'bootstrap', type: 'bootstrap' },
  { package: 'react-bootstrap', type: 'bootstrap' },
  { package: '@ng-bootstrap/ng-bootstrap', type: 'bootstrap' },
  { package: 'bulma', type: 'bulma' },
  { package: 'foundation-sites', type: 'foundation' },
  { package: 'tailwindcss', type: 'tailwind' },
];

export class ProjectDetector {
  private root: string;
  private packageJson: Record<string, unknown> | null = null;

  constructor(root: string = process.cwd()) {
    this.root = root;
    this.loadPackageJson();
  }

  private loadPackageJson(): void {
    const pkgPath = resolve(this.root, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        this.packageJson = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      } catch {
        this.packageJson = null;
      }
    }
  }

  async detect(): Promise<DetectedProject> {
    const [frameworks, components, tokens, storybook, designSystem, monorepo] = await Promise.all([
      this.detectFrameworks(),
      this.detectComponents(),
      this.detectTokens(),
      this.detectStorybook(),
      this.detectDesignSystem(),
      this.detectMonorepo(),
    ]);

    return {
      name: this.getProjectName(),
      root: this.root,
      frameworks,
      primaryFramework: frameworks[0] || null,
      components,
      tokens,
      storybook,
      designSystem,
      monorepo,
    };
  }

  private getProjectName(): string {
    if (this.packageJson && typeof this.packageJson.name === 'string') {
      return this.packageJson.name;
    }
    return basename(this.root);
  }

  private getAllDeps(): Record<string, string> {
    if (!this.packageJson) return {};
    const deps = (this.packageJson.dependencies || {}) as Record<string, string>;
    const devDeps = (this.packageJson.devDependencies || {}) as Record<string, string>;
    return { ...deps, ...devDeps };
  }

  private async detectFrameworks(): Promise<FrameworkInfo[]> {
    const deps = this.getAllDeps();
    const hasTypescript = 'typescript' in deps || existsSync(resolve(this.root, 'tsconfig.json'));
    const frameworks: FrameworkInfo[] = [];
    const addedNames = new Set<string>();

    const addFramework = (fw: FrameworkInfo) => {
      // Avoid duplicates (e.g., don't add both 'react' and 'nextjs' as separate react entries)
      if (!addedNames.has(fw.name)) {
        addedNames.add(fw.name);
        frameworks.push(fw);
      }
    };

    // ============================================
    // Meta-frameworks (check first - more specific)
    // ============================================

    // Next.js
    if ('next' in deps) {
      addFramework({
        name: 'nextjs',
        version: deps['next'] || 'unknown',
        typescript: hasTypescript,
        meta: 'React',
      });
    }

    // Nuxt
    if ('nuxt' in deps || 'nuxt3' in deps) {
      addFramework({
        name: 'nuxt',
        version: deps['nuxt'] || deps['nuxt3'] || 'unknown',
        typescript: hasTypescript,
        meta: 'Vue',
      });
    }

    // Astro
    if ('astro' in deps) {
      addFramework({
        name: 'astro',
        version: deps['astro'] || 'unknown',
        typescript: hasTypescript,
      });
    }

    // Remix
    if ('@remix-run/react' in deps || '@remix-run/node' in deps) {
      addFramework({
        name: 'remix',
        version: deps['@remix-run/react'] || deps['@remix-run/node'] || 'unknown',
        typescript: hasTypescript,
        meta: 'React',
      });
    }

    // SvelteKit
    if ('@sveltejs/kit' in deps) {
      addFramework({
        name: 'sveltekit',
        version: deps['@sveltejs/kit'] || 'unknown',
        typescript: hasTypescript,
        meta: 'Svelte',
      });
    }

    // Gatsby
    if ('gatsby' in deps) {
      addFramework({
        name: 'gatsby',
        version: deps['gatsby'] || 'unknown',
        typescript: hasTypescript,
        meta: 'React',
      });
    }

    // ============================================
    // Mobile frameworks
    // ============================================

    // Expo (check before React Native)
    if ('expo' in deps) {
      addFramework({
        name: 'expo',
        version: deps['expo'] || 'unknown',
        typescript: hasTypescript,
        meta: 'React Native',
      });
    }

    // React Native (only if not already added via Expo)
    if ('react-native' in deps && !addedNames.has('expo')) {
      addFramework({
        name: 'react-native',
        version: deps['react-native'] || 'unknown',
        typescript: hasTypescript,
      });
    }

    // Flutter (check for pubspec.yaml)
    if (existsSync(resolve(this.root, 'pubspec.yaml'))) {
      try {
        const pubspec = readFileSync(resolve(this.root, 'pubspec.yaml'), 'utf-8');
        if (pubspec.includes('flutter:')) {
          addFramework({
            name: 'flutter',
            version: 'unknown',
            typescript: false,
          });
        }
      } catch {
        // ignore
      }
    }

    // ============================================
    // Web Components
    // ============================================

    // Lit
    if ('lit' in deps || 'lit-element' in deps) {
      addFramework({
        name: 'lit',
        version: deps['lit'] || deps['lit-element'] || 'unknown',
        typescript: hasTypescript,
      });
    }

    // Stencil
    if ('@stencil/core' in deps) {
      addFramework({
        name: 'stencil',
        version: deps['@stencil/core'] || 'unknown',
        typescript: true,
      });
    }

    // ============================================
    // Base JS frameworks (only add if meta-framework not already added)
    // ============================================

    // Preact
    if ('preact' in deps) {
      addFramework({
        name: 'preact',
        version: deps['preact'] || 'unknown',
        typescript: hasTypescript,
      });
    }

    // React (skip if Next.js, Remix, Gatsby, or Expo already added)
    const hasReactMeta = addedNames.has('nextjs') || addedNames.has('remix') || addedNames.has('gatsby') || addedNames.has('expo') || addedNames.has('react-native');
    if (('react' in deps || 'react-dom' in deps) && !hasReactMeta) {
      addFramework({
        name: 'react',
        version: deps['react'] || deps['react-dom'] || 'unknown',
        typescript: hasTypescript,
      });
    }

    // Vue (skip if Nuxt already added)
    if ('vue' in deps && !addedNames.has('nuxt')) {
      addFramework({
        name: 'vue',
        version: deps['vue'] || 'unknown',
        typescript: hasTypescript,
      });
    }

    // Svelte (skip if SvelteKit already added)
    if ('svelte' in deps && !addedNames.has('sveltekit')) {
      addFramework({
        name: 'svelte',
        version: deps['svelte'] || 'unknown',
        typescript: hasTypescript,
      });
    }

    // Angular
    if ('@angular/core' in deps) {
      addFramework({
        name: 'angular',
        version: deps['@angular/core'] || 'unknown',
        typescript: true,
      });
    }

    // Solid
    if ('solid-js' in deps) {
      addFramework({
        name: 'solid',
        version: deps['solid-js'] || 'unknown',
        typescript: hasTypescript,
      });
    }

    // ============================================
    // Node.js server frameworks
    // ============================================

    // NestJS
    if ('@nestjs/core' in deps) {
      addFramework({
        name: 'nestjs',
        version: deps['@nestjs/core'] || 'unknown',
        typescript: true,
      });
    }

    // Express
    if ('express' in deps) {
      addFramework({
        name: 'express',
        version: deps['express'] || 'unknown',
        typescript: hasTypescript,
      });
    }

    // ============================================
    // Static site generators (file-based detection)
    // ============================================

    // Eleventy
    if ('@11ty/eleventy' in deps) {
      addFramework({
        name: 'eleventy',
        version: deps['@11ty/eleventy'] || 'unknown',
        typescript: false,
      });
    }

    // Hugo (look for hugo.toml or config.toml with hugo)
    if (existsSync(resolve(this.root, 'hugo.toml')) ||
        existsSync(resolve(this.root, 'hugo.yaml')) ||
        existsSync(resolve(this.root, 'config.toml'))) {
      addFramework({
        name: 'hugo',
        version: 'unknown',
        typescript: false,
      });
    }

    // Jekyll (look for _config.yml with jekyll patterns)
    if (existsSync(resolve(this.root, '_config.yml'))) {
      try {
        const config = readFileSync(resolve(this.root, '_config.yml'), 'utf-8');
        if (config.includes('jekyll') || existsSync(resolve(this.root, '_posts'))) {
          addFramework({
            name: 'jekyll',
            version: 'unknown',
            typescript: false,
          });
        }
      } catch {
        // ignore
      }
    }

    // ============================================
    // PHP frameworks
    // ============================================

    // Check composer.json for PHP frameworks
    const composerPath = resolve(this.root, 'composer.json');
    if (existsSync(composerPath)) {
      try {
        const composer = JSON.parse(readFileSync(composerPath, 'utf-8'));
        const composerDeps = {
          ...(composer.require || {}),
          ...(composer['require-dev'] || {}),
        };

        // Laravel
        if ('laravel/framework' in composerDeps) {
          addFramework({
            name: 'laravel',
            version: composerDeps['laravel/framework'] || 'unknown',
            typescript: false,
          });
        }

        // Symfony
        if ('symfony/framework-bundle' in composerDeps || 'symfony/symfony' in composerDeps) {
          addFramework({
            name: 'symfony',
            version: composerDeps['symfony/framework-bundle'] || composerDeps['symfony/symfony'] || 'unknown',
            typescript: false,
          });
        }
      } catch {
        // ignore
      }
    }

    // Generic PHP (only if no specific PHP framework found)
    if ((existsSync(resolve(this.root, 'index.php')) || existsSync(composerPath)) &&
        !addedNames.has('laravel') && !addedNames.has('symfony')) {
      addFramework({
        name: 'php',
        version: 'unknown',
        typescript: false,
      });
    }

    // ============================================
    // Ruby frameworks
    // ============================================

    const gemfilePath = resolve(this.root, 'Gemfile');
    if (existsSync(gemfilePath)) {
      try {
        const gemfile = readFileSync(gemfilePath, 'utf-8');
        if (gemfile.includes('rails')) {
          addFramework({
            name: 'rails',
            version: 'unknown',
            typescript: false,
          });
        }
      } catch {
        // ignore
      }
    }

    // ============================================
    // Python frameworks
    // ============================================

    // Check requirements.txt or pyproject.toml
    const requirementsPath = resolve(this.root, 'requirements.txt');
    const pyprojectPath = resolve(this.root, 'pyproject.toml');

    if (existsSync(requirementsPath)) {
      try {
        const requirements = readFileSync(requirementsPath, 'utf-8').toLowerCase();
        if (requirements.includes('fastapi')) {
          addFramework({ name: 'fastapi', version: 'unknown', typescript: false });
        }
        if (requirements.includes('flask')) {
          addFramework({ name: 'flask', version: 'unknown', typescript: false });
        }
        if (requirements.includes('django')) {
          addFramework({ name: 'django', version: 'unknown', typescript: false });
        }
      } catch {
        // ignore
      }
    }

    if (existsSync(pyprojectPath)) {
      try {
        const pyproject = readFileSync(pyprojectPath, 'utf-8').toLowerCase();
        if (pyproject.includes('fastapi') && !addedNames.has('fastapi')) {
          addFramework({ name: 'fastapi', version: 'unknown', typescript: false });
        }
        if (pyproject.includes('flask') && !addedNames.has('flask')) {
          addFramework({ name: 'flask', version: 'unknown', typescript: false });
        }
        if (pyproject.includes('django') && !addedNames.has('django')) {
          addFramework({ name: 'django', version: 'unknown', typescript: false });
        }
      } catch {
        // ignore
      }
    }

    // Django fallback - look for manage.py
    if (existsSync(resolve(this.root, 'manage.py')) && !addedNames.has('django')) {
      addFramework({
        name: 'django',
        version: 'unknown',
        typescript: false,
      });
    }

    // ============================================
    // Go
    // ============================================

    if (existsSync(resolve(this.root, 'go.mod'))) {
      addFramework({
        name: 'go',
        version: 'unknown',
        typescript: false,
      });
    }

    // ============================================
    // Java/Spring
    // ============================================

    if (existsSync(resolve(this.root, 'pom.xml'))) {
      try {
        const pom = readFileSync(resolve(this.root, 'pom.xml'), 'utf-8');
        if (pom.includes('spring-boot') || pom.includes('springframework')) {
          addFramework({
            name: 'spring',
            version: 'unknown',
            typescript: false,
          });
        }
      } catch {
        // ignore
      }
    }

    if (existsSync(resolve(this.root, 'build.gradle')) || existsSync(resolve(this.root, 'build.gradle.kts'))) {
      try {
        const gradlePath = existsSync(resolve(this.root, 'build.gradle'))
          ? resolve(this.root, 'build.gradle')
          : resolve(this.root, 'build.gradle.kts');
        const gradle = readFileSync(gradlePath, 'utf-8');
        if ((gradle.includes('spring-boot') || gradle.includes('springframework')) && !addedNames.has('spring')) {
          addFramework({
            name: 'spring',
            version: 'unknown',
            typescript: false,
          });
        }
      } catch {
        // ignore
      }
    }

    // ============================================
    // .NET/ASP.NET
    // ============================================

    const csprojFiles = await glob('*.csproj', { cwd: this.root });
    const firstCsproj = csprojFiles[0];
    if (firstCsproj) {
      try {
        const csproj = readFileSync(resolve(this.root, firstCsproj), 'utf-8');
        if (csproj.includes('Microsoft.AspNetCore') || csproj.includes('Microsoft.NET.Sdk.Web')) {
          addFramework({
            name: 'aspnet',
            version: 'unknown',
            typescript: false,
          });
        }
      } catch {
        // ignore
      }
    }

    return frameworks;
  }

  private async detectComponents(): Promise<ComponentLocation[]> {
    const locations: ComponentLocation[] = [];

    // Check JS component directories
    for (const dir of COMPONENT_DIRS) {
      const fullPath = resolve(this.root, dir);
      if (existsSync(fullPath) && statSync(fullPath).isDirectory()) {
        // Count component files
        const extensions = ['tsx', 'jsx', 'vue', 'svelte'];
        let fileCount = 0;

        for (const ext of extensions) {
          const files = await glob(`**/*.${ext}`, {
            cwd: fullPath,
            ignore: ['**/*.test.*', '**/*.spec.*', '**/*.stories.*', '**/node_modules/**'],
          });
          fileCount += files.length;
        }

        if (fileCount > 0) {
          locations.push({
            path: dir,
            fileCount,
            pattern: `${dir}/**/*.{tsx,jsx,vue,svelte}`,
            type: 'jsx',
          });
        }
      }
    }

    // If no standard JS dirs found, check src for any component files
    if (locations.length === 0) {
      const srcPath = resolve(this.root, 'src');
      if (existsSync(srcPath)) {
        const files = await glob('**/*.{tsx,jsx,vue,svelte}', {
          cwd: srcPath,
          ignore: ['**/*.test.*', '**/*.spec.*', '**/*.stories.*', '**/node_modules/**'],
        });

        if (files.length > 0) {
          locations.push({
            path: 'src',
            fileCount: files.length,
            pattern: 'src/**/*.{tsx,jsx,vue,svelte}',
            type: 'jsx',
          });
        }
      }
    }

    // Check template directories for server-side frameworks
    for (const { dir, ext, type } of TEMPLATE_DIRS) {
      const fullPath = resolve(this.root, dir);
      if (existsSync(fullPath) && statSync(fullPath).isDirectory()) {
        const files = await glob(`**/*.${ext}`, {
          cwd: fullPath,
          ignore: ['**/node_modules/**', '**/vendor/**', '**/cache/**'],
        });

        if (files.length > 0) {
          locations.push({
            path: dir,
            fileCount: files.length,
            pattern: `${dir}/**/*.${ext}`,
            type,
          });
        }
      }
    }

    return locations;
  }

  private async detectTokens(): Promise<TokenLocation[]> {
    const tokens: TokenLocation[] = [];
    const foundPaths = new Set<string>();

    // Check predefined token patterns first
    for (const { pattern, type, name } of TOKEN_PATTERNS) {
      const files = await glob(pattern, {
        cwd: this.root,
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/vendor/**'],
      });

      for (const file of files) {
        if (!foundPaths.has(file)) {
          foundPaths.add(file);
          tokens.push({
            path: file,
            type,
            name,
          });
        }
      }
    }

    // Scan ALL CSS files for :root with CSS variables
    const allCssFiles = await glob('**/*.css', {
      cwd: this.root,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/vendor/**', '**/*.min.css'],
    });

    for (const file of allCssFiles) {
      if (foundPaths.has(file)) continue;

      try {
        const content = readFileSync(resolve(this.root, file), 'utf-8');
        // Check if file has :root with CSS variables
        if (content.includes(':root') && content.includes('--')) {
          // Count how many CSS variables are defined
          const varMatches = content.match(/--[\w-]+\s*:/g);
          const varCount = varMatches ? varMatches.length : 0;

          if (varCount > 0) {
            foundPaths.add(file);
            tokens.push({
              path: file,
              type: 'css',
              name: `CSS variables (${varCount} tokens)`,
            });
          }
        }
      } catch {
        // ignore unreadable files
      }
    }

    // Also scan SCSS files for variables
    const allScssFiles = await glob('**/*.scss', {
      cwd: this.root,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/vendor/**'],
    });

    for (const file of allScssFiles) {
      if (foundPaths.has(file)) continue;

      try {
        const content = readFileSync(resolve(this.root, file), 'utf-8');
        // Check if file has SCSS variables ($ prefix)
        const varMatches = content.match(/\$[\w-]+\s*:/g);
        const varCount = varMatches ? varMatches.length : 0;

        if (varCount >= 5) { // Only include if it has multiple variables (likely a token file)
          foundPaths.add(file);
          tokens.push({
            path: file,
            type: 'scss',
            name: `SCSS variables (${varCount} tokens)`,
          });
        }
      } catch {
        // ignore unreadable files
      }
    }

    return tokens;
  }

  private async detectStorybook(): Promise<StorybookInfo | null> {
    const storybookDir = resolve(this.root, '.storybook');

    if (existsSync(storybookDir)) {
      const deps = this.getAllDeps();
      let version: string | null = null;

      // Find storybook version
      for (const [pkg, ver] of Object.entries(deps)) {
        if (pkg.startsWith('@storybook/') || pkg === 'storybook') {
          version = ver;
          break;
        }
      }

      return {
        configPath: '.storybook',
        version,
      };
    }

    return null;
  }

  private async detectDesignSystem(): Promise<DesignSystemInfo | null> {
    const deps = this.getAllDeps();

    for (const { package: pkg, type } of DESIGN_SYSTEMS) {
      // Handle prefix matching (like @radix-ui/react-)
      if (pkg.endsWith('-')) {
        for (const [depName, version] of Object.entries(deps)) {
          if (depName.startsWith(pkg)) {
            return {
              package: depName,
              version: version,
              type,
            };
          }
        }
      } else if (pkg in deps) {
        return {
          package: pkg,
          version: deps[pkg]!,
          type,
        };
      }
    }

    return null;
  }

  private async detectMonorepo(): Promise<MonorepoInfo | null> {
    // Check for pnpm workspaces
    const pnpmWorkspace = resolve(this.root, 'pnpm-workspace.yaml');
    if (existsSync(pnpmWorkspace)) {
      return {
        type: 'pnpm',
        packages: await this.findWorkspacePackages(),
      };
    }

    // Check for Turborepo
    const turboJson = resolve(this.root, 'turbo.json');
    if (existsSync(turboJson)) {
      return {
        type: 'turborepo',
        packages: await this.findWorkspacePackages(),
      };
    }

    // Check for Nx
    const nxJson = resolve(this.root, 'nx.json');
    if (existsSync(nxJson)) {
      return {
        type: 'nx',
        packages: await this.findWorkspacePackages(),
      };
    }

    // Check package.json workspaces (yarn/npm)
    if (this.packageJson && this.packageJson.workspaces) {
      return {
        type: 'yarn',
        packages: await this.findWorkspacePackages(),
      };
    }

    return null;
  }

  private async findWorkspacePackages(): Promise<string[]> {
    const packages: string[] = [];
    const packagesDir = resolve(this.root, 'packages');
    const appsDir = resolve(this.root, 'apps');

    for (const dir of [packagesDir, appsDir]) {
      if (existsSync(dir) && statSync(dir).isDirectory()) {
        const entries = readdirSync(dir);
        for (const entry of entries) {
          const pkgJson = resolve(dir, entry, 'package.json');
          if (existsSync(pkgJson)) {
            packages.push(`${basename(dir)}/${entry}`);
          }
        }
      }
    }

    return packages;
  }
}

// Helper to get a summary string
export function getDetectionSummary(project: DetectedProject): string[] {
  const summary: string[] = [];

  if (project.frameworks.length > 0) {
    if (project.frameworks.length === 1) {
      const fw = project.frameworks[0]!;
      const ts = fw.typescript ? ' + TypeScript' : '';
      summary.push(`${capitalize(fw.name)}${ts} project`);
    } else {
      // Multiple frameworks detected - framework sprawl
      const names = project.frameworks.map(f => capitalize(f.name)).join(', ');
      summary.push(`⚠️  Multiple frameworks: ${names}`);
    }
  }

  if (project.components.length > 0) {
    const total = project.components.reduce((sum, c) => sum + c.fileCount, 0);
    const paths = project.components.map(c => c.path).join(', ');
    summary.push(`${total} component files in ${paths}`);
  }

  if (project.tokens.length > 0) {
    summary.push(`${project.tokens.length} token source(s) found`);
  }

  if (project.storybook) {
    summary.push(`Storybook detected`);
  }

  if (project.designSystem) {
    summary.push(`Uses ${project.designSystem.package}`);
  }

  if (project.monorepo) {
    summary.push(`${capitalize(project.monorepo.type)} monorepo with ${project.monorepo.packages.length} packages`);
  }

  return summary;
}

// Helper to check if project has framework sprawl (multiple UI frameworks)
export function hasFrameworkSprawl(project: DetectedProject): boolean {
  // Only count UI/component frameworks, not backend frameworks
  const uiFrameworks = ['react', 'vue', 'svelte', 'angular', 'solid', 'preact', 'lit', 'stencil',
    'nextjs', 'nuxt', 'astro', 'remix', 'sveltekit', 'gatsby', 'react-native', 'expo', 'flutter'];

  const uiCount = project.frameworks.filter(f => uiFrameworks.includes(f.name)).length;
  return uiCount > 1;
}

// Get UI frameworks only (for sprawl detection)
export function getUIFrameworks(project: DetectedProject): FrameworkInfo[] {
  const uiFrameworks = ['react', 'vue', 'svelte', 'angular', 'solid', 'preact', 'lit', 'stencil',
    'nextjs', 'nuxt', 'astro', 'remix', 'sveltekit', 'gatsby', 'react-native', 'expo', 'flutter'];

  return project.frameworks.filter(f => uiFrameworks.includes(f.name));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
