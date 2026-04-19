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

jest.mock('../services/progress', () => ({
  getSubjectProgress: jest.fn(),
  getTopicProgress: jest.fn(),
  getOverallProgress: jest.fn(),
  getContinueSuggestion: jest.fn(),
  getActiveSessionForTopic: jest.fn(),
  resolveTopicSubject: jest.fn(),
}));

jest.mock('../services/retention-data', () => ({
  getProfileOverdueCount: jest.fn(),
}));

import { app } from '../index';
import {
  getSubjectProgress,
  getTopicProgress,
  getOverallProgress,
  getContinueSuggestion,
  getActiveSessionForTopic,
  resolveTopicSubject,
} from '../services/progress';
import { getProfileOverdueCount } from '../services/retention-data';

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
  'X-Profile-Id': 'test-profile-id',
};

const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const TOPIC_ID = '660e8400-e29b-41d4-a716-446655440000';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('progress routes', () => {
  // -------------------------------------------------------------------------
  // GET /v1/subjects/:subjectId/progress
  // -------------------------------------------------------------------------

  describe('GET /v1/subjects/:subjectId/progress', () => {
    it('returns 200 with subject progress', async () => {
      (getSubjectProgress as jest.Mock).mockResolvedValue({
        subjectId: SUBJECT_ID,
        name: 'Mathematics',
        topicsTotal: 10,
        topicsCompleted: 3,
        topicsVerified: 1,
        urgencyScore: 0,
        retentionStatus: 'strong',
        lastSessionAt: null,
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/progress`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.progress).toBeDefined();
      expect(body.progress.subjectId).toBe(SUBJECT_ID);
      expect(body.progress.topicsTotal).toBe(10);
      expect(body.progress.topicsCompleted).toBe(3);
      expect(body.progress.topicsVerified).toBe(1);
      expect(body.progress.retentionStatus).toBe('strong');
    });

    it('returns 404 when subject not found', async () => {
      (getSubjectProgress as jest.Mock).mockResolvedValue(null);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/progress`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(404);
    });

    it('returns 400 when authenticated but missing X-Profile-Id header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/progress`,
        {
          headers: {
            Authorization: 'Bearer valid.jwt.token',
            'Content-Type': 'application/json',
          },
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
      expect(getSubjectProgress).not.toHaveBeenCalled();
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/progress`,
        {},
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/subjects/:subjectId/topics/:topicId/progress
  // -------------------------------------------------------------------------

  describe('GET /v1/subjects/:subjectId/topics/:topicId/progress', () => {
    it('returns 200 with topic progress', async () => {
      (getTopicProgress as jest.Mock).mockResolvedValue({
        topicId: TOPIC_ID,
        title: 'Algebra Basics',
        description: 'Introduction to algebra',
        completionStatus: 'in_progress',
        retentionStatus: 'strong',
        struggleStatus: 'normal',
        masteryScore: 0.85,
        summaryExcerpt: null,
        xpStatus: 'pending',
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/progress`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.topic).toBeDefined();
      expect(body.topic.topicId).toBe(TOPIC_ID);
      expect(body.topic.title).toBe('Algebra Basics');
      expect(body.topic.completionStatus).toBe('in_progress');
      expect(body.topic.struggleStatus).toBe('normal');
    });

    it('returns 404 when topic not found', async () => {
      (getTopicProgress as jest.Mock).mockResolvedValue(null);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/progress`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(404);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/progress`,
        {},
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/progress/overview
  // -------------------------------------------------------------------------

  describe('GET /v1/progress/overview', () => {
    it('returns 200 with progress overview', async () => {
      (getOverallProgress as jest.Mock).mockResolvedValue({
        subjects: [
          {
            subjectId: SUBJECT_ID,
            name: 'Mathematics',
            topicsTotal: 10,
            topicsCompleted: 3,
            topicsVerified: 1,
            urgencyScore: 0,
            retentionStatus: 'strong',
            lastSessionAt: null,
          },
        ],
        totalTopicsCompleted: 3,
        totalTopicsVerified: 1,
      });

      const res = await app.request(
        '/v1/progress/overview',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.subjects).toHaveLength(1);
      expect(body.totalTopicsCompleted).toBe(3);
      expect(body.totalTopicsVerified).toBe(1);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/progress/overview', {}, TEST_ENV);

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/progress/review-summary
  // -------------------------------------------------------------------------

  describe('GET /v1/progress/review-summary', () => {
    it('returns 200 with total overdue review count and nextReviewTopic', async () => {
      (getProfileOverdueCount as jest.Mock).mockResolvedValue({
        overdueCount: 7,
        topTopicIds: ['topic-1', 'topic-2', 'topic-3'],
        nextReviewTopic: {
          topicId: 'topic-1',
          subjectId: SUBJECT_ID,
          subjectName: 'Mathematics',
          topicTitle: 'Algebra Basics',
        },
      });

      const res = await app.request(
        '/v1/progress/review-summary',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.totalOverdue).toBe(7);
      expect(body.nextReviewTopic).toEqual({
        topicId: 'topic-1',
        subjectId: SUBJECT_ID,
        subjectName: 'Mathematics',
        topicTitle: 'Algebra Basics',
      });
    });

    it('returns null nextReviewTopic when no topics are overdue', async () => {
      (getProfileOverdueCount as jest.Mock).mockResolvedValue({
        overdueCount: 0,
        topTopicIds: [],
        nextReviewTopic: null,
      });

      const res = await app.request(
        '/v1/progress/review-summary',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.totalOverdue).toBe(0);
      expect(body.nextReviewTopic).toBeNull();
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/progress/review-summary',
        {},
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/progress/continue
  // -------------------------------------------------------------------------

  describe('GET /v1/progress/continue', () => {
    it('returns 200 with continue suggestion', async () => {
      (getContinueSuggestion as jest.Mock).mockResolvedValue({
        subjectId: SUBJECT_ID,
        subjectName: 'Mathematics',
        topicId: TOPIC_ID,
        topicTitle: 'Algebra Basics',
        lastSessionId: 'session-123',
      });

      const res = await app.request(
        '/v1/progress/continue',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.suggestion).not.toBeNull();
      expect(body.suggestion.topicTitle).toBe('Algebra Basics');
    });

    it('returns 200 with null suggestion when nothing to continue', async () => {
      (getContinueSuggestion as jest.Mock).mockResolvedValue(null);

      const res = await app.request(
        '/v1/progress/continue',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.suggestion).toBeNull();
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/progress/continue', {}, TEST_ENV);

      expect(res.status).toBe(401);
    });

    it('[F-001] returns lastSessionId in continue suggestion when active session on the suggested topic', async () => {
      (getContinueSuggestion as jest.Mock).mockResolvedValue({
        subjectId: SUBJECT_ID,
        subjectName: 'Mathematics',
        topicId: TOPIC_ID,
        topicTitle: 'Algebra Basics',
        lastSessionId: 'session-abc',
      });

      const res = await app.request(
        '/v1/progress/continue',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.suggestion.lastSessionId).toBe('session-abc');
    });

    it('[F-001] returns null lastSessionId when no resumable session matches the suggested topic', async () => {
      (getContinueSuggestion as jest.Mock).mockResolvedValue({
        subjectId: SUBJECT_ID,
        subjectName: 'Mathematics',
        topicId: TOPIC_ID,
        topicTitle: 'Algebra Basics',
        lastSessionId: null,
      });

      const res = await app.request(
        '/v1/progress/continue',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.suggestion.lastSessionId).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/progress/topic/:topicId/active-session [F-4]
  // -------------------------------------------------------------------------

  describe('GET /v1/progress/topic/:topicId/active-session', () => {
    it('returns 200 with sessionId when an active session exists', async () => {
      (getActiveSessionForTopic as jest.Mock).mockResolvedValue({
        sessionId: 'active-session-xyz',
      });

      const res = await app.request(
        `/v1/progress/topic/${TOPIC_ID}/active-session`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.sessionId).toBe('active-session-xyz');
    });

    it('returns 200 with null when no active session exists', async () => {
      (getActiveSessionForTopic as jest.Mock).mockResolvedValue(null);

      const res = await app.request(
        `/v1/progress/topic/${TOPIC_ID}/active-session`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toBeNull();
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/progress/topic/${TOPIC_ID}/active-session`,
        {},
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/topics/:topicId/resolve [F-009]
  // -------------------------------------------------------------------------

  describe('GET /v1/topics/:topicId/resolve', () => {
    it('[F-009] returns 200 with subjectId when topic exists and belongs to profile', async () => {
      (resolveTopicSubject as jest.Mock).mockResolvedValue({
        subjectId: SUBJECT_ID,
        subjectName: 'Mathematics',
        topicTitle: 'Algebra Basics',
      });

      const res = await app.request(
        `/v1/topics/${TOPIC_ID}/resolve`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.subjectId).toBe(SUBJECT_ID);
      expect(body.subjectName).toBe('Mathematics');
      expect(body.topicTitle).toBe('Algebra Basics');
    });

    it('[F-009] returns 404 when topic not found or belongs to another profile', async () => {
      (resolveTopicSubject as jest.Mock).mockResolvedValue(null);

      const res = await app.request(
        `/v1/topics/${TOPIC_ID}/resolve`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(404);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/topics/${TOPIC_ID}/resolve`,
        {},
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });
});
