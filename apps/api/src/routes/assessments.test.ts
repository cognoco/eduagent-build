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
      createAssessmentIfNoneActive: jest.fn(),
      getAssessment: jest.fn(),
      updateAssessment: jest.fn(),
      evaluateAssessmentAnswer: jest.fn(),
      loadAssessmentTopicContext: jest.fn(),
      buildNeedsReviewEvaluation: jest.fn(),
      recordAssessmentCompletionActivity: jest.fn(),
      evaluateQuickCheckAnswer: jest.fn(),
      shouldEndAssessmentForReview: jest.fn().mockReturnValue(false),
      resolveAssessmentStatus: jest.fn().mockReturnValue('in_progress'),
      // [WI-136 H4] Lock function — default returns the row that
      // getAssessment would return (in-progress snapshot). Tests that need
      // a terminal-status race override this with mockRejectedValueOnce.
      lockAssessmentForAnswerSubmission: jest.fn(),
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

jest.mock(
  '../services/billing' /* gc1-allow: safeRefundQuota is an external boundary (billing pool) — cannot run against a real quota pool in route unit tests */,
  () => {
    const actual = jest.requireActual(
      '../services/billing',
    ) as typeof import('../services/billing');
    return {
      ...actual,
      safeRefundQuota: jest.fn().mockResolvedValue({ refunded: true }),
      // [BUG-821] The route now calls refundQuotaOrEscalate (the gate that
      // escalates a decrement-without-subscriptionId instead of silently
      // dropping the refund). Mock it as the boundary the route actually calls.
      refundQuotaOrEscalate: jest.fn().mockResolvedValue({ refunded: true }),
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
  createAssessmentIfNoneActive,
  getAssessment,
  updateAssessment,
  evaluateAssessmentAnswer,
  loadAssessmentTopicContext,
  evaluateQuickCheckAnswer,
  shouldEndAssessmentForReview,
  resolveAssessmentStatus,
  lockAssessmentForAnswerSubmission,
} from '../services/assessments';
import { getSession } from '../services/session';
import { updateRetentionFromSession } from '../services/retention-data';
import { insertSessionXpEntry } from '../services/xp';
import { refundQuotaOrEscalate } from '../services/billing';
import { assessmentRoutes } from './assessments';
import { ERROR_CODES } from '@eduagent/schemas';
import { TEST_PROFILE_ID, TEST_SESSION_ID } from '@eduagent/test-utils';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const PROFILE_ID = TEST_PROFILE_ID;
const SUBJECT_ID = 'a0000000-0000-4000-a000-000000000010';
const TOPIC_ID = 'a0000000-0000-4000-a000-000000000020';
const ASSESSMENT_ID = 'a0000000-0000-4000-a000-000000000030';
const SESSION_ID = TEST_SESSION_ID;

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
      resolvedVia: isOwner ? 'explicit-header' : 'auto',
    });
    await next();
  });
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return err.getResponse();
    }
    // [WI-136 H4] Mirror the production handler in apps/api/src/index.ts:
    // ConflictError -> 409, NotFoundError -> 404. Without this mapping the
    // route's transactional terminal-state guard collapses to 500 in tests.
    // Use constructor-name matching to avoid TS narrowing 'err' to 'never'
    // after the HTTPException branch (dynamic instanceof checks on cast
    // constructors confuse the narrowing flow — each branch refines the
    // type until nothing is left).
    const errName = (err as Error).constructor?.name;
    const errMessage = (err as Error).message ?? 'Unknown error';
    if (errName === 'ConflictError') {
      return c.json({ code: 'CONFLICT', message: errMessage }, 409);
    }
    if (errName === 'NotFoundError') {
      return c.json({ code: 'NOT_FOUND', message: errMessage }, 404);
    }
    return c.json({ code: 'INTERNAL_ERROR', message: errMessage }, 500);
  });
  app.route('/v1', assessmentRoutes);
  return app;
}

// makeMeteredApp injects quota context variables the same way the metering
// middleware does so we can test the app-help early-return quota-refund path.
const SUBSCRIPTION_ID = 'sub-00000000-0000-4000-a000-000000000001';

function makeMeteredApp(opts?: {
  subscriptionId?: string | undefined;
  omitSubscriptionId?: boolean;
  isOwner?: boolean;
  identityV2?: boolean;
}) {
  const app = new Hono<
    TestEnv & {
      Variables: {
        subscriptionId: string | undefined;
        quotaDecrementSource: 'monthly' | 'top_up' | undefined;
        quotaDecrementTopUpCreditId: string | undefined;
        quotaDecrementQuotaModel: 'per-profile' | 'shared-pool' | undefined;
        quotaRefunded: boolean | undefined;
        quotaIdentityV2: boolean | undefined;
      };
    }
  >();
  const profileId = PROFILE_ID;
  const isOwner = opts?.isOwner ?? true;
  const subscriptionId = opts?.omitSubscriptionId
    ? undefined
    : (opts?.subscriptionId ?? SUBSCRIPTION_ID);

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
      resolvedVia: isOwner ? 'explicit-header' : 'auto',
    });
    // Inject quota context as the metering middleware would set it.
    c.set('subscriptionId', subscriptionId);
    c.set('quotaDecrementSource', 'monthly');
    c.set('quotaDecrementTopUpCreditId', undefined);
    c.set('quotaDecrementQuotaModel', 'shared-pool');
    c.set('quotaRefunded', undefined);
    // [WI-776 / WP-7] The cutover flag the metering decrement ran under.
    c.set('quotaIdentityV2', opts?.identityV2 ?? false);
    await next();
  });
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    return c.json({ code: 'INTERNAL_ERROR', message: String(err) }, 500);
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
const createAssessmentIfNoneActiveMock = jest.mocked(
  createAssessmentIfNoneActive,
);
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
const lockAssessmentForAnswerSubmissionMock = jest.mocked(
  lockAssessmentForAnswerSubmission,
);
const updateRetentionFromSessionMock = jest.mocked(updateRetentionFromSession);
const insertSessionXpEntryMock = jest.mocked(insertSessionXpEntry);
const refundQuotaOrEscalateMock = jest.mocked(refundQuotaOrEscalate);

beforeEach(() => {
  jest.clearAllMocks();
  // [WI-136 H4] Default: the lock returns whatever the test set up
  // getAssessmentMock to resolve to (the pre-fetch snapshot). Tests that
  // need to simulate a terminal-state race override via
  // lockAssessmentForAnswerSubmissionMock.mockRejectedValueOnce.
  lockAssessmentForAnswerSubmissionMock.mockImplementation(
    async (_db: Database, _profileId: string, _assessmentId: string) => {
      const snapshot = await getAssessmentMock(
        _db as never,
        _profileId,
        _assessmentId,
      );
      if (!snapshot) {
        throw new Error(
          'lockAssessmentForAnswerSubmission mock: getAssessmentMock returned null',
        );
      }
      return snapshot;
    },
  );
});

// ---------------------------------------------------------------------------
// POST /v1/subjects/:subjectId/topics/:topicId/assessments
// ---------------------------------------------------------------------------

describe('POST /v1/subjects/:subjectId/topics/:topicId/assessments', () => {
  const path = `/v1/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/assessments`;

  it('returns 201 with the assessment the race-safe get-or-create returns', async () => {
    // Get-or-create is now serialized inside the service
    // (createAssessmentIfNoneActive); the route only delegates. The
    // race semantics (exactly one in_progress row under concurrency) are
    // covered by the integration test + service unit tests.
    createAssessmentIfNoneActiveMock.mockResolvedValue(makeAssessmentRecord());

    const res = await makeApp().request(path, { method: 'POST' });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ assessment: { id: ASSESSMENT_ID } });
    expect(createAssessmentIfNoneActiveMock).toHaveBeenCalledWith(
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
    expect(createAssessmentIfNoneActiveMock).not.toHaveBeenCalled();
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
        resolvedVia: 'explicit-header',
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

  // [WI-136 H4] Concurrent-submission race: two near-simultaneous POSTs.
  // Caller A locks first, calls the LLM, commits terminal status. Caller B
  // blocks at SELECT ... FOR UPDATE, unblocks after A commits, observes
  // terminal status, throws ConflictError -> 409. The LLM is called exactly
  // once across the two requests.
  it('[WI-136 H4] concurrent answer submissions: exactly one LLM call, loser gets 409', async () => {
    // Both requests see the in-progress snapshot from the non-transactional
    // pre-fetch (getAssessment). The lock then serializes them.
    getAssessmentMock.mockResolvedValue(
      makeAssessmentRecord({ status: 'in_progress' }),
    );
    loadAssessmentTopicContextMock.mockResolvedValue(makeTopicContext());
    shouldEndAssessmentForReviewMock.mockReturnValue(false);
    evaluateAssessmentAnswerMock.mockResolvedValue(
      makeEvaluation({ passed: true }),
    );
    resolveAssessmentStatusMock.mockReturnValue('passed');
    updateAssessmentMock.mockResolvedValue(
      makeAssessmentRecord({ status: 'passed' }),
    );

    const { ConflictError } = jest.requireActual('@eduagent/schemas') as {
      ConflictError: new (message: string) => Error;
    };

    // Override the lock to simulate the race: first call locks the row in
    // an in-progress state (race winner); second call sees terminal status
    // post-commit and throws.
    lockAssessmentForAnswerSubmissionMock
      .mockResolvedValueOnce(makeAssessmentRecord({ status: 'in_progress' }))
      .mockRejectedValueOnce(
        new ConflictError(
          "Assessment is already in terminal state 'passed'; cannot submit further answers.",
        ),
      );

    // Fire both in sequence to make the assertion deterministic. The lock
    // mock returning in-order is the same serialization the real
    // SELECT ... FOR UPDATE provides at the DB level.
    const winner = await makeApp().request(path, validAnswerBody());
    const loser = await makeApp().request(path, validAnswerBody());

    expect(winner.status).toBe(200);
    expect(loser.status).toBe(409);

    // The LLM (evaluateAssessmentAnswer) is invoked exactly once across both
    // requests — the loser short-circuits before its LLM call inside the tx.
    expect(evaluateAssessmentAnswerMock).toHaveBeenCalledTimes(1);
    // Likewise only one UPDATE commits.
    expect(updateAssessmentMock).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // [CR #8] Terminal assessment: retention + XP must be applied atomically
  // with the status UPDATE. Previously these ran in a separate post-tx
  // transaction with no retry and no escalation, so a failure left the
  // assessment permanently `passed` while SM-2/retention + XP were silently
  // skipped (and the FOR UPDATE terminal-state guard blocked resubmission).
  // The fix folds them into the same transaction as the status UPDATE.
  // -------------------------------------------------------------------------
  describe('[CR #8] terminal assessment retention + XP atomicity', () => {
    function setupPassingAnswer() {
      getAssessmentMock.mockResolvedValue(
        makeAssessmentRecord({ status: 'in_progress' }),
      );
      loadAssessmentTopicContextMock.mockResolvedValue(makeTopicContext());
      shouldEndAssessmentForReviewMock.mockReturnValue(false);
      evaluateAssessmentAnswerMock.mockResolvedValue(
        makeEvaluation({ passed: true }),
      );
      resolveAssessmentStatusMock.mockReturnValue('passed');
      updateAssessmentMock.mockResolvedValue(
        makeAssessmentRecord({ status: 'passed' }),
      );
    }

    it('applies retention + XP on a passing assessment', async () => {
      setupPassingAnswer();

      const res = await makeApp().request(path, validAnswerBody());

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ status: 'passed' });

      // SM-2/retention is updated for the topic.
      expect(updateRetentionFromSessionMock).toHaveBeenCalledTimes(1);
      expect(updateRetentionFromSessionMock).toHaveBeenCalledWith(
        expect.anything(),
        PROFILE_ID,
        TOPIC_ID,
        expect.any(Number),
        expect.any(String),
      );
      // XP is granted for the passed topic/subject.
      expect(insertSessionXpEntryMock).toHaveBeenCalledTimes(1);
      expect(insertSessionXpEntryMock).toHaveBeenCalledWith(
        expect.anything(),
        PROFILE_ID,
        TOPIC_ID,
        SUBJECT_ID,
      );
    });

    it('runs retention + XP inside the SAME transaction as the status UPDATE', async () => {
      setupPassingAnswer();

      // Track whether the writes happened within a db.transaction() callback.
      let insideTransaction = false;
      const txCallOrder: string[] = [];
      const transactionMock = jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => unknown) => {
          insideTransaction = true;
          try {
            return await fn({});
          } finally {
            insideTransaction = false;
          }
        });
      updateRetentionFromSessionMock.mockImplementation(async () => {
        txCallOrder.push(`retention:${insideTransaction}`);
      });
      insertSessionXpEntryMock.mockImplementation(async () => {
        txCallOrder.push(`xp:${insideTransaction}`);
      });

      const app = new Hono<TestEnv>();
      app.use('*', async (c, next) => {
        c.set('db', { transaction: transactionMock } as unknown as Database);
        c.set('profileId', PROFILE_ID);
        c.set('profileMeta', {
          birthYear: 2000,
          location: 'EU',
          consentStatus: 'CONSENTED',
          hasPremiumLlm: false,
          conversationLanguage: 'en',
          isOwner: true,
          resolvedVia: 'explicit-header',
        });
        await next();
      });
      app.route('/v1', assessmentRoutes);

      const res = await app.request(path, validAnswerBody());

      expect(res.status).toBe(200);
      // Only ONE transaction is opened (status UPDATE + retention + XP share it).
      expect(transactionMock).toHaveBeenCalledTimes(1);
      // Both writes observed insideTransaction === true.
      expect(txCallOrder).toEqual(['retention:true', 'xp:true']);
    });

    it('does NOT silently succeed when the XP write fails — the failure propagates', async () => {
      setupPassingAnswer();
      // Simulate the post-terminal write failing. Because it is now inside the
      // status-UPDATE transaction, the failure rolls back the whole terminal
      // transition rather than leaving a passed-but-no-XP assessment.
      insertSessionXpEntryMock.mockRejectedValueOnce(
        new Error('xp insert failed'),
      );

      const res = await makeApp().request(path, validAnswerBody());

      // The request fails loudly (5xx) instead of returning 200/passed with
      // XP silently skipped. In production the surrounding tx rolls back the
      // status UPDATE so the learner can retry.
      expect(res.status).toBe(500);
    });
  });

  // [F-146] App-help early-return must refund quota, not charge the learner
  // for a canned response that made no LLM call.
  describe('[BREAK] app-help early-return quota refund', () => {
    // "explorer mode" triggers APP_HELP_SPECIFIC in app-help-map.ts and makes
    // buildAssessmentAppHelpEvaluation return a non-null canned evaluation.
    const APP_HELP_ANSWER = 'What is explorer mode?';

    it('[BREAK] calls safeRefundQuota when the answer hits the app-help path (no LLM called)', async () => {
      getAssessmentMock.mockResolvedValue(makeAssessmentRecord());

      const res = await makeMeteredApp().request(
        path,
        validAnswerBody(APP_HELP_ANSWER),
      );

      // Route returns 200 with the canned evaluation.
      expect(res.status).toBe(200);
      // LLM was NOT called.
      expect(evaluateAssessmentAnswerMock).not.toHaveBeenCalled();
      // Quota refund WAS called — the learner must not be charged for a
      // no-LLM response.
      expect(refundQuotaOrEscalateMock).toHaveBeenCalledTimes(1);
      expect(refundQuotaOrEscalateMock).toHaveBeenCalledWith(
        expect.anything(),
        SUBSCRIPTION_ID,
        expect.objectContaining({ route: 'assessments.answer.app_help' }),
      );
    });

    // [WI-776 / WP-7] P1 fix — flag-on positive coverage. Under
    // IDENTITY_V2_ENABLED the metering middleware decremented against the v2
    // store; the handler self-refund MUST thread identityV2:true so the
    // refund's ownership cross-check uses the SAME (v2) store. Without the
    // threading (revert: drop `identityV2: c.get('quotaIdentityV2')` from the
    // handler) this assertion goes red — the refund would default to the legacy
    // join and, post-DROP, return false → the learner is charged for a no-LLM
    // app-help turn.
    it('[WI-776] threads identityV2=true into the refund under flag-on', async () => {
      getAssessmentMock.mockResolvedValue(makeAssessmentRecord());
      refundQuotaOrEscalateMock.mockResolvedValueOnce({ refunded: true });

      const res = await makeMeteredApp({ identityV2: true }).request(
        path,
        validAnswerBody(APP_HELP_ANSWER),
      );

      expect(res.status).toBe(200);
      expect(evaluateAssessmentAnswerMock).not.toHaveBeenCalled();
      expect(refundQuotaOrEscalateMock).toHaveBeenCalledWith(
        expect.anything(),
        SUBSCRIPTION_ID,
        expect.objectContaining({
          route: 'assessments.answer.app_help',
          identityV2: true,
        }),
      );
    });

    // [WI-776 / WP-7] Silent-recovery ban — when the refund does NOT complete
    // (e.g. the v2 ownership join finds no row, or any non-success), the handler
    // must NOT claim it refunded. Marking quotaRefunded=true on a failed refund
    // would suppress the middleware's own refund and charge the user for a
    // no-LLM turn. Revert (set quotaRefunded unconditionally) → this goes red.
    it('[WI-776] does NOT mark quotaRefunded when the refund did not complete', async () => {
      getAssessmentMock.mockResolvedValue(makeAssessmentRecord());
      refundQuotaOrEscalateMock.mockResolvedValueOnce({ refunded: false });

      let capturedQuotaRefunded: boolean | undefined = 'sentinel' as never;
      const app = new Hono<
        TestEnv & {
          Variables: {
            subscriptionId: string | undefined;
            quotaDecrementSource: 'monthly' | 'top_up' | undefined;
            quotaDecrementTopUpCreditId: string | undefined;
            quotaDecrementQuotaModel: 'per-profile' | 'shared-pool' | undefined;
            quotaRefunded: boolean | undefined;
            quotaIdentityV2: boolean | undefined;
          };
        }
      >();
      app.use('*', async (c, next) => {
        c.set('db', makeStubDb() as unknown as Database);
        c.set('profileId', PROFILE_ID);
        c.set('profileMeta', {
          birthYear: 2000,
          location: 'EU',
          consentStatus: 'CONSENTED',
          hasPremiumLlm: false,
          conversationLanguage: 'en',
          isOwner: true,
          resolvedVia: 'explicit-header',
        });
        c.set('subscriptionId', SUBSCRIPTION_ID);
        c.set('quotaDecrementSource', 'monthly');
        c.set('quotaDecrementTopUpCreditId', undefined);
        c.set('quotaDecrementQuotaModel', 'shared-pool');
        c.set('quotaRefunded', undefined);
        c.set('quotaIdentityV2', true);
        await next();
        capturedQuotaRefunded = c.get('quotaRefunded');
      });
      app.onError((err, c) => {
        if (err instanceof HTTPException) return err.getResponse();
        return c.json({ code: 'INTERNAL_ERROR', message: String(err) }, 500);
      });
      app.route('/v1', assessmentRoutes);

      const res = await app.request(path, validAnswerBody(APP_HELP_ANSWER));

      expect(res.status).toBe(200);
      expect(refundQuotaOrEscalateMock).toHaveBeenCalledTimes(1);
      // The refund failed → quotaRefunded must remain unset so the failure is
      // visible (and the user is not falsely treated as refunded).
      expect(capturedQuotaRefunded).toBeUndefined();
    });

    it('[BREAK] does NOT call safeRefundQuota when the answer reaches the LLM path', async () => {
      getAssessmentMock.mockResolvedValue(makeAssessmentRecord());
      loadAssessmentTopicContextMock.mockResolvedValue(makeTopicContext());
      evaluateAssessmentAnswerMock.mockResolvedValue(
        makeEvaluation({ passed: true }),
      );
      resolveAssessmentStatusMock.mockReturnValue('in_progress');
      updateAssessmentMock.mockResolvedValue(makeAssessmentRecord());

      const res = await makeMeteredApp().request(
        path,
        validAnswerBody('Water is H2O'),
      );

      expect(res.status).toBe(200);
      expect(evaluateAssessmentAnswerMock).toHaveBeenCalled();
      // No refund — the LLM ran, the quota decrement was legitimate.
      expect(refundQuotaOrEscalateMock).not.toHaveBeenCalled();
    });

    it('[BUG-821] routes the refund through refundQuotaOrEscalate when subscriptionId is absent but a decrement happened', async () => {
      getAssessmentMock.mockResolvedValue(makeAssessmentRecord());

      // App that injects quotaDecrementSource (a decrement HAPPENED) but NOT a
      // subscriptionId — the exact BUG-821 condition. Previously the route's
      // bare `if (subscriptionId)` gate silently dropped the refund with no
      // Sentry/log/metric, charging the user for a no-LLM turn. The route now
      // delegates to refundQuotaOrEscalate so the gate can escalate the skip.
      const app = makeMeteredApp({ omitSubscriptionId: true });
      const res = await app.request(path, validAnswerBody(APP_HELP_ANSWER));

      expect(res.status).toBe(200);
      // The gate MUST be invoked (not silently bypassed), and it must receive
      // the missing subscriptionId alongside the decrement source so its
      // internal escalation (quota.refund.skipped_no_subscription) can fire.
      expect(refundQuotaOrEscalateMock).toHaveBeenCalledTimes(1);
      expect(refundQuotaOrEscalateMock).toHaveBeenCalledWith(
        expect.anything(),
        undefined,
        expect.objectContaining({
          route: 'assessments.answer.app_help',
          source: 'monthly',
        }),
      );
    });

    it('[F-146 / WI-701] sets quotaRefunded=true on the 200 early-return so the metering middleware can invalidate KV', async () => {
      getAssessmentMock.mockResolvedValue(makeAssessmentRecord());

      // Build a one-off app that wraps makeMeteredApp's middleware stack and
      // captures the post-handler quotaRefunded value via a spy middleware so
      // we can assert that the metering middleware's KV-invalidation branch
      // (added in WI-701) will see quotaRefunded=true on a 200 app-help response.
      let capturedQuotaRefunded: boolean | undefined = undefined;
      const innerApp = new Hono<
        TestEnv & {
          Variables: {
            subscriptionId: string | undefined;
            quotaDecrementSource: 'monthly' | 'top_up' | undefined;
            quotaDecrementTopUpCreditId: string | undefined;
            quotaDecrementQuotaModel: 'per-profile' | 'shared-pool' | undefined;
            quotaRefunded: boolean | undefined;
          };
        }
      >();
      innerApp.use('*', async (c, next) => {
        c.set('db', makeStubDb() as unknown as Database);
        c.set('profileId', PROFILE_ID);
        c.set('profileMeta', {
          birthYear: 2000,
          location: 'EU',
          consentStatus: 'CONSENTED',
          hasPremiumLlm: false,
          conversationLanguage: 'en',
          isOwner: true,
          resolvedVia: 'explicit-header',
        });
        c.set('subscriptionId', SUBSCRIPTION_ID);
        c.set('quotaDecrementSource', 'monthly');
        c.set('quotaDecrementTopUpCreditId', undefined);
        c.set('quotaDecrementQuotaModel', 'shared-pool');
        c.set('quotaRefunded', undefined);
        await next();
        // Capture the flag after the handler runs — this is what the metering
        // middleware reads in its post-200 KV-update block.
        capturedQuotaRefunded = c.get('quotaRefunded');
      });
      innerApp.onError((err, c) => {
        if (err instanceof HTTPException) return err.getResponse();
        return c.json({ code: 'INTERNAL_ERROR', message: String(err) }, 500);
      });
      innerApp.route('/v1', assessmentRoutes);

      const res = await innerApp.request(
        path,
        validAnswerBody(APP_HELP_ANSWER),
      );

      expect(res.status).toBe(200);
      // The handler must set quotaRefunded=true so the middleware's post-200
      // safeWriteKV branch sees the flag and calls safeDeleteKV instead of
      // writing stale post-decrement counters (WI-701 P2 fix).
      expect(capturedQuotaRefunded).toBe(true);
    });
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

  it('[BUG-848] returns 200 when the assessment status is "failed" (terminal but was missing from allowlist)', async () => {
    getAssessmentMock.mockResolvedValue(
      makeAssessmentRecord({ status: 'failed' }),
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
      | 'failed'
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
