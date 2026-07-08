import type { Translate } from '../../../../i18n';
import { heroCopy } from './progress-hero-copy';

const fakeT = ((key: string) => key) as unknown as Translate;

describe('heroCopy', () => {
  it('child register with mastered topics + vocab → child mastered + words subtitle', () => {
    const result = heroCopy(
      { topicsMastered: 3, vocabularyTotal: 12, totalSessions: 8 },
      'child',
      fakeT,
    );
    expect(result.title).toBe('progress.register.child.masteredTopicsHero');
    expect(result.subtitle).toBe('progress.hero.masteredTopicsAndWords');
  });

  it('child register with mastered topics + zero vocab → growth subtitle', () => {
    const result = heroCopy(
      { topicsMastered: 3, vocabularyTotal: 0, totalSessions: 8 },
      'child',
      fakeT,
    );
    expect(result.title).toBe('progress.register.child.masteredTopicsHero');
    expect(result.subtitle).toBe('progress.register.child.growthSubtitle');
  });

  it('zero-mastery with sessions ≥ 1 → sessionsCompleted', () => {
    const result = heroCopy(
      { topicsMastered: 0, vocabularyTotal: 0, totalSessions: 3 },
      'owner',
      fakeT,
    );
    expect(result.title).toBe('progress.hero.sessionsCompleted');
    expect(result.subtitle).toBe('progress.hero.sessionsCompletedSubtitle');
  });

  it('low-mastery with sessions ≥ 5 → sessionsCompleted', () => {
    const result = heroCopy(
      { topicsMastered: 2, vocabularyTotal: 2, totalSessions: 6 },
      'owner',
      fakeT,
    );
    expect(result.title).toBe('progress.hero.sessionsCompleted');
    expect(result.subtitle).toBe('progress.hero.sessionsCompletedSubtitle');
  });

  it('vocab-only low (< 20) → buildingLanguage', () => {
    const result = heroCopy(
      { topicsMastered: 0, vocabularyTotal: 15, totalSessions: 4 },
      'owner',
      fakeT,
    );
    expect(result.title).toBe('progress.hero.buildingLanguage');
    expect(result.subtitle).toBe('progress.hero.buildingLanguageSubtitle');
  });

  it('vocab-only high (≥ 20) → knowWords', () => {
    const result = heroCopy(
      { topicsMastered: 0, vocabularyTotal: 25, totalSessions: 4 },
      'owner',
      fakeT,
    );
    expect(result.title).toBe('progress.hero.knowWords');
    expect(result.subtitle).toBe('progress.hero.knowWordsSubtitle');
  });

  it('topics-only low (< 20) → buildingKnowledge', () => {
    const result = heroCopy(
      { topicsMastered: 10, vocabularyTotal: 0, totalSessions: 4 },
      'owner',
      fakeT,
    );
    expect(result.title).toBe('progress.hero.buildingKnowledge');
    expect(result.subtitle).toBe('progress.hero.buildingKnowledgeSubtitle');
  });

  it('topics-only high (≥ 20) → masteredTopics', () => {
    const result = heroCopy(
      { topicsMastered: 25, vocabularyTotal: 0, totalSessions: 4 },
      'owner',
      fakeT,
    );
    expect(result.title).toBe('progress.hero.masteredTopics');
    expect(result.subtitle).toBe('progress.hero.masteredTopicsSubtitle');
  });

  it('both populated → masteredTopics + masteredTopicsAndWords', () => {
    const result = heroCopy(
      { topicsMastered: 30, vocabularyTotal: 30, totalSessions: 12 },
      'owner',
      fakeT,
    );
    expect(result.title).toBe('progress.hero.masteredTopics');
    expect(result.subtitle).toBe('progress.hero.masteredTopicsAndWords');
  });
});
