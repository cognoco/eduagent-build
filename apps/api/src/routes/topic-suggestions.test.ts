// ---------------------------------------------------------------------------
// Mock JWT module so auth middleware passes with a valid token
// ---------------------------------------------------------------------------

jest.mock('../middleware/jwt', () =>
  require('../test-utils/auth-fixture').createJwtModuleMock()
);

// ---------------------------------------------------------------------------
// Mock database module — middleware creates a stub db per request
// ---------------------------------------------------------------------------

import { TEST_TOPIC_ID } from '@eduagent/test-utils';

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
      id: TEST_TOPIC_ID,
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
import { AUTH_HEADERS, BASE_AUTH_ENV } from '../test-utils/test-env';

const TEST_ENV = {
  ...BASE_AUTH_ENV,
  DATABASE_URL: 'postgresql://mock/test',
};

describe('topic-suggestions routes', () => {
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
