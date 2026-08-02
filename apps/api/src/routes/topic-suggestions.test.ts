// ---------------------------------------------------------------------------
// Real JWT + real auth middleware — no jwt module mock
// ---------------------------------------------------------------------------

import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';

// ---------------------------------------------------------------------------
// Mock database module — middleware creates a stub db per request
// ---------------------------------------------------------------------------

import { TEST_TOPIC_ID } from '@eduagent/test-utils';

import {
  createDatabaseModuleMock,
  createTransactionalMockDb,
} from '../test-utils/database-module';
import { personScope } from '../test-utils/identity-v2-scope-mock';

const mockDatabaseModule = createDatabaseModuleMock({
  includeActual: true,
  db: createTransactionalMockDb({
    execute: jest.fn().mockResolvedValue(undefined),
  }),
});

jest.mock(
  '@eduagent/database' /* gc1-allow: route unit test — DB middleware injected via mock; real DB covered by route integration / e2e tests */,
  () => mockDatabaseModule.module,
);

// ---------------------------------------------------------------------------
// Mock account service — resolves Clerk user → local Account
// ---------------------------------------------------------------------------

jest.mock('../services/account', () => ({
  ...jest.requireActual('../services/account'),
  findOrCreateAccount: jest.fn().mockResolvedValue({
    id: 'test-account-id',
    clerkUserId: 'user_test',
    email: 'test@example.com',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
}));

// ---------------------------------------------------------------------------
// Mock profile service — profile-scope middleware auto-resolves owner profile
// ---------------------------------------------------------------------------

jest.mock('../services/profile', () => ({
  ...jest.requireActual('../services/profile'),
  findOwnerProfile: jest.fn().mockResolvedValue({
    id: 'test-profile-id',
    accountId: 'test-account-id',
    displayName: 'Test User',
    birthYear: null,
    location: null,
    consentStatus: null,
    hasPremiumLlm: false,
  }),
  getProfile: jest.fn().mockResolvedValue({
    id: 'test-profile-id',
    accountId: 'test-account-id',
    displayName: 'Test User',
    birthYear: null,
    location: null,
    consentStatus: null,
    hasPremiumLlm: false,
  }),
}));

// [WI-867] v2 profile-scope seam continuity mock.
// findOwnerPersonScope returns owner scope (no X-Profile-Id header in this test).
const mockFindOwnerPersonScope = jest.fn().mockResolvedValue(personScope());
const mockGetPersonScope = jest.fn().mockResolvedValue(personScope());
jest.mock(
  '../services/identity-v2/profile-v2' /* gc1-allow: continuity — replaces the pre-collapse findOwnerProfile/getProfile mock; db.select() join chain unrunnable on the unit mock DB; real path covered by the identity integration suite */,
  () => ({
    ...jest.requireActual('../services/identity-v2/profile-v2'),
    findOwnerPersonScope: (...a: unknown[]) => mockFindOwnerPersonScope(...a),
    getPersonScope: (...a: unknown[]) => mockGetPersonScope(...a),
  }),
);

// ---------------------------------------------------------------------------
// Mock suggestion services — stub for route handler
// ---------------------------------------------------------------------------

jest.mock('../services/suggestions', () => ({
  ...jest.requireActual('../services/suggestions'),
  getUnusedTopicSuggestions: jest.fn().mockResolvedValue([
    {
      id: TEST_TOPIC_ID,
      bookId: 'a0000000-0000-4000-a000-000000000401',
      title: 'Suggested Topic',
      createdAt: '2024-01-01T00:00:00.000Z',
      usedAt: null,
    },
  ]),
}));

// [WI-2881] assertCanReadProfile (GET topic-suggestions) calls
// verifyPersonOwnershipV2 — a raw db.select() membership query the mock DB in
// this file cannot satisfy. The resolving default models an authorized caller
// (the full-app tests above never reach it anyway: profileScopeMiddleware
// stamps the target-bound authority proof, so the guard's fast path applies);
// the [WI-2881] denial test below overrides with mockRejectedValueOnce to
// prove the route fails closed before the suggestions read. The cross-account
// read attack against a real membership table is covered by the real-DB break
// test in tests/integration/wi2416-read-idor.integration.test.ts.
// gc1-allow: verifyPersonOwnershipV2 runs a raw db.select() membership query
// with no real implementation available in this file's mock DB environment.
jest.mock('../services/identity-v2/ownership-v2', () => ({
  ...jest.requireActual('../services/identity-v2/ownership-v2'),
  verifyPersonOwnershipV2: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Mock LLM services — registerProvider for llm middleware
// ---------------------------------------------------------------------------

jest.mock(
  '../services/llm' /* gc1-allow: LLM routeAndCall external boundary */,
  () => {
    const actual = jest.requireActual(
      '../services/llm',
    ) as typeof import('../services/llm');
    return {
      ...actual,
      routeAndCall: jest.fn(),
      registerProvider: jest.fn(),
      getRegisteredProviders: jest.fn().mockReturnValue([]),
      _clearProviders: jest.fn(),
      _resetCircuits: jest.fn(),
    };
  },
);

// ---------------------------------------------------------------------------
// Mock Sentry (used by global error handler)
// ---------------------------------------------------------------------------

jest.mock(
  '../services/sentry' /* gc1-allow: @sentry/cloudflare external boundary */,
  () => {
    const actual = jest.requireActual(
      '../services/sentry',
    ) as typeof import('../services/sentry');
    return {
      ...actual,
      captureException: jest.fn(),
    };
  },
);

// ---------------------------------------------------------------------------
// Import app AFTER all mocks are in place
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ERROR_CODES } from '@eduagent/schemas';
import { app } from '../index';
import { topicSuggestionRoutes } from './topic-suggestions';
import { getUnusedTopicSuggestions } from '../services/suggestions';
import { verifyPersonOwnershipV2 } from '../services/identity-v2/ownership-v2';
import { ForbiddenError } from '../errors';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';

const TEST_ENV = {
  ...BASE_AUTH_ENV,
  DATABASE_URL: 'postgresql://mock/test',
};

const AUTH_HEADERS = makeAuthHeaders();

describe('topic-suggestions routes', () => {
  beforeAll(() => {
    installTestJwksInterceptor();
  });

  afterAll(() => {
    restoreTestFetch();
  });

  beforeEach(() => {
    clearJWKSCache();
  });

  it('exports a Hono instance', async () => {
    const { topicSuggestionRoutes } = await import('./topic-suggestions');
    expect(typeof topicSuggestionRoutes).toBe('object');
  });

  // -------------------------------------------------------------------------
  // GET /v1/subjects/:subjectId/books/:bookId/topic-suggestions
  // -------------------------------------------------------------------------

  describe('GET /v1/subjects/:subjectId/books/:bookId/topic-suggestions', () => {
    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/subjects/a0000000-0000-4000-a000-000000000201/books/a0000000-0000-4000-a000-000000000401/topic-suggestions',
        {},
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });

    it('returns 200 with auth', async () => {
      const res = await app.request(
        '/v1/subjects/a0000000-0000-4000-a000-000000000201/books/a0000000-0000-4000-a000-000000000401/topic-suggestions',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    // [BUG-392] UUID validation guard — non-UUID path params must be rejected
    // with 400 before reaching the DB layer.
    it('returns 400 for non-UUID subjectId', async () => {
      const res = await app.request(
        '/v1/subjects/not-a-uuid/books/a0000000-0000-4000-a000-000000000401/topic-suggestions',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );
      expect(res.status).toBe(400);
    });

    it('returns 400 for non-UUID bookId', async () => {
      const res = await app.request(
        '/v1/subjects/a0000000-0000-4000-a000-000000000201/books/not-a-uuid/topic-suggestions',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );
      expect(res.status).toBe(400);
    });
  });
});

// ---------------------------------------------------------------------------
// [WI-2881] read-authority guard (G27)
// Unlike the full-app tests above (where profileScopeMiddleware stamps the
// target-bound authority proof), this harness mounts the route module
// directly and installs profileId ONLY from the request's X-Profile-Id
// header — the same client-controlled input the real middleware resolves —
// so the attack below is a credentialed non-owner request traversing
// header → middleware → route. profileAuthorityVerifiedFor is deliberately
// never set (no central proof), which keeps the case mutation-sensitive to
// the route guard's own fail-closed fallback (verifyPersonOwnershipV2).
// ---------------------------------------------------------------------------
describe('[WI-2881] read-authority guard (G27)', () => {
  const VICTIM_PROFILE_ID = 'victim-profile-id';
  const ATTACKER_PERSON_ID = 'attacker-person-id';
  const SPOOF_HEADERS = { 'X-Profile-Id': VICTIM_PROFILE_ID };
  const SUBJECT_ID = 'a0000000-0000-4000-a000-000000000201';
  const BOOK_ID = 'a0000000-0000-4000-a000-000000000401';

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
      if (err instanceof HTTPException) {
        return err.getResponse();
      }
      return c.json({ code: 'INTERNAL_ERROR', message: String(err) }, 500);
    });
    direct.route('/', topicSuggestionRoutes);
    return direct;
  }

  it('[G27] GET /subjects/:subjectId/books/:bookId/topic-suggestions rejects a cross-profile X-Profile-Id spoof with 403 before the suggestions read', async () => {
    jest.mocked(getUnusedTopicSuggestions).mockClear();
    jest
      .mocked(verifyPersonOwnershipV2)
      .mockRejectedValueOnce(new Error('caller cannot read selected profile'));

    const res = await makeUnprovenApp().request(
      `/subjects/${SUBJECT_ID}/books/${BOOK_ID}/topic-suggestions`,
      { headers: SPOOF_HEADERS },
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
    expect(getUnusedTopicSuggestions).not.toHaveBeenCalled();
  });
});
