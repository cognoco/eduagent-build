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

import app from '../index';

const TEST_ENV = {
  CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
};

const AUTH_HEADERS = {
  Authorization: 'Bearer valid.jwt.token',
  'Content-Type': 'application/json',
};

const PROFILE_ID = '770e8400-e29b-41d4-a716-446655440000';
const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('dashboard routes', () => {
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
});
