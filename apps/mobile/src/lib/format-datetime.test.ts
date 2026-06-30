import { formatMediumDateTime, formatShortDate } from './format-datetime';

describe('formatMediumDateTime (#11 Hermes ICU safety)', () => {
  const ISO = '2026-05-28T15:30:00.000Z';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns an empty string for an empty/undefined value', () => {
    expect(formatMediumDateTime(undefined)).toBe('');
    expect(formatMediumDateTime('')).toBe('');
  });

  it('returns the raw value for an unparseable date', () => {
    expect(formatMediumDateTime('not-a-date')).toBe('not-a-date');
  });

  it('formats a valid ISO date to a non-empty string', () => {
    const out = formatMediumDateTime(ISO);
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    // Must not echo the raw ISO string back when formatting succeeds.
    expect(out).not.toBe(ISO);
  });

  it('does NOT throw and falls back when Intl.DateTimeFormat throws (Hermes without full ICU)', () => {
    const spy = jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new RangeError('missing ICU data');
    });

    let out = '';
    expect(() => {
      out = formatMediumDateTime(ISO);
    }).not.toThrow();

    // Fell back to a non-empty, non-throwing representation of the date.
    expect(out.length).toBeGreaterThan(0);
    expect(spy).toHaveBeenCalled();
  });

  it('falls back to ISO when both Intl and toLocaleString throw', () => {
    jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new RangeError('missing ICU data');
    });
    jest.spyOn(Date.prototype, 'toLocaleString').mockImplementation(() => {
      throw new RangeError('missing ICU data');
    });

    expect(formatMediumDateTime(ISO)).toBe(new Date(ISO).toISOString());
  });
});

describe('formatShortDate', () => {
  const ISO = '2026-05-28T15:30:00.000Z';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the raw value for an unparseable date', () => {
    expect(formatShortDate('not-a-date', 'en')).toBe('not-a-date');
  });

  it('uses the caller locale with a medium date style', () => {
    const spy = jest.spyOn(Intl, 'DateTimeFormat');

    const out = formatShortDate(ISO, 'nb');

    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    expect(spy).toHaveBeenCalledWith('nb', { dateStyle: 'medium' });
  });

  it('ignores stale caller-supplied date options and always uses medium date style', () => {
    const spy = jest.spyOn(Intl, 'DateTimeFormat');
    const callWithStaleOptions = formatShortDate as unknown as (
      iso: string,
      locale?: string,
      options?: Intl.DateTimeFormatOptions,
    ) => string;

    callWithStaleOptions(ISO, 'en', { dateStyle: 'full' });

    expect(spy).toHaveBeenCalledWith('en', { dateStyle: 'medium' });
  });
});
