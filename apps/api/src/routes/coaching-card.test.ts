// ---------------------------------------------------------------------------
// Real JWT + real auth middleware — no jwt module mock
// ---------------------------------------------------------------------------

import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';

import { createDatabaseModuleMock } from '../test-utils/database-module';
import { personScope } from '../test-utils/identity-v2-scope-mock';

const mockDatabaseModule = createDatabaseModuleMock({ includeActual: true });

jest.mock(
  '@eduagent/database' /* gc1-allow: route unit test — DB middleware injected via mock; real DB covered by route integration / e2e tests */,
  () => mockDatabaseModule.module,
);

const mockFindOrCreateAccount = jest.fn();
jest.mock('../services/account', () => {
  const actual = jest.requireActual(
    '../services/account',
  ) as typeof import('../services/account');
  return {
    ...actual,
    findOrCreateAccount: (...args: unknown[]) =>
      mockFindOrCreateAccount(...args),
  };
});

const mockFindOwnerProfile = jest.fn();
const mockGetProfile = jest.fn();

// [WI-867] v2 profile-scope seam continuity mock.
const mockFindOwnerPersonScope = jest.fn().mockResolvedValue(null);
const mockGetPersonScope = jest.fn().mockResolvedValue(personScope());
jest.mock(
  '../services/identity-v2/profile-v2' /* gc1-allow: continuity — replaces the pre-collapse findOwnerProfile/getProfile mock; db.select() join chain unrunnable on the unit mock DB; real path covered by the identity integration suite */,
  () => ({
    ...jest.requireActual('../services/identity-v2/profile-v2'),
    findOwnerPersonScope: (...a: unknown[]) => mockFindOwnerPersonScope(...a),
    getPersonScope: (...a: unknown[]) => mockGetPersonScope(...a),
  }),
);

jest.mock('../services/profile', () => {
  const actual = jest.requireActual(
    '../services/profile',
  ) as typeof import('../services/profile');
  return {
    ...actual,
    findOwnerProfile: (...args: unknown[]) => mockFindOwnerProfile(...args),
    getProfile: (...args: unknown[]) => mockGetProfile(...args),
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

const mockGetCoachingCardForProfile = jest.fn();
jest.mock('../services/coaching-cards', () => {
  const actual = jest.requireActual(
    '../services/coaching-cards',
  ) as typeof import('../services/coaching-cards');
  return {
    ...actual,
    getCoachingCardForProfile: (...args: unknown[]) =>
      mockGetCoachingCardForProfile(...args),
  };
});

import { Hono } from 'hono';
import { ERROR_CODES } from '@eduagent/schemas';
import { app } from '../index';
import { coachingCardRoutes } from './coaching-card';
import { verifyPersonOwnershipV2 } from '../services/identity-v2/ownership-v2';
import { ForbiddenError } from '../errors';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';

const TEST_ENV = {
  ...BASE_AUTH_ENV,
  // [WI-867] DATABASE_URL required so databaseMiddleware calls createDatabase (mock) and sets db on the context.
  DATABASE_URL: 'postgresql://test:test@localhost/test',
};

const AUTH_HEADERS = makeAuthHeaders({ 'X-Profile-Id': 'test-profile-id' });

beforeAll(() => {
  installTestJwksInterceptor();
});

afterAll(() => {
  restoreTestFetch();
});

beforeEach(() => {
  clearJWKSCache();
  jest.clearAllMocks();

  // Default happy-path returns — tests that need different values override per-test.
  mockFindOrCreateAccount.mockResolvedValue({
    id: 'test-account-id',
    clerkUserId: 'user_test',
    email: 'test@example.com',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  mockFindOwnerProfile.mockResolvedValue(null);
  mockGetProfile.mockResolvedValue({
    id: 'test-profile-id',
    birthYear: null,
    location: null,
    consentStatus: 'CONSENTED',
  });
  // [WI-867] Restore v2 seam defaults after clearAllMocks.
  mockFindOwnerPersonScope.mockResolvedValue(null);
  mockGetPersonScope.mockResolvedValue(personScope());
});

describe('coaching card routes', () => {
  // -------------------------------------------------------------------------
  // GET /v1/coaching-card
  // -------------------------------------------------------------------------

  describe('GET /v1/coaching-card', () => {
    it('returns 200 with coaching card on warm path', async () => {
      mockGetCoachingCardForProfile.mockResolvedValue({
        coldStart: false,
        card: {
          id: 'a0000001-0000-4000-a000-000000000001',
          profileId: 'a0000000-0000-4000-a000-000000000000',
          type: 'challenge',
          title: 'Ready?',
          body: 'Take the next step.',
          priority: 3,
          expiresAt: '2026-02-16T10:00:00.000Z',
          createdAt: '2026-02-15T10:00:00.000Z',
          topicId: 'a0000002-0000-4000-a000-000000000002',
          difficulty: 'easy',
          xpReward: 10,
        },
        fallback: null,
      });

      const res = await app.request(
        '/v1/coaching-card',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.coldStart).toBe(false);
      expect(body.card).not.toBeNull();
      expect(body.card.type).toBe('challenge');
      expect(body.fallback).toBeNull();
    });

    it('returns 200 with cold-start fallback', async () => {
      mockGetCoachingCardForProfile.mockResolvedValue({
        coldStart: true,
        card: null,
        fallback: {
          actions: [
            {
              key: 'continue_learning',
              label: 'Continue learning',
              description: 'Pick up where you left off.',
            },
            {
              key: 'start_new_topic',
              label: 'Start a new topic',
              description: 'Explore something new in your curriculum.',
            },
            {
              key: 'review_progress',
              label: 'Review progress',
              description: 'See how far you have come.',
            },
          ],
        },
      });

      const res = await app.request(
        '/v1/coaching-card',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.coldStart).toBe(true);
      expect(body.card).toBeNull();
      expect(body.fallback).not.toBeNull();
      expect(body.fallback.actions).toHaveLength(3);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/coaching-card', {}, TEST_ENV);

      expect(res.status).toBe(401);
    });
  });

  // ---- [WI-2877] read-authority guard (G15) ----
  // The harness middleware installs profileId ONLY from the request's
  // X-Profile-Id header — the same client-controlled input the real
  // profileScopeMiddleware resolves — so the attack below is a credentialed
  // non-owner request traversing header → middleware → route.
  // profileAuthorityVerifiedFor is deliberately never set (no central
  // proof), which keeps the case mutation-sensitive to the route guard's own
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
      direct.route('/', coachingCardRoutes);
      return direct;
    }

    it('GET /coaching-card rejects a cross-profile X-Profile-Id spoof with 403 before the service read', async () => {
      // The caller's person holds no self/guardianship authority over the
      // header-selected profile — the mentor's private coaching guidance
      // about the learner must never be readable via X-Profile-Id spoofing.
      jest
        .mocked(verifyPersonOwnershipV2)
        .mockRejectedValueOnce(
          new Error('caller cannot read selected profile'),
        );

      const res = await makeUnprovenApp().request('/coaching-card', {
        headers: { 'X-Profile-Id': VICTIM_PROFILE_ID },
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe(ERROR_CODES.FORBIDDEN);
      expect(jest.mocked(verifyPersonOwnershipV2)).toHaveBeenCalledWith(
        expect.anything(),
        VICTIM_PROFILE_ID,
        'test-account-id',
        ATTACKER_PERSON_ID,
      );
      expect(mockGetCoachingCardForProfile).not.toHaveBeenCalled();
    });
  });
});
