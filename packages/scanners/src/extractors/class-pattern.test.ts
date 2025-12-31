import { describe, it, expect } from 'vitest';
import { extractClassPatterns, analyzePatternForTokens, ClassPatternMatch } from './class-pattern.js';

describe('extractClassPatterns', () => {
  describe('direct template literals', () => {
    it('extracts simple template literal with variable', () => {
      const content = `<div className={\`btn-\${size}\`}>`;
      const matches = extractClassPatterns(content);

      expect(matches).toHaveLength(1);
      expect(matches[0]!.pattern).toBe('btn-${size}');
      expect(matches[0]!.variables).toContain('size');
      expect(matches[0]!.staticParts).toContain('btn-');
      expect(matches[0]!.context).toBe('template-literal');
    });

    it('extracts template literal with multiple variables', () => {
      const content = `<div className={\`\${prefix}-\${variant}\`}>`;
      const matches = extractClassPatterns(content);

      expect(matches).toHaveLength(1);
      expect(matches[0]!.pattern).toBe('${prefix}-${variant}');
      expect(matches[0]!.variables).toHaveLength(2);
      expect(matches[0]!.variables).toContain('prefix');
      expect(matches[0]!.variables).toContain('variant');
      expect(matches[0]!.structure).toBe('{prefix}-{variant}');
    });

    it('extracts pattern with prefix variable and static suffix', () => {
      const content = `<button className={\`\${bsPrefix}-button\`}>`;
      const matches = extractClassPatterns(content);

      expect(matches).toHaveLength(1);
      expect(matches[0]!.staticParts).toContain('-button');
    });

    it('handles multiple patterns on different lines', () => {
      const content = `
        <div className={\`container-\${size}\`}>
          <button className={\`btn-\${variant}\`}>
      `;
      const matches = extractClassPatterns(content);

      expect(matches).toHaveLength(2);
      expect(matches[0]!.variables).toContain('size');
      expect(matches[1]!.variables).toContain('variant');
    });
  });

  describe('clsx and classnames utilities', () => {
    it('extracts patterns from clsx()', () => {
      const content = `<div className={clsx(bsPrefix, variant && \`\${bsPrefix}-\${variant}\`)}>`;
      const matches = extractClassPatterns(content);

      expect(matches).toHaveLength(1);
      expect(matches[0]!.context).toBe('clsx');
      expect(matches[0]!.variables).toContain('bsPrefix');
      expect(matches[0]!.variables).toContain('variant');
    });

    it('extracts patterns from classnames()', () => {
      const content = `<div className={classnames(base, \`\${prefix}-active\`)}>`;
      const matches = extractClassPatterns(content);

      expect(matches).toHaveLength(1);
      expect(matches[0]!.context).toBe('classnames');
    });

    it('extracts patterns from cx()', () => {
      const content = `<div className={cx(\`theme-\${color}\`)}>`;
      const matches = extractClassPatterns(content);

      expect(matches).toHaveLength(1);
      expect(matches[0]!.context).toBe('cx');
    });

    it('extracts patterns from cn() (common shorthand)', () => {
      const content = `<div className={cn(\`size-\${size}\`)}>`;
      const matches = extractClassPatterns(content);

      expect(matches).toHaveLength(1);
    });
  });

  describe('conditional expressions', () => {
    it('extracts patterns from ternary expressions', () => {
      const content = `<div className={isActive ? \`\${prefix}-active\` : \`\${prefix}-inactive\`}>`;
      const matches = extractClassPatterns(content);

      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some(m => m.context === 'conditional')).toBe(true);
    });
  });

  describe('multi-line patterns', () => {
    it('extracts patterns spanning multiple lines', () => {
      const content = `
        <div className={
          clsx(
            baseClass,
            variant && \`\${prefix}-\${variant}\`
          )
        }>
      `;
      const matches = extractClassPatterns(content);

      expect(matches).toHaveLength(1);
      expect(matches[0]!.variables).toContain('prefix');
      expect(matches[0]!.variables).toContain('variant');
    });
  });

  describe('react-bootstrap patterns', () => {
    it('handles typical react-bootstrap variant pattern', () => {
      const content = `
        const Button = ({ variant, size, bsPrefix = 'btn' }) => (
          <button className={clsx(bsPrefix, variant && \`\${bsPrefix}-\${variant}\`, size && \`\${bsPrefix}-\${size}\`)}>
        );
      `;
      const matches = extractClassPatterns(content);

      expect(matches.length).toBeGreaterThanOrEqual(2);
      const variantMatch = matches.find(m => m.variables.includes('variant'));
      const sizeMatch = matches.find(m => m.variables.includes('size'));

      expect(variantMatch).toBeDefined();
      expect(sizeMatch).toBeDefined();
    });

    it('handles bsPrefix prefix pattern', () => {
      const content = `<Alert className={\`\${bsPrefix} \${bsPrefix}-\${variant}\`}>`;
      const matches = extractClassPatterns(content);

      expect(matches).toHaveLength(1);
      expect(matches[0]!.variables).toContain('bsPrefix');
      expect(matches[0]!.variables).toContain('variant');
    });
  });

  describe('edge cases', () => {
    it('ignores non-template className strings', () => {
      const content = `<div className="static-class">`;
      const matches = extractClassPatterns(content);

      expect(matches).toHaveLength(0);
    });

    it('ignores template literals without expressions', () => {
      const content = `<div className={\`static-class\`}>`;
      const matches = extractClassPatterns(content);

      expect(matches).toHaveLength(0);
    });

    it('handles complex variable expressions', () => {
      const content = `<div className={\`btn-\${props.size || 'md'}\`}>`;
      const matches = extractClassPatterns(content);

      expect(matches).toHaveLength(1);
      expect(matches[0]!.variables).toContain("props.size || 'md'");
    });

    it('handles nested template literals', () => {
      const content = `<div className={clsx(\`outer-\${type}\`, inner && \`inner-\${inner}\`)}>`;
      const matches = extractClassPatterns(content);

      // Should find both patterns
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('analyzePatternForTokens', () => {
  it('identifies variant patterns with high confidence', () => {
    const match: ClassPatternMatch = {
      pattern: '${bsPrefix}-${variant}',
      structure: '{bsPrefix}-{variant}',
      variables: ['bsPrefix', 'variant'],
      staticParts: ['-'],
      line: 1,
      column: 1,
      context: 'template-literal',
    };

    const analysis = analyzePatternForTokens(match);

    expect(analysis.potentialTokenType).toBe('variant');
    expect(analysis.confidence).toBe('high');
  });

  it('identifies size patterns with high confidence', () => {
    const match: ClassPatternMatch = {
      pattern: 'btn-${size}',
      structure: 'btn-{size}',
      variables: ['size'],
      staticParts: ['btn-'],
      line: 1,
      column: 1,
      context: 'template-literal',
    };

    const analysis = analyzePatternForTokens(match);

    expect(analysis.potentialTokenType).toBe('size');
    expect(analysis.confidence).toBe('high');
  });

  it('identifies color patterns with high confidence', () => {
    const match: ClassPatternMatch = {
      pattern: 'text-${color}',
      structure: 'text-{color}',
      variables: ['color'],
      staticParts: ['text-'],
      line: 1,
      column: 1,
      context: 'template-literal',
    };

    const analysis = analyzePatternForTokens(match);

    expect(analysis.potentialTokenType).toBe('color');
    expect(analysis.confidence).toBe('high');
  });

  it('identifies type variables as variant with high confidence', () => {
    // 'type' is a common pattern for variants, similar to 'variant'
    const match: ClassPatternMatch = {
      pattern: 'btn-${type}',
      structure: 'btn-{type}',
      variables: ['type'],
      staticParts: ['btn-'],
      line: 1,
      column: 1,
      context: 'template-literal',
    };

    const analysis = analyzePatternForTokens(match);

    expect(analysis.potentialTokenType).toBe('variant');
    expect(analysis.confidence).toBe('high');
  });

  it('identifies button patterns with medium confidence from static parts', () => {
    // When variable name is generic (like 'foo'), we fall back to static parts
    const match: ClassPatternMatch = {
      pattern: 'btn-${foo}',
      structure: 'btn-{foo}',
      variables: ['foo'],
      staticParts: ['btn-'],
      line: 1,
      column: 1,
      context: 'template-literal',
    };

    const analysis = analyzePatternForTokens(match);

    expect(analysis.potentialTokenType).toBe('variant');
    expect(analysis.confidence).toBe('medium');
  });

  it('returns unknown for unrecognized patterns', () => {
    const match: ClassPatternMatch = {
      pattern: 'custom-${foo}',
      structure: 'custom-{foo}',
      variables: ['foo'],
      staticParts: ['custom-'],
      line: 1,
      column: 1,
      context: 'template-literal',
    };

    const analysis = analyzePatternForTokens(match);

    expect(analysis.potentialTokenType).toBe('unknown');
    expect(analysis.confidence).toBe('low');
  });
});
