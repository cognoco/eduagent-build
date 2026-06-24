// ---------------------------------------------------------------------------
// WI-987 — Regression test for the `as unknown as` escape-cast fix.
//
// Root cause: the old code constructed `legacyShaped = { ...row, accountId,
// tier, status, currentPeriodStart: row.periodStartAt, currentPeriodEnd:
// row.periodEndAt }` and used `as unknown as EffectiveSubscriptionAccessV2
// ['subscription']` to bypass TypeScript's structural check. The cast meant
// `subscription.currentPeriodEnd` silently carried a raw Date object at
// runtime instead of the ISO string that SubscriptionRow declares.
//
// Fix: replaced inline legacyShaped with `mapSubscriptionV2Row(row)`, which
// converts Date fields to ISO strings and is already type-verified.
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import { getEffectiveAccessForSubscriptionV2 } from './access-v2';

// ---------------------------------------------------------------------------
// Minimal DB stub — only mocks db.query.subscription.findFirst (no jest.mock)
// ---------------------------------------------------------------------------

const PERIOD_END_DATE = new Date('2026-12-31T00:00:00.000Z');
const PERIOD_END_ISO = '2026-12-31T00:00:00.000Z';
const ORG_ID = 'org_test_123';

/** Returns a typed DB stub whose subscription.findFirst resolves to `row`. */
function makeDb(row: Record<string, unknown> | null): Database {
  return {
    query: {
      subscription: {
        findFirst: jest.fn().mockResolvedValue(row),
      },
    },
  } as unknown as Database;
}

const baseRow = {
  id: 'sub_test',
  organizationId: ORG_ID,
  planTier: 'plus',
  status: 'active',
  payerPersonId: 'person_1',
  storeProductId: null,
  storePlatform: null,
  periodStartAt: new Date('2026-01-01T00:00:00.000Z'),
  periodEndAt: PERIOD_END_DATE,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  lastStripeEventId: null,
  lastStripeEventTimestamp: null,
  revenuecatOriginalAppUserId: null,
  lastRevenuecatEventId: null,
  lastRevenuecatEventTimestampMs: null,
  trialEndsAt: null,
  cancelledAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('getEffectiveAccessForSubscriptionV2', () => {
  it('returns null when the subscription row is not found', async () => {
    const db = makeDb(null);
    const result = await getEffectiveAccessForSubscriptionV2(db, 'missing-id');
    expect(result).toBeNull();
  });

  it('[WI-987] subscription.currentPeriodEnd is an ISO string, not a Date object', async () => {
    // Red without fix: old `legacyShaped` set `currentPeriodEnd:
    // row.periodEndAt` (Date), which makes `typeof result.subscription
    // .currentPeriodEnd === 'object'` and the assertion below fails.
    // Green with fix: mapSubscriptionV2Row converts to ISO string.
    const db = makeDb(baseRow);
    const result = await getEffectiveAccessForSubscriptionV2(
      db,
      'sub_test',
      new Date('2026-06-01'),
    );
    expect(result).not.toBeNull();
    expect(typeof result!.subscription.currentPeriodEnd).toBe('string');
    expect(result!.subscription.currentPeriodEnd).toBe(PERIOD_END_ISO);
  });

  it('[WI-987] subscription.accountId equals organizationId from the new table', async () => {
    // Red without fix: old `legacyShaped` spread `...row` (which includes
    // `organizationId`) but the type was the legacy type that expects
    // `accountId`. The manual `accountId: row.organizationId` was added, so
    // accountId was set — but currentPeriodEnd was still a Date.
    // This assertion guards the accountId mapping specifically.
    const db = makeDb(baseRow);
    const result = await getEffectiveAccessForSubscriptionV2(
      db,
      'sub_test',
      new Date('2026-06-01'),
    );
    expect(result).not.toBeNull();
    expect(result!.subscription.accountId).toBe(ORG_ID);
  });

  it('[WI-987] subscription carries correct tier and status from schema-validated parse', async () => {
    const db = makeDb(baseRow);
    const result = await getEffectiveAccessForSubscriptionV2(
      db,
      'sub_test',
      new Date('2026-06-01'),
    );
    expect(result).not.toBeNull();
    expect(result!.subscription.tier).toBe('plus');
    expect(result!.subscription.status).toBe('active');
  });

  it('[WI-987] throws when planTier is not a valid SubscriptionTier', async () => {
    const db = makeDb({ ...baseRow, planTier: 'enterprise' });
    await expect(
      getEffectiveAccessForSubscriptionV2(db, 'sub_test'),
    ).rejects.toThrow('Invalid billing v2 subscription planTier from database');
  });

  it('returns the correct effectiveAccessTier and billingAccess for an active plus subscription', async () => {
    const db = makeDb(baseRow);
    const result = await getEffectiveAccessForSubscriptionV2(
      db,
      'sub_test',
      new Date('2026-06-01'),
    );
    expect(result).not.toBeNull();
    // Active plus subscription within its period — effectiveAccessTier = plus.
    expect(result!.effectiveAccessTier).toBe('plus');
    expect(result!.billingAccess).toBeDefined();
  });
});
