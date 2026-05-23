// ---------------------------------------------------------------------------
// Billing price ↔ tier mapping
// ---------------------------------------------------------------------------
//
// The mapping between a paid tier and its Stripe Price ID is configured per
// environment via STRIPE_PRICE_<TIER>_<INTERVAL> bindings. Keeping the forward
// (tier → price) and inverse (price → tier) resolvers in one module ensures the
// checkout-session creator (routes/billing.ts) and the webhook verifier
// (routes/stripe-webhook.ts) cannot drift — drift between the two is the root
// of [WI-85 / WI-175] (entitlements granted from unverified metadata).

import type { PaidTier, BillingInterval } from '@eduagent/schemas';

const PAID_TIERS: readonly PaidTier[] = ['plus', 'family', 'pro'];
const INTERVALS: readonly BillingInterval[] = ['monthly', 'yearly'];

/** Subset of route bindings holding the configured Stripe price IDs. */
export interface StripePriceEnv {
  STRIPE_PRICE_PLUS_MONTHLY?: string;
  STRIPE_PRICE_PLUS_YEARLY?: string;
  STRIPE_PRICE_FAMILY_MONTHLY?: string;
  STRIPE_PRICE_FAMILY_YEARLY?: string;
  STRIPE_PRICE_PRO_MONTHLY?: string;
  STRIPE_PRICE_PRO_YEARLY?: string;
}

/** Forward: the configured Stripe Price ID for a (tier, interval), if any. */
export function resolvePriceId(
  env: StripePriceEnv,
  tier: PaidTier,
  interval: BillingInterval,
): string | undefined {
  const key =
    `STRIPE_PRICE_${tier.toUpperCase()}_${interval.toUpperCase()}` as keyof StripePriceEnv;
  return env[key];
}

/**
 * Inverse: the paid tier a Stripe Price ID belongs to, or null when the price
 * is not configured in this environment (legacy/unmapped). Authoritative source
 * of truth for what was actually purchased — preferred over metadata.tier.
 */
export function resolveTierFromPriceId(
  env: StripePriceEnv,
  priceId: string | undefined | null,
): PaidTier | null {
  if (!priceId) return null;
  for (const tier of PAID_TIERS) {
    for (const interval of INTERVALS) {
      if (resolvePriceId(env, tier, interval) === priceId) return tier;
    }
  }
  return null;
}

/**
 * True when at least one STRIPE_PRICE_* binding is configured — i.e. Stripe
 * billing is live in this environment. Lets callers distinguish a genuine
 * price/tier drift (pricing configured but a price is unmapped → alert) from
 * the dormant state (no prices configured → expected, don't alert). Stripe
 * billing being live always implies these are set, since checkout-session
 * creation (resolvePriceId) requires them.
 */
export function isStripePricingConfigured(env: StripePriceEnv): boolean {
  return PAID_TIERS.some((tier) =>
    INTERVALS.some((interval) => !!resolvePriceId(env, tier, interval)),
  );
}

export interface TierVerification {
  /** Tier to grant — the price-authoritative tier, else the metadata fallback. */
  effectiveTier: PaidTier | null;
  /**
   * - `ok`: price verified the tier (or there was nothing to verify).
   * - `mismatch`: a mapped price disagrees with the metadata tier (price wins).
   * - `unverifiable`: metadata tier present but no line item maps to a tier,
   *   while pricing IS configured — genuine drift, worth alerting.
   * - `unconfigured`: metadata tier present but no STRIPE_PRICE_* configured
   *   (Stripe dormant) — expected steady state, not an anomaly.
   */
  status: 'ok' | 'mismatch' | 'unverifiable' | 'unconfigured';
  priceTier: PaidTier | null;
  metadataTier: PaidTier | null;
  /** Matched plan price when one mapped, else the first line-item price. */
  priceId: string | undefined;
}

/**
 * Decide the authoritative subscription tier from the actually-purchased price,
 * falling back to the checkout-stamped metadata tier only when no line item
 * maps to a configured price. Pure (no I/O) so the route layer can emit the
 * appropriate Sentry/log signal from `status` and stay unit-testable [WI-175].
 */
export function verifySubscriptionTier(
  env: StripePriceEnv,
  metadataTier: PaidTier | null,
  itemPriceIds: readonly string[],
): TierVerification {
  // Scan all line items — Stripe does not guarantee items.data ordering, and
  // add-on/proration items can precede the plan price.
  let priceTier: PaidTier | null = null;
  let matchedPriceId: string | undefined;
  for (const candidate of itemPriceIds) {
    const mapped = resolveTierFromPriceId(env, candidate);
    if (mapped) {
      priceTier = mapped;
      matchedPriceId = candidate;
      break;
    }
  }
  const priceId = matchedPriceId ?? itemPriceIds[0];
  const effectiveTier = priceTier ?? metadataTier;

  let status: TierVerification['status'] = 'ok';
  if (priceTier && metadataTier && priceTier !== metadataTier) {
    status = 'mismatch';
  } else if (!priceTier && metadataTier) {
    status = isStripePricingConfigured(env) ? 'unverifiable' : 'unconfigured';
  }

  return { effectiveTier, status, priceTier, metadataTier, priceId };
}
