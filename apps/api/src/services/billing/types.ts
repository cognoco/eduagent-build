// ---------------------------------------------------------------------------
// Billing — Shared types and mappers
// Used by all billing sub-modules to avoid circular imports.
// ---------------------------------------------------------------------------

import { quotaPools } from '@eduagent/database';
import type { SubscriptionTier, SubscriptionStatus } from '@eduagent/schemas';

// ---------------------------------------------------------------------------
// Shared row types
// ---------------------------------------------------------------------------

export interface SubscriptionRow {
  id: string;
  accountId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelledAt: string | null;
  lastStripeEventTimestamp: string | null;
  lastStripeEventId: string | null;
  revenuecatOriginalAppUserId: string | null;
  lastRevenuecatEventId: string | null;
  lastRevenuecatEventTimestampMs: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AppliedSubscriptionRow = SubscriptionRow & {
  webhookApplied: boolean;
};

export interface QuotaPoolRow {
  id: string;
  subscriptionId: string;
  monthlyLimit: number;
  usedThisMonth: number;
  dailyLimit: number | null;
  usedToday: number;
  cycleResetAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookSubscriptionUpdate {
  tier?: SubscriptionTier;
  status?: SubscriptionStatus;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelledAt?: string | null;
  lastStripeEventTimestamp: string;
  /** [CR-2026-05-19-M11] Stripe event-ID for exact-duplicate dedup inside transaction. */
  stripeEventId?: string;
}

/**
 * Minimal structural slice of the Stripe SDK needed to create a customer
 * (with an idempotency-key option). Declared locally so callers do not put
 * the full `Stripe` SDK type in their public signature, and so route
 * callers can pass the real `stripe.customers.create` directly (its type is
 * assignable to this).
 *
 * [WI-1239 / 779-strip] Relocated from the legacy subscription-core.ts
 * (whose getOrCreateStripeCustomer was removed — dead) — this type is still
 * used by getOrCreateStripeCustomerV2 (billing-v2/subscription-core-v2.ts).
 */
export interface StripeCustomerCreator {
  customers: {
    create: (
      params: { email?: string; metadata?: Record<string, string> },
      options?: { idempotencyKey?: string },
    ) => Promise<{ id: string }>;
  };
}

// ---------------------------------------------------------------------------
// Shared mappers — Drizzle Date -> API ISO string
// ---------------------------------------------------------------------------

// [WI-1139] mapSubscriptionRow (mapped the legacy `subscriptions` table row)
// removed — dead, no callers. The `SubscriptionRow`/`AppliedSubscriptionRow`
// types above stay: they are the live shared contract every billing-v2
// mapper (subscription-core-v2.ts's mapSubscriptionRowV2, etc.) produces.

export function mapQuotaPoolRow(
  row: typeof quotaPools.$inferSelect,
): QuotaPoolRow {
  return {
    id: row.id,
    subscriptionId: row.subscriptionId,
    monthlyLimit: row.monthlyLimit,
    usedThisMonth: row.usedThisMonth,
    dailyLimit: row.dailyLimit,
    usedToday: row.usedToday,
    cycleResetAt: row.cycleResetAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
