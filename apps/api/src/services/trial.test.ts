import {
  createTrialState,
  getTrialPhase,
  getTrialWarningMessage,
  getSoftLandingMessage,
  computeTrialEndDate,
  daysBetween,
  TRIAL_FULL_ACCESS_DAYS,
  EXTENDED_TRIAL_DAILY_QUOTA,
  EXTENDED_TRIAL_MONTHLY_EQUIVALENT,
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('trial constants', () => {
  it('has 14-day full access period', () => {
    expect(TRIAL_FULL_ACCESS_DAYS).toBe(14);
  });

  it('has 15 questions/day extended trial limit', () => {
    expect(EXTENDED_TRIAL_DAILY_QUOTA).toBe(15);
  });

  it('computes monthly equivalent as 15 * 30 = 450', () => {
    expect(EXTENDED_TRIAL_MONTHLY_EQUIVALENT).toBe(450);
  });
});

// ---------------------------------------------------------------------------
// computeTrialEndDate
// ---------------------------------------------------------------------------

describe('computeTrialEndDate', () => {
  it('returns a date 14 days in the future', () => {
    const now = new Date('2025-06-01T10:00:00.000Z');
    const endDate = computeTrialEndDate(now, null);

    const diffDays = daysBetween(now, endDate);
    expect(diffDays).toBeGreaterThanOrEqual(13);
    expect(diffDays).toBeLessThanOrEqual(14);
  });

  it('falls back to UTC when timezone is null', () => {
    const now = new Date('2025-06-01T10:00:00.000Z');
    const endDate = computeTrialEndDate(now, null);

    // Should be end of day UTC on June 15
    expect(endDate.getUTCFullYear()).toBe(2025);
    expect(endDate.getUTCMonth()).toBe(5); // June = 5
    expect(endDate.getUTCDate()).toBe(15);
    expect(endDate.getUTCHours()).toBe(23);
    expect(endDate.getUTCMinutes()).toBe(59);
  });

  it('falls back to UTC when timezone is undefined', () => {
    const now = new Date('2025-06-01T10:00:00.000Z');
    const endDate = computeTrialEndDate(now, undefined);

    expect(endDate.getUTCDate()).toBe(15);
    expect(endDate.getUTCHours()).toBe(23);
  });

  it('returns end of day in a positive-offset timezone', () => {
    const now = new Date('2025-06-01T10:00:00.000Z');
    const endDate = computeTrialEndDate(now, 'Europe/Prague');

    // Prague is UTC+2 in June (CEST). End of day 23:59 CEST = 21:59 UTC.
    expect(endDate.getUTCHours()).toBe(21);
    expect(endDate.getUTCMinutes()).toBe(59);
  });

  it('returns end of day in a negative-offset timezone', () => {
    const now = new Date('2025-06-01T10:00:00.000Z');
    const endDate = computeTrialEndDate(now, 'America/New_York');

    // New York is UTC-4 in June (EDT). End of day 23:59 EDT = 03:59+1 UTC.
    // The date in UTC may be June 16 at 03:59
    expect(endDate.getUTCMinutes()).toBe(59);
  });

  it('handles invalid timezone gracefully by falling back to UTC', () => {
    const now = new Date('2025-06-01T10:00:00.000Z');
    const endDate = computeTrialEndDate(now, 'Invalid/Timezone');

    // Should fall back to UTC end-of-day
    expect(endDate.getUTCHours()).toBe(23);
    expect(endDate.getUTCMinutes()).toBe(59);
  });
});

// ---------------------------------------------------------------------------
// daysBetween
// ---------------------------------------------------------------------------

describe('daysBetween', () => {
  it('returns 0 for same date', () => {
    const date = new Date('2025-06-01T10:00:00.000Z');
    expect(daysBetween(date, date)).toBe(0);
  });

  it('returns 14 for dates 14 days apart', () => {
    const start = new Date('2025-06-01T00:00:00.000Z');
    const end = new Date('2025-06-15T00:00:00.000Z');
    expect(daysBetween(start, end)).toBe(14);
  });

  it('returns floor value for partial days', () => {
    const start = new Date('2025-06-01T10:00:00.000Z');
    const end = new Date('2025-06-02T09:00:00.000Z');
    expect(daysBetween(start, end)).toBe(0); // 23 hours = 0 full days
  });
});
