// ---------------------------------------------------------------------------
// BD-10: Account-scoped repository for billing tables.
//
// Parallels `createScopedRepository` (profile-scoped) for account-level
// tables: subscriptions, quota_pools, top_up_credits.
//
// Use `createAccountRepository(db, accountId)` when accountId is available.
// Use standalone helpers (findSubscriptionById, findQuotaPool, etc.) when
// only a subscriptionId or other key is available.
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
// ---------------------------------------------------------------------------

/** Find a subscription by its primary key. */
export async function findSubscriptionById(
  db: Database,
  subscriptionId: string,
) {
  return db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, subscriptionId),
  });
}

/** Find a subscription by its Stripe subscription ID. */
export async function findSubscriptionByStripeId(
  db: Database,
  stripeSubscriptionId: string,
) {
  return db.query.subscriptions.findFirst({
    where: eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId),
  });
}

/** Find the quota pool for a subscription. */
export async function findQuotaPool(db: Database, subscriptionId: string) {
  return db.query.quotaPools.findFirst({
    where: eq(quotaPools.subscriptionId, subscriptionId),
  });
}

/** Find a top-up credit by its RevenueCat transaction ID. */
export async function findTopUpByTransactionId(
  db: Database,
  transactionId: string,
) {
  return db.query.topUpCredits.findFirst({
    where: eq(topUpCredits.revenuecatTransactionId, transactionId),
  });
}
