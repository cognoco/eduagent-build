import { getLearningDayStart } from './learning-day';

describe('mentor notice shifted learning day', () => {
  it('places times before 04:00 into the previous local learning day', () => {
    expect(
      getLearningDayStart(
        new Date('2026-07-19T03:59:00.000Z'),
        'UTC',
      ).toISOString(),
    ).toBe('2026-07-18T04:00:00.000Z');
  });

  it('resolves the 04:00 boundary through a DST timezone', () => {
    expect(
      getLearningDayStart(
        new Date('2026-03-29T03:30:00.000Z'),
        'Europe/Oslo',
      ).toISOString(),
    ).toBe('2026-03-29T02:00:00.000Z');
  });

  it('falls back to UTC for invalid timezones', () => {
    expect(
      getLearningDayStart(
        new Date('2026-07-19T05:00:00.000Z'),
        'not/a-zone',
      ).toISOString(),
    ).toBe('2026-07-19T04:00:00.000Z');
  });
});
