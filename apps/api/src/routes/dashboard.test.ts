// ---------------------------------------------------------------------------
// Mock JWT module so auth middleware passes with a valid token
// ---------------------------------------------------------------------------

jest.mock('../middleware/jwt', () =>
  require('../test-utils/auth-fixture').createJwtModuleMock()
);

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({ includeActual: true });
const mockFindFamilyLink = jest.fn().mockResolvedValue({
  parentProfileId: 'test-profile-id',
  childProfileId: '770e8400-e29b-41d4-a716-446655440000',
});
const familyLinksQuery = {
  findFirst: (...args: unknown[]) => mockFindFamilyLink(...args),
  findMany: jest.fn().mockResolvedValue([]),
};

mockDatabaseModule.db.query = new Proxy(mockDatabaseModule.db.query, {
  get(target, prop, receiver) {
    if (prop === 'familyLinks') return familyLinksQuery;
    return Reflect.get(target, prop, receiver);
  },
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

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
  findOwnerProfile: jest.fn().mockResolvedValue(null),
  getProfile: jest.fn().mockResolvedValue({
    id: 'test-profile-id',
    birthYear: null,
    location: null,
    consentStatus: 'CONSENTED',
  }),
}));

const mockGetChildrenForParent = jest.fn().mockResolvedValue([]);
const mockGetChildDetail = jest.fn().mockResolvedValue(null);
const mockGetChildSubjectTopics = jest.fn().mockResolvedValue([]);

jest.mock('../services/dashboard', () => ({
  ...jest.requireActual('../services/dashboard'),
  getChildrenForParent: (...args: unknown[]) =>
    mockGetChildrenForParent(...args),
  getChildDetail: (...args: unknown[]) => mockGetChildDetail(...args),
  getChildSubjectTopics: (...args: unknown[]) =>
    mockGetChildSubjectTopics(...args),
}));

const mockListWeeklyReports = jest.fn().mockResolvedValue([]);
const mockGetWeeklyReport = jest.fn().mockResolvedValue(null);
const mockMarkWeeklyReportViewed = jest.fn().mockResolvedValue(undefined);

// NOTE: This is a route-unit test — shallow-mocking the weekly-report service
// is intentional here. Integration coverage for the service layer lives in the
// Inngest integration test (weekly-progress-push.integration.test.ts).
jest.mock('../services/weekly-report', () => ({
  ...jest.requireActual('../services/weekly-report'),
  listWeeklyReportsForParentChild: (...args: unknown[]) =>
    mockListWeeklyReports(...args),
  getWeeklyReportForParentChild: (...args: unknown[]) =>
    mockGetWeeklyReport(...args),
  markWeeklyReportViewed: (...args: unknown[]) =>
    mockMarkWeeklyReportViewed(...args),
}));

import { app } from '../index';
import { ForbiddenError } from '../errors';
import {
  AUTH_HEADERS as BASE_AUTH_HEADERS,
  BASE_AUTH_ENV,
} from '../test-utils/test-env';
import { extractDrizzleParamValues } from '../test-utils/drizzle-introspection';

const TEST_ENV = {
  ...BASE_AUTH_ENV,
  DATABASE_URL: 'postgresql://test:test@localhost/test',
};

const AUTH_HEADERS = {
  ...BASE_AUTH_HEADERS,
  'X-Profile-Id': 'test-profile-id',
};

const PROFILE_ID = '770e8400-e29b-41d4-a716-446655440000';
const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('dashboard routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindFamilyLink.mockResolvedValue({
      parentProfileId: 'test-profile-id',
      childProfileId: PROFILE_ID,
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/dashboard
  // -------------------------------------------------------------------------

  describe('GET /v1/dashboard', () => {
    it('returns 200 with dashboard data', async () => {
      const res = await app.request(
        '/v1/dashboard',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.children).toEqual([]);
      expect(body.demoMode).toBe(false);
    });

    it('returns 400 when authenticated but missing X-Profile-Id header', async () => {
      const res = await app.request(
        '/v1/dashboard',
        {
          headers: {
            Authorization: 'Bearer valid.jwt.token',
            'Content-Type': 'application/json',
          },
        },
        TEST_ENV
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
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.child).toBeNull();
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}`,
        {},
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/dashboard/children/:profileId/subjects/:subjectId
  // -------------------------------------------------------------------------

  describe('GET /v1/dashboard/children/:profileId/subjects/:subjectId', () => {
    it('returns 200 with child subject data', async () => {
      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/subjects/${SUBJECT_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.topics).toEqual([]);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/subjects/${SUBJECT_ID}`,
        {},
        TEST_ENV
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
        TEST_ENV
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
        TEST_ENV
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
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.reports).toEqual([]);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/weekly-reports`,
        {},
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });

    it('passes parentProfileId and childProfileId to service', async () => {
      await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/weekly-reports`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(mockListWeeklyReports).toHaveBeenCalledWith(
        expect.anything(),
        'test-profile-id',
        PROFILE_ID
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
        TEST_ENV
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
        TEST_ENV
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
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.viewed).toBe(true);
      expect(mockMarkWeeklyReportViewed).toHaveBeenCalledWith(
        expect.anything(),
        'test-profile-id',
        PROFILE_ID,
        REPORT_ID
      );
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/weekly-reports/${REPORT_ID}/view`,
        { method: 'POST' },
        TEST_ENV
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
        TEST_ENV
      );

      expect(res.status).toBe(403);
      expect(mockFindFamilyLink).toHaveBeenCalledTimes(1);

      // Pin the actual UUIDs the route asked the family-link table about. A
      // future refactor that drops or swaps the parent/child equality clauses
      // would still 403 (because the mock returns undefined) but would silently
      // break the IDOR contract — this assertion catches that.
      const params = extractDrizzleParamValues(
        mockFindFamilyLink.mock.calls[0]?.[0]
      );
      expect(params).toContain('test-profile-id');
      expect(params).toContain(PROFILE_ID);
    });

    it('GET /dashboard/children/:id/memory returns 200 for linked parent', async () => {
      // assertParentAccess succeeds (default mock)
      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/memory`,
        { headers: AUTH_HEADERS },
        TEST_ENV
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
        new ForbiddenError('You do not have access to this child profile.')
      );

      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(403);
      expect(mockGetChildDetail).toHaveBeenCalledTimes(1);
    });

    // [BREAK / BUG-744] getChildSubjectTopics is the service-layer guard
    // for the subject-detail endpoint. Same break pattern: forced
    // ForbiddenError must surface as 403, not 200 with mixed-tenant data.
    it('[BREAK] GET /dashboard/children/:id/subjects/:subjectId returns 403 when service rejects unlinked parent', async () => {
      mockGetChildSubjectTopics.mockRejectedValueOnce(
        new ForbiddenError('You do not have access to this child profile.')
      );

      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/subjects/${SUBJECT_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(403);
      expect(mockGetChildSubjectTopics).toHaveBeenCalledTimes(1);
    });

    // [BREAK / BUG-744] Weekly-report list/detail go through their own
    // service module. Both must surface ForbiddenError as 403.
    it('[BREAK] GET /dashboard/children/:id/weekly-reports returns 403 when service rejects unlinked parent', async () => {
      mockListWeeklyReports.mockRejectedValueOnce(
        new ForbiddenError('You do not have access to this child profile.')
      );

      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/weekly-reports`,
        { headers: AUTH_HEADERS },
        TEST_ENV
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
          TEST_ENV
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
        TEST_ENV
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
    const SESSION_ID = '660e8400-e29b-41d4-a716-446655440000';
    const REPORT_ID = '880e8400-e29b-41d4-a716-446655440000';

    it('[BREAK] GET /dashboard/children/:id/sessions/:sessionId — 404 has { code: NOT_FOUND, message }', async () => {
      const sessionsModule = jest.requireMock(
        '../services/dashboard'
      ) as Record<string, jest.Mock>;
      sessionsModule.getChildSessionDetail = jest
        .fn()
        .mockResolvedValueOnce(null);

      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/sessions/${SESSION_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV
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
        '../services/dashboard'
      ) as Record<string, jest.Mock>;
      dashboardModule.getChildReportDetail = jest
        .fn()
        .mockResolvedValueOnce(null);

      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/reports/${REPORT_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV
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
        TEST_ENV
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
});
