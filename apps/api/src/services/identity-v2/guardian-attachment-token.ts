import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const TOKEN_VERSION = 'ga1';

export const guardianQualificationSchema = z.enum([
  'biological_parent',
  'adoptive_parent',
  'stepparent',
  'grandparent',
  'court_appointed_guardian',
  'foster_parent',
  'kinship_caregiver',
  'sibling_with_custody',
  'other',
]);

const guardianAuthorityPayloadSchema = z.object({
  version: z.literal(TOKEN_VERSION),
  guardianPersonId: z.string().uuid(),
  chargePersonId: z.string().uuid(),
  jurisdiction: z.string().regex(/^[A-Z]{2}$/),
  policyVersion: z.string().trim().min(1),
  assuranceMethod: z.string().trim().min(1),
  evidenceId: z.string().trim().min(1),
  qualification: guardianQualificationSchema,
  decision: z.enum(['pending', 'approved', 'denied']),
  learnerAssentAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime(),
});

export interface GuardianAuthorityAssertion {
  guardianPersonId: string;
  chargePersonId: string;
  jurisdiction: string;
  policyVersion: string;
  assuranceMethod: string;
  evidenceId: string;
  qualification: z.infer<typeof guardianQualificationSchema>;
  decision: 'pending' | 'approved' | 'denied';
  learnerAssentAt: Date | null;
  expiresAt: Date;
}

function signature(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`guardian-attachment:${encodedPayload}`)
    .digest('base64url');
}

/**
 * Server-side mint used only after the configured VPC/authority verifier has
 * produced a tokenised pass/fail assertion. Mobile treats the result as opaque.
 */
export function signGuardianAuthorityToken(
  assertion: GuardianAuthorityAssertion,
  secret: string,
): string {
  const payload = guardianAuthorityPayloadSchema.parse({
    ...assertion,
    version: TOKEN_VERSION,
    learnerAssentAt: assertion.learnerAssentAt?.toISOString() ?? null,
    expiresAt: assertion.expiresAt.toISOString(),
  });
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url',
  );
  return `${encodedPayload}.${signature(encodedPayload, secret)}`;
}

/**
 * Fail-closed verification for the adult-authority assertion. Pending, denied,
 * expired, malformed, tampered, and wrong-secret tokens all collapse to null.
 */
export function verifyGuardianAuthorityToken(
  token: string,
  secret: string,
  now = new Date(),
): GuardianAuthorityAssertion | null {
  const [encodedPayload, providedSignature, extra] = token.split('.');
  if (!encodedPayload || !providedSignature || extra !== undefined) return null;

  const expected = Buffer.from(signature(encodedPayload, secret), 'utf8');
  const provided = Buffer.from(providedSignature, 'utf8');
  if (
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided)
  ) {
    return null;
  }

  try {
    const parsed = guardianAuthorityPayloadSchema.parse(
      JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')),
    );
    const expiresAt = new Date(parsed.expiresAt);
    if (
      parsed.decision !== 'approved' ||
      now.getTime() >= expiresAt.getTime()
    ) {
      return null;
    }
    return {
      guardianPersonId: parsed.guardianPersonId,
      chargePersonId: parsed.chargePersonId,
      jurisdiction: parsed.jurisdiction,
      policyVersion: parsed.policyVersion,
      assuranceMethod: parsed.assuranceMethod,
      evidenceId: parsed.evidenceId,
      qualification: parsed.qualification,
      decision: parsed.decision,
      learnerAssentAt: parsed.learnerAssentAt
        ? new Date(parsed.learnerAssentAt)
        : null,
      expiresAt,
    };
  } catch {
    return null;
  }
}
