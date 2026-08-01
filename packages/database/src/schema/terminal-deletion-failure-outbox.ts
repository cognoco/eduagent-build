import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * First-party durable carrier for the last-resort account/provider teardown
 * signals. The account may already be deleted, so this table intentionally has
 * no identity FK or profile RLS policy. Rows contain only the already-approved
 * PII-minimized dead-letter payload and are deleted after confirmed dispatch.
 */
export const terminalDeletionFailureOutbox = pgTable(
  'terminal_deletion_failure_outbox',
  {
    signalId: text('signal_id').primaryKey(),
    eventName: text('event_name').notNull(),
    accountId: text('account_id'),
    runId: text('run_id'),
    errorName: text('error_name').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'terminal_deletion_failure_outbox_event_name_check',
      sql`${table.eventName} IN ('app/account.deletion_teardown.failed', 'app/billing.subscription_store_teardown.failed')`,
    ),
    check(
      'terminal_deletion_failure_outbox_error_name_check',
      sql`${table.errorName} IN ('Error', 'NonError', 'TypeError', 'TimeoutError')`,
    ),
    index('terminal_deletion_failure_outbox_created_at_idx').on(
      table.createdAt,
    ),
  ],
);
