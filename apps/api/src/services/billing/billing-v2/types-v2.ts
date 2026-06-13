// ---------------------------------------------------------------------------
// CUT-B3 (WI-693) — billing-v2 shared mapper
//
// Maps the new `subscription` table row (organization-keyed) onto the SAME
// `SubscriptionRow` shape the legacy `subscriptions` mapper produces, so every
// downstream billing caller is insulated from the table swap. The field-name
// preservation is deliberate:
//   - subscription.organizationId → SubscriptionRow.accountId
//     (organization.id = accounts.id by the deterministic reseed, so the value
//     is identical; the contract field name stays `accountId`)
//   - subscription.planTier        → SubscriptionRow.tier
//   - subscription.periodStartAt   → SubscriptionRow.currentPeriodStart
//   - subscription.periodEndAt     → SubscriptionRow.currentPeriodEnd
//
// planTier/status are TEXT on the new table (CHECK-constrained to the same value
// sets the legacy pgEnums use), so the cast to SubscriptionTier/SubscriptionStatus
// is sound — the DB constraint is the hard floor.
//
// This is a flag-gated v2 module: it is reachable only when
// IDENTITY_V2_ENABLED='true', which no deployed environment sets until the
// WI-586 convergence flip. Legacy `types.ts` stays byte-identical.
// ---------------------------------------------------------------------------

import { subscription } from '@eduagent/database';
import type { SubscriptionTier, SubscriptionStatus } from '@eduagent/schemas';
import type { SubscriptionRow } from '../types';

/**
 * Maps a new-table `subscription` row to the legacy `SubscriptionRow` contract
 * shape. See the module header for the field-name mapping rationale.
 */
export function mapSubscriptionV2Row(
  row: typeof subscription.$inferSelect,
): SubscriptionRow {
  return {
    id: row.id,
    // organization.id = accounts.id by the reseed — the contract field stays
    // `accountId` so downstream callers need no change.
    accountId: row.organizationId,
    stripeCustomerId: row.stripeCustomerId,
    stripeSubscriptionId: row.stripeSubscriptionId,
    tier: row.planTier as SubscriptionTier,
    status: row.status as SubscriptionStatus,
    trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
    currentPeriodStart: row.periodStartAt?.toISOString() ?? null,
    currentPeriodEnd: row.periodEndAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    lastStripeEventTimestamp:
      row.lastStripeEventTimestamp?.toISOString() ?? null,
    lastStripeEventId: row.lastStripeEventId,
    revenuecatOriginalAppUserId: row.revenuecatOriginalAppUserId,
    lastRevenuecatEventId: row.lastRevenuecatEventId,
    lastRevenuecatEventTimestampMs: row.lastRevenuecatEventTimestampMs,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
