// ---------------------------------------------------------------------------
// [BUG-902] Auth middleware — Clerk token max-age ceiling
//
// The Clerk auth path (verifyClerkJWT in auth.ts) passes an explicit
// maxAgeSec = 10 minutes to verifyJWT, overriding the generic 24h default. A
// leaked-but-unexpired Clerk session token (Clerk rotates them ~1 min) must not
// be accepted anywhere near 24h. These tests drive the real authMiddleware
// end-to-end: real RSA keypair, real signed tokens, and the JWKS endpoint
// (Clerk's external boundary) stubbed via global fetch. No internal code is
// mocked.
//
// Break test: bump CLERK_TOKEN_MAX_AGE_SEC back to 24h (or drop the maxAgeSec
// option from the verifyClerkJWT call) and the "rejects a token aged 11 min"
// case flips to 200 — proving the ceiling is load-bearing.
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import { authMiddleware } from './auth';
import { clearJWKSCache } from './jwt';

const JWKS_URL = 'https://clerk.example.com/.well-known/jwks.json';
const ISSUER = 'https://clerk.example.com';
const AUDIENCE = 'eduagent-api';

interface TestKeyMaterial {
  privateKey: CryptoKey;
  publicJwk: JsonWebKey & { kid: string; kty: string };
}

let keyMaterial: TestKeyMaterial;

beforeAll(async () => {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const exported = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  keyMaterial = {
    privateKey: keyPair.privateKey,
    publicJwk: {
      ...exported,
      kty: exported.kty as string,
      kid: 'test-key-1',
      alg: 'RS256',
    },
  };
});

function toBase64Url(obj: Record<string, unknown>): string {
  return btoa(JSON.stringify(obj))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function signClerkToken(
  payload: Record<string, unknown>,
): Promise<string> {
  const headerB64 = toBase64Url({
    alg: 'RS256',
    typ: 'JWT',
    kid: 'test-key-1',
  });
  const payloadB64 = toBase64Url(payload);
  const signingInput = `${headerB64}.${payloadB64}`;
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    keyMaterial.privateKey,
    new TextEncoder().encode(signingInput),
  );
  const bytes = new Uint8Array(signatureBuffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const signatureB64 = btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${signingInput}.${signatureB64}`;
}

/**
 * Build a Hono app whose single route is guarded by the real authMiddleware,
 * returning 200 only when auth passes. Bindings carry the Clerk JWKS/audience
 * config that auth.ts reads off c.env.
 */
function createGuardedApp() {
  const app = new Hono<{
    Bindings: { CLERK_JWKS_URL?: string; CLERK_AUDIENCE?: string };
  }>();
  app.use('*', authMiddleware);
  app.get('/v1/protected', (c) => c.json({ ok: true }));
  return app;
}

async function request(token: string) {
  const app = createGuardedApp();
  return app.request(
    'http://test.local/v1/protected',
    { headers: { Authorization: `Bearer ${token}` } },
    { CLERK_JWKS_URL: JWKS_URL, CLERK_AUDIENCE: AUDIENCE },
  );
}

describe('[BUG-902] authMiddleware Clerk token max-age ceiling', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    clearJWKSCache();
    // Stub the Clerk JWKS endpoint (external boundary). Every fetch in these
    // tests is the JWKS fetch performed by lookupJWKByKid.
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({ keys: [keyMaterial.publicJwk] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('accepts a Clerk token aged 5 minutes (within the 10-minute ceiling)', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signClerkToken({
      sub: 'user-1',
      iss: ISSUER,
      aud: AUDIENCE,
      iat: now - 5 * 60, // 5 min ago
      exp: now + 60 * 60, // far enough that exp is not the gate
    });

    const res = await request(token);
    expect(res.status).toBe(200);
  });

  it('rejects a Clerk token aged 11 minutes (exceeds the 10-minute ceiling) even though exp is in the future', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signClerkToken({
      sub: 'user-1',
      iss: ISSUER,
      aud: AUDIENCE,
      iat: now - 11 * 60, // 11 min ago — past the ceiling
      exp: now + 60 * 60, // exp still valid: only the max-age guard can reject
    });

    const res = await request(token);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { message?: string };
    expect(body.message).toMatch(/Invalid or expired token/);
  });
});
