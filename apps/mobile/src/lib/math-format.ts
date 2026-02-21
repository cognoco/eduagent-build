/**
 * Lightweight LaTeX-to-Unicode converter for common math expressions.
 * Covers the most frequent patterns in math tutoring without external deps.
 * Full KaTeX/MathJax integration is a future enhancement.
 */

const SUPERSCRIPTS: Record<string, string> = {
  '0': '\u2070',
  '1': '\u00B9',
  '2': '\u00B2',
  '3': '\u00B3',
  '4': '\u2074',
  '5': '\u2075',
  '6': '\u2076',
  '7': '\u2077',
  '8': '\u2078',
  '9': '\u2079',
  n: '\u207F',
  i: '\u2071',
  '+': '\u207A',
  '-': '\u207B',
};

const SUBSCRIPTS: Record<string, string> = {
  '0': '\u2080',
  '1': '\u2081',
  '2': '\u2082',
  '3': '\u2083',
  '4': '\u2084',
  '5': '\u2085',
  '6': '\u2086',
  '7': '\u2087',
  '8': '\u2088',
  '9': '\u2089',
  n: '\u2099',
  i: '\u1D62',
};

const SYMBOL_MAP: Array<[RegExp, string]> = [
  [/\\sqrt\{([^}]+)\}/g, '\u221A($1)'],
  [/\\sqrt(\w)/g, '\u221A$1'],
  [/\\pm/g, '\u00B1'],
  [/\\times/g, '\u00D7'],
  [/\\div/g, '\u00F7'],
  [/\\leq/g, '\u2264'],
  [/\\geq/g, '\u2265'],
  [/\\neq/g, '\u2260'],
  [/\\approx/g, '\u2248'],
  [/\\infty/g, '\u221E'],
  [/\\pi/g, '\u03C0'],
  [/\\alpha/g, '\u03B1'],
  [/\\beta/g, '\u03B2'],
  [/\\gamma/g, '\u03B3'],
  [/\\delta/g, '\u03B4'],
  [/\\theta/g, '\u03B8'],
  [/\\lambda/g, '\u03BB'],
  [/\\mu/g, '\u03BC'],
  [/\\sigma/g, '\u03C3'],
  [/\\sum/g, '\u2211'],
  [/\\prod/g, '\u220F'],
  [/\\int/g, '\u222B'],
  [/\\rightarrow/g, '\u2192'],
  [/\\leftarrow/g, '\u2190'],
  [/\\Rightarrow/g, '\u21D2'],
  [/\\Leftarrow/g, '\u21D0'],
  [/\\cdot/g, '\u00B7'],
  [/\\ldots/g, '\u2026'],
  [/\\forall/g, '\u2200'],
  [/\\exists/g, '\u2203'],
  [/\\in/g, '\u2208'],
  [/\\notin/g, '\u2209'],
  [/\\subset/g, '\u2282'],
  [/\\supset/g, '\u2283'],
  [/\\cup/g, '\u222A'],
  [/\\cap/g, '\u2229'],
];

function toSuperscript(s: string): string {
  return s
    .split('')
    .map((c) => SUPERSCRIPTS[c] ?? `^${c}`)
    .join('');
}

function toSubscript(s: string): string {
  return s
    .split('')
    .map((c) => SUBSCRIPTS[c] ?? `_${c}`)
    .join('');
}

function formatExpression(expr: string): string {
  let result = expr.trim();

  // Fractions: \frac{a}{b} -> a/b (supports one level of nested braces)
  const braceGroup = '([^{}]*(?:\\{[^{}]*\\}[^{}]*)*)';
  result = result.replace(
    new RegExp(`\\\\frac\\{${braceGroup}\\}\\{${braceGroup}\\}`, 'g'),
    '$1/$2'
  );

  // Superscripts: x^{2n} or x^2
  result = result.replace(/\^{([^}]+)}/g, (_, exp: string) =>
    toSuperscript(exp)
  );
  result = result.replace(/\^(\d)/g, (_, exp: string) => toSuperscript(exp));

  // Subscripts: x_{2n} or x_2
  result = result.replace(/_{([^}]+)}/g, (_, sub: string) => toSubscript(sub));
  result = result.replace(/_(\d)/g, (_, sub: string) => toSubscript(sub));

  // Symbol replacements
  for (const [pattern, replacement] of SYMBOL_MAP) {
    result = result.replace(pattern, replacement);
  }

  // Clean remaining backslashes from unknown LaTeX commands
  result = result.replace(/\\([a-zA-Z]+)/g, '$1');

  return result;
}

export function formatMathContent(text: string): string {
  // Process display math ($$...$$) first, then inline ($...$)
  let result = text.replace(/\$\$([^$]+)\$\$/g, (_, expr: string) =>
    formatExpression(expr)
  );
  result = result.replace(/\$([^$]+)\$/g, (_, expr: string) =>
    formatExpression(expr)
  );

  return result;
}
