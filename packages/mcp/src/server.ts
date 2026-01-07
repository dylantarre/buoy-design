/**
 * Buoy MCP Server
 *
 * Provides design system context to AI agents via Model Context Protocol.
 *
 * Resources:
 * - tokens://all - All design tokens
 * - tokens://{category} - Tokens by category (color, spacing, typography)
 * - components://inventory - Component catalog
 * - components://{name} - Component details
 * - patterns://all - Pattern library
 * - antipatterns://all - Anti-patterns to avoid
 *
 * Tools:
 * - find_component - Find best component for a use case
 * - validate_code - Check code against design system
 * - resolve_token - Find token for a hardcoded value
 * - suggest_fix - Get fix suggestion for drift
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  loadDesignSystemContext,
  getTokensByCategory,
  findComponent,
  searchComponents,
} from "./context-loader.js";
import type {
  DesignSystemContext,
  FindComponentRequest,
  FindComponentResponse,
  ValidateCodeRequest,
  ValidateCodeResponse,
  ResolveTokenRequest,
  ResolveTokenResponse,
  TokenWithIntent,
} from "./types.js";

/**
 * Create and configure the Buoy MCP server
 */
export function createServer(cwd: string = process.cwd()): Server {
  const server = new Server(
    {
      name: "buoy-design-system",
      version: "0.1.0",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    },
  );

  let context: DesignSystemContext | null = null;

  /**
   * Load context on demand
   */
  async function getContext(): Promise<DesignSystemContext> {
    if (!context) {
      context = await loadDesignSystemContext(cwd);
    }
    return context;
  }

  /**
   * List available resources
   */
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: "tokens://all",
          name: "All Design Tokens",
          description: "Complete list of design tokens with usage guidance",
          mimeType: "application/json",
        },
        {
          uri: "tokens://color",
          name: "Color Tokens",
          description: "Color tokens with semantic meaning",
          mimeType: "application/json",
        },
        {
          uri: "tokens://spacing",
          name: "Spacing Tokens",
          description: "Spacing scale for consistent layouts",
          mimeType: "application/json",
        },
        {
          uri: "tokens://typography",
          name: "Typography Tokens",
          description: "Font sizes, weights, and families",
          mimeType: "application/json",
        },
        {
          uri: "components://inventory",
          name: "Component Inventory",
          description: "All available UI components",
          mimeType: "application/json",
        },
        {
          uri: "patterns://all",
          name: "Pattern Library",
          description: "Common UI patterns and compositions",
          mimeType: "application/json",
        },
        {
          uri: "antipatterns://all",
          name: "Anti-Patterns",
          description: "Things to avoid in this design system",
          mimeType: "application/json",
        },
      ],
    };
  });

  /**
   * Read resource content
   */
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const ctx = await getContext();
    const uri = request.params.uri;

    // Tokens resources
    if (uri === "tokens://all") {
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(ctx.tokens, null, 2),
          },
        ],
      };
    }

    if (uri.startsWith("tokens://")) {
      const category = uri.replace("tokens://", "");
      const tokens = getTokensByCategory(ctx, category);
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(tokens, null, 2),
          },
        ],
      };
    }

    // Components resources
    if (uri === "components://inventory") {
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(ctx.components, null, 2),
          },
        ],
      };
    }

    if (uri.startsWith("components://")) {
      const name = uri.replace("components://", "");
      const component = findComponent(ctx, name);
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: component
              ? JSON.stringify(component, null, 2)
              : JSON.stringify({ error: `Component "${name}" not found` }),
          },
        ],
      };
    }

    // Patterns resources
    if (uri === "patterns://all") {
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(ctx.patterns, null, 2),
          },
        ],
      };
    }

    // Anti-patterns resources
    if (uri === "antipatterns://all") {
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(ctx.antiPatterns, null, 2),
          },
        ],
      };
    }

    throw new Error(`Unknown resource: ${uri}`);
  });

  /**
   * List available tools
   */
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "find_component",
          description:
            "Find the best component for a use case. Returns recommended component with alternatives.",
          inputSchema: {
            type: "object",
            properties: {
              useCase: {
                type: "string",
                description:
                  'Description of what you want to build (e.g., "submit button", "form input")',
              },
              constraints: {
                type: "array",
                items: { type: "string" },
                description:
                  'Optional constraints (e.g., "accessible", "responsive")',
              },
            },
            required: ["useCase"],
          },
        },
        {
          name: "validate_code",
          description:
            "Validate code against design system rules. Returns issues and suggestions.",
          inputSchema: {
            type: "object",
            properties: {
              code: {
                type: "string",
                description: "The code to validate",
              },
              filePath: {
                type: "string",
                description: "Optional file path for context",
              },
            },
            required: ["code"],
          },
        },
        {
          name: "resolve_token",
          description:
            "Find the design token that matches a hardcoded value. Returns exact or closest match.",
          inputSchema: {
            type: "object",
            properties: {
              value: {
                type: "string",
                description: 'The hardcoded value (e.g., "#2563EB", "16px")',
              },
              context: {
                type: "string",
                enum: ["color", "spacing", "typography"],
                description: "Optional hint about value type",
              },
            },
            required: ["value"],
          },
        },
        {
          name: "suggest_fix",
          description: "Get a fix suggestion for a design system violation.",
          inputSchema: {
            type: "object",
            properties: {
              type: {
                type: "string",
                description:
                  'Type of violation (e.g., "hardcoded-color", "arbitrary-spacing")',
              },
              value: {
                type: "string",
                description: "The problematic value",
              },
              location: {
                type: "string",
                description: "Where the violation occurs (file:line)",
              },
            },
            required: ["type", "value"],
          },
        },
      ],
    };
  });

  /**
   * Handle tool calls
   */
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const ctx = await getContext();
    const { name, arguments: args } = request.params;

    switch (name) {
      case "find_component": {
        if (
          !args ||
          typeof args !== "object" ||
          !("useCase" in args) ||
          typeof args.useCase !== "string"
        ) {
          throw new Error(
            'Invalid find_component request: missing required "useCase" parameter',
          );
        }
        const { useCase, constraints } =
          args as unknown as FindComponentRequest;
        const result = handleFindComponent(ctx, useCase, constraints);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "validate_code": {
        if (
          !args ||
          typeof args !== "object" ||
          !("code" in args) ||
          typeof args.code !== "string"
        ) {
          throw new Error(
            'Invalid validate_code request: missing required "code" parameter',
          );
        }
        const { code, filePath } = args as unknown as ValidateCodeRequest;
        const result = handleValidateCode(ctx, code, filePath);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "resolve_token": {
        if (
          !args ||
          typeof args !== "object" ||
          !("value" in args) ||
          typeof args.value !== "string"
        ) {
          throw new Error(
            'Invalid resolve_token request: missing required "value" parameter',
          );
        }
        const { value, context: tokenContext } =
          args as unknown as ResolveTokenRequest;
        const result = handleResolveToken(ctx, value, tokenContext);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "suggest_fix": {
        const { type, value, location } = args as {
          type: string;
          value: string;
          location?: string;
        };
        const result = handleSuggestFix(ctx, type, value, location);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  return server;
}

/**
 * Find component handler
 */
function handleFindComponent(
  ctx: DesignSystemContext,
  useCase: string,
  constraints?: string[],
): FindComponentResponse {
  const matches = searchComponents(ctx, useCase);

  if (matches.length === 0) {
    // No Dead Ends: Provide guidance when no components found
    const availableComponents = ctx.components.slice(0, 5).map((c) => c.name);
    return {
      recommended: null,
      alternatives: [],
      reasoning: `No existing component found for "${useCase}".`,
      guidance: {
        suggestion:
          "Consider creating a new component or composing existing ones.",
        availableComponents:
          availableComponents.length > 0
            ? `Available components include: ${availableComponents.join(", ")}`
            : "No components in inventory. Run `buoy sweep` to discover components.",
        nextSteps:
          ctx.components.length === 0
            ? [
                "Run `buoy sweep` to discover components",
                "Run `buoy skill spill` to populate component inventory",
              ]
            : [
                "Check component naming - try broader search terms",
                "View full inventory with components://inventory",
              ],
      },
    };
  }

  // Score matches (simple scoring for now)
  const scored = matches.map((c) => ({
    component: c,
    score: calculateMatchScore(c, useCase, constraints),
  }));

  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    // This should never happen due to early return above, but just in case
    return {
      recommended: null,
      alternatives: [],
      reasoning: "No matches found",
    };
  }

  const recommended = scored[0]!.component;
  const alternatives = scored.slice(1, 4).map((s) => s.component);

  return {
    recommended,
    alternatives,
    reasoning: `"${recommended.name}" is the best match for "${useCase}". ${
      recommended.description || ""
    }`,
  };
}

/**
 * Calculate match score for a component
 */
function calculateMatchScore(
  component: { name: string; description?: string; props: string[] },
  useCase: string,
  constraints?: string[],
): number {
  let score = 0;
  const searchText =
    `${component.name} ${component.description || ""} ${component.props.join(" ")}`.toLowerCase();
  const useCaseLower = useCase.toLowerCase();

  // Name match
  if (component.name.toLowerCase().includes(useCaseLower)) {
    score += 10;
  }

  // Keyword matches
  const keywords = useCaseLower.split(/\s+/);
  for (const keyword of keywords) {
    if (searchText.includes(keyword)) {
      score += 2;
    }
  }

  // Constraint matches
  if (constraints) {
    for (const constraint of constraints) {
      if (searchText.includes(constraint.toLowerCase())) {
        score += 3;
      }
    }
  }

  return score;
}

/**
 * Validate code handler
 */
function handleValidateCode(
  ctx: DesignSystemContext,
  code: string,
  _filePath?: string,
): ValidateCodeResponse {
  const issues: ValidateCodeResponse["issues"] = [];

  // Check for hardcoded colors
  const hexColors = code.match(/#[0-9A-Fa-f]{3,8}\b/g) || [];
  const rgbColors = code.match(/rgb\([^)]+\)/g) || [];

  for (const color of [...hexColors, ...rgbColors]) {
    // Check if it's a token value
    const isToken = ctx.tokens.some(
      (t) => t.value.toLowerCase() === color.toLowerCase(),
    );
    if (!isToken) {
      const match = findClosestToken(ctx, color, "color");
      issues.push({
        type: "hardcoded-color",
        severity: "warning",
        message: `Hardcoded color "${color}" - use design token instead`,
        suggestion: match
          ? `Use token: ${match.name} (${match.value})`
          : undefined,
      });
    }
  }

  // Check for arbitrary spacing
  const arbitrarySpacing = code.match(/\b\d+px\b/g) || [];
  const spacingScale = ctx.tokens
    .filter((t) => t.category === "spacing")
    .map((t) => t.value);

  for (const spacing of arbitrarySpacing) {
    if (!spacingScale.includes(spacing)) {
      const match = findClosestToken(ctx, spacing, "spacing");
      issues.push({
        type: "arbitrary-spacing",
        severity: "warning",
        message: `Arbitrary spacing "${spacing}" - use spacing scale`,
        suggestion: match
          ? `Use token: ${match.name} (${match.value})`
          : undefined,
      });
    }
  }

  // Check for div onClick (accessibility anti-pattern)
  if (/<div[^>]*onClick/i.test(code)) {
    issues.push({
      type: "accessibility",
      severity: "critical",
      message: "Using div with onClick - use button or Button component",
      suggestion: "Replace <div onClick> with <Button onClick>",
    });
  }

  // Check for img without alt
  if (/<img[^>]*(?!alt)[^>]*>/i.test(code) && !/<img[^>]*alt=/i.test(code)) {
    issues.push({
      type: "accessibility",
      severity: "critical",
      message: "Image missing alt attribute",
      suggestion: 'Add alt="description" to img element',
    });
  }

  // No Dead Ends: Provide context about what was checked
  const checksPerformed = [
    "Hardcoded colors",
    "Arbitrary spacing values",
    "Accessibility anti-patterns (div onClick, img alt)",
  ];

  return {
    valid: issues.length === 0,
    issues,
    summary: {
      total: issues.length,
      critical: issues.filter((i) => i.severity === "critical").length,
      warning: issues.filter((i) => i.severity === "warning").length,
      info: issues.filter((i) => i.severity === "info").length,
    },
    context: {
      checksPerformed,
      tokensAvailable: ctx.tokens.length,
      componentsKnown: ctx.components.length,
      guidance:
        issues.length === 0
          ? "Code follows design system rules. Run `buoy check` for comprehensive analysis."
          : "Fix issues above, then re-validate. Run `buoy fix --dry-run` for automated suggestions.",
    },
  };
}

/**
 * Resolve token handler
 */
function handleResolveToken(
  ctx: DesignSystemContext,
  value: string,
  tokenContext?: "color" | "spacing" | "typography",
): ResolveTokenResponse {
  // Filter tokens by context if provided
  const candidates = tokenContext
    ? ctx.tokens.filter((t) => t.category === tokenContext)
    : ctx.tokens;

  // Look for exact match
  const exactMatch = candidates.find(
    (t) => t.value.toLowerCase() === value.toLowerCase(),
  );

  if (exactMatch) {
    return {
      exactMatch,
      closestMatches: [],
      suggestion: `Use token: ${exactMatch.name}`,
    };
  }

  // Find closest matches
  const closest = findClosestToken(ctx, value, tokenContext);

  if (closest) {
    return {
      exactMatch: null,
      closestMatches: [{ token: closest, similarity: 0.8 }],
      suggestion: `Closest token: ${closest.name} (${closest.value})`,
    };
  }

  // No Dead Ends: Explain why no match and suggest next steps
  const availableCategories = [...new Set(ctx.tokens.map((t) => t.category))];
  return {
    exactMatch: null,
    closestMatches: [],
    suggestion: `No matching token found for "${value}".`,
    guidance: {
      tokenCount: ctx.tokens.length,
      availableCategories:
        availableCategories.length > 0
          ? availableCategories
          : ["No tokens loaded"],
      nextSteps:
        ctx.tokens.length === 0
          ? [
              "Run `buoy tokens` to extract tokens from hardcoded values",
              "Add a design-tokens.json file",
              "Run `buoy sweep` to discover tokens from CSS",
            ]
          : [
              "Consider adding a new token for this value",
              "Use the closest available value from the scale",
              `View available tokens: tokens://${tokenContext || "all"}`,
            ],
    },
  };
}

/**
 * Find closest matching token
 */
function findClosestToken(
  ctx: DesignSystemContext,
  value: string,
  category?: string,
): TokenWithIntent | null {
  const candidates = category
    ? ctx.tokens.filter((t) => t.category === category)
    : ctx.tokens;

  if (candidates.length === 0) return null;

  // For colors, try to find similar hue
  if (value.startsWith("#") || value.startsWith("rgb")) {
    return candidates[0]!; // We know candidates is not empty
  }

  // For spacing, find closest numeric value
  const numericValue = parseFloat(value);
  if (!isNaN(numericValue)) {
    let closest = candidates[0]!;
    let closestDiff = Infinity;

    for (const token of candidates) {
      const tokenValue = parseFloat(token.value);
      if (!isNaN(tokenValue)) {
        const diff = Math.abs(tokenValue - numericValue);
        if (diff < closestDiff) {
          closestDiff = diff;
          closest = token;
        }
      }
    }

    return closest;
  }

  return candidates[0]!;
}

/**
 * Suggest fix handler
 */
function handleSuggestFix(
  ctx: DesignSystemContext,
  type: string,
  value: string,
  location?: string,
) {
  // Determine category from type
  let category: "color" | "spacing" | "typography" | undefined;
  if (type.includes("color")) category = "color";
  else if (type.includes("spacing")) category = "spacing";
  else if (type.includes("font") || type.includes("typography"))
    category = "typography";

  const closest = findClosestToken(ctx, value, category);

  if (!closest) {
    // No Dead Ends: Explain why no fix and suggest next steps
    return {
      fix: null,
      explanation: `No suitable token found for "${value}"`,
      alternatives: [],
      guidance: {
        tokenCount: ctx.tokens.length,
        categorySearched: category || "all",
        nextSteps:
          ctx.tokens.length === 0
            ? [
                "Run `buoy tokens` to extract tokens from codebase",
                "Add a design-tokens.json file",
                "Manual fix: replace with CSS variable or theme token",
              ]
            : [
                "Value may be intentionally one-off (consider documenting)",
                "Run `buoy fix --confidence low` to see all suggestions",
                "Create a new token for this value if it will be reused",
              ],
      },
    };
  }

  // Generate fix based on type
  let replacement = closest.name;
  if (type.includes("color")) {
    replacement = `var(--${closest.name})`;
  } else if (type.includes("class")) {
    replacement = closest.name.replace(/^(color|spacing|font)-/, "");
  }

  return {
    fix: {
      type: "replace" as const,
      original: value,
      replacement,
      confidence: 0.85,
    },
    explanation: `Replace hardcoded value with design token "${closest.name}"${
      location ? ` at ${location}` : ""
    }`,
    alternatives: ctx.tokens
      .filter((t) => t.category === category && t.name !== closest.name)
      .slice(0, 3)
      .map((t) => t.name),
  };
}

/**
 * Start the MCP server
 */
export async function startServer(cwd: string = process.cwd()): Promise<void> {
  const server = createServer(cwd);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
