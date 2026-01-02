/**
 * Tests for HTML Style Extractor
 * Covers inline style="" attributes and <style> blocks extraction
 */

import { describe, it, expect } from 'vitest';
import {
  extractHtmlStyleAttributes,
  extractStyleBlocks,
  extractAllHtmlStyles,
} from './html-style.js';

describe('extractHtmlStyleAttributes', () => {
  describe('basic inline styles', () => {
    it('extracts simple style attribute with double quotes', () => {
      const content = `<div style="color: red"></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('color: red');
      expect(result[0]!.line).toBe(1);
      expect(result[0]!.context).toBe('inline');
    });

    it('extracts simple style attribute with single quotes', () => {
      const content = `<div style='color: blue'></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('color: blue');
    });

    it('extracts multiple style attributes in same line', () => {
      const content = `<div style="color: red"></div><span style="padding: 10px"></span>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(2);
      expect(result[0]!.css).toBe('color: red');
      expect(result[1]!.css).toBe('padding: 10px');
    });

    it('extracts style with multiple properties', () => {
      const content = `<div style="color: red; padding: 16px; margin: 8px"></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('color: red; padding: 16px; margin: 8px');
    });
  });

  describe('complex CSS values', () => {
    it('extracts style with CSS variables', () => {
      const content = `<div style="color: var(--primary-color)"></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('color: var(--primary-color)');
    });

    it('extracts style with CSS custom property definition', () => {
      const content = `<div style="--custom-width: 100px; width: var(--custom-width)"></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('--custom-width: 100px; width: var(--custom-width)');
    });

    it('extracts style with calc() function', () => {
      const content = `<div style="width: calc(100% - 20px)"></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('width: calc(100% - 20px)');
    });

    it('extracts style with complex clip-path', () => {
      const content = `<div style="clip-path: inset(0 calc(100% - var(--progress)) 0 0 round 9px)"></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('clip-path: inset(0 calc(100% - var(--progress)) 0 0 round 9px)');
    });

    it('extracts style with rgb/rgba functions', () => {
      const content = `<div style="background: rgba(255, 128, 0, 0.5)"></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('background: rgba(255, 128, 0, 0.5)');
    });

    it('extracts style with linear-gradient', () => {
      const content = `<div style="background: linear-gradient(90deg, red, blue)"></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('background: linear-gradient(90deg, red, blue)');
    });

    it('extracts style with url() containing quotes', () => {
      const content = `<div style="background: url('image.png')"></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('url');
    });
  });

  describe('whitespace handling', () => {
    it('extracts style with spaces around equals', () => {
      const content = `<div style = "color: red"></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('color: red');
    });

    it('extracts style with extra whitespace in value', () => {
      const content = `<div style="  color:   red  "></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('  color:   red  ');
    });
  });

  describe('line number tracking', () => {
    it('returns correct line number for multiline content', () => {
      const content = `<html>
<head></head>
<body>
  <div style="color: red"></div>
</body>
</html>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.line).toBe(4);
    });

    it('returns correct line numbers for multiple styles', () => {
      const content = `<div style="color: red"></div>
<div>no style</div>
<div style="color: blue"></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(2);
      expect(result[0]!.line).toBe(1);
      expect(result[1]!.line).toBe(3);
    });
  });

  describe('edge cases', () => {
    it('ignores empty style attribute', () => {
      const content = `<div style=""></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(0);
    });

    it('ignores whitespace-only style attribute', () => {
      const content = `<div style="   "></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(0);
    });

    it('handles self-closing tags', () => {
      const content = `<img style="width: 100px" />`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('width: 100px');
    });

    it('handles case-insensitive STYLE attribute', () => {
      const content = `<div STYLE="color: red"></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('color: red');
    });

    it('does not match data-style or other similar attributes', () => {
      const content = `<div data-style="not-css" ng-style="obj"></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(0);
    });

    it('handles nested quotes in single-quoted attribute', () => {
      const content = `<div style='content: "hello"'></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('content: "hello"');
    });
  });

  describe('template syntax handling', () => {
    it('handles ERB syntax in style value', () => {
      const content = `<div style="color: <%= @color %>"></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('<%= @color %>');
    });

    it('handles Blade syntax in style value', () => {
      const content = `<div style="color: {{ $color }}"></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('{{ $color }}');
    });

    it('handles Twig syntax in style value', () => {
      const content = `<div style="color: {{ color }}"></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('{{ color }}');
    });

    it('handles Jinja/Django syntax in style value', () => {
      const content = `<div style="color: {{ theme.primary }}"></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('{{ theme.primary }}');
    });

    it('handles PHP syntax in style value', () => {
      const content = `<div style="color: <?php echo $color; ?>"></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('<?php');
    });

    it('handles ERB with nested double quotes in style value', () => {
      const content = `<div style="background: url(<%= image_path('bg.png') %>)"></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe(`background: url(<%= image_path('bg.png') %>)`);
    });

    it('handles Liquid/Shopify syntax with filters', () => {
      const content = `<div style="background: {{ 'bg.png' | asset_url }}"></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain(`{{ 'bg.png' | asset_url }}`);
    });
  });

  describe('multi-line style attributes', () => {
    it('extracts style attribute spanning multiple lines', () => {
      const content = `<div style="color: red;
        padding: 10px;
        margin: 5px">test</div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('color: red');
      expect(result[0]!.css).toContain('padding: 10px');
      expect(result[0]!.css).toContain('margin: 5px');
    });

    it('extracts style with newline after opening quote', () => {
      const content = `<div style="
        color: red;
        padding: 10px
      ">test</div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('color: red');
      expect(result[0]!.css).toContain('padding: 10px');
    });

    it('handles multi-line style with single quotes', () => {
      const content = `<div style='color: red;
        padding: 10px'>test</div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('color: red');
      expect(result[0]!.css).toContain('padding: 10px');
    });
  });

  describe('SVG style handling', () => {
    it('extracts style from SVG elements', () => {
      const content = `<svg><rect style="fill: blue; stroke: black; stroke-width: 2" /></svg>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('fill: blue; stroke: black; stroke-width: 2');
    });

    it('extracts style from SVG path element', () => {
      const content = `<svg><path style="fill: none; stroke: #333; stroke-linecap: round" d="M0 0 L10 10" /></svg>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('stroke: #333');
    });
  });
});

describe('extractStyleBlocks', () => {
  describe('basic style blocks', () => {
    it('extracts simple style block', () => {
      const content = `<style>
  .container { color: red; }
</style>`;
      const result = extractStyleBlocks(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('.container');
      expect(result[0]!.context).toBe('style-block');
    });

    it('extracts multiple style blocks', () => {
      const content = `<style>.a { color: red; }</style>
<div></div>
<style>.b { color: blue; }</style>`;
      const result = extractStyleBlocks(content);
      expect(result).toHaveLength(2);
    });

    it('returns correct line number for style block', () => {
      const content = `<html>
<head>
  <style>
    .container { color: red; }
  </style>
</head>
</html>`;
      const result = extractStyleBlocks(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.line).toBe(3);
    });
  });

  describe('style blocks with attributes', () => {
    it('extracts style block with lang="sass"', () => {
      const content = `<style lang="sass">
.container
  color: red
</style>`;
      const result = extractStyleBlocks(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('.container');
    });

    it('extracts style block with lang="scss"', () => {
      const content = `<style lang="scss">
.container {
  color: red;
  .nested { padding: 10px; }
}
</style>`;
      const result = extractStyleBlocks(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('.container');
      expect(result[0]!.css).toContain('.nested');
    });

    it('extracts style block with scoped attribute', () => {
      const content = `<style scoped>
.container { color: red; }
</style>`;
      const result = extractStyleBlocks(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('.container');
    });

    it('extracts style block with both lang and scoped', () => {
      const content = `<style lang="sass" scoped>
.container
  color: red
</style>`;
      const result = extractStyleBlocks(content);
      expect(result).toHaveLength(1);
    });

    it('extracts style block with type="text/css"', () => {
      const content = `<style type="text/css">
.container { color: red; }
</style>`;
      const result = extractStyleBlocks(content);
      expect(result).toHaveLength(1);
    });

    it('extracts style block with module attribute (Vue CSS modules)', () => {
      const content = `<style module>
.container { color: red; }
</style>`;
      const result = extractStyleBlocks(content);
      expect(result).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('ignores empty style block', () => {
      const content = `<style></style>`;
      const result = extractStyleBlocks(content);
      expect(result).toHaveLength(0);
    });

    it('ignores whitespace-only style block', () => {
      const content = `<style>

</style>`;
      const result = extractStyleBlocks(content);
      expect(result).toHaveLength(0);
    });

    it('handles STYLE tag case-insensitively', () => {
      const content = `<STYLE>.container { color: red; }</STYLE>`;
      const result = extractStyleBlocks(content);
      expect(result).toHaveLength(1);
    });

    it('handles style block with comments', () => {
      const content = `<style>
/* Comment */
.container { color: red; }
</style>`;
      const result = extractStyleBlocks(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('/* Comment */');
    });

    it('handles style block with newlines in content', () => {
      const content = `<style>
.a {
  color: red;
}

.b {
  padding: 10px;
}
</style>`;
      const result = extractStyleBlocks(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('.a');
      expect(result[0]!.css).toContain('.b');
    });
  });
});

describe('HTML comment and script tag handling', () => {
  describe('HTML comments', () => {
    it('ignores inline styles inside HTML comments', () => {
      const content = `<!-- <div style="color: red"></div> -->
<div style="color: blue"></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('color: blue');
    });

    it('ignores style blocks inside HTML comments', () => {
      const content = `<!--
<style>
.a { color: red; }
</style>
-->
<style>
.b { color: blue; }
</style>`;
      const result = extractStyleBlocks(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('.b');
      expect(result[0]!.css).not.toContain('.a');
    });

    it('handles multiple HTML comments with styles', () => {
      const content = `<!-- <div style="color: red"></div> -->
<div style="color: blue"></div>
<!-- <span style="padding: 10px"></span> -->`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('color: blue');
    });

    it('handles multiline HTML comment with style', () => {
      const content = `<!--
        <div style="color: red">
          Hidden content
        </div>
      -->
<div style="color: blue"></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('color: blue');
    });
  });

  describe('script tags', () => {
    it('ignores inline styles inside script tag strings', () => {
      const content = `<script>
  const template = '<div style="color: red"></div>';
</script>
<div style="color: blue"></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('color: blue');
    });

    it('ignores style blocks referenced inside script tags', () => {
      const content = `<script>
  const html = '<style>.a { color: red; }</style>';
</script>
<style>
.b { color: blue; }
</style>`;
      const result = extractStyleBlocks(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('.b');
      expect(result[0]!.css).not.toContain('.a');
    });

    it('handles template literals in script with style strings', () => {
      const content = `<script>
  const html = \`<div style="color: red"></div>\`;
</script>
<div style="color: blue"></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('color: blue');
    });

    it('handles multiple script tags', () => {
      const content = `<script>const a = '<div style="color: red"></div>';</script>
<div style="color: blue"></div>
<script type="module">const b = '<div style="color: green"></div>';</script>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('color: blue');
    });
  });

  describe('noscript tags', () => {
    it('extracts styles from inside noscript tags (they are rendered HTML)', () => {
      const content = `<noscript>
  <div style="color: red"></div>
</noscript>
<div style="color: blue"></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(2);
      expect(result[0]!.css).toBe('color: red');
      expect(result[1]!.css).toBe('color: blue');
    });
  });
});

describe('extractAllHtmlStyles', () => {
  it('combines inline styles and style blocks', () => {
    const content = `<style>.a { color: red; }</style>
<div style="padding: 10px"></div>`;
    const result = extractAllHtmlStyles(content);
    expect(result).toHaveLength(2);

    const inlineResult = result.find(r => r.context === 'inline');
    const blockResult = result.find(r => r.context === 'style-block');

    expect(inlineResult).toBeDefined();
    expect(inlineResult!.css).toBe('padding: 10px');

    expect(blockResult).toBeDefined();
    expect(blockResult!.css).toContain('.a');
  });

  it('handles content with only inline styles', () => {
    const content = `<div style="color: red"></div>`;
    const result = extractAllHtmlStyles(content);
    expect(result).toHaveLength(1);
    expect(result[0]!.context).toBe('inline');
  });

  it('handles content with only style blocks', () => {
    const content = `<style>.a { color: red; }</style>`;
    const result = extractAllHtmlStyles(content);
    expect(result).toHaveLength(1);
    expect(result[0]!.context).toBe('style-block');
  });

  it('handles content with no styles', () => {
    const content = `<div class="container">Hello</div>`;
    const result = extractAllHtmlStyles(content);
    expect(result).toHaveLength(0);
  });
});

describe('CDATA handling', () => {
  describe('style blocks with CDATA', () => {
    it('strips CDATA wrapper from SVG style block', () => {
      const content = `<svg xmlns="http://www.w3.org/2000/svg">
<style type="text/css"><![CDATA[
.cls-1 { fill: #ff0000; }
.cls-2 { stroke: #00ff00; }
]]></style>
</svg>`;
      const result = extractStyleBlocks(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('.cls-1');
      expect(result[0]!.css).toContain('.cls-2');
      expect(result[0]!.css).not.toContain('CDATA');
      expect(result[0]!.css).not.toContain('<![');
      expect(result[0]!.css).not.toContain(']]>');
    });

    it('strips CDATA wrapper from XML-style content', () => {
      const content = `<style><![CDATA[
body { margin: 0; }
]]></style>`;
      const result = extractStyleBlocks(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('body { margin: 0; }');
    });

    it('handles CDATA with extra whitespace', () => {
      const content = `<style>  <![CDATA[  .a { color: red; }  ]]>  </style>`;
      const result = extractStyleBlocks(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('.a { color: red; }');
    });

    it('handles style block without CDATA normally', () => {
      const content = `<style>.a { color: red; }</style>`;
      const result = extractStyleBlocks(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('.a { color: red; }');
    });
  });
});

describe('textarea handling', () => {
  describe('inline styles', () => {
    it('ignores inline styles inside textarea', () => {
      const content = `<textarea><div style="color: red"></div></textarea>
<div style="color: blue"></div>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('color: blue');
    });

    it('ignores inline styles inside nested textarea', () => {
      const content = `<form>
  <textarea name="code"><span style="font-weight: bold">test</span></textarea>
  <button style="padding: 10px">Submit</button>
</form>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toBe('padding: 10px');
    });

    it('handles multiple textareas', () => {
      const content = `<textarea><div style="color: red"></div></textarea>
<div style="color: green"></div>
<textarea><span style="color: yellow"></span></textarea>
<span style="color: purple"></span>`;
      const result = extractHtmlStyleAttributes(content);
      expect(result).toHaveLength(2);
      expect(result[0]!.css).toBe('color: green');
      expect(result[1]!.css).toBe('color: purple');
    });
  });

  describe('style blocks', () => {
    it('ignores style blocks inside textarea', () => {
      const content = `<textarea><style>.a { color: red; }</style></textarea>
<style>.b { color: blue; }</style>`;
      const result = extractStyleBlocks(content);
      expect(result).toHaveLength(1);
      expect(result[0]!.css).toContain('.b');
      expect(result[0]!.css).not.toContain('.a');
    });
  });
});
