// ---------------------------------------------------------------------------
// bookmarks.test.ts — negative-path coverage for routes/bookmarks.ts
// Phase 3 of test-coverage-hardening-plan.md
//
// Pattern: real JWT + real auth middleware, service layer mocked via
// gc1-allow pattern-a (requireActual + targeted overrides), database module
// mock so no DB connection required.
// ---------------------------------------------------------------------------

import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';

// ---------------------------------------------------------------------------
// Database mock
// ---------------------------------------------------------------------------

import { createDatabaseModuleMock } from '../test-utils/database-module';
import { personScope } from '../test-utils/identity-v2-scope-mock';

const mockDatabaseModule = createDatabaseModuleMock({ includeActual: true });

jest.mock(
  '@eduagent/database' /* gc1-allow: route unit test — DB middleware injected via mock; real DB covered by route integration / e2e tests */,
  () => mockDatabaseModule.module,
);

// ---------------------------------------------------------------------------
// Account + profile service mocks
// ---------------------------------------------------------------------------

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

jest.mock('../services/profile', () => {
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

// [WI-867] Post-collapse, profile-scope middleware resolves the caller via the
// v2 `findOwnerPersonScope` (auto-resolve) / `getPersonScope` (X-Profile-Id)
// seam. Continuity mock — mirrors the legacy findOwnerProfile (null) /
// getProfile (owner) defaults above.
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

// ---------------------------------------------------------------------------
// Bookmarks service mock
// ---------------------------------------------------------------------------

const mockCreateBookmark = jest.fn();
const mockDeleteBookmark = jest.fn();
const mockListBookmarks = jest.fn();
const mockListSessionBookmarks = jest.fn();

jest.mock('../services/bookmarks', () => {
  const actual = jest.requireActual(
    '../services/bookmarks',
  ) as typeof import('../services/bookmarks');
  return {
    ...actual,
    createBookmark: (...args: unknown[]) => mockCreateBookmark(...args),
    deleteBookmark: (...args: unknown[]) => mockDeleteBookmark(...args),
    listBookmarks: (...args: unknown[]) => mockListBookmarks(...args),
    listSessionBookmarks: (...args: unknown[]) =>
      mockListSessionBookmarks(...args),
  };
});

// ---------------------------------------------------------------------------
// Inngest framework boundary mock (required by index.ts import chain)
// ---------------------------------------------------------------------------

jest.mock('inngest/hono', () => ({
  // gc1-allow: Inngest framework boundary
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

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { app } from '../index';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';

const TEST_ENV = {
  ...BASE_AUTH_ENV,
  // [WI-867] DATABASE_URL required so databaseMiddleware calls createDatabase
  // (mock) and sets db on the context — resolveIdentityV2 reads db.query.login.
  DATABASE_URL: 'postgresql://test:test@localhost/test',
};
const AUTH_HEADERS = makeAuthHeaders({ 'X-Profile-Id': 'test-profile-id' });

const BOOKMARK_ID = '550e8400-e29b-41d4-a716-446655440000';
const EVENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const SESSION_ID = '550e8400-e29b-41d4-a716-446655440002';
const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440003';
const TOPIC_ID = '550e8400-e29b-41d4-a716-446655440004';

const MOCK_BOOKMARK = {
  id: BOOKMARK_ID,
  eventId: EVENT_ID,
  sessionId: SESSION_ID,
  subjectId: SUBJECT_ID,
  topicId: TOPIC_ID,
  subjectName: 'History',
  topicTitle: 'World War I',
  content: 'This is important',
  createdAt: '2026-05-01T10:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('bookmark routes', () => {
  beforeAll(() => {
    installTestJwksInterceptor();
  });

  afterAll(() => {
    restoreTestFetch();
  });

  beforeEach(() => {
    clearJWKSCache();
    jest.clearAllMocks();
    // [WI-867] Restore v2 seam defaults after clearAllMocks.
    mockFindOwnerPersonScope.mockResolvedValue(null);
    mockGetPersonScope.mockResolvedValue(personScope());
  });

  // ---- POST /v1/bookmarks --------------------------------------------------

  describe('POST /v1/bookmarks', () => {
    it('returns 201 with bookmark on success', async () => {
      mockCreateBookmark.mockResolvedValueOnce(MOCK_BOOKMARK);

      const res = await app.request(
        '/v1/bookmarks',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ eventId: EVENT_ID }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.bookmark.id).toBe(BOOKMARK_ID);
      expect(mockCreateBookmark).toHaveBeenCalledTimes(1);
      const [, profileIdArg, eventIdArg] = mockCreateBookmark.mock.calls[0];
      expect(profileIdArg).toBe('test-profile-id');
      expect(eventIdArg).toBe(EVENT_ID);
    });

    it('returns 400 for missing eventId', async () => {
      const res = await app.request(
        '/v1/bookmarks',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockCreateBookmark).not.toHaveBeenCalled();
    });

    it('returns 400 for non-UUID eventId', async () => {
      const res = await app.request(
        '/v1/bookmarks',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ eventId: 'not-a-uuid' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockCreateBookmark).not.toHaveBeenCalled();
    });

    it('returns 403 when in proxy mode (isOwner=false)', async () => {
      // Simulate parent acting on child profile: v2 getPersonScope returns isOwner=false
      mockGetPersonScope.mockResolvedValueOnce(
        personScope({
          profileId: 'child-profile-id',
          birthYear: 2012,
          isOwner: false,
        }),
      );

      const res = await app.request(
        '/v1/bookmarks',
        {
          method: 'POST',
          headers: makeAuthHeaders({ 'X-Profile-Id': 'child-profile-id' }),
          body: JSON.stringify({ eventId: EVENT_ID }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('PROXY_MODE');
      expect(mockCreateBookmark).not.toHaveBeenCalled();
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/bookmarks',
        {
          method: 'POST',
          body: JSON.stringify({ eventId: EVENT_ID }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });
  });

  // ---- GET /v1/bookmarks ---------------------------------------------------

  describe('GET /v1/bookmarks', () => {
    it('returns 200 with bookmark list', async () => {
      mockListBookmarks.mockResolvedValueOnce({
        bookmarks: [MOCK_BOOKMARK],
        nextCursor: null,
      });

      const res = await app.request(
        '/v1/bookmarks',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.bookmarks).toHaveLength(1);
    });

    it('returns 200 with empty array (not 404)', async () => {
      mockListBookmarks.mockResolvedValueOnce({
        bookmarks: [],
        nextCursor: null,
      });

      const res = await app.request(
        '/v1/bookmarks',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.bookmarks).toEqual([]);
      expect(body.nextCursor).toBeNull();
    });

    it('returns 400 for invalid limit (zero)', async () => {
      const res = await app.request(
        '/v1/bookmarks?limit=0',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );
      expect(res.status).toBe(400);
      expect(mockListBookmarks).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid limit (negative)', async () => {
      const res = await app.request(
        '/v1/bookmarks?limit=-1',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );
      expect(res.status).toBe(400);
      expect(mockListBookmarks).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid limit (over max)', async () => {
      const res = await app.request(
        '/v1/bookmarks?limit=100',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );
      expect(res.status).toBe(400);
      expect(mockListBookmarks).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid cursor (not a UUID)', async () => {
      const res = await app.request(
        '/v1/bookmarks?cursor=not-a-uuid',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );
      expect(res.status).toBe(400);
      expect(mockListBookmarks).not.toHaveBeenCalled();
    });

    it('passes cursor on subsequent pages', async () => {
      mockListBookmarks.mockResolvedValueOnce({
        bookmarks: [],
        nextCursor: null,
      });
      const cursor = '550e8400-e29b-41d4-a716-446655440099';

      const res = await app.request(
        `/v1/bookmarks?cursor=${cursor}&limit=10`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockListBookmarks).toHaveBeenCalledTimes(1);
      const [, profileIdArg, optionsArg] = mockListBookmarks.mock.calls[0];
      expect(profileIdArg).toBe('test-profile-id');
      expect(optionsArg).toMatchObject({ cursor, limit: 10 });
    });

    it('filters by subjectId when provided', async () => {
      mockListBookmarks.mockResolvedValueOnce({
        bookmarks: [],
        nextCursor: null,
      });

      const res = await app.request(
        `/v1/bookmarks?subjectId=${SUBJECT_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockListBookmarks).toHaveBeenCalledTimes(1);
      const [, profileIdArg, optionsArg] = mockListBookmarks.mock.calls[0];
      expect(profileIdArg).toBe('test-profile-id');
      expect(optionsArg).toMatchObject({ subjectId: SUBJECT_ID });
    });

    it('returns 400 for invalid subjectId (not a UUID)', async () => {
      const res = await app.request(
        '/v1/bookmarks?subjectId=not-a-uuid',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );
      expect(res.status).toBe(400);
    });

    it('scopes query to active profile (passes profileId to service)', async () => {
      mockListBookmarks.mockResolvedValueOnce({
        bookmarks: [],
        nextCursor: null,
      });

      await app.request('/v1/bookmarks', { headers: AUTH_HEADERS }, TEST_ENV);

      expect(mockListBookmarks).toHaveBeenCalledTimes(1);
      const [, profileIdArg] = mockListBookmarks.mock.calls[0];
      expect(profileIdArg).toBe('test-profile-id');
    });

    it('returns 401 without auth', async () => {
      const res = await app.request('/v1/bookmarks', {}, TEST_ENV);
      expect(res.status).toBe(401);
    });

    it('returns 400 when profile cannot be resolved (no X-Profile-Id and no owner)', async () => {
      const res = await app.request(
        '/v1/bookmarks',
        { headers: makeAuthHeaders() },
        TEST_ENV,
      );
      expect(res.status).toBe(400);
      expect(mockListBookmarks).not.toHaveBeenCalled();
    });
  });

  // ---- GET /v1/bookmarks/session -------------------------------------------

  describe('GET /v1/bookmarks/session', () => {
    it('returns 200 with session bookmarks', async () => {
      mockListSessionBookmarks.mockResolvedValueOnce([
        { eventId: EVENT_ID, bookmarkId: BOOKMARK_ID },
      ]);

      const res = await app.request(
        `/v1/bookmarks/session?sessionId=${SESSION_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.bookmarks).toHaveLength(1);
    });

    it('returns 200 with empty array when no bookmarks in session', async () => {
      mockListSessionBookmarks.mockResolvedValueOnce([]);

      const res = await app.request(
        `/v1/bookmarks/session?sessionId=${SESSION_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.bookmarks).toEqual([]);
    });

    it('returns 400 when sessionId is missing', async () => {
      const res = await app.request(
        '/v1/bookmarks/session',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );
      expect(res.status).toBe(400);
      expect(mockListSessionBookmarks).not.toHaveBeenCalled();
    });

    it('returns 400 when sessionId is not a UUID', async () => {
      const res = await app.request(
        '/v1/bookmarks/session?sessionId=not-a-uuid',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );
      expect(res.status).toBe(400);
      expect(mockListSessionBookmarks).not.toHaveBeenCalled();
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        `/v1/bookmarks/session?sessionId=${SESSION_ID}`,
        {},
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });

  // ---- DELETE /v1/bookmarks/:id --------------------------------------------

  describe('DELETE /v1/bookmarks/:id', () => {
    it('returns 204 on successful delete', async () => {
      mockDeleteBookmark.mockResolvedValueOnce(undefined);

      const res = await app.request(
        `/v1/bookmarks/${BOOKMARK_ID}`,
        {
          method: 'DELETE',
          headers: AUTH_HEADERS,
        },
        TEST_ENV,
      );

      expect(res.status).toBe(204);
      expect(mockDeleteBookmark).toHaveBeenCalledTimes(1);
      const [, profileIdArg, bookmarkIdArg] = mockDeleteBookmark.mock.calls[0];
      expect(profileIdArg).toBe('test-profile-id');
      expect(bookmarkIdArg).toBe(BOOKMARK_ID);
    });

    it('returns 400 for non-UUID bookmark id', async () => {
      const res = await app.request(
        '/v1/bookmarks/not-a-uuid',
        {
          method: 'DELETE',
          headers: AUTH_HEADERS,
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockDeleteBookmark).not.toHaveBeenCalled();
    });

    it('returns 403 when in proxy mode (isOwner=false)', async () => {
      // Simulate parent acting on child profile: v2 getPersonScope returns isOwner=false
      mockGetPersonScope.mockResolvedValueOnce(
        personScope({
          profileId: 'child-profile-id',
          birthYear: 2012,
          isOwner: false,
        }),
      );

      const res = await app.request(
        `/v1/bookmarks/${BOOKMARK_ID}`,
        {
          method: 'DELETE',
          headers: makeAuthHeaders({ 'X-Profile-Id': 'child-profile-id' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('PROXY_MODE');
      expect(mockDeleteBookmark).not.toHaveBeenCalled();
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        `/v1/bookmarks/${BOOKMARK_ID}`,
        { method: 'DELETE', headers: { 'Content-Type': 'application/json' } },
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });
});
