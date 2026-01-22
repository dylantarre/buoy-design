/**
 * Agent and Command templates for Claude Code integration.
 *
 * These are written to .claude/agents/ and .claude/commands/ by `buoy dock agents`.
 */

export interface AgentTemplate {
  filename: string;
  content: string;
}

export interface CommandTemplate {
  filename: string;
  content: string;
}

/**
 * Generate agent templates with project-specific context.
 */
export function generateAgents(projectName: string): AgentTemplate[] {
  return [
    {
      filename: 'design-validator-agent.md',
      content: `---
name: design-validator-agent
description: Validates code against the ${projectName} design system. Use after writing UI code.
model: sonnet
tools: Read, Bash, Glob, Grep, Skill
hooks:
  Stop:
    - hooks:
        - type: command
          command: "buoy check --quiet"
---

# Design Validator Agent

## Purpose

Validate that code follows the ${projectName} design system. Catches hardcoded colors, arbitrary spacing, and pattern violations before they ship.

## Workflow

1. Execute: \`Skill(skill: 'validate-design', args: '<file_or_directory>')\`
2. Review drift signals
3. Suggest fixes for any violations found
4. Report results with specific line numbers and token suggestions
`,
    },
    {
      filename: 'drift-fixer-agent.md',
      content: `---
name: drift-fixer-agent
description: Automatically fixes design drift issues in ${projectName}. Use when drift is detected.
model: sonnet
tools: Read, Write, Edit, Bash, Glob, Grep, Skill
---

# Drift Fixer Agent

## Purpose

Fix design system violations by replacing hardcoded values with design tokens.

## Workflow

1. Execute: \`Skill(skill: 'show-design-system')\` to load available tokens
2. Execute: \`Skill(skill: 'validate-design', args: '<target>')\` to find drift
3. For each violation:
   - Use \`Skill(skill: 'resolve-token', args: '<value>')\` to find the right token
   - Apply the fix using Edit tool
4. Re-validate to confirm fixes
5. Report changes made
`,
    },
    {
      filename: 'token-resolver-agent.md',
      content: `---
name: token-resolver-agent
description: Finds the correct design token for any hardcoded value in ${projectName}.
model: haiku
tools: Read, Bash, Skill
---

# Token Resolver Agent

## Purpose

Given a hardcoded value (color, spacing, etc.), find the matching design token.

## Workflow

1. Execute: \`Skill(skill: 'resolve-token', args: '<value>')\`
2. Return the token name, CSS variable, and confidence score
3. If no exact match, suggest closest alternatives
`,
    },
  ];
}

/**
 * Generate command templates with project-specific context.
 */
export function generateCommands(projectName: string): CommandTemplate[] {
  return [
    {
      filename: 'validate-design.md',
      content: `---
model: sonnet
description: Validate code against the ${projectName} design system
argument-hint: <file_or_directory>
---

# Validate Design Command

## Purpose

Check code for design system violations including hardcoded colors, arbitrary spacing, and deprecated patterns.

## Variables

TARGET: $ARGUMENTS (defaults to current directory if empty)

## Workflow

1. Run \`buoy check \${TARGET} --json\` to get drift signals
2. Parse the JSON output
3. For each violation, report:
   - File and line number
   - Type of violation (hardcoded-value, spacing, etc.)
   - Current value
   - Suggested token replacement
4. Summarize total violations by severity (critical, warning, info)

## Output Format

\`\`\`
src/components/Button.tsx:24
  hardcoded-value: #3b82f6 → var(--color-primary)

src/components/Card.tsx:12
  spacing: padding: 17px → var(--spacing-4)

Summary: 2 violations (0 critical, 2 warning, 0 info)
\`\`\`
`,
    },
    {
      filename: 'fix-drift.md',
      content: `---
model: sonnet
description: Fix design drift issues automatically
argument-hint: <file_or_directory>
---

# Fix Drift Command

## Purpose

Automatically fix design system violations by replacing hardcoded values with tokens.

## Variables

TARGET: $ARGUMENTS (defaults to current directory if empty)

## Workflow

1. Run \`buoy fix \${TARGET} --dry-run --json\` to preview fixes
2. Show the user what will be changed
3. If confirmed, run \`buoy fix \${TARGET} --auto\` to apply safe fixes
4. For fixes requiring review, present options to the user
5. Re-run \`buoy check\` to verify fixes were applied correctly
6. Report results

## Safety

- Only apply fixes with high confidence (>90%)
- Never modify files outside the target directory
- Always show diff before applying changes
`,
    },
    {
      filename: 'show-design-system.md',
      content: `---
model: haiku
description: Display the ${projectName} design system context
---

# Show Design System Command

## Purpose

Output the complete design system context including tokens, components, and patterns.

## Workflow

1. Run \`buoy show all --json\`
2. Format the output as a readable summary:
   - Color tokens with values
   - Spacing scale
   - Typography tokens
   - Available components
   - Known anti-patterns to avoid

## Output Format

### Colors
| Token | Value |
|-------|-------|
| --color-primary | #3b82f6 |
| --color-secondary | #6366f1 |
...

### Spacing
| Token | Value |
|-------|-------|
| --spacing-1 | 4px |
| --spacing-2 | 8px |
...

### Components
- Button (variants: primary, secondary, ghost)
- Card
- Input
...
`,
    },
    {
      filename: 'resolve-token.md',
      content: `---
model: haiku
description: Find the design token for a hardcoded value
argument-hint: <value>
---

# Resolve Token Command

## Purpose

Given a hardcoded value, find the matching design token from the ${projectName} design system.

## Variables

VALUE: $ARGUMENTS

## Workflow

1. Run \`buoy show tokens --json\`
2. Search for tokens matching the value:
   - Exact match (100% confidence)
   - Close match for colors (>90% similarity)
   - Nearest spacing value
3. Return results

## Output Format

\`\`\`
Value: #3b82f6
Match: --color-primary (100% match)
Usage: var(--color-primary)

Alternative:
  --color-blue-500 (98% match)
\`\`\`

## Color Matching

For colors, use perceptual similarity:
- Convert to LAB color space
- Calculate deltaE distance
- Threshold: <5 = excellent match, <10 = good match
`,
    },
  ];
}
