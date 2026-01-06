# Buoy Testing Suite Design

**Date:** 2025-12-29
**Status:** Approved

## Overview

**buoy-testing-suite** is a standalone repository that stress-tests Buoy against real-world open source projects to:

1. **Accuracy benchmarking** - Measure false positive/negative rates by running Buoy on projects with known design systems and validating what it finds
2. **Coverage discovery** - Identify gaps in what Buoy can parse (new frameworks, token formats, component patterns)
3. **Feature inspiration** - Discover drift patterns that exist in the wild but Buoy doesn't detect yet

### Key Constraint

Every test repo must have **paired data** - both a design system definition (Storybook, tokens, Figma) AND application code that should conform to it.

### Phased Evolution

```
Phase 1: Local/containerized test harness → validate Buoy accuracy
Phase 2: Buoy Bot → fork repos, submit real fix PRs
Phase 3: Closed loop → PR acceptance rates feed back into accuracy metrics
```

---

## Repo Discovery System

### Discovery Pipeline

```
GitHub Search API → Filter → Score → Validate → Registry
```

### Design System Signals (weighted)

| Signal | Points | Detection Method |
|--------|--------|------------------|
| `.storybook/` directory | +3 | GitHub code search |
| `tokens.json` or `design-tokens.*` | +3 | File path search |
| `/packages/ui` or `/packages/design-system` | +3 | Path patterns |
| `variables.css` or `theme.css` | +2 | File search |
| Figma plugin config or `.figma*` files | +2 | File search |
| `tailwind.config.*` with custom theme | +2 | Content search |
| `src/` or `app/` alongside above | +2 | Confirms app code exists |

### Activity & Contribution Signals

| Signal | Points | Detection Method |
|--------|--------|------------------|
| Commit in last 30 days | +2 | GitHub API |
| `CONTRIBUTING.md` exists | +2 | File check |
| "good first issue" label used | +1 | Label API |
| >50% PR acceptance rate | +2 | PR API sampling |
| >100 stars | +1 | Repo metadata |

**Minimum threshold:** Repos scoring <5 points are excluded.

### Registry Output

```json
{
  "repos": [
    {
      "url": "github.com/org/repo",
      "score": 12,
      "signals": ["storybook", "tokens", "contributing"],
      "lastUpdated": "2025-12-20"
    }
  ]
}
```

---

## Test Execution Pipeline

### Two Execution Modes

**Local Mode (quick iteration)**
```bash
buoy-test run github.com/org/repo    # Test single repo
buoy-test run --top 10               # Test top N from registry
```
- Clones to `./repos/<org>/<repo>`
- Runs `buoy sweep` and `buoy drift check`
- Outputs to `./results/<org>/<repo>/`

**Container Mode (full suite)**
```bash
buoy-test run --all --containerized
```
- Spins up Docker container per repo
- Parallel execution (configurable concurrency)
- Isolated environments (no dependency conflicts)
- Results collected to shared volume

### Execution Steps Per Repo

1. Clone repo (shallow, default branch only)
2. Detect design system sources (Storybook, tokens, Figma)
3. Detect application code locations
4. Run: `buoy init --auto` (generates config)
5. Run: `buoy sweep --json > scan.json`
6. Run: `buoy drift check --json > drift.json`
7. Run: `buoy sweep --json > status.json`
8. Generate report (all 3 formats)
9. Cleanup or cache (configurable)

**Caching:** Repos are cached locally. Re-runs only pull if repo has new commits since last test.

**Timeout:** 5 minutes per repo max. Repos that hang are flagged for investigation.

---

## Agent Architecture

### Core Philosophy

Agents are **single-purpose, composable units**. Each agent:
- Does one thing well
- Has a clear input/output contract
- Can be combined with other agents
- Works standalone or orchestrated

### Agent Interface

```typescript
interface AgentContext {
  repo: RepoMetadata;
  files: FileContent[];      // Relevant source files
  signals?: DriftSignal[];   // From Buoy, if applicable
}

interface AgentResult {
  agentId: string;
  summary: string;           // 1-2 sentence takeaway
  findings: Finding[];       // Structured observations
  confidence: number;        // 0-1 how confident in analysis
  rawAnalysis: string;       // Full Claude response for transparency
}

interface Finding {
  type: string;
  location?: string;         // file:line if applicable
  observation: string;
  recommendation?: string;
  evidence: string[];        // Supporting quotes/data
}
```

### The Three Agents

| Agent | Input | Output | Reused In |
|-------|-------|--------|-----------|
| **CodebaseReviewAgent** | Files, drift signals | Code quality findings, pattern analysis, intentionality assessment | `buoy explain`, testing suite, PR review |
| **HistoryReviewAgent** | Git log, blame, PR history | Evolution narrative, maintenance patterns, context for current state | `buoy explain`, testing suite, `buoy drift explain` |
| **AcceptanceAgent** | Contribution docs, PR history, maintainer patterns | Likelihood score, framing suggestions, PR template | Testing suite, Buoy Bot |

### Agent Flow

```
┌─────────────────────────────────────────────────────────┐
│                    Claude Analysis                       │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Codebase    │  │   History    │  │  Acceptance  │  │
│  │  Review      │  │   Review     │  │  Predictor   │  │
│  │  Agent       │  │   Agent      │  │  Agent       │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│         │                 │                 │           │
│         ▼                 ▼                 ▼           │
│  ┌─────────────────────────────────────────────────┐   │
│  │            Synthesis & Recommendation            │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Composition Examples

```
buoy explain <file>
  └── CodebaseReviewAgent
  └── HistoryReviewAgent
  └── Synthesize → explanation

buoy-test assess <repo>
  └── CodebaseReviewAgent
  └── HistoryReviewAgent
  └── AcceptanceAgent
  └── Synthesize → full recommendation

buoy bot submit <repo>
  └── (same as assess)
  └── Generate PR description
  └── Submit
```

### Agent Location

Agents live in `@buoy-design/agents` package in the Buoy monorepo, shared by both `buoy` CLI and `buoy-testing-suite`.

---

## Report Generation

Each repo gets three report formats in `./results/<org>/<repo>/`:

### 1. report.json (machine-readable)

```json
{
  "repo": "github.com/org/repo",
  "score": 12,
  "testedAt": "2025-12-29T10:00:00Z",
  "buoyVersion": "0.1.0",
  "designSystemSources": ["storybook", "tokens.json"],
  "scan": {
    "components": 45,
    "tokens": 120,
    "coverage": { "components": 0.8, "tokens": 0.6 }
  },
  "drift": {
    "total": 23,
    "byType": { "hardcoded-value": 12, "naming-inconsistency": 8 },
    "bySeverity": { "critical": 2, "warning": 15, "info": 6 }
  },
  "accuracy": {
    "manualReview": null,
    "notes": []
  }
}
```

### 2. report.md (human review)

```markdown
# Buoy Test: org/repo

**Score:** 12 | **Tested:** 2025-12-29

## Design System Sources
- Storybook (43 stories)
- tokens.json (120 tokens)

## Scan Results
| Type | Found | Coverage |
|------|-------|----------|
| Components | 45 | 80% |
| Tokens | 120 | 60% |

## Drift Signals
- 2 critical
- 15 warning
- 6 info

## Top Issues
1. `hardcoded-value` in src/Button.tsx:23
...
```

### 3. prompt.md (Claude-ready with full context)

Includes:
- Buoy scan/drift results
- Relevant source files for each drift signal
- Codebase context for agents
- Git history for affected files
- Questions for Claude to answer

### Agent Synthesis Output

```markdown
## Assessment: src/components/Button.tsx

### Drift Signal
- `hardcoded-value`: color "#3b82f6" should use `--color-primary`

### Codebase Review
This component follows the repo's pattern of using Tailwind classes.
The hardcoded value appears intentional - matches Tailwind's blue-500.

### History Review
Last modified 8 months ago. PR #234 specifically chose this color
because the design token didn't exist yet. Token was added in PR #301
but this file wasn't updated.

### Acceptance Likelihood: HIGH
- Maintainer actively merges small fixes (12 PRs merged last month)
- Similar token migration PRs accepted (#305, #312)
- Suggested approach: Reference PR #301 in commit message

### Recommendation
PROCEED - This is valid drift. Token now exists, file was missed.
Frame as "complete token migration started in #301"
```

---

## Directory Structure

### buoy-testing-suite repo

```
buoy-testing-suite/
├── package.json              # Depends on @buoy-design/cli, @buoy-design/agents
├── tsconfig.json
├── .env.example              # GITHUB_TOKEN, CLAUDE_API_KEY
│
├── src/
│   ├── discovery/
│   │   ├── github-search.ts      # GitHub API search
│   │   ├── scorer.ts             # Signal scoring logic
│   │   └── registry.ts           # Registry management
│   │
│   ├── execution/
│   │   ├── runner.ts             # Orchestrates test runs
│   │   ├── container.ts          # Docker execution
│   │   └── cache.ts              # Repo caching logic
│   │
│   ├── reporting/
│   │   ├── json-report.ts
│   │   ├── markdown-report.ts
│   │   └── prompt-builder.ts     # Claude-ready prompts
│   │
│   ├── assessment/
│   │   └── orchestrator.ts       # Coordinates agents, synthesizes
│   │
│   └── cli.ts                    # CLI entry point
│
├── registry/
│   └── repos.json                # Discovered & scored repos
│
├── repos/                        # Cloned repos (gitignored)
│   └── <org>/<repo>/
│
├── results/                      # Test results
│   └── <org>/<repo>/
│       ├── report.json
│       ├── report.md
│       └── prompt.md
│
└── Dockerfile                    # For containerized runs
```

### New package in Buoy monorepo

```
buoy/packages/agents/
├── package.json                  # @buoy-design/agents
├── src/
│   ├── index.ts
│   ├── types.ts                  # AgentContext, AgentResult, Finding
│   ├── codebase-review.ts        # CodebaseReviewAgent
│   ├── history-review.ts         # HistoryReviewAgent
│   ├── acceptance.ts             # AcceptanceAgent
│   └── utils/
│       ├── git.ts                # Git log/blame helpers
│       └── claude.ts             # Claude API wrapper
└── README.md
```

---

## CLI Commands

### Discovery

```bash
buoy-test discover                    # Search GitHub, update registry
buoy-test discover --min-score 8      # Only keep high-scoring repos
buoy-test registry                    # List repos in registry
buoy-test registry --top 20           # Show top 20 by score
```

### Execution

```bash
buoy-test run <repo-url>              # Test single repo
buoy-test run --top 10                # Test top 10 from registry
buoy-test run --all                   # Test entire registry
buoy-test run --all --containerized   # Parallel Docker execution
buoy-test run --tag storybook         # Test repos with specific signal
```

### Assessment

```bash
buoy-test assess <repo-url>           # Full agent analysis
buoy-test assess --results-dir ./results/org/repo  # Assess existing run
```

### Reporting

```bash
buoy-test report <repo-url>           # Generate all 3 report formats
buoy-test aggregate                   # Roll up all results into summary
buoy-test export --format csv         # Export for spreadsheet analysis
```

### Maintenance

```bash
buoy-test cache clean                 # Clear cloned repos
buoy-test cache status                # Show cache size/age
buoy-test update-registry             # Re-score existing repos
```

---

## Implementation Order

### Phase 1: Foundation (agents package)
1. Create `@buoy-design/agents` in Buoy monorepo
2. Implement agent types/interfaces
3. Build `HistoryReviewAgent` (git log, blame, PR context)
4. Build `CodebaseReviewAgent` (file analysis, pattern detection)
5. Build `AcceptanceAgent` (contribution likelihood)

### Phase 2: Testing Suite Core
1. Create `buoy-testing-suite` repo
2. Implement GitHub discovery + scoring
3. Build execution pipeline (local mode first)
4. Generate JSON + Markdown reports

### Phase 3: Claude Integration
1. Build prompt generator
2. Wire up agents via orchestrator
3. Implement assessment command
4. Test feedback loop end-to-end

### Phase 4: Scale
1. Add Docker/containerized execution
2. Build aggregate reporting
3. Tune scoring based on results

### Phase 5: Buoy Bot (future)
1. GitHub App setup
2. Fork + PR submission logic
3. Track acceptance rates
4. Close the feedback loop
