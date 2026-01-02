# Design System Graph

**Date:** 2025-01-02
**Status:** Design Complete
**Purpose:** Build a knowledge graph that makes Buoy a PR guardian for design systems

---

## Vision

Buoy becomes a **PR guardian** that:
1. **Scans** code for components, tokens, and usages
2. **Builds a graph** connecting everything
3. **Remembers** decisions, patterns, and feedback
4. **Comments on PRs** to catch design drift before it ships

---

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Scanners  │────▶│   SQLite    │────▶│  graphology │────▶│  PR Comments│
│  (extract)  │     │  (persist)  │     │  (traverse) │     │  (enforce)  │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
        │                  │                   │                   │
        ▼                  ▼                   ▼                   ▼
   Components         Durable            Graph queries        GitHub API
   Tokens             Storage            Traversal            Comments
   Usages             History            Patterns             Reactions
```

**Why hybrid SQLite + graphology:**
- SQLite: Portable, no server, persists between runs
- graphology: In-memory graph for fast traversal queries
- Load graph from SQLite when needed, query with graph algorithms

---

## Node Types

### Core Design System

| Node | Description | Source |
|------|-------------|--------|
| `Token` | Design token (color, spacing, etc.) | W3C JSON, CSS vars, Tailwind config |
| `Component` | UI component | React, Vue, Svelte, Angular scanners |
| `Variant` | Component variant (Button/primary) | Props analysis |
| `PropType` | Component prop definition | TypeScript/PropTypes |

### Code Structure

| Node | Description | Source |
|------|-------------|--------|
| `File` | Source file | File system |
| `Directory` | Folder | File system |
| `Export` | Module export | AST |
| `Function` | Exported function | AST |
| `Hook` | React hook (useX) | AST |
| `Context` | React context | AST |

### Styling

| Node | Description | Source |
|------|-------------|--------|
| `CSSVariable` | CSS custom property (--color-brand) | CSS/SCSS parsing |
| `CSSClass` | CSS class (.btn-primary, Tailwind) | CSS/HTML/JSX |
| `Selector` | CSS selector | CSS parsing |
| `MediaQuery` | Responsive breakpoint | CSS parsing |

### Git

| Node | Description | Source |
|------|-------------|--------|
| `Commit` | Git commit | git log |
| `Developer` | Author/committer | git log |
| `Branch` | Git branch | git branch |
| `Tag` | Release tag | git tag |

### GitHub

| Node | Description | Source |
|------|-------------|--------|
| `PR` | Pull request | GitHub API |
| `Review` | PR review | GitHub API |
| `Comment` | PR/code comment | GitHub API |
| `Issue` | GitHub issue | GitHub API |
| `Label` | GitHub label | GitHub API |

### Dependencies

| Node | Description | Source |
|------|-------------|--------|
| `Package` | npm package | package.json |
| `Config` | Config file | tsconfig, tailwind.config, etc. |

### Quality

| Node | Description | Source |
|------|-------------|--------|
| `Story` | Storybook story | *.stories.tsx |
| `TestFile` | Test file | *.test.ts, *.spec.ts |
| `TestCase` | Individual test | AST (describe/it blocks) |

### Buoy-Specific

| Node | Description | Source |
|------|-------------|--------|
| `DriftSignal` | Detected drift | Buoy analysis |
| `Intent` | Approved exception | User input |
| `Feedback` | Reaction to comment | GitHub reactions |

---

## Edge Types

### Containment

| Edge | From → To | Description |
|------|-----------|-------------|
| `CONTAINS` | Directory → File | Folder contains file |
| `CONTAINS` | File → Component | File defines component |
| `EXPORTS` | File → Component/Function/Hook | Module exports |
| `DEFINES` | File → Token/CSSVariable | File defines token |

### Dependencies

| Edge | From → To | Description |
|------|-----------|-------------|
| `IMPORTS` | File → File | ES import |
| `DEPENDS_ON` | Package → Package | npm dependency |
| `USES` | Component → Token | Component uses design token |
| `USES` | Component → Hook | Component uses React hook |
| `RENDERS` | Component → Component | Renders in JSX |
| `EXTENDS` | Component → Component | Wraps/inherits from |
| `CALLS` | Function → Function | Function call |
| `PROVIDES` | Component → Context | Context.Provider |
| `CONSUMES` | Component → Context | useContext() |

### Styling

| Edge | From → To | Description |
|------|-----------|-------------|
| `STYLED_BY` | Component → CSSClass | Component uses class |
| `APPLIES` | CSSClass → CSSVariable | Class uses variable |
| `RESPONSIVE_AT` | CSSClass → MediaQuery | Media query usage |
| `OVERRIDES` | Token → Token | Theme layering |
| `REFERENCES` | Token → Token | Alias reference |
| `DRIFTS_FROM` | Token → Token | Scanned vs source of truth |

### Git History

| Edge | From → To | Description |
|------|-----------|-------------|
| `AUTHORED` | Developer → Commit | Commit author |
| `CHANGED` | Commit → File | File modified |
| `ADDED` | Commit → File | File created |
| `DELETED` | Commit → File | File removed |
| `BELONGS_TO` | Commit → Branch | Commit on branch |
| `TAGGED` | Tag → Commit | Release points to commit |
| `PARENT_OF` | Commit → Commit | Commit ancestry |

### GitHub

| Edge | From → To | Description |
|------|-----------|-------------|
| `OPENED` | Developer → PR | PR author |
| `INCLUDES` | PR → Commit | PR contains commit |
| `MERGED_TO` | PR → Branch | Merge target |
| `REVIEWED` | Developer → PR | Review submitted |
| `COMMENTED_ON` | Developer → PR/File | Comment author |
| `CLOSES` | PR → Issue | Fixes issue |
| `LABELED_WITH` | PR/Issue → Label | Has label |
| `ASSIGNED_TO` | Issue → Developer | Assignee |

### Quality

| Edge | From → To | Description |
|------|-----------|-------------|
| `TESTED_BY` | Component → TestCase | Test coverage |
| `DOCUMENTED_BY` | Component → Story | Storybook coverage |
| `COVERS` | TestFile → File | Test file covers source |

### Buoy

| Edge | From → To | Description |
|------|-----------|-------------|
| `FLAGGED_IN` | DriftSignal → PR | Drift found in PR |
| `AFFECTS` | DriftSignal → File/Component/Token | What has drift |
| `RESOLVED_BY` | DriftSignal → Commit | Fix commit |
| `APPROVED_BY` | Intent → Developer | Who approved exception |
| `APPLIES_TO` | Intent → Token/Component | Exception target |
| `REACTED_TO` | Feedback → DriftSignal | User reaction |

---

## Schema Extensions

### New Tables

```typescript
// packages/db/src/schema/index.ts

// W3C tokens - source of truth
export const w3cTokens = sqliteTable('w3c_tokens', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  filePath: text('file_path').notNull(),
  tokenPath: text('token_path').notNull(),       // "color.brand.primary"
  value: text('value').notNull(),                 // JSON value
  type: text('type'),                             // color, dimension, etc.
  description: text('description'),
  extensions: text('extensions'),                 // JSON vendor extensions
  importedAt: integer('imported_at', { mode: 'timestamp' }).notNull(),
});

// Git commits
export const commits = sqliteTable('commits', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  sha: text('sha').notNull(),
  message: text('message').notNull(),
  author: text('author').notNull(),
  authorEmail: text('author_email'),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  filesChanged: text('files_changed'),            // JSON array
  parentSha: text('parent_sha'),
  branch: text('branch'),
});

// Developers (extracted from commits)
export const developers = sqliteTable('developers', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  name: text('name').notNull(),
  email: text('email').notNull(),
  githubLogin: text('github_login'),
  firstSeenAt: integer('first_seen_at', { mode: 'timestamp' }).notNull(),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }).notNull(),
});

// Token usages
export const tokenUsages = sqliteTable('token_usages', {
  id: text('id').primaryKey(),
  tokenId: text('token_id').notNull().references(() => tokens.id),
  filePath: text('file_path').notNull(),
  lineNumber: integer('line_number'),
  columnNumber: integer('column_number'),
  usageType: text('usage_type').notNull(),        // 'css-var' | 'tailwind' | 'js-import' | 'hardcoded'
  context: text('context'),                        // code snippet
  commitSha: text('commit_sha'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Component usages
export const componentUsages = sqliteTable('component_usages', {
  id: text('id').primaryKey(),
  componentId: text('component_id').notNull().references(() => components.id),
  filePath: text('file_path').notNull(),
  lineNumber: integer('line_number'),
  propsUsed: text('props_used'),                   // JSON
  childrenSummary: text('children_summary'),
  commitSha: text('commit_sha'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// File imports (edges)
export const fileImports = sqliteTable('file_imports', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  sourceFile: text('source_file').notNull(),
  targetFile: text('target_file').notNull(),
  importType: text('import_type').notNull(),       // 'default' | 'named' | 'namespace' | 'side-effect'
  importedNames: text('imported_names'),           // JSON array
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Pull requests
export const pullRequests = sqliteTable('pull_requests', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  state: text('state').notNull(),                  // 'open' | 'closed' | 'merged'
  authorLogin: text('author_login'),
  baseBranch: text('base_branch'),
  headBranch: text('head_branch'),
  commits: text('commits'),                        // JSON array of SHAs
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  mergedAt: integer('merged_at', { mode: 'timestamp' }),
  closedAt: integer('closed_at', { mode: 'timestamp' }),
});

// PR comments (Buoy's comments and reactions)
export const prComments = sqliteTable('pr_comments', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  prId: text('pr_id').notNull().references(() => pullRequests.id),
  driftSignalId: text('drift_signal_id').references(() => driftSignals.id),
  githubCommentId: text('github_comment_id'),
  body: text('body').notNull(),
  filePath: text('file_path'),
  lineNumber: integer('line_number'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Feedback (reactions to Buoy comments)
export const feedback = sqliteTable('feedback', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  commentId: text('comment_id').references(() => prComments.id),
  driftSignalId: text('drift_signal_id').references(() => driftSignals.id),
  reaction: text('reaction').notNull(),            // 'helpful' | 'unhelpful' | 'false_positive'
  userLogin: text('user_login'),
  context: text('context'),                        // JSON
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Storybook stories
export const stories = sqliteTable('stories', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  componentId: text('component_id').references(() => components.id),
  storyId: text('story_id').notNull(),             // Storybook ID
  title: text('title').notNull(),
  filePath: text('file_path').notNull(),
  kind: text('kind'),                              // Story kind/group
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Test files
export const testFiles = sqliteTable('test_files', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  filePath: text('file_path').notNull(),
  testFramework: text('test_framework'),           // 'jest' | 'vitest' | 'mocha' | etc.
  testCount: integer('test_count'),
  coveredFiles: text('covered_files'),             // JSON array of file paths
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// CSS classes
export const cssClasses = sqliteTable('css_classes', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  className: text('class_name').notNull(),
  filePath: text('file_path').notNull(),
  lineNumber: integer('line_number'),
  properties: text('properties'),                  // JSON of CSS properties
  variablesUsed: text('variables_used'),           // JSON array of var names
  isTailwind: integer('is_tailwind', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Graph edges (generic edge table for flexibility)
export const graphEdges = sqliteTable('graph_edges', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  edgeType: text('edge_type').notNull(),
  sourceType: text('source_type').notNull(),
  sourceId: text('source_id').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  metadata: text('metadata'),                      // JSON for edge-specific data
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
```

---

## Graph Layer (graphology)

### Package Setup

```bash
pnpm add graphology graphology-types
pnpm add -D @types/graphology
```

### Graph Builder

```typescript
// packages/core/src/graph/builder.ts
import Graph from 'graphology';
import { db } from '@buoy/db';

export async function buildGraph(projectId: string): Promise<Graph> {
  const graph = new Graph({ multi: true, type: 'directed' });

  // Load nodes from SQLite
  await loadTokens(graph, projectId);
  await loadComponents(graph, projectId);
  await loadFiles(graph, projectId);
  await loadCommits(graph, projectId);
  await loadDevelopers(graph, projectId);
  await loadPullRequests(graph, projectId);

  // Load edges
  await loadEdges(graph, projectId);

  return graph;
}

async function loadTokens(graph: Graph, projectId: string) {
  const tokens = await db.query.tokens.findMany({
    where: eq(tokens.projectId, projectId)
  });

  for (const token of tokens) {
    graph.addNode(`token:${token.id}`, {
      type: 'Token',
      name: token.name,
      category: token.category,
      value: token.value,
      source: token.source,
    });
  }
}

// ... similar for other node types
```

### Graph Queries

```typescript
// packages/core/src/graph/queries.ts
import Graph from 'graphology';
import { bfsFromNode } from 'graphology-traversal';

// Find all usages of a token
export function findTokenUsages(graph: Graph, tokenId: string): string[] {
  const usages: string[] = [];

  graph.forEachInEdge(`token:${tokenId}`, (edge, attrs, source) => {
    if (attrs.type === 'USES') {
      usages.push(source);
    }
  });

  return usages;
}

// Find impact of changing a token (what breaks?)
export function findTokenImpact(graph: Graph, tokenId: string): string[] {
  const impacted: string[] = [];

  bfsFromNode(graph, `token:${tokenId}`, (node, attrs, depth) => {
    if (depth > 0) impacted.push(node);
    return depth < 3; // Limit depth
  }, { mode: 'inbound' });

  return impacted;
}

// Find who introduced drift
export function findDriftAuthor(graph: Graph, driftSignalId: string): string | null {
  const signal = `drift:${driftSignalId}`;

  // DriftSignal → AFFECTS → File → CHANGED ← Commit → AUTHORED ← Developer
  const affectedFiles = graph.outNeighbors(signal)
    .filter(n => graph.getNodeAttribute(n, 'type') === 'File');

  for (const file of affectedFiles) {
    const commits = graph.inNeighbors(file)
      .filter(n => graph.getNodeAttribute(n, 'type') === 'Commit');

    for (const commit of commits) {
      const authors = graph.inNeighbors(commit)
        .filter(n => graph.getNodeAttribute(n, 'type') === 'Developer');

      if (authors.length > 0) return authors[0];
    }
  }

  return null;
}

// Find unused tokens
export function findUnusedTokens(graph: Graph): string[] {
  return graph.nodes()
    .filter(n => graph.getNodeAttribute(n, 'type') === 'Token')
    .filter(n => graph.inDegree(n) === 0);
}

// Find untested components
export function findUntestedComponents(graph: Graph): string[] {
  return graph.nodes()
    .filter(n => graph.getNodeAttribute(n, 'type') === 'Component')
    .filter(n => !graph.outNeighbors(n).some(
      neighbor => graph.getEdgeAttribute(n, neighbor, 'type') === 'TESTED_BY'
    ));
}

// Find undocumented components (no Storybook story)
export function findUndocumentedComponents(graph: Graph): string[] {
  return graph.nodes()
    .filter(n => graph.getNodeAttribute(n, 'type') === 'Component')
    .filter(n => !graph.outNeighbors(n).some(
      neighbor => graph.getEdgeAttribute(n, neighbor, 'type') === 'DOCUMENTED_BY'
    ));
}
```

---

## Collectors

### Git Collector

```typescript
// packages/core/src/graph/collectors/git.ts
import { simpleGit } from 'simple-git';

export async function collectGitHistory(
  projectRoot: string,
  since?: Date
): Promise<{ commits: Commit[], developers: Developer[] }> {
  const git = simpleGit(projectRoot);

  // Get commits touching design-related files
  const log = await git.log({
    '--since': since?.toISOString(),
    '--name-status': true,
  });

  const developers = new Map<string, Developer>();
  const commits: Commit[] = [];

  for (const entry of log.all) {
    // Track developer
    const devKey = entry.author_email;
    if (!developers.has(devKey)) {
      developers.set(devKey, {
        name: entry.author_name,
        email: entry.author_email,
        firstSeenAt: new Date(entry.date),
        lastSeenAt: new Date(entry.date),
      });
    } else {
      const dev = developers.get(devKey)!;
      dev.lastSeenAt = new Date(entry.date);
    }

    // Track commit
    commits.push({
      sha: entry.hash,
      message: entry.message,
      author: entry.author_name,
      authorEmail: entry.author_email,
      timestamp: new Date(entry.date),
      filesChanged: parseFilesChanged(entry.diff),
      parentSha: entry.parents?.[0],
    });
  }

  return { commits, developers: Array.from(developers.values()) };
}
```

### Usage Collector

```typescript
// packages/core/src/graph/collectors/usages.ts
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

export async function collectTokenUsages(
  projectRoot: string
): Promise<TokenUsage[]> {
  const files = await glob(['**/*.{tsx,jsx,vue,svelte,css,scss}'], {
    cwd: projectRoot,
    ignore: ['node_modules/**', 'dist/**'],
  });

  const usages: TokenUsage[] = [];

  for (const file of files) {
    const content = await readFile(path.join(projectRoot, file), 'utf-8');

    // CSS variable usages: var(--token-name)
    const cssVarMatches = content.matchAll(/var\(--([^)]+)\)/g);
    for (const match of cssVarMatches) {
      usages.push({
        tokenName: match[1],
        filePath: file,
        lineNumber: getLineNumber(content, match.index!),
        usageType: 'css-var',
        context: getContext(content, match.index!),
      });
    }

    // Tailwind class usages
    const tailwindMatches = content.matchAll(/className=["']([^"']+)["']/g);
    for (const match of tailwindMatches) {
      const classes = match[1].split(/\s+/);
      for (const cls of classes) {
        usages.push({
          tokenName: cls,
          filePath: file,
          lineNumber: getLineNumber(content, match.index!),
          usageType: 'tailwind',
          context: getContext(content, match.index!),
        });
      }
    }

    // Hardcoded values
    const hardcodedColors = content.matchAll(/#[0-9a-fA-F]{3,8}\b/g);
    for (const match of hardcodedColors) {
      usages.push({
        tokenName: match[0],
        filePath: file,
        lineNumber: getLineNumber(content, match.index!),
        usageType: 'hardcoded',
        context: getContext(content, match.index!),
      });
    }
  }

  return usages;
}
```

### Import Collector

```typescript
// packages/core/src/graph/collectors/imports.ts
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

export async function collectImports(
  projectRoot: string
): Promise<FileImport[]> {
  const files = await glob(['**/*.{ts,tsx,js,jsx}'], {
    cwd: projectRoot,
    ignore: ['node_modules/**', 'dist/**'],
  });

  const imports: FileImport[] = [];

  for (const file of files) {
    const content = await readFile(path.join(projectRoot, file), 'utf-8');
    const ast = parse(content, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    });

    traverse(ast, {
      ImportDeclaration(path) {
        const source = path.node.source.value;
        const resolved = resolveImport(file, source, projectRoot);

        if (resolved) {
          const importedNames = path.node.specifiers.map(s => {
            if (s.type === 'ImportDefaultSpecifier') return 'default';
            if (s.type === 'ImportNamespaceSpecifier') return '*';
            return s.imported.name;
          });

          imports.push({
            sourceFile: file,
            targetFile: resolved,
            importType: getImportType(path.node.specifiers),
            importedNames,
          });
        }
      },
    });
  }

  return imports;
}
```

---

## CLI Commands

```bash
# Build the full graph
buoy graph build

# Build incrementally (since last build)
buoy graph build --incremental

# Query the graph
buoy graph query "unused tokens"
buoy graph query "who introduced drift in Button"
buoy graph query "impact of changing --color-brand-primary"

# Export for visualization
buoy graph export --format=dot > graph.dot
buoy graph export --format=json > graph.json
buoy graph export --format=cytoscape > graph.cyjs

# Show graph stats
buoy graph stats
```

### Command Implementation

```typescript
// apps/cli/src/commands/graph.ts
import { Command } from 'commander';
import { buildGraph } from '@buoy/core/graph';

export function createGraphCommand(): Command {
  const graph = new Command('graph')
    .description('Build and query the design system graph');

  graph
    .command('build')
    .description('Build the knowledge graph')
    .option('--incremental', 'Only process changes since last build')
    .action(async (options) => {
      console.log('Building graph...');

      // Run all collectors
      await collectGitHistory(process.cwd());
      await collectTokenUsages(process.cwd());
      await collectImports(process.cwd());
      await collectComponents(process.cwd());

      // Build graph
      const graph = await buildGraph(projectId);

      console.log(`Graph built: ${graph.order} nodes, ${graph.size} edges`);
    });

  graph
    .command('query <question>')
    .description('Query the graph with natural language')
    .action(async (question) => {
      const graph = await buildGraph(projectId);

      // Parse question and run appropriate query
      if (question.includes('unused tokens')) {
        const unused = findUnusedTokens(graph);
        console.log(`Unused tokens: ${unused.length}`);
        unused.forEach(t => console.log(`  - ${t}`));
      }
      // ... more query patterns
    });

  graph
    .command('export')
    .description('Export graph for visualization')
    .option('--format <format>', 'Output format', 'json')
    .action(async (options) => {
      const graph = await buildGraph(projectId);

      switch (options.format) {
        case 'dot':
          console.log(toDot(graph));
          break;
        case 'json':
          console.log(JSON.stringify(graph.export(), null, 2));
          break;
        case 'cytoscape':
          console.log(JSON.stringify(toCytoscape(graph), null, 2));
          break;
      }
    });

  return graph;
}
```

---

## GitHub Integration

### PR Comment Flow

```
PR Opened
    │
    ▼
GitHub Action triggers `buoy ci`
    │
    ▼
Build graph for PR commits
    │
    ▼
Detect drift signals
    │
    ▼
Query graph for context:
  - Who authored the drift?
  - What's the impact?
  - Has this been flagged before?
  - Any approved intents?
    │
    ▼
Generate contextual comments
    │
    ▼
Post to PR via GitHub API
    │
    ▼
Listen for reactions (👍/👎)
    │
    ▼
Store feedback, learn
```

### Comment Format

```markdown
## 🚨 Design Drift Detected

**File:** `src/components/Button.tsx:42`
**Type:** Hardcoded color value

```tsx
backgroundColor: '#3b82f6'  // ← Should use var(--color-brand-primary)
```

### Context
- This token is used in **23 other places** correctly
- Last changed by @developer 3 days ago
- Similar drift was fixed in #123

### Suggested Fix
```tsx
backgroundColor: 'var(--color-brand-primary)'
```

---
<sub>React with 👍 if helpful, 👎 to suppress similar warnings</sub>
```

---

## Memory & Learning

### What Buoy Remembers

| Memory | Source | Used For |
|--------|--------|----------|
| **Token source of truth** | W3C JSON import | Detecting value drift |
| **Usage locations** | Code scanning | Impact analysis |
| **Approved exceptions** | User intents | Suppressing known issues |
| **Resolution history** | Git + drift tracking | "How was this fixed before?" |
| **Developer patterns** | Git history | "Who owns this?" |
| **Feedback** | GitHub reactions | Tuning sensitivity |
| **Repeat offenders** | Drift frequency | Escalation |

### Learning Loop

```
Feedback received (👍/👎)
    │
    ▼
Store in feedback table
    │
    ▼
Aggregate by:
  - Drift type
  - File pattern
  - Developer
    │
    ▼
Adjust behavior:
  - Suppress high-👎 patterns
  - Escalate repeat issues
  - Learn team preferences
```

---

## Implementation Phases

### Phase 1: Schema & Storage
- [ ] Add new tables to schema.ts
- [ ] Run migrations
- [ ] Add graphology dependency

### Phase 2: Collectors
- [ ] Git history collector
- [ ] Token usage collector
- [ ] Component usage collector
- [ ] Import collector

### Phase 3: Graph Builder
- [ ] Load nodes from SQLite
- [ ] Build edges
- [ ] Query functions

### Phase 4: CLI Commands
- [ ] `buoy graph build`
- [ ] `buoy graph query`
- [ ] `buoy graph export`

### Phase 5: GitHub Integration
- [ ] PR comment posting
- [ ] Reaction tracking
- [ ] Feedback loop

---

## Example Queries

| Query | What it answers |
|-------|-----------------|
| `findUnusedTokens()` | Tokens defined but never used |
| `findTokenImpact(tokenId)` | What breaks if this token changes |
| `findDriftAuthor(driftId)` | Who introduced this drift |
| `findRepeatOffenders()` | Files/developers with frequent drift |
| `findUntestedComponents()` | Components without tests |
| `findUndocumentedComponents()` | Components without Storybook |
| `findBrokenAliases()` | Token references that don't resolve |
| `findDeprecatedUsages()` | Usages of deprecated tokens |

---

## Success Criteria

1. **Graph captures full design system** - Tokens, components, usages, history
2. **Queries answer real questions** - "What uses this?", "Who owns this?"
3. **PR comments are contextual** - Show impact, suggest fixes
4. **Learning improves over time** - Fewer false positives from feedback
5. **Works offline** - No external dependencies for core functionality
