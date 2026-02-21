import { formatMathContent } from './math-format';

describe('formatMathContent', () => {
  describe('passthrough', () => {
    it('returns plain text unchanged', () => {
      expect(formatMathContent('Hello world')).toBe('Hello world');
    });

    it('returns empty string unchanged', () => {
      expect(formatMathContent('')).toBe('');
    });

    it('preserves text with no math delimiters', () => {
      const text = 'The answer is 42. Try again!';
      expect(formatMathContent(text)).toBe(text);
    });
  });

  describe('superscripts', () => {
    it('converts x^2 inside dollar signs', () => {
      expect(formatMathContent('$x^2$')).toBe('x\u00B2');
    });

    it('converts braced exponents', () => {
      expect(formatMathContent('$x^{23}$')).toBe('x\u00B2\u00B3');
    });

    it('converts n exponent', () => {
      expect(formatMathContent('$x^{n}$')).toBe('x\u207F');
    });

    it('falls back for unmapped characters', () => {
      expect(formatMathContent('$x^{a}$')).toBe('x^a');
    });
  });

  describe('subscripts', () => {
    it('converts x_2 inside dollar signs', () => {
      expect(formatMathContent('$x_2$')).toBe('x\u2082');
    });

    it('converts braced subscripts', () => {
      expect(formatMathContent('$a_{12}$')).toBe('a\u2081\u2082');
    });

    it('converts n subscript', () => {
      expect(formatMathContent('$x_{n}$')).toBe('x\u2099');
    });
  });

  describe('fractions', () => {
    it('converts simple fraction', () => {
      expect(formatMathContent('$\\frac{1}{2}$')).toBe('1/2');
    });

    it('converts fraction with expressions', () => {
      expect(formatMathContent('$\\frac{a+b}{c}$')).toBe('a+b/c');
    });
  });

  describe('symbols', () => {
    it('converts pi', () => {
      expect(formatMathContent('$\\pi$')).toBe('\u03C0');
    });

    it('converts alpha', () => {
      expect(formatMathContent('$\\alpha$')).toBe('\u03B1');
    });

    it('converts theta', () => {
      expect(formatMathContent('$\\theta$')).toBe('\u03B8');
    });

    it('converts pm', () => {
      expect(formatMathContent('$\\pm$')).toBe('\u00B1');
    });

    it('converts times', () => {
      expect(formatMathContent('$\\times$')).toBe('\u00D7');
    });

    it('converts div', () => {
      expect(formatMathContent('$\\div$')).toBe('\u00F7');
    });

    it('converts leq and geq', () => {
      expect(formatMathContent('$\\leq$')).toBe('\u2264');
      expect(formatMathContent('$\\geq$')).toBe('\u2265');
    });

    it('converts neq', () => {
      expect(formatMathContent('$\\neq$')).toBe('\u2260');
    });

    it('converts approx', () => {
      expect(formatMathContent('$\\approx$')).toBe('\u2248');
    });

    it('converts infty', () => {
      expect(formatMathContent('$\\infty$')).toBe('\u221E');
    });

    it('converts sqrt with braces', () => {
      expect(formatMathContent('$\\sqrt{x}$')).toBe('\u221A(x)');
    });

    it('converts sqrt without braces', () => {
      expect(formatMathContent('$\\sqrt2$')).toBe('\u221A2');
    });

    it('converts sum and int', () => {
      expect(formatMathContent('$\\sum$')).toBe('\u2211');
      expect(formatMathContent('$\\int$')).toBe('\u222B');
    });

    it('converts arrows', () => {
      expect(formatMathContent('$\\rightarrow$')).toBe('\u2192');
      expect(formatMathContent('$\\leftarrow$')).toBe('\u2190');
      expect(formatMathContent('$\\Rightarrow$')).toBe('\u21D2');
    });

    it('converts cdot', () => {
      expect(formatMathContent('$\\cdot$')).toBe('\u00B7');
    });

    it('converts set notation', () => {
      expect(formatMathContent('$\\in$')).toBe('\u2208');
      expect(formatMathContent('$\\subset$')).toBe('\u2282');
      expect(formatMathContent('$\\cup$')).toBe('\u222A');
    });
  });

  describe('compound expressions', () => {
    it('converts quadratic formula pattern', () => {
      const input = '$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$';
      const result = formatMathContent(input);
      expect(result).toBe('x = -b \u00B1 \u221A(b\u00B2 - 4ac)/2a');
    });

    it('converts polynomial', () => {
      expect(formatMathContent('$x^2 + 3x + 1$')).toBe('x\u00B2 + 3x + 1');
    });

    it('converts expression with subscript and superscript', () => {
      expect(formatMathContent('$a_{1} + a_{2} = a_{3}$')).toBe(
        'a\u2081 + a\u2082 = a\u2083'
      );
    });
  });

  describe('mixed content', () => {
    it('formats math within surrounding text', () => {
      const input = 'The answer is $x^2 + 3x + 1$ and that is final.';
      const result = formatMathContent(input);
      expect(result).toBe('The answer is x\u00B2 + 3x + 1 and that is final.');
    });

    it('formats multiple math segments', () => {
      const input = 'We know $a^2$ and $b^2$ so $a^2 + b^2 = c^2$';
      const result = formatMathContent(input);
      expect(result).toBe(
        'We know a\u00B2 and b\u00B2 so a\u00B2 + b\u00B2 = c\u00B2'
      );
    });

    it('handles no math in long text', () => {
      const text = 'This is a sentence about math but has no LaTeX in it.';
      expect(formatMathContent(text)).toBe(text);
    });
  });

  describe('display math ($$)', () => {
    it('converts display math delimiters', () => {
      expect(formatMathContent('$$x^2$$')).toBe('x\u00B2');
    });

    it('converts display math with symbols', () => {
      expect(formatMathContent('$$\\sum x_{i}$$')).toBe('\u2211 x\u1D62');
    });
  });

  describe('unknown commands', () => {
    it('strips backslash from unknown commands', () => {
      expect(formatMathContent('$\\foo$')).toBe('foo');
    });

    it('handles mix of known and unknown', () => {
      expect(formatMathContent('$\\pi + \\bar{x}$')).toBe('\u03C0 + bar{x}');
    });
  });
});
