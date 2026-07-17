// ---------------------------------------------------------------------------
// WI-1753 — cross-account existing-teen family join ("join-my-family v1").
//
// The ACCEPT side: a teen who already owns a solo org-of-one accepts a
// parent-issued invite and joins the parent's existing family org. This module
// is the single mutation point for that transition. The parent-issued INVITE
// (identify + token + anti-enum) lives in the Phase-2 route/service; this
// function takes the already-validated (teen, family, parent) triple and the
// teen's explicit supportership opt-in.
//
// AC mapping (plan _dev .cosmo-watch/batch4/WI-1753-PLAN.md §3):
//   AC-2  membership REPOINT with roles reset to ['learner'] (never admin of the
//         family org); parent stays admin/payer (already true — org-anchored sub).
//   AC-3  NEVER writes a guardianship row (inv 14/19). A supportership row is
//         appended ONLY on explicit teen opt-in.
//   AC-4  person_id is stable — no new Person is created, so every person-scoped
//         row (sessions / retention / notes / supportership) rides along untouched.
//   AC-5  repoint + org-of-one teardown run in ONE Postgres transaction (see the
//         single-tx note below) → any failure rolls back fully → the teen is never
//         orphaned and is left exactly as a solo org-of-one.
//   AC-6  the teen keeps their store subscription (billing option B, no server
//         refund). We capture the store ref BEFORE the DB subscription teardown
//         and dispatch a durable self-cancel nudge AFTER commit (WI-885 pattern).
//   AC-7  the accept path never creates guardianship; a minor-initiated
//         guardianship request is rejected upstream (Phase-2 route), not here.
//
// SINGLE-TRANSACTION (orchestrator ruling 2026-07-12): single-tx supersedes the
// ADR-0010 migration-pending interim for the existing-teen (no-external-step)
// path. ADR-0010's set-marker → repoint-tx → teardown-tx → clear-marker interim
// was written for the Clerk-SIGNUP variant, where an external account-creation
// step sits mid-flow and cannot live inside a DB transaction. The existing-teen
// already has a Login — there is no external mid-step — so repoint + full
// org-of-one teardown are all pure DB ops and belong in ONE transaction, which
// gives the strongest never-orphan guarantee (full rollback on any failure) and
// needs no resume machinery. `person.migration_pending_at` is deliberately NOT
// written on this path (a set+clear inside one tx is a dead write); the Phase-1
// column is retained only as the crash-recovery signal for the Clerk-SIGNUP
// two-tx variant, which is out of scope here.
// ---------------------------------------------------------------------------

import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  consentGrant,
  membership,
  organization,
  person,
  subscription,
  supportership,
  type Database,
} from '@eduagent/database';

import { BadRequestError, ConflictError, ForbiddenError } from '../../errors';
import { inngest } from '../../inngest/client';
import { checkConsentRequiredFromDate } from '../consent';
import { getSubscriptionByAccountIdV2 } from '../billing/billing-v2/subscription-core-v2';
import { canAddProfileV2 } from '../billing/billing-v2/family-v2';
import { provisionProfileQuotaUsageV2 } from '../billing/billing-v2/quota-provision-v2';
import { claimFamilyJoinInvite } from './family-join-invite';
import { safeSend } from '../safe-non-core';
import {
  consentPersonLockKey,
  getSubscriptionStoreTeardownTargetsV2,
} from './deletion-v2';
import { getChargePersonIds, getGuardianPersonIds } from './guardianship';
import { birthMonthDayFromDate, birthYearFromDate } from './profile-v2';

/**
 * v1 gate (TODO(WI-1753 Fork 2 / OPQ-75: teen age eligibility — pending Zuzka
 * ruling)): the accept path only admits a teen who is self-consent-capable by
 * age (`checkConsentRequiredFromDate(...).required === false`, i.e. 17+).
 * Rationale: the parent is explicitly NOT the teen's guardian (inv 14/19), so a
 * 13–16 teen who still requires GDPR parental consent has no one to provide it
 * post-join. If the ruling widens eligibility to 13–16, this gate AND the
 * post-join consent handling must change together. Pre-close gate: WI-1753 may
 * reach a PR with this constant as-is; complete/close waits on OPQ-75.
 */
const ACCEPT_REQUIRES_SELF_CONSENT_CAPABLE = true;

export interface AcceptFamilyJoinInput {
  /** The accepting teen — person.id === profile.id (the authenticated caller). */
  teenPersonId: string;
  /**
   * The invite being redeemed (from the resolved token). Claimed atomically
   * INSIDE the accept transaction — see step (0). The caller must NOT consume it
   * separately.
   */
  inviteId: string;
  /**
   * The RAW token the caller actually presented. Re-checked at claim time against
   * the invite row (token equality + expiry), so a superseded token (rotated away
   * by a concurrent resend/retarget) or an expired one cannot redeem — the
   * route's token read is advisory and cannot enforce this.
   */
  inviteToken: string;
  /** The inviting parent's existing family org (from the validated invite). */
  familyOrgId: string;
  /** The inviting parent (from the validated invite) — supportership supporter. */
  parentPersonId: string;
  /**
   * The teen's explicit opt-in to let the parent support (view) their learning.
   * When false, NO supportership edge is written — the teen joins the family
   * billing/quota seat only, with zero visibility granted to the parent (AC-3).
   */
  optInSupportership: boolean;
}

export interface AcceptFamilyJoinResult {
  familyOrgId: string;
  teenPersonId: string;
  /**
   * True when the teen was already in the family org (a repeated accept). The
   * mutation is skipped and this is a clean success (double-accept idempotency).
   */
  alreadyMember: boolean;
  /**
   * AC-6: captured BEFORE the org-of-one subscription teardown. Non-null when the
   * torn-down org-of-one carried an ACTIVE store subscription the teen should be
   * nudged to self-cancel (they are about to be double-charged: their own store
   * sub keeps billing while the parent pays the family seat). The durable nudge
   * event is dispatched post-commit; this is surfaced for the accept response so
   * the UI can also show the accept-time double-charge warning.
   */
  storeCancelNudge: { originalAppUserId: string } | null;
}

/**
 * Accept a parent-issued family-join invite: repoint the teen's solo membership
 * into the family org and decommission the emptied org-of-one, atomically.
 *
 * Preconditions (each failure throws BEFORE any mutation; the tx rolls back so
 * every row is left unchanged):
 *   - the accepting account is a GENUINE solo org-of-one: exactly one membership,
 *     and its org has no other members;
 *   - the teen is on NO guardianship edge in either direction (not a guardian,
 *     not a managed charge) — a managed child is not a solo owner;
 *   - the teen is self-consent-capable by age (v1 gate, Fork 2);
 *   - the target family org has an active subscription to seat the teen against.
 */
export async function acceptFamilyJoin(
  db: Database,
  input: AcceptFamilyJoinInput,
): Promise<AcceptFamilyJoinResult> {
  const {
    teenPersonId,
    inviteId,
    inviteToken,
    familyOrgId,
    parentPersonId,
    optInSupportership,
  } = input;

  if (teenPersonId === parentPersonId) {
    throw new BadRequestError('A teen cannot join their own account.');
  }

  return db
    .transaction(async (txRaw) => {
      const tx = txRaw as unknown as Database;

      // Serialize with the teen's own consent/deletion paths (per-person lock, same
      // key as deletion-v2/consent-v2) and with concurrent family-org membership
      // writes (org lock, same key as createChildProfileV2). Fixed acquire order
      // (person then org) — no other path takes both, so this cannot deadlock.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${consentPersonLockKey(
          teenPersonId,
        )}, 0))`,
      );
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${familyOrgId}))`,
      );

      // (0) CLAIM the invite — the FIRST mutation, inside the critical section.
      // The route's `resolveFamilyJoinInviteByToken` read is advisory only: it
      // classifies the 404 and supplies the ids, but it CANNOT authorize the
      // redemption, because anything it observed may have changed by the time we
      // write. Authorization happens HERE, in one conditional update whose
      // rowcount decides who won — matching on status, the PRESENTED token, and
      // its expiry:
      //   - two teens racing the same token both pass the advisory read; both
      //     redeem the same invite, hence the same familyOrgId, so they serialize
      //     on the org lock taken just above. The loser re-reads the committed
      //     row, sees 'accepted', matches zero rows, and aborts before touching
      //     membership.
      //   - a holder of a token that a concurrent resend/retarget has since
      //     ROTATED AWAY fails the `token` match — matching on `inviteId` alone
      //     would admit them, i.e. resend would not actually revoke.
      //   - an EXPIRED token fails the expiry match at write time, so expiry
      //     cannot be raced against the advisory read either.
      // Claiming INSIDE the tx (rather than consuming after it, as v1 did) also
      // means any later precondition failure rolls the claim back — a failed
      // accept releases the token instead of burning it.
      if (!(await claimFamilyJoinInvite(tx, inviteId, inviteToken))) {
        throw new ConflictError(
          'This family invite is no longer valid — it may have been used, resent, or expired.',
        );
      }

      // (1) Re-read the teen's membership UNDER the lock (TOCTOU-safe). The
      // membership_person_id_unique index guarantees at most one row.
      const teenMembership = await tx.query.membership.findFirst({
        where: eq(membership.personId, teenPersonId),
      });
      if (!teenMembership) {
        throw new BadRequestError('Accepting account has no membership.');
      }

      // Idempotent double-accept: already in the family org → nothing to do.
      if (teenMembership.organizationId === familyOrgId) {
        return {
          familyOrgId,
          teenPersonId,
          alreadyMember: true,
          storeCancelNudge: null,
        } satisfies AcceptFamilyJoinResult;
      }

      const orgOfOneId = teenMembership.organizationId;

      // (2) Precondition: GENUINE solo org-of-one — the teen's org has no other
      // members. (The unique index already caps the teen at one membership.)
      const orgMembers = await tx.query.membership.findMany({
        where: eq(membership.organizationId, orgOfOneId),
      });
      if (orgMembers.length !== 1) {
        throw new ForbiddenError(
          'Accepting account is not a solo org-of-one (has other members).',
        );
      }

      // (3) Precondition: the teen is on NO guardianship edge in either direction.
      // A guardian (has charges) or a managed child (has a guardian) is not a solo
      // owner and must not be silently restructured.
      const [charges, guardians] = await Promise.all([
        getChargePersonIds(tx, teenPersonId),
        getGuardianPersonIds(tx, teenPersonId),
      ]);
      if (charges.length > 0) {
        throw new ForbiddenError(
          'Accepting account is a guardian and cannot join as a learner.',
        );
      }
      if (guardians.length > 0) {
        throw new ForbiddenError(
          'Accepting account is a managed child and cannot self-join.',
        );
      }

      // (4) Precondition: self-consent-capable by age (Fork 2 gate).
      const teenPerson = await tx.query.person.findFirst({
        where: eq(person.id, teenPersonId),
      });
      if (!teenPerson) {
        throw new BadRequestError('Accepting person not found.');
      }
      const { birthMonth, birthDay } = birthMonthDayFromDate(
        teenPerson.birthDate,
      );
      const consentCheck = checkConsentRequiredFromDate(
        birthYearFromDate(teenPerson.birthDate),
        birthMonth ?? undefined,
        birthDay ?? undefined,
      );
      if (ACCEPT_REQUIRES_SELF_CONSENT_CAPABLE && consentCheck.required) {
        throw new ForbiddenError(
          'Accepting teen is not self-consent-capable by age.',
        );
      }

      // (5) Precondition: the family plan must have a SEAT for the teen.
      // A subscription row existing is not that precondition — it proves nothing
      // about the plan's tier or its remaining capacity. `canAddProfileV2`
      // resolves the plan's EFFECTIVE access tier (so an expired or downgraded
      // plan collapses to the tier it actually confers, not the one it was sold
      // as) and compares the org's current profile count against that tier's
      // cap. Without it an at-capacity or expired plan reached the quota insert
      // in step (9) with the membership already repointed. Gated here, BEFORE any
      // mutation, so a seatless plan fails cleanly rather than half-joining.
      // Mirrors createChildProfileV2 (the add-child path), which gates on the
      // same predicate under the same per-org advisory lock.
      const familySub = await getSubscriptionByAccountIdV2(tx, familyOrgId);
      if (!familySub) {
        throw new ConflictError(
          'Target family org has no active subscription.',
        );
      }
      if (!(await canAddProfileV2(tx, familySub.id))) {
        throw new ConflictError('Target family plan has no remaining seats.');
      }

      // (6) `person.migration_pending_at` is deliberately NOT written on this path.
      // Under the single transaction any failure rolls the whole join back, so a
      // marker set here would be invisible to every outside connection and cleared
      // in the same commit — a dead write. The Phase-1 column is retained only as
      // the crash-recovery signal for the Clerk-SIGNUP two-tx variant (ADR-0010),
      // which is out of scope for this existing-teen path.

      // (7) AC-6: capture the store ref BEFORE tearing down the subscription row.
      // Only an ACTIVE store sub (real signal per billing explore: status active/
      // trial AND revenuecat_original_app_user_id present) warrants the nudge.
      const storeTargets = await getSubscriptionStoreTeardownTargetsV2(
        tx,
        orgOfOneId,
      );
      const activeStore = storeTargets.find(
        (t) =>
          (t.status === 'active' || t.status === 'trial') &&
          t.revenueCat.originalAppUserId != null,
      );
      const storeCancelNudge = activeStore?.revenueCat.originalAppUserId
        ? { originalAppUserId: activeStore.revenueCat.originalAppUserId }
        : null;

      // (8) AC-2: atomic REPOINT. The teen is in the family org at this instant
      // (never orphaned), the org-of-one is now empty. roles reset to ['learner']
      // is load-bearing — the org-of-one owner is admin+learner by default; without
      // the reset the teen would become an admin of the parent's family org.
      await tx
        .update(membership)
        .set({
          organizationId: familyOrgId,
          roles: ['learner'],
          updatedAt: sql`now()`,
        })
        .where(eq(membership.personId, teenPersonId));

      // (9) Seat the teen on the family subscription's quota. role 'child' is the
      // only schema-valid non-owner value (profile_quota_usage.role enum is
      // {owner, child}); here it means "dependent seat on the family plan", NOT a
      // guardianship child — the guardianship SEPARATION (step 11) is what marks
      // the teen non-managed. The teen's OLD org-of-one quota rows CASCADE away
      // with the subscription delete in step 10.
      await provisionProfileQuotaUsageV2(
        tx,
        familySub.id,
        teenPersonId,
        'child',
      );

      // (10) Teardown the emptied org-of-one — mirrors executeDeletionV2 MINUS the
      // person-delete (the teen SURVIVES). Person-scoped edges (any
      // supportership) are NOT torn down — they follow the surviving teen.
      //
      // [WI-1193] createIdentityGraph now writes 'adult_self_consent'
      // consent_grant rows for a self-registered adult owner (age >= 18) at
      // signup, and this accept path's self-consent-capable gate (17+, above)
      // admits real 18+ adults, not only 13-17 teens — so the accepting person
      // CAN arrive here holding their own consent_grant rows. Those rows are
      // that person's OWN GDPR/CCPA accountability record (Art 5(2)/7(1),
      // consent-status-v2.ts `getConsentAccountabilityV2`) and must survive the
      // org change, not be asserted-away as an error — so point them at the
      // family org (organization_id is the FK-RESTRICT column on consent_grant;
      // this satisfies it) rather than asserting zero rows. This is NOT the same
      // operation as deletion-v2.ts's `rehomeGrantsTx` (which migrates a DELETED
      // person's grants to the retain-tier consent_receipt) — the teen/adult
      // here SURVIVES, so their grants stay live in consent_grant, just under
      // the new organization_id.
      await tx
        .update(consentGrant)
        .set({ organizationId: familyOrgId })
        .where(eq(consentGrant.organizationId, orgOfOneId));
      // DELETE the org-of-one subscription (satisfies its payer + org RESTRICT;
      // subscription_payers + profile_quota_usage + quota_pools cascade off it).
      await tx
        .delete(subscription)
        .where(eq(subscription.organizationId, orgOfOneId));
      // DELETE the now-empty org-of-one (membership repointed away, sub gone, no
      // consent grants → no inbound RESTRICT rows remain).
      await tx.delete(organization).where(eq(organization.id, orgOfOneId));

      // (11) AC-3: NEVER a guardianship row. Supportership ONLY on explicit opt-in.
      // A bare supportership edge (visibility is governed separately by
      // support_visibility_contracts, out of scope for v1 opt-in). Guarded insert
      // keeps the append idempotent under the active-unique partial index.
      if (optInSupportership) {
        const existing = await tx.query.supportership.findFirst({
          where: and(
            eq(supportership.supporterPersonId, parentPersonId),
            eq(supportership.supporteePersonId, teenPersonId),
            isNull(supportership.revokedAt),
          ),
        });
        if (!existing) {
          await tx.insert(supportership).values({
            supporterPersonId: parentPersonId,
            supporteePersonId: teenPersonId,
          });
        }
      }

      // (12) No marker to clear — see step (6). The join is fully committed atomically.
      return {
        familyOrgId,
        teenPersonId,
        alreadyMember: false,
        storeCancelNudge,
      } satisfies AcceptFamilyJoinResult;
    })
    .then(async (result) => {
      // (13) AC-6: dispatch the durable self-cancel nudge AFTER commit (WI-885):
      // the store ref was captured pre-teardown; the nudge Inngest function does
      // the actual push/email. Non-core post-success dispatch → safeSend (a
      // dispatch failure is captured, never rolls back the committed join).
      // Capture into a const so the non-null narrowing survives into the safeSend
      // closure (TS drops narrowing on a mutable property accessed inside a nested
      // arrow).
      const nudge = result.storeCancelNudge;
      if (nudge) {
        await safeSend(
          () =>
            inngest.send({
              name: 'app/family_join.store_cancel_nudge_requested',
              data: {
                teenPersonId: result.teenPersonId,
                familyOrgId: result.familyOrgId,
                revenuecatOriginalAppUserId: nudge.originalAppUserId,
              },
            }),
          'family_join.store_cancel_nudge_requested',
          { teenPersonId: result.teenPersonId },
        );
      }
      return result;
    });
}
