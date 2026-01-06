# Buoy Contribution System Design

**Date:** 2026-01-04
**Status:** Draft

## Overview

Replace buoy-testing-suite with a simpler architecture:
- **Agents** (TypeScript in `packages/agents/`) - The reusable AI brains
- **Skills** (Markdown in `skills/`) - Claude Code orchestration via Ralph Wiggum

The testing suite's 2000+ lines of orchestration code disappears. Claude Code IS the orchestrator.

## Goals

1. Find real-world apps using design systems (not framework libraries)
2. Identify fixable drift (hardcoded values, inconsistent tokens)
3. Generate meaningful PRs with full context (git history, why it matters)
4. Stage for human review before submission
5. Track acceptance to improve Buoy

## Architecture

```
buoy/
├── packages/
│   ├── core/                 # Existing - domain models
│   ├── scanners/             # Existing - framework scanners
│   ├── db/                   # Existing - persistence
│   └── agents/               # NEW - AI agent logic
│       ├── src/
│       │   ├── history.ts        # Git blame, commit analysis
│       │   ├── review.ts         # Codebase gap analysis
│       │   ├── acceptance.ts     # PR acceptance prediction
│       │   ├── fixability.ts     # Fix difficulty assessment
│       │   ├── generator.ts      # Code fix + PR generation
│       │   ├── prompts/          # Agent prompt templates
│       │   │   ├── history.ts
│       │   │   ├── review.ts
│       │   │   └── ...
│       │   ├── types.ts          # Shared types
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── apps/
│   └── cli/                  # Can use agents for `buoy explain`
│
└── skills/                   # NEW - Claude Code skills
    └── contribution-loop/
        ├── SKILL.md              # Main orchestration skill
        ├── references/
        │   ├── discovery.md      # How to find repos
        │   ├── pr-template.md    # PR description format
        │   └── acceptance-criteria.md
        └── scripts/
            └── validate-state.sh  # State validation helper
```

## What Migrates from Testing Suite

### Valuable Code → `packages/agents/`

| Testing Suite File | Becomes | Purpose |
|-------------------|---------|---------|
| `assessment/prompts.ts` | `agents/src/prompts/review.ts` | Coverage analysis prompts |
| `assessment/assessor.ts` | `agents/src/review.ts` | Codebase review agent |
| `assessment/context.ts` | `agents/src/context.ts` | File sampling, context building |
| `improvement/gap-analyzer.ts` | `agents/src/fixability.ts` | Gap analysis, fix assessment |
| `assessment/types.ts` | `agents/src/types.ts` | Shared type definitions |

### Orchestration → Dies (Skill replaces)

| Testing Suite File | Fate |
|-------------------|------|
| `discovery/github-search.ts` | Skill uses Octokit via Bash |
| `execution/runner.ts` | Skill runs `buoy sweep` directly |
| `improvement/runner.ts` | Ralph Wiggum IS the runner |
| `improvement/state.ts` | State in `.buoy/contributions/` |
| `cli.ts` | Not needed |

### Assets → `skills/contribution-loop/references/`

| Testing Suite Asset | Becomes |
|--------------------|---------|
| Ground truth patterns | `references/known-patterns.md` |
| PR templates | `references/pr-template.md` |
| Discovery criteria | `references/discovery.md` |

## Agent Specifications

### 1. History Agent (`packages/agents/src/history.ts`)

```typescript
interface HistoryInput {
  repoPath: string;
  filePath: string;
  lineRange?: [number, number];
}

interface HistoryResult {
  verdict: 'accidental' | 'intentional' | 'ai-generated' | 'unknown';
  timeline: Array<{
    date: string;
    author: string;
    commit: string;
    message: string;
    prNumber?: number;
  }>;
  context: string;        // Narrative explanation
  confidence: number;     // 0-1
}

export class HistoryAgent {
  async analyze(input: HistoryInput): Promise<HistoryResult>;
}
```

**What it does:**
- Runs `git blame` and `git log` on target file
- Analyzes commit messages, PR references
- Determines if drift was accidental (dev didn't know) or intentional (deliberate override)
- Detects AI-generated code patterns

### 2. Review Agent (`packages/agents/src/review.ts`)

```typescript
interface ReviewInput {
  repoPath: string;
  buoyOutput: BuoyOutput;
  sampledFiles: Array<{ path: string; content: string }>;
}

interface ReviewResult {
  missedPatterns: Array<{
    category: 'component' | 'token' | 'drift';
    description: string;
    file: string;
    lineRange?: [number, number];
    suggestedDetection: string;
  }>;
  improvements: Array<{
    area: 'scanner' | 'config' | 'drift-rules';
    title: string;
    description: string;
    impact: string;
  }>;
  confidence: number;
}

export class ReviewAgent {
  async analyze(input: ReviewInput): Promise<ReviewResult>;
}
```

**What it does:**
- Reviews what Buoy found vs what's in the repo
- Finds patterns Buoy missed
- Suggests scanner improvements
- Feeds back to Buoy development

### 3. Acceptance Agent (`packages/agents/src/acceptance.ts`)

```typescript
interface AcceptanceInput {
  repoOwner: string;
  repoName: string;
  contributingMd?: string;
  recentPRs: Array<{ merged: boolean; author: string; daysOpen: number }>;
  maintainerActivity: { commitsLastMonth: number; prsReviewedLastMonth: number };
}

interface AcceptanceResult {
  likelihood: 'high' | 'medium' | 'low';
  score: number;           // 0-100
  reasoning: string;
  suggestedApproach: string;
  redFlags: string[];
  greenFlags: string[];
}

export class AcceptanceAgent {
  async predict(input: AcceptanceInput): Promise<AcceptanceResult>;
}
```

**What it does:**
- Analyzes repo's contribution culture
- Checks PR acceptance rate, maintainer activity
- Reads CONTRIBUTING.md for requirements
- Predicts likelihood of PR being merged

### 4. Fixability Agent (`packages/agents/src/fixability.ts`)

```typescript
interface FixabilityInput {
  signal: DriftSignal;
  fileContent: string;
  historyContext: HistoryResult;
  surroundingCode: string;
}

interface FixabilityResult {
  tier: 'slam-dunk' | 'review' | 'skip';
  difficulty: 'one-liner' | 'moderate' | 'complex';
  reasoning: string;
  intentional: boolean;
  safeToFix: boolean;
  suggestedFix?: string;
}

export class FixabilityAgent {
  async assess(input: FixabilityInput): Promise<FixabilityResult>;
}
```

**What it does:**
- For each drift signal, assesses fix difficulty
- Checks if drift is intentional (comments, git history)
- Determines if fix is safe (no breaking changes)
- Categorizes into tiers for processing

### 5. Generator Agent (`packages/agents/src/generator.ts`)

```typescript
interface GeneratorInput {
  repo: { owner: string; name: string };
  signals: Array<DriftSignal & FixabilityResult>;
  historyContext: Map<string, HistoryResult>;
  acceptanceContext: AcceptanceResult;
}

interface GeneratorResult {
  fixes: Array<{
    file: string;
    diff: string;
    explanation: string;
  }>;
  prTitle: string;
  prBody: string;
  confidence: number;
  cherryPickNote?: string;  // If large PR, how to split
}

export class GeneratorAgent {
  async generate(input: GeneratorInput): Promise<GeneratorResult>;
}
```

**What it does:**
- Generates actual code fixes
- Writes PR title and description
- Includes full context (git history, why it matters)
- Adds Buoy attribution subtly

## Skill Specification

### `skills/contribution-loop/SKILL.md`

```markdown
---
name: buoy-contribution-loop
description: >
  Autonomous loop to find and fix design drift in open source repos.
  Discovers apps using design systems, scans with Buoy, generates PRs.
  Use when you want to contribute to open source while testing Buoy.
compatibility: Requires GITHUB_TOKEN and ANTHROPIC_API_KEY in environment
---

# Buoy Contribution Loop

You are running an autonomous contribution loop for Buoy.

## Mission

Find real-world apps that use design systems but have drift (hardcoded values,
inconsistent tokens). Generate meaningful PRs to fix these issues, demonstrating
Buoy's value while contributing to open source.

## Critical Constraints

- ONLY target apps using design systems, NOT design system libraries
- ONLY fix clear drift (hardcoded colors, arbitrary Tailwind values)
- NEVER submit PRs without human review
- ALWAYS explain WHY the fix matters (git history, consistency)
- RESPECT rate limits (max 10 repos per run)

## State Location

All state lives in `.buoy/contributions/`:
- `queue.json` - Repos to process
- `processed.json` - Completed repos
- `pending-prs/` - PRs awaiting human review

## Loop Steps

### Phase 1: Discovery

[Load references/discovery.md for full criteria]

Search GitHub for repos matching:
- Uses: Chakra, Tailwind, shadcn, Mantine, Radix (in package.json)
- Stars: 50-3000
- Activity: Commit in last 30 days
- Culture: CONTRIBUTING.md exists OR >50% PR merge rate
- NOT: Is a design system library itself

For each candidate:
1. Check package.json for design system deps
2. Verify it's an app (has /app, /src/pages, /dashboard, etc.)
3. Check PR merge rate
4. Add to queue if promising

### Phase 2: Scan & Assess

For each repo in queue:

1. **Clone**
   ```bash
   git clone --depth 1 <repo-url> .buoy/repos/<owner>/<name>
   ```

2. **Scan with Buoy**
   ```bash
   cd .buoy/repos/<owner>/<name>
   buoy sweep --json > scan.json
   buoy drift check --json > drift.json
   ```

3. **Review with Agent** (spawn Task for CodebaseReviewAgent)
   - Did Buoy catch everything?
   - Any gaps to log for Buoy improvement?

4. **Assess Each Signal** (spawn Tasks in parallel for FixabilityAgent)
   - Is it intentional or accidental?
   - How hard is the fix?
   - Check git history for context

5. **Filter to Actionable**
   - Only proceed with "slam-dunk" and "review" tier fixes
   - Skip intentional drift
   - Skip complex refactors

### Phase 3: Generate PR

For repos with actionable fixes:

1. **Predict Acceptance** (AcceptanceAgent)
   - Is this repo likely to merge?
   - What approach to take?

2. **Generate Fixes** (GeneratorAgent)
   - Create code diffs
   - Write PR description with full context
   - Include cherry-pick note if large

3. **Stage for Review**
   Save to `.buoy/contributions/pending-prs/<owner>-<name>/`:
   - `fixes.patch` - The actual code changes
   - `pr.md` - PR title and body
   - `context.json` - All agent outputs

### Phase 4: Human Review

STOP and notify human. Display:
- List of pending PRs
- Summary of each (files changed, fix types)
- Confidence scores

Human can:
- Approve → Submit PR via `gh pr create`
- Edit → Modify before submitting
- Reject → Mark as skipped with reason

### Phase 5: Track

After human submits:
- Log PR URL to `processed.json`
- Monitor for merge/close (future: TrackerAgent)

## Exit Conditions

- Queue empty
- 10 repos processed this run
- Human intervention requested
- Error threshold exceeded (3 consecutive failures)

## Agent Invocation

Use the Task tool to spawn agents:

```
Task(subagent_type="general-purpose", prompt="
  You are the HistoryAgent. Analyze git history for:
  File: <path>
  Repo: <repo-path>

  Run git blame and git log, then determine if drift was
  accidental, intentional, or AI-generated.

  Return JSON: { verdict, timeline, context, confidence }
")
```

## PR Template

[Load references/pr-template.md for full template]

## Error Handling

- Clone fails → Skip repo, log error
- Buoy fails → Skip repo, log for investigation
- Agent fails → Retry once, then skip signal
- GitHub rate limit → Pause 60s, then continue
```

### `skills/contribution-loop/references/pr-template.md`

```markdown
# PR Template

## Title Format
```
fix: Replace hardcoded [type] with design tokens
```

## Body Template

```markdown
## Summary

This PR replaces [N] hardcoded values with their corresponding design tokens,
improving consistency across the codebase.

### Changes

| File | Line | Before | After |
|------|------|--------|-------|
| `path/to/file.tsx` | 23 | `#3B82F6` | `primary` |

### Why This Matters

[Explain using git history context]
- These values were added in [commit/PR]
- The design token exists in [location]
- [N] other components use the token correctly

### Context

- Your theme defines these tokens in `[path]`
- This change maintains visual parity while improving maintainability
- If you update your theme, these components will now follow

### How I Found This

Scanned with [Buoy](https://github.com/buoy-design/buoy), a design system
drift detector. Happy to run it on other areas if helpful.

---
*Generated with assistance from Buoy's contribution system.*
```

## Note for Large PRs

If this PR touches many files, feel free to cherry-pick specific changes.
Each fix is independent and can be merged separately.
```

### `skills/contribution-loop/references/discovery.md`

```markdown
# Discovery Criteria

## Must Have (Required)
- [ ] Uses a known design system (Chakra, Tailwind, shadcn, Mantine, Radix)
- [ ] Is an APPLICATION, not a library
- [ ] Has commit in last 30 days
- [ ] Stars: 50-3000

## Should Have (Weighted)
- CONTRIBUTING.md exists (+2)
- PR merge rate >50% (+2)
- Good first issue labels used (+1)
- Active maintainer (reviews PRs within 7 days) (+2)

## Must NOT Have
- Is the design system itself (e.g., chakra-ui/chakra-ui)
- Is a fork of another repo
- Is archived
- Has "not accepting PRs" in README

## How to Detect "Is an App"

Look for:
- `/app` or `/src/pages` directory (Next.js app)
- `/dashboard` or `/admin` directory
- `next.config.js` or `vite.config.ts`
- Routes/pages structure
- Database config (prisma, drizzle)

NOT an app if:
- Only has `/packages` with component exports
- Main export is a React component
- README says "component library" or "design system"
```

## Implementation Order

### Phase 1: Create `packages/agents`

1. Create package structure
2. Migrate types from testing-suite
3. Implement HistoryAgent (uses simple-git)
4. Implement ReviewAgent (migrate prompts.ts)
5. Implement FixabilityAgent (migrate gap-analyzer.ts)
6. Implement AcceptanceAgent (new)
7. Implement GeneratorAgent (new)
8. Add tests

### Phase 2: Create skill

1. Create `skills/contribution-loop/` structure
2. Write SKILL.md
3. Write reference docs
4. Test with single repo manually

### Phase 3: Validate

1. Run on 5-10 repos
2. Compare to old testing-suite results
3. Iterate on prompts
4. Fix issues

### Phase 4: Deprecate testing-suite

1. Archive buoy-testing-suite repo
2. Document migration in README
3. Update any references

## Open Questions

1. **State persistence**: Should we use `.buoy/` in current dir or a global location?
2. **Rate limiting**: How to handle GitHub API limits gracefully in skill?
3. **Parallel agents**: How many repos to process in parallel?
4. **Human notification**: How to alert when PRs are ready for review?

## Success Metrics

- PRs generated with >80% human approval rate
- PRs submitted with >50% merge rate
- Buoy improvements logged from gaps found
- Time to generate PR: <5 minutes per repo
