import { detectMilestones } from './milestone-detection';

type DetectedMilestone = ReturnType<typeof detectMilestones>[number];
import type { ProgressMetrics } from '@eduagent/schemas';

function makeMetrics(
  overrides: Partial<ProgressMetrics> = {},
): ProgressMetrics {
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
    ...overrides,
  };
}

describe('milestone thresholds (lowered)', () => {
  const profileId = 'profile-123';

  it('fires session_count milestone at threshold 1', () => {
    const previous = makeMetrics({ totalSessions: 0 });
    const current = makeMetrics({ totalSessions: 1 });

    const milestones = detectMilestones(profileId, previous, current);

    expect(milestones).toContainEqual(
      expect.objectContaining({
        milestoneType: 'session_count',
        threshold: 1,
      }),
    );
  });

  it('fires session_count milestone at threshold 3', () => {
    const previous = makeMetrics({ totalSessions: 2 });
    const current = makeMetrics({ totalSessions: 3 });

    const milestones = detectMilestones(profileId, previous, current);

    expect(milestones).toContainEqual(
      expect.objectContaining({
        milestoneType: 'session_count',
        threshold: 3,
      }),
    );
  });

  it('fires topic_mastered_count milestone at threshold 1', () => {
    const previous = makeMetrics({ topicsMastered: 0 });
    const current = makeMetrics({ topicsMastered: 1 });

    const milestones = detectMilestones(profileId, previous, current);

    expect(milestones).toContainEqual(
      expect.objectContaining({
        milestoneType: 'topic_mastered_count',
        threshold: 1,
      }),
    );
  });

  it('fires book_completed milestone at threshold 1', () => {
    const previous = makeMetrics({ booksCompleted: 0 });
    const current = makeMetrics({ booksCompleted: 1 });

    const milestones = detectMilestones(profileId, previous, current);

    expect(milestones).toContainEqual(
      expect.objectContaining({
        milestoneType: 'book_completed',
        threshold: 1,
      }),
    );
  });

  it('does not fire book_completed when the completed book count is unchanged', () => {
    const previous = makeMetrics({ booksCompleted: 1 });
    const current = makeMetrics({ booksCompleted: 1 });

    const milestones = detectMilestones(profileId, previous, current);

    expect(
      milestones.filter(
        (m: DetectedMilestone) => m.milestoneType === 'book_completed',
      ),
    ).toHaveLength(0);
  });

  it('does not fire book_completed when the completed book count decreases', () => {
    const previous = makeMetrics({ booksCompleted: 1 });
    const current = makeMetrics({ booksCompleted: 0 });

    const milestones = detectMilestones(profileId, previous, current);

    expect(
      milestones.filter(
        (m: DetectedMilestone) => m.milestoneType === 'book_completed',
      ),
    ).toHaveLength(0);
  });

  it('fires streak_length milestone at threshold 3', () => {
    const previous = makeMetrics({ currentStreak: 2 });
    const current = makeMetrics({ currentStreak: 3 });

    const milestones = detectMilestones(profileId, previous, current);

    expect(milestones).toContainEqual(
      expect.objectContaining({
        milestoneType: 'streak_length',
        threshold: 3,
      }),
    );
  });

  it('fires vocabulary_count milestone at threshold 5', () => {
    const previous = makeMetrics({ vocabularyTotal: 4 });
    const current = makeMetrics({ vocabularyTotal: 5 });

    const milestones = detectMilestones(profileId, previous, current);

    expect(milestones).toContainEqual(
      expect.objectContaining({
        milestoneType: 'vocabulary_count',
        threshold: 5,
      }),
    );
  });

  it('does not duplicate milestone at old threshold 10 for existing profiles', () => {
    const previous = makeMetrics({ totalSessions: 8 });
    const current = makeMetrics({ totalSessions: 9 });

    const milestones = detectMilestones(profileId, previous, current);

    // No session_count milestone at 9 — thresholds are 1,3,5,10,...
    expect(
      milestones.filter(
        (m: DetectedMilestone) => m.milestoneType === 'session_count',
      ),
    ).toHaveLength(0);
  });

  it('fires first-session milestone from null previousMetrics', () => {
    const current = makeMetrics({ totalSessions: 1 });

    const milestones = detectMilestones(profileId, null, current);

    expect(milestones).toContainEqual(
      expect.objectContaining({
        milestoneType: 'session_count',
        threshold: 1,
      }),
    );
  });
});
