// ---------------------------------------------------------------------------
// Mock dependencies used by consent-web routes
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

jest.mock('../services/profile', () => ({
  getProfile: jest.fn().mockResolvedValue({
    id: 'test-profile-id',
    accountId: 'test-account-id',
    displayName: 'Test User',
    avatarUrl: null,
    birthDate: null,
    personaType: 'TEEN',
    isOwner: false,
    consentStatus: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
  listProfiles: jest.fn().mockResolvedValue([]),
  createProfile: jest.fn(),
  updateProfile: jest.fn(),
  switchProfile: jest.fn(),
}));

jest.mock('../services/consent', () => ({
  checkConsentRequired: jest.fn().mockReturnValue({
    required: true,
    consentType: 'GDPR',
  }),
  requestConsent: jest.fn().mockResolvedValue({
    id: 'consent-1',
    profileId: 'mock-profile-id',
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
  getProfileConsentState: jest.fn().mockResolvedValue(null),
  getChildNameByToken: jest.fn().mockResolvedValue('Emma'),
}));

import { app } from '../index';

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
};

describe('consent-web routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { getChildNameByToken } = jest.requireMock('../services/consent') as {
      getChildNameByToken: jest.Mock;
    };
    getChildNameByToken.mockResolvedValue('Emma');
  });

  // -------------------------------------------------------------------------
  // GET /v1/consent-page
  // -------------------------------------------------------------------------

  describe('GET /v1/consent-page', () => {
    it('returns 400 when token is missing', async () => {
      const res = await app.request('/v1/consent-page', {}, TEST_ENV);

      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain('Invalid link');
    });

    it('returns 404 when token is invalid (child name lookup returns null)', async () => {
      const { getChildNameByToken } = jest.requireMock(
        '../services/consent'
      ) as {
        getChildNameByToken: jest.Mock;
      };
      getChildNameByToken.mockResolvedValueOnce(null);

      const res = await app.request(
        '/v1/consent-page?token=invalid-token',
        {},
        TEST_ENV
      );

      expect(res.status).toBe(404);
      const html = await res.text();
      expect(html).toContain('Link expired or invalid');
    });

    it('renders consent page with real child name', async () => {
      const res = await app.request(
        '/v1/consent-page?token=valid-token',
        {},
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Consent required for Emma');
      expect(html).toContain('Emma wants to use EduAgent');
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/consent-page/confirm
  // -------------------------------------------------------------------------

  describe('GET /v1/consent-page/confirm', () => {
    it('returns 400 when token is missing', async () => {
      const res = await app.request(
        '/v1/consent-page/confirm?approved=true',
        {},
        TEST_ENV
      );

      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain('Invalid link');
    });

    it('returns 400 when approved param is missing', async () => {
      const res = await app.request(
        '/v1/consent-page/confirm?token=some-token',
        {},
        TEST_ENV
      );

      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain('Invalid link');
    });

    it('renders approval landing with real child name', async () => {
      const res = await app.request(
        '/v1/consent-page/confirm?token=valid-token&approved=true',
        {},
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Family account ready!');
      expect(html).toContain("Emma's account is now active");
      expect(html).toContain("See Emma's Progress");
    });

    it('renders denial landing with real child name', async () => {
      const res = await app.request(
        '/v1/consent-page/confirm?token=valid-token&approved=false',
        {},
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Consent declined');
      expect(html).toContain("Emma's account will be removed");
    });

    it('calls getChildNameByToken before processConsentResponse', async () => {
      const { getChildNameByToken, processConsentResponse } = jest.requireMock(
        '../services/consent'
      ) as {
        getChildNameByToken: jest.Mock;
        processConsentResponse: jest.Mock;
      };

      let nameCalledFirst = false;
      getChildNameByToken.mockImplementation(() => {
        nameCalledFirst = !processConsentResponse.mock.calls.length;
        return Promise.resolve('Emma');
      });

      await app.request(
        '/v1/consent-page/confirm?token=valid-token&approved=false',
        {},
        TEST_ENV
      );

      expect(getChildNameByToken).toHaveBeenCalledTimes(1);
      expect(processConsentResponse).toHaveBeenCalledTimes(1);
      expect(nameCalledFirst).toBe(true);
    });

    it('falls back to "Your child" when name lookup returns null', async () => {
      const { getChildNameByToken } = jest.requireMock(
        '../services/consent'
      ) as {
        getChildNameByToken: jest.Mock;
      };
      getChildNameByToken.mockResolvedValueOnce(null);

      const res = await app.request(
        '/v1/consent-page/confirm?token=valid-token&approved=true',
        {},
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Your child's account is now active");
    });

    it('returns 404 when consent token is invalid', async () => {
      const { processConsentResponse: mockProcess } = jest.requireMock(
        '../services/consent'
      ) as { processConsentResponse: jest.Mock };
      mockProcess.mockRejectedValueOnce(new Error('Invalid consent token'));

      const res = await app.request(
        '/v1/consent-page/confirm?token=bad-token&approved=true',
        {},
        TEST_ENV
      );

      expect(res.status).toBe(404);
      const html = await res.text();
      expect(html).toContain('Link expired or invalid');
    });
  });
});
