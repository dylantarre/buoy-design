/**
 * Context loader - gathers design system information from the codebase
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type {
  DesignSystemContext,
  TokenWithIntent,
  ComponentSummary,
  Pattern,
  AntiPattern,
} from "./types.js";

/**
 * Load design system context from the project
 */
export async function loadDesignSystemContext(
  cwd: string,
): Promise<DesignSystemContext> {
  const projectName = getProjectName(cwd);
  const tokens = await loadTokens(cwd);
  const components = await loadComponents(cwd);
  const patterns = detectPatterns(components);
  const antiPatterns = getAntiPatterns();

  return {
    tokens,
    components,
    patterns,
    antiPatterns,
    projectName,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Get project name from package.json
 */
function getProjectName(cwd: string): string {
  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      return pkg.name || "Design System";
    } catch {
      // Ignore parse errors
    }
  }
  return "Design System";
}

/**
 * Load tokens from various sources
 */
async function loadTokens(cwd: string): Promise<TokenWithIntent[]> {
  const tokens: TokenWithIntent[] = [];

  // Try to load from exported tokens file
  const tokenPaths = [
    "design-tokens.json",
    "tokens.json",
    ".buoy/tokens.json",
    "tokens-ai-context.json",
  ];

  for (const tokenPath of tokenPaths) {
    const fullPath = join(cwd, tokenPath);
    if (existsSync(fullPath)) {
      try {
        const content = JSON.parse(readFileSync(fullPath, "utf-8"));
        tokens.push(...parseTokenFile(content));
        break;
      } catch {
        // Continue to next path
      }
    }
  }

  // If no token file found, try to scan CSS files
  if (tokens.length === 0) {
    tokens.push(...(await scanCssTokens(cwd)));
  }

  return tokens;
}

/**
 * Parse token file (supports multiple formats)
 */
function parseTokenFile(content: unknown): TokenWithIntent[] {
  const tokens: TokenWithIntent[] = [];

  if (!content || typeof content !== "object") return tokens;

  // AI context format
  if ("tokens" in (content as Record<string, unknown>)) {
    const tokenObj = (
      content as { tokens: Record<string, Record<string, unknown>> }
    ).tokens;
    for (const [category, categoryTokens] of Object.entries(tokenObj)) {
      for (const [name, tokenData] of Object.entries(
        categoryTokens as Record<string, unknown>,
      )) {
        const data = tokenData as Record<string, unknown>;
        tokens.push({
          name,
          value: String(data.$value || data.value || ""),
          category: category as TokenWithIntent["category"],
          intent: data.$intent as TokenWithIntent["intent"],
          usage: data.$usage as string | undefined,
          avoid: data.$avoid as string | undefined,
          examples: data.$examples as string[] | undefined,
          deprecated: data.$deprecated as boolean | undefined,
        });
      }
    }
    return tokens;
  }

  // W3C DTCG format
  if (typeof content === "object") {
    for (const [key, value] of Object.entries(
      content as Record<string, unknown>,
    )) {
      if (value && typeof value === "object" && "$value" in value) {
        const v = value as Record<string, unknown>;
        tokens.push({
          name: key,
          value: String(v.$value),
          category: inferCategory(key, String(v.$value)),
          usage: v.$description as string | undefined,
        });
      }
    }
  }

  return tokens;
}

/**
 * Infer token category from name and value
 */
function inferCategory(
  name: string,
  value: string,
): TokenWithIntent["category"] {
  const lower = name.toLowerCase();
  if (
    lower.includes("color") ||
    value.startsWith("#") ||
    value.startsWith("rgb")
  ) {
    return "color";
  }
  if (
    lower.includes("spacing") ||
    lower.includes("space") ||
    lower.includes("gap")
  ) {
    return "spacing";
  }
  if (
    lower.includes("font") ||
    lower.includes("text") ||
    lower.includes("typography")
  ) {
    return "typography";
  }
  if (lower.includes("radius") || lower.includes("rounded")) {
    return "radius";
  }
  if (lower.includes("shadow")) {
    return "shadow";
  }
  return "color"; // Default
}

/**
 * Scan CSS files for tokens (fallback)
 */
async function scanCssTokens(_cwd: string): Promise<TokenWithIntent[]> {
  // This would scan CSS files for custom properties
  // Simplified for now - real implementation would use the scanners package
  return [];
}

/**
 * Load components from the codebase
 */
async function loadComponents(cwd: string): Promise<ComponentSummary[]> {
  const components: ComponentSummary[] = [];

  // Try to load from cached component inventory
  const inventoryPath = join(cwd, ".buoy/components.json");
  if (existsSync(inventoryPath)) {
    try {
      const content = JSON.parse(readFileSync(inventoryPath, "utf-8"));
      if (Array.isArray(content)) {
        return content as ComponentSummary[];
      }
    } catch {
      // Continue to scanning
    }
  }

  // Check for skill-generated inventory
  const skillInventory = join(
    cwd,
    ".claude/skills/design-system/components/_inventory.md",
  );
  if (existsSync(skillInventory)) {
    const content = readFileSync(skillInventory, "utf-8");
    components.push(...parseInventoryMarkdown(content));
  }

  return components;
}

/**
 * Parse component inventory from markdown
 */
function parseInventoryMarkdown(content: string): ComponentSummary[] {
  const components: ComponentSummary[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    // Parse table rows: | ComponentName | Description | Props |
    const match = line.match(/^\|\s*`?(\w+)`?\s*\|([^|]*)\|([^|]*)\|/);
    if (match && match[1] && match[2] && match[3] && match[1] !== "Component") {
      components.push({
        name: match[1],
        framework: "react", // Default assumption
        props: match[3]
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean),
        description: match[2].trim(),
        path: "",
      });
    }
  }

  return components;
}

/**
 * Detect patterns from component usage
 */
function detectPatterns(components: ComponentSummary[]): Pattern[] {
  const patterns: Pattern[] = [];

  // Form pattern
  const formComponents = components.filter((c) =>
    ["Input", "Select", "Checkbox", "Radio", "Form", "Label"].some((n) =>
      c.name.includes(n),
    ),
  );
  if (formComponents.length > 0) {
    patterns.push({
      name: "Forms",
      description: "Form input and validation patterns",
      components: formComponents.map((c) => c.name),
      usage:
        "Use for user input collection with consistent styling and validation",
    });
  }

  // Navigation pattern
  const navComponents = components.filter((c) =>
    ["Nav", "Menu", "Sidebar", "Header", "Footer", "Tab", "Breadcrumb"].some(
      (n) => c.name.includes(n),
    ),
  );
  if (navComponents.length > 0) {
    patterns.push({
      name: "Navigation",
      description: "Navigation and menu patterns",
      components: navComponents.map((c) => c.name),
      usage: "Use for site navigation with consistent structure",
    });
  }

  // Card pattern
  const cardComponents = components.filter((c) =>
    ["Card", "Panel", "Box", "Container"].some((n) => c.name.includes(n)),
  );
  if (cardComponents.length > 0) {
    patterns.push({
      name: "Cards",
      description: "Content container patterns",
      components: cardComponents.map((c) => c.name),
      usage: "Use for grouping related content",
    });
  }

  // Modal pattern
  const modalComponents = components.filter((c) =>
    ["Modal", "Dialog", "Drawer", "Sheet", "Popover"].some((n) =>
      c.name.includes(n),
    ),
  );
  if (modalComponents.length > 0) {
    patterns.push({
      name: "Modals",
      description: "Overlay and dialog patterns",
      components: modalComponents.map((c) => c.name),
      usage: "Use for focused interactions that require attention",
    });
  }

  return patterns;
}

/**
 * Get common anti-patterns to avoid
 */
function getAntiPatterns(): AntiPattern[] {
  return [
    {
      name: "Hardcoded Colors",
      description: "Using hex/rgb values directly instead of design tokens",
      avoid: 'style={{ color: "#2563EB" }} or color: #2563EB',
      instead:
        'Use color tokens: className="text-primary" or color={tokens.primary}',
      severity: "warning",
    },
    {
      name: "Arbitrary Spacing",
      description: "Using pixel values not in the spacing scale",
      avoid: "padding: 13px or p-[13px]",
      instead: "Use spacing scale: p-4 (16px) or p-3 (12px)",
      severity: "warning",
    },
    {
      name: "Inline onClick Handlers",
      description: "Using div/span with onClick instead of semantic elements",
      avoid: "<div onClick={handleClick}>Click me</div>",
      instead: "Use <Button> or <button> for clickable elements",
      severity: "critical",
    },
    {
      name: "Missing Alt Text",
      description: "Images without alt attributes",
      avoid: '<img src="logo.png" />',
      instead: '<img src="logo.png" alt="Company logo" />',
      severity: "critical",
    },
    {
      name: "Custom Component Creation",
      description: "Creating new components when existing ones would work",
      avoid: "Creating MyButton.tsx when Button component exists",
      instead: "Check component inventory first, extend existing if needed",
      severity: "info",
    },
    {
      name: "Inconsistent Naming",
      description: "Component names that dont follow project conventions",
      avoid: "my-component.tsx or MyComponent.jsx",
      instead: "Follow project naming: ComponentName.tsx",
      severity: "info",
    },
  ];
}

/**
 * Get tokens by category
 */
export function getTokensByCategory(
  context: DesignSystemContext,
  category: string,
): TokenWithIntent[] {
  return context.tokens.filter((t) => t.category === category);
}

/**
 * Find component by name
 */
export function findComponent(
  context: DesignSystemContext,
  name: string,
): ComponentSummary | undefined {
  return context.components.find(
    (c) => c.name.toLowerCase() === name.toLowerCase(),
  );
}

/**
 * Search components by use case
 */
export function searchComponents(
  context: DesignSystemContext,
  useCase: string,
): ComponentSummary[] {
  const keywords = useCase.toLowerCase().split(/\s+/);

  return context.components.filter((c) => {
    const searchText =
      `${c.name} ${c.description || ""} ${c.props.join(" ")}`.toLowerCase();
    return keywords.some((kw) => searchText.includes(kw));
  });
}
