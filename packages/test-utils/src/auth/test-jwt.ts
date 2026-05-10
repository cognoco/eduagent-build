/**
 * Real-crypto JWT signing utilities for unit and route tests.
 *
 * Generates a fresh RSA-2048 key pair at module load using `node:crypto`.
 * The resulting JWTs are RS256-signed and byte-compatible with the Web Crypto
 * RSASSA-PKCS1-v1_5 verifier in `apps/api/src/middleware/jwt.ts`.
 *
 * Usage in route tests:
 *   1. Mock fetch to return `TEST_JWKS` (the public key).
 *   2. Call `signTestJwt({})` to get a Bearer-ready token.
 *   3. Pass it in the Authorization header.
 */

import { generateKeyPairSync, createPublicKey, sign } from 'node:crypto';

// ---------------------------------------------------------------------------
// Key pair — generated once per test run
// ---------------------------------------------------------------------------

export const TEST_KID = 'test-utils-kid';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Export the public key as JWK (matches what crypto.subtle.importKey expects)
const _jwkPublic = createPublicKey(publicKey).export({ format: 'jwk' });

// ---------------------------------------------------------------------------
// Public JWKS — serve from mock JWKS endpoint
// ---------------------------------------------------------------------------

/** JWKS response shape. Return this from your mocked fetch for JWKS URLs. */
export const TEST_JWKS = {
  keys: [
    {
      kty: _jwkPublic.kty as string,
      kid: TEST_KID,
      use: 'sig',
      alg: 'RS256',
      n: _jwkPublic.n as string,
      e: _jwkPublic.e as string,
    },
  ],
};

// ---------------------------------------------------------------------------
// Public key as a single JWK (for passing directly to verifyJWT)
// ---------------------------------------------------------------------------

/** Returns the JWK form of the test public key. */
export function getTestPublicJwk(): {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
} {
  return {
    kty: _jwkPublic.kty as string,
    kid: TEST_KID,
    use: 'sig',
    alg: 'RS256',
    n: _jwkPublic.n as string,
    e: _jwkPublic.e as string,
  };
}

// ---------------------------------------------------------------------------
// Base64-URL encoding (no padding, URL-safe alphabet)
// ---------------------------------------------------------------------------

function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64url');
}

// ---------------------------------------------------------------------------
// JWT payload type
// ---------------------------------------------------------------------------

export interface JWTPayload {
  sub?: string;
  email?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// JWT signing
// ---------------------------------------------------------------------------

/**
 * Signs a real RS256 JWT using the test private key.
 *
 * Defaults:
 *   - sub: 'user_test'
 *   - email: 'test@example.com'
 *   - iat: now
 *   - exp: now + 3600
 *   - kid: TEST_KID (in header)
 *
 * Pass `payload` overrides to customise claims. Pass `exp` in the past to
 * produce an expired token for negative-path tests.
 *
 * @returns A dot-separated JWT string (not prefixed with "Bearer ").
 */
export function signTestJwt(payload: Partial<JWTPayload> = {}): string {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: TEST_KID,
  };

  const claims: Record<string, unknown> = {
    sub: 'user_test',
    email: 'test@example.com',
    iat: now,
    exp: now + 3600,
    ...payload,
  };

  // Remove undefined values so they don't appear as `null` in the token
  for (const key of Object.keys(claims)) {
    if (claims[key] === undefined) {
      delete claims[key];
    }
  }

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(claims));
  const signingInput = `${headerB64}.${payloadB64}`;

  // node:crypto.sign with 'sha256' algorithm produces PKCS#1 v1.5 RS256 —
  // byte-compatible with Web Crypto RSASSA-PKCS1-v1_5 / SHA-256.
  const signature = sign(
    'sha256',
    Buffer.from(signingInput, 'ascii'),
    privateKey,
  );

  return `${signingInput}.${base64UrlEncode(signature)}`;
}
