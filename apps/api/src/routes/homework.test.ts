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

jest.mock('inngest/hono', () => ({
  serve: jest.fn().mockReturnValue(jest.fn()),
}));

jest.mock('../inngest/client', () => ({
  inngest: {
    send: jest.fn().mockResolvedValue(undefined),
    createFunction: jest.fn().mockReturnValue(jest.fn()),
  },
}));

jest.mock('@eduagent/database', () => ({
  createDatabase: jest.fn().mockReturnValue({}),
}));

jest.mock('../services/account', () => ({
  findOrCreateAccount: jest.fn().mockResolvedValue({
    id: 'test-account-id',
    clerkUserId: 'user_test',
    email: 'test@example.com',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
}));

const mockStartSession = jest.fn();

jest.mock('../services/session', () => ({
  startSession: (...args: unknown[]) => mockStartSession(...args),
  SubjectInactiveError: class SubjectInactiveError extends Error {
    subjectStatus: string;
    constructor(status: string) {
      super(`Subject is ${status}`);
      this.name = 'SubjectInactiveError';
      this.subjectStatus = status;
    }
  },
  getSession: jest.fn(),
  processMessage: jest.fn(),
  streamMessage: jest.fn(),
  closeSession: jest.fn(),
  flagContent: jest.fn(),
  getSessionSummary: jest.fn(),
  submitSummary: jest.fn(),
}));

jest.mock('../services/ocr', () => ({
  getOcrProvider: jest.fn().mockReturnValue({
    extractText: jest.fn().mockResolvedValue({
      text: 'Stub OCR text for testing',
      confidence: 0.95,
      regions: [
        {
          text: 'Stub OCR text for testing',
          confidence: 0.95,
          boundingBox: { x: 0, y: 0, width: 100, height: 50 },
        },
      ],
    }),
  }),
}));

import app from '../index';

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
};

const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('homework routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // POST /v1/subjects/:subjectId/homework
  // -------------------------------------------------------------------------

  describe('POST /v1/subjects/:subjectId/homework', () => {
    it('returns 201 with homework session', async () => {
      const now = new Date().toISOString();
      mockStartSession.mockResolvedValue({
        id: 'session-001',
        subjectId: SUBJECT_ID,
        topicId: null,
        sessionType: 'homework',
        status: 'active',
        escalationRung: 1,
        exchangeCount: 0,
        startedAt: now,
        lastActivityAt: now,
        endedAt: null,
        durationSeconds: null,
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/homework`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.session).toBeDefined();
      expect(body.session.subjectId).toBe(SUBJECT_ID);
      expect(body.session.sessionType).toBe('homework');
      expect(body.session.status).toBe('active');
      expect(body.session.startedAt).toBeDefined();
      expect(body.session.endedAt).toBeNull();
    });

    it('calls startSession with homework sessionType', async () => {
      mockStartSession.mockResolvedValue({
        id: 'session-001',
        subjectId: SUBJECT_ID,
        topicId: null,
        sessionType: 'homework',
        status: 'active',
        escalationRung: 1,
        exchangeCount: 0,
        startedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        endedAt: null,
        durationSeconds: null,
      });

      await app.request(
        `/v1/subjects/${SUBJECT_ID}/homework`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV
      );

      // Verify the service was called with correct subjectId and sessionType
      expect(mockStartSession).toHaveBeenCalledTimes(1);
      const [, , subjectArg, inputArg] = mockStartSession.mock.calls[0];
      expect(subjectArg).toBe(SUBJECT_ID);
      expect(inputArg).toEqual({ sessionType: 'homework' });
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/homework`,
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
  // POST /v1/ocr
  // -------------------------------------------------------------------------

  describe('POST /v1/ocr', () => {
    it('returns 200 with structured OCR result for valid image', async () => {
      const formData = new FormData();
      formData.append(
        'image',
        new File([new ArrayBuffer(100)], 'test.jpg', { type: 'image/jpeg' })
      );

      const res = await app.request(
        '/v1/ocr',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer valid.jwt.token' },
          body: formData,
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.text).toBe('Stub OCR text for testing');
      expect(body.confidence).toBe(0.95);
      expect(body.regions).toHaveLength(1);
      expect(body.regions[0].boundingBox).toBeDefined();
    });

    it('accepts image/png files', async () => {
      const formData = new FormData();
      formData.append(
        'image',
        new File([new ArrayBuffer(50)], 'test.png', { type: 'image/png' })
      );

      const res = await app.request(
        '/v1/ocr',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer valid.jwt.token' },
          body: formData,
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
    });

    it('accepts image/webp files', async () => {
      const formData = new FormData();
      formData.append(
        'image',
        new File([new ArrayBuffer(50)], 'test.webp', { type: 'image/webp' })
      );

      const res = await app.request(
        '/v1/ocr',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer valid.jwt.token' },
          body: formData,
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
    });

    it('returns 400 when image field is missing', async () => {
      const formData = new FormData();

      const res = await app.request(
        '/v1/ocr',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer valid.jwt.token' },
          body: formData,
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.message).toBe('Validation failed');
      expect(body.details).toContain('Missing required field: image');
    });

    it('returns 400 when image field is not a file', async () => {
      const formData = new FormData();
      formData.append('image', 'not-a-file');

      const res = await app.request(
        '/v1/ocr',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer valid.jwt.token' },
          body: formData,
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.message).toBe('Validation failed');
      expect(body.details).toContain('Missing required field: image');
    });

    it('returns 400 for unsupported MIME type', async () => {
      const formData = new FormData();
      formData.append(
        'image',
        new File([new ArrayBuffer(100)], 'test.gif', { type: 'image/gif' })
      );

      const res = await app.request(
        '/v1/ocr',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer valid.jwt.token' },
          body: formData,
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.details).toContain('Unsupported file type: image/gif');
      expect(body.details).toContain('image/jpeg');
      expect(body.details).toContain('image/png');
      expect(body.details).toContain('image/webp');
    });

    it('returns 400 when file exceeds 5MB', async () => {
      const largeBuffer = new ArrayBuffer(5 * 1024 * 1024 + 1);
      const formData = new FormData();
      formData.append(
        'image',
        new File([largeBuffer], 'large.jpg', { type: 'image/jpeg' })
      );

      const res = await app.request(
        '/v1/ocr',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer valid.jwt.token' },
          body: formData,
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.details).toContain('File too large');
      expect(body.details).toContain('5MB');
    });

    it('accepts a file exactly at 5MB', async () => {
      const exactBuffer = new ArrayBuffer(5 * 1024 * 1024);
      const formData = new FormData();
      formData.append(
        'image',
        new File([exactBuffer], 'exact.jpg', { type: 'image/jpeg' })
      );

      const res = await app.request(
        '/v1/ocr',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer valid.jwt.token' },
          body: formData,
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);
    });

    it('returns 401 without auth header', async () => {
      const formData = new FormData();
      formData.append(
        'image',
        new File([new ArrayBuffer(100)], 'test.jpg', { type: 'image/jpeg' })
      );

      const res = await app.request(
        '/v1/ocr',
        {
          method: 'POST',
          body: formData,
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });
});
