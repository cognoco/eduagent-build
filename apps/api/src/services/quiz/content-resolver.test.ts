import { QUIZ_CONFIG } from './config';
import { resolveRoundContent } from './content-resolver';

describe('resolveRoundContent', () => {
  const baseParams = {
    activityType: 'capitals' as const,
    profileId: 'profile-1',
    recentAnswers: [] as string[],
    libraryItems: [],
  };

  it('returns all discovery slots when library is empty', () => {
    const plan = resolveRoundContent(baseParams);

    expect(plan.discoveryCount).toBe(
      QUIZ_CONFIG.perActivity.capitals.roundSize
    );
    expect(plan.masteryItems).toEqual([]);
    expect(plan.totalQuestions).toBe(
      QUIZ_CONFIG.perActivity.capitals.roundSize
    );
  });

  it('returns all discovery when library items are below minimum', () => {
    const plan = resolveRoundContent({
      ...baseParams,
      libraryItems: [
        { id: '1', question: 'France', answer: 'Paris' },
        { id: '2', question: 'Germany', answer: 'Berlin' },
      ],
    });

    expect(plan.masteryItems).toEqual([]);
    expect(plan.discoveryCount).toBe(
      QUIZ_CONFIG.perActivity.capitals.roundSize
    );
  });

  it('includes mastery items when library meets minimum', () => {
    const libraryItems = Array.from({ length: 5 }, (_, i) => ({
      id: `item-${i}`,
      question: `Country ${i}`,
      answer: `Capital ${i}`,
    }));

    const plan = resolveRoundContent({
      ...baseParams,
      libraryItems,
    });

    expect(plan.masteryItems.length).toBe(2);
    expect(plan.discoveryCount).toBe(6);
    expect(plan.totalQuestions).toBe(8);
  });

  it('scales up mastery ratio when many due items', () => {
    const libraryItems = Array.from({ length: 25 }, (_, i) => ({
      id: `item-${i}`,
      question: `Country ${i}`,
      answer: `Capital ${i}`,
    }));

    const plan = resolveRoundContent({
      ...baseParams,
      libraryItems,
    });

    expect(plan.masteryItems.length).toBe(2);
  });

  it('uses the vocabulary-specific mastery ratio for mature review banks', () => {
    const libraryItems = Array.from({ length: 40 }, (_, i) => ({
      id: `item-${i}`,
      question: `Term ${i}`,
      answer: `Translation ${i}`,
      vocabularyId: `vocab-${i}`,
    }));

    const plan = resolveRoundContent({
      ...baseParams,
      activityType: 'vocabulary',
      libraryItems,
    });

    expect(plan.masteryItems.length).toBeGreaterThanOrEqual(3);
    expect(plan.discoveryCount).toBeLessThanOrEqual(3);
    expect(plan.totalQuestions).toBe(
      QUIZ_CONFIG.perActivity.vocabulary.roundSize
    );
  });

  it('returns all discovery for vocabulary when nothing is due', () => {
    const plan = resolveRoundContent({
      ...baseParams,
      activityType: 'vocabulary',
      libraryItems: [],
    });

    expect(plan.masteryItems).toEqual([]);
    expect(plan.discoveryCount).toBe(
      QUIZ_CONFIG.perActivity.vocabulary.roundSize
    );
  });

  it('returns two mastery items when exactly two vocabulary reviews are due', () => {
    const plan = resolveRoundContent({
      ...baseParams,
      activityType: 'vocabulary',
      libraryItems: [
        { id: '1', question: 'der Hund', answer: 'dog', vocabularyId: '1' },
        { id: '2', question: 'die Katze', answer: 'cat', vocabularyId: '2' },
      ],
    });

    expect(plan.masteryItems).toHaveLength(2);
    expect(plan.discoveryCount).toBe(4);
  });

  it('filters recently seen answers from mastery candidates', () => {
    const libraryItems = Array.from({ length: 5 }, (_, i) => ({
      id: `item-${i}`,
      question: `Country ${i}`,
      answer: `Capital ${i}`,
    }));

    const plan = resolveRoundContent({
      ...baseParams,
      libraryItems,
      recentAnswers: ['Capital 0', 'Capital 1', 'Capital 2', 'Capital 3'],
    });

    expect(plan.masteryItems).toEqual([]);
    expect(plan.discoveryCount).toBe(
      QUIZ_CONFIG.perActivity.capitals.roundSize
    );
  });
});
