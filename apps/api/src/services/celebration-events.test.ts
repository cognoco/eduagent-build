import { buildCelebrationDedupeKey } from './celebration-events';

describe('buildCelebrationDedupeKey', () => {
  it('builds a key from celebration type, reason, and sourceId', () => {
    const key = buildCelebrationDedupeKey({
      celebrationType: 'comet',
      reason: 'topic_mastered',
      sourceId: 'topic-123',
    });

    expect(key).toBe('comet:topic_mastered:topic-123');
  });

  it('uses none when sourceId is null', () => {
    const key = buildCelebrationDedupeKey({
      celebrationType: 'polar_star',
      reason: 'polar_star',
      sourceId: null,
    });

    expect(key).toBe('polar_star:polar_star:none');
  });

  it('uses none when sourceId is omitted', () => {
    const key = buildCelebrationDedupeKey({
      celebrationType: 'orions_belt',
      reason: 'curriculum_complete',
    });

    expect(key).toBe('orions_belt:curriculum_complete:none');
  });
});
