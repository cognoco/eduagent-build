/**
 * Integration: Auth middleware chain
 *
 * Exercises the real auth middleware via Hono's app.request().
 * JWT verification is mocked with controllable behavior per test.
 *
 * Validates:
 * 1. Public paths (/v1/health, /v1/inngest, /v1/auth/*, /v1/stripe/*, /v1/consent/respond) skip auth
 * 2. Protected paths without Authorization header → 401 UNAUTHORIZED
 * 3. Protected paths with non-Bearer auth → 401
 * 4. Protected paths with invalid/expired JWT → 401
 * 5. Protected paths with valid JWT → passes auth (not 401)
 * 6. Missing CLERK_JWKS_URL → 401 (config error caught gracefully)
 */

// --- Controllable JWT mock ---

import {
  jwtMock,
  databaseMock,
  inngestClientMock,
  accountMock,
  billingMock,
  settingsMock,
  sessionMock,
  llmMock,
  configureValidJWT as configureValidJWTHelper,
  configureInvalidJWT as configureInvalidJWTHelper,
} from './mocks';

const jwtMocks = jwtMock();
jest.mock('../../apps/api/src/middleware/jwt', () => jwtMocks);

// --- Base mocks ---

jest.mock('@eduagent/database', () => databaseMock());
jest.mock('../../apps/api/src/inngest/client', () => inngestClientMock());
jest.mock('../../apps/api/src/services/account', () => accountMock());
jest.mock('../../apps/api/src/services/billing', () => billingMock());
jest.mock('../../apps/api/src/services/settings', () => settingsMock());
jest.mock('../../apps/api/src/services/session', () => sessionMock());
jest.mock('../../apps/api/src/services/llm', () => llmMock());

import { app } from '../../apps/api/src/index';

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
};

// Helper: configure JWT mock to return a valid payload
function configureValidJWT(): void {
  configureValidJWTHelper(jwtMocks, {
    sub: 'user_auth_test',
    email: 'auth@test.com',
  });
}

// Helper: configure JWT mock to throw (simulates invalid/expired token)
function configureInvalidJWT(): void {
  configureInvalidJWTHelper(jwtMocks);
}

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
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 without Authorization header', async () => {
    const res = await app.request('/v1/profiles', { method: 'GET' }, TEST_ENV);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
    expect(body.message).toBeDefined();
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

  it('returns 401 with invalid JWT', async () => {
    configureInvalidJWT();

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

  it('passes auth with valid JWT (response is not 401)', async () => {
    configureValidJWT();

    const res = await app.request(
      '/v1/profiles',
      {
        method: 'GET',
        headers: {
          Authorization: 'Bearer valid.jwt.token',
          'Content-Type': 'application/json',
        },
      },
      TEST_ENV
    );

    // Auth middleware passed — downstream may return any status, but NOT 401
    expect(res.status).not.toBe(401);
    expect(jwtMocks.verifyJWT).toHaveBeenCalled();
  });

  it('returns 401 when CLERK_JWKS_URL is missing', async () => {
    configureValidJWT();

    // Pass env WITHOUT CLERK_JWKS_URL — verifyClerkJWT throws "not configured"
    const res = await app.request(
      '/v1/profiles',
      {
        method: 'GET',
        headers: { Authorization: 'Bearer valid.jwt.token' },
      },
      {} // empty env — no CLERK_JWKS_URL
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
