// ---------------------------------------------------------------------------
// BD-10: Account-scoped repository for billing tables.
//
// Parallels `createScopedRepository` (profile-scoped) for account-level
// tables: subscriptions, quota_pools, top_up_credits.
//
// Use `createAccountRepository(db, accountId)` when accountId is available.
// Use standalone helpers (findSubscriptionById__unscoped, findQuotaPool__unscoped,
// etc.) when only a subscriptionId or other key is available — callers MUST
// verify ownership before returning data to a client.
//
// EXCEPTIONS — the following bypass this repository intentionally:
//   - Cron/system functions (resetDailyQuotas, resetExpiredQuotaCycles,
//     findExpiredTrials, findSubscriptionsByTrialDateRange,
//     findExpiringTopUpCredits) operate across ALL accounts.
//   - Atomic metering writes use SQL WHERE guards for concurrency safety.
//   - byokWaitlist has no account FK (global email list).
//   - Aggregate queries (SUM, COUNT) with complex WHERE clauses.
//   - All INSERT/UPDATE/DELETE writes (scoping is on reads).
// ---------------------------------------------------------------------------

import { eq, and, type SQL } from 'drizzle-orm';
import type { Database } from './client';
import { subscriptions, quotaPools, topUpCredits } from './schema/index';

/**
 * Creates an account-scoped repository for billing table reads.
 * Prepares for future `app.current_account_id` RLS policy.
 */
export function createAccountRepository(db: Database, accountId: string) {
  return {
    accountId,
    db,

    subscriptions: {
      async findFirst(extraWhere?: SQL) {
        const filter = eq(subscriptions.accountId, accountId);
        return db.query.subscriptions.findFirst({
          where: extraWhere ? and(filter, extraWhere) : filter,
        });
      },
    },
  };
}

export type AccountRepository = ReturnType<typeof createAccountRepository>;

// ---------------------------------------------------------------------------
// Standalone helpers — used when only subscriptionId or other key is available
//
// [BUG-565] SECURITY: These helpers are intentionally unscoped — they look up
// rows by a key that is not the account/profile owner. Callers MUST verify
// ownership before returning any data to a client. Intended exclusively for:
//   - Stripe webhook handlers (authenticated by Stripe event signature)
//   - RevenueCat webhook handlers (authenticated by transaction ID from IPN)
//   - Internal cron/system functions that iterate across accounts
//
// The `__unscoped` suffix is a deliberate signal to reviewers. If you find
// yourself calling these from a user-facing route, stop — use
// `createAccountRepository(db, accountId)` instead.
// ---------------------------------------------------------------------------

/**
 * Find a subscription by its primary key.
 *
 * SECURITY: caller MUST verify ownership before returning data to a client;
 * intended for webhook handlers that already authenticate by external event ID.
 */
export async function findSubscriptionById__unscoped(
  db: Database,
  subscriptionId: string,
) {
  return db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, subscriptionId),
  });
}

/**
 * Lock-and-read a subscription row by primary key (SELECT … FOR UPDATE).
 *
 * MUST be called inside a `db.transaction()` callback — the row lock is held
 * until the transaction commits, serializing concurrent tier-change
 * transactions on the same subscription. A plain in-transaction read under
 * READ COMMITTED does NOT serialize: two transactions can both read the same
 * pre-change tier before either commits.
 *
 * SECURITY: same caller contract as findSubscriptionById__unscoped.
 */
export async function lockSubscriptionById__unscoped(
  db: Database,
  subscriptionId: string,
) {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, subscriptionId))
    .for('update');
  return row;
}

/**
 * Lock-and-read a subscription row by account ID (SELECT … FOR UPDATE).
 * Same contract and rationale as lockSubscriptionById__unscoped.
 */
export async function lockSubscriptionByAccountId__unscoped(
  db: Database,
  accountId: string,
) {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.accountId, accountId))
    .limit(1)
    .for('update');
  return row;
}

/**
 * Find a subscription by its Stripe subscription ID.
 *
 * SECURITY: caller MUST verify ownership before returning data to a client;
 * intended for Stripe webhook handlers that authenticate via event signature.
 */
export async function findSubscriptionByStripeId__unscoped(
  db: Database,
  stripeSubscriptionId: string,
) {
  return db.query.subscriptions.findFirst({
    where: eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId),
  });
}

/**
 * Find the quota pool for a subscription.
 *
 * SECURITY: caller MUST verify ownership before returning data to a client;
 * intended for webhook handlers that already authenticate by external event ID.
 */
export async function findQuotaPool__unscoped(
  db: Database,
  subscriptionId: string,
) {
  return db.query.quotaPools.findFirst({
    where: eq(quotaPools.subscriptionId, subscriptionId),
  });
}

/**
 * Find a top-up credit by its RevenueCat transaction ID.
 *
 * SECURITY: caller MUST verify ownership before returning data to a client;
 * intended for RevenueCat IPN webhook handlers that authenticate by
 * transaction ID delivered via signed IPN payload.
 */
export async function findTopUpByTransactionId__unscoped(
  db: Database,
  transactionId: string,
) {
  return db.query.topUpCredits.findFirst({
    where: eq(topUpCredits.revenuecatTransactionId, transactionId),
  });
}
