# Buoy Development Workflow

This document defines the required workflows for all development on Buoy. Claude Code hooks enforce these automatically.

## Quick Reference

| Action | Skill/Command |
|--------|---------------|
| Making a release | `/release` |
| Creating a PR | `/pr-workflow` |
| Checking drift | `buoy check` |

## Enforced Rules

### 1. Changelog Updates (Enforced)

**Every commit that changes behavior must update CHANGELOG.md.**

The `workflow-check.js` hook reminds you before commits if CHANGELOG.md hasn't been staged.

```markdown
## [Unreleased]

### Added
- New feature here

### Fixed
- Bug fix here
```

### 2. Version Synchronization (Enforced)

These packages MUST have matching versions:
- `@buoy-design/cli` ↔ `ahoybuoy`

These packages SHOULD have matching versions:
- `@buoy-design/core` ↔ `@buoy-design/scanners`

### 3. Design System Compliance (Enforced)

The `buoy-validate.js` hook runs after every Edit/Write on UI files. If drift is detected, feedback is provided automatically.

### 4. Build Before Commit (Recommended)

```bash
pnpm build && pnpm test
```

## Development Flow

```
┌─────────────────────────────────────────────────────────────┐
│  1. Make Changes                                            │
│     - Edit code                                             │
│     - buoy-validate.js runs automatically on UI files       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Update CHANGELOG.md                                     │
│     - Add entry under [Unreleased]                          │
│     - workflow-check.js reminds if forgotten                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Test & Build                                            │
│     - pnpm build                                            │
│     - pnpm test                                             │
│     - pnpm typecheck                                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Commit                                                  │
│     - Use conventional commit format                        │
│     - feat: / fix: / docs: / chore:                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  5. Push & PR (if feature branch)                           │
│     - Use /pr-workflow skill                                │
│     - Wait for CI                                           │
│     - Get review                                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  6. Release (when ready)                                    │
│     - Use /release skill                                    │
│     - Bumps versions                                        │
│     - Creates GitHub release                                │
│     - Auto-publishes to npm                                 │
└─────────────────────────────────────────────────────────────┘
```

## Release Flow

Releases are triggered by creating a GitHub Release:

1. **Bump versions** in package.json files
2. **Update CHANGELOG.md** - move [Unreleased] to version header
3. **Commit** with message `chore: bump versions for vX.Y.Z release`
4. **Push** to main
5. **Create GitHub Release** via `gh release create`
6. **Automated publish** via `.github/workflows/publish.yml`
7. **Verify** packages on npm

Use `/release` skill to ensure all steps are followed.

## Hooks Reference

### SessionStart
- Loads design system context
- Reminds about `buoy dock agents` if not configured

### PreToolUse (git commit)
- Checks if CHANGELOG.md is staged
- Checks version synchronization
- Provides reminders (non-blocking)

### PostToolUse (Edit/Write)
- Runs `buoy check` on UI files
- Provides drift feedback to Claude
- Enables self-correction

## Skills Reference

### /release
Complete release workflow from version bump to npm publish.

### /pr-workflow
PR creation and review workflow with checklists.

## Common Issues

### "CHANGELOG.md not updated"
Add an entry under `[Unreleased]` before committing:
```markdown
## [Unreleased]

### Added/Changed/Fixed
- Your change here
```

### "Version sync issues"
Ensure `apps/cli/package.json` and `apps/ahoybuoy/package.json` have the same version.

### "npm publish failed"
1. Check NPM_TOKEN secret in GitHub
2. Ensure versions don't already exist on npm
3. Try manual publish: `pnpm --filter <package> publish --access public`
