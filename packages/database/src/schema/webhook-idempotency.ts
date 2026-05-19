// ---------------------------------------------------------------------------
// Webhook Idempotency Keys — atomic dedup for inbound webhook handlers.
//
// [BUG-319 / CCR PR #254] The prior Resend webhook dedup used a Cloudflare KV
// check-then-write sequence. Cloudflare KV has no put-if-absent primitive, so
// two concurrent identical webhooks can both observe `seen === null` and both
// proceed past the gate. "Write before processing" shrinks the race window
// to the KV put-ack latency, but does NOT close it.
//
// This table provides the missing atomic primitive: a composite primary key
// on (source, webhook_id) makes the INSERT itself the gate. The second
// concurrent INSERT is rejected by Postgres with `23505 unique_violation` (or
// equivalently, INSERT ... ON CONFLICT DO NOTHING returns zero rows).
// ---------------------------------------------------------------------------

import {
  pgTable,
  primaryKey,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const webhookIdempotencyKeys = pgTable(
  'webhook_idempotency_keys',
  {
    source: text('source').notNull(),
    webhookId: text('webhook_id').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.source, table.webhookId] }),
    index('webhook_idempotency_keys_received_at_idx').on(table.receivedAt),
  ],
);

export type WebhookIdempotencyKey = typeof webhookIdempotencyKeys.$inferSelect;
