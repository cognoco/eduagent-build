import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const TOKEN_VERSION = 'ga1';
export const GUARDIAN_AUTHORITY_MAX_TTL_MS = 15 * 60 * 1000;
export const GUARDIAN_AUTHORITY_CLOCK_SKEW_MS = 60 * 1000;

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
  redemptionId: z.string().uuid(),
  guardianPersonId: z.string().uuid(),
  chargePersonId: z.string().uuid(),
  organizationId: z.string().uuid(),
  jurisdiction: z.string().regex(/^[A-Z]{2}$/),
  policyVersion: z.string().trim().min(1),
  assuranceMethod: z.string().trim().min(1),
  evidenceId: z.string().trim().min(1),
  qualification: guardianQualificationSchema,
  decision: z.enum(['pending', 'approved', 'denied']),
  learnerAssentAt: z.string().datetime().nullable(),
  issuedAt: z.string().datetime(),
  notBefore: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export interface GuardianAuthorityAssertion {
  redemptionId: string;
  guardianPersonId: string;
  chargePersonId: string;
  organizationId: string;
  jurisdiction: string;
  policyVersion: string;
  assuranceMethod: string;
  evidenceId: string;
  qualification: z.infer<typeof guardianQualificationSchema>;
  decision: 'pending' | 'approved' | 'denied';
  learnerAssentAt: Date | null;
  issuedAt: Date;
  notBefore: Date;
  expiresAt: Date;
}

export function guardianAuthorityTokenDigest(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
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
  const issuedAt = assertion.issuedAt.getTime();
  const notBefore = assertion.notBefore.getTime();
  const expiresAt = assertion.expiresAt.getTime();
  if (
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(notBefore) ||
    !Number.isFinite(expiresAt) ||
    notBefore < issuedAt - GUARDIAN_AUTHORITY_CLOCK_SKEW_MS ||
    expiresAt <= notBefore ||
    expiresAt - issuedAt > GUARDIAN_AUTHORITY_MAX_TTL_MS
  ) {
    throw new Error('Guardian authority assertion lifetime is invalid.');
  }
  const payload = guardianAuthorityPayloadSchema.parse({
    ...assertion,
    version: TOKEN_VERSION,
    learnerAssentAt: assertion.learnerAssentAt?.toISOString() ?? null,
    issuedAt: assertion.issuedAt.toISOString(),
    notBefore: assertion.notBefore.toISOString(),
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
    const issuedAt = new Date(parsed.issuedAt);
    const notBefore = new Date(parsed.notBefore);
    const expiresAt = new Date(parsed.expiresAt);
    const nowMs = now.getTime();
    if (
      parsed.decision !== 'approved' ||
      issuedAt.getTime() > nowMs + GUARDIAN_AUTHORITY_CLOCK_SKEW_MS ||
      notBefore.getTime() > nowMs + GUARDIAN_AUTHORITY_CLOCK_SKEW_MS ||
      notBefore.getTime() <
        issuedAt.getTime() - GUARDIAN_AUTHORITY_CLOCK_SKEW_MS ||
      expiresAt.getTime() <= notBefore.getTime() ||
      expiresAt.getTime() - issuedAt.getTime() >
        GUARDIAN_AUTHORITY_MAX_TTL_MS ||
      nowMs >= expiresAt.getTime() + GUARDIAN_AUTHORITY_CLOCK_SKEW_MS
    ) {
      return null;
    }
    return {
      redemptionId: parsed.redemptionId,
      guardianPersonId: parsed.guardianPersonId,
      chargePersonId: parsed.chargePersonId,
      organizationId: parsed.organizationId,
      jurisdiction: parsed.jurisdiction,
      policyVersion: parsed.policyVersion,
      assuranceMethod: parsed.assuranceMethod,
      evidenceId: parsed.evidenceId,
      qualification: parsed.qualification,
      decision: parsed.decision,
      learnerAssentAt: parsed.learnerAssentAt
        ? new Date(parsed.learnerAssentAt)
        : null,
      issuedAt,
      notBefore,
      expiresAt,
    };
  } catch {
    return null;
  }
}
