import { z } from 'zod';
import type { Database } from '@eduagent/database';
import {
  GUARDIAN_AUTHORITY_MAX_TTL_MS,
  signGuardianAuthorityToken,
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
    throw new GuardianAttachmentRejectedError();
  }
  if (!response.ok) {
    throw new GuardianAttachmentRejectedError();
  }

  let verified: z.infer<typeof guardianAuthorityVerifierResponseSchema>;
  try {
    verified = guardianAuthorityVerifierResponseSchema.parse(
      await response.json(),
    );
  } catch {
    throw new GuardianAttachmentRejectedError();
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
    throw new GuardianAttachmentRejectedError();
  }

  return {
    authorityToken: signGuardianAuthorityToken(
      {
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
      },
      input.tokenSecret,
    ),
  };
}
