---
name: release
description: Use when preparing a new release of Buoy packages. Enforces the complete release workflow including changelog, version bumps, testing, and publishing.
---

# Release Workflow

This skill enforces the complete Buoy release process. Follow these steps IN ORDER.

## Pre-Release Checklist

Before starting, verify:
- [ ] All changes are committed
- [ ] Tests pass (`pnpm test`)
- [ ] Build succeeds (`pnpm build`)
- [ ] You're on the `main` branch

## Step 1: Update CHANGELOG.md

**REQUIRED** - Never skip this step.

1. Move items from `[Unreleased]` to a new version section
2. Add the release date
3. Categorize changes: Added, Changed, Fixed, Removed

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- New feature description

### Changed
- Changed behavior description

### Fixed
- Bug fix description
```

## Step 2: Bump Versions

Version rules:
- `@buoy-design/cli` and `ahoybuoy` MUST have matching versions
- `@buoy-design/core` and `@buoy-design/scanners` SHOULD have matching versions
- Use semver: patch for fixes, minor for features, major for breaking changes

Files to update:
- `apps/cli/package.json`
- `apps/ahoybuoy/package.json`
- `packages/core/package.json` (if core changed)
- `packages/scanners/package.json` (if scanners changed)

## Step 3: Build and Test

```bash
pnpm build
pnpm test
pnpm typecheck
```

All must pass before proceeding.

## Step 4: Commit Version Bump

```bash
git add -A
git commit -m "chore: bump versions for vX.Y.Z release"
git push origin main
```

## Step 5: Create GitHub Release

```bash
gh release create vX.Y.Z --title "vX.Y.Z" --notes "$(cat <<'EOF'
## What's New

[Copy relevant section from CHANGELOG.md]

## Install

\`\`\`bash
npx ahoybuoy begin
\`\`\`
EOF
)"
```

The GitHub release will trigger automated npm publishing via `.github/workflows/publish.yml`.

## Step 6: Verify npm Publish

Wait 2-3 minutes, then verify:

```bash
npm view ahoybuoy@X.Y.Z
npm view @buoy-design/cli@X.Y.Z
```

## Step 7: Test Published Package

```bash
cd /tmp && rm -rf test-release && mkdir test-release && cd test-release
npm init -y
npm install ahoybuoy@X.Y.Z
npx ahoybuoy --version
```

## Rollback Procedure

If something goes wrong:

1. **npm publish failed**: Fix the issue, bump patch version, re-release
2. **Broken package**: `npm deprecate ahoybuoy@X.Y.Z "broken release, use X.Y.Z+1"`
3. **Wrong version**: Can't unpublish after 72 hours, publish new patch

## Quick Reference

| Package | Location | Notes |
|---------|----------|-------|
| `ahoybuoy` | `apps/ahoybuoy/` | Wrapper, version matches CLI |
| `@buoy-design/cli` | `apps/cli/` | Main CLI |
| `@buoy-design/core` | `packages/core/` | Domain models |
| `@buoy-design/scanners` | `packages/scanners/` | Framework scanners |
