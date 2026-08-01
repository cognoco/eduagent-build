import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  guardianAuthorityRedemptions,
  type Database,
} from '@eduagent/database';
import { CONSENT_PURPOSES } from '@eduagent/schemas';
import {
  GUARDIAN_AUTHORITY_MAX_TTL_MS,
  guardianAuthorityTokenDigest,
  signGuardianAuthorityToken,
  verifyGuardianAuthorityToken,
} from './guardian-attachment-token';
import {
  GuardianAttachmentRejectedError,
  resolveGuardianAttachmentContext,
} from './guardian-attachment';

const guardianAuthorityVerifierResponseSchema = z
  .object({
    decision: z.enum(['pending', 'approved', 'denied']),
    guardianPersonId: z.string().uuid(),
    chargePersonId: z.string().uuid(),
    organizationId: z.string().uuid(),
    jurisdiction: z.string().regex(/^[A-Z]{2}$/),
    policyVersion: z.string().trim().min(1),
    assuranceLevel: z.literal('VPC_VERIFIED'),
    assuranceMethod: z.string().trim().min(1),
    evidenceId: z.string().trim().min(1),
    qualification: z.enum([
      'biological_parent',
      'adoptive_parent',
      'stepparent',
      'grandparent',
      'court_appointed_guardian',
      'foster_parent',
      'kinship_caregiver',
      'sibling_with_custody',
      'other',
    ]),
    learnerAssentAt: z.string().datetime().nullable(),
  })
  .strict();

export interface GuardianAuthorityInitiationInput {
  callerPersonId: string;
  chargePersonId: string;
  verificationHandle: string;
  verifierUrl: string;
  verifierKey: string;
  tokenSecret: string;
  now?: Date;
  fetchImpl?: typeof fetch;
}

function verifierHandleDigest(handle: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`guardian-verifier-handle:${handle}`, 'utf8')
    .digest('hex');
}

function purposeSetDigest(): string {
  return createHash('sha256')
    .update(JSON.stringify([...CONSENT_PURPOSES].sort()), 'utf8')
    .digest('hex');
}

function commandBindingDigest(
  input: {
    guardianPersonId: string;
    chargePersonId: string;
    organizationId: string;
    jurisdiction: string;
    policyVersion: string;
    authorizationForm: string;
    requiredAssuranceLevel: string;
    purposeSetDigest: string;
  },
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(JSON.stringify(input), 'utf8')
    .digest('hex');
}

function sameDigest(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

async function rejectReservation(
  db: Database,
  reservationId: string,
  now: Date,
): Promise<never> {
  await db
    .update(guardianAuthorityRedemptions)
    .set({ status: 'rejected', updatedAt: now })
    .where(
      and(
        eq(guardianAuthorityRedemptions.id, reservationId),
        eq(guardianAuthorityRedemptions.status, 'redeeming'),
      ),
    );
  throw new GuardianAttachmentRejectedError();
}

/**
 * Verifies both the token signature and its durable issued-redemption receipt.
 * A signed token without the matching committed receipt is never attachment
 * authority.
 */
export async function verifyDurableGuardianAuthorityToken(
  db: Database,
  token: string,
  secret: string,
  now = new Date(),
) {
  const authority = verifyGuardianAuthorityToken(token, secret, now);
  if (!authority) return null;

  const [redemption] = await db
    .select()
    .from(guardianAuthorityRedemptions)
    .where(eq(guardianAuthorityRedemptions.id, authority.redemptionId))
    .limit(1);
  if (
    !redemption ||
    redemption.status !== 'issued' ||
    !redemption.authorityTokenDigest ||
    !sameDigest(
      redemption.authorityTokenDigest,
      guardianAuthorityTokenDigest(token),
    ) ||
    redemption.guardianPersonId !== authority.guardianPersonId ||
    redemption.chargePersonId !== authority.chargePersonId ||
    redemption.organizationId !== authority.organizationId ||
    redemption.jurisdiction !== authority.jurisdiction ||
    redemption.policyVersion !== authority.policyVersion ||
    redemption.assuranceMethod !== authority.assuranceMethod ||
    redemption.evidenceId !== authority.evidenceId ||
    redemption.qualification !== authority.qualification ||
    redemption.learnerAssentAt?.getTime() !==
      authority.learnerAssentAt?.getTime() ||
    redemption.issuedAt?.getTime() !== authority.issuedAt.getTime() ||
    redemption.notBefore?.getTime() !== authority.notBefore.getTime() ||
    redemption.expiresAt?.getTime() !== authority.expiresAt.getTime()
  ) {
    return null;
  }
  return authority;
}

/**
 * Redeems an opaque provider handle over the configured server-to-server VPC
 * boundary and mints the only assertion accepted by attachment redemption.
 * The provider must echo every destination binding; any mismatch collapses to
 * the same non-enumerating rejection as a denied or malformed decision.
 */
export async function initiateGuardianAuthorityVerification(
  db: Database,
  input: GuardianAuthorityInitiationInput,
): Promise<{ authorityToken: string }> {
  const now = input.now ?? new Date();
  const context = await resolveGuardianAttachmentContext(db, {
    callerPersonId: input.callerPersonId,
    chargePersonId: input.chargePersonId,
    asOf: now,
  });

  const purposesDigest = purposeSetDigest();
  const handleDigest = verifierHandleDigest(
    input.verificationHandle,
    input.tokenSecret,
  );
  const bindingDigest = commandBindingDigest(
    {
      guardianPersonId: input.callerPersonId,
      chargePersonId: input.chargePersonId,
      organizationId: context.organizationId,
      jurisdiction: context.jurisdiction,
      policyVersion: context.policyVersion,
      authorizationForm: context.authorizationForm,
      requiredAssuranceLevel: context.requiredAssuranceLevel,
      purposeSetDigest: purposesDigest,
    },
    input.tokenSecret,
  );

  const [reservation] = await db
    .insert(guardianAuthorityRedemptions)
    .values({
      verifierHandleDigest: handleDigest,
      commandBindingDigest: bindingDigest,
      guardianPersonId: input.callerPersonId,
      chargePersonId: input.chargePersonId,
      organizationId: context.organizationId,
      jurisdiction: context.jurisdiction,
      policyVersion: context.policyVersion,
      authorizationForm: context.authorizationForm,
      purposeSetDigest: purposesDigest,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: guardianAuthorityRedemptions.verifierHandleDigest,
    })
    .returning({ id: guardianAuthorityRedemptions.id });

  if (!reservation) {
    const [existing] = await db
      .select()
      .from(guardianAuthorityRedemptions)
      .where(
        eq(guardianAuthorityRedemptions.verifierHandleDigest, handleDigest),
      )
      .limit(1);
    if (
      !existing ||
      !sameDigest(existing.commandBindingDigest, bindingDigest) ||
      existing.guardianPersonId !== input.callerPersonId ||
      existing.chargePersonId !== input.chargePersonId ||
      existing.organizationId !== context.organizationId ||
      existing.jurisdiction !== context.jurisdiction ||
      existing.policyVersion !== context.policyVersion ||
      existing.authorizationForm !== context.authorizationForm ||
      !sameDigest(existing.purposeSetDigest, purposesDigest) ||
      existing.status !== 'issued' ||
      !existing.assuranceMethod ||
      !existing.evidenceId ||
      !existing.qualification ||
      !existing.issuedAt ||
      !existing.notBefore ||
      !existing.expiresAt ||
      !existing.authorityTokenDigest
    ) {
      throw new GuardianAttachmentRejectedError();
    }

    const authorityToken = signGuardianAuthorityToken(
      {
        redemptionId: existing.id,
        guardianPersonId: existing.guardianPersonId,
        chargePersonId: existing.chargePersonId,
        organizationId: existing.organizationId,
        jurisdiction: existing.jurisdiction,
        policyVersion: existing.policyVersion,
        assuranceMethod: existing.assuranceMethod,
        evidenceId: existing.evidenceId,
        qualification:
          guardianAuthorityVerifierResponseSchema.shape.qualification.parse(
            existing.qualification,
          ),
        decision: 'approved',
        learnerAssentAt: existing.learnerAssentAt,
        issuedAt: existing.issuedAt,
        notBefore: existing.notBefore,
        expiresAt: existing.expiresAt,
      },
      input.tokenSecret,
    );
    if (
      !sameDigest(
        existing.authorityTokenDigest,
        guardianAuthorityTokenDigest(authorityToken),
      ) ||
      !verifyGuardianAuthorityToken(authorityToken, input.tokenSecret, now)
    ) {
      throw new GuardianAttachmentRejectedError();
    }
    return { authorityToken };
  }

  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)(input.verifierUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.verifierKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        verificationHandle: input.verificationHandle,
        expected: {
          guardianPersonId: input.callerPersonId,
          chargePersonId: input.chargePersonId,
          organizationId: context.organizationId,
          jurisdiction: context.jurisdiction,
          policyVersion: context.policyVersion,
          requiredAssuranceLevel: 'VPC_VERIFIED',
          authorizationForm: context.authorizationForm,
        },
      }),
    });
  } catch {
    return rejectReservation(db, reservation.id, now);
  }
  if (!response.ok) {
    return rejectReservation(db, reservation.id, now);
  }

  let verified: z.infer<typeof guardianAuthorityVerifierResponseSchema>;
  try {
    verified = guardianAuthorityVerifierResponseSchema.parse(
      await response.json(),
    );
  } catch {
    return rejectReservation(db, reservation.id, now);
  }

  if (
    verified.decision !== 'approved' ||
    verified.guardianPersonId !== input.callerPersonId ||
    verified.chargePersonId !== input.chargePersonId ||
    verified.organizationId !== context.organizationId ||
    verified.jurisdiction !== context.jurisdiction ||
    verified.policyVersion !== context.policyVersion ||
    (context.authorizationForm === 'joint_child_guardian' &&
      !verified.learnerAssentAt)
  ) {
    return rejectReservation(db, reservation.id, now);
  }

  const assertion = {
    redemptionId: reservation.id,
    guardianPersonId: verified.guardianPersonId,
    chargePersonId: verified.chargePersonId,
    organizationId: verified.organizationId,
    jurisdiction: verified.jurisdiction,
    policyVersion: verified.policyVersion,
    assuranceMethod: verified.assuranceMethod,
    evidenceId: verified.evidenceId,
    qualification: verified.qualification,
    decision: verified.decision,
    learnerAssentAt: verified.learnerAssentAt
      ? new Date(verified.learnerAssentAt)
      : null,
    issuedAt: now,
    notBefore: now,
    expiresAt: new Date(now.getTime() + GUARDIAN_AUTHORITY_MAX_TTL_MS),
  } as const;
  const authorityToken = signGuardianAuthorityToken(
    assertion,
    input.tokenSecret,
  );
  const [issued] = await db
    .update(guardianAuthorityRedemptions)
    .set({
      status: 'issued',
      assuranceMethod: assertion.assuranceMethod,
      evidenceId: assertion.evidenceId,
      qualification: assertion.qualification,
      learnerAssentAt: assertion.learnerAssentAt,
      issuedAt: assertion.issuedAt,
      notBefore: assertion.notBefore,
      expiresAt: assertion.expiresAt,
      authorityTokenDigest: guardianAuthorityTokenDigest(authorityToken),
      updatedAt: now,
    })
    .where(
      and(
        eq(guardianAuthorityRedemptions.id, reservation.id),
        eq(guardianAuthorityRedemptions.status, 'redeeming'),
        eq(guardianAuthorityRedemptions.commandBindingDigest, bindingDigest),
      ),
    )
    .returning({ id: guardianAuthorityRedemptions.id });
  if (!issued) {
    throw new GuardianAttachmentRejectedError();
  }

  return { authorityToken };
}
