// ---------------------------------------------------------------------------
// Real JWT + real auth middleware — no jwt module mock
// ---------------------------------------------------------------------------

import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';

import { createDatabaseModuleMock } from '../test-utils/database-module';
import { personScope } from '../test-utils/identity-v2-scope-mock';

const mockDatabaseModule = createDatabaseModuleMock({ includeActual: true });

jest.mock(
  '@eduagent/database' /* gc1-allow: route unit test — DB middleware injected via mock; real DB covered by route integration / e2e tests */,
  () => mockDatabaseModule.module,
);

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
      id: 'a0000000-0000-4000-a000-000000000001',
      birthYear: null,
      location: null,
      consentStatus: 'CONSENTED',
    }),
  };
});

// [WI-867] v2 profile-scope seam continuity mock. Mirror the pre-collapse
// getProfile default: id 'a0000000-0000-4000-a000-000000000001'.
const mockFindOwnerPersonScope = jest.fn().mockResolvedValue(null);
const mockGetPersonScope = jest
  .fn()
  .mockResolvedValue(personScope({ profileId: 'a0000000-0000-4000-a000-000000000001' }));
jest.mock(
  '../services/identity-v2/profile-v2' /* gc1-allow: continuity — replaces the pre-collapse findOwnerProfile/getProfile mock; db.select() join chain unrunnable on the unit mock DB; real path covered by the identity integration suite */,
  () => ({
    ...jest.requireActual('../services/identity-v2/profile-v2'),
    findOwnerPersonScope: (...a: unknown[]) => mockFindOwnerPersonScope(...a),
    getPersonScope: (...a: unknown[]) => mockGetPersonScope(...a),
  }),
);

jest.mock(
  '../services/vocabulary' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../services/vocabulary',
    ) as typeof import('../services/vocabulary');
    return {
      ...actual,
      listVocabulary: jest.fn().mockResolvedValue([
        {
          id: '770e8400-e29b-41d4-a716-446655440000',
          profileId: 'a0000000-0000-4000-a000-000000000001',
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
        profileId: 'a0000000-0000-4000-a000-000000000001',
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
          profileId: 'a0000000-0000-4000-a000-000000000001',
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
    };
  },
);

import { Hono } from 'hono';
import { app } from '../index';
import { vocabularyRoutes } from './vocabulary';
import {
  createVocabulary,
  deleteVocabulary,
  listVocabulary,
  reviewVocabulary,
} from '../services/vocabulary';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';
import {
  SubjectNotFoundError,
  VocabularyNotFoundError,
} from '@eduagent/schemas';

const TEST_ENV = {
  ...BASE_AUTH_ENV,
  // [WI-867] DATABASE_URL required so databaseMiddleware sets db on the context.
  DATABASE_URL: 'postgresql://test:test@localhost/test',
};

const AUTH_HEADERS = makeAuthHeaders({
  'X-Profile-Id': 'a0000000-0000-4000-a000-000000000001',
});

const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const VOCABULARY_ID = '770e8400-e29b-41d4-a716-446655440000';

describe('vocabulary routes', () => {
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
    mockGetPersonScope.mockResolvedValue(personScope({ profileId: 'a0000000-0000-4000-a000-000000000001' }));
  });

  describe('GET /v1/subjects/:subjectId/vocabulary', () => {
    it('returns 200 with vocabulary list', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/vocabulary`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.vocabulary).toHaveLength(1);
      expect(body.vocabulary[0].term).toBe('hola');
      expect(listVocabulary).toHaveBeenCalled();
    });

    it('[FIX-API-6] returns 404 when SubjectNotFoundError is thrown (typed instanceof)', async () => {
      (listVocabulary as jest.Mock).mockRejectedValueOnce(
        new SubjectNotFoundError(),
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/vocabulary`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/vocabulary`,
        {},
        TEST_ENV,
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
        TEST_ENV,
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
        TEST_ENV,
      );

      expect(res.status).toBe(400);
    });

    it('[FIX-API-6] returns 404 when SubjectNotFoundError is thrown on create (typed instanceof)', async () => {
      (createVocabulary as jest.Mock).mockRejectedValueOnce(
        new SubjectNotFoundError(),
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
        TEST_ENV,
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
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.vocabulary.id).toBe(VOCABULARY_ID);
      expect(body.retention.vocabularyId).toBe(VOCABULARY_ID);
      expect(reviewVocabulary).toHaveBeenCalled();
    });

    it('[FIX-API-6] returns 404 when VocabularyNotFoundError is thrown on review (typed instanceof)', async () => {
      (reviewVocabulary as jest.Mock).mockRejectedValueOnce(
        new VocabularyNotFoundError(),
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/vocabulary/${VOCABULARY_ID}/review`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ quality: 4 }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('[F-016] propagates unexpected errors (e.g. transient DB) as 500 rather than masking as 422', async () => {
      (reviewVocabulary as jest.Mock).mockRejectedValueOnce(
        new Error('Review failed'),
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/vocabulary/${VOCABULARY_ID}/review`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ quality: 4 }),
        },
        TEST_ENV,
      );

      // Unexpected/transient errors must propagate to the global handler (5xx),
      // not be silently masked as a permanent validation failure (422).
      expect(res.status).toBe(500);
      const body = (await res.json()) as { code: string };
      // Raw err.message must NOT be echoed to the client
      expect(body.code).toBe('INTERNAL_ERROR');
    });

    it('returns 400 with invalid review payload', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/vocabulary/${VOCABULARY_ID}/review`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ quality: 8 }),
        },
        TEST_ENV,
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
        TEST_ENV,
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
        TEST_ENV,
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
        TEST_ENV,
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
        TEST_ENV,
      );

      const [, profileId, subjectId, vocabularyId] = (
        deleteVocabulary as jest.Mock
      ).mock.calls[0];
      expect(profileId).toBe('a0000000-0000-4000-a000-000000000001');
      expect(subjectId).toBe(SUBJECT_ID);
      expect(vocabularyId).toBe(VOCABULARY_ID);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/vocabulary/${VOCABULARY_ID}`,
        {
          method: 'DELETE',
        },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });
  });
});

// ---------------------------------------------------------------------------
// [WI-181 / DS-092] Proxy-mode write guard
//
// Mounts vocabularyRoutes on a mini Hono app with profileMeta.isOwner=false
// so assertNotProxyMode rejects every write before the service is touched.
// Mirrors the pattern in proxy-guard.test.ts + assessments.test.ts.
// ---------------------------------------------------------------------------
describe('[WI-181 / DS-092] vocabulary proxy-mode guard', () => {
  function makeProxyApp() {
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('db' as never, {});
      c.set('profileId' as never, 'a0000000-0000-4000-a000-000000000001');
      c.set('user' as never, { id: 'test-user' });
      c.set('profileMeta' as never, { isOwner: false });
      await next();
    });
    app.route('/', vocabularyRoutes);
    return app;
  }

  beforeEach(() => jest.clearAllMocks());

  it('POST /subjects/:subjectId/vocabulary returns 403 when caller is in proxy mode', async () => {
    const res = await makeProxyApp().request(
      `/subjects/${SUBJECT_ID}/vocabulary`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term: 'hola', translation: 'hello' }),
      },
    );
    expect(res.status).toBe(403);
    expect(createVocabulary).not.toHaveBeenCalled();
  });

  it('POST /subjects/:subjectId/vocabulary/:vocabularyId/review returns 403 when caller is in proxy mode', async () => {
    const res = await makeProxyApp().request(
      `/subjects/${SUBJECT_ID}/vocabulary/${VOCABULARY_ID}/review`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quality: 4 }),
      },
    );
    expect(res.status).toBe(403);
    expect(reviewVocabulary).not.toHaveBeenCalled();
  });

  it('DELETE /subjects/:subjectId/vocabulary/:vocabularyId returns 403 when caller is in proxy mode', async () => {
    const res = await makeProxyApp().request(
      `/subjects/${SUBJECT_ID}/vocabulary/${VOCABULARY_ID}`,
      { method: 'DELETE' },
    );
    expect(res.status).toBe(403);
    expect(deleteVocabulary).not.toHaveBeenCalled();
  });
});
