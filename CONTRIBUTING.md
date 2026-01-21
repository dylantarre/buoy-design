# Contributing to Buoy

Thanks for your interest in contributing to Buoy! This document covers how to get started.

## Reporting Issues

- **Bugs**: Open an issue with steps to reproduce, expected vs actual behavior
- **Feature requests**: Open an issue describing the use case and proposed solution
- **Questions**: Use GitHub Discussions (if enabled) or open an issue

## Development Setup

```bash
# Clone the repo
git clone https://github.com/ahoybuoy/buoy.git
cd buoy

# Install dependencies (requires pnpm)
pnpm install

# Build all packages
pnpm build

# Run the CLI locally
node apps/cli/dist/bin.js status
```

## Project Structure

```
buoy/
├── apps/
│   └── cli/           # CLI application (@ahoybuoy/cli)
├── packages/
│   ├── core/          # Domain models & analysis (@ahoybuoy/core)
│   ├── scanners/      # Source scanners (@ahoybuoy/scanners)
│   └── db/            # Database layer (@ahoybuoy/db)
└── docs/              # Documentation
```

## Submitting Changes

1. Fork the repo
2. Create a branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run the build (`pnpm build`)
5. Commit with a descriptive message
6. Push to your fork
7. Open a Pull Request

## Code Style

- We use Prettier for formatting: `pnpm format`
- TypeScript strict mode is enabled
- Keep changes focused - one feature/fix per PR

## Adding Framework Support

To add a new framework scanner:

1. Add scanner in `packages/scanners/src/git/`
2. Export from `packages/scanners/src/git/index.ts`
3. Add detection in `apps/cli/src/detect/project-detector.ts`
4. Wire up in `apps/cli/src/commands/scan.ts` and `status.ts`
5. Document in `docs/INTEGRATIONS.md`

## Adding Drift Detection

To add a new drift type:

1. Add to `DriftTypeSchema` in `packages/core/src/models/drift.ts`
2. Add detection logic in `packages/core/src/analysis/semantic-diff.ts`
3. Document in `FEATURES.md`

## Questions?

Open an issue or reach out. We're happy to help!
