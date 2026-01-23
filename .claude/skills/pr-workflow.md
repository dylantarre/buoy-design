---
name: pr-workflow
description: Use when creating pull requests or merging code. Enforces the PR review and merge workflow.
---

# Pull Request Workflow

This skill enforces the complete PR workflow for Buoy.

## Before Creating a PR

### 1. Ensure Quality

```bash
pnpm build      # Must pass
pnpm test       # Must pass
pnpm typecheck  # Must pass
```

### 2. Update Documentation

If your changes affect:
- **User-facing behavior**: Update README.md
- **CLI commands**: Update README.md command reference
- **Contributing process**: Update CONTRIBUTING.md
- **Any feature/fix**: Add entry to CHANGELOG.md under `[Unreleased]`

### 3. Self-Review

Before creating PR, check:
- [ ] No console.logs or debug code left behind
- [ ] No commented-out code
- [ ] Error handling is appropriate
- [ ] Types are correct (no `any` without good reason)

## Creating the PR

### PR Title Format

```
<type>: <short description>

Types:
- feat: New feature
- fix: Bug fix
- docs: Documentation only
- chore: Maintenance (deps, build, etc.)
- refactor: Code change that doesn't fix/add
- test: Adding tests
```

### PR Body Template

```markdown
## Summary
Brief description of what this PR does.

## Changes
- Bullet point list of changes

## Testing
How was this tested?

## Checklist
- [ ] Tests pass
- [ ] Build passes
- [ ] CHANGELOG.md updated
- [ ] Documentation updated (if needed)
```

## Review Process

### For Reviewers

1. Check that CI passes
2. Review code for:
   - Correctness
   - Design system compliance (run `buoy check`)
   - Error handling
   - Edge cases
3. Test locally if significant changes

### For Authors

1. Respond to all comments
2. Re-request review after changes
3. Don't merge until approved

## Merging

### Merge Rules

1. **Squash merge** for feature branches (keeps history clean)
2. **Rebase merge** only if commit history is meaningful
3. **Never force push** to main

### Post-Merge

1. Delete the feature branch
2. If this is a release-worthy change, consider running `/release`
3. Verify CI passes on main

## Branch Naming

```
feature/short-description
fix/issue-description
docs/what-changed
chore/maintenance-task
```

## Quick Commands

```bash
# Create PR
gh pr create --title "feat: description" --body "..."

# Check PR status
gh pr status

# Merge PR (squash)
gh pr merge --squash

# View PR checks
gh pr checks
```
