import { generateWeeklyReportData } from './weekly-report';
import type { ProgressMetrics } from '@eduagent/schemas';

function metrics(over: Partial<ProgressMetrics>): ProgressMetrics {
  return {
    totalSessions: 0,
    totalActiveMinutes: 0,
    totalWallClockMinutes: 0,
    totalExchanges: 0,
    topicsAttempted: 0,
    topicsMastered: 0,
    topicsInProgress: 0,
    booksCompleted: 0,
    weeklyDeltaTopicsMastered: null,
    weeklyDeltaVocabularyTotal: null,
    weeklyDeltaTopicsExplored: null,
    vocabularyTotal: 0,
    vocabularyMastered: 0,
    vocabularyLearning: 0,
    vocabularyNew: 0,
    retentionCardsDue: 0,
    retentionCardsStrong: 0,
    retentionCardsFading: 0,
    currentStreak: 0,
    longestStreak: 0,
    subjects: [],
    ...over,
  };
}

describe('generateWeeklyReportData', () => {
  it('builds normal headline when there is real progress this week', () => {
    const result = generateWeeklyReportData(
      'Emma',
      '2026-04-27',
      metrics({ topicsMastered: 5, vocabularyTotal: 12 }),
      metrics({ topicsMastered: 2, vocabularyTotal: 8 }),
    );

    // vocabularyDelta=4, topicsMasteredDelta=3 -> Words learned wins
    expect(result.headlineStat.label).toBe('Words learned');
    expect(result.headlineStat.value).toBe(4);
    expect(result.headlineStat.comparison).toMatch(/up from 8 last week/);
  });

  // BUG-903 (a): When the week is fully zero AND last week was also fully
  // zero, "up from 0 last week" is meaningless. The comparison must read
  // as a friendly empty-state line, not a zero-diff.
  it('[BUG-903] emits a friendly empty-state comparison for a fully-quiet week', () => {
    const result = generateWeeklyReportData(
      'Emma',
      '2026-04-27',
      metrics({}),
      metrics({}),
    );

    expect(result.headlineStat.value).toBe(0);
    expect(result.headlineStat.comparison).not.toMatch(/up from 0 last week/);
    expect(result.headlineStat.comparison).toMatch(/No activity this week/i);
  });

  // BUG-903 (a): For a brand-new account with no last-week record, the
  // comparison should still be sensible (not "up from 0").
  it('[BUG-903] uses first-week framing when there is no prior week', () => {
    const result = generateWeeklyReportData(
      'Emma',
      '2026-04-27',
      metrics({}),
      null,
    );

    expect(result.headlineStat.value).toBe(0);
    expect(result.headlineStat.comparison).toMatch(/first week/i);
  });

  // BUG-903 (a): The fix is scoped to the both-zero case. When the prior
  // week had activity, "up from N last week" is preserved — the bug only
  // calls out the meaningless zero-vs-zero comparison.
  it('preserves up-from-N comparison when prior week had real activity', () => {
    const result = generateWeeklyReportData(
      'Emma',
      '2026-04-27',
      metrics({ topicsMastered: 1 }),
      metrics({ topicsMastered: 4, vocabularyTotal: 10 }),
    );

    // safeDelta clamps at 0 — this week mastered 0 new (relative). The
    // existing comparison string is the unchanged historical behavior.
    expect(result.headlineStat.comparison).toMatch(/last week/);
  });
});
