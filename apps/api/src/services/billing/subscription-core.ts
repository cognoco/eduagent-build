// ---------------------------------------------------------------------------
// Billing — Subscription CRUD, Stripe linking, free provisioning, quota pool
// getSubscriptionByAccountId, createSubscription, updateSubscriptionFromWebhook,
// linkStripeCustomer, getQuotaPool, resetMonthlyQuota, ensureFreeSubscription,
// markSubscriptionCancelled, updateQuotaPoolLimit, activateSubscriptionFromCheckout
// ---------------------------------------------------------------------------

import { and, eq, isNull, lte, ne, or } from 'drizzle-orm';
import { z } from 'zod';
import {
  subscriptions,
  quotaPools,
  type Database,
  createAccountRepository,
  findSubscriptionByStripeId__unscoped,
  findSubscriptionByStripeCustomerId__unscoped,
  findQuotaPool__unscoped,
  lockSubscriptionByAccountId__unscoped,
} from '@eduagent/database';
import type { SubscriptionTier, SubscriptionStatus } from '@eduagent/schemas';
import { getTierConfig, isValidTransition } from '../subscription';
import { captureException } from '../sentry';
import { createLogger } from '../logger';
import { safeSend } from '../safe-non-core';
import { buildStripeCustomerCreateKey } from '../dedupe-key';
import { inngest } from '../../inngest/client';
import {
  mapSubscriptionRow,
  mapQuotaPoolRow,
  type SubscriptionRow,
  type AppliedSubscriptionRow,
  type QuotaPoolRow,
  type WebhookSubscriptionUpdate,
} from './types';
import { reconcileQuotaStateForSubscription } from './quota-reconcile';

const logger = createLogger();

// ---------------------------------------------------------------------------
// [BUG-120] Zod input contract for activateSubscriptionFromCheckout
// Stripe webhook payloads are external input — validate that accountId is
// non-empty, stripeSubscriptionId starts with the expected `sub_` prefix,
// tier is a known paid tier, and eventTimestamp is parseable. Without this,
// a malformed webhook (e.g. tier='' from a metadata typo) reaches the DB
// layer and either throws an opaque enum error or silently inserts a bad
// row.
// ---------------------------------------------------------------------------

const activateCheckoutInputSchema = z.object({
  accountId: z.string().min(1, 'accountId required'),
  stripeSubscriptionId: z
    .string()
    .min(1, 'stripeSubscriptionId required')
    .startsWith('sub_', 'stripeSubscriptionId must start with sub_'),
  tier: z.enum(['plus', 'family', 'pro']),
  eventTimestamp: z.string().refine((s) => !Number.isNaN(Date.parse(s)), {
    message: 'eventTimestamp must be ISO-8601 / parseable by Date',
  }),
});

// ---------------------------------------------------------------------------
// getSubscriptionByAccountId
// ---------------------------------------------------------------------------

/**
 * Reads the subscription for a given account.
 * Returns null if no subscription exists.
 */
export async function getSubscriptionByAccountId(
  db: Database,
  accountId: string,
): Promise<SubscriptionRow | null> {
  const repo = createAccountRepository(db, accountId);
  const row = await repo.subscriptions.findFirst();
  return row ? mapSubscriptionRow(row) : null;
}

// ---------------------------------------------------------------------------
// createSubscription
// ---------------------------------------------------------------------------

/**
 * Creates a new subscription for an account.
 * Also creates the associated quota pool with the given monthly limit.
 */
export async function createSubscription(
  db: Database,
  accountId: string,
  tier: SubscriptionTier,
  monthlyLimit: number,
  options?: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    trialEndsAt?: string;
    status?: SubscriptionStatus;
  },
): Promise<SubscriptionRow> {
  return db.transaction(async (tx) => {
    const [subRow] = await tx
      .insert(subscriptions)
      .values({
        accountId,
        tier,
        status: options?.status ?? 'trial',
        stripeCustomerId: options?.stripeCustomerId ?? null,
        stripeSubscriptionId: options?.stripeSubscriptionId ?? null,
        trialEndsAt: options?.trialEndsAt
          ? new Date(options.trialEndsAt)
          : null,
      })
      .returning();

    if (!subRow) throw new Error('Subscription insert did not return a row');

    // Create the quota pool linked to this subscription.
    const now = new Date();
    const cycleResetAt = new Date(now);
    cycleResetAt.setMonth(cycleResetAt.getMonth() + 1);

    const tierConfig = getTierConfig(tier);
    await tx.insert(quotaPools).values({
      subscriptionId: subRow.id,
      monthlyLimit,
      usedThisMonth: 0,
      dailyLimit: tierConfig.dailyLimit,
      usedToday: 0,
      cycleResetAt,
    });
    await reconcileQuotaStateForSubscription(
      tx as unknown as Database,
      subRow.id,
      now,
    );

    return mapSubscriptionRow(subRow);
  });
}

// ---------------------------------------------------------------------------
// updateSubscriptionFromWebhook
// ---------------------------------------------------------------------------

/**
 * Idempotent update from a Stripe webhook event.
 * Skips the update if `lastStripeEventTimestamp` is newer than the incoming event,
 * preventing out-of-order event processing.
 *
 * [CR-2026-05-19-M11] The idempotency check (event-ID dedup + timestamp ordering)
 * and the write are wrapped in a single `db.transaction()` so two concurrent
 * deliveries of the same Stripe event cannot both see "not yet processed" and
 * both write. The partial unique index on (accountId, lastStripeEventId) provides
 * the storage-layer guarantee; the transaction ensures the read coherence.
 */
export async function updateSubscriptionFromWebhook(
  db: Database,
  stripeSubscriptionId: string,
  updates: WebhookSubscriptionUpdate,
): Promise<AppliedSubscriptionRow | null> {
  return db.transaction(async (tx) => {
    // Load current row inside the transaction (BD-10: via standalone helper —
    // keyed by Stripe ID, not accountId).
    // Known Drizzle pattern: PgTransaction → Database cast (see feedback_drizzle_transaction_cast.md)
    // safe-caller: Stripe webhook — authenticated by Stripe event signature; keyed by external Stripe ID
    const existing = await findSubscriptionByStripeId__unscoped(
      tx as unknown as Database,
      stripeSubscriptionId,
    );

    if (!existing) {
      return null;
    }

    // [CR-2026-05-19-M11] Exact-duplicate event-ID dedup INSIDE the transaction
    // so the check and write are coherent. Same event ID means already processed.
    if (
      updates.stripeEventId &&
      existing.lastStripeEventId === updates.stripeEventId
    ) {
      return { ...mapSubscriptionRow(existing), webhookApplied: false };
    }

    // Idempotency check: skip if incoming event is older (NaN-safe) [1C.6]
    if (existing.lastStripeEventTimestamp) {
      const existingTs = existing.lastStripeEventTimestamp.getTime();
      const incomingTs = new Date(updates.lastStripeEventTimestamp).getTime();
      if (
        !Number.isNaN(existingTs) &&
        !Number.isNaN(incomingTs) &&
        incomingTs < existingTs
      ) {
        return { ...mapSubscriptionRow(existing), webhookApplied: false };
      }
      if (
        !Number.isNaN(existingTs) &&
        !Number.isNaN(incomingTs) &&
        incomingTs === existingTs &&
        existing.status === 'active' &&
        updates.status === 'past_due'
      ) {
        return { ...mapSubscriptionRow(existing), webhookApplied: false };
      }
    }
    const setValues: Record<string, unknown> = {
      lastStripeEventTimestamp: new Date(updates.lastStripeEventTimestamp),
      updatedAt: new Date(),
    };

    // [CR-2026-05-19-M11] Stamp event ID for atomic dedup on next delivery.
    if (updates.stripeEventId) {
      setValues.lastStripeEventId = updates.stripeEventId;
    }

    if (updates.tier !== undefined) {
      setValues.tier = updates.tier;
    }
    if (updates.status !== undefined && updates.status !== existing.status) {
      if (!isValidTransition(existing.status, updates.status)) {
        // [BUG-447] Throw so callers do NOT proceed to updateQuotaPoolLimit.
        // Returning the existing row silently caused quota pool to reflect
        // newTier while subscription.tier stayed at oldTier — divergent billing
        // state. Throwing surfaces the problem and prevents the downstream
        // quota update from firing. Mirror of the fix in revenuecat.ts.
        const transitionErr = new Error(
          `Invalid Stripe subscription transition: ${existing.status} -> ${updates.status}`,
        );
        logger.error(
          'Invalid Stripe subscription transition — aborting update',
          {
            from: existing.status,
            to: updates.status,
            subscriptionId: existing.id,
            tag: 'billing.invalid_transition',
          },
        );
        captureException(transitionErr, {
          extra: {
            subscriptionId: existing.id,
            fromStatus: existing.status,
            toStatus: updates.status,
            tag: 'billing.invalid_transition',
          },
        });
        throw transitionErr;
      }
      setValues.status = updates.status;
    }
    if (updates.currentPeriodStart !== undefined) {
      setValues.currentPeriodStart = new Date(updates.currentPeriodStart);
    }
    if (updates.currentPeriodEnd !== undefined) {
      setValues.currentPeriodEnd = new Date(updates.currentPeriodEnd);
    }
    if (updates.cancelledAt !== undefined) {
      setValues.cancelledAt = updates.cancelledAt
        ? new Date(updates.cancelledAt)
        : null;
    }

    // Concurrent-delivery defense: under READ COMMITTED two transactions can
    // both see lastStripeEventId !== updates.stripeEventId at SELECT time and
    // both proceed to UPDATE the same row (last-writer-wins). Adding the
    // event-ID predicate makes the second UPDATE re-evaluate against the
    // post-commit row and return 0 rows, so we can detect the duplicate and
    // return the existing snapshot instead of double-writing.
    const whereParts = [eq(subscriptions.id, existing.id)];
    if (updates.stripeEventId) {
      const eventIdPredicate = or(
        isNull(subscriptions.lastStripeEventId),
        ne(subscriptions.lastStripeEventId, updates.stripeEventId),
      );
      if (eventIdPredicate) whereParts.push(eventIdPredicate);
    }
    const incomingEventTimestamp = new Date(updates.lastStripeEventTimestamp);
    const eventTimestampPredicate = or(
      isNull(subscriptions.lastStripeEventTimestamp),
      lte(subscriptions.lastStripeEventTimestamp, incomingEventTimestamp),
    );
    if (eventTimestampPredicate) whereParts.push(eventTimestampPredicate);

    const [updated] = await tx
      .update(subscriptions)
      .set(setValues)
      .where(and(...whereParts))
      .returning();

    if (!updated) {
      // 0 rows returned most likely means a concurrent delivery already
      // stamped this stripeEventId. Re-read and confirm before short-circuiting.
      const recheck = await findSubscriptionByStripeId__unscoped(
        tx as unknown as Database,
        stripeSubscriptionId,
      );
      if (
        recheck &&
        updates.stripeEventId &&
        recheck.lastStripeEventId === updates.stripeEventId
      ) {
        return { ...mapSubscriptionRow(recheck), webhookApplied: false };
      }
      const recheckTs = recheck?.lastStripeEventTimestamp?.getTime();
      const incomingTs = incomingEventTimestamp.getTime();
      if (
        recheck &&
        recheckTs != null &&
        !Number.isNaN(recheckTs) &&
        !Number.isNaN(incomingTs) &&
        incomingTs < recheckTs
      ) {
        return { ...mapSubscriptionRow(recheck), webhookApplied: false };
      }
      throw new Error('Subscription webhook update did not return a row');
    }
    await reconcileQuotaStateForSubscription(
      tx as unknown as Database,
      updated.id,
    );
    return { ...mapSubscriptionRow(updated), webhookApplied: true };
  });
}

// ---------------------------------------------------------------------------
// linkStripeCustomer
// ---------------------------------------------------------------------------

/**
 * Links a Stripe customer ID to an existing subscription.
 */
export async function linkStripeCustomer(
  db: Database,
  accountId: string,
  stripeCustomerId: string,
): Promise<SubscriptionRow | null> {
  const repo = createAccountRepository(db, accountId);
  const existing = await repo.subscriptions.findFirst();

  if (!existing) {
    return null;
  }

  const [updated] = await db
    .update(subscriptions)
    .set({
      stripeCustomerId,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, existing.id))
    .returning();

  if (!updated)
    throw new Error('Stripe customer link update did not return a row');
  return mapSubscriptionRow(updated);
}

// ---------------------------------------------------------------------------
// getOrCreateStripeCustomer
// ---------------------------------------------------------------------------

/**
 * Minimal structural slice of the Stripe SDK this service needs: the ability to
 * create a customer (with an idempotency-key option). Declared locally so the
 * service does not put the full `Stripe` SDK type in its public signature, and
 * so route callers can pass the real `stripe.customers.create` directly (its
 * type is assignable to this).
 */
export interface StripeCustomerCreator {
  customers: {
    create: (
      params: { email?: string; metadata?: Record<string, string> },
      options?: { idempotencyKey?: string },
    ) => Promise<{ id: string }>;
  };
}

/**
 * Resolves the Stripe customer for an account, creating one if absent — race-safe.
 *
 * [BUG-827] TOCTOU race: the previous inline route logic did
 * read-subscription → if no `stripeCustomerId`, `stripe.customers.create` →
 * `linkStripeCustomer`. Two concurrent billing requests for the same account
 * (e.g. /checkout + /top-up, or a double-tapped /checkout) both observed "no
 * customer", both created a Stripe customer, and one became an orphaned,
 * unlinked duplicate customer in Stripe (the second link UPDATE overwrote the
 * first). Orphan customers are a real-money/data hazard and silently inflate the
 * Stripe customer list.
 *
 * Fix (two independent guards):
 *   1. Row lock. The whole resolve-create-link runs inside a `db.transaction`
 *      that opens with `SELECT … FOR UPDATE` on the account's subscription row
 *      (`lockSubscriptionByAccountId__unscoped`). The second concurrent request
 *      blocks on the lock until the first commits, then re-reads the row and
 *      sees the now-linked `stripeCustomerId` — so it never calls
 *      `customers.create` at all. This serializes within a single Postgres.
 *   2. Idempotency key. The `customers.create` call carries a stable
 *      idempotency key derived from the accountId, so even across separate
 *      Worker isolates / connections that don't share the row lock, two creates
 *      with the same key return the SAME Stripe customer rather than two — no
 *      orphan. (Stripe idempotency keys live 24h, which covers any concurrent
 *      burst; after linking we never call create again.)
 *
 * The row lock is deliberately held across the Stripe HTTP call. The general
 * rule is to avoid external calls inside a held lock, but this is the dormant,
 * low-concurrency web-billing path and correctness (no orphan customer) is worth
 * the brief connection pin; the lock is what guarantees the loser skips the
 * create entirely.
 *
 * Returns the resolved Stripe customer id. Throws if the account has no
 * subscription row (callers must `ensureFreeSubscription` first, as the routes
 * already do).
 */
export async function getOrCreateStripeCustomer(
  db: Database,
  accountId: string,
  stripe: StripeCustomerCreator,
  params: { email: string },
): Promise<string> {
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;
    // safe-caller: billing route — accountId resolved from the authenticated
    // owner account (requireAccount + assertNotProxyMode upstream).
    const locked = await lockSubscriptionByAccountId__unscoped(txDb, accountId);
    if (!locked) {
      throw new Error(
        'getOrCreateStripeCustomer: no subscription row for account',
      );
    }

    // Re-check under the lock. If a concurrent request already created and
    // linked a customer, return it without touching Stripe.
    if (locked.stripeCustomerId) {
      return locked.stripeCustomerId;
    }

    // Stable per-account key so concurrent creates dedupe to one customer.
    const idempotencyKey = buildStripeCustomerCreateKey(accountId);
    const customer = await stripe.customers.create(
      {
        email: params.email,
        metadata: { accountId },
      },
      { idempotencyKey },
    );

    const [updated] = await tx
      .update(subscriptions)
      .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
      .where(eq(subscriptions.id, locked.id))
      .returning();

    if (!updated) {
      throw new Error('Stripe customer link update did not return a row');
    }
    return customer.id;
  });
}

// ---------------------------------------------------------------------------
// getSubscriptionByStripeCustomerId
// ---------------------------------------------------------------------------

/**
 * Reads the subscription bound to a given Stripe customer ID.
 * Returns null if no subscription is bound to that customer.
 *
 * SECURITY: the Stripe customer ID arrives in a webhook payload authenticated
 * by Stripe event signature. The result is used by the checkout-completed
 * handler to verify that the (operator-mutable) metadata.accountId matches the
 * account already bound to this customer before granting an entitlement — do
 * NOT expose this to user-facing routes (it is unscoped by design).
 */
export async function getSubscriptionByStripeCustomerId(
  db: Database,
  stripeCustomerId: string,
): Promise<SubscriptionRow | null> {
  const row = await findSubscriptionByStripeCustomerId__unscoped(
    db,
    stripeCustomerId,
  );
  return row ? mapSubscriptionRow(row) : null;
}

// ---------------------------------------------------------------------------
// getQuotaPool
// ---------------------------------------------------------------------------

/**
 * Reads the quota pool for a subscription.
 */
export async function getQuotaPool(
  db: Database,
  subscriptionId: string,
): Promise<QuotaPoolRow | null> {
  // safe-caller: internal billing aggregate — subscriptionId comes from a previously-verified account row
  const row = await findQuotaPool__unscoped(db, subscriptionId);
  return row ? mapQuotaPoolRow(row) : null;
}

// ---------------------------------------------------------------------------
// resetMonthlyQuota
// ---------------------------------------------------------------------------

/**
 * Resets the monthly quota counter and updates the limit.
 * Called at the start of each billing cycle.
 */
export async function resetMonthlyQuota(
  db: Database,
  subscriptionId: string,
  newLimit: number,
): Promise<QuotaPoolRow | null> {
  // safe-caller: billing cycle reset (cron/Stripe webhook) — subscriptionId from verified event
  const existing = await findQuotaPool__unscoped(db, subscriptionId);

  if (!existing) {
    return null;
  }

  const now = new Date();
  const nextReset = new Date(now);
  nextReset.setMonth(nextReset.getMonth() + 1);

  const [updated] = await db
    .update(quotaPools)
    .set({
      monthlyLimit: newLimit,
      usedThisMonth: 0,
      usedToday: 0,
      cycleResetAt: nextReset,
      updatedAt: now,
    })
    .where(eq(quotaPools.id, existing.id))
    .returning();

  if (!updated) throw new Error('Quota pool update did not return a row');
  return mapQuotaPoolRow(updated);
}

// ---------------------------------------------------------------------------
// ensureFreeSubscription
// ---------------------------------------------------------------------------

// Free-tier auto-provisioning (CR1 fix: ensures free users get metered)
const FREE_TIER_LIMIT = getTierConfig('free').monthlyQuota;

/**
 * Ensures an account has a subscription row for metering.
 * If no subscription exists, auto-provisions a free-tier subscription + quota pool.
 * This prevents free-tier users from bypassing metering entirely.
 *
 * [BUG-116] Race-safe: two concurrent first-webhook calls (e.g. RevenueCat
 * delivering INITIAL_PURCHASE and a parallel metering middleware request)
 * both saw `no subscription`, both attempted INSERT, the second crashed
 * against the UNIQUE(account_id) constraint. We now use ON CONFLICT DO
 * NOTHING on the insert and fall back to a re-read so the loser of the race
 * sees the row inserted by the winner. The quota-pool insert is best-effort
 * — if the unique(subscription_id) constraint trips, the other writer
 * already created it, so we no-op.
 */
export async function ensureFreeSubscription(
  db: Database,
  accountId: string,
): Promise<SubscriptionRow> {
  const existing = await getSubscriptionByAccountId(db, accountId);
  if (existing) return existing;

  // Attempt the insert with ON CONFLICT DO NOTHING. If we win the race, we
  // get the inserted row back. If another writer beat us, returning() yields
  // an empty array and we re-read.
  const now = new Date();
  const cycleResetAt = new Date(now);
  cycleResetAt.setMonth(cycleResetAt.getMonth() + 1);
  const tierConfig = getTierConfig('free');

  const inserted = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(subscriptions)
      .values({
        accountId,
        tier: 'free',
        status: 'active',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        trialEndsAt: null,
      })
      .onConflictDoNothing({ target: subscriptions.accountId })
      .returning();

    if (!row) return null;

    // We won the race — also create the quota pool. Same race-safe insert.
    await tx
      .insert(quotaPools)
      .values({
        subscriptionId: row.id,
        monthlyLimit: FREE_TIER_LIMIT,
        usedThisMonth: 0,
        dailyLimit: tierConfig.dailyLimit,
        usedToday: 0,
        cycleResetAt,
      })
      .onConflictDoNothing({ target: quotaPools.subscriptionId });
    await reconcileQuotaStateForSubscription(
      tx as unknown as Database,
      row.id,
      now,
    );
    return row;
  });

  if (inserted) {
    return mapSubscriptionRow(inserted);
  }

  // Lost the race — the other writer's row should now be visible. Re-read.
  const winner = await getSubscriptionByAccountId(db, accountId);
  if (winner) return winner;

  // Extremely unlikely fallthrough: ON CONFLICT fired but the re-read still
  // returns null (would indicate the row was deleted between the two reads,
  // or a partition-level isolation issue). Escalate so we know, and surface
  // a hard error rather than continuing in an inconsistent state.
  captureException(
    new Error(
      'ensureFreeSubscription: ON CONFLICT fired but re-read returned null',
    ),
    {
      extra: {
        context: 'billing.ensure_free_subscription.race_fallthrough',
        accountId,
      },
    },
  );
  throw new Error(
    'ensureFreeSubscription: failed to insert and failed to re-read existing',
  );
}

// ---------------------------------------------------------------------------
// markSubscriptionCancelled
// ---------------------------------------------------------------------------

/**
 * Sets `cancelledAt` on a subscription for immediate UX feedback.
 * The webhook will also set this, but marking it locally avoids waiting
 * for the async Stripe event to reflect in the GET /subscription response.
 */
export async function markSubscriptionCancelled(
  db: Database,
  subscriptionId: string,
): Promise<void> {
  await db
    .update(subscriptions)
    .set({
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, subscriptionId));
}

// ---------------------------------------------------------------------------
// updateQuotaPoolLimit
// ---------------------------------------------------------------------------

/**
 * Updates the monthly limit on a quota pool without resetting usedThisMonth.
 * Used for mid-cycle tier changes — preserves current usage count.
 */
export async function updateQuotaPoolLimit(
  db: Database,
  subscriptionId: string,
  newLimit: number,
  dailyLimit: number | null,
): Promise<void> {
  const updatedRows = await db
    .update(quotaPools)
    .set({
      monthlyLimit: newLimit,
      dailyLimit,
      updatedAt: new Date(),
    })
    .where(eq(quotaPools.subscriptionId, subscriptionId))
    .returning({ id: quotaPools.id });

  if (updatedRows.length === 0) {
    throw new Error(
      `Missing quota pool for subscription ${subscriptionId}; rolling back quota limit update`,
    );
  }
}

// ---------------------------------------------------------------------------
// activateSubscriptionFromCheckout
// ---------------------------------------------------------------------------

/**
 * Bridges a Stripe subscription ID to our internal subscription row.
 * Called from `checkout.session.completed` webhook handler.
 *
 * - If no subscription exists → creates one via createSubscription()
 * - If subscription exists with null stripeSubscriptionId → links it
 * - If subscription already has a stripeSubscriptionId → returns existing (idempotent)
 */
export async function activateSubscriptionFromCheckout(
  db: Database,
  accountId: string,
  stripeSubscriptionId: string,
  tier: 'plus' | 'family' | 'pro',
  eventTimestamp: string,
): Promise<SubscriptionRow | null> {
  // [BUG-120] Validate input — webhook metadata is externally controlled. A
  // malformed accountId/tier/sub-id/timestamp must be rejected with an Error
  // the webhook handler can escalate to Sentry, not silently coerced.
  const parsed = activateCheckoutInputSchema.safeParse({
    accountId,
    stripeSubscriptionId,
    tier,
    eventTimestamp,
  });
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    logger.error('[billing] activateSubscriptionFromCheckout invalid input', {
      event: 'billing.activate_checkout.invalid_input',
      issues: flat,
    });
    captureException(
      new Error('activateSubscriptionFromCheckout: invalid input'),
      {
        extra: {
          context: 'billing.activate_checkout.invalid_input',
          issues: flat,
        },
      },
    );
    throw new Error(
      `activateSubscriptionFromCheckout: invalid input — ${JSON.stringify(flat)}`,
    );
  }

  const existing = await getSubscriptionByAccountId(db, accountId);

  if (!existing) {
    const tierConfig = getTierConfig(tier);
    return createSubscription(db, accountId, tier, tierConfig.monthlyQuota, {
      stripeSubscriptionId,
      status: 'active',
    });
  }

  // [BUG-111] When the account already has a linked Stripe subscription and
  // the incoming Stripe sub ID DIFFERS, we used to silently drop the new
  // activation. That can happen when:
  //   (a) Stripe replays an old completed checkout after the user upgraded.
  //   (b) A new checkout completes for a different product before the prior
  //       sub was cancelled.
  // The fix: Stripe is the source of truth, and `eventTimestamp` tells us
  // which sub is newer. If the incoming event is newer than the row's
  // `lastStripeEventTimestamp`, UPDATE the row to the new subscription. If
  // the incoming event is older, drop it (stale replay) and escalate to
  // Sentry + Inngest so we can triage. Same-ID retries no-op silently.
  if (existing.stripeSubscriptionId) {
    if (existing.stripeSubscriptionId !== stripeSubscriptionId) {
      if (existing.lastStripeEventTimestamp === null) {
        logger.warn(
          '[billing] checkout activation rejected — cannot determine event order (NULL lastStripeEventTimestamp)',
          {
            event: 'billing.activate_checkout.divergent_sub',
            resolution: 'rejected_indeterminate_order',
            accountId,
            existingStripeSubscriptionId: existing.stripeSubscriptionId,
            incomingStripeSubscriptionId: stripeSubscriptionId,
            existingTier: existing.tier,
            incomingTier: tier,
            existingEventTimestamp: existing.lastStripeEventTimestamp,
            incomingEventTimestamp: eventTimestamp,
          },
        );
        captureException(
          new Error(
            'activateSubscriptionFromCheckout: divergent Stripe sub — rejected (indeterminate order, null lastStripeEventTimestamp)',
          ),
          {
            extra: {
              context: 'billing.activate_checkout.divergent_sub',
              resolution: 'rejected_indeterminate_order',
              accountId,
              existingStripeSubscriptionId: existing.stripeSubscriptionId,
              incomingStripeSubscriptionId: stripeSubscriptionId,
              existingTier: existing.tier,
              incomingTier: tier,
              existingEventTimestamp: existing.lastStripeEventTimestamp,
              incomingEventTimestamp: eventTimestamp,
            },
          },
        );
        await safeSend(
          () =>
            inngest.send({
              // orphan-allow: structured telemetry required by AGENTS.md
              // (silent recovery in billing must emit a structured signal). The
              // divergent-sub conflict is resolved in-line here and escalated
              // via logger.warn + captureException(Sentry). The Inngest event is
              // a dashboard-queryable signal for divergence frequency/resolution
              // — no automated remediation handler is needed.
              name: 'app/billing.activate_checkout.divergent_sub',
              data: {
                resolution: 'rejected_indeterminate_order',
                accountId,
                existingStripeSubscriptionId: existing.stripeSubscriptionId,
                incomingStripeSubscriptionId: stripeSubscriptionId,
                existingTier: existing.tier,
                incomingTier: tier,
                existingEventTimestamp: existing.lastStripeEventTimestamp,
                incomingEventTimestamp: eventTimestamp,
                timestamp: new Date().toISOString(),
              },
            }),
          'billing.activate_checkout.divergent_sub',
          { accountId },
        );
        return existing;
      }

      const incomingTs = new Date(eventTimestamp).getTime();
      const existingTs = new Date(existing.lastStripeEventTimestamp).getTime();
      const incomingIsNewer = incomingTs > existingTs;
      const resolution = incomingIsNewer
        ? 'updated_to_incoming'
        : 'kept_existing_dropped_incoming';

      logger.warn('[billing] checkout activation with divergent Stripe sub', {
        event: 'billing.activate_checkout.divergent_sub',
        resolution,
        accountId,
        existingStripeSubscriptionId: existing.stripeSubscriptionId,
        incomingStripeSubscriptionId: stripeSubscriptionId,
        existingTier: existing.tier,
        incomingTier: tier,
        existingEventTimestamp: existing.lastStripeEventTimestamp,
        incomingEventTimestamp: eventTimestamp,
      });
      captureException(
        new Error(
          incomingIsNewer
            ? 'activateSubscriptionFromCheckout: divergent Stripe sub — applied newer event over older row'
            : 'activateSubscriptionFromCheckout: divergent Stripe sub — dropped older incoming event',
        ),
        {
          extra: {
            context: 'billing.activate_checkout.divergent_sub',
            resolution,
            accountId,
            existingStripeSubscriptionId: existing.stripeSubscriptionId,
            incomingStripeSubscriptionId: stripeSubscriptionId,
            existingTier: existing.tier,
            incomingTier: tier,
            existingEventTimestamp: existing.lastStripeEventTimestamp,
            incomingEventTimestamp: eventTimestamp,
          },
        },
      );

      if (incomingIsNewer) {
        // Stripe is the source of truth and the incoming event is newer —
        // override existing row with the new subscription. Quota pool limit
        // is also updated so the user's tier reflects the latest activation.
        // [CR-2026-05-19-M3 / atomicity] Wrap both writes in a transaction so
        // a process death cannot leave subscriptions.tier updated while quota
        // pool still carries the old limit.
        const tierConfig = getTierConfig(tier);
        const updatedDivergent = await db.transaction(async (tx) => {
          const [row] = await tx
            .update(subscriptions)
            .set({
              stripeSubscriptionId,
              tier,
              status: 'active',
              lastStripeEventTimestamp: new Date(eventTimestamp),
              updatedAt: new Date(),
            })
            .where(eq(subscriptions.id, existing.id))
            .returning();

          if (!row)
            throw new Error(
              'Divergent-sub activation update did not return a row',
            );

          const [quotaPool] = await tx
            .update(quotaPools)
            .set({
              monthlyLimit: tierConfig.monthlyQuota,
              dailyLimit: tierConfig.dailyLimit,
              updatedAt: new Date(),
            })
            .where(eq(quotaPools.subscriptionId, existing.id))
            .returning({ id: quotaPools.id });

          if (!quotaPool)
            throw new Error(
              'Divergent-sub quota pool update did not return a row',
            );

          await reconcileQuotaStateForSubscription(
            tx as unknown as Database,
            existing.id,
          );
          return row;
        });
        await safeSend(
          () =>
            inngest.send({
              // orphan-allow: structured telemetry required by AGENTS.md (silent
              // recovery in billing must emit a structured signal). Divergence is
              // resolved in-line (row updated to incoming) + escalated via
              // logger.warn + captureException; the event is a dashboard-
              // queryable signal, no automated handler intended.
              name: 'app/billing.activate_checkout.divergent_sub',
              data: {
                resolution,
                accountId,
                existingStripeSubscriptionId: existing.stripeSubscriptionId,
                incomingStripeSubscriptionId: stripeSubscriptionId,
                existingTier: existing.tier,
                incomingTier: tier,
                existingEventTimestamp: existing.lastStripeEventTimestamp,
                incomingEventTimestamp: eventTimestamp,
                timestamp: new Date().toISOString(),
              },
            }),
          'billing.activate_checkout.divergent_sub',
          { accountId },
        );
        return mapSubscriptionRow(updatedDivergent);
      }
      // Incoming is older — stale replay. Keep existing, no-op.
      await safeSend(
        () =>
          inngest.send({
            // orphan-allow: structured telemetry required by AGENTS.md (silent
            // recovery in billing must emit a structured signal). Divergence is
            // resolved in-line + escalated via logger.warn + captureException;
            // the event is a dashboard-queryable signal, no handler intended.
            name: 'app/billing.activate_checkout.divergent_sub',
            data: {
              resolution,
              accountId,
              existingStripeSubscriptionId: existing.stripeSubscriptionId,
              incomingStripeSubscriptionId: stripeSubscriptionId,
              existingTier: existing.tier,
              incomingTier: tier,
              existingEventTimestamp: existing.lastStripeEventTimestamp,
              incomingEventTimestamp: eventTimestamp,
              timestamp: new Date().toISOString(),
            },
          }),
        'billing.activate_checkout.divergent_sub',
        { accountId },
      );
      return existing;
    }
    // Same Stripe sub ID → genuine idempotent retry, OK to no-op silently.
    return existing;
  }

  // Bridge: set stripeSubscriptionId, tier, status, timestamp
  // [CR-2026-05-19-M3 / atomicity] Both the subscription update and the quota
  // pool update must be atomic — a process death between the two would leave
  // subscriptions.tier at the new value while the quota pool still carries the
  // old limit (billing leak). Wrap in a transaction so both commit or neither does.
  const tierConfig = getTierConfig(tier);
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(subscriptions)
      .set({
        stripeSubscriptionId,
        tier,
        status: 'active',
        lastStripeEventTimestamp: new Date(eventTimestamp),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, existing.id))
      .returning();

    if (!row)
      throw new Error('Subscription activation update did not return a row');

    // Update quota pool limit to match the new tier (inside same tx)
    const [quotaPool] = await tx
      .update(quotaPools)
      .set({
        monthlyLimit: tierConfig.monthlyQuota,
        dailyLimit: tierConfig.dailyLimit,
        updatedAt: new Date(),
      })
      .where(eq(quotaPools.subscriptionId, existing.id))
      .returning({ id: quotaPools.id });

    if (!quotaPool) throw new Error('Quota pool update did not return a row');

    await reconcileQuotaStateForSubscription(
      tx as unknown as Database,
      existing.id,
    );
    return row;
  });

  return mapSubscriptionRow(updated);
}
