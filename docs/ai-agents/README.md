# AI Agents for Design System Compliance

This directory contains sub-agent definitions for design system tasks. These agents can be invoked via Claude Code's Task tool to perform specialized design system operations.

## Available Agents

| Agent | Purpose | Use When |
|-------|---------|----------|
| [Design Validator](./design-validator.md) | Validate code against design system | After generating UI code |
| [Token Advisor](./token-advisor.md) | Find tokens for hardcoded values | Replacing hardcoded colors/spacing |
| [Pattern Matcher](./pattern-matcher.md) | Find existing patterns | Building new UI features |

## Quick Start

### Using with Claude Code Task Tool

```typescript
// Validate generated code
await Task({
  subagent_type: 'general-purpose',
  description: 'Validate Button for design system',
  prompt: 'Validate src/Button.tsx against design system rules...'
});

// Find token for value
await Task({
  subagent_type: 'general-purpose',
  description: 'Find token for #2563EB',
  prompt: 'Find the design token matching #2563EB...'
});

// Find pattern for UI need
await Task({
  subagent_type: 'general-purpose',
  description: 'Find modal form pattern',
  prompt: 'Find existing patterns for modal with form...'
});
```

### Using with Buoy MCP Server

If you have the Buoy MCP server configured, these agents can use MCP tools directly:

```json
// .claude/settings.json
{
  "mcpServers": {
    "buoy": {
      "command": "npx",
      "args": ["@buoy-design/mcp", "serve"]
    }
  }
}
```

Then agents can call:
- `validate_code` - Check code against design system
- `resolve_token` - Find token for hardcoded value
- `find_component` - Find component for use case
- `suggest_fix` - Get fix suggestion

## Workflow: AI-Assisted Development

```
┌─────────────────────────────────────────────────────────────┐
│  1. GENERATE                                                 │
│     AI generates UI code                                     │
│     └─> Uses design system skill for context                │
├─────────────────────────────────────────────────────────────┤
│  2. VALIDATE                                                 │
│     Design Validator agent checks code                       │
│     └─> Or run: buoy check --format ai-feedback             │
├─────────────────────────────────────────────────────────────┤
│  3. FIX                                                      │
│     Token Advisor finds correct tokens                       │
│     └─> Or run: buoy fix --dry-run                          │
├─────────────────────────────────────────────────────────────┤
│  4. VERIFY                                                   │
│     Run buoy check again                                     │
│     └─> Repeat until no issues                              │
├─────────────────────────────────────────────────────────────┤
│  5. COMMIT                                                   │
│     Pre-commit hook runs buoy check                          │
│     └─> CI runs buoy lighthouse for final validation                │
└─────────────────────────────────────────────────────────────┘
```

## Best Practices

### For AI Agents

1. **Load design system skill first** - Before generating UI
2. **Validate after generation** - Use Design Validator or `buoy check`
3. **Use tokens always** - Never hardcode colors, spacing, typography
4. **Check patterns before creating** - Use Pattern Matcher
5. **Self-correct with feedback** - Use `buoy check --format ai-feedback`

### For Developers

1. **Set up MCP server** - For real-time AI assistance
2. **Export skill on changes** - `buoy skill spill` when design system updates
3. **Configure pre-commit hooks** - `buoy check --staged`
4. **Review AI output** - Trust but verify

## Related Commands

| Command | Purpose |
|---------|---------|
| `buoy check` | Validate code for drift |
| `buoy check --format ai-feedback` | AI-friendly validation output |
| `buoy fix --dry-run` | Preview fix suggestions |
| `buoy skill spill` | Generate AI skill |
| `buoy context` | Generate CLAUDE.md section |
| `buoy begin` | Interactive setup wizard |

## See Also

- [AI Guardrails Design](../plans/2026-01-06-ai-guardrails-design.md)
- [MCP Server Package](../../packages/mcp/README.md)
- [Design System Skill Format](./skill-format.md)
