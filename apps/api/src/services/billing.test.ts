// ---------------------------------------------------------------------------
// Billing DB Service — Tests
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';

const mockCaptureException = jest.fn();
const mockInngestSend = jest.fn().mockResolvedValue(undefined);

jest.mock('../inngest/client', () => {
  const actual = jest.requireActual(
    '../inngest/client',
  ) as typeof import('../inngest/client');
  return {
    ...actual,
    inngest: {
      send: (...args: unknown[]) => mockInngestSend(...args),
    },
  };
});

jest.mock(
  './sentry' /* gc1-allow: Sentry is a true external boundary (error-reporting SaaS); captureException is intercepted here to assert that specific error escalations fire — not to suppress real Sentry calls in integration tests */,
  () => {
    const actual = jest.requireActual('./sentry') as typeof import('./sentry');
    return {
      ...actual,
      captureException: (...args: unknown[]) => mockCaptureException(...args),
    };
  },
);

// [WI-1239 / 779-strip] updateSubscriptionFromWebhook, linkStripeCustomer,
// activateSubscriptionFromCheckout, purchaseTopUpCredits,
// countTopUpPurchasesSinceCycleStart, handleTierChange, getUpgradePrompt,
// listFamilyMembers, addProfileToSubscription, removeProfileFromSubscription,
// downgradeAllFamilyProfiles, getFamilyPoolStatus, isRevenuecatEventProcessed,
// activateSubscriptionFromRevenuecat, and updateSubscriptionFromRevenuecatWebhook
// were removed from this import — every one had zero production callers even
// before this WI (routes/billing.ts, stripe-webhook.ts, revenuecat-webhook.ts
// all already dispatched exclusively to the `-V2` twins); their test blocks
// below were deleted alongside. getSubscriptionForProfile was removed too —
// its own function was deleted from family.ts (compiler found it had no
// caller either). See subscription-core.ts / family.ts / top-up.ts header
// comments for the per-symbol rationale.
import {
  getSubscriptionByAccountId,
  createSubscription,
  getQuotaPool,
  resetMonthlyQuota,
  decrementQuota,
  incrementQuota,
  safeRefundQuota,
  getProfileCountForSubscription,
  canAddProfile,
  ensureFreeSubscription,
  updateQuotaPoolLimit,
  transitionToExtendedTrial,
  findExpiredTrialsByDaysSinceEnd,
  getTopUpCreditsRemaining,
  findExpiringTopUpCredits,
  getTopUpPriceCents,
} from './billing';

const NOW = new Date('2025-01-15T10:00:00.000Z');
const accountId = 'acc-550e8400-e29b-41d4-a716-446655440000';
const subscriptionId = 'sub-660e8400-e29b-41d4-a716-446655440000';

beforeEach(() => {
  mockCaptureException.mockClear();
  mockInngestSend.mockClear();
});

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
    lastStripeEventId: string | null;
    lastStripeEventTimestamp: Date | null;
    lastRevenuecatEventId: string | null;
    lastRevenuecatEventTimestampMs: string | null;
  }>,
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
    lastStripeEventId: overrides?.lastStripeEventId ?? null,
    lastRevenuecatEventId: overrides?.lastRevenuecatEventId ?? null,
    lastRevenuecatEventTimestampMs:
      overrides?.lastRevenuecatEventTimestampMs ?? null,
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
    dailyLimit: number | null;
    usedToday: number;
    cycleResetAt: Date;
  }>,
) {
  return {
    id: overrides?.id ?? 'qp-1',
    subscriptionId: overrides?.subscriptionId ?? subscriptionId,
    monthlyLimit: overrides?.monthlyLimit ?? 500,
    usedThisMonth: overrides?.usedThisMonth ?? 42,
    dailyLimit: overrides?.dailyLimit ?? null,
    usedToday: overrides?.usedToday ?? 0,
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
    profileId: string | null;
    remaining: number;
    expiresAt: Date;
    purchasedAt: Date;
  }>,
) {
  return {
    id: overrides?.id ?? 'tu-1',
    subscriptionId: overrides?.subscriptionId ?? subscriptionId,
    profileId: overrides?.profileId ?? null,
    amount: 500,
    remaining: overrides?.remaining ?? 500,
    purchasedAt: overrides?.purchasedAt ?? NOW,
    expiresAt: overrides?.expiresAt ?? new Date('2026-01-15T10:00:00.000Z'),
    createdAt: NOW,
  };
}

// [WI-1239 / 779-strip] decrementQuota/incrementQuota now resolve effective
// access via the v2 `subscription` table (organization-keyed), not the legacy
// `subscriptions` table. Derive the v2-shaped row from the same
// mockSubscriptionRow() fixture so existing test call sites (which only build
// legacy rows) keep working unchanged — see types-v2.ts mapSubscriptionV2Row
// for the field-name mapping this mirrors.
function toV2SubscriptionRow(
  row: ReturnType<typeof mockSubscriptionRow> | undefined,
) {
  if (!row) return undefined;
  return {
    id: row.id,
    organizationId: row.accountId,
    stripeCustomerId: row.stripeCustomerId,
    stripeSubscriptionId: row.stripeSubscriptionId,
    planTier: row.tier,
    status: row.status,
    trialEndsAt: row.trialEndsAt,
    periodStartAt: row.currentPeriodStart,
    periodEndAt: row.currentPeriodEnd,
    cancelledAt: row.cancelledAt,
    lastStripeEventTimestamp: row.lastStripeEventTimestamp,
    lastStripeEventId: row.lastStripeEventId,
    revenuecatOriginalAppUserId: null,
    lastRevenuecatEventId: row.lastRevenuecatEventId,
    lastRevenuecatEventTimestampMs: row.lastRevenuecatEventTimestampMs,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
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
  selectResult = [] as unknown[],
  insertReturning = [] as unknown[],
  updateReturning = [] as unknown[],
  // [BUG-751] Sequence of return values for consecutive UPDATE...RETURNING
  // calls. When provided, each call to .returning() consumes the next entry.
  // After the sequence is exhausted, falls back to `updateReturning`.
  updateReturningSequence = undefined as undefined | unknown[][],
} = {}): Database {
  const returningFn = updateReturningSequence
    ? (() => {
        const fn = jest.fn();
        for (const value of updateReturningSequence) {
          fn.mockResolvedValueOnce(value);
        }
        fn.mockResolvedValue(updateReturning);
        return fn;
      })()
    : jest.fn().mockResolvedValue(updateReturning);
  const updateWhere = jest.fn().mockReturnValue({
    returning: returningFn,
  });
  const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
  const createSelectChain = () => {
    // Thenable + .for('update') so both `await ….where(…)` and the
    // SELECT … FOR UPDATE chains (`.where(…).for('update')`,
    // `.where(…).limit(1).for('update')` — lockSubscription*__unscoped)
    // resolve to selectResult.
    const makeLockableThenable = () => ({
      for: jest.fn().mockResolvedValue(selectResult),
      then: (
        onfulfilled?: (value: unknown[]) => unknown,
        onrejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(selectResult).then(onfulfilled, onrejected),
    });
    const terminal = {
      limit: jest.fn().mockReturnValue(makeLockableThenable()),
      for: jest.fn().mockResolvedValue(selectResult),
      then: (
        onfulfilled?: (value: unknown[]) => unknown,
        onrejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(selectResult).then(onfulfilled, onrejected),
    };
    const chain = {
      where: jest.fn().mockReturnValue(terminal),
      innerJoin: jest.fn(),
    };
    chain.innerJoin.mockReturnValue(chain);
    return chain;
  };
  const db = {
    query: {
      subscriptions: {
        findFirst: jest.fn().mockResolvedValue(subscriptionFindFirst),
      },
      // [WI-1239 / 779-strip] v2-only: decrementQuota/incrementQuota resolve
      // effective access via getEffectiveAccessForSubscriptionV2, which reads
      // this table. Derived from the same fixture — see toV2SubscriptionRow.
      subscription: {
        findFirst: jest
          .fn()
          .mockResolvedValue(toV2SubscriptionRow(subscriptionFindFirst)),
      },
      quotaPools: {
        findFirst: jest.fn().mockResolvedValue(quotaPoolFindFirst),
      },
      topUpCredits: {
        findFirst: jest.fn().mockResolvedValue(topUpFindFirst),
      },
    },
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        // [BUG-116] ensureFreeSubscription uses onConflictDoNothing to survive
        // concurrent-insert races (UNIQUE(account_id) constraint). Expose the
        // method in the mock so the chain does not throw "not a function".
        onConflictDoNothing: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue(insertReturning),
        }),
        onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
        returning: jest.fn().mockResolvedValue(insertReturning),
      }),
    }),
    update: jest.fn().mockReturnValue({ set: updateSet }),
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    }),
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue(createSelectChain()),
    }),
  };
  (db as unknown as { transaction: jest.Mock }).transaction = jest
    .fn()
    .mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));

  return db as unknown as Database;
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

  it('creates subscription and quota state inside one transaction', async () => {
    const row = mockSubscriptionRow();
    const db = createMockDb({ insertReturning: [row] });

    await createSubscription(db, accountId, 'plus', 500);

    expect(db.transaction).toHaveBeenCalledTimes(1);
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

    const insertCall = (db.insert as jest.Mock).mock.results[0]!.value;
    const valuesCall = insertCall.values as jest.Mock;
    const values = valuesCall.mock.calls[0]![0];
    expect(values.stripeCustomerId).toBe('cus_123');
    expect(values.stripeSubscriptionId).toBe('sub_456');
  });

  it('defaults status to trial when not specified', async () => {
    const row = mockSubscriptionRow({ status: 'trial' });
    const db = createMockDb({ insertReturning: [row] });
    await createSubscription(db, accountId, 'plus', 500);

    const insertCall = (db.insert as jest.Mock).mock.results[0]!.value;
    const valuesCall = insertCall.values as jest.Mock;
    const values = valuesCall.mock.calls[0]![0];
    expect(values.status).toBe('trial');
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

    // [S-2/BUG-627 — refactored for BUG-751] Use createMockDb with the
    // updateReturningSequence helper instead of a hand-rolled mock chain
    // tracking the same ORM call shape three times. This removes the drift
    // risk: any change to createMockDb propagates to every test, and the
    // sequence here only captures what is unique to this scenario — the
    // three sequential UPDATE results.
    const db = createMockDb({
      quotaPoolFindFirst: mockQuotaPoolRow({
        monthlyLimit: 100,
        usedThisMonth: 100,
        dailyLimit: null,
        usedToday: 0,
      }),
      topUpFindFirst: topUp,
      updateReturningSequence: [
        [], // monthly atomic UPDATE: WHERE used < limit fails
        [updatedTopUp], // top-up credit decrement succeeds
        [{ dailyLimit: null, usedToday: 1 }], // daily counter increment
      ],
    });

    const result = await decrementQuota(db, subscriptionId);

    expect(result.success).toBe(true);
    expect(result.source).toBe('top_up');
    expect(result.remainingTopUp).toBe(99);
  });

  it('[WI-78 review] advances past three contended top-up credits before declaring exhaustion', async () => {
    const topUps = [
      mockTopUpRow({ id: 'tu-1', remaining: 1 }),
      mockTopUpRow({ id: 'tu-2', remaining: 1 }),
      mockTopUpRow({ id: 'tu-3', remaining: 1 }),
      mockTopUpRow({ id: 'tu-4', remaining: 1 }),
    ];
    const updatedTopUp = mockTopUpRow({ id: 'tu-4', remaining: 0 });
    const db = createMockDb({
      quotaPoolFindFirst: mockQuotaPoolRow({
        monthlyLimit: 100,
        usedThisMonth: 100,
        dailyLimit: null,
        usedToday: 0,
      }),
      updateReturningSequence: [
        [], // monthly atomic UPDATE: WHERE used < limit fails
        [], // tu-1 lost to a concurrent consumer
        [], // tu-2 lost to a concurrent consumer
        [], // tu-3 lost to a concurrent consumer
        [updatedTopUp], // tu-4 is still available and should be used
        [{ dailyLimit: null, usedToday: 1 }], // daily counter increment
      ],
    });
    const findTopUp = (db as any).query.topUpCredits.findFirst as jest.Mock;
    findTopUp
      .mockResolvedValueOnce(topUps[0])
      .mockResolvedValueOnce(topUps[1])
      .mockResolvedValueOnce(topUps[2])
      .mockResolvedValueOnce(topUps[3]);

    const result = await decrementQuota(db, subscriptionId);

    expect(result.success).toBe(true);
    expect(result.source).toBe('top_up');
    expect(result.topUpCreditId).toBe('tu-4');
    expect(findTopUp).toHaveBeenCalledTimes(4);
  });

  it('[WI-78 review] reports daily_exceeded when the last top-up race also consumes the daily slot', async () => {
    const stalePool = mockQuotaPoolRow({
      monthlyLimit: 100,
      usedThisMonth: 100,
      dailyLimit: 10,
      usedToday: 9,
    });
    const refreshedPool = mockQuotaPoolRow({
      monthlyLimit: 100,
      usedThisMonth: 100,
      dailyLimit: 10,
      usedToday: 10,
    });
    const topUp = mockTopUpRow({ remaining: 1 });
    const db = createMockDb({
      updateReturningSequence: [
        [], // monthly atomic UPDATE: WHERE used < limit fails
        [], // top-up decrement lost to the request that filled the daily cap
      ],
    });
    const findPool = (db as any).query.quotaPools.findFirst as jest.Mock;
    findPool
      .mockResolvedValueOnce(stalePool)
      .mockResolvedValueOnce(refreshedPool);
    const findTopUp = (db as any).query.topUpCredits.findFirst as jest.Mock;
    findTopUp.mockResolvedValueOnce(topUp).mockResolvedValueOnce(undefined);

    const result = await decrementQuota(db, subscriptionId);

    expect(result.success).toBe(false);
    expect(result.source).toBe('daily_exceeded');
    expect(result.remainingDaily).toBe(0);
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
  // [T-2] Strengthen: verify the SET payload includes both usage counters
  // and the WHERE clause targets the correct table and subscription.
  it('issues an UPDATE that decrements both usedThisMonth and usedToday with GREATEST guard', async () => {
    const db = createMockDb();

    await incrementQuota(db, subscriptionId);

    // update() must be called exactly once
    expect(db.update).toHaveBeenCalledTimes(1);

    // .set() payload must include both counters and updatedAt
    const updateSetMock = (db.update as jest.Mock).mock.results[0]!.value
      .set as jest.Mock;
    expect(updateSetMock).toHaveBeenCalledTimes(1);
    const setPayload = updateSetMock.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    // Both counter fields must be present — they carry GREATEST(... - 1, 0) SQL
    expect(setPayload).toHaveProperty('usedThisMonth');
    expect(setPayload).toHaveProperty('usedToday');
    expect(setPayload).toHaveProperty('updatedAt');

    // .where() must be called — ensures the update is scoped to the subscription
    const whereMock = updateSetMock.mock.results[0]!.value.where as jest.Mock;
    expect(whereMock).toHaveBeenCalledTimes(1);
  });

  it('does not throw when quota pool does not exist (UPDATE affects 0 rows — safe no-op)', async () => {
    // incrementQuota is a best-effort refund: if the row doesn't exist, it's
    // a no-op. The test verifies no exception is thrown.
    const db = createMockDb({ updateReturning: [] });
    await expect(incrementQuota(db, subscriptionId)).resolves.toEqual({
      success: true,
    });
  });
});

// ---------------------------------------------------------------------------
// safeRefundQuota
// ---------------------------------------------------------------------------

describe('safeRefundQuota [BUG-661]', () => {
  it('returns refunded:true on success and does not escalate', async () => {
    const db = createMockDb({ selectResult: [{ profileId: 'p-1' }] });
    const result = await safeRefundQuota(db, subscriptionId, {
      route: 'sessions.message',
      profileId: 'p-1',
    });
    expect(result).toEqual({ refunded: true });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  // Break test: if the underlying UPDATE throws (DB transient, connection
  // dropped, etc.), the wrapper must still resolve, return refunded:false,
  // and escalate to Sentry. Without escalation, the user is silently charged
  // for a failed exchange.
  it('escalates and returns refunded:false when incrementQuota throws [BUG-661]', async () => {
    // Build a db whose .update().set().where() rejects.
    const dbErr = new Error('connection terminated');
    const selectLimit = jest.fn().mockResolvedValue([{ profileId: 'p-1' }]);
    const selectChain = {
      innerJoin: jest.fn(),
      where: jest.fn().mockReturnValue({ limit: selectLimit }),
    };
    selectChain.innerJoin.mockReturnValue(selectChain);
    const subRow = mockSubscriptionRow({ tier: 'family', status: 'active' });
    const db = {
      query: {
        subscriptions: {
          findFirst: jest.fn().mockResolvedValue(subRow),
        },
        // [WI-1239 / 779-strip] v2-only: incrementQuota resolves effective
        // access via getEffectiveAccessForSubscriptionV2.
        subscription: {
          findFirst: jest.fn().mockResolvedValue(toV2SubscriptionRow(subRow)),
        },
      },
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue(selectChain),
      }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockRejectedValue(dbErr),
        }),
      }),
      transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db)),
    } as unknown as Database;

    const result = await safeRefundQuota(db, subscriptionId, {
      route: 'sessions.stream',
      profileId: 'p-1',
      sessionId: 'sess-1',
    });

    expect(result).toEqual({ refunded: false });
    expect(mockCaptureException).toHaveBeenCalledWith(
      dbErr,
      expect.objectContaining({
        profileId: 'p-1',
        extra: expect.objectContaining({
          context: 'metering.refund.failed',
          route: 'sessions.stream',
          subscriptionId,
          sessionId: 'sess-1',
        }),
      }),
    );
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

  it('provisions the winning free subscription inside one transaction', async () => {
    const created = mockSubscriptionRow({
      tier: 'free',
      status: 'active',
    });
    const db = createMockDb({
      subscriptionFindFirst: undefined,
      insertReturning: [created],
    });

    await ensureFreeSubscription(db, accountId);

    expect(db.transaction).toHaveBeenCalledTimes(1);
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

  it('returns true for plus tier with 1 existing profile', async () => {
    const sub = mockSubscriptionRow({ tier: 'plus' });
    const db = createMockDb({
      subscriptionFindFirst: sub,
      selectResult: [{ count: 1 }],
    });

    const result = await canAddProfile(db, subscriptionId);

    expect(result).toBe(true);
  });

  it('returns false for plus tier with 2 existing profiles', async () => {
    const sub = mockSubscriptionRow({ tier: 'plus' });
    const db = createMockDb({
      subscriptionFindFirst: sub,
      selectResult: [{ count: 2 }],
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

// ---------------------------------------------------------------------------
// updateQuotaPoolLimit
// ---------------------------------------------------------------------------

describe('updateQuotaPoolLimit', () => {
  it('updates monthlyLimit on quota pool', async () => {
    const db = createMockDb({ updateReturning: [{ id: 'pool-1' }] });

    await updateQuotaPoolLimit(db, subscriptionId, 1500, null);

    expect(db.update).toHaveBeenCalled();
  });

  it('[WI-78 review] throws when the quota pool row is missing', async () => {
    const db = createMockDb({ updateReturning: [] });

    await expect(
      updateQuotaPoolLimit(db, subscriptionId, 1500, null),
    ).rejects.toThrow('quota pool');
  });
});

// ---------------------------------------------------------------------------
// transitionToExtendedTrial (Story 5.2)
// ---------------------------------------------------------------------------

describe('transitionToExtendedTrial', () => {
  it('updates subscription status and tier', async () => {
    const db = createMockDb({ updateReturning: [{ id: subscriptionId }] });

    const result = await transitionToExtendedTrial(db, subscriptionId, 450);

    expect(result).toBe(true);
    // update called twice: subscription + quota pool
    expect(db.update).toHaveBeenCalledTimes(2);
  });

  it('skips quota changes when the subscription is no longer a trial', async () => {
    const db = createMockDb({ updateReturning: [] });

    const result = await transitionToExtendedTrial(db, subscriptionId, 450);

    expect(result).toBe(false);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it('sets quota pool to extended trial monthly equivalent', async () => {
    const returningMock = jest.fn().mockResolvedValue([{ id: subscriptionId }]);
    const updateWhere = jest.fn().mockReturnValue({
      returning: returningMock,
    });
    const updateSetMock = jest.fn().mockReturnValue({ where: updateWhere });

    const db = {
      query: {
        subscriptions: { findFirst: jest.fn().mockResolvedValue(undefined) },
        quotaPools: { findFirst: jest.fn().mockResolvedValue(undefined) },
        topUpCredits: { findFirst: jest.fn().mockResolvedValue(undefined) },
        profiles: { findFirst: jest.fn().mockResolvedValue(undefined) },
      },
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([]),
        }),
      }),
      update: jest.fn().mockReturnValue({ set: updateSetMock }),
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      }),
      // transitionToExtendedTrial now wraps both UPDATEs in db.transaction();
      // pass the same db through so the update mock is exercised and
      // updateSetMock.mock.calls still captures both SET calls.
      transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db)),
    } as unknown as Database;

    await transitionToExtendedTrial(db, subscriptionId, 450);

    // Second call to update().set() is for quota pool
    const secondSetCall = updateSetMock.mock.calls[1][0];
    expect(secondSetCall.monthlyLimit).toBe(450);
    expect(secondSetCall.usedThisMonth).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// findExpiredTrialsByDaysSinceEnd (Story 5.2)
// ---------------------------------------------------------------------------

describe('findExpiredTrialsByDaysSinceEnd', () => {
  it('delegates to findSubscriptionsByTrialDateRange with correct date range', async () => {
    const row = mockSubscriptionRow({
      status: 'expired',
      trialEndsAt: new Date('2025-01-01T12:00:00.000Z'),
    });
    const findManyMock = jest.fn().mockResolvedValue([row]);
    const db = {
      query: {
        subscriptions: { findMany: findManyMock, findFirst: jest.fn() },
        quotaPools: { findFirst: jest.fn() },
        topUpCredits: { findFirst: jest.fn() },
        profiles: { findFirst: jest.fn() },
      },
      insert: jest.fn(),
      update: jest.fn(),
      select: jest.fn(),
    } as unknown as Database;

    const now = new Date('2025-01-15T10:00:00.000Z');
    const results = await findExpiredTrialsByDaysSinceEnd(db, now, 14);

    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe('expired');
    // Should query for trials that ended 14 days ago (2025-01-01)
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.anything(),
      }),
    );
  });

  it('returns empty array when no matching trials found', async () => {
    const findManyMock = jest.fn().mockResolvedValue([]);
    const db = {
      query: {
        subscriptions: { findMany: findManyMock, findFirst: jest.fn() },
        quotaPools: { findFirst: jest.fn() },
        topUpCredits: { findFirst: jest.fn() },
        profiles: { findFirst: jest.fn() },
      },
      insert: jest.fn(),
      update: jest.fn(),
      select: jest.fn(),
    } as unknown as Database;

    const now = new Date('2025-01-15T10:00:00.000Z');
    const results = await findExpiredTrialsByDaysSinceEnd(db, now, 14);

    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getTopUpCreditsRemaining (Story 5.3)
// ---------------------------------------------------------------------------

describe('getTopUpCreditsRemaining', () => {
  it('returns aggregate remaining from select query', async () => {
    const db = createMockDb({ selectResult: [{ total: 750 }] });
    const result = await getTopUpCreditsRemaining(db, subscriptionId);

    expect(result).toBe(750);
    expect(db.select).toHaveBeenCalled();
  });

  it('returns 0 when no top-up credits exist', async () => {
    const db = createMockDb({ selectResult: [{ total: 0 }] });
    const result = await getTopUpCreditsRemaining(db, subscriptionId);

    expect(result).toBe(0);
  });

  it('returns 0 when select returns empty result', async () => {
    const db = createMockDb({ selectResult: [] });
    const result = await getTopUpCreditsRemaining(db, subscriptionId);

    expect(result).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// findExpiringTopUpCredits (Story 5.3)
// ---------------------------------------------------------------------------

describe('findExpiringTopUpCredits', () => {
  it('returns credits from findMany query', async () => {
    const topUp = mockTopUpRow({ remaining: 100 });
    const findManyMock = jest.fn().mockResolvedValue([topUp]);

    const db = {
      query: {
        subscriptions: { findFirst: jest.fn() },
        quotaPools: { findFirst: jest.fn() },
        topUpCredits: { findFirst: jest.fn(), findMany: findManyMock },
        profiles: { findFirst: jest.fn() },
      },
      insert: jest.fn(),
      update: jest.fn(),
      select: jest.fn(),
    } as unknown as Database;

    const rangeStart = new Date('2025-07-01T00:00:00.000Z');
    const rangeEnd = new Date('2025-07-01T23:59:59.999Z');
    const results = await findExpiringTopUpCredits(db, rangeStart, rangeEnd);

    expect(results).toHaveLength(1);
    expect(results[0]!.remaining).toBe(100);
  });

  it('returns empty array when no expiring credits found', async () => {
    const findManyMock = jest.fn().mockResolvedValue([]);

    const db = {
      query: {
        subscriptions: { findFirst: jest.fn() },
        quotaPools: { findFirst: jest.fn() },
        topUpCredits: { findFirst: jest.fn(), findMany: findManyMock },
        profiles: { findFirst: jest.fn() },
      },
      insert: jest.fn(),
      update: jest.fn(),
      select: jest.fn(),
    } as unknown as Database;

    const rangeStart = new Date('2025-07-01T00:00:00.000Z');
    const rangeEnd = new Date('2025-07-01T23:59:59.999Z');
    const results = await findExpiringTopUpCredits(db, rangeStart, rangeEnd);

    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getTopUpPriceCents (Story 5.3)
// ---------------------------------------------------------------------------

describe('getTopUpPriceCents', () => {
  it('returns null for free tier', () => {
    expect(getTopUpPriceCents('free')).toBeNull();
  });

  it('returns 1000 (EUR 10) for plus tier', () => {
    expect(getTopUpPriceCents('plus')).toBe(1000);
  });

  it('returns 500 (EUR 5) for family tier', () => {
    expect(getTopUpPriceCents('family')).toBe(500);
  });

  it('returns 500 (EUR 5) for pro tier', () => {
    expect(getTopUpPriceCents('pro')).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// [4C.2] decrementQuota — concurrent over-decrement (race condition)
// ---------------------------------------------------------------------------

describe('decrementQuota — concurrent over-decrement [4C.2]', () => {
  it('returns failure when atomic UPDATE returns empty (concurrent winner consumed last slot)', async () => {
    // Simulates a race: two requests check quota simultaneously, one wins the atomic
    // UPDATE, the other gets zero rows back — no pool found for fallback either
    const db = createMockDb({
      updateReturning: [], // atomic UPDATE returns nothing (concurrent race lost)
      quotaPoolFindFirst: undefined, // no pool found
    });

    const result = await decrementQuota(db, subscriptionId);

    expect(result.success).toBe(false);
    expect(result.source).toBe('none');
    expect(result.remainingMonthly).toBe(0);
  });

  it('falls through to top-up when concurrent request consumed last monthly slot', async () => {
    // First UPDATE returns empty (monthly atomic guard fails because concurrent request
    // consumed the last slot). Pool shows monthly exhausted, daily OK. Top-up available.
    const pool = mockQuotaPoolRow({
      monthlyLimit: 100,
      usedThisMonth: 100, // concurrent request consumed it
      dailyLimit: null,
      usedToday: 5,
    });
    const topUp = mockTopUpRow({ remaining: 50 });
    const updatedTopUp = mockTopUpRow({ remaining: 49 });

    const db = createMockDb({
      quotaPoolFindFirst: pool,
      topUpFindFirst: topUp,
      updateReturningSequence: [
        [], // monthly: WHERE used < limit fails (concurrently consumed)
        [updatedTopUp], // top-up: succeeds
        [{ dailyLimit: null, usedToday: 6 }], // daily counter increment
      ],
    });

    const result = await decrementQuota(db, subscriptionId);

    expect(result.success).toBe(true);
    expect(result.source).toBe('top_up');
    expect(result.remainingTopUp).toBe(49);
  });

  it('returns failure when concurrent request consumed last top-up credit', async () => {
    // Monthly exhausted, daily OK, top-up found but atomic decrement fails
    // (another request consumed the last credit first)
    const pool = mockQuotaPoolRow({
      monthlyLimit: 100,
      usedThisMonth: 100,
      dailyLimit: null,
      usedToday: 5,
    });
    const topUp = mockTopUpRow({ remaining: 1 });

    const db = createMockDb({
      quotaPoolFindFirst: pool,
      topUpFindFirst: topUp,
      updateReturningSequence: [
        [], // monthly: fails
        [], // top-up: concurrent race lost (remaining was 1 -> 0)
      ],
    });

    const result = await decrementQuota(db, subscriptionId);

    expect(result.success).toBe(false);
    expect(result.source).toBe('none');
    expect(result.remainingMonthly).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// [4C.2] decrementQuota — daily quota consumed before monthly
// ---------------------------------------------------------------------------

describe('decrementQuota — daily quota consumed before monthly [4C.2]', () => {
  it('returns daily_exceeded when daily limit hit but monthly has remaining', async () => {
    const pool = mockQuotaPoolRow({
      dailyLimit: 10,
      usedToday: 10,
      monthlyLimit: 500,
      usedThisMonth: 50,
    });

    const db = createMockDb({
      quotaPoolFindFirst: pool,
      updateReturningSequence: [
        [], // Atomic UPDATE fails due to daily guard
      ],
    });

    const result = await decrementQuota(db, subscriptionId);

    expect(result.success).toBe(false);
    expect(result.source).toBe('daily_exceeded');
    expect(result.remainingDaily).toBe(0);
    // Monthly still has capacity — daily is the blocker
    expect(result.remainingMonthly).toBe(450);
  });

  it('blocks top-up fallback when daily limit is hit', async () => {
    // Daily limit hit — even with top-up credits available, user cannot proceed
    const pool = mockQuotaPoolRow({
      dailyLimit: 10,
      usedToday: 10,
      monthlyLimit: 100,
      usedThisMonth: 100,
    });
    const topUp = mockTopUpRow({ remaining: 500 });

    const db = createMockDb({
      quotaPoolFindFirst: pool,
      topUpFindFirst: topUp,
      updateReturningSequence: [[]],
    });

    const result = await decrementQuota(db, subscriptionId);

    expect(result.success).toBe(false);
    expect(result.source).toBe('daily_exceeded');
    // Top-up NOT consumed even though they have credits
    expect(result.remainingDaily).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// [4C.2] decrementQuota — race with top-up expiry
// ---------------------------------------------------------------------------

describe('decrementQuota — race with top-up expiry [4C.2]', () => {
  it('returns failure when top-up expires mid-decrement (findFirst returns row but atomic update fails)', async () => {
    // Monthly exhausted, daily OK. Top-up found in query but expired by the time
    // the atomic UPDATE runs (remaining check fails because row was deleted/expired)
    const pool = mockQuotaPoolRow({
      monthlyLimit: 100,
      usedThisMonth: 100,
      dailyLimit: null,
      usedToday: 5,
    });
    const topUp = mockTopUpRow({ remaining: 10 }); // Found by findFirst

    const db = createMockDb({
      quotaPoolFindFirst: pool,
      topUpFindFirst: topUp,
      updateReturningSequence: [
        [], // monthly: exhausted
        [], // top-up: expired between query and update
      ],
    });

    const result = await decrementQuota(db, subscriptionId);

    // Top-up expired between query and atomic update — treat as exhausted
    expect(result.success).toBe(false);
    expect(result.source).toBe('none');
    expect(result.remainingMonthly).toBe(0);
    expect(result.remainingTopUp).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// [4C.6] getTopUpCreditsRemaining — expiry edge cases
// ---------------------------------------------------------------------------

describe('getTopUpCreditsRemaining — expiry edge [4C.6]', () => {
  it('only counts credits with expiresAt > now (SQL WHERE guard)', async () => {
    // The function uses `topUpCredits.expiresAt > now` in the WHERE clause,
    // so expired credits are excluded server-side by the SQL query.
    // With a mock, we verify the function returns whatever the DB returns.
    const db = createMockDb({ selectResult: [{ total: 250 }] });
    const now = new Date('2025-06-15T00:00:00.000Z');

    const result = await getTopUpCreditsRemaining(db, subscriptionId, now);

    expect(result).toBe(250);
    // Verify select was called (the WHERE clause excludes expired credits)
    expect(db.select).toHaveBeenCalled();
  });

  it('returns 0 when all credits have expired', async () => {
    // All top-ups expired — DB SUM returns 0
    const db = createMockDb({ selectResult: [{ total: 0 }] });
    const now = new Date('2027-01-01T00:00:00.000Z');

    const result = await getTopUpCreditsRemaining(db, subscriptionId, now);

    expect(result).toBe(0);
  });

  it('returns 0 when select returns null total (COALESCE handles this)', async () => {
    // Edge case: no rows match at all → COALESCE(SUM(NULL), 0) = 0
    const db = createMockDb({ selectResult: [{ total: 0 }] });

    const result = await getTopUpCreditsRemaining(db, subscriptionId);

    expect(result).toBe(0);
  });

  it('accepts custom now parameter for point-in-time queries', async () => {
    // Useful when querying credits as of a specific time (e.g., during decrement)
    const db = createMockDb({ selectResult: [{ total: 100 }] });
    const queryTime = new Date('2025-03-01T12:00:00.000Z');

    const result = await getTopUpCreditsRemaining(
      db,
      subscriptionId,
      queryTime,
    );

    expect(result).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// [1C.9] decrementQuota — free-tier daily limit
// ---------------------------------------------------------------------------

describe('decrementQuota — free-tier daily limit', () => {
  it('rejects when daily limit is exceeded (free tier)', async () => {
    // Free tier: dailyLimit: 10, usedToday: 10 — daily cap hit
    const pool = mockQuotaPoolRow({
      dailyLimit: 10,
      usedToday: 10,
      monthlyLimit: 100,
      usedThisMonth: 50,
    });

    const db = createMockDb({
      quotaPoolFindFirst: pool,
      updateReturningSequence: [
        [], // Atomic UPDATE returns empty (daily guard prevents increment)
      ],
    });

    const result = await decrementQuota(db, subscriptionId);

    expect(result.success).toBe(false);
    expect(result.source).toBe('daily_exceeded');
    expect(result.remainingDaily).toBe(0);
    expect(result.remainingMonthly).toBe(50);
  });
});
