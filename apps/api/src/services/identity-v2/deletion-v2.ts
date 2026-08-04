// ---------------------------------------------------------------------------
// CUT-B2 deletion twin (cutover-plan §2.6 P6 + D2; data-model.md §3.2 / §6.1).
//
// THE RE-HOME MODEL (corrected per shepherd ruling, canon §6.1). Legacy
// deletion cascade-DESTROYED the consent record — the named live defect ("three
// delete paths that destroy the consent receipt"). The ratified model replaces
// all three with ONE structural pattern: the active row drops, the consent
// receipt MOVES to the retain-tier, the audit row is written. The
// `consent_grant.charge_person_id ON DELETE RESTRICT` is load-bearing — it
// makes "delete a person with live grants" fail by design until the grants are
// re-homed. We NEVER erase grants; we migrate them to `consent_receipt`.
//
// executeDeletionV2 sequence (§6.1; WI-849 adds 2a + G1):
//   1. pre-read login.email (memoized step input, as today's getAccountClerkUserId)
//   2. re-home each consent_grant for every person in the org → consent_receipt
//   2a. tear down guardianship + supportership edges incident to the org's persons
//       (WI-849 Gap 3 — both directions; cross-org edges drop the edge, not the
//        counterpart person). See MMT-ADR-0026.
//   G1. DELETE subscription WHERE organization_id = $org (WI-849 Gap 1). Satisfies
//       payer_person_id + organization_id RESTRICT before person/org drops.
//       subscription_payers cascade off the subscription row automatically.
//       Provider teardown targets are pre-read by the scheduled deletion
//       workflow before this transaction, then dispatched durably after this
//       DB erasure commits (WI-885).
//   3. delete the live consent_grant rows (RESTRICT now satisfied)
//   3b. write financial_record rows per person (tax/chargeback retain-tier)
//   4. write a deletion_audit row per person (deleted_by per path; reason)
//   5. DELETE person (cascade → consent_request + membership + learning data)
//   6. erase byok_waitlist WHERE email = login.email  (D2 GDPR Art-17 leg)
//
// Gap 1 (WI-849): subscription DB-row teardown is handled here — see Step G1
// below. WI-885 handles the provider teardown as a durable Inngest event from
// the scheduled deletion workflow, not as a provider call inside this DB tx.
//
// NOT BUILT (WI-849 Gap 2 — ruled MOOT 2026-06-20 (operator)): "v2 erasure leaves
// the legacy `accounts` row + its PII behind." On the reset environments where
// executeDeletionV2 actually runs (staging ep-fancy-cherry, prod — MMT-ADR-0012
// baseline reset), the legacy `accounts`/`profiles` tables DO NOT EXIST (verified
// against stg 2026-06-20), so there is no legacy PII to survive and a
// `DELETE FROM accounts` would throw `relation "accounts" does not exist`. No
// v2-live environment retains those tables; Gap 2 CLOSED not deferred.
//
// retention_period is counsel-owned (data-model.md §4.9: "counsel fills the
// value") — the column is nullable with no default, so we re-home with NULL and
// flag a counsel follow-up in the PR. We do NOT invent a legal retention
// duration.
//
// financial_record (tax / chargeback on deletion, §6.1) IS written here per
// WI-723: each deleted person gets retain-tier financial_record rows BEFORE the
// person drop, inside the same transaction/lock as the consent re-home and the
// audit write, so a row is never orphaned. §4.9 COUNSEL-OWNED: the record_type
// taxonomy (tax / chargeback), the per-person row cardinality (2), the payload
// shape, and retention_period (left NULL) are all PROVISIONAL pending counsel —
// flagged in the PR. The financial_record table carries NO FK to person /
// organization (it outlives both), so writing it before the drop is safe.
//
// person.id = profiles.id, organization.id = accounts.id (deterministic reseed).
// [WI-868] The identity-v2 flag is gone; these functions are called
// unconditionally now.
// ---------------------------------------------------------------------------

import { createHash } from 'crypto';
import {
  and,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import {
  byokWaitlist,
  consentGrant,
  consentRequest,
  deletionAudit,
  financialRecord,
  guardianship,
  login,
  membership,
  organization,
  pendingClerkErasure,
  person,
  subscription,
  supportership,
  type Database,
} from '@eduagent/database';
// Producer side of the store-teardown contract: the rows mapped by
// getSubscriptionStoreTeardownTargetsV2 ARE the per-subscription target type of
// the `app/billing.subscription_store_teardown_requested` event. Sharing the
// `@eduagent/schemas` type (rather than a local structural twin) makes
// TypeScript enforce the producer→consumer shape at compile time — a field
// drift in the Zod schema then fails the build here instead of surfacing as a
// runtime `invalid_payload` on a GDPR erasure path.
import type {
  AccountDeletionStatusResponse,
  SubscriptionStoreTeardownTarget,
} from '@eduagent/schemas';
import { CONSENT_PURPOSES } from '@eduagent/schemas';
import { ConflictError, NotFoundError } from '../../errors';
import { captureException } from '../sentry';
import { syncConsentReceipts } from './consent-receipt-v2';

const GRACE_PERIOD_DAYS = 7;
const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
const CLERK_ERASURE_RELEASE_GRACE_MS = 15 * 60 * 1000;
// Bounds recovery when a run dies between reserving a fence and marking the
// external Clerk erasure complete. Successful runs replace this with the
// shorter JWT-grace deadline below.
const CLERK_ERASURE_PENDING_TIMEOUT_MS = 24 * 60 * 60 * 1000;
export const CLERK_ERASURE_FENCE_CLEANUP_BATCH_SIZE = 500;

/**
 * Per-person serializing advisory-lock key (WI-583 pattern). A restore
 * (`restoreConsentV2` — appends a new grant) and a grace-end delete/archive
 * predicate (`deletePersonIfConsentWithdrawnV2`, `deleteArchivedPersonIfStillEligibleV2`)
 * both read the current grant then mutate. Under READ COMMITTED a restore can
 * commit between the delete's grant read and its re-home/delete, so the delete
 * re-homes the just-restored grant and removes the person despite a successful
 * restore. Acquiring `pg_advisory_xact_lock(consentPersonLockKey(personId))` at
 * the TOP of each side's transaction — and re-checking consent status under the
 * lock — serializes the two so restore-wins is observable and durable.
 *
 * MUST be identical across consent-v2.ts and deletion-v2.ts or the two take
 * different locks and never serialize. Exported so consent-v2 imports the same
 * key (one-way dep: deletion-v2 does not import consent-v2).
 */
export function consentPersonLockKey(personId: string): string {
  return `consent-person:${personId}`;
}

/** Why a deletion fired — drives `deletion_audit.deleted_by` / `reason` (§6.1). */
export type DeletionReason =
  | 'user_initiated'
  | 'guardian_initiated'
  | 'abandonment';

export function clerkErasureDigest(clerkUserId: string): string {
  return createHash('sha256').update(clerkUserId).digest('hex');
}

export interface PersonErasureSnapshotV2 {
  personExists: boolean;
  personId: string;
  organizationId: string | null;
  clerkUserIds: string[];
  loginEmails: string[];
  organizationPersonIds: string[];
  subscriptionStoreTeardownTargets: SubscriptionStoreTeardownTarget[];
}

export type PersonErasureAttemptResultV2 = {
  status:
    | 'deleted'
    | 'already_deleted'
    | 'admin_transfer_required'
    | 'not_eligible'
    | 'snapshot_changed';
  clerkUserIds: string[];
  organizationId: string | null;
  organizationDeleted: boolean;
  subscriptionStoreTeardownTargets: SubscriptionStoreTeardownTarget[];
};

export interface OrganizationErasureSnapshotV2 {
  organizationExists: boolean;
  organizationId: string;
  personIds: string[];
  clerkUserIds: string[];
  loginEmails: string[];
  subscriptionStoreTeardownTargets: SubscriptionStoreTeardownTarget[];
}

export async function getOrganizationErasureSnapshotV2(
  db: Database,
  organizationId: string,
): Promise<OrganizationErasureSnapshotV2> {
  const organizationRow = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
    columns: { id: true },
  });
  const memberships = organizationRow
    ? await db.query.membership.findMany({
        where: eq(membership.organizationId, organizationId),
        columns: { personId: true },
      })
    : [];
  const personIds = memberships.map((row) => row.personId).sort();
  const loginRows =
    personIds.length > 0
      ? await db
          .select({ clerkUserId: login.clerkUserId, email: login.email })
          .from(login)
          .where(inArray(login.personId, personIds))
      : [];

  return {
    organizationExists: !!organizationRow,
    organizationId,
    personIds,
    clerkUserIds: loginRows.map((row) => row.clerkUserId).sort(),
    loginEmails: loginRows.map((row) => row.email).sort(),
    subscriptionStoreTeardownTargets: organizationRow
      ? await getSubscriptionStoreTeardownTargetsV2(db, organizationId)
      : [],
  };
}

/**
 * Capture every external identity/provider target before a person-scoped
 * erasure. The durable workflow memoizes this snapshot; the delete transaction
 * locks and verifies the same rows before mutating anything. That combination
 * closes both failure windows: a changed binding aborts without deletion, while
 * a lost step receipt can replay using the still-memoized external identifiers.
 */
export async function getPersonErasureSnapshotV2(
  db: Database,
  personId: string,
): Promise<PersonErasureSnapshotV2> {
  const personRow = await db.query.person.findFirst({
    where: eq(person.id, personId),
    columns: { id: true },
  });
  const membershipRow = await db.query.membership.findFirst({
    where: eq(membership.personId, personId),
    columns: { organizationId: true },
  });
  const loginRows = await db.query.login.findMany({
    where: eq(login.personId, personId),
    columns: { clerkUserId: true, email: true },
  });
  const organizationId = membershipRow?.organizationId ?? null;
  const organizationMemberships = organizationId
    ? await db.query.membership.findMany({
        where: eq(membership.organizationId, organizationId),
        columns: { personId: true },
      })
    : [];
  return {
    personExists: !!personRow,
    personId,
    organizationId,
    clerkUserIds: loginRows.map(({ clerkUserId }) => clerkUserId).sort(),
    loginEmails: loginRows.map(({ email }) => email).sort(),
    organizationPersonIds: organizationMemberships
      .map(({ personId: memberPersonId }) => memberPersonId)
      .sort(),
    subscriptionStoreTeardownTargets: organizationId
      ? await getSubscriptionStoreTeardownTargetsV2(db, organizationId)
      : [],
  };
}

// ---------------------------------------------------------------------------
// Schedule / cancel / status — v2 of the legacy accounts-stamp surface, keyed on
// organization (organization.id = accounts.id). Logic identical; only the table
// changes.
// ---------------------------------------------------------------------------

export async function scheduleDeletionV2(
  db: Database,
  organizationId: string,
): Promise<{ gracePeriodEnds: string; scheduledNow: boolean }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const scheduledAt = await tryScheduleDeletionV2(db, organizationId);
    if (scheduledAt) {
      return {
        gracePeriodEnds: new Date(
          scheduledAt.getTime() + GRACE_PERIOD_MS,
        ).toISOString(),
        scheduledNow: true,
      };
    }

    let existing: AccountDeletionStatusResponse;
    try {
      existing = await getDeletionStatusV2(db, organizationId);
    } catch (e) {
      if (e instanceof NotFoundError) {
        return {
          gracePeriodEnds: new Date(Date.now() + GRACE_PERIOD_MS).toISOString(),
          scheduledNow: false,
        };
      }
      throw e;
    }
    if (existing.scheduled && existing.gracePeriodEnds) {
      return { gracePeriodEnds: existing.gracePeriodEnds, scheduledNow: false };
    }
  }

  const error = new ConflictError('Account deletion scheduling conflict');
  captureException(error, {
    extra: {
      surface: 'account.deletion',
      reason: 'schedule-retry-exhausted',
      organizationId,
    },
  });
  throw error;
}

async function tryScheduleDeletionV2(
  db: Database,
  organizationId: string,
): Promise<Date | null> {
  const [updated] = await db
    .update(organization)
    .set({
      deletionScheduledAt: sql`CASE
        WHEN ${organization.deletionCancelledAt} IS NULL
          THEN clock_timestamp()
        ELSE GREATEST(
          clock_timestamp(),
          ${organization.deletionCancelledAt} + interval '1 millisecond'
        )
      END`,
    })
    .where(
      and(
        eq(organization.id, organizationId),
        or(
          isNull(organization.deletionScheduledAt),
          sql`${organization.deletionCancelledAt} > ${organization.deletionScheduledAt}`,
        ),
      ),
    )
    .returning({ deletionScheduledAt: organization.deletionScheduledAt });
  return updated?.deletionScheduledAt ?? null;
}

export type CancelDeletionResult = 'cancelled' | 'no_active_deletion';

export async function cancelDeletionV2(
  db: Database,
  organizationId: string,
): Promise<CancelDeletionResult> {
  const rows = await db
    .update(organization)
    .set({
      deletionCancelledAt: sql`GREATEST(
        clock_timestamp(),
        ${organization.deletionScheduledAt} + interval '1 millisecond'
      )`,
    })
    .where(
      and(
        eq(organization.id, organizationId),
        isNotNull(organization.deletionScheduledAt),
        or(
          isNull(organization.deletionCancelledAt),
          lte(
            organization.deletionCancelledAt,
            organization.deletionScheduledAt,
          ),
        ),
      ),
    )
    .returning({ id: organization.id });
  return rows.length > 0 ? 'cancelled' : 'no_active_deletion';
}

export async function isDeletionCancelledV2(
  db: Database,
  organizationId: string,
): Promise<boolean> {
  const row = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
    columns: { deletionScheduledAt: true, deletionCancelledAt: true },
  });
  if (!row) return false;
  return !!(
    row.deletionCancelledAt &&
    row.deletionScheduledAt &&
    row.deletionCancelledAt > row.deletionScheduledAt
  );
}

export async function getDeletionStatusV2(
  db: Database,
  organizationId: string,
): Promise<AccountDeletionStatusResponse> {
  const row = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
    columns: { deletionScheduledAt: true, deletionCancelledAt: true },
  });
  if (!row) {
    throw new NotFoundError('Account');
  }
  const scheduledAt = row.deletionScheduledAt ?? null;
  const cancelledAt = row.deletionCancelledAt ?? null;
  const scheduled =
    scheduledAt !== null &&
    (cancelledAt === null || cancelledAt <= scheduledAt);

  if (!scheduled || scheduledAt === null) {
    return {
      scheduled: false,
      deletionScheduledAt: null,
      gracePeriodEnds: null,
    };
  }
  return {
    scheduled: true,
    deletionScheduledAt: scheduledAt.toISOString(),
    gracePeriodEnds: new Date(
      scheduledAt.getTime() + GRACE_PERIOD_MS,
    ).toISOString(),
  };
}

export async function organizationExistsV2(
  db: Database,
  organizationId: string,
): Promise<boolean> {
  const row = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
    columns: { id: true },
  });
  return !!row;
}

/**
 * v2 `getProfileIdsForAccount`: the person ids that belong to an organization
 * (via membership). The v2 deletion fan-out target.
 */
export async function getPersonIdsForOrganizationV2(
  db: Database,
  organizationId: string,
): Promise<string[]> {
  const rows = await db.query.membership.findMany({
    where: eq(membership.organizationId, organizationId),
    columns: { personId: true },
  });
  return rows.map((m) => m.personId);
}

/**
 * v2 `getAccountClerkUserId`: read the Clerk login id for an organization's
 * owner login so the scheduled-deletion job can erase the external identity
 * AFTER the DB cascade. Returns null when no login exists.
 */
export async function getOrganizationOwnerClerkUserIdV2(
  db: Database,
  organizationId: string,
): Promise<string | null> {
  const row = await ownerLogin(db, organizationId);
  return row?.clerkUserId ?? null;
}

/**
 * v2 pre-read of `login.email` for the org owner — the memoized input the
 * Art-17 `byok_waitlist` erase (step 6) needs after the person cascade removes
 * the login row. Captured in its own Inngest step so the value survives the
 * delete and a retry re-uses it. Returns null when no login exists.
 */
export async function getOrganizationOwnerEmailV2(
  db: Database,
  organizationId: string,
): Promise<string | null> {
  const row = await ownerLogin(db, organizationId);
  return row?.email ?? null;
}

// ---------------------------------------------------------------------------
// executeDeletionV2 — the re-home delete (§6.1)
// ---------------------------------------------------------------------------

export type DeletionResult =
  | 'deleted'
  | 'cancelled'
  | 'already_deleted'
  | 'snapshot_changed';

export interface ExecuteDeletionV2Input {
  organizationId: string;
  /** Pre-read owner email (step 1) — the D2 byok_waitlist erase key. */
  ownerEmail: string | null;
  expectedSnapshot?: OrganizationErasureSnapshotV2;
  reason: DeletionReason;
  /**
   * The actor who initiated deletion → `deletion_audit.deleted_by`. Null for
   * system / abandonment (§6.1). Required to be the guardian for
   * 'guardian_initiated'.
   */
  deletedBy: string | null;
}

/**
 * v2 `executeDeletion` — the re-home delete. Atomically (per the TOCTOU guard
 * mirroring legacy) deletes an organization's identity graph IF the org still
 * has an active (non-cancelled) deletion schedule, re-homing each person's
 * consent grants to the retain-tier first and writing the audit trail.
 *
 * Returns 'deleted' on the happy path, 'cancelled' if the grace-period cancel
 * superseded the schedule, 'already_deleted' if the org row is gone.
 */
export async function executeDeletionV2(
  db: Database,
  input: ExecuteDeletionV2Input,
): Promise<DeletionResult> {
  const { organizationId, ownerEmail, expectedSnapshot, reason, deletedBy } =
    input;

  return db.transaction(async (tx) => {
    // Atomic TOCTOU guard: claim the org for deletion only if a non-cancelled
    // schedule still holds. Clearing the stamp inside the same tx as the
    // re-home/delete makes the whole operation a single atomic step (§6.1: "a
    // half-done delete is not a valid state").
    //
    // WI-723 P2 — this claim ALSO serializes two concurrent same-org runs (so
    // no per-person advisory lock is needed in this path): the UPDATE takes a
    // row-level write lock on the organization, so a second run's identical
    // UPDATE blocks on it. The winner ends by deleting the organization row
    // (below); the loser then re-evaluates its WHERE against the now-missing
    // row, matches 0 rows → claimed.length === 0 → returns 'already_deleted'
    // and writes no financial_record / deletion_audit. Duplicate retain records
    // are therefore impossible here without an extra lock.
    const claimed = await tx
      .update(organization)
      .set({ deletionScheduledAt: sql`${organization.deletionScheduledAt}` })
      .where(
        and(
          eq(organization.id, organizationId),
          isNotNull(organization.deletionScheduledAt),
          or(
            isNull(organization.deletionCancelledAt),
            lte(
              organization.deletionCancelledAt,
              organization.deletionScheduledAt,
            ),
          ),
        ),
      )
      .returning({ id: organization.id });

    if (claimed.length === 0) {
      const existingRow = await tx.query.organization.findFirst({
        where: eq(organization.id, organizationId),
        columns: { id: true },
      });
      if (!existingRow) {
        captureException(
          new Error(
            'executeDeletionV2: organization row missing before scheduled delete',
          ),
          {
            extra: {
              surface: 'account.deletion',
              reason: 'row-missing-on-execute',
              organizationId,
            },
          },
        );
        return 'already_deleted';
      }
      return 'cancelled';
    }

    // The persons in this org (the deletion fan-out).
    const memberships = await tx
      .select({ personId: membership.personId })
      .from(membership)
      .where(eq(membership.organizationId, organizationId))
      .for('update');
    const personIds = canonicalStringArray(
      memberships.map((row) => row.personId),
    );
    const loginRows =
      personIds.length > 0
        ? await tx
            .select({
              clerkUserId: login.clerkUserId,
              email: login.email,
            })
            .from(login)
            .where(inArray(login.personId, personIds))
            .for('update')
        : [];
    const clerkUserIds = canonicalStringArray(
      loginRows.map((row) => row.clerkUserId),
    );
    const loginEmails = canonicalStringArray(loginRows.map((row) => row.email));
    const lockedSubscriptions = await tx
      .select({
        id: subscription.id,
        planTier: subscription.planTier,
        status: subscription.status,
        stripeCustomerId: subscription.stripeCustomerId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        revenuecatOriginalAppUserId: subscription.revenuecatOriginalAppUserId,
        storeProductId: subscription.storeProductId,
        storePlatform: subscription.storePlatform,
      })
      .from(subscription)
      .where(eq(subscription.organizationId, organizationId))
      .for('update');
    const currentStoreTargets =
      toSubscriptionStoreTeardownTargets(lockedSubscriptions);

    if (
      expectedSnapshot &&
      (!expectedSnapshot.organizationExists ||
        expectedSnapshot.organizationId !== organizationId ||
        !sameStringArray(expectedSnapshot.personIds, personIds) ||
        !sameStringArray(expectedSnapshot.clerkUserIds, clerkUserIds) ||
        !sameStringArray(expectedSnapshot.loginEmails, loginEmails) ||
        !sameSubscriptionTargets(
          expectedSnapshot.subscriptionStoreTeardownTargets,
          currentStoreTargets,
        ))
    ) {
      return 'snapshot_changed';
    }

    await reservePendingClerkErasuresTx(tx, clerkUserIds);

    // Step 2a (WI-849 Gap 3) — tear down the guardianship + supportership edges
    // INCIDENT to the persons in this org, BEFORE any person drop. Both edges'
    // endpoint FKs are ON DELETE RESTRICT (identity.ts), so dropping a person
    // who sits on either end of an edge — active OR revoked — aborts the whole
    // transaction. A whole-org/whole-account erasure removes the org and all its
    // persons, so every relationship anchored on those persons ceases to exist;
    // the edge rows must go with them. (MMT-ADR-0026 + data-model.md §3.2/§6.1
    // originally scoped this teardown to the whole-org path, treating edges as
    // SURVIVING a single-person delete; WI-1985 extended the same incident-scoped
    // teardown to the person-scoped erasure paths — see tearDownPersonEdgesTx —
    // because those paths genuinely erase the person, so an incident edge cannot
    // survive there either. That ADR / data-model narrative claim is now stale;
    // the lockstep ADR amendment is a tracked follow-up.)
    //
    // CROSS-ORG EDGES: an edge may reference a person OUTSIDE this org (a guardian
    // in another org; a supporter who supports an in-org charge). We delete an
    // edge when EITHER endpoint is one of this org's persons (both directions),
    // and we NEVER touch the counterpart person — their person row and their own
    // org are untouched. Tearing down only the incident edge is correct: the
    // relationship to an erased person no longer exists, but the other human does.
    if (personIds.length > 0) {
      await tx
        .delete(guardianship)
        .where(
          or(
            inArray(guardianship.guardianPersonId, personIds),
            inArray(guardianship.chargePersonId, personIds),
          ),
        );
      await tx
        .delete(supportership)
        .where(
          or(
            inArray(supportership.supporterPersonId, personIds),
            inArray(supportership.supporteePersonId, personIds),
          ),
        );
    }

    // Step 3b prep — snapshot the org's subscriptions ONCE (read before any
    // person drop; subscriptions outlive persons — data-model.md §3.2) for the
    // per-person financial_record payload.
    const orgSubscriptions = lockedSubscriptions.map((row) => ({
      id: row.id,
      planTier: row.planTier,
      status: row.status,
      stripeCustomerId: row.stripeCustomerId,
      stripeSubscriptionId: row.stripeSubscriptionId,
    }));

    // Step G1 — tear down the org's subscription(s) BEFORE the person drops.
    // `subscription.{organization_id, payer_person_id}` are ON DELETE RESTRICT;
    // a subscribed account cannot drop either the person (payer FK) or the
    // organization (org FK) while any subscription row stands. DB-row teardown
    // is owned here (WI-849 Gap 1). `subscription_payers.subscription_id` is
    // ON DELETE CASCADE, so deleting the subscription row auto-removes its
    // payer rows. Stripe/RC provider teardown is owned by the scheduled
    // deletion workflow so external calls never run inside this DB transaction.
    if (orgSubscriptions.length > 0) {
      await tx
        .delete(subscription)
        .where(eq(subscription.organizationId, organizationId));
    }

    for (const personId of personIds) {
      // Step 2 — re-home every live grant to the retain-tier receipt. Field
      // copy (snapshot columns carried verbatim); retention_period is left NULL
      // (counsel-owned, §4.9 — flagged as a PR follow-up). The assurance token
      // is intentionally NOT copied — it drops at re-home time (§7).
      const grants = await tx.query.consentGrant.findMany({
        where: eq(consentGrant.chargePersonId, personId),
      });
      if (grants.length > 0) {
        // [WI-2929] Upsert, not insert. Every grant already carries a receipt
        // written at grant time; this is the FINAL refresh before the live rows
        // go, keyed on consent_grant_id so a re-homed person ends with exactly
        // one receipt per grant rather than two.
        await syncConsentReceipts(tx, grants);
        // Step 3 — remove the live grants now the receipt exists (RESTRICT
        // satisfied). Re-home + delete are in one tx: a receipt without a
        // delete, or a delete without a receipt, is never observable.
        await tx
          .delete(consentGrant)
          .where(eq(consentGrant.chargePersonId, personId));
      }

      // Step 3b — financial_record (tax/chargeback retain-tier, §6.1) BEFORE
      // the person drop, in the same tx. §4.9 COUNSEL-OWNED (provisional).
      await writeFinancialRecordsTx(
        tx,
        personId,
        organizationId,
        orgSubscriptions,
      );

      // Step 4 — the audit row (person_id, deleted_by per path, reason).
      await tx.insert(deletionAudit).values({
        personId,
        deletedBy,
        reason,
        retentionPeriod: null,
      });

      // Step 5 — drop the person (cascade → consent_request, membership,
      // login, learning data). RESTRICT is now satisfied: grants re-homed
      // (Step 2/3), guardianship/supportership torn down (Step 2a, WI-849
      // Gap 3), subscription deleted (Step G1, WI-849 Gap 1).
      await tx.delete(person).where(eq(person.id, personId));
    }

    // Drop the now-childless organization container.
    await tx.delete(organization).where(eq(organization.id, organizationId));

    // Step 6 — D2 GDPR Art-17: erase the byok_waitlist row matching the owner's
    // email. byok_waitlist is email-only with no FK to the identity graph, so
    // the cascade never reaches it. Idempotent: a no-op if the owner never
    // joined or joined with a different email.
    const waitlistEmails = canonicalStringArray([
      ...loginEmails,
      ...(ownerEmail ? [ownerEmail] : []),
    ]);
    if (waitlistEmails.length > 0) {
      await tx
        .delete(byokWaitlist)
        .where(inArray(byokWaitlist.email, waitlistEmails));
    }

    return 'deleted';
  });
}

// ---------------------------------------------------------------------------
// Person-scoped deletes (the consent-gated profile deletions) — v2 of
// deletion.ts deleteProfile* family. Re-keyed to person; the consent predicate
// reads the current consent_grant rather than the legacy consent_states status.
// ---------------------------------------------------------------------------

/**
 * v2 `deleteProfile`: hard-delete a person, re-homing its grants first (the
 * §6.1 pattern at the single-person granularity). Idempotent. Used by the deny
 * cascade and direct child-deletion paths that already authorized the action.
 */
export async function deletePersonV2(
  db: Database,
  personId: string,
  reason: DeletionReason,
  deletedBy: string | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    // WI-723 race guard: lock + post-lock existence re-check. This path has no
    // consent predicate (unconditional delete), so two concurrent same-person
    // calls would BOTH commit side-writes (financial_record + deletion_audit)
    // while only one delete removes the row — duplicate retain records with no
    // unique constraint to absorb them. The lock serializes the two; the loser
    // sees the committed delete and bails before writing anything.
    await acquirePersonLockTx(tx, personId);
    const prepared = await preparePersonErasureTx(tx, personId);
    if (!prepared.ready) {
      if (prepared.result.status === 'admin_transfer_required') {
        throw new ConflictError(
          'Cannot delete the last administrator while other organization members remain',
        );
      }
      return;
    }
    if (prepared.context.adminTransferRequired) {
      throw new ConflictError(
        'Cannot delete the last administrator while other organization members remain',
      );
    }
    await erasePreparedPersonTx(
      tx,
      personId,
      prepared.context,
      reason,
      deletedBy,
    );
  });
}

/**
 * v2 `deleteProfileIfConsentWithdrawn`: atomically delete a person ONLY when its
 * current GDPR grant is withdrawn (optionally matching a specific withdrawal
 * timestamp), re-homing first. The guardianship account-guard replaces the
 * legacy account_id parent-chain guard. Returns true when deleted.
 */
export async function deletePersonIfConsentWithdrawnV2(
  db: Database,
  personId: string,
  withdrawnAt?: Date | string,
): Promise<boolean> {
  const result = await attemptPersonIfConsentWithdrawnErasureV2(
    db,
    personId,
    undefined,
    withdrawnAt,
  );
  if (result.status === 'admin_transfer_required') {
    throw new ConflictError(
      'Cannot delete the last administrator while other organization members remain',
    );
  }
  return result.status === 'deleted';
}

export async function attemptPersonIfConsentWithdrawnErasureV2(
  db: Database,
  personId: string,
  expectedSnapshot: PersonErasureSnapshotV2 | undefined,
  withdrawnAt?: Date | string,
): Promise<PersonErasureAttemptResultV2> {
  const withdrawnAtDate =
    withdrawnAt instanceof Date
      ? withdrawnAt
      : withdrawnAt
        ? new Date(withdrawnAt)
        : undefined;
  if (withdrawnAtDate && Number.isNaN(withdrawnAtDate.getTime())) {
    return notEligiblePersonErasureResult();
  }

  return db.transaction(async (tx) => {
    // WI-583 race guard: serialize against a concurrent restoreConsentV2 (which
    // appends a granted row) by taking the per-person advisory lock FIRST. The
    // current-grant read below then happens AFTER any in-flight restore has
    // committed, so a restore that wins the lock is visible here and blocks the
    // delete (current.withdrawnAt is null on the new grant). Without the lock,
    // under READ COMMITTED a restore committing between this read and the
    // re-home/delete would let the delete remove a just-restored person.
    await acquirePersonLockTx(tx, personId);
    const prepared = await preparePersonErasureTx(
      tx,
      personId,
      expectedSnapshot,
    );
    if (!prepared.ready) return prepared.result;
    // Re-check current GDPR grant under the lock and verify it is withdrawn
    // (optionally at the given timestamp). currentGrant windowing:
    // max(granted_at), tiebreak id.
    const current = await currentGdprGrantSetTx(tx, personId);
    if (current.length === 0 || current.some((grant) => !grant.withdrawnAt)) {
      return notEligiblePersonErasureResult(prepared.context.organizationId);
    }
    if (
      withdrawnAtDate &&
      current.some(
        (grant) => grant.withdrawnAt?.getTime() !== withdrawnAtDate.getTime(),
      )
    ) {
      return notEligiblePersonErasureResult(prepared.context.organizationId);
    }
    if (prepared.context.adminTransferRequired) {
      return adminTransferRequiredPersonErasureResult(
        prepared.context.organizationId,
      );
    }
    // WI-723 P2: the lock above already serializes same-person runs, and the
    // winner's rehomeGrantsTx deletes the consent_grant so the loser's
    // current-grant read returns nothing → it bails on the `!current` guard.
    // That loser-guard is incidental (grant-gone ⇒ person-gone coupling), so we
    // preparePersonErasureTx already performed the explicit locked existence
    // re-check, so no duplicate retain records can be written if that coupling
    // changes.
    return erasePreparedPersonTx(
      tx,
      personId,
      prepared.context,
      'guardian_initiated',
      null,
    );
  });
}

/**
 * v2 `deleteProfileIfNoConsent`: atomically delete a person ONLY when it has no
 * current granted-and-un-withdrawn GDPR consent and no terminal (approved)
 * request — the consent-reminder day-30 GDPR auto-delete. Re-homes any grants
 * (e.g. a withdrawn one) before the delete. Returns true when deleted.
 *
 * `requestedAt` is the REQUEST-GENERATION guard, mirroring legacy
 * `deleteProfileIfNoConsent(requestedAt)`: this day-30 run belongs to the
 * consent cycle whose `consent_request.requested_at` equals `requestedAt`. A
 * STALE run must NOT delete a child who has since started a NEWER consent cycle
 * (a fresh `pending`/`requested` request with no grant yet). When `requestedAt`
 * is given we require that an OPEN (non-terminal) request of THAT generation
 * still exists — a newer cycle replaces the row's `requested_at`, so the
 * window match fails and the stale run is a no-op. Omitting `requestedAt`
 * preserves the unguarded behavior (delete on no-consent alone).
 */
export async function deletePersonIfNoConsentV2(
  db: Database,
  personId: string,
  requestedAt?: Date,
): Promise<boolean> {
  const result = await attemptPersonIfNoConsentErasureV2(
    db,
    personId,
    undefined,
    requestedAt,
  );
  if (result.status === 'admin_transfer_required') {
    throw new ConflictError(
      'Cannot delete the last administrator while other organization members remain',
    );
  }
  return result.status === 'deleted';
}

export async function attemptPersonIfNoConsentErasureV2(
  db: Database,
  personId: string,
  expectedSnapshot: PersonErasureSnapshotV2 | undefined,
  requestedAt?: Date,
): Promise<PersonErasureAttemptResultV2> {
  // [requestedAt, requestedAt+1ms) window pins exactly one generation (the
  // +1ms upper bound tolerates the ms-granularity of the requested_at column).
  // Mirrors legacy deleteProfileIfNoConsent's requestGenerationPredicate.
  const requestedAtUpperBound = requestedAt
    ? new Date(requestedAt.getTime() + 1)
    : undefined;

  return db.transaction(async (tx) => {
    // WI-723 race guard: take the per-person advisory lock FIRST, before the
    // predicate reads. This serializes two concurrent same-person day-30 runs;
    // the loser blocks until the winner commits, then the locked preparation
    // reads see the committed delete. Without the
    // lock, both runs pass the consent/open-request pre-checks, both commit
    // their side-writes (financial_record + deletion_audit), and only one
    // RETURNING delete wins — the loser leaves duplicate retain records (no
    // unique constraint, no person FK on financial_record), so the dupes
    // persist. Mirrors deletePersonIfConsentWithdrawnV2 / the archived sibling.
    await acquirePersonLockTx(tx, personId);
    const prepared = await preparePersonErasureTx(
      tx,
      personId,
      expectedSnapshot,
    );
    if (!prepared.ready) return prepared.result;

    const current = await currentGdprGrantSetTx(tx, personId);
    // Any active recorded purpose is valid historical consent and therefore
    // blocks destructive abandonment. A missing newer purpose remains
    // fail-closed for processing, but must not erase the earlier grant.
    if (current.some((grant) => !grant.withdrawnAt)) {
      return notEligiblePersonErasureResult(prepared.context.organizationId);
    }

    // Request-generation guard: if this is a generation-scoped run, only delete
    // when an OPEN request of that generation still exists. A newer consent
    // cycle (newer requested_at, or an approved/denied terminal status) makes
    // this match empty, so a stale day-30 run cannot delete a re-requested
    // child.
    if (requestedAt && requestedAtUpperBound) {
      const openRequestOfGeneration = await tx.query.consentRequest.findFirst({
        where: and(
          eq(consentRequest.chargePersonId, personId),
          eq(consentRequest.requestedBasis, 'gdpr_parental_consent'),
          gte(consentRequest.requestedAt, requestedAt),
          lt(consentRequest.requestedAt, requestedAtUpperBound),
          sql`${consentRequest.status} NOT IN ('approved','denied')`,
        ),
        columns: { id: true },
      });
      if (!openRequestOfGeneration) {
        return notEligiblePersonErasureResult(prepared.context.organizationId);
      }
    }
    if (prepared.context.adminTransferRequired) {
      return adminTransferRequiredPersonErasureResult(
        prepared.context.organizationId,
      );
    }

    // preparePersonErasureTx's locked existence check is the loser guard: a
    // concurrent winner leaves the second run with `already_deleted` before
    // any retain-tier write.
    return erasePreparedPersonTx(
      tx,
      personId,
      prepared.context,
      'abandonment',
      null,
    );
  });
}

/**
 * v2 `deleteArchivedProfileIfStillEligible`: atomically hard-delete an archived
 * person ONLY when archived past the retention cutoff AND no current
 * granted-and-un-withdrawn GDPR consent (a restore would have cleared
 * archived_at and re-granted). Re-homes before the delete. Returns true when
 * deleted.
 */
export async function deleteArchivedPersonIfStillEligibleV2(
  db: Database,
  personId: string,
  retentionCutoff: Date,
): Promise<boolean> {
  const result = await attemptArchivedPersonErasureV2(
    db,
    personId,
    undefined,
    retentionCutoff,
  );
  if (result.status === 'admin_transfer_required') {
    throw new ConflictError(
      'Cannot delete the last administrator while other organization members remain',
    );
  }
  return result.status === 'deleted';
}

export async function attemptArchivedPersonErasureV2(
  db: Database,
  personId: string,
  expectedSnapshot: PersonErasureSnapshotV2 | undefined,
  retentionCutoff: Date,
): Promise<PersonErasureAttemptResultV2> {
  return db.transaction(async (tx) => {
    // WI-583 race guard: restoreConsentV2 BOTH clears archived_at AND appends a
    // granted grant. Take the per-person advisory lock FIRST so the archived_at
    // and current-grant reads below see any in-flight restore's commit — a
    // restore that wins the lock un-archives the person (first predicate fails)
    // and re-grants (second predicate fails), and the delete is a no-op.
    await acquirePersonLockTx(tx, personId);
    const prepared = await preparePersonErasureTx(
      tx,
      personId,
      expectedSnapshot,
    );
    if (!prepared.ready) return prepared.result;
    // The personRow read below also IS the WI-723 P2 existence re-check: a
    // concurrent-delete winner leaves personRow undefined → the guard returns
    // false before any side-write, so no duplicate retain records.
    const personRow = await tx.query.person.findFirst({
      where: eq(person.id, personId),
      columns: { archivedAt: true },
    });
    if (
      !personRow?.archivedAt ||
      personRow.archivedAt.getTime() > retentionCutoff.getTime()
    ) {
      return notEligiblePersonErasureResult(prepared.context.organizationId);
    }
    const current = await currentGdprGrantSetTx(tx, personId);
    if (current.some((grant) => !grant.withdrawnAt)) {
      return notEligiblePersonErasureResult(prepared.context.organizationId);
    }
    if (prepared.context.adminTransferRequired) {
      return adminTransferRequiredPersonErasureResult(
        prepared.context.organizationId,
      );
    }
    return erasePreparedPersonTx(
      tx,
      personId,
      prepared.context,
      'abandonment',
      null,
    );
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** The owner login (clerk id + email) for an org — admin membership → login. */
async function ownerLogin(
  db: Database,
  organizationId: string,
): Promise<{ clerkUserId: string; email: string } | null> {
  const row = await db
    .select({ clerkUserId: login.clerkUserId, email: login.email })
    .from(membership)
    .innerJoin(person, eq(person.id, membership.personId))
    .innerJoin(login, eq(login.personId, person.id))
    .where(
      and(
        eq(membership.organizationId, organizationId),
        sql`${membership.roles} @> ARRAY['admin']::text[]`,
      ),
    )
    .limit(1);
  return row[0] ?? null;
}

/**
 * Re-home a single person's live consent grants to the retain-tier and delete
 * the live rows — the §6.1 pattern, inside an existing transaction. A no-op when
 * the person has no grants. retention_period left NULL (counsel-owned).
 */
async function rehomeGrantsTx(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  personId: string,
): Promise<void> {
  const grants = await tx.query.consentGrant.findMany({
    where: eq(consentGrant.chargePersonId, personId),
  });
  if (grants.length === 0) return;
  // [WI-2929] Upsert — the grant-time receipt already exists; this refreshes it
  // (keyed on consent_grant_id) instead of writing a duplicate.
  await syncConsentReceipts(tx, grants);
  await tx
    .delete(consentGrant)
    .where(eq(consentGrant.chargePersonId, personId));
}

type DeletionTx = Parameters<Parameters<Database['transaction']>[0]>[0];

function canonicalClerkUserIds(clerkUserIds: readonly string[]): string[] {
  return [...new Set(clerkUserIds)].sort();
}

function clerkErasureSetDigest(clerkUserIds: readonly string[]): string {
  const memberDigests =
    canonicalClerkUserIds(clerkUserIds).map(clerkErasureDigest);
  return createHash('sha256')
    .update(JSON.stringify(memberDigests))
    .digest('hex');
}

async function acquireClerkErasureLocksTx(
  tx: Pick<Database, 'execute'>,
  clerkUserIds: readonly string[],
): Promise<void> {
  const digests = canonicalClerkUserIds(clerkUserIds)
    .map(clerkErasureDigest)
    .sort();
  for (const digest of digests) {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`clerk-erasure:${digest}`}, 0))`,
    );
  }
}

async function reservePendingClerkErasuresTx(
  tx: DeletionTx,
  clerkUserIds: readonly string[],
): Promise<void> {
  const canonicalIds = canonicalClerkUserIds(clerkUserIds);
  if (canonicalIds.length === 0) return;

  await acquireClerkErasureLocksTx(tx as unknown as Database, canonicalIds);
  const erasureSetDigest = clerkErasureSetDigest(canonicalIds);
  await tx
    .insert(pendingClerkErasure)
    .values(
      canonicalIds.map((clerkUserId) => ({
        clerkUserIdDigest: clerkErasureDigest(clerkUserId),
        erasureSetDigest,
        releaseAfter: sql`clock_timestamp() + ${CLERK_ERASURE_PENDING_TIMEOUT_MS} * interval '1 millisecond'`,
        updatedAt: sql`clock_timestamp()`,
      })),
    )
    .onConflictDoUpdate({
      target: pendingClerkErasure.clerkUserIdDigest,
      set: {
        erasureSetDigest,
        releaseAfter: sql`clock_timestamp() + ${CLERK_ERASURE_PENDING_TIMEOUT_MS} * interval '1 millisecond'`,
        updatedAt: sql`clock_timestamp()`,
      },
    });
}

export async function assertClerkIdentityBootstrapAllowedTx(
  tx: Database,
  clerkUserId: string,
): Promise<void> {
  await acquireClerkErasureLocksTx(tx, [clerkUserId]);
  const digest = clerkErasureDigest(clerkUserId);
  const [fence] = await tx
    .select({
      released: sql<boolean>`${pendingClerkErasure.releaseAfter} is not null and ${pendingClerkErasure.releaseAfter} <= clock_timestamp()`,
    })
    .from(pendingClerkErasure)
    .where(eq(pendingClerkErasure.clerkUserIdDigest, digest));
  if (!fence) return;

  if (!fence.released) {
    throw new ConflictError('Identity deletion is still in progress.');
  }

  await tx
    .delete(pendingClerkErasure)
    .where(eq(pendingClerkErasure.clerkUserIdDigest, digest));
}

export async function ensurePendingClerkErasures(
  db: Database,
  clerkUserIds: readonly string[],
): Promise<boolean> {
  const canonicalIds = canonicalClerkUserIds(clerkUserIds);
  if (canonicalIds.length === 0) return true;

  return db.transaction(async (tx) => {
    await acquireClerkErasureLocksTx(tx as unknown as Database, canonicalIds);
    const rebound = await tx
      .select({ clerkUserId: login.clerkUserId })
      .from(login)
      .where(inArray(login.clerkUserId, canonicalIds))
      .for('update');
    if (rebound.length > 0) return false;

    const erasureSetDigest = clerkErasureSetDigest(canonicalIds);
    await tx
      .insert(pendingClerkErasure)
      .values(
        canonicalIds.map((clerkUserId) => ({
          clerkUserIdDigest: clerkErasureDigest(clerkUserId),
          erasureSetDigest,
          releaseAfter: sql`clock_timestamp() + ${CLERK_ERASURE_PENDING_TIMEOUT_MS} * interval '1 millisecond'`,
          updatedAt: sql`clock_timestamp()`,
        })),
      )
      .onConflictDoUpdate({
        target: pendingClerkErasure.clerkUserIdDigest,
        set: {
          erasureSetDigest,
          releaseAfter: sql`clock_timestamp() + ${CLERK_ERASURE_PENDING_TIMEOUT_MS} * interval '1 millisecond'`,
          updatedAt: sql`clock_timestamp()`,
        },
      });
    return true;
  });
}

export async function markPendingClerkErasuresComplete(
  db: Database,
  clerkUserIds: readonly string[],
): Promise<void> {
  const canonicalIds = canonicalClerkUserIds(clerkUserIds);
  if (canonicalIds.length === 0) return;

  await db.transaction(async (tx) => {
    await acquireClerkErasureLocksTx(tx as unknown as Database, canonicalIds);
    await tx
      .update(pendingClerkErasure)
      .set({
        releaseAfter: sql`clock_timestamp() + ${CLERK_ERASURE_RELEASE_GRACE_MS} * interval '1 millisecond'`,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(
        inArray(
          pendingClerkErasure.clerkUserIdDigest,
          canonicalIds.map(clerkErasureDigest),
        ),
      );
  });
}

/**
 * Remove fences whose database-authored deadline has elapsed: either the
 * post-deletion JWT grace period or the abandoned-pending recovery timeout.
 * The database clock is authoritative so worker clock skew cannot release a
 * fence early. Each transaction removes at most one bounded batch; the durable
 * cron repeats batches until fewer than the batch size remain.
 */
export async function deleteExpiredClerkErasureFences(
  db: Database,
  batchSize = CLERK_ERASURE_FENCE_CLEANUP_BATCH_SIZE,
): Promise<number> {
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
    throw new RangeError(
      'Clerk erasure fence cleanup batch size must be positive',
    );
  }
  return db.transaction(async (tx) => {
    const expired = await tx
      .select({ digest: pendingClerkErasure.clerkUserIdDigest })
      .from(pendingClerkErasure)
      .where(
        and(
          isNotNull(pendingClerkErasure.releaseAfter),
          lte(pendingClerkErasure.releaseAfter, sql`clock_timestamp()`),
        ),
      )
      .orderBy(
        pendingClerkErasure.releaseAfter,
        pendingClerkErasure.clerkUserIdDigest,
      )
      .limit(batchSize)
      .for('update', { skipLocked: true });
    if (expired.length === 0) return 0;

    const rows = await tx
      .delete(pendingClerkErasure)
      .where(
        inArray(
          pendingClerkErasure.clerkUserIdDigest,
          expired.map((row) => row.digest),
        ),
      )
      .returning({ digest: pendingClerkErasure.clerkUserIdDigest });
    return rows.length;
  });
}

async function currentGdprGrantSetTx(
  tx: DeletionTx,
  personId: string,
): Promise<Array<{ purpose: string; withdrawnAt: Date | null }>> {
  const rows = await Promise.all(
    CONSENT_PURPOSES.map((purpose) =>
      tx.query.consentGrant.findFirst({
        where: and(
          eq(consentGrant.chargePersonId, personId),
          eq(consentGrant.purpose, purpose),
          eq(consentGrant.lawfulBasis, 'gdpr_parental_consent'),
        ),
        orderBy: (grant, { desc }) => [desc(grant.grantedAt), desc(grant.id)],
        columns: { purpose: true, withdrawnAt: true },
      }),
    ),
  );
  return rows.filter(
    (row): row is { purpose: string; withdrawnAt: Date | null } =>
      row !== undefined,
  );
}

/**
 * Acquire the per-person serializing advisory lock at the TOP of a deletion
 * transaction (WI-583 pattern; same key as `consentPersonLockKey`). Two
 * concurrent same-person deletes serialize on this lock; the loser blocks until
 * the winner commits, so its subsequent reads see the committed person delete.
 */
async function acquirePersonLockTx(
  tx: DeletionTx,
  personId: string,
): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${consentPersonLockKey(personId)}, 0))`,
  );
}

type PreparedPersonErasureV2 = {
  organizationId: string;
  deleteOrganization: boolean;
  adminTransferRequired: boolean;
  clerkUserIds: string[];
  loginEmails: string[];
  subscriptions: SubscriptionSnapshot[];
  subscriptionStoreTeardownTargets: SubscriptionStoreTeardownTarget[];
};

type PreparePersonErasureResultV2 =
  | { ready: true; context: PreparedPersonErasureV2 }
  | { ready: false; result: PersonErasureAttemptResultV2 };

function notEligiblePersonErasureResult(
  organizationId: string | null = null,
): PersonErasureAttemptResultV2 {
  return {
    status: 'not_eligible',
    clerkUserIds: [],
    organizationId,
    organizationDeleted: false,
    subscriptionStoreTeardownTargets: [],
  };
}

function adminTransferRequiredPersonErasureResult(
  organizationId: string,
): PersonErasureAttemptResultV2 {
  return {
    status: 'admin_transfer_required',
    clerkUserIds: [],
    organizationId,
    organizationDeleted: false,
    subscriptionStoreTeardownTargets: [],
  };
}

function canonicalStringArray(values: readonly string[]): string[] {
  return [...values].sort();
}

function sameStringArray(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    JSON.stringify(canonicalStringArray(left)) ===
    JSON.stringify(canonicalStringArray(right))
  );
}

function sameSubscriptionTargets(
  left: readonly SubscriptionStoreTeardownTarget[],
  right: readonly SubscriptionStoreTeardownTarget[],
): boolean {
  const canonicalize = (values: readonly SubscriptionStoreTeardownTarget[]) =>
    [...values].sort((a, b) =>
      a.subscriptionId.localeCompare(b.subscriptionId),
    );
  return (
    JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))
  );
}

/**
 * Lock and verify every row that determines a person erasure's external work.
 * Organization is locked before person to match executeDeletionV2's lock order
 * and avoid a person↔organization deadlock with whole-org deletion.
 */
async function preparePersonErasureTx(
  tx: DeletionTx,
  personId: string,
  expectedSnapshot?: PersonErasureSnapshotV2,
): Promise<PreparePersonErasureResultV2> {
  const initialMembership = await tx.query.membership.findFirst({
    where: eq(membership.personId, personId),
    columns: { organizationId: true },
  });

  if (!initialMembership) {
    const [lockedPerson] = await tx
      .select({ id: person.id })
      .from(person)
      .where(eq(person.id, personId))
      .for('update');
    if (lockedPerson) {
      throw new Error(
        `preparePersonErasureTx: orphaned person ${personId} — no organization membership resolved`,
      );
    }
    const organizationStillExists = expectedSnapshot?.organizationId
      ? !!(await tx.query.organization.findFirst({
          where: eq(organization.id, expectedSnapshot.organizationId),
          columns: { id: true },
        }))
      : false;
    return {
      ready: false,
      result: {
        status: 'already_deleted',
        clerkUserIds: expectedSnapshot?.clerkUserIds ?? [],
        organizationId: expectedSnapshot?.organizationId ?? null,
        organizationDeleted:
          !!expectedSnapshot?.organizationId && !organizationStillExists,
        subscriptionStoreTeardownTargets:
          expectedSnapshot?.organizationId && !organizationStillExists
            ? expectedSnapshot.subscriptionStoreTeardownTargets
            : [],
      },
    };
  }

  const [lockedOrganization] = await tx
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, initialMembership.organizationId))
    .for('update');
  if (!lockedOrganization) {
    return {
      ready: false,
      result: {
        status: 'snapshot_changed',
        clerkUserIds: [],
        organizationId: null,
        organizationDeleted: false,
        subscriptionStoreTeardownTargets: [],
      },
    };
  }

  const [lockedPerson] = await tx
    .select({ id: person.id })
    .from(person)
    .where(eq(person.id, personId))
    .for('update');
  if (!lockedPerson) {
    return {
      ready: false,
      result: {
        status: 'already_deleted',
        clerkUserIds: expectedSnapshot?.clerkUserIds ?? [],
        organizationId: expectedSnapshot?.organizationId ?? null,
        organizationDeleted: false,
        subscriptionStoreTeardownTargets: [],
      },
    };
  }

  const memberships = await tx
    .select({ personId: membership.personId, roles: membership.roles })
    .from(membership)
    .where(eq(membership.organizationId, lockedOrganization.id))
    .for('update');
  const target = memberships.find((row) => row.personId === personId);
  if (!target) {
    return {
      ready: false,
      result: {
        status: 'snapshot_changed',
        clerkUserIds: [],
        organizationId: null,
        organizationDeleted: false,
        subscriptionStoreTeardownTargets: [],
      },
    };
  }

  const loginRows = await tx
    .select({ clerkUserId: login.clerkUserId, email: login.email })
    .from(login)
    .where(eq(login.personId, personId))
    .for('update');
  const clerkUserIds = canonicalStringArray(
    loginRows.map((row) => row.clerkUserId),
  );
  const loginEmails = canonicalStringArray(loginRows.map((row) => row.email));
  const organizationPersonIds = canonicalStringArray(
    memberships.map((row) => row.personId),
  );

  if (
    expectedSnapshot &&
    (expectedSnapshot.personId !== personId ||
      !expectedSnapshot.personExists ||
      expectedSnapshot.organizationId !== lockedOrganization.id ||
      !sameStringArray(expectedSnapshot.clerkUserIds, clerkUserIds) ||
      !sameStringArray(expectedSnapshot.loginEmails, loginEmails) ||
      !sameStringArray(
        expectedSnapshot.organizationPersonIds,
        organizationPersonIds,
      ))
  ) {
    return {
      ready: false,
      result: {
        status: 'snapshot_changed',
        clerkUserIds: [],
        organizationId: null,
        organizationDeleted: false,
        subscriptionStoreTeardownTargets: [],
      },
    };
  }

  const anotherAdminExists = memberships.some(
    (row) => row.personId !== personId && row.roles.includes('admin'),
  );
  const adminTransferRequired =
    target.roles.includes('admin') &&
    !anotherAdminExists &&
    memberships.length > 1;

  const deleteOrganization = memberships.length === 1;
  const lockedSubscriptions = deleteOrganization
    ? await tx
        .select({
          id: subscription.id,
          planTier: subscription.planTier,
          status: subscription.status,
          stripeCustomerId: subscription.stripeCustomerId,
          stripeSubscriptionId: subscription.stripeSubscriptionId,
          revenuecatOriginalAppUserId: subscription.revenuecatOriginalAppUserId,
          storeProductId: subscription.storeProductId,
          storePlatform: subscription.storePlatform,
        })
        .from(subscription)
        .where(eq(subscription.organizationId, lockedOrganization.id))
        .for('update')
    : await tx.query.subscription.findMany({
        where: eq(subscription.organizationId, lockedOrganization.id),
        columns: {
          id: true,
          planTier: true,
          status: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
          revenuecatOriginalAppUserId: true,
          storeProductId: true,
          storePlatform: true,
        },
      });
  const subscriptionStoreTeardownTargets =
    toSubscriptionStoreTeardownTargets(lockedSubscriptions);

  if (
    expectedSnapshot &&
    deleteOrganization &&
    !sameSubscriptionTargets(
      expectedSnapshot.subscriptionStoreTeardownTargets,
      subscriptionStoreTeardownTargets,
    )
  ) {
    return {
      ready: false,
      result: {
        status: 'snapshot_changed',
        clerkUserIds: [],
        organizationId: null,
        organizationDeleted: false,
        subscriptionStoreTeardownTargets: [],
      },
    };
  }

  return {
    ready: true,
    context: {
      organizationId: lockedOrganization.id,
      deleteOrganization,
      adminTransferRequired,
      clerkUserIds,
      loginEmails,
      subscriptions: lockedSubscriptions.map((row) => ({
        id: row.id,
        planTier: row.planTier,
        status: row.status,
        stripeCustomerId: row.stripeCustomerId,
        stripeSubscriptionId: row.stripeSubscriptionId,
      })),
      subscriptionStoreTeardownTargets,
    },
  };
}

async function erasePreparedPersonTx(
  tx: DeletionTx,
  personId: string,
  context: PreparedPersonErasureV2,
  reason: DeletionReason,
  deletedBy: string | null,
): Promise<PersonErasureAttemptResultV2> {
  await reservePendingClerkErasuresTx(tx, context.clerkUserIds);
  if (context.deleteOrganization && context.subscriptions.length > 0) {
    await tx
      .delete(subscription)
      .where(eq(subscription.organizationId, context.organizationId));
  }
  await rehomeGrantsTx(tx, personId);
  await writeFinancialRecordsTx(
    tx,
    personId,
    context.organizationId,
    context.subscriptions,
  );
  await tx.insert(deletionAudit).values({
    personId,
    deletedBy,
    reason,
    retentionPeriod: null,
  });
  await tearDownPersonEdgesTx(tx, personId);
  await tx.delete(person).where(eq(person.id, personId));

  if (context.deleteOrganization) {
    await tx
      .delete(organization)
      .where(eq(organization.id, context.organizationId));
  }
  if (context.loginEmails.length > 0) {
    await tx
      .delete(byokWaitlist)
      .where(inArray(byokWaitlist.email, context.loginEmails));
  }

  return {
    status: 'deleted',
    clerkUserIds: context.clerkUserIds,
    organizationId: context.organizationId,
    organizationDeleted: context.deleteOrganization,
    subscriptionStoreTeardownTargets: context.deleteOrganization
      ? context.subscriptionStoreTeardownTargets
      : [],
  };
}

/**
 * Tear down every guardianship + supportership edge INCIDENT to a person being
 * erased, inside the deletion transaction, BEFORE the person row drops — the
 * single-person granularity of the whole-org Step 2a teardown (WI-1985; see
 * MMT-ADR-0026 for the whole-org decision this extends). Both edges' endpoint
 * FKs are `ON DELETE RESTRICT` (identity.ts), so dropping a person who sits on
 * either end of an edge — active OR revoked — aborts the whole transaction
 * unless the incident edges go first. Without this, the statutory auto-erasure
 * pipelines (consent-withdrawal, day-30 no-consent, archived-cleanup) FK-violate
 * and roll back for any managed child (who always sits on a guardianship edge as
 * the charge) — erasure never completes.
 *
 * Incident-scoped and bidirectional: an edge is severed when THIS person is on
 * EITHER end; the counterpart person (the surviving guardian/supporter, in-org
 * or cross-org) is NEVER touched — the relationship to the erased person ceases
 * to exist, but the other human does not. There is no retain-tier obligation for
 * a relationship edge (unlike consent_grant → consent_receipt), so a hard delete
 * is correct (MMT-ADR-0026 Consequences).
 */
async function tearDownPersonEdgesTx(
  tx: DeletionTx,
  personId: string,
): Promise<void> {
  await tx
    .delete(guardianship)
    .where(
      or(
        eq(guardianship.guardianPersonId, personId),
        eq(guardianship.chargePersonId, personId),
      ),
    );
  await tx
    .delete(supportership)
    .where(
      or(
        eq(supportership.supporterPersonId, personId),
        eq(supportership.supporteePersonId, personId),
      ),
    );
}

/**
 * The subscription snapshot captured into the financial_record payload — the
 * billing-correlation fields a tax/chargeback record would need to reconcile
 * against the payment store after the person is gone.
 *
 * [WI-1138] Exported so the consent-deny payer-subscription path
 * (consent-v2.ts) can share this shape rather than redeclaring it.
 */
export type SubscriptionSnapshot = {
  id: string;
  planTier: string;
  status: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

/**
 * Pre-read store provider identifiers for whole-org erasure before
 * executeDeletionV2 removes the subscription rows. The scheduled Inngest
 * workflow memoizes this snapshot, runs the DB deletion, then emits a durable
 * event from the captured identifiers. This avoids both unsafe provider calls
 * inside the DB transaction and the lost-ID failure mode where event dispatch
 * fails after the subscription rows are already gone.
 */
export async function getSubscriptionStoreTeardownTargetsV2(
  db: Database,
  organizationId: string,
): Promise<SubscriptionStoreTeardownTarget[]> {
  return readSubscriptionStoreTeardownTargetsTx(db, organizationId);
}

async function readSubscriptionStoreTeardownTargetsTx(
  db: Pick<Database, 'query'>,
  organizationId: string,
): Promise<SubscriptionStoreTeardownTarget[]> {
  const rows = await db.query.subscription.findMany({
    where: eq(subscription.organizationId, organizationId),
    columns: {
      id: true,
      planTier: true,
      status: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      revenuecatOriginalAppUserId: true,
      storeProductId: true,
      storePlatform: true,
    },
  });

  return toSubscriptionStoreTeardownTargets(rows);
}

type SubscriptionStoreTeardownSource = {
  id: string;
  planTier: SubscriptionStoreTeardownTarget['planTier'];
  status: SubscriptionStoreTeardownTarget['status'];
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  revenuecatOriginalAppUserId: string | null;
  storeProductId: string | null;
  storePlatform: string | null;
};

export function toSubscriptionStoreTeardownTargets(
  rows: readonly SubscriptionStoreTeardownSource[],
): SubscriptionStoreTeardownTarget[] {
  return rows
    .map((row) => ({
      subscriptionId: row.id,
      planTier: row.planTier,
      status: row.status,
      stripe: {
        customerId: row.stripeCustomerId,
        subscriptionId: row.stripeSubscriptionId,
      },
      revenueCat: {
        originalAppUserId: row.revenuecatOriginalAppUserId,
        storeProductId: row.storeProductId,
        storePlatform: row.storePlatform,
      },
    }))
    .sort((left, right) =>
      left.subscriptionId.localeCompare(right.subscriptionId),
    );
}

/**
 * Write the retain-tier financial_record rows for a person being deleted (§6.1:
 * "financial_record rows created for tax/chargeback"). Called BEFORE the person
 * drop, inside the deletion transaction. financial_record has no FK to person /
 * organization (it outlives both), so the subsequent person DELETE never
 * cascade-removes these rows.
 *
 * §4.9 COUNSEL-OWNED (PROVISIONAL): the record_type values, the two-rows-per-
 * person cardinality, the payload shape, and retention_period (NULL) are all
 * provisional pending counsel — mirroring consent_receipt.retention_period. We
 * do NOT invent a legal retention duration. See data-model.md §4.9.
 *
 * [WI-1138] Exported so the consent-deny payer-subscription path
 * (consent-v2.ts) reuses this ONE canonical financial-record write instead
 * of a second, narrower (tax-only) insert — the tax/chargeback pairing is
 * §4.9 COUNSEL-OWNED and not a per-caller decision.
 */
export async function writeFinancialRecordsTx(
  tx: DeletionTx,
  personId: string,
  organizationId: string,
  subscriptions: SubscriptionSnapshot[],
): Promise<void> {
  const payload = {
    deletedAt: new Date().toISOString(),
    subscriptions,
  };
  await tx.insert(financialRecord).values([
    {
      personId,
      organizationId,
      // §4.9 COUNSEL-OWNED — provisional record_type taxonomy.
      recordType: 'person_deletion_tax_retain',
      payload,
      // §4.9 COUNSEL-OWNED — NULL until counsel supplies the retention value.
      retentionPeriod: null,
    },
    {
      personId,
      organizationId,
      // §4.9 COUNSEL-OWNED — provisional record_type taxonomy.
      recordType: 'person_deletion_chargeback_retain',
      payload,
      retentionPeriod: null,
    },
  ]);
}
