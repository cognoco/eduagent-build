import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { person, subscription } from './identity';
import { generateUUIDv7 } from '../utils/uuid';

export const quotaPools = pgTable(
  'quota_pools',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .unique()
      .references(() => subscription.id, { onDelete: 'cascade' }),
    monthlyLimit: integer('monthly_limit').notNull().default(100),
    usedThisMonth: integer('used_this_month').notNull().default(0),
    dailyLimit: integer('daily_limit'),
    usedToday: integer('used_today').notNull().default(0),
    cycleResetAt: timestamp('cycle_reset_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'quota_pools_used_this_month_non_negative',
      sql`${table.usedThisMonth} >= 0`,
    ),
  ],
);

export const profileQuotaUsage = pgTable(
  'profile_quota_usage',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscription.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'child'] }).notNull(),
    monthlyLimit: integer('monthly_limit').notNull(),
    usedThisMonth: integer('used_this_month').notNull().default(0),
    dailyLimit: integer('daily_limit'),
    usedToday: integer('used_today').notNull().default(0),
    cycleResetAt: timestamp('cycle_reset_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('profile_quota_usage_sub_profile_idx').on(
      table.subscriptionId,
      table.profileId,
    ),
    index('profile_quota_usage_subscription_idx').on(table.subscriptionId),
    // [BUG-886] profile_id has ON DELETE CASCADE -> profiles(id) but no index
    // with profile_id leftmost; without this the profile-delete cascade (GDPR
    // erasure path) seq-scans this table. The composite sub_profile idx above
    // has subscription_id leftmost, so it does not serve the cascade.
    index('profile_quota_usage_profile_id_idx').on(table.profileId),
    check(
      'profile_quota_usage_role_valid',
      sql`${table.role} IN ('owner', 'child')`,
    ),
    check(
      'profile_quota_usage_monthly_limit_non_negative',
      sql`${table.monthlyLimit} >= 0`,
    ),
    check(
      'profile_quota_usage_daily_limit_non_negative',
      sql`${table.dailyLimit} IS NULL OR ${table.dailyLimit} >= 0`,
    ),
    check(
      'profile_quota_usage_month_non_negative',
      sql`${table.usedThisMonth} >= 0`,
    ),
    check(
      'profile_quota_usage_today_non_negative',
      sql`${table.usedToday} >= 0`,
    ),
  ],
).enableRLS();

export const usageEvents = pgTable(
  'usage_events',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscription.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    delta: integer('delta').notNull().default(1),
  },
  (table) => [
    index('usage_events_subscription_occurred_idx').on(
      table.subscriptionId,
      table.occurredAt,
    ),
    index('usage_events_profile_occurred_idx').on(
      table.profileId,
      table.occurredAt,
    ),
    check('usage_events_delta_range', sql`${table.delta} IN (1, -1)`),
  ],
).enableRLS();

export const topUpCredits = pgTable(
  'top_up_credits',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscription.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id').references(() => person.id, {
      onDelete: 'cascade',
    }),
    amount: integer('amount').notNull(),
    remaining: integer('remaining').notNull(),
    purchasedAt: timestamp('purchased_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revenuecatTransactionId: text('revenuecat_transaction_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('top_up_credits_subscription_id_idx').on(table.subscriptionId),
    index('top_up_credits_sub_profile_expires_idx').on(
      table.subscriptionId,
      table.profileId,
      table.expiresAt,
    ),
    // [BUG-886] profile_id has ON DELETE CASCADE -> profiles(id) but no index
    // with profile_id leftmost; the composite idx above has subscription_id
    // leftmost, so the profile-delete cascade (GDPR erasure path) seq-scans
    // this table without a dedicated profile_id index.
    index('top_up_credits_profile_id_idx').on(table.profileId),
    uniqueIndex('top_up_credits_rc_txn_id_idx').on(
      table.revenuecatTransactionId,
    ),
    check(
      'top_up_credits_remaining_non_negative',
      sql`${table.remaining} >= 0`,
    ),
  ],
);

export const byokWaitlist = pgTable('byok_waitlist', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUUIDv7()),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Durable in-app recovery alerts for failed subscription payments.
 *
 * This is intentionally separate from notification_log: that table records
 * push delivery/rate-limit activity, while these rows remain user-visible for
 * as long as the canonical subscription is past_due.
 */
export const billingAlerts = pgTable(
  'billing_alerts',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscription.id, { onDelete: 'cascade' }),
    sourceEventId: text('source_event_id').notNull(),
    source: text('source', {
      enum: ['stripe', 'revenuecat', 'unknown'],
    }).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    pushStatus: text('push_status', { enum: ['sent', 'failed'] }),
    pushFailureReason: text('push_failure_reason'),
    emailStatus: text('email_status', { enum: ['sent', 'failed'] }),
    emailFailureReason: text('email_failure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('billing_alerts_source_event_id_uq').on(table.sourceEventId),
    index('billing_alerts_subscription_occurred_id_idx').on(
      table.subscriptionId,
      table.occurredAt.desc(),
      table.id.desc(),
    ),
    check(
      'billing_alerts_source_check',
      sql`${table.source} IN ('stripe', 'revenuecat', 'unknown')`,
    ),
    check(
      'billing_alerts_push_status_check',
      sql`${table.pushStatus} IS NULL OR ${table.pushStatus} IN ('sent', 'failed')`,
    ),
    check(
      'billing_alerts_email_status_check',
      sql`${table.emailStatus} IS NULL OR ${table.emailStatus} IN ('sent', 'failed')`,
    ),
  ],
);

export type BillingAlertRow = typeof billingAlerts.$inferSelect;
export type NewBillingAlertRow = typeof billingAlerts.$inferInsert;
