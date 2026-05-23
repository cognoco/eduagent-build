// ---------------------------------------------------------------------------
// curriculum.test.ts — negative-path coverage for routes/curriculum.ts
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

const mockDatabaseModule = createDatabaseModuleMock({ includeActual: true });

jest.mock(
  '@eduagent/database' /* gc1-allow: route unit test — DB middleware injected via mock; real DB covered by route integration / e2e tests */,
  () => mockDatabaseModule.module,
);

// ---------------------------------------------------------------------------
// Account + profile service mocks
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
      birthYear: 2008,
      location: null,
      consentStatus: 'CONSENTED',
      hasPremiumLlm: false,
      isOwner: true,
    }),
  };
});

// ---------------------------------------------------------------------------
// Curriculum service mock
// ---------------------------------------------------------------------------

const mockGetCurriculum = jest.fn();
const mockSkipTopic = jest.fn();
const mockUnskipTopic = jest.fn();
const mockChallengeCurriculum = jest.fn();
const mockExplainTopicOrdering = jest.fn();
const mockAddCurriculumTopic = jest.fn();
const mockAdaptCurriculumFromPerformance = jest.fn();
const mockCloneTopicFromChild = jest.fn();
const mockUndoCloneFromChild = jest.fn();

jest.mock(
  '../services/curriculum' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../services/curriculum',
    ) as typeof import('../services/curriculum');
    return {
      ...actual,
      getCurriculum: (...args: unknown[]) => mockGetCurriculum(...args),
      skipTopic: (...args: unknown[]) => mockSkipTopic(...args),
      unskipTopic: (...args: unknown[]) => mockUnskipTopic(...args),
      challengeCurriculum: (...args: unknown[]) =>
        mockChallengeCurriculum(...args),
      explainTopicOrdering: (...args: unknown[]) =>
        mockExplainTopicOrdering(...args),
      addCurriculumTopic: (...args: unknown[]) =>
        mockAddCurriculumTopic(...args),
      adaptCurriculumFromPerformance: (...args: unknown[]) =>
        mockAdaptCurriculumFromPerformance(...args),
    };
  },
);

jest.mock(
  '../services/family-bridge' /* gc1-allow: route unit test — bridge service has DB transaction logic covered separately */,
  () => {
    const actual = jest.requireActual(
      '../services/family-bridge',
    ) as typeof import('../services/family-bridge');
    return {
      ...actual,
      cloneTopicFromChild: (...args: unknown[]) =>
        mockCloneTopicFromChild(...args),
      undoCloneFromChild: (...args: unknown[]) =>
        mockUndoCloneFromChild(...args),
    };
  },
);

// ---------------------------------------------------------------------------
// Inngest framework boundary mock (required by index.ts import chain)
// ---------------------------------------------------------------------------

jest.mock('inngest/hono', () => ({
  // gc1-allow: Inngest framework boundary
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
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';
import { NotFoundError, TopicNotSkippedError } from '../errors';

const TEST_ENV = { ...BASE_AUTH_ENV };
const AUTH_HEADERS = makeAuthHeaders({ 'X-Profile-Id': 'test-profile-id' });

const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const TOPIC_ID = '550e8400-e29b-41d4-a716-446655440001';
const CHILD_PROFILE_ID = '550e8400-e29b-41d4-a716-446655440002';
const REQUEST_ID = '550e8400-e29b-41d4-a716-446655440003';

// getCurriculum returns a Curriculum object (not an array of topics)
const MOCK_CURRICULUM_OBJECT = {
  id: '550e8400-e29b-41d4-a716-446655440020',
  subjectId: SUBJECT_ID,
  version: 1,
  topics: [
    {
      id: TOPIC_ID,
      title: 'World War I',
      description: 'The Great War',
      chapter: 'Modern History',
      sortOrder: 1,
      relevance: 'core',
      estimatedMinutes: 30,
      bookId: '550e8400-e29b-41d4-a716-446655440010',
      skipped: false,
      source: 'generated',
    },
  ],
  generatedAt: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('curriculum routes', () => {
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

  // ---- POST /v1/curriculum/clone-from-child --------------------------------

  describe('POST /v1/curriculum/clone-from-child', () => {
    it('clones a child topic into the active adult profile', async () => {
      mockCloneTopicFromChild.mockResolvedValueOnce({
        topicId: TOPIC_ID,
        subjectId: SUBJECT_ID,
        alreadyExisted: false,
        descriptionDivergent: false,
        descriptionRefreshed: false,
        topicState: 'unstarted',
        createdIds: { topicId: TOPIC_ID, subjectId: SUBJECT_ID },
      });

      const res = await app.request(
        '/v1/curriculum/clone-from-child',
        {
          method: 'POST',
          headers: {
            ...AUTH_HEADERS,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            childProfileId: CHILD_PROFILE_ID,
            topicId: TOPIC_ID,
            requestId: REQUEST_ID,
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockCloneTopicFromChild).toHaveBeenCalledTimes(1);
      const [, profileIdArg, inputArg] = mockCloneTopicFromChild.mock.calls[0];
      expect(profileIdArg).toBe('test-profile-id');
      expect(inputArg).toMatchObject({
        childProfileId: CHILD_PROFILE_ID,
        topicId: TOPIC_ID,
        requestId: REQUEST_ID,
      });
    });

    it('passes forceCopy through to the bridge service', async () => {
      mockCloneTopicFromChild.mockResolvedValueOnce({
        topicId: TOPIC_ID,
        subjectId: SUBJECT_ID,
        alreadyExisted: false,
        descriptionDivergent: false,
        descriptionRefreshed: false,
        topicState: 'unstarted',
        createdIds: { topicId: TOPIC_ID, subjectId: SUBJECT_ID },
      });

      const res = await app.request(
        '/v1/curriculum/clone-from-child',
        {
          method: 'POST',
          headers: {
            ...AUTH_HEADERS,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            childProfileId: CHILD_PROFILE_ID,
            topicId: TOPIC_ID,
            requestId: REQUEST_ID,
            forceCopy: true,
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const [, , inputArg] = mockCloneTopicFromChild.mock.calls[0];
      expect(inputArg).toMatchObject({
        childProfileId: CHILD_PROFILE_ID,
        topicId: TOPIC_ID,
        requestId: REQUEST_ID,
        forceCopy: true,
      });
    });

    it.each([
      [
        'missing requestId',
        { childProfileId: CHILD_PROFILE_ID, topicId: TOPIC_ID },
      ],
      [
        'invalid requestId',
        {
          childProfileId: CHILD_PROFILE_ID,
          topicId: TOPIC_ID,
          requestId: 'not-a-uuid',
        },
      ],
    ])('rejects %s before calling the bridge service', async (_name, body) => {
      const res = await app.request(
        '/v1/curriculum/clone-from-child',
        {
          method: 'POST',
          headers: {
            ...AUTH_HEADERS,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockCloneTopicFromChild).not.toHaveBeenCalled();
    });

    it('returns 404 for missing or inaccessible source topics', async () => {
      mockCloneTopicFromChild.mockRejectedValueOnce(new NotFoundError('Topic'));

      const res = await app.request(
        '/v1/curriculum/clone-from-child',
        {
          method: 'POST',
          headers: {
            ...AUTH_HEADERS,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            childProfileId: CHILD_PROFILE_ID,
            topicId: TOPIC_ID,
            requestId: REQUEST_ID,
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
    });
  });

  // ---- DELETE /v1/curriculum/clone-from-child/undo -------------------------

  describe('DELETE /v1/curriculum/clone-from-child/undo', () => {
    it('undoes only the created bridge topic', async () => {
      mockUndoCloneFromChild.mockResolvedValueOnce({
        deleted: { topic: true },
      });

      const res = await app.request(
        '/v1/curriculum/clone-from-child/undo',
        {
          method: 'DELETE',
          headers: {
            ...AUTH_HEADERS,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            createdIds: { topicId: TOPIC_ID },
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const [, profileIdArg, createdIdsArg] =
        mockUndoCloneFromChild.mock.calls[0];
      expect(profileIdArg).toBe('test-profile-id');
      expect(createdIdsArg).toEqual({ topicId: TOPIC_ID });
      expect(await res.json()).toEqual({ deleted: { topic: true } });
    });

    it('returns the session-started reason when undo is no longer allowed', async () => {
      mockUndoCloneFromChild.mockResolvedValueOnce({
        deleted: { topic: false },
        reason: 'session_started',
      });

      const res = await app.request(
        '/v1/curriculum/clone-from-child/undo',
        {
          method: 'DELETE',
          headers: {
            ...AUTH_HEADERS,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            createdIds: { topicId: TOPIC_ID },
          }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const [, profileIdArg, createdIdsArg] =
        mockUndoCloneFromChild.mock.calls[0];
      expect(profileIdArg).toBe('test-profile-id');
      expect(createdIdsArg).toEqual({ topicId: TOPIC_ID });
      expect(await res.json()).toEqual({
        deleted: { topic: false },
        reason: 'session_started',
      });
    });
  });

  // ---- GET /v1/subjects/:subjectId/curriculum ------------------------------

  describe('GET /v1/subjects/:subjectId/curriculum', () => {
    it('returns 200 with curriculum for subject', async () => {
      mockGetCurriculum.mockResolvedValueOnce(MOCK_CURRICULUM_OBJECT);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockGetCurriculum).toHaveBeenCalledTimes(1);
      const [, profileIdArg, subjectIdArg] = mockGetCurriculum.mock.calls[0];
      expect(profileIdArg).toBe('test-profile-id');
      expect(subjectIdArg).toBe(SUBJECT_ID);
    });

    it('returns 200 with null curriculum when no curriculum exists (not 404)', async () => {
      // getCurriculum returns null when no curriculum has been generated yet
      mockGetCurriculum.mockResolvedValueOnce(null);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.curriculum).toBeNull();
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum`,
        {},
        TEST_ENV,
      );
      expect(res.status).toBe(401);
      expect(mockGetCurriculum).not.toHaveBeenCalled();
    });

    it('returns 400 when profile cannot be resolved (no X-Profile-Id and no owner)', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum`,
        { headers: makeAuthHeaders() },
        TEST_ENV,
      );
      expect(res.status).toBe(400);
      expect(mockGetCurriculum).not.toHaveBeenCalled();
    });
  });

  // ---- POST /v1/subjects/:subjectId/curriculum/skip ------------------------

  describe('POST /v1/subjects/:subjectId/curriculum/skip', () => {
    it('returns 200 on successful skip', async () => {
      mockSkipTopic.mockResolvedValueOnce(undefined);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/skip`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ topicId: TOPIC_ID }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.topicId).toBe(TOPIC_ID);
      expect(mockSkipTopic).toHaveBeenCalledTimes(1);
      const [, skipProfileId, skipSubjectId, skipTopicId] =
        mockSkipTopic.mock.calls[0];
      expect(skipProfileId).toBe('test-profile-id');
      expect(skipSubjectId).toBe(SUBJECT_ID);
      expect(skipTopicId).toBe(TOPIC_ID);
    });

    it('returns 404 when topic not found', async () => {
      mockSkipTopic.mockRejectedValueOnce(new NotFoundError('Topic not found'));

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/skip`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ topicId: TOPIC_ID }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 400 for missing topicId', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/skip`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockSkipTopic).not.toHaveBeenCalled();
    });

    it('returns 400 for non-UUID topicId', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/skip`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ topicId: 'not-a-uuid' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockSkipTopic).not.toHaveBeenCalled();
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/skip`,
        {
          method: 'POST',
          body: JSON.stringify({ topicId: TOPIC_ID }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });

  // ---- POST /v1/subjects/:subjectId/curriculum/unskip ----------------------

  describe('POST /v1/subjects/:subjectId/curriculum/unskip', () => {
    it('returns 200 on successful unskip', async () => {
      mockUnskipTopic.mockResolvedValueOnce(undefined);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/unskip`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ topicId: TOPIC_ID }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.topicId).toBe(TOPIC_ID);
    });

    it('returns 404 when topic not found', async () => {
      mockUnskipTopic.mockRejectedValueOnce(
        new NotFoundError('Topic not found'),
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/unskip`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ topicId: TOPIC_ID }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 422 when topic is not skipped (FIX-API-6)', async () => {
      mockUnskipTopic.mockRejectedValueOnce(new TopicNotSkippedError());

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/unskip`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ topicId: TOPIC_ID }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for missing topicId', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/unskip`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockUnskipTopic).not.toHaveBeenCalled();
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/unskip`,
        {
          method: 'POST',
          body: JSON.stringify({ topicId: TOPIC_ID }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });

  // ---- POST /v1/subjects/:subjectId/curriculum/challenge -------------------

  describe('POST /v1/subjects/:subjectId/curriculum/challenge', () => {
    it('returns 200 on successful challenge', async () => {
      // challengeCurriculumResponseSchema expects { curriculum: curriculumSchema }
      // where curriculumSchema is { id, subjectId, version, topics, generatedAt }
      mockChallengeCurriculum.mockResolvedValueOnce({
        id: '550e8400-e29b-41d4-a716-446655440020',
        subjectId: SUBJECT_ID,
        version: 1,
        topics: [],
        generatedAt: new Date().toISOString(),
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/challenge`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ feedback: 'Make it harder' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
    });

    it('returns 404 when subject not found', async () => {
      mockChallengeCurriculum.mockRejectedValueOnce(
        new NotFoundError('Subject not found'),
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/challenge`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ feedback: 'Make it harder' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 400 for missing feedback', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/challenge`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockChallengeCurriculum).not.toHaveBeenCalled();
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/challenge`,
        {
          method: 'POST',
          body: JSON.stringify({ feedback: 'Make it harder' }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });

  // ---- POST /v1/subjects/:subjectId/curriculum/topics ----------------------

  describe('POST /v1/subjects/:subjectId/curriculum/topics', () => {
    it('returns 200 on successful topic preview', async () => {
      // curriculumTopicAddSchema is a discriminated union requiring `mode`
      mockAddCurriculumTopic.mockResolvedValueOnce({
        mode: 'preview',
        preview: {
          title: 'New topic',
          description: 'A preview description',
          estimatedMinutes: 30,
          sortOrder: 5,
          chapter: 'Chapter 1',
          relevance: 'core',
          connections: [],
        },
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/topics`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ mode: 'preview', title: 'New topic' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockAddCurriculumTopic).toHaveBeenCalledTimes(1);
      const [, profileIdArg, subjectIdArg] =
        mockAddCurriculumTopic.mock.calls[0];
      expect(profileIdArg).toBe('test-profile-id');
      expect(subjectIdArg).toBe(SUBJECT_ID);
    });

    it('returns 404 when subject not found', async () => {
      mockAddCurriculumTopic.mockRejectedValueOnce(
        new NotFoundError('Subject not found'),
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/topics`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ mode: 'preview', title: 'New topic' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 400 for missing mode (discriminated union)', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/topics`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ title: 'No mode given' }),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockAddCurriculumTopic).not.toHaveBeenCalled();
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/topics`,
        {
          method: 'POST',
          body: JSON.stringify({ mode: 'preview', title: 'New topic' }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });

  // ---- POST /v1/subjects/:subjectId/curriculum/adapt -----------------------

  describe('POST /v1/subjects/:subjectId/curriculum/adapt', () => {
    // curriculumAdaptRequestSchema requires: { topicId: uuid, signal: enum }
    const validAdaptBody = {
      topicId: TOPIC_ID,
      signal: 'struggling' as const,
    };

    it('returns 404 when subject not found', async () => {
      mockAdaptCurriculumFromPerformance.mockRejectedValueOnce(
        new NotFoundError('Subject not found'),
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/adapt`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify(validAdaptBody),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 400 for missing required fields (topicId)', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/adapt`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ signal: 'mastered' }),
        },
        TEST_ENV,
      );
      expect(res.status).toBe(400);
      expect(mockAdaptCurriculumFromPerformance).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid signal value', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/adapt`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ topicId: TOPIC_ID, signal: 'invalid_signal' }),
        },
        TEST_ENV,
      );
      expect(res.status).toBe(400);
      expect(mockAdaptCurriculumFromPerformance).not.toHaveBeenCalled();
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/adapt`,
        {
          method: 'POST',
          body: JSON.stringify(validAdaptBody),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });

  // ---- GET /v1/subjects/:subjectId/curriculum/topics/:topicId/explain ------

  describe('GET /v1/subjects/:subjectId/curriculum/topics/:topicId/explain', () => {
    it('returns 200 with explanation', async () => {
      mockExplainTopicOrdering.mockResolvedValueOnce(
        'This topic comes first because...',
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/topics/${TOPIC_ID}/explain`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockExplainTopicOrdering).toHaveBeenCalledTimes(1);
      const [, explainProfileId, explainSubjectId, explainTopicId] =
        mockExplainTopicOrdering.mock.calls[0];
      expect(explainProfileId).toBe('test-profile-id');
      expect(explainSubjectId).toBe(SUBJECT_ID);
      expect(explainTopicId).toBe(TOPIC_ID);
    });

    it('returns 404 when topic not found', async () => {
      mockExplainTopicOrdering.mockRejectedValueOnce(
        new NotFoundError('Topic not found'),
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/topics/${TOPIC_ID}/explain`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/curriculum/topics/${TOPIC_ID}/explain`,
        {},
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });
});
