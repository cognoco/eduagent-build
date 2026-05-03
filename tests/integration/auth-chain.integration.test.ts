/**
 * Integration: Auth middleware chain
 *
 * Exercises the REAL auth middleware via Hono's app.request().
 * JWT verification runs through the actual Web Crypto path — no mocks.
 * The only fake is the JWKS fetch, intercepted by the global fetch
 * interceptor (setup.ts) to return test RSA public keys.
 *
 * Validates:
 * 1. Public paths (/v1/health, /v1/inngest, /v1/auth/*, /v1/stripe/*, /v1/consent/respond) skip auth
 * 2. Protected paths without Authorization header → 401 UNAUTHORIZED
 * 3. Protected paths with non-Bearer auth → 401
 * 4. Protected paths with invalid/malformed JWT → 401
 * 5. Protected paths with expired JWT → 401
 * 6. Protected paths with valid JWT → passes auth (not 401)
 * 7. Missing CLERK_JWKS_URL → 401 (config error caught gracefully)
 */

import { buildIntegrationEnv, cleanupAccounts } from './helpers';
import { buildAuthHeaders, signExpiredJWT } from './test-keys';

import { app } from '../../apps/api/src/index';

const AUTH_CLERK_USER_ID = 'integration-auth-user';
const AUTH_EMAIL = 'integration-auth@integration.test';
const TEST_ENV = buildIntegrationEnv();

// ---------------------------------------------------------------------------
// Public paths — auth middleware skips these
// ---------------------------------------------------------------------------

describe('Integration: Auth chain — public paths', () => {
  it('GET /v1/health returns 200 without token', async () => {
    const res = await app.request('/v1/health', {}, TEST_ENV);
    expect(res.status).toBe(200);
  });

  it('POST /v1/inngest returns non-401 without token', async () => {
    // Inngest serve handler may return 4xx/5xx for invalid payload, but not 401
    const res = await app.request('/v1/inngest', { method: 'POST' }, TEST_ENV);
    expect(res.status).not.toBe(401);
  });

  it('/v1/auth/* paths skip authentication', async () => {
    const res = await app.request(
      '/v1/auth/status',
      { method: 'GET' },
      TEST_ENV
    );
    expect(res.status).not.toBe(401);
  });

  it('/v1/consent/respond skips authentication', async () => {
    const res = await app.request(
      '/v1/consent/respond?token=test',
      { method: 'GET' },
      TEST_ENV
    );
    expect(res.status).not.toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Protected paths — auth middleware enforces Bearer token
// ---------------------------------------------------------------------------

describe('Integration: Auth chain — protected paths', () => {
  beforeEach(async () => {
    await cleanupAccounts({
      emails: [AUTH_EMAIL],
      clerkUserIds: [AUTH_CLERK_USER_ID],
    });
  });

  afterAll(async () => {
    await cleanupAccounts({
      emails: [AUTH_EMAIL],
      clerkUserIds: [AUTH_CLERK_USER_ID],
    });
  });

  it('returns 401 without Authorization header', async () => {
    const res = await app.request('/v1/profiles', { method: 'GET' }, TEST_ENV);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
    expect(typeof body.message).toBe('string');
  });

  it('returns 401 with non-Bearer auth scheme', async () => {
    const res = await app.request(
      '/v1/profiles',
      {
        method: 'GET',
        headers: { Authorization: 'Basic dXNlcjpwYXNz' },
      },
      TEST_ENV
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 with malformed JWT', async () => {
    // 'invalid.jwt.token' is not valid base64url JSON — decodeJWTHeader throws
    const res = await app.request(
      '/v1/profiles',
      {
        method: 'GET',
        headers: { Authorization: 'Bearer invalid.jwt.token' },
      },
      TEST_ENV
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 with expired JWT', async () => {
    const expiredToken = signExpiredJWT({
      sub: AUTH_CLERK_USER_ID,
      email: AUTH_EMAIL,
    });

    const res = await app.request(
      '/v1/profiles',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${expiredToken}`,
          'Content-Type': 'application/json',
        },
      },
      TEST_ENV
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('passes auth with valid JWT (response is not 401)', async () => {
    const res = await app.request(
      '/v1/profiles',
      {
        method: 'GET',
        headers: buildAuthHeaders({
          sub: AUTH_CLERK_USER_ID,
          email: AUTH_EMAIL,
        }),
      },
      TEST_ENV
    );

    // Auth middleware passed — real JWT verified via Web Crypto
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.profiles)).toBe(true);
  });

  it('returns 401 when CLERK_JWKS_URL is missing', async () => {
    // verifyClerkJWT throws "CLERK_JWKS_URL is not configured" for empty string
    const res = await app.request(
      '/v1/profiles',
      {
        method: 'GET',
        headers: buildAuthHeaders({
          sub: AUTH_CLERK_USER_ID,
          email: AUTH_EMAIL,
        }),
      },
      buildIntegrationEnv({ CLERK_JWKS_URL: '' })
    );

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Middleware ordering — CORS runs before auth
// ---------------------------------------------------------------------------

describe('Integration: Auth chain — middleware ordering', () => {
  it('OPTIONS preflight on protected path works without token', async () => {
    const res = await app.request(
      '/v1/profiles',
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:8081',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Authorization, Content-Type',
        },
      },
      TEST_ENV
    );

    // CORS handles OPTIONS before auth middleware runs
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'http://localhost:8081'
    );
  });
});
