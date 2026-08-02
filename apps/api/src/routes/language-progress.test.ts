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

// [WI-2877] The read-authority fallback in assertCanReadProfile calls
// verifyPersonOwnershipV2 — a raw db.select() membership query with no real
// implementation available in this file's mock DB environment; real path
// covered by apps/api/src/services/identity-v2/ownership-v2.integration.test.ts.
// gc1-allow: verifyPersonOwnershipV2 runs a raw db.select() membership query
// with no real implementation available in this file's mock DB environment.
jest.mock('../services/identity-v2/ownership-v2', () => ({
  ...jest.requireActual('../services/identity-v2/ownership-v2'),
  verifyPersonOwnershipV2: jest.fn().mockResolvedValue(undefined),
}));

import { Hono } from 'hono';
import { ERROR_CODES } from '@eduagent/schemas';
import { app } from '../index';
import { languageProgressRoutes } from './language-progress';
import { verifyPersonOwnershipV2 } from '../services/identity-v2/ownership-v2';
import { ForbiddenError } from '../errors';
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

// ---- [WI-2877] read-authority guard (G18) ----
// The harness middleware installs profileId ONLY from the request's
// X-Profile-Id header — the same client-controlled input the real
// profileScopeMiddleware resolves — so the attack below is a credentialed
// non-owner request traversing header → middleware → route.
// profileAuthorityVerifiedFor is deliberately never set (no central proof),
// which keeps the case mutation-sensitive to the route guard's own
// fail-closed fallback (verifyPersonOwnershipV2); mounting the real
// profileScopeMiddleware would reject centrally (WI-2128) before the route
// and lose that sensitivity (middleware behavior: profile-scope.test.ts).

describe('[WI-2877] read-authority guard', () => {
  const VICTIM_PROFILE_ID = 'victim-profile-id';
  const ATTACKER_PERSON_ID = 'attacker-person-id';

  function makeUnprovenApp() {
    const direct = new Hono();
    direct.use('*', async (c, next) => {
      c.set('db' as never, {});
      // profileId derives strictly from the spoofed header; a request that
      // forgets to send it fails loudly (500) instead of silently passing.
      const spoofedProfileId = c.req.header('X-Profile-Id');
      if (!spoofedProfileId) {
        throw new Error('harness requires an X-Profile-Id header');
      }
      c.set('profileId' as never, spoofedProfileId);
      c.set('user' as never, { id: 'test-user' });
      c.set('account' as never, { id: 'test-account-id' });
      c.set('callerPersonId' as never, ATTACKER_PERSON_ID);
      // profileAuthorityVerifiedFor deliberately NOT set — no central proof.
      await next();
    });
    direct.onError((err, c) => {
      if (err instanceof ForbiddenError) {
        return c.json(
          { code: ERROR_CODES.FORBIDDEN, message: err.message },
          403,
        );
      }
      return c.json({ code: 'INTERNAL_ERROR', message: String(err) }, 500);
    });
    direct.route('/', languageProgressRoutes);
    return direct;
  }

  it('GET /subjects/:subjectId/cefr-progress rejects a cross-profile X-Profile-Id spoof with 403 before the service read', async () => {
    // Drop call records leaked from the [WI-980] full-app cases above — this
    // case must prove the guarded handler itself never reaches the service.
    mockGetCurrentLanguageProgress.mockClear();
    // The caller's person holds no self/guardianship authority over the
    // header-selected profile.
    jest
      .mocked(verifyPersonOwnershipV2)
      .mockRejectedValueOnce(new Error('caller cannot read selected profile'));

    const res = await makeUnprovenApp().request(
      `/subjects/${VALID_SUBJECT_ID}/cefr-progress`,
      { headers: { 'X-Profile-Id': VICTIM_PROFILE_ID } },
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe(ERROR_CODES.FORBIDDEN);
    expect(jest.mocked(verifyPersonOwnershipV2)).toHaveBeenCalledWith(
      expect.anything(),
      VICTIM_PROFILE_ID,
      'test-account-id',
      ATTACKER_PERSON_ID,
    );
    expect(mockGetCurrentLanguageProgress).not.toHaveBeenCalled();
  });
});
