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
// Mock account + session services — no DB interaction
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

const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const SESSION_ID = '660e8400-e29b-41d4-a716-446655440000';
const EVENT_ID = '770e8400-e29b-41d4-a716-446655440000';

jest.mock('../services/session', () => ({
  startSession: jest
    .fn()
    .mockImplementation((_db, _profileId, subjectId, input) => ({
      id: SESSION_ID,
      subjectId,
      topicId: input.topicId ?? null,
      sessionType: 'learning',
      status: 'active',
      escalationRung: 1,
      exchangeCount: 0,
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      endedAt: null,
      durationSeconds: null,
    })),
  getSession: jest.fn().mockResolvedValue({
    id: SESSION_ID,
    subjectId: SUBJECT_ID,
    topicId: null,
    sessionType: 'learning',
    status: 'active',
    escalationRung: 1,
    exchangeCount: 0,
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    endedAt: null,
    durationSeconds: null,
  }),
  processMessage: jest.fn().mockResolvedValue({
    response: 'Mock AI tutor response',
    escalationRung: 1,
    isUnderstandingCheck: false,
    exchangeCount: 1,
  }),
  closeSession: jest.fn().mockImplementation((_db, _profileId, sessionId) => ({
    message: 'Session closed',
    sessionId,
  })),
  flagContent: jest.fn().mockResolvedValue({
    message: 'Content flagged for review. Thank you!',
  }),
  getSessionSummary: jest.fn().mockResolvedValue({
    id: 'summary-1',
    sessionId: SESSION_ID,
    content: 'Test summary',
    aiFeedback: null,
    status: 'submitted',
  }),
  submitSummary: jest
    .fn()
    .mockImplementation((_db, _profileId, sessionId, input) => ({
      summary: {
        id: 'summary-1',
        sessionId,
        content: input.content,
        aiFeedback: 'Great summary! You captured the key concepts.',
        status: 'accepted',
      },
    })),
  streamMessage: jest.fn().mockImplementation(() =>
    Promise.resolve({
      stream: (async function* () {
        yield 'Hello ';
        yield 'world!';
      })(),
      onComplete: jest.fn().mockResolvedValue({
        exchangeCount: 1,
        escalationRung: 1,
      }),
    })
  ),
}));

import app from '../index';

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
};

describe('session routes', () => {
  // -------------------------------------------------------------------------
  // POST /v1/subjects/:subjectId/sessions
  // -------------------------------------------------------------------------

  describe('POST /v1/subjects/:subjectId/sessions', () => {
    it('returns 201 with valid body', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/sessions`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ subjectId: SUBJECT_ID }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.session).toBeDefined();
      expect(body.session.subjectId).toBe(SUBJECT_ID);
      expect(body.session.sessionType).toBe('learning');
      expect(body.session.status).toBe('active');
      expect(body.session.escalationRung).toBe(1);
      expect(body.session.exchangeCount).toBe(0);
      expect(body.session.startedAt).toBeDefined();
      expect(body.session.endedAt).toBeNull();
      expect(body.session.durationSeconds).toBeNull();
    });

    it('returns 400 with invalid body', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/sessions`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ subjectId: 'not-a-uuid' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/sessions`,
        {
          method: 'POST',
          body: JSON.stringify({ subjectId: SUBJECT_ID }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/sessions/:sessionId
  // -------------------------------------------------------------------------

  describe('GET /v1/sessions/:sessionId', () => {
    it('returns 200 with session object', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('session');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(`/v1/sessions/${SESSION_ID}`, {}, TEST_ENV);

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/sessions/:sessionId/messages
  // -------------------------------------------------------------------------

  describe('POST /v1/sessions/:sessionId/messages', () => {
    it('returns 200 with valid message', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/messages`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'Explain photosynthesis' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.response).toBeDefined();
      expect(body.escalationRung).toBe(1);
      expect(body.isUnderstandingCheck).toBe(false);
      expect(body.exchangeCount).toBe(1);
    });

    it('returns 400 with empty message', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/messages`,
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
        `/v1/sessions/${SESSION_ID}/messages`,
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
  // POST /v1/sessions/:sessionId/close
  // -------------------------------------------------------------------------

  describe('POST /v1/sessions/:sessionId/close', () => {
    it('returns 200 with session closed', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/close`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toBe('Session closed');
      expect(body.sessionId).toBe(SESSION_ID);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/close`,
        {
          method: 'POST',
          body: JSON.stringify({}),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/sessions/:sessionId/flag
  // -------------------------------------------------------------------------

  describe('POST /v1/sessions/:sessionId/flag', () => {
    it('returns 200 with flag confirmation', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/flag`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ eventId: EVENT_ID }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toBe('Content flagged for review. Thank you!');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/flag`,
        {
          method: 'POST',
          body: JSON.stringify({ eventId: EVENT_ID }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/sessions/:sessionId/summary
  // -------------------------------------------------------------------------

  describe('GET /v1/sessions/:sessionId/summary', () => {
    it('returns 200 with summary', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/summary`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('summary');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/summary`,
        {},
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/sessions/:sessionId/summary
  // -------------------------------------------------------------------------

  describe('POST /v1/sessions/:sessionId/summary', () => {
    it('returns 200 with valid content', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/summary`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            content:
              'Photosynthesis converts light energy into chemical energy in plants.',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.summary).toBeDefined();
      expect(body.summary.sessionId).toBe(SESSION_ID);
      expect(body.summary.aiFeedback).toBeDefined();
      expect(body.summary.status).toBe('accepted');
    });

    it('returns 400 with too-short content', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/summary`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ content: 'Short' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/summary`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: 'A valid summary that is long enough.',
          }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/sessions/:sessionId/stream
  // -------------------------------------------------------------------------

  describe('POST /v1/sessions/:sessionId/stream', () => {
    it('returns SSE response with text/event-stream content type', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'Explain gravity' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
    });

    it('streams chunks followed by done event', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/stream`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ message: 'Explain gravity' }),
        },
        TEST_ENV
      );

      const body = await res.text();
      // SSE format: data: {...}\n\n
      expect(body).toContain('"type":"chunk"');
      expect(body).toContain('"type":"done"');
      expect(body).toContain('"content":"Hello "');
      expect(body).toContain('"content":"world!"');
    });

    it('returns 400 with empty message', async () => {
      const res = await app.request(
        `/v1/sessions/${SESSION_ID}/stream`,
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
        `/v1/sessions/${SESSION_ID}/stream`,
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
});
