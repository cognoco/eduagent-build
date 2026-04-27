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
// Mock database module — middleware creates a stub db per request
// ---------------------------------------------------------------------------

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock();

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

// ---------------------------------------------------------------------------
// Mock account service — no DB interaction
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

// ---------------------------------------------------------------------------
// Mock profile service — middleware auto-resolves owner profile
// ---------------------------------------------------------------------------

jest.mock('../services/profile', () => ({
  getProfile: jest.fn().mockResolvedValue({
    id: 'test-profile-id',
    birthYear: null,
    location: null,
    consentStatus: 'CONSENTED',
  }),
  findOwnerProfile: jest.fn().mockResolvedValue({
    id: 'test-profile-id',
    birthYear: null,
    location: null,
    consentStatus: 'CONSENTED',
  }),
  getProfileDisplayName: jest.fn().mockResolvedValue('Test User'),
}));

// ---------------------------------------------------------------------------
// Mock billing service — metering middleware needs these for quota checks
// ---------------------------------------------------------------------------

const mockSubscription = {
  id: 'sub-1',
  accountId: 'test-account-id',
  tier: 'free',
  status: 'active',
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  trialEndsAt: null,
  currentPeriodEnd: null,
  currentPeriodStart: null,
  cancelledAt: null,
  lastStripeEventTimestamp: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

jest.mock('../services/billing', () => ({
  getSubscriptionByAccountId: jest.fn().mockResolvedValue(mockSubscription),
  ensureFreeSubscription: jest.fn().mockResolvedValue(mockSubscription),
  getQuotaPool: jest.fn().mockResolvedValue({
    id: 'qp-1',
    subscriptionId: 'sub-1',
    monthlyLimit: 100,
    usedThisMonth: 0,
    dailyLimit: 10,
    usedToday: 0,
    cycleResetAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
  decrementQuota: jest.fn().mockResolvedValue({
    success: true,
    source: 'monthly',
    remainingMonthly: 99,
    remainingTopUp: 0,
    remainingDaily: 9,
  }),
  getTopUpCreditsRemaining: jest.fn().mockResolvedValue(0),
  createSubscription: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Mock subject service
// ---------------------------------------------------------------------------

const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

jest.mock('../services/subject', () => ({
  listSubjects: jest.fn().mockResolvedValue([]),
  createSubject: jest.fn(),
  getSubject: jest.fn().mockResolvedValue({
    id: SUBJECT_ID,
    profileId: 'test-profile-id',
    name: 'Mathematics',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
  updateSubject: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Mock interview service
// ---------------------------------------------------------------------------

jest.mock('../services/interview', () => ({
  getBookTitle: jest.fn().mockResolvedValue(undefined), // ownership-checked lookup
  processInterviewExchange: jest.fn().mockResolvedValue({
    response: 'Tell me about your experience.',
    isComplete: false,
  }),
  streamInterviewExchange: jest.fn().mockResolvedValue({
    stream: (async function* () {
      yield 'Tell me ';
      yield 'about your ';
      yield 'experience.';
    })(),
    onComplete: jest.fn().mockResolvedValue({
      response: 'Tell me about your experience.',
      isComplete: false,
    }),
  }),
  extractSignals: jest.fn().mockResolvedValue({
    goals: ['learn calculus'],
    experienceLevel: 'beginner',
    currentKnowledge: 'basic algebra',
  }),
  getOrCreateDraft: jest.fn().mockResolvedValue({
    id: 'draft-1',
    profileId: 'test-profile-id',
    subjectId: SUBJECT_ID,
    exchangeHistory: [],
    extractedSignals: {},
    status: 'in_progress',
    expiresAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
  getDraftState: jest.fn().mockResolvedValue(null),
  updateDraft: jest.fn().mockResolvedValue(undefined),
  persistCurriculum: jest.fn().mockResolvedValue(undefined),
  buildDraftResumeSummary: jest.fn().mockReturnValue('Resume summary'),
}));

import { app } from '../index';
import { getSubject } from '../services/subject';
import {
  processInterviewExchange,
  streamInterviewExchange,
  extractSignals,
  getOrCreateDraft,
  getDraftState,
  updateDraft,
  persistCurriculum,
} from '../services/interview';

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
  CLERK_AUDIENCE: 'test-audience',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
  'X-Profile-Id': 'test-profile-id',
};

describe('interview routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset default mocks after clearAllMocks
    (getSubject as jest.Mock).mockResolvedValue({
      id: SUBJECT_ID,
      profileId: 'test-profile-id',
      name: 'Mathematics',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    (processInterviewExchange as jest.Mock).mockResolvedValue({
      response: 'Tell me about your experience.',
      isComplete: false,
    });

    (streamInterviewExchange as jest.Mock).mockResolvedValue({
      stream: (async function* () {
        yield 'Tell me ';
        yield 'about your ';
        yield 'experience.';
      })(),
      onComplete: jest.fn().mockResolvedValue({
        response: 'Tell me about your experience.',
        isComplete: false,
      }),
    });

    (getOrCreateDraft as jest.Mock).mockResolvedValue({
      id: 'draft-1',
      profileId: 'test-profile-id',
      subjectId: SUBJECT_ID,
      exchangeHistory: [],
      extractedSignals: {},
      status: 'in_progress',
      expiresAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    (getDraftState as jest.Mock).mockResolvedValue(null);
    (updateDraft as jest.Mock).mockResolvedValue(undefined);
    (persistCurriculum as jest.Mock).mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // POST /v1/subjects/:subjectId/interview
  // -------------------------------------------------------------------------

  describe('POST /v1/subjects/:subjectId/interview', () => {
    it('returns 200 with response, isComplete, and exchangeCount', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'I want to learn calculus' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.response).toBe('Tell me about your experience.');
      expect(body.isComplete).toBe(false);
      expect(body.exchangeCount).toBe(1);
    });

    it('calls getSubject to verify subject exists', async () => {
      await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'Hello' }),
        },
        TEST_ENV
      );

      expect(getSubject).toHaveBeenCalled();
    });

    it('calls getOrCreateDraft and processInterviewExchange', async () => {
      await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'I want to learn calculus' }),
        },
        TEST_ENV
      );

      expect(getOrCreateDraft).toHaveBeenCalled();
      expect(processInterviewExchange).toHaveBeenCalledWith(
        expect.objectContaining({
          subjectName: 'Mathematics',
          exchangeHistory: [],
        }),
        'I want to learn calculus',
        expect.objectContaining({
          exchangeCount: 1,
          profileId: expect.any(String),
          learnerName: 'Test User',
        })
      );
    });

    it('calls updateDraft with new exchange history', async () => {
      await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'I want to learn calculus' }),
        },
        TEST_ENV
      );

      expect(updateDraft).toHaveBeenCalledWith(
        undefined,
        'test-profile-id',
        'draft-1',
        expect.objectContaining({
          exchangeHistory: expect.arrayContaining([
            { role: 'user', content: 'I want to learn calculus' },
            { role: 'assistant', content: 'Tell me about your experience.' },
          ]),
        })
      );
    });

    it('calls persistCurriculum when interview is complete', async () => {
      (processInterviewExchange as jest.Mock).mockResolvedValue({
        response: 'Great, I have enough information!',
        isComplete: true,
        extractedSignals: {
          goals: ['learn calculus'],
          experienceLevel: 'beginner',
          currentKnowledge: 'basic algebra',
        },
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'I know basic algebra' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.isComplete).toBe(true);

      expect(updateDraft).toHaveBeenNthCalledWith(
        1,
        undefined,
        'test-profile-id',
        'draft-1',
        expect.not.objectContaining({
          status: 'completed',
        })
      );
      expect(updateDraft).toHaveBeenNthCalledWith(
        2,
        undefined,
        'test-profile-id',
        'draft-1',
        expect.objectContaining({
          status: 'completed',
        })
      );
      expect(persistCurriculum).toHaveBeenCalled();
    });

    it('does not call persistCurriculum when interview is not complete', async () => {
      await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'Hello' }),
        },
        TEST_ENV
      );

      expect(persistCurriculum).not.toHaveBeenCalled();
    });

    it('returns 404 when subject not found', async () => {
      (getSubject as jest.Mock).mockResolvedValue(null);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'Hello' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(404);
    });

    it('returns 400 with empty message', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: '' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview`,
        {
          method: 'POST',
          body: JSON.stringify({ message: 'Hello' }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/subjects/:subjectId/interview/stream (SSE)
  // -------------------------------------------------------------------------

  describe('POST /v1/subjects/:subjectId/interview/stream', () => {
    it('returns SSE response with chunk and done events', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'I want to learn calculus' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      const body = await res.text();
      expect(body).toContain('"type":"chunk"');
      expect(body).toContain('"type":"done"');
    });

    it('calls streamInterviewExchange instead of processInterviewExchange', async () => {
      await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'Hello' }),
        },
        TEST_ENV
      );

      expect(streamInterviewExchange).toHaveBeenCalledWith(
        expect.objectContaining({
          subjectName: 'Mathematics',
          exchangeHistory: [],
        }),
        'Hello',
        expect.objectContaining({
          exchangeCount: 1,
          profileId: expect.any(String),
          learnerName: 'Test User',
        })
      );
      // The non-streaming variant should not be called
      expect(processInterviewExchange).not.toHaveBeenCalled();
    });

    it('calls updateDraft with exchange history after streaming', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'I want to learn calculus' }),
        },
        TEST_ENV
      );

      // Consume the full SSE stream so all side effects complete
      await res.text();

      expect(updateDraft).toHaveBeenCalledWith(
        undefined,
        'test-profile-id',
        'draft-1',
        expect.objectContaining({
          exchangeHistory: expect.arrayContaining([
            { role: 'user', content: 'I want to learn calculus' },
            {
              role: 'assistant',
              content: 'Tell me about your experience.',
            },
          ]),
        })
      );
    });

    it('returns 404 when subject not found', async () => {
      (getSubject as jest.Mock).mockResolvedValue(null);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'Hello' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(404);
    });

    it('returns 400 with empty message', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: '' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('emits a structured fallback frame when the LLM produces an empty reply [BUG-555]', async () => {
      // Repro: BUG-555 user-visible symptom was "That reply took too long"
      // appearing repeatedly during the interview because the LLM occasionally
      // returned empty/malformed envelopes that the mobile client treated as
      // a stream timeout. After the stream-fallback guard (commit 855a632f)
      // the route MUST emit a typed `fallback` SSE frame with a usable
      // fallbackText so the mobile bubble shows recovery copy + Try Again,
      // not an opaque timeout footer. This test pins that contract.
      (streamInterviewExchange as jest.Mock).mockResolvedValue({
        // Empty stream — no chunks ever arrive, mimicking an LLM that emits
        // a malformed envelope.
        stream: (async function* () {
          // intentionally yields nothing
        })(),
        onComplete: jest.fn().mockResolvedValue({
          response: '',
          isComplete: false,
          fallback: {
            reason: 'empty_reply',
            fallbackText: "I didn't have a reply — tap Try Again.",
          },
        }),
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'Anything' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.text();
      // The route must emit a typed `fallback` frame (not a generic error /
      // timeout). The frame carries the user-facing copy + reason classifier.
      expect(body).toContain('"type":"fallback"');
      expect(body).toContain('"reason":"empty_reply"');
      expect(body).toContain('Try Again');
      // Followed by a non-completing `done` frame so the mobile finalizer
      // settles isStreaming and renders the fallback bubble.
      expect(body).toContain('"type":"done"');
      expect(body).toContain('"isComplete":false');
      // CRITICAL: the route must NOT mark the draft completed on a fallback.
      expect(persistCurriculum).not.toHaveBeenCalled();
    });

    it('calls persistCurriculum when interview completes during stream', async () => {
      (streamInterviewExchange as jest.Mock).mockResolvedValue({
        stream: (async function* () {
          yield 'All done!';
        })(),
        onComplete: jest.fn().mockResolvedValue({
          response: 'All done!',
          isComplete: true,
          extractedSignals: {
            goals: ['learn calculus'],
            experienceLevel: 'beginner',
            currentKnowledge: 'algebra',
          },
        }),
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'I know algebra' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.text();
      expect(body).toContain('"isComplete":true');

      expect(updateDraft).toHaveBeenCalledWith(
        undefined,
        'test-profile-id',
        'draft-1',
        expect.objectContaining({ status: 'completed' })
      );
      expect(persistCurriculum).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/subjects/:subjectId/interview
  // -------------------------------------------------------------------------

  describe('GET /v1/subjects/:subjectId/interview', () => {
    it('returns 200 with state: null when no draft exists', async () => {
      (getDraftState as jest.Mock).mockResolvedValue(null);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.state).toBeNull();
    });

    it('returns 200 with state object when draft exists', async () => {
      (getDraftState as jest.Mock).mockResolvedValue({
        id: 'draft-1',
        profileId: 'test-profile-id',
        subjectId: SUBJECT_ID,
        exchangeHistory: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
        extractedSignals: {},
        status: 'in_progress',
        expiresAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.state).toBeDefined();
      expect(body.state.draftId).toBe('draft-1');
      expect(body.state.status).toBe('in_progress');
      expect(body.state.exchangeCount).toBe(1);
      expect(body.state.subjectName).toBe('Mathematics');
    });

    it('calls getDraftState and getSubject', async () => {
      (getDraftState as jest.Mock).mockResolvedValue({
        id: 'draft-1',
        profileId: 'test-profile-id',
        subjectId: SUBJECT_ID,
        exchangeHistory: [],
        extractedSignals: {},
        status: 'in_progress',
        expiresAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(getDraftState).toHaveBeenCalled();
      expect(getSubject).toHaveBeenCalled();
    });

    it('returns Unknown subject name when subject not found', async () => {
      (getDraftState as jest.Mock).mockResolvedValue({
        id: 'draft-1',
        profileId: 'test-profile-id',
        subjectId: SUBJECT_ID,
        exchangeHistory: [],
        extractedSignals: {},
        status: 'in_progress',
        expiresAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      (getSubject as jest.Mock).mockResolvedValue(null);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      const body = await res.json();
      expect(body.state.subjectName).toBe('Unknown');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview`,
        {},
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/subjects/:subjectId/interview/complete  [BUG-464]
  // -------------------------------------------------------------------------

  describe('POST /v1/subjects/:subjectId/interview/complete', () => {
    it('extracts signals, persists curriculum, and marks draft completed', async () => {
      (getDraftState as jest.Mock).mockResolvedValue({
        id: 'draft-1',
        profileId: 'test-profile-id',
        subjectId: SUBJECT_ID,
        exchangeHistory: [
          { role: 'user', content: 'I want to learn calculus' },
          { role: 'assistant', content: 'Tell me more.' },
        ],
        extractedSignals: {},
        status: 'in_progress',
        expiresAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview/complete`,
        { method: 'POST', headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.isComplete).toBe(true);
      expect(body.exchangeCount).toBe(1);

      // Should extract signals from whatever conversation exists
      expect(extractSignals).toHaveBeenCalled();

      // Should persist curriculum with the extracted signals
      expect(persistCurriculum).toHaveBeenCalledWith(
        undefined,
        'test-profile-id',
        SUBJECT_ID,
        'Mathematics',
        expect.objectContaining({
          extractedSignals: {
            goals: ['learn calculus'],
            experienceLevel: 'beginner',
            currentKnowledge: 'basic algebra',
          },
        }),
        undefined,
        undefined
      );

      // Should mark draft as completed
      expect(updateDraft).toHaveBeenCalledWith(
        undefined,
        'test-profile-id',
        'draft-1',
        expect.objectContaining({ status: 'completed' })
      );
    });

    it('returns success immediately when draft is already completed', async () => {
      (getDraftState as jest.Mock).mockResolvedValue({
        id: 'draft-1',
        profileId: 'test-profile-id',
        subjectId: SUBJECT_ID,
        exchangeHistory: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi!' },
        ],
        extractedSignals: {},
        status: 'completed',
        expiresAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview/complete`,
        { method: 'POST', headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.isComplete).toBe(true);

      // Should not re-extract or re-persist when already completed
      expect(extractSignals).not.toHaveBeenCalled();
      expect(persistCurriculum).not.toHaveBeenCalled();
    });

    it('returns 404 when subject not found', async () => {
      (getSubject as jest.Mock).mockResolvedValue(null);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/interview/complete`,
        { method: 'POST', headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(404);
    });
  });
});
