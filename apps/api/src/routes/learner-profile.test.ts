// ---------------------------------------------------------------------------
// learner-profile routes — IDOR, GDPR self-delete, toggle, and consent guards
// ---------------------------------------------------------------------------
// Covers the four critical paths called out by the Epic 16 code review:
// (1) cross-family parent cannot access another family's child (403)
// (2) self delete-all triggers the hard-delete service and returns 200
// (3) parent-only /:profileId/consent and /:profileId/item guards fire on
//     unauthorized access, and succeed only with a valid family link
// ---------------------------------------------------------------------------

// Real JWT + real auth middleware — no jwt module mock.
import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';
import {
  TEST_PROFILE_ID,
  TEST_PROFILE_ID_2,
  TEST_PROFILE_ID_3,
  TEST_PROFILE_ID_4,
  TEST_PROFILE_ID_5,
} from '@eduagent/test-utils';

jest.mock('inngest/hono', () => ({
  serve: jest.fn().mockReturnValue(jest.fn()),
}));

jest.mock('../inngest/client', () => {
  const actual = jest.requireActual(
    '../inngest/client',
  ) as typeof import('../inngest/client');
  return {
    ...actual,
    inngest: {
      send: jest.fn().mockResolvedValue(undefined),
      createFunction: jest.fn().mockReturnValue(jest.fn()),
    },
  };
});

// Minimal database stub — middleware creates it per request.
import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({ includeActual: true });
// [WI-867] Post-collapse: assertOwnerAndParentAccess → assertParentAccess →
// validateGuardianChargeRelationshipV2 → isGuardianOf reads db.query.guardianship.findFirst
// (SEEDABLE). Proxy exposes it on the mock DB so IDOR tests can control the edge.
const mockFindGuardianship = jest.fn().mockResolvedValue({
  id: 'guardianship-1',
  guardianPersonId: TEST_PROFILE_ID,
  chargePersonId: TEST_PROFILE_ID_2,
  revokedAt: null,
});
const guardianshipQuery = {
  findFirst: (...args: unknown[]) => mockFindGuardianship(...args),
  findMany: jest.fn().mockResolvedValue([]),
};

mockDatabaseModule.db.query = new Proxy(mockDatabaseModule.db.query as object, {
  get(target, prop, receiver) {
    if (prop === 'guardianship') return guardianshipQuery;
    return Reflect.get(target, prop, receiver);
  },
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module); // gc1-allow: unit-level route test — no DB available; createDatabaseModuleMock provides controlled guardianship stub for IDOR assertions

// [WI-867] billing-v2 seam — account middleware calls ensureInitialTrialSubscriptionV2
// unconditionally post-collapse. Continuity mock resolves cleanly.
jest.mock(
  '../services/billing/billing-v2' /* gc1-allow: continuity — ensureInitialTrialSubscriptionV2 uses db.execute()/db.transaction() paths the unit mock DB cannot satisfy; real path covered by apps/api/src/services/billing/billing-v2/subscription-core-v2.integration.test.ts */,
  () => ({
    ...jest.requireActual('../services/billing/billing-v2'),
    ensureInitialTrialSubscriptionV2: jest.fn().mockResolvedValue(undefined),
  }),
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

// profile-scope middleware calls getProfile(...) to resolve X-Profile-Id to
// a verified profileId on the account. We return a profile owned by the
// account regardless of which id is sent so the middleware accepts the
// header and writes it to the context.
jest.mock('../services/profile', () => {
  const actual = jest.requireActual(
    '../services/profile',
  ) as typeof import('../services/profile');
  return {
    ...actual,
    findOwnerProfile: jest.fn().mockResolvedValue(null),
    getProfile: jest
      .fn()
      .mockImplementation(async (_db: unknown, profileId: string) => ({
        id: profileId,
        birthYear: null,
        location: null,
        consentStatus: 'CONSENTED',
        // [CR-2026-05-19-H1] isOwner:true so owner-gated routes pass in
        // happy-path tests. Break tests override this to isOwner:false.
        isOwner: true,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
      })),
  };
});

// [WI-774] v2 identity resolver — under IDENTITY_V2_ENABLED='true' the account
// middleware resolves the graph and sets callerPersonId. Mocked so the flag-on
// route test can assert the v2 guard is armed without an unmocked DB.
jest.mock(
  '../services/identity-v2/identity-resolve' /* gc1-allow: route unit test — DB mocked; resolver covered by identity integration tests */,
  () => ({
    resolveIdentityV2: jest.fn().mockResolvedValue({
      account: {
        id: 'test-account-id',
        clerkUserId: 'user_test',
        email: 'test@example.com',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      personId: TEST_PROFILE_ID,
      organizationId: 'test-account-id',
      isOwner: true,
      roles: ['admin'],
    }),
  }),
);

// [WI-867] profile-v2 seam — profile-scope middleware calls findOwnerPersonScope /
// getPersonScope (db.select() join chains, unrunnable on unit mock DB).
// Module-level refs allow per-test override (e.g. minor non-owner suites).
const mockFindOwnerPersonScope = jest.fn().mockResolvedValue(null);
const mockGetPersonScope = jest
  .fn()
  .mockImplementation(async (_db: unknown, profileId: string) => ({
    profileId,
    meta: {
      birthYear: null,
      location: null,
      consentStatus: 'CONSENTED',
      hasPremiumLlm: false,
      conversationLanguage: 'en',
      isOwner: true,
    },
  }));
jest.mock(
  '../services/identity-v2/profile-v2' /* gc1-allow: continuity — post-collapse profile-scope middleware calls findOwnerPersonScope/getPersonScope (db.select() join chains, unrunnable on unit mock DB); real path covered by identity integration suite */,
  () => ({
    ...jest.requireActual('../services/identity-v2/profile-v2'),
    findOwnerPersonScope: (...a: unknown[]) => mockFindOwnerPersonScope(...a),
    getPersonScope: (...a: unknown[]) => mockGetPersonScope(...a),
  }),
);

// [WI-2416] assertCanReadProfile (GET /learner-profile, /export-text) calls
// verifyPersonOwnershipV2, which — like getPersonScope above — runs a raw
// db.select() membership query unrunnable on this unit mock DB. Every
// self-scoped read scenario in this file is a caller-self read (the header
// profile equals the authenticated caller's own person id); the
// cross-account read attack this guard exists to close is covered by the
// real-DB break test in tests/integration/wi2416-read-idor.integration.test.ts.
// gc1-allow: verifyPersonOwnershipV2 runs a raw db.select() membership query
// with no real implementation available in this file's mock DB environment.
jest.mock('../services/identity-v2/ownership-v2', () => ({
  ...jest.requireActual('../services/identity-v2/ownership-v2'),
  verifyPersonOwnershipV2: jest.fn().mockResolvedValue(undefined),
}));

// Learner-profile service mocks — record calls so assertions can verify
// the route reached the service with the right (parent/child) profileId.
const mockGetOrCreateLearningProfile = jest.fn();
const mockDeleteAllMemory = jest.fn();
const mockDeleteMemoryItem = jest.fn();
const mockToggleMemoryCollection = jest.fn();
const mockToggleMemoryInjection = jest.fn();
const mockGrantMemoryConsent = jest.fn();
const mockUnsuppressInference = jest.fn();
const mockBuildHumanReadableMemoryExport = jest.fn();
const mockUpdateAccommodationMode = jest.fn();

jest.mock('../services/learner-profile', () => {
  const actual = jest.requireActual(
    '../services/learner-profile',
  ) as typeof import('../services/learner-profile');
  return {
    ...actual,
    getOrCreateLearningProfile: (...args: unknown[]) =>
      mockGetOrCreateLearningProfile(...args),
    deleteAllMemory: (...args: unknown[]) => mockDeleteAllMemory(...args),
    deleteMemoryItem: (...args: unknown[]) => mockDeleteMemoryItem(...args),
    toggleMemoryCollection: (...args: unknown[]) =>
      mockToggleMemoryCollection(...args),
    toggleMemoryInjection: (...args: unknown[]) =>
      mockToggleMemoryInjection(...args),
    grantMemoryConsent: (...args: unknown[]) => mockGrantMemoryConsent(...args),
    unsuppressInference: (...args: unknown[]) =>
      mockUnsuppressInference(...args),
    buildHumanReadableMemoryExport: (...args: unknown[]) =>
      mockBuildHumanReadableMemoryExport(...args),
    updateAccommodationMode: (...args: unknown[]) =>
      mockUpdateAccommodationMode(...args),
  };
});

jest.mock('../services/learner-input', () => {
  const actual = jest.requireActual(
    '../services/learner-input',
  ) as typeof import('../services/learner-input');
  return {
    ...actual,
    parseLearnerInput: jest.fn().mockResolvedValue({
      success: true,
      message: 'Got it!',
      fieldsUpdated: ['interests'],
    }),
  };
});

import { app } from '../index';
import { Hono } from 'hono';
import { learnerProfileRoutes } from './learner-profile';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';
import { extractDrizzleParamValues } from '../test-utils/drizzle-introspection';
import { ERROR_CODES } from '@eduagent/schemas';

const TEST_ENV = {
  ...BASE_AUTH_ENV,
  DATABASE_URL: 'postgresql://test:test@localhost/test',
};
// [WI-867] Retained: verifies callerPersonId is always threaded (v2 always active).
const V2_TEST_ENV = { ...TEST_ENV, IDENTITY_V2_ENABLED: 'true' };

const PARENT_PROFILE_ID = TEST_PROFILE_ID;
const OWN_CHILD_PROFILE_ID = TEST_PROFILE_ID_2;
const OTHER_FAMILY_CHILD_ID = '770e8400-e29b-41d4-a716-446655440099';

const PARENT_HEADERS = makeAuthHeaders({ 'X-Profile-Id': PARENT_PROFILE_ID });

const MINIMAL_PROFILE = {
  id: 'a0000000-0000-4000-a000-000000000001',
  profileId: OWN_CHILD_PROFILE_ID,
  learningStyle: null,
  interests: [],
  strengths: [],
  struggles: [],
  communicationNotes: [],
  suppressedInferences: [],
  interestTimestamps: {},
  effectivenessSessionCount: 0,
  memoryEnabled: true,
  memoryCollectionEnabled: false,
  memoryInjectionEnabled: true,
  memoryConsentStatus: 'pending',
  consentPromptDismissedAt: null,
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('learner-profile routes', () => {
  beforeAll(() => {
    installTestJwksInterceptor();
  });

  afterAll(() => {
    restoreTestFetch();
  });

  beforeEach(() => {
    clearJWKSCache();
    jest.clearAllMocks();
    // [WI-867] Post-collapse: guardianship table uses guardianPersonId/chargePersonId.
    mockFindGuardianship.mockResolvedValue({
      id: 'guardianship-1',
      guardianPersonId: PARENT_PROFILE_ID,
      chargePersonId: OWN_CHILD_PROFILE_ID,
      revokedAt: null,
    });
    mockGetOrCreateLearningProfile.mockResolvedValue(MINIMAL_PROFILE);
    mockDeleteAllMemory.mockResolvedValue(undefined);
    mockDeleteMemoryItem.mockResolvedValue(undefined);
    mockToggleMemoryCollection.mockResolvedValue(undefined);
    mockToggleMemoryInjection.mockResolvedValue(undefined);
    mockGrantMemoryConsent.mockResolvedValue(undefined);
    mockUnsuppressInference.mockResolvedValue(undefined);
    mockBuildHumanReadableMemoryExport.mockReturnValue('Memory export text');
    mockUpdateAccommodationMode.mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // IDOR — parent-only child routes must 403 without a family link
  // -------------------------------------------------------------------------

  describe('IDOR protection on /learner-profile/:profileId/* routes', () => {
    beforeEach(() => {
      mockFindGuardianship.mockResolvedValue(undefined);
    });

    it('returns 403 on GET /learner-profile/:profileId for another family', async () => {
      const res = await app.request(
        `/v1/learner-profile/${OTHER_FAMILY_CHILD_ID}`,
        { headers: PARENT_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      expect(mockGetOrCreateLearningProfile).not.toHaveBeenCalled();
      expect(mockFindGuardianship).toHaveBeenCalledTimes(1);

      // Pin the actual UUIDs the route asked the family-link table about. A
      // future refactor that drops or swaps the parent/child equality clauses
      // would still 403 (because the mock returns undefined) but would silently
      // break the IDOR contract — this assertion catches that.
      const params = extractDrizzleParamValues(
        mockFindGuardianship.mock.calls[0]?.[0],
      );
      expect(params).toContain(PARENT_PROFILE_ID);
      expect(params).toContain(OTHER_FAMILY_CHILD_ID);
    });

    it('returns 403 on DELETE /learner-profile/:profileId/all for another family', async () => {
      const res = await app.request(
        `/v1/learner-profile/${OTHER_FAMILY_CHILD_ID}/all`,
        { method: 'DELETE', headers: PARENT_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      expect(mockDeleteAllMemory).not.toHaveBeenCalled();
    });

    it('returns 403 on DELETE /learner-profile/:profileId/item for another family', async () => {
      const res = await app.request(
        `/v1/learner-profile/${OTHER_FAMILY_CHILD_ID}/item`,
        {
          method: 'DELETE',
          headers: PARENT_HEADERS,
          body: JSON.stringify({ category: 'interests', value: 'space' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      expect(mockDeleteMemoryItem).not.toHaveBeenCalled();
    });

    it('returns 403 on POST /learner-profile/:profileId/consent for another family', async () => {
      const res = await app.request(
        `/v1/learner-profile/${OTHER_FAMILY_CHILD_ID}/consent`,
        {
          method: 'POST',
          headers: PARENT_HEADERS,
          body: JSON.stringify({ consent: 'granted' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      expect(mockGrantMemoryConsent).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Happy path — valid family link lets the parent reach the service
  // -------------------------------------------------------------------------

  describe('parent with valid family link', () => {
    beforeEach(() => {
      mockFindGuardianship.mockResolvedValue({
        parentProfileId: PARENT_PROFILE_ID,
        childProfileId: OWN_CHILD_PROFILE_ID,
      });
    });

    it('returns 200 and the child profile on GET /learner-profile/:profileId', async () => {
      const res = await app.request(
        `/v1/learner-profile/${OWN_CHILD_PROFILE_ID}`,
        { headers: PARENT_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockGetOrCreateLearningProfile).toHaveBeenCalledWith(
        expect.anything(),
        OWN_CHILD_PROFILE_ID,
      );
      const body = (await res.json()) as {
        profile: { id: string; profileId: string };
      };
      expect(body.profile.profileId).toBe(OWN_CHILD_PROFILE_ID);
    });

    it('persists consent grant on POST /learner-profile/:profileId/consent', async () => {
      const res = await app.request(
        `/v1/learner-profile/${OWN_CHILD_PROFILE_ID}/consent`,
        {
          method: 'POST',
          headers: PARENT_HEADERS,
          body: JSON.stringify({ consent: 'granted' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockGrantMemoryConsent).toHaveBeenCalledWith(
        expect.anything(),
        OWN_CHILD_PROFILE_ID,
        undefined,
        'granted',
      );
    });

    it('includes human-readable text on GET /learner-profile/:profileId/export-text', async () => {
      const res = await app.request(
        `/v1/learner-profile/${OWN_CHILD_PROFILE_ID}/export-text`,
        { headers: PARENT_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { text: string };
      expect(body.text).toBe('Memory export text');
      expect(mockBuildHumanReadableMemoryExport).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Self-scoped routes — learner acts on their own profile (no family check)
  // -------------------------------------------------------------------------

  describe('self-scoped /learner-profile/* routes', () => {
    it('calls deleteAllMemory with the authenticated profileId on DELETE /learner-profile/all', async () => {
      const res = await app.request(
        '/v1/learner-profile/all',
        { method: 'DELETE', headers: PARENT_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      // [WI-867] Post-collapse: callerPersonId always set (resolveIdentityV2 always runs).
      expect(mockDeleteAllMemory).toHaveBeenCalledWith(
        expect.anything(),
        PARENT_PROFILE_ID,
        'test-account-id',
        { callerPersonId: PARENT_PROFILE_ID },
      );
      // Family-link check is not required for self-scoped routes.
      expect(mockFindGuardianship).not.toHaveBeenCalled();
    });

    it('[WI-867] callerPersonId is threaded on DELETE /learner-profile/all (v2 always active)', async () => {
      const res = await app.request(
        '/v1/learner-profile/all',
        { method: 'DELETE', headers: PARENT_HEADERS },
        V2_TEST_ENV,
      );

      expect(res.status).toBe(200);
      // [WI-867] callerPersonId must always be threaded from resolveIdentityV2 (flag collapsed).
      expect(mockDeleteAllMemory).toHaveBeenCalledWith(
        expect.anything(),
        PARENT_PROFILE_ID,
        'test-account-id',
        { callerPersonId: PARENT_PROFILE_ID },
      );
    });

    it('persists self-consent on POST /learner-profile/consent', async () => {
      const res = await app.request(
        '/v1/learner-profile/consent',
        {
          method: 'POST',
          headers: PARENT_HEADERS,
          body: JSON.stringify({ consent: 'granted' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      // [WI-867] Post-collapse: callerPersonId always set.
      expect(mockGrantMemoryConsent).toHaveBeenCalledWith(
        expect.anything(),
        PARENT_PROFILE_ID,
        'test-account-id',
        'granted',
        { callerPersonId: PARENT_PROFILE_ID },
      );
      expect(mockFindGuardianship).not.toHaveBeenCalled();
    });

    it('calls deleteMemoryItem with suppress flag on DELETE /learner-profile/item', async () => {
      const res = await app.request(
        '/v1/learner-profile/item',
        {
          method: 'DELETE',
          headers: PARENT_HEADERS,
          body: JSON.stringify({
            category: 'interests',
            value: 'dinosaurs',
            suppress: true,
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      // [WI-867] Post-collapse: callerPersonId always set.
      expect(mockDeleteMemoryItem).toHaveBeenCalledWith(
        expect.anything(),
        PARENT_PROFILE_ID,
        'test-account-id',
        'interests',
        'dinosaurs',
        true,
        undefined,
        { callerPersonId: PARENT_PROFILE_ID },
      );
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/learner-profile',
        { headers: { 'X-Profile-Id': PARENT_PROFILE_ID } },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
      expect(mockGetOrCreateLearningProfile).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // accommodation-mode self route
  // -------------------------------------------------------------------------

  describe('PATCH /learner-profile/accommodation-mode (self)', () => {
    it('returns 200 and calls updateAccommodationMode with valid mode', async () => {
      const res = await app.request(
        '/v1/learner-profile/accommodation-mode',
        {
          method: 'PATCH',
          headers: PARENT_HEADERS,
          body: JSON.stringify({ accommodationMode: 'short-burst' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      // [WI-867] Post-collapse: callerPersonId always set.
      expect(mockUpdateAccommodationMode).toHaveBeenCalledWith(
        expect.anything(),
        PARENT_PROFILE_ID,
        'test-account-id',
        'short-burst',
        { callerPersonId: PARENT_PROFILE_ID },
      );
      expect(mockFindGuardianship).not.toHaveBeenCalled();
    });

    it('returns 400 when accommodationMode is not a valid enum value', async () => {
      const res = await app.request(
        '/v1/learner-profile/accommodation-mode',
        {
          method: 'PATCH',
          headers: PARENT_HEADERS,
          body: JSON.stringify({ accommodationMode: 'invalid-mode' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockUpdateAccommodationMode).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // accommodation-mode parent route
  // -------------------------------------------------------------------------

  describe('PATCH /learner-profile/:profileId/accommodation-mode (parent)', () => {
    it('returns 200 and calls updateAccommodationMode for linked child', async () => {
      mockFindGuardianship.mockResolvedValue({
        parentProfileId: PARENT_PROFILE_ID,
        childProfileId: OWN_CHILD_PROFILE_ID,
      });

      const res = await app.request(
        `/v1/learner-profile/${OWN_CHILD_PROFILE_ID}/accommodation-mode`,
        {
          method: 'PATCH',
          headers: PARENT_HEADERS,
          body: JSON.stringify({ accommodationMode: 'audio-first' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockUpdateAccommodationMode).toHaveBeenCalledWith(
        expect.anything(),
        OWN_CHILD_PROFILE_ID,
        undefined,
        'audio-first',
      );
    });

    it('returns 403 for non-linked child', async () => {
      mockFindGuardianship.mockResolvedValue(undefined);

      const res = await app.request(
        `/v1/learner-profile/${OTHER_FAMILY_CHILD_ID}/accommodation-mode`,
        {
          method: 'PATCH',
          headers: PARENT_HEADERS,
          body: JSON.stringify({ accommodationMode: 'predictable' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      expect(mockUpdateAccommodationMode).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // [CR-2026-05-21-010] Break tests -- non-owner MINOR profiles must be blocked
  // from self-routes that mutate consent / collection state.
  // Red: these assertions fail before the assertCanManageOwnConsent gate is added.
  // Green: they pass after the gate is in place.
  // The same profile can still read its own profile (export-text GET).
  // An adult non-owner (18+) is still allowed to manage its own consent.
  // -------------------------------------------------------------------------

  describe('[CR-2026-05-21-010] minor non-owner profile is blocked from self consent/collection mutations', () => {
    const MINOR_NON_OWNER_PROFILE_ID = TEST_PROFILE_ID_3;
    const MINOR_NON_OWNER_HEADERS = makeAuthHeaders({
      'X-Profile-Id': MINOR_NON_OWNER_PROFILE_ID,
    });

    beforeEach(() => {
      // [WI-867] Post-collapse: profile-scope middleware calls getPersonScope (profile-v2).
      // Override to return a non-owner minor profile (birthYear 2012 → age ~14).
      // RED-FLIP: remove this override and all BREAK tests flip 403 → 200.
      mockGetPersonScope.mockImplementation(
        async (_db: unknown, profileId: string) => ({
          profileId,
          meta: {
            birthYear: 2012,
            location: null,
            consentStatus: 'CONSENTED',
            hasPremiumLlm: false,
            conversationLanguage: 'en',
            isOwner: false,
          },
        }),
      );
    });

    afterEach(() => {
      // Restore owner scope so subsequent tests start from the right default.
      mockGetPersonScope.mockImplementation(
        async (_db: unknown, profileId: string) => ({
          profileId,
          meta: {
            birthYear: null,
            location: null,
            consentStatus: 'CONSENTED',
            hasPremiumLlm: false,
            conversationLanguage: 'en',
            isOwner: true,
          },
        }),
      );
    });

    it('[BREAK] DELETE /learner-profile/all returns 403 for minor non-owner profile', async () => {
      const res = await app.request(
        '/v1/learner-profile/all',
        { method: 'DELETE', headers: MINOR_NON_OWNER_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
      // Gate must block before service is called.
      expect(mockDeleteAllMemory).not.toHaveBeenCalled();
    });

    it('[BREAK] PATCH /learner-profile/collection returns 403 for minor non-owner profile', async () => {
      const res = await app.request(
        '/v1/learner-profile/collection',
        {
          method: 'PATCH',
          headers: MINOR_NON_OWNER_HEADERS,
          body: JSON.stringify({ memoryCollectionEnabled: false }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
      expect(mockToggleMemoryCollection).not.toHaveBeenCalled();
    });

    it('[BREAK] PATCH /learner-profile/injection returns 403 for minor non-owner profile', async () => {
      const res = await app.request(
        '/v1/learner-profile/injection',
        {
          method: 'PATCH',
          headers: MINOR_NON_OWNER_HEADERS,
          body: JSON.stringify({ memoryInjectionEnabled: false }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
      expect(mockToggleMemoryInjection).not.toHaveBeenCalled();
    });

    it('[BREAK] POST /learner-profile/consent returns 403 for minor non-owner profile', async () => {
      const res = await app.request(
        '/v1/learner-profile/consent',
        {
          method: 'POST',
          headers: MINOR_NON_OWNER_HEADERS,
          body: JSON.stringify({ consent: 'granted' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
      expect(mockGrantMemoryConsent).not.toHaveBeenCalled();
    });

    it('GET /learner-profile/export-text returns 200 for minor non-owner profile (read is not gated)', async () => {
      // Read-only routes must not be affected by the consent/collection gate.
      const res = await app.request(
        '/v1/learner-profile/export-text',
        { headers: MINOR_NON_OWNER_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
    });
  });

  describe('[CR-2026-05-21-010] adult non-owner profile (18+) is allowed to manage own consent', () => {
    const ADULT_NON_OWNER_PROFILE_ID = TEST_PROFILE_ID_4;
    const ADULT_NON_OWNER_HEADERS = makeAuthHeaders({
      'X-Profile-Id': ADULT_NON_OWNER_PROFILE_ID,
    });

    beforeEach(() => {
      // getProfile resolves to a non-owner adult profile (birthYear 2000 -> age ~26).
      const profileServiceMock = jest.requireMock(
        '../services/profile',
      ) as Record<string, jest.Mock>;
      profileServiceMock['getProfile']!.mockImplementation(
        async (_db: unknown, profileId: string) => ({
          id: profileId,
          birthYear: 2000,
          location: null,
          consentStatus: 'CONSENTED',
          isOwner: false,
          hasPremiumLlm: false,
          conversationLanguage: 'en',
        }),
      );
      mockDeleteAllMemory.mockResolvedValue(undefined);
      mockGrantMemoryConsent.mockResolvedValue(undefined);
      mockToggleMemoryCollection.mockResolvedValue(undefined);
      mockToggleMemoryInjection.mockResolvedValue(undefined);
    });

    it('DELETE /learner-profile/all returns 200 for adult non-owner profile', async () => {
      const res = await app.request(
        '/v1/learner-profile/all',
        { method: 'DELETE', headers: ADULT_NON_OWNER_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockDeleteAllMemory).toHaveBeenCalledWith(
        expect.anything(),
        ADULT_NON_OWNER_PROFILE_ID,
        'test-account-id',
        { callerPersonId: PARENT_PROFILE_ID },
      );
    });

    it('POST /learner-profile/consent returns 200 for adult non-owner profile', async () => {
      const res = await app.request(
        '/v1/learner-profile/consent',
        {
          method: 'POST',
          headers: ADULT_NON_OWNER_HEADERS,
          body: JSON.stringify({ consent: 'granted' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockGrantMemoryConsent).toHaveBeenCalledWith(
        expect.anything(),
        ADULT_NON_OWNER_PROFILE_ID,
        'test-account-id',
        'granted',
        { callerPersonId: PARENT_PROFILE_ID },
      );
    });
  });

  // -------------------------------------------------------------------------
  // [CR-2026-05-19-H1] Break tests — non-owner profile must be rejected from
  // all parent-child routes that require assertOwnerAndParentAccess.
  // A child on a parent's account (isOwner:false) must get 403, not data.
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // [CR-2026-05-21-010] Break tests — non-owner MINOR profiles must be blocked
  // from self-routes that mutate consent / collection state.
  // Red: these assertions fail before the assertCanManageOwnConsent gate is added.
  // Green: they pass after the gate is in place.
  // The same profile can still read its own profile (GET /learner-profile).
  // An adult non-owner (18+) is still allowed to manage its own consent.
  // -------------------------------------------------------------------------

  describe('[CR-2026-05-21-010] minor non-owner profile is blocked from self consent/collection mutations', () => {
    const MINOR_NON_OWNER_PROFILE_ID = TEST_PROFILE_ID_3;
    const MINOR_NON_OWNER_HEADERS = makeAuthHeaders({
      'X-Profile-Id': MINOR_NON_OWNER_PROFILE_ID,
    });

    beforeEach(() => {
      // getProfile resolves to a non-owner minor profile (birthYear 2012 → age ~14).
      const profileServiceMock = jest.requireMock(
        '../services/profile',
      ) as Record<string, jest.Mock>;
      profileServiceMock['getProfile']!.mockImplementation(
        async (_db: unknown, profileId: string) => ({
          id: profileId,
          birthYear: 2012,
          location: null,
          consentStatus: 'CONSENTED',
          isOwner: false,
          hasPremiumLlm: false,
          conversationLanguage: 'en',
        }),
      );
      // [WI-867] Post-collapse: profile-scope middleware calls getPersonScope (v2).
      // Override to minor non-owner so assertCanManageOwnConsent blocks the mutation.
      mockGetPersonScope.mockImplementation(async (_db, profileId) => ({
        profileId,
        meta: {
          birthYear: 2012,
          location: null,
          consentStatus: 'CONSENTED',
          hasPremiumLlm: false,
          conversationLanguage: 'en',
          isOwner: false,
        },
      }));
    });

    afterEach(() => {
      // Restore default getPersonScope so sibling describe blocks are unaffected.
      mockGetPersonScope.mockImplementation(async (_db, profileId) => ({
        profileId,
        meta: {
          birthYear: null,
          location: null,
          consentStatus: 'CONSENTED',
          hasPremiumLlm: false,
          conversationLanguage: 'en',
          isOwner: true,
        },
      }));
    });

    it('[BREAK] DELETE /learner-profile/all returns 403 for minor non-owner profile', async () => {
      const res = await app.request(
        '/v1/learner-profile/all',
        { method: 'DELETE', headers: MINOR_NON_OWNER_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
      // Gate must block before service is called.
      expect(mockDeleteAllMemory).not.toHaveBeenCalled();
    });

    it('[BREAK] PATCH /learner-profile/collection returns 403 for minor non-owner profile', async () => {
      const res = await app.request(
        '/v1/learner-profile/collection',
        {
          method: 'PATCH',
          headers: MINOR_NON_OWNER_HEADERS,
          body: JSON.stringify({ memoryCollectionEnabled: false }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
      expect(mockToggleMemoryCollection).not.toHaveBeenCalled();
    });

    it('[BREAK] PATCH /learner-profile/injection returns 403 for minor non-owner profile', async () => {
      const res = await app.request(
        '/v1/learner-profile/injection',
        {
          method: 'PATCH',
          headers: MINOR_NON_OWNER_HEADERS,
          body: JSON.stringify({ memoryInjectionEnabled: false }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
      expect(mockToggleMemoryInjection).not.toHaveBeenCalled();
    });

    it('[BREAK] POST /learner-profile/consent returns 403 for minor non-owner profile', async () => {
      const res = await app.request(
        '/v1/learner-profile/consent',
        {
          method: 'POST',
          headers: MINOR_NON_OWNER_HEADERS,
          body: JSON.stringify({ consent: 'granted' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
      expect(mockGrantMemoryConsent).not.toHaveBeenCalled();
    });

    it('GET /learner-profile/export-text returns 200 for minor non-owner profile (read is not gated)', async () => {
      // Read-only routes must not be affected by the consent/collection gate.
      const res = await app.request(
        '/v1/learner-profile/export-text',
        { headers: MINOR_NON_OWNER_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
    });
  });

  describe('[CR-2026-05-21-010] adult non-owner profile (18+) is allowed to manage own consent', () => {
    const ADULT_NON_OWNER_PROFILE_ID = TEST_PROFILE_ID_4;
    const ADULT_NON_OWNER_HEADERS = makeAuthHeaders({
      'X-Profile-Id': ADULT_NON_OWNER_PROFILE_ID,
    });

    beforeEach(() => {
      // getProfile resolves to a non-owner adult profile (birthYear 2000 → age ~26).
      const profileServiceMock = jest.requireMock(
        '../services/profile',
      ) as Record<string, jest.Mock>;
      profileServiceMock['getProfile']!.mockImplementation(
        async (_db: unknown, profileId: string) => ({
          id: profileId,
          birthYear: 2000,
          location: null,
          consentStatus: 'CONSENTED',
          isOwner: false,
          hasPremiumLlm: false,
          conversationLanguage: 'en',
        }),
      );
      mockDeleteAllMemory.mockResolvedValue(undefined);
      mockGrantMemoryConsent.mockResolvedValue(undefined);
      mockToggleMemoryCollection.mockResolvedValue(undefined);
      mockToggleMemoryInjection.mockResolvedValue(undefined);
    });

    it('DELETE /learner-profile/all returns 200 for adult non-owner profile', async () => {
      const res = await app.request(
        '/v1/learner-profile/all',
        { method: 'DELETE', headers: ADULT_NON_OWNER_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockDeleteAllMemory).toHaveBeenCalledWith(
        expect.anything(),
        ADULT_NON_OWNER_PROFILE_ID,
        'test-account-id',
        { callerPersonId: PARENT_PROFILE_ID },
      );
    });

    it('POST /learner-profile/consent returns 200 for adult non-owner profile', async () => {
      const res = await app.request(
        '/v1/learner-profile/consent',
        {
          method: 'POST',
          headers: ADULT_NON_OWNER_HEADERS,
          body: JSON.stringify({ consent: 'granted' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockGrantMemoryConsent).toHaveBeenCalledWith(
        expect.anything(),
        ADULT_NON_OWNER_PROFILE_ID,
        'test-account-id',
        'granted',
        { callerPersonId: PARENT_PROFILE_ID },
      );
    });
  });

  describe('[CR-2026-05-19-H1] non-owner profile is rejected from parent child routes', () => {
    const NON_OWNER_PROFILE_ID = TEST_PROFILE_ID_5;
    const NON_OWNER_HEADERS = makeAuthHeaders({
      'X-Profile-Id': NON_OWNER_PROFILE_ID,
    });

    beforeEach(() => {
      // [WI-867] Post-collapse: profile-scope middleware calls getPersonScope (profile-v2).
      // Override to non-owner so isOwner gate fires 403 before IDOR check.
      // RED-FLIP: remove this override and the non-owner tests flip 403 → 200.
      mockGetPersonScope.mockImplementation(
        async (_db: unknown, profileId: string) => ({
          profileId,
          meta: {
            birthYear: 2012,
            location: null,
            consentStatus: 'CONSENTED',
            hasPremiumLlm: false,
            conversationLanguage: 'en',
            isOwner: false,
          },
        }),
      );
      // Family link exists — IDOR check would pass, but isOwner gate must fire first.
      mockFindGuardianship.mockResolvedValue({
        id: 'guardianship-1',
        guardianPersonId: NON_OWNER_PROFILE_ID,
        chargePersonId: OWN_CHILD_PROFILE_ID,
        revokedAt: null,
      });
    });

    afterEach(() => {
      // Restore owner scope so subsequent tests start from the right default.
      mockGetPersonScope.mockImplementation(
        async (_db: unknown, profileId: string) => ({
          profileId,
          meta: {
            birthYear: null,
            location: null,
            consentStatus: 'CONSENTED',
            hasPremiumLlm: false,
            conversationLanguage: 'en',
            isOwner: true,
          },
        }),
      );
    });

    it('[BREAK] GET /learner-profile/:profileId returns 403 for non-owner profile', async () => {
      const res = await app.request(
        `/v1/learner-profile/${OWN_CHILD_PROFILE_ID}`,
        { headers: NON_OWNER_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
      // isOwner gate fires at route entry — service must not be called.
      expect(mockGetOrCreateLearningProfile).not.toHaveBeenCalled();
    });

    it('[BREAK] DELETE /learner-profile/:profileId/all returns 403 for non-owner profile', async () => {
      const res = await app.request(
        `/v1/learner-profile/${OWN_CHILD_PROFILE_ID}/all`,
        { method: 'DELETE', headers: NON_OWNER_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
      expect(mockDeleteAllMemory).not.toHaveBeenCalled();
    });

    it('[BREAK] POST /learner-profile/:profileId/consent returns 403 for non-owner profile', async () => {
      const res = await app.request(
        `/v1/learner-profile/${OWN_CHILD_PROFILE_ID}/consent`,
        {
          method: 'POST',
          headers: NON_OWNER_HEADERS,
          body: JSON.stringify({ consent: 'granted' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
      expect(mockGrantMemoryConsent).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // [Issue 901] BREAK — owner/parent-admin gates must NOT be reachable by simply
  // omitting X-Profile-Id. profileScopeMiddleware auto-resolves the account OWNER
  // (isOwner:true, resolvedVia:'auto') on the no-header path; before the fix an
  // authenticated NON-OWNER caller (a child on the account, or anyone holding the
  // account JWT) could omit the header to pass assertOwnerAndParentAccess /
  // assertCanManageOwnConsent. These tests send a valid auth token but NO
  // X-Profile-Id — the exact attack — and assert a 403 plus that the side-effect
  // service was never invoked.
  //
  // findOwnerProfile is overridden to return the OWNER so the auto-resolve
  // SUCCEEDS (isOwner:true); the rejection therefore comes purely from
  // resolvedVia:'auto', not from an absent profileMeta.
  // -------------------------------------------------------------------------
  describe('[Issue 901] no-header auto-resolve must not confer owner/parent-admin privileges', () => {
    beforeEach(() => {
      const profileServiceMock = jest.requireMock(
        '../services/profile',
      ) as Record<string, jest.Mock>;
      profileServiceMock['findOwnerProfile']!.mockResolvedValue({
        id: PARENT_PROFILE_ID,
        accountId: 'test-account-id',
        birthYear: 1985,
        location: null,
        consentStatus: 'CONSENTED',
        isOwner: true,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
      });
      // A valid parent->child family link exists; the rejection must come from
      // the explicit-header requirement, NOT a missing link.
      mockFindGuardianship.mockResolvedValue({
        id: 'guardianship-1',
        guardianPersonId: PARENT_PROFILE_ID,
        chargePersonId: OWN_CHILD_PROFILE_ID,
        revokedAt: null,
      });
      // [WI-867] v2: with no X-Profile-Id, profileScopeMiddleware auto-resolves
      // the account owner via findOwnerPersonScope. Seed it so the request
      // reaches assertOwnerAndParentAccess — which then rejects (403) precisely
      // because resolvedVia is 'auto', not 'explicit-header' (the attack guard).
      mockFindOwnerPersonScope.mockResolvedValue({
        profileId: PARENT_PROFILE_ID,
        meta: {
          birthYear: 1985,
          location: null,
          consentStatus: 'CONSENTED',
          hasPremiumLlm: false,
          conversationLanguage: 'en',
          isOwner: true,
        },
      });
    });

    it('[BREAK] POST /learner-profile/:profileId/consent (assertOwnerAndParentAccess) returns 403 when X-Profile-Id is omitted', async () => {
      const res = await app.request(
        `/v1/learner-profile/${OWN_CHILD_PROFILE_ID}/consent`,
        {
          method: 'POST',
          headers: makeAuthHeaders(),
          body: JSON.stringify({ consent: 'granted' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
      expect(mockGrantMemoryConsent).not.toHaveBeenCalled();
    });

    it('[BREAK] POST /learner-profile/consent (assertCanManageOwnConsent) returns 403 when X-Profile-Id is omitted', async () => {
      const res = await app.request(
        '/v1/learner-profile/consent',
        {
          method: 'POST',
          headers: makeAuthHeaders(),
          body: JSON.stringify({ consent: 'granted' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
      expect(mockGrantMemoryConsent).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // [WI-371 / DS-185 / WI-274] Tell-Mentor self-write must be proxy-blocked at
  // the ROUTE layer. In the full app the metering middleware already calls
  // assertNotProxyMode for /learner-profile/tell (it is an LLM-metered route),
  // so an end-to-end test cannot distinguish a route guard from the metering
  // guard. This suite mounts learnerProfileRoutes in isolation (no metering)
  // to verify the route handler itself rejects proxy callers — defense in
  // depth that survives any future change to the metering allowlist, matching
  // the WI-76 pattern (which route-guards the metered /stream).
  // Red: 200 (handler calls parseLearnerInput) before the guard.
  // Green: 403 PROXY_MODE after the guard.
  // -------------------------------------------------------------------------
  describe('[WI-371 / DS-185] Tell-Mentor self-write route-level proxy guard', () => {
    const parseLearnerInputMock = (
      jest.requireMock('../services/learner-input') as {
        parseLearnerInput: jest.Mock;
      }
    ).parseLearnerInput;

    function makeProxyApp() {
      const proxyApp = new Hono();
      proxyApp.use('*', async (c, next) => {
        c.set('db' as never, {});
        c.set('profileId' as never, 'a0000000-0000-4000-a000-000000000001');
        c.set('account' as never, { id: 'test-account-id' });
        c.set('profileMeta' as never, { isOwner: false });
        await next();
      });
      proxyApp.route('/', learnerProfileRoutes);
      return proxyApp;
    }

    it('[BREAK] POST /learner-profile/tell returns 403 PROXY_MODE for a non-owner (proxy) profile', async () => {
      const res = await makeProxyApp().request('/learner-profile/tell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Remember that I love dinosaurs' }),
      });

      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('PROXY_MODE');
      // Guard must fire before the parse service is reached.
      expect(parseLearnerInputMock).not.toHaveBeenCalled();
    });

    it('[BREAK] DELETE /learner-profile/item returns 403 PROXY_MODE for a non-owner (proxy) profile', async () => {
      const res = await makeProxyApp().request('/learner-profile/item', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'interests', value: 'dinosaurs' }),
      });

      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('PROXY_MODE');
      expect(mockDeleteMemoryItem).not.toHaveBeenCalled();
    });

    it('[BREAK] POST /learner-profile/unsuppress returns 403 PROXY_MODE for a non-owner (proxy) profile', async () => {
      const res = await makeProxyApp().request('/learner-profile/unsuppress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'dinosaurs' }),
      });

      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('PROXY_MODE');
      expect(mockUnsuppressInference).not.toHaveBeenCalled();
    });

    // [SEC-L2-ACCMODE] The accommodation-mode self route was the lone
    // unguarded self-write in this file, and is NOT in the metering allowlist,
    // so the metering middleware's assertNotProxyMode never covered it. A proxy
    // (parent-as-child, isOwner === false) session could mutate the child's
    // accommodation mode through the self route, bypassing the owner +
    // parent-link verification on /:profileId/accommodation-mode.
    // Red: 200 (handler calls updateAccommodationMode) before the guard.
    // Green: 403 PROXY_MODE after the guard.
    it('[BREAK] PATCH /learner-profile/accommodation-mode returns 403 PROXY_MODE for a non-owner (proxy) profile', async () => {
      const res = await makeProxyApp().request(
        '/learner-profile/accommodation-mode',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accommodationMode: 'short-burst' }),
        },
      );

      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('PROXY_MODE');
      // Guard must fire before the service mutation is reached.
      expect(mockUpdateAccommodationMode).not.toHaveBeenCalled();
    });
  });
});
