// WI-1072: regression tests for shared billing helpers (billing-shared.ts)
// Verifies that the extracted helpers produce the same output that the inline
// copies in quota-provision.ts / quota-provision-v2.ts previously produced.

import { getTierConfig } from '../subscription';
import {
  nextMonthlyReset,
  getProfileQuotaLimits,
  mapProfileQuotaUsageRow,
  extractTierQuota,
} from './billing-shared';

describe('nextMonthlyReset', () => {
  it('adds one month to the given date', () => {
    const base = new Date('2024-01-15T10:00:00Z');
    const result = nextMonthlyReset(base);
    expect(result.getUTCFullYear()).toBe(2024);
    expect(result.getUTCMonth()).toBe(1); // February (0-indexed)
    expect(result.getUTCDate()).toBe(15);
  });

  it('handles month roll-over (December → January)', () => {
    const base = new Date('2024-12-01T00:00:00Z');
    const result = nextMonthlyReset(base);
    expect(result.getUTCFullYear()).toBe(2025);
    expect(result.getUTCMonth()).toBe(0); // January
  });

  it('does not mutate the input date', () => {
    const base = new Date('2024-06-15T12:00:00Z');
    const originalTime = base.getTime();
    nextMonthlyReset(base);
    expect(base.getTime()).toBe(originalTime);
  });
});

describe('getProfileQuotaLimits', () => {
  it('returns per-profile limits for free tier owner', () => {
    const result = getProfileQuotaLimits('free', 'owner');
    expect(result).not.toBeNull();
    expect(result?.monthlyLimit).toBe(100);
    expect(result?.dailyLimit).toBe(10);
  });

  it('returns per-profile limits for plus tier owner', () => {
    const result = getProfileQuotaLimits('plus', 'owner');
    expect(result).not.toBeNull();
    expect(result?.monthlyLimit).toBe(700);
    expect(result?.dailyLimit).toBeNull();
  });

  it('returns null for family tier (shared-pool, ownerMonthlyQuota=null)', () => {
    // family uses quotaModel='shared-pool', so per-profile model doesn't apply
    const result = getProfileQuotaLimits('family', 'owner');
    expect(result).toBeNull();
  });

  it('returns null for pro tier (shared-pool)', () => {
    const result = getProfileQuotaLimits('pro', 'owner');
    expect(result).toBeNull();
  });

  it('returns child limits for free tier child', () => {
    const result = getProfileQuotaLimits('free', 'child');
    expect(result).not.toBeNull();
    // child limits come from childMonthlyQuota / childDailyQuota
    expect(result?.monthlyLimit).toBeGreaterThan(0);
  });
});

describe('mapProfileQuotaUsageRow', () => {
  it('maps a DB row to the snapshot shape, converting cycleResetAt to ISO string', () => {
    const resetDate = new Date('2024-07-01T00:00:00.000Z');
    const row = {
      id: 'row-1',
      subscriptionId: 'sub-1',
      profileId: 'profile-1',
      role: 'owner' as const,
      monthlyLimit: 100,
      usedThisMonth: 42,
      dailyLimit: 10,
      usedToday: 3,
      cycleResetAt: resetDate,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const snapshot = mapProfileQuotaUsageRow(row);

    expect(snapshot.id).toBe('row-1');
    expect(snapshot.subscriptionId).toBe('sub-1');
    expect(snapshot.profileId).toBe('profile-1');
    expect(snapshot.role).toBe('owner');
    expect(snapshot.monthlyLimit).toBe(100);
    expect(snapshot.usedThisMonth).toBe(42);
    expect(snapshot.dailyLimit).toBe(10);
    expect(snapshot.usedToday).toBe(3);
    expect(snapshot.cycleResetAt).toBe('2024-07-01T00:00:00.000Z');
  });

  it('preserves null dailyLimit', () => {
    const row = {
      id: 'row-2',
      subscriptionId: 'sub-2',
      profileId: 'profile-2',
      role: 'owner' as const,
      monthlyLimit: 700,
      usedThisMonth: 0,
      dailyLimit: null,
      usedToday: 0,
      cycleResetAt: new Date('2024-08-01T00:00:00Z'),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const snapshot = mapProfileQuotaUsageRow(row);
    expect(snapshot.dailyLimit).toBeNull();
  });
});

describe('extractTierQuota', () => {
  it.each(['free', 'plus', 'family', 'pro'] as const)(
    'picks monthlyQuota and dailyLimit from the tier config for %s',
    (tier) => {
      const config = getTierConfig(tier);
      expect(extractTierQuota(tier)).toEqual({
        monthlyQuota: config.monthlyQuota,
        dailyLimit: config.dailyLimit,
      });
    },
  );
});
