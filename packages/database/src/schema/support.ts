import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { generateUUIDv7 } from '../utils/uuid';
import { person } from './identity';

// PII egress: app/feedback.delivery_failed events must not carry the user's
// feedback free-text through Inngest's third-party event store. The feedback
// route parks the full payload here (first-party DB) when the synchronous
// send fails, and the event carries only this row's opaque id; the retry
// consumer rehydrates the payload by id and deletes the row after a
// successful send. Residual rows (event dispatch failed, retries exhausted)
// are purged by the webhook-idempotency-purge cron after 7 days.
//
// `profileId` is TEXT without an FK: the feedback route's profile context can
// be the literal 'unknown', which a uuid FK to person.id would reject.
// Retention is bounded by delete-on-success + the 7-day purge instead of an
// ON DELETE CASCADE.
//
// RLS enabled (migration 0110) with the standard profile-isolation policy
// (`feedback_retry_queue_profile_isolation`) — text-to-text GUC comparison
// since profile_id is TEXT.
export const feedbackRetryQueue = pgTable('feedback_retry_queue', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUUIDv7()),
  profileId: text('profile_id').notNull(),
  userId: text('user_id').notNull(),
  category: text('category').notNull(),
  message: text('message').notNull(),
  metaLines: text('meta_lines').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
}).enableRLS();

export const supportMessages = pgTable(
  'support_messages',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    flow: text('flow').notNull(),
    surfaceKey: text('surface_key').notNull(),
    content: text('content').notNull(),
    attempts: integer('attempts').notNull(),
    firstAttemptedAt: timestamp('first_attempted_at', {
      withTimezone: true,
    }).notNull(),
    escalatedAt: timestamp('escalated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    failureReason: text('failure_reason'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: text('resolved_by'),
  },
  (table) => [
    index('support_messages_profile_idx').on(table.profileId),
    uniqueIndex('support_messages_profile_client_id_uniq').on(
      table.profileId,
      table.clientId,
    ),
  ],
);
