import {
  buildProgressGuidance,
  calculateGuidedRatio,
  calculateRetentionTrend,
  calculateTrend,
  generateChildSummary,
  sortSubjectsByActivityPriority,
  type DashboardInput,
} from './dashboard';

function createDashboardInput(
  overrides: Partial<DashboardInput> = {}
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
      })
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
        })
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
        })
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
        })
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
        })
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
        })
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
        3
      )
    ).toBe('improving');
  });

  it('returns declining when weak and fading subjects dominate', () => {
    expect(
      calculateRetentionTrend(
        [{ status: 'strong' }, { status: 'weak' }, { status: 'fading' }],
        3
      )
    ).toBe('declining');
  });

  it('returns stable when there is no meaningful session volume yet', () => {
    expect(calculateRetentionTrend([], 3)).toBe('stable');
    expect(
      calculateRetentionTrend(
        [{ status: 'strong' }, { status: 'strong' }],
        undefined
      )
    ).toBe('stable');
    expect(
      calculateRetentionTrend([{ status: 'strong' }, { status: 'weak' }], 1)
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
      /Quiet week/
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
      (s: { name: string }) => s.name
    );
    const guidance = buildProgressGuidance('TestKid', subjectNames, 0, 4, 2);
    // Pre-fix this would say "...keep it going with Biology!". Post-fix:
    // Mathematics (the only subject with sessions) is the recommendation.
    expect(guidance).toMatch(/Mathematics/);
    expect(guidance).not.toMatch(/Biology/);
  });
});
