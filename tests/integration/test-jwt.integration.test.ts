/**
 * Unit tests for the test-jwt helper.
 *
 * Verifies that:
 *  1. signTestJwt produces a structurally valid 3-segment JWT.
 *  2. A signed token verifies against TEST_JWKS via the real verifyJWT
 *     implementation from apps/api/src/middleware/jwt.ts.
 *  3. An expired token is rejected.
 *  4. A token signed with a different key is rejected.
 */

import { generateKeyPairSync, sign } from 'node:crypto';
import {
  signTestJwt,
  TEST_KID,
  TEST_JWKS,
  getTestPublicJwk,
} from '../../packages/test-utils/src/auth/test-jwt.js';
import {
  verifyJWT,
  fetchJWKS,
  clearJWKSCache,
} from '../../apps/api/src/middleware/jwt.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64url');
}

// ---------------------------------------------------------------------------
// Test 1: signTestJwt produces a 3-segment JWT
// ---------------------------------------------------------------------------

describe('signTestJwt', () => {
  it('produces a 3-segment JWT string', () => {
    const token = signTestJwt({});
    const segments = token.split('.');
    expect(segments).toHaveLength(3);
    segments.forEach((seg) => expect(seg.length).toBeGreaterThan(0));
  });

  it('encodes the correct kid in the header', () => {
    const token = signTestJwt({});
    const [headerB64] = token.split('.');
    const header = JSON.parse(
      Buffer.from(headerB64!, 'base64url').toString('utf8')
    );
    expect(header.kid).toBe(TEST_KID);
    expect(header.alg).toBe('RS256');
  });

  it('applies default claims', () => {
    const token = signTestJwt({});
    const [, payloadB64] = token.split('.');
    const payload = JSON.parse(
      Buffer.from(payloadB64!, 'base64url').toString('utf8')
    );
    expect(payload.sub).toBe('user_test');
    expect(payload.email).toBe('test@example.com');
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it('merges caller-provided claims over defaults', () => {
    const token = signTestJwt({ sub: 'custom_user', email: 'x@y.com' });
    const [, payloadB64] = token.split('.');
    const payload = JSON.parse(
      Buffer.from(payloadB64!, 'base64url').toString('utf8')
    );
    expect(payload.sub).toBe('custom_user');
    expect(payload.email).toBe('x@y.com');
  });
});

// ---------------------------------------------------------------------------
// Test 2: signed JWT verifies against TEST_JWKS via real verifyJWT
// ---------------------------------------------------------------------------

describe('signTestJwt + verifyJWT integration', () => {
  beforeEach(() => {
    clearJWKSCache();
  });

  afterEach(() => {
    clearJWKSCache();
  });

  it('verifies a valid signed JWT using the test public key directly', async () => {
    const token = signTestJwt({ sub: 'integration_user' });
    const jwk = getTestPublicJwk();

    const payload = await verifyJWT(token, jwk);

    expect(payload.sub).toBe('integration_user');
  });

  it('verifies a valid signed JWT via fetchJWKS mock returning TEST_JWKS', async () => {
    // Mock global fetch so fetchJWKS returns our TEST_JWKS without a real HTTP call.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => TEST_JWKS,
    }) as unknown as typeof fetch;

    try {
      const jwks = await fetchJWKS(
        'https://mock.clerk.test/.well-known/jwks.json'
      );
      const jwk = jwks.keys.find((k) => k.kid === TEST_KID);
      expect(jwk).toBeDefined();

      const token = signTestJwt({ sub: 'mocked_user' });
      const payload = await verifyJWT(token, jwk!);

      expect(payload.sub).toBe('mocked_user');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// Test 3: expired payload fails verification
// ---------------------------------------------------------------------------

describe('expired token', () => {
  it('fails verification when exp is in the past', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signTestJwt({ iat: now - 7200, exp: now - 3600 });
    const jwk = getTestPublicJwk();

    await expect(verifyJWT(token, jwk)).rejects.toThrow('token has expired');
  });
});

// ---------------------------------------------------------------------------
// Test 4: token signed with a different key fails verification
// ---------------------------------------------------------------------------

describe('wrong key', () => {
  it('fails verification when signed with a different private key', async () => {
    // Generate a separate key pair unrelated to the test key.
    const { privateKey: otherPrivateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const now = Math.floor(Date.now() / 1000);
    const header = JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: TEST_KID });
    const payload = JSON.stringify({
      sub: 'attacker',
      iat: now,
      exp: now + 3600,
    });

    const headerB64 = base64UrlEncode(header);
    const payloadB64 = base64UrlEncode(payload);
    const signingInput = `${headerB64}.${payloadB64}`;
    const signature = sign(
      'sha256',
      Buffer.from(signingInput, 'ascii'),
      otherPrivateKey
    );
    const token = `${signingInput}.${base64UrlEncode(signature)}`;

    const jwk = getTestPublicJwk();
    await expect(verifyJWT(token, jwk)).rejects.toThrow(
      'signature verification failed'
    );
  });
});
