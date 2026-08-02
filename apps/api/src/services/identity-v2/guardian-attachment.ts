import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  consentGrant,
  consentRequest,
  guardianship,
  membership,
  organization,
  person,
  type Database,
} from '@eduagent/database';
import { computeAgeBracketFromDate, CONSENT_PURPOSES } from '@eduagent/schemas';
import { calculateAgeFromParts } from '../age-utils';
import { resolveJurisdiction } from './country-policy-loader';
import { consentPersonLockKey } from './deletion-v2';
import type { GuardianAuthorityAssertion } from './guardian-attachment-token';
import { GUARDIAN_AUTHORITY_CLOCK_SKEW_MS } from './guardian-attachment-token';

export class GuardianAttachmentRejectedError extends Error {
  constructor() {
    super('Guardian authority is not valid for this learner.');
    this.name = 'GuardianAttachmentRejectedError';
  }
}

export interface GuardianAttachmentInput {
  /** Server-resolved from the authenticated Login, never X-Profile-Id. */
  callerPersonId: string;
  chargePersonId: string;
  /** Verified, signed VPC assertion; never caller-authored facts. */
  authority: GuardianAuthorityAssertion;
  /** Server-derived destination override for an unfinished family join. */
  destinationOrganizationId?: string;
  asOf?: Date;
  /** Transaction-failure seam used by integration tests only. */
  afterGuardianWrite?: () => void | Promise<void>;
}

export interface GuardianAttachmentResult {
  status: 'attached' | 'already_satisfied';
  consentSatisfied: true;
}

function birthDateParts(
  birthDate: string,
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) return null;
  const [, year, month, day] = match;
  const parsed = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  };
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  return Number.isNaN(date.getTime()) ? null : parsed;
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

function hasVerifiedAdultAge(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    (value as Record<string, unknown>).method === 'verified_credential'
  );
}

function auditRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function hasCompletePurposeSet(rows: readonly { purpose: string }[]): boolean {
  return (
    rows.length === CONSENT_PURPOSES.length &&
    CONSENT_PURPOSES.every((purpose) =>
      rows.some((row) => row.purpose === purpose),
    )
  );
}

type AttachmentContext = Awaited<
  ReturnType<typeof resolveGuardianAttachmentContext>
>;

/**
 * Shared, live eligibility read for both verifier initiation and redemption.
 * Redemption repeats it under the canonical consent lock, so a provider
 * round-trip can never freeze age, residence, membership or policy authority.
 */
export async function resolveGuardianAttachmentContext(
  db: Database,
  input: {
    callerPersonId: string;
    chargePersonId: string;
    asOf: Date;
    /** Omitted on the generic path; never populated from a client request. */
    destinationOrganizationId?: string;
  },
) {
  const [guardian, charge, chargeMemberships, activeEdges, destination] =
    await Promise.all([
      db.query.person.findFirst({
        where: eq(person.id, input.callerPersonId),
        columns: {
          id: true,
          birthDate: true,
          loginId: true,
          ageKnowing: true,
        },
      }),
      db.query.person.findFirst({
        where: eq(person.id, input.chargePersonId),
        columns: {
          id: true,
          birthDate: true,
          residenceJurisdiction: true,
          residenceKnowing: true,
          loginId: true,
        },
      }),
      db.query.membership.findMany({
        where: eq(membership.personId, input.chargePersonId),
        columns: { organizationId: true },
      }),
      db.query.guardianship.findMany({
        where: and(
          eq(guardianship.chargePersonId, input.chargePersonId),
          isNull(guardianship.revokedAt),
        ),
        columns: {
          id: true,
          guardianPersonId: true,
          qualification: true,
        },
      }),
      input.destinationOrganizationId
        ? db.query.organization.findFirst({
            where: eq(organization.id, input.destinationOrganizationId),
            columns: { id: true },
          })
        : Promise.resolve(undefined),
    ]);

  const guardianBirth = guardian ? birthDateParts(guardian.birthDate) : null;
  const chargeBirth = charge ? birthDateParts(charge.birthDate) : null;
  const guardianBracket = guardianBirth
    ? computeAgeBracketFromDate(
        guardianBirth.year,
        guardianBirth.month,
        guardianBirth.day,
      )
    : null;
  const chargeBracket = chargeBirth
    ? computeAgeBracketFromDate(
        chargeBirth.year,
        chargeBirth.month,
        chargeBirth.day,
      )
    : null;
  const chargeMembership = chargeMemberships[0];

  if (
    !guardian ||
    guardianBracket !== 'adult' ||
    !guardian.loginId ||
    !hasVerifiedAdultAge(guardian.ageKnowing) ||
    !charge ||
    !chargeBirth ||
    chargeBracket !== 'adolescent' ||
    !charge.loginId ||
    chargeMemberships.length !== 1 ||
    !chargeMembership ||
    (input.destinationOrganizationId !== undefined && !destination) ||
    activeEdges.length > 1 ||
    (activeEdges[0] && activeEdges[0].guardianPersonId !== input.callerPersonId)
  ) {
    throw new GuardianAttachmentRejectedError();
  }

  const policy = await resolveJurisdiction(db, {
    habitualResidence: charge.residenceJurisdiction,
    birthDate: charge.birthDate,
    residenceAssurance: reviveResidenceKnowing(charge.residenceKnowing),
    asOf: input.asOf,
  });
  if (
    policy.launchDecision !== 'allowed' ||
    policy.consentDecision?.ageBand !== 'guardian_required_minor' ||
    policy.consentDecision.consentStatus !== 'REQUIRED_PENDING' ||
    !policy.habitualResidence ||
    !policy.policyVersion ||
    !policy.authorizationForm
  ) {
    throw new GuardianAttachmentRejectedError();
  }

  return {
    organizationId:
      input.destinationOrganizationId ?? chargeMembership.organizationId,
    jurisdiction: policy.habitualResidence,
    policyVersion: policy.policyVersion,
    authorizationForm: policy.authorizationForm,
    requiredAssuranceLevel: policy.consentDecision.assuranceLevel,
    chargeAge: calculateAgeFromParts(
      chargeBirth.year,
      chargeBirth.month,
      chargeBirth.day,
    ),
    activeEdges,
    policy,
  };
}

/**
 * Distinct authenticated-adult ceremony for R13 credentialed learners.
 *
 * This deliberately does not change ordinary email consent approval: an invite
 * or consent email still confers no Guardianship. Only a current, approved VPC
 * assertion bound to this authenticated adult reaches this transaction.
 */
export async function attachGuardianConsentForCredentialedLearner(
  db: Database,
  input: GuardianAttachmentInput,
): Promise<GuardianAttachmentResult> {
  const asOf = input.asOf ?? new Date();
  const { authority } = input;

  // Cheap binding checks before the transaction. The same facts are immutable
  // within the signed assertion, then current policy/person state is re-read
  // under the charge lock below.
  if (
    authority.decision !== 'approved' ||
    authority.guardianPersonId !== input.callerPersonId ||
    authority.chargePersonId !== input.chargePersonId ||
    authority.guardianPersonId === authority.chargePersonId ||
    asOf.getTime() <
      authority.notBefore.getTime() - GUARDIAN_AUTHORITY_CLOCK_SKEW_MS ||
    asOf.getTime() >=
      authority.expiresAt.getTime() + GUARDIAN_AUTHORITY_CLOCK_SKEW_MS
  ) {
    throw new GuardianAttachmentRejectedError();
  }

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${consentPersonLockKey(
        input.chargePersonId,
      )}, 0))`,
    );

    const context: AttachmentContext = await resolveGuardianAttachmentContext(
      tx as unknown as Database,
      {
        callerPersonId: input.callerPersonId,
        chargePersonId: input.chargePersonId,
        asOf,
        destinationOrganizationId: input.destinationOrganizationId,
      },
    );
    if (
      context.organizationId !== authority.organizationId ||
      context.jurisdiction !== authority.jurisdiction ||
      context.policyVersion !== authority.policyVersion ||
      (context.authorizationForm === 'joint_child_guardian' &&
        (!authority.learnerAssentAt ||
          authority.learnerAssentAt.getTime() > asOf.getTime()))
    ) {
      throw new GuardianAttachmentRejectedError();
    }

    const lawfulBasis =
      context.policy.regimeKey === 'US_COPPA'
        ? 'coppa_parental_consent'
        : 'gdpr_parental_consent';
    const [requests, existingGrants] = await Promise.all([
      tx.query.consentRequest.findMany({
        where: and(
          eq(consentRequest.chargePersonId, input.chargePersonId),
          eq(consentRequest.organizationId, context.organizationId),
          eq(consentRequest.requestedBasis, lawfulBasis),
        ),
      }),
      tx.query.consentGrant.findMany({
        where: and(
          eq(consentGrant.chargePersonId, input.chargePersonId),
          eq(consentGrant.organizationId, context.organizationId),
          eq(consentGrant.lawfulBasis, lawfulBasis),
        ),
        orderBy: (grant, { desc }) => [desc(grant.grantedAt), desc(grant.id)],
      }),
    ]);
    if (!hasCompletePurposeSet(requests)) {
      throw new GuardianAttachmentRejectedError();
    }

    const currentByPurpose = new Map<string, (typeof existingGrants)[number]>();
    for (const grant of existingGrants) {
      if (!currentByPurpose.has(grant.purpose)) {
        currentByPurpose.set(grant.purpose, grant);
      }
    }

    if (currentByPurpose.size > 0) {
      const edge = context.activeEdges[0];
      const requestsMatch = requests.every((request) => {
        const grant = currentByPurpose.get(request.purpose);
        return (
          request.status === 'approved' &&
          request.guardianPersonId === input.callerPersonId &&
          request.token === null &&
          request.tokenExpiresAt === null &&
          request.consentGrantId === grant?.id
        );
      });
      const alreadySatisfied =
        !!edge &&
        requestsMatch &&
        CONSENT_PURPOSES.every((purpose) => {
          const grant = currentByPurpose.get(purpose);
          const audit = auditRecord(grant?.auditFact);
          return (
            grant?.granted === true &&
            grant.withdrawnAt === null &&
            grant.snapshotJurisdictionAtGrant === authority.jurisdiction &&
            grant.assuranceMethod === authority.assuranceMethod &&
            grant.assuranceToken === authority.evidenceId &&
            audit.policyVersion === authority.policyVersion &&
            audit.guardianPersonId === input.callerPersonId
          );
        });
      if (!alreadySatisfied) {
        throw new GuardianAttachmentRejectedError();
      }
      return { status: 'already_satisfied', consentSatisfied: true };
    }

    if (
      requests.some(
        (request) =>
          request.status !== 'pending' && request.status !== 'requested',
      )
    ) {
      throw new GuardianAttachmentRejectedError();
    }

    if (!context.activeEdges[0]) {
      await tx.insert(guardianship).values({
        guardianPersonId: input.callerPersonId,
        chargePersonId: input.chargePersonId,
        qualification: authority.qualification,
        grantedAt: asOf,
      });
    } else if (
      context.activeEdges[0].qualification !== authority.qualification
    ) {
      throw new GuardianAttachmentRejectedError();
    }

    await input.afterGuardianWrite?.();

    const grants = await tx
      .insert(consentGrant)
      .values(
        CONSENT_PURPOSES.map((purpose) => ({
          chargePersonId: input.chargePersonId,
          organizationId: context.organizationId,
          purpose,
          lawfulBasis,
          granted: true,
          grantedAt: asOf,
          priorValue: null,
          assuranceToken: authority.evidenceId,
          assuranceMethod: authority.assuranceMethod,
          snapshotAgeAtGrant: context.chargeAge,
          snapshotJurisdictionAtGrant: authority.jurisdiction,
          auditFact: {
            source: 'credentialed_learner_guardian_attachment',
            guardianPersonId: input.callerPersonId,
            policyVersion: authority.policyVersion,
            jurisdiction: authority.jurisdiction,
            organizationId: context.organizationId,
            authorizationForm: context.authorizationForm,
            authorityEvidenceId: authority.evidenceId,
            authorityAssertionIssuedAt: authority.issuedAt.toISOString(),
            authorityAssertionExpiresAt: authority.expiresAt.toISOString(),
            learnerAssentAt: authority.learnerAssentAt?.toISOString() ?? null,
          },
        })),
      )
      .returning({ id: consentGrant.id, purpose: consentGrant.purpose });
    if (!hasCompletePurposeSet(grants)) {
      throw new Error('guardian attachment grant purpose set was incomplete');
    }

    for (const request of requests) {
      const grant = grants.find(
        (candidate) => candidate.purpose === request.purpose,
      );
      if (!grant) {
        throw new Error('guardian attachment request back-link was incomplete');
      }
      const updated = await tx
        .update(consentRequest)
        .set({
          guardianPersonId: input.callerPersonId,
          status: 'approved',
          token: null,
          tokenExpiresAt: null,
          respondedAt: asOf,
          consentGrantId: grant.id,
          policyVersion: authority.policyVersion,
          updatedAt: asOf,
        })
        .where(
          and(
            eq(consentRequest.id, request.id),
            sql`${consentRequest.status} IN ('pending','requested')`,
          ),
        )
        .returning({ id: consentRequest.id });
      if (updated.length !== 1) {
        throw new GuardianAttachmentRejectedError();
      }
    }

    return { status: 'attached', consentSatisfied: true };
  });
}
