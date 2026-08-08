import {
  AGE_DECISION_THRESHOLDS,
  ageThresholdBirthDateWindows,
} from './age-threshold-window';

const utc = (iso: string): Date => new Date(iso);

/** Does this window select the given birth date? `(after, throughInclusive]`. */
function selects(
  win: { after: Date; throughInclusive: Date },
  birthDate: string,
): boolean {
  const b = utc(birthDate).getTime();
  return b > win.after.getTime() && b <= win.throughInclusive.getTime();
}

function windowFor(
  start: string,
  end: string,
  threshold: number,
): { after: Date; throughInclusive: Date } {
  const w = ageThresholdBirthDateWindows(utc(start), utc(end)).find(
    (x) => x.threshold === threshold,
  );
  if (!w) throw new Error(`no window for threshold ${threshold}`);
  return w;
}

describe('[WI-2745] ageThresholdBirthDateWindows', () => {
  it('covers every age at which a decision can change', () => {
    // 13 = PROFILE_MINIMUM_AGE, 18 = PARENT_ACCOUNT_MINIMUM_AGE,
    // 13..16 = the regime-configurable Article 8 threshold.
    expect([...AGE_DECISION_THRESHOLDS].sort((a, b) => a - b)).toEqual([
      13, 14, 15, 16, 18,
    ]);
  });

  it('selects a person whose 13th birthday falls inside the window', () => {
    const w = windowFor('2026-08-05T00:00:00Z', '2026-08-06T00:00:00Z', 13);
    // Turns 13 at 2026-08-05T12:00:00Z — strictly after the exclusive start.
    expect(selects(w, '2013-08-05T12:00:00Z')).toBe(true);
  });

  it('[BREAK] a crossing exactly AT the exclusive start belongs to the previous window', () => {
    // Not a quibble — it is the tiling property. Turning 13 at exactly
    // windowStart means the previous run (whose end is inclusive) already owned
    // that crossing. Selecting it here too would emit twice for one birthday.
    // This case is why the bounds are `(start, end]` and not `[start, end]`.
    const w = windowFor('2026-08-05T00:00:00Z', '2026-08-06T00:00:00Z', 13);
    expect(selects(w, '2013-08-05T00:00:00Z')).toBe(false);

    const previous = windowFor(
      '2026-08-04T00:00:00Z',
      '2026-08-05T00:00:00Z',
      13,
    );
    expect(selects(previous, '2013-08-05T00:00:00Z')).toBe(true);
  });

  it('[BREAK] does NOT select someone whose birthday is one day past the window', () => {
    const w = windowFor('2026-08-05T00:00:00Z', '2026-08-06T00:00:00Z', 13);
    // Turns 13 on 2026-08-07 — the next run's window, not this one.
    expect(selects(w, '2013-08-07T00:00:00Z')).toBe(false);
  });

  it('[BREAK] does NOT re-select someone who crossed before the window opened', () => {
    // The idempotency property at the SELECTION layer: a person already past a
    // threshold must not be picked up again on every subsequent run, or the job
    // re-emits for the same crossing forever.
    const w = windowFor('2026-08-05T00:00:00Z', '2026-08-06T00:00:00Z', 13);
    expect(selects(w, '2013-08-01T00:00:00Z')).toBe(false);
  });

  it('consecutive windows tile exactly — a crossing lands in one and only one', () => {
    const day1 = windowFor('2026-08-05T00:00:00Z', '2026-08-06T00:00:00Z', 18);
    const day2 = windowFor('2026-08-06T00:00:00Z', '2026-08-07T00:00:00Z', 18);
    const birth = '2008-08-06T00:00:00Z'; // turns 18 on 2026-08-06

    // Exclusive start + inclusive end is what makes this exactly-once rather
    // than either double-counting or dropping a crossing on the boundary.
    expect(selects(day1, birth)).toBe(true);
    expect(selects(day2, birth)).toBe(false);
  });

  describe('leap-day births', () => {
    it('[BREAK] a 29 Feb birth is NOT treated as older a day early in a common year', () => {
      // 2012-02-29 + 14y lands in 2026, which is NOT a leap year. The
      // conservative direction is to treat the birthday as 1 March, never
      // 28 February — counting someone as older a day early is what could
      // relax a guardian requirement before it is legally due.
      const feb28 = windowFor(
        '2026-02-27T00:00:00Z',
        '2026-02-28T23:59:59Z',
        14,
      );
      expect(selects(feb28, '2012-02-29T00:00:00Z')).toBe(false);
    });

    it('a 29 Feb birth is picked up on 1 March in a common year', () => {
      const mar1 = windowFor(
        '2026-02-28T23:59:59Z',
        '2026-03-01T12:00:00Z',
        14,
      );
      expect(selects(mar1, '2012-02-29T00:00:00Z')).toBe(true);
    });
  });

  describe('degenerate windows select nobody', () => {
    it('an empty window returns no ranges', () => {
      expect(
        ageThresholdBirthDateWindows(
          utc('2026-08-05T00:00:00Z'),
          utc('2026-08-05T00:00:00Z'),
        ),
      ).toEqual([]);
    });

    it('[BREAK] an INVERTED window returns no ranges rather than throwing', () => {
      // Clock skew or a duplicated trigger must not fail the run. The correct
      // behaviour for "no time passed" is "nothing crossed", not an exception
      // that puts a scheduled job into a retry loop.
      expect(
        ageThresholdBirthDateWindows(
          utc('2026-08-06T00:00:00Z'),
          utc('2026-08-05T00:00:00Z'),
        ),
      ).toEqual([]);
    });
  });

  it('produces one range per threshold', () => {
    const windows = ageThresholdBirthDateWindows(
      utc('2026-08-05T00:00:00Z'),
      utc('2026-08-06T00:00:00Z'),
    );
    expect(windows).toHaveLength(AGE_DECISION_THRESHOLDS.length);
    expect(windows.map((w) => w.threshold).sort((a, b) => a - b)).toEqual([
      13, 14, 15, 16, 18,
    ]);
  });
});
