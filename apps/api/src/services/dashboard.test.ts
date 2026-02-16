import {
  generateChildSummary,
  calculateTrend,
  calculateGuidedRatio,
  type DashboardInput,
} from './dashboard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    subjectRetentionData: [
      { name: 'Math', status: 'strong' },
      { name: 'Science', status: 'fading' },
    ],
    guidedCount: 3,
    totalProblemCount: 5,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// generateChildSummary
// ---------------------------------------------------------------------------

describe('generateChildSummary', () => {
  it('includes the child display name', () => {
    const summary = generateChildSummary(createDashboardInput());

    expect(summary).toMatch(/^Alex:/);
  });

  it('includes problem count and guided count', () => {
    const summary = generateChildSummary(createDashboardInput());

    expect(summary).toContain('5 problems');
    expect(summary).toContain('3 guided');
  });

  it('includes fading subjects', () => {
    const summary = generateChildSummary(createDashboardInput());

    expect(summary).toContain('Science fading');
  });

  it('includes session trend information', () => {
    const summary = generateChildSummary(createDashboardInput());

    expect(summary).toContain('4 sessions this week');
    expect(summary).toContain('up from 2');
  });

  it('handles down trend', () => {
    const summary = generateChildSummary(
      createDashboardInput({
        sessionsThisWeek: 1,
        sessionsLastWeek: 5,
      })
    );

    expect(summary).toContain('down from 5');
  });
});

// ---------------------------------------------------------------------------
// calculateTrend
// ---------------------------------------------------------------------------

describe('calculateTrend', () => {
  it('returns up when current exceeds previous', () => {
    expect(calculateTrend(5, 3)).toBe('up');
  });

  it('returns down when current is less than previous', () => {
    expect(calculateTrend(2, 5)).toBe('down');
  });

  it('returns stable when equal', () => {
    expect(calculateTrend(3, 3)).toBe('stable');
  });
});

// ---------------------------------------------------------------------------
// calculateGuidedRatio
// ---------------------------------------------------------------------------

describe('calculateGuidedRatio', () => {
  it('calculates ratio correctly', () => {
    expect(calculateGuidedRatio(3, 10)).toBeCloseTo(0.3);
  });

  it('returns 0 when total is 0', () => {
    expect(calculateGuidedRatio(0, 0)).toBe(0);
  });

  it('returns 1 when all are guided', () => {
    expect(calculateGuidedRatio(5, 5)).toBe(1);
  });

  it('clamps to 1 if guided exceeds total', () => {
    expect(calculateGuidedRatio(10, 5)).toBe(1);
  });

  it('returns 0 when no guided problems', () => {
    expect(calculateGuidedRatio(0, 10)).toBe(0);
  });
});
