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

const mockDatabaseModule = createDatabaseModuleMock({ includeActual: true });

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

// ---------------------------------------------------------------------------
// Mock account + profile services
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
      birthYear: 2014,
      location: null,
      consentStatus: 'CONSENTED',
    }),
    getProfileAge: jest.fn().mockResolvedValue(12),
  };
});

// ---------------------------------------------------------------------------
// Mock curriculum + book-generation services
// ---------------------------------------------------------------------------

const mockBook = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  subjectId: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Ancient Egypt',
  description: 'Explore pyramids and pharaohs',
  emoji: '🏛️',
  sortOrder: 1,
  topicsGenerated: false,
  createdAt: '2026-04-04T00:00:00.000Z',
  updatedAt: '2026-04-04T00:00:00.000Z',
};

const mockBookWithTopics = {
  book: { ...mockBook, topicsGenerated: true },
  topics: [
    {
      id: '550e8400-e29b-41d4-a716-446655440010',
      curriculumId: 'curr-1',
      title: 'Timeline of Egypt',
      description: 'How it all began',
      chapter: 'The Story',
      sortOrder: 1,
      relevance: 'core',
      estimatedMinutes: 30,
      bookId: mockBook.id,
      skipped: false,
      source: 'generated',
    },
  ],
  connections: [],
  status: 'NOT_STARTED' as const,
};

jest.mock(
  '../services/curriculum' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../services/curriculum',
    ) as typeof import('../services/curriculum');
    return {
      ...actual,
      getBooks: jest.fn().mockResolvedValue([]),
      getAllProfileBooks: jest.fn().mockResolvedValue({ subjects: [] }),
      getBookWithTopics: jest.fn().mockResolvedValue(null),
      persistBookTopics: jest.fn().mockResolvedValue(mockBookWithTopics),
      claimBookForGeneration: jest.fn().mockResolvedValue(null),
      moveTopicToBook: jest.fn().mockResolvedValue({ ok: true }),
    };
  },
);

jest.mock(
  '../services/book-generation' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../services/book-generation',
    ) as typeof import('../services/book-generation');
    return {
      ...actual,
      generateBookTopics: jest.fn().mockResolvedValue({
        topics: [
          {
            title: 'Timeline of Egypt',
            description: 'How it all began',
            chapter: 'The Story',
            sortOrder: 1,
            estimatedMinutes: 30,
          },
        ],
        connections: [],
      }),
    };
  },
);

jest.mock('inngest/hono', () => ({
  serve: jest.fn().mockReturnValue(jest.fn()),
}));

jest.mock('../inngest/client' /* gc1-allow: pattern-a conversion */, () => {
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
import {
  getBooks,
  getAllProfileBooks,
  getBookWithTopics,
  persistBookTopics,
  claimBookForGeneration,
} from '../services/curriculum';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';

const mockGetBooks = getBooks as jest.MockedFunction<typeof getBooks>;
const mockGetAllProfileBooks = getAllProfileBooks as jest.MockedFunction<
  typeof getAllProfileBooks
>;
const mockGetBookWithTopics = getBookWithTopics as jest.MockedFunction<
  typeof getBookWithTopics
>;
const mockPersistBookTopics = persistBookTopics as jest.MockedFunction<
  typeof persistBookTopics
>;
const mockClaimBookForGeneration =
  claimBookForGeneration as jest.MockedFunction<typeof claimBookForGeneration>;

const TEST_ENV = { ...BASE_AUTH_ENV };

const AUTH_HEADERS = makeAuthHeaders({ 'X-Profile-Id': 'test-profile-id' });

const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const BOOK_ID = '550e8400-e29b-41d4-a716-446655440001';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('book routes', () => {
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

  // ---- [BUG-733 / PERF-3] GET /v1/library/books ----

  describe('GET /v1/library/books', () => {
    it('returns aggregated books across all subjects', async () => {
      mockGetAllProfileBooks.mockResolvedValueOnce({
        subjects: [
          {
            subjectId: SUBJECT_ID,
            subjectName: 'History',
            books: [mockBook as never],
          },
        ],
      });

      const res = await app.request(
        '/v1/library/books',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.subjects).toHaveLength(1);
      expect(body.subjects[0].subjectId).toBe(SUBJECT_ID);
      expect(body.subjects[0].books).toHaveLength(1);
      expect(mockGetAllProfileBooks).toHaveBeenCalledTimes(1);
      // Second arg must be the profile ID — proves the route passes scope.
      expect((mockGetAllProfileBooks as jest.Mock).mock.calls[0]?.[1]).toBe(
        'test-profile-id',
      );
    });

    it('returns 400 when authenticated but missing X-Profile-Id header', async () => {
      const res = await app.request(
        '/v1/library/books',
        {
          headers: makeAuthHeaders(),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockGetAllProfileBooks).not.toHaveBeenCalled();
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/library/books', {}, TEST_ENV);
      expect(res.status).toBe(401);
      expect(mockGetAllProfileBooks).not.toHaveBeenCalled();
    });
  });

  // ---- GET /v1/subjects/:subjectId/books ----

  describe('GET /v1/subjects/:subjectId/books', () => {
    it('returns 200 with empty books array', async () => {
      mockGetBooks.mockResolvedValueOnce([]);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('books');
      expect(body.books).toEqual([]);
    });

    it('returns 200 with books list', async () => {
      mockGetBooks.mockResolvedValueOnce([mockBook as never]);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.books).toHaveLength(1);
      expect(body.books[0].title).toBe('Ancient Egypt');
      expect(body.books[0].emoji).toBe('🏛️');
    });

    it('returns 400 for invalid subjectId', async () => {
      const res = await app.request(
        '/v1/subjects/not-a-uuid/books',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books`,
        { headers: { 'Content-Type': 'application/json' } },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });
  });

  // ---- GET /v1/subjects/:subjectId/books/:bookId ----

  describe('GET /v1/subjects/:subjectId/books/:bookId', () => {
    it('returns 200 with book and topics', async () => {
      mockGetBookWithTopics.mockResolvedValueOnce(mockBookWithTopics as never);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books/${BOOK_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.book.title).toBe('Ancient Egypt');
      expect(body.topics).toHaveLength(1);
      expect(body.topics[0].chapter).toBe('The Story');
      expect(body.status).toBe('NOT_STARTED');
    });

    it('returns 404 when book not found', async () => {
      mockGetBookWithTopics.mockResolvedValueOnce(null);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books/${BOOK_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid bookId', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books/not-a-uuid`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });
  });

  // ---- POST /v1/subjects/:subjectId/books/:bookId/generate-topics ----

  describe('POST /v1/subjects/:subjectId/books/:bookId/generate-topics', () => {
    it('generates topics for an unbuilt book', async () => {
      mockClaimBookForGeneration.mockResolvedValueOnce({
        id: BOOK_ID,
        title: 'Ancient Egypt',
        description: 'Explore pyramids and pharaohs',
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books/${BOOK_ID}/generate-topics`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.book).toEqual(expect.objectContaining({}));
      expect(Array.isArray(body.topics)).toBe(true);
    });

    it('returns existing topics for already-generated book', async () => {
      // CAS returns null — another request already claimed it
      mockClaimBookForGeneration.mockResolvedValueOnce(null);
      mockGetBookWithTopics.mockResolvedValueOnce(mockBookWithTopics as never);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books/${BOOK_ID}/generate-topics`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.book.topicsGenerated).toBe(true);
    });

    it('expands an already-generated thin book when requested', async () => {
      mockClaimBookForGeneration.mockResolvedValueOnce(null);
      mockGetBookWithTopics.mockResolvedValueOnce(mockBookWithTopics as never);

      const { generateBookTopics } = jest.requireMock(
        '../services/book-generation',
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books/${BOOK_ID}/generate-topics`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ expandExisting: true }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(generateBookTopics).toHaveBeenCalledWith(
        'Ancient Egypt',
        'Explore pyramids and pharaohs',
        12,
        expect.stringContaining('Existing starter topics in this book'),
      );
      const expansionTopics = mockPersistBookTopics.mock.calls[0]?.[4] ?? [];
      expect(expansionTopics).toHaveLength(6);
      expect(expansionTopics.map((topic) => topic.title)).not.toContain(
        'Timeline of Egypt',
      );
      expect(expansionTopics.map((topic) => topic.title)).toContain(
        'Start with Ancient Egypt',
      );
      expect(mockPersistBookTopics).toHaveBeenCalledWith(
        undefined,
        'test-profile-id',
        SUBJECT_ID,
        BOOK_ID,
        expect.any(Array),
        expect.any(Array),
        { appendToExisting: true },
      );
    });

    it('passes prior knowledge to generation', async () => {
      mockClaimBookForGeneration.mockResolvedValueOnce({
        id: BOOK_ID,
        title: 'Ancient Egypt',
        description: 'Explore pyramids and pharaohs',
      });

      const { generateBookTopics } = jest.requireMock(
        '../services/book-generation',
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books/${BOOK_ID}/generate-topics`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            priorKnowledge: 'I already know about pyramids',
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(generateBookTopics).toHaveBeenCalledWith(
        'Ancient Egypt',
        'Explore pyramids and pharaohs',
        12,
        'I already know about pyramids',
      );
    });

    it('returns 404 when book not found in subject', async () => {
      // CAS returns null (no matching row), getBookWithTopics also returns null
      mockClaimBookForGeneration.mockResolvedValueOnce(null);
      mockGetBookWithTopics.mockResolvedValueOnce(null);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books/${BOOK_ID}/generate-topics`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
    });
  });
});
