// ---------------------------------------------------------------------------
// Language Progress Routes — Unit Tests
//
// [WI-980] Regression: GET /v1/subjects/:subjectId/cefr-progress must reject
// non-UUID subjectId with HTTP 400 before calling getCurrentLanguageProgress.
// ---------------------------------------------------------------------------

import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';
import { createDatabaseModuleMock } from '../test-utils/database-module';
import { personScope } from '../test-utils/identity-v2-scope-mock';

const mockDatabaseModule = createDatabaseModuleMock();

jest.mock(
  '@eduagent/database' /* gc1-allow: route unit test — DB middleware injected via mock; real DB covered by route integration / e2e tests */,
  () => mockDatabaseModule.module,
);

jest.mock('../services/account', () => {
  const actual = jest.requireActual(
    '../services/account',
  ) as typeof import('../services/account');
  return {
    ...actual,
    findOrCreateAccount: jest.fn().mockResolvedValue({
      id: 'test-account-id',
      clerkUserId: 'user_test',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  };
});

jest.mock('../services/profile', () => {
  const actual = jest.requireActual(
    '../services/profile',
  ) as typeof import('../services/profile');
  return {
    ...actual,
    findOwnerProfile: jest.fn().mockResolvedValue(null),
    getProfile: jest.fn().mockResolvedValue({
      id: 'a0000000-0000-4000-a000-000000000001',
      birthYear: 2000,
      location: null,
      consentStatus: 'CONSENTED',
    }),
  };
});

// [WI-867] After the IDENTITY_V2_ENABLED flag collapse, the account +
// profile-scope middleware run the v2 path unconditionally. Continuity mocks
// so these unit tests don't hit the unmocked DB; real paths covered by the
// identity-v2 integration suites.
jest.mock('../services/identity-v2/identity-resolve', () => ({
  ...jest.requireActual('../services/identity-v2/identity-resolve'),
  resolveIdentityV2: jest.fn().mockResolvedValue({
    account: {
      id: 'test-account-id',
      clerkUserId: 'user_test',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    personId: 'person-test-id',
    organizationId: 'test-account-id',
    isOwner: true,
    roles: ['admin'],
  }),
}));

jest.mock(
  '../services/billing/billing-v2' /* gc1-allow: continuity — ensureInitialTrialSubscriptionV2 uses db.execute()/db.transaction() paths the unit mock DB cannot satisfy; real path covered by apps/api/src/services/billing/billing-v2/subscription-core-v2.integration.test.ts */,
  () => ({
    ...jest.requireActual('../services/billing/billing-v2'),
    ensureInitialTrialSubscriptionV2: jest.fn().mockResolvedValue(undefined),
  }),
);

const mockFindOwnerPersonScope = jest
  .fn()
  .mockResolvedValue(
    personScope({ profileId: 'a0000000-0000-4000-a000-000000000001' }),
  );
const mockGetPersonScope = jest
  .fn()
  .mockResolvedValue(
    personScope({ profileId: 'a0000000-0000-4000-a000-000000000001' }),
  );
jest.mock(
  '../services/identity-v2/profile-v2' /* gc1-allow: continuity — post-collapse profile-scope middleware calls findOwnerPersonScope/getPersonScope (db.select() join chains, unrunnable on unit mock DB); real path covered by apps/api/src/services/identity-v2/profile-v2.integration.test.ts */,
  () => ({
    ...jest.requireActual('../services/identity-v2/profile-v2'),
    findOwnerPersonScope: (...args: unknown[]) =>
      mockFindOwnerPersonScope(...args),
    getPersonScope: (...args: unknown[]) => mockGetPersonScope(...args),
  }),
);

const mockGetCurrentLanguageProgress = jest.fn();

jest.mock('../services/language-curriculum', () => {
  const actual = jest.requireActual(
    '../services/language-curriculum',
  ) as typeof import('../services/language-curriculum');
  return {
    ...actual,
    getCurrentLanguageProgress: (...args: unknown[]) =>
      mockGetCurrentLanguageProgress(...args),
  };
});

import { app } from '../index';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';

const TEST_ENV = { ...BASE_AUTH_ENV };
const AUTH_HEADERS = makeAuthHeaders({
  'X-Profile-Id': 'a0000000-0000-4000-a000-000000000001',
});

const VALID_SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('[WI-980] GET /v1/subjects/:subjectId/cefr-progress — param validation', () => {
  beforeAll(() => {
    installTestJwksInterceptor();
  });

  afterAll(() => {
    restoreTestFetch();
  });

  beforeEach(() => {
    clearJWKSCache();
    jest.clearAllMocks();
  });

  it('returns 400 for a non-UUID subjectId without calling getCurrentLanguageProgress', async () => {
    const res = await app.request(
      '/v1/subjects/not-a-uuid/cefr-progress',
      { headers: AUTH_HEADERS },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    expect(mockGetCurrentLanguageProgress).not.toHaveBeenCalled();
  });

  it('returns 400 for an integer subjectId without calling getCurrentLanguageProgress', async () => {
    const res = await app.request(
      '/v1/subjects/12345/cefr-progress',
      { headers: AUTH_HEADERS },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    expect(mockGetCurrentLanguageProgress).not.toHaveBeenCalled();
  });

  it('calls getCurrentLanguageProgress and returns 404 for a valid UUID with no progress', async () => {
    mockGetCurrentLanguageProgress.mockResolvedValue(null);

    const res = await app.request(
      `/v1/subjects/${VALID_SUBJECT_ID}/cefr-progress`,
      { headers: AUTH_HEADERS },
      TEST_ENV,
    );

    expect(res.status).toBe(404);
    // Confirm the service was called — and that the UUID reached it intact.
    // db may be undefined in unit-test context (mock boundary).
    expect(mockGetCurrentLanguageProgress).toHaveBeenCalledTimes(1);
    const [, , calledSubjectId] = mockGetCurrentLanguageProgress.mock
      .calls[0] as [unknown, unknown, string];
    expect(calledSubjectId).toBe(VALID_SUBJECT_ID);
  });
});
