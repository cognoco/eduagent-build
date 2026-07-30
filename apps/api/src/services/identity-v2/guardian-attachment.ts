import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  consentGrant,
  guardianship,
  membership,
  person,
  type Database,
} from '@eduagent/database';
import { CONSENT_PURPOSES } from '@eduagent/schemas';
import { resolveJurisdiction } from './country-policy-loader';
import type { GuardianAuthorityAssertion } from './guardian-attachment-token';

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
  asOf?: Date;
  /** Transaction-failure seam used by integration tests only. */
  afterGuardianWrite?: () => void | Promise<void>;
}

export interface GuardianAttachmentResult {
  status: 'attached' | 'already_satisfied';
  consentSatisfied: true;
}

function ageAt(birthDate: string, asOf: Date): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) return null;
  const [, year, month, day] = match;
  const born = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(born.getTime())) return null;
  let age = asOf.getUTCFullYear() - born.getUTCFullYear();
  if (
    asOf.getUTCMonth() < born.getUTCMonth() ||
    (asOf.getUTCMonth() === born.getUTCMonth() &&
      asOf.getUTCDate() < born.getUTCDate())
  ) {
    age -= 1;
  }
  return age;
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
    asOf.getTime() >= authority.expiresAt.getTime()
  ) {
    throw new GuardianAttachmentRejectedError();
  }

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`guardian-attachment:${input.chargePersonId}`}))`,
    );

    const [guardian, charge, chargeMembership, activeEdges] = await Promise.all(
      [
        tx.query.person.findFirst({
          where: eq(person.id, input.callerPersonId),
          columns: {
            id: true,
            birthDate: true,
            loginId: true,
            ageKnowing: true,
          },
        }),
        tx.query.person.findFirst({
          where: eq(person.id, input.chargePersonId),
          columns: {
            id: true,
            birthDate: true,
            residenceJurisdiction: true,
            residenceKnowing: true,
            loginId: true,
          },
        }),
        tx.query.membership.findFirst({
          where: eq(membership.personId, input.chargePersonId),
          columns: { organizationId: true },
        }),
        tx.query.guardianship.findMany({
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
      ],
    );

    const guardianAge = guardian ? ageAt(guardian.birthDate, asOf) : null;
    const chargeAge = charge ? ageAt(charge.birthDate, asOf) : null;
    if (
      !guardian ||
      guardianAge === null ||
      guardianAge < 18 ||
      !guardian.loginId ||
      !hasVerifiedAdultAge(guardian.ageKnowing) ||
      !charge ||
      chargeAge === null ||
      chargeAge < 13 ||
      chargeAge >= 18 ||
      !charge.loginId ||
      !chargeMembership ||
      activeEdges.length > 1 ||
      (activeEdges[0] &&
        activeEdges[0].guardianPersonId !== input.callerPersonId)
    ) {
      throw new GuardianAttachmentRejectedError();
    }

    const policy = await resolveJurisdiction(tx, {
      habitualResidence: charge.residenceJurisdiction,
      birthDate: charge.birthDate,
      residenceAssurance: reviveResidenceKnowing(charge.residenceKnowing),
      asOf,
    });
    if (
      policy.launchDecision !== 'allowed' ||
      policy.consentDecision?.ageBand !== 'guardian_required_minor' ||
      policy.consentDecision.consentStatus !== 'REQUIRED_PENDING' ||
      policy.habitualResidence !== authority.jurisdiction ||
      policy.policyVersion !== authority.policyVersion ||
      (policy.authorizationForm === 'joint_child_guardian' &&
        (!authority.learnerAssentAt ||
          authority.learnerAssentAt.getTime() > asOf.getTime()))
    ) {
      throw new GuardianAttachmentRejectedError();
    }

    const existingGrants = await tx.query.consentGrant.findMany({
      where: and(
        eq(consentGrant.chargePersonId, input.chargePersonId),
        eq(consentGrant.organizationId, chargeMembership.organizationId),
      ),
      orderBy: (grant, { desc }) => [desc(grant.grantedAt), desc(grant.id)],
    });
    const currentByPurpose = new Map<string, (typeof existingGrants)[number]>();
    for (const grant of existingGrants) {
      if (!currentByPurpose.has(grant.purpose)) {
        currentByPurpose.set(grant.purpose, grant);
      }
    }

    if (currentByPurpose.size > 0) {
      const edge = activeEdges[0];
      const alreadySatisfied =
        !!edge &&
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
        // A withdrawn/restored/stale/different-evidence history is never
        // silently overwritten by a retry. A fresh authority ceremony must be
        // explicitly designed for that transition.
        throw new GuardianAttachmentRejectedError();
      }
      return { status: 'already_satisfied', consentSatisfied: true };
    }

    if (!activeEdges[0]) {
      await tx.insert(guardianship).values({
        guardianPersonId: input.callerPersonId,
        chargePersonId: input.chargePersonId,
        qualification: authority.qualification,
        grantedAt: asOf,
      });
    } else if (activeEdges[0].qualification !== authority.qualification) {
      throw new GuardianAttachmentRejectedError();
    }

    await input.afterGuardianWrite?.();

    const lawfulBasis =
      policy.regimeKey === 'US_COPPA'
        ? 'coppa_parental_consent'
        : 'gdpr_parental_consent';
    await tx.insert(consentGrant).values(
      CONSENT_PURPOSES.map((purpose) => ({
        chargePersonId: input.chargePersonId,
        organizationId: chargeMembership.organizationId,
        purpose,
        lawfulBasis,
        granted: true,
        grantedAt: asOf,
        priorValue: null,
        assuranceToken: authority.evidenceId,
        assuranceMethod: authority.assuranceMethod,
        snapshotAgeAtGrant: chargeAge,
        snapshotJurisdictionAtGrant: authority.jurisdiction,
        auditFact: {
          source: 'credentialed_learner_guardian_attachment',
          guardianPersonId: input.callerPersonId,
          policyVersion: authority.policyVersion,
          jurisdiction: authority.jurisdiction,
          authorizationForm: policy.authorizationForm,
          authorityEvidenceId: authority.evidenceId,
          authorityAssertionExpiresAt: authority.expiresAt.toISOString(),
          learnerAssentAt: authority.learnerAssentAt?.toISOString() ?? null,
        },
      })),
    );

    return { status: 'attached', consentSatisfied: true };
  });
}
