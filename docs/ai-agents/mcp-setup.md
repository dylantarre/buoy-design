# Buoy MCP Server Setup

Configure Claude Code to use the Buoy MCP server for real-time design system context.

## Quick Setup

### 1. Install the MCP Package

```bash
npm install -g @buoy-design/mcp
# or use npx (no install needed)
```

### 2. Configure Claude Code

Add to your project's `.claude/settings.json`:

```json
{
  "mcpServers": {
    "buoy": {
      "command": "npx",
      "args": ["@buoy-design/mcp", "serve"]
    }
  }
}
```

Or for a global installation:

```json
{
  "mcpServers": {
    "buoy": {
      "command": "buoy-mcp",
      "args": ["serve"]
    }
  }
}
```

### 3. Verify Setup

In Claude Code, check that resources are available:
- `tokens://all` - Should return design tokens
- `components://inventory` - Should return component list

## Available Resources

| Resource URI | Description |
|--------------|-------------|
| `tokens://all` | All design tokens with intent metadata |
| `tokens://color` | Color tokens only |
| `tokens://spacing` | Spacing tokens only |
| `tokens://typography` | Typography tokens only |
| `components://inventory` | All available components |
| `components://{name}` | Specific component details |
| `patterns://all` | Pattern library |
| `antipatterns://all` | Things to avoid |

## Available Tools

### find_component

Find the best component for a use case.

```json
{
  "tool": "find_component",
  "arguments": {
    "useCase": "submit button",
    "constraints": ["accessible", "primary action"]
  }
}
```

### validate_code

Check code against design system rules.

```json
{
  "tool": "validate_code",
  "arguments": {
    "code": "<button style={{color: '#2563EB'}}>Click</button>",
    "filePath": "src/Button.tsx"
  }
}
```

### resolve_token

Find token for a hardcoded value.

```json
{
  "tool": "resolve_token",
  "arguments": {
    "value": "#2563EB",
    "context": "color"
  }
}
```

### suggest_fix

Get fix suggestion for a drift signal.

```json
{
  "tool": "suggest_fix",
  "arguments": {
    "type": "hardcoded-color",
    "value": "#2563EB",
    "location": "src/Button.tsx:15"
  }
}
```

## Token Sources

The MCP server looks for tokens in these locations (in order):

1. `design-tokens.json` - Standard token file
2. `tokens.json` - Alternative location
3. `.buoy/tokens.json` - Buoy cache
4. `tokens-ai-context.json` - AI-optimized format

For best results, export tokens with intent:

```bash
buoy tokens --format ai-context --output tokens-ai-context.json
```

## Component Sources

Components are loaded from:

1. `.buoy/components.json` - Cached component inventory
2. `.claude/skills/design-system/components/_inventory.md` - Skill export
3. Runtime scanning (if neither exists)

For best results, export the skill:

```bash
buoy skill spill
```

## Troubleshooting

### Server not starting

Check that dependencies are installed:

```bash
npx @buoy-design/mcp --help
```

### No tokens found

Ensure token files exist or export them:

```bash
buoy tokens --format ai-context
```

### No components found

Export the design system skill:

```bash
buoy skill spill
```

### Resources returning empty

Run a scan to populate caches:

```bash
buoy sweep
buoy sweep
```

## Complete Project Setup

For a fully configured project:

```bash
# 1. Initialize Buoy (if not done)
buoy init

# 2. Export tokens for AI
buoy tokens --format ai-context

# 3. Export skill
buoy skill spill

# 4. Generate CLAUDE.md context
buoy context --append

# 5. Add MCP configuration
mkdir -p .claude
cat > .claude/settings.json << 'EOF'
{
  "mcpServers": {
    "buoy": {
      "command": "npx",
      "args": ["@buoy-design/mcp", "serve"]
    }
  }
}
EOF

# 6. Verify everything works
buoy sweep
```

Or use the wizard:

```bash
buoy begin
# Select "Set up AI guardrails"
```
