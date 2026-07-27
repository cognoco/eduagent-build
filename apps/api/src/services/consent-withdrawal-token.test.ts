import { createHmac } from 'node:crypto';

import {
  signWithdrawalToken,
  verifyWithdrawalToken,
} from './consent-withdrawal-token';

/** Replicates the wire format to forge an arbitrary, correctly-signed payload. */
function forgeToken(payload: string, secret: string): string {
  const encodedPayload = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${sig}`;
}

const SECRET = 'test-withdrawal-secret-please-rotate';
const CHARGE = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';
const TOKEN_ID = '33333333-3333-4333-8333-333333333333';

describe('consent-withdrawal-token', () => {
  it('round-trips: a signed cw2 token verifies back to the same ids + tokenId', () => {
    const token = signWithdrawalToken(CHARGE, ORG, SECRET, {
      tokenId: TOKEN_ID,
    });
    expect(typeof token).toBe('string');
    expect(token).toContain('.');

    const decoded = verifyWithdrawalToken(token, SECRET);
    expect(decoded).toEqual({
      chargePersonId: CHARGE,
      organizationId: ORG,
      tokenId: TOKEN_ID,
    });
  });

  it('produces a URL-safe token (no +, /, or = padding)', () => {
    const token = signWithdrawalToken(CHARGE, ORG, SECRET, {
      tokenId: TOKEN_ID,
    });
    expect(token).not.toMatch(/[+/=]/);
  });

  it('rejects a token verified with the wrong secret', () => {
    const token = signWithdrawalToken(CHARGE, ORG, SECRET, {
      tokenId: TOKEN_ID,
    });
    expect(verifyWithdrawalToken(token, 'a-different-secret')).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const token = signWithdrawalToken(CHARGE, ORG, SECRET, {
      tokenId: TOKEN_ID,
    });
    const [payload, sig] = token.split('.') as [string, string];
    // flip the last char of the payload
    const flipped =
      payload.slice(0, -1) + (payload.slice(-1) === 'A' ? 'B' : 'A');
    expect(verifyWithdrawalToken(`${flipped}.${sig}`, SECRET)).toBeNull();
  });

  it('rejects a tampered signature', () => {
    const token = signWithdrawalToken(CHARGE, ORG, SECRET, {
      tokenId: TOKEN_ID,
    });
    const [payload, sig] = token.split('.') as [string, string];
    const flipped = sig.slice(0, -1) + (sig.slice(-1) === 'A' ? 'B' : 'A');
    expect(verifyWithdrawalToken(`${payload}.${flipped}`, SECRET)).toBeNull();
  });

  it('rejects a malformed token (no dot)', () => {
    expect(verifyWithdrawalToken('not-a-token', SECRET)).toBeNull();
  });

  it('rejects an empty token', () => {
    expect(verifyWithdrawalToken('', SECRET)).toBeNull();
  });

  it('rejects a correctly-signed token with an unknown version prefix', () => {
    // Same secret, valid HMAC, but the payload claims a version this
    // module has never heard of.
    const forged = forgeToken(`cw3:${CHARGE}:${ORG}`, SECRET);
    expect(verifyWithdrawalToken(forged, SECRET)).toBeNull();
  });

  it('rejects a correctly-signed cw1 payload with the wrong field count', () => {
    const forged = forgeToken(`cw1:${CHARGE}`, SECRET); // missing org
    expect(verifyWithdrawalToken(forged, SECRET)).toBeNull();
  });

  it('rejects a correctly-signed cw2 payload with the wrong field count', () => {
    const forged = forgeToken(`cw2:${CHARGE}:${ORG}:${TOKEN_ID}`, SECRET); // missing expiresAt
    expect(verifyWithdrawalToken(forged, SECRET)).toBeNull();
  });

  // [WI-2347] Legacy cw1 tokens (minted before this change, already in
  // parents' inboxes) must keep verifying exactly as before — no expiry, no
  // tokenId in the decoded result.
  it('still verifies a legacy cw1 token, with no tokenId in the result', () => {
    const legacy = forgeToken(`cw1:${CHARGE}:${ORG}`, SECRET);
    expect(verifyWithdrawalToken(legacy, SECRET)).toEqual({
      chargePersonId: CHARGE,
      organizationId: ORG,
    });
  });

  // [WI-2347] AC-2: links carry an expiry.
  it('rejects an expired cw2 token', () => {
    const token = signWithdrawalToken(CHARGE, ORG, SECRET, {
      tokenId: TOKEN_ID,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(verifyWithdrawalToken(token, SECRET)).toBeNull();
  });

  it('accepts a cw2 token right up to its expiry, not one tick past', () => {
    const token = signWithdrawalToken(CHARGE, ORG, SECRET, {
      tokenId: TOKEN_ID,
      expiresAt: new Date(Date.now() + 1000),
    });
    expect(verifyWithdrawalToken(token, SECRET)).not.toBeNull();
  });
});
