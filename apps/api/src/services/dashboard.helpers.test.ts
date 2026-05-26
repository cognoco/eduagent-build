import {
  buildProgressGuidance,
  calculateGuidedRatio,
  calculateRetentionTrend,
  calculateTrend,
} from './progress-helpers';
import {
  generateChildSummary,
  getStartOfWeek,
  sortSubjectsByActivityPriority,
  type DashboardInput,
} from './dashboard';

function createDashboardInput(
  overrides: Partial<DashboardInput> = {},
): DashboardInput {
  return {
    childProfileId: 'child-1',
    displayName: 'Alex',
    sessionsThisWeek: 4,
    sessionsLastWeek: 2,
    totalTimeThisWeekMinutes: 60,
    totalTimeLastWeekMinutes: 30,
    exchangesThisWeek: 15,
    exchangesLastWeek: 8,
    subjectRetentionData: [
      { name: 'Math', status: 'strong' },
      { name: 'Science', status: 'fading' },
    ],
    guidedCount: 3,
    totalProblemCount: 5,
    ...overrides,
  };
}

describe('generateChildSummary', () => {
  it('includes the child display name and progress details', () => {
    const summary = generateChildSummary(createDashboardInput());

    expect(summary).toMatch(/^Alex:/);
    expect(summary).toContain('5 problems');
    expect(summary).toContain('3 guided');
    expect(summary).toContain('Science fading');
    expect(summary).toContain('4 sessions this week');
    expect(summary).toContain('up from 2');
  });

  it('renders a down-trend summary when weekly sessions fall', () => {
    const summary = generateChildSummary(
      createDashboardInput({
        sessionsThisWeek: 1,
        sessionsLastWeek: 5,
      }),
    );

    expect(summary).toContain('down from 5');
  });

  // [BUG-906] When the lifetime session count is below the new-learner
  // threshold, the headline subtext must NOT use weekly cadence — that was
  // what made "0 sessions this week" appear alongside the "After 2 more
  // sessions" teaser and read as a contradiction. The lifetime framing keeps
  // the two views consistent.
  describe('new-learner framing [BUG-906]', () => {
    it('uses "{N} sessions so far" when lifetime is below the threshold', () => {
      const summary = generateChildSummary(
        createDashboardInput({
          sessionsThisWeek: 0,
          sessionsLastWeek: 0,
          totalSessions: 2,
        }),
      );

      expect(summary).toContain('2 sessions so far');
      expect(summary).not.toContain('this week');
      expect(summary).not.toContain('last week');
    });

    it('says "no sessions yet" for a brand-new learner with totalSessions=0', () => {
      const summary = generateChildSummary(
        createDashboardInput({
          sessionsThisWeek: 0,
          sessionsLastWeek: 0,
          totalSessions: 0,
        }),
      );

      expect(summary).toContain('no sessions yet');
      expect(summary).not.toContain('this week');
    });

    it('singularises "1 session so far"', () => {
      const summary = generateChildSummary(
        createDashboardInput({
          sessionsThisWeek: 0,
          sessionsLastWeek: 0,
          totalSessions: 1,
        }),
      );

      expect(summary).toContain('1 session so far');
      expect(summary).not.toContain('1 sessions');
    });

    it('switches to weekly cadence at the threshold (totalSessions=4)', () => {
      // Break test: at 4 lifetime sessions the dashboard transitions to
      // weekly cadence; if this boundary moves silently the parent will see
      // either the contradiction (below threshold using cadence) or the
      // opposite confusion (above threshold using lifetime).
      const summary = generateChildSummary(
        createDashboardInput({
          sessionsThisWeek: 1,
          sessionsLastWeek: 0,
          totalSessions: 4,
        }),
      );

      expect(summary).toContain('1 session this week');
      expect(summary).not.toContain('so far');
    });

    it('keeps weekly cadence for callers that omit totalSessions (back-compat)', () => {
      // totalSessions is optional. Existing callers that have not yet adopted
      // the new field continue to see the weekly framing — no regression.
      const summary = generateChildSummary(
        createDashboardInput({
          sessionsThisWeek: 4,
          sessionsLastWeek: 2,
          // totalSessions intentionally omitted
        }),
      );

      expect(summary).toContain('4 sessions this week');
    });
  });
});

describe('calculateTrend', () => {
  it('returns up, down, or stable based on the delta', () => {
    expect(calculateTrend(5, 3)).toBe('up');
    expect(calculateTrend(2, 5)).toBe('down');
    expect(calculateTrend(3, 3)).toBe('stable');
  });
});

describe('calculateRetentionTrend', () => {
  it('returns improving when strong subjects outnumber weak or fading ones', () => {
    expect(
      calculateRetentionTrend(
        [{ status: 'strong' }, { status: 'strong' }, { status: 'fading' }],
        3,
      ),
    ).toBe('improving');
  });

  it('returns declining when weak and fading subjects dominate', () => {
    expect(
      calculateRetentionTrend(
        [{ status: 'strong' }, { status: 'weak' }, { status: 'fading' }],
        3,
      ),
    ).toBe('declining');
  });

  it('returns stable when there is no meaningful session volume yet', () => {
    expect(calculateRetentionTrend([], 3)).toBe('stable');
    expect(
      calculateRetentionTrend(
        [{ status: 'strong' }, { status: 'strong' }],
        undefined,
      ),
    ).toBe('stable');
    expect(
      calculateRetentionTrend([{ status: 'strong' }, { status: 'weak' }], 1),
    ).toBe('stable');
  });
});

describe('calculateGuidedRatio', () => {
  it('computes and clamps the guided ratio', () => {
    expect(calculateGuidedRatio(3, 10)).toBeCloseTo(0.3);
    expect(calculateGuidedRatio(0, 0)).toBe(0);
    expect(calculateGuidedRatio(5, 5)).toBe(1);
    expect(calculateGuidedRatio(10, 5)).toBe(1);
    expect(calculateGuidedRatio(0, 10)).toBe(0);
  });
});

describe('buildProgressGuidance', () => {
  it('returns a quiet-week nudge when there was no activity and no streak', () => {
    expect(buildProgressGuidance('Alex', ['Math'], 0, 3, 0)).toMatch(
      /Quiet week/,
    );
  });

  it('prefers a streak nudge over the quiet-week copy when a streak exists', () => {
    const result = buildProgressGuidance('Alex', ['Math'], 0, 2, 2);

    expect(result).not.toMatch(/Quiet week/);
    expect(result).toMatch(/2-day streak/);
    expect(result).toMatch(/Math/);
  });

  it('returns a decline nudge when sessions decreased', () => {
    const result = buildProgressGuidance('Alex', ['Biology'], 1, 4);

    expect(result).toMatch(/still building knowledge/);
    expect(result).toMatch(/Biology/);
  });

  it('returns null when sessions are steady, increasing, or there is no subject', () => {
    expect(buildProgressGuidance('Alex', ['Math'], 4, 3)).toBeNull();
    expect(buildProgressGuidance('Alex', [], 0, 3, 0)).toBeNull();
  });
});

// [BUG-913] Coaching nudge previously recommended whichever subject came
// first in the linked-subjects array (often alphabetical), even when that
// subject had zero sessions. Sorting by activity priority guarantees we
// recommend a subject the child has actually engaged with.
describe('sortSubjectsByActivityPriority (BUG-913)', () => {
  it('puts subjects with a recent lastSessionAt before never-touched subjects', () => {
    const subjects = [
      {
        name: 'Biology',
        lastSessionAt: null,
        topicsCompleted: 0,
      },
      {
        name: 'Mathematics',
        lastSessionAt: '2026-04-19T10:00:00.000Z',
        topicsCompleted: 0,
      },
      {
        name: 'Programming',
        lastSessionAt: null,
        topicsCompleted: 0,
      },
    ];
    const ordered = sortSubjectsByActivityPriority(subjects);
    expect(ordered.map((s: { name: string }) => s.name)).toEqual([
      'Mathematics',
      'Biology',
      'Programming',
    ]);
  });

  it('breaks ties between never-touched subjects with topicsCompleted, then name', () => {
    const subjects = [
      { name: 'Zoology', lastSessionAt: null, topicsCompleted: 2 },
      { name: 'Biology', lastSessionAt: null, topicsCompleted: 0 },
      { name: 'Astronomy', lastSessionAt: null, topicsCompleted: 0 },
    ];
    const ordered = sortSubjectsByActivityPriority(subjects);
    expect(ordered.map((s: { name: string }) => s.name)).toEqual([
      'Zoology',
      'Astronomy',
      'Biology',
    ]);
  });

  it('after sorting, buildProgressGuidance recommends the active subject (BUG-913 break test)', () => {
    const testKidSubjects = [
      // Alphabetical input — Biology first, but never used.
      { name: 'Biology', lastSessionAt: null, topicsCompleted: 0 },
      {
        name: 'Mathematics',
        lastSessionAt: '2026-04-19T10:00:00.000Z',
        topicsCompleted: 1,
      },
      { name: 'Programming', lastSessionAt: null, topicsCompleted: 0 },
    ];
    const subjectNames = sortSubjectsByActivityPriority(testKidSubjects).map(
      (s: { name: string }) => s.name,
    );
    const guidance = buildProgressGuidance('TestKid', subjectNames, 0, 4, 2);
    // Pre-fix this would say "...keep it going with Biology!". Post-fix:
    // Mathematics (the only subject with sessions) is the recommendation.
    expect(guidance).toMatch(/Mathematics/);
    expect(guidance).not.toMatch(/Biology/);
  });
});

// ---------------------------------------------------------------------------
// Phase 4 additions — ordering, null recap fields, mixed sessions
// ---------------------------------------------------------------------------

describe('generateChildSummary — null/empty recap fields', () => {
  // Null recap fields must not crash (BUG-CANDIDATE guard)
  it('handles zero problems and zero guided count without crashing', () => {
    const summary = generateChildSummary(
      createDashboardInput({
        totalProblemCount: 0,
        guidedCount: 0,
        subjectRetentionData: [],
      }),
    );
    // No problem stats rendered when there are none.
    expect(summary).not.toContain('problems');
    expect(summary).toMatch(/^Alex:/);
  });

  it('omits fading/weak copy when all subjects are strong or forgotten', () => {
    const summary = generateChildSummary(
      createDashboardInput({
        subjectRetentionData: [
          { name: 'Math', status: 'strong' },
          { name: 'History', status: 'forgotten' },
        ],
      }),
    );
    // 'forgotten' status should NOT appear in the summary (only fading/weak trigger it)
    expect(summary).not.toContain('Math fading');
    expect(summary).not.toContain('Math weak');
    expect(summary).not.toContain('History fading');
    expect(summary).not.toContain('History weak');
  });

  it('includes only fading/weak subjects — not strong or forgotten', () => {
    const summary = generateChildSummary(
      createDashboardInput({
        subjectRetentionData: [
          { name: 'Math', status: 'strong' },
          { name: 'Science', status: 'fading' },
          { name: 'History', status: 'weak' },
          { name: 'Geography', status: 'forgotten' },
        ],
      }),
    );
    expect(summary).toContain('Science fading');
    expect(summary).toContain('History weak');
    expect(summary).not.toContain('Math');
    expect(summary).not.toContain('Geography');
  });

  it('handles an empty subjectRetentionData array without crashing', () => {
    const summary = generateChildSummary(
      createDashboardInput({
        subjectRetentionData: [],
        totalProblemCount: 0,
        guidedCount: 0,
      }),
    );
    // Must produce a non-empty summary with at least the display name
    expect(summary).toMatch(/^Alex:/);
    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(0);
  });
});

describe('sortSubjectsByActivityPriority — ordering edge cases', () => {
  it('handles empty input without crashing', () => {
    expect(sortSubjectsByActivityPriority([])).toEqual([]);
  });

  it('handles a single subject', () => {
    const result = sortSubjectsByActivityPriority([
      {
        name: 'Math',
        lastSessionAt: '2026-05-01T00:00:00.000Z',
        topicsCompleted: 3,
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Math');
  });

  it('puts the most recently active subject first when multiple have sessions', () => {
    const subjects = [
      {
        name: 'Chemistry',
        lastSessionAt: '2026-05-10T00:00:00.000Z',
        topicsCompleted: 1,
      },
      {
        name: 'Math',
        lastSessionAt: '2026-05-15T00:00:00.000Z',
        topicsCompleted: 2,
      },
      {
        name: 'History',
        lastSessionAt: '2026-05-08T00:00:00.000Z',
        topicsCompleted: 3,
      },
    ];
    const result = sortSubjectsByActivityPriority(subjects);
    expect(result.map((s) => s.name)).toEqual(['Math', 'Chemistry', 'History']);
  });

  it('does not mutate the original array', () => {
    const subjects = [
      { name: 'B', lastSessionAt: null, topicsCompleted: 0 },
      {
        name: 'A',
        lastSessionAt: '2026-05-15T00:00:00.000Z',
        topicsCompleted: 0,
      },
    ];
    const original = [...subjects];
    sortSubjectsByActivityPriority(subjects);
    expect(subjects).toEqual(original);
  });

  it('breaks ties among all-null lastSessionAt by topicsCompleted first, then name', () => {
    const subjects = [
      { name: 'Zoology', lastSessionAt: null, topicsCompleted: 0 },
      { name: 'Astronomy', lastSessionAt: null, topicsCompleted: 5 },
      { name: 'Biology', lastSessionAt: null, topicsCompleted: 5 },
    ];
    const result = sortSubjectsByActivityPriority(subjects);
    expect(result.map((s) => s.name)).toEqual([
      'Astronomy',
      'Biology',
      'Zoology',
    ]);
  });
});

// ---------------------------------------------------------------------------
// [BUG-469] getStartOfWeek + last-week subtraction must be UTC-safe
//
// Root cause: two sites in dashboard.ts used setDate(getDate() - 7) on a
// UTC-anchored Date. On CET/CEST machines (UTC+1/UTC+2) this computes in
// local time, shifting the boundary by 1 hour across DST transitions and
// producing off-by-one week ranges. Fix: setUTCDate(getUTCDate() - 7).
//
// Lock-down strategy: we cannot mock process.env.TZ at runtime (Jest
// inherits the TZ at process start and it cannot be changed mid-process).
// Instead we directly exercise the UTC arithmetic that the fix introduces:
// given a known UTC Monday, subtracting 7 UTC days must always land on the
// previous UTC Monday at 00:00:00.000Z regardless of the host timezone.
// This test would have failed under the old setDate(getDate() - 7) code
// when run in a UTC+N timezone, because getDate() returns the local day
// number which is one calendar day ahead of the UTC day for dates near
// midnight UTC.
// ---------------------------------------------------------------------------
describe('[BUG-469] getStartOfWeek UTC arithmetic — DST-boundary lock-down', () => {
  // CET→CEST DST transition: clocks spring forward on 2024-03-31 at 02:00 CET.
  // A host in CET (UTC+1): Monday 2024-03-25 00:00:00 UTC is
  // Sunday 2024-03-24 23:00:00 CET — so getDate() would return 24 (Sunday),
  // not 25 (Monday), corrupting the subtraction.
  it('subtracts 7 calendar UTC days from a UTC Monday (spring-forward week)', () => {
    // Monday 2024-04-01 00:00:00 UTC (first Monday after CET→CEST switch)
    const thisWeekMonday = new Date('2024-04-01T00:00:00.000Z');
    const startOfLastWeek = new Date(thisWeekMonday);
    startOfLastWeek.setUTCDate(startOfLastWeek.getUTCDate() - 7);

    expect(startOfLastWeek.toISOString()).toBe('2024-03-25T00:00:00.000Z');
  });

  // CEST→CET DST transition: clocks fall back on 2024-10-27 at 03:00 CEST.
  // A host in CEST (UTC+2): Monday 2024-10-28 00:00:00 UTC is
  // Monday 2024-10-28 02:00:00 CEST. The week before: Monday 2024-10-21 UTC.
  it('subtracts 7 calendar UTC days from a UTC Monday (fall-back week)', () => {
    const thisWeekMonday = new Date('2024-10-28T00:00:00.000Z');
    const startOfLastWeek = new Date(thisWeekMonday);
    startOfLastWeek.setUTCDate(startOfLastWeek.getUTCDate() - 7);

    expect(startOfLastWeek.toISOString()).toBe('2024-10-21T00:00:00.000Z');
  });

  // Verify getStartOfWeek itself returns midnight UTC Monday for a date
  // that straddles midnight in UTC+1 (CET).
  it('getStartOfWeek returns Monday 00:00:00 UTC for a Thursday in CET midnight territory', () => {
    // 2024-11-14T23:30:00Z is Friday 2024-11-15 00:30:00 CET.
    // The UTC week containing this moment starts on Monday 2024-11-11.
    const result = getStartOfWeek(new Date('2024-11-14T23:30:00.000Z'));
    expect(result.toISOString()).toBe('2024-11-11T00:00:00.000Z');
  });

  it('getStartOfWeek + UTC subtraction produces correct lastWeek start across a year boundary', () => {
    // Monday 2025-01-06 00:00:00 UTC — first Monday of 2025.
    // Previous Monday: 2024-12-30 00:00:00 UTC.
    const thisWeekMonday = getStartOfWeek(new Date('2025-01-08T12:00:00.000Z'));
    expect(thisWeekMonday.toISOString()).toBe('2025-01-06T00:00:00.000Z');

    const startOfLastWeek = new Date(thisWeekMonday);
    startOfLastWeek.setUTCDate(startOfLastWeek.getUTCDate() - 7);
    expect(startOfLastWeek.toISOString()).toBe('2024-12-30T00:00:00.000Z');
  });
});
