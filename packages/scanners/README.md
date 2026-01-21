# @ahoybuoy/scanners

Framework-specific code scanners for Buoy. Extracts components and design tokens from React, Vue, Svelte, Angular, and more.

## Installation

```bash
npm install @ahoybuoy/scanners
```

## Supported Frameworks

- **React** - JSX/TSX components
- **Vue** - Single File Components
- **Svelte** - .svelte files
- **Angular** - @Component decorators
- **Web Components** - Lit, Stencil
- **Tailwind** - Config parsing, arbitrary value detection
- **Templates** - Blade, ERB, Twig

## Usage

```typescript
import { createReactScanner } from '@ahoybuoy/scanners';

const scanner = createReactScanner({
  include: ['src/**/*.tsx'],
  exclude: ['**/*.test.*'],
});

const components = await scanner.scan();
```

## Links

- [Buoy CLI](https://www.npmjs.com/package/@ahoybuoy/cli)
- [Documentation](https://buoy.design/docs)
