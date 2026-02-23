/**
 * Integration: Test Seed Endpoints
 *
 * Exercises /__test/seed, /__test/reset, and /__test/scenarios routes
 * via Hono's app.request(). Validates:
 *
 * 1. POST /__test/seed returns 201 with valid scenario data
 * 2. POST /__test/seed rejects invalid scenarios (Zod validation → 400)
 * 3. POST /__test/reset returns 200 with success message
 * 4. GET  /__test/scenarios returns all valid scenario names
 * 5. All endpoints return 403 when ENVIRONMENT=production
 * 6. All endpoints skip authentication (public paths)
 *
 * These endpoints are the foundation for all E2E/Maestro tests.
 */

// --- Mock seedScenario/resetDatabase to avoid real DB ---
const mockSeedScenario = jest.fn();
const mockResetDatabase = jest.fn();

jest.mock('../../apps/api/src/services/test-seed', () => ({
  seedScenario: mockSeedScenario,
  resetDatabase: mockResetDatabase,
  VALID_SCENARIOS: [
    'onboarding-complete',
    'learning-active',
    'retention-due',
    'failed-recall-3x',
    'parent-with-children',
    'trial-active',
    'trial-expired',
    'multi-subject',
  ],
}));

// --- Base mocks (middleware chain requires these) ---

jest.mock('../../apps/api/src/middleware/jwt', () => ({
  decodeJWTHeader: jest.fn(),
  fetchJWKS: jest.fn(),
  verifyJWT: jest.fn(),
}));

jest.mock('@eduagent/database', () => ({
  createDatabase: jest.fn().mockReturnValue({}),
}));

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

const TEST_ENV = {
  ENVIRONMENT: 'development',
  DATABASE_URL: 'postgresql://test:test@localhost/test',
};

const PRODUCTION_ENV = {
  ENVIRONMENT: 'production',
  DATABASE_URL: 'postgresql://test:test@localhost/test',
};

// ---------------------------------------------------------------------------
// Seed endpoint
// ---------------------------------------------------------------------------

describe('Integration: POST /__test/seed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 201 with seeded scenario data', async () => {
    const mockResult = {
      scenario: 'onboarding-complete',
      accountId: 'acc-123',
      profileId: 'prof-456',
      email: 'test-e2e@example.com',
      ids: {},
    };
    mockSeedScenario.mockResolvedValue(mockResult);

    const res = await app.request(
      '/v1/__test/seed',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: 'onboarding-complete',
          email: 'test-e2e@example.com',
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.scenario).toBe('onboarding-complete');
    expect(body.accountId).toBe('acc-123');
    expect(body.profileId).toBe('prof-456');
    expect(body.email).toBe('test-e2e@example.com');
    expect(mockSeedScenario).toHaveBeenCalledWith(
      expect.anything(),
      'onboarding-complete',
      'test-e2e@example.com'
    );
  });

  it('uses default email when not provided', async () => {
    mockSeedScenario.mockResolvedValue({
      scenario: 'learning-active',
      accountId: 'acc-789',
      profileId: 'prof-012',
      email: 'test-e2e@example.com',
      ids: { subjectId: 'sub-1' },
    });

    const res = await app.request(
      '/v1/__test/seed',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: 'learning-active' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(201);
    expect(mockSeedScenario).toHaveBeenCalledWith(
      expect.anything(),
      'learning-active',
      'test-e2e@example.com' // default
    );
  });

  it('rejects invalid scenario name with 400', async () => {
    const res = await app.request(
      '/v1/__test/seed',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: 'nonexistent-scenario' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
    expect(mockSeedScenario).not.toHaveBeenCalled();
  });

  it('returns 403 in production environment', async () => {
    const res = await app.request(
      '/v1/__test/seed',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: 'onboarding-complete' }),
      },
      PRODUCTION_ENV
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
    expect(mockSeedScenario).not.toHaveBeenCalled();
  });

  it('skips authentication (public path)', async () => {
    mockSeedScenario.mockResolvedValue({
      scenario: 'trial-active',
      accountId: 'acc-x',
      profileId: 'prof-x',
      email: 'test@example.com',
      ids: { subscriptionId: 'sub-x' },
    });

    // No Authorization header — should still work
    const res = await app.request(
      '/v1/__test/seed',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: 'trial-active' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(201);
  });

  it.each([
    'onboarding-complete',
    'learning-active',
    'retention-due',
    'failed-recall-3x',
    'parent-with-children',
    'trial-active',
    'trial-expired',
    'multi-subject',
  ] as const)('accepts scenario: %s', async (scenario) => {
    mockSeedScenario.mockResolvedValue({
      scenario,
      accountId: `acc-${scenario}`,
      profileId: `prof-${scenario}`,
      email: 'test-e2e@example.com',
      ids: {},
    });

    const res = await app.request(
      '/v1/__test/seed',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.scenario).toBe(scenario);
  });
});

// ---------------------------------------------------------------------------
// Reset endpoint
// ---------------------------------------------------------------------------

describe('Integration: POST /__test/reset', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with success message and deletedCount', async () => {
    mockResetDatabase.mockResolvedValue({ deletedCount: 3 });

    const res = await app.request(
      '/v1/__test/reset',
      { method: 'POST' },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe('Database reset complete');
    expect(body.deletedCount).toBe(3);
    expect(mockResetDatabase).toHaveBeenCalledWith(expect.anything());
  });

  it('returns 403 in production environment', async () => {
    const res = await app.request(
      '/v1/__test/reset',
      { method: 'POST' },
      PRODUCTION_ENV
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
    expect(mockResetDatabase).not.toHaveBeenCalled();
  });

  it('skips authentication (public path)', async () => {
    mockResetDatabase.mockResolvedValue({ deletedCount: 0 });

    const res = await app.request(
      '/v1/__test/reset',
      { method: 'POST' },
      TEST_ENV
    );

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Scenarios endpoint
// ---------------------------------------------------------------------------

describe('Integration: GET /__test/scenarios', () => {
  it('returns all valid scenario names', async () => {
    const res = await app.request(
      '/v1/__test/scenarios',
      { method: 'GET' },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scenarios).toEqual([
      'onboarding-complete',
      'learning-active',
      'retention-due',
      'failed-recall-3x',
      'parent-with-children',
      'trial-active',
      'trial-expired',
      'multi-subject',
    ]);
  });

  it('returns 403 in production environment', async () => {
    const res = await app.request(
      '/v1/__test/scenarios',
      { method: 'GET' },
      PRODUCTION_ENV
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
  });
});
