/**
 * Integration: Profile Isolation (P0-006)
 *
 * Exercises the profile-scope middleware via Hono's app.request().
 * Validates that one account cannot access another account's profiles.
 *
 * 1. Request with X-Profile-Id belonging to the account → 200 (subjects returned)
 * 2. Request with X-Profile-Id NOT belonging to the account → 403 FORBIDDEN
 * 3. Request without X-Profile-Id → account-level fallback → 200
 * 4. Profile middleware passes correct profileId to downstream service
 *
 * These tests validate the first layer of profile isolation (middleware).
 * The scoped repository pattern (layer 2) is covered by unit tests.
 */

// --- Controllable JWT mock ---
const mockDecodeJWTHeader = jest.fn();
const mockFetchJWKS = jest.fn();
const mockVerifyJWT = jest.fn();

jest.mock('../../apps/api/src/middleware/jwt', () => ({
  decodeJWTHeader: mockDecodeJWTHeader,
  fetchJWKS: mockFetchJWKS,
  verifyJWT: mockVerifyJWT,
}));

// --- Profile service mock (profile-scope middleware calls getProfile) ---
const mockGetProfile = jest.fn();

jest.mock('../../apps/api/src/services/profile', () => ({
  getProfile: mockGetProfile,
  listProfiles: jest.fn().mockResolvedValue([]),
  createProfile: jest.fn(),
  updateProfile: jest.fn(),
}));

// --- Subject service mock (test exercises GET /v1/subjects) ---
const mockListSubjects = jest.fn();

jest.mock('../../apps/api/src/services/subject', () => ({
  listSubjects: mockListSubjects,
  createSubject: jest.fn(),
  getSubject: jest.fn(),
  updateSubject: jest.fn(),
}));

// --- Base mocks (middleware chain requires these) ---

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

const MOCK_ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';

jest.mock('../../apps/api/src/services/account', () => ({
  findOrCreateAccount: jest.fn().mockResolvedValue({
    id: MOCK_ACCOUNT_ID,
    clerkUserId: 'user_profile_test',
    email: 'profile-test@test.com',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
}));

jest.mock('../../apps/api/src/services/billing', () => ({
  ensureFreeSubscription: jest.fn().mockResolvedValue({
    id: '00000000-0000-4000-8000-000000000005',
    accountId: MOCK_ACCOUNT_ID,
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

const OWNED_PROFILE_ID = '00000000-0000-4000-8000-000000000010';
const OTHER_PROFILE_ID = '00000000-0000-4000-8000-000000000099';

const TEST_ENV = {
  ENVIRONMENT: 'development',
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
  DATABASE_URL: 'postgresql://test:test@localhost/test',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
};

function configureValidJWT(): void {
  mockDecodeJWTHeader.mockReturnValue({ alg: 'RS256', kid: 'test-kid' });
  mockFetchJWKS.mockResolvedValue({
    keys: [{ kty: 'RSA', kid: 'test-kid', n: 'fake-n', e: 'AQAB' }],
  });
  mockVerifyJWT.mockResolvedValue({
    sub: 'user_profile_test',
    email: 'profile-test@test.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
}

// ---------------------------------------------------------------------------
// Profile isolation — middleware enforces ownership
// ---------------------------------------------------------------------------

describe('Integration: Profile Isolation (P0-006)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureValidJWT();

    // Default: owned profile returns valid profile object
    mockGetProfile.mockImplementation(
      async (_db: unknown, profileId: string, accountId: string) => {
        if (profileId === OWNED_PROFILE_ID && accountId === MOCK_ACCOUNT_ID) {
          return {
            id: OWNED_PROFILE_ID,
            accountId: MOCK_ACCOUNT_ID,
            displayName: 'Test Learner',
            personaType: 'LEARNER',
            isOwner: true,
            consentStatus: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }
        return null; // Not owned
      }
    );

    // Subject service returns data when called
    mockListSubjects.mockResolvedValue([
      {
        id: 'sub-001',
        profileId: OWNED_PROFILE_ID,
        name: 'Mathematics',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
  });

  it('returns 200 with subjects when X-Profile-Id belongs to the account', async () => {
    const res = await app.request(
      '/v1/subjects',
      {
        method: 'GET',
        headers: {
          ...AUTH_HEADERS,
          'X-Profile-Id': OWNED_PROFILE_ID,
        },
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subjects).toHaveLength(1);
    expect(body.subjects[0].name).toBe('Mathematics');

    // Verify getProfile was called with correct arguments
    expect(mockGetProfile).toHaveBeenCalledWith(
      expect.anything(), // db
      OWNED_PROFILE_ID,
      MOCK_ACCOUNT_ID
    );

    // Verify listSubjects received the profile ID from middleware
    expect(mockListSubjects).toHaveBeenCalledWith(
      expect.anything(), // db
      OWNED_PROFILE_ID,
      expect.objectContaining({ includeInactive: false })
    );
  });

  it('returns 403 FORBIDDEN when X-Profile-Id does NOT belong to the account', async () => {
    const res = await app.request(
      '/v1/subjects',
      {
        method: 'GET',
        headers: {
          ...AUTH_HEADERS,
          'X-Profile-Id': OTHER_PROFILE_ID,
        },
      },
      TEST_ENV
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');

    // getProfile was called but returned null
    expect(mockGetProfile).toHaveBeenCalledWith(
      expect.anything(),
      OTHER_PROFILE_ID,
      MOCK_ACCOUNT_ID
    );

    // Subject service was NOT reached
    expect(mockListSubjects).not.toHaveBeenCalled();
  });

  it('falls back to account-level access when X-Profile-Id is absent', async () => {
    const res = await app.request(
      '/v1/subjects',
      {
        method: 'GET',
        headers: AUTH_HEADERS,
      },
      TEST_ENV
    );

    // Profile-scope middleware skips when header is absent
    expect(res.status).toBe(200);
    expect(mockGetProfile).not.toHaveBeenCalled();

    // listSubjects called with account.id as fallback
    expect(mockListSubjects).toHaveBeenCalledWith(
      expect.anything(),
      MOCK_ACCOUNT_ID,
      expect.anything()
    );
  });

  it('correctly propagates profileId to downstream services', async () => {
    // Create a second owned profile to verify the correct ID propagates
    const SECOND_PROFILE_ID = '00000000-0000-4000-8000-000000000020';

    mockGetProfile.mockImplementation(
      async (_db: unknown, profileId: string, accountId: string) => {
        if (profileId === SECOND_PROFILE_ID && accountId === MOCK_ACCOUNT_ID) {
          return {
            id: SECOND_PROFILE_ID,
            accountId: MOCK_ACCOUNT_ID,
            displayName: 'Second Profile',
            personaType: 'TEEN',
            isOwner: false,
            consentStatus: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }
        return null;
      }
    );

    mockListSubjects.mockResolvedValue([]);

    const res = await app.request(
      '/v1/subjects',
      {
        method: 'GET',
        headers: {
          ...AUTH_HEADERS,
          'X-Profile-Id': SECOND_PROFILE_ID,
        },
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    // Verify the SECOND profile ID was passed to the service
    expect(mockListSubjects).toHaveBeenCalledWith(
      expect.anything(),
      SECOND_PROFILE_ID,
      expect.anything()
    );
  });

  it('prevents access with a fabricated profile ID', async () => {
    const FAKE_PROFILE_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

    const res = await app.request(
      '/v1/subjects',
      {
        method: 'GET',
        headers: {
          ...AUTH_HEADERS,
          'X-Profile-Id': FAKE_PROFILE_ID,
        },
      },
      TEST_ENV
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
    expect(mockListSubjects).not.toHaveBeenCalled();
  });
});
