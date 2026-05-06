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

const mockCaptureException = jest.fn();

jest.mock('../services/sentry', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
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
// Real JWT + real auth middleware — no jwt module mock
// ---------------------------------------------------------------------------

import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';

// ---------------------------------------------------------------------------
// Mock database module — middleware creates a stub db per request
// ---------------------------------------------------------------------------

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock();

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

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

jest.mock('../services/profile', () => ({
  findOwnerProfile: jest.fn().mockResolvedValue({
    id: 'test-profile-id',
    birthYear: 2010,
    location: 'EU',
    consentStatus: 'CONSENTED',
  }),
  getProfile: jest.fn().mockResolvedValue({
    id: 'test-profile-id',
    accountId: 'test-account-id',
    displayName: 'Test User',
    avatarUrl: null,
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

jest.mock('../services/consent', () => {
  const actual = jest.requireActual('../services/consent') as Record<
    string,
    unknown
  >;
  return {
    // Preserve real error classes so instanceof checks work in route handlers
    ConsentResendLimitError: actual.ConsentResendLimitError,
    EmailDeliveryError: actual.EmailDeliveryError,
    ConsentTokenNotFoundError: actual.ConsentTokenNotFoundError,
    ConsentAlreadyProcessedError: actual.ConsentAlreadyProcessedError,
    ConsentTokenExpiredError: actual.ConsentTokenExpiredError,
    ConsentNotAuthorizedError: actual.ConsentNotAuthorizedError,
    ConsentRecordNotFoundError: actual.ConsentRecordNotFoundError,
    checkConsentRequired: jest.fn().mockReturnValue({
      required: true,
      consentType: 'GDPR',
    }),
    requestConsent: jest.fn().mockResolvedValue({
      consentState: {
        id: 'consent-1',
        profileId: '550e8400-e29b-41d4-a716-446655440000',
        consentType: 'GDPR',
        status: 'PARENTAL_CONSENT_REQUESTED',
        parentEmail: 'parent@example.com',
        requestedAt: new Date().toISOString(),
        respondedAt: null,
      },
      emailDelivered: true,
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
    revokeConsent: jest.fn().mockResolvedValue({
      id: 'consent-1',
      profileId: '550e8400-e29b-41d4-a716-446655440000',
      consentType: 'GDPR',
      status: 'WITHDRAWN',
      parentEmail: 'parent@example.com',
      requestedAt: new Date().toISOString(),
      respondedAt: new Date().toISOString(),
    }),
    restoreConsent: jest.fn().mockResolvedValue({
      id: 'consent-1',
      profileId: '550e8400-e29b-41d4-a716-446655440000',
      consentType: 'GDPR',
      status: 'CONSENTED',
      parentEmail: 'parent@example.com',
      requestedAt: new Date().toISOString(),
      respondedAt: new Date().toISOString(),
    }),
    getChildConsentForParent: jest.fn().mockResolvedValue(null),
    getConsentStatus: jest.fn().mockResolvedValue(null),
    getProfileConsentState: jest.fn().mockResolvedValue(null),
  };
});

import { app } from '../index';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';
import { ERROR_CODES } from '@eduagent/schemas';

const TEST_ENV = {
  ...BASE_AUTH_ENV,
  API_ORIGIN: 'https://api.test.mentomate.com',
};

const AUTH_HEADERS = makeAuthHeaders();

beforeAll(() => {
  installTestJwksInterceptor();
});

afterAll(() => {
  restoreTestFetch();
});

beforeEach(() => {
  clearJWKSCache();
});

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
      expect(body.emailStatus).toBe('sent');
    });

    it('returns 201 with COPPA consent type (backward compat)', async () => {
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
      expect(body.emailStatus).toBe('sent');
    });

    it('returns 502 when email delivery fails', async () => {
      const { requestConsent: mockRequestConsent } = jest.requireMock(
        '../services/consent'
      ) as { requestConsent: jest.Mock };
      const { EmailDeliveryError: EmailDeliveryErrorClass } =
        jest.requireActual('../services/consent') as {
          EmailDeliveryError: new (reason?: string) => Error;
        };
      mockRequestConsent.mockRejectedValueOnce(
        new EmailDeliveryErrorClass('no_api_key')
      );

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

      expect(res.status).toBe(502);

      const body = await res.json();
      expect(body.code).toBe('INTERNAL_ERROR');
      expect(body.message).toContain('could not be delivered');
    });

    // BUG-240: Verify the route passes request origin (API domain), not APP_URL
    it('passes API origin (not APP_URL) to requestConsent [BUG-240]', async () => {
      const { requestConsent: mockRequestConsent } = jest.requireMock(
        '../services/consent'
      ) as { requestConsent: jest.Mock };
      mockRequestConsent.mockClear();

      await app.request(
        'https://api.mentomate.com/v1/consent/request',
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

      expect(mockRequestConsent).toHaveBeenCalledTimes(1);
      const passedAppUrl = mockRequestConsent.mock.calls[0][2] as string;
      // Must be the API origin, not the marketing site
      expect(passedAppUrl).toBe('https://api.test.mentomate.com');
      expect(passedAppUrl).not.toContain('www.mentomate.com');
      expect(passedAppUrl).not.toContain('app.mentomate.com');
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
      const { ConsentTokenNotFoundError } = jest.requireActual(
        '../services/consent'
      ) as { ConsentTokenNotFoundError: new () => Error };
      mockProcess.mockRejectedValueOnce(new ConsentTokenNotFoundError());

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

    // [BUG-655 / A-11] Break test: an unauthenticated source IP must be
    // rate-limited after exceeding the per-hour cap (30). Without the limit,
    // an attacker can pummel the endpoint with token guesses or DoS the DB.
    // The 31st request from the same IP must return 429 + Retry-After and
    // must NOT call the underlying processConsentResponse service.
    it('rate-limits per source IP after 30 attempts in an hour [BUG-655]', async () => {
      const { __resetConsentRespondRateLimit } = jest.requireActual(
        './consent'
      ) as { __resetConsentRespondRateLimit: () => void };
      __resetConsentRespondRateLimit();

      const { processConsentResponse: mockProcess } = jest.requireMock(
        '../services/consent'
      ) as { processConsentResponse: jest.Mock };
      mockProcess.mockResolvedValue(undefined);

      const ip = '203.0.113.99';
      const headers = { ...AUTH_HEADERS, 'cf-connecting-ip': ip };
      const body = JSON.stringify({ token: 't', approved: true });

      // 30 allowed
      for (let i = 0; i < 30; i++) {
        const ok = await app.request(
          '/v1/consent/respond',
          { method: 'POST', headers, body },
          TEST_ENV
        );
        expect(ok.status).toBe(200);
      }

      const callsBefore = mockProcess.mock.calls.length;

      // 31st blocked
      const blocked = await app.request(
        '/v1/consent/respond',
        { method: 'POST', headers, body },
        TEST_ENV
      );
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get('Retry-After')).toBe('3600');
      const blockedBody = await blocked.json();
      expect(blockedBody.code).toBe('RATE_LIMITED');

      // Service must NOT be invoked when rate-limited.
      expect(mockProcess.mock.calls.length).toBe(callsBefore);

      // A different IP is independent — proves the bucket is per-IP.
      const otherIp = await app.request(
        '/v1/consent/respond',
        {
          method: 'POST',
          headers: { ...AUTH_HEADERS, 'cf-connecting-ip': '198.51.100.1' },
          body,
        },
        TEST_ENV
      );
      expect(otherIp.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/consent/my-status
  // -------------------------------------------------------------------------

  describe('GET /v1/consent/my-status', () => {
    it('returns 200 with null values when no X-Profile-Id header', async () => {
      const res = await app.request(
        '/v1/consent/my-status',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.consentStatus).toBeNull();
      expect(body.parentEmail).toBeNull();
    });

    it('returns 200 with null values when profile has no consent state', async () => {
      const res = await app.request(
        '/v1/consent/my-status',
        {
          headers: {
            ...AUTH_HEADERS,
            'X-Profile-Id': 'test-profile-id',
          },
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.consentStatus).toBeNull();
      expect(body.parentEmail).toBeNull();
    });

    it('returns 200 with consent status and masked parentEmail when consent exists', async () => {
      const { getProfileConsentState: mockGetState } = jest.requireMock(
        '../services/consent'
      ) as { getProfileConsentState: jest.Mock };
      mockGetState.mockResolvedValueOnce({
        status: 'PARENTAL_CONSENT_REQUESTED',
        parentEmail: 'parent@example.com',
      });

      const res = await app.request(
        '/v1/consent/my-status',
        {
          headers: {
            ...AUTH_HEADERS,
            'X-Profile-Id': 'test-profile-id',
          },
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.consentStatus).toBe('PARENTAL_CONSENT_REQUESTED');
      // [BUG-625 / A-10] parentEmail is masked to avoid leaking parent PII to
      // child profile sessions. UI keeps verification UX via masked form.
      expect(body.parentEmail).toBe('p***t@example.com');
    });

    it('[BUG-625 / A-10] does NOT leak full parent email to child profile session', async () => {
      const { getProfileConsentState: mockGetState } = jest.requireMock(
        '../services/consent'
      ) as { getProfileConsentState: jest.Mock };
      mockGetState.mockResolvedValueOnce({
        status: 'PARENTAL_CONSENT_REQUESTED',
        parentEmail: 'sensitive.parent.email@example.com',
        consentType: 'GDPR',
      });

      const res = await app.request(
        '/v1/consent/my-status',
        {
          headers: { ...AUTH_HEADERS, 'X-Profile-Id': 'child-profile-id' },
        },
        TEST_ENV
      );

      const body = await res.json();
      // The full local part must not appear in the response.
      expect(JSON.stringify(body)).not.toContain('sensitive.parent.email');
      // Domain may remain (low-entropy, e.g. gmail.com).
      expect(body.parentEmail).toBe('s***l@example.com');
    });

    it('[BUG-625 / A-10] returns null when no parentEmail set', async () => {
      const { getProfileConsentState: mockGetState } = jest.requireMock(
        '../services/consent'
      ) as { getProfileConsentState: jest.Mock };
      mockGetState.mockResolvedValueOnce({
        status: 'PARENTAL_CONSENT_REQUESTED',
        parentEmail: null,
      });

      const res = await app.request(
        '/v1/consent/my-status',
        { headers: { ...AUTH_HEADERS, 'X-Profile-Id': 'test-profile-id' } },
        TEST_ENV
      );

      const body = await res.json();
      expect(body.parentEmail).toBeNull();
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/consent/my-status', {}, TEST_ENV);

      expect(res.status).toBe(401);
    });
  });
});

// ---------------------------------------------------------------------------
// [A-23] Inngest dispatch failure must escalate to Sentry, not just logger.warn
// ---------------------------------------------------------------------------

describe('consent Inngest dispatch observability [A-23]', () => {
  beforeEach(() => {
    // Clear only the exception spy — clearAllMocks() would wipe mock implementations.
    mockCaptureException.mockClear();
  });

  it('captures exception in Sentry when consent.requested Inngest dispatch fails', async () => {
    const { inngest: mockInngest } = jest.requireMock('../inngest/client') as {
      inngest: { send: jest.Mock };
    };
    // First call = normal auth/account setup; second call = Inngest.send fails
    mockInngest.send.mockRejectedValueOnce(new Error('Inngest unreachable'));

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

    // Consent request must succeed even when Inngest is unreachable
    expect(res.status).toBe(201);

    // [A-23] Must escalate to Sentry — not just logger.warn — so we can query
    // how often the GDPR reminder workflow is permanently skipped.
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'consent.requested.inngest_dispatch',
        }),
      })
    );
  });

  it('captures exception in Sentry when consent.revoked Inngest dispatch fails', async () => {
    const { inngest: mockInngest } = jest.requireMock('../inngest/client') as {
      inngest: { send: jest.Mock };
    };
    mockInngest.send.mockRejectedValueOnce(new Error('Inngest unreachable'));

    const res = await app.request(
      '/v1/consent/550e8400-e29b-41d4-a716-446655440000/revoke',
      {
        method: 'PUT',
        headers: { ...AUTH_HEADERS, 'X-Profile-Id': 'test-profile-id' },
      },
      TEST_ENV
    );

    // Revocation must succeed even when Inngest is unreachable
    expect(res.status).toBe(200);

    // [A-23] Must escalate to Sentry so we can query how often the 7-day
    // GDPR deletion grace period job is permanently skipped.
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'consent.revoked.inngest_dispatch',
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// [BUG-765] Break tests — typed-error classification
//
// Before fix: route handlers classified service errors via
// `error.message.includes('Not authorized')`. If the service was refactored
// to use a typed error (or any upstream library wrapped the message), the
// 403 path silently fell through to a 500. These tests force a typed
// `ConsentNotAuthorizedError` / `ConsentRecordNotFoundError` from the service
// and assert the route maps them to the right HTTP status — independent of
// the error message text.
// ---------------------------------------------------------------------------

describe('[BUG-765] consent route classification by typed error (not by err.message string)', () => {
  it('GET /v1/consent/:id/status returns 403 when service throws ConsentNotAuthorizedError', async () => {
    const consentMock = jest.requireMock('../services/consent') as {
      getChildConsentForParent: jest.Mock;
      ConsentNotAuthorizedError: new (
        action: 'view' | 'revoke' | 'restore'
      ) => Error;
    };
    consentMock.getChildConsentForParent.mockRejectedValueOnce(
      new consentMock.ConsentNotAuthorizedError('view')
    );

    const res = await app.request(
      '/v1/consent/550e8400-e29b-41d4-a716-446655440000/status',
      {
        method: 'GET',
        headers: { ...AUTH_HEADERS, 'X-Profile-Id': 'test-profile-id' },
      },
      TEST_ENV
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe(ERROR_CODES.FORBIDDEN);
  });

  it('PUT /v1/consent/:id/revoke returns 403 when service throws ConsentNotAuthorizedError', async () => {
    const consentMock = jest.requireMock('../services/consent') as {
      revokeConsent: jest.Mock;
      ConsentNotAuthorizedError: new (
        action: 'view' | 'revoke' | 'restore'
      ) => Error;
    };
    consentMock.revokeConsent.mockRejectedValueOnce(
      new consentMock.ConsentNotAuthorizedError('revoke')
    );

    const res = await app.request(
      '/v1/consent/550e8400-e29b-41d4-a716-446655440000/revoke',
      {
        method: 'PUT',
        headers: { ...AUTH_HEADERS, 'X-Profile-Id': 'test-profile-id' },
      },
      TEST_ENV
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe(ERROR_CODES.FORBIDDEN);
  });

  it('PUT /v1/consent/:id/revoke returns 404 when service throws ConsentRecordNotFoundError', async () => {
    const consentMock = jest.requireMock('../services/consent') as {
      revokeConsent: jest.Mock;
      ConsentRecordNotFoundError: new () => Error;
    };
    consentMock.revokeConsent.mockRejectedValueOnce(
      new consentMock.ConsentRecordNotFoundError()
    );

    const res = await app.request(
      '/v1/consent/550e8400-e29b-41d4-a716-446655440000/revoke',
      {
        method: 'PUT',
        headers: { ...AUTH_HEADERS, 'X-Profile-Id': 'test-profile-id' },
      },
      TEST_ENV
    );

    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe(ERROR_CODES.NOT_FOUND);
  });

  it('PUT /v1/consent/:id/restore returns 403 when service throws ConsentNotAuthorizedError', async () => {
    const consentMock = jest.requireMock('../services/consent') as {
      restoreConsent: jest.Mock;
      ConsentNotAuthorizedError: new (
        action: 'view' | 'revoke' | 'restore'
      ) => Error;
    };
    consentMock.restoreConsent.mockRejectedValueOnce(
      new consentMock.ConsentNotAuthorizedError('restore')
    );

    const res = await app.request(
      '/v1/consent/550e8400-e29b-41d4-a716-446655440000/restore',
      {
        method: 'PUT',
        headers: { ...AUTH_HEADERS, 'X-Profile-Id': 'test-profile-id' },
      },
      TEST_ENV
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe(ERROR_CODES.FORBIDDEN);
  });

  // Negative path: a generic Error must NOT be classified as 403/404.
  // This is what prevents the regression where any random
  // "Not authorized to do something else" Error.message would silently
  // become a 403 — forcing instanceof breaks that string-coupling.
  it('PUT /v1/consent/:id/revoke does NOT swallow a generic Error as 403/404', async () => {
    const consentMock = jest.requireMock('../services/consent') as {
      revokeConsent: jest.Mock;
    };
    consentMock.revokeConsent.mockRejectedValueOnce(
      new Error('Not authorized to do something else entirely')
    );

    const res = await app.request(
      '/v1/consent/550e8400-e29b-41d4-a716-446655440000/revoke',
      {
        method: 'PUT',
        headers: { ...AUTH_HEADERS, 'X-Profile-Id': 'test-profile-id' },
      },
      TEST_ENV
    );

    // Must NOT classify by string match — generic errors fall through to 500.
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(500);
  });
});
