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

describe('subject routes', () => {
  // -------------------------------------------------------------------------
  // GET /v1/subjects
  // -------------------------------------------------------------------------

  describe('GET /v1/subjects', () => {
    it('returns 200 with subjects array', async () => {
      const res = await app.request(
        '/v1/subjects',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('subjects');
      expect(Array.isArray(body.subjects)).toBe(true);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/subjects', {}, TEST_ENV);

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/subjects
  // -------------------------------------------------------------------------

  describe('POST /v1/subjects', () => {
    it('returns 201 with valid subject name', async () => {
      const res = await app.request(
        '/v1/subjects',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ name: 'Mathematics' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.subject).toBeDefined();
      expect(body.subject.name).toBe('Mathematics');
      expect(body.subject.status).toBe('active');
      expect(body.subject.createdAt).toBeDefined();
      expect(body.subject.updatedAt).toBeDefined();
    });

    it('returns 400 when name is empty', async () => {
      const res = await app.request(
        '/v1/subjects',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ name: '' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/subjects',
        {
          method: 'POST',
          body: JSON.stringify({ name: 'Mathematics' }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/subjects/:id
  // -------------------------------------------------------------------------

  describe('GET /v1/subjects/:id', () => {
    it('returns 200 with subject object', async () => {
      const res = await app.request(
        '/v1/subjects/some-id',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('subject');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/subjects/some-id', {}, TEST_ENV);

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /v1/subjects/:id
  // -------------------------------------------------------------------------

  describe('PATCH /v1/subjects/:id', () => {
    it('returns 200 with valid update', async () => {
      const res = await app.request(
        '/v1/subjects/some-id',
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ name: 'Updated Subject' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('subject');
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/subjects/some-id',
        {
          method: 'PATCH',
          body: JSON.stringify({ name: 'Updated Subject' }),
          headers: { 'Content-Type': 'application/json' },
        },
        TEST_ENV
      );

      expect(res.status).toBe(401);
    });
  });
});
