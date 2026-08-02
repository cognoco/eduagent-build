// ---------------------------------------------------------------------------
// Real JWT + real auth middleware — no jwt module mock
// ---------------------------------------------------------------------------

import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';

// ---------------------------------------------------------------------------
// Mock database module
// ---------------------------------------------------------------------------

import { createDatabaseModuleMock } from '../test-utils/database-module';
import { personScope } from '../test-utils/identity-v2-scope-mock';

const mockDatabaseModule = createDatabaseModuleMock({ includeActual: true });

jest.mock(
  '@eduagent/database' /* gc1-allow: route unit test — DB middleware injected via mock; real DB covered by route integration / e2e tests */,
  () => mockDatabaseModule.module,
);

// ---------------------------------------------------------------------------
// Mock account + profile services (required by auth middleware)
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
      birthYear: 2011,
      location: null,
      consentStatus: 'CONSENTED',
    }),
    getProfileAge: jest.fn().mockResolvedValue(14),
  };
});

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

// ---------------------------------------------------------------------------
// Mock library-search service
// ---------------------------------------------------------------------------

const mockSearchLibrary = jest.fn();

jest.mock('../services/library-search', () => {
  const actual = jest.requireActual(
    '../services/library-search',
  ) as typeof import('../services/library-search');
  return {
    ...actual,
    searchLibrary: (...args: unknown[]) => mockSearchLibrary(...args),
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

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

import { Hono } from 'hono';
import { ERROR_CODES } from '@eduagent/schemas';
import { app } from '../index';
import { librarySearchRoutes } from './library-search';
import { verifyPersonOwnershipV2 } from '../services/identity-v2/ownership-v2';
import { ForbiddenError } from '../errors';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';
import { TEST_SESSION_ID } from '@eduagent/test-utils';

const TEST_ENV = {
  ...BASE_AUTH_ENV,
  // [WI-867] DATABASE_URL required so databaseMiddleware sets db on the context.
  DATABASE_URL: 'postgresql://test:test@localhost/test',
};

const AUTH_HEADERS = makeAuthHeaders({
  'X-Profile-Id': 'a0000000-0000-4000-a000-000000000001',
});

// Valid RFC-4122 UUIDs used in mock data
const SUBJECT_ID = 'a0000000-0000-4000-a000-000000000010';
const BOOK_ID = 'a0000000-0000-4000-a000-000000000020';
const TOPIC_ID = 'a0000000-0000-4000-a000-000000000030';
const NOTE_ID = 'a0000000-0000-4000-a000-000000000040';
const SESSION_ID = TEST_SESSION_ID;

const MOCK_RESULT = {
  subjects: [{ id: SUBJECT_ID, name: 'Mathematics' }],
  books: [
    {
      id: BOOK_ID,
      subjectId: SUBJECT_ID,
      subjectName: 'Mathematics',
      title: 'Algebra Basics',
    },
  ],
  topics: [
    {
      id: TOPIC_ID,
      bookId: BOOK_ID,
      bookTitle: 'Algebra Basics',
      subjectId: SUBJECT_ID,
      subjectName: 'Mathematics',
      name: 'Linear Equations',
    },
  ],
  notes: [
    {
      id: NOTE_ID,
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
      topicName: 'Linear Equations',
      bookId: BOOK_ID,
      subjectId: SUBJECT_ID,
      subjectName: 'Mathematics',
      contentSnippet: 'A linear equation has the form ax + b = 0',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  sessions: [
    {
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
      topicTitle: 'Linear Equations',
      bookId: BOOK_ID,
      subjectId: SUBJECT_ID,
      subjectName: 'Mathematics',
      snippet: 'We practiced algebra basics.',
      occurredAt: '2026-01-01T00:00:00.000Z',
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /v1/library/search', () => {
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

  it('returns search results matching librarySearchResultSchema', async () => {
    mockSearchLibrary.mockResolvedValueOnce(MOCK_RESULT);

    const res = await app.request(
      '/v1/library/search?q=algebra',
      { headers: AUTH_HEADERS },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subjects).toHaveLength(1);
    expect(body.subjects[0].id).toBe(SUBJECT_ID);
    expect(body.subjects[0].name).toBe('Mathematics');
    expect(body.books).toHaveLength(1);
    expect(body.books[0].id).toBe(BOOK_ID);
    expect(body.books[0].subjectId).toBe(SUBJECT_ID);
    expect(body.books[0].title).toBe('Algebra Basics');
    expect(body.topics).toHaveLength(1);
    expect(body.topics[0].id).toBe(TOPIC_ID);
    expect(body.topics[0].name).toBe('Linear Equations');
    expect(body.notes).toHaveLength(1);
    expect(body.notes[0].id).toBe(NOTE_ID);
    expect(body.notes[0].contentSnippet).toBe(
      'A linear equation has the form ax + b = 0',
    );
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].sessionId).toBe(SESSION_ID);
    // profileId comes from getProfile().id (mocked to 'test-profile-id'),
    // not the raw X-Profile-Id header value.
    // The db arg is verified by call position — not asserted on shape since
    // databaseMiddleware skips when DATABASE_URL is absent in the test env.
    expect(mockSearchLibrary).toHaveBeenCalledTimes(1);
    const [, calledProfileId, calledQuery] = mockSearchLibrary.mock.calls[0]!;
    expect(calledProfileId).toBe('test-profile-id');
    expect(calledQuery).toBe('algebra');
  });

  it('returns empty arrays when no results match', async () => {
    mockSearchLibrary.mockResolvedValueOnce({
      subjects: [],
      books: [],
      topics: [],
      notes: [],
      sessions: [],
    });

    const res = await app.request(
      '/v1/library/search?q=zzz',
      { headers: AUTH_HEADERS },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subjects).toEqual([]);
    expect(body.books).toEqual([]);
    expect(body.topics).toEqual([]);
    expect(body.notes).toEqual([]);
    expect(body.sessions).toEqual([]);
  });

  it('returns 400 when q query param is missing', async () => {
    const res = await app.request(
      '/v1/library/search',
      { headers: AUTH_HEADERS },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    expect(mockSearchLibrary).not.toHaveBeenCalled();
  });

  it('returns 400 when q is empty string', async () => {
    const res = await app.request(
      '/v1/library/search?q=',
      { headers: AUTH_HEADERS },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    expect(mockSearchLibrary).not.toHaveBeenCalled();
  });

  it('[WI-2128] returns 403 when the authenticated caller Person cannot be resolved', async () => {
    mockGetPersonScope.mockResolvedValueOnce(null);
    const res = await app.request(
      '/v1/library/search?q=test',
      {
        headers: makeAuthHeaders(),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
    expect(mockSearchLibrary).not.toHaveBeenCalled();
  });

  it('returns 401 when no auth token is provided', async () => {
    const res = await app.request(
      '/v1/library/search?q=test',
      { headers: { 'Content-Type': 'application/json' } },
      TEST_ENV,
    );

    expect(res.status).toBe(401);
    expect(mockSearchLibrary).not.toHaveBeenCalled();
  });
});

// ---- [WI-2877] read-authority guard (G19) ----
// The harness middleware installs profileId ONLY from the request's
// X-Profile-Id header — the same client-controlled input the real
// profileScopeMiddleware resolves — so the attack below is a credentialed
// non-owner request traversing header → middleware → route.
// profileAuthorityVerifiedFor is deliberately never set (no central proof),
// which keeps the case mutation-sensitive to the route guard's own
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
    direct.route('/', librarySearchRoutes);
    return direct;
  }

  it('GET /library/search rejects a cross-profile X-Profile-Id spoof with 403 before the service read', async () => {
    // The caller's person holds no self/guardianship authority over the
    // header-selected profile — search results span the profile's whole
    // library.
    jest
      .mocked(verifyPersonOwnershipV2)
      .mockRejectedValueOnce(new Error('caller cannot read selected profile'));

    const res = await makeUnprovenApp().request('/library/search?q=fractions', {
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
    expect(mockSearchLibrary).not.toHaveBeenCalled();
  });
});
