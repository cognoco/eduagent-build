import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stateless, signed consent-withdrawal token.
 *
 * The email-consenting parent has no account and no guardianship edge, so the
 * only thing the system knows about them is the `guardian_email` that received
 * the consent request. Possession of a link signed with the server secret is
 * therefore the authority for withdrawing the consent they gave — mirroring the
 * trust model already used for the approval link.
 *
 * Design notes (see docs/specs/2026-06-26-p0-email-consent-withdrawal-design.md
 * and the `cw2` addendum below, WI-2347):
 * - The token authorizes ONLY withdraw/restore of one child — never any read or
 *   export of the child's data. Leak blast-radius is "a stranger could pause
 *   this one child's account, recoverable for 7 days" — low-harm, self-healing.
 *
 * Wire format (URL-safe, no padding):
 *   token   = base64url(payload) + "." + base64url(hmacSha256(secret, base64url(payload)))
 *   payload = `cw1:${chargePersonId}:${organizationId}`                                 // v1, legacy
 *           | `cw2:${chargePersonId}:${organizationId}:${tokenId}:${expiresAtEpochMs}`  // v2, WI-2347
 *
 * [WI-2347] `cw2` adds the two properties T-10 required: an expiry (checked
 * here, no DB round-trip) and a per-link `tokenId` the caller compares against
 * `consentGrant.withdrawalTokenId` (checked by the caller against the current
 * grant, since revocation is "does this link still name the live grant", not
 * something this stateless module can answer on its own). `cw1` tokens already
 * in the wild keep verifying exactly as before — this is additive, not a
 * breaking version bump: `signWithdrawalToken` now always mints `cw2`, and
 * `verifyWithdrawalToken` accepts both so no in-flight email link breaks.
 */

const TOKEN_VERSION_V1 = 'cw1';
const TOKEN_VERSION_V2 = 'cw2';

/** [WI-2347] Mint-time TTL for new (`cw2`) tokens. Generous by design: GDPR
 * Art. 7(3) still wants withdrawal available "at any time" for as long as the
 * consent relationship is realistically live; this bounds credential lifetime
 * without acting like a session timeout. */
export const WITHDRAWAL_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 730; // 2 years

function sign(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');
}

export interface SignWithdrawalTokenOptions {
  /** Embedded in the token; compared against `consentGrant.withdrawalTokenId`
   * at verify time so a withdrawn/superseded grant makes the link unusable. */
  tokenId: string;
  /** Absolute expiry. Defaults to `Date.now() + WITHDRAWAL_TOKEN_TTL_MS`. */
  expiresAt?: Date;
}

export function signWithdrawalToken(
  chargePersonId: string,
  organizationId: string,
  secret: string,
  options: SignWithdrawalTokenOptions,
): string {
  const expiresAtMs = (
    options.expiresAt ?? new Date(Date.now() + WITHDRAWAL_TOKEN_TTL_MS)
  ).getTime();
  const payload = `${TOKEN_VERSION_V2}:${chargePersonId}:${organizationId}:${options.tokenId}:${expiresAtMs}`;
  const encodedPayload = Buffer.from(payload, 'utf8').toString('base64url');
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export interface VerifiedWithdrawalToken {
  chargePersonId: string;
  organizationId: string;
  /** Absent for legacy `cw1` tokens, which carry no per-link id. */
  tokenId?: string;
}

/**
 * Verify a withdrawal token.
 *
 * @returns the decoded ids, or `null` for any malformed, forged, tampered,
 *   wrong-secret, unknown-version, or (for `cw2`) expired token. Never throws.
 */
export function verifyWithdrawalToken(
  token: string,
  secret: string,
): VerifiedWithdrawalToken | null {
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
  const version = fields[0];

  if (version === TOKEN_VERSION_V1) {
    if (fields.length !== 3) return null;
    const [, chargePersonId, organizationId] = fields;
    if (!chargePersonId || !organizationId) return null;
    return { chargePersonId, organizationId };
  }

  if (version === TOKEN_VERSION_V2) {
    if (fields.length !== 5) return null;
    const [, chargePersonId, organizationId, tokenId, expiresAtMsRaw] = fields;
    if (!chargePersonId || !organizationId || !tokenId) return null;
    const expiresAtMs = Number(expiresAtMsRaw);
    if (!Number.isFinite(expiresAtMs)) return null;
    if (Date.now() >= expiresAtMs) return null;
    return { chargePersonId, organizationId, tokenId };
  }

  return null;
}
