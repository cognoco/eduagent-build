import { buildPracticeActivityDedupeKey } from './practice-activity-events';

describe('buildPracticeActivityDedupeKey', () => {
  it('builds a key from type, sourceType, and sourceId', () => {
    const key = buildPracticeActivityDedupeKey({
      activityType: 'quiz',
      sourceType: 'topic',
      sourceId: 'topic-123',
    });
    expect(key).toBe(
      'activity=quiz|sourceType=topic|subtype=null|sourceId=topic-123|occurrence=null',
    );
  });

  it('appends subtype when activitySubtype is provided', () => {
    const key = buildPracticeActivityDedupeKey({
      activityType: 'quiz',
      activitySubtype: 'multiple_choice',
      sourceType: 'topic',
      sourceId: 'topic-123',
    });
    expect(key).toBe(
      'activity=quiz|sourceType=topic|subtype=value(multiple_choice)|sourceId=topic-123|occurrence=null',
    );
  });

  it('omits subtype segment when activitySubtype is null', () => {
    const key = buildPracticeActivityDedupeKey({
      activityType: 'quiz',
      activitySubtype: null,
      sourceType: 'topic',
      sourceId: 'topic-123',
    });
    expect(key).toBe(
      'activity=quiz|sourceType=topic|subtype=null|sourceId=topic-123|occurrence=null',
    );
  });

  it('appends occurrenceKey when provided', () => {
    const key = buildPracticeActivityDedupeKey({
      activityType: 'review',
      sourceType: 'book',
      sourceId: 'book-456',
      occurrenceKey: 'session-789',
    });
    expect(key).toBe(
      'activity=review|sourceType=book|subtype=null|sourceId=book-456|occurrence=value(session-789)',
    );
  });

  it('includes both subtype and occurrenceKey when both are provided', () => {
    const key = buildPracticeActivityDedupeKey({
      activityType: 'dictation',
      activitySubtype: 'sentence',
      sourceType: 'topic',
      sourceId: 'topic-abc',
      occurrenceKey: 'occ-1',
    });
    expect(key).toBe(
      'activity=dictation|sourceType=topic|subtype=value(sentence)|sourceId=topic-abc|occurrence=value(occ-1)',
    );
  });

  it('omits occurrenceKey segment when occurrenceKey is null', () => {
    const key = buildPracticeActivityDedupeKey({
      activityType: 'quiz',
      sourceType: 'topic',
      sourceId: 'topic-123',
      occurrenceKey: null,
    });
    expect(key).toBe(
      'activity=quiz|sourceType=topic|subtype=null|sourceId=topic-123|occurrence=null',
    );
  });

  it('keeps sourceType and subtype boundaries explicit when values contain colons', () => {
    const key = buildPracticeActivityDedupeKey({
      activityType: 'quiz',
      activitySubtype: 'b:c',
      sourceType: 'a:b',
      sourceId: 'topic-123',
    });

    expect(key).toBe(
      'activity=quiz|sourceType=a%3Ab|subtype=value(b%3Ac)|sourceId=topic-123|occurrence=null',
    );
  });

  // [BUG-285] Recitation and fluency_drill events are both written from the
  // session-exchange flow. They previously used inconsistent key shapes
  // (recitation used a hand-rolled colon-joined key, fluency_drill used the
  // canonical builder). Both must now build through the same canonical format
  // so duplicate inserts dedupe correctly and operators can grep one shape.
  it('builds the same key shape for recitation and fluency_drill session events', () => {
    const recitation = buildPracticeActivityDedupeKey({
      activityType: 'recitation',
      activitySubtype: 'recitation',
      sourceType: 'session_event',
      sourceId: 'event-1',
    });
    const fluencyDrill = buildPracticeActivityDedupeKey({
      activityType: 'fluency_drill',
      activitySubtype: 'language',
      sourceType: 'session_event',
      sourceId: 'event-1',
    });

    // Both keys share the canonical pipe-delimited `activity=...|sourceType=...|subtype=...|sourceId=...|occurrence=...` format.
    expect(recitation).toMatch(
      /^activity=recitation\|sourceType=session_event\|subtype=value\(recitation\)\|sourceId=event-1\|occurrence=null$/,
    );
    expect(fluencyDrill).toMatch(
      /^activity=fluency_drill\|sourceType=session_event\|subtype=value\(language\)\|sourceId=event-1\|occurrence=null$/,
    );
  });
});
