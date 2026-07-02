// ---------------------------------------------------------------------------
// subscription-core-v2.ts — getOrCreateStripeCustomerV2 concurrency regression
//
// [BUG-827] TOCTOU race: the old route logic did read-subscription → if no
// stripeCustomerId, stripe.customers.create → linkStripeCustomer. Two concurrent
// billing requests for the same organization both saw "no customer" and both
// created one → one orphaned, unlinked Stripe customer.
// getOrCreateStripeCustomerV2 closes the race with a SELECT … FOR UPDATE row
// lock + re-check inside a txn (plus an idempotency-keyed create as a
// cross-process backstop).
//
// [WI-1239 / 779-strip] Converted from the legacy subscription-core.test.ts
// (getOrCreateStripeCustomer, deleted — dead, no reachable caller) to target
// this v2 twin directly. Same fake-DB/fake-Stripe harness; only the imported
// function and the id vocabulary (organizationId vs accountId) changed.
//
// No internal mocks. The Database is a hand-built in-memory fake at the boundary
// that models the FOR UPDATE lock as a serializing mutex AND shares mutable row
// state across transactions (so the loser of the race reads the winner's linked
// customer). Stripe is a true external boundary — a fake client that records
// every customers.create call.
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import type { StripeCustomerCreator } from '../types';
import { getOrCreateStripeCustomerV2 } from './subscription-core-v2';

const organizationId = 'org-550e8400-e29b-41d4-a716-446655440000';
const subscriptionId = 'sub-660e8400-e29b-41d4-a716-446655440000';

type SubRow = {
  id: string;
  organizationId: string;
  stripeCustomerId: string | null;
  updatedAt: Date;
};

// ---------------------------------------------------------------------------
// Fake Stripe — records every customers.create call. Honours the idempotency
// key the way Stripe does: same key → same customer object returned.
// ---------------------------------------------------------------------------

function createFakeStripe() {
  const createCalls: Array<{ idempotencyKey: string | undefined }> = [];
  const byIdemKey = new Map<string, { id: string }>();
  let seq = 0;

  const customers = {
    create: jest.fn(
      async (
        _params: { email?: string; metadata?: Record<string, string> },
        options?: { idempotencyKey?: string },
      ) => {
        const idempotencyKey = options?.idempotencyKey;
        createCalls.push({ idempotencyKey });
        // Simulate an async network round-trip so concurrent callers can
        // interleave between create and the subsequent link write.
        await Promise.resolve();
        if (idempotencyKey && byIdemKey.has(idempotencyKey)) {
          return byIdemKey.get(idempotencyKey) as { id: string };
        }
        seq += 1;
        const customer = { id: `cus_fake_${seq}` };
        if (idempotencyKey) byIdemKey.set(idempotencyKey, customer);
        return customer;
      },
    ),
  };

  return {
    stripe: { customers } satisfies StripeCustomerCreator,
    createCalls,
  };
}

// ---------------------------------------------------------------------------
// Fake Database — in-memory subscription row + serializing transaction lock.
//
// db.transaction acquires an async mutex so only one callback runs at a time;
// the SELECT … FOR UPDATE inside it reads the CURRENT (possibly already-mutated)
// row, and the UPDATE mutates it in place. This is the minimal faithful model
// of Postgres row-lock serialization that the real fix depends on.
// ---------------------------------------------------------------------------

function createFakeDb(initial: SubRow) {
  const row: SubRow = { ...initial };
  let mutex: Promise<void> = Promise.resolve();

  const makeTxApi = () => ({
    // .select().from(subscription).where(...).limit(1).for('update')
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            for: jest.fn(async () => [{ ...row }]),
          }),
        }),
      }),
    }),
    // .update(subscription).set({...}).where(...).returning()
    update: jest.fn().mockReturnValue({
      set: jest.fn((values: Partial<SubRow>) => ({
        where: jest.fn().mockReturnValue({
          returning: jest.fn(async () => {
            if (values.stripeCustomerId !== undefined) {
              row.stripeCustomerId = values.stripeCustomerId;
            }
            if (values.updatedAt) row.updatedAt = values.updatedAt;
            return [{ ...row }];
          }),
        }),
      })),
    }),
  });

  const db = {
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      // Serialize: each transaction waits for the previous one to finish,
      // modelling FOR UPDATE holding the row lock until commit.
      let release!: () => void;
      const prev = mutex;
      mutex = new Promise<void>((res) => {
        release = res;
      });
      await prev;
      try {
        return await fn(makeTxApi());
      } finally {
        release();
      }
    }),
  };

  return {
    db: db as unknown as Database,
    getRow: () => ({ ...row }),
  };
}

describe('getOrCreateStripeCustomerV2 — TOCTOU race [BUG-827]', () => {
  it('two concurrent calls create EXACTLY ONE Stripe customer (no orphan)', async () => {
    const { db, getRow } = createFakeDb({
      id: subscriptionId,
      organizationId,
      stripeCustomerId: null,
      updatedAt: new Date(0),
    });
    const { stripe, createCalls } = createFakeStripe();

    const [a, b] = await Promise.all([
      getOrCreateStripeCustomerV2(db, organizationId, stripe, {
        email: 'p@x.io',
      }),
      getOrCreateStripeCustomerV2(db, organizationId, stripe, {
        email: 'p@x.io',
      }),
    ]);

    // Exactly one Stripe customer was created — the second caller saw the
    // first's linked customer under the lock and skipped the create entirely.
    expect(createCalls).toHaveLength(1);
    // Both callers resolve to the SAME customer id (no divergent orphan).
    expect(a).toBe(b);
    // The persisted row is linked to that one customer.
    expect(getRow().stripeCustomerId).toBe(a);
  });

  it('returns the existing customer without calling Stripe when already linked', async () => {
    const { db } = createFakeDb({
      id: subscriptionId,
      organizationId,
      stripeCustomerId: 'cus_existing',
      updatedAt: new Date(0),
    });
    const { stripe, createCalls } = createFakeStripe();

    const result = await getOrCreateStripeCustomerV2(
      db,
      organizationId,
      stripe,
      {
        email: 'p@x.io',
      },
    );

    expect(result).toBe('cus_existing');
    expect(createCalls).toHaveLength(0);
  });

  it('passes a stable per-organization idempotency key to customers.create', async () => {
    const { db } = createFakeDb({
      id: subscriptionId,
      organizationId,
      stripeCustomerId: null,
      updatedAt: new Date(0),
    });
    const { stripe, createCalls } = createFakeStripe();

    await getOrCreateStripeCustomerV2(db, organizationId, stripe, {
      email: 'p@x.io',
    });

    expect(createCalls).toHaveLength(1);
    expect(createCalls[0]?.idempotencyKey).toBe(
      `customer-create-${organizationId}`,
    );
  });

  it('throws when the organization has no subscription row', async () => {
    // transaction runs the callback but the locked read returns no row.
    const db = {
      transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                  for: jest.fn(async () => []),
                }),
              }),
            }),
          }),
        }),
      ),
    } as unknown as Database;
    const { stripe } = createFakeStripe();

    await expect(
      getOrCreateStripeCustomerV2(db, organizationId, stripe, {
        email: 'p@x.io',
      }),
    ).rejects.toThrow('no subscription row');
  });
});
