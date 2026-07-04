// ---------------------------------------------------------------------------
// BD-10: Account-scoped repository for billing tables.
//
// [WI-1239 / 779-strip] Most legacy `subscriptions`-table helpers
// (lockSubscriptionById__unscoped, lockSubscriptionByAccountId__unscoped,
// findSubscriptionByStripeId__unscoped, findSubscriptionByStripeCustomerId__unscoped)
// were removed — every caller was dead or routed through the v2 dispatch
// (billing-v2/dispatch.ts), which always selects the V2 handler bundle. Use
// the `V2` twins below (findSubscriptionByOrganizationId__unscoped etc.).
//
// [WI-1139] createAccountRepository and findSubscriptionById__unscoped
// (and the legacy `subscriptions` table they read) removed too — their last
// callers (services/account.ts's findOrCreateAccount, services/profile.ts's
// createProfileWithLimitCheck, billing/access.ts) were removed by
// WI-1364/WI-1398/WI-1139.
//
// Remaining standalone helpers are used when only a subscriptionId or other
// key is available — callers MUST verify ownership before returning data to
// a client.
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

import { eq } from 'drizzle-orm';
import type { Database } from './client';
import { quotaPools, topUpCredits, subscription } from './schema/index';

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
// yourself calling these from a user-facing route, stop.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// CUT-B3 (WI-693) — v2 subscription helpers (organization-keyed)
//
// The identity-foundation cutover re-homes the billing subsystem onto the
// `subscription` table keyed on `organization_id` (was `subscriptions` keyed
// on `account_id` — that table and its helpers were removed [WI-1239]). By
// the deterministic reseed `organization.id = accounts.id`, so the SAME id
// value the request context carries keys this store. The billing-v2 layer
// calls these helpers unconditionally (WI-868 removed the flag).
//
// SECURITY: same `__unscoped` caller contract as above — webhook handlers
// (authenticated by external event signature/transaction id) and internal
// cron only. Verify ownership before returning to a client.
// ---------------------------------------------------------------------------

/**
 * Find a subscription (v2 table) by its owning organization id.
 *
 * SECURITY: caller MUST verify ownership before returning data to a client;
 * intended for webhook handlers and internal billing aggregates.
 */
export async function findSubscriptionByOrganizationId__unscoped(
  db: Database,
  organizationId: string,
) {
  return db.query.subscription.findFirst({
    where: eq(subscription.organizationId, organizationId),
  });
}

/**
 * Lock-and-read a subscription (v2 table) row by organization id
 * (SELECT … FOR UPDATE). Same in-transaction contract and rationale as
 * lockSubscriptionByAccountId__unscoped.
 */
export async function lockSubscriptionByOrganizationId__unscoped(
  db: Database,
  organizationId: string,
) {
  const [row] = await db
    .select()
    .from(subscription)
    .where(eq(subscription.organizationId, organizationId))
    .limit(1)
    .for('update');
  return row;
}

/**
 * Find a subscription (v2 table) by its Stripe subscription ID.
 *
 * SECURITY: caller MUST verify ownership before returning data to a client;
 * intended for Stripe webhook handlers that authenticate via event signature.
 */
export async function findSubscriptionByStripeIdV2__unscoped(
  db: Database,
  stripeSubscriptionId: string,
) {
  return db.query.subscription.findFirst({
    where: eq(subscription.stripeSubscriptionId, stripeSubscriptionId),
  });
}

/**
 * Find a subscription (v2 table) by its Stripe customer ID.
 *
 * SECURITY: caller MUST verify ownership before returning data to a client;
 * intended for Stripe webhook handlers that authenticate via event signature.
 * Used by the v2 checkout-completed handler to assert the (operator-mutable)
 * metadata.accountId matches the account already bound to this Stripe customer
 * before granting an entitlement. `stripe_customer_id` is unique (partial
 * unique index `subscription_stripe_customer_id_idx`), so this returns at most
 * one row.
 */
export async function findSubscriptionByStripeCustomerIdV2__unscoped(
  db: Database,
  stripeCustomerId: string,
) {
  return db.query.subscription.findFirst({
    where: eq(subscription.stripeCustomerId, stripeCustomerId),
  });
}
