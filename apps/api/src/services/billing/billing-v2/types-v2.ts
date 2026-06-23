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
// sets the legacy pgEnums use). Parse them through the shared schema contract
// before exposing the legacy typed shape so DB/fixture drift fails closed at the
// billing boundary.
//
// This is a flag-gated v2 module: it is reachable only when
// IDENTITY_V2_ENABLED='true', which no deployed environment sets until the
// WI-586 convergence flip. Legacy `types.ts` stays byte-identical.
// ---------------------------------------------------------------------------

import { subscription } from '@eduagent/database';
import {
  subscriptionStatusSchema,
  subscriptionTierSchema,
  type SubscriptionTier,
  type SubscriptionStatus,
} from '@eduagent/schemas';
import type { SubscriptionRow } from '../types';

export function parseSubscriptionV2PlanTier(value: string): SubscriptionTier {
  const result = subscriptionTierSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Invalid billing v2 subscription planTier from database: "${value}"`,
    );
  }
  return result.data;
}

export function parseSubscriptionV2Status(value: string): SubscriptionStatus {
  const result = subscriptionStatusSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Invalid billing v2 subscription status from database: "${value}"`,
    );
  }
  return result.data;
}

/**
 * Maps a new-table `subscription` row to the legacy `SubscriptionRow` contract
 * shape. See the module header for the field-name mapping rationale.
 */
export function mapSubscriptionV2Row(
  row: typeof subscription.$inferSelect,
): SubscriptionRow {
  const tier = parseSubscriptionV2PlanTier(row.planTier);
  const status = parseSubscriptionV2Status(row.status);

  return {
    id: row.id,
    // organization.id = accounts.id by the reseed — the contract field stays
    // `accountId` so downstream callers need no change.
    accountId: row.organizationId,
    stripeCustomerId: row.stripeCustomerId,
    stripeSubscriptionId: row.stripeSubscriptionId,
    tier,
    status,
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
