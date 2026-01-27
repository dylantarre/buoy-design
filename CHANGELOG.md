# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.26] - 2026-01-26

### Fixed
- Next.js scanner now auto-enables in zero-config mode
- Projects with `next` dependency automatically use dedicated Next.js scanner

## [0.2.25] - 2026-01-26

### Added
- **Next.js Scanner** - Dedicated support for Next.js projects
  - Server vs client component detection (`'use client'` directive)
  - App Router structure scanning (pages, layouts, loading, error)
  - Route group and dynamic segment detection
  - CSS module analysis for hardcoded values
  - `next/image` usage validation
- Enhanced React scanner with hook usage detection
- Enhanced Vue scanner with Nuxt project info support
- Enhanced Angular scanner with NgModule and Material override detection
- Enhanced Tailwind scanner capabilities
- Enhanced Figma component scanner
- Enhanced Storybook story extraction
- Automated npm publishing workflow
- Workflow enforcement hooks for Claude Code

## [0.2.23] - 2026-01-23

### Added
- `ahoybuoy` wrapper package for shorter CLI command (`npx ahoybuoy begin`)

### Changed
- New tagline: "Catch design drift before it ships"

### Fixed
- Begin command now uses correct package reference
- Fixed duplicate menu text in begin wizard

## [0.2.20] - 2026-01-20

### Added
- **Self-Validating Agents** - Turn Claude Code into a self-correcting agent with `buoy dock hooks --claude`
- **Compound Component Grouping** - Scanners detect patterns like `Tabs`, `TabsList`, `TabsTrigger`
- Laravel-style Vue paths auto-detection (`resources/js/`)
- `.js` file support for React component detection
- Nested frontend directory detection for full-stack apps

### Fixed
- ESM compatibility for validation hooks (Node.js pipe buffer fix)
- Vue lowercase filename detection (`rate.vue` → `Rate`)
- Config merging with auto-detected frameworks

## [0.2.19] - 2026-01-19

### Added
- Laravel-style Vue paths to auto-detection (`resources/js/`)

### Fixed
- Detect Vue components with lowercase filenames
- ESM compatibility for validation hooks

## [0.2.18] - 2026-01-18

### Added
- Self-Validating Claude Code hooks (`buoy dock hooks --claude`)
- PostToolUse hook for automatic drift feedback

## [0.2.17] - 2026-01-17

### Added
- Compound component detection for all frameworks (React, Vue, Svelte, Angular)
- Directory-based grouping for component families

## [0.2.16] - 2026-01-16

### Added
- Compound component detection for React
- Name prefix detection for component grouping

## [0.2.15] - 2026-01-15

### Changed
- Improved configuration system
- Better framework auto-detection

## [0.2.14] - 2026-01-14

### Fixed
- Various bug fixes and improvements

## [0.2.0] - 2026-01-10

### Added
- Initial public release
- React, Vue, Svelte, Angular component scanning
- Design token extraction (CSS, SCSS, Tailwind, JSON)
- Drift detection engine
- `buoy show` commands for AI agents
- `buoy begin` interactive wizard
- `buoy dock` project configuration
- `buoy check` pre-commit hook support
- `buoy baseline` for brownfield projects
- `buoy fix` automated fixes
- GitHub Actions integration
- Figma plugin support

[0.2.26]: https://github.com/ahoybuoy/buoy/releases/tag/v0.2.26
[0.2.25]: https://github.com/ahoybuoy/buoy/releases/tag/v0.2.25
[0.2.23]: https://github.com/ahoybuoy/buoy/releases/tag/v0.2.23
[0.2.20]: https://github.com/ahoybuoy/buoy/releases/tag/v0.2.20
[0.2.19]: https://github.com/ahoybuoy/buoy/releases/tag/v0.2.19
[0.2.18]: https://github.com/ahoybuoy/buoy/releases/tag/v0.2.18
[0.2.17]: https://github.com/ahoybuoy/buoy/releases/tag/v0.2.17
[0.2.16]: https://github.com/ahoybuoy/buoy/releases/tag/v0.2.16
[0.2.15]: https://github.com/ahoybuoy/buoy/releases/tag/v0.2.15
[0.2.14]: https://github.com/ahoybuoy/buoy/releases/tag/v0.2.14
[0.2.0]: https://github.com/ahoybuoy/buoy/releases/tag/v0.2.0
