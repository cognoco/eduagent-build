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

jest.mock('@eduagent/database', () => ({
  createDatabase: jest.fn().mockReturnValue({}),
}));

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
// Mock subject service
// ---------------------------------------------------------------------------

const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

jest.mock('../services/subject', () => ({
  listSubjects: jest.fn().mockResolvedValue([]),
  createSubject: jest.fn(),
  getSubject: jest.fn().mockResolvedValue({
    id: SUBJECT_ID,
    profileId: 'test-account-id',
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
  processInterviewExchange: jest.fn().mockResolvedValue({
    response: 'Tell me about your experience.',
    isComplete: false,
  }),
  getOrCreateDraft: jest.fn().mockResolvedValue({
    id: 'draft-1',
    profileId: 'test-account-id',
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
}));

import app from '../index';
import { getSubject } from '../services/subject';
import {
  processInterviewExchange,
  getOrCreateDraft,
  getDraftState,
  updateDraft,
  persistCurriculum,
} from '../services/interview';

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
};

describe('interview routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset default mocks after clearAllMocks
    (getSubject as jest.Mock).mockResolvedValue({
      id: SUBJECT_ID,
      profileId: 'test-account-id',
      name: 'Mathematics',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    (processInterviewExchange as jest.Mock).mockResolvedValue({
      response: 'Tell me about your experience.',
      isComplete: false,
    });

    (getOrCreateDraft as jest.Mock).mockResolvedValue({
      id: 'draft-1',
      profileId: 'test-account-id',
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
        'I want to learn calculus'
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
        expect.any(String),
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

      expect(updateDraft).toHaveBeenCalledWith(
        undefined,
        expect.any(String),
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
        profileId: 'test-account-id',
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
        profileId: 'test-account-id',
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
        profileId: 'test-account-id',
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
});
