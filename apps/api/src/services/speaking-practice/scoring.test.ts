import { scoreSpeakingPracticeAttempt } from './scoring';

describe('scoreSpeakingPracticeAttempt', () => {
  it('scores an exact repeat as complete with no missing/extra words', () => {
    const result = scoreSpeakingPracticeAttempt(
      'I would like a cup of tea.',
      'I would like a cup of tea',
    );
    expect(result).toEqual({
      lexicalMatchScore: 1,
      missingWords: [],
      extraWords: [],
      isComplete: true,
    });
  });

  it('reports missing words when the learner drops words', () => {
    const result = scoreSpeakingPracticeAttempt(
      'I would like a cup of tea.',
      'I like cup tea',
    );
    expect(result.missingWords).toEqual(['would', 'a', 'of']);
    expect(result.isComplete).toBe(false);
    expect(result.lexicalMatchScore).toBeCloseTo(4 / 7);
  });

  it('reports extra words the learner said that are not in the target', () => {
    const result = scoreSpeakingPracticeAttempt(
      'I like tea.',
      'I really like tea a lot',
    );
    expect(result.missingWords).toEqual([]);
    expect(result.extraWords.sort()).toEqual(['a', 'lot', 'really'].sort());
    expect(result.isComplete).toBe(true);
    expect(result.lexicalMatchScore).toBe(1);
  });

  it('is case-insensitive', () => {
    const result = scoreSpeakingPracticeAttempt('Hello There', 'HELLO there');
    expect(result.isComplete).toBe(true);
  });

  it('ignores punctuation differences', () => {
    const result = scoreSpeakingPracticeAttempt(
      "I'd like tea, please!",
      "I'd like tea please",
    );
    expect(result.isComplete).toBe(true);
    expect(result.missingWords).toEqual([]);
  });

  it('folds diacritics so accented and unaccented forms match (explicit leniency decision)', () => {
    const result = scoreSpeakingPracticeAttempt(
      'Me gusta el café.',
      'Me gusta el cafe',
    );
    expect(result.isComplete).toBe(true);
    expect(result.missingWords).toEqual([]);
  });

  it('is order-insensitive (multiset diff, not sequence match)', () => {
    const result = scoreSpeakingPracticeAttempt(
      'a big red house',
      'house red big a',
    );
    expect(result.isComplete).toBe(true);
    expect(result.missingWords).toEqual([]);
    expect(result.extraWords).toEqual([]);
  });

  it('handles an empty transcript as fully missing', () => {
    const result = scoreSpeakingPracticeAttempt('I like tea.', '');
    expect(result.missingWords).toEqual(['i', 'like', 'tea']);
    expect(result.isComplete).toBe(false);
    expect(result.lexicalMatchScore).toBe(0);
  });

  it('treats an empty/whitespace-only target as scoring 0 with no crash', () => {
    const result = scoreSpeakingPracticeAttempt('   ', 'anything');
    expect(result).toEqual({
      lexicalMatchScore: 0,
      missingWords: [],
      extraWords: ['anything'],
      isComplete: false,
    });
  });

  it('preserves word multiplicity — a repeated target word requires a repeated match', () => {
    const result = scoreSpeakingPracticeAttempt('no no no stop', 'no stop');
    expect(result.missingWords).toEqual(['no', 'no']);
    expect(result.isComplete).toBe(false);
  });

  it('does not let a repeated heard word silently satisfy multiple distinct target words', () => {
    // Regression against a dedup-based scorer: "tea tea" heard against a
    // target with only one "tea" must not consume more than the one match.
    const result = scoreSpeakingPracticeAttempt('I like tea', 'tea tea');
    expect(result.missingWords).toEqual(['i', 'like']);
    expect(result.extraWords).toEqual(['tea']);
  });
});
