# Figma Integration

Buoy integrates with Figma to scan your design system directly from Figma files. This enables you to:

- Extract design tokens (colors, spacing, typography) from Figma Variables
- Scan component definitions from Figma component sets
- Compare Figma variables against your codebase tokens
- Detect drift between design and implementation

## Prerequisites

1. A Figma account with access to the files you want to scan
2. A Figma Personal Access Token with appropriate permissions
3. The file key(s) for your Figma design system file(s)

## Getting a Figma Access Token

1. Go to your [Figma Account Settings](https://www.figma.com/settings)
2. Scroll down to **Personal access tokens**
3. Click **Generate new token**
4. Give it a descriptive name (e.g., "Buoy CLI")
5. For full functionality, ensure the token has these scopes:
   - `file:read` - Read file contents (required for components)
   - `file_dev_resources:read` - Read variables (required for tokens)
6. Copy the token immediately (you won't see it again)

## Finding Your Figma File Key

The file key is in the URL of your Figma file:

```
https://www.figma.com/file/ABC123xyz/My-Design-System
                           ^^^^^^^^^^^
                           This is the file key
```

## Configuration

### Environment Variable (Recommended)

Set your Figma token as an environment variable:

```bash
export FIGMA_ACCESS_TOKEN="your-figma-token"
```

Add this to your shell profile (`.bashrc`, `.zshrc`, etc.) or CI environment secrets.

### Configuration File

Add Figma settings to your `buoy.config.mjs`:

```javascript
import { defineConfig } from '@buoy-design/cli';

export default defineConfig({
  project: {
    name: 'my-app',
  },
  sources: {
    figma: {
      enabled: true,
      // Token can be set here (not recommended for version control)
      // accessToken: 'your-token',

      // File keys to scan
      fileKeys: ['ABC123xyz'],

      // Optional: Name of the page containing components (default: "Components")
      componentPageName: 'Components',

      // Optional: Name of the page containing tokens (default: "Design Tokens")
      tokenPageName: 'Design Tokens',
    },
    react: {
      enabled: true,
      include: ['src/**/*.tsx'],
    },
    tokens: {
      enabled: true,
      files: ['src/tokens/*.css'],
    },
  },
});
```

## Usage

### Scanning Figma

Once configured, Figma will be included in regular scans:

```bash
# Scan all sources including Figma
buoy scan

# Scan only Figma
buoy scan --source figma
```

### Comparing Figma Variables to Code

Use the `compare` command to see how your Figma variables align with code tokens:

```bash
# Compare using config
buoy compare --figma

# Compare from a specific Figma file
buoy compare --figma-file ABC123xyz

# Get JSON output for CI
buoy compare --figma --json

# Fail CI if drift is detected
buoy compare --figma --strict
```

Example output:

```
Token Comparison
Source: Figma file: ABC123xyz

Design tokens:    45
Code tokens:      52
Matched:          38
Value drift:      3
Missing in code:  4
Orphan:           14

Changed (value drift):
  ~ colors.primary._light
     Design: #2563eb
     Code:   #3b82f6

  ~ spacing.lg
     Design: 32px
     Code:   24px

Missing in codebase:
  - colors.accent.hover
  - colors.accent.active
  - spacing.3xl
  - typography.display
```

### Understanding the Output

| Category | Meaning |
|----------|---------|
| **Matched** | Token exists in both Figma and code with same value |
| **Value drift** | Token exists in both but values differ |
| **Missing in code** | Token in Figma but not found in codebase |
| **Orphan** | Token in code but not in Figma |

## Figma Variables Structure

Buoy maps Figma Variables to design tokens as follows:

### Variable Types

| Figma Type | Token Category | Example |
|------------|----------------|---------|
| COLOR | color | `#2563eb` |
| FLOAT | spacing | `16px` |
| STRING | other | Raw string value |
| BOOLEAN | other | `true` / `false` |

### Variable Modes (Themes)

Figma Variables support multiple modes (e.g., Light/Dark themes). Buoy maps these to token name suffixes:

| Figma Mode | Token Suffix | Example |
|------------|--------------|---------|
| Light | `_light` | `colors.primary._light` |
| Dark | `_dark` | `colors.primary._dark` |
| Default | (none) | `colors.primary` |
| Mobile | `_mobile` | `spacing.container._mobile` |
| Desktop | `_desktop` | `spacing.container._desktop` |

### Collection Filtering

If your Figma file has multiple variable collections, you can filter by collection name in the scanner configuration.

## CI/CD Integration

### GitHub Actions

```yaml
name: Design Drift Check

on:
  pull_request:
    branches: [main]

jobs:
  check-drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install

      - name: Check Figma Drift
        env:
          FIGMA_ACCESS_TOKEN: ${{ secrets.FIGMA_ACCESS_TOKEN }}
        run: pnpm buoy compare --figma --strict
```

### GitLab CI

```yaml
figma-drift-check:
  image: node:20
  script:
    - npm install -g pnpm
    - pnpm install
    - pnpm buoy compare --figma --strict
  variables:
    FIGMA_ACCESS_TOKEN: $FIGMA_ACCESS_TOKEN
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```

## Troubleshooting

### "Access denied" Error

This usually means your token doesn't have the required permissions or the file is not accessible.

**Solutions:**
1. Generate a new token with `file:read` and `file_dev_resources:read` scopes
2. Ensure you have access to the Figma file
3. Check that the file key is correct

### "File not found" Error

The file key in your config doesn't match a valid Figma file.

**Solutions:**
1. Double-check the file key from the URL
2. Ensure the file hasn't been deleted or moved
3. Verify your token has access to the file

### Rate Limiting

Figma limits API requests. If you see rate limit errors:

1. Wait a few minutes and try again
2. Reduce the number of files being scanned
3. Consider caching results in CI (Buoy has built-in retry with exponential backoff)

### No Variables Found

If the scan finds no variables:

1. Ensure your Figma file has Variables defined (not just Styles)
2. Variables are a newer Figma feature - check that the file uses them
3. Verify the token has `file_dev_resources:read` scope

## Best Practices

1. **Store tokens securely**: Never commit your Figma token to version control
2. **Use environment variables**: Set `FIGMA_ACCESS_TOKEN` in your environment
3. **Regular syncs**: Run `buoy compare --figma` as part of your CI pipeline
4. **Document deviations**: Use `--verbose` flag to document intentional differences
5. **Single source of truth**: Keep your design system in one Figma file when possible

## Related Commands

- `buoy scan --source figma` - Scan only Figma components and tokens
- `buoy status` - See overall design system coverage
- `buoy drift check` - Check for all types of design drift
