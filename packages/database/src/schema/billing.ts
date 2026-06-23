import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { accounts, profiles } from './profiles';
import { generateUUIDv7 } from '../utils/uuid';

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trial',
  'active',
  'past_due',
  'cancelled',
  'expired',
]);

export const subscriptionTierEnum = pgEnum('subscription_tier', [
  'free',
  'plus',
  'family',
  'pro',
]);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    accountId: uuid('account_id')
      .notNull()
      .unique()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    stripeCustomerId: text('stripe_customer_id').unique(),
    stripeSubscriptionId: text('stripe_subscription_id').unique(),
    tier: subscriptionTierEnum('tier').notNull().default('free'),
    status: subscriptionStatusEnum('status').notNull().default('trial'),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    currentPeriodStart: timestamp('current_period_start', {
      withTimezone: true,
    }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    lastStripeEventTimestamp: timestamp('last_stripe_event_timestamp', {
      withTimezone: true,
    }),
    // [CR-2026-05-19-M11] Stripe event-ID dedup column — mirrors the
    // lastRevenuecatEventId pattern. Set atomically inside
    // updateSubscriptionFromWebhook so two concurrent deliveries of the same
    // Stripe event ID cannot both write (unique index enforces at storage layer).
    lastStripeEventId: text('last_stripe_event_id'),
    revenuecatOriginalAppUserId: text('revenuecat_original_app_user_id'),
    lastRevenuecatEventId: text('last_revenuecat_event_id'),
    lastRevenuecatEventTimestampMs: text('last_revenuecat_event_timestamp_ms'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // [BUG-116] DB-level idempotency for RevenueCat webhook events. The
    // application-layer isRevenuecatEventProcessed() check races with
    // ensureFreeSubscription on first-event delivery: two concurrent
    // identical webhooks can both see "not processed" and both proceed.
    // This partial unique index makes the race impossible at the storage
    // layer — the second UPDATE that tries to stamp the same event_id on
    // the same account row collides and is rejected by Postgres. The
    // partial WHERE clause prevents accounts that have never received an
    // RC event (lastRevenuecatEventId = NULL) from colliding with each
    // other on NULL.
    uniqueIndex('subscriptions_account_revenuecat_event_id_idx')
      .on(table.accountId, table.lastRevenuecatEventId)
      .where(sql`${table.lastRevenuecatEventId} IS NOT NULL`),
    // [CR-2026-05-19-M11] DB-level idempotency for Stripe subscription events.
    // Mirrors the RevenueCat pattern above. Two concurrent deliveries of the
    // same Stripe event ID cannot both write — the second UPDATE that tries to
    // stamp the same (accountId, lastStripeEventId) pair is rejected by Postgres.
    // The partial WHERE prevents NULL rows from colliding with each other.
    uniqueIndex('subscriptions_account_stripe_event_id_idx')
      .on(table.accountId, table.lastStripeEventId)
      .where(sql`${table.lastStripeEventId} IS NOT NULL`),
  ],
);

export const quotaPools = pgTable(
  'quota_pools',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .unique()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
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
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
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
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
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
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id').references(() => profiles.id, {
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
