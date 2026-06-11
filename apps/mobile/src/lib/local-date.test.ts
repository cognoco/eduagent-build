import { toLocalDateString } from './local-date';

// RED-GREEN evidence for F-177 / F-178.
//
// F-177: `new Date().toISOString().slice(0, 10)` in dictation/complete.tsx and
//        dictation/review.tsx returns UTC date — wrong for users west of UTC
//        around midnight.
// F-178: `round.completedAt.slice(0, 10)` in quiz/history.tsx groups rounds by
//        UTC date rather than the user's local calendar day.
//
// The critical invariant is:
//   toLocalDateString(d) === `${d.getFullYear()}-${MM}-${DD}`  (local components)
//
// We cannot force a specific TZ in jest-expo (no TZ= env support at runtime).
// Instead we use a mock Date class that overrides the LOCAL getters while
// keeping toISOString() returning UTC — this is exactly the real scenario where
// local TZ is behind UTC.

// Simulate a date whose UTC date is "2026-04-30" but whose LOCAL date is "2026-04-29"
// (as would happen for a user in UTC-1 or further west at 00:30 UTC).
class FakeDateUTCMinusOne extends Date {
  // toISOString still returns UTC — like the buggy `.slice(0,10)` would see
  override toISOString(): string {
    return '2026-04-30T00:30:00.000Z';
  }
  // local getters return the previous day (local midnight on Apr 29)
  override getFullYear(): number {
    return 2026;
  }
  override getMonth(): number {
    return 3;
  } // April (0-indexed)
  override getDate(): number {
    return 29;
  } // local day = 29, NOT 30
}

describe('toLocalDateString', () => {
  it('returns local date components, not UTC components (formula contract)', () => {
    const d = new Date('2026-01-01T06:00:00Z');
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(toLocalDateString(d)).toBe(expected);
  });

  it('midnight boundary (RED-GREEN): uses local getters, not toISOString UTC slice', () => {
    // Scenario: user is in UTC-1. It's 00:30 UTC on 2026-04-30 (April 30 UTC)
    // but 23:30 local on 2026-04-29 (April 29 local). The quiz round's
    // completedAt ISO string is '2026-04-30T00:30:00Z'.
    //
    // BUGGY approach: '2026-04-30T00:30:00Z'.slice(0, 10) === '2026-04-30'
    //                  → quiz groups under April 30, one day AHEAD of local.
    // CORRECT approach: toLocalDateString(new Date('2026-04-30T00:30:00Z'))
    //                  → should use getFullYear/getMonth/getDate of local TZ.
    //
    // We use FakeDateUTCMinusOne to simulate a UTC-1 user: toISOString()
    // returns the UTC date (April 30), but local getters return April 29.

    const fakeDate = new FakeDateUTCMinusOne();

    // Demonstrate the BUG (what the old code did):
    const buggyResult = fakeDate.toISOString().slice(0, 10);
    expect(buggyResult).toBe('2026-04-30'); // Wrong for this user's local date

    // Our fix: use local Date components
    const fixedResult = toLocalDateString(fakeDate);
    expect(fixedResult).toBe('2026-04-29'); // Correct local date for UTC-1 user
    expect(fixedResult).not.toBe(buggyResult); // Must differ from UTC slice
  });

  it('same-day case: UTC and local agree when user is UTC or ahead', () => {
    // User in UTC+2 at 10:00 local (08:00 UTC) → both are same date
    const d = new Date('2026-06-15T08:00:00Z');
    const utcSlice = d.toISOString().slice(0, 10); // '2026-06-15'
    const local = toLocalDateString(d);
    // If test runner is UTC or ahead, both agree. Either way, local uses local components.
    const expectedLocal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(local).toBe(expectedLocal);
    // In UTC, same as utcSlice — acceptable
    // In UTC+2, still same (10:00 local is well within the day)
    // In UTC-9, differs: 23:00 local June 14 → '2026-06-14'
  });

  it('defaults to current date (no argument)', () => {
    const before = new Date();
    const result = toLocalDateString();
    const after = new Date();
    const expectedBefore = `${before.getFullYear()}-${String(before.getMonth() + 1).padStart(2, '0')}-${String(before.getDate()).padStart(2, '0')}`;
    const expectedAfter = `${after.getFullYear()}-${String(after.getMonth() + 1).padStart(2, '0')}-${String(after.getDate()).padStart(2, '0')}`;
    expect([expectedBefore, expectedAfter]).toContain(result);
  });
});
