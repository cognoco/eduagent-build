import {
  createTrialState,
  getTrialPhase,
  getTrialWarningMessage,
  getSoftLandingMessage,
} from './trial';

// ---------------------------------------------------------------------------
// createTrialState
// ---------------------------------------------------------------------------

describe('createTrialState', () => {
  it('creates a trial with full_access phase', () => {
    const state = createTrialState('2025-06-01T00:00:00.000Z');

    expect(state.startDate).toBe('2025-06-01T00:00:00.000Z');
    expect(state.phase).toBe('full_access');
  });

  it('sets end date 14 days after start', () => {
    const state = createTrialState('2025-06-01T00:00:00.000Z');
    const endDate = new Date(state.endDate);
    const startDate = new Date(state.startDate);
    const diffDays =
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);

    expect(diffDays).toBe(14);
  });
});

// ---------------------------------------------------------------------------
// getTrialPhase
// ---------------------------------------------------------------------------

describe('getTrialPhase', () => {
  it('returns full_access for day 1', () => {
    expect(getTrialPhase(1)).toBe('full_access');
  });

  it('returns full_access for day 14', () => {
    expect(getTrialPhase(14)).toBe('full_access');
  });

  it('returns extended for day 15', () => {
    expect(getTrialPhase(15)).toBe('extended');
  });

  it('returns extended for day 28', () => {
    expect(getTrialPhase(28)).toBe('extended');
  });

  it('returns free for day 29', () => {
    expect(getTrialPhase(29)).toBe('free');
  });

  it('returns free for day 100', () => {
    expect(getTrialPhase(100)).toBe('free');
  });
});

// ---------------------------------------------------------------------------
// getTrialWarningMessage
// ---------------------------------------------------------------------------

describe('getTrialWarningMessage', () => {
  it('returns warning at 3 days remaining', () => {
    expect(getTrialWarningMessage(3)).toBe('3 days left of your trial');
  });

  it('returns warning at 1 day remaining', () => {
    expect(getTrialWarningMessage(1)).toBe('1 day left of your trial');
  });

  it('returns last day message at 0 days remaining', () => {
    expect(getTrialWarningMessage(0)).toBe('Last day of your trial');
  });

  it('returns null when no warning needed (e.g. 10 days)', () => {
    expect(getTrialWarningMessage(10)).toBeNull();
  });

  it('returns null when no warning needed (e.g. 2 days)', () => {
    expect(getTrialWarningMessage(2)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getSoftLandingMessage
// ---------------------------------------------------------------------------

describe('getSoftLandingMessage', () => {
  it('returns intro message on day 1 after trial end', () => {
    expect(getSoftLandingMessage(1)).toBe('giving you 15/day for 2 more weeks');
  });

  it('returns 1-week-left message on day 7', () => {
    expect(getSoftLandingMessage(7)).toBe('1 week left of extended access');
  });

  it('returns final message on day 14', () => {
    expect(getSoftLandingMessage(14)).toBe('tomorrow you move to Free');
  });

  it('returns null for non-milestone days', () => {
    expect(getSoftLandingMessage(2)).toBeNull();
    expect(getSoftLandingMessage(5)).toBeNull();
    expect(getSoftLandingMessage(10)).toBeNull();
  });
});
