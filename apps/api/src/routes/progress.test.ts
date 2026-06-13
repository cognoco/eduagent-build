// ---------------------------------------------------------------------------
// progress.test.ts — negative-path coverage for routes/progress.ts
// Phase 3 of test-coverage-hardening-plan.md
//
// Pattern: real JWT + real auth middleware, service layer mocked via
// gc1-allow pattern-a (requireActual + targeted overrides), database module
// mock so no DB connection required.
// ---------------------------------------------------------------------------

import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';

// ---------------------------------------------------------------------------
// Database mock
// ---------------------------------------------------------------------------

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({ includeActual: true });

jest.mock(
  '@eduagent/database' /* gc1-allow: route unit test — DB middleware injected via mock; real DB covered by route integration / e2e tests */,
  () => mockDatabaseModule.module,
);

// ---------------------------------------------------------------------------
// Account + profile service mocks
// ---------------------------------------------------------------------------

jest.mock('../services/account' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../services/account',
  ) as typeof import('../services/account');
  return {
    ...actual,
    findOrCreateAccount: jest.fn().mockResolvedValue({
      id: 'test-account-id',
      clerkUserId: 'user_test',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  };
});

jest.mock('../services/profile' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../services/profile',
  ) as typeof import('../services/profile');
  return {
    ...actual,
    findOwnerProfile: jest.fn().mockResolvedValue(null),
    getProfile: jest.fn().mockResolvedValue({
      id: 'test-profile-id',
      birthYear: 2008,
      location: null,
      consentStatus: 'CONSENTED',
      hasPremiumLlm: false,
      isOwner: true,
    }),
  };
});

// ---------------------------------------------------------------------------
// Progress service mocks
// ---------------------------------------------------------------------------

const mockGetSubjectProgress = jest.fn();
const mockGetTopicProgress = jest.fn();
const mockGetOverallProgress = jest.fn();
const mockGetContinueSuggestion = jest.fn();
const mockGetLearningResumeTarget = jest.fn();
const mockGetActiveSessionForTopic = jest.fn();
const mockResolveTopicSubject = jest.fn();

jest.mock('../services/progress' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../services/progress',
  ) as typeof import('../services/progress');
  return {
    ...actual,
    getSubjectProgress: (...args: unknown[]) => mockGetSubjectProgress(...args),
    getTopicProgress: (...args: unknown[]) => mockGetTopicProgress(...args),
    getOverallProgress: (...args: unknown[]) => mockGetOverallProgress(...args),
    getContinueSuggestion: (...args: unknown[]) =>
      mockGetContinueSuggestion(...args),
    getLearningResumeTarget: (...args: unknown[]) =>
      mockGetLearningResumeTarget(...args),
    getActiveSessionForTopic: (...args: unknown[]) =>
      mockGetActiveSessionForTopic(...args),
    resolveTopicSubject: (...args: unknown[]) =>
      mockResolveTopicSubject(...args),
  };
});

// ---------------------------------------------------------------------------
// Session service mock (listProfileSessions)
// ---------------------------------------------------------------------------

const mockListProfileSessions = jest.fn();

jest.mock(
  '../services/session/session-crud' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../services/session/session-crud',
    ) as typeof import('../services/session/session-crud');
    return {
      ...actual,
      listProfileSessions: (...args: unknown[]) =>
        mockListProfileSessions(...args),
    };
  },
);

// ---------------------------------------------------------------------------
// Monthly / weekly report service mocks
// ---------------------------------------------------------------------------

const mockListMonthlyReports = jest.fn();
const mockGetMonthlyReport = jest.fn();
const mockMarkMonthlyReportViewedForProfile = jest.fn();
const mockListWeeklyReports = jest.fn();
const mockGetWeeklyReport = jest.fn();
const mockMarkWeeklyReportViewedForProfile = jest.fn();

jest.mock(
  '../services/monthly-report' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../services/monthly-report',
    ) as typeof import('../services/monthly-report');
    return {
      ...actual,
      listMonthlyReportsForProfile: (...args: unknown[]) =>
        mockListMonthlyReports(...args),
      getMonthlyReportForProfile: (...args: unknown[]) =>
        mockGetMonthlyReport(...args),
      markMonthlyReportViewedForProfile: (...args: unknown[]) =>
        mockMarkMonthlyReportViewedForProfile(...args),
    };
  },
);

jest.mock(
  '../services/weekly-report' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../services/weekly-report',
    ) as typeof import('../services/weekly-report');
    return {
      ...actual,
      listWeeklyReportsForProfile: (...args: unknown[]) =>
        mockListWeeklyReports(...args),
      getWeeklyReportForProfile: (...args: unknown[]) =>
        mockGetWeeklyReport(...args),
      markWeeklyReportViewedForProfile: (...args: unknown[]) =>
        mockMarkWeeklyReportViewedForProfile(...args),
    };
  },
);

// ---------------------------------------------------------------------------
// Overdue + retention mocks
// ---------------------------------------------------------------------------

const mockGetOverdueTopicsGrouped = jest.fn();
const mockGetProfileOverdueCount = jest.fn();

jest.mock(
  '../services/overdue-topics' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../services/overdue-topics',
    ) as typeof import('../services/overdue-topics');
    return {
      ...actual,
      getOverdueTopicsGrouped: (...args: unknown[]) =>
        mockGetOverdueTopicsGrouped(...args),
    };
  },
);

jest.mock(
  '../services/retention-data' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../services/retention-data',
    ) as typeof import('../services/retention-data');
    return {
      ...actual,
      getProfileOverdueCount: (...args: unknown[]) =>
        mockGetProfileOverdueCount(...args),
    };
  },
);

// ---------------------------------------------------------------------------
// Inngest framework boundary mock (required by index.ts import chain)
// ---------------------------------------------------------------------------

jest.mock('inngest/hono', () => ({
  // gc1-allow: Inngest framework boundary
  serve: jest.fn().mockReturnValue(jest.fn()),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { app } from '../index';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';
import { SchemaDriftError } from '@eduagent/schemas';
import * as sentryService from '../services/sentry';

// jest.spyOn on the real Sentry wrapper — no jest.mock(), no internal-mock
// debt. Sentry SDK no-ops without a DSN (see services/sentry.ts comment), so
// the real captureException is safe to invoke in tests; the spy lets us
// assert "the route handler did NOT redundantly capture" without stubbing
// the module.
const mockCaptureException = jest.spyOn(sentryService, 'captureException');

const TEST_ENV = { ...BASE_AUTH_ENV };
const AUTH_HEADERS = makeAuthHeaders({ 'X-Profile-Id': 'test-profile-id' });

const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const TOPIC_ID = '550e8400-e29b-41d4-a716-446655440001';
const REPORT_ID = '550e8400-e29b-41d4-a716-446655440002';

// ---------------------------------------------------------------------------
// Canonical mock data — schema-conformant values for happy-path tests
// ---------------------------------------------------------------------------

const MOCK_SUBJECT_PROGRESS = {
  subjectId: SUBJECT_ID,
  name: 'History',
  topicsTotal: 10,
  topicsCompleted: 3,
  topicsVerified: 1,
  topicsMastered: 1,
  topicsLearning: 2,
  urgencyScore: 0.4,
  retentionStatus: 'strong' as const,
  lastSessionAt: '2026-05-01T10:00:00.000Z',
};

const MOCK_TOPIC_PROGRESS = {
  topicId: TOPIC_ID,
  title: 'World War I',
  description: 'The Great War',
  completionStatus: 'in_progress' as const,
  retentionStatus: 'fading' as const,
  daysSinceLastReview: 3,
  struggleStatus: 'normal' as const,
  masteryScore: 0.4,
  summaryExcerpt: 'Brief overview',
  xpStatus: null,
  totalSessions: 2,
  masteredAt: null,
  strongReviews: 2,
  strongReviewsTarget: 5,
};

const MOCK_OVERVIEW = {
  subjects: [],
  totalTopicsCompleted: 5,
  totalTopicsVerified: 2,
  totalTopicsMastered: 2,
  totalTopicsLearning: 3,
  practiceActivityCount: 0,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('progress routes', () => {
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

  // ---- GET /v1/subjects/:subjectId/progress --------------------------------

  describe('GET /v1/subjects/:subjectId/progress', () => {
    it('returns 200 with subject progress', async () => {
      mockGetSubjectProgress.mockResolvedValueOnce(MOCK_SUBJECT_PROGRESS);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/progress`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockGetSubjectProgress).toHaveBeenCalledTimes(1);
      const [, profileIdArg, subjectIdArg] =
        mockGetSubjectProgress.mock.calls[0];
      expect(profileIdArg).toBe('test-profile-id');
      expect(subjectIdArg).toBe(SUBJECT_ID);
    });

    it('returns 404 when subject not found', async () => {
      mockGetSubjectProgress.mockResolvedValueOnce(null);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/progress`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/progress`,
        {},
        TEST_ENV,
      );
      expect(res.status).toBe(401);
      expect(mockGetSubjectProgress).not.toHaveBeenCalled();
    });

    it('returns 400 when profile cannot be resolved (no X-Profile-Id and no owner)', async () => {
      // findOwnerProfile returns null by default, so without X-Profile-Id
      // profileId stays undefined → requireProfileId throws 400
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/progress`,
        { headers: makeAuthHeaders() },
        TEST_ENV,
      );
      expect(res.status).toBe(400);
      expect(mockGetSubjectProgress).not.toHaveBeenCalled();
    });
  });

  // ---- GET /v1/subjects/:subjectId/topics/:topicId/progress ---------------

  describe('GET /v1/subjects/:subjectId/topics/:topicId/progress', () => {
    it('returns 200 with topic progress', async () => {
      mockGetTopicProgress.mockResolvedValueOnce(MOCK_TOPIC_PROGRESS);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/progress`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
    });

    it('returns 404 when topic not found', async () => {
      mockGetTopicProgress.mockResolvedValueOnce(null);

      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/progress`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        `/v1/subjects/${SUBJECT_ID}/topics/${TOPIC_ID}/progress`,
        {},
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });

  // ---- GET /v1/progress/sessions -------------------------------------------

  describe('GET /v1/progress/sessions', () => {
    it('returns 200 with paginated sessions', async () => {
      mockListProfileSessions.mockResolvedValueOnce({
        sessions: [],
        nextCursor: null,
      });

      const res = await app.request(
        '/v1/progress/sessions?limit=10',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('sessions');
      expect(body).toHaveProperty('nextCursor');
    });

    it('returns 200 with empty sessions array (not 404)', async () => {
      mockListProfileSessions.mockResolvedValueOnce({
        sessions: [],
        nextCursor: null,
      });

      const res = await app.request(
        '/v1/progress/sessions',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sessions).toEqual([]);
      expect(body.nextCursor).toBeNull();
    });

    it('returns 400 for invalid limit (zero)', async () => {
      const res = await app.request(
        '/v1/progress/sessions?limit=0',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );
      expect(res.status).toBe(400);
      expect(mockListProfileSessions).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid limit (negative)', async () => {
      const res = await app.request(
        '/v1/progress/sessions?limit=-5',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );
      expect(res.status).toBe(400);
      expect(mockListProfileSessions).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid limit (over max)', async () => {
      const res = await app.request(
        '/v1/progress/sessions?limit=999',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );
      expect(res.status).toBe(400);
      expect(mockListProfileSessions).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid limit (non-numeric)', async () => {
      const res = await app.request(
        '/v1/progress/sessions?limit=abc',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );
      expect(res.status).toBe(400);
      expect(mockListProfileSessions).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid cursor (not a UUID)', async () => {
      const res = await app.request(
        '/v1/progress/sessions?cursor=not-a-uuid',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );
      expect(res.status).toBe(400);
      expect(mockListProfileSessions).not.toHaveBeenCalled();
    });

    it('passes cursor correctly on subsequent pages', async () => {
      mockListProfileSessions.mockResolvedValueOnce({
        sessions: [],
        nextCursor: null,
      });
      const cursor = '550e8400-e29b-41d4-a716-446655440099';

      const res = await app.request(
        `/v1/progress/sessions?cursor=${cursor}&limit=10`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockListProfileSessions).toHaveBeenCalledTimes(1);
      const [, profileIdArg, optionsArg] =
        mockListProfileSessions.mock.calls[0];
      expect(profileIdArg).toBe('test-profile-id');
      expect(optionsArg).toMatchObject({ cursor, limit: 10 });
    });

    it('returns 401 without auth', async () => {
      const res = await app.request('/v1/progress/sessions', {}, TEST_ENV);
      expect(res.status).toBe(401);
    });
  });

  // ---- GET /v1/progress/overview -------------------------------------------

  describe('GET /v1/progress/overview', () => {
    it('returns 200 with overview data', async () => {
      mockGetOverallProgress.mockResolvedValueOnce(MOCK_OVERVIEW);

      const res = await app.request(
        '/v1/progress/overview',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
    });

    it('returns 401 without auth', async () => {
      const res = await app.request('/v1/progress/overview', {}, TEST_ENV);
      expect(res.status).toBe(401);
    });
  });

  // ---- GET /v1/progress/review-summary ------------------------------------

  describe('GET /v1/progress/review-summary', () => {
    it('returns 200 with review summary', async () => {
      mockGetProfileOverdueCount.mockResolvedValueOnce({
        overdueCount: 0,
        nextReviewTopic: null,
        nextUpcomingReviewAt: null,
      });

      const res = await app.request(
        '/v1/progress/review-summary',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.totalOverdue).toBe(0);
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        '/v1/progress/review-summary',
        {},
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });

  // ---- GET /v1/progress/overdue-topics ------------------------------------

  describe('GET /v1/progress/overdue-topics', () => {
    it('returns 200 with overdue topics', async () => {
      mockGetOverdueTopicsGrouped.mockResolvedValueOnce({
        totalOverdue: 0,
        subjects: [],
        truncated: false,
        displayedCount: 0,
      });

      const res = await app.request(
        '/v1/progress/overdue-topics',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.totalOverdue).toBe(0);
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        '/v1/progress/overdue-topics',
        {},
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });

  // ---- GET /v1/progress/reports --------------------------------------------

  describe('GET /v1/progress/reports', () => {
    it('returns 200 with empty reports array (not 404)', async () => {
      mockListMonthlyReports.mockResolvedValueOnce([]);

      const res = await app.request(
        '/v1/progress/reports',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.reports).toEqual([]);
    });

    it('returns 401 without auth', async () => {
      const res = await app.request('/v1/progress/reports', {}, TEST_ENV);
      expect(res.status).toBe(401);
    });
  });

  // ---- GET /v1/progress/reports/:reportId ----------------------------------

  describe('GET /v1/progress/reports/:reportId', () => {
    it('returns 404 when report not found and does NOT capture to Sentry [CCR PR #215]', async () => {
      mockGetMonthlyReport.mockResolvedValueOnce(null);

      const res = await app.request(
        `/v1/progress/reports/${REPORT_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
      // Missing rows are a normal client outcome, not a server fault.
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('returns 500 when row exists but fails schema validation [CCR PR #215]', async () => {
      // Service signals schema drift by throwing SchemaDriftError. The global
      // error handler converts to HTTP 500. Sentry capture happens in the
      // service layer (mapMonthlyReportRow) with richer row-level context
      // (row PK, profileId, childProfileId, zod issues) — NOT in the global
      // handler, which would produce a second duplicate event per drift.
      // Capture correctness is asserted in: services/monthly-report.test.ts
      // (schema-drift break tests, [CCR PR #215]).
      // In this route-level test the service is mocked, so no real captureException
      // call flows through — we assert only the HTTP contract here.
      const issues = [
        { path: ['reportData'], message: 'Expected object, received string' },
      ];
      mockGetMonthlyReport.mockRejectedValueOnce(
        new SchemaDriftError('MonthlyReport', issues),
      );

      const res = await app.request(
        `/v1/progress/reports/${REPORT_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.code).toBe('INTERNAL_ERROR');
      // Global handler does NOT call captureException for SchemaDriftError —
      // the service already did. See: services/monthly-report.test.ts for the
      // single-capture assertion.
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('passes profileId to service (prevents cross-profile IDOR)', async () => {
      mockGetMonthlyReport.mockResolvedValueOnce(null);

      await app.request(
        `/v1/progress/reports/${REPORT_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(mockGetMonthlyReport).toHaveBeenCalledTimes(1);
      const [, profileIdArg, reportIdArg] = mockGetMonthlyReport.mock.calls[0];
      expect(profileIdArg).toBe('test-profile-id');
      expect(reportIdArg).toBe(REPORT_ID);
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        `/v1/progress/reports/${REPORT_ID}`,
        {},
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });

  // ---- POST /v1/progress/reports/:reportId/view [LEARN-29] -----------------

  describe('POST /v1/progress/reports/:reportId/view', () => {
    it('returns 200 {viewed:true} and scopes the mark to the active profile', async () => {
      mockMarkMonthlyReportViewedForProfile.mockResolvedValueOnce(true);

      const res = await app.request(
        `/v1/progress/reports/${REPORT_ID}/view`,
        { method: 'POST', headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ viewed: true });
      expect(mockMarkMonthlyReportViewedForProfile).toHaveBeenCalledTimes(1);
      const [, profileIdArg, reportIdArg] =
        mockMarkMonthlyReportViewedForProfile.mock.calls[0];
      expect(profileIdArg).toBe('test-profile-id');
      expect(reportIdArg).toBe(REPORT_ID);
    });

    it('returns 404 when no report matches the active profile (foreign/unknown id)', async () => {
      mockMarkMonthlyReportViewedForProfile.mockResolvedValueOnce(false);

      const res = await app.request(
        `/v1/progress/reports/${REPORT_ID}/view`,
        { method: 'POST', headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        `/v1/progress/reports/${REPORT_ID}/view`,
        { method: 'POST' },
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });

  // ---- GET /v1/progress/weekly-reports -------------------------------------

  describe('GET /v1/progress/weekly-reports', () => {
    it('returns 200 with empty array (not 404)', async () => {
      mockListWeeklyReports.mockResolvedValueOnce([]);

      const res = await app.request(
        '/v1/progress/weekly-reports',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.reports).toEqual([]);
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        '/v1/progress/weekly-reports',
        {},
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });

  // ---- GET /v1/progress/weekly-reports/:weeklyReportId --------------------

  describe('GET /v1/progress/weekly-reports/:weeklyReportId', () => {
    it('returns 404 when weekly report not found and does NOT capture to Sentry [CCR PR #215]', async () => {
      mockGetWeeklyReport.mockResolvedValueOnce(null);

      const res = await app.request(
        `/v1/progress/weekly-reports/${REPORT_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('returns 500 when row exists but fails schema validation [CCR PR #215]', async () => {
      // Service signals schema drift by throwing SchemaDriftError. The global
      // error handler converts to HTTP 500. Sentry capture happens in the
      // service layer (mapWeeklyReportRow) — NOT in the global handler to
      // avoid duplicate Sentry events per drift. Capture correctness is
      // asserted in: services/weekly-report.test.ts (schema-drift break tests,
      // [CCR PR #215]). In this route-level test the service is mocked, so no
      // real captureException flows through — we assert only the HTTP contract.
      const issues = [
        { path: ['reportData'], message: 'Expected object, received string' },
      ];
      mockGetWeeklyReport.mockRejectedValueOnce(
        new SchemaDriftError('WeeklyReport', issues),
      );

      const res = await app.request(
        `/v1/progress/weekly-reports/${REPORT_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.code).toBe('INTERNAL_ERROR');
      // Global handler does NOT call captureException for SchemaDriftError —
      // the service already did. See: services/weekly-report.test.ts for the
      // single-capture assertion.
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('passes profileId to service (prevents cross-profile IDOR)', async () => {
      mockGetWeeklyReport.mockResolvedValueOnce(null);

      await app.request(
        `/v1/progress/weekly-reports/${REPORT_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(mockGetWeeklyReport).toHaveBeenCalledTimes(1);
      const [, profileIdArg, reportIdArg] = mockGetWeeklyReport.mock.calls[0];
      expect(profileIdArg).toBe('test-profile-id');
      expect(reportIdArg).toBe(REPORT_ID);
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        `/v1/progress/weekly-reports/${REPORT_ID}`,
        {},
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });

  // ---- POST /v1/progress/weekly-reports/:weeklyReportId/view [LEARN-29] ----

  describe('POST /v1/progress/weekly-reports/:weeklyReportId/view', () => {
    it('returns 200 {viewed:true} and scopes the mark to the active profile', async () => {
      mockMarkWeeklyReportViewedForProfile.mockResolvedValueOnce(true);

      const res = await app.request(
        `/v1/progress/weekly-reports/${REPORT_ID}/view`,
        { method: 'POST', headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ viewed: true });
      expect(mockMarkWeeklyReportViewedForProfile).toHaveBeenCalledTimes(1);
      const [, profileIdArg, reportIdArg] =
        mockMarkWeeklyReportViewedForProfile.mock.calls[0];
      expect(profileIdArg).toBe('test-profile-id');
      expect(reportIdArg).toBe(REPORT_ID);
    });

    it('returns 404 when no weekly report matches the active profile', async () => {
      mockMarkWeeklyReportViewedForProfile.mockResolvedValueOnce(false);

      const res = await app.request(
        `/v1/progress/weekly-reports/${REPORT_ID}/view`,
        { method: 'POST', headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        `/v1/progress/weekly-reports/${REPORT_ID}/view`,
        { method: 'POST' },
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });

  // ---- GET /v1/progress/topic/:topicId/active-session ----------------------

  describe('GET /v1/progress/topic/:topicId/active-session', () => {
    it('returns 200 with null when no session active', async () => {
      mockGetActiveSessionForTopic.mockResolvedValueOnce(null);

      const res = await app.request(
        `/v1/progress/topic/${TOPIC_ID}/active-session`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        `/v1/progress/topic/${TOPIC_ID}/active-session`,
        {},
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });

  // ---- GET /v1/topics/:topicId/resolve ------------------------------------

  describe('GET /v1/topics/:topicId/resolve', () => {
    it('returns 200 with resolve result', async () => {
      mockResolveTopicSubject.mockResolvedValueOnce({
        subjectId: SUBJECT_ID,
        subjectName: 'History',
        topicTitle: 'World War I',
      });

      const res = await app.request(
        `/v1/topics/${TOPIC_ID}/resolve`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
    });

    it('returns 404 when topic not found', async () => {
      mockResolveTopicSubject.mockResolvedValueOnce(null);

      const res = await app.request(
        `/v1/topics/${TOPIC_ID}/resolve`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('returns 401 without auth', async () => {
      const res = await app.request(
        `/v1/topics/${TOPIC_ID}/resolve`,
        {},
        TEST_ENV,
      );
      expect(res.status).toBe(401);
    });
  });

  // ---- GET /v1/progress/resume-target -------------------------------------

  describe('GET /v1/progress/resume-target', () => {
    it('returns 200 with null target when none available', async () => {
      mockGetLearningResumeTarget.mockResolvedValueOnce(null);

      const res = await app.request(
        '/v1/progress/resume-target',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      // The route does: resumeTargetResponseSchema.parse({ target })
      // where target = null — null is valid per the schema (target is nullable).
      expect(res.status).toBe(200);
    });

    it('returns 401 without auth', async () => {
      const res = await app.request('/v1/progress/resume-target', {}, TEST_ENV);
      expect(res.status).toBe(401);
    });
  });

  // ---- GET /v1/progress/continue -------------------------------------------

  describe('GET /v1/progress/continue', () => {
    it('returns 200 with null suggestion when none available', async () => {
      mockGetContinueSuggestion.mockResolvedValueOnce(null);

      const res = await app.request(
        '/v1/progress/continue',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      // The route does: continueSuggestionResponseSchema.parse({ suggestion })
      // where suggestion = null — null is valid per the schema (suggestion is nullable).
      expect(res.status).toBe(200);
    });

    it('returns 401 without auth', async () => {
      const res = await app.request('/v1/progress/continue', {}, TEST_ENV);
      expect(res.status).toBe(401);
    });
  });
});
