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

jest.mock('../services/account' /* gc1-allow: pattern-a conversion */, () => ({
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

jest.mock('../services/profile' /* gc1-allow: pattern-a conversion */, () => ({
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

jest.mock(
  '../services/suggestions' /* gc1-allow: pattern-a conversion */,
  () => ({
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
  }),
);

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

import { app } from '../index';
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
