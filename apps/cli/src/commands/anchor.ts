import { Command } from 'commander';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { resolve, relative } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import { spinner, success, error, info, warning, header, keyValue, newline } from '../output/reporters.js';
import { ProjectDetector } from '../detect/project-detector.js';
import { DesignSystemArchitect } from '../services/architect.js';
import { GitHubArchitectClient, parseRepoString } from '../integrations/index.js';
import type { SuggestedToken } from '@buoy-design/core';

interface StylePreset {
  name: string;
  description: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    neutral: string;
  };
  borderRadius: string;
  spacing: 'compact' | 'comfortable' | 'spacious';
}

const STYLE_PRESETS: Record<string, StylePreset> = {
  minimal: {
    name: 'Minimal & Clean',
    description: 'Subtle colors, generous whitespace, thin borders',
    colors: { primary: '#0f172a', secondary: '#64748b', accent: '#3b82f6', neutral: '#f8fafc' },
    borderRadius: '0.375rem',
    spacing: 'spacious',
  },
  bold: {
    name: 'Bold & Vibrant',
    description: 'Strong colors, high contrast, prominent elements',
    colors: { primary: '#7c3aed', secondary: '#ec4899', accent: '#f59e0b', neutral: '#1e1b4b' },
    borderRadius: '0.75rem',
    spacing: 'comfortable',
  },
  soft: {
    name: 'Soft & Friendly',
    description: 'Pastel tones, rounded corners, warm feel',
    colors: { primary: '#6366f1', secondary: '#a78bfa', accent: '#f472b6', neutral: '#faf5ff' },
    borderRadius: '1rem',
    spacing: 'comfortable',
  },
  corporate: {
    name: 'Corporate & Professional',
    description: 'Conservative palette, structured layout, trust signals',
    colors: { primary: '#1e40af', secondary: '#475569', accent: '#059669', neutral: '#f1f5f9' },
    borderRadius: '0.25rem',
    spacing: 'compact',
  },
};

const BUOY_CONFIG_DIR = resolve(homedir(), '.buoy');
const BUOY_CONFIG_FILE = resolve(BUOY_CONFIG_DIR, 'config.json');

interface BuoyGlobalConfig {
  anthropicApiKey?: string;
}

function loadGlobalConfig(): BuoyGlobalConfig {
  try {
    if (existsSync(BUOY_CONFIG_FILE)) {
      return JSON.parse(readFileSync(BUOY_CONFIG_FILE, 'utf-8'));
    }
  } catch {
    // Ignore errors, return empty config
  }
  return {};
}

function saveGlobalConfig(config: BuoyGlobalConfig): void {
  if (!existsSync(BUOY_CONFIG_DIR)) {
    mkdirSync(BUOY_CONFIG_DIR, { recursive: true });
  }
  writeFileSync(BUOY_CONFIG_FILE, JSON.stringify(config, null, 2));
}

function getAnthropicApiKey(): string | null {
  // Check environment variable first
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  // Check global config
  const config = loadGlobalConfig();
  return config.anthropicApiKey || null;
}

export function createAnchorCommand(): Command {
  const cmd = new Command('anchor')
    .description('Anchor your design system - analyze code and establish tokens')
    .option('--fresh', 'Generate a fresh design system instead of extracting from code')
    .option('--style <style>', 'Style preset for fresh build: minimal, bold, soft, corporate')
    .option('--primary-color <color>', 'Primary brand color (hex)')
    .option('--framework <framework>', 'Target framework: react, vue, svelte, vanilla')
    .option('--output <path>', 'Output directory or file path', '.')
    .option('--extend <file>', 'Extend existing token file')
    .option('--set-key <key>', 'Set your Anthropic API key')
    .option('--no-ai', 'Skip AI analysis (use heuristics only)')
    .option('--pr', 'Create a GitHub PR with the generated tokens')
    .option('--github-token <token>', 'GitHub token for PR creation (or use GITHUB_TOKEN env)')
    .option('--github-repo <repo>', 'GitHub repo in owner/repo format (or use GITHUB_REPOSITORY env)')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      // Handle setting API key
      if (options.setKey) {
        const config = loadGlobalConfig();
        config.anthropicApiKey = options.setKey;
        saveGlobalConfig(config);
        success('Anthropic API key saved to ~/.buoy/config.json');
        info('You can now run: buoy build');
        return;
      }

      const cwd = process.cwd();

      // Fresh mode: Generate new design system with AI
      if (options.fresh) {
        await buildFreshDesignSystem(cwd, options);
        return;
      }

      // Default mode: Analyze codebase and extract tokens
      await buildFromCodebase(cwd, options);
    });

  return cmd;
}

/**
 * Build design system by analyzing codebase (default mode)
 * Extracts tokens from hardcoded values found in code
 */
async function buildFromCodebase(cwd: string, options: Record<string, unknown>): Promise<void> {
  const spin = spinner('Analyzing codebase...');

  try {
    // Initialize architect
    const architect = new DesignSystemArchitect();

    // Run analysis
    const result = await architect.analyze({
      projectRoot: cwd,
      noAI: !options.ai,
      onProgress: (msg) => {
        spin.text = msg;
      }
    });

    spin.stop();

    const { diagnosis } = result;

    // JSON output
    if (options.json) {
      console.log(JSON.stringify({
        diagnosis,
        generatedTokens: result.generatedTokensFile
      }, null, 2));
      return;
    }

    // Display diagnosis
    header('Design System Analysis');
    newline();

    // Maturity score with visual
    const scoreBar = createScoreBar(diagnosis.maturityScore);
    console.log(`${chalk.bold('Maturity Score:')} ${scoreBar} ${diagnosis.maturityScore}/100`);
    console.log(`${chalk.bold('Level:')} ${formatMaturityLevel(diagnosis.maturityLevel)}`);
    newline();

    // CSS Analysis
    console.log(chalk.bold.underline('What We Found'));
    keyValue('Unique Colors', String(diagnosis.cssAnalysis.uniqueColors));
    keyValue('Unique Spacing Values', String(diagnosis.cssAnalysis.uniqueSpacing));
    keyValue('Unique Fonts', String(diagnosis.cssAnalysis.uniqueFonts));
    keyValue('Tokenization', `${diagnosis.cssAnalysis.tokenizationScore}%`);
    keyValue('Hardcoded Values', String(diagnosis.cssAnalysis.hardcodedValues));
    newline();

    // Recommendations
    if (diagnosis.recommendations.length > 0) {
      console.log(chalk.bold.underline('Recommendations'));
      for (const rec of diagnosis.recommendations) {
        const priorityIcon = rec.priority === 'high' ? chalk.red('!')
          : rec.priority === 'medium' ? chalk.yellow('~')
          : chalk.blue('-');
        console.log(`  ${priorityIcon} ${chalk.bold(rec.title)}`);
        console.log(`     ${rec.description}`);
        newline();
      }
    }

    // Suggested tokens preview
    if (diagnosis.suggestedTokens.length > 0) {
      console.log(chalk.bold.underline('Generated Tokens (Preview)'));
      const colorTokens = diagnosis.suggestedTokens.filter((t: SuggestedToken) => t.category === 'color').slice(0, 5);
      const spacingTokens = diagnosis.suggestedTokens.filter((t: SuggestedToken) => t.category === 'spacing').slice(0, 5);

      if (colorTokens.length > 0) {
        console.log('  Colors:');
        for (const token of colorTokens) {
          console.log(`    ${chalk.cyan(token.name)}: ${token.value} ${chalk.dim(`(replaces ${token.usageCount} values)`)}`);
        }
      }

      if (spacingTokens.length > 0) {
        console.log('  Spacing:');
        for (const token of spacingTokens) {
          console.log(`    ${chalk.cyan(token.name)}: ${token.value} ${chalk.dim(`(replaces ${token.usageCount} values)`)}`);
        }
      }
      newline();
    }

    // Output to file if requested
    if (options.output && options.output !== '.') {
      await writeFile(options.output as string, result.generatedTokensFile);
      success(`Generated tokens written to ${options.output}`);
      return;
    }

    // Create PR if requested
    if (options.pr) {
      const token = (options.githubToken || process.env.GITHUB_TOKEN) as string | undefined;
      const repo = (options.githubRepo || process.env.GITHUB_REPOSITORY) as string | undefined;

      if (!token || !repo) {
        warning('GitHub token and repo required for PR creation.');
        info('Provide --github-token and --github-repo, or set GITHUB_TOKEN and GITHUB_REPOSITORY env vars');
        newline();

        // Still output the tokens
        info('Generated design-tokens.css:');
        console.log(chalk.gray('─'.repeat(50)));
        console.log(result.generatedTokensFile);
        console.log(chalk.gray('─'.repeat(50)));
        return;
      }

      spin.start();
      spin.text = 'Creating PR...';

      try {
        const { owner, repo: repoName } = parseRepoString(repo);
        const client = new GitHubArchitectClient({
          token,
          owner,
          repo: repoName
        });

        const pr = await client.createDesignTokensPR(
          result.generatedTokensFile,
          result.prDescription
        );

        spin.stop();
        success(`Created PR #${pr.number}`);
        info(`View at: ${pr.url}`);
      } catch (err) {
        spin.stop();
        const msg = err instanceof Error ? err.message : String(err);
        error(`Failed to create PR: ${msg}`);

        // Fallback: output tokens
        info('Generated tokens:');
        console.log(result.generatedTokensFile);
      }
    } else {
      // Just output the tokens
      info('Generated design-tokens.css:');
      console.log(chalk.gray('─'.repeat(50)));
      console.log(result.generatedTokensFile);
      console.log(chalk.gray('─'.repeat(50)));
      newline();
      info('Run with --pr to create a GitHub PR, or --output <path> to save to file');
    }

  } catch (err) {
    spin.stop();
    const message = err instanceof Error ? err.message : String(err);
    error(`Build failed: ${message}`);
    process.exit(1);
  }
}

/**
 * Build fresh design system with AI (--fresh mode)
 * Generates new tokens from scratch based on style presets
 */
async function buildFreshDesignSystem(cwd: string, options: Record<string, unknown>): Promise<void> {
  // Check for API key
  const apiKey = getAnthropicApiKey();

  if (!apiKey) {
    error('Anthropic API key required for --fresh mode');
    console.log('');
    info('Set your API key with one of these methods:');
    console.log('');
    console.log(chalk.cyan('  Option 1: ') + 'Environment variable');
    console.log(chalk.dim('  export ANTHROPIC_API_KEY=sk-ant-...'));
    console.log('');
    console.log(chalk.cyan('  Option 2: ') + 'Save to Buoy config');
    console.log(chalk.dim('  buoy build --set-key sk-ant-...'));
    console.log('');
    info('Get your API key at: https://console.anthropic.com/');
    return;
  }

  const spin = spinner('Analyzing project...');

  try {
    // Detect project info
    const detector = new ProjectDetector(cwd);
    const projectInfo = await detector.detect();

    // Determine framework
    let framework = options.framework as string | undefined;
    if (!framework && projectInfo.frameworks.length > 0) {
      const f = projectInfo.frameworks[0]!;
      framework = f.name;
      spin.stop();
      info(`Detected framework: ${chalk.cyan(f.name)}`);
      spin.start();
    }
    framework = framework || 'vanilla';

    // Determine style
    const style = (options.style as string) || 'minimal';
    const preset = STYLE_PRESETS[style] || STYLE_PRESETS.minimal!;

    spin.text = 'Generating design system with Claude...';

    // Call Claude API
    const designSystem = await generateDesignSystem(apiKey, {
      framework,
      style: preset,
      primaryColor: options.primaryColor as string | undefined,
      projectName: projectInfo.name,
      existingTokens: options.extend ? loadExistingTokens(options.extend as string) : undefined,
    });

    spin.stop();

    // Write output files
    const outputDir = resolve(cwd, (options.output as string) || '.');

    header('Generated Design System');
    newline();

    // Write tokens.json
    const tokensPath = resolve(outputDir, 'tokens.json');
    writeFileSync(tokensPath, JSON.stringify(designSystem.tokens, null, 2));
    success(`Created ${relative(cwd, tokensPath)}`);

    // Write CSS variables
    const cssPath = resolve(outputDir, 'tokens.css');
    writeFileSync(cssPath, designSystem.css);
    success(`Created ${relative(cwd, cssPath)}`);

    // Write Tailwind config if applicable
    if (framework === 'react' || framework === 'nextjs' || framework === 'vue' || framework === 'svelte') {
      const tailwindPath = resolve(outputDir, 'tailwind.tokens.js');
      writeFileSync(tailwindPath, designSystem.tailwind);
      success(`Created ${relative(cwd, tailwindPath)}`);
    }

    newline();
    info('Next steps:');
    info('  1. Review the generated tokens');
    info('  2. Import tokens.css in your app');
    info('  3. Run ' + chalk.cyan('buoy sweep') + ' to check alignment');

  } catch (err) {
    spin.stop();
    const message = err instanceof Error ? err.message : String(err);
    error(`Build failed: ${message}`);

    if (message.includes('401') || message.includes('authentication')) {
      info('Your API key may be invalid. Check it at https://console.anthropic.com/');
    }

    process.exit(1);
  }
}

function createScoreBar(score: number): string {
  const filled = Math.round(score / 10);
  const empty = 10 - filled;

  const color = score >= 60 ? chalk.green
    : score >= 40 ? chalk.yellow
    : chalk.red;

  return color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
}

function formatMaturityLevel(level: string): string {
  const levels: Record<string, string> = {
    'none': chalk.red('None'),
    'emerging': chalk.yellow('Emerging'),
    'defined': chalk.blue('Defined'),
    'managed': chalk.cyan('Managed'),
    'optimized': chalk.green('Optimized')
  };
  return levels[level] || level;
}

function loadExistingTokens(filePath: string): object | undefined {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

interface GenerateOptions {
  framework: string;
  style: StylePreset;
  primaryColor?: string;
  projectName: string;
  existingTokens?: object;
}

interface GeneratedDesignSystem {
  tokens: object;
  css: string;
  tailwind: string;
}

async function generateDesignSystem(
  apiKey: string,
  options: GenerateOptions
): Promise<GeneratedDesignSystem> {
  const prompt = buildPrompt(options);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${errorBody}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text?: string }>;
  };

  const textContent = data.content.find(c => c.type === 'text');
  if (!textContent?.text) {
    throw new Error('No response from Claude');
  }

  // Parse the response to extract JSON blocks
  return parseClaudeResponse(textContent.text);
}

function buildPrompt(options: GenerateOptions): string {
  const primaryColor = options.primaryColor || options.style.colors.primary;

  return `You are a design system expert. Generate a complete design token system for a ${options.framework} project called "${options.projectName}".

Style: ${options.style.name}
Description: ${options.style.description}
Primary Color: ${primaryColor}

${options.existingTokens ? `Extend these existing tokens:\n${JSON.stringify(options.existingTokens, null, 2)}\n` : ''}

Generate a comprehensive design token system with:
1. Color palette (primary, secondary, accent, neutral, semantic colors like success/error/warning)
2. Typography scale (font sizes, line heights, font weights)
3. Spacing scale (consistent increments)
4. Border radii
5. Shadows
6. Breakpoints

Respond with exactly three code blocks:

\`\`\`json
{
  "colors": { ... },
  "typography": { ... },
  "spacing": { ... },
  "radii": { ... },
  "shadows": { ... },
  "breakpoints": { ... }
}
\`\`\`

\`\`\`css
:root {
  /* CSS variables here */
}
\`\`\`

\`\`\`javascript
// Tailwind theme extension
module.exports = {
  theme: {
    extend: { ... }
  }
}
\`\`\`

Be thorough and include semantic color tokens for UI states. Use the primary color to derive a harmonious palette.`;
}

function parseClaudeResponse(response: string): GeneratedDesignSystem {
  // Extract JSON block
  const jsonMatch = response.match(/```json\s*([\s\S]*?)```/);
  const cssMatch = response.match(/```css\s*([\s\S]*?)```/);
  const jsMatch = response.match(/```javascript\s*([\s\S]*?)```/) || response.match(/```js\s*([\s\S]*?)```/);

  let tokens = {};
  let css = '';
  let tailwind = '';

  if (jsonMatch?.[1]) {
    try {
      tokens = JSON.parse(jsonMatch[1].trim());
    } catch {
      // Use empty tokens if parsing fails
      tokens = { error: 'Failed to parse generated tokens' };
    }
  }

  if (cssMatch?.[1]) {
    css = cssMatch[1].trim();
  } else {
    css = generateFallbackCss(tokens);
  }

  if (jsMatch?.[1]) {
    tailwind = jsMatch[1].trim();
  } else {
    tailwind = generateFallbackTailwind(tokens);
  }

  return { tokens, css, tailwind };
}

function generateFallbackCss(tokens: object): string {
  const lines = ['/* Generated by buoy build */', ':root {'];

  const flattenObject = (obj: object, prefix = ''): void => {
    for (const [key, value] of Object.entries(obj)) {
      const varName = prefix ? `${prefix}-${key}` : key;
      if (typeof value === 'object' && value !== null) {
        flattenObject(value, varName);
      } else {
        lines.push(`  --${varName}: ${value};`);
      }
    }
  };

  flattenObject(tokens);
  lines.push('}');

  return lines.join('\n');
}

function generateFallbackTailwind(tokens: object): string {
  return `// Generated by buoy build
/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: ${JSON.stringify(tokens, null, 4).replace(/\n/g, '\n    ')}
  }
};`;
}
