import { isLocalHour9 } from './weekly-progress-push';

describe('weekly-progress-push isLocalHour9 (BUG-640 / J-4)', () => {
  // Helper: count how many of the 24 Monday-UTC hours match for a TZ.
  // Picks a Monday well clear of DST transitions: 2026-04-13 (Mon).
  function fireCountForTimezone(timezone: string | null): number {
    let fires = 0;
    for (let h = 0; h < 24; h += 1) {
      const utc = new Date(Date.UTC(2026, 3, 13, h, 0, 0));
      if (isLocalHour9(timezone, utc)) fires += 1;
    }
    return fires;
  }

  it('fires for each parent exactly once across the 24 Monday-UTC hours', () => {
    const timezones = [
      null,
      'UTC',
      'Europe/London',
      'Europe/Prague',
      'America/New_York',
      'America/Los_Angeles',
      'Asia/Tokyo',
      'Australia/Sydney',
      'Pacific/Auckland',
      'Asia/Kolkata',
    ];
    for (const tz of timezones) {
      expect({ tz, fires: fireCountForTimezone(tz) }).toEqual({
        tz,
        fires: 1,
      });
    }
  });

  it('null timezone falls back to UTC 09:00', () => {
    expect(isLocalHour9(null, new Date(Date.UTC(2026, 3, 13, 9, 0, 0)))).toBe(
      true
    );
    expect(isLocalHour9(null, new Date(Date.UTC(2026, 3, 13, 8, 0, 0)))).toBe(
      false
    );
  });

  it('invalid timezone string falls back to UTC 09:00 (no crash)', () => {
    expect(
      isLocalHour9('Not/AReal_TZ', new Date(Date.UTC(2026, 3, 13, 9, 0, 0)))
    ).toBe(true);
  });

  it('Europe/Prague (UTC+2 DST) matches at 07:00 UTC on a DST Monday', () => {
    // 2026-04-13 is in CEST (UTC+2). Local 09:00 → UTC 07:00.
    expect(
      isLocalHour9('Europe/Prague', new Date(Date.UTC(2026, 3, 13, 7, 0, 0)))
    ).toBe(true);
    expect(
      isLocalHour9('Europe/Prague', new Date(Date.UTC(2026, 3, 13, 9, 0, 0)))
    ).toBe(false);
  });
});
