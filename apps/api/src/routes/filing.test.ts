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

import {
  TEST_BOOK_ID,
  TEST_SHELF_ID,
  TEST_TOPIC_ID,
} from '@eduagent/test-utils';

import {
  createDatabaseModuleMock,
  createTransactionalMockDb,
} from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({
  includeActual: true,
  db: createTransactionalMockDb({
    execute: jest.fn().mockResolvedValue(undefined),
  }),
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

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

// ---------------------------------------------------------------------------
// Mock filing services — stubs so route handler does not hit real DB/LLM
// ---------------------------------------------------------------------------

jest.mock('../services/filing' /* gc1-allow: pattern-a conversion */, () => ({
  ...jest.requireActual('../services/filing'),
  buildLibraryIndex: jest.fn().mockResolvedValue({ shelves: [] }),
  fileToLibrary: jest.fn().mockResolvedValue({
    extracted: 'Test topic',
    shelf: { name: 'Science' },
    book: { name: 'Physics', emoji: '⚡', description: 'Physics book' },
    chapter: { name: 'Mechanics' },
    topic: { title: 'Newton Laws', description: 'Laws of motion' },
  }),
  resolveFilingResult: jest.fn().mockResolvedValue({
    shelfId: TEST_SHELF_ID,
    shelfName: 'Science',
    bookId: TEST_BOOK_ID,
    bookName: 'Physics',
    chapter: 'Mechanics',
    topicId: TEST_TOPIC_ID,
    topicTitle: 'Newton Laws',
    isNew: { shelf: true, book: true, chapter: true },
  }),
}));

// ---------------------------------------------------------------------------
// Mock suggestion services
// ---------------------------------------------------------------------------

// prettier-ignore
jest.mock( // gc1-allow: pattern-a conversion
  '../services/suggestions' /* gc1-allow: pattern-a conversion */,
  () => ({
    ...jest.requireActual('../services/suggestions'),
    markBookSuggestionPicked: jest.fn().mockResolvedValue(undefined),
    markTopicSuggestionUsed: jest.fn().mockResolvedValue(undefined),
  }),
);

// ---------------------------------------------------------------------------
// Mock session services
// ---------------------------------------------------------------------------

jest.mock('../services/session' /* gc1-allow: pattern-a conversion */, () => ({
  ...jest.requireActual('../services/session'),
  getSessionTranscript: jest.fn().mockResolvedValue(null),
  backfillSessionTopicId: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Mock LLM services — routeAndCall + registerProvider for llm middleware
// ---------------------------------------------------------------------------

jest.mock('../services/llm' /* gc1-allow: pattern-a conversion */, () => ({
  ...jest.requireActual('../services/llm'),
  // gc1-allow: LLM routeAndCall external boundary
  routeAndCall: jest.fn().mockResolvedValue({ text: 'mocked' }),
  registerProvider: jest.fn(),
  getRegisteredProviders: jest.fn().mockReturnValue([]),
  _clearProviders: jest.fn(),
  _resetCircuits: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Mock Sentry
// ---------------------------------------------------------------------------

jest.mock('../services/sentry' /* gc1-allow: pattern-a conversion */, () => ({
  ...jest.requireActual('../services/sentry'),
  // gc1-allow: @sentry/cloudflare external boundary
  captureException: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Mock Inngest client
// ---------------------------------------------------------------------------

jest.mock('../inngest/client' /* gc1-allow: pattern-a conversion */, () => ({
  ...jest.requireActual('../inngest/client'),
  // gc1-allow: Inngest SDK external boundary
  inngest: {
    send: jest.fn().mockResolvedValue(undefined),
    createFunction: jest.fn().mockReturnValue(jest.fn()),
  },
}));

// Mock inngest/hono serve — the real serve() calls fn.getConfig() on each
// function at module load time, which fails with our simplified mock.
jest.mock('inngest/hono', () => ({
  serve: jest.fn().mockReturnValue(
    // Return a no-op Hono handler
    (_c: unknown) => new Response('ok'),
  ),
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

describe('filing routes', () => {
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
    const { filingRoutes } = await import('./filing');
    expect(typeof filingRoutes).toBe('object');
    expect(typeof filingRoutes.fetch).toBe('function');
  });

  // -------------------------------------------------------------------------
  // POST /v1/filing/request-retry
  // -------------------------------------------------------------------------

  describe('POST /v1/filing/request-retry', () => {
    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/filing/request-retry',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'sess-1',
            sessionMode: 'freeform',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });

    it('dispatches app/filing.retry event and returns queued: true', async () => {
      const { inngest } = await import('../inngest/client');

      const res = await app.request(
        '/v1/filing/request-retry',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            sessionId: 'sess-abc',
            sessionMode: 'freeform',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ queued: true });

      expect(inngest.send).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'app/filing.retry',
          data: expect.objectContaining({
            sessionId: 'sess-abc',
            sessionMode: 'freeform',
            profileId: 'test-profile-id',
          }),
        }),
      );
    });

    it('defaults sessionMode to freeform when omitted', async () => {
      const { inngest } = await import('../inngest/client');

      const res = await app.request(
        '/v1/filing/request-retry',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ sessionId: 'sess-xyz' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(inngest.send).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sessionMode: 'freeform' }),
        }),
      );
    });

    it('returns 400 when sessionId is missing', async () => {
      const res = await app.request(
        '/v1/filing/request-retry',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ sessionMode: 'freeform' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 when sessionMode is an invalid value', async () => {
      const res = await app.request(
        '/v1/filing/request-retry',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ sessionId: 'sess-1', sessionMode: 'invalid' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/filing
  // -------------------------------------------------------------------------

  describe('POST /v1/filing', () => {
    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/filing',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rawInput: 'photosynthesis' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });

    it('returns 400 for empty body', async () => {
      const res = await app.request(
        '/v1/filing',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid body (missing rawInput, sessionTranscript, and sessionId)', async () => {
      const res = await app.request(
        '/v1/filing',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            selectedSuggestion: 'some suggestion',
            sessionMode: 'freeform',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });

    it('returns 200 with valid rawInput', async () => {
      const res = await app.request(
        '/v1/filing',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ rawInput: 'photosynthesis' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('shelfId');
      expect(body).toHaveProperty('bookId');
      expect(body).toHaveProperty('topicId');
      expect(body).toHaveProperty('topicTitle');
    });

    // [CR-652] Break tests guarding against re-inversion of the filedFrom label.
    // sessionTranscript present => session_filing; absent => freeform_filing.
    it('[CR-652] tags filedFrom=freeform_filing when called with rawInput only', async () => {
      const { resolveFilingResult } = await import('../services/filing');
      (resolveFilingResult as jest.Mock).mockClear();

      const res = await app.request(
        '/v1/filing',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ rawInput: 'photosynthesis' }),
        },
        TEST_ENV,
      );
      expect(res.status).toBe(200);

      expect(resolveFilingResult).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ filedFrom: 'freeform_filing' }),
      );
    });

    it('[CR-652] tags filedFrom=session_filing when called with sessionTranscript', async () => {
      const { resolveFilingResult } = await import('../services/filing');
      (resolveFilingResult as jest.Mock).mockClear();

      const res = await app.request(
        '/v1/filing',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            sessionTranscript: 'Learner: hi\nTutor: hello',
            sessionMode: 'freeform',
          }),
        },
        TEST_ENV,
      );
      expect(res.status).toBe(200);

      expect(resolveFilingResult).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ filedFrom: 'session_filing' }),
      );
    });
  });
});
