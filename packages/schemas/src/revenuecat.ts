import { z } from 'zod';

// ---------------------------------------------------------------------------
// RevenueCat webhook event payload schema
//
// External-provider contract: RevenueCat webhook POST body shape.
// Moved from apps/api/src/routes/revenuecat-webhook.ts (WI-988) so that
// API-facing schemas live in the shared contract package.
// ---------------------------------------------------------------------------

export const revenuecatWebhookEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  app_id: z.string().optional(),
  app_user_id: z.string(),
  original_app_user_id: z.string().optional(),
  product_id: z.string().optional(),
  entitlement_ids: z.array(z.string()).optional(),
  period_type: z.string().optional(),
  purchased_at_ms: z.number().optional(),
  expiration_at_ms: z.number().optional(),
  store: z.string().optional(),
  environment: z.string().optional(),
  is_family_share: z.boolean().optional(),
  transferred_from: z.array(z.string()).optional(),
  transferred_to: z.array(z.string()).optional(),
  new_product_id: z.string().optional(),
  cancel_reason: z.string().optional(),
  grace_period_expiration_at_ms: z.number().optional(),
  transaction_id: z.string().optional(),
  store_transaction_id: z.string().optional(),
  /** BD-01: Event timestamp for ordering-based idempotency. */
  event_timestamp_ms: z.number().optional(),
});
export type RevenuecatWebhookEvent = z.infer<
  typeof revenuecatWebhookEventSchema
>;

export const revenuecatWebhookSchema = z.object({
  api_version: z.string().optional(),
  event: revenuecatWebhookEventSchema,
});
export type RevenuecatWebhook = z.infer<typeof revenuecatWebhookSchema>;
