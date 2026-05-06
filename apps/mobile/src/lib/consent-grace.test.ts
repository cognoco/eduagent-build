import {
  GRACE_PERIOD_DAYS,
  getGracePeriodDaysRemaining,
  isInGracePeriod,
} from './consent-grace';

describe('consent-grace', () => {
  const realNow = Date.now;

  afterEach(() => {
    Date.now = realNow;
  });

  function freezeTime(iso: string): void {
    Date.now = () => new Date(iso).getTime();
  }

  it('returns 7 on the same day withdrawal happened', () => {
    freezeTime('2026-05-06T10:00:00Z');
    expect(getGracePeriodDaysRemaining('2026-05-06T09:59:00Z')).toBe(7);
  });

  it('returns 1 with 24h left', () => {
    freezeTime('2026-05-12T09:59:00Z');
    expect(getGracePeriodDaysRemaining('2026-05-06T09:59:00Z')).toBe(1);
  });

  it('returns 0 once grace has elapsed', () => {
    freezeTime('2026-05-13T10:01:00Z');
    expect(getGracePeriodDaysRemaining('2026-05-06T09:59:00Z')).toBe(0);
  });

  it('returns 0 for null respondedAt', () => {
    expect(getGracePeriodDaysRemaining(null)).toBe(0);
  });

  it('isInGracePeriod is true when days remaining > 0', () => {
    freezeTime('2026-05-10T10:00:00Z');
    expect(isInGracePeriod('2026-05-06T09:59:00Z')).toBe(true);
  });

  it('isInGracePeriod is false when grace elapsed', () => {
    freezeTime('2026-05-13T11:00:00Z');
    expect(isInGracePeriod('2026-05-06T09:59:00Z')).toBe(false);
  });

  it('GRACE_PERIOD_DAYS is 7', () => {
    expect(GRACE_PERIOD_DAYS).toBe(7);
  });
});
