// ---------------------------------------------------------------------------
// alias-merge — orchestration control-flow tests with a hand-built fake DB
// [BUG-783]
//
// Exercises the REAL `mergeAliasedSubscription` orchestration (account
// resolution, the idempotency claim, the escalation branches) against a
// hand-built fake `Database` at the boundary. No internal modules are mocked;
// only the DB boundary is a fake, plus Sentry/logger which are true external
// I/O boundaries.
//
// The full write path (tier upgrade + top-up grant) is covered against a real
// Postgres in alias-merge.integration.test.ts. This suite locks down the
// idempotency short-circuit (a redelivered event MUST NOT re-enter the write
// path) and the ownership/missing-target guards, which are the
// billing-correctness invariants the brief calls out.
// ---------------------------------------------------------------------------

import type { BillingAliasReceivedEvent } from '@eduagent/schemas';
import { mergeAliasedSubscription } from './alias-merge';

// External boundary only: Sentry escalation. We assert it fires on the
// no-target-subscription branch (billing "no silent recovery" rule).
const mockCaptureMessage = jest.fn();
jest.mock('../sentry' /* gc1-allow: external boundary (Sentry) */, () => ({
  captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
  captureException: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Hand-built fake Database. Implements exactly the surface the orchestration
// reaches before the write path: account lookup, scoped subscription read,
// top-up SUM select, and a transaction whose claim insert is replay-aware.
// ---------------------------------------------------------------------------

interface FakeState {
  account: { id: string; clerkUserId: string } | null;
  subscription: {
    id: string;
    accountId: string;
    tier: string;
    status: string;
    currentPeriodEnd: Date | null;
    trialEndsAt: Date | null;
  } | null;
  topUpRemaining: number;
  /** When true, the idempotency claim insert returns no row (replay). */
  claimIsReplay: boolean;
}

class WriteAttemptedError extends Error {
  constructor(op: string) {
    super(
      `unexpected write to ${op} — orchestration should have short-circuited`,
    );
  }
}

function makeFakeDb(state: FakeState) {
  const now = new Date();
  const account = state.account
    ? {
        ...state.account,
        email: 'survivor@test',
        timezone: null,
        createdAt: now,
        updatedAt: now,
      }
    : null;
  const subscription = state.subscription
    ? {
        ...state.subscription,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        cancelledAt: null,
        currentPeriodStart: null,
        lastStripeEventTimestamp: null,
        lastStripeEventId: null,
        revenuecatOriginalAppUserId: null,
        lastRevenuecatEventId: null,
        lastRevenuecatEventTimestampMs: null,
        createdAt: now,
        updatedAt: now,
      }
    : null;
  const queryApi = {
    accounts: { findFirst: async () => account },
    subscriptions: { findFirst: async () => subscription },
  };

  const db: Record<string, unknown> = {
    query: queryApi,
    // getTopUpCreditsRemaining → db.select({...}).from(...).where(...)
    select: () => ({
      from: () => ({
        where: async () => [{ total: state.topUpRemaining }],
      }),
    }),
    // claimWebhookId → db.insert(table).values(...).onConflictDoNothing(...).returning(...)
    insert: (table: { _: { name?: string } } | unknown) => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: async () =>
            state.claimIsReplay ? [] : [{ webhookId: 'claimed' }],
        }),
      }),
      // Any non-claim insert means we wrongly entered the write path.
      onConflictDoNothing: () => {
        throw new WriteAttemptedError('insert');
      },
    }),
    update: () => {
      throw new WriteAttemptedError('update');
    },
  };

  db.transaction = async (cb: (tx: unknown) => Promise<unknown>) => cb(db);
  return db as unknown as import('@eduagent/database').Database;
}

function buildEvent(
  over: Partial<BillingAliasReceivedEvent> & {
    fromSnapshot?: Partial<BillingAliasReceivedEvent['fromSnapshot']>;
  } = {},
): BillingAliasReceivedEvent {
  return {
    eventId: over.eventId ?? 'evt-alias-1',
    fromAppUserId: over.fromAppUserId ?? 'clerk-from',
    toAppUserId: over.toAppUserId ?? 'clerk-to',
    fromAccountId: over.fromAccountId ?? 'acc-from',
    fromSubscriptionId: over.fromSubscriptionId ?? 'sub-from',
    timestamp: over.timestamp ?? new Date().toISOString(),
    fromSnapshot: {
      tier: 'plus',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
      trialEndsAt: null,
      topUpRemaining: 500,
      ...over.fromSnapshot,
    },
  };
}

beforeEach(() => {
  mockCaptureMessage.mockClear();
});

describe('mergeAliasedSubscription — orchestration guards (fake DB)', () => {
  it('short-circuits as replay when the event id was already claimed (idempotent)', async () => {
    const db = makeFakeDb({
      account: { id: 'acc-to', clerkUserId: 'clerk-to' },
      subscription: {
        id: 'sub-to',
        accountId: 'acc-to',
        tier: 'free',
        status: 'active',
        currentPeriodEnd: null,
        trialEndsAt: null,
      },
      topUpRemaining: 0,
      claimIsReplay: true, // redelivery — claim loses
    });

    // The write path throws WriteAttemptedError if entered; replay must avoid it.
    const result = await mergeAliasedSubscription(db, buildEvent());
    expect(result.status).toBe('replay');
    expect(result.survivorSubscriptionId).toBe('sub-to');
  });

  it('returns no_target_account when the surviving Clerk id is anonymous ($...)', async () => {
    const db = makeFakeDb({
      account: null,
      subscription: null,
      topUpRemaining: 0,
      claimIsReplay: false,
    });
    const result = await mergeAliasedSubscription(
      db,
      buildEvent({ toAppUserId: '$RCAnonymousID:xyz' }),
    );
    expect(result.status).toBe('no_target_account');
  });

  it('returns no_target_account when the surviving identity has no account', async () => {
    const db = makeFakeDb({
      account: null,
      subscription: null,
      topUpRemaining: 0,
      claimIsReplay: false,
    });
    const result = await mergeAliasedSubscription(db, buildEvent());
    expect(result.status).toBe('no_target_account');
  });

  it('escalates to Sentry and returns no_target_subscription when survivor has no subscription', async () => {
    const db = makeFakeDb({
      account: { id: 'acc-to', clerkUserId: 'clerk-to' },
      subscription: null, // survivor account exists, no sub row
      topUpRemaining: 0,
      claimIsReplay: false,
    });
    const result = await mergeAliasedSubscription(db, buildEvent());
    expect(result.status).toBe('no_target_subscription');
    // Billing "no silent recovery" — must emit a structured Sentry signal.
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      expect.stringContaining('alias merge skipped'),
      expect.objectContaining({
        extra: expect.objectContaining({
          category: 'revenuecat.alias_merge.no_target_subscription',
        }),
      }),
    );
  });
});
