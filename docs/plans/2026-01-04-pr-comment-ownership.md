# PR Comment Ownership

## Summary

Add author attribution to PR comments so drift signals are grouped by who introduced them.

## Decisions

| Question | Decision |
|----------|----------|
| Display format | Group by author (not by severity) |
| When to fetch blame | Only when signals found |
| Author identity | Git author name (no @mentions) |
| Layout | Author sections first, severity as column |

## Data Flow

```
getChangedFiles() → getFileContent() → scanFileContent()
                                            ↓
                                  (files with signals)
                                            ↓
                                    getFileBlame() ← NEW
                                            ↓
                            enrichSignalsWithAuthors() ← NEW
                                            ↓
                                    formatComment() (updated)
```

## Implementation

### 1. New file: `apps/api/src/lib/github-blame.ts`

- `getFileBlame()` - GitHub GraphQL blame query
- `enrichSignalsWithAuthors()` - match signals to blame data

### 2. Update: `apps/api/src/lib/scanner.ts`

- Add `author?: string` to `DriftSignal` type

### 3. Update: `apps/api/src/lib/pr-comment.ts`

- Group signals by author instead of severity
- New format with author headings

### 4. Update: `apps/api/src/queue.ts`

- Call `enrichSignalsWithAuthors()` after scanning

## Comment Format

```markdown
## Buoy Design Drift Report

**4 new issues** in this PR

### Bob Smith (3 issues)

| Severity | File | Line | Issue |
|----------|------|------|-------|
| error | `Button.tsx` | 45 | Hardcoded color #ff0000 |
| warning | `Button.tsx` | 52 | Arbitrary Tailwind: p-[17px] |

### Alice Chen (1 issue)

| Severity | File | Line | Issue |
|----------|------|------|-------|
| warning | `Modal.tsx` | 67 | Inline style with hardcoded color |
```

## API Cost

- 1 GraphQL call per file with drift signals
- Only called when signals exist (no cost for clean files)
- Typical PR: 2-5 blame calls
