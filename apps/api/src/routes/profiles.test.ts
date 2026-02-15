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

describe('profile routes', () => {
  // -------------------------------------------------------------------------
  // GET /v1/profiles
  // -------------------------------------------------------------------------

  describe('GET /v1/profiles', () => {
    it('returns 200 with profiles array', async () => {
      const res = await app.request(
        '/v1/profiles',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('profiles');
      expect(Array.isArray(body.profiles)).toBe(true);
    });

    it('returns 401 without auth header', async () => {
      const res = await app.request('/v1/profiles', {}, TEST_ENV);

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/profiles
  // -------------------------------------------------------------------------

  describe('POST /v1/profiles', () => {
    it('returns 201 with valid profile data', async () => {
      const res = await app.request(
        '/v1/profiles',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            displayName: 'Test User',
            personaType: 'LEARNER',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.profile).toBeDefined();
      expect(body.profile.displayName).toBe('Test User');
      expect(body.profile.personaType).toBe('LEARNER');
      expect(body.profile.accountId).toBeDefined();
      expect(body.profile.createdAt).toBeDefined();
      expect(body.profile.updatedAt).toBeDefined();
    });

    it('returns 400 when displayName is missing', async () => {
      const res = await app.request(
        '/v1/profiles',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ personaType: 'TEEN' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid personaType', async () => {
      const res = await app.request(
        '/v1/profiles',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            displayName: 'Test',
            personaType: 'INVALID',
          }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/profiles/:id
  // -------------------------------------------------------------------------

  describe('GET /v1/profiles/:id', () => {
    it('returns 200 with profile object', async () => {
      const res = await app.request(
        '/v1/profiles/some-id',
        { headers: AUTH_HEADERS },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('profile');
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /v1/profiles/:id
  // -------------------------------------------------------------------------

  describe('PATCH /v1/profiles/:id', () => {
    it('returns 200 with valid partial update', async () => {
      const res = await app.request(
        '/v1/profiles/some-id',
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ displayName: 'Updated Name' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('profile');
    });

    it('returns 400 for invalid avatarUrl', async () => {
      const res = await app.request(
        '/v1/profiles/some-id',
        {
          method: 'PATCH',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ avatarUrl: 'not-a-url' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/profiles/switch
  // -------------------------------------------------------------------------

  describe('POST /v1/profiles/switch', () => {
    it('returns 200 with valid profileId', async () => {
      const profileId = '550e8400-e29b-41d4-a716-446655440000';
      const res = await app.request(
        '/v1/profiles/switch',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ profileId }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toBe('Profile switched');
      expect(body.profileId).toBe(profileId);
    });

    it('returns 400 for non-UUID profileId', async () => {
      const res = await app.request(
        '/v1/profiles/switch',
        {
          method: 'POST',
          headers: AUTH_HEADERS,
          body: JSON.stringify({ profileId: 'not-a-uuid' }),
        },
        TEST_ENV
      );

      expect(res.status).toBe(400);
    });
  });
});
