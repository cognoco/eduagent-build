// ---------------------------------------------------------------------------
// CUT-B3 (WI-693) — billing-v2 RevenueCat core
//
// v2 twin of revenuecat.ts. Reads/writes the new `subscription` table
// (organization-keyed). The request-context accountId already equals
// organization.id under the flag.
//
// STORAGE-LAYER RACE FENCE (BUG-116): the RevenueCat event idempotency is fenced
// by the partial unique index `subscription_org_revenuecat_event_id_idx` on
// (organization_id, last_revenuecat_event_id) — migration 0114 — replacing the
// legacy `(account_id, last_revenuecat_event_id)` fence. organization.id =
// accounts.id by the reseed, so the fence is semantically identical. BD-01
// timestamp-ordering idempotency is preserved on the §1.4 columns. The break
// test re-runs the concurrent INITIAL_PURCHASE scenario against this handler
// (red-green-revert) to prove the fence holds.
//
// Billing silent-recovery ban: transition rejections escalate via
// logger.error + captureException.
//
// [WI-868] The identity-v2 flag is gone; this module and legacy revenuecat.ts
// both run unconditionally in parallel (convergence tracked in WI-1239).
// ---------------------------------------------------------------------------

import { eq, and, isNull, ne, or, sql } from 'drizzle-orm';
import {
  subscription as subscriptionTable,
  quotaPools,
  type Database,
  findSubscriptionByOrganizationId__unscoped,
  lockSubscriptionByOrganizationId__unscoped,
} from '@eduagent/database';
import type { SubscriptionTier } from '@eduagent/schemas';
import { getTierConfig, isValidTransition } from '../../subscription';
import { captureException } from '../../sentry';
import { createLogger } from '../../logger';
import { findOwnerPersonId } from '../../identity-v2/helpers';
import { type AppliedSubscriptionRow, type SubscriptionRow } from '../types';
import type {
  RevenuecatWebhookUpdate,
  RevenuecatQuotaUpdate,
} from '../revenuecat-shared';
import { emitTopUpCreditsReattributedMetric } from '../top-up';
import { reattributeTopUpCreditsOnModelChangeV2 } from './tier-v2';
import {
  mapSubscriptionV2Row,
  parseSubscriptionV2PlanTier,
  parseSubscriptionV2Status,
} from './types-v2';
import { reconcileQuotaStateForSubscriptionV2 } from './quota-reconcile-v2';
import { getSubscriptionByAccountIdV2 } from './subscription-core-v2';

const logger = createLogger();

// ---------------------------------------------------------------------------
// isRevenuecatEventProcessed (v2)
// ---------------------------------------------------------------------------

/**
 * v2: BD-01 timestamp-based ordering idempotency, reading the new `subscription`
 * table by organization id. Same semantics as the legacy function.
 */
export async function isRevenuecatEventProcessedV2(
  db: Database,
  organizationId: string,
  eventId: string,
  eventTimestampMs?: number,
): Promise<boolean> {
  const sub = await findSubscriptionByOrganizationId__unscoped(
    db,
    organizationId,
  );
  if (!sub) return false;

  if (sub.lastRevenuecatEventId === eventId) return true;

  if (eventTimestampMs != null && sub.lastRevenuecatEventTimestampMs != null) {
    const lastTs = Number(sub.lastRevenuecatEventTimestampMs);
    if (!Number.isNaN(lastTs) && eventTimestampMs < lastTs) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// updateSubscriptionFromRevenuecatWebhook (v2)
// ---------------------------------------------------------------------------

export async function updateSubscriptionFromRevenuecatWebhookV2(
  db: Database,
  organizationId: string,
  updates: RevenuecatWebhookUpdate & {
    eventId: string;
    eventTimestampMs?: number;
  },
): Promise<AppliedSubscriptionRow | null> {
  return db.transaction(async (tx) => {
    const updated = await applySubscriptionUpdateFromRevenuecatV2(
      tx as unknown as Database,
      organizationId,
      updates,
    );
    if (updated && updated.webhookApplied !== false) {
      await reconcileQuotaStateForSubscriptionV2(
        tx as unknown as Database,
        updated.id,
      );
    }
    return updated;
  });
}

export async function updateSubscriptionAndQuotaFromRevenuecatWebhookV2(
  db: Database,
  organizationId: string,
  updates: RevenuecatWebhookUpdate & {
    eventId: string;
    eventTimestampMs?: number;
  },
  _quota: RevenuecatQuotaUpdate,
): Promise<AppliedSubscriptionRow | null> {
  let reattributedCount = 0;
  let previousTier: SubscriptionTier | undefined;
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;

    // [F-124] Lock-and-read the previous tier INSIDE the transaction so the
    // tier-change detection and credit re-attribution are serialized against
    // concurrent webhooks for the same org.
    // safe-caller: RevenueCat webhook handler — orgId already validated by caller.
    const existing = await lockSubscriptionByOrganizationId__unscoped(
      txDb,
      organizationId,
    );
    previousTier = existing
      ? parseSubscriptionV2PlanTier(existing.planTier)
      : undefined;

    const updated = await applySubscriptionUpdateFromRevenuecatV2(
      txDb,
      organizationId,
      updates,
    );

    if (updated && updated.webhookApplied !== false) {
      await reconcileQuotaStateForSubscriptionV2(txDb, updated.id);

      if (previousTier && updates.tier && previousTier !== updates.tier) {
        reattributedCount = await reattributeTopUpCreditsOnModelChangeV2(
          txDb,
          updated.id,
          organizationId,
          previousTier,
          updates.tier,
        );
      }
    }

    return updated;
  });

  if (reattributedCount > 0 && previousTier && updates.tier && result) {
    await emitTopUpCreditsReattributedMetric({
      subscriptionId: result.id,
      accountId: organizationId,
      previousTier,
      newTier: updates.tier,
      reattributedCount,
      occurredAt: now,
    });
  }

  return result;
}

async function applySubscriptionUpdateFromRevenuecatV2(
  db: Database,
  organizationId: string,
  updates: RevenuecatWebhookUpdate & {
    eventId: string;
    eventTimestampMs?: number;
  },
): Promise<AppliedSubscriptionRow | null> {
  const existing = await findSubscriptionByOrganizationId__unscoped(
    db,
    organizationId,
  );

  if (!existing) return null;

  // [CR-2026-05-19-M11] Idempotency check INSIDE the transaction.
  if (existing.lastRevenuecatEventId === updates.eventId) {
    return { ...mapSubscriptionV2Row(existing), webhookApplied: false };
  }
  if (
    updates.eventTimestampMs != null &&
    existing.lastRevenuecatEventTimestampMs != null
  ) {
    const lastTs = Number(existing.lastRevenuecatEventTimestampMs);
    if (!Number.isNaN(lastTs) && updates.eventTimestampMs < lastTs) {
      return { ...mapSubscriptionV2Row(existing), webhookApplied: false };
    }
  }

  const setValues: Partial<typeof subscriptionTable.$inferInsert> = {
    lastRevenuecatEventId: updates.eventId,
    updatedAt: new Date(),
  };

  if (updates.eventTimestampMs != null) {
    setValues.lastRevenuecatEventTimestampMs = String(updates.eventTimestampMs);
  }

  if (updates.tier !== undefined) {
    setValues.planTier = updates.tier;
  }
  if (updates.status !== undefined && updates.status !== existing.status) {
    const existingStatus = parseSubscriptionV2Status(existing.status);
    if (!isValidTransition(existingStatus, updates.status)) {
      // [BUG-447] Throw so callers do NOT proceed to updateQuotaPoolLimit.
      const transitionErr = new Error(
        `Invalid subscription transition: ${existing.status} -> ${updates.status}`,
      );
      logger.error('Invalid subscription transition — aborting update', {
        from: existing.status,
        to: updates.status,
        subscriptionId: existing.id,
        tag: 'billing.invalid_transition',
      });
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
    setValues.periodEndAt = updates.currentPeriodEnd
      ? new Date(updates.currentPeriodEnd)
      : null;
  }
  if (updates.cancelledAt !== undefined) {
    setValues.cancelledAt = updates.cancelledAt
      ? new Date(updates.cancelledAt)
      : null;
  }
  if (updates.trialEndsAt !== undefined) {
    setValues.trialEndsAt = updates.trialEndsAt
      ? new Date(updates.trialEndsAt)
      : null;
  }

  // [CR-2026-05-19-M3] SQL-level status guard + concurrent-delivery event-ID
  // predicate. The storage-layer guarantee is the
  // `subscription_org_revenuecat_event_id_idx` partial unique index.
  const whereParts = [eq(subscriptionTable.id, existing.id)];
  if (updates.status !== undefined && updates.status !== existing.status) {
    whereParts.push(eq(subscriptionTable.status, existing.status));
  }
  const eventIdPredicate = or(
    isNull(subscriptionTable.lastRevenuecatEventId),
    ne(subscriptionTable.lastRevenuecatEventId, updates.eventId),
  );
  if (eventIdPredicate) whereParts.push(eventIdPredicate);
  if (updates.eventTimestampMs != null) {
    const eventTimestampPredicate = or(
      isNull(subscriptionTable.lastRevenuecatEventTimestampMs),
      sql`(${subscriptionTable.lastRevenuecatEventTimestampMs})::bigint <= ${updates.eventTimestampMs}`,
    );
    if (eventTimestampPredicate) whereParts.push(eventTimestampPredicate);
  }

  const [updated] = await db
    .update(subscriptionTable)
    .set(setValues)
    .where(and(...whereParts))
    .returning();

  if (!updated) {
    // 0 rows → a concurrent delivery already stamped this eventId. Re-read.
    const recheck = await findSubscriptionByOrganizationId__unscoped(
      db,
      organizationId,
    );
    if (recheck && recheck.lastRevenuecatEventId === updates.eventId) {
      return { ...mapSubscriptionV2Row(recheck), webhookApplied: false };
    }
    if (
      recheck &&
      updates.eventTimestampMs != null &&
      recheck.lastRevenuecatEventTimestampMs != null
    ) {
      const lastTs = Number(recheck.lastRevenuecatEventTimestampMs);
      if (!Number.isNaN(lastTs) && updates.eventTimestampMs < lastTs) {
        return { ...mapSubscriptionV2Row(recheck), webhookApplied: false };
      }
    }
    throw new Error(
      'Subscription update did not return a row — concurrent status mutation detected or row missing',
    );
  }
  return { ...mapSubscriptionV2Row(updated), webhookApplied: true };
}

// ---------------------------------------------------------------------------
// activateSubscriptionFromRevenuecat (v2)
// ---------------------------------------------------------------------------

export async function activateSubscriptionFromRevenuecatV2(
  db: Database,
  organizationId: string,
  tier: 'plus' | 'family' | 'pro',
  eventId: string,
  options?: {
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    revenuecatOriginalAppUserId?: string;
    isTrial?: boolean;
    trialEndsAt?: string;
    eventTimestampMs?: number;
    /** v2: the payer person id for a fresh insert (org owner). */
    payerPersonId?: string;
  },
): Promise<SubscriptionRow> {
  const existing = await getSubscriptionByAccountIdV2(db, organizationId);

  const tierConfig = getTierConfig(tier);
  const isTrial = options?.isTrial ?? false;
  const trialEndsAt = options?.trialEndsAt;

  // BD-03: enforce trialEndsAt when isTrial is true.
  if (isTrial && !trialEndsAt) {
    logger.error('trialEndsAt is required when isTrial is true', {
      organizationId,
    });
    captureException(
      new Error(
        'Trial activation missing trialEndsAt — falling back to non-trial',
      ),
      { extra: { organizationId, tier, eventId } },
    );
    return activateSubscriptionFromRevenuecatV2(
      db,
      organizationId,
      tier,
      eventId,
      { ...options, isTrial: false },
    );
  }

  const status = isTrial ? 'trial' : 'active';

  if (!existing) {
    // A fresh insert requires the payer person id. Under the cutover the org's
    // subscription is created at onboarding, so this insert path is defensive;
    // resolve the payer from the option or fall back to the org owner.
    const payerPersonId =
      options?.payerPersonId ?? (await findOwnerPersonId(db, organizationId));
    if (!payerPersonId) {
      captureException(
        new Error(
          'activateSubscriptionFromRevenuecatV2: no owner person for payer anchor',
        ),
        {
          extra: {
            context: 'billing.v2.revenuecat.activate.no_payer',
            organizationId,
            eventId,
          },
        },
      );
      throw new Error(
        `activateSubscriptionFromRevenuecatV2: no owner person for organization ${organizationId}`,
      );
    }

    const subRow = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(subscriptionTable)
        .values({
          organizationId,
          planTier: tier,
          status,
          payerPersonId,
          lastRevenuecatEventId: eventId,
          lastRevenuecatEventTimestampMs:
            options?.eventTimestampMs != null
              ? String(options.eventTimestampMs)
              : null,
          revenuecatOriginalAppUserId:
            options?.revenuecatOriginalAppUserId ?? null,
          periodStartAt: options?.currentPeriodStart
            ? new Date(options.currentPeriodStart)
            : null,
          periodEndAt: options?.currentPeriodEnd
            ? new Date(options.currentPeriodEnd)
            : null,
          trialEndsAt: options?.trialEndsAt
            ? new Date(options.trialEndsAt)
            : null,
        })
        .returning();

      if (!inserted)
        throw new Error('Subscription insert did not return a row');

      const now = new Date();
      const cycleResetAt = new Date(now);
      cycleResetAt.setMonth(cycleResetAt.getMonth() + 1);

      await tx.insert(quotaPools).values({
        subscriptionId: inserted.id,
        monthlyLimit: tierConfig.monthlyQuota,
        usedThisMonth: 0,
        dailyLimit: tierConfig.dailyLimit,
        usedToday: 0,
        cycleResetAt,
      });
      await reconcileQuotaStateForSubscriptionV2(
        tx as unknown as Database,
        inserted.id,
      );

      return inserted;
    });

    return mapSubscriptionV2Row(subRow);
  }

  if (existing.lastRevenuecatEventId === eventId) {
    return existing;
  }
  if (
    options?.eventTimestampMs != null &&
    existing.lastRevenuecatEventTimestampMs != null
  ) {
    const lastTs = Number(existing.lastRevenuecatEventTimestampMs);
    if (!Number.isNaN(lastTs) && options.eventTimestampMs < lastTs) {
      return existing;
    }
  }

  const setValues: Record<string, unknown> = {
    planTier: tier,
    status,
    lastRevenuecatEventId: eventId,
    updatedAt: new Date(),
  };

  if (options?.eventTimestampMs != null) {
    setValues.lastRevenuecatEventTimestampMs = String(options.eventTimestampMs);
  }

  if (options?.revenuecatOriginalAppUserId) {
    setValues.revenuecatOriginalAppUserId = options.revenuecatOriginalAppUserId;
  }
  if (options?.currentPeriodStart) {
    setValues.periodStartAt = new Date(options.currentPeriodStart);
  }
  if (options?.currentPeriodEnd) {
    setValues.periodEndAt = new Date(options.currentPeriodEnd);
  }
  // BD-02: explicitly clear trialEndsAt on non-trial re-activation.
  setValues.trialEndsAt = isTrial && trialEndsAt ? new Date(trialEndsAt) : null;

  // [CR-2026-05-19-M3 / atomicity] Both writes atomic.
  const updated = await db.transaction(async (tx) => {
    const whereParts = [eq(subscriptionTable.id, existing.id)];
    const eventIdPredicate = or(
      isNull(subscriptionTable.lastRevenuecatEventId),
      ne(subscriptionTable.lastRevenuecatEventId, eventId),
    );
    if (eventIdPredicate) whereParts.push(eventIdPredicate);
    if (options?.eventTimestampMs != null) {
      const eventTimestampPredicate = or(
        isNull(subscriptionTable.lastRevenuecatEventTimestampMs),
        sql`(${subscriptionTable.lastRevenuecatEventTimestampMs})::bigint <= ${options.eventTimestampMs}`,
      );
      if (eventTimestampPredicate) whereParts.push(eventTimestampPredicate);
    }

    const [row] = await tx
      .update(subscriptionTable)
      .set(setValues)
      .where(and(...whereParts))
      .returning();

    if (!row) {
      const latest = await tx.query.subscription.findFirst({
        where: eq(subscriptionTable.organizationId, organizationId),
      });
      if (latest) return latest;
      throw new Error('Subscription update (revenuecat) did not return a row');
    }

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
      throw new Error('Quota pool update (revenuecat) did not return a row');

    await reconcileQuotaStateForSubscriptionV2(
      tx as unknown as Database,
      existing.id,
    );
    return row;
  });

  return mapSubscriptionV2Row(updated);
}
