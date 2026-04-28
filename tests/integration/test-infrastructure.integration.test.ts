/**
 * Tests for the integration test infrastructure itself.
 *
 * Validates that:
 * 1. Test RSA keys produce JWTs that the real jwt.ts Web Crypto verifier accepts
 * 2. The fetch interceptor correctly routes, captures, and rejects calls
 * 3. Per-boundary mocks return expected response shapes
 */

import {
  TEST_JWKS,
  TEST_KID,
  signTestJWT,
  signExpiredJWT,
  buildAuthHeaders,
} from './test-keys';
import {
  installFetchInterceptor,
  restoreFetch,
  addFetchHandler,
  clearFetchHandlers,
  clearFetchCalls,
  getFetchCalls,
  jsonResponse,
} from './fetch-interceptor';
import {
  mockClerkJWKS,
  mockExpoPush,
  mockResendEmail,
  mockVoyageAI,
  mockAllExternalBoundaries,
} from './external-mocks';
import {
  decodeJWTHeader,
  decodeJWTPayload,
  verifyJWT,
  clearJWKSCache,
} from '../../apps/api/src/middleware/jwt';

// ═══════════════════════════════════════════════════════════════════════════
// Test RSA Keys & JWT Signing
// ═══════════════════════════════════════════════════════════════════════════

describe('test-keys', () => {
  describe('TEST_JWKS', () => {
    it('has exactly one key with the expected kid', () => {
      expect(TEST_JWKS.keys).toHaveLength(1);
      expect(TEST_JWKS.keys[0].kid).toBe(TEST_KID);
      expect(TEST_JWKS.keys[0].kty).toBe('RSA');
      expect(TEST_JWKS.keys[0].alg).toBe('RS256');
    });

    it('has n and e fields required for Web Crypto import', () => {
      const key = TEST_JWKS.keys[0];
      expect(typeof key.n).toBe('string');
      expect(typeof key.e).toBe('string');
      expect(key.n!.length).toBeGreaterThan(10);
    });
  });

  describe('signTestJWT', () => {
    it('produces a 3-segment JWT string', () => {
      const token = signTestJWT();
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
      expect(parts.every((p) => p.length > 0)).toBe(true);
    });

    it('encodes the test kid in the header', () => {
      const token = signTestJWT();
      const header = decodeJWTHeader(token);
      expect(header.alg).toBe('RS256');
      expect(header.kid).toBe(TEST_KID);
    });

    it('encodes default claims when called with no arguments', () => {
      const token = signTestJWT();
      const payload = decodeJWTPayload(token);
      expect(payload.sub).toBe('user_test');
      expect(payload.email).toBe('test@test.com');
      expect(payload.iss).toBe('https://clerk.test');
      expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('allows overriding individual claims', () => {
      const token = signTestJWT({
        sub: 'user_custom',
        email: 'custom@test.com',
      });
      const payload = decodeJWTPayload(token);
      expect(payload.sub).toBe('user_custom');
      expect(payload.email).toBe('custom@test.com');
      // Non-overridden defaults still present
      expect(payload.iss).toBe('https://clerk.test');
    });

    it('omits undefined claims rather than serializing them as null', () => {
      // Pass an explicit undefined override so the strip-loop has something to
      // remove. (The aud claim has a non-undefined default for [SEC-1 / BUG-717]
      // so we set it back to undefined here to drive the strip behavior.)
      const token = signTestJWT({ aud: undefined });
      const payload = decodeJWTPayload(token);
      expect(payload).not.toHaveProperty('aud');
    });
  });

  describe('signExpiredJWT', () => {
    it('produces a token with exp in the past', () => {
      const token = signExpiredJWT();
      const payload = decodeJWTPayload(token);
      expect(payload.exp).toBeLessThan(Math.floor(Date.now() / 1000));
    });
  });

  describe('buildAuthHeaders', () => {
    it('produces Authorization header with a signed JWT', () => {
      const headers = buildAuthHeaders() as Record<string, string>;
      expect(headers.Authorization).toMatch(/^Bearer .+\..+\..+$/);
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('includes X-Profile-Id when provided', () => {
      const headers = buildAuthHeaders({}, 'profile-123') as Record<
        string,
        string
      >;
      expect(headers['X-Profile-Id']).toBe('profile-123');
    });

    it('passes claims through to the JWT', () => {
      const headers = buildAuthHeaders({ sub: 'user_abc' }) as Record<
        string,
        string
      >;
      const token = headers.Authorization.replace('Bearer ', '');
      const payload = decodeJWTPayload(token);
      expect(payload.sub).toBe('user_abc');
    });
  });

  // The critical round-trip test: signTestJWT → real verifyJWT (Web Crypto)
  describe('JWT round-trip with real jwt.ts verifier', () => {
    it('verifyJWT accepts a token signed with test keys', async () => {
      const token = signTestJWT({
        sub: 'user_roundtrip',
        email: 'roundtrip@test.com',
        iss: 'https://clerk.test',
      });

      const jwk = TEST_JWKS.keys[0];
      const payload = await verifyJWT(token, jwk, {
        issuer: 'https://clerk.test',
      });

      expect(payload.sub).toBe('user_roundtrip');
      expect(payload.email).toBe('roundtrip@test.com');
    });

    it('verifyJWT rejects an expired token', async () => {
      const token = signExpiredJWT({ iss: 'https://clerk.test' });
      const jwk = TEST_JWKS.keys[0];

      await expect(
        verifyJWT(token, jwk, { issuer: 'https://clerk.test' })
      ).rejects.toThrow('token has expired');
    });

    it('verifyJWT rejects a token with wrong issuer', async () => {
      const token = signTestJWT({ iss: 'https://wrong-issuer.test' });
      const jwk = TEST_JWKS.keys[0];

      await expect(
        verifyJWT(token, jwk, { issuer: 'https://clerk.test' })
      ).rejects.toThrow('issuer mismatch');
    });

    it('verifyJWT validates audience when configured', async () => {
      const token = signTestJWT({
        iss: 'https://clerk.test',
        aud: 'my-audience',
      });
      const jwk = TEST_JWKS.keys[0];

      const payload = await verifyJWT(token, jwk, {
        issuer: 'https://clerk.test',
        audience: 'my-audience',
      });
      expect(payload.aud).toBe('my-audience');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Fetch Interceptor
// ═══════════════════════════════════════════════════════════════════════════

describe('fetch-interceptor', () => {
  beforeAll(() => {
    // Tear down the global passthrough interceptor installed by setup.ts,
    // then reinstall without passthrough so we can test the throw behavior.
    restoreFetch();
    installFetchInterceptor();
  });

  afterAll(() => {
    restoreFetch();
  });

  beforeEach(() => {
    clearFetchHandlers();
    clearFetchCalls();
  });

  it('throws on unmatched URLs', async () => {
    await expect(fetch('https://unknown-service.com/api')).rejects.toThrow(
      '[fetch-interceptor] Unexpected fetch to: GET https://unknown-service.com/api'
    );
  });

  it('routes to a handler by string pattern (substring match)', async () => {
    addFetchHandler('example.com/api', () => jsonResponse({ hello: 'world' }));

    const res = await fetch('https://example.com/api/data');
    const body = await res.json();
    expect(body).toEqual({ hello: 'world' });
  });

  it('routes to a handler by RegExp', async () => {
    addFetchHandler(/example\.com\/v\d+/, () => jsonResponse({ version: 2 }));

    const res = await fetch('https://example.com/v2/stuff');
    const body = await res.json();
    expect(body).toEqual({ version: 2 });
  });

  it('first matching handler wins', async () => {
    addFetchHandler('api.test', () => jsonResponse({ match: 'first' }));
    addFetchHandler('api.test/specific', () =>
      jsonResponse({ match: 'second' })
    );

    const res = await fetch('https://api.test/specific/path');
    const body = await res.json();
    expect(body).toEqual({ match: 'first' });
  });

  it('captures fetch calls with metadata', async () => {
    addFetchHandler('capture.test', () => jsonResponse({}));

    await fetch('https://capture.test/endpoint', {
      method: 'POST',
      headers: { 'X-Custom': 'value' },
      body: JSON.stringify({ key: 'val' }),
    });

    const calls = getFetchCalls('capture.test');
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].headers['X-Custom']).toBe('value');
    expect(JSON.parse(calls[0].body!)).toEqual({ key: 'val' });
  });

  it('getFetchCalls filters by pattern', async () => {
    addFetchHandler('service-a.test', () => jsonResponse({}));
    addFetchHandler('service-b.test', () => jsonResponse({}));

    await fetch('https://service-a.test/api');
    await fetch('https://service-b.test/api');

    expect(getFetchCalls('service-a.test')).toHaveLength(1);
    expect(getFetchCalls('service-b.test')).toHaveLength(1);
    expect(getFetchCalls()).toHaveLength(2);
  });

  it('clearFetchHandlers removes all handlers', async () => {
    addFetchHandler('willclear.test', () => jsonResponse({}));

    clearFetchHandlers();

    await expect(fetch('https://willclear.test/api')).rejects.toThrow(
      'Unexpected fetch'
    );
  });

  it('clearFetchCalls resets call history', async () => {
    addFetchHandler('history.test', () => jsonResponse({}));

    await fetch('https://history.test/api');
    expect(getFetchCalls()).toHaveLength(1);

    clearFetchCalls();
    expect(getFetchCalls()).toHaveLength(0);
  });

  it('records failed calls (unmatched) in call history', async () => {
    try {
      await fetch('https://no-handler.test/path');
    } catch {
      // expected
    }

    const calls = getFetchCalls('no-handler.test');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://no-handler.test/path');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// External Boundary Mocks
// ═══════════════════════════════════════════════════════════════════════════

describe('external-mocks', () => {
  beforeAll(() => {
    // Same as fetch-interceptor: tear down the global passthrough first
    restoreFetch();
    installFetchInterceptor();
  });

  afterAll(() => {
    restoreFetch();
  });

  beforeEach(() => {
    clearFetchHandlers();
    clearFetchCalls();
    clearJWKSCache();
  });

  describe('mockClerkJWKS', () => {
    it('returns TEST_JWKS for JWKS URL', async () => {
      mockClerkJWKS();
      const res = await fetch('https://clerk.test/.well-known/jwks.json');
      const body = await res.json();
      expect(body.keys).toHaveLength(1);
      expect(body.keys[0].kid).toBe(TEST_KID);
    });

    it('nextResponse overrides one call only', async () => {
      const handle = mockClerkJWKS();
      handle.nextResponse(() => jsonResponse({ keys: [] }));

      const res1 = await fetch('https://clerk.test/.well-known/jwks.json');
      const body1 = await res1.json();
      expect(body1.keys).toHaveLength(0);

      // Second call reverts to default
      const res2 = await fetch('https://clerk.test/.well-known/jwks.json');
      const body2 = await res2.json();
      expect(body2.keys).toHaveLength(1);
    });
  });

  describe('mockExpoPush', () => {
    it('returns success response for push API', async () => {
      mockExpoPush();
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        body: JSON.stringify({ to: 'ExponentPushToken[abc]', body: 'hi' }),
      });
      const body = await res.json();
      expect(body.data.status).toBe('ok');
      expect(body.data.id).toBe('mock-receipt-id');
    });

    it('captures push payloads for assertion', async () => {
      mockExpoPush();
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: 'ExponentPushToken[xyz]', body: 'test' }),
      });

      const calls = getFetchCalls('exp.host');
      expect(calls).toHaveLength(1);
      expect(JSON.parse(calls[0].body!).to).toBe('ExponentPushToken[xyz]');
    });
  });

  describe('mockResendEmail', () => {
    it('returns mock email ID', async () => {
      mockResendEmail();
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        body: JSON.stringify({ to: 'user@test.com', subject: 'Hi' }),
      });
      const body = await res.json();
      expect(body.id).toBe('mock-email-id');
    });
  });

  describe('mockVoyageAI', () => {
    it('returns 1024-dimensional embedding', async () => {
      mockVoyageAI();
      const res = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        body: JSON.stringify({ input: ['test text'], model: 'voyage-3.5' }),
      });
      const body = await res.json();
      expect(body.data[0].embedding).toHaveLength(1024);
      expect(body.model).toBe('voyage-3.5');
    });

    it('setDefault permanently changes the response', async () => {
      const handle = mockVoyageAI();
      handle.setDefault(() =>
        jsonResponse({ data: [{ embedding: [1, 2, 3] }], model: 'custom' })
      );

      const res1 = await fetch('https://api.voyageai.com/v1/embeddings');
      const body1 = await res1.json();
      expect(body1.data[0].embedding).toEqual([1, 2, 3]);

      // Persists across calls
      const res2 = await fetch('https://api.voyageai.com/v1/embeddings');
      const body2 = await res2.json();
      expect(body2.data[0].embedding).toEqual([1, 2, 3]);
    });
  });

  describe('mockAllExternalBoundaries', () => {
    it('registers all four boundaries', async () => {
      mockAllExternalBoundaries();

      // All four should respond without throwing
      const [jwks, push, email, voyage] = await Promise.all([
        fetch('https://clerk.test/.well-known/jwks.json'),
        fetch('https://exp.host/--/api/v2/push/send', { method: 'POST' }),
        fetch('https://api.resend.com/emails', { method: 'POST' }),
        fetch('https://api.voyageai.com/v1/embeddings', { method: 'POST' }),
      ]);

      expect(jwks.status).toBe(200);
      expect(push.status).toBe(200);
      expect(email.status).toBe(200);
      expect(voyage.status).toBe(200);
    });

    it('returns individual handles for fine-grained control', async () => {
      const handles = mockAllExternalBoundaries();

      handles.expoPush.nextResponse(() => new Response('', { status: 500 }));

      const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
      });
      expect(pushRes.status).toBe(500);

      // JWKS still works normally
      const jwksRes = await fetch('https://clerk.test/.well-known/jwks.json');
      expect(jwksRes.status).toBe(200);
    });
  });

  // End-to-end: JWKS interceptor + real JWT signing + real JWT verification
  describe('full auth chain round-trip', () => {
    it('fetchJWKS → verifyJWT works with intercepted JWKS + signed JWT', async () => {
      mockClerkJWKS();

      const {
        fetchJWKS: realFetchJWKS,
      } = require('../../apps/api/src/middleware/jwt');

      const jwks = await realFetchJWKS(
        'https://clerk.test/.well-known/jwks.json'
      );
      expect(jwks.keys).toHaveLength(1);

      const token = signTestJWT({
        sub: 'user_e2e',
        email: 'e2e@test.com',
        iss: 'https://clerk.test',
      });

      const jwk = jwks.keys.find((k: { kid: string }) => k.kid === TEST_KID);
      const payload = await verifyJWT(token, jwk, {
        issuer: 'https://clerk.test',
      });

      expect(payload.sub).toBe('user_e2e');
      expect(payload.email).toBe('e2e@test.com');
    });
  });
});
