/**
 * Negative-path and boundary tests for the assessments routes.
 *
 * Strategy: mount a mini Hono app that pre-injects profile context via
 * middleware, bypassing the full auth stack. This isolates the route layer.
 *
 * Proxy-mode guard (assertNotProxyMode) is tested in proxy-guard.test.ts;
 * here we verify it fires via the `isOwner: false` path on write routes.
 *
 * Pattern: follows subjects-language-setup.test.ts.
 */

jest.mock(
  '../services/assessments' /* gc1-allow: unit-route isolation; real service covered by assessments.test.ts */,
  () => {
    const actual = jest.requireActual(
      '../services/assessments',
    ) as typeof import('../services/assessments');
    return {
      ...actual,
      getActiveAssessmentForTopic: jest.fn(),
      createAssessment: jest.fn(),
      getAssessment: jest.fn(),
      updateAssessment: jest.fn(),
      evaluateAssessmentAnswer: jest.fn(),
      loadAssessmentTopicContext: jest.fn(),
      buildNeedsReviewEvaluation: jest.fn(),
      recordAssessmentCompletionActivity: jest.fn(),
      evaluateQuickCheckAnswer: jest.fn(),
      shouldEndAssessmentForReview: jest.fn().mockReturnValue(false),
      resolveAssessmentStatus: jest.fn().mockReturnValue('in_progress'),
    };
  },
);

jest.mock(
  '../services/session' /* gc1-allow: unit-route isolation for assessments route */,
  () => {
    const actual = jest.requireActual(
      '../services/session',
    ) as typeof import('../services/session');
    return {
      ...actual,
      getSession: jest.fn(),
    };
  },
);

jest.mock(
  '../services/retention-data' /* gc1-allow: unit-route isolation for assessments route */,
  () => {
    const actual = jest.requireActual(
      '../services/retention-data',
    ) as typeof import('../services/retention-data');
    return {
      ...actual,
      updateRetentionFromSession: jest.fn().mockResolvedValue(undefined),
    };
  },
);

jest.mock(
  '../services/xp' /* gc1-allow: unit-route isolation for assessments route */,
  () => {
    const actual = jest.requireActual(
      '../services/xp',
    ) as typeof import('../services/xp');
    return {
      ...actual,
      insertSessionXpEntry: jest.fn().mockResolvedValue(undefined),
    };
  },
);

jest.mock(
  '../services/evaluate' /* gc1-allow: unit-route isolation for assessments route */,
  () => {
    const actual = jest.requireActual(
      '../services/evaluate',
    ) as typeof import('../services/evaluate');
    return {
      ...actual,
      mapEvaluateQualityToSm2: jest.fn().mockReturnValue(3),
    };
  },
);

jest.mock(
  '../services/sentry' /* gc1-allow: unit-route isolation for assessments route */,
  () => {
    const actual = jest.requireActual(
      '../services/sentry',
    ) as typeof import('../services/sentry');
    return {
      ...actual,
      captureException: jest.fn(),
    };
  },
);

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { ProfileMeta } from '../middleware/profile-scope';
import {
  getActiveAssessmentForTopic,
  createAssessment,
  getAssessment,
  updateAssessment,
  evaluateAssessmentAnswer,
  loadAssessmentTopicContext,
  evaluateQuickCheckAnswer,
  shouldEndAssessmentForReview,
  resolveAssessmentStatus,
} from '../services/assessments';
import { getSession } from '../services/session';
import { assessmentRoutes } from './assessments';
import { ERROR_CODES } from '@eduagent/schemas';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const PROFILE_ID = 'a0000000-0000-4000-a000-000000000001';
const SUBJECT_ID = 'a0000000-0000-4000-a000-000000000010';
const TOPIC_ID = 'a0000000-0000-4000-a000-000000000020';
const ASSESSMENT_ID = 'a0000000-0000-4000-a000-000000000030';
const SESSION_ID = 'a0000000-0000-4000-a000-000000000040';

// ---------------------------------------------------------------------------
// App factory — bypasses auth, injects profile context
// ---------------------------------------------------------------------------

type TestEnv = {
  Bindings: { DATABASE_URL: string };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
  };
};

function makeApp(opts?: { isOwner?: boolean; profileId?: string }) {
  const app = new Hono<TestEnv>();
  const profileId = opts?.profileId ?? PROFILE_ID;
  const isOwner = opts?.isOwner ?? true;

  app.use('*', async (c, next) => {
    c.set('db', makeStubDb() as unknown as Database);
    c.set('profileId', profileId);
    c.set('profileMeta', {
      birthYear: 2000,
      location: 'EU',
      consentStatus: 'CONSENTED',
      hasPremiumLlm: false,
      conversationLanguage: 'en',
      isOwner,
    });
    await next();
  });
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return err.getResponse();
    }
    return c.json({ code: 'INTERNAL_ERROR', message: err.message }, 500);
  });
  app.route('/v1', assessmentRoutes);
  return app;
}

function makeStubDb(): Partial<Database> {
  return {
    transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => unknown) => fn({})),
  };
}

const getActiveAssessmentForTopicMock = jest.mocked(
  getActiveAssessmentForTopic,
);
const createAssessmentMock = jest.mocked(createAssessment);
const getAssessmentMock = jest.mocked(getAssessment);
const updateAssessmentMock = jest.mocked(updateAssessment);
const evaluateAssessmentAnswerMock = jest.mocked(evaluateAssessmentAnswer);
const loadAssessmentTopicContextMock = jest.mocked(loadAssessmentTopicContext);
const evaluateQuickCheckAnswerMock = jest.mocked(evaluateQuickCheckAnswer);
const shouldEndAssessmentForReviewMock = jest.mocked(
  shouldEndAssessmentForReview,
);
const resolveAssessmentStatusMock = jest.mocked(resolveAssessmentStatus);
const getSessionMock = jest.mocked(getSession);

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// POST /v1/subjects/:subjectId/topics/:topicId/assessments
// ---------------------------------------------------------------------------

describe('POST /v1/subjects/:subjectId/topics/:topicId/assessments', () => {
  const path = `/v1/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/assessments`;

  it('returns 201 with the active assessment when one already exists', async () => {
    const existing = makeAssessmentRecord();
    getActiveAssessmentForTopicMock.mockResolvedValue(existing);

    const res = await makeApp().request(path, { method: 'POST' });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ assessment: { id: ASSESSMENT_ID } });
    expect(createAssessmentMock).not.toHaveBeenCalled();
  });

  it('creates a new assessment when none is active', async () => {
    getActiveAssessmentForTopicMock.mockResolvedValue(null);
    createAssessmentMock.mockResolvedValue(makeAssessmentRecord());

    const res = await makeApp().request(path, { method: 'POST' });

    expect(res.status).toBe(201);
    expect(createAssessmentMock).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
      SUBJECT_ID,
      TOPIC_ID,
    );
  });

  it('returns 403 when a child profile (non-owner) attempts to start an assessment (proxy-mode guard)', async () => {
    // assertNotProxyMode throws when isOwner === false
    const res = await makeApp({ isOwner: false }).request(path, {
      method: 'POST',
    });

    expect(res.status).toBe(403);
    expect(createAssessmentMock).not.toHaveBeenCalled();
  });

  it('returns 400 when profileId is absent (missing profile context)', async () => {
    const app = new Hono<TestEnv>();
    app.use('*', async (c, next) => {
      c.set('db', makeStubDb() as unknown as Database);
      c.set('profileId', undefined); // no profile resolved
      c.set('profileMeta', {
        birthYear: 2000,
        location: 'EU',
        consentStatus: 'CONSENTED',
        hasPremiumLlm: false,
        conversationLanguage: 'en',
        isOwner: true,
      });
      await next();
    });
    app.route('/v1', assessmentRoutes);

    const res = await app.request(path, { method: 'POST' });
    // requireProfileId throws HTTPException(400) when profileId is undefined
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/subjects/:subjectId/topics/:topicId/assessments/active
// ---------------------------------------------------------------------------

describe('GET /v1/subjects/:subjectId/topics/:topicId/assessments/active', () => {
  const path = `/v1/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/assessments/active`;

  it('returns 200 with the active assessment when found', async () => {
    getActiveAssessmentForTopicMock.mockResolvedValue(makeAssessmentRecord());

    const res = await makeApp().request(path);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ assessment: { id: ASSESSMENT_ID } });
  });

  it('returns 200 with null assessment when none is active', async () => {
    getActiveAssessmentForTopicMock.mockResolvedValue(null);

    const res = await makeApp().request(path);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ assessment: null });
  });
});

// ---------------------------------------------------------------------------
// GET /v1/assessments/:assessmentId
// ---------------------------------------------------------------------------

describe('GET /v1/assessments/:assessmentId', () => {
  it('returns 200 with the assessment when found', async () => {
    getAssessmentMock.mockResolvedValue(makeAssessmentRecord());

    const res = await makeApp().request(`/v1/assessments/${ASSESSMENT_ID}`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ assessment: { id: ASSESSMENT_ID } });
  });

  it('returns 404 when the assessment does not exist', async () => {
    getAssessmentMock.mockResolvedValue(null);

    const res = await makeApp().request(`/v1/assessments/${ASSESSMENT_ID}`);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ code: ERROR_CODES.NOT_FOUND });
  });

  it('returns 404 when a different profile tries to access the assessment (ownership via scoped repo)', async () => {
    // getAssessment uses createScopedRepository(db, profileId) — wrong profile returns null
    getAssessmentMock.mockResolvedValue(null);

    const res = await makeApp({ profileId: 'other-profile-id' }).request(
      `/v1/assessments/${ASSESSMENT_ID}`,
    );

    expect(res.status).toBe(404);
    expect(getAssessmentMock).toHaveBeenCalledWith(
      expect.anything(),
      'other-profile-id',
      ASSESSMENT_ID,
    );
  });
});

// ---------------------------------------------------------------------------
// POST /v1/assessments/:assessmentId/answer
// ---------------------------------------------------------------------------

describe('POST /v1/assessments/:assessmentId/answer', () => {
  const path = `/v1/assessments/${ASSESSMENT_ID}/answer`;

  function validAnswerBody(answer = 'Water is H2O') {
    return {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer }),
    };
  }

  it('returns 200 with evaluation for a valid answer', async () => {
    getAssessmentMock.mockResolvedValue(makeAssessmentRecord());
    loadAssessmentTopicContextMock.mockResolvedValue(makeTopicContext());
    shouldEndAssessmentForReviewMock.mockReturnValue(false);
    evaluateAssessmentAnswerMock.mockResolvedValue(
      makeEvaluation({ passed: true }),
    );
    resolveAssessmentStatusMock.mockReturnValue('in_progress');
    updateAssessmentMock.mockResolvedValue(
      makeAssessmentRecord({ status: 'in_progress' }),
    );

    const res = await makeApp().request(path, validAnswerBody());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ evaluation: { passed: true } });
  });

  it('returns 404 when the assessment is not found', async () => {
    getAssessmentMock.mockResolvedValue(null);

    const res = await makeApp().request(path, validAnswerBody());

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ code: ERROR_CODES.NOT_FOUND });
  });

  it('returns 400 when the answer field is missing', async () => {
    const res = await makeApp().request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    expect(getAssessmentMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the answer field is not a string', async () => {
    const res = await makeApp().request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: 42 }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 403 for a non-owner profile (proxy-mode guard)', async () => {
    const res = await makeApp({ isOwner: false }).request(
      path,
      validAnswerBody(),
    );

    expect(res.status).toBe(403);
    expect(getAssessmentMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PATCH /v1/assessments/:assessmentId/decline-refresh
// ---------------------------------------------------------------------------

describe('PATCH /v1/assessments/:assessmentId/decline-refresh', () => {
  const path = `/v1/assessments/${ASSESSMENT_ID}/decline-refresh`;

  it('returns 200 when the assessment is in a terminal state', async () => {
    getAssessmentMock.mockResolvedValue(
      makeAssessmentRecord({ status: 'passed' }),
    );

    const res = await makeApp().request(path, { method: 'PATCH' });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true });
  });

  it('returns 400 when the assessment is still in progress', async () => {
    getAssessmentMock.mockResolvedValue(
      makeAssessmentRecord({ status: 'in_progress' }),
    );

    const res = await makeApp().request(path, { method: 'PATCH' });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('returns 404 when the assessment is not found', async () => {
    getAssessmentMock.mockResolvedValue(null);

    const res = await makeApp().request(path, { method: 'PATCH' });

    expect(res.status).toBe(404);
  });

  it('returns 403 for a non-owner profile (proxy-mode guard)', async () => {
    const res = await makeApp({ isOwner: false }).request(path, {
      method: 'PATCH',
    });

    expect(res.status).toBe(403);
    expect(getAssessmentMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /v1/sessions/:sessionId/quick-check
// ---------------------------------------------------------------------------

describe('POST /v1/sessions/:sessionId/quick-check', () => {
  const path = `/v1/sessions/${SESSION_ID}/quick-check`;

  function validQuickCheckBody(answer = 'The answer is 42') {
    return {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer }),
    };
  }

  it('returns 200 with feedback when session exists', async () => {
    getSessionMock.mockResolvedValue(makeSessionRecord());
    loadAssessmentTopicContextMock.mockResolvedValue(makeTopicContext());
    evaluateQuickCheckAnswerMock.mockResolvedValue({
      feedback: 'Good work!',
      passed: true,
      shouldEscalateDepth: false,
      masteryScore: 0.8,
      qualityRating: 4,
      nextDepth: undefined,
      weakAreas: [],
    });

    const res = await makeApp().request(path, validQuickCheckBody());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ feedback: 'Good work!', isCorrect: true });
  });

  it('returns 404 when the session does not exist', async () => {
    getSessionMock.mockResolvedValue(null);

    const res = await makeApp().request(path, validQuickCheckBody());

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ code: ERROR_CODES.NOT_FOUND });
  });

  it('returns 400 when the answer field is missing', async () => {
    const res = await makeApp().request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it('returns 404 when a different profile tries to access the session', async () => {
    // getSession uses scoped access — returns null for wrong profile
    getSessionMock.mockResolvedValue(null);

    const res = await makeApp({ profileId: 'other-profile-id' }).request(
      path,
      validQuickCheckBody(),
    );

    expect(res.status).toBe(404);
    expect(getSessionMock).toHaveBeenCalledWith(
      expect.anything(),
      'other-profile-id',
      SESSION_ID,
    );
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAssessmentRecord(
  overrides: Partial<{
    status: string;
    topicId: string;
    subjectId: string;
  }> = {},
) {
  return {
    id: ASSESSMENT_ID,
    profileId: PROFILE_ID,
    topicId: overrides.topicId ?? TOPIC_ID,
    subjectId: overrides.subjectId ?? SUBJECT_ID,
    sessionId: null,
    verificationDepth: 'recall' as const,
    status: (overrides.status ?? 'in_progress') as
      | 'in_progress'
      | 'passed'
      | 'failed_exhausted'
      | 'borderline',
    masteryScore: 0,
    qualityRating: null,
    exchangeHistory: [] as Array<{
      role: 'user' | 'assistant';
      content: string;
    }>,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeSessionRecord() {
  return {
    id: SESSION_ID,
    subjectId: SUBJECT_ID,
    topicId: TOPIC_ID,
    sessionType: 'learning' as const,
    status: 'active' as const,
    escalationRung: 1 as const,
    exchangeCount: 2,
    startedAt: '2026-01-01T00:00:00.000Z',
    lastActivityAt: '2026-01-01T00:00:00.000Z',
    endedAt: null,
    durationSeconds: null,
    inputMode: 'text' as const,
    verificationType: null as 'standard' | 'evaluate' | 'teach_back' | null,
    wallClockSeconds: null,
    filedAt: null,
    filingStatus: null,
    filingRetryCount: 0,
  };
}

function makeTopicContext() {
  return {
    topicTitle: 'Water Chemistry',
    topicDescription: 'Molecular structure of water',
    subjectName: 'Chemistry',
    pedagogyMode: undefined as 'socratic' | 'four_strands' | undefined,
    languageCode: null as string | null,
  };
}

function makeEvaluation(overrides: Partial<{ passed: boolean }> = {}) {
  return {
    feedback: 'Good work!',
    passed: overrides.passed ?? true,
    shouldEscalateDepth: false,
    masteryScore: 0.8,
    qualityRating: 4,
    weakAreas: [] as string[],
  };
}
