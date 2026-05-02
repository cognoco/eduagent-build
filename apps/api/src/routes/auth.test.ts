import { app } from '../index';

describe('auth routes', () => {
  // -------------------------------------------------------------------------
  // POST /v1/auth/register
  // -------------------------------------------------------------------------

  describe('POST /v1/auth/register', () => {
    it('returns 501 with valid registration data (Clerk handles registration)', async () => {
      const res = await app.request('/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'new@example.com',
          password: 'securePass123',
        }),
      });

      expect(res.status).toBe(501);

      const body = await res.json();
      expect(body.code).toBe('NOT_IMPLEMENTED');
      expect(body.message).toMatch(/Clerk/i);
    });

    it('returns 501 with optional fields (Clerk handles registration)', async () => {
      const res = await app.request('/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'new@example.com',
          password: 'securePass123',
          birthYear: 2010,
          location: 'EU',
        }),
      });

      expect(res.status).toBe(501);
    });

    it('returns 400 for invalid email', async () => {
      const res = await app.request('/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'not-an-email',
          password: 'securePass123',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for password too short', async () => {
      const res = await app.request('/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'short',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 when email is missing', async () => {
      const res = await app.request('/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'securePass123' }),
      });

      expect(res.status).toBe(400);
    });

    it('does not require auth (public path) — still returns 501 as not implemented', async () => {
      // No Authorization header — schema validation passes, endpoint returns 501
      const res = await app.request('/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'public@example.com',
          password: 'securePass123',
        }),
      });

      expect(res.status).toBe(501);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/auth/password-reset-request
  // -------------------------------------------------------------------------

  describe('POST /v1/auth/password-reset-request', () => {
    it('returns 501 with valid email (Clerk handles password reset)', async () => {
      const res = await app.request('/v1/auth/password-reset-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com' }),
      });

      expect(res.status).toBe(501);

      const body = await res.json();
      expect(body.code).toBe('NOT_IMPLEMENTED');
      expect(body.message).toMatch(/Clerk/i);
    });

    it('returns 400 for invalid email', async () => {
      const res = await app.request('/v1/auth/password-reset-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'bad' }),
      });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/auth/password-reset
  // -------------------------------------------------------------------------

  describe('POST /v1/auth/password-reset', () => {
    it('returns 501 with valid token and new password (Clerk handles reset)', async () => {
      const res = await app.request('/v1/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'reset-token-abc',
          newPassword: 'newSecurePass456',
        }),
      });

      expect(res.status).toBe(501);

      const body = await res.json();
      expect(body.code).toBe('NOT_IMPLEMENTED');
      expect(body.message).toMatch(/Clerk/i);
    });

    it('returns 400 when new password is too short', async () => {
      const res = await app.request('/v1/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'reset-token-abc',
          newPassword: 'short',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 when token is missing', async () => {
      const res = await app.request('/v1/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: 'newSecurePass456' }),
      });

      expect(res.status).toBe(400);
    });
  });
});
