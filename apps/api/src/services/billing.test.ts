// ---------------------------------------------------------------------------
// Billing DB Service — Tests
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import {
  getSubscriptionByAccountId,
  createSubscription,
  updateSubscriptionFromWebhook,
  linkStripeCustomer,
  getQuotaPool,
  resetMonthlyQuota,
  decrementQuota,
  incrementQuota,
  getSubscriptionForProfile,
  getProfileCountForSubscription,
  canAddProfile,
  ensureFreeSubscription,
} from './billing';

const NOW = new Date('2025-01-15T10:00:00.000Z');
const accountId = 'acc-550e8400-e29b-41d4-a716-446655440000';
const subscriptionId = 'sub-660e8400-e29b-41d4-a716-446655440000';

// ---------------------------------------------------------------------------
// Row builders
// ---------------------------------------------------------------------------

function mockSubscriptionRow(
  overrides?: Partial<{
    id: string;
    accountId: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    tier: 'free' | 'plus' | 'family' | 'pro';
    status: 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired';
    trialEndsAt: Date | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    cancelledAt: Date | null;
    lastStripeEventTimestamp: Date | null;
  }>
) {
  return {
    id: overrides?.id ?? subscriptionId,
    accountId: overrides?.accountId ?? accountId,
    stripeCustomerId: overrides?.stripeCustomerId ?? null,
    stripeSubscriptionId: overrides?.stripeSubscriptionId ?? null,
    tier: overrides?.tier ?? 'plus',
    status: overrides?.status ?? 'trial',
    trialEndsAt: overrides?.trialEndsAt ?? null,
    currentPeriodStart: overrides?.currentPeriodStart ?? null,
    currentPeriodEnd: overrides?.currentPeriodEnd ?? null,
    cancelledAt: overrides?.cancelledAt ?? null,
    lastStripeEventTimestamp: overrides?.lastStripeEventTimestamp ?? null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function mockQuotaPoolRow(
  overrides?: Partial<{
    id: string;
    subscriptionId: string;
    monthlyLimit: number;
    usedThisMonth: number;
    cycleResetAt: Date;
  }>
) {
  return {
    id: overrides?.id ?? 'qp-1',
    subscriptionId: overrides?.subscriptionId ?? subscriptionId,
    monthlyLimit: overrides?.monthlyLimit ?? 500,
    usedThisMonth: overrides?.usedThisMonth ?? 42,
    cycleResetAt:
      overrides?.cycleResetAt ?? new Date('2025-02-15T10:00:00.000Z'),
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function mockTopUpRow(
  overrides?: Partial<{
    id: string;
    subscriptionId: string;
    remaining: number;
    expiresAt: Date;
    purchasedAt: Date;
  }>
) {
  return {
    id: overrides?.id ?? 'tu-1',
    subscriptionId: overrides?.subscriptionId ?? subscriptionId,
    amount: 500,
    remaining: overrides?.remaining ?? 500,
    purchasedAt: overrides?.purchasedAt ?? NOW,
    expiresAt: overrides?.expiresAt ?? new Date('2026-01-15T10:00:00.000Z'),
    createdAt: NOW,
  };
}

function mockProfileRow(
  overrides?: Partial<{ id: string; accountId: string }>
) {
  return {
    id: overrides?.id ?? 'profile-1',
    accountId: overrides?.accountId ?? accountId,
    displayName: 'Test',
    personaType: 'LEARNER',
    isOwner: true,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

// ---------------------------------------------------------------------------
// Mock DB factory
// ---------------------------------------------------------------------------

function createMockDb({
  subscriptionFindFirst = undefined as
    | ReturnType<typeof mockSubscriptionRow>
    | undefined,
  quotaPoolFindFirst = undefined as
    | ReturnType<typeof mockQuotaPoolRow>
    | undefined,
  topUpFindFirst = undefined as ReturnType<typeof mockTopUpRow> | undefined,
  profileFindFirst = undefined as ReturnType<typeof mockProfileRow> | undefined,
  selectResult = [] as unknown[],
  insertReturning = [] as unknown[],
  updateReturning = [] as unknown[],
} = {}): Database {
  const updateWhere = jest.fn().mockReturnValue({
    returning: jest.fn().mockResolvedValue(updateReturning),
  });
  const updateSet = jest.fn().mockReturnValue({ where: updateWhere });

  return {
    query: {
      subscriptions: {
        findFirst: jest.fn().mockResolvedValue(subscriptionFindFirst),
      },
      quotaPools: {
        findFirst: jest.fn().mockResolvedValue(quotaPoolFindFirst),
      },
      topUpCredits: {
        findFirst: jest.fn().mockResolvedValue(topUpFindFirst),
      },
      profiles: {
        findFirst: jest.fn().mockResolvedValue(profileFindFirst),
      },
    },
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue(insertReturning),
      }),
    }),
    update: jest.fn().mockReturnValue({ set: updateSet }),
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(selectResult),
      }),
    }),
  } as unknown as Database;
}

// ---------------------------------------------------------------------------
// getSubscriptionByAccountId
// ---------------------------------------------------------------------------

describe('getSubscriptionByAccountId', () => {
  it('returns null when no subscription exists', async () => {
    const db = createMockDb({ subscriptionFindFirst: undefined });
    const result = await getSubscriptionByAccountId(db, accountId);

    expect(result).toBeNull();
  });

  it('returns mapped subscription when found', async () => {
    const row = mockSubscriptionRow({ tier: 'plus', status: 'active' });
    const db = createMockDb({ subscriptionFindFirst: row });
    const result = await getSubscriptionByAccountId(db, accountId);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(subscriptionId);
    expect(result!.accountId).toBe(accountId);
    expect(result!.tier).toBe('plus');
    expect(result!.status).toBe('active');
    expect(result!.createdAt).toBe('2025-01-15T10:00:00.000Z');
  });

  it('maps null timestamps correctly', async () => {
    const row = mockSubscriptionRow();
    const db = createMockDb({ subscriptionFindFirst: row });
    const result = await getSubscriptionByAccountId(db, accountId);

    expect(result!.trialEndsAt).toBeNull();
    expect(result!.currentPeriodStart).toBeNull();
    expect(result!.currentPeriodEnd).toBeNull();
    expect(result!.cancelledAt).toBeNull();
    expect(result!.lastStripeEventTimestamp).toBeNull();
  });

  it('maps non-null timestamps to ISO strings', async () => {
    const row = mockSubscriptionRow({
      trialEndsAt: new Date('2025-01-29T10:00:00.000Z'),
      currentPeriodStart: NOW,
      currentPeriodEnd: new Date('2025-02-15T10:00:00.000Z'),
    });
    const db = createMockDb({ subscriptionFindFirst: row });
    const result = await getSubscriptionByAccountId(db, accountId);

    expect(result!.trialEndsAt).toBe('2025-01-29T10:00:00.000Z');
    expect(result!.currentPeriodStart).toBe('2025-01-15T10:00:00.000Z');
    expect(result!.currentPeriodEnd).toBe('2025-02-15T10:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// createSubscription
// ---------------------------------------------------------------------------

describe('createSubscription', () => {
  it('returns mapped subscription row', async () => {
    const row = mockSubscriptionRow({ tier: 'plus', status: 'trial' });
    const db = createMockDb({ insertReturning: [row] });
    const result = await createSubscription(db, accountId, 'plus', 500);

    expect(result.accountId).toBe(accountId);
    expect(result.tier).toBe('plus');
    expect(result.status).toBe('trial');
  });

  it('creates quota pool alongside subscription', async () => {
    const row = mockSubscriptionRow();
    const db = createMockDb({ insertReturning: [row] });
    await createSubscription(db, accountId, 'plus', 500);

    // db.insert called twice: once for subscription, once for quota pool
    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it('passes stripe IDs when provided', async () => {
    const row = mockSubscriptionRow({
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_456',
    });
    const db = createMockDb({ insertReturning: [row] });
    await createSubscription(db, accountId, 'plus', 500, {
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_456',
    });

    const insertCall = (db.insert as jest.Mock).mock.results[0].value;
    const valuesCall = insertCall.values as jest.Mock;
    const values = valuesCall.mock.calls[0][0];
    expect(values.stripeCustomerId).toBe('cus_123');
    expect(values.stripeSubscriptionId).toBe('sub_456');
  });

  it('defaults status to trial when not specified', async () => {
    const row = mockSubscriptionRow({ status: 'trial' });
    const db = createMockDb({ insertReturning: [row] });
    await createSubscription(db, accountId, 'plus', 500);

    const insertCall = (db.insert as jest.Mock).mock.results[0].value;
    const valuesCall = insertCall.values as jest.Mock;
    const values = valuesCall.mock.calls[0][0];
    expect(values.status).toBe('trial');
  });
});

// ---------------------------------------------------------------------------
// updateSubscriptionFromWebhook
// ---------------------------------------------------------------------------

describe('updateSubscriptionFromWebhook', () => {
  it('returns null when subscription not found', async () => {
    const db = createMockDb({ subscriptionFindFirst: undefined });
    const result = await updateSubscriptionFromWebhook(db, 'sub_unknown', {
      status: 'active',
      lastStripeEventTimestamp: NOW.toISOString(),
    });

    expect(result).toBeNull();
  });

  it('updates subscription with new status', async () => {
    const existing = mockSubscriptionRow({
      stripeSubscriptionId: 'sub_stripe_1',
      lastStripeEventTimestamp: null,
    });
    const updated = mockSubscriptionRow({
      ...existing,
      status: 'active',
      lastStripeEventTimestamp: NOW,
    });
    const db = createMockDb({
      subscriptionFindFirst: existing,
      updateReturning: [updated],
    });

    const result = await updateSubscriptionFromWebhook(db, 'sub_stripe_1', {
      status: 'active',
      lastStripeEventTimestamp: NOW.toISOString(),
    });

    expect(result).not.toBeNull();
    expect(result!.status).toBe('active');
    expect(db.update).toHaveBeenCalled();
  });

  it('skips update when incoming event is older (idempotency)', async () => {
    const futureTs = new Date('2025-02-01T00:00:00.000Z');
    const existing = mockSubscriptionRow({
      stripeSubscriptionId: 'sub_stripe_1',
      lastStripeEventTimestamp: futureTs,
    });
    const db = createMockDb({ subscriptionFindFirst: existing });

    const result = await updateSubscriptionFromWebhook(db, 'sub_stripe_1', {
      status: 'cancelled',
      lastStripeEventTimestamp: '2025-01-20T00:00:00.000Z', // older
    });

    // Should return existing without updating
    expect(result).not.toBeNull();
    expect(result!.status).toBe('trial'); // original status unchanged
    expect(db.update).not.toHaveBeenCalled();
  });

  it('skips update when timestamps are equal', async () => {
    const existing = mockSubscriptionRow({
      stripeSubscriptionId: 'sub_stripe_1',
      lastStripeEventTimestamp: NOW,
    });
    const db = createMockDb({ subscriptionFindFirst: existing });

    const result = await updateSubscriptionFromWebhook(db, 'sub_stripe_1', {
      status: 'active',
      lastStripeEventTimestamp: NOW.toISOString(), // same timestamp
    });

    expect(db.update).not.toHaveBeenCalled();
  });

  it('applies partial updates (only specified fields)', async () => {
    const existing = mockSubscriptionRow({
      stripeSubscriptionId: 'sub_stripe_1',
      lastStripeEventTimestamp: null,
    });
    const updated = mockSubscriptionRow({
      ...existing,
      cancelledAt: NOW,
    });
    const db = createMockDb({
      subscriptionFindFirst: existing,
      updateReturning: [updated],
    });

    await updateSubscriptionFromWebhook(db, 'sub_stripe_1', {
      cancelledAt: NOW.toISOString(),
      lastStripeEventTimestamp: NOW.toISOString(),
    });

    expect(db.update).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// linkStripeCustomer
// ---------------------------------------------------------------------------

describe('linkStripeCustomer', () => {
  it('returns null when subscription not found', async () => {
    const db = createMockDb({ subscriptionFindFirst: undefined });
    const result = await linkStripeCustomer(db, accountId, 'cus_123');

    expect(result).toBeNull();
  });

  it('updates stripeCustomerId on the subscription', async () => {
    const existing = mockSubscriptionRow();
    const updated = mockSubscriptionRow({ stripeCustomerId: 'cus_new' });
    const db = createMockDb({
      subscriptionFindFirst: existing,
      updateReturning: [updated],
    });

    const result = await linkStripeCustomer(db, accountId, 'cus_new');

    expect(result).not.toBeNull();
    expect(result!.stripeCustomerId).toBe('cus_new');
    expect(db.update).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getQuotaPool
// ---------------------------------------------------------------------------

describe('getQuotaPool', () => {
  it('returns null when no quota pool exists', async () => {
    const db = createMockDb({ quotaPoolFindFirst: undefined });
    const result = await getQuotaPool(db, subscriptionId);

    expect(result).toBeNull();
  });

  it('returns mapped quota pool when found', async () => {
    const row = mockQuotaPoolRow({ monthlyLimit: 500, usedThisMonth: 42 });
    const db = createMockDb({ quotaPoolFindFirst: row });
    const result = await getQuotaPool(db, subscriptionId);

    expect(result).not.toBeNull();
    expect(result!.monthlyLimit).toBe(500);
    expect(result!.usedThisMonth).toBe(42);
    expect(result!.cycleResetAt).toBe('2025-02-15T10:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// resetMonthlyQuota
// ---------------------------------------------------------------------------

describe('resetMonthlyQuota', () => {
  it('returns null when quota pool not found', async () => {
    const db = createMockDb({ quotaPoolFindFirst: undefined });
    const result = await resetMonthlyQuota(db, subscriptionId, 500);

    expect(result).toBeNull();
  });

  it('resets usedThisMonth to 0 and updates limit', async () => {
    const existing = mockQuotaPoolRow({
      usedThisMonth: 300,
      monthlyLimit: 500,
    });
    const updated = mockQuotaPoolRow({ usedThisMonth: 0, monthlyLimit: 1500 });
    const db = createMockDb({
      quotaPoolFindFirst: existing,
      updateReturning: [updated],
    });

    const result = await resetMonthlyQuota(db, subscriptionId, 1500);

    expect(result).not.toBeNull();
    expect(result!.usedThisMonth).toBe(0);
    expect(result!.monthlyLimit).toBe(1500);
    expect(db.update).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// decrementQuota
// ---------------------------------------------------------------------------

describe('decrementQuota', () => {
  it('returns failure when no quota pool exists (atomic UPDATE returns no rows)', async () => {
    const db = createMockDb({ updateReturning: [] });
    const result = await decrementQuota(db, subscriptionId);

    expect(result.success).toBe(false);
    expect(result.source).toBe('none');
  });

  it('decrements monthly quota atomically when under limit', async () => {
    const updatedPool = mockQuotaPoolRow({
      usedThisMonth: 101,
      monthlyLimit: 500,
    });
    const db = createMockDb({
      updateReturning: [updatedPool],
    });

    const result = await decrementQuota(db, subscriptionId);

    expect(result.success).toBe(true);
    expect(result.source).toBe('monthly');
    expect(result.remainingMonthly).toBe(399);
    expect(db.update).toHaveBeenCalled();
  });

  it('falls back to top-up credits when monthly atomic UPDATE returns no rows', async () => {
    const topUp = mockTopUpRow({ remaining: 100 });
    const updatedTopUp = mockTopUpRow({ remaining: 99 });

    // First update (monthly) returns empty, second update (top-up) returns result
    const updateReturningFn = jest
      .fn()
      .mockResolvedValueOnce([]) // monthly: WHERE used < limit fails
      .mockResolvedValueOnce([updatedTopUp]); // top-up: succeeds
    const updateWhere = jest
      .fn()
      .mockReturnValue({ returning: updateReturningFn });
    const updateSet = jest.fn().mockReturnValue({ where: updateWhere });

    const db = {
      query: {
        subscriptions: { findFirst: jest.fn().mockResolvedValue(undefined) },
        quotaPools: { findFirst: jest.fn().mockResolvedValue(undefined) },
        topUpCredits: { findFirst: jest.fn().mockResolvedValue(topUp) },
        profiles: { findFirst: jest.fn().mockResolvedValue(undefined) },
      },
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([]),
        }),
      }),
      update: jest.fn().mockReturnValue({ set: updateSet }),
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      }),
    } as unknown as Database;

    const result = await decrementQuota(db, subscriptionId);

    expect(result.success).toBe(true);
    expect(result.source).toBe('top_up');
    expect(result.remainingTopUp).toBe(99);
  });

  it('returns failure when both monthly and top-up are exhausted', async () => {
    const db = createMockDb({
      updateReturning: [], // monthly atomic fails
      topUpFindFirst: undefined, // no top-up credits
    });

    const result = await decrementQuota(db, subscriptionId);

    expect(result.success).toBe(false);
    expect(result.source).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// incrementQuota
// ---------------------------------------------------------------------------

describe('incrementQuota', () => {
  it('calls update on quota pool to decrement usedThisMonth', async () => {
    const db = createMockDb();

    await incrementQuota(db, subscriptionId);

    expect(db.update).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ensureFreeSubscription
// ---------------------------------------------------------------------------

describe('ensureFreeSubscription', () => {
  it('returns existing subscription when one exists', async () => {
    const existing = mockSubscriptionRow({ tier: 'plus', status: 'active' });
    const db = createMockDb({ subscriptionFindFirst: existing });
    const result = await ensureFreeSubscription(db, accountId);

    expect(result.tier).toBe('plus');
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('creates free-tier subscription when none exists', async () => {
    const created = mockSubscriptionRow({
      tier: 'free',
      status: 'active',
    });
    const db = createMockDb({
      subscriptionFindFirst: undefined,
      insertReturning: [created],
    });
    const result = await ensureFreeSubscription(db, accountId);

    expect(result.tier).toBe('free');
    expect(result.status).toBe('active');
    expect(db.insert).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getSubscriptionForProfile
// ---------------------------------------------------------------------------

describe('getSubscriptionForProfile', () => {
  it('returns null when profile not found', async () => {
    const db = createMockDb({ profileFindFirst: undefined });
    const result = await getSubscriptionForProfile(db, 'unknown-profile');

    expect(result).toBeNull();
  });

  it('resolves profile → account → subscription', async () => {
    const profile = mockProfileRow({ accountId });
    const sub = mockSubscriptionRow({ tier: 'family' });
    const db = createMockDb({
      profileFindFirst: profile,
      subscriptionFindFirst: sub,
    });

    const result = await getSubscriptionForProfile(db, 'profile-1');

    expect(result).not.toBeNull();
    expect(result!.tier).toBe('family');
    expect(result!.accountId).toBe(accountId);
  });
});

// ---------------------------------------------------------------------------
// getProfileCountForSubscription
// ---------------------------------------------------------------------------

describe('getProfileCountForSubscription', () => {
  it('returns 0 when subscription not found', async () => {
    const db = createMockDb({ subscriptionFindFirst: undefined });
    const result = await getProfileCountForSubscription(db, 'unknown');

    expect(result).toBe(0);
  });

  it('returns count from select query', async () => {
    const sub = mockSubscriptionRow();
    const db = createMockDb({
      subscriptionFindFirst: sub,
      selectResult: [{ count: 3 }],
    });

    const result = await getProfileCountForSubscription(db, subscriptionId);

    expect(result).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// canAddProfile
// ---------------------------------------------------------------------------

describe('canAddProfile', () => {
  it('returns false when subscription not found', async () => {
    const db = createMockDb({ subscriptionFindFirst: undefined });
    const result = await canAddProfile(db, 'unknown');

    expect(result).toBe(false);
  });

  it('returns true when family tier has room (< 4)', async () => {
    const sub = mockSubscriptionRow({ tier: 'family' });
    const db = createMockDb({
      subscriptionFindFirst: sub,
      selectResult: [{ count: 2 }],
    });

    const result = await canAddProfile(db, subscriptionId);

    expect(result).toBe(true);
  });

  it('returns false when family tier is full (= 4)', async () => {
    const sub = mockSubscriptionRow({ tier: 'family' });
    const db = createMockDb({
      subscriptionFindFirst: sub,
      selectResult: [{ count: 4 }],
    });

    const result = await canAddProfile(db, subscriptionId);

    expect(result).toBe(false);
  });

  it('returns false for plus tier with 1 existing profile', async () => {
    const sub = mockSubscriptionRow({ tier: 'plus' });
    const db = createMockDb({
      subscriptionFindFirst: sub,
      selectResult: [{ count: 1 }],
    });

    const result = await canAddProfile(db, subscriptionId);

    expect(result).toBe(false);
  });

  it('returns true for pro tier with 5 profiles (max 6)', async () => {
    const sub = mockSubscriptionRow({ tier: 'pro' });
    const db = createMockDb({
      subscriptionFindFirst: sub,
      selectResult: [{ count: 5 }],
    });

    const result = await canAddProfile(db, subscriptionId);

    expect(result).toBe(true);
  });
});
