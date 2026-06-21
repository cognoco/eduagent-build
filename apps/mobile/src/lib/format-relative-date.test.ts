import {
  formatMinutes,
  formatRelativeDate,
  formatTimer,
  getDurationParts,
  getRelativeDateParts,
} from './format-relative-date';

describe('getRelativeDateParts', () => {
  const now = new Date(2026, 4, 29, 14, 0, 0); // 2026-05-29 14:00 local

  function at(year: number, month: number, day: number, hour = 12): string {
    return new Date(year, month, day, hour, 0, 0).toISOString();
  }

  it('returns today for the same calendar day', () => {
    expect(getRelativeDateParts(at(2026, 4, 29, 1), now)).toEqual({
      unit: 'today',
    });
    expect(getRelativeDateParts(at(2026, 4, 29, 23), now)).toEqual({
      unit: 'today',
    });
  });

  it('treats future dates as today', () => {
    expect(getRelativeDateParts(at(2026, 4, 30), now)).toEqual({
      unit: 'today',
    });
  });

  it('returns yesterday for one calendar day back', () => {
    expect(getRelativeDateParts(at(2026, 4, 28), now)).toEqual({
      unit: 'yesterday',
    });
  });

  it('returns days for 2–6 days back', () => {
    expect(getRelativeDateParts(at(2026, 4, 27), now)).toEqual({
      unit: 'days',
      value: 2,
    });
    expect(getRelativeDateParts(at(2026, 4, 23), now)).toEqual({
      unit: 'days',
      value: 6,
    });
  });

  it('returns lastWeek for 7–13 days back', () => {
    expect(getRelativeDateParts(at(2026, 4, 22), now)).toEqual({
      unit: 'lastWeek',
    });
    expect(getRelativeDateParts(at(2026, 4, 16), now)).toEqual({
      unit: 'lastWeek',
    });
  });

  it('returns weeks (2–4) for 14–29 days back', () => {
    expect(getRelativeDateParts(at(2026, 4, 15), now)).toEqual({
      unit: 'weeks',
      value: 2,
    });
    expect(getRelativeDateParts(at(2026, 4, 4), now)).toEqual({
      unit: 'weeks',
      value: 4,
    });
  });

  it('returns date for 30+ days back', () => {
    const iso = at(2026, 3, 1);
    expect(getRelativeDateParts(iso, now)).toEqual({ unit: 'date', iso });
  });

  it('returns a date part for an invalid iso', () => {
    expect(getRelativeDateParts('not-a-date', now)).toEqual({
      unit: 'date',
      iso: 'not-a-date',
    });
  });
});

describe('getDurationParts', () => {
  it('returns none for null, undefined, or non-positive', () => {
    expect(getDurationParts(null)).toEqual({ unit: 'none' });
    expect(getDurationParts(undefined)).toEqual({ unit: 'none' });
    expect(getDurationParts(0)).toEqual({ unit: 'none' });
    expect(getDurationParts(-5)).toEqual({ unit: 'none' });
  });

  it('returns under1 for sub-minute durations', () => {
    expect(getDurationParts(1)).toEqual({ unit: 'under1' });
    expect(getDurationParts(59)).toEqual({ unit: 'under1' });
  });

  it('returns minutes (rounded, min 1) below an hour', () => {
    expect(getDurationParts(60)).toEqual({ unit: 'minutes', value: 1 });
    expect(getDurationParts(89)).toEqual({ unit: 'minutes', value: 1 });
    expect(getDurationParts(90)).toEqual({ unit: 'minutes', value: 2 });
    expect(getDurationParts(45 * 60)).toEqual({ unit: 'minutes', value: 45 });
    expect(getDurationParts(59 * 60 + 20)).toEqual({
      unit: 'minutes',
      value: 59,
    });
  });

  it('returns hoursMinutes at or above an hour', () => {
    expect(getDurationParts(60 * 60)).toEqual({
      unit: 'hoursMinutes',
      hours: 1,
      minutes: 0,
    });
    expect(getDurationParts(2 * 60 * 60 + 10 * 60)).toEqual({
      unit: 'hoursMinutes',
      hours: 2,
      minutes: 10,
    });
  });
});

describe('formatTimer', () => {
  it('always zero-pads both sides to MM:SS', () => {
    expect(formatTimer(0)).toBe('00:00');
    expect(formatTimer(5)).toBe('00:05');
    expect(formatTimer(65)).toBe('01:05');
    expect(formatTimer(9 * 60 + 5)).toBe('09:05'); // single-digit minutes padded
    expect(formatTimer(125 * 60 + 42)).toBe('125:42'); // 3-digit minutes ok
  });

  it('floors fractional seconds and clamps negatives', () => {
    expect(formatTimer(65.9)).toBe('01:05');
    expect(formatTimer(-10)).toBe('00:00');
  });
});

describe('formatRelativeDate / formatMinutes', () => {
  it('formatRelativeDate uses the same 7-29 day buckets as getRelativeDateParts', () => {
    // Freeze the internal new Date() so the calendar-day diff is deterministic.
    jest.useFakeTimers().setSystemTime(new Date(2026, 4, 29, 14, 0, 0));
    expect(formatRelativeDate(new Date(2026, 4, 29).toISOString())).toBe(
      'Today',
    );
    expect(formatRelativeDate(new Date(2026, 4, 28).toISOString())).toBe(
      'Yesterday',
    );
    expect(formatRelativeDate(new Date(2026, 4, 26).toISOString())).toBe(
      '3 days ago',
    );
    expect(formatRelativeDate(new Date(2026, 4, 22).toISOString())).toBe(
      'last week',
    );
    expect(formatRelativeDate(new Date(2026, 4, 16).toISOString())).toBe(
      'last week',
    );
    expect(formatRelativeDate(new Date(2026, 4, 15).toISOString())).toBe(
      '2 weeks ago',
    );
    expect(formatRelativeDate(new Date(2026, 4, 0).toISOString())).toBe(
      '4 weeks ago',
    );
    expect(formatRelativeDate(new Date(2026, 1, 1).toISOString())).toBe('3mo');
    expect(formatRelativeDate(new Date(2024, 1, 1).toISOString())).toBe('2y');
    expect(formatRelativeDate('not-a-date')).toBe('');
    jest.useRealTimers();
  });

  it('formatMinutes keeps its min / Nh Nm output', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(130)).toBe('2h 10m');
    expect(formatMinutes(240)).toBe('4h');
  });
});
