jest.mock('../middleware/jwt', () =>
  require('../test-utils/auth-fixture').createJwtModuleMock()
);

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock();

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

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
    birthYear: null,
    location: null,
    consentStatus: 'CONSENTED',
  }),
}));

jest.mock('../services/vocabulary', () => ({
  listVocabulary: jest.fn().mockResolvedValue([
    {
      id: '770e8400-e29b-41d4-a716-446655440000',
      profileId: 'test-profile-id',
      subjectId: '550e8400-e29b-41d4-a716-446655440000',
      term: 'hola',
      termNormalized: 'hola',
      translation: 'hello',
      type: 'word',
      cefrLevel: 'A1',
      milestoneId: null,
      mastered: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]),
  createVocabulary: jest.fn().mockResolvedValue({
    id: '770e8400-e29b-41d4-a716-446655440000',
    profileId: 'test-profile-id',
    subjectId: '550e8400-e29b-41d4-a716-446655440000',
    term: 'buenos dias',
    termNormalized: 'buenos dias',
    translation: 'good morning',
    type: 'chunk',
    cefrLevel: 'A1',
    milestoneId: null,
    mastered: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
  reviewVocabulary: jest.fn().mockResolvedValue({
    vocabulary: {
      id: '770e8400-e29b-41d4-a716-446655440000',
      profileId: 'test-profile-id',
      subjectId: '550e8400-e29b-41d4-a716-446655440000',
      term: 'hola',
      termNormalized: 'hola',
      translation: 'hello',
      type: 'word',
      cefrLevel: 'A1',
      milestoneId: null,
      mastered: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    retention: {
      vocabularyId: '770e8400-e29b-41d4-a716-446655440000',
      easeFactor: 2.5,
      intervalDays: 1,
      repetitions: 1,
      lastReviewedAt: new Date().toISOString(),
      nextReviewAt: new Date().toISOString(),
      failureCount: 0,
      consecutiveSuccesses: 1,
    },
  }),
  deleteVocabulary: jest.fn().mockResolvedValue(true),
}));

import { app } from '../index';
import {
  createVocabulary,
  deleteVocabulary,
  listVocabulary,
  reviewVocabulary,
} from '../services/vocabulary';
import {
  AUTH_HEADERS as BASE_AUTH_HEADERS,
  BASE_AUTH_ENV,
} from '../test-utils/test-env';
import {
  SubjectNotFoundError,
  VocabularyNotFoundError,
} from '@eduagent/schemas';

const TEST_ENV = { ...BASE_AUTH_ENV };

const AUTH_HEADERS = {
  ...BASE_AUTH_HEADERS,
  'X-Profile-Id': 'test-profile-id',
};

const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const VOCABULARY_ID = '770e8400-e29b-41d4-a716-446655440000';

describe('vocabulary routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /v1/subjects/:subjectId/vocabulary', () => {
    it('returns 200 with vocabulary list', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/vocabulary`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.vocabulary).toHaveLength(1);
      expect(body.vocabulary[0].term).toBe('hola');
      expect(listVocabulary).toHaveBeenCalled();
    });

    it('[FIX-API-6] returns 404 when SubjectNotFoundError is thrown (typed instanceof)', async () => {
      (listVocabulary as jest.Mock).mockRejectedValueOnce(
        new SubjectNotFoundError()
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/vocabulary`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/vocabulary`,
        {},
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  describe('POST /v1/subjects/:subjectId/vocabulary', () => {
    it('returns 201 with created vocabulary item', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/vocabulary`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            term: 'buenos dias',
            translation: 'good morning',
            type: 'chunk',
            cefrLevel: 'A1',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.vocabulary.term).toBe('buenos dias');
      expect(createVocabulary).toHaveBeenCalled();
    });

    it('returns 400 with invalid body', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/vocabulary`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            term: '',
            translation: 'hello',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('[FIX-API-6] returns 404 when SubjectNotFoundError is thrown on create (typed instanceof)', async () => {
      (createVocabulary as jest.Mock).mockRejectedValueOnce(
        new SubjectNotFoundError()
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/vocabulary`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            term: 'hola',
            translation: 'hello',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /v1/subjects/:subjectId/vocabulary/:vocabularyId/review', () => {
    it('returns 200 with updated retention data', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/vocabulary/${VOCABULARY_ID}/review`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ quality: 4 }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.vocabulary.id).toBe(VOCABULARY_ID);
      expect(body.retention.vocabularyId).toBe(VOCABULARY_ID);
      expect(reviewVocabulary).toHaveBeenCalled();
    });

    it('[FIX-API-6] returns 404 when VocabularyNotFoundError is thrown on review (typed instanceof)', async () => {
      (reviewVocabulary as jest.Mock).mockRejectedValueOnce(
        new VocabularyNotFoundError()
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/vocabulary/${VOCABULARY_ID}/review`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ quality: 4 }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 422 when review input is semantically invalid', async () => {
      (reviewVocabulary as jest.Mock).mockRejectedValueOnce(
        new Error('Review failed')
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/vocabulary/${VOCABULARY_ID}/review`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ quality: 4 }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(422);
    });

    it('returns 400 with invalid review payload', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/vocabulary/${VOCABULARY_ID}/review`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ quality: 8 }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/vocabulary/${VOCABULARY_ID}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quality: 4 }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /v1/subjects/:subjectId/vocabulary/:vocabularyId', () => {
    it('returns 200 with success when item belongs to profile', async () => {
      (deleteVocabulary as jest.Mock).mockResolvedValueOnce(true);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/vocabulary/${VOCABULARY_ID}`,
        {
          method: 'DELETE',
          headers: AUTH_HEADERS,
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(deleteVocabulary).toHaveBeenCalled();
    });

    it('returns 404 when vocabulary item does not exist', async () => {
      (deleteVocabulary as jest.Mock).mockResolvedValueOnce(false);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/vocabulary/${VOCABULARY_ID}`,
        {
          method: 'DELETE',
          headers: AUTH_HEADERS,
        },
        TEST_ENV
      );

      expect(res.status).toBe(404);
    });

    it('passes profileId and subjectId to service for IDOR protection', async () => {
      (deleteVocabulary as jest.Mock).mockResolvedValueOnce(true);

      await app.request(
        `/v1/subjects/${SUBJECT_ID}/vocabulary/${VOCABULARY_ID}`,
        {
          method: 'DELETE',
          headers: AUTH_HEADERS,
        },
        TEST_ENV
      );

      const [, profileId, subjectId, vocabularyId] = (
        deleteVocabulary as jest.Mock
      ).mock.calls[0];
      expect(profileId).toBe('test-profile-id');
      expect(subjectId).toBe(SUBJECT_ID);
      expect(vocabularyId).toBe(VOCABULARY_ID);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/vocabulary/${VOCABULARY_ID}`,
        {
          method: 'DELETE',
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });
});
