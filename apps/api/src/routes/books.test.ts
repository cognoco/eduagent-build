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
// Mock database module
// ---------------------------------------------------------------------------

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock();

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

// ---------------------------------------------------------------------------
// Mock account + profile services
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

jest.mock('../services/profile', () => ({
  findOwnerProfile: jest.fn().mockResolvedValue(null),
  getProfile: jest.fn().mockResolvedValue({
    id: 'test-profile-id',
    birthYear: 2014,
    location: null,
    consentStatus: 'CONSENTED',
  }),
  getProfileAge: jest.fn().mockResolvedValue(12),
}));

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

jest.mock('../services/curriculum', () => ({
  getBooks: jest.fn().mockResolvedValue([]),
  getBookWithTopics: jest.fn().mockResolvedValue(null),
  persistBookTopics: jest.fn().mockResolvedValue(mockBookWithTopics),
  claimBookForGeneration: jest.fn().mockResolvedValue(null),
}));

jest.mock('../services/book-generation', () => ({
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
}));

jest.mock('inngest/hono', () => ({
  serve: jest.fn().mockReturnValue(jest.fn()),
}));

jest.mock('../inngest/client', () => ({
  inngest: {
    send: jest.fn().mockResolvedValue(undefined),
    createFunction: jest.fn().mockReturnValue(jest.fn()),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { app } from '../index';
import {
  getBooks,
  getBookWithTopics,
  claimBookForGeneration,
} from '../services/curriculum';

const mockGetBooks = getBooks as jest.MockedFunction<typeof getBooks>;
const mockGetBookWithTopics = getBookWithTopics as jest.MockedFunction<
  typeof getBookWithTopics
>;
const mockClaimBookForGeneration =
  claimBookForGeneration as jest.MockedFunction<typeof claimBookForGeneration>;

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
  CLERK_AUDIENCE: 'test-audience',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
  'X-Profile-Id': 'test-profile-id',
};

const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const BOOK_ID = '550e8400-e29b-41d4-a716-446655440001';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('book routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---- GET /v1/subjects/:subjectId/books ----

  describe('GET /v1/subjects/:subjectId/books', () => {
    it('returns 200 with empty books array', async () => {
      mockGetBooks.mockResolvedValueOnce([]);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books`,
        { headers: AUTH_HEADERS },
        TEST_ENV
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
        TEST_ENV
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
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books`,
        { headers: { 'Content-Type': 'application/json' } },
        TEST_ENV
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
        TEST_ENV
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
        TEST_ENV
      );

      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid bookId', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books/not-a-uuid`,
        { headers: AUTH_HEADERS },
        TEST_ENV
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
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.book).toBeDefined();
      expect(body.topics).toBeDefined();
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
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.book.topicsGenerated).toBe(true);
    });

    it('passes prior knowledge to generation', async () => {
      mockClaimBookForGeneration.mockResolvedValueOnce({
        id: BOOK_ID,
        title: 'Ancient Egypt',
        description: 'Explore pyramids and pharaohs',
      });

      const { generateBookTopics } = jest.requireMock(
        '../services/book-generation'
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
        TEST_ENV
      );

      expect(res.status).toBe(200);
      expect(generateBookTopics).toHaveBeenCalledWith(
        'Ancient Egypt',
        'Explore pyramids and pharaohs',
        12,
        'I already know about pyramids'
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
        TEST_ENV
      );

      expect(res.status).toBe(404);
    });
  });
});
