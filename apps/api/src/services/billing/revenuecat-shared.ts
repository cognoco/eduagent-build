// ---------------------------------------------------------------------------
// RevenueCat webhook — shared, store-agnostic types and helpers
// ---------------------------------------------------------------------------
// [WI-1239 / 779-strip] Relocated from the legacy revenuecat-webhook-handler.ts
// (store-coupled, superseded by billing-v2/revenuecat-webhook-handler-v2.ts).
// This module holds only the inbound-payload type and pure product-id mapping
// — no DB access — so both the legacy handler (retained for its test seam)
// and the v2 handler share exactly one copy.

// ---------------------------------------------------------------------------
// Inbound event shape (kept in sync with revenuecatWebhookSchema in the route)
// ---------------------------------------------------------------------------
//
// We intentionally do NOT import the Zod schema here — the route owns parsing
// (route-level validation is required so a malformed payload returns 400 at
// the HTTP boundary). Handlers receive the already-validated `event` and use
// this inferred type to stay type-safe without depending on the route.
export interface RevenueCatEvent {
  id: string;
  type: string;
  app_user_id: string;
  original_app_user_id?: string;
  product_id?: string;
  entitlement_ids?: string[];
  period_type?: string;
  purchased_at_ms?: number;
  expiration_at_ms?: number;
  store?: string;
  environment?: string;
  is_family_share?: boolean;
  transferred_from?: string[];
  transferred_to?: string[];
  new_product_id?: string;
  cancel_reason?: string;
  grace_period_expiration_at_ms?: number;
  transaction_id?: string;
  store_transaction_id?: string;
  /** BD-01: Event timestamp for ordering-based idempotency. */
  event_timestamp_ms?: number;
}

// ---------------------------------------------------------------------------
// Product ID mapping
// ---------------------------------------------------------------------------

const PRODUCT_TIER_MAP: Record<string, 'plus' | 'family' | 'pro'> = {
  // iOS products
  'com.eduagent.plus.monthly': 'plus',
  'com.eduagent.plus.yearly': 'plus',
  'com.eduagent.family.monthly': 'family',
  'com.eduagent.family.yearly': 'family',
  'com.eduagent.pro.monthly': 'pro',
  'com.eduagent.pro.yearly': 'pro',
  // Android products (same naming convention)
  'com.eduagent.plus.monthly.android': 'plus',
  'com.eduagent.plus.yearly.android': 'plus',
  'com.eduagent.family.monthly.android': 'family',
  'com.eduagent.family.yearly.android': 'family',
  'com.eduagent.pro.monthly.android': 'pro',
  'com.eduagent.pro.yearly.android': 'pro',
};

/**
 * Maps consumable product IDs to the number of top-up credits granted.
 */
const CONSUMABLE_PRODUCT_CREDITS: Record<string, number> = {
  'com.eduagent.topup.500': 500,
  'com.eduagent.topup.500.android': 500,
};

/**
 * Returns the credit amount for a consumable product ID, or null if not a top-up product.
 */
export function getTopUpCreditsForProduct(
  productId: string | undefined,
): number | null {
  if (!productId) return null;
  return CONSUMABLE_PRODUCT_CREDITS[productId] ?? null;
}

/**
 * Extracts the tier from a product ID using the product-to-tier map.
 * [BUG-444] The regex fallback was removed — it granted entitlement for ANY
 * product matching `com.eduagent.<tier>.*` prefix, including future trial-only,
 * marketing, or test products not in the authoritative PRODUCT_TIER_MAP.
 * Unknown product_ids now hit the Sentry escalation path in callers.
 */
export function extractTierFromProductId(
  productId: string | undefined,
): ('plus' | 'family' | 'pro') | null {
  if (!productId) return null;

  // Authoritative lookup only — no regex fallback.
  // Unknown products must be added to PRODUCT_TIER_MAP explicitly.
  return PRODUCT_TIER_MAP[productId] ?? null;
}
