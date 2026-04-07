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

jest.mock('@eduagent/database', () => ({
  createDatabase: jest.fn().mockReturnValue({}),
}));

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
// Mock notes service
// ---------------------------------------------------------------------------

const mockGetNotesForBook = jest.fn();
const mockUpsertNote = jest.fn();
const mockDeleteNote = jest.fn();
const mockGetTopicIdsWithNotes = jest.fn();

jest.mock('../services/notes', () => ({
  getNotesForBook: (...args: unknown[]) => mockGetNotesForBook(...args),
  upsertNote: (...args: unknown[]) => mockUpsertNote(...args),
  deleteNote: (...args: unknown[]) => mockDeleteNote(...args),
  getTopicIdsWithNotes: (...args: unknown[]) =>
    mockGetTopicIdsWithNotes(...args),
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

const TEST_ENV = {
  DATABASE_URL: 'postgresql://test:test@localhost/test',
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
  'X-Profile-Id': 'test-profile-id',
};

const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const BOOK_ID = '550e8400-e29b-41d4-a716-446655440001';
const TOPIC_ID = '550e8400-e29b-41d4-a716-446655440010';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('note routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---- GET /v1/subjects/:subjectId/books/:bookId/notes ----

  describe('GET /v1/subjects/:subjectId/books/:bookId/notes', () => {
    it('returns 200 with notes for a book', async () => {
      const mockNotes = [
        {
          topicId: TOPIC_ID,
          content: 'My notes about pyramids',
          updatedAt: new Date('2026-04-04T00:00:00.000Z'),
        },
      ];
      mockGetNotesForBook.mockResolvedValueOnce(mockNotes);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books/${BOOK_ID}/notes`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('notes');
      expect(body.notes).toHaveLength(1);
      expect(body.notes[0].topicId).toBe(TOPIC_ID);
      expect(body.notes[0].content).toBe('My notes about pyramids');
    });

    it('returns 200 with empty notes array', async () => {
      mockGetNotesForBook.mockResolvedValueOnce([]);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books/${BOOK_ID}/notes`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.notes).toEqual([]);
    });

    it('returns 400 for invalid bookId', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/books/not-a-uuid/notes`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });
  });

  // ---- PUT /v1/subjects/:subjectId/topics/:topicId/note ----

  describe('PUT /v1/subjects/:subjectId/topics/:topicId/note', () => {
    it('creates a note and returns 200', async () => {
      const mockNote = {
        id: '550e8400-e29b-41d4-a716-446655440099',
        topicId: TOPIC_ID,
        content: 'New note content',
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      };
      mockUpsertNote.mockResolvedValueOnce(mockNote);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/note`,
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ content: 'New note content' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.note.topicId).toBe(TOPIC_ID);
      expect(body.note.content).toBe('New note content');
      expect(mockUpsertNote).toHaveBeenCalledWith(
        expect.anything(),
        'test-profile-id',
        SUBJECT_ID,
        TOPIC_ID,
        'New note content',
        undefined
      );
    });

    it('appends to an existing note when append=true', async () => {
      const mockNote = {
        id: '550e8400-e29b-41d4-a716-446655440099',
        topicId: TOPIC_ID,
        content: 'Existing content\nAppended content',
        updatedAt: new Date('2026-04-04T00:00:00.000Z'),
      };
      mockUpsertNote.mockResolvedValueOnce(mockNote);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/note`,
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            content: 'Appended content',
            append: true,
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.note.content).toBe('Existing content\nAppended content');
      expect(mockUpsertNote).toHaveBeenCalledWith(
        expect.anything(),
        'test-profile-id',
        SUBJECT_ID,
        TOPIC_ID,
        'Appended content',
        true
      );
    });

    it('rejects empty content with 400', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/note`,
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ content: '' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid topicId', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/not-a-uuid/note`,
        {
          method: 'PUT',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ content: 'Some note' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });
  });

  // ---- GET /v1/notes/topic-ids ----

  describe('GET /v1/notes/topic-ids', () => {
    it('returns topic IDs that have notes', async () => {
      mockGetTopicIdsWithNotes.mockResolvedValueOnce([TOPIC_ID]);

      const res = await app.request(
        '/v1/notes/topic-ids',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.topicIds).toEqual([TOPIC_ID]);
    });

    it('returns empty array when no notes exist', async () => {
      mockGetTopicIdsWithNotes.mockResolvedValueOnce([]);

      const res = await app.request(
        '/v1/notes/topic-ids',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.topicIds).toEqual([]);
    });
  });

  // ---- DELETE /v1/subjects/:subjectId/topics/:topicId/note ----

  describe('DELETE /v1/subjects/:subjectId/topics/:topicId/note', () => {
    it('deletes a note and returns 204', async () => {
      mockDeleteNote.mockResolvedValueOnce(true);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/note`,
        {
          method: 'DELETE',
          headers: AUTH_HEADERS,
        },
        TEST_ENV
      );

      expect(res.status).toBe(204);
      expect(mockDeleteNote).toHaveBeenCalledWith(
        expect.anything(),
        'test-profile-id',
        SUBJECT_ID,
        TOPIC_ID
      );
    });

    it('returns 404 when note does not exist', async () => {
      mockDeleteNote.mockResolvedValueOnce(false);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/note`,
        {
          method: 'DELETE',
          headers: AUTH_HEADERS,
        },
        TEST_ENV
      );

      expect(res.status).toBe(404);
    });
  });
});
