# PR Template

Use this template when generating PRs for design drift fixes.

## Title Format

```
fix: Use design tokens for [component/area]
```

Examples:
- `fix: Use design tokens for Button colors`
- `fix: Replace hardcoded spacing with theme values`
- `fix: Align Card component with design system`

## Body Template

```markdown
## Summary

[1-2 sentences describing what this PR changes]

## Why This Matters

[Explain the benefits - pick relevant ones]
- **Maintainability**: Update values globally instead of hunting through files
- **Consistency**: Matches other components already using tokens
- **Theming**: Enables dark mode / custom themes without code changes
- **Accessibility**: Design tokens often encode accessible color contrasts

## Changes

[List each change with file:line and before/after]
- `Button.tsx:23`: `#3182ce` → `colors.primary.500`
- `Card.tsx:45`: `16px` → `spacing.4`

## Context

[Reference git history if relevant]
Git history shows these values were introduced in [commit/PR] during [context].
[State whether this appears intentional or accidental]

## Testing

- [ ] Visual regression looks correct
- [ ] Component behavior unchanged
- [ ] Tokens resolve to expected values

## Cherry-picking

[Include if PR touches 3+ files]
If you prefer to merge incrementally, each file is changed in a separate commit:
- `abc123` - Button.tsx changes only
- `def456` - Card.tsx changes only

---

*Found with [Buoy](https://github.com/buoy-design/buoy) - design drift detection for AI-generated code.*
```

## Tone Guidelines

1. **Be helpful, not preachy** - Focus on practical benefits
2. **Be specific** - Reference exact files and values
3. **Be humble** - Acknowledge maintainers know their codebase
4. **Be grateful** - Thank them for maintaining an open source project

## Don't Include

- Criticism of the existing code
- Multiple unrelated changes
- Changes to files not related to design drift
- Promises about future contributions
- Marketing language beyond the subtle footer
