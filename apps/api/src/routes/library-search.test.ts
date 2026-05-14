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

const mockDatabaseModule = createDatabaseModuleMock();

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

// ---------------------------------------------------------------------------
// Mock account + profile services (required by auth middleware)
// ---------------------------------------------------------------------------

jest.mock('../services/account' /* gc1-allow: pattern-a conversion */, () => {
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

jest.mock('../services/profile' /* gc1-allow: pattern-a conversion */, () => {
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

// ---------------------------------------------------------------------------
// Mock library-search service
// ---------------------------------------------------------------------------

const mockSearchLibrary = jest.fn();

jest.mock(
  '../services/library-search' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../services/library-search',
    ) as typeof import('../services/library-search');
    return {
      ...actual,
      searchLibrary: (...args: unknown[]) => mockSearchLibrary(...args),
    };
  },
);

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { app } from '../index';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';

const TEST_ENV = { ...BASE_AUTH_ENV };

const AUTH_HEADERS = makeAuthHeaders({
  'X-Profile-Id': 'a0000000-0000-4000-a000-000000000001',
});

// Valid RFC-4122 UUIDs used in mock data
const SUBJECT_ID = 'a0000000-0000-4000-a000-000000000010';
const BOOK_ID = 'a0000000-0000-4000-a000-000000000020';
const TOPIC_ID = 'a0000000-0000-4000-a000-000000000030';
const NOTE_ID = 'a0000000-0000-4000-a000-000000000040';
const SESSION_ID = 'a0000000-0000-4000-a000-000000000050';

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

  it('returns 400 when authenticated but missing X-Profile-Id header', async () => {
    const res = await app.request(
      '/v1/library/search?q=test',
      {
        headers: makeAuthHeaders(),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
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
