import {
  Scanner,
  ScanResult,
  ScannerConfig,
  ScanError,
  ScanStats,
  parallelProcess,
  extractResults,
} from "../base/scanner.js";
import type {
  DesignToken,
  TokenCategory,
  TokenValue,
  JsonTokenSource,
  CssTokenSource,
  TypeScriptTokenSource,
} from "@buoy-design/core";
import { createTokenId } from "@buoy-design/core";
import { glob } from "glob";
import { readFile } from "fs/promises";
import { relative, extname } from "path";

export interface TokenScannerConfig extends ScannerConfig {
  files?: string[];
  cssVariablePrefix?: string;
}

export class TokenScanner extends Scanner<DesignToken, TokenScannerConfig> {
  async scan(): Promise<ScanResult<DesignToken>> {
    const startTime = Date.now();
    const tokenMap = new Map<string, DesignToken>(); // Dedupe by ID
    const errors: ScanError[] = [];
    const scannedFiles = new Set<string>();
    const cache = this.config.cache;
    let cacheHits = 0;
    let cacheMisses = 0;

    // Helper to add tokens with deduplication
    const addTokens = (newTokens: DesignToken[]) => {
      for (const token of newTokens) {
        if (!tokenMap.has(token.id)) {
          tokenMap.set(token.id, token);
        }
      }
    };

    // Collect all files to scan
    let filesToScan: string[] = [];

    if (this.config.files && this.config.files.length > 0) {
      // Scan explicitly configured files
      for (const pattern of this.config.files) {
        const matches = await glob(pattern, {
          cwd: this.config.projectRoot,
          absolute: true,
        });
        filesToScan.push(...matches);
      }
    } else {
      // Scan default patterns
      const jsonFiles = await this.findTokenFiles([
        "**/*.tokens.json",
        "**/tokens.json",
        "**/tokens/**/*.json",
        // Semantic token JSON files (Chakra UI v3)
        "**/semantic-tokens/**/*.json",
        // Style definition files (text-styles.json, animation-styles.json, layer-styles.json)
        "**/*-styles.json",
        // Theme token JSON files
        "**/theme/**/*.json",
      ]);
      const cssFiles = await this.findTokenFiles(["**/*.css", "**/*.scss"]);
      const tsFiles = await this.findTokenFiles([
        // Type definition files
        "**/types.ts",
        "**/types.tsx",
        "**/types/**/*.ts",
        "**/types/**/*.tsx",
        "**/*.types.ts",
        "**/*.types.tsx",
        // Token definition files (TypeScript objects)
        "**/tokens/**/*.ts",
        "**/tokens/**/*.tsx",
        "**/tokens.ts",
        "**/theme/tokens.ts",
        "**/theme/**/*.ts",
        // Semantic token files (Chakra UI v3, Panda CSS)
        "**/semantic-tokens/**/*.ts",
        "**/semantic-tokens/**/*.tsx",
        // Mantine-style theme definition files
        "**/default-theme.ts",
        "**/default-colors.ts",
        "**/*Provider/**/*.ts",
        "**/*Provider/**/*.tsx",
        // Generated token files (Chakra UI v3, Panda CSS)
        "**/*.gen.ts",
        "**/generated/**/*.ts",
        // Keyframes/animations files
        "**/keyframes.ts",
        "**/animations.ts",
      ]);
      filesToScan = [...jsonFiles, ...cssFiles, ...tsFiles];
    }

    // Deduplicate files
    filesToScan = [...new Set(filesToScan)];

    // Check cache for all files if caching is enabled
    let filesToProcess = filesToScan;
    if (cache) {
      const { filesToScan: uncached, cachedEntries } = await cache.checkFiles(
        filesToScan,
        this.getSourceType(),
      );
      filesToProcess = uncached;
      cacheHits = cachedEntries.length;
      cacheMisses = uncached.length;

      // Add cached tokens
      for (const entry of cachedEntries) {
        try {
          const cachedTokens = JSON.parse(entry.result) as DesignToken[];
          addTokens(cachedTokens);
          scannedFiles.add(entry.path);
        } catch {
          // Corrupt cache - add to process list
          const absPath = `${this.config.projectRoot}/${entry.path}`;
          if (!filesToProcess.includes(absPath)) {
            filesToProcess.push(absPath);
          }
        }
      }
    }

    // Process files in parallel
    const results = await parallelProcess(
      filesToProcess,
      async (file) => {
        const ext = extname(file);
        let tokens: DesignToken[] = [];
        if (ext === ".json") {
          tokens = await this.parseJsonTokenFile(file);
        } else if (ext === ".css" || ext === ".scss") {
          tokens = await this.parseCssVariables(file);
        } else if (ext === ".ts" || ext === ".tsx") {
          tokens = await this.parseTypeScriptUnionTypes(file);
        }
        // Store in cache
        if (cache) {
          await cache.storeResult(file, this.getSourceType(), tokens);
        }
        return { file, tokens };
      },
      this.concurrency,
    );

    // Process results
    const { successes } = extractResults(results);
    for (const success of successes) {
      scannedFiles.add(success.file);
      addTokens(success.tokens);
    }

    // Map failures to errors
    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      if (result.status === "rejected") {
        const file = filesToProcess[i]!;
        const ext = extname(file);
        const message =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        const code =
          ext === ".json"
            ? "JSON_PARSE_ERROR"
            : ext === ".ts" || ext === ".tsx"
              ? "TS_PARSE_ERROR"
              : "CSS_PARSE_ERROR";
        errors.push({ file, message, code });
      }
    }

    const tokens = Array.from(tokenMap.values());
    const stats: ScanStats = {
      filesScanned: scannedFiles.size,
      itemsFound: tokens.length,
      duration: Date.now() - startTime,
    };

    return {
      items: tokens,
      errors,
      stats,
      ...(cache ? { cacheStats: { hits: cacheHits, misses: cacheMisses } } : {}),
    } as ScanResult<DesignToken>;
  }

  getSourceType(): string {
    return "tokens";
  }

  private async findTokenFiles(patterns: string[]): Promise<string[]> {
    const allFiles: string[] = [];
    const ignore = this.config.exclude || ["**/node_modules/**", "**/dist/**"];

    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: this.config.projectRoot,
        ignore,
        absolute: true,
      });
      allFiles.push(...matches);
    }

    return [...new Set(allFiles)];
  }

  private async parseJsonTokenFile(filePath: string): Promise<DesignToken[]> {
    const content = await readFile(filePath, "utf-8");
    const data = JSON.parse(content);
    const relativePath = relative(this.config.projectRoot, filePath);
    const tokens: DesignToken[] = [];

    // Handle JSON arrays of token names (Chakra UI generated format)
    if (Array.isArray(data)) {
      const arrayTokens = this.parseJsonArrayTokens(data, relativePath);
      return arrayTokens;
    }

    const processTokens = (
      obj: Record<string, unknown>,
      prefix: string = "",
    ) => {
      for (const [key, value] of Object.entries(obj)) {
        const tokenName = prefix ? `${prefix}.${key}` : key;

        if (this.isTokenValue(value)) {
          const token = this.createTokenFromJson(
            tokenName,
            value,
            relativePath,
          );
          if (token) tokens.push(token);
        } else if (typeof value === "object" && value !== null) {
          processTokens(value as Record<string, unknown>, tokenName);
        }
      }
    };

    processTokens(data);
    return tokens;
  }

  /**
   * Parse JSON arrays of token names (Chakra UI generated format).
   * These are arrays like ["transparent", "current", "black", "white", "gray.50", ...]
   * The token category is inferred from the filename.
   */
  private parseJsonArrayTokens(
    data: unknown[],
    filePath: string,
  ): DesignToken[] {
    const tokens: DesignToken[] = [];

    // Infer category from filename (e.g., "colors.json" -> "color", "spacing.json" -> "spacing")
    const category = this.inferCategoryFromFilePath(filePath);

    for (const item of data) {
      if (typeof item !== "string") continue;

      const name = item;
      const source: JsonTokenSource = {
        type: "json",
        path: filePath,
        key: name,
      };

      // For array tokens, we don't have actual values, just names
      // Use a "reference" type value indicating this is a token name reference
      const tokenValue: TokenValue = {
        type: "raw",
        value: name, // The token name itself serves as the reference
      };

      tokens.push({
        id: createTokenId(source, name),
        name,
        category: this.normalizeCategory(category),
        value: tokenValue,
        source,
        aliases: [],
        usedBy: [],
        metadata: {
          description: `Token name from ${filePath}`,
        },
        scannedAt: new Date(),
      });
    }

    return tokens;
  }

  /**
   * Infer token category from the JSON file path.
   * Examples:
   *   - "tokens/colors.json" -> "color"
   *   - "tokens/font-sizes.json" -> "typography"
   *   - "tokens/spacing.json" -> "spacing"
   */
  private inferCategoryFromFilePath(filePath: string): string {
    const fileName = filePath.split("/").pop() || "";
    const baseName = fileName.replace(".json", "").toLowerCase();

    // Map common file names to categories
    const fileNameToCategory: Record<string, string> = {
      colors: "color",
      color: "color",
      spacing: "spacing",
      space: "spacing",
      "font-sizes": "typography",
      fontsizes: "typography",
      "font-weights": "typography",
      fontweights: "typography",
      fonts: "typography",
      "line-heights": "typography",
      lineheights: "typography",
      "letter-spacings": "typography",
      letterspacing: "typography",
      shadows: "shadow",
      shadow: "shadow",
      radii: "border",
      radius: "border",
      borders: "border",
      border: "border",
      sizes: "sizing",
      size: "sizing",
      durations: "motion",
      duration: "motion",
      easings: "motion",
      easing: "motion",
      animations: "motion",
      animation: "motion",
      "z-index": "other",
      zindex: "other",
      cursor: "other",
      cursors: "other",
      blurs: "other",
      blur: "other",
      "aspect-ratios": "other",
      aspectratios: "other",
      // Style definition files
      "text-styles": "typography",
      textstyles: "typography",
      "animation-styles": "motion",
      animationstyles: "motion",
      "layer-styles": "other",
      layerstyles: "other",
    };

    return fileNameToCategory[baseName] || "other";
  }

  private isTokenValue(value: unknown): value is Record<string, unknown> {
    if (typeof value !== "object" || value === null) return false;
    const obj = value as Record<string, unknown>;

    // Check for common token formats
    // Style Dictionary format: { value: "...", type: "..." }
    if ("value" in obj) return true;

    // Direct value format: { $value: "..." }
    if ("$value" in obj) return true;

    return false;
  }

  private createTokenFromJson(
    name: string,
    value: Record<string, unknown>,
    filePath: string,
  ): DesignToken | null {
    const rawValue = (value.value || value.$value) as
      | string
      | number
      | undefined;
    const type = (value.type ||
      value.$type ||
      this.inferCategory(name, rawValue)) as string;

    if (rawValue === undefined) return null;

    const source: JsonTokenSource = {
      type: "json",
      path: filePath,
      key: name,
    };

    const tokenValue = this.parseTokenValue(type, rawValue);

    return {
      id: createTokenId(source, name),
      name,
      category: this.normalizeCategory(type),
      value: tokenValue,
      source,
      aliases: [],
      usedBy: [],
      metadata: {
        description: value.description as string | undefined,
      },
      scannedAt: new Date(),
    };
  }

  private async parseCssVariables(filePath: string): Promise<DesignToken[]> {
    const content = await readFile(filePath, "utf-8");
    const relativePath = relative(this.config.projectRoot, filePath);
    const tokens: DesignToken[] = [];

    // Remove CSS comments before parsing to avoid matching inside comments
    const contentWithoutComments = this.stripCssComments(content);

    // Extract CSS custom properties using a robust parser
    const cssVariables = this.extractCssVariables(
      contentWithoutComments,
      content,
    );

    for (const { name, value, lineNumber } of cssVariables) {
      const prefix = this.config.cssVariablePrefix;

      // Skip if prefix is configured and doesn't match
      if (prefix && !name.startsWith(prefix.replace(/^--/, ""))) {
        continue;
      }

      const cleanName = name.trim();
      const cleanValue = value.trim();

      const source: CssTokenSource = {
        type: "css",
        path: relativePath,
        line: lineNumber,
      };

      const category = this.inferCategory(cleanName, cleanValue);
      const tokenValue = this.parseTokenValue(category, cleanValue);

      tokens.push({
        id: createTokenId(source, cleanName),
        name: `--${cleanName}`,
        category: this.normalizeCategory(category),
        value: tokenValue,
        source,
        aliases: [],
        usedBy: [],
        metadata: {},
        scannedAt: new Date(),
      });
    }

    // Extract SCSS variables using a robust parser
    const scssVariables = this.extractScssVariables(
      contentWithoutComments,
      content,
    );

    for (const { name, value, lineNumber } of scssVariables) {
      const cleanName = name.trim();
      const cleanValue = value.trim();

      const source: CssTokenSource = {
        type: "css",
        path: relativePath,
        line: lineNumber,
      };

      const category = this.inferCategory(cleanName, cleanValue);
      const tokenValue = this.parseTokenValue(category, cleanValue);

      tokens.push({
        id: createTokenId(source, cleanName),
        name: `$${cleanName}`,
        category: this.normalizeCategory(category),
        value: tokenValue,
        source,
        aliases: [],
        usedBy: [],
        metadata: {},
        scannedAt: new Date(),
      });
    }

    return tokens;
  }

  /**
   * Strip CSS comments from content, preserving line structure
   * for accurate line number calculation
   */
  private stripCssComments(content: string): string {
    let result = "";
    let i = 0;
    while (i < content.length) {
      // Check for comment start
      if (content[i] === "/" && content[i + 1] === "*") {
        // Find comment end
        let j = i + 2;
        while (
          j < content.length &&
          !(content[j] === "*" && content[j + 1] === "/")
        ) {
          // Preserve newlines so line numbers stay accurate
          if (content[j] === "\n") {
            result += "\n";
          }
          j++;
        }
        // Skip past closing */
        i = j + 2;
      } else {
        result += content[i];
        i++;
      }
    }
    return result;
  }

  /**
   * Extract CSS custom properties handling:
   * - Multi-line values (gradients, box-shadows)
   * - Values containing semicolons in url() or content strings
   */
  private extractCssVariables(
    contentWithoutComments: string,
    originalContent: string,
  ): Array<{ name: string; value: string; lineNumber: number }> {
    const results: Array<{ name: string; value: string; lineNumber: number }> =
      [];

    // Match the variable declaration start: --name:
    const varStartRegex = /--([a-zA-Z0-9-_]+)\s*:/g;
    let match;

    while ((match = varStartRegex.exec(contentWithoutComments)) !== null) {
      const name = match[1];
      if (!name) continue;

      const valueStart = match.index + match[0].length;
      const value = this.extractCssValue(contentWithoutComments, valueStart);

      if (value !== null) {
        // Calculate line number from original content
        const lineNumber = originalContent
          .slice(0, match.index)
          .split("\n").length;
        results.push({ name, value, lineNumber });
      }
    }

    return results;
  }

  /**
   * Extract SCSS variables handling multi-line values and strings
   */
  private extractScssVariables(
    contentWithoutComments: string,
    originalContent: string,
  ): Array<{ name: string; value: string; lineNumber: number }> {
    const results: Array<{ name: string; value: string; lineNumber: number }> =
      [];

    // Match the variable declaration start: $name:
    const varStartRegex = /\$([a-zA-Z0-9-_]+)\s*:/g;
    let match;

    while ((match = varStartRegex.exec(contentWithoutComments)) !== null) {
      const name = match[1];
      if (!name) continue;

      const valueStart = match.index + match[0].length;
      const value = this.extractCssValue(contentWithoutComments, valueStart);

      if (value !== null) {
        // Calculate line number from original content
        const lineNumber = originalContent
          .slice(0, match.index)
          .split("\n").length;
        results.push({ name, value, lineNumber });
      }
    }

    return results;
  }

  /**
   * Extract a CSS value starting at the given position, handling:
   * - Nested parentheses (for url(), calc(), etc.)
   * - Quoted strings (which may contain semicolons)
   * - Multi-line values
   * Returns null if no valid value found
   */
  private extractCssValue(content: string, startIndex: number): string | null {
    let i = startIndex;
    let value = "";
    let parenDepth = 0;
    let inString: string | null = null; // null, '"', or "'"

    // Skip leading whitespace
    while (i < content.length && /\s/.test(content[i]!)) {
      i++;
    }

    while (i < content.length) {
      const char = content[i]!;

      // Handle string literals
      if (inString) {
        value += char;
        if (char === inString && content[i - 1] !== "\\") {
          inString = null;
        }
        i++;
        continue;
      }

      // Check for string start
      if (char === '"' || char === "'") {
        inString = char;
        value += char;
        i++;
        continue;
      }

      // Track parentheses depth
      if (char === "(") {
        parenDepth++;
        value += char;
        i++;
        continue;
      }

      if (char === ")") {
        parenDepth--;
        value += char;
        i++;
        continue;
      }

      // Semicolon ends the value only if we're not inside parentheses or strings
      if (char === ";" && parenDepth === 0) {
        break;
      }

      // Handle closing brace (end of rule block) - value ends without semicolon
      if (char === "}" && parenDepth === 0) {
        break;
      }

      value += char;
      i++;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private inferCategory(name: string, value: unknown): string {
    const nameLower = name.toLowerCase();
    const valueStr = String(value).toLowerCase();

    // Infer from name
    if (
      nameLower.includes("color") ||
      nameLower.includes("background") ||
      nameLower.includes("fill")
    ) {
      return "color";
    }
    if (
      nameLower.includes("spacing") ||
      nameLower.includes("gap") ||
      nameLower.includes("margin") ||
      nameLower.includes("padding")
    ) {
      return "spacing";
    }
    if (
      nameLower.includes("font") ||
      nameLower.includes("text") ||
      nameLower.includes("typography")
    ) {
      return "typography";
    }
    if (nameLower.includes("shadow") || nameLower.includes("elevation")) {
      return "shadow";
    }
    if (nameLower.includes("border") || nameLower.includes("radius")) {
      return "border";
    }
    if (
      nameLower.includes("size") ||
      nameLower.includes("width") ||
      nameLower.includes("height")
    ) {
      return "sizing";
    }
    if (
      nameLower.includes("animation") ||
      nameLower.includes("duration") ||
      nameLower.includes("timing")
    ) {
      return "motion";
    }

    // Infer from value
    if (
      valueStr.startsWith("#") ||
      valueStr.startsWith("rgb") ||
      valueStr.startsWith("hsl")
    ) {
      return "color";
    }
    if (/^\d+(px|rem|em)$/.test(valueStr)) {
      return "spacing";
    }

    return "other";
  }

  private normalizeCategory(type: string): TokenCategory {
    const lower = type.toLowerCase();
    const mapping: Record<string, TokenCategory> = {
      color: "color",
      colors: "color",
      colours: "color",
      spacing: "spacing",
      space: "spacing",
      sizes: "sizing",
      typography: "typography",
      font: "typography",
      fonts: "typography",
      shadow: "shadow",
      shadows: "shadow",
      boxshadow: "shadow",
      border: "border",
      borders: "border",
      borderradius: "border",
      radii: "border",
      sizing: "sizing",
      size: "sizing",
      motion: "motion",
      animation: "motion",
      animations: "motion",
      duration: "motion",
      durations: "motion",
      easings: "motion",
    };

    return mapping[lower] || "other";
  }

  private parseTokenValue(
    category: string,
    rawValue: string | number,
  ): TokenValue {
    const valueStr = String(rawValue).trim();

    if (category === "color") {
      return {
        type: "color",
        hex: this.normalizeColor(valueStr),
      };
    }

    if (category === "spacing" || category === "sizing") {
      const match = valueStr.match(/^(\d+(?:\.\d+)?)(px|rem|em)?$/);
      if (match && match[1]) {
        return {
          type: "spacing",
          value: parseFloat(match[1]),
          unit: (match[2] as "px" | "rem" | "em") || "px",
        };
      }
    }

    // Default to raw value
    return {
      type: "raw",
      value: valueStr,
    };
  }

  private normalizeColor(value: string): string {
    // Already a hex color
    if (/^#[0-9a-fA-F]{3,8}$/.test(value)) {
      return value.toLowerCase();
    }

    // Could add rgb/hsl conversion here
    return value;
  }

  /**
   * Parse TypeScript files for union type definitions that represent design tokens.
   *
   * Detects patterns like:
   * - type ButtonVariant = 'primary' | 'secondary' | 'success';
   * - type Color = 'primary' | 'secondary' | 'warning';
   * - export type Size = 'sm' | 'md' | 'lg';
   * - export type Token = "colors.gray.50" | "spacing.1" | ... (in .gen.ts files)
   *
   * These are semantic tokens representing allowed variant values in a design system.
   */
  private async parseTypeScriptUnionTypes(
    filePath: string,
  ): Promise<DesignToken[]> {
    const content = await readFile(filePath, "utf-8");
    const relativePath = relative(this.config.projectRoot, filePath);
    const tokens: DesignToken[] = [];

    // Check if this is a generated file (*.gen.ts) - treat all union types as tokens
    const isGeneratedFile = filePath.endsWith(".gen.ts");

    // Extract union type definitions
    const unionTypes = this.extractTypeScriptUnionTypes(content);

    for (const { typeName, values, lineNumber } of unionTypes) {
      // For generated files, accept any union type named "Token" or "Tokens"
      // For regular files, only process types that look like design tokens
      const isTokenUnionInGenFile =
        isGeneratedFile &&
        (typeName === "Token" || typeName === "Tokens" || typeName.endsWith("Token"));

      if (!isTokenUnionInGenFile && !this.isDesignTokenUnionType(typeName)) {
        continue;
      }

      // For generated token files, infer category from the token path (e.g., "colors.gray.50")
      // For regular union types, infer from the type name
      for (const value of values) {
        const category = isGeneratedFile
          ? this.inferCategoryFromTokenPath(value) || "other"
          : this.inferCategoryFromTypeName(typeName);

        const source: TypeScriptTokenSource = {
          type: "typescript",
          path: relativePath,
          typeName,
          line: lineNumber,
        };

        const tokenValue = this.parseTokenValue(category, value);

        tokens.push({
          id: createTokenId(source, value),
          name: value,
          category: this.normalizeCategory(category),
          value: tokenValue,
          source,
          aliases: [],
          usedBy: [],
          metadata: {
            description: isGeneratedFile
              ? `Generated token from ${typeName}`
              : `Value from ${typeName} union type`,
          },
          scannedAt: new Date(),
        });
      }
    }

    // Also extract token objects (defineTokens.colors, export const colors = {...}, etc.)
    const objectTokens = this.extractTypeScriptTokenObjects(
      content,
      relativePath,
    );
    tokens.push(...objectTokens);

    // Extract keyframe tokens (export const keyframes = {...})
    const keyframeTokens = this.extractKeyframeTokens(content, relativePath);
    tokens.push(...keyframeTokens);

    // Extract style definition tokens (defineTextStyles, defineLayerStyles, defineAnimationStyles)
    const styleDefTokens = this.extractStyleDefinitionTokens(content, relativePath);
    tokens.push(...styleDefTokens);

    return tokens;
  }

  /**
   * Extract design tokens from TypeScript/JavaScript object definitions.
   *
   * Detects patterns like:
   * - defineTokens.colors({ black: { value: "#000" }, ... })
   * - export const colors = { primary: { value: "#0066cc" }, ... }
   * - export const colors = { primary: "#0066cc", ... } as const
   */
  private extractTypeScriptTokenObjects(
    content: string,
    relativePath: string,
  ): DesignToken[] {
    const tokens: DesignToken[] = [];

    // Pattern 1: defineTokens.category({ ... }) and defineSemanticTokens.category({ ... })
    // Match: defineTokens.colors({ ... }), defineSemanticTokens.colors({ ... }), etc.
    // Use brace matching to capture the full object
    const defineTokensMatches = this.findDefineTokensCalls(content);
    for (const { category, objectStr, lineNumber, isSemantic } of defineTokensMatches) {
      const parsedTokens = this.parseTokenObjectString(
        objectStr,
        category,
        relativePath,
        lineNumber,
        undefined,
        isSemantic,
      );
      tokens.push(...parsedTokens);
    }

    // Pattern 2: export const varName = { ... } with { value: "..." } structure
    const constObjectMatches = this.findConstObjectAssignments(content);
    for (const { varName, objectStr, lineNumber } of constObjectMatches) {
      // Skip if already processed by defineTokens pattern
      if (varName.includes("defineTokens")) continue;

      // Infer category from variable name
      const category = this.inferCategoryFromVarName(varName);

      // Only process if the variable name suggests design tokens
      if (!this.isTokenRelatedVarName(varName)) continue;

      const parsedTokens = this.parseTokenObjectString(
        objectStr,
        category,
        relativePath,
        lineNumber,
        varName,
      );
      tokens.push(...parsedTokens);
    }

    return tokens;
  }

  /**
   * Extract keyframe animation tokens from TypeScript files.
   *
   * Detects patterns like:
   * export const keyframes = {
   *   spin: { "0%": { transform: "rotate(0deg)" }, ... },
   *   pulse: { "50%": { opacity: "0.5" } },
   *   "fade-in": { from: { opacity: 0 }, to: { opacity: 1 } },
   * }
   *
   * Keyframe objects are identified by:
   * - Variable named "keyframes" or "animations"
   * - Object keys that look like animation names (not "0%", "from", "to", etc.)
   * - Nested objects with keyframe selectors (%, from, to)
   */
  private extractKeyframeTokens(
    content: string,
    relativePath: string,
  ): DesignToken[] {
    const tokens: DesignToken[] = [];

    // Find exported keyframes objects
    const keyframesMatches = this.findKeyframesExports(content);

    for (const { objectStr, lineNumber, varName } of keyframesMatches) {
      // Parse the keyframe names from the object
      const keyframeNames = this.extractKeyframeNames(objectStr);

      for (const keyframeName of keyframeNames) {
        const source: TypeScriptTokenSource = {
          type: "typescript",
          path: relativePath,
          typeName: varName,
          line: lineNumber,
        };

        tokens.push({
          id: createTokenId(source, keyframeName),
          name: keyframeName,
          category: "motion",
          value: {
            type: "raw",
            value: keyframeName,
          },
          source,
          aliases: [],
          usedBy: [],
          metadata: {
            description: `Keyframe animation from ${varName}`,
          },
          scannedAt: new Date(),
        });
      }
    }

    return tokens;
  }

  /**
   * Find exported keyframes/animations objects in content.
   * Handles both patterns:
   * - export const keyframes = { ... }
   * - export const keyframes = defineKeyframes({ ... })
   */
  private findKeyframesExports(
    content: string,
  ): Array<{ objectStr: string; lineNumber: number; varName: string }> {
    const results: Array<{
      objectStr: string;
      lineNumber: number;
      varName: string;
    }> = [];

    // Pattern 1: export const keyframes = { ... } or export const animations = { ... }
    const directAssignRegex =
      /(?:export\s+)?const\s+(keyframes|animations)\s*=\s*\{/gi;
    let match;

    while ((match = directAssignRegex.exec(content)) !== null) {
      const varName = match[1] || "keyframes";
      const startIndex = match.index + match[0].length - 1; // Position of opening {

      // Check if this is part of a defineKeyframes call - if so, skip (handled below)
      const beforeMatch = content.slice(Math.max(0, match.index - 30), match.index);
      if (beforeMatch.includes("defineKeyframes(")) continue;

      // Find matching closing brace
      let braceDepth = 1;
      let i = startIndex + 1;
      while (i < content.length && braceDepth > 0) {
        if (content[i] === "{") braceDepth++;
        if (content[i] === "}") braceDepth--;
        i++;
      }

      if (braceDepth === 0) {
        const objectStr = content.slice(startIndex, i);
        const lineNumber = content.slice(0, match.index).split("\n").length;
        results.push({ objectStr, lineNumber, varName });
      }
    }

    // Pattern 2: export const keyframes = defineKeyframes({ ... })
    // Match: defineKeyframes({ ... })
    const defineKeyframesRegex =
      /(?:export\s+)?const\s+(keyframes|animations)\s*=\s*defineKeyframes\s*\(\s*\{/gi;

    while ((match = defineKeyframesRegex.exec(content)) !== null) {
      const varName = match[1] || "keyframes";
      const startIndex = match.index + match[0].length - 1; // Position of opening {

      // Find matching closing brace
      let braceDepth = 1;
      let i = startIndex + 1;
      while (i < content.length && braceDepth > 0) {
        if (content[i] === "{") braceDepth++;
        if (content[i] === "}") braceDepth--;
        i++;
      }

      if (braceDepth === 0) {
        const objectStr = content.slice(startIndex, i);
        const lineNumber = content.slice(0, match.index).split("\n").length;
        results.push({ objectStr, lineNumber, varName });
      }
    }

    return results;
  }

  /**
   * Extract tokens from style definition patterns:
   * - defineTextStyles({ name: { value: {...} } })
   * - defineLayerStyles({ name: { value: {...} } })
   * - defineAnimationStyles({ name: { value: {...} } })
   *
   * These are Chakra UI/Panda CSS patterns for defining semantic style tokens.
   */
  private extractStyleDefinitionTokens(
    content: string,
    relativePath: string,
  ): DesignToken[] {
    const tokens: DesignToken[] = [];

    // Find all style definition function calls
    const styleDefMatches = this.findStyleDefinitionCalls(content);

    for (const { styleType, objectStr, lineNumber } of styleDefMatches) {
      // Determine the category based on the style definition type
      let category: string;
      switch (styleType) {
        case "TextStyles":
          category = "typography";
          break;
        case "AnimationStyles":
          category = "motion";
          break;
        case "LayerStyles":
        default:
          category = "other";
          break;
      }

      // Parse the style names from the object
      const styleNames = this.extractStyleDefinitionNames(objectStr);

      for (const name of styleNames) {
        const source: TypeScriptTokenSource = {
          type: "typescript",
          path: relativePath,
          typeName: `define${styleType}`,
          line: lineNumber,
        };

        tokens.push({
          id: createTokenId(source, name),
          name,
          category: this.normalizeCategory(category),
          value: {
            type: "raw",
            value: name,
          },
          source,
          aliases: [],
          usedBy: [],
          metadata: {
            description: `Style token from define${styleType}`,
          },
          scannedAt: new Date(),
        });
      }
    }

    return tokens;
  }

  /**
   * Find defineTextStyles, defineLayerStyles, defineAnimationStyles calls in content.
   */
  private findStyleDefinitionCalls(
    content: string,
  ): Array<{ styleType: string; objectStr: string; lineNumber: number }> {
    const results: Array<{
      styleType: string;
      objectStr: string;
      lineNumber: number;
    }> = [];

    // Match: defineTextStyles({ ... }), defineLayerStyles({ ... }), defineAnimationStyles({ ... })
    const startRegex = /define(TextStyles|LayerStyles|AnimationStyles)\s*\(\s*\{/g;
    let match;

    while ((match = startRegex.exec(content)) !== null) {
      const styleType = match[1] || "TextStyles";
      const startIndex = match.index + match[0].length - 1; // Position of opening {

      // Find matching closing brace
      let braceDepth = 1;
      let i = startIndex + 1;
      while (i < content.length && braceDepth > 0) {
        if (content[i] === "{") braceDepth++;
        if (content[i] === "}") braceDepth--;
        i++;
      }

      if (braceDepth === 0) {
        const objectStr = content.slice(startIndex, i);
        const lineNumber = content.slice(0, match.index).split("\n").length;
        results.push({ styleType, objectStr, lineNumber });
      }
    }

    return results;
  }

  /**
   * Extract style definition names from a style object string.
   * These are the top-level keys that represent style names.
   *
   * Example: { "2xs": { value: {...} }, xs: { value: {...} } }
   * Returns: ["2xs", "xs"]
   */
  private extractStyleDefinitionNames(objectStr: string): string[] {
    const names: string[] = [];

    // Remove outer braces
    let inner = objectStr.trim();
    if (inner.startsWith("{")) inner = inner.slice(1);
    if (inner.endsWith("}")) inner = inner.slice(0, -1);

    // Parse top-level entries
    const entries = this.parseObjectEntries(inner);

    for (const { key, content } of entries) {
      const trimmedContent = content.trim();

      // Check if this is a style definition object (has { value: ... } structure)
      if (trimmedContent.startsWith("{") && trimmedContent.endsWith("}")) {
        // Check if it contains a "value" key (required for style definitions)
        if (trimmedContent.includes("value")) {
          names.push(key);
        }
      }
    }

    return names;
  }

  /**
   * Extract keyframe animation names from a keyframes object string.
   * Returns the top-level keys that represent animation names.
   */
  private extractKeyframeNames(objectStr: string): string[] {
    const names: string[] = [];

    // Remove outer braces
    let inner = objectStr.trim();
    if (inner.startsWith("{")) inner = inner.slice(1);
    if (inner.endsWith("}")) inner = inner.slice(0, -1);

    // Parse top-level entries
    const entries = this.parseObjectEntries(inner);

    // Keyframe selector patterns to exclude (these are not animation names)
    const keyframeSelectorPattern = /^(\d+%|from|to|\d+%,\s*\d+%)$/i;

    for (const { key, content } of entries) {
      // Skip if this looks like a keyframe selector, not an animation name
      if (keyframeSelectorPattern.test(key)) continue;

      // Check if the value is an object (keyframes have nested objects with selectors)
      const trimmedContent = content.trim();
      if (trimmedContent.startsWith("{") && trimmedContent.endsWith("}")) {
        // Verify this looks like a keyframe definition by checking for selector keys
        const nestedEntries = this.parseObjectEntries(
          trimmedContent.slice(1, -1),
        );
        const hasKeyframeSelectors = nestedEntries.some(
          (e) =>
            e.key.includes("%") ||
            e.key.toLowerCase() === "from" ||
            e.key.toLowerCase() === "to",
        );

        if (hasKeyframeSelectors) {
          names.push(key);
        }
      }
    }

    return names;
  }

  /**
   * Parse a token object string and extract tokens.
   * Handles nested structures like:
   * { black: { value: "#000" }, gray: { "50": { value: "#fafafa" } } }
   *
   * For semantic tokens (isSemantic=true), also handles:
   * { bg: { DEFAULT: { value: { _light: "...", _dark: "..." } } } }
   */
  private parseTokenObjectString(
    objectStr: string,
    category: string,
    relativePath: string,
    lineNumber: number,
    varName?: string,
    isSemantic: boolean = false,
  ): DesignToken[] {
    const tokens: DesignToken[] = [];

    // Try to parse as JavaScript object
    try {
      // Sanitize the object string for eval-free parsing
      // We'll use a simple regex-based parser instead of eval
      const extractedTokens = this.extractTokensFromObjectLiteral(
        objectStr,
        "",
        category,
        isSemantic,
      );

      for (const { name, value, tokenCategory } of extractedTokens) {
        const source: TypeScriptTokenSource = {
          type: "typescript",
          path: relativePath,
          typeName: varName || category,
          line: lineNumber,
        };

        // Normalize category for proper value parsing (colors -> color)
        const normalizedCategory = this.normalizeCategory(tokenCategory);
        const tokenValue = this.parseTokenValue(normalizedCategory, value);

        const tokenTypeName = isSemantic ? "defineSemanticTokens" : "defineTokens";
        tokens.push({
          id: createTokenId(source, name),
          name,
          category: normalizedCategory,
          value: tokenValue,
          source,
          aliases: [],
          usedBy: [],
          metadata: {
            description: varName
              ? `Token from ${varName}`
              : `Token from ${tokenTypeName}.${category}`,
          },
          scannedAt: new Date(),
        });
      }
    } catch {
      // Ignore parse errors
    }

    return tokens;
  }

  /**
   * Extract tokens from an object literal string using regex.
   * This avoids eval and handles the common token patterns.
   *
   * For semantic tokens (isSemantic=true), also handles the pattern:
   * { value: { _light: "...", _dark: "..." } }
   */
  private extractTokensFromObjectLiteral(
    objectStr: string,
    prefix: string,
    category: string,
    isSemantic: boolean = false,
  ): Array<{ name: string; value: string; tokenCategory: string }> {
    const results: Array<{
      name: string;
      value: string;
      tokenCategory: string;
    }> = [];

    // Remove outer braces
    let inner = objectStr.trim();
    if (inner.startsWith("{")) inner = inner.slice(1);
    if (inner.endsWith("}")) inner = inner.slice(0, -1);

    // Strategy: Parse top-level keys and their values
    // Use a state machine approach to handle nested braces
    const entries = this.parseObjectEntries(inner);

    for (const { key, content } of entries) {
      // Skip certain keys that are not token values
      if (key === "value" || key === "description" || key === "type" || key === "$value" || key === "$type") continue;

      const trimmedContent = content.trim();

      // Skip keys that are clearly config, not tokens
      // BUT: allow config keys if they look like token values (arrays, objects with {value}, etc.)
      if (this.isConfigKey(key)) {
        // If the content looks like a token value, process it anyway
        const looksLikeTokenValue =
          trimmedContent.startsWith("[") || // Array of values
          trimmedContent.match(/^\{\s*value\s*:/) || // Object with value property
          trimmedContent.match(/^\{\s*["']?\d+["']?\s*:/) || // Nested object with numeric keys
          trimmedContent.match(/^["']#[0-9a-fA-F]/); // Direct hex color string

        if (!looksLikeTokenValue) {
          continue;
        }
      }

      const tokenName = prefix ? `${prefix}.${key}` : key;

      // Determine category for this token
      // If a category was passed in (e.g., from defineTokens.colors), use it
      // Otherwise, try to infer from the token path (e.g., fontSizes.xs -> typography)
      // Finally, fall back to inferring from the current key
      let effectiveCategory = category;
      if (category === "other" || !category) {
        effectiveCategory =
          this.inferCategoryFromTokenPath(tokenName) ||
          this.inferCategoryFromVarName(key) ||
          category;
      }

      // Check if this is a terminal token with { value: "..." }
      const valueMatch = trimmedContent.match(
        /^\{\s*value\s*:\s*["']([^"']+)["']/,
      );
      if (valueMatch && valueMatch[1]) {
        results.push({
          name: tokenName,
          value: valueMatch[1],
          tokenCategory: effectiveCategory,
        });
        continue;
      }

      // Check for semantic token pattern: { value: { _light: "...", _dark: "..." } }
      // For semantic tokens, the value contains theme-aware values
      if (isSemantic) {
        const semanticValueMatch = trimmedContent.match(
          /^\{\s*value\s*:\s*\{[^}]*_light\s*:\s*["']([^"']+)["']/,
        );
        if (semanticValueMatch && semanticValueMatch[1]) {
          // Use the _light value as the primary value (for now)
          // The full semantic token structure is preserved in the raw value
          results.push({
            name: tokenName,
            value: semanticValueMatch[1],
            tokenCategory: effectiveCategory,
          });
          continue;
        }
      }

      // Check if this is a direct string value (for "as const" objects)
      const directValueMatch = trimmedContent.match(/^["']([^"']+)["']$/);
      if (directValueMatch && directValueMatch[1]) {
        results.push({
          name: tokenName,
          value: directValueMatch[1],
          tokenCategory: effectiveCategory,
        });
        continue;
      }

      // Check if this is a template literal value
      const templateMatch = trimmedContent.match(/^`([^`]*)`$/);
      if (templateMatch && templateMatch[1] !== undefined) {
        results.push({
          name: tokenName,
          value: templateMatch[1],
          tokenCategory: effectiveCategory,
        });
        continue;
      }

      // Check if this is a function call value (e.g., rem(12), px(16))
      const functionCallMatch = trimmedContent.match(/^(\w+)\s*\(\s*(\d+(?:\.\d+)?)\s*\)$/);
      if (functionCallMatch && functionCallMatch[2]) {
        // Extract the numeric value from function calls like rem(12), px(16)
        results.push({
          name: tokenName,
          value: `${functionCallMatch[1]}(${functionCallMatch[2]})`,
          tokenCategory: effectiveCategory,
        });
        continue;
      }

      // Check if this is an array of color values (Mantine-style color palette)
      // Pattern: ['#C9C9C9', '#b8b8b8', ...]
      if (trimmedContent.startsWith("[") && trimmedContent.endsWith("]")) {
        const arrayTokens = this.extractColorArrayTokens(
          trimmedContent,
          tokenName,
          effectiveCategory,
        );
        if (arrayTokens.length > 0) {
          results.push(...arrayTokens);
          continue;
        }
      }

      // Check if this is a nested object
      if (trimmedContent.startsWith("{") && trimmedContent.endsWith("}")) {
        // For nested objects, determine the category:
        // 1. If current effectiveCategory is specific (not "other"), propagate it
        // 2. Otherwise, try to infer from the current key (e.g., "colors" -> color)
        let nestedCategory = effectiveCategory;
        if (effectiveCategory === "other" || !effectiveCategory) {
          nestedCategory = this.inferCategoryFromVarName(key) || "other";
        }
        const nestedResults = this.extractTokensFromObjectLiteral(
          trimmedContent,
          tokenName,
          nestedCategory,
          isSemantic,
        );
        results.push(...nestedResults);
      }
    }

    return results;
  }

  /**
   * Extract tokens from an array of color values (Mantine-style color palettes).
   * Pattern: ['#C9C9C9', '#b8b8b8', '#828282', ...]
   *
   * Creates tokens like: dark.0, dark.1, dark.2, etc.
   */
  private extractColorArrayTokens(
    arrayStr: string,
    prefix: string,
    category: string,
  ): Array<{ name: string; value: string; tokenCategory: string }> {
    const results: Array<{
      name: string;
      value: string;
      tokenCategory: string;
    }> = [];

    // Remove brackets
    let inner = arrayStr.trim();
    if (inner.startsWith("[")) inner = inner.slice(1);
    if (inner.endsWith("]")) inner = inner.slice(0, -1);

    // Extract all string values from the array
    const valueRegex = /['"]([^'"]+)['"]/g;
    let match;
    let index = 0;

    while ((match = valueRegex.exec(inner)) !== null) {
      const value = match[1];
      if (value) {
        // Check if it looks like a color value
        const looksLikeColor =
          value.startsWith("#") ||
          value.startsWith("rgb") ||
          value.startsWith("hsl") ||
          value.startsWith("rgba") ||
          value.startsWith("hsla");

        if (looksLikeColor) {
          results.push({
            name: `${prefix}.${index}`,
            value: value,
            // Color arrays are always color tokens
            tokenCategory: "color",
          });
        } else {
          // Non-color value - use provided category
          results.push({
            name: `${prefix}.${index}`,
            value: value,
            tokenCategory: category,
          });
        }
        index++;
      }
    }

    return results;
  }

  /**
   * Check if a key is a configuration key rather than a token key.
   */
  private isConfigKey(key: string): boolean {
    const configKeys = [
      "scale",
      "fontSmoothing",
      "focusRing",
      "primaryShade",
      "primaryColor",
      "variantColorResolver",
      "autoContrast",
      "luminanceThreshold",
      "fontFamily",
      "fontFamilyMonospace",
      "respectReducedMotion",
      "cursorType",
      "defaultGradient",
      "defaultRadius",
      "activeClassName",
      "focusClassName",
      "headings",
      "from",
      "to",
      "deg",
      "light",
      "dark",
      "fontWeight",
      "textWrap",
      "sizes",
    ];
    return configKeys.includes(key);
  }

  /**
   * Infer category from the full token path (e.g., "fontSizes.xs" -> "typography")
   */
  private inferCategoryFromTokenPath(tokenPath: string): string | null {
    const parts = tokenPath.split(".");
    // Check each part from left to right
    for (const part of parts) {
      const category = this.inferCategoryFromVarName(part);
      if (category !== "other") {
        return category;
      }
    }
    return null;
  }

  /**
   * Find const varName = { ... } assignments using brace matching.
   * Also handles typed assignments like: export const DEFAULT_THEME: MantineTheme = {...}
   */
  private findConstObjectAssignments(
    content: string,
  ): Array<{ varName: string; objectStr: string; lineNumber: number }> {
    const results: Array<{
      varName: string;
      objectStr: string;
      lineNumber: number;
    }> = [];

    // Find all (export)? const varName (: Type)? = { patterns
    // Handles: const x = {}, const x: Type = {}, export const X: Type = {}
    const startRegex = /(?:export\s+)?const\s+(\w+)(?:\s*:\s*[\w<>\[\]|&]+)?\s*=\s*\{/g;
    let match;

    while ((match = startRegex.exec(content)) !== null) {
      const varName = match[1] || "";
      const startIndex = match.index + match[0].length - 1; // Position of opening {

      // Check if this is part of a defineTokens call - if so, skip
      const beforeMatch = content.slice(Math.max(0, match.index - 30), match.index);
      if (beforeMatch.includes("defineTokens.")) continue;

      // Find matching closing brace
      let braceDepth = 1;
      let i = startIndex + 1;
      while (i < content.length && braceDepth > 0) {
        if (content[i] === "{") braceDepth++;
        if (content[i] === "}") braceDepth--;
        i++;
      }

      if (braceDepth === 0) {
        const objectStr = content.slice(startIndex, i);
        const lineNumber = content.slice(0, match.index).split("\n").length;
        results.push({ varName, objectStr, lineNumber });
      }
    }

    return results;
  }

  /**
   * Find defineTokens.category({ ... }) and defineSemanticTokens.category({ ... })
   * calls in content using brace matching.
   */
  private findDefineTokensCalls(
    content: string,
  ): Array<{ category: string; objectStr: string; lineNumber: number; isSemantic: boolean }> {
    const results: Array<{
      category: string;
      objectStr: string;
      lineNumber: number;
      isSemantic: boolean;
    }> = [];

    // Find both defineTokens.category( and defineSemanticTokens.category( patterns
    const startRegex = /define(?:Semantic)?Tokens\.(\w+)\s*\(\s*\{/g;
    let match;

    while ((match = startRegex.exec(content)) !== null) {
      const category = match[1] || "other";
      const startIndex = match.index + match[0].length - 1; // Position of opening {
      const isSemantic = match[0].includes("SemanticTokens");

      // Find matching closing brace
      let braceDepth = 1;
      let i = startIndex + 1;
      while (i < content.length && braceDepth > 0) {
        if (content[i] === "{") braceDepth++;
        if (content[i] === "}") braceDepth--;
        i++;
      }

      if (braceDepth === 0) {
        const objectStr = content.slice(startIndex, i);
        const lineNumber = content.slice(0, match.index).split("\n").length;
        results.push({ category, objectStr, lineNumber, isSemantic });
      }
    }

    return results;
  }

  /**
   * Parse object entries handling nested braces correctly.
   */
  private parseObjectEntries(
    content: string,
  ): Array<{ key: string; content: string }> {
    const entries: Array<{ key: string; content: string }> = [];
    let i = 0;

    while (i < content.length) {
      // Skip whitespace and commas
      while (i < content.length && /[\s,]/.test(content[i]!)) {
        i++;
      }
      if (i >= content.length) break;

      // Parse key (quoted or unquoted)
      let key = "";
      if (content[i] === '"' || content[i] === "'") {
        const quote = content[i];
        i++;
        while (i < content.length && content[i] !== quote) {
          key += content[i];
          i++;
        }
        i++; // Skip closing quote
      } else {
        while (i < content.length && /\w/.test(content[i]!)) {
          key += content[i];
          i++;
        }
      }

      if (!key) break;

      // Skip to colon
      while (i < content.length && content[i] !== ":") {
        i++;
      }
      if (i >= content.length) break;
      i++; // Skip colon

      // Skip whitespace
      while (i < content.length && /\s/.test(content[i]!)) {
        i++;
      }
      if (i >= content.length) break;

      // Parse value (string, template literal, object, or other expression)
      let valueContent = "";
      if (content[i] === '"' || content[i] === "'") {
        // String value
        const quote = content[i];
        valueContent += quote;
        i++;
        while (i < content.length && content[i] !== quote) {
          valueContent += content[i];
          i++;
        }
        if (i < content.length) {
          valueContent += content[i]; // Include closing quote
          i++;
        }
      } else if (content[i] === "`") {
        // Template literal value
        valueContent += content[i];
        i++;
        while (i < content.length && content[i] !== "`") {
          valueContent += content[i];
          i++;
        }
        if (i < content.length) {
          valueContent += content[i]; // Include closing backtick
          i++;
        }
      } else if (content[i] === "{") {
        // Object value - find matching brace
        let braceDepth = 0;
        while (i < content.length) {
          if (content[i] === "{") braceDepth++;
          if (content[i] === "}") {
            braceDepth--;
            if (braceDepth === 0) {
              valueContent += content[i];
              i++;
              break;
            }
          }
          valueContent += content[i];
          i++;
        }
      } else if (content[i] === "[") {
        // Array value - find matching bracket
        let bracketDepth = 0;
        while (i < content.length) {
          if (content[i] === "[") bracketDepth++;
          if (content[i] === "]") {
            bracketDepth--;
            if (bracketDepth === 0) {
              valueContent += content[i];
              i++;
              break;
            }
          }
          valueContent += content[i];
          i++;
        }
      } else {
        // Other expression (function call, identifier, number, etc.)
        // Parse until comma or closing brace, handling nested parens
        let parenDepth = 0;
        while (i < content.length) {
          const char = content[i]!;
          if (char === "(") parenDepth++;
          if (char === ")") parenDepth--;
          // End at comma or closing brace only if not in parens
          if ((char === "," || char === "}") && parenDepth === 0) {
            break;
          }
          valueContent += char;
          i++;
        }
      }

      if (key && valueContent.trim()) {
        entries.push({ key, content: valueContent.trim() });
      }
    }

    return entries;
  }

  /**
   * Check if a variable name suggests it contains design tokens.
   */
  private isTokenRelatedVarName(varName: string): boolean {
    const tokenPatterns = [
      /^colors?$/i,
      /^spacing$/i,
      /^sizes?$/i,
      /^fonts?$/i,
      /^typography$/i,
      /^shadows?$/i,
      /^borders?$/i,
      /^radii$/i,
      /^radius$/i,
      /^zIndex$/i,
      /^breakpoints?$/i,
      /^theme$/i,
      /^tokens?$/i,
      /^palette$/i,
      /^durations?$/i,
      /^easings?$/i,
      /^animations?$/i,
      /^letterSpacings?$/i,
      /^lineHeights?$/i,
      /^fontSizes?$/i,
      /^fontWeights?$/i,
      // Theme variable patterns (Mantine, Chakra, etc.)
      /DEFAULT_THEME/i,
      /DEFAULT_COLORS/i,
      /^default.*theme$/i,
      /^default.*colors$/i,
      /^mantine.*theme$/i,
      /^chakra.*theme$/i,
    ];

    return tokenPatterns.some((pattern) => pattern.test(varName));
  }

  /**
   * Infer token category from variable name.
   */
  private inferCategoryFromVarName(varName: string): string {
    const nameLower = varName.toLowerCase();

    // Color patterns - check these first (most specific)
    if (
      nameLower.includes("color") ||
      nameLower === "palette" ||
      nameLower === "white" ||
      nameLower === "black"
    )
      return "color";

    // Spacing patterns
    if (nameLower.includes("spacing") || nameLower.includes("gap"))
      return "spacing";

    // Typography patterns (including lineHeights which is typography)
    if (
      nameLower.includes("font") ||
      nameLower.includes("text") ||
      nameLower.includes("lineheight") ||
      nameLower === "typography"
    )
      return "typography";
    if (nameLower.includes("shadow") || nameLower.includes("elevation"))
      return "shadow";
    if (
      nameLower.includes("border") ||
      nameLower.includes("radi") ||
      nameLower === "radii"
    )
      return "border";
    if (
      nameLower.includes("animation") ||
      nameLower.includes("duration") ||
      nameLower.includes("easing") ||
      nameLower.includes("motion") ||
      nameLower === "keyframes"
    )
      return "motion";
    if (nameLower.includes("breakpoint")) return "sizing";
    if (nameLower.includes("zindex") || nameLower === "z") return "other";
    // Blur tokens
    if (nameLower.includes("blur")) return "other";
    // Aspect ratio tokens
    if (nameLower.includes("aspect")) return "other";

    return "other";
  }

  /**
   * Extract TypeScript union type definitions from source code.
   *
   * Matches patterns:
   * - type Name = 'value1' | 'value2' | ...
   * - export type Name = 'value1' | 'value2' | ...
   * - type Name = "value1" | "value2" | ...
   * - Multi-line unions (for generated files like token.gen.ts)
   */
  private extractTypeScriptUnionTypes(
    content: string,
  ): Array<{ typeName: string; values: string[]; lineNumber: number }> {
    const results: Array<{
      typeName: string;
      values: string[];
      lineNumber: number;
    }> = [];

    // Match type declarations with string literal unions (single-line)
    // Handles: type Name = 'a' | 'b' | 'c';
    // Also handles: export type Name = 'a' | 'b' | 'c';
    // Supports both single and double quotes
    const typeRegex =
      /(?:export\s+)?type\s+([A-Z][a-zA-Z0-9]*)\s*=\s*((?:['"][^'"]+['"]\s*\|\s*)*['"][^'"]+['"])\s*;/g;

    let match;
    while ((match = typeRegex.exec(content)) !== null) {
      const typeName = match[1];
      const valuesStr = match[2];

      if (!typeName || !valuesStr) continue;

      // Extract individual string values from the union
      const values = this.parseUnionValues(valuesStr);

      if (values.length > 0) {
        // Calculate line number
        const lineNumber = content.slice(0, match.index).split("\n").length;
        results.push({ typeName, values, lineNumber });
      }
    }

    // Also match multi-line union types (common in generated files)
    // Pattern: export type Token =
    //   | "value1"
    //   | "value2"
    const multiLineTypeRegex =
      /(?:export\s+)?type\s+([A-Z][a-zA-Z0-9]*)\s*=\s*\n?((?:\s*\|\s*["'][^"']+["']\s*\n?)+)/g;

    while ((match = multiLineTypeRegex.exec(content)) !== null) {
      const typeName = match[1];
      const valuesStr = match[2];

      if (!typeName || !valuesStr) continue;

      // Extract individual string values from the union
      const values = this.parseUnionValues(valuesStr);

      if (values.length > 0) {
        // Calculate line number
        const lineNumber = content.slice(0, match.index).split("\n").length;
        // Check if we already have this type (avoid duplicates)
        if (!results.some((r) => r.typeName === typeName)) {
          results.push({ typeName, values, lineNumber });
        }
      }
    }

    return results;
  }

  /**
   * Parse individual values from a union type string.
   * Input: "'primary' | 'secondary' | 'success'"
   * Output: ['primary', 'secondary', 'success']
   */
  private parseUnionValues(valuesStr: string): string[] {
    const values: string[] = [];

    // Match each quoted string value
    const valueRegex = /['"]([^'"]+)['"]/g;
    let match;

    while ((match = valueRegex.exec(valuesStr)) !== null) {
      if (match[1]) {
        values.push(match[1]);
      }
    }

    return values;
  }

  /**
   * Determine if a type name represents a design token union.
   *
   * Design token unions typically end with:
   * - Variant (ButtonVariant, SizeVariant)
   * - Color (Color, ButtonColor)
   * - Size (Size, FontSize)
   * - Style (ButtonStyle, BorderStyle)
   * - Theme (Theme, ColorTheme)
   * - Type (ButtonType, InputType)
   */
  private isDesignTokenUnionType(typeName: string): boolean {
    const tokenPatterns = [
      /Variant$/i,
      /Color$/i,
      /Colour$/i,
      /Size$/i,
      /Sizing$/i,
      /Style$/i,
      /Theme$/i,
      /Type$/i,
      /Severity$/i,
      /Status$/i,
      /State$/i,
      /Intent$/i,
      /Appearance$/i,
      /Scheme$/i,
    ];

    return tokenPatterns.some((pattern) => pattern.test(typeName));
  }

  /**
   * Infer token category from the union type name.
   */
  private inferCategoryFromTypeName(typeName: string): string {
    const nameLower = typeName.toLowerCase();

    if (nameLower.includes("color") || nameLower.includes("colour")) {
      return "color";
    }
    if (nameLower.includes("size") || nameLower.includes("sizing")) {
      return "sizing";
    }
    if (
      nameLower.includes("spacing") ||
      nameLower.includes("gap") ||
      nameLower.includes("margin") ||
      nameLower.includes("padding")
    ) {
      return "spacing";
    }
    if (
      nameLower.includes("font") ||
      nameLower.includes("text") ||
      nameLower.includes("typography")
    ) {
      return "typography";
    }
    if (nameLower.includes("shadow") || nameLower.includes("elevation")) {
      return "shadow";
    }
    if (nameLower.includes("border") || nameLower.includes("radius")) {
      return "border";
    }
    if (
      nameLower.includes("animation") ||
      nameLower.includes("duration") ||
      nameLower.includes("motion")
    ) {
      return "motion";
    }

    // Default to 'other' for variant/style/type patterns
    return "other";
  }
}
