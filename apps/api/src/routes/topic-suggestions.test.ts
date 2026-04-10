// ---------------------------------------------------------------------------
// Mock JWT module so auth middleware passes with a valid token
// ---------------------------------------------------------------------------

jest.mock('../middleware/jwt', () => ({
  decodeJWTHeader: jest.fn().mockReturnValue({ alg: 'RS256', kid: 'test-kid' }),
  fetchJWKS: jest.fn().mockResolvedValue({
    keys: [{ kty: 'RSA', kid: 'test-kid', n: 'fake-n', e: 'AQAB' }],
  }),
  verifyJWT: jest.fn().mockResolvedValue({
    sub: 'user_test',
    email: 'test@example.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
  }),
}));

// ---------------------------------------------------------------------------
// Mock database module — middleware creates a stub db per request
// ---------------------------------------------------------------------------

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
// Mock suggestion services — stub for route handler
// ---------------------------------------------------------------------------

jest.mock('../services/suggestions', () => ({
  getUnusedTopicSuggestions: jest.fn().mockResolvedValue([
    {
      id: '00000000-0000-0000-0000-000000000001',
      title: 'Suggested Topic',
      description: 'A suggested topic for study',
    },
  ]),
}));

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

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
  DATABASE_URL: 'postgresql://mock/test',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
};

describe('topic-suggestions routes', () => {
  it('exports a Hono instance', async () => {
    const { topicSuggestionRoutes } = await import('./topic-suggestions');
    expect(topicSuggestionRoutes).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // GET /v1/subjects/:subjectId/books/:bookId/topic-suggestions
  // -------------------------------------------------------------------------

  describe('GET /v1/subjects/:subjectId/books/:bookId/topic-suggestions', () => {
    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/subjects/some-subject-id/books/some-book-id/topic-suggestions',
        {},
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });

    it('returns 200 with auth', async () => {
      const res = await app.request(
        '/v1/subjects/some-subject-id/books/some-book-id/topic-suggestions',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });
  });
});
