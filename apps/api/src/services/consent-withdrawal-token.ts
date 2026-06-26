import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stateless, signed, non-expiring consent-withdrawal token.
 *
 * The email-consenting parent has no account and no guardianship edge, so the
 * only thing the system knows about them is the `guardian_email` that received
 * the consent request. Possession of a link signed with the server secret is
 * therefore the authority for withdrawing the consent they gave — mirroring the
 * trust model already used for the approval link.
 *
 * Design notes (see docs/specs/2026-06-26-p0-email-consent-withdrawal-design.md):
 * - No DB column, no migration — P0 is deliberately disposable.
 * - No expiry: GDPR Art. 7(3) requires withdrawal to be available "at any time".
 * - The token authorizes ONLY withdraw/restore of one child — never any read or
 *   export of the child's data. Leak blast-radius is "a stranger could pause
 *   this one child's account, recoverable for 7 days" — low-harm, self-healing.
 *
 * Wire format (URL-safe, no padding):
 *   token   = base64url(payload) + "." + base64url(hmacSha256(secret, base64url(payload)))
 *   payload = `cw1:${chargePersonId}:${organizationId}`   // cw1 = consent-withdrawal v1
 */

const TOKEN_VERSION = 'cw1';

function encodePayload(chargePersonId: string, organizationId: string): string {
  const payload = `${TOKEN_VERSION}:${chargePersonId}:${organizationId}`;
  return Buffer.from(payload, 'utf8').toString('base64url');
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');
}

export function signWithdrawalToken(
  chargePersonId: string,
  organizationId: string,
  secret: string,
): string {
  const encodedPayload = encodePayload(chargePersonId, organizationId);
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

/**
 * Verify a withdrawal token.
 *
 * @returns the decoded ids, or `null` for any malformed, forged, tampered,
 *   wrong-secret, or unknown-version token. Never throws.
 */
export function verifyWithdrawalToken(
  token: string,
  secret: string,
): { chargePersonId: string; organizationId: string } | null {
  if (typeof token !== 'string' || token.length === 0) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, providedSig] = parts;
  if (!encodedPayload || !providedSig) return null;

  // Constant-time signature comparison — no signature oracle.
  const expectedSig = sign(encodedPayload, secret);
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  const providedBuf = Buffer.from(providedSig, 'utf8');
  if (expectedBuf.length !== providedBuf.length) return null;
  if (!timingSafeEqual(expectedBuf, providedBuf)) return null;

  let payload: string;
  try {
    payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const fields = payload.split(':');
  if (fields.length !== 3) return null;
  const [version, chargePersonId, organizationId] = fields;
  if (version !== TOKEN_VERSION) return null;
  if (!chargePersonId || !organizationId) return null;

  return { chargePersonId, organizationId };
}
