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
// Mock suggestion services — stubs for route handler
// ---------------------------------------------------------------------------

jest.mock('../services/suggestions', () => ({
  getUnpickedBookSuggestions: jest.fn().mockResolvedValue([
    {
      id: '00000000-0000-0000-0000-000000000001',
      title: 'Suggested Book',
      emoji: '📖',
      description: 'A suggested book',
    },
  ]),
  getAllBookSuggestions: jest.fn().mockResolvedValue([
    {
      id: '00000000-0000-0000-0000-000000000001',
      title: 'Suggested Book',
      emoji: '📖',
      description: 'A suggested book',
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
import { AUTH_HEADERS, BASE_AUTH_ENV } from '../test-utils/test-env';

const TEST_ENV = {
  ...BASE_AUTH_ENV,
  DATABASE_URL: 'postgresql://mock/test',
};

describe('book-suggestions routes', () => {
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
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });

    it('returns 200 with auth', async () => {
      const res = await app.request(
        '/v1/subjects/some-subject-id/book-suggestions',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
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
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });

    it('returns 200 with auth', async () => {
      const res = await app.request(
        '/v1/subjects/some-subject-id/book-suggestions/all',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });
  });
});
