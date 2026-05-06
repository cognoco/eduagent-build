import {
  buildBackfillRowsForProfile,
  normalizeMemoryText,
} from './backfill-mapping';

describe('memory facts backfill mapping', () => {
  it('normalizes text with the same trim/lowercase semantics as legacy memory', () => {
    expect(normalizeMemoryText('  Fractions  ')).toBe('fractions');
  });

  it('maps all JSONB memory categories into fact rows', () => {
    const createdAt = new Date('2026-05-01T00:00:00.000Z');
    const result = buildBackfillRowsForProfile({
      profileId: '018f8f3e-0000-7000-8000-000000000001',
      strengths: [
        {
          subject: 'Math',
          topics: ['fractions'],
          confidence: 'high',
          source: 'inferred',
        },
      ],
      struggles: [
        {
          subject: 'Math',
          topic: 'division',
          lastSeen: '2026-04-30T12:00:00.000Z',
          attempts: 3,
          confidence: 'medium',
        },
      ],
      interests: ['space'],
      communicationNotes: ['prefers examples'],
      suppressedInferences: ['dinosaurs'],
      interestTimestamps: { space: '2026-04-29T10:00:00.000Z' },
      createdAt,
    });

    expect(result.malformed).toEqual([]);
    expect(result.rows.map((row) => row.category)).toEqual([
      'strength',
      'struggle',
      'interest',
      'communication_note',
      'suppressed',
    ]);
    expect(result.rows.find((row) => row.category === 'interest')).toEqual(
      expect.objectContaining({
        text: 'space',
        observedAt: new Date('2026-04-29T10:00:00.000Z'),
      })
    );
  });
});
