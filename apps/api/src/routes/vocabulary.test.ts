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
}));

import { app } from '../index';
import {
  createVocabulary,
  listVocabulary,
  reviewVocabulary,
} from '../services/vocabulary';

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
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

    it('returns 404 when subject is missing', async () => {
      (listVocabulary as jest.Mock).mockRejectedValueOnce(
        new Error('Subject not found')
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/vocabulary`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(404);
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

    it('returns 404 when subject is missing', async () => {
      (createVocabulary as jest.Mock).mockRejectedValueOnce(
        new Error('Subject not found')
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

    it('returns 404 when vocabulary item is missing', async () => {
      (reviewVocabulary as jest.Mock).mockRejectedValueOnce(
        new Error('Vocabulary item not found')
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
});
