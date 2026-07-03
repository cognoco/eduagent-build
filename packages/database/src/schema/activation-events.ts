import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUUIDv7 } from '../utils/uuid';
import { person } from './identity';

/**
 * WI-1504 — launch activation instrumentation (first-party only; MVP).
 *
 * Rows land here for both pre-account touchpoints (profileId is NULL —
 * app_opened / signup_started fire before an identity row exists, keyed by
 * anonymousId only) and post-account touchpoints (profileId set once a
 * profile exists). This is a sanctioned nullable-profileId table, consistent
 * with the account-level-events canon exception in AGENTS.md — activation
 * funnel rows are scoped by anonymousId pre-signup and by profileId
 * post-signup, not always by a profile.
 *
 * NEVER write raw learning content or sensitive child data into `metadata`
 * — this table is funnel telemetry (counts, timing, route/source, build
 * info), not a content log.
 */
export const activationEvents = pgTable(
  'activation_events',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    // Nullable: app_opened / signup_started fire before a profile row exists.
    profileId: uuid('profile_id').references(() => person.id, {
      onDelete: 'cascade',
    }),
    // Client-generated anonymous/device id. Present for client-driven events
    // (app_opened, day2_return, review_card_seen/tapped) fired via the
    // ingest route; may also be set on server-recorded events when the
    // client forwards it, to let pre- and post-signup rows for the same
    // device be joined in funnel queries.
    anonymousId: text('anonymous_id'),
    eventType: text('event_type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Build/environment provenance — never inferred server-side beyond what
    // the caller declares, so staging/dev noise is identifiable and excludable.
    environment: text('environment'),
    appVersion: text('app_version'),
    platform: text('platform'),
    // Coarse profile shape at event time (e.g. 'solo_owner', 'guardian',
    // 'child', 'proxy', 'unknown') — never PII, just the audience segment
    // used to slice the funnel. Null pre-signup.
    profileShape: text('profile_shape'),
    // Screen/route or server source that produced the event (e.g.
    // 'onboarding.language_step', 'POST /profiles', 'POST /sessions/close').
    route: text('route'),
    dedupeKey: text('dedupe_key').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Global — not compound with profileId — because profileId is NULL for
    // pre-signup events and Postgres NULLs never collide under a unique
    // index, so a (profileId, dedupeKey) unique would not actually dedupe
    // anonymous rows. dedupeKey is constructed to already encode the actor
    // (profileId or anonymousId) where dedup matters.
    uniqueIndex('activation_events_dedupe_key_uq').on(table.dedupeKey),
    index('activation_events_created_at_idx').on(table.createdAt),
    index('activation_events_profile_created_idx').on(
      table.profileId,
      table.createdAt,
    ),
    index('activation_events_type_created_idx').on(
      table.eventType,
      table.createdAt,
    ),
    index('activation_events_anonymous_created_idx').on(
      table.anonymousId,
      table.createdAt,
    ),
    // Forward-only allow-list, mirrors practice_activity_events_source_type_known.
    // Update this list whenever a new activation touchpoint is introduced.
    check(
      'activation_events_event_type_known',
      sql`${table.eventType} IN ('app_opened', 'signup_started', 'signup_completed', 'onboarding_completed', 'first_subject_or_lesson_started', 'first_session_started', 'first_session_completed', 'review_card_seen', 'review_card_tapped', 'day2_return')`,
    ),
  ],
);

export type ActivationEvent = typeof activationEvents.$inferSelect;
export type NewActivationEvent = typeof activationEvents.$inferInsert;
