import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  consentGrant,
  consentRequest,
  familyJoinInvite,
  familyJoinJourney,
  guardianship,
  login,
  person,
  supportVisibilityContracts,
  type Database,
  type FamilyJoinJourney,
} from '@eduagent/database';
import {
  CONSENT_PURPOSES,
  type AuthorizationForm,
  type ConsentPurpose,
  type CountryPolicyDecision,
  type FamilyJoinJourneyRequest,
  type FamilyJoinJourneyResult,
  type FamilyJoinSupportershipDecision,
  type VisibilityContract,
} from '@eduagent/schemas';

import { ConflictError, ForbiddenError, NotFoundError } from '../../errors';
import { inngest } from '../../inngest/client';
import { safeSend } from '../safe-non-core';
import { createPendingConsentRequest } from './consent-v2';
import { syncConsentReceipts } from './consent-receipt-v2';
import { resolveJurisdiction } from './country-policy-loader';
import { consentPersonLockKey } from './deletion-v2';
import { acceptFamilyJoin } from './family-join-v2';
import {
  attachGuardianConsentForCredentialedLearner,
  GuardianAttachmentRejectedError,
  resolveGuardianAttachmentContext,
} from './guardian-attachment';
import type { GuardianAuthorityInitiationInput } from './guardian-attachment-verifier';
import {
  initiateGuardianAuthorityVerification,
  verifyDurableGuardianAuthorityToken,
} from './guardian-attachment-verifier';
import {
  acceptLink,
  acceptLinkForSupporteeByGuardianInTransaction,
  findActiveLinkContract,
  initiateLinkInTransaction,
  writeVisibilityAuditEvent,
} from '../linking-ceremony';

const FAMILY_JOIN_UNAVAILABLE = 'Family join is not currently available.';

export type FamilyJoinPosture = {
  state: 'awaiting_guardian' | 'ready_to_join';
  jurisdiction: string;
  policyVersion: string;
  authorizationForm: AuthorizationForm;
  supportershipAuthority: 'learner' | 'guardian';
  supportershipDecision: FamilyJoinSupportershipDecision | null;
  learnerSupportershipPreference: FamilyJoinSupportershipDecision;
};

export function familyJoinEmailsMatch(
  verifiedLoginEmail: string,
  invitedEmail: string,
): boolean {
  return normalizeEmail(verifiedLoginEmail) === normalizeEmail(invitedEmail);
}

/**
 * Resolve journey authority from the current country-policy decision.
 *
 * This function is deliberately stateless: callers invoke it again on every
 * transition, so a birthday, residence move, or policy revision cannot carry
 * stale guardian authority forward.
 */
export function decideFamilyJoinPosture(
  policy: CountryPolicyDecision,
  learnerPreference: FamilyJoinSupportershipDecision,
): FamilyJoinPosture {
  const { consentDecision, authorizationForm } = policy;
  if (
    policy.launchDecision !== 'allowed' ||
    policy.legalRefreshRequired ||
    !policy.habitualResidence ||
    !policy.policyVersion ||
    !authorizationForm ||
    !consentDecision ||
    consentDecision.ageBand === 'below_minimum'
  ) {
    throw new ForbiddenError(FAMILY_JOIN_UNAVAILABLE);
  }

  if (consentDecision.ageBand === 'guardian_required_minor') {
    if (
      authorizationForm !== 'guardian' &&
      authorizationForm !== 'joint_child_guardian'
    ) {
      throw new ForbiddenError(FAMILY_JOIN_UNAVAILABLE);
    }
    return {
      state: 'awaiting_guardian',
      jurisdiction: policy.habitualResidence,
      policyVersion: policy.policyVersion,
      authorizationForm,
      supportershipAuthority: 'guardian',
      supportershipDecision: null,
      learnerSupportershipPreference: learnerPreference,
    };
  }

  if (authorizationForm !== 'self') {
    throw new ForbiddenError(FAMILY_JOIN_UNAVAILABLE);
  }
  return {
    state: 'ready_to_join',
    jurisdiction: policy.habitualResidence,
    policyVersion: policy.policyVersion,
    authorizationForm,
    supportershipAuthority: 'learner',
    supportershipDecision: learnerPreference,
    learnerSupportershipPreference: learnerPreference,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface StartFamilyJoinJourneyInput extends FamilyJoinJourneyRequest {
  callerPersonId: string;
  asOf?: Date;
}

/**
 * Bind or resume the authenticated learner's journey without moving
 * membership. The invite is atomically frozen at `bound`; possession of its
 * code is never sufficient without the persisted verified-login email match.
 */
export async function startOrResumeFamilyJoinJourney(
  db: Database,
  input: StartFamilyJoinJourneyInput,
): Promise<FamilyJoinJourneyResult> {
  const asOf = input.asOf ?? new Date();

  return db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Database;
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.token}, 0))`,
    );

    const invite = await tx.query.familyJoinInvite.findFirst({
      where: eq(familyJoinInvite.token, input.token),
    });
    if (!invite) {
      throw unavailableInvite();
    }
    if (
      invite.status !== 'pending' &&
      invite.status !== 'bound' &&
      invite.status !== 'accepted' &&
      invite.status !== 'declined' &&
      invite.status !== 'withdrawn'
    ) {
      throw unavailableInvite();
    }

    const charge = await resolveInvitedCharge(
      tx,
      input.callerPersonId,
      invite.invitedEmail,
    );

    const existing = await tx.query.familyJoinJourney.findFirst({
      where: eq(familyJoinJourney.inviteId, invite.id),
    });
    if (existing && existing.chargePersonId !== input.callerPersonId) {
      throw unavailableInvite();
    }
    if (invite.status === 'declined' || existing?.state === 'declined') {
      return { status: 'declined' };
    }
    if (invite.status === 'withdrawn' || existing?.state === 'withdrawn') {
      return { status: 'withdrawn' };
    }
    if (invite.status === 'accepted' || existing?.state === 'joined') {
      if (invite.status !== 'accepted' || existing?.state !== 'joined') {
        throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);
      }
      const visibilityContract = await loadJourneyVisibilityContract(
        tx,
        invite.inviterPersonId,
        existing,
      );
      return joinedJourneyResult(existing, visibilityContract, true, null);
    }
    if (
      !invite.tokenExpiresAt ||
      invite.tokenExpiresAt.getTime() <= asOf.getTime()
    ) {
      if (existing && existing.state !== 'joined') {
        await expireUnfinishedFamilyJoinJourney(tx, existing, asOf);
      }
      return { status: 'expired' };
    }

    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${consentPersonLockKey(
        input.callerPersonId,
      )}, 0))`,
    );

    const policy = await resolveJurisdiction(tx, {
      habitualResidence: charge.residenceJurisdiction,
      birthDate: charge.birthDate,
      residenceAssurance: reviveResidenceKnowing(charge.residenceKnowing),
      asOf,
    });
    const posture = decideFamilyJoinPosture(
      policy,
      input.supportershipDecision,
    );
    const preserveGuardianCompletion = preservesGuardianCompletion(
      existing,
      posture,
    );
    if (existing?.guardianCompletedAt && !preserveGuardianCompletion) {
      await invalidateJourneyAuthority(
        tx,
        existing,
        asOf,
        'family_join_posture_recomputed',
      );
    }
    if (!preserveGuardianCompletion) {
      await syncDestinationConsentRequests(tx, {
        chargePersonId: input.callerPersonId,
        familyOrgId: invite.familyOrgId,
        posture,
        regimeKey: policy.regimeKey,
      });
    }

    const values = resumedPosture(existing, posture, asOf);
    let journey: FamilyJoinJourney;
    if (existing) {
      const [updated] = await tx
        .update(familyJoinJourney)
        .set({ ...values, updatedAt: asOf })
        .where(eq(familyJoinJourney.id, existing.id))
        .returning();
      if (!updated) throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);
      journey = updated;
    } else {
      const activeJourney = await tx.query.familyJoinJourney.findFirst({
        where: and(
          eq(familyJoinJourney.chargePersonId, input.callerPersonId),
          inArray(familyJoinJourney.state, [
            'awaiting_guardian',
            'ready_to_join',
          ]),
        ),
        columns: { id: true },
      });
      if (activeJourney) {
        throw new ConflictError(
          'An unfinished family join already exists for this learner.',
        );
      }
      const [created] = await tx
        .insert(familyJoinJourney)
        .values({
          inviteId: invite.id,
          chargePersonId: input.callerPersonId,
          familyOrgId: invite.familyOrgId,
          ...values,
          boundAt: asOf,
          createdAt: asOf,
          updatedAt: asOf,
        })
        .returning();
      if (!created) throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);

      const bound = await tx
        .update(familyJoinInvite)
        .set({ status: 'bound', updatedAt: asOf })
        .where(
          and(
            eq(familyJoinInvite.id, invite.id),
            eq(familyJoinInvite.status, 'pending'),
            eq(familyJoinInvite.token, input.token),
            sql`${familyJoinInvite.tokenExpiresAt} > ${asOf}`,
          ),
        )
        .returning({ id: familyJoinInvite.id });
      if (bound.length !== 1) {
        throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);
      }
      journey = created;
    }

    const visibilityContract = journey.visibilityContractId
      ? await findActiveLinkContract(tx, {
          supporterPersonId: invite.inviterPersonId,
          supporteePersonId: journey.chargePersonId,
        })
      : null;
    return journeyResult(journey, visibilityContract);
  });
}

export interface InitiateFamilyJoinGuardianVerificationInput extends Omit<
  GuardianAuthorityInitiationInput,
  'chargePersonId' | 'destinationOrganizationId' | 'expectedLearnerAssentAt'
> {
  token: string;
}

export async function initiateFamilyJoinGuardianVerification(
  db: Database,
  input: InitiateFamilyJoinGuardianVerificationInput,
): Promise<{ authorityToken: string }> {
  const now = input.now ?? new Date();
  const context = await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Database;
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.token}, 0))`,
    );
    const invite = await tx.query.familyJoinInvite.findFirst({
      where: eq(familyJoinInvite.token, input.token),
    });
    if (
      !invite ||
      invite.status !== 'bound' ||
      !invite.tokenExpiresAt ||
      invite.tokenExpiresAt.getTime() <= now.getTime()
    ) {
      throw unavailableInvite();
    }
    const journey = await tx.query.familyJoinJourney.findFirst({
      where: eq(familyJoinJourney.inviteId, invite.id),
    });
    if (
      !journey ||
      journey.state !== 'awaiting_guardian' ||
      journey.supportershipAuthority !== 'guardian'
    ) {
      throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);
    }
    return {
      chargePersonId: journey.chargePersonId,
      familyOrgId: journey.familyOrgId,
      jurisdiction: journey.jurisdiction,
      policyVersion: journey.policyVersion,
      authorizationForm: journey.authorizationForm,
      learnerAssentedAt: journey.learnerAssentedAt,
    };
  });

  if (
    context.authorizationForm === 'joint_child_guardian' &&
    !context.learnerAssentedAt
  ) {
    throw new GuardianAttachmentRejectedError();
  }

  const live = await resolveGuardianAttachmentContext(db, {
    callerPersonId: input.callerPersonId,
    chargePersonId: context.chargePersonId,
    asOf: now,
    destinationOrganizationId: context.familyOrgId,
  });
  if (
    live.organizationId !== context.familyOrgId ||
    live.jurisdiction !== context.jurisdiction ||
    live.policyVersion !== context.policyVersion ||
    live.authorizationForm !== context.authorizationForm
  ) {
    throw new GuardianAttachmentRejectedError();
  }

  return initiateGuardianAuthorityVerification(db, {
    callerPersonId: input.callerPersonId,
    chargePersonId: context.chargePersonId,
    destinationOrganizationId: context.familyOrgId,
    expectedLearnerAssentAt:
      context.authorizationForm === 'joint_child_guardian'
        ? (context.learnerAssentedAt ?? undefined)
        : undefined,
    verificationHandle: input.verificationHandle,
    verifierUrl: input.verifierUrl,
    verifierKey: input.verifierKey,
    tokenSecret: input.tokenSecret,
    now,
    fetchImpl: input.fetchImpl,
  });
}

export async function completeFamilyJoinGuardianStep(
  db: Database,
  input: {
    callerPersonId: string;
    token: string;
    authorityToken: string;
    authorizeSupportership: boolean;
    tokenSecret: string;
    asOf?: Date;
  },
): Promise<FamilyJoinJourneyResult> {
  const asOf = input.asOf ?? new Date();
  return db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Database;
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.token}, 0))`,
    );
    const invite = await tx.query.familyJoinInvite.findFirst({
      where: eq(familyJoinInvite.token, input.token),
    });
    if (!invite) throw unavailableInvite();
    const journey = await tx.query.familyJoinJourney.findFirst({
      where: eq(familyJoinJourney.inviteId, invite.id),
    });
    if (!journey) throw unavailableInvite();
    if (invite.status === 'declined' || journey.state === 'declined') {
      return { status: 'declined' };
    }
    if (invite.status === 'withdrawn' || journey.state === 'withdrawn') {
      return { status: 'withdrawn' };
    }
    if (
      invite.status !== 'bound' ||
      !invite.tokenExpiresAt ||
      invite.tokenExpiresAt.getTime() <= asOf.getTime() ||
      journey.supportershipAuthority !== 'guardian' ||
      journey.authorizationForm === 'self'
    ) {
      throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);
    }

    const authority = await verifyDurableGuardianAuthorityToken(
      tx,
      input.authorityToken,
      input.tokenSecret,
      asOf,
    );
    if (
      !authority ||
      authority.guardianPersonId !== input.callerPersonId ||
      authority.chargePersonId !== journey.chargePersonId ||
      authority.organizationId !== journey.familyOrgId ||
      authority.jurisdiction !== journey.jurisdiction ||
      authority.policyVersion !== journey.policyVersion ||
      (journey.authorizationForm === 'joint_child_guardian' &&
        authority.learnerAssentAt?.getTime() !==
          journey.learnerAssentedAt?.getTime())
    ) {
      throw new GuardianAttachmentRejectedError();
    }

    const decision = input.authorizeSupportership ? 'accept' : 'decline';
    if (journey.guardianCompletedAt) {
      if (
        journey.guardianPersonId !== input.callerPersonId ||
        journey.guardianAuthorityRedemptionId !== authority.redemptionId ||
        journey.supportershipDecision !== decision
      ) {
        throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);
      }
      const visibilityContract = journey.visibilityContractId
        ? await findActiveLinkContract(tx, {
            supporterPersonId: invite.inviterPersonId,
            supporteePersonId: journey.chargePersonId,
          })
        : null;
      return journeyResult(journey, visibilityContract);
    }
    if (journey.state !== 'awaiting_guardian') {
      throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);
    }

    await attachGuardianConsentForCredentialedLearner(tx, {
      callerPersonId: input.callerPersonId,
      chargePersonId: journey.chargePersonId,
      destinationOrganizationId: journey.familyOrgId,
      authority,
      asOf,
    });

    let visibilityContract: VisibilityContract | null = null;
    if (input.authorizeSupportership) {
      visibilityContract = await initiateLinkInTransaction(tx, {
        supporterPersonId: invite.inviterPersonId,
        supporteePersonId: journey.chargePersonId,
        relation: 'parent',
        managedTier: false,
        managedTierActive: false,
        initiatedByPersonId: input.callerPersonId,
        now: asOf,
      });
      visibilityContract = await acceptLinkForSupporteeByGuardianInTransaction(
        tx,
        {
          contractId: visibilityContract.id,
          guardianPersonId: input.callerPersonId,
          supporteePersonId: journey.chargePersonId,
          authorityRedemptionId: authority.redemptionId,
          now: asOf,
        },
      );
    }

    const [updated] = await tx
      .update(familyJoinJourney)
      .set({
        state: 'ready_to_join',
        supportershipDecision: decision,
        guardianPersonId: input.callerPersonId,
        guardianAuthorityRedemptionId: authority.redemptionId,
        visibilityContractId: visibilityContract?.id ?? null,
        guardianCompletedAt: asOf,
        updatedAt: asOf,
      })
      .where(
        and(
          eq(familyJoinJourney.id, journey.id),
          eq(familyJoinJourney.state, 'awaiting_guardian'),
        ),
      )
      .returning();
    if (!updated) throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);
    return journeyResult(updated, visibilityContract);
  });
}

/**
 * Commit the membership move only after the current legal posture and the
 * independently authorized visibility decision have both been revalidated.
 * The retained invite token is only a continuation locator: the authenticated
 * learner Person and their verified Login email are checked again under the
 * same transaction that moves membership and terminalizes the journey.
 */
export async function finalizeFamilyJoinJourney(
  db: Database,
  input: { callerPersonId: string; token: string; asOf?: Date },
): Promise<FamilyJoinJourneyResult> {
  const asOf = input.asOf ?? new Date();
  const result = await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Database;
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.token}, 0))`,
    );

    const invite = await tx.query.familyJoinInvite.findFirst({
      where: eq(familyJoinInvite.token, input.token),
    });
    if (!invite) throw unavailableInvite();
    const charge = await resolveInvitedCharge(
      tx,
      input.callerPersonId,
      invite.invitedEmail,
    );
    const journey = await tx.query.familyJoinJourney.findFirst({
      where: eq(familyJoinJourney.inviteId, invite.id),
    });
    if (!journey || journey.chargePersonId !== input.callerPersonId) {
      throw unavailableInvite();
    }
    if (invite.status === 'declined' || journey.state === 'declined') {
      return { status: 'declined' } as const;
    }
    if (invite.status === 'withdrawn' || journey.state === 'withdrawn') {
      return { status: 'withdrawn' } as const;
    }
    if (invite.status === 'accepted' || journey.state === 'joined') {
      if (invite.status !== 'accepted' || journey.state !== 'joined') {
        throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);
      }
      const visibilityContract = await loadJourneyVisibilityContract(
        tx,
        invite.inviterPersonId,
        journey,
      );
      return joinedJourneyResult(journey, visibilityContract, true, null);
    }
    if (
      !invite.tokenExpiresAt ||
      invite.tokenExpiresAt.getTime() <= asOf.getTime()
    ) {
      if (journey.state !== 'joined') {
        await expireUnfinishedFamilyJoinJourney(tx, journey, asOf);
      }
      return { status: 'expired' } as const;
    }
    if (invite.status !== 'bound' || journey.state !== 'ready_to_join') {
      throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);
    }

    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${consentPersonLockKey(
        input.callerPersonId,
      )}, 0))`,
    );
    const policy = await resolveJurisdiction(tx, {
      habitualResidence: charge.residenceJurisdiction,
      birthDate: charge.birthDate,
      residenceAssurance: reviveResidenceKnowing(charge.residenceKnowing),
      asOf,
    });
    if (
      !journey.learnerSupportershipPreference ||
      !journey.supportershipDecision
    ) {
      throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);
    }
    const livePosture = decideFamilyJoinPosture(
      policy,
      journey.learnerSupportershipPreference as FamilyJoinSupportershipDecision,
    );
    assertCurrentJourneyPosture(journey, livePosture);

    let visibilityContract: VisibilityContract | null = null;
    let expectedGuardianPersonId: string | null = null;
    if (journey.supportershipAuthority === 'guardian') {
      if (
        !journey.guardianCompletedAt ||
        !journey.guardianPersonId ||
        !journey.guardianAuthorityRedemptionId
      ) {
        throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);
      }
      expectedGuardianPersonId = journey.guardianPersonId;
      await assertCurrentGuardianConsentSet(tx, {
        chargePersonId: journey.chargePersonId,
        familyOrgId: journey.familyOrgId,
        guardianPersonId: journey.guardianPersonId,
        journey,
        policy,
      });
      if (journey.supportershipDecision === 'accept') {
        visibilityContract = await loadJourneyVisibilityContract(
          tx,
          invite.inviterPersonId,
          journey,
        );
        if (!visibilityContract?.supporteeAcceptedAt) {
          throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);
        }
      } else if (journey.visibilityContractId) {
        throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);
      }
    } else if (journey.supportershipAuthority === 'learner') {
      // A guardian relationship attached earlier in this same journey remains
      // an identity fact, but it no longer authorizes consent or visibility.
      // Passing its exact Person only permits that known edge through the
      // membership precondition; all decisions below are freshly learner-made.
      expectedGuardianPersonId = journey.guardianPersonId;
      await writeDestinationSelfConsentSet(tx, {
        chargePersonId: journey.chargePersonId,
        familyOrgId: journey.familyOrgId,
        journey,
        asOf,
      });
      if (journey.supportershipDecision === 'accept') {
        visibilityContract = await initiateLinkInTransaction(tx, {
          supporterPersonId: invite.inviterPersonId,
          supporteePersonId: journey.chargePersonId,
          relation: 'parent',
          managedTier: false,
          managedTierActive: false,
          initiatedByPersonId: journey.chargePersonId,
          now: asOf,
        });
        visibilityContract = await acceptLink(tx, visibilityContract.id, {
          actorPersonId: journey.chargePersonId,
          audience: 'supportee',
          contractVersion: visibilityContract.contractVersion,
          now: asOf,
        });
      } else if (journey.visibilityContractId) {
        throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);
      }
    } else {
      throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);
    }

    const accepted = await acceptFamilyJoin(tx, {
      teenPersonId: journey.chargePersonId,
      inviteId: invite.id,
      inviteToken: input.token,
      familyOrgId: journey.familyOrgId,
      parentPersonId: invite.inviterPersonId,
      optInSupportership: journey.supportershipDecision === 'accept',
      journeyContext: {
        expectedGuardianPersonId,
        visibilityContract,
        archiveSourceConsentGrants: true,
        deferStoreCancelNudge: true,
      },
    });

    const [updated] = await tx
      .update(familyJoinJourney)
      .set({
        state: 'joined',
        visibilityContractId: visibilityContract?.id ?? null,
        joinedAt: asOf,
        updatedAt: asOf,
      })
      .where(
        and(
          eq(familyJoinJourney.id, journey.id),
          eq(familyJoinJourney.state, 'ready_to_join'),
        ),
      )
      .returning();
    if (!updated) throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);
    return joinedJourneyResult(
      updated,
      accepted.visibilityContract,
      accepted.alreadyMember,
      accepted.storeCancelNudge,
    );
  });

  if (result.status === 'joined' && result.storeCancelNudge) {
    const nudge = result.storeCancelNudge;
    await safeSend(
      () =>
        inngest.send({
          name: 'app/family_join.store_cancel_nudge_requested',
          data: {
            teenPersonId: input.callerPersonId,
            familyOrgId: result.familyOrgId,
            revenuecatOriginalAppUserId: nudge.originalAppUserId,
          },
        }),
      'family_join.store_cancel_nudge_requested',
      { teenPersonId: input.callerPersonId },
    );
  }
  return result;
}

export async function declineFamilyJoinJourney(
  db: Database,
  input: { callerPersonId: string; token: string; asOf?: Date },
): Promise<FamilyJoinJourneyResult> {
  const asOf = input.asOf ?? new Date();
  return db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Database;
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.token}, 0))`,
    );
    const invite = await tx.query.familyJoinInvite.findFirst({
      where: eq(familyJoinInvite.token, input.token),
    });
    if (!invite) throw unavailableInvite();
    await resolveInvitedCharge(tx, input.callerPersonId, invite.invitedEmail);

    const existing = await tx.query.familyJoinJourney.findFirst({
      where: eq(familyJoinJourney.inviteId, invite.id),
    });
    if (existing && existing.chargePersonId !== input.callerPersonId) {
      throw unavailableInvite();
    }
    if (invite.status === 'withdrawn' || existing?.state === 'withdrawn') {
      return { status: 'withdrawn' };
    }
    if (invite.status === 'declined' || existing?.state === 'declined') {
      return { status: 'declined' };
    }
    if (
      !invite.tokenExpiresAt ||
      invite.tokenExpiresAt.getTime() <= asOf.getTime()
    ) {
      if (existing && existing.state !== 'joined') {
        await expireUnfinishedFamilyJoinJourney(tx, existing, asOf);
      }
      return { status: 'expired' };
    }
    if (
      (invite.status !== 'pending' && invite.status !== 'bound') ||
      existing?.state === 'joined'
    ) {
      throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);
    }

    const updatedInvite = await tx
      .update(familyJoinInvite)
      .set({ status: 'declined', updatedAt: asOf })
      .where(
        and(
          eq(familyJoinInvite.id, invite.id),
          eq(familyJoinInvite.token, input.token),
          inArray(familyJoinInvite.status, ['pending', 'bound']),
        ),
      )
      .returning({ id: familyJoinInvite.id });
    if (updatedInvite.length !== 1) {
      throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);
    }
    if (existing) {
      await retireFamilyJoinArtifacts(
        tx,
        existing,
        asOf,
        'family_join_declined',
      );
      await tx
        .update(familyJoinJourney)
        .set({ state: 'declined', declinedAt: asOf, updatedAt: asOf })
        .where(eq(familyJoinJourney.id, existing.id));
      await clearDestinationConsentRequests(
        tx,
        existing.chargePersonId,
        existing.familyOrgId,
      );
    }
    return { status: 'declined' };
  });
}

export async function withdrawFamilyJoinJourney(
  db: Database,
  input: { callerPersonId: string; inviteId: string; asOf?: Date },
): Promise<FamilyJoinJourneyResult> {
  const asOf = input.asOf ?? new Date();
  return db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Database;
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.inviteId}, 0))`,
    );
    const invite = await tx.query.familyJoinInvite.findFirst({
      where: eq(familyJoinInvite.id, input.inviteId),
    });
    if (!invite) throw unavailableInvite();
    if (invite.inviterPersonId !== input.callerPersonId) {
      throw new ForbiddenError(FAMILY_JOIN_UNAVAILABLE);
    }
    if (invite.status === 'withdrawn') return { status: 'withdrawn' };
    if (invite.status !== 'pending' && invite.status !== 'bound') {
      throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);
    }

    const existing = await tx.query.familyJoinJourney.findFirst({
      where: eq(familyJoinJourney.inviteId, invite.id),
    });
    if (existing?.state === 'joined' || existing?.state === 'declined') {
      throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);
    }
    const updatedInvite = await tx
      .update(familyJoinInvite)
      .set({ status: 'withdrawn', updatedAt: asOf })
      .where(
        and(
          eq(familyJoinInvite.id, invite.id),
          inArray(familyJoinInvite.status, ['pending', 'bound']),
        ),
      )
      .returning({ id: familyJoinInvite.id });
    if (updatedInvite.length !== 1) {
      throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);
    }
    if (existing) {
      await retireFamilyJoinArtifacts(
        tx,
        existing,
        asOf,
        'family_join_withdrawn',
      );
      await tx
        .update(familyJoinJourney)
        .set({ state: 'withdrawn', withdrawnAt: asOf, updatedAt: asOf })
        .where(eq(familyJoinJourney.id, existing.id));
      await clearDestinationConsentRequests(
        tx,
        existing.chargePersonId,
        existing.familyOrgId,
      );
    }
    return { status: 'withdrawn' };
  });
}

async function resolveInvitedCharge(
  db: Database,
  callerPersonId: string,
  invitedEmail: string,
) {
  // This helper also runs on a node-postgres transaction client. Keep its
  // reads sequential: concurrent client.query calls are deprecated in pg 8
  // and rejected in pg 9.
  const loginRow = await db.query.login.findFirst({
    where: eq(login.personId, callerPersonId),
  });
  const charge = await db.query.person.findFirst({
    where: eq(person.id, callerPersonId),
    columns: {
      id: true,
      birthDate: true,
      residenceJurisdiction: true,
      residenceKnowing: true,
      loginId: true,
    },
  });
  if (
    !loginRow ||
    !charge ||
    charge.loginId !== loginRow.id ||
    !familyJoinEmailsMatch(loginRow.email, invitedEmail)
  ) {
    throw unavailableInvite();
  }
  return charge;
}

async function syncDestinationConsentRequests(
  db: Database,
  input: {
    chargePersonId: string;
    familyOrgId: string;
    posture: FamilyJoinPosture;
    regimeKey: string | null;
  },
): Promise<void> {
  // A family-join request set is preparatory evidence for the destination
  // organization only. Re-evaluation may change the lawful basis or make the
  // learner self-consent-capable, so discard only unresolved rows before
  // rebuilding the live posture. Approved/denied history remains immutable.
  await clearDestinationConsentRequests(
    db,
    input.chargePersonId,
    input.familyOrgId,
  );

  if (input.posture.state !== 'awaiting_guardian') return;
  const consentType =
    input.regimeKey === 'US_COPPA'
      ? ('COPPA' as const)
      : input.regimeKey?.startsWith('EU_') || input.regimeKey === 'UK_GDPR'
        ? ('GDPR' as const)
        : null;
  if (!consentType) throw new ForbiddenError(FAMILY_JOIN_UNAVAILABLE);
  await createPendingConsentRequest(
    db,
    input.chargePersonId,
    input.familyOrgId,
    consentType,
  );
}

async function clearDestinationConsentRequests(
  db: Database,
  chargePersonId: string,
  familyOrgId: string,
): Promise<void> {
  await db
    .delete(consentRequest)
    .where(
      and(
        eq(consentRequest.chargePersonId, chargePersonId),
        eq(consentRequest.organizationId, familyOrgId),
        inArray(consentRequest.status, ['pending', 'requested']),
      ),
    );
}

function resumedPosture(
  existing: FamilyJoinJourney | undefined,
  live: FamilyJoinPosture,
  asOf: Date,
) {
  const preserveGuardianCompletion = preservesGuardianCompletion(
    existing,
    live,
  );
  const retainGuardianRelationshipOnly =
    existing?.guardianCompletedAt != null &&
    live.supportershipAuthority === 'learner';

  return {
    state: preserveGuardianCompletion ? ('ready_to_join' as const) : live.state,
    jurisdiction: live.jurisdiction,
    policyVersion: live.policyVersion,
    authorizationForm: live.authorizationForm,
    learnerAssentedAt: asOf,
    learnerSupportershipPreference: live.learnerSupportershipPreference,
    supportershipAuthority: live.supportershipAuthority,
    supportershipDecision: preserveGuardianCompletion
      ? existing.supportershipDecision
      : live.supportershipDecision,
    guardianPersonId:
      preserveGuardianCompletion || retainGuardianRelationshipOnly
        ? existing.guardianPersonId
        : null,
    guardianAuthorityRedemptionId: preserveGuardianCompletion
      ? existing.guardianAuthorityRedemptionId
      : null,
    guardianCompletedAt: preserveGuardianCompletion
      ? existing.guardianCompletedAt
      : null,
    visibilityContractId: preserveGuardianCompletion
      ? existing.visibilityContractId
      : null,
  };
}

function preservesGuardianCompletion(
  existing: FamilyJoinJourney | undefined,
  live: FamilyJoinPosture,
): existing is FamilyJoinJourney {
  return (
    existing?.guardianCompletedAt != null &&
    existing.supportershipDecision != null &&
    live.supportershipAuthority === 'guardian' &&
    existing.jurisdiction === live.jurisdiction &&
    existing.policyVersion === live.policyVersion &&
    existing.authorizationForm === live.authorizationForm
  );
}

type JourneyAuthorityInvalidationReason =
  | 'family_join_posture_recomputed'
  | 'family_join_declined'
  | 'family_join_withdrawn'
  | 'family_join_expired';

async function retireFamilyJoinArtifacts(
  db: Database,
  journey: FamilyJoinJourney,
  asOf: Date,
  reason:
    | 'family_join_declined'
    | 'family_join_withdrawn'
    | 'family_join_expired',
): Promise<void> {
  await invalidateJourneyAuthority(db, journey, asOf, reason);
  await clearDestinationConsentRequests(
    db,
    journey.chargePersonId,
    journey.familyOrgId,
  );
}

async function expireUnfinishedFamilyJoinJourney(
  db: Database,
  journey: FamilyJoinJourney,
  asOf: Date,
): Promise<void> {
  await retireFamilyJoinArtifacts(db, journey, asOf, 'family_join_expired');
  await db
    .delete(familyJoinJourney)
    .where(
      and(
        eq(familyJoinJourney.id, journey.id),
        inArray(familyJoinJourney.state, [
          'awaiting_guardian',
          'ready_to_join',
        ]),
      ),
    );
}

async function invalidateJourneyAuthority(
  db: Database,
  journey: FamilyJoinJourney,
  asOf: Date,
  reason: JourneyAuthorityInvalidationReason,
): Promise<void> {
  // Retire only the grants linked from this journey's destination request set.
  // Guardian identity alone is too broad: the same guardian may have recorded
  // a newer, independent re-consent after this journey completed its step.
  const linkedRequests = journey.guardianPersonId
    ? await db.query.consentRequest.findMany({
        where: and(
          eq(consentRequest.chargePersonId, journey.chargePersonId),
          eq(consentRequest.organizationId, journey.familyOrgId),
          eq(consentRequest.status, 'approved'),
          eq(consentRequest.guardianPersonId, journey.guardianPersonId),
        ),
        columns: { consentGrantId: true },
      })
    : [];
  const guardianGrantIds = [
    ...new Set(
      linkedRequests.flatMap((request) =>
        request.consentGrantId ? [request.consentGrantId] : [],
      ),
    ),
  ];
  if (guardianGrantIds.length > 0) {
    const withdrawn = await db
      .update(consentGrant)
      .set({ withdrawnAt: asOf, priorValue: true })
      .where(
        and(
          inArray(consentGrant.id, guardianGrantIds),
          isNull(consentGrant.withdrawnAt),
        ),
      )
      .returning();
    // [WI-2929] Mirror the withdrawal onto the durable receipts, matching the
    // two other withdrawal paths (stampWithdrawal, withdrawAdultSelfConsentV2)
    // so no receipt asserts a live consent for a withdrawn purpose. Adjacent to
    // AC-1 rather than required by it — AC-1 is about grant time — but leaving
    // one of three withdrawal paths unmirrored would be an inconsistency this
    // change itself created.
    await syncConsentReceipts(db, withdrawn);
  }

  if (!journey.visibilityContractId) return;
  const contract = await db.query.supportVisibilityContracts.findFirst({
    where: eq(supportVisibilityContracts.id, journey.visibilityContractId),
  });
  if (!contract) return;
  const [invalidated] = await db
    .update(supportVisibilityContracts)
    .set({
      status: 'revoked',
      supporterAcceptedAt: null,
      supporteeAcceptedAt: null,
      updatedAt: asOf,
    })
    .where(
      and(
        eq(supportVisibilityContracts.id, contract.id),
        eq(
          supportVisibilityContracts.contractVersion,
          contract.contractVersion,
        ),
        inArray(supportVisibilityContracts.status, [
          'pending',
          'accepted',
          'restamped',
        ]),
      ),
    )
    .returning({ id: supportVisibilityContracts.id });
  if (!invalidated) return;
  await writeVisibilityAuditEvent(db, {
    supportershipId: contract.supportershipId,
    contractId: contract.id,
    actorPersonId: journey.chargePersonId,
    eventType: 'authority_invalidated',
    payload: {
      reason,
      invalidatedAt: asOf.toISOString(),
      priorGuardianPersonId: journey.guardianPersonId,
      priorPolicyVersion: journey.policyVersion,
      priorAuthorizationForm: journey.authorizationForm,
    },
  });
}

function assertCurrentJourneyPosture(
  journey: FamilyJoinJourney,
  live: FamilyJoinPosture,
): void {
  const sharedPostureMatches =
    journey.jurisdiction === live.jurisdiction &&
    journey.policyVersion === live.policyVersion &&
    journey.authorizationForm === live.authorizationForm &&
    journey.supportershipAuthority === live.supportershipAuthority;
  const decisionMatches =
    live.supportershipAuthority === 'guardian'
      ? live.state === 'awaiting_guardian' &&
        journey.supportershipDecision !== null
      : live.state === 'ready_to_join' &&
        journey.supportershipDecision === live.supportershipDecision;
  if (!sharedPostureMatches || !decisionMatches) {
    throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);
  }
}

async function assertCurrentGuardianConsentSet(
  db: Database,
  input: {
    chargePersonId: string;
    familyOrgId: string;
    guardianPersonId: string;
    journey: FamilyJoinJourney;
    policy: CountryPolicyDecision;
  },
): Promise<void> {
  const lawfulBasis = guardianLawfulBasis(input.policy);
  const currentGuardian = await db.query.guardianship.findFirst({
    where: and(
      eq(guardianship.guardianPersonId, input.guardianPersonId),
      eq(guardianship.chargePersonId, input.chargePersonId),
      isNull(guardianship.revokedAt),
    ),
    columns: { id: true },
  });
  if (!currentGuardian) throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);

  const grants = await db
    .select()
    .from(consentGrant)
    .where(
      and(
        eq(consentGrant.chargePersonId, input.chargePersonId),
        eq(consentGrant.organizationId, input.familyOrgId),
      ),
    )
    .orderBy(desc(consentGrant.grantedAt), desc(consentGrant.id));
  const currentByPurpose = new Map<ConsentPurpose, (typeof grants)[number]>();
  for (const grant of grants) {
    if (
      CONSENT_PURPOSES.includes(grant.purpose as ConsentPurpose) &&
      !currentByPurpose.has(grant.purpose as ConsentPurpose)
    ) {
      currentByPurpose.set(grant.purpose as ConsentPurpose, grant);
    }
  }
  const completeAndCurrent = CONSENT_PURPOSES.every((purpose) => {
    const grant = currentByPurpose.get(purpose);
    const audit = auditRecord(grant?.auditFact);
    return (
      grant?.granted === true &&
      grant.withdrawnAt === null &&
      grant.lawfulBasis === lawfulBasis &&
      grant.snapshotJurisdictionAtGrant === input.journey.jurisdiction &&
      audit.guardianPersonId === input.guardianPersonId &&
      audit.policyVersion === input.journey.policyVersion &&
      audit.organizationId === input.familyOrgId
    );
  });
  if (!completeAndCurrent) throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);
}

function guardianLawfulBasis(policy: CountryPolicyDecision): string {
  if (policy.regimeKey === 'US_COPPA') return 'coppa_parental_consent';
  if (policy.regimeKey === 'UK_GDPR' || policy.regimeKey?.startsWith('EU_')) {
    return 'gdpr_parental_consent';
  }
  throw new ForbiddenError(FAMILY_JOIN_UNAVAILABLE);
}

async function writeDestinationSelfConsentSet(
  db: Database,
  input: {
    chargePersonId: string;
    familyOrgId: string;
    journey: FamilyJoinJourney;
    asOf: Date;
  },
): Promise<void> {
  const grants = await db
    .insert(consentGrant)
    .values(
      CONSENT_PURPOSES.map((purpose) => ({
        chargePersonId: input.chargePersonId,
        organizationId: input.familyOrgId,
        purpose,
        lawfulBasis: 'art6_1_a',
        granted: true,
        grantedAt: input.asOf,
        priorValue: null,
        snapshotJurisdictionAtGrant: input.journey.jurisdiction,
        // [WI-2929] The journey's policy version in the column no withdrawal
        // path writes. Retained in `audit_fact` too — assertDestinationConsent
        // compares `audit.policyVersion` — but the JSONB copy is destroyable.
        policyVersion: input.journey.policyVersion,
        auditFact: {
          source: 'family_join_destination_self_consent',
          policyVersion: input.journey.policyVersion,
          jurisdiction: input.journey.jurisdiction,
          organizationId: input.familyOrgId,
          authorizationForm: 'self',
          destinationProcessingAssentAt:
            input.journey.learnerAssentedAt?.toISOString() ?? null,
        },
      })),
    )
    .returning();
  // [WI-2929] Grant-time receipt — this is a production grant writer like any
  // other. `db` here is the journey transaction handle, so the receipt and the
  // grant commit together.
  await syncConsentReceipts(db, grants);
}

async function loadJourneyVisibilityContract(
  db: Database,
  supporterPersonId: string,
  journey: FamilyJoinJourney,
): Promise<VisibilityContract | null> {
  if (!journey.visibilityContractId) return null;
  const contract = await findActiveLinkContract(db, {
    supporterPersonId,
    supporteePersonId: journey.chargePersonId,
  });
  if (contract && contract.id !== journey.visibilityContractId) {
    throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);
  }
  return contract;
}

function joinedJourneyResult(
  journey: FamilyJoinJourney,
  visibilityContract: VisibilityContract | null,
  alreadyMember: boolean,
  storeCancelNudge: { originalAppUserId: string } | null,
): FamilyJoinJourneyResult {
  if (
    journey.state !== 'joined' ||
    (journey.supportershipAuthority !== 'learner' &&
      journey.supportershipAuthority !== 'guardian') ||
    (journey.supportershipDecision !== 'accept' &&
      journey.supportershipDecision !== 'decline')
  ) {
    throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);
  }
  return {
    status: 'joined',
    familyOrgId: journey.familyOrgId,
    alreadyMember,
    storeCancelNudge,
    supportershipAuthority: journey.supportershipAuthority,
    supportershipDecision: journey.supportershipDecision,
    visibilityContract,
  };
}

function auditRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function journeyResult(
  journey: FamilyJoinJourney,
  visibilityContract: VisibilityContract | null = null,
): FamilyJoinJourneyResult {
  if (journey.state === 'awaiting_guardian') {
    return {
      status: 'awaiting_guardian',
      familyOrgId: journey.familyOrgId,
      authorizationForm: journey.authorizationForm as Exclude<
        AuthorizationForm,
        'self'
      >,
      supportershipAuthority: 'guardian',
      supportershipDecision: 'pending',
      visibilityContract: null,
    };
  }
  if (journey.state === 'ready_to_join' && journey.supportershipDecision) {
    const supportershipDecision =
      journey.supportershipDecision as FamilyJoinSupportershipDecision;
    if (
      journey.supportershipAuthority === 'learner' &&
      journey.authorizationForm === 'self'
    ) {
      return {
        status: 'ready_to_join',
        familyOrgId: journey.familyOrgId,
        authorizationForm: 'self',
        supportershipAuthority: 'learner',
        supportershipDecision,
        visibilityContract,
      };
    }
    if (
      journey.supportershipAuthority === 'guardian' &&
      journey.authorizationForm !== 'self'
    ) {
      return {
        status: 'ready_to_join',
        familyOrgId: journey.familyOrgId,
        authorizationForm: journey.authorizationForm as Exclude<
          AuthorizationForm,
          'self'
        >,
        supportershipAuthority: 'guardian',
        supportershipDecision,
        visibilityContract,
      };
    }
  }
  if (journey.state === 'declined') return { status: 'declined' };
  if (journey.state === 'withdrawn') return { status: 'withdrawn' };
  throw new ConflictError(FAMILY_JOIN_UNAVAILABLE);
}

function reviveResidenceKnowing(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || !('assertedAt' in value)) {
    return value;
  }
  const raw = value as Record<string, unknown>;
  return {
    ...raw,
    assertedAt:
      raw.assertedAt instanceof Date
        ? raw.assertedAt
        : new Date(String(raw.assertedAt)),
  };
}

function unavailableInvite(): NotFoundError {
  return new NotFoundError('Family invite not found or unavailable.');
}
