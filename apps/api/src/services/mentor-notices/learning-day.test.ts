import { getLearningDayStart } from './learning-day';

// Independent of the implementation under test: reads the local clock through
// Intl and expresses it as a comparable "civil milliseconds" number, so the
// assertions verify the local-04:00 property rather than re-deriving it the
// same way the production code does.
function localCivilMs(instant: Date, timeZone: string): number {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    })
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
    Number(values.fractionalSecond),
  );
}

function localFourAmOfSameDay(instant: Date, timeZone: string): number {
  const civil = new Date(localCivilMs(instant, timeZone));
  return Date.UTC(
    civil.getUTCFullYear(),
    civil.getUTCMonth(),
    civil.getUTCDate(),
    4,
  );
}

type Kind = 'exact' | 'gap' | 'fold';

const cases: Array<{
  name: string;
  instant: string;
  timeZone: string;
  expected: string;
  kind: Kind;
}> = [
  // No offset change — before / at / after the boundary.
  {
    name: 'before 04:00 uses the previous civil date',
    instant: '2026-07-19T03:59:00.000Z',
    timeZone: 'UTC',
    expected: '2026-07-18T04:00:00.000Z',
    kind: 'exact',
  },
  {
    name: 'exactly 04:00 uses the current civil date',
    instant: '2026-07-19T04:00:00.000Z',
    timeZone: 'UTC',
    expected: '2026-07-19T04:00:00.000Z',
    kind: 'exact',
  },
  {
    name: 'after 04:00 uses the current civil date',
    instant: '2026-07-19T12:00:00.000Z',
    timeZone: 'UTC',
    expected: '2026-07-19T04:00:00.000Z',
    kind: 'exact',
  },
  // Forward transition on the same civil day, but 04:00 itself exists.
  {
    name: 'forward transition earlier in the day (Europe/Oslo, +01 to +02)',
    instant: '2026-03-29T03:30:00.000Z',
    timeZone: 'Europe/Oslo',
    expected: '2026-03-29T02:00:00.000Z',
    kind: 'exact',
  },
  // Non-hour offsets.
  {
    name: 'non-hour fixed offset (Asia/Kathmandu, +05:45)',
    instant: '2026-07-19T05:00:00.000Z',
    timeZone: 'Asia/Kathmandu',
    expected: '2026-07-18T22:15:00.000Z',
    kind: 'exact',
  },
  {
    name: 'non-hour southern-hemisphere standard offset (Australia/Lord_Howe, +10:30)',
    instant: '2026-07-19T05:00:00.000Z',
    timeZone: 'Australia/Lord_Howe',
    expected: '2026-07-18T17:30:00.000Z',
    kind: 'exact',
  },
  {
    name: 'non-hour southern-hemisphere DST offset (Australia/Lord_Howe, +11)',
    instant: '2026-10-04T20:00:00.000Z',
    timeZone: 'Australia/Lord_Howe',
    expected: '2026-10-04T17:00:00.000Z',
    kind: 'exact',
  },
  {
    name: 'non-hour far-east offset (Pacific/Chatham, +12:45)',
    instant: '2026-07-19T05:00:00.000Z',
    timeZone: 'Pacific/Chatham',
    expected: '2026-07-18T15:15:00.000Z',
    kind: 'exact',
  },
  // Transition inside the four-hour lookback window — the reported symptom.
  {
    name: 'forward transition inside the four-hour lookback (America/Santiago, local 04:30)',
    instant: '2026-09-06T07:30:00.000Z',
    timeZone: 'America/Santiago',
    expected: '2026-09-06T07:00:00.000Z',
    kind: 'exact',
  },
  {
    name: 'before the boundary on a transition day (America/Santiago, local 03:00)',
    instant: '2026-09-06T06:00:00.000Z',
    timeZone: 'America/Santiago',
    expected: '2026-09-05T08:00:00.000Z',
    kind: 'exact',
  },
  // Local 04:00 skipped by a forward transition — first instant after the gap.
  {
    name: 'local 04:00 skipped by a one-hour gap (Asia/Baku, 2015 DST start at 04:00)',
    instant: '2015-03-29T02:00:00.000Z',
    timeZone: 'Asia/Baku',
    expected: '2015-03-29T00:00:00.000Z',
    kind: 'gap',
  },
  {
    name: 'local 04:00 skipped by a three-hour gap (Antarctica/Casey, +08 to +11)',
    instant: '2018-10-06T21:00:00.000Z',
    timeZone: 'Antarctica/Casey',
    expected: '2018-10-06T20:00:00.000Z',
    kind: 'gap',
  },
  // Local 04:00 folded by a backward transition — earlier of the two matches.
  {
    name: 'local 04:00 folded by a backward transition (Asia/Baku, 2015 DST end at 05:00)',
    instant: '2015-10-25T02:00:00.000Z',
    timeZone: 'Asia/Baku',
    expected: '2015-10-24T23:00:00.000Z',
    kind: 'fold',
  },
];

describe('mentor notice shifted learning day', () => {
  it('has full ICU time-zone data for every zone under test', () => {
    for (const { timeZone } of cases) {
      if (timeZone === 'UTC') continue;
      const formatted = new Intl.DateTimeFormat('en-US', {
        timeZone,
        timeZoneName: 'longOffset',
      }).format(new Date('2026-07-19T05:00:00.000Z'));
      expect(formatted).toMatch(/GMT[+-]\d{2}:\d{2}/);
    }
  });

  it.each(cases)('$name', ({ instant, timeZone, expected, kind }) => {
    const start = getLearningDayStart(new Date(instant), timeZone);
    expect(start.toISOString()).toBe(expected);

    // The boundary never lies after the instant it contains.
    expect(start.getTime()).toBeLessThanOrEqual(Date.parse(instant));

    // The boundary is the first representable instant at or after local
    // 04:00 of its own local civil day.
    const fourAm = localFourAmOfSameDay(start, timeZone);
    expect(localCivilMs(start, timeZone)).toBeGreaterThanOrEqual(fourAm);
    expect(localCivilMs(new Date(start.getTime() - 1), timeZone)).toBeLessThan(
      fourAm,
    );

    // Exact cases land on local 04:00 to the millisecond; gap cases land on
    // the transition instant, whose local reading is past 04:00.
    if (kind === 'gap') {
      expect(localCivilMs(start, timeZone)).toBeGreaterThan(fourAm);
    } else {
      expect(localCivilMs(start, timeZone)).toBe(fourAm);
    }

    // The boundary is its own learning-day start.
    expect(getLearningDayStart(start, timeZone).toISOString()).toBe(expected);
  });

  it('regression: a forward transition inside the four-hour lookback no longer selects the previous civil day', () => {
    // Chile moves -04 to -03 at 2026-09-06T04:00:00Z (local 24:00 -> 01:00).
    // At 07:30Z the learner's local clock reads 04:30 on 2026-09-06, so the
    // learning day started at local 04:00 that same day. Subtracting four
    // absolute hours lands at 03:30Z, whose local reading is 23:30 on
    // 2026-09-05, selecting the previous civil day and a boundary 23 hours early.
    const start = getLearningDayStart(
      new Date('2026-09-06T07:30:00.000Z'),
      'America/Santiago',
    );
    expect(start.toISOString()).toBe('2026-09-06T07:00:00.000Z');
    expect(start.toISOString()).not.toBe('2026-09-05T08:00:00.000Z');
  });

  it('falls back to UTC for invalid timezones', () => {
    expect(
      getLearningDayStart(
        new Date('2026-07-19T05:00:00.000Z'),
        'not/a-zone',
      ).toISOString(),
    ).toBe('2026-07-19T04:00:00.000Z');
  });

  it.each([null, undefined, ''])(
    'falls back to UTC for a missing timezone (%p)',
    (timeZone) => {
      expect(
        getLearningDayStart(
          new Date('2026-07-19T03:00:00.000Z'),
          timeZone,
        ).toISOString(),
      ).toBe('2026-07-18T04:00:00.000Z');
    },
  );
});
