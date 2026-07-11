import { sql } from 'drizzle-orm';
import {
  check,
  date,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const BLOCKED_SAFETY_EVENT_NAMES = [
  'app/safety.dangerous_procedure_blocked',
  'app/safety.minor_pii_echo_redacted',
  'app/safety.suitability_blocked',
] as const;
export type BlockedSafetyEventName =
  (typeof BLOCKED_SAFETY_EVENT_NAMES)[number];

// One metadata-only receipt per source event. The event ID primary key makes
// Inngest replay idempotent before the daily bucket is incremented.
export const blockedSafetyDigestReceipts = pgTable(
  'blocked_safety_digest_receipts',
  {
    eventId: uuid('event_id').primaryKey(),
    eventName: text('event_name').notNull().$type<BlockedSafetyEventName>(),
    // Persistence-day semantics: assigned from server UTC on first successful
    // ingestion, never from an externally supplied event timestamp.
    bucketDate: date('bucket_date').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'blocked_safety_digest_receipts_event_name_check',
      sql`${table.eventName} IN ('app/safety.dangerous_procedure_blocked', 'app/safety.minor_pii_echo_redacted', 'app/safety.suitability_blocked')`,
    ),
  ],
);

// One row per UTC persistence day. Closed rows are never incremented because
// ingestion always targets the current server day; delivery marks only after
// the operator email succeeds.
export const blockedSafetyDailyBuckets = pgTable(
  'blocked_safety_daily_buckets',
  {
    bucketDate: date('bucket_date').primaryKey(),
    dangerousProcedureBlockedCount: integer('dangerous_procedure_blocked_count')
      .notNull()
      .default(0),
    minorPiiEchoRedactedCount: integer('minor_pii_echo_redacted_count')
      .notNull()
      .default(0),
    suitabilityBlockedCount: integer('suitability_blocked_count')
      .notNull()
      .default(0),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'blocked_safety_daily_buckets_dangerous_count_nonnegative',
      sql`${table.dangerousProcedureBlockedCount} >= 0`,
    ),
    check(
      'blocked_safety_daily_buckets_minor_pii_count_nonnegative',
      sql`${table.minorPiiEchoRedactedCount} >= 0`,
    ),
    check(
      'blocked_safety_daily_buckets_suitability_count_nonnegative',
      sql`${table.suitabilityBlockedCount} >= 0`,
    ),
  ],
);

export type BlockedSafetyDigestReceipt =
  typeof blockedSafetyDigestReceipts.$inferSelect;
export type BlockedSafetyDailyBucket =
  typeof blockedSafetyDailyBuckets.$inferSelect;
