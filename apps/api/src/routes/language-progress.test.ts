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
