/**
 * Test RSA key pair and JWT signing utilities for integration tests.
 *
 * Generates a fresh RSA-2048 key pair at module load. The public key is
 * exported as JWK so it can be served from the JWKS mock endpoint and
 * verified by the real `jwt.ts` Web Crypto verification path.
 *
 * Signing uses Node's `crypto.sign` (synchronous) — the resulting RS256
 * JWTs are byte-compatible with Web Crypto's RSASSA-PKCS1-v1_5 verifier.
 */

import { generateKeyPairSync, createPublicKey, sign } from 'node:crypto';

// ---------------------------------------------------------------------------
// Key pair — generated once per test run
// ---------------------------------------------------------------------------

const TEST_KID = 'integration-test-kid';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Export the public key as JWK (matches what crypto.subtle.importKey expects)
const jwkPublic = createPublicKey(publicKey).export({ format: 'jwk' });

/** JWKS response shape — serve this from the mock JWKS endpoint. */
export const TEST_JWKS = {
  keys: [
    {
      kty: jwkPublic.kty as string,
      kid: TEST_KID,
      use: 'sig',
      alg: 'RS256',
      n: jwkPublic.n as string,
      e: jwkPublic.e as string,
    },
  ],
};

export { TEST_KID };

// ---------------------------------------------------------------------------
// Base64-URL encoding (no padding, URL-safe alphabet)
// ---------------------------------------------------------------------------

function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64url');
}

// ---------------------------------------------------------------------------
// JWT signing
// ---------------------------------------------------------------------------

export interface TestJWTClaims {
  sub?: string;
  email?: string;
  iss?: string;
  aud?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

/**
 * Signs a real RS256 JWT using the test private key.
 *
 * The token is structurally identical to what Clerk issues — header with
 * `alg: RS256` and `kid`, payload with standard claims. The real
 * `jwt.ts` verification path (Web Crypto) will accept it when the
 * JWKS mock returns the matching public key.
 */
export function signTestJWT(claims?: TestJWTClaims): string {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: TEST_KID,
  };

  // [SEC-1 / BUG-717] verifyClerkJWT now hard-fails on undefined audience and
  // the verifier checks the token's aud claim against CLERK_AUDIENCE. Default
  // to the same value buildIntegrationEnv() sets so tokens validate end-to-end.
  // Tests can still override aud via the claims arg to drive negative cases.
  const payload: Record<string, unknown> = {
    sub: 'user_test',
    email: 'test@test.com',
    iss: 'https://clerk.test',
    aud: 'integration-test-audience',
    iat: now,
    exp: now + 3600, // 1 hour
    ...claims,
  };

  // Remove undefined values so they don't appear as `null` in the token
  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined) {
      delete payload[key];
    }
  }

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const signature = sign(
    'sha256',
    Buffer.from(signingInput, 'ascii'),
    privateKey
  );

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

/**
 * Convenience: signs a JWT that expired 1 hour ago.
 */
export function signExpiredJWT(claims?: TestJWTClaims): string {
  const now = Math.floor(Date.now() / 1000);
  return signTestJWT({
    ...claims,
    iat: now - 7200,
    exp: now - 3600,
  });
}

/**
 * Builds HTTP headers with a real signed JWT.
 *
 * Replaces the old `buildAuthHeaders()` that used a dummy
 * `'Bearer valid.jwt.token'` string.
 */
export function buildAuthHeaders(
  claims?: TestJWTClaims,
  profileId?: string
): HeadersInit {
  return {
    Authorization: `Bearer ${signTestJWT(claims)}`,
    'Content-Type': 'application/json',
    ...(profileId ? { 'X-Profile-Id': profileId } : {}),
  };
}
