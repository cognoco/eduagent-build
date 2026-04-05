/**
 * Integration: Health endpoint + CORS middleware
 *
 * Exercises the real middleware chain via Hono's app.request().
 * No app-owned modules are mocked in this suite.
 *
 * Validates:
 * 1. Health returns 200 with correct body shape
 * 2. CORS allows localhost and production origins
 * 3. CORS rejects unknown origins
 * 4. Preflight OPTIONS returns correct Allow-Headers/Methods
 * 5. CORS runs before auth — OPTIONS works without a token
 */

import { app } from '../../apps/api/src/index';

const TEST_ENV = {
  ENVIRONMENT: 'test',
};

// ---------------------------------------------------------------------------
// Health endpoint
// ---------------------------------------------------------------------------

describe('Integration: Health endpoint', () => {
  it('returns 200 with status ok and timestamp', async () => {
    const res = await app.request('/v1/health', {}, TEST_ENV);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
    expect(typeof body.timestamp).toBe('string');
  });

  it('requires no authentication', async () => {
    // No Authorization header at all
    const res = await app.request('/v1/health', {}, TEST_ENV);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// CORS middleware
// ---------------------------------------------------------------------------

describe('Integration: CORS middleware', () => {
  const LOCALHOST_ORIGINS = [
    'http://localhost:8081',
    'http://localhost:19006',
    'http://localhost:3000',
    'http://127.0.0.1:8081',
  ];

  const PRODUCTION_ORIGINS = [
    'https://mentomate.com',
    'https://app.mentomate.com',
  ];

  const BLOCKED_ORIGINS = [
    'https://evil.com',
    'https://localhost.evil.com',
    'https://mentomate.com.evil.com',
    'http://app.mentomate.com', // http rejected for production
  ];

  describe('preflight OPTIONS', () => {
    it.each(LOCALHOST_ORIGINS)('accepts preflight from %s', async (origin) => {
      const res = await app.request(
        '/v1/health',
        {
          method: 'OPTIONS',
          headers: {
            Origin: origin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'Authorization, Content-Type',
          },
        },
        TEST_ENV
      );

      expect(res.status).toBeLessThan(400);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    });

    it.each(PRODUCTION_ORIGINS)('accepts preflight from %s', async (origin) => {
      const res = await app.request(
        '/v1/health',
        {
          method: 'OPTIONS',
          headers: {
            Origin: origin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'Authorization',
          },
        },
        TEST_ENV
      );

      expect(res.status).toBeLessThan(400);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    });

    it.each(BLOCKED_ORIGINS)('rejects preflight from %s', async (origin) => {
      const res = await app.request(
        '/v1/health',
        {
          method: 'OPTIONS',
          headers: {
            Origin: origin,
            'Access-Control-Request-Method': 'POST',
          },
        },
        TEST_ENV
      );

      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('returns all required Allow-Methods', async () => {
      const res = await app.request(
        '/v1/health',
        {
          method: 'OPTIONS',
          headers: {
            Origin: 'http://localhost:8081',
            'Access-Control-Request-Method': 'POST',
          },
        },
        TEST_ENV
      );

      const methods = res.headers.get('Access-Control-Allow-Methods') ?? '';
      for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        expect(methods.toUpperCase()).toContain(m);
      }
    });

    it('returns all required Allow-Headers', async () => {
      const res = await app.request(
        '/v1/health',
        {
          method: 'OPTIONS',
          headers: {
            Origin: 'http://localhost:8081',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers':
              'Authorization, Content-Type, X-Profile-Id',
          },
        },
        TEST_ENV
      );

      const allowed = (
        res.headers.get('Access-Control-Allow-Headers') ?? ''
      ).toLowerCase();
      expect(allowed).toContain('authorization');
      expect(allowed).toContain('content-type');
      expect(allowed).toContain('x-profile-id');
    });

    it('includes Access-Control-Allow-Credentials', async () => {
      const res = await app.request(
        '/v1/health',
        {
          method: 'OPTIONS',
          headers: {
            Origin: 'http://localhost:8081',
            'Access-Control-Request-Method': 'POST',
          },
        },
        TEST_ENV
      );

      expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    });
  });

  describe('middleware ordering (CORS before auth)', () => {
    it('OPTIONS on protected path succeeds without Authorization', async () => {
      // CORS preflight must succeed even for protected routes — no Bearer token
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

      expect(res.status).toBeLessThan(400);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
        'http://localhost:8081'
      );
    });
  });

  describe('actual cross-origin requests', () => {
    it('includes CORS headers on GET /v1/health', async () => {
      const res = await app.request(
        '/v1/health',
        {
          headers: { Origin: 'http://localhost:8081' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
        'http://localhost:8081'
      );
    });
  });
});
