import {
  buildProgressGuidance,
  calculateGuidedRatio,
  calculateRetentionTrend,
  calculateTrend,
  generateChildSummary,
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
