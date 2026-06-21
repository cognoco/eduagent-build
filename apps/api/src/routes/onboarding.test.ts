// ---------------------------------------------------------------------------
// onboarding.test.ts — negative-path coverage for routes/onboarding.ts
// Phase 3 of test-coverage-hardening-plan.md
//
// Pattern: real JWT + real auth middleware, service layer mocked via
// gc1-allow pattern-a (requireActual + targeted overrides), database module
// mock so no DB connection required.
//
// The onboarding routes have two variants each:
//   - PATCH /onboarding/<dimension>        → writes to the active profile
//   - PATCH /onboarding/:profileId/<dim>   → parent writes to a child profile
//     (requires assertParentAccess via db.query.familyLinks)
// ---------------------------------------------------------------------------

import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';

// ---------------------------------------------------------------------------
// Database mock — family link query must be controllable per test
// ---------------------------------------------------------------------------

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({ includeActual: true });

// assertParentAccess uses db.query.familyLinks.findFirst. We default to a
// valid link (parent has access to child) so happy-path tests don't need to
// override it. Tests that exercise the forbidden path override per-call.
const mockFindFamilyLink = jest.fn().mockResolvedValue({
  parentProfileId: 'test-profile-id',
  childProfileId: 'a0000000-0000-4000-a000-000000000099',
});
const mockFindConsentState = jest.fn().mockResolvedValue(undefined);

mockDatabaseModule.db.query = new Proxy(mockDatabaseModule.db.query as object, {
  get(target, prop, receiver) {
    if (prop === 'familyLinks') {
      return { findFirst: (...args: unknown[]) => mockFindFamilyLink(...args) };
    }
    if (prop === 'consentStates') {
      return {
        findFirst: (...args: unknown[]) => mockFindConsentState(...args),
      };
    }
    return Reflect.get(target, prop, receiver);
  },
});

jest.mock(
  '@eduagent/database' /* gc1-allow: route unit test — DB middleware injected via mock; real DB covered by route integration / e2e tests */,
  () => mockDatabaseModule.module,
);

// ---------------------------------------------------------------------------
// Account + profile service mocks
// ---------------------------------------------------------------------------

jest.mock('../services/account' /* gc1-allow: pattern-a conversion */, () => {
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

jest.mock('../services/profile' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../services/profile',
  ) as typeof import('../services/profile');
  return {
    ...actual,
    findOwnerProfile: jest.fn().mockResolvedValue(null),
    getProfile: jest.fn().mockResolvedValue({
      id: 'test-profile-id',
      birthYear: 2008,
      location: null,
      consentStatus: 'CONSENTED',
      hasPremiumLlm: false,
      isOwner: true,
    }),
  };
});

// ---------------------------------------------------------------------------
// Onboarding service mock
// ---------------------------------------------------------------------------

const mockUpdateConversationLanguage = jest.fn();
const mockUpdatePronouns = jest.fn();
const mockUpdateInterestsContext = jest.fn();

jest.mock(
  '../services/onboarding' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../services/onboarding',
    ) as typeof import('../services/onboarding');
    return {
      ...actual,
      // Preserve the error class so instanceof checks work in the route handler
      updateConversationLanguage: (...args: unknown[]) =>
        mockUpdateConversationLanguage(...args),
      updatePronouns: (...args: unknown[]) => mockUpdatePronouns(...args),
      updateInterestsContext: (...args: unknown[]) =>
        mockUpdateInterestsContext(...args),
    };
  },
);

// ---------------------------------------------------------------------------
// Inngest framework boundary mock (required by index.ts import chain)
// ---------------------------------------------------------------------------

jest.mock('inngest/hono', () => ({
  // gc1-allow: Inngest framework boundary
  serve: jest.fn().mockReturnValue(jest.fn()),
}));

jest.mock('../inngest/client' /* gc1-allow: pattern-a conversion */, () => {
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

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import { app } from '../index';
import { onboardingRoutes } from './onboarding';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';
import { OnboardingNotFoundError } from '../services/onboarding';

const TEST_ENV = {
  ...BASE_AUTH_ENV,
  // DATABASE_URL is required so databaseMiddleware sets db on the context.
  // assertParentAccess (called directly in parent onboarding routes) reads
  // db.query.familyLinks.findFirst — which our Proxy intercepts.
  DATABASE_URL: 'postgresql://test:test@localhost/test',
};
const AUTH_HEADERS = makeAuthHeaders({ 'X-Profile-Id': 'test-profile-id' });
// CHILD_PROFILE_ID must be a valid UUID; the profileId param is used as a
// family-link lookup key and may be validated by Drizzle ORM helpers.
const CHILD_PROFILE_ID = 'a0000000-0000-4000-a000-000000000099';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('onboarding routes', () => {
  beforeAll(() => {
    installTestJwksInterceptor();
  });

  afterAll(() => {
    restoreTestFetch();
  });

  beforeEach(() => {
    clearJWKSCache();
    jest.clearAllMocks();
    // Reset to valid family link by default; null → forbidden path
    mockFindFamilyLink.mockResolvedValue({
      parentProfileId: 'test-profile-id',
      childProfileId: CHILD_PROFILE_ID,
    });
    mockFindConsentState.mockResolvedValue(undefined);
  });

  function mockAutoResolvedOwnerProfile() {
    const { findOwnerProfile } = jest.requireMock('../services/profile');
    findOwnerProfile.mockResolvedValueOnce({
      id: 'test-profile-id',
      birthYear: 1990,
      location: null,
      consentStatus: 'CONSENTED',
      hasPremiumLlm: false,
      conversationLanguage: 'en',
      isOwner: true,
    });
  }

  // ---- PATCH /v1/onboarding/language (self) --------------------------------

  describe('PATCH /v1/onboarding/language', () => {
    it('returns 200 on successful language update', async () => {
      mockUpdateConversationLanguage.mockResolvedValueOnce(undefined);

      const res = await app.request(
        '/v1/onboarding/language',
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ conversationLanguage: 'nb' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(mockUpdateConversationLanguage).toHaveBeenCalledWith(
        expect.anything(),
        'test-profile-id',
        'test-account-id',
        'nb',
      );
    });

    it('returns 400 for invalid language (not in enum)', async () => {
      const res = await app.request(
        '/v1/onboarding/language',
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ conversationLanguage: 'zz' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockUpdateConversationLanguage).not.toHaveBeenCalled();
    });

    it('returns 400 for missing conversationLanguage field', async () => {
      const res = await app.request(
        '/v1/onboarding/language',
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockUpdateConversationLanguage).not.toHaveBeenCalled();
    });

    it('returns 404 when profile not found (OnboardingNotFoundError)', async () => {
      mockUpdateConversationLanguage.mockRejectedValueOnce(
        new OnboardingNotFoundError('test-profile-id'),
      );

      const res = await app.request(
        '/v1/onboarding/language',
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ conversationLanguage: 'en' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        '/v1/onboarding/language',
        {
          method: 'PATCH',
          body: JSON.stringify({ conversationLanguage: 'en' }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });

    it('returns 400 when profile cannot be resolved (no X-Profile-Id and no owner)', async () => {
      const res = await app.request(
        '/v1/onboarding/language',
        {
          method: 'PATCH',
          headers: makeAuthHeaders(),
          body: JSON.stringify({ conversationLanguage: 'en' }),
        },
        TEST_ENV,
      );
      expect(res.status).toBe(400);
      expect(mockUpdateConversationLanguage).not.toHaveBeenCalled();
    });

    // [CR-2026-05-21-011] Break test: a non-owner (child) profile must NOT be
    // able to PATCH conversationLanguage on its own profile. The tutor language
    // is an account-level setting owned by the parent.
    it('[CR-2026-05-21-011] returns 403 when non-owner profile tries to PATCH conversationLanguage', async () => {
      const { getProfile } = jest.requireMock('../services/profile');
      // Caller is a child profile (isOwner: false)
      getProfile.mockResolvedValueOnce({
        id: 'test-profile-id',
        birthYear: 2010,
        location: null,
        consentStatus: 'CONSENTED',
        hasPremiumLlm: false,
        isOwner: false,
      });

      const res = await app.request(
        '/v1/onboarding/language',
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ conversationLanguage: 'nb' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      // toEqual asserts the exact serialized body — proves the
      // assertOwnerProfile message-passthrough (thrown ForbiddenError apiCode
      // is undefined → dropped by JSON, so the body is exactly { code, message }).
      const body = await res.json();
      expect(body).toEqual({
        code: 'FORBIDDEN',
        message: 'Only the account owner can change the conversation language.',
      });
      expect(mockUpdateConversationLanguage).not.toHaveBeenCalled();
    });

    // [CR-2026-05-21-011] Positive companion: an owner profile can still PATCH
    // conversationLanguage successfully.
    it('[CR-2026-05-21-011] returns 200 when owner profile PATCHes conversationLanguage', async () => {
      mockUpdateConversationLanguage.mockResolvedValueOnce(undefined);
      // Default mock already returns isOwner: true — no override needed.

      const res = await app.request(
        '/v1/onboarding/language',
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ conversationLanguage: 'de' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(mockUpdateConversationLanguage).toHaveBeenCalledWith(
        expect.anything(),
        'test-profile-id',
        'test-account-id',
        'de',
      );
    });
  });

  // ---- PATCH /v1/onboarding/:profileId/language (parent-on-behalf) ---------

  describe('PATCH /v1/onboarding/:profileId/language (parent)', () => {
    it('returns 200 when parent has access to child', async () => {
      mockUpdateConversationLanguage.mockResolvedValueOnce(undefined);

      const res = await app.request(
        `/v1/onboarding/${CHILD_PROFILE_ID}/language`,
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ conversationLanguage: 'nb' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      // Must write to child profile ID, not the parent's
      expect(mockUpdateConversationLanguage).toHaveBeenCalledWith(
        expect.anything(),
        CHILD_PROFILE_ID,
        'test-account-id',
        'nb',
      );
    });

    it('returns 403 when parent does NOT have access to child (IDOR protection)', async () => {
      // No family link → assertParentAccess throws ForbiddenError
      mockFindFamilyLink.mockResolvedValueOnce(null);

      const res = await app.request(
        `/v1/onboarding/${CHILD_PROFILE_ID}/language`,
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ conversationLanguage: 'nb' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      expect(mockUpdateConversationLanguage).not.toHaveBeenCalled();
    });

    // [BUG-406 / CR-2026-05-19-H1] Break test: a non-owner profile (child on
    // a parent's account, isOwner: false) must NOT be able to mutate another
    // child's onboarding fields even when a family_link row exists. Previously
    // assertParentAccess only checked the link — not whether the caller is the
    // account owner. assertOwnerAndParentAccess adds that gate.
    it('[BUG-406] returns 403 when non-owner profile tries to update child language', async () => {
      const { getProfile } = jest.requireMock('../services/profile');
      // Caller profile is a child account (isOwner: false)
      getProfile.mockResolvedValueOnce({
        id: 'test-profile-id',
        birthYear: 2008,
        location: null,
        consentStatus: 'CONSENTED',
        hasPremiumLlm: false,
        isOwner: false,
      });
      // Family link exists — the bug was that this was sufficient to grant access
      mockFindFamilyLink.mockResolvedValue({
        parentProfileId: 'test-profile-id',
        childProfileId: CHILD_PROFILE_ID,
      });

      const res = await app.request(
        `/v1/onboarding/${CHILD_PROFILE_ID}/language`,
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ conversationLanguage: 'nb' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      expect(mockUpdateConversationLanguage).not.toHaveBeenCalled();
    });

    it('returns 404 when child profile not found after access granted', async () => {
      mockUpdateConversationLanguage.mockRejectedValueOnce(
        new OnboardingNotFoundError(CHILD_PROFILE_ID),
      );

      const res = await app.request(
        `/v1/onboarding/${CHILD_PROFILE_ID}/language`,
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ conversationLanguage: 'en' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 400 for invalid language', async () => {
      const res = await app.request(
        `/v1/onboarding/${CHILD_PROFILE_ID}/language`,
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ conversationLanguage: 'invalid' }),
        },
        TEST_ENV,
      );
      expect(res.status).toBe(400);
      expect(mockUpdateConversationLanguage).not.toHaveBeenCalled();
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        `/v1/onboarding/${CHILD_PROFILE_ID}/language`,
        {
          method: 'PATCH',
          body: JSON.stringify({ conversationLanguage: 'en' }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });

  // ---- PATCH /v1/onboarding/pronouns (self) --------------------------------

  describe('PATCH /v1/onboarding/pronouns', () => {
    it('returns 200 on successful pronouns update', async () => {
      mockUpdatePronouns.mockResolvedValueOnce(undefined);

      const res = await app.request(
        '/v1/onboarding/pronouns',
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ pronouns: 'they/them' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(mockUpdatePronouns).toHaveBeenCalledWith(
        expect.anything(),
        'test-profile-id',
        'test-account-id',
        'they/them',
      );
    });

    it('returns 200 when clearing pronouns (null)', async () => {
      mockUpdatePronouns.mockResolvedValueOnce(undefined);

      const res = await app.request(
        '/v1/onboarding/pronouns',
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ pronouns: null }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockUpdatePronouns).toHaveBeenCalledWith(
        expect.anything(),
        'test-profile-id',
        'test-account-id',
        null,
      );
    });

    it('returns 400 for pronouns exceeding 32 characters', async () => {
      const res = await app.request(
        '/v1/onboarding/pronouns',
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ pronouns: 'x'.repeat(33) }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockUpdatePronouns).not.toHaveBeenCalled();
    });

    it('returns 400 for missing pronouns field entirely', async () => {
      const res = await app.request(
        '/v1/onboarding/pronouns',
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockUpdatePronouns).not.toHaveBeenCalled();
    });

    it('returns 404 when profile not found', async () => {
      mockUpdatePronouns.mockRejectedValueOnce(
        new OnboardingNotFoundError('test-profile-id'),
      );

      const res = await app.request(
        '/v1/onboarding/pronouns',
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ pronouns: 'he/him' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        '/v1/onboarding/pronouns',
        {
          method: 'PATCH',
          body: JSON.stringify({ pronouns: 'they/them' }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });

  // ---- PATCH /v1/onboarding/:profileId/pronouns (parent-on-behalf) ---------

  describe('PATCH /v1/onboarding/:profileId/pronouns (parent)', () => {
    it('returns 200 when parent has access to child', async () => {
      mockUpdatePronouns.mockResolvedValueOnce(undefined);

      const res = await app.request(
        `/v1/onboarding/${CHILD_PROFILE_ID}/pronouns`,
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ pronouns: 'she/her' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockUpdatePronouns).toHaveBeenCalledWith(
        expect.anything(),
        CHILD_PROFILE_ID,
        'test-account-id',
        'she/her',
      );
    });

    it('returns 403 when parent does NOT have access to child (IDOR protection)', async () => {
      mockFindFamilyLink.mockResolvedValueOnce(null);

      const res = await app.request(
        `/v1/onboarding/${CHILD_PROFILE_ID}/pronouns`,
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ pronouns: 'he/him' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      expect(mockUpdatePronouns).not.toHaveBeenCalled();
    });

    // [BUG-406 / CR-2026-05-19-H1] Break test: non-owner profile must be blocked.
    it('[BUG-406] returns 403 when non-owner profile tries to update child pronouns', async () => {
      const { getProfile } = jest.requireMock('../services/profile');
      getProfile.mockResolvedValueOnce({
        id: 'test-profile-id',
        birthYear: 2008,
        location: null,
        consentStatus: 'CONSENTED',
        hasPremiumLlm: false,
        isOwner: false,
      });
      mockFindFamilyLink.mockResolvedValue({
        parentProfileId: 'test-profile-id',
        childProfileId: CHILD_PROFILE_ID,
      });

      const res = await app.request(
        `/v1/onboarding/${CHILD_PROFILE_ID}/pronouns`,
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ pronouns: 'they/them' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      expect(mockUpdatePronouns).not.toHaveBeenCalled();
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        `/v1/onboarding/${CHILD_PROFILE_ID}/pronouns`,
        {
          method: 'PATCH',
          body: JSON.stringify({ pronouns: 'he/him' }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });

  // ---- PATCH /v1/onboarding/interests/context (self) ----------------------

  describe('PATCH /v1/onboarding/interests/context', () => {
    const validInterests = [
      { label: 'Space exploration', context: 'school' as const },
      { label: 'Video games', context: 'free_time' as const },
    ];

    it('returns 200 on successful interests update', async () => {
      mockUpdateInterestsContext.mockResolvedValueOnce(undefined);

      const res = await app.request(
        '/v1/onboarding/interests/context',
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ interests: validInterests }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(mockUpdateInterestsContext).toHaveBeenCalledWith(
        expect.anything(),
        'test-profile-id',
        'test-account-id',
        validInterests,
        { identityV2Enabled: false },
      );
    });

    it('returns 200 with empty interests array (clearing)', async () => {
      mockUpdateInterestsContext.mockResolvedValueOnce(undefined);

      const res = await app.request(
        '/v1/onboarding/interests/context',
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ interests: [] }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
    });

    it('returns 400 for missing interests field', async () => {
      const res = await app.request(
        '/v1/onboarding/interests/context',
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockUpdateInterestsContext).not.toHaveBeenCalled();
    });

    it('returns 400 for interests array exceeding max (21 items)', async () => {
      const tooMany = Array.from({ length: 21 }, (_, i) => ({
        label: `Interest ${i}`,
        context: 'both' as const,
      }));

      const res = await app.request(
        '/v1/onboarding/interests/context',
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ interests: tooMany }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockUpdateInterestsContext).not.toHaveBeenCalled();
    });

    it('returns 400 for interest with invalid context enum', async () => {
      const res = await app.request(
        '/v1/onboarding/interests/context',
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            interests: [{ label: 'Chess', context: 'invalid_context' }],
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockUpdateInterestsContext).not.toHaveBeenCalled();
    });

    it('returns 400 for interest with label exceeding 60 chars', async () => {
      const res = await app.request(
        '/v1/onboarding/interests/context',
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            interests: [{ label: 'x'.repeat(61), context: 'both' }],
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockUpdateInterestsContext).not.toHaveBeenCalled();
    });

    it('returns 404 when profile not found', async () => {
      mockUpdateInterestsContext.mockRejectedValueOnce(
        new OnboardingNotFoundError('test-profile-id'),
      );

      const res = await app.request(
        '/v1/onboarding/interests/context',
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ interests: validInterests }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        '/v1/onboarding/interests/context',
        {
          method: 'PATCH',
          body: JSON.stringify({ interests: validInterests }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });

  // ---- PATCH /v1/onboarding/:profileId/interests/context (parent) ---------

  describe('PATCH /v1/onboarding/:profileId/interests/context (parent)', () => {
    const validInterests = [{ label: 'Math', context: 'school' as const }];

    it('returns 200 when parent has access to child', async () => {
      mockUpdateInterestsContext.mockResolvedValueOnce(undefined);

      const res = await app.request(
        `/v1/onboarding/${CHILD_PROFILE_ID}/interests/context`,
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ interests: validInterests }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      // Must write to child profile ID, not the parent's
      expect(mockUpdateInterestsContext).toHaveBeenCalledWith(
        expect.anything(),
        CHILD_PROFILE_ID,
        'test-account-id',
        validInterests,
        { identityV2Enabled: false },
      );
    });

    it('returns 403 when parent does NOT have access to child (IDOR protection)', async () => {
      mockFindFamilyLink.mockResolvedValueOnce(null);

      const res = await app.request(
        `/v1/onboarding/${CHILD_PROFILE_ID}/interests/context`,
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ interests: validInterests }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      expect(mockUpdateInterestsContext).not.toHaveBeenCalled();
    });

    // [BUG-406 / CR-2026-05-19-H1] Break test: non-owner profile must be blocked.
    it('[BUG-406] returns 403 when non-owner profile tries to update child interests', async () => {
      const { getProfile } = jest.requireMock('../services/profile');
      getProfile.mockResolvedValueOnce({
        id: 'test-profile-id',
        birthYear: 2008,
        location: null,
        consentStatus: 'CONSENTED',
        hasPremiumLlm: false,
        isOwner: false,
      });
      mockFindFamilyLink.mockResolvedValue({
        parentProfileId: 'test-profile-id',
        childProfileId: CHILD_PROFILE_ID,
      });

      const res = await app.request(
        `/v1/onboarding/${CHILD_PROFILE_ID}/interests/context`,
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ interests: validInterests }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      expect(mockUpdateInterestsContext).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid payload on child route', async () => {
      const res = await app.request(
        `/v1/onboarding/${CHILD_PROFILE_ID}/interests/context`,
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );
      expect(res.status).toBe(400);
      expect(mockUpdateInterestsContext).not.toHaveBeenCalled();
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        `/v1/onboarding/${CHILD_PROFILE_ID}/interests/context`,
        {
          method: 'PATCH',
          body: JSON.stringify({ interests: validInterests }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });

  describe('[BREAK][Issue 901] auto-resolved owner identity is not owner authority', () => {
    const validInterests = [{ label: 'Math', context: 'school' as const }];

    it('returns 403 on self language when owner identity was auto-resolved', async () => {
      mockAutoResolvedOwnerProfile();

      const res = await app.request(
        '/v1/onboarding/language',
        {
          method: 'PATCH',
          headers: makeAuthHeaders(),
          body: JSON.stringify({ conversationLanguage: 'nb' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      expect(mockUpdateConversationLanguage).not.toHaveBeenCalled();
    });

    it('returns 403 on child language when owner identity was auto-resolved', async () => {
      mockAutoResolvedOwnerProfile();

      const res = await app.request(
        `/v1/onboarding/${CHILD_PROFILE_ID}/language`,
        {
          method: 'PATCH',
          headers: makeAuthHeaders(),
          body: JSON.stringify({ conversationLanguage: 'nb' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      expect(mockFindFamilyLink).not.toHaveBeenCalled();
      expect(mockUpdateConversationLanguage).not.toHaveBeenCalled();
    });

    it('returns 403 on self pronouns when owner identity was auto-resolved', async () => {
      mockAutoResolvedOwnerProfile();

      const res = await app.request(
        '/v1/onboarding/pronouns',
        {
          method: 'PATCH',
          headers: makeAuthHeaders(),
          body: JSON.stringify({ pronouns: 'they/them' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      expect(mockUpdatePronouns).not.toHaveBeenCalled();
    });

    it('returns 403 on child pronouns when owner identity was auto-resolved', async () => {
      mockAutoResolvedOwnerProfile();

      const res = await app.request(
        `/v1/onboarding/${CHILD_PROFILE_ID}/pronouns`,
        {
          method: 'PATCH',
          headers: makeAuthHeaders(),
          body: JSON.stringify({ pronouns: 'they/them' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      expect(mockFindFamilyLink).not.toHaveBeenCalled();
      expect(mockUpdatePronouns).not.toHaveBeenCalled();
    });

    it('returns 403 on self interests when owner identity was auto-resolved', async () => {
      mockAutoResolvedOwnerProfile();

      const res = await app.request(
        '/v1/onboarding/interests/context',
        {
          method: 'PATCH',
          headers: makeAuthHeaders(),
          body: JSON.stringify({ interests: validInterests }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      expect(mockUpdateInterestsContext).not.toHaveBeenCalled();
    });

    it('returns 403 on child interests when owner identity was auto-resolved', async () => {
      mockAutoResolvedOwnerProfile();

      const res = await app.request(
        `/v1/onboarding/${CHILD_PROFILE_ID}/interests/context`,
        {
          method: 'PATCH',
          headers: makeAuthHeaders(),
          body: JSON.stringify({ interests: validInterests }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      expect(mockFindFamilyLink).not.toHaveBeenCalled();
      expect(mockUpdateInterestsContext).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// [WI-160 / DS-071] Proxy-mode write guard on the 2 self-edit onboarding
// handlers that were not previously gated. (PATCH /onboarding/language already
// had an equivalent isOwner check via a custom 403; not retested here.)
// ---------------------------------------------------------------------------
describe('[WI-160 / DS-071] onboarding self-edit proxy-mode guard', () => {
  function makeProxyApp() {
    const proxyApp = new Hono();
    proxyApp.use('*', async (c, next) => {
      c.set('db' as never, {});
      c.set('profileId' as never, 'a0000000-0000-4000-a000-000000000001');
      c.set('account' as never, { id: 'test-account-id' });
      c.set('user' as never, { id: 'test-user' });
      c.set('profileMeta' as never, {
        isOwner: false,
        birthYear: 1990,
      });
      await next();
    });
    proxyApp.route('/', onboardingRoutes);
    return proxyApp;
  }

  beforeEach(() => jest.clearAllMocks());

  it('PATCH /onboarding/pronouns returns 403 in proxy mode', async () => {
    const res = await makeProxyApp().request('/onboarding/pronouns', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pronouns: 'they/them' }),
    });
    expect(res.status).toBe(403);
  });

  it('PATCH /onboarding/interests/context returns 403 in proxy mode', async () => {
    const res = await makeProxyApp().request('/onboarding/interests/context', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interests: [{ label: 'cooking', context: 'free_time' }],
      }),
    });
    expect(res.status).toBe(403);
  });
});
