import { buildPracticeActivityDedupeKey } from './practice-activity-events';

describe('buildPracticeActivityDedupeKey', () => {
  it('builds a key from type, sourceType, and sourceId', () => {
    const key = buildPracticeActivityDedupeKey({
      activityType: 'quiz',
      sourceType: 'topic',
      sourceId: 'topic-123',
    });
    expect(key).toBe('quiz:topic:topic-123');
  });

  it('appends subtype when activitySubtype is provided', () => {
    const key = buildPracticeActivityDedupeKey({
      activityType: 'quiz',
      activitySubtype: 'multiple_choice',
      sourceType: 'topic',
      sourceId: 'topic-123',
    });
    expect(key).toBe('quiz:topic:multiple_choice:topic-123');
  });

  it('omits subtype segment when activitySubtype is null', () => {
    const key = buildPracticeActivityDedupeKey({
      activityType: 'quiz',
      activitySubtype: null,
      sourceType: 'topic',
      sourceId: 'topic-123',
    });
    expect(key).toBe('quiz:topic:topic-123');
  });

  it('appends occurrenceKey when provided', () => {
    const key = buildPracticeActivityDedupeKey({
      activityType: 'review',
      sourceType: 'book',
      sourceId: 'book-456',
      occurrenceKey: 'session-789',
    });
    expect(key).toBe('review:book:book-456:session-789');
  });

  it('includes both subtype and occurrenceKey when both are provided', () => {
    const key = buildPracticeActivityDedupeKey({
      activityType: 'dictation',
      activitySubtype: 'sentence',
      sourceType: 'topic',
      sourceId: 'topic-abc',
      occurrenceKey: 'occ-1',
    });
    expect(key).toBe('dictation:topic:sentence:topic-abc:occ-1');
  });

  it('omits occurrenceKey segment when occurrenceKey is null', () => {
    const key = buildPracticeActivityDedupeKey({
      activityType: 'quiz',
      sourceType: 'topic',
      sourceId: 'topic-123',
      occurrenceKey: null,
    });
    expect(key).toBe('quiz:topic:topic-123');
  });
});
