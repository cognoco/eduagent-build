import { getTierConfig, isValidTransition } from './subscription';

// ---------------------------------------------------------------------------
// getTierConfig
// ---------------------------------------------------------------------------

describe('getTierConfig', () => {
  it('returns correct config for free tier', () => {
    const config = getTierConfig('free');

    expect(config.monthlyQuota).toBe(100);
    expect(config.dailyLimit).toBe(10);
    expect(config.maxProfiles).toBe(1);
    expect(config.premiumModelProfiles).toBe(0);
    expect(config.llmTier).toBe('flash');
    expect(config.priceMonthly).toBe(0);
    expect(config.priceYearly).toBe(0);
    expect(config.topUpPrice).toBe(0);
    expect(config.topUpAmount).toBe(0);
  });

  it('returns correct config for plus tier', () => {
    const config = getTierConfig('plus');

    expect(config.monthlyQuota).toBe(700);
    expect(config.dailyLimit).toBeNull();
    expect(config.maxProfiles).toBe(1);
    expect(config.premiumModelProfiles).toBe(0);
    expect(config.llmTier).toBe('standard');
    expect(config.priceMonthly).toBe(18.99);
    expect(config.priceYearly).toBe(168);
    expect(config.topUpPrice).toBe(10);
    expect(config.topUpAmount).toBe(500);
  });

  it('returns correct config for family tier', () => {
    const config = getTierConfig('family');

    expect(config.monthlyQuota).toBe(1500);
    expect(config.maxProfiles).toBe(4);
    expect(config.premiumModelProfiles).toBe(0);
    expect(config.llmTier).toBe('standard');
    expect(config.priceMonthly).toBe(28.99);
    expect(config.priceYearly).toBe(252);
    expect(config.topUpPrice).toBe(5);
    expect(config.topUpAmount).toBe(500);
  });

  it('returns correct config for pro tier', () => {
    const config = getTierConfig('pro');

    expect(config.monthlyQuota).toBe(3000);
    expect(config.maxProfiles).toBe(6);
    expect(config.premiumModelProfiles).toBe(2);
    expect(config.llmTier).toBe('standard');
    expect(config.priceMonthly).toBe(48.99);
    expect(config.priceYearly).toBe(432);
    expect(config.topUpPrice).toBe(5);
    expect(config.topUpAmount).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// isValidTransition
// ---------------------------------------------------------------------------

describe('isValidTransition', () => {
  it('allows trial -> active', () => {
    expect(isValidTransition('trial', 'active')).toBe(true);
  });

  it('allows trial -> expired', () => {
    expect(isValidTransition('trial', 'expired')).toBe(true);
  });

  it('allows active -> past_due', () => {
    expect(isValidTransition('active', 'past_due')).toBe(true);
  });

  it('allows active -> cancelled', () => {
    expect(isValidTransition('active', 'cancelled')).toBe(true);
  });

  it('allows past_due -> active (payment recovered)', () => {
    expect(isValidTransition('past_due', 'active')).toBe(true);
  });

  it('allows past_due -> cancelled', () => {
    expect(isValidTransition('past_due', 'cancelled')).toBe(true);
  });

  it('allows cancelled -> expired', () => {
    expect(isValidTransition('cancelled', 'expired')).toBe(true);
  });

  it('rejects expired -> anything (terminal state)', () => {
    expect(isValidTransition('expired', 'active')).toBe(false);
    expect(isValidTransition('expired', 'trial')).toBe(false);
    expect(isValidTransition('expired', 'past_due')).toBe(false);
  });

  it('rejects trial -> cancelled (must go through active first)', () => {
    expect(isValidTransition('trial', 'cancelled')).toBe(false);
  });
});
