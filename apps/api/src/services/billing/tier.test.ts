// ---------------------------------------------------------------------------
// Billing — Tier pure-function unit tests
// Tests ONLY getUpgradePrompt and getTopUpPriceCents.
// handleTierChange is a DB-mutating transaction covered by integration tests.
// ---------------------------------------------------------------------------

import { getUpgradePrompt, getTopUpPriceCents } from './tier';
import { getTierConfig } from '../subscription';

// ---------------------------------------------------------------------------
// getUpgradePrompt
// ---------------------------------------------------------------------------

describe('getUpgradePrompt', () => {
  // -------------------------------------------------------------------------
  // Free tier
  // -------------------------------------------------------------------------

  it('free tier well under cap → null', () => {
    const freeLimit = getTierConfig('free').monthlyQuota;
    const result = getUpgradePrompt({
      tier: 'free',
      usedThisMonth: freeLimit - 1,
      monthlyLimit: freeLimit,
      topUpPurchasesThisCycle: 0,
      profileCount: 1,
      isAddingProfile: false,
    });
    expect(result).toBeNull();
  });

  it('free tier at exact cap (used === limit) → quota_cap_reached', () => {
    const freeLimit = getTierConfig('free').monthlyQuota;
    const result = getUpgradePrompt({
      tier: 'free',
      usedThisMonth: freeLimit,
      monthlyLimit: freeLimit,
      topUpPurchasesThisCycle: 0,
      profileCount: 1,
      isAddingProfile: false,
    });
    expect(result).not.toBeNull();
    expect(result?.reason).toBe('quota_cap_reached');
    expect(result?.suggestedTier).toBe('plus');
    expect(result?.message).toBeTruthy();
  });

  it('free tier above cap → quota_cap_reached', () => {
    const freeLimit = getTierConfig('free').monthlyQuota;
    const result = getUpgradePrompt({
      tier: 'free',
      usedThisMonth: freeLimit + 5,
      monthlyLimit: freeLimit,
      topUpPurchasesThisCycle: 0,
      profileCount: 1,
      isAddingProfile: false,
    });
    expect(result).not.toBeNull();
    expect(result?.reason).toBe('quota_cap_reached');
    expect(result?.suggestedTier).toBe('plus');
  });

  it('free tier under cap with weird inputs (isAddingProfile=true, top-ups=5) → null', () => {
    const freeLimit = getTierConfig('free').monthlyQuota;
    const result = getUpgradePrompt({
      tier: 'free',
      usedThisMonth: freeLimit - 10,
      monthlyLimit: freeLimit,
      topUpPurchasesThisCycle: 5,
      profileCount: 1,
      isAddingProfile: true,
    });
    // Only the free-tier quota check applies; other conditions only fire for plus/family
    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Plus tier
  // -------------------------------------------------------------------------

  it('plus tier with isAddingProfile=true → adding_family_member', () => {
    const result = getUpgradePrompt({
      tier: 'plus',
      usedThisMonth: 0,
      monthlyLimit: getTierConfig('plus').monthlyQuota,
      topUpPurchasesThisCycle: 0,
      profileCount: 1,
      isAddingProfile: true,
    });
    expect(result).not.toBeNull();
    expect(result?.reason).toBe('adding_family_member');
    expect(result?.suggestedTier).toBe('family');
    expect(result?.message).toBeTruthy();
  });

  it('plus tier with topUpPurchasesThisCycle=3 (boundary) → frequent_top_ups', () => {
    const result = getUpgradePrompt({
      tier: 'plus',
      usedThisMonth: 0,
      monthlyLimit: getTierConfig('plus').monthlyQuota,
      topUpPurchasesThisCycle: 3,
      profileCount: 1,
      isAddingProfile: false,
    });
    expect(result).not.toBeNull();
    expect(result?.reason).toBe('frequent_top_ups');
    expect(result?.suggestedTier).toBe('family');
    expect(result?.message).toBeTruthy();
  });

  it('plus tier with topUpPurchasesThisCycle=2 (just below boundary) → null', () => {
    const result = getUpgradePrompt({
      tier: 'plus',
      usedThisMonth: 0,
      monthlyLimit: getTierConfig('plus').monthlyQuota,
      topUpPurchasesThisCycle: 2,
      profileCount: 1,
      isAddingProfile: false,
    });
    expect(result).toBeNull();
  });

  it('plus tier with BOTH isAddingProfile=true AND topUpPurchasesThisCycle=3 → adding_family_member (checked first)', () => {
    const result = getUpgradePrompt({
      tier: 'plus',
      usedThisMonth: 0,
      monthlyLimit: getTierConfig('plus').monthlyQuota,
      topUpPurchasesThisCycle: 3,
      profileCount: 1,
      isAddingProfile: true,
    });
    // adding_family_member check precedes frequent_top_ups in source
    expect(result).not.toBeNull();
    expect(result?.reason).toBe('adding_family_member');
    expect(result?.suggestedTier).toBe('family');
  });

  // -------------------------------------------------------------------------
  // Family tier
  // -------------------------------------------------------------------------

  it('family tier with profileCount=4 → max_profiles_reached', () => {
    const result = getUpgradePrompt({
      tier: 'family',
      usedThisMonth: 0,
      monthlyLimit: getTierConfig('family').monthlyQuota,
      topUpPurchasesThisCycle: 0,
      profileCount: 4,
      isAddingProfile: false,
    });
    expect(result).not.toBeNull();
    expect(result?.reason).toBe('max_profiles_reached');
    expect(result?.suggestedTier).toBe('pro');
    expect(result?.message).toBeTruthy();
  });

  it('family tier with profileCount=3 and isAddingProfile=false → null', () => {
    const result = getUpgradePrompt({
      tier: 'family',
      usedThisMonth: 0,
      monthlyLimit: getTierConfig('family').monthlyQuota,
      topUpPurchasesThisCycle: 0,
      profileCount: 3,
      isAddingProfile: false,
    });
    expect(result).toBeNull();
  });

  it('family tier with profileCount=3 and isAddingProfile=true → null (condition requires profileCount >= 4)', () => {
    // The OR clause in source is: profileCount >= 4 || (isAddingProfile && profileCount >= 4)
    // Both branches require profileCount >= 4, so profileCount=3 never fires regardless of isAddingProfile
    const result = getUpgradePrompt({
      tier: 'family',
      usedThisMonth: 0,
      monthlyLimit: getTierConfig('family').monthlyQuota,
      topUpPurchasesThisCycle: 0,
      profileCount: 3,
      isAddingProfile: true,
    });
    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Pro tier
  // -------------------------------------------------------------------------

  it('pro tier — no upgrade prompt for any combination → null', () => {
    const result = getUpgradePrompt({
      tier: 'pro',
      usedThisMonth: getTierConfig('pro').monthlyQuota + 100,
      monthlyLimit: getTierConfig('pro').monthlyQuota,
      topUpPurchasesThisCycle: 99,
      profileCount: 10,
      isAddingProfile: true,
    });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getTopUpPriceCents
// ---------------------------------------------------------------------------

describe('getTopUpPriceCents', () => {
  it('free tier → null (topUpPrice is 0, top-ups not available)', () => {
    expect(getTierConfig('free').topUpPrice).toBe(0);
    expect(getTopUpPriceCents('free')).toBeNull();
  });

  it('plus tier → topUpPrice × 100 in cents', () => {
    const config = getTierConfig('plus');
    expect(getTopUpPriceCents('plus')).toBe(config.topUpPrice * 100);
  });

  it('family tier → topUpPrice × 100 in cents', () => {
    const config = getTierConfig('family');
    expect(getTopUpPriceCents('family')).toBe(config.topUpPrice * 100);
  });

  it('pro tier → topUpPrice × 100 in cents', () => {
    const config = getTierConfig('pro');
    expect(getTopUpPriceCents('pro')).toBe(config.topUpPrice * 100);
  });

  it('plus tier: topUpPrice=10 → returns 1000', () => {
    expect(getTierConfig('plus').topUpPrice).toBe(10);
    expect(getTopUpPriceCents('plus')).toBe(1000);
  });

  it('family tier: topUpPrice=5 → returns 500', () => {
    expect(getTierConfig('family').topUpPrice).toBe(5);
    expect(getTopUpPriceCents('family')).toBe(500);
  });

  it('pro tier: topUpPrice=5 → returns 500', () => {
    expect(getTierConfig('pro').topUpPrice).toBe(5);
    expect(getTopUpPriceCents('pro')).toBe(500);
  });
});
