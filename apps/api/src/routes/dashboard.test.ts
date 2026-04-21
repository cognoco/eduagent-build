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

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock();

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

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
  'X-Profile-Id': 'test-profile-id',
};

const PROFILE_ID = '770e8400-e29b-41d4-a716-446655440000';
const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('dashboard routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

      // First arg is db (undefined in test context since services are mocked)
      expect(mockListWeeklyReports).toHaveBeenCalledWith(
        undefined,
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
        reportWeek: '2026-04-14',
        reportData: { childName: 'Test' },
      });

      const res = await app.request(
        `/v1/dashboard/children/${PROFILE_ID}/weekly-reports/${REPORT_ID}`,
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.report).toBeDefined();
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
      // First arg is db (undefined in test context since services are mocked)
      expect(mockMarkWeeklyReportViewed).toHaveBeenCalledWith(
        undefined,
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
});
