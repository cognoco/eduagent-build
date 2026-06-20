// ---------------------------------------------------------------------------
// Email Suppressions — permanently-dead recipient addresses.
//
// When Resend reports a HARD bounce (`bounce.type === 'Permanent'`) or a spam
// complaint, the recipient address is permanently un-emailable: re-sending to
// it burns send quota and erodes sender reputation. This table records those
// addresses so the send path can skip them.
//
// Soft / transient bounces (`Transient` / `Undetermined`) are deliberately NOT
// recorded here — they are temporary (full mailbox, greylisting, transient DNS)
// and the address may accept mail again later.
//
// The primary key is the lower-cased email address, so a repeat hard bounce for
// the same address is an idempotent no-op (INSERT ... ON CONFLICT DO NOTHING).
// This mirrors the infra-table pattern of `webhook_idempotency_keys` (not a
// profile-scoped table): suppression is a property of the destination address,
// not of any single user profile, and the same address may be shared across
// profiles (e.g. a parent's email on several child accounts).
// ---------------------------------------------------------------------------

import { pgTable, text, timestamp, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const emailSuppressions = pgTable(
  'email_suppressions',
  {
    // Lower-cased recipient address. The PK makes re-suppression idempotent.
    email: text('email').primaryKey(),
    // Why the address was suppressed — 'hard_bounce' | 'complaint'. text (not a
    // pg enum) to stay additive and avoid an enum-migration churn; the writer
    // is the single source of allowed values.
    reason: text('reason').notNull(),
    // Resend message id that triggered suppression, for support triage. May be
    // absent on some payloads, so nullable.
    emailId: text('email_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('email_suppressions_created_at_idx').on(table.createdAt),
    // Defense-in-depth: the writer is the source of allowed values, but the DB
    // also rejects anything outside the EmailSuppressionReason union. Keep this
    // IN-list in lockstep with EMAIL_SUPPRESSION_REASONS below.
    check(
      'email_suppressions_reason_check',
      sql`${table.reason} IN ('hard_bounce', 'complaint')`,
    ),
  ],
);

export type EmailSuppression = typeof emailSuppressions.$inferSelect;
export const EMAIL_SUPPRESSION_REASONS = ['hard_bounce', 'complaint'] as const;
export type EmailSuppressionReason = (typeof EMAIL_SUPPRESSION_REASONS)[number];
