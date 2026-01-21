# @ahoybuoy/mcp

MCP (Model Context Protocol) server for Buoy. Provides real-time design system context to AI coding tools.

## Quick Start

Add to your Claude Code settings:

```json
{
  "mcpServers": {
    "buoy": {
      "command": "npx",
      "args": ["@ahoybuoy/mcp", "serve"]
    }
  }
}
```

## Resources

| Resource | Description |
|----------|-------------|
| `tokens://all` | All design tokens |
| `components://inventory` | Component inventory |
| `patterns://all` | Approved patterns |
| `antipatterns://all` | Patterns to avoid |

## Tools

| Tool | Description |
|------|-------------|
| `find_component` | Find existing components |
| `validate_code` | Check code against design system |
| `resolve_token` | Find token for hardcoded value |
| `suggest_fix` | Get fix suggestions for drift |

## Links

- [Buoy CLI](https://www.npmjs.com/package/@ahoybuoy/cli)
- [Documentation](https://buoy.design/docs)
