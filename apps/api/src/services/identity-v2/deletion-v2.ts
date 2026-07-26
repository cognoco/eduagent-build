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
  consentReceipt,
  consentRequest,
  deletionAudit,
  financialRecord,
  guardianship,
  login,
  membership,
  organization,
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

const GRACE_PERIOD_DAYS = 7;
const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

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
  const scheduledAt = new Date();
  const [updated] = await db
    .update(organization)
    .set({ deletionScheduledAt: scheduledAt })
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
    .set({ deletionCancelledAt: new Date() })
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

export type DeletionResult = 'deleted' | 'cancelled' | 'already_deleted';

export interface ExecuteDeletionV2Input {
  organizationId: string;
  /** Pre-read owner email (step 1) — the D2 byok_waitlist erase key. */
  ownerEmail: string | null;
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
  const { organizationId, ownerEmail, reason, deletedBy } = input;

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
    const memberships = await tx.query.membership.findMany({
      where: eq(membership.organizationId, organizationId),
      columns: { personId: true },
    });
    const personIds = memberships.map((m) => m.personId);

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
    const orgSubscriptions = await readOrgSubscriptionsTx(tx, organizationId);

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
        await tx.insert(consentReceipt).values(
          grants.map((g) => ({
            personId: g.chargePersonId,
            organizationId: g.organizationId,
            purpose: g.purpose,
            lawfulBasis: g.lawfulBasis,
            granted: g.granted,
            grantedAt: g.grantedAt,
            withdrawnAt: g.withdrawnAt,
            priorValue: g.priorValue,
            auditFact: g.auditFact,
            retentionPeriod: null,
          })),
        );
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
    if (ownerEmail) {
      await tx.delete(byokWaitlist).where(eq(byokWaitlist.email, ownerEmail));
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
    if (!(await personExistsTx(tx, personId))) return;
    await rehomeGrantsTx(tx, personId);
    await writeFinancialRecordsForPersonTx(tx, personId);
    await tx.insert(deletionAudit).values({
      personId,
      deletedBy,
      reason,
      retentionPeriod: null,
    });
    // WI-1985 — sever incident guardianship/supportership edges before the drop
    // (their charge/supportee RESTRICT FKs would otherwise abort the delete).
    await tearDownPersonEdgesTx(tx, personId);
    await tx.delete(person).where(eq(person.id, personId));
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
  const withdrawnAtDate =
    withdrawnAt instanceof Date
      ? withdrawnAt
      : withdrawnAt
        ? new Date(withdrawnAt)
        : undefined;
  if (withdrawnAtDate && Number.isNaN(withdrawnAtDate.getTime())) return false;

  return db.transaction(async (tx) => {
    // WI-583 race guard: serialize against a concurrent restoreConsentV2 (which
    // appends a granted row) by taking the per-person advisory lock FIRST. The
    // current-grant read below then happens AFTER any in-flight restore has
    // committed, so a restore that wins the lock is visible here and blocks the
    // delete (current.withdrawnAt is null on the new grant). Without the lock,
    // under READ COMMITTED a restore committing between this read and the
    // re-home/delete would let the delete remove a just-restored person.
    await acquirePersonLockTx(tx, personId);
    // Re-check current GDPR grant under the lock and verify it is withdrawn
    // (optionally at the given timestamp). currentGrant windowing:
    // max(granted_at), tiebreak id.
    const current = await currentGdprGrantSetTx(tx, personId);
    if (current.length === 0 || current.some((grant) => !grant.withdrawnAt)) {
      return false;
    }
    if (
      withdrawnAtDate &&
      current.some(
        (grant) => grant.withdrawnAt!.getTime() !== withdrawnAtDate.getTime(),
      )
    ) {
      return false;
    }
    // WI-723 P2: the lock above already serializes same-person runs, and the
    // winner's rehomeGrantsTx deletes the consent_grant so the loser's
    // current-grant read returns nothing → it bails on the `!current` guard.
    // That loser-guard is incidental (grant-gone ⇒ person-gone coupling), so we
    // add an explicit person-existence re-check to guarantee no duplicate
    // retain records even if that coupling ever changes.
    if (!(await personExistsTx(tx, personId))) return false;
    await rehomeGrantsTx(tx, personId);
    await writeFinancialRecordsForPersonTx(tx, personId);
    await tx.insert(deletionAudit).values({
      personId,
      deletedBy: null,
      reason: 'guardian_initiated',
      retentionPeriod: null,
    });
    // WI-1985 — sever incident guardianship/supportership edges before the drop
    // (their charge/supportee RESTRICT FKs would otherwise abort the delete).
    await tearDownPersonEdgesTx(tx, personId);
    const deleted = await tx
      .delete(person)
      .where(eq(person.id, personId))
      .returning({ id: person.id });
    return deleted.length > 0;
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
  // [requestedAt, requestedAt+1ms) window pins exactly one generation (the
  // +1ms upper bound tolerates the ms-granularity of the requested_at column).
  // Mirrors legacy deleteProfileIfNoConsent's requestGenerationPredicate.
  const requestedAtUpperBound = requestedAt
    ? new Date(requestedAt.getTime() + 1)
    : undefined;

  return db.transaction(async (tx) => {
    // WI-723 race guard: take the per-person advisory lock FIRST, before the
    // predicate reads. This serializes two concurrent same-person day-30 runs;
    // the loser blocks until the winner commits, then its reads (incl. the
    // person-existence re-check below) see the committed delete. Without the
    // lock, both runs pass the consent/open-request pre-checks, both commit
    // their side-writes (financial_record + deletion_audit), and only one
    // RETURNING delete wins — the loser leaves duplicate retain records (no
    // unique constraint, no person FK on financial_record), so the dupes
    // persist. Mirrors deletePersonIfConsentWithdrawnV2 / the archived sibling.
    await acquirePersonLockTx(tx, personId);

    const current = await currentGdprGrantSetTx(tx, personId);
    // Any active recorded purpose is valid historical consent and therefore
    // blocks destructive abandonment. A missing newer purpose remains
    // fail-closed for processing, but must not erase the earlier grant.
    if (current.some((grant) => !grant.withdrawnAt)) {
      return false;
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
      if (!openRequestOfGeneration) return false;
    }

    // Post-lock person-existence re-check (WI-723 P2): the open-request
    // predicate above can match for BOTH concurrent runs (each read its OPEN
    // request before either delete cascaded it away), so it is not on its own a
    // sufficient loser-guard. The winner's person delete cascades the request
    // away, but only after this read can have already passed for the loser.
    // Gating the side-writes on the person still existing under the lock makes
    // the loser write nothing.
    if (!(await personExistsTx(tx, personId))) return false;

    await rehomeGrantsTx(tx, personId);
    await writeFinancialRecordsForPersonTx(tx, personId);
    await tx.insert(deletionAudit).values({
      personId,
      deletedBy: null,
      reason: 'abandonment',
      retentionPeriod: null,
    });
    // WI-1985 — sever incident guardianship/supportership edges before the drop
    // (their charge/supportee RESTRICT FKs would otherwise abort the delete).
    await tearDownPersonEdgesTx(tx, personId);
    const deleted = await tx
      .delete(person)
      .where(eq(person.id, personId))
      .returning({ id: person.id });
    return deleted.length > 0;
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
  return db.transaction(async (tx) => {
    // WI-583 race guard: restoreConsentV2 BOTH clears archived_at AND appends a
    // granted grant. Take the per-person advisory lock FIRST so the archived_at
    // and current-grant reads below see any in-flight restore's commit — a
    // restore that wins the lock un-archives the person (first predicate fails)
    // and re-grants (second predicate fails), and the delete is a no-op.
    await acquirePersonLockTx(tx, personId);
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
      return false;
    }
    const current = await currentGdprGrantSetTx(tx, personId);
    if (current.some((grant) => !grant.withdrawnAt)) {
      return false;
    }
    await rehomeGrantsTx(tx, personId);
    await writeFinancialRecordsForPersonTx(tx, personId);
    await tx.insert(deletionAudit).values({
      personId,
      deletedBy: null,
      reason: 'abandonment',
      retentionPeriod: null,
    });
    // WI-1985 — sever incident guardianship/supportership edges before the drop
    // (their charge/supportee RESTRICT FKs would otherwise abort the delete).
    await tearDownPersonEdgesTx(tx, personId);
    const deleted = await tx
      .delete(person)
      .where(eq(person.id, personId))
      .returning({ id: person.id });
    return deleted.length > 0;
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
  await tx.insert(consentReceipt).values(
    grants.map((g) => ({
      personId: g.chargePersonId,
      organizationId: g.organizationId,
      purpose: g.purpose,
      lawfulBasis: g.lawfulBasis,
      granted: g.granted,
      grantedAt: g.grantedAt,
      withdrawnAt: g.withdrawnAt,
      priorValue: g.priorValue,
      auditFact: g.auditFact,
      retentionPeriod: null,
    })),
  );
  await tx
    .delete(consentGrant)
    .where(eq(consentGrant.chargePersonId, personId));
}

type DeletionTx = Parameters<Parameters<Database['transaction']>[0]>[0];

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

/**
 * Does the person still exist? Used as the post-lock re-check that prevents a
 * concurrent-delete loser from committing duplicate retain records (WI-723 P2):
 * after the lock serializes the runs, the loser sees the winner's committed
 * delete and bails BEFORE writing any financial_record / deletion_audit row.
 */
async function personExistsTx(
  tx: DeletionTx,
  personId: string,
): Promise<boolean> {
  const row = await tx.query.person.findFirst({
    where: eq(person.id, personId),
    columns: { id: true },
  });
  return !!row;
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
 * Read the org's subscription snapshot once, inside the deletion transaction,
 * for the financial_record payload. Read before the person drop (subscriptions
 * outlive persons in the retain-tier split — data-model.md §3.2). A no-op-safe
 * empty array when the org has no subscription.
 */
async function readOrgSubscriptionsTx(
  tx: DeletionTx,
  organizationId: string,
): Promise<SubscriptionSnapshot[]> {
  return tx.query.subscription.findMany({
    where: eq(subscription.organizationId, organizationId),
    columns: {
      id: true,
      planTier: true,
      status: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
    },
  });
}

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

  return rows.map((row) => ({
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
  }));
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

/**
 * The org a person belongs to (via membership) — the financial_record's
 * organization key for the single-person delete paths, which take a personId
 * but not an organizationId. Returns null when the person has no membership.
 */
async function personOrganizationIdTx(
  tx: DeletionTx,
  personId: string,
): Promise<string | null> {
  const row = await tx.query.membership.findFirst({
    where: eq(membership.personId, personId),
    columns: { organizationId: true },
  });
  return row?.organizationId ?? null;
}

/**
 * Write a person's retain-tier financial_record rows inside the deletion
 * transaction, resolving the org via membership and snapshotting its
 * subscriptions. Used by the single-person delete paths (deletePersonV2 and the
 * consent-gated sweeps), which have only a personId.
 *
 * FAIL-CLOSED on no org (§6.1 compliance-critical; AGENTS.md billing-domain
 * "no silent recovery") — but only for a GENUINE anomaly. If no organization
 * resolves for the person we CANNOT write the §6.1 financial_record
 * (`organization_id` is NOT NULL — no sentinel row is possible), and a person
 * must never be deleted without its retain records. So we THROW, aborting the
 * whole deletion transaction (person NOT deleted, no partial state) rather than
 * silently skip. The throw IS the required escalation — it propagates to the
 * Inngest/route boundary and is captured in Sentry.
 *
 * Anomaly vs. benign race (recheck existence before throwing). A no-org result
 * has two causes: (a) a true orphaned-person anomaly — the person STILL exists
 * but has no resolvable org; (b) a benign concurrent-deletion race — a
 * person-scoped delete passed its earlier existence check, then
 * `executeDeletionV2` (org-level; does NOT take the per-person advisory lock)
 * won the same-org delete and cascaded this membership away. In case (b) the
 * deletion is already accomplished and idempotent, so throwing would turn it
 * into a spurious failure → Inngest retry → escalation. We therefore re-check
 * person existence first: if the person is already gone, return a clean no-op;
 * only fail-closed when the person still exists with no org (true corruption).
 */
async function writeFinancialRecordsForPersonTx(
  tx: DeletionTx,
  personId: string,
): Promise<void> {
  const organizationId = await personOrganizationIdTx(tx, personId);
  if (!organizationId) {
    // Benign concurrent-deletion race: the person is already gone (e.g.
    // executeDeletionV2 won and cascaded the membership). Idempotent no-op.
    if (!(await personExistsTx(tx, personId))) return;
    // Genuine anomaly: the person still exists but no org resolves. Fail closed.
    throw new Error(
      `writeFinancialRecordsForPersonTx: orphaned person ${personId} — still exists but no organization resolved; cannot write the §6.1 financial_record retain rows; aborting the deletion (fail-closed, no silent skip).`,
    );
  }
  const subscriptions = await readOrgSubscriptionsTx(tx, organizationId);
  await writeFinancialRecordsTx(tx, personId, organizationId, subscriptions);
}
