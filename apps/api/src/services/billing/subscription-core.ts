// ---------------------------------------------------------------------------
// Billing — quota pool reads (subscriptionId-keyed, store-agnostic)
//
// [WI-1364] The legacy subscription-CRUD subset (getSubscriptionByAccountId,
// createSubscription, ensureFreeSubscription) and the unused quota mutators
// (resetMonthlyQuota, updateQuotaPoolLimit) were removed — all callers were
// transitively dead (findOrCreateAccount / createProfileWithLimitCheck, also
// removed in WI-1364). Live v2 equivalents live in
// billing-v2/subscription-core-v2.ts. getQuotaPool is kept: it reads only
// `quota_pools` by subscriptionId (a neutral satellite table unaffected by the
// identity cutover) and is a live dependency of
// inngest/functions/session-completed.ts.
// ---------------------------------------------------------------------------

import { type Database, findQuotaPool__unscoped } from '@eduagent/database';
import { mapQuotaPoolRow, type QuotaPoolRow } from './types';

/**
 * Reads the quota pool for a subscription.
 */
export async function getQuotaPool(
  db: Database,
  subscriptionId: string,
): Promise<QuotaPoolRow | null> {
  // safe-caller: internal billing aggregate — subscriptionId comes from a previously-verified account row
  const row = await findQuotaPool__unscoped(db, subscriptionId);
  return row ? mapQuotaPoolRow(row) : null;
}
