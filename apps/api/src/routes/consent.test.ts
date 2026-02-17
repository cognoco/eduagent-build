// ---------------------------------------------------------------------------
// Mock dependencies used by consent service and routes
// ---------------------------------------------------------------------------

jest.mock('inngest/hono', () => ({
  serve: jest.fn().mockReturnValue(jest.fn()),
}));

jest.mock('../inngest/client', () => ({
  inngest: {
    send: jest.fn().mockResolvedValue(undefined),
    createFunction: jest.fn().mockReturnValue(jest.fn()),
  },
}));

jest.mock('../services/notifications', () => ({
  sendEmail: jest.fn().mockResolvedValue({ sent: true }),
  formatConsentRequestEmail: jest.fn().mockReturnValue({
    to: 'parent@example.com',
    subject: 'Test',
    body: 'Test',
    type: 'consent_request',
  }),
  sendPushNotification: jest.fn().mockResolvedValue({ sent: true }),
  formatReviewReminderBody: jest.fn(),
  formatDailyReminderBody: jest.fn(),
  formatConsentReminderEmail: jest.fn(),
  MAX_DAILY_PUSH: 3,
}));

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
// Mock account + consent services — no DB interaction
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

jest.mock('../services/consent', () => ({
  checkConsentRequired: jest.fn().mockReturnValue({
    required: true,
    consentType: 'GDPR',
  }),
  requestConsent: jest.fn().mockResolvedValue({
    id: 'consent-1',
    profileId: '550e8400-e29b-41d4-a716-446655440000',
    consentType: 'GDPR',
    status: 'PARENTAL_CONSENT_REQUESTED',
    parentEmail: 'parent@example.com',
    requestedAt: new Date().toISOString(),
    respondedAt: null,
  }),
  processConsentResponse: jest
    .fn()
    .mockImplementation((_db: unknown, _token: string, approved: boolean) =>
      Promise.resolve({
        id: 'consent-1',
        profileId: 'mock-profile-id',
        consentType: 'GDPR',
        status: approved ? 'CONSENTED' : 'WITHDRAWN',
        parentEmail: 'parent@example.com',
        requestedAt: new Date().toISOString(),
        respondedAt: new Date().toISOString(),
      })
    ),
  getConsentStatus: jest.fn().mockResolvedValue(null),
}));

import app from '../index';

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
};

describe('consent routes', () => {
  // -------------------------------------------------------------------------
  // POST /v1/consent/request
  // -------------------------------------------------------------------------

  describe('POST /v1/consent/request', () => {
    it('returns 201 with valid consent request', async () => {
      const res = await app.request(
        '/v1/consent/request',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            childProfileId: '550e8400-e29b-41d4-a716-446655440000',
            parentEmail: 'parent@example.com',
            consentType: 'GDPR',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.message).toBe('Consent request sent to parent');
      expect(body.consentType).toBe('GDPR');
    });

    it('returns 201 with COPPA consent type', async () => {
      const res = await app.request(
        '/v1/consent/request',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            childProfileId: '550e8400-e29b-41d4-a716-446655440000',
            parentEmail: 'parent@example.com',
            consentType: 'COPPA',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.consentType).toBe('COPPA');
    });

    it('returns 400 for invalid consent type', async () => {
      const res = await app.request(
        '/v1/consent/request',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            childProfileId: '550e8400-e29b-41d4-a716-446655440000',
            parentEmail: 'parent@example.com',
            consentType: 'INVALID',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid parent email', async () => {
      const res = await app.request(
        '/v1/consent/request',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            childProfileId: '550e8400-e29b-41d4-a716-446655440000',
            parentEmail: 'not-an-email',
            consentType: 'GDPR',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 for non-UUID childProfileId', async () => {
      const res = await app.request(
        '/v1/consent/request',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            childProfileId: 'not-a-uuid',
            parentEmail: 'parent@example.com',
            consentType: 'GDPR',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/consent/request',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            childProfileId: '550e8400-e29b-41d4-a716-446655440000',
            parentEmail: 'parent@example.com',
            consentType: 'GDPR',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/consent/respond
  // -------------------------------------------------------------------------

  describe('POST /v1/consent/respond', () => {
    it('returns 200 when consent is approved', async () => {
      const res = await app.request(
        '/v1/consent/respond',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            token: 'consent-token-abc',
            approved: true,
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toBe('Consent granted');
    });

    it('returns 200 when consent is denied', async () => {
      const res = await app.request(
        '/v1/consent/respond',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            token: 'consent-token-abc',
            approved: false,
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toBe('Consent denied');
    });

    it('returns 400 when token is missing', async () => {
      const res = await app.request(
        '/v1/consent/respond',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ approved: true }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 when approved is missing', async () => {
      const res = await app.request(
        '/v1/consent/respond',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ token: 'consent-token-abc' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 404 when consent token is invalid', async () => {
      const { processConsentResponse: mockProcess } = jest.requireMock(
        '../services/consent'
      ) as {
        processConsentResponse: jest.Mock;
      };
      mockProcess.mockRejectedValueOnce(new Error('Invalid consent token'));

      const res = await app.request(
        '/v1/consent/respond',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            token: 'nonexistent-token',
            approved: true,
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
      expect(body.message).toBe('Invalid consent token');
    });
  });
});
