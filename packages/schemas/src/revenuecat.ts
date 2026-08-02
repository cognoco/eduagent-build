import { z } from 'zod';

// ---------------------------------------------------------------------------
// RevenueCat webhook event payload schema
//
// External-provider contract: RevenueCat webhook POST body shape.
// Moved from apps/api/src/routes/revenuecat-webhook.ts (WI-988) so that
// API-facing schemas live in the shared contract package.
// ---------------------------------------------------------------------------

/**
 * [WI-3055] An optional field in a RevenueCat webhook payload.
 *
 * RevenueCat sends an explicit `null` — not an omission — for fields that do
 * not apply to a given event. A `NON_RENEWING_PURCHASE` (consumable top-up)
 * always carries `entitlement_ids: null` and `expiration_at_ms: null`, because
 * a consumable grants no entitlement and never expires.
 *
 * Zod's `.optional()` accepts `undefined` but rejects `null`, so declaring
 * these fields `.optional()` failed validation on every top-up webhook: the
 * route returned 400 before any processing and the purchased credits were
 * never granted, while the store had already charged the customer.
 *
 * `.nullish()` accepts absent | null | value on the wire; the transform then
 * normalises `null` to `undefined` on the way out, so consumers keep a single
 * "not present" representation and the parsed output type stays
 * `T | undefined`. That last part is deliberate and load-bearing:
 * `revenuecat-webhook.ts` branches on `event.event_timestamp_ms === undefined`,
 * and the v2 handlers pass these fields straight into `T | undefined`
 * parameters, so letting `null` reach them would silently change behaviour at
 * roughly twenty call sites.
 *
 * `??` only substitutes null/undefined, so genuinely present falsy values
 * (`is_family_share: false`, `purchased_at_ms: 0`) survive untouched.
 *
 * The trailing `.optional()` is required, not decorative: a bare
 * `.nullish().transform(...)` leaves the key *present but possibly undefined*
 * (`app_id: string | undefined`) rather than *optional* (`app_id?: string`),
 * which would force every constructor of a `RevenuecatWebhookEvent` to spell
 * out all twenty fields. It keeps the emitted type byte-identical to the
 * pre-fix `.optional()` shape.
 *
 * Required fields (`id`, `type`, `app_user_id`) deliberately do NOT use this —
 * a null there is a malformed payload and must still be rejected.
 */
function rcOptional<T extends z.ZodType>(schema: T) {
  return schema
    .nullish()
    .transform((value) => value ?? undefined)
    .optional();
}

export const revenuecatWebhookEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  app_id: rcOptional(z.string()),
  app_user_id: z.string(),
  original_app_user_id: rcOptional(z.string()),
  product_id: rcOptional(z.string()),
  entitlement_ids: rcOptional(z.array(z.string())),
  period_type: rcOptional(z.string()),
  purchased_at_ms: rcOptional(z.number()),
  expiration_at_ms: rcOptional(z.number()),
  store: rcOptional(z.string()),
  environment: rcOptional(z.string()),
  is_family_share: rcOptional(z.boolean()),
  transferred_from: rcOptional(z.array(z.string())),
  transferred_to: rcOptional(z.array(z.string())),
  new_product_id: rcOptional(z.string()),
  cancel_reason: rcOptional(z.string()),
  grace_period_expiration_at_ms: rcOptional(z.number()),
  transaction_id: rcOptional(z.string()),
  store_transaction_id: rcOptional(z.string()),
  /** BD-01: Event timestamp for ordering-based idempotency. */
  event_timestamp_ms: rcOptional(z.number()),
});
export type RevenuecatWebhookEvent = z.infer<
  typeof revenuecatWebhookEventSchema
>;

export const revenuecatWebhookSchema = z.object({
  api_version: rcOptional(z.string()),
  event: revenuecatWebhookEventSchema,
});
export type RevenuecatWebhook = z.infer<typeof revenuecatWebhookSchema>;
