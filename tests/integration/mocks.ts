/**
 * Shared mock factories for integration tests.
 *
 * Service mocks use `jest.createMockFromModule()` to auto-discover and stub
 * ALL exports (including future ones). Infrastructure mocks (database, inngest,
 * jwt) use manual factories since they're small and need specific return shapes.
 *
 * Usage:
 *   import { llmMock, accountMock, billingMock, ... } from './mocks';
 *   jest.mock('../../apps/api/src/services/llm', () => llmMock());
 *
 * For controllable mocks (JWT, inngest.send):
 *   const jwtMocks = jwtMock();
 *   jest.mock('../../apps/api/src/middleware/jwt', () => jwtMocks);
 *   // later: configureValidJWT(jwtMocks);
 *
 * For extended mocks:
 *   jest.mock('...billing', () => ({
 *     ...billingMock(),
 *     updateSubscriptionFromWebhook: myCustomMock,
 *   }));
 */

// ---------------------------------------------------------------------------
// Module paths (relative from tests/integration/)
// ---------------------------------------------------------------------------

const LLM_PATH = '../../apps/api/src/services/llm';
const ACCOUNT_PATH = '../../apps/api/src/services/account';
const BILLING_PATH = '../../apps/api/src/services/billing';
const SETTINGS_PATH = '../../apps/api/src/services/settings';
const SESSION_PATH = '../../apps/api/src/services/session';

// ---------------------------------------------------------------------------
// Infrastructure mocks (manual — small, need specific shapes)
// ---------------------------------------------------------------------------

/** Mock `@eduagent/database` — returns an empty object for `createDatabase`. */
export function databaseMock(): Record<string, jest.Mock> {
  return {
    createDatabase: jest.fn().mockReturnValue({}),
  };
}

/**
 * Mock `../../apps/api/src/inngest/client`.
 *
 * The `inngest.createFunction()` call happens at import time for every Inngest
 * function module. The `serve()` handler calls `fn.getConfig()` during setup.
 * This factory satisfies both requirements.
 *
 * @param sendMock - Optional pre-created jest.fn() for `inngest.send` (useful
 *   when tests need to assert on sent events).
 */
export function inngestClientMock(sendMock?: jest.Mock): {
  inngest: Record<string, jest.Mock>;
} {
  let fnCounter = 0;
  return {
    inngest: {
      send: sendMock ?? jest.fn().mockResolvedValue({ ids: [] }),
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
}

/** Mock `../../apps/api/src/middleware/jwt` — returns controllable fns. */
export function jwtMock(): Record<string, jest.Mock> {
  return {
    decodeJWTHeader: jest.fn(),
    decodeJWTPayload: jest.fn(),
    fetchJWKS: jest.fn(),
    clearJWKSCache: jest.fn(),
    verifyJWT: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Service mocks (createMockFromModule — auto-discovers all exports)
// ---------------------------------------------------------------------------

/**
 * Mock the LLM service barrel.
 *
 * Uses `createMockFromModule` so new exports (like `getRegisteredProviders`)
 * are auto-stubbed. Overlays a default for `getRegisteredProviders` to return
 * an empty array (the LLM registration middleware calls it at boot).
 */
export function llmMock(): Record<string, jest.Mock> {
  const auto = jest.createMockFromModule<Record<string, jest.Mock>>(LLM_PATH);
  return {
    ...auto,
    getRegisteredProviders: jest.fn().mockReturnValue([]),
  };
}

/**
 * Mock the account service.
 *
 * Overlays `findOrCreateAccount` with a sensible default account shape that
 * the auth middleware expects.
 */
export function accountMock(
  overrides?: Partial<{
    id: string;
    clerkUserId: string;
    email: string;
  }>
): Record<string, jest.Mock> {
  const auto =
    jest.createMockFromModule<Record<string, jest.Mock>>(ACCOUNT_PATH);
  return {
    ...auto,
    findOrCreateAccount: jest.fn().mockResolvedValue({
      id: overrides?.id ?? '00000000-0000-4000-8000-000000000001',
      clerkUserId: overrides?.clerkUserId ?? 'user_test',
      email: overrides?.email ?? 'test@test.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  };
}

/**
 * Mock the billing service.
 *
 * Overlays the 3 functions the metering middleware calls on every request:
 * `ensureFreeSubscription`, `getQuotaPool`, `decrementQuota`.
 */
export function billingMock(accountId?: string): Record<string, jest.Mock> {
  const auto =
    jest.createMockFromModule<Record<string, jest.Mock>>(BILLING_PATH);
  const acctId = accountId ?? '00000000-0000-4000-8000-000000000001';
  return {
    ...auto,
    ensureFreeSubscription: jest.fn().mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000005',
      accountId: acctId,
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
  };
}

/**
 * Mock the settings service.
 *
 * Overlays `shouldPromptCasualSwitch` (called by session close route).
 */
export function settingsMock(): Record<string, jest.Mock> {
  const auto =
    jest.createMockFromModule<Record<string, jest.Mock>>(SETTINGS_PATH);
  return {
    ...auto,
    shouldPromptCasualSwitch: jest.fn().mockResolvedValue(false),
  };
}

/**
 * Mock the session service.
 *
 * All exports auto-stubbed as `jest.fn()`. No default return values needed
 * for the middleware chain — only route handlers call session functions.
 */
export function sessionMock(): Record<string, jest.Mock> {
  return jest.createMockFromModule<Record<string, jest.Mock>>(SESSION_PATH);
}

// ---------------------------------------------------------------------------
// JWT configuration helpers
// ---------------------------------------------------------------------------

/**
 * Configure a JWT mock set to return a valid payload.
 *
 * @param mocks - The object returned by `jwtMock()`.
 * @param overrides - Optional JWT claim overrides.
 */
export function configureValidJWT(
  mocks: Record<string, jest.Mock>,
  overrides?: Partial<{ sub: string; email: string }>
): void {
  mocks.decodeJWTHeader.mockReturnValue({ alg: 'RS256', kid: 'test-kid' });
  mocks.fetchJWKS.mockResolvedValue({
    keys: [{ kty: 'RSA', kid: 'test-kid', n: 'fake-n', e: 'AQAB' }],
  });
  mocks.verifyJWT.mockResolvedValue({
    sub: overrides?.sub ?? 'user_test',
    email: overrides?.email ?? 'test@test.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
}

/**
 * Configure a JWT mock set to throw on decode (simulates invalid/expired token).
 */
export function configureInvalidJWT(mocks: Record<string, jest.Mock>): void {
  mocks.decodeJWTHeader.mockImplementation(() => {
    throw new Error('Invalid JWT');
  });
}
