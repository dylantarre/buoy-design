// packages/scanners/src/git/token-scanner.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { TokenScanner } from "./token-scanner.js";
import { vol } from "memfs";

describe("TokenScanner", () => {
  beforeEach(() => {
    vol.reset();
  });

  describe("CSS variable parsing", () => {
    it("extracts CSS custom properties from :root", async () => {
      vol.fromJSON({
        "/project/tokens/colors.css": `
          :root {
            --primary-color: #0066cc;
            --secondary-color: #666666;
            --spacing-sm: 8px;
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(3);
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "--primary-color",
          category: "color",
        }),
      );
    });

    it("categorizes tokens by name patterns", async () => {
      vol.fromJSON({
        "/project/tokens/vars.css": `
          :root {
            --color-primary: #0066cc;
            --spacing-md: 16px;
            --font-size-base: 14px;
            --shadow-sm: 0 1px 2px rgba(0,0,0,0.1);
            --border-radius: 4px;
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      const result = await scanner.scan();

      const colorToken = result.items.find((t) => t.name.includes("color"));
      const spacingToken = result.items.find((t) => t.name.includes("spacing"));
      const fontToken = result.items.find((t) => t.name.includes("font"));
      const shadowToken = result.items.find((t) => t.name.includes("shadow"));
      const borderToken = result.items.find((t) => t.name.includes("border"));

      expect(colorToken?.category).toBe("color");
      expect(spacingToken?.category).toBe("spacing");
      expect(fontToken?.category).toBe("typography");
      expect(shadowToken?.category).toBe("shadow");
      expect(borderToken?.category).toBe("border");
    });

    it("handles multi-line CSS values", async () => {
      vol.fromJSON({
        "/project/tokens/complex.css": `
          :root {
            --gradient-primary: linear-gradient(
              to right,
              #0066cc,
              #00cc66
            );
            --shadow-lg: 0 4px 6px rgba(0, 0, 0, 0.1),
                         0 2px 4px rgba(0, 0, 0, 0.06);
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(2);
      const gradientToken = result.items.find((t) =>
        t.name.includes("gradient"),
      );
      expect(gradientToken).toBeDefined();
    });

    it("respects cssVariablePrefix config", async () => {
      vol.fromJSON({
        "/project/tokens/prefixed.css": `
          :root {
            --ds-color-primary: #0066cc;
            --ds-spacing-sm: 8px;
            --other-color: #ff0000;
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
        cssVariablePrefix: "--ds-",
      });

      const result = await scanner.scan();

      expect(result.items.length).toBe(2);
      expect(result.items.every((t) => t.name.startsWith("--ds-"))).toBe(true);
    });

    it("ignores CSS comments", async () => {
      vol.fromJSON({
        "/project/tokens/commented.css": `
          :root {
            /* --commented-out: #ff0000; */
            --active-color: #0066cc;
            /*
             * Multi-line comment
             * --also-commented: #00ff00;
             */
            --another-color: #666666;
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBe(2);
      expect(result.items.map((t) => t.name)).not.toContain("--commented-out");
      expect(result.items.map((t) => t.name)).not.toContain("--also-commented");
    });
  });

  describe("JSON token parsing", () => {
    it("extracts tokens from design tokens JSON format", async () => {
      vol.fromJSON({
        "/project/tokens/tokens.json": JSON.stringify({
          color: {
            primary: { value: "#0066cc" },
            secondary: { value: "#666666" },
          },
          spacing: {
            sm: { value: "8px" },
            md: { value: "16px" },
          },
        }),
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.json"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(4);
    });

    it("handles nested token structures", async () => {
      vol.fromJSON({
        "/project/tokens/nested.json": JSON.stringify({
          color: {
            brand: {
              primary: { value: "#0066cc" },
              secondary: { value: "#00cc66" },
            },
          },
        }),
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.json"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(2);
      // Nested tokens should have dotted names
      const primaryToken = result.items.find((t) => t.name.includes("primary"));
      expect(primaryToken?.name).toContain("brand");
    });

    it("supports $value format (W3C Design Tokens)", async () => {
      vol.fromJSON({
        "/project/tokens/w3c.json": JSON.stringify({
          color: {
            primary: { $value: "#0066cc", $type: "color" },
            secondary: { $value: "#666666", $type: "color" },
          },
        }),
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.json"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(2);
      expect(result.items[0]!.category).toBe("color");
    });

    it("includes token metadata like description", async () => {
      vol.fromJSON({
        "/project/tokens/described.json": JSON.stringify({
          color: {
            primary: {
              value: "#0066cc",
              description: "Main brand color",
            },
          },
        }),
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.json"],
      });

      const result = await scanner.scan();

      expect(result.items[0]!.metadata.description).toBe("Main brand color");
    });
  });

  describe("SCSS variable parsing", () => {
    it("extracts SCSS variables", async () => {
      vol.fromJSON({
        "/project/tokens/variables.scss": `
          $primary-color: #0066cc;
          $secondary-color: #666666;
          $spacing-sm: 8px;
          $font-size-base: 14px;
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.scss"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(4);
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "$primary-color",
        }),
      );
    });

    it("categorizes SCSS variables correctly", async () => {
      vol.fromJSON({
        "/project/tokens/categorized.scss": `
          $color-primary: #0066cc;
          $spacing-lg: 24px;
          $font-family-base: 'Arial', sans-serif;
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.scss"],
      });

      const result = await scanner.scan();

      const colorToken = result.items.find((t) => t.name.includes("color"));
      const spacingToken = result.items.find((t) => t.name.includes("spacing"));
      const fontToken = result.items.find((t) => t.name.includes("font"));

      expect(colorToken?.category).toBe("color");
      expect(spacingToken?.category).toBe("spacing");
      expect(fontToken?.category).toBe("typography");
    });

    it("handles SCSS variables with complex values", async () => {
      vol.fromJSON({
        "/project/tokens/complex.scss": `
          $shadow-base: 0 2px 4px rgba(0, 0, 0, 0.1);
          $transition-all: all 0.3s ease-in-out;
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.scss"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("error handling", () => {
    it("handles invalid JSON gracefully", async () => {
      vol.fromJSON({
        "/project/tokens/invalid.json": "{ invalid json }",
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.json"],
      });

      const result = await scanner.scan();

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]!.code).toBe("JSON_PARSE_ERROR");
    });

    it("handles empty files", async () => {
      vol.fromJSON({
        "/project/tokens/empty.css": "",
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it("handles files with no tokens", async () => {
      vol.fromJSON({
        "/project/tokens/no-tokens.css": `
          body {
            margin: 0;
            padding: 0;
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(0);
    });
  });

  describe("scan statistics", () => {
    it("returns scan stats", async () => {
      vol.fromJSON({
        "/project/tokens/colors.css": ":root { --color: #fff; }",
        "/project/tokens/spacing.css": ":root { --space: 8px; }",
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      const result = await scanner.scan();

      expect(result.stats).toBeDefined();
      expect(result.stats.filesScanned).toBe(2);
      expect(result.stats.itemsFound).toBeGreaterThanOrEqual(2);
      expect(result.stats.duration).toBeGreaterThanOrEqual(0);
    });

    it("tracks duration", async () => {
      vol.fromJSON({
        "/project/tokens/colors.css": ":root { --color: #fff; }",
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      const result = await scanner.scan();

      expect(typeof result.stats.duration).toBe("number");
    });
  });

  describe("token value parsing", () => {
    it("parses color values correctly", async () => {
      vol.fromJSON({
        "/project/tokens/colors.css": `
          :root {
            --color-hex: #0066cc;
            --color-rgb: rgb(0, 102, 204);
            --color-hsl: hsl(210, 100%, 40%);
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      const result = await scanner.scan();

      const hexToken = result.items.find((t) => t.name === "--color-hex");
      expect(hexToken?.value.type).toBe("color");
      expect((hexToken?.value as { type: "color"; hex: string }).hex).toBe(
        "#0066cc",
      );
    });

    it("parses spacing values with units", async () => {
      vol.fromJSON({
        "/project/tokens/spacing.css": `
          :root {
            --spacing-px: 16px;
            --spacing-rem: 1rem;
            --spacing-em: 2em;
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      const result = await scanner.scan();

      const pxToken = result.items.find((t) => t.name === "--spacing-px");
      expect(pxToken?.value.type).toBe("spacing");
      expect(
        (pxToken?.value as { type: "spacing"; value: number; unit: string })
          .value,
      ).toBe(16);
      expect(
        (pxToken?.value as { type: "spacing"; value: number; unit: string })
          .unit,
      ).toBe("px");
    });
  });

  describe("token deduplication", () => {
    it("deduplicates tokens with same ID", async () => {
      vol.fromJSON({
        "/project/tokens/vars.css": `
          :root {
            --color-primary: #0066cc;
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css", "tokens/**/*.css"], // Duplicate pattern
      });

      const result = await scanner.scan();

      // Should only have one token despite duplicate pattern
      const primaryTokens = result.items.filter(
        (t) => t.name === "--color-primary",
      );
      expect(primaryTokens.length).toBe(1);
    });
  });

  describe("source type", () => {
    it("returns correct source type", () => {
      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      expect(scanner.getSourceType()).toBe("tokens");
    });
  });

  describe("default file patterns", () => {
    it("scans default token file locations when no files specified", async () => {
      vol.fromJSON({
        "/project/tokens/design.tokens.json": JSON.stringify({
          color: { primary: { value: "#0066cc" } },
        }),
        "/project/src/styles/variables.css": `
          :root {
            --color-secondary: #666666;
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("TypeScript union type parsing", () => {
    it("extracts tokens from TypeScript union type definitions", async () => {
      vol.fromJSON({
        "/project/types/variants.ts": `
          type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info' | 'dark' | 'light';
          export type SizeVariant = 'sm' | 'md' | 'lg' | 'xl';
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["types/**/*.ts"],
      });

      const result = await scanner.scan();

      // Should have 8 from ButtonVariant + 4 from SizeVariant = 12 tokens
      expect(result.items.length).toBe(12);

      // Check ButtonVariant tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "primary",
          source: expect.objectContaining({
            type: "typescript",
            typeName: "ButtonVariant",
          }),
        }),
      );

      // Check SizeVariant tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "lg",
          source: expect.objectContaining({
            type: "typescript",
            typeName: "SizeVariant",
          }),
        }),
      );
    });

    it("extracts tokens from Color union types", async () => {
      vol.fromJSON({
        "/project/types/colors.ts": `
          type Color = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info' | 'light' | 'dark';
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["types/**/*.ts"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBe(8);
      expect(result.items[0]?.category).toBe("color");
    });

    it("categorizes tokens based on type name", async () => {
      vol.fromJSON({
        "/project/types/all.ts": `
          type ColorVariant = 'red' | 'blue';
          type ButtonSizeVariant = 'sm' | 'lg';
          type FontStyle = 'small' | 'large';
          type PaddingStyle = 'tight' | 'loose';
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["types/**/*.ts"],
      });

      const result = await scanner.scan();

      const colorTokens = result.items.filter((t) => t.category === "color");
      const sizingTokens = result.items.filter((t) => t.category === "sizing");
      const typographyTokens = result.items.filter(
        (t) => t.category === "typography",
      );
      const spacingTokens = result.items.filter(
        (t) => t.category === "spacing",
      );

      expect(colorTokens.length).toBe(2);
      expect(sizingTokens.length).toBe(2);
      expect(typographyTokens.length).toBe(2);
      expect(spacingTokens.length).toBe(2);
    });

    it("supports double-quoted strings", async () => {
      vol.fromJSON({
        "/project/types/quoted.ts": `
          type ButtonVariant = "primary" | "secondary" | "tertiary";
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["types/**/*.ts"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBe(3);
      expect(result.items.map((t) => t.name)).toEqual([
        "primary",
        "secondary",
        "tertiary",
      ]);
    });

    it("ignores non-design-token type names", async () => {
      vol.fromJSON({
        "/project/types/other.ts": `
          type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
          type LogLevel = 'debug' | 'info' | 'warn' | 'error';
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["types/**/*.ts"],
      });

      const result = await scanner.scan();

      // These should not be detected as design tokens
      expect(result.items.length).toBe(0);
    });

    it("handles mixed union and non-union types", async () => {
      vol.fromJSON({
        "/project/types/mixed.ts": `
          interface ButtonProps {
            variant: ButtonVariant;
            size: Size;
          }

          type ButtonVariant = 'primary' | 'secondary';
          type Size = 'sm' | 'md' | 'lg';

          const myVar = 'something';
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["types/**/*.ts"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBe(5); // 2 + 3
    });

    it("extracts line numbers correctly", async () => {
      vol.fromJSON({
        "/project/types/lines.ts": `// Line 1
// Line 2
type ButtonVariant = 'primary' | 'secondary';
// Line 4
type SizeType = 'sm' | 'lg';
`,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["types/**/*.ts"],
      });

      const result = await scanner.scan();

      const buttonTokens = result.items.filter(
        (t) =>
          t.source.type === "typescript" &&
          t.source.typeName === "ButtonVariant",
      );
      const sizeTokens = result.items.filter(
        (t) => t.source.type === "typescript" && t.source.typeName === "SizeType",
      );

      // ButtonVariant is on line 3
      expect(buttonTokens[0]?.source.type === "typescript" && buttonTokens[0]?.source.line).toBe(3);
      // SizeType is on line 5
      expect(sizeTokens[0]?.source.type === "typescript" && sizeTokens[0]?.source.line).toBe(5);
    });

    it("handles .tsx files", async () => {
      vol.fromJSON({
        "/project/types/button.types.tsx": `
          type ButtonVariant = 'primary' | 'secondary' | 'ghost';
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["types/**/*.tsx"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBe(3);
    });

    it("includes description metadata", async () => {
      vol.fromJSON({
        "/project/types/variants.ts": `
          type ButtonVariant = 'primary' | 'secondary';
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["types/**/*.ts"],
      });

      const result = await scanner.scan();

      expect(result.items[0]?.metadata.description).toBe(
        "Value from ButtonVariant union type",
      );
    });

    it("handles additional design token patterns", async () => {
      vol.fromJSON({
        "/project/types/patterns.ts": `
          type AlertSeverity = 'info' | 'warning' | 'error';
          type ButtonState = 'default' | 'hover' | 'active' | 'disabled';
          type BadgeAppearance = 'solid' | 'outline' | 'subtle';
          type InputStatus = 'valid' | 'invalid' | 'pending';
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["types/**/*.ts"],
      });

      const result = await scanner.scan();

      // All these patterns should be recognized: 3 + 4 + 3 + 3 = 13
      expect(result.items.length).toBe(13);
    });

    it("creates unique token IDs for same value in different types", async () => {
      vol.fromJSON({
        "/project/types/overlapping.ts": `
          type ButtonVariant = 'primary' | 'secondary';
          type AlertType = 'primary' | 'secondary';
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["types/**/*.ts"],
      });

      const result = await scanner.scan();

      // Should have 4 tokens (2 from each type)
      expect(result.items.length).toBe(4);

      // IDs should be unique
      const ids = result.items.map((t) => t.id);
      expect(new Set(ids).size).toBe(4);
    });
  });

  describe("TypeScript token object parsing", () => {
    it("extracts tokens from defineTokens.colors pattern (Chakra/Panda)", async () => {
      vol.fromJSON({
        "/project/tokens/colors.ts": `
          import { defineTokens } from "../def"

          export const colors = defineTokens.colors({
            black: {
              value: "#09090B",
            },
            white: {
              value: "#FFFFFF",
            },
            gray: {
              "50": {
                value: "#fafafa",
              },
              "100": {
                value: "#f4f4f5",
              },
            },
          })
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.ts"],
      });

      const result = await scanner.scan();

      // Should detect: black, white, gray.50, gray.100 = 4 tokens
      expect(result.items.length).toBeGreaterThanOrEqual(4);

      // Check that we got the black token
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "black",
          category: "color",
          value: expect.objectContaining({ hex: "#09090b" }),
        }),
      );

      // Check nested gray tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "gray.50",
          category: "color",
        }),
      );
    });

    it("extracts tokens from defineTokens.spacing pattern", async () => {
      vol.fromJSON({
        "/project/tokens/spacing.ts": `
          import { defineTokens } from "../def"

          export const spacing = defineTokens.spacing({
            "1": {
              value: "0.25rem",
            },
            "2": {
              value: "0.5rem",
            },
            "4": {
              value: "1rem",
            },
          })
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.ts"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(3);
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "1",
          category: "spacing",
        }),
      );
    });

    it("extracts tokens from plain object exports", async () => {
      vol.fromJSON({
        "/project/tokens/theme.ts": `
          export const colors = {
            primary: {
              value: "#0066cc",
            },
            secondary: {
              value: "#666666",
            },
          }

          export const spacing = {
            sm: {
              value: "8px",
            },
            md: {
              value: "16px",
            },
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.ts"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(4);
    });

    it("extracts tokens from const objects with as const", async () => {
      vol.fromJSON({
        "/project/tokens/constants.ts": `
          export const colors = {
            primary: "#0066cc",
            secondary: "#666666",
            success: "#22c55e",
          } as const;

          export const spacing = {
            xs: "4px",
            sm: "8px",
            md: "16px",
          } as const;
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.ts"],
      });

      const result = await scanner.scan();

      // Direct value tokens (not nested { value: "..." })
      expect(result.items.length).toBeGreaterThanOrEqual(6);
    });

    it("detects tokens in files with token-related naming", async () => {
      vol.fromJSON({
        "/project/src/tokens/index.ts": `
          export const colors = {
            brand: {
              value: "#0066cc",
            },
          }
        `,
        "/project/src/theme/tokens.ts": `
          export const spacing = {
            base: {
              value: "8px",
            },
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["**/tokens/**/*.ts", "**/theme/tokens.ts"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(2);
    });

    it("handles deeply nested token structures", async () => {
      vol.fromJSON({
        "/project/tokens/semantic.ts": `
          export const colors = defineTokens.colors({
            brand: {
              primary: {
                "50": { value: "#eff6ff" },
                "100": { value: "#dbeafe" },
                "500": { value: "#3b82f6" },
              },
              secondary: {
                "50": { value: "#f0fdf4" },
                "500": { value: "#22c55e" },
              },
            },
          })
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.ts"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(5);
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: expect.stringContaining("brand.primary.500"),
        }),
      );
    });
  });

  describe("Style props theme object parsing", () => {
    it("extracts tokens from Mantine DEFAULT_THEME pattern with rem() calls", async () => {
      vol.fromJSON({
        "/project/theme/default-theme.ts": `
          const rem = (value: number) => \`\${value / 16}rem\`;

          export const DEFAULT_THEME = {
            fontSizes: {
              xs: rem(12),
              sm: rem(14),
              md: rem(16),
              lg: rem(18),
              xl: rem(20),
            },

            spacing: {
              xs: rem(10),
              sm: rem(12),
              md: rem(16),
              lg: rem(20),
              xl: rem(32),
            },

            radius: {
              xs: rem(2),
              sm: rem(4),
              md: rem(8),
              lg: rem(16),
              xl: rem(32),
            },
          };
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["theme/**/*.ts"],
      });

      const result = await scanner.scan();

      // Should detect tokens from fontSizes, spacing, and radius (5 each = 15)
      expect(result.items.length).toBeGreaterThanOrEqual(15);

      // Check fontSizes tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: expect.stringMatching(/fontSizes\.xs|xs/),
          category: "typography",
        }),
      );

      // Check spacing tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: expect.stringMatching(/spacing\.md|md/),
          category: "spacing",
        }),
      );

      // Check radius tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: expect.stringMatching(/radius\.sm|sm/),
          category: "border",
        }),
      );
    });

    it("extracts tokens from theme objects with string literal values", async () => {
      vol.fromJSON({
        "/project/theme/theme.ts": `
          export const theme = {
            lineHeights: {
              xs: '1.4',
              sm: '1.45',
              md: '1.55',
              lg: '1.6',
              xl: '1.65',
            },

            breakpoints: {
              xs: '36em',
              sm: '48em',
              md: '62em',
              lg: '75em',
              xl: '88em',
            },
          };
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["theme/**/*.ts"],
      });

      const result = await scanner.scan();

      // Should detect tokens from lineHeights and breakpoints (5 each = 10)
      expect(result.items.length).toBeGreaterThanOrEqual(10);
    });

    it("extracts tokens from theme with color values", async () => {
      vol.fromJSON({
        "/project/theme/colors.ts": `
          export const theme = {
            white: '#fff',
            black: '#000',
            colors: {
              blue: {
                50: '#eff6ff',
                100: '#dbeafe',
                500: '#3b82f6',
                900: '#1e3a8a',
              },
            },
          };
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["theme/**/*.ts"],
      });

      const result = await scanner.scan();

      // Should detect: white, black, blue.50, blue.100, blue.500, blue.900 = 6
      expect(result.items.length).toBeGreaterThanOrEqual(6);

      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "white",
          category: "color",
        }),
      );
    });

    it("extracts tokens from shadows with complex values", async () => {
      vol.fromJSON({
        "/project/theme/shadows.ts": `
          const rem = (value: number) => \`\${value / 16}rem\`;

          export const shadows = {
            xs: \`0 \${rem(1)} \${rem(3)} rgba(0, 0, 0, 0.05)\`,
            sm: \`0 \${rem(1)} \${rem(3)} rgba(0, 0, 0, 0.1)\`,
            md: \`0 \${rem(4)} \${rem(6)} rgba(0, 0, 0, 0.1)\`,
          };
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["theme/**/*.ts"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(3);
      expect(result.items).toContainEqual(
        expect.objectContaining({
          category: "shadow",
        }),
      );
    });
  });

  describe("Panda CSS / Chakra UI semantic tokens", () => {
    it("extracts tokens from defineSemanticTokens.colors pattern (Chakra UI v3)", async () => {
      vol.fromJSON({
        "/project/semantic-tokens/colors.ts": `
          import { defineSemanticTokens } from "../def"

          export const colors = defineSemanticTokens.colors({
            bg: {
              DEFAULT: {
                value: {
                  _light: "{colors.white}",
                  _dark: "{colors.black}",
                },
              },
              subtle: {
                value: {
                  _light: "{colors.gray.50}",
                  _dark: "{colors.gray.950}",
                },
              },
            },
            fg: {
              DEFAULT: {
                value: {
                  _light: "{colors.black}",
                  _dark: "{colors.gray.50}",
                },
              },
              muted: {
                value: {
                  _light: "{colors.gray.600}",
                  _dark: "{colors.gray.400}",
                },
              },
            },
          })
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["semantic-tokens/**/*.ts"],
      });

      const result = await scanner.scan();

      // Should detect nested semantic tokens: bg.DEFAULT, bg.subtle, fg.DEFAULT, fg.muted
      // Note: The light/dark value format is an alias reference, not a direct color value
      expect(result.items.length).toBeGreaterThanOrEqual(4);

      // Check that we got the bg tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: expect.stringContaining("bg"),
          category: "color",
        }),
      );

      // Check that we got the fg tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: expect.stringContaining("fg"),
          category: "color",
        }),
      );
    });

    it("extracts tokens from defineSemanticTokens.shadows pattern", async () => {
      vol.fromJSON({
        "/project/semantic-tokens/shadows.ts": `
          import { defineSemanticTokens } from "../def"

          export const shadows = defineSemanticTokens.shadows({
            xs: {
              value: {
                _light: "0 1px 2px rgba(0, 0, 0, 0.05)",
                _dark: "0 1px 2px rgba(0, 0, 0, 0.2)",
              },
            },
            sm: {
              value: {
                _light: "0 1px 3px rgba(0, 0, 0, 0.1)",
                _dark: "0 1px 3px rgba(0, 0, 0, 0.25)",
              },
            },
          })
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["semantic-tokens/**/*.ts"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(2);
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "xs",
          category: "shadow",
        }),
      );
    });

    it("handles nested semantic tokens with deeply nested value objects", async () => {
      vol.fromJSON({
        "/project/semantic-tokens/colors.ts": `
          export const colors = defineSemanticTokens.colors({
            gray: {
              contrast: {
                value: {
                  _light: "{colors.white}",
                  _dark: "{colors.black}",
                },
              },
              fg: {
                value: {
                  _light: "{colors.gray.800}",
                  _dark: "{colors.gray.200}",
                },
              },
              solid: {
                value: {
                  _light: "{colors.gray.900}",
                  _dark: "{colors.white}",
                },
              },
            },
          })
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["semantic-tokens/**/*.ts"],
      });

      const result = await scanner.scan();

      // Should detect: gray.contrast, gray.fg, gray.solid
      expect(result.items.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Mantine-style color arrays", () => {
    it("extracts tokens from color palette arrays like Mantine DEFAULT_COLORS", async () => {
      vol.fromJSON({
        "/project/theme/default-colors.ts": `
          export const DEFAULT_COLORS = {
            dark: [
              '#C9C9C9',
              '#b8b8b8',
              '#828282',
              '#696969',
              '#424242',
            ],
            gray: [
              '#f8f9fa',
              '#f1f3f5',
              '#e9ecef',
            ],
            blue: [
              '#e7f5ff',
              '#d0ebff',
              '#a5d8ff',
            ],
          };
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["theme/**/*.ts"],
      });

      const result = await scanner.scan();

      // Should detect: dark.0-4, gray.0-2, blue.0-2 = 5 + 3 + 3 = 11 tokens
      expect(result.items.length).toBeGreaterThanOrEqual(11);

      // Check that we got indexed color tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: expect.stringMatching(/dark\.0|dark\[0\]/),
          category: "color",
        }),
      );

      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: expect.stringMatching(/gray\.2|gray\[2\]/),
          category: "color",
        }),
      );
    });

    it("extracts color arrays with type annotations", async () => {
      vol.fromJSON({
        "/project/theme/colors.ts": `
          type MantineThemeColors = Record<string, string[]>;

          export const DEFAULT_COLORS: MantineThemeColors = {
            red: [
              '#fff5f5',
              '#ffe3e3',
              '#ffc9c9',
            ],
            green: [
              '#ebfbee',
              '#d3f9d8',
            ],
          };
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["theme/**/*.ts"],
      });

      const result = await scanner.scan();

      // Should detect red.0-2 and green.0-1 = 3 + 2 = 5 tokens
      expect(result.items.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe("Extended file path patterns", () => {
    it("scans default-theme.ts files outside of /theme/ directory", async () => {
      vol.fromJSON({
        "/project/src/core/Provider/default-theme.ts": `
          const rem = (value: number) => \`\${value / 16}rem\`;

          export const DEFAULT_THEME = {
            fontSizes: {
              xs: rem(12),
              sm: rem(14),
              md: rem(16),
            },
          };
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
      });

      const result = await scanner.scan();

      // Should detect fontSizes.xs, fontSizes.sm, fontSizes.md
      expect(result.items.length).toBeGreaterThanOrEqual(3);
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: expect.stringContaining("fontSizes"),
          category: "typography",
        }),
      );
    });

    it("scans default-colors.ts files outside of /theme/ directory", async () => {
      vol.fromJSON({
        "/project/src/core/Provider/default-colors.ts": `
          export const DEFAULT_COLORS = {
            gray: [
              '#f8f9fa',
              '#f1f3f5',
              '#e9ecef',
            ],
          };
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
      });

      const result = await scanner.scan();

      // Should detect gray color tokens
      expect(result.items.length).toBeGreaterThanOrEqual(3);
    });

    it("scans *Provider/**/*.ts pattern for theme files", async () => {
      vol.fromJSON({
        "/project/packages/core/src/MantineProvider/default-theme.ts": `
          export const theme = {
            spacing: {
              xs: '10px',
              sm: '12px',
              md: '16px',
            },
          };
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Default patterns - semantic-tokens directory", () => {
    it("scans **/semantic-tokens/**/*.ts files by default (Chakra UI v3 pattern)", async () => {
      vol.fromJSON({
        "/project/packages/panda-preset/src/semantic-tokens/colors.ts": `
          import { defineSemanticTokens } from "../def"

          export const colors = defineSemanticTokens.colors({
            bg: {
              DEFAULT: {
                value: {
                  _light: "{colors.white}",
                  _dark: "{colors.black}",
                },
              },
              subtle: {
                value: {
                  _light: "{colors.gray.50}",
                  _dark: "{colors.gray.950}",
                },
              },
            },
          })
        `,
        "/project/packages/panda-preset/src/semantic-tokens/shadows.ts": `
          import { defineSemanticTokens } from "../def"

          export const shadows = defineSemanticTokens.shadows({
            xs: {
              value: {
                _light: "0 1px 2px rgba(0, 0, 0, 0.05)",
                _dark: "0 1px 2px rgba(0, 0, 0, 0.2)",
              },
            },
          })
        `,
      });

      // No files specified - should use default patterns
      const scanner = new TokenScanner({
        projectRoot: "/project",
      });

      const result = await scanner.scan();

      // Should detect bg.DEFAULT, bg.subtle from colors.ts and xs from shadows.ts
      expect(result.items.length).toBeGreaterThanOrEqual(3);

      // Verify semantic color tokens were found
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: expect.stringContaining("bg"),
          category: "color",
        }),
      );

      // Verify semantic shadow tokens were found
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "xs",
          category: "shadow",
        }),
      );
    });
  });

  describe("JSON array format parsing", () => {
    it("extracts tokens from JSON arrays with token names (Chakra UI generated format)", async () => {
      vol.fromJSON({
        "/project/tokens/colors.json": JSON.stringify([
          "transparent",
          "current",
          "black",
          "white",
          "gray.50",
          "gray.100",
          "gray.200",
        ]),
        "/project/tokens/spacing.json": JSON.stringify([
          "1",
          "2",
          "3",
          "4",
        ]),
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.json"],
      });

      const result = await scanner.scan();

      // Should detect all token names from arrays
      expect(result.items.length).toBeGreaterThanOrEqual(11);

      // Check color tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "black",
          category: "color",
        }),
      );

      // Check nested color tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "gray.50",
          category: "color",
        }),
      );

      // Check spacing tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "1",
          category: "spacing",
        }),
      );
    });

    it("categorizes JSON array tokens based on filename", async () => {
      vol.fromJSON({
        "/project/tokens/font-sizes.json": JSON.stringify([
          "xs",
          "sm",
          "md",
          "lg",
        ]),
        "/project/tokens/radii.json": JSON.stringify([
          "none",
          "sm",
          "md",
          "lg",
          "full",
        ]),
        "/project/tokens/shadows.json": JSON.stringify([
          "xs",
          "sm",
          "md",
          "lg",
        ]),
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.json"],
      });

      const result = await scanner.scan();

      // Check typography tokens from font-sizes.json
      const typographyTokens = result.items.filter(
        (t) => t.category === "typography",
      );
      expect(typographyTokens.length).toBeGreaterThanOrEqual(4);

      // Check border tokens from radii.json
      const borderTokens = result.items.filter((t) => t.category === "border");
      expect(borderTokens.length).toBeGreaterThanOrEqual(5);

      // Check shadow tokens from shadows.json
      const shadowTokens = result.items.filter((t) => t.category === "shadow");
      expect(shadowTokens.length).toBeGreaterThanOrEqual(4);
    });
  });
});
