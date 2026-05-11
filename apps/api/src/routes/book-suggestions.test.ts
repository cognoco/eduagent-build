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

import { TEST_BOOK_ID } from '@eduagent/test-utils';

import {
  createDatabaseModuleMock,
  createTransactionalMockDb,
} from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({
  db: createTransactionalMockDb({
    execute: jest.fn().mockResolvedValue(undefined),
  }),
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

// ---------------------------------------------------------------------------
// Mock account service — resolves Clerk user → local Account
// ---------------------------------------------------------------------------

jest.mock('../services/account', () => ({
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

// ---------------------------------------------------------------------------
// Mock suggestion services — stubs for route handler
// ---------------------------------------------------------------------------

jest.mock('../services/suggestions', () => {
  const stubSuggestion = {
    id: 'a0000000-0000-4000-a000-000000000001',
    subjectId: 'a0000000-0000-4000-a000-000000000201',
    title: 'Suggested Book',
    emoji: '📖',
    description: 'A suggested book',
    category: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    pickedAt: null,
  };
  return {
    getUnpickedBookSuggestionsEnvelope: jest.fn().mockResolvedValue({
      suggestions: [stubSuggestion],
      curriculumBookCount: 3,
    }),
    getUnpickedBookSuggestionsWithTopup: jest.fn().mockResolvedValue({
      suggestions: [stubSuggestion],
      curriculumBookCount: 3,
    }),
    getAllBookSuggestions: jest.fn().mockResolvedValue([stubSuggestion]),
  };
});

// ---------------------------------------------------------------------------
// Mock LLM services — registerProvider for llm middleware
// ---------------------------------------------------------------------------

jest.mock('../services/llm', () => ({
  routeAndCall: jest.fn(),
  registerProvider: jest.fn(),
  getRegisteredProviders: jest.fn().mockReturnValue([]),
  _clearProviders: jest.fn(),
  _resetCircuits: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Mock Sentry (used by global error handler)
// ---------------------------------------------------------------------------

jest.mock('../services/sentry', () => ({
  captureException: jest.fn(),
}));

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

describe('book-suggestions routes', () => {
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
    const { bookSuggestionRoutes } = await import('./book-suggestions');
    expect(typeof bookSuggestionRoutes).toBe('object');
    expect(typeof bookSuggestionRoutes.fetch).toBe('function');
  });

  // -------------------------------------------------------------------------
  // GET /v1/subjects/:subjectId/book-suggestions
  // -------------------------------------------------------------------------

  describe('GET /v1/subjects/:subjectId/book-suggestions', () => {
    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/subjects/some-subject-id/book-suggestions',
        {},
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });

    it('returns 200 with auth (envelope shape)', async () => {
      const res = await app.request(
        '/v1/subjects/some-subject-id/book-suggestions',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        suggestions: unknown[];
        curriculumBookCount: number;
      };
      expect(Array.isArray(body.suggestions)).toBe(true);
      expect(typeof body.curriculumBookCount).toBe('number');
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/subjects/:subjectId/book-suggestions/all
  // -------------------------------------------------------------------------

  describe('GET /v1/subjects/:subjectId/book-suggestions/all', () => {
    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/subjects/some-subject-id/book-suggestions/all',
        {},
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });

    it('returns 200 with auth', async () => {
      const res = await app.request(
        '/v1/subjects/some-subject-id/book-suggestions/all',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });
  });
});
