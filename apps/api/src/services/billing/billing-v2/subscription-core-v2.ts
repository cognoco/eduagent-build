// ---------------------------------------------------------------------------
// CUT-B3 (WI-693) — billing-v2 subscription core
//
// v2 twin of subscription-core.ts. Reads/writes the new `subscription` table
// (organization-keyed) instead of `subscriptions` (account-keyed). The request
// context's `accountId` already equals `organization.id` under the flag (CUT-B1
// resolveIdentityV2 sets account.id = organization.id), so the same id value
// keys both stores.
//
// Field mapping (see types-v2.ts): organizationId↔accountId, planTier↔tier,
// periodStartAt/EndAt↔currentPeriodStart/End. The new table additionally
// requires payerPersonId (NOT NULL) on insert — derived as the organization's
// owner person (findOwnerPersonId).
//
// STORAGE-LAYER RACE FENCE (CR-2026-05-19-M11): updateSubscriptionFromWebhookV2
// stamps last_stripe_event_id and gates the UPDATE on
// (organization_id, last_stripe_event_id) via the partial unique index
// `subscription_org_stripe_event_id_idx` (migration 0114). Same semantics as the
// legacy `(account_id, last_stripe_event_id)` fence; organization.id = accounts.id
// by the reseed. The break test re-runs the concurrent-delivery scenario against
// this handler (red-green-revert) to prove the fence holds.
//
// Billing silent-recovery ban (AGENTS.md): every recovery branch escalates via a
// structured signal (captureException / safeSend Inngest), never bare console.warn.
//
// M-REPOINT PRECONDITION (WI-586 convergence runbook §4). The provisioning paths
// here insert `quota_pools` rows referencing the NEW `subscription.id`. Until
// the FK re-point (M-REPOINT, §4 step 6), `quota_pools.subscription_id` still
// targets LEGACY `subscriptions(id)`, so flag-on pre-repoint CI needs an
// id-aligned legacy parent row. Remove that bridge with the convergence drop.
//
// Flag-gated: reachable only when IDENTITY_V2_ENABLED='true'. Legacy
// subscription-core.ts stays byte-identical.
// ---------------------------------------------------------------------------

import { and, eq, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  subscription as subscriptionTable,
  organization,
  quotaPools,
  subscriptions as legacySubscriptions,
  type Database,
  findSubscriptionByOrganizationId__unscoped,
  findSubscriptionByStripeIdV2__unscoped,
  findSubscriptionByStripeCustomerIdV2__unscoped,
  findQuotaPool__unscoped,
  lockSubscriptionByOrganizationId__unscoped,
} from '@eduagent/database';
import type { SubscriptionTier, SubscriptionStatus } from '@eduagent/schemas';
import type { StripeCustomerCreator } from '../subscription-core';
import { getTierConfig, isValidTransition } from '../../subscription';
import { captureException } from '../../sentry';
import { createLogger } from '../../logger';
import { safeSend } from '../../safe-non-core';
import { buildStripeCustomerCreateKey } from '../../dedupe-key';
import { computeTrialEndDate } from '../../trial';
import { inngest } from '../../../inngest/client';
import { findOwnerPersonId } from '../../identity-v2/helpers';
import {
  mapQuotaPoolRow,
  type SubscriptionRow,
  type AppliedSubscriptionRow,
  type QuotaPoolRow,
  type WebhookSubscriptionUpdate,
} from '../types';
import { mapSubscriptionV2Row } from './types-v2';
import { reconcileQuotaStateForSubscriptionV2 } from './quota-reconcile-v2';

const logger = createLogger();
let legacySubscriptionsTableExistsCache: boolean | null = null;

// ---------------------------------------------------------------------------
// [BUG-120] Zod input contract for activateSubscriptionFromCheckoutV2 — same as
// legacy: webhook metadata is external input.
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

async function legacySubscriptionsTableExists(db: Database): Promise<boolean> {
  if (legacySubscriptionsTableExistsCache !== null) {
    return legacySubscriptionsTableExistsCache;
  }

  const raw = (await db.execute(
    sql`SELECT to_regclass('public.subscriptions') AS reg`,
  )) as unknown;
  const rows = Array.isArray(raw)
    ? (raw as Array<{ reg: string | null }>)
    : ((raw as { rows?: Array<{ reg: string | null }> }).rows ?? []);
  legacySubscriptionsTableExistsCache = rows[0]?.reg != null;
  return legacySubscriptionsTableExistsCache;
}

async function ensureLegacySubscriptionParent(
  db: Database,
  input: {
    subscriptionId: string;
    organizationId: string;
    tier: SubscriptionTier;
    status: SubscriptionStatus;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    trialEndsAt?: Date | null;
  },
): Promise<void> {
  if (!(await legacySubscriptionsTableExists(db))) return;

  await db
    .insert(legacySubscriptions)
    .values({
      id: input.subscriptionId,
      accountId: input.organizationId,
      tier: input.tier,
      status: input.status,
      stripeCustomerId: input.stripeCustomerId ?? null,
      stripeSubscriptionId: input.stripeSubscriptionId ?? null,
      trialEndsAt: input.trialEndsAt ?? null,
    })
    .onConflictDoNothing();
}

/**
 * Resolve the payer person id for an organization (the org's owner person).
 * The new `subscription` table requires payer_person_id NOT NULL; the owner is
 * the canonical payer for the bootstrap/free-provisioning paths. Returns null
 * when the org has no owner person — callers escalate rather than insert a
 * structurally-broken row.
 */
async function resolvePayerPersonId(
  db: Database,
  organizationId: string,
): Promise<string | null> {
  return findOwnerPersonId(db, organizationId);
}

// ---------------------------------------------------------------------------
// getSubscriptionByAccountId (v2: organization-keyed; field name kept)
// ---------------------------------------------------------------------------

export async function getSubscriptionByAccountIdV2(
  db: Database,
  organizationId: string,
): Promise<SubscriptionRow | null> {
  const row = await findSubscriptionByOrganizationId__unscoped(
    db,
    organizationId,
  );
  return row ? mapSubscriptionV2Row(row) : null;
}

// ---------------------------------------------------------------------------
// createSubscription (v2)
// ---------------------------------------------------------------------------

export async function createSubscriptionV2(
  db: Database,
  organizationId: string,
  tier: SubscriptionTier,
  monthlyLimit: number,
  options?: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    trialEndsAt?: string;
    status?: SubscriptionStatus;
  },
): Promise<SubscriptionRow> {
  const payerPersonId = await resolvePayerPersonId(db, organizationId);
  if (!payerPersonId) {
    // Billing silent-recovery ban: an org with no owner person cannot anchor a
    // subscription (payer_person_id NOT NULL). Escalate and throw rather than
    // insert a broken row or silently no-op.
    captureException(
      new Error(
        'createSubscriptionV2: organization has no owner person for payer anchor',
      ),
      {
        extra: {
          context: 'billing.v2.create_subscription.no_payer',
          organizationId,
        },
      },
    );
    throw new Error(
      `createSubscriptionV2: no owner person for organization ${organizationId}`,
    );
  }

  return db.transaction(async (tx) => {
    const [subRow] = await tx
      .insert(subscriptionTable)
      .values({
        organizationId,
        planTier: tier,
        status: options?.status ?? 'trial',
        payerPersonId,
        stripeCustomerId: options?.stripeCustomerId ?? null,
        stripeSubscriptionId: options?.stripeSubscriptionId ?? null,
        trialEndsAt: options?.trialEndsAt
          ? new Date(options.trialEndsAt)
          : null,
      })
      .returning();

    if (!subRow) throw new Error('Subscription insert did not return a row');

    const now = new Date();
    const cycleResetAt = new Date(now);
    cycleResetAt.setMonth(cycleResetAt.getMonth() + 1);

    const tierConfig = getTierConfig(tier);
    await ensureLegacySubscriptionParent(tx as unknown as Database, {
      subscriptionId: subRow.id,
      organizationId,
      tier,
      status: subRow.status as SubscriptionStatus,
      stripeCustomerId: options?.stripeCustomerId ?? null,
      stripeSubscriptionId: options?.stripeSubscriptionId ?? null,
      trialEndsAt: subRow.trialEndsAt ?? null,
    });
    await tx.insert(quotaPools).values({
      subscriptionId: subRow.id,
      monthlyLimit,
      usedThisMonth: 0,
      dailyLimit: tierConfig.dailyLimit,
      usedToday: 0,
      cycleResetAt,
    });
    await reconcileQuotaStateForSubscriptionV2(
      tx as unknown as Database,
      subRow.id,
      now,
    );

    return mapSubscriptionV2Row(subRow);
  });
}

// ---------------------------------------------------------------------------
// updateSubscriptionFromWebhook (v2) — STRIPE RACE FENCE
// ---------------------------------------------------------------------------

/**
 * Idempotent update from a Stripe webhook event (v2 table).
 *
 * [CR-2026-05-19-M11] The idempotency check (event-ID dedup + timestamp ordering)
 * and the write are wrapped in a single `db.transaction()`. The partial unique
 * index `subscription_org_stripe_event_id_idx` on
 * (organization_id, last_stripe_event_id) provides the storage-layer guarantee;
 * the transaction ensures read coherence. The UPDATE additionally gates on the
 * event-ID predicate so a concurrent delivery's UPDATE re-evaluates against the
 * post-commit row and returns 0 rows (detected and returned as a no-op).
 */
export async function updateSubscriptionFromWebhookV2(
  db: Database,
  stripeSubscriptionId: string,
  updates: WebhookSubscriptionUpdate,
): Promise<AppliedSubscriptionRow | null> {
  return db.transaction(async (tx) => {
    // safe-caller: Stripe webhook — authenticated by Stripe event signature;
    // keyed by external Stripe ID.
    const existing = await findSubscriptionByStripeIdV2__unscoped(
      tx as unknown as Database,
      stripeSubscriptionId,
    );

    if (!existing) {
      return null;
    }

    // [CR-2026-05-19-M11] Exact-duplicate event-ID dedup INSIDE the transaction.
    if (
      updates.stripeEventId &&
      existing.lastStripeEventId === updates.stripeEventId
    ) {
      return { ...mapSubscriptionV2Row(existing), webhookApplied: false };
    }

    // Idempotency: skip if incoming event is older (NaN-safe) [1C.6]
    if (existing.lastStripeEventTimestamp) {
      const existingTs = existing.lastStripeEventTimestamp.getTime();
      const incomingTs = new Date(updates.lastStripeEventTimestamp).getTime();
      if (
        !Number.isNaN(existingTs) &&
        !Number.isNaN(incomingTs) &&
        incomingTs < existingTs
      ) {
        return { ...mapSubscriptionV2Row(existing), webhookApplied: false };
      }
      if (
        !Number.isNaN(existingTs) &&
        !Number.isNaN(incomingTs) &&
        incomingTs === existingTs &&
        existing.status === 'active' &&
        updates.status === 'past_due'
      ) {
        return { ...mapSubscriptionV2Row(existing), webhookApplied: false };
      }
    }

    const setValues: Record<string, unknown> = {
      lastStripeEventTimestamp: new Date(updates.lastStripeEventTimestamp),
      updatedAt: new Date(),
    };

    if (updates.stripeEventId) {
      setValues.lastStripeEventId = updates.stripeEventId;
    }

    if (updates.tier !== undefined) {
      setValues.planTier = updates.tier;
    }
    if (updates.status !== undefined && updates.status !== existing.status) {
      if (
        !isValidTransition(
          existing.status as SubscriptionStatus,
          updates.status,
        )
      ) {
        // [BUG-447] Throw so callers do NOT proceed to updateQuotaPoolLimit.
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
      setValues.periodStartAt = new Date(updates.currentPeriodStart);
    }
    if (updates.currentPeriodEnd !== undefined) {
      setValues.periodEndAt = new Date(updates.currentPeriodEnd);
    }
    if (updates.cancelledAt !== undefined) {
      setValues.cancelledAt = updates.cancelledAt
        ? new Date(updates.cancelledAt)
        : null;
    }

    // Concurrent-delivery defense: gate the UPDATE on the event-ID + timestamp
    // predicate so a second concurrent delivery re-evaluates against the
    // post-commit row and returns 0 rows. The storage-layer guarantee is the
    // `subscription_org_stripe_event_id_idx` partial unique index.
    const whereParts = [eq(subscriptionTable.id, existing.id)];
    if (updates.stripeEventId) {
      const eventIdPredicate = or(
        isNull(subscriptionTable.lastStripeEventId),
        ne(subscriptionTable.lastStripeEventId, updates.stripeEventId),
      );
      if (eventIdPredicate) whereParts.push(eventIdPredicate);
    }
    const incomingEventTimestamp = new Date(updates.lastStripeEventTimestamp);
    const eventTimestampPredicate = or(
      isNull(subscriptionTable.lastStripeEventTimestamp),
      lte(subscriptionTable.lastStripeEventTimestamp, incomingEventTimestamp),
    );
    if (eventTimestampPredicate) whereParts.push(eventTimestampPredicate);

    const [updated] = await tx
      .update(subscriptionTable)
      .set(setValues)
      .where(and(...whereParts))
      .returning();

    if (!updated) {
      // 0 rows → a concurrent delivery already stamped this event. Re-read and
      // confirm before short-circuiting.
      const recheck = await findSubscriptionByStripeIdV2__unscoped(
        tx as unknown as Database,
        stripeSubscriptionId,
      );
      if (
        recheck &&
        updates.stripeEventId &&
        recheck.lastStripeEventId === updates.stripeEventId
      ) {
        return { ...mapSubscriptionV2Row(recheck), webhookApplied: false };
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
        return { ...mapSubscriptionV2Row(recheck), webhookApplied: false };
      }
      throw new Error('Subscription webhook update did not return a row');
    }
    await reconcileQuotaStateForSubscriptionV2(
      tx as unknown as Database,
      updated.id,
    );
    return { ...mapSubscriptionV2Row(updated), webhookApplied: true };
  });
}

// ---------------------------------------------------------------------------
// linkStripeCustomer (v2)
// ---------------------------------------------------------------------------

export async function linkStripeCustomerV2(
  db: Database,
  organizationId: string,
  stripeCustomerId: string,
): Promise<SubscriptionRow | null> {
  const existing = await findSubscriptionByOrganizationId__unscoped(
    db,
    organizationId,
  );
  if (!existing) {
    return null;
  }

  const [updated] = await db
    .update(subscriptionTable)
    .set({
      stripeCustomerId,
      updatedAt: new Date(),
    })
    .where(eq(subscriptionTable.id, existing.id))
    .returning();

  if (!updated)
    throw new Error('Stripe customer link update did not return a row');
  return mapSubscriptionV2Row(updated);
}

// ---------------------------------------------------------------------------
// getOrCreateStripeCustomerV2
// ---------------------------------------------------------------------------

/**
 * [BUG-827] v2 twin of getOrCreateStripeCustomer. Same TOCTOU fix (row lock +
 * re-check + idempotency-keyed create), against the organization-keyed
 * `subscription` table. See the legacy doc comment in subscription-core.ts for
 * the full rationale. Reachable only under IDENTITY_V2_ENABLED.
 */
export async function getOrCreateStripeCustomerV2(
  db: Database,
  organizationId: string,
  stripe: StripeCustomerCreator,
  params: { email: string },
): Promise<string> {
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;
    // safe-caller: billing route — organizationId === account.id resolved from
    // the authenticated owner account under the cutover flag.
    const locked = await lockSubscriptionByOrganizationId__unscoped(
      txDb,
      organizationId,
    );
    if (!locked) {
      throw new Error(
        'getOrCreateStripeCustomerV2: no subscription row for organization',
      );
    }

    if (locked.stripeCustomerId) {
      return locked.stripeCustomerId;
    }

    const idempotencyKey = buildStripeCustomerCreateKey(organizationId);
    const customer = await stripe.customers.create(
      {
        email: params.email,
        metadata: { accountId: organizationId },
      },
      { idempotencyKey },
    );

    const [updated] = await tx
      .update(subscriptionTable)
      .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
      .where(eq(subscriptionTable.id, locked.id))
      .returning();

    if (!updated) {
      throw new Error('Stripe customer link update did not return a row');
    }
    return customer.id;
  });
}

// ---------------------------------------------------------------------------
// getQuotaPool / resetMonthlyQuota / updateQuotaPoolLimit (satellite — reused
// pattern; quota_pools keyed on subscriptionId, store-agnostic)
// ---------------------------------------------------------------------------

export async function getQuotaPoolV2(
  db: Database,
  subscriptionId: string,
): Promise<QuotaPoolRow | null> {
  // safe-caller: internal billing aggregate — subscriptionId from a verified row.
  const row = await findQuotaPool__unscoped(db, subscriptionId);
  return row ? mapQuotaPoolRow(row) : null;
}

export async function resetMonthlyQuotaV2(
  db: Database,
  subscriptionId: string,
  newLimit: number,
): Promise<QuotaPoolRow | null> {
  // safe-caller: billing cycle reset (cron/webhook) — subscriptionId from event.
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

const FREE_TIER_LIMIT = getTierConfig('free').monthlyQuota;

/**
 * Repairs a structurally-resolved v2 organization that somehow lacks the
 * subscription normally created by the owner-bootstrap graph transaction.
 * This mirrors the legacy account missing-trial repair: the recovery target is
 * the launch plus trial, not the defensive free-tier metering fallback.
 */
export async function ensureInitialTrialSubscriptionV2(
  db: Database,
  organizationId: string,
  timezone?: string | null,
): Promise<SubscriptionRow> {
  const existing = await getSubscriptionByAccountIdV2(db, organizationId);
  if (existing) return existing;

  const payerPersonId = await resolvePayerPersonId(db, organizationId);
  if (!payerPersonId) {
    captureException(
      new Error(
        'ensureInitialTrialSubscriptionV2: organization has no owner person for payer anchor',
      ),
      {
        extra: {
          context: 'billing.v2.ensure_initial_trial.no_payer',
          organizationId,
        },
      },
    );
    throw new Error(
      `ensureInitialTrialSubscriptionV2: no owner person for organization ${organizationId}`,
    );
  }

  const tierConfig = getTierConfig('plus');
  const provisioned = await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;

    const [orgRow] = await tx
      .select({ id: organization.id, timezone: organization.timezone })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .for('update');
    if (!orgRow) {
      throw new Error(
        `ensureInitialTrialSubscriptionV2: organization ${organizationId} not found`,
      );
    }

    const already = await findSubscriptionByOrganizationId__unscoped(
      txDb,
      organizationId,
    );
    if (already) return already;

    const now = new Date();
    const cycleResetAt = new Date(now);
    cycleResetAt.setMonth(cycleResetAt.getMonth() + 1);
    const trialEndsAt = computeTrialEndDate(
      now,
      timezone ?? orgRow.timezone ?? null,
    );

    const [row] = await tx
      .insert(subscriptionTable)
      .values({
        organizationId,
        planTier: 'plus',
        status: 'trial',
        payerPersonId,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        trialEndsAt,
      })
      .returning();
    if (!row) {
      throw new Error('Initial trial subscription insert did not return a row');
    }

    await ensureLegacySubscriptionParent(txDb, {
      subscriptionId: row.id,
      organizationId,
      tier: 'plus',
      status: 'trial',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      trialEndsAt,
    });
    await tx
      .insert(quotaPools)
      .values({
        subscriptionId: row.id,
        monthlyLimit: tierConfig.monthlyQuota,
        usedThisMonth: 0,
        dailyLimit: tierConfig.dailyLimit,
        usedToday: 0,
        cycleResetAt,
      })
      .onConflictDoNothing({ target: quotaPools.subscriptionId });
    await reconcileQuotaStateForSubscriptionV2(txDb, row.id, now);
    return row;
  });

  return mapSubscriptionV2Row(provisioned);
}

/**
 * v2 of ensureFreeSubscription. Auto-provisions a free-tier subscription +
 * quota pool for an organization if none exists.
 *
 * Cutover note: under the flag, the subscription is created in the CUT-B1
 * onboarding bootstrap (`createIdentityGraph`) inside the graph transaction
 * fenced by `login.clerk_user_id UNIQUE`, so every org has exactly one
 * subscription before any webhook or metering call can arrive — this fallback
 * is a defensive path that almost never fires. Unlike the legacy
 * `subscriptions.account_id UNIQUE`, the new `subscription.organization_id` is a
 * plain index (the 1:1 invariant is owned by the bootstrap, not a DB unique), so
 * there is no ON-CONFLICT fence for a concurrent double-insert of the free row.
 * We use a row-locked check-then-insert against the `organization` row to
 * serialize concurrent fallback callers: the lock makes the read-insert atomic
 * so a second caller blocks until the first commits, then sees the row.
 *
 * [BUG-116] The webhook double-write race is fenced separately by the
 * `subscription_org_{stripe,revenuecat}_event_id_idx` unique indexes — that
 * protection is independent of this provisioning path and is unaffected.
 */
export async function ensureFreeSubscriptionV2(
  db: Database,
  organizationId: string,
): Promise<SubscriptionRow> {
  const existing = await getSubscriptionByAccountIdV2(db, organizationId);
  if (existing) return existing;

  const payerPersonId = await resolvePayerPersonId(db, organizationId);
  if (!payerPersonId) {
    captureException(
      new Error(
        'ensureFreeSubscriptionV2: organization has no owner person for payer anchor',
      ),
      {
        extra: {
          context: 'billing.v2.ensure_free_subscription.no_payer',
          organizationId,
        },
      },
    );
    throw new Error(
      `ensureFreeSubscriptionV2: no owner person for organization ${organizationId}`,
    );
  }

  const now = new Date();
  const cycleResetAt = new Date(now);
  cycleResetAt.setMonth(cycleResetAt.getMonth() + 1);
  const tierConfig = getTierConfig('free');

  const provisioned = await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;

    // Serialize concurrent fallback provisioners on the organization row: the
    // FOR UPDATE lock makes the absence-check + insert atomic, so a second
    // concurrent caller blocks here until the first commits and then sees the
    // row on the in-transaction re-read below.
    await tx
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .for('update');

    const already = await findSubscriptionByOrganizationId__unscoped(
      txDb,
      organizationId,
    );
    if (already) return already;

    const [row] = await tx
      .insert(subscriptionTable)
      .values({
        organizationId,
        planTier: 'free',
        status: 'active',
        payerPersonId,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        trialEndsAt: null,
      })
      .returning();

    if (!row) throw new Error('Free subscription insert did not return a row');

    await ensureLegacySubscriptionParent(txDb, {
      subscriptionId: row.id,
      organizationId,
      tier: 'free',
      status: 'active',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      trialEndsAt: null,
    });

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
    await reconcileQuotaStateForSubscriptionV2(txDb, row.id, now);
    return row;
  });

  return mapSubscriptionV2Row(provisioned);
}

// ---------------------------------------------------------------------------
// markSubscriptionCancelled (v2)
// ---------------------------------------------------------------------------

export async function markSubscriptionCancelledV2(
  db: Database,
  subscriptionId: string,
): Promise<void> {
  await db
    .update(subscriptionTable)
    .set({
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(subscriptionTable.id, subscriptionId));
}

// ---------------------------------------------------------------------------
// updateQuotaPoolLimit (v2 — satellite, store-agnostic)
// ---------------------------------------------------------------------------

export async function updateQuotaPoolLimitV2(
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
// activateSubscriptionFromCheckout (v2)
// ---------------------------------------------------------------------------

export async function activateSubscriptionFromCheckoutV2(
  db: Database,
  organizationId: string,
  stripeSubscriptionId: string,
  tier: 'plus' | 'family' | 'pro',
  eventTimestamp: string,
): Promise<SubscriptionRow | null> {
  // [BUG-120] Validate input — webhook metadata is externally controlled.
  const parsed = activateCheckoutInputSchema.safeParse({
    accountId: organizationId,
    stripeSubscriptionId,
    tier,
    eventTimestamp,
  });
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    logger.error(
      '[billing.v2] activateSubscriptionFromCheckout invalid input',
      {
        event: 'billing.v2.activate_checkout.invalid_input',
        issues: flat,
      },
    );
    captureException(
      new Error('activateSubscriptionFromCheckoutV2: invalid input'),
      {
        extra: {
          context: 'billing.v2.activate_checkout.invalid_input',
          issues: flat,
        },
      },
    );
    throw new Error(
      `activateSubscriptionFromCheckoutV2: invalid input — ${JSON.stringify(flat)}`,
    );
  }

  const existing = await getSubscriptionByAccountIdV2(db, organizationId);

  if (!existing) {
    const tierConfig = getTierConfig(tier);
    return createSubscriptionV2(
      db,
      organizationId,
      tier,
      tierConfig.monthlyQuota,
      {
        stripeSubscriptionId,
        status: 'active',
      },
    );
  }

  // [BUG-111] Divergent-sub handling — Stripe is source of truth; eventTimestamp
  // determines which sub is newer. Escalate via logger.warn + captureException +
  // safeSend Inngest (billing silent-recovery ban) at every resolution branch.
  if (existing.stripeSubscriptionId) {
    if (existing.stripeSubscriptionId !== stripeSubscriptionId) {
      if (existing.lastStripeEventTimestamp === null) {
        logger.warn(
          '[billing.v2] checkout activation rejected — cannot determine event order (NULL lastStripeEventTimestamp)',
          {
            event: 'billing.v2.activate_checkout.divergent_sub',
            resolution: 'rejected_indeterminate_order',
            organizationId,
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
            'activateSubscriptionFromCheckoutV2: divergent Stripe sub — rejected (indeterminate order, null lastStripeEventTimestamp)',
          ),
          {
            extra: {
              context: 'billing.v2.activate_checkout.divergent_sub',
              resolution: 'rejected_indeterminate_order',
              organizationId,
              existingStripeSubscriptionId: existing.stripeSubscriptionId,
              incomingStripeSubscriptionId: stripeSubscriptionId,
            },
          },
        );
        await safeSend(
          () =>
            inngest.send({
              // orphan-allow: structured telemetry required by AGENTS.md (silent
              // recovery in billing must emit a structured signal). Resolved
              // in-line; dashboard-queryable divergence signal, no handler.
              name: 'app/billing.activate_checkout.divergent_sub',
              data: {
                resolution: 'rejected_indeterminate_order',
                accountId: organizationId,
                existingStripeSubscriptionId: existing.stripeSubscriptionId,
                incomingStripeSubscriptionId: stripeSubscriptionId,
                existingTier: existing.tier,
                incomingTier: tier,
                existingEventTimestamp: existing.lastStripeEventTimestamp,
                incomingEventTimestamp: eventTimestamp,
                timestamp: new Date().toISOString(),
              },
            }),
          'billing.v2.activate_checkout.divergent_sub',
          { organizationId },
        );
        return existing;
      }

      const incomingTs = new Date(eventTimestamp).getTime();
      const existingTs = new Date(existing.lastStripeEventTimestamp).getTime();
      const incomingIsNewer = incomingTs > existingTs;
      const resolution = incomingIsNewer
        ? 'updated_to_incoming'
        : 'kept_existing_dropped_incoming';

      logger.warn(
        '[billing.v2] checkout activation with divergent Stripe sub',
        {
          event: 'billing.v2.activate_checkout.divergent_sub',
          resolution,
          organizationId,
          existingStripeSubscriptionId: existing.stripeSubscriptionId,
          incomingStripeSubscriptionId: stripeSubscriptionId,
          existingTier: existing.tier,
          incomingTier: tier,
        },
      );
      captureException(
        new Error(
          incomingIsNewer
            ? 'activateSubscriptionFromCheckoutV2: divergent Stripe sub — applied newer event over older row'
            : 'activateSubscriptionFromCheckoutV2: divergent Stripe sub — dropped older incoming event',
        ),
        {
          extra: {
            context: 'billing.v2.activate_checkout.divergent_sub',
            resolution,
            organizationId,
            existingStripeSubscriptionId: existing.stripeSubscriptionId,
            incomingStripeSubscriptionId: stripeSubscriptionId,
          },
        },
      );

      if (incomingIsNewer) {
        // [CR-2026-05-19-M3 / atomicity] Both writes in one transaction.
        const tierConfig = getTierConfig(tier);
        const updatedDivergent = await db.transaction(async (tx) => {
          const [row] = await tx
            .update(subscriptionTable)
            .set({
              stripeSubscriptionId,
              planTier: tier,
              status: 'active',
              lastStripeEventTimestamp: new Date(eventTimestamp),
              updatedAt: new Date(),
            })
            .where(eq(subscriptionTable.id, existing.id))
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

          await reconcileQuotaStateForSubscriptionV2(
            tx as unknown as Database,
            existing.id,
          );
          return row;
        });
        await safeSend(
          () =>
            inngest.send({
              // orphan-allow: structured telemetry required by AGENTS.md.
              name: 'app/billing.activate_checkout.divergent_sub',
              data: {
                resolution,
                accountId: organizationId,
                existingStripeSubscriptionId: existing.stripeSubscriptionId,
                incomingStripeSubscriptionId: stripeSubscriptionId,
                existingTier: existing.tier,
                incomingTier: tier,
                existingEventTimestamp: existing.lastStripeEventTimestamp,
                incomingEventTimestamp: eventTimestamp,
                timestamp: new Date().toISOString(),
              },
            }),
          'billing.v2.activate_checkout.divergent_sub',
          { organizationId },
        );
        return mapSubscriptionV2Row(updatedDivergent);
      }
      // Incoming is older — stale replay. Keep existing, no-op.
      await safeSend(
        () =>
          inngest.send({
            // orphan-allow: structured telemetry required by AGENTS.md.
            name: 'app/billing.activate_checkout.divergent_sub',
            data: {
              resolution,
              accountId: organizationId,
              existingStripeSubscriptionId: existing.stripeSubscriptionId,
              incomingStripeSubscriptionId: stripeSubscriptionId,
              existingTier: existing.tier,
              incomingTier: tier,
              existingEventTimestamp: existing.lastStripeEventTimestamp,
              incomingEventTimestamp: eventTimestamp,
              timestamp: new Date().toISOString(),
            },
          }),
        'billing.v2.activate_checkout.divergent_sub',
        { organizationId },
      );
      return existing;
    }
    // Same Stripe sub ID → genuine idempotent retry, OK to no-op silently.
    return existing;
  }

  // Bridge: set stripeSubscriptionId, tier, status, timestamp.
  // [CR-2026-05-19-M3 / atomicity] Both writes atomic.
  const tierConfig = getTierConfig(tier);
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(subscriptionTable)
      .set({
        stripeSubscriptionId,
        planTier: tier,
        status: 'active',
        lastStripeEventTimestamp: new Date(eventTimestamp),
        updatedAt: new Date(),
      })
      .where(eq(subscriptionTable.id, existing.id))
      .returning();

    if (!row)
      throw new Error('Subscription activation update did not return a row');

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

    await reconcileQuotaStateForSubscriptionV2(
      tx as unknown as Database,
      existing.id,
    );
    return row;
  });

  return mapSubscriptionV2Row(updated);
}

// ---------------------------------------------------------------------------
// getSubscriptionByStripeCustomerIdV2
// ---------------------------------------------------------------------------

/**
 * Reads the v2 subscription bound to a given Stripe customer ID.
 * Returns null if no subscription is bound to that customer.
 *
 * SECURITY: the Stripe customer ID arrives in a webhook payload authenticated
 * by Stripe event signature. The result is used by the v2 checkout-completed
 * handler to verify that the (operator-mutable) metadata.accountId matches the
 * account already bound to this customer before granting an entitlement — do
 * NOT expose this to user-facing routes (it is unscoped by design).
 */
export async function getSubscriptionByStripeCustomerIdV2(
  db: Database,
  stripeCustomerId: string,
): Promise<SubscriptionRow | null> {
  const row = await findSubscriptionByStripeCustomerIdV2__unscoped(
    db,
    stripeCustomerId,
  );
  return row ? mapSubscriptionV2Row(row) : null;
}
