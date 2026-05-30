import { getTimeZoneOffsetMs, getStartOfTodayInTimeZone } from './timezone';

describe('billing/timezone', () => {
  describe('getTimeZoneOffsetMs', () => {
    it('returns 0 for UTC', () => {
      const instant = new Date('2026-05-30T12:00:00Z');
      expect(getTimeZoneOffsetMs(instant, 'UTC')).toBe(0);
    });

    it('returns +1h for Europe/Berlin in winter (CET)', () => {
      const instant = new Date('2026-01-15T12:00:00Z');
      expect(getTimeZoneOffsetMs(instant, 'Europe/Berlin')).toBe(
        60 * 60 * 1000,
      );
    });

    it('returns +2h for Europe/Berlin in summer (CEST)', () => {
      const instant = new Date('2026-07-15T12:00:00Z');
      expect(getTimeZoneOffsetMs(instant, 'Europe/Berlin')).toBe(
        2 * 60 * 60 * 1000,
      );
    });

    it('returns -5h for America/New_York in winter (EST)', () => {
      const instant = new Date('2026-01-15T12:00:00Z');
      expect(getTimeZoneOffsetMs(instant, 'America/New_York')).toBe(
        -5 * 60 * 60 * 1000,
      );
    });
  });

  describe('getStartOfTodayInTimeZone', () => {
    it('returns the same UTC midnight when the zone is UTC', () => {
      const now = new Date('2026-05-30T12:34:56Z');
      const start = getStartOfTodayInTimeZone(now, 'UTC');
      expect(start.toISOString()).toBe('2026-05-30T00:00:00.000Z');
    });

    it('resolves to the prior UTC day for Asia/Tokyo morning hours', () => {
      // 2026-05-30 03:00 UTC is 2026-05-30 12:00 in Tokyo; start-of-day
      // in Tokyo (UTC+9) is 2026-05-29T15:00Z.
      const now = new Date('2026-05-30T03:00:00Z');
      const start = getStartOfTodayInTimeZone(now, 'Asia/Tokyo');
      expect(start.toISOString()).toBe('2026-05-29T15:00:00.000Z');
    });

    it('returns the local midnight for Europe/Berlin in winter', () => {
      // Mid-day 2026-01-15 in Berlin (CET = UTC+1). Start of day is
      // 2026-01-15T00:00 local = 2026-01-14T23:00Z.
      const now = new Date('2026-01-15T12:00:00Z');
      const start = getStartOfTodayInTimeZone(now, 'Europe/Berlin');
      expect(start.toISOString()).toBe('2026-01-14T23:00:00.000Z');
    });

    it('returns the local midnight for Europe/Berlin in summer (DST)', () => {
      // Mid-day 2026-07-15 in Berlin (CEST = UTC+2). Start of day is
      // 2026-07-15T00:00 local = 2026-07-14T22:00Z.
      const now = new Date('2026-07-15T12:00:00Z');
      const start = getStartOfTodayInTimeZone(now, 'Europe/Berlin');
      expect(start.toISOString()).toBe('2026-07-14T22:00:00.000Z');
    });
  });
});
