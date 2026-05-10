import { isGuessWhoFuzzyMatch, levenshteinDistance } from './quiz-utils.js';

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0);
  });

  it('returns length of other string when one is empty', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
  });

  it('returns 1 for single character difference', () => {
    expect(levenshteinDistance('cat', 'bat')).toBe(1);
    expect(levenshteinDistance('cat', 'ca')).toBe(1);
    expect(levenshteinDistance('cat', 'cats')).toBe(1);
  });

  it('handles transpositions as 2 edits', () => {
    expect(levenshteinDistance('Einstien', 'Einstein')).toBe(2);
  });

  it('handles completely different strings', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(3);
  });
});

describe('isGuessWhoFuzzyMatch', () => {
  const aliases = ['Newton', 'Sir Isaac Newton'];

  it('matches exact canonical name case-insensitively', () => {
    expect(isGuessWhoFuzzyMatch('Isaac Newton', 'Isaac Newton', aliases)).toBe(
      true,
    );
    expect(isGuessWhoFuzzyMatch('isaac newton', 'Isaac Newton', aliases)).toBe(
      true,
    );
  });

  it('matches exact alias', () => {
    expect(isGuessWhoFuzzyMatch('Newton', 'Isaac Newton', aliases)).toBe(true);
  });

  it('rejects empty input', () => {
    expect(isGuessWhoFuzzyMatch('', 'Isaac Newton', aliases)).toBe(false);
    expect(isGuessWhoFuzzyMatch('  ', 'Isaac Newton', aliases)).toBe(false);
  });

  it('accepts fuzzy match within scaled distance', () => {
    expect(
      isGuessWhoFuzzyMatch('Einstien', 'Albert Einstein', ['Einstein']),
    ).toBe(true);
  });

  it('accepts 1-edit substitution for short names', () => {
    expect(
      isGuessWhoFuzzyMatch('Bash', 'Johann Sebastian Bach', ['Bach']),
    ).toBe(true);
  });

  it('rejects 2-edit typo for short names', () => {
    expect(
      isGuessWhoFuzzyMatch('Bahc', 'Johann Sebastian Bach', ['Bach']),
    ).toBe(false);
  });

  it('accepts 2-edit typo for long names', () => {
    expect(
      isGuessWhoFuzzyMatch('Tchaikovski', 'Pyotr Ilyich Tchaikovsky', [
        'Tchaikovsky',
      ]),
    ).toBe(true);
  });

  it('rejects completely wrong answers', () => {
    expect(isGuessWhoFuzzyMatch('Mozart', 'Isaac Newton', aliases)).toBe(false);
  });

  it('rejects answers exceeding the distance threshold', () => {
    expect(isGuessWhoFuzzyMatch('Noton', 'Isaac Newton', ['Newton'])).toBe(
      false,
    );
  });

  it('accepts insertion typos within the threshold', () => {
    expect(isGuessWhoFuzzyMatch('Newtron', 'Isaac Newton', ['Newton'])).toBe(
      true,
    );
  });
});
