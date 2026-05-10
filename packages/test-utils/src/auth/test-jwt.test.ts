/**
 * Tests for the real-crypto JWT signing utilities.
 *
 * These tests verify round-trip compatibility between `signTestJwt` (node:crypto
 * RS256) and the Web Crypto RSASSA-PKCS1-v1_5 verifier — the same pair used in
 * route tests after the C1 mock cleanup.
 *
 * NOTE: We inline a minimal Web Crypto verifier here rather than importing from
 * `apps/api/src/middleware/jwt` so the test-utils jest config doesn't need a
 * cross-package transform setup. The inline code mirrors jwt.ts exactly.
 */

import { signTestJwt, TEST_JWKS, TEST_KID, getTestPublicJwk } from './test-jwt';

// ---------------------------------------------------------------------------
// Minimal inline verifier (mirrors apps/api/src/middleware/jwt.ts)
// ---------------------------------------------------------------------------

function base64UrlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlDecode(base64url: string): string {
  const bytes = base64UrlToUint8Array(base64url);
  return new TextDecoder().decode(bytes);
}

interface JWK {
  kty: string;
  kid?: string;
  n?: string;
  e?: string;
}

interface VerifyOptions {
  issuer?: string;
  audience?: string;
}

async function verifyTokenViaWebCrypto(
  token: string,
  jwk: JWK,
  options?: VerifyOptions,
): Promise<Record<string, unknown>> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT: expected 3 segments');

  const [headerB64, payloadB64, signatureB64] = parts as [
    string,
    string,
    string,
  ];

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true } as JsonWebKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlToUint8Array(signatureB64);

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signature,
    data,
  );
  if (!valid) throw new Error('Invalid JWT: signature verification failed');

  const payload = JSON.parse(base64UrlDecode(payloadB64)) as Record<
    string,
    unknown
  >;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now) {
    throw new Error('Invalid JWT: token has expired');
  }

  if (options?.issuer && payload.iss !== options.issuer) {
    throw new Error(`Invalid JWT: issuer mismatch`);
  }

  if (options?.audience) {
    const aud = payload.aud;
    const audiences = Array.isArray(aud) ? aud : [aud];
    if (!audiences.includes(options.audience)) {
      throw new Error('Invalid JWT: audience mismatch');
    }
  }

  return payload;
}

// ---------------------------------------------------------------------------
// 1. Basic shape
// ---------------------------------------------------------------------------

describe('signTestJwt', () => {
  it('produces a 3-segment JWT', () => {
    const token = signTestJwt({});
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBeTruthy();
    expect(parts[1]).toBeTruthy();
    expect(parts[2]).toBeTruthy();
  });

  it('encodes defaults sub and email in payload', () => {
    const token = signTestJwt({});
    const payloadB64 = token.split('.')[1]!;
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    );
    expect(payload.sub).toBe('user_test');
    expect(payload.email).toBe('test@example.com');
  });

  it('overrides are reflected in the payload', () => {
    const token = signTestJwt({ sub: 'user_custom', email: 'custom@test.com' });
    const payloadB64 = token.split('.')[1]!;
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    );
    expect(payload.sub).toBe('user_custom');
    expect(payload.email).toBe('custom@test.com');
  });
});

// ---------------------------------------------------------------------------
// 2. Round-trip: signed JWT verifies via Web Crypto against TEST_JWKS
// ---------------------------------------------------------------------------

describe('round-trip with Web Crypto verifier', () => {
  it('verifies a freshly signed token using the test public JWK', async () => {
    const token = signTestJwt({ sub: 'user_test', email: 'test@example.com' });
    const jwk = getTestPublicJwk();
    const payload = await verifyTokenViaWebCrypto(token, jwk);
    expect(payload.sub).toBe('user_test');
    expect(payload.email).toBe('test@example.com');
  });

  it('verifies a token against the TEST_JWKS keys array (kid lookup)', async () => {
    const token = signTestJwt({});
    const jwk = TEST_JWKS.keys.find((k) => k.kid === TEST_KID);
    expect(jwk).toBeDefined();
    const payload = await verifyTokenViaWebCrypto(token, jwk!);
    expect(payload.sub).toBe('user_test');
  });

  it('verifies with issuer + audience when claims are present', async () => {
    const token = signTestJwt({
      iss: 'https://clerk.test',
      aud: 'test-audience',
    });
    const jwk = getTestPublicJwk();
    const payload = await verifyTokenViaWebCrypto(token, jwk, {
      issuer: 'https://clerk.test',
      audience: 'test-audience',
    });
    expect(payload.sub).toBe('user_test');
    expect(payload.iss).toBe('https://clerk.test');
  });
});

// ---------------------------------------------------------------------------
// 3. Expired token is rejected
// ---------------------------------------------------------------------------

describe('expired token', () => {
  it('rejects a token with exp in the past', async () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    const token = signTestJwt({ exp: past });
    const jwk = getTestPublicJwk();
    await expect(verifyTokenViaWebCrypto(token, jwk)).rejects.toThrow(
      /expired/i,
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Tampered signature is rejected
// ---------------------------------------------------------------------------

describe('tampered signature', () => {
  it('rejects a token with a corrupted signature segment', async () => {
    const token = signTestJwt({});
    const [h, p] = token.split('.');
    const fakeSignature = Buffer.from('thisisnotavalidsignature').toString(
      'base64url',
    );
    const tamperedToken = `${h}.${p}.${fakeSignature}`;

    const jwk = getTestPublicJwk();
    await expect(verifyTokenViaWebCrypto(tamperedToken, jwk)).rejects.toThrow(
      /signature verification failed/i,
    );
  });
});
