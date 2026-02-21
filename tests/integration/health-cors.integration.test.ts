/**
 * Integration: Health endpoint + CORS middleware
 *
 * Exercises the real middleware chain (CORS → requestLogger → auth → DB → ...)
 * via Hono's app.request(). Only external dependencies are mocked.
 *
 * Validates:
 * 1. Health returns 200 with correct body shape
 * 2. CORS allows localhost and production origins
 * 3. CORS rejects unknown origins
 * 4. Preflight OPTIONS returns correct Allow-Headers/Methods
 * 5. CORS runs before auth — OPTIONS works without a token
 */

// --- Mocks (must be before imports) ---

// Mock JWT module — not called for public paths but imported at module level
jest.mock('../../apps/api/src/middleware/jwt', () => ({
  decodeJWTHeader: jest.fn(),
  fetchJWKS: jest.fn(),
  verifyJWT: jest.fn(),
}));

// Mock database — no real PostgreSQL
jest.mock('@eduagent/database', () => ({
  createDatabase: jest.fn().mockReturnValue({}),
}));

// Mock Inngest client — inngest function files call createFunction() at import time
jest.mock('../../apps/api/src/inngest/client', () => {
  let fnCounter = 0;
  return {
    inngest: {
      send: jest.fn().mockResolvedValue({ ids: [] }),
      createFunction: jest.fn().mockImplementation((config) => {
        const id = config?.id ?? `mock-fn-${fnCounter++}`;
        const fn = jest.fn();
        (fn as any).getConfig = () => [
          { id, name: id, triggers: [], steps: {} },
        ];
        return fn;
      }),
    },
  };
});

// Mock services imported by route modules
jest.mock('../../apps/api/src/services/account', () => ({
  findOrCreateAccount: jest.fn().mockResolvedValue({
    id: '00000000-0000-4000-8000-000000000001',
    clerkUserId: 'user_test',
    email: 'test@test.com',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
}));

jest.mock('../../apps/api/src/services/billing', () => ({
  ensureFreeSubscription: jest.fn().mockResolvedValue({
    id: '00000000-0000-4000-8000-000000000005',
    accountId: '00000000-0000-4000-8000-000000000001',
    tier: 'free',
    status: 'trial',
    stripeSubscriptionId: null,
  }),
  getQuotaPool: jest.fn().mockResolvedValue({
    id: '00000000-0000-4000-8000-000000000006',
    subscriptionId: '00000000-0000-4000-8000-000000000005',
    monthlyLimit: 50,
    usedThisMonth: 0,
  }),
  decrementQuota: jest.fn().mockResolvedValue({
    success: true,
    remainingMonthly: 49,
    remainingTopUp: 0,
  }),
}));

jest.mock('../../apps/api/src/services/settings', () => ({
  shouldPromptCasualSwitch: jest.fn().mockResolvedValue(false),
}));

jest.mock('../../apps/api/src/services/session', () => ({
  startSession: jest.fn(),
  getSession: jest.fn(),
  processMessage: jest.fn(),
  streamMessage: jest.fn(),
  closeSession: jest.fn(),
  flagContent: jest.fn(),
  getSessionSummary: jest.fn(),
  submitSummary: jest.fn(),
}));

jest.mock('../../apps/api/src/services/llm', () => ({
  routeAndCall: jest.fn(),
  routeAndStream: jest.fn(),
  registerProvider: jest.fn(),
  createMockProvider: jest.fn(),
}));

import { app } from '../../apps/api/src/index';

// ---------------------------------------------------------------------------
// Health endpoint
// ---------------------------------------------------------------------------

describe('Integration: Health endpoint', () => {
  it('returns 200 with status ok and timestamp', async () => {
    const res = await app.request('/v1/health');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
    expect(typeof body.timestamp).toBe('string');
  });

  it('requires no authentication', async () => {
    // No Authorization header at all
    const res = await app.request('/v1/health');
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
    'https://eduagent.app',
    'https://app.eduagent.app',
  ];

  const BLOCKED_ORIGINS = [
    'https://evil.com',
    'https://localhost.evil.com',
    'https://eduagent.app.evil.com',
  ];

  describe('preflight OPTIONS', () => {
    it.each(LOCALHOST_ORIGINS)('accepts preflight from %s', async (origin) => {
      const res = await app.request('/v1/health', {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Authorization, Content-Type',
        },
      });

      expect(res.status).toBeLessThan(400);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    });

    it.each(PRODUCTION_ORIGINS)('accepts preflight from %s', async (origin) => {
      const res = await app.request('/v1/health', {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Authorization',
        },
      });

      expect(res.status).toBeLessThan(400);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    });

    it.each(BLOCKED_ORIGINS)('rejects preflight from %s', async (origin) => {
      const res = await app.request('/v1/health', {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
        },
      });

      expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe(origin);
    });

    it('returns all required Allow-Methods', async () => {
      const res = await app.request('/v1/health', {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:8081',
          'Access-Control-Request-Method': 'POST',
        },
      });

      const methods = res.headers.get('Access-Control-Allow-Methods') ?? '';
      for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        expect(methods.toUpperCase()).toContain(m);
      }
    });

    it('returns all required Allow-Headers', async () => {
      const res = await app.request('/v1/health', {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:8081',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers':
            'Authorization, Content-Type, X-Profile-Id',
        },
      });

      const allowed = (
        res.headers.get('Access-Control-Allow-Headers') ?? ''
      ).toLowerCase();
      expect(allowed).toContain('authorization');
      expect(allowed).toContain('content-type');
      expect(allowed).toContain('x-profile-id');
    });

    it('includes Access-Control-Allow-Credentials', async () => {
      const res = await app.request('/v1/health', {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:8081',
          'Access-Control-Request-Method': 'POST',
        },
      });

      expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    });
  });

  describe('middleware ordering (CORS before auth)', () => {
    it('OPTIONS on protected path succeeds without Authorization', async () => {
      // CORS preflight must succeed even for protected routes — no Bearer token
      const res = await app.request('/v1/profiles', {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:8081',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Authorization, Content-Type',
        },
      });

      expect(res.status).toBeLessThan(400);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
        'http://localhost:8081'
      );
    });
  });

  describe('actual cross-origin requests', () => {
    it('includes CORS headers on GET /v1/health', async () => {
      const res = await app.request('/v1/health', {
        headers: { Origin: 'http://localhost:8081' },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
        'http://localhost:8081'
      );
    });
  });
});
