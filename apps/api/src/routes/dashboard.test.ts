// ---------------------------------------------------------------------------
// Real JWT + real auth middleware — no jwt module mock
// ---------------------------------------------------------------------------

import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';
import {
  TEST_PROFILE_ID,
  TEST_SESSION_ID,
  TEST_PROFILE_ID_2,
} from '@eduagent/test-utils';

import { createDatabaseModuleMock } from '../test-utils/database-module';
import { personScope } from '../test-utils/identity-v2-scope-mock';

const mockDatabaseModule = createDatabaseModuleMock({ includeActual: true });
const mockFindFamilyLink = jest.fn().mockResolvedValue({
  parentProfileId: 'test-profile-id',
  childProfileId: TEST_PROFILE_ID,
});
const familyLinksQuery = {
  findFirst: (...args: unknown[]) => mockFindFamilyLink(...args),
  findMany: jest.fn().mockResolvedValue([]),
};

const mockFindConsentState = jest.fn().mockResolvedValue(undefined);
const consentStatesQuery = {
  findFirst: (...args: unknown[]) => mockFindConsentState(...args),
  findMany: jest.fn().mockResolvedValue([]),
};

mockDatabaseModule.db.query = new Proxy(mockDatabaseModule.db.query as object, {
  get(target, prop, receiver) {
    if (prop === 'familyLinks') return familyLinksQuery;
    // [WI-867] Post-collapse: assertParentAccess → validateGuardianChargeRelationshipV2
    // → isGuardianOf reads db.query.guardianship (v2 edge table). Wire to the same
    // mockFindFamilyLink so existing tests work unchanged.
    if (prop === 'guardianship') return familyLinksQuery;
    if (prop === 'consentStates') return consentStatesQuery;
    return Reflect.get(target, prop, receiver);
  },
});

jest.mock(
  '@eduagent/database' /* gc1-allow: route unit test — DB middleware injected via mock; real DB covered by route integration / e2e tests */,
  () => mockDatabaseModule.module,
);

const mockFindOrCreateAccount = jest.fn().mockResolvedValue({
  id: 'test-account-id',
  clerkUserId: 'user_test',
  email: 'test@example.com',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

jest.mock('../services/account', () => {
  const actual = jest.requireActual(
    '../services/account',
  ) as typeof import('../services/account');
  return {
    ...actual,
    findOrCreateAccount: (...args: unknown[]) =>
      mockFindOrCreateAccount(...args),
  };
});

const mockFindOwnerProfile = jest.fn().mockResolvedValue(null);
const mockGetProfile = jest.fn().mockResolvedValue({
  id: 'test-profile-id',
  birthYear: null,
  location: null,
  consentStatus: 'CONSENTED',
  // [CR-2026-05-19-H1] isOwner:true so owner-gated routes pass in happy-path tests.
  isOwner: true,
  hasPremiumLlm: false,
  conversationLanguage: 'en',
});

jest.mock('../services/profile', () => {
  const actual = jest.requireActual(
    '../services/profile',
  ) as typeof import('../services/profile');
  return {
    ...actual,
    findOwnerProfile: (...args: unknown[]) => mockFindOwnerProfile(...args),
    getProfile: (...args: unknown[]) => mockGetProfile(...args),
  };
});

// [WI-867] Post-collapse, profile-scope middleware resolves the caller via the
// v2 `findOwnerPersonScope` (auto-resolve) / `getPersonScope` (X-Profile-Id)
// seam, which uses db.select() join chains the unit mock DB can't satisfy.
// Continuity mock — the v2 rename of the legacy `findOwnerProfile`/`getProfile`
// mocks above. Owner by default; the non-owner suite overrides getPersonScope.
// Mirror the legacy defaults: findOwnerProfile defaulted to null (no
// auto-resolve owner → routes 400 on missing X-Profile-Id); getProfile
// defaulted to the owner profile.
const mockFindOwnerPersonScope = jest.fn().mockResolvedValue(null);
const mockGetPersonScope = jest.fn().mockResolvedValue(personScope());
jest.mock(
  '../services/identity-v2/profile-v2' /* gc1-allow: continuity — replaces the pre-collapse findOwnerProfile/getProfile mock; db.select() join chain unrunnable on the unit mock DB; real path covered by the identity integration suite */,
  () => ({
    ...jest.requireActual('../services/identity-v2/profile-v2'),
    findOwnerPersonScope: (...a: unknown[]) => mockFindOwnerPersonScope(...a),
    getPersonScope: (...a: unknown[]) => mockGetPersonScope(...a),
  }),
);

const mockGetChildrenForParent = jest.fn().mockResolvedValue([]);
const mockGetChildDetail = jest.fn().mockResolvedValue(null);
const mockGetChildSubjectTopics = jest.fn().mockResolvedValue([]);

jest.mock('../services/dashboard', () => {
  const actual = jest.requireActual(
    '../services/dashboard',
  ) as typeof import('../services/dashboard');
  return {
    ...actual,
    getChildrenForParent: (...args: unknown[]) =>
      mockGetChildrenForParent(...args),
    getChildDetail: (...args: unknown[]) => mockGetChildDetail(...args),
    getChildSubjectTopics: (...args: unknown[]) =>
      mockGetChildSubjectTopics(...args),
  };
});

const mockGetLatestVerifiedProofForChild = jest
  .fn()
  .mockResolvedValue({ hasProof: false, quote: null });

// [WI-1658] Route-unit test — shallow-mocking the parent-proof service is
// intentional here (matches the weekly-report precedent above): the read
// service does raw db.select()/join chains the shared route-test fake DB
// isn't wired for. Integration coverage for the real DB read (assessments /
// topic_notes / retentionCards join + the artifactSource-marker filter) lives
// in parent-proof.integration.test.ts.
jest.mock('../services/parent-proof', () => {
  const actual = jest.requireActual(
    '../services/parent-proof',
  ) as typeof import('../services/parent-proof');
  return {
    ...actual,
    getLatestVerifiedProofForChild: (...args: unknown[]) =>
      mockGetLatestVerifiedProofForChild(...args),
  };
});

const mockGetProgressSummary = jest.fn().mockResolvedValue({
  summary: null,
  generatedAt: null,
  basedOnLastSessionAt: null,
  latestSessionId: null,
  activityState: 'no_recent_activity',
  nudgeRecommended: true,
});

jest.mock(
  '../services/progress-summary' /* gc1-allow: route test isolates progress summary service contract */,
  () => {
    const actual = jest.requireActual(
      '../services/progress-summary',
    ) as typeof import('../services/progress-summary');
    return {
      ...actual,
      getProgressSummary: (...args: unknown[]) =>
        mockGetProgressSummary(...args),
    };
  },
);

const mockListWeeklyReports = jest.fn().mockResolvedValue([]);
const mockGetWeeklyReport = jest.fn().mockResolvedValue(null);
const mockMarkWeeklyReportViewed = jest.fn().mockResolvedValue(undefined);

// NOTE: This is a route-unit test — shallow-mocking the weekly-report service
// is intentional here. Integration coverage for the service layer lives in the
// Inngest integration test (weekly-progress-push.integration.test.ts).
jest.mock('../services/weekly-report', () => {
  const actual = jest.requireActual(
    '../services/weekly-report',
  ) as typeof import('../services/weekly-report');
  return {
    ...actual,
    listWeeklyReportsForParentChild: (...args: unknown[]) =>
      mockListWeeklyReports(...args),
    getWeeklyReportForParentChild: (...args: unknown[]) =>
      mockGetWeeklyReport(...args),
    markWeeklyReportViewed: (...args: unknown[]) =>
      mockMarkWeeklyReportViewed(...args),
  };
});

// [WI-1989] assertCallerIsAccountOwner calls verifyPersonIsOrgAdminV2, which
// runs a raw membership query the fully-mocked DB module cannot satisfy.
// Every scenario in this file that currently reaches assertCallerIsAccountOwner
// is a caller-owner scenario (the non-owner break tests are rejected earlier by
// assertOwnerProfile's / assertOwnerAndParentAccess's X-Profile-Id-resolved
// isOwner check, before this guard runs) — the caller-vs-X-Profile-Id-spoof
// distinction this guard exists to enforce is covered by the real-DB break
// test in tests/integration/wi1989-owner-idor.integration.test.ts.
jest.mock('../services/identity-v2/ownership-v2', () => {
  const actual = jest.requireActual(
    '../services/identity-v2/ownership-v2',
  ) as typeof import('../services/identity-v2/ownership-v2');
  return {
    ...actual,
    verifyPersonIsOrgAdminV2: jest.fn().mockResolvedValue(true),
  };
});

import { app } from '../index';
import { ForbiddenError } from '../errors';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';
import { extractDrizzleParamValues } from '../test-utils/drizzle-introspection';
import { ERROR_CODES } from '@eduagent/schemas';

const TEST_ENV = {
  ...BASE_AUTH_ENV,
  DATABASE_URL: 'postgresql://test:test@localhost/test',
};

const AUTH_HEADERS = makeAuthHeaders({ 'X-Profile-Id': 'test-profile-id' });

const PROFILE_ID = TEST_PROFILE_ID;
const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('dashboard routes', () => {
  beforeAll(() => {
    installTestJwksInterceptor();
  });

  afterAll(() => {
    restoreTestFetch();
  });

  beforeEach(() => {
    clearJWKSCache();
    jest.clearAllMocks();
    mockFindFamilyLink.mockResolvedValue({
      parentProfileId: 'test-profile-id',
      childProfileId: PROFILE_ID,
    });
    // Reset the mock queue (clearAllMocks does NOT clear mockResolvedValueOnce
    // queues), then restore the default.
    mockFindConsentState.mockReset();
    mockFindConsentState.mockResolvedValue(undefined);
    // [WI-867] Restore the profile-scope v2 seam defaults after clearAllMocks.
    mockFindOwnerPersonScope.mockResolvedValue(null);
    mockGetPersonScope.mockResolvedValue(personScope());
  });

  // -------------------------------------------------------------------------
  // GET /v1/dashboard
  // -------------------------------------------------------------------------

  describe('GET /v1/dashboard', () => {
    it('returns 200 with dashboard data', async () => {
      const res = await app.request(
        '/v1/dashboard',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.children).toEqual([]);
      expect(body.demoMode).toBe(false);
      expect(mockGetChildrenForParent).toHaveBeenCalledWith(
        expect.anything(),
        'test-profile-id',
        'test-profile-id',
        'test-account-id',
      );
    });

    it('returns 400 when authenticated but missing X-Profile-Id header', async () => {
      const res = await app.request(
        '/v1/dashboard',
        {
          headers: makeAuthHeaders(),
        },
        TEST_ENV,
      );

      expect(res.status).toBe(400);
      expect(mockGetChildrenForParent).not.toHaveBeenCalled();
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/dashboard', {}, TEST_ENV);

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/dashboard/children/:profileId
  // -------------------------------------------------------------------------

  describe('GET /v1/dashboard/children/:profileId', () => {
    it('returns 200 with child data', async () => {
      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.child).toBeNull();
      expect(mockGetChildDetail).toHaveBeenCalledWith(
        expect.anything(),
        'test-profile-id',
        PROFILE_ID,
        'test-profile-id',
        'test-account-id',
      );
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}`,
        {},
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });

    // Regression: commit d1a1f27d5 (2026-05-07) added a route-entry call to
    // assertChildDashboardDataVisible that threw ForbiddenError (→ 403)
    // whenever the child's latest consent status was not CONSENTED. The
    // mobile child-detail screen handles restricted consent by rendering a
    // dedicated panel using the redacted child object that getChildDetail
    // returns via redactDashboardChild — but the route-level 403 short-
    // circuited the response, so parents landed on a generic "Try Again /
    // Back to dashboard" error fallback instead of the consent-restricted
    // panel.
    //
    // Fix: removed the route-entry assertion. assertParentAccess (the IDOR
    // guard) still runs. Service-layer redaction zeroes metrics for non-
    // CONSENTED status, so the response is safe. Parameterized across every
    // non-CONSENTED status so the route is verified to never 403 on any of
    // the redaction-eligible states.
    //
    // Contract split (so this test is not the only guard):
    //   - THIS test (route-unit) only proves: the route returns 200 instead
    //     of 403 for every non-CONSENTED status, and surfaces whatever
    //     getChildDetail returns. It mocks getChildDetail with an already-
    //     redacted payload, so it does NOT verify that redactDashboardChild
    //     actually zeroes restricted fields.
    //   - The redaction-correctness guarantee lives in the service
    //     integration test:
    //       apps/api/src/services/dashboard.integration.test.ts
    //         → "redacts dashboard learning metrics for $status consent"
    //     That test seeds a real session (exchangeCount: 8,
    //     wallClockSeconds: 660) for each non-CONSENTED status, calls the
    //     real getChildDetail against a real DB, and asserts that every
    //     learning metric is zeroed and the summary copy is replaced —
    //     so a regression that stopped zeroing fields fails there.
    //   - Together these two tests cover the full "no 403, and metrics are
    //     actually hidden" contract for non-CONSENTED children. Do not
    //     weaken either one without re-checking the other still holds.
    it.each([
      {
        status: 'PENDING' as const,
        summary:
          'Timmy: consent is pending. Learning metrics are hidden until consent is active.',
      },
      {
        status: 'PARENTAL_CONSENT_REQUESTED' as const,
        summary:
          'Timmy: waiting for parent approval. Learning metrics are hidden until consent is active.',
      },
      {
        status: 'WITHDRAWN' as const,
        summary:
          'Timmy: consent has been withdrawn. Learning metrics are hidden.',
      },
    ])(
      '[BUG-62] returns 200 with redacted child for $status consent (regression: route used to 403)',
      async ({ status, summary }) => {
        mockFindConsentState.mockResolvedValueOnce({ status });
        const redactedChild = {
          profileId: PROFILE_ID,
          displayName: 'Timmy',
          organizationTimezone: null,
          consentStatus: status,
          respondedAt: null,
          summary,
          sessionsThisWeek: 0,
          sessionsLastWeek: 0,
          totalTimeThisWeek: 0,
          totalTimeLastWeek: 0,
          exchangesThisWeek: 0,
          exchangesLastWeek: 0,
          trend: 'stable' as const,
          subjects: [],
          guidedVsImmediateRatio: 0,
          retentionTrend: 'stable' as const,
          totalSessions: 0,
          currentlyWorkingOn: [],
          progress: null,
          currentStreak: 0,
          longestStreak: 0,
          totalXp: 0,
        };
        mockGetChildDetail.mockResolvedValueOnce(redactedChild);

        const res = await app.request(
          `/v1/dashboard/children/${PROFILE_ID}`,
          { headers: AUTH_HEADERS },
          TEST_ENV,
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.child).toMatchObject({
          profileId: PROFILE_ID,
          displayName: 'Timmy',
          organizationTimezone: null,
          consentStatus: status,
          sessionsThisWeek: 0,
          totalSessions: 0,
        });
      },
    );
  });

  // -------------------------------------------------------------------------
  // GET /v1/dashboard/children/:profileId/subjects/:subjectId
  // -------------------------------------------------------------------------

  describe('GET /v1/dashboard/children/:profileId/subjects/:subjectId', () => {
    it('returns 200 with child subject data', async () => {
      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/subjects/${SUBJECT_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.topics).toEqual([]);
      expect(mockGetChildSubjectTopics).toHaveBeenCalledWith(
        expect.anything(),
        'test-profile-id',
        PROFILE_ID,
        SUBJECT_ID,
        'test-profile-id',
        'test-account-id',
      );
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/subjects/${SUBJECT_ID}`,
        {},
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });
  });

  describe('GET /v1/dashboard/children/:profileId/progress-summary', () => {
    it('passes the server-resolved caller and organization to the service', async () => {
      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/progress-summary`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockGetProgressSummary).toHaveBeenCalledWith(
        expect.anything(),
        'test-profile-id',
        PROFILE_ID,
        'test-profile-id',
        'test-account-id',
      );
    });
  });

  // -------------------------------------------------------------------------
  // [WI-1658] GET /v1/dashboard/children/:profileId/verified-proof
  // -------------------------------------------------------------------------

  describe('GET /v1/dashboard/children/:profileId/verified-proof', () => {
    it('returns 200 with the verified-proof shape for an owner requesting their own child', async () => {
      mockGetLatestVerifiedProofForChild.mockResolvedValueOnce({
        hasProof: true,
        topicId: SUBJECT_ID,
        topicTitle: 'Photosynthesis',
        subjectId: SUBJECT_ID,
        sessionId: TEST_SESSION_ID,
        verifiedAt: new Date().toISOString(),
        quote: 'Plants convert light into chemical energy.',
        masteryVerificationState: 'fresh',
        retentionStatus: 'strong',
      });

      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/verified-proof`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        hasProof: true,
        topicTitle: 'Photosynthesis',
        quote: 'Plants convert light into chemical energy.',
        masteryVerificationState: 'fresh',
        retentionStatus: 'strong',
      });
      expect(mockGetLatestVerifiedProofForChild).toHaveBeenCalledWith(
        expect.anything(),
        'test-profile-id',
        PROFILE_ID,
      );
    });

    it('returns 200 with hasProof:false for a child with no verified assessment', async () => {
      mockGetLatestVerifiedProofForChild.mockResolvedValueOnce({
        hasProof: false,
        quote: null,
      });

      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/verified-proof`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ hasProof: false, quote: null });
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/verified-proof`,
        {},
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/dashboard/demo
  // -------------------------------------------------------------------------

  describe('GET /v1/dashboard/demo', () => {
    it('returns 200 with demo data', async () => {
      const res = await app.request(
        '/v1/dashboard/demo',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.demoMode).toBe(true);
      expect(body.children).toHaveLength(2);
      expect(body.children[0].profileId).toBe('demo-child-1');
      expect(body.children[0].displayName).toBe('Alex');
      expect(body.children[0].trend).toBe('up');
      expect(body.children[0].subjects).toHaveLength(2);
      expect(body.children[1].profileId).toBe('demo-child-2');
      expect(body.children[1].displayName).toBe('Sam');
      expect(body.children[1].trend).toBe('stable');
      expect(body.children[1].subjects).toHaveLength(1);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/dashboard/demo', {}, TEST_ENV);

      expect(res.status).toBe(401);
    });

    it('demo summary mentions every subject by its canonical name [BUG-876]', async () => {
      // Regression: dashboard summary copy used "Math" while the subjects
      // array used "Mathematics", confusing users about which subject was
      // referenced. Each child's summary string must match the names in
      // their subjects[] list verbatim, so library/progress/shelf/dashboard
      // all read the same word for the same subject.
      const res = await app.request(
        '/v1/dashboard/demo',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );
      const body = await res.json();

      for (const child of body.children) {
        for (const subject of child.subjects) {
          expect(child.summary).toContain(subject.name);
        }
        // Specifically: Alex should reference "Mathematics", not "Math".
        if (child.profileId === 'demo-child-1') {
          expect(child.summary).toContain('Mathematics');
          expect(child.summary).not.toMatch(/\bMath\b(?!ematics)/);
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/dashboard/children/:profileId/weekly-reports [C-2]
  // -------------------------------------------------------------------------

  describe('GET /v1/dashboard/children/:profileId/weekly-reports', () => {
    it('returns 200 with empty weekly reports list', async () => {
      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/weekly-reports`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.reports).toEqual([]);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/weekly-reports`,
        {},
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });

    it('passes parentProfileId and childProfileId to service', async () => {
      await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/weekly-reports`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(mockListWeeklyReports).toHaveBeenCalledWith(
        expect.anything(),
        'test-profile-id',
        PROFILE_ID,
      );
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/dashboard/children/:profileId/weekly-reports/:reportId
  // -------------------------------------------------------------------------

  describe('GET /v1/dashboard/children/:profileId/weekly-reports/:reportId', () => {
    const REPORT_ID = '880e8400-e29b-41d4-a716-446655440000';

    it('returns 200 with weekly report data', async () => {
      mockGetWeeklyReport.mockResolvedValueOnce({
        id: REPORT_ID,
        profileId: 'a0000001-0000-4000-a000-000000000001',
        childProfileId: PROFILE_ID,
        reportWeek: '2026-04-14',
        reportData: {
          childName: 'Test',
          weekStart: '2026-04-14',
          thisWeek: {
            totalSessions: 3,
            totalActiveMinutes: 45,
            topicsMastered: 1,
            topicsExplored: 2,
            vocabularyTotal: 10,
            streakBest: 3,
          },
          lastWeek: null,
          headlineStat: {
            label: 'Topics mastered',
            value: 1,
            comparison: 'in a first week',
          },
        },
        viewedAt: null,
        createdAt: '2026-04-21T00:00:00.000Z',
      });

      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/weekly-reports/${REPORT_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.report).toEqual(expect.objectContaining({}));
      expect(body.report.id).toBe(REPORT_ID);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/weekly-reports/${REPORT_ID}`,
        {},
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/dashboard/children/:profileId/weekly-reports/:reportId/view
  // -------------------------------------------------------------------------

  describe('POST /v1/dashboard/children/:profileId/weekly-reports/:reportId/view', () => {
    const REPORT_ID = '880e8400-e29b-41d4-a716-446655440000';

    it('returns 200 and marks report as viewed', async () => {
      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/weekly-reports/${REPORT_ID}/view`,
        { method: 'POST', headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.viewed).toBe(true);
      expect(mockMarkWeeklyReportViewed).toHaveBeenCalledWith(
        expect.anything(),
        'test-profile-id',
        PROFILE_ID,
        REPORT_ID,
      );
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/weekly-reports/${REPORT_ID}/view`,
        { method: 'POST' },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // [T-3 / BUG-744] IDOR break tests — assertParentAccess must block
  // mismatched parent/child pairs across all child-scoped endpoints.
  //
  // Pre-fix: no test exercised the ForbiddenError path, leaving the guard
  // invisible — a removed or short-circuited assertParentAccess would return
  // 200 with another user's data instead of 403.
  // Post-fix: each endpoint here proves the 403 path is wired.
  // -------------------------------------------------------------------------

  describe('[BUG-744] IDOR: assertParentAccess rejects mismatched parent/child', () => {
    // [BREAK] memory endpoint calls assertParentAccess directly in the route
    it('[BREAK] GET /dashboard/children/:id/memory returns 403 for unlinked parent', async () => {
      mockFindFamilyLink.mockResolvedValueOnce(undefined);

      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/memory`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      expect(mockFindFamilyLink).toHaveBeenCalledTimes(1);

      // Pin the actual UUIDs the route asked the family-link table about. A
      // future refactor that drops or swaps the parent/child equality clauses
      // would still 403 (because the mock returns undefined) but would silently
      // break the IDOR contract — this assertion catches that.
      const params = extractDrizzleParamValues(
        mockFindFamilyLink.mock.calls[0]?.[0],
      );
      expect(params).toContain('test-profile-id');
      expect(params).toContain(PROFILE_ID);
    });

    // [WI-1658 / BUG-744] verified-proof endpoint calls assertOwnerAndParentAccess
    // directly at route entry — same IDOR contract as the memory route above.
    it('[BREAK] GET /dashboard/children/:id/verified-proof returns 403 for unlinked parent', async () => {
      mockFindFamilyLink.mockResolvedValueOnce(undefined);

      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/verified-proof`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      expect(mockFindFamilyLink).toHaveBeenCalledTimes(1);
      expect(mockGetLatestVerifiedProofForChild).not.toHaveBeenCalled();

      // Pin the actual UUIDs the route asked the family-link table about —
      // catches a future refactor that drops or swaps the parent/child
      // equality clauses (would still 403 here since the mock returns
      // undefined, but would silently break the real IDOR contract).
      const params = extractDrizzleParamValues(
        mockFindFamilyLink.mock.calls[0]?.[0],
      );
      expect(params).toContain('test-profile-id');
      expect(params).toContain(PROFILE_ID);
    });

    it('GET /dashboard/children/:id/memory returns 200 for linked parent', async () => {
      // assertParentAccess succeeds (default mock)
      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/memory`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      // 200 or 404 (profile not found) — either way not 403
      expect(res.status).not.toBe(403);
    });

    // [BREAK / BUG-744] getChildDetail is the service-layer guard for the
    // child-detail endpoint. If the assertParentAccess call inside the
    // service were removed, an unlinked parent would get 200 with another
    // family's data. This test mocks the service to throw ForbiddenError —
    // proving the route's error middleware translates it to a 403.
    it('[BREAK] GET /dashboard/children/:id returns 403 when service rejects unlinked parent', async () => {
      mockGetChildDetail.mockRejectedValueOnce(
        new ForbiddenError('You do not have access to this child profile.'),
      );

      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      expect(mockGetChildDetail).toHaveBeenCalledTimes(1);
    });

    // [BREAK / BUG-744] getChildSubjectTopics is the service-layer guard
    // for the subject-detail endpoint. Same break pattern: forced
    // ForbiddenError must surface as 403, not 200 with mixed-tenant data.
    it('[BREAK] GET /dashboard/children/:id/subjects/:subjectId returns 403 when service rejects unlinked parent', async () => {
      mockGetChildSubjectTopics.mockRejectedValueOnce(
        new ForbiddenError('You do not have access to this child profile.'),
      );

      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/subjects/${SUBJECT_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      expect(mockGetChildSubjectTopics).toHaveBeenCalledTimes(1);
    });

    // [BREAK / BUG-744] Weekly-report list/detail go through their own
    // service module. Both must surface ForbiddenError as 403.
    it('[BREAK] GET /dashboard/children/:id/weekly-reports returns 403 when service rejects unlinked parent', async () => {
      mockListWeeklyReports.mockRejectedValueOnce(
        new ForbiddenError('You do not have access to this child profile.'),
      );

      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/weekly-reports`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      expect(mockListWeeklyReports).toHaveBeenCalledTimes(1);
    });

    // -----------------------------------------------------------------------
    // [BUG-834] Defense-in-depth: every :profileId-scoped dashboard route now
    // calls assertParentAccess at route entry, *before* the service. The
    // following break tests prove the route-entry guard short-circuits to 403
    // — the service is never invoked when assertParentAccess rejects.
    // -----------------------------------------------------------------------

    const dashboardRouteFixtures: Array<{
      label: string;
      method?: 'GET' | 'POST';
      path: string;
    }> = [
      {
        label: 'GET /dashboard/children/:id',
        path: `/v1/dashboard/children/${PROFILE_ID}`,
      },
      {
        label: 'GET /dashboard/children/:id/inventory',
        path: `/v1/dashboard/children/${PROFILE_ID}/inventory`,
      },
      {
        label: 'GET /dashboard/children/:id/progress-history',
        path: `/v1/dashboard/children/${PROFILE_ID}/progress-history`,
      },
      {
        label: 'GET /dashboard/children/:id/progress-summary',
        path: `/v1/dashboard/children/${PROFILE_ID}/progress-summary`,
      },
      {
        label: 'GET /dashboard/children/:id/subjects/:subjectId',
        path: `/v1/dashboard/children/${PROFILE_ID}/subjects/${SUBJECT_ID}`,
      },
      {
        label: 'GET /dashboard/children/:id/sessions',
        path: `/v1/dashboard/children/${PROFILE_ID}/sessions`,
      },
      {
        label: 'GET /dashboard/children/:id/sessions/:sessionId',
        path: `/v1/dashboard/children/${PROFILE_ID}/sessions/${SUBJECT_ID}`,
      },
      {
        label: 'GET /dashboard/children/:id/verified-proof',
        path: `/v1/dashboard/children/${PROFILE_ID}/verified-proof`,
      },
      {
        label: 'GET /dashboard/children/:id/reports',
        path: `/v1/dashboard/children/${PROFILE_ID}/reports`,
      },
      {
        label: 'GET /dashboard/children/:id/reports/:reportId',
        path: `/v1/dashboard/children/${PROFILE_ID}/reports/${SUBJECT_ID}`,
      },
      {
        label: 'POST /dashboard/children/:id/reports/:reportId/view',
        method: 'POST',
        path: `/v1/dashboard/children/${PROFILE_ID}/reports/${SUBJECT_ID}/view`,
      },
      {
        label: 'GET /dashboard/children/:id/weekly-reports',
        path: `/v1/dashboard/children/${PROFILE_ID}/weekly-reports`,
      },
      {
        label: 'GET /dashboard/children/:id/weekly-reports/:reportId',
        path: `/v1/dashboard/children/${PROFILE_ID}/weekly-reports/${SUBJECT_ID}`,
      },
      {
        label: 'POST /dashboard/children/:id/weekly-reports/:reportId/view',
        method: 'POST',
        path: `/v1/dashboard/children/${PROFILE_ID}/weekly-reports/${SUBJECT_ID}/view`,
      },
    ];

    for (const fixture of dashboardRouteFixtures) {
      it(`[BREAK / BUG-834] ${fixture.label} returns 403 when route-entry assertParentAccess rejects`, async () => {
        mockFindFamilyLink.mockResolvedValueOnce(undefined);

        const res = await app.request(
          fixture.path,
          { method: fixture.method ?? 'GET', headers: AUTH_HEADERS },
          TEST_ENV,
        );

        expect(res.status).toBe(403);
        // Route-entry guard fired — service should not have been called.
        // (We can't assert "no service called" universally, but for the
        // child-detail route the service mock is observable.)
      });
    }

    // [BUG-834] Specifically verify the child-detail route does NOT invoke
    // its service when route-entry assertParentAccess rejects. This is the
    // tightest "defense-in-depth" assertion: the route-layer guard fires
    // before the service is even reached.
    it('[BREAK / BUG-834] route-entry guard short-circuits — service not called', async () => {
      mockFindFamilyLink.mockResolvedValueOnce(undefined);

      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      expect(mockGetChildDetail).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // [BUG-830 / F-API-01] Error envelope contract — every dashboard 404 must
  // emit the canonical { code, message } shape so mobile error classifiers
  // bucket dashboard misses the same way they bucket every other route.
  // Pre-fix: routes returned { error: 'X' } which silently fell through the
  // ERROR_CODES enum and made observability blind to dashboard 404s.
  // -------------------------------------------------------------------------

  describe('[BUG-830] Dashboard 404s use the typed apiError envelope', () => {
    const SESSION_ID = TEST_SESSION_ID;
    const REPORT_ID = '880e8400-e29b-41d4-a716-446655440000';

    it('[BREAK] GET /dashboard/children/:id/sessions/:sessionId — 404 has { code: NOT_FOUND, message }', async () => {
      const sessionsModule = jest.requireMock(
        '../services/dashboard',
      ) as Record<string, jest.Mock>;
      sessionsModule.getChildSessionDetail = jest
        .fn()
        .mockResolvedValueOnce(null);

      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/sessions/${SESSION_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toEqual({
        code: 'NOT_FOUND',
        message: 'Session not found',
      });
      expect(body).not.toHaveProperty('error');
    });

    it('[BREAK] GET /dashboard/children/:id/reports/:reportId — 404 has { code: NOT_FOUND, message }', async () => {
      const dashboardModule = jest.requireMock(
        '../services/dashboard',
      ) as Record<string, jest.Mock>;
      dashboardModule.getChildReportDetail = jest
        .fn()
        .mockResolvedValueOnce(null);

      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/reports/${REPORT_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toEqual({
        code: 'NOT_FOUND',
        message: 'Report not found',
      });
      expect(body).not.toHaveProperty('error');
    });

    it('[BREAK] GET /dashboard/children/:id/weekly-reports/:reportId — 404 has { code: NOT_FOUND, message }', async () => {
      mockGetWeeklyReport.mockResolvedValueOnce(null);

      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/weekly-reports/${REPORT_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toEqual({
        code: 'NOT_FOUND',
        message: 'Report not found',
      });
      expect(body).not.toHaveProperty('error');
    });
  });

  // -------------------------------------------------------------------------
  // [CR-2026-05-19-H1] Break tests — non-owner profile must be rejected from
  // all child-dashboard routes that require assertOwnerAndParentAccess.
  // A child on a parent's account (isOwner:false) must get 403, not data.
  // -------------------------------------------------------------------------

  describe('[CR-2026-05-19-H1] non-owner profile is rejected from parent dashboard routes', () => {
    const NON_OWNER_PROFILE_ID = TEST_PROFILE_ID_2;
    const NON_OWNER_HEADERS = makeAuthHeaders({
      'X-Profile-Id': NON_OWNER_PROFILE_ID,
    });

    beforeEach(() => {
      // Override getProfile so X-Profile-Id resolves to a non-owner profile.
      mockGetProfile.mockResolvedValue({
        id: NON_OWNER_PROFILE_ID,
        birthYear: 2012,
        location: null,
        consentStatus: 'CONSENTED',
        isOwner: false,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
      });
      // [WI-867] v2: profile-scope resolves X-Profile-Id via getPersonScope —
      // return the same non-owner profile so the isOwner gate fires.
      mockGetPersonScope.mockResolvedValue(
        personScope({
          profileId: NON_OWNER_PROFILE_ID,
          birthYear: 2012,
          isOwner: false,
        }),
      );
      // Family link exists — IDOR check would pass, but isOwner gate must fire first.
      mockFindFamilyLink.mockResolvedValue({
        parentProfileId: NON_OWNER_PROFILE_ID,
        childProfileId: PROFILE_ID,
      });
    });

    it('[BREAK] GET /dashboard/children/:id returns 403 for non-owner profile', async () => {
      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}`,
        { headers: NON_OWNER_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
      // isOwner gate fires at route entry — service must not be called.
      expect(mockGetChildDetail).not.toHaveBeenCalled();
    });

    it('[BREAK] GET /dashboard/children/:id/weekly-reports returns 403 for non-owner profile', async () => {
      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/weekly-reports`,
        { headers: NON_OWNER_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
    });

    it('[BREAK] GET /dashboard/children/:id/progress-summary returns 403 for non-owner profile', async () => {
      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/progress-summary`,
        { headers: NON_OWNER_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
    });

    it('[BREAK] GET /dashboard/children/:id/verified-proof returns 403 for non-owner profile', async () => {
      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/verified-proof`,
        { headers: NON_OWNER_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
      expect(mockGetLatestVerifiedProofForChild).not.toHaveBeenCalled();
    });

    it('[BREAK] GET /dashboard/children/:id/topics/:topicId/snapshot returns 403 for non-owner profile', async () => {
      // Snapshot route splits owner gating from parent-link gating: the owner
      // gate is endpoint authorization (non-owners shouldn't reach parent-admin
      // endpoints), so it still returns 403.
      const TOPIC_ID = 'a0000000-0000-4000-a000-000000000001';
      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/topics/${TOPIC_ID}/snapshot`,
        { headers: NON_OWNER_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
    });
  });

  // -------------------------------------------------------------------------
  // Snapshot endpoint 404 IDOR contract
  //
  // Source: docs/specs/2026-05-23-learn-this-too-bridge.md §Authorization
  // ("404, never 403, never reveal whether the topic ID exists").
  //
  // The snapshot route is the one place where parent-link rejection MUST
  // return 404 rather than 403, so that an owner can't probe for the
  // existence of a topic on a child profile that isn't linked to them.
  // -------------------------------------------------------------------------

  describe('snapshot 404 IDOR contract', () => {
    const TOPIC_ID = 'a0000000-0000-4000-a000-000000000001';

    beforeEach(() => {
      // Restore owner default — the prior describe overrides mockGetProfile to
      // isOwner:false at suite level, and clearAllMocks does not reset
      // mockResolvedValue defaults.
      mockGetProfile.mockResolvedValue({
        id: 'test-profile-id',
        birthYear: null,
        location: null,
        consentStatus: 'CONSENTED',
        isOwner: true,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
      });
    });

    it('[BREAK] returns 404 (NOT 403) when owner has no family-link to the child', async () => {
      // Owner profile (default mock has isOwner:true), but no family link.
      // Pre-fix the route called assertOwnerAndParentAccess BEFORE the
      // try/catch, so the ForbiddenError from assertParentAccess fell through
      // the global handler as 403, leaking topic existence semantics.
      // Persistent (not Once) so the service-layer assertParentAccess inside
      // getChildTopicSnapshotForParent also sees the unlinked state.
      mockFindFamilyLink.mockResolvedValue(undefined);

      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/topics/${TOPIC_ID}/snapshot`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(404);
      // Body shape contract: must be the typed apiError envelope so mobile
      // classifiers bucket this the same way they bucket every other 404. A
      // regression that emits a bare-text 404 or wrong code would still pass
      // a status-only check.
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toMatchObject({ code: ERROR_CODES.NOT_FOUND });
    });

    // [BREAK] The 404-IDOR conversion is intentional and gated by
    // assertOwnerProfile being placed OUTSIDE the try/catch. A refactor that
    // moves assertOwnerProfile inside the try would silently convert
    // non-owner ForbiddenError → 404 too, masking owner-gate breaks. This
    // test locks the structural invariant by asserting non-owner traffic
    // still surfaces as 403 from this same route (mockGetProfile is reset
    // to isOwner:true above in the beforeEach, so this test overrides it).
    it('[BREAK] non-owner still gets 403 from snapshot route (assertOwnerProfile placement guard)', async () => {
      // [WI-867] v2: isOwner comes from getPersonScope (profile-v2), not getProfile.
      mockGetPersonScope.mockResolvedValueOnce(personScope({ isOwner: false }));

      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/topics/${TOPIC_ID}/snapshot`,
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
    });
  });
});
