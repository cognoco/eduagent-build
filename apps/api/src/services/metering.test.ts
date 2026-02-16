import {
  checkQuota,
  calculateRemainingQuestions,
  getWarningLevel,
  calculateMidCycleUpgrade,
  calculateMidCycleDowngrade,
  type MeteringState,
} from './metering';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestState(
  overrides: Partial<MeteringState> = {}
): MeteringState {
  return {
    monthlyLimit: 500,
    usedThisMonth: 0,
    topUpCreditsRemaining: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getWarningLevel
// ---------------------------------------------------------------------------

describe('getWarningLevel', () => {
  it('returns none when usage is below 80%', () => {
    expect(getWarningLevel(0, 500)).toBe('none');
    expect(getWarningLevel(100, 500)).toBe('none');
    expect(getWarningLevel(399, 500)).toBe('none');
  });

  it('returns soft when usage is between 80% and 95%', () => {
    expect(getWarningLevel(400, 500)).toBe('soft');
    expect(getWarningLevel(450, 500)).toBe('soft');
    expect(getWarningLevel(474, 500)).toBe('soft');
  });

  it('returns hard when usage is between 95% and 100%', () => {
    expect(getWarningLevel(475, 500)).toBe('hard');
    expect(getWarningLevel(490, 500)).toBe('hard');
    expect(getWarningLevel(499, 500)).toBe('hard');
  });

  it('returns exceeded when usage is at or above 100%', () => {
    expect(getWarningLevel(500, 500)).toBe('exceeded');
    expect(getWarningLevel(600, 500)).toBe('exceeded');
  });

  it('returns exceeded when limit is 0', () => {
    expect(getWarningLevel(0, 0)).toBe('exceeded');
  });
});

// ---------------------------------------------------------------------------
// calculateRemainingQuestions
// ---------------------------------------------------------------------------

describe('calculateRemainingQuestions', () => {
  it('returns full monthly limit when nothing used', () => {
    const state = createTestState({ monthlyLimit: 500, usedThisMonth: 0 });

    expect(calculateRemainingQuestions(state)).toBe(500);
  });

  it('subtracts used from monthly limit', () => {
    const state = createTestState({ monthlyLimit: 500, usedThisMonth: 200 });

    expect(calculateRemainingQuestions(state)).toBe(300);
  });

  it('adds top-up credits to remaining', () => {
    const state = createTestState({
      monthlyLimit: 500,
      usedThisMonth: 500,
      topUpCreditsRemaining: 100,
    });

    expect(calculateRemainingQuestions(state)).toBe(100);
  });

  it('never returns negative from monthly even if overused', () => {
    const state = createTestState({
      monthlyLimit: 500,
      usedThisMonth: 600,
      topUpCreditsRemaining: 50,
    });

    expect(calculateRemainingQuestions(state)).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// checkQuota
// ---------------------------------------------------------------------------

describe('checkQuota', () => {
  it('allows when quota is available', () => {
    const state = createTestState({ usedThisMonth: 100 });
    const result = checkQuota(state);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(400);
    expect(result.warningLevel).toBe('none');
  });

  it('shows soft warning at 80% usage', () => {
    const state = createTestState({ usedThisMonth: 400 });
    const result = checkQuota(state);

    expect(result.allowed).toBe(true);
    expect(result.warningLevel).toBe('soft');
  });

  it('shows hard warning at 95% usage', () => {
    const state = createTestState({ usedThisMonth: 480 });
    const result = checkQuota(state);

    expect(result.allowed).toBe(true);
    expect(result.warningLevel).toBe('hard');
  });

  it('blocks when monthly exhausted and no top-up credits', () => {
    const state = createTestState({
      usedThisMonth: 500,
      topUpCreditsRemaining: 0,
    });
    const result = checkQuota(state);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.warningLevel).toBe('exceeded');
  });

  it('allows drawing from top-up credits when monthly exhausted', () => {
    const state = createTestState({
      usedThisMonth: 500,
      topUpCreditsRemaining: 200,
    });
    const result = checkQuota(state);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(200);
    expect(result.warningLevel).toBe('exceeded');
  });
});

// ---------------------------------------------------------------------------
// calculateMidCycleUpgrade
// ---------------------------------------------------------------------------

describe('calculateMidCycleUpgrade', () => {
  it('returns new quota minus used on upgrade', () => {
    expect(calculateMidCycleUpgrade(100, 1500)).toBe(1400);
  });

  it('returns 0 if used exceeds new quota', () => {
    expect(calculateMidCycleUpgrade(2000, 1500)).toBe(0);
  });

  it('returns full new quota when nothing used', () => {
    expect(calculateMidCycleUpgrade(0, 3000)).toBe(3000);
  });
});

// ---------------------------------------------------------------------------
// calculateMidCycleDowngrade
// ---------------------------------------------------------------------------

describe('calculateMidCycleDowngrade', () => {
  it('returns new quota minus used on downgrade', () => {
    expect(calculateMidCycleDowngrade(100, 500)).toBe(400);
  });

  it('returns 0 when used exceeds new lower quota', () => {
    expect(calculateMidCycleDowngrade(600, 500)).toBe(0);
  });

  it('returns full new quota when nothing used', () => {
    expect(calculateMidCycleDowngrade(0, 50)).toBe(50);
  });

  it('returns 0 when used exactly equals new quota', () => {
    // used equals new quota: newQuota - used = 0
    expect(calculateMidCycleDowngrade(500, 500)).toBe(0);
  });
});
