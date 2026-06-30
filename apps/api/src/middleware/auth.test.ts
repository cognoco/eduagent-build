import { Hono } from 'hono';
import { authMiddleware } from './auth';
import type { AuthEnv } from './auth';
import { BASE_AUTH_ENV } from '../test-utils/test-env';

// ---------------------------------------------------------------------------
// Mock sentry + logger — external observability boundaries
// ---------------------------------------------------------------------------

jest.mock('../services/sentry', () => {
  const actual = jest.requireActual(
    '../services/sentry',
  ) as typeof import('../services/sentry');
  return {
    ...actual,
    captureException: jest.fn(),
    addBreadcrumb: jest.fn(),
  };
});

jest.mock('../services/logger', () => {
  const actual = jest.requireActual(
    '../services/logger',
  ) as typeof import('../services/logger');
  const instance = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return {
    ...actual,
    __loggerInstance: instance,
    createLogger: jest.fn(() => instance),
  };
});

const sentryMock = require('../services/sentry') as {
  captureException: jest.Mock;
  addBreadcrumb: jest.Mock;
};

const loggerMock = (
  require('../services/logger') as {
    __loggerInstance: {
      debug: jest.Mock;
      info: jest.Mock;
      warn: jest.Mock;
      error: jest.Mock;
    };
  }
).__loggerInstance;

// ---------------------------------------------------------------------------
// Mock jwt.ts — avoids real Web Crypto / JWKS calls in unit tests
// ---------------------------------------------------------------------------

jest.mock('./jwt', () => {
  const actual = jest.requireActual('./jwt') as typeof import('./jwt');
  return {
    ...actual,
    ...require('../test-utils/auth-fixture').createJwtModuleMock({
      payload: { sub: 'user_default' },
    }),
  };
});

const jwtMock = require('./jwt') as {
  verifyJWT: jest.Mock;
  decodeJWTHeader: jest.Mock;
  fetchJWKS: jest.Mock;
  lookupJWKByKid: jest.Mock;
};

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const TEST_ENV = { ...BASE_AUTH_ENV };

function createTestApp() {
  const app = new Hono<AuthEnv>().basePath('/v1');

  app.use('*', authMiddleware);

  // Public route
  app.get('/health', (c) => c.json({ status: 'ok' }));

  // Protected route
  app.get('/me', (c) => {
    const user = c.get('user');
    return c.json({
      userId: user.userId,
      email: user.email,
      factorVerificationAge: user.factorVerificationAge,
    });
  });

  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('authMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore persistent mock implementations that clearAllMocks() resets in Jest 30.
    jwtMock.decodeJWTHeader.mockReturnValue({ alg: 'RS256', kid: 'test-kid' });
    jwtMock.fetchJWKS.mockResolvedValue({
      keys: [{ kty: 'RSA', kid: 'test-kid', n: 'fake-n', e: 'AQAB' }],
    });
    // [BUG-492] auth.ts now resolves the signing key via lookupJWKByKid
    jwtMock.lookupJWKByKid.mockResolvedValue({
      kty: 'RSA',
      kid: 'test-kid',
      n: 'fake-n',
      e: 'AQAB',
    });
    // Default verifyJWT resolution; individual tests override with mockResolvedValueOnce
    jwtMock.verifyJWT.mockResolvedValue({
      sub: 'user_default',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    // sentry mocks are cleared by clearAllMocks(); no persistent implementations needed
  });

  describe('public paths', () => {
    it('bypasses auth for /v1/health', async () => {
      const app = createTestApp();
      const res = await app.request('/v1/health', {}, TEST_ENV);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
      // verifyJWT should never be called for public routes
      expect(jwtMock.verifyJWT).not.toHaveBeenCalled();
    });

    it('bypasses auth for /v1/inngest sub-paths', async () => {
      const app = createTestApp();
      app.post('/inngest/webhook', (c) => c.json({ ok: true }));

      const res = await app.request(
        '/v1/inngest/webhook',
        { method: 'POST' },
        TEST_ENV,
      );

      // Route exists and middleware did not block it
      expect(res.status).toBe(200);
      expect(jwtMock.verifyJWT).not.toHaveBeenCalled();
    });

    // [BUG-647 / FCR-2026-05-23-L2.M2.4] Break test: the '/v1/stripe/' prefix
    // entry previously auth-bypassed every /v1/stripe/* path, not just the
    // signature-verified webhook. Any arbitrary path under /v1/stripe/ must
    // now require auth — only the exact /v1/stripe/webhook bypasses.
    it('[BUG-647] requires auth for arbitrary /v1/stripe/* sub-paths (not just /webhook)', async () => {
      const app = createTestApp();
      app.get('/stripe/arbitrary-future-route', (c) => c.json({ ok: true }));

      const res = await app.request(
        '/v1/stripe/arbitrary-future-route',
        {},
        TEST_ENV,
      );

      // Must be 401 — middleware must NOT treat this as a public webhook path.
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('UNAUTHORIZED');
      expect(jwtMock.verifyJWT).not.toHaveBeenCalled();
    });

    it('[BUG-647] still bypasses auth for exact /v1/stripe/webhook', async () => {
      const app = createTestApp();
      app.post('/stripe/webhook', (c) => c.json({ ok: true }));

      const res = await app.request(
        '/v1/stripe/webhook',
        { method: 'POST' },
        TEST_ENV,
      );

      // Route exists and middleware did not block it
      expect(res.status).toBe(200);
      expect(jwtMock.verifyJWT).not.toHaveBeenCalled();
    });

    it('requires auth for /v1/auth/* paths — must never be in PUBLIC_PATHS [BUG-1007]', async () => {
      const app = createTestApp();
      app.post('/auth/register', (c) => c.json({ ok: true }));

      const res = await app.request(
        '/v1/auth/register',
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
      expect(jwtMock.verifyJWT).not.toHaveBeenCalled();
    });
  });

  describe('missing or malformed Authorization header', () => {
    it('returns 401 when Authorization header is absent', async () => {
      const app = createTestApp();
      const res = await app.request('/v1/me', {}, TEST_ENV);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('UNAUTHORIZED');
      expect(body.message).toBe('Missing or invalid authorization header');
    });

    it('returns 401 when Authorization header is not Bearer', async () => {
      const app = createTestApp();
      const res = await app.request(
        '/v1/me',
        {
          headers: { Authorization: 'Basic dXNlcjpwYXNz' },
        },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('invalid token', () => {
    it('returns 401 when JWT verification fails', async () => {
      jwtMock.verifyJWT.mockRejectedValueOnce(new Error('signature mismatch'));

      const app = createTestApp();
      const res = await app.request(
        '/v1/me',
        {
          headers: { Authorization: 'Bearer invalid.jwt.token' },
        },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('UNAUTHORIZED');
      expect(body.message).toBe('Invalid or expired token');
    });
  });

  // [SEC-1 / BUG-717] Break test: missing CLERK_AUDIENCE must reject requests.
  // Pre-fix: audience=undefined silently skipped aud claim validation.
  // Post-fix: verifyClerkJWT throws immediately → returns 401.
  describe('[SEC-1 / BUG-717] JWT audience validation', () => {
    it('returns 401 when CLERK_AUDIENCE is not configured', async () => {
      // Do NOT queue a mockResolvedValueOnce here — the guard fires BEFORE
      // verifyJWT is called when audience is absent, so queuing a value would
      // leave it unconsumed and bleed into subsequent tests.
      const app = createTestApp();
      const res = await app.request(
        '/v1/me',
        {
          headers: { Authorization: 'Bearer valid.jwt.token' },
        },
        // No CLERK_AUDIENCE — audience validation must reject
        { CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json' },
      );

      expect(res.status).toBe(401);
      // verifyJWT is never reached — guard fires before JWKS fetch
      expect(jwtMock.verifyJWT).not.toHaveBeenCalled();
      // decodeJWTHeader and fetchJWKS also must not be called
      expect(jwtMock.decodeJWTHeader).not.toHaveBeenCalled();
      expect(jwtMock.fetchJWKS).not.toHaveBeenCalled();
    });

    it('accepts valid token when CLERK_AUDIENCE is present', async () => {
      jwtMock.verifyJWT.mockResolvedValueOnce({
        sub: 'user_sec1',
        email: 'user@test.com',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const app = createTestApp();
      const res = await app.request(
        '/v1/me',
        {
          headers: { Authorization: 'Bearer valid.jwt.token' },
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
    });
  });

  // [Finding #3] Structured logging for JWKS/network failures vs. normal token failures
  describe('error classification: JWKS/network failures vs. token validation failures', () => {
    it('calls captureException when verifyJWT rejects with a JWKS fetch error', async () => {
      jwtMock.verifyJWT.mockRejectedValueOnce(
        new Error('Failed to fetch JWKS: 503 Service Unavailable'),
      );

      const app = createTestApp();
      await app.request(
        '/v1/me',
        { headers: { Authorization: 'Bearer some.jwt.token' } },
        TEST_ENV,
      );

      expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
      expect(sentryMock.addBreadcrumb).not.toHaveBeenCalled();
    });

    it('calls captureException when verifyJWT rejects with an AbortError (timeout)', async () => {
      const abortError = new DOMException(
        'The user aborted a request.',
        'AbortError',
      );
      jwtMock.verifyJWT.mockRejectedValueOnce(abortError);

      const app = createTestApp();
      await app.request(
        '/v1/me',
        { headers: { Authorization: 'Bearer some.jwt.token' } },
        TEST_ENV,
      );

      expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
      expect(sentryMock.addBreadcrumb).not.toHaveBeenCalled();
    });

    // [BUG-1] Non-infra (token-validation) failures must surface a queryable
    // signal — not just a breadcrumb, which is dropped if no exception fires
    // later in the request. Before the fix, a sustained spike of expired/
    // invalid/forged tokens was invisible to alerting. We use a structured
    // `logger.warn` (alertable on 24h log-aggregation volume) and NOT a
    // Sentry `captureMessage`: under a token-flood this runs on every
    // request and would burn Sentry quota / bury real signal.
    it('[BUG-1] logs structured warn (not captureException) for normal token validation failures', async () => {
      jwtMock.verifyJWT.mockRejectedValueOnce(
        new Error('Invalid JWT: expired'),
      );

      const app = createTestApp();
      const res = await app.request(
        '/v1/me',
        { headers: { Authorization: 'Bearer some.jwt.token' } },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
      // Must not flood Sentry exception alerts on every expired token —
      // captureException is reserved for infra failures.
      expect(sentryMock.captureException).not.toHaveBeenCalled();
      // [WI-1009] addBreadcrumb is dead code on this path (drops unless an
      // enclosing exception fires, which it does not here). Removed.
      expect(sentryMock.addBreadcrumb).not.toHaveBeenCalled();
      // The queryable signal — alertable on 24h volume via log aggregation.
      // event field is required for log-aggregation queries.
      expect(loggerMock.warn).toHaveBeenCalledWith(
        'JWT validation failed',
        expect.objectContaining({
          event: 'jwt.validation_failed',
          error: 'Invalid JWT: expired',
          errorName: 'Error',
          path: '/v1/me',
        }),
      );
    });

    // [#2 HIGH — JWKS infra outage → mass forced sign-out]
    // Previously the infra-failure branch returned 401, which the mobile client
    // treats as session-expired (api-client.ts signs out on res.status === 401).
    // A Clerk JWKS outage would force-sign-out every active user at once. The
    // infra branch now returns 503 + Retry-After so the client retries instead
    // of nuking the session. A genuinely invalid/expired token still returns 401.
    it('[#2] returns 503 with Retry-After when JWKS fetch fails (infra outage — must NOT sign user out)', async () => {
      // Simulate the external JWKS lookup boundary throwing a fetch failure.
      jwtMock.lookupJWKByKid.mockRejectedValueOnce(
        new Error('Failed to fetch JWKS: network error'),
      );

      const app = createTestApp();
      const res = await app.request(
        '/v1/me',
        { headers: { Authorization: 'Bearer some.jwt.token' } },
        TEST_ENV,
      );

      // 503 — NOT 401. 401 would trigger client sign-out.
      expect(res.status).toBe(503);
      expect(res.headers.get('Retry-After')).toBe('30');
      const body = await res.json();
      expect(body.code).toBe('SERVICE_UNAVAILABLE');
      // Infra failures are still captured to Sentry for alerting.
      expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
    });

    it('[#2] returns 503 when the JWKS fetch aborts (timeout)', async () => {
      const abortError = new DOMException(
        'The user aborted a request.',
        'AbortError',
      );
      jwtMock.lookupJWKByKid.mockRejectedValueOnce(abortError);

      const app = createTestApp();
      const res = await app.request(
        '/v1/me',
        { headers: { Authorization: 'Bearer some.jwt.token' } },
        TEST_ENV,
      );

      expect(res.status).toBe(503);
      expect(res.headers.get('Retry-After')).toBe('30');
    });

    it('[#2] still returns 401 for a genuinely invalid/expired token (not infra)', async () => {
      jwtMock.verifyJWT.mockRejectedValueOnce(
        new Error('Invalid JWT: signature mismatch'),
      );

      const app = createTestApp();
      const res = await app.request(
        '/v1/me',
        { headers: { Authorization: 'Bearer some.jwt.token' } },
        TEST_ENV,
      );

      // A real bad token still expires the session — 401 is correct here.
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('UNAUTHORIZED');
      expect(body.message).toBe('Invalid or expired token');
    });
  });

  // [F-021] JWT trust-boundary validation — Zod schema enforces sub is present
  // and a non-empty string. Without this, a malformed token that passes
  // cryptographic verification but has no sub (or sub: null / sub: '') could
  // slip through and produce an AuthUser with an empty userId.
  //
  // Red-green: without the clerkJWTClaimsSchema.safeParse() call, a payload
  // with no sub would reach the `return { sub: claims.data.sub, ... }` block
  // and produce `userId: undefined`, which would break every downstream guard.
  describe('[F-021] JWT claims Zod validation', () => {
    it('[BREAK F-021] returns 401 when JWT payload is missing sub', async () => {
      // Token passes cryptographic verification but carries no sub
      jwtMock.verifyJWT.mockResolvedValueOnce({
        // sub intentionally absent
        email: 'test@example.com',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const app = createTestApp();
      const res = await app.request(
        '/v1/me',
        { headers: { Authorization: 'Bearer valid.jwt.token' } },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('[BREAK F-021] returns 401 when JWT sub is an empty string', async () => {
      jwtMock.verifyJWT.mockResolvedValueOnce({
        sub: '',
        email: 'test@example.com',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const app = createTestApp();
      const res = await app.request(
        '/v1/me',
        { headers: { Authorization: 'Bearer valid.jwt.token' } },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });

    it('accepts a JWT with a valid sub and optional email', async () => {
      jwtMock.verifyJWT.mockResolvedValueOnce({
        sub: 'user_f021_test',
        email: 'claims@test.com',
        email_verified: true,
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const app = createTestApp();
      const res = await app.request(
        '/v1/me',
        { headers: { Authorization: 'Bearer valid.jwt.token' } },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.userId).toBe('user_f021_test');
    });

    it('[WI-301] parses Clerk fva from JWT claims', async () => {
      jwtMock.verifyJWT.mockResolvedValueOnce({
        sub: 'user_fva_test',
        email: 'claims@test.com',
        email_verified: true,
        fva: [2, -1],
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const app = createTestApp();
      const res = await app.request(
        '/v1/me',
        { headers: { Authorization: 'Bearer valid.jwt.token' } },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.factorVerificationAge).toEqual([2, -1]);
    });

    it('[WI-301] leaves factorVerificationAge undefined when fva is absent', async () => {
      jwtMock.verifyJWT.mockResolvedValueOnce({
        sub: 'user_no_fva_test',
        email: 'claims@test.com',
        email_verified: true,
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const app = createTestApp();
      const res = await app.request(
        '/v1/me',
        { headers: { Authorization: 'Bearer valid.jwt.token' } },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.factorVerificationAge).toBeUndefined();
    });
  });

  describe('valid token', () => {
    it('sets user context and proceeds to handler', async () => {
      jwtMock.verifyJWT.mockResolvedValueOnce({
        sub: 'user_abc123',
        email: 'test@example.com',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const app = createTestApp();
      const res = await app.request(
        '/v1/me',
        {
          headers: { Authorization: 'Bearer valid.jwt.token' },
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.userId).toBe('user_abc123');
      expect(body.email).toBe('test@example.com');
    });

    it('handles token with no email claim', async () => {
      jwtMock.verifyJWT.mockResolvedValueOnce({
        sub: 'user_no_email',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const app = createTestApp();
      const res = await app.request(
        '/v1/me',
        {
          headers: { Authorization: 'Bearer valid.jwt.token' },
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.userId).toBe('user_no_email');
      expect(body.email).toBeUndefined();
    });
  });
});
