// ---------------------------------------------------------------------------
// Real JWT + real auth middleware — no jwt module mock
// ---------------------------------------------------------------------------

import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';

jest.mock('inngest/hono', () => ({
  // gc1-allow: Inngest framework boundary
  serve: jest.fn().mockReturnValue(jest.fn()),
}));

jest.mock('../inngest/client', () => {
  const actual = jest.requireActual(
    '../inngest/client',
  ) as typeof import('../inngest/client');
  return {
    ...actual,
    inngest: {
      send: jest.fn().mockResolvedValue(undefined),
      createFunction: jest.fn().mockReturnValue(jest.fn()),
    },
  };
});

jest.mock('../services/sentry', () => {
  const actual = jest.requireActual(
    '../services/sentry',
  ) as typeof import('../services/sentry');
  return {
    ...actual,
    captureException: jest.fn(),
    addBreadcrumb: jest.fn(),
  };
});

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({ includeActual: true });

jest.mock(
  '@eduagent/database' /* gc1-allow: route unit test — DB middleware injected via mock; real DB covered by route integration / e2e tests */,
  () => mockDatabaseModule.module,
);

jest.mock('../services/account', () => ({
  ...jest.requireActual('../services/account'),
  findOrCreateAccount: jest.fn().mockResolvedValue({
    id: 'test-account-id',
    clerkUserId: 'user_test',
    email: 'test@example.com',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
}));

jest.mock('../services/profile', () => ({
  ...jest.requireActual('../services/profile'),
  findOwnerProfile: jest.fn().mockResolvedValue(null),
  getProfile: jest.fn().mockResolvedValue({
    id: 'test-profile-id',
    birthYear: null,
    location: null,
    consentStatus: 'CONSENTED',
  }),
}));

const mockStartSession = jest.fn();

jest.mock('../services/session', () => ({
  // Use real error classes so instanceof checks in route handlers match production behavior.
  ...jest.requireActual('../services/session'),
  startSession: (...args: unknown[]) => mockStartSession(...args),
  getSession: jest.fn(),
  processMessage: jest.fn(),
  streamMessage: jest.fn(),
  closeSession: jest.fn(),
  flagContent: jest.fn(),
  getSessionSummary: jest.fn(),
  submitSummary: jest.fn(),
}));

jest.mock('../services/ocr', () => ({
  ...jest.requireActual('../services/ocr'),
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

// Billing mock — required by metering middleware now that
// POST /v1/ocr is metered [WI-155 / WI-77 allowlist sweep].
jest.mock('../services/billing', () => {
  const actual = jest.requireActual(
    '../services/billing',
  ) as typeof import('../services/billing');
  return {
    ...actual,
    ensureFreeSubscription: jest.fn().mockResolvedValue({
      id: 'sub-1',
      accountId: 'test-account-id',
      tier: 'free',
      status: 'active',
      stripeSubscriptionId: null,
      stripeCustomerId: null,
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date().toISOString(),
      cancelAtPeriodEnd: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    getEffectiveAccessForSubscription: jest.fn().mockResolvedValue({
      subscription: {
        id: 'sub-1',
        accountId: 'test-account-id',
        tier: 'free',
        status: 'active',
      },
      effectiveAccessTier: 'free',
      billingAccess: 'current',
    }),
    getQuotaPool: jest.fn().mockResolvedValue({
      id: 'qp-1',
      subscriptionId: 'sub-1',
      monthlyLimit: 500,
      usedThisMonth: 10,
      dailyLimit: null,
      usedToday: 0,
      cycleResetAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    getOrProvisionProfileQuotaUsage: jest.fn().mockResolvedValue({
      id: 'pqu-1',
      subscriptionId: 'sub-1',
      profileId: 'test-profile-id',
      role: 'owner',
      monthlyLimit: 100,
      usedThisMonth: 10,
      dailyLimit: 10,
      usedToday: 0,
      cycleResetAt: new Date().toISOString(),
    }),
    decrementQuota: jest.fn().mockResolvedValue({
      success: true,
      source: 'monthly',
      remainingMonthly: 489,
      remainingTopUp: 0,
      remainingDaily: null,
    }),
    getTopUpCreditsRemaining: jest.fn().mockResolvedValue(0),
    safeRefundQuota: jest.fn().mockResolvedValue({ refunded: true }),
  };
});

import { app } from '../index';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';
import { captureException } from '../services/sentry';
import { OCR_CONSTRAINTS } from '@eduagent/schemas';

const TEST_ENV = { ...BASE_AUTH_ENV };

const AUTH_HEADERS = makeAuthHeaders({ 'X-Profile-Id': 'test-profile-id' });

const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('homework routes', () => {
  beforeAll(() => {
    installTestJwksInterceptor();
  });

  afterAll(() => {
    restoreTestFetch();
  });

  beforeEach(() => {
    clearJWKSCache();
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // POST /v1/subjects/:subjectId/homework
  // -------------------------------------------------------------------------

  describe('POST /v1/subjects/:subjectId/homework', () => {
    it('returns 201 with homework session', async () => {
      const now = new Date().toISOString();
      mockStartSession.mockResolvedValue({
        id: 'a0000000-0000-4000-a000-000000000001',
        subjectId: SUBJECT_ID,
        topicId: null,
        sessionType: 'homework',
        inputMode: 'text',
        verificationType: null,
        status: 'active',
        escalationRung: 1,
        exchangeCount: 0,
        startedAt: now,
        lastActivityAt: now,
        endedAt: null,
        durationSeconds: null,
        wallClockSeconds: null,
        filedAt: null,
        filingStatus: null,
        filingRetryCount: 0,
      });

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/homework`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.session).toEqual(expect.objectContaining({}));
      expect(body.session.subjectId).toBe(SUBJECT_ID);
      expect(body.session.sessionType).toBe('homework');
      expect(body.session.status).toBe('active');
      expect(typeof body.session.startedAt).toBe('string');
      expect(body.session.endedAt).toBeNull();
    });

    it('calls startSession with homework sessionType', async () => {
      const now = new Date().toISOString();
      mockStartSession.mockResolvedValue({
        id: 'a0000000-0000-4000-a000-000000000001',
        subjectId: SUBJECT_ID,
        topicId: null,
        sessionType: 'homework',
        inputMode: 'text',
        verificationType: null,
        status: 'active',
        escalationRung: 1,
        exchangeCount: 0,
        startedAt: now,
        lastActivityAt: now,
        endedAt: null,
        durationSeconds: null,
        wallClockSeconds: null,
        filedAt: null,
        filingStatus: null,
        filingRetryCount: 0,
      });

      await app.request(
        `/v1/subjects/${SUBJECT_ID}/homework`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      // Verify the service was called with correct subjectId and sessionType
      expect(mockStartSession).toHaveBeenCalledTimes(1);
      const [, , subjectArg, inputArg] = mockStartSession.mock.calls[0];
      expect(subjectArg).toBe(SUBJECT_ID);
      expect(inputArg).toEqual({
        subjectId: SUBJECT_ID,
        sessionType: 'homework',
        inputMode: 'text',
      });
    });

    it('returns 403 when subject is paused', async () => {
      const { SubjectInactiveError } = require('../services/session');
      mockStartSession.mockRejectedValueOnce(
        new SubjectInactiveError('paused'),
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/homework`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('SUBJECT_INACTIVE');
    });

    it('returns 403 when subject is archived', async () => {
      const { SubjectInactiveError } = require('../services/session');
      mockStartSession.mockRejectedValueOnce(
        new SubjectInactiveError('archived'),
      );

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/homework`,
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({}),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('SUBJECT_INACTIVE');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/homework`,
        {
          method: 'POST',
          body: JSON.stringify({}),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/ocr
  // -------------------------------------------------------------------------

  describe('POST /v1/ocr', () => {
    // Multipart/form-data requests must NOT include Content-Type: application/json —
    // the browser/fetch sets the multipart boundary automatically when body is FormData.
    const { 'Content-Type': _omit, ...OCR_HEADERS } = makeAuthHeaders({
      'X-Profile-Id': 'test-profile-id',
    });

    it('returns 200 with structured OCR result for valid image', async () => {
      const formData = new FormData();
      formData.append(
        'image',
        new File([new ArrayBuffer(100)], 'test.jpg', { type: 'image/jpeg' }),
      );

      const res = await app.request(
        '/v1/ocr',
        {
          method: 'POST',
          headers: OCR_HEADERS,
          body: formData,
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.text).toBe('Stub OCR text for testing');
      expect(body.confidence).toBe(0.95);
      expect(body.regions).toHaveLength(1);
      expect(body.regions[0].boundingBox).toEqual(expect.objectContaining({}));
    });

    it('[T-A4] routes OCR through the registry (router-always, no Gemini key) at the free vision tier', async () => {
      // Gemini-retirement Phase A: the route no longer passes GEMINI_API_KEY to
      // getOcrProvider — it passes the router-always signal (true) plus the
      // tier-derived llmTier. The billing mock yields effectiveAccessTier:'free'
      // → subscriptionTier 'free' → getTierConfig('free').llmTier === 'flash'.
      const { getOcrProvider } = require('../services/ocr') as {
        getOcrProvider: jest.Mock;
      };
      const formData = new FormData();
      formData.append(
        'image',
        new File([new ArrayBuffer(100)], 'test.jpg', { type: 'image/jpeg' }),
      );

      const res = await app.request(
        '/v1/ocr',
        { method: 'POST', headers: OCR_HEADERS, body: formData },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(getOcrProvider).toHaveBeenCalledWith(true, false, 'flash');
    });

    it('accepts image/png files', async () => {
      const formData = new FormData();
      formData.append(
        'image',
        new File([new ArrayBuffer(50)], 'test.png', { type: 'image/png' }),
      );

      const res = await app.request(
        '/v1/ocr',
        {
          method: 'POST',
          headers: OCR_HEADERS,
          body: formData,
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
    });

    it('accepts image/webp files', async () => {
      const formData = new FormData();
      formData.append(
        'image',
        new File([new ArrayBuffer(50)], 'test.webp', { type: 'image/webp' }),
      );

      const res = await app.request(
        '/v1/ocr',
        {
          method: 'POST',
          headers: OCR_HEADERS,
          body: formData,
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
    });

    it('returns 400 when image field is missing', async () => {
      const formData = new FormData();

      const res = await app.request(
        '/v1/ocr',
        {
          method: 'POST',
          headers: OCR_HEADERS,
          body: formData,
        },
        TEST_ENV,
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
          headers: OCR_HEADERS,
          body: formData,
        },
        TEST_ENV,
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
        new File([new ArrayBuffer(100)], 'test.gif', { type: 'image/gif' }),
      );

      const res = await app.request(
        '/v1/ocr',
        {
          method: 'POST',
          headers: OCR_HEADERS,
          body: formData,
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.details).toContain('Unsupported file type: image/gif');
      expect(body.details).toContain('image/jpeg');
      expect(body.details).toContain('image/png');
      expect(body.details).toContain('image/webp');
    });

    it('[BUG-283] returns 413 when Content-Length is larger than 2x the file cap, BEFORE parsing the body', async () => {
      // Twice the per-file cap (5MB) plus 1 byte — should be rejected at the
      // header check, before parseBody() consumes the multipart payload.
      const oversizeContentLength = OCR_CONSTRAINTS.maxFileSizeBytes * 2 + 1;

      const res = await app.request(
        '/v1/ocr',
        {
          method: 'POST',
          headers: {
            ...OCR_HEADERS,
            'Content-Length': String(oversizeContentLength),
            'Content-Type':
              'multipart/form-data; boundary=----WebKitFormBoundaryBUG283',
          },
          // Minimal body — the request never reaches parseBody() because the
          // header check fires first; this proves the early-reject path.
          body: '------WebKitFormBoundaryBUG283--\r\n',
        },
        TEST_ENV,
      );

      expect(res.status).toBe(413);
      const body = await res.json();
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.message).toContain('Request body too large');
    });

    it('returns 400 when file exceeds 5MB', async () => {
      const largeBuffer = new ArrayBuffer(5 * 1024 * 1024 + 1);
      const formData = new FormData();
      formData.append(
        'image',
        new File([largeBuffer], 'large.jpg', { type: 'image/jpeg' }),
      );

      const res = await app.request(
        '/v1/ocr',
        {
          method: 'POST',
          headers: OCR_HEADERS,
          body: formData,
        },
        TEST_ENV,
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
        new File([exactBuffer], 'exact.jpg', { type: 'image/jpeg' }),
      );

      const res = await app.request(
        '/v1/ocr',
        {
          method: 'POST',
          headers: OCR_HEADERS,
          body: formData,
        },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
    });

    it('[FIX-API-5] returns 500 (not 503) when OCR provider is not configured and captures Sentry', async () => {
      const { getOcrProvider } = require('../services/ocr') as {
        getOcrProvider: jest.Mock;
      };
      getOcrProvider.mockImplementationOnce(() => {
        throw new Error('OCR provider not configured');
      });
      (captureException as jest.Mock).mockClear();

      const formData = new FormData();
      formData.append(
        'image',
        new File([new ArrayBuffer(100)], 'test.jpg', { type: 'image/jpeg' }),
      );

      const res = await app.request(
        '/v1/ocr',
        {
          method: 'POST',
          headers: OCR_HEADERS,
          body: formData,
        },
        TEST_ENV,
      );

      // [FIX-API-5] Config error is a permanent server misconfiguration, not transient — 500 not 503
      expect(res.status).toBe(500);

      const body = await res.json();
      expect(body.code).toBe('INTERNAL_ERROR');
      expect(body.message).toBe(
        'OCR service is not configured. Please contact support.',
      );
      // [FIX-API-5] captureException must be called so ops can detect unconfigured OCR
      expect(captureException).toHaveBeenCalledTimes(1);
    });

    it('returns 401 without auth header', async () => {
      const formData = new FormData();
      formData.append(
        'image',
        new File([new ArrayBuffer(100)], 'test.jpg', { type: 'image/jpeg' }),
      );

      const res = await app.request(
        '/v1/ocr',
        {
          method: 'POST',
          body: formData,
        },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });

    it('returns 403 when profile cannot be resolved for OCR [CR-1B.5]', async () => {
      // findOwnerProfile returns null (default mock), so without X-Profile-Id
      // no profile is resolved. Since /v1/ocr is now a metered LLM route
      // [WI-155 / WI-77 allowlist sweep], assertNotProxyMode() in the metering
      // middleware fires first (profileMeta absent → fail closed with 403)
      // before the route handler's requireProfileId can return 400.
      const formData = new FormData();
      formData.append(
        'image',
        new File([new ArrayBuffer(100)], 'test.jpg', { type: 'image/jpeg' }),
      );

      const res = await app.request(
        '/v1/ocr',
        {
          method: 'POST',
          headers: makeAuthHeaders(),
          body: formData,
        },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
    });
  });
});
