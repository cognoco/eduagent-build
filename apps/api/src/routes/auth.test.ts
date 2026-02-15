import app from '../index';

describe('auth routes', () => {
  // -------------------------------------------------------------------------
  // POST /v1/auth/register
  // -------------------------------------------------------------------------

  describe('POST /v1/auth/register', () => {
    it('returns 201 with valid registration data', async () => {
      const res = await app.request('/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'new@example.com',
          password: 'securePass123',
        }),
      });

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.message).toBe('Registration initiated');
      expect(body.email).toBe('new@example.com');
    });

    it('returns 201 with optional fields', async () => {
      const res = await app.request('/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'new@example.com',
          password: 'securePass123',
          birthDate: '2010-05-15',
          location: 'EU',
        }),
      });

      expect(res.status).toBe(201);
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

    it('does not require auth (public path)', async () => {
      // No Authorization header — should still succeed with valid body
      const res = await app.request('/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'public@example.com',
          password: 'securePass123',
        }),
      });

      expect(res.status).toBe(201);
    });
  });

  // -------------------------------------------------------------------------
  // POST /v1/auth/password-reset-request
  // -------------------------------------------------------------------------

  describe('POST /v1/auth/password-reset-request', () => {
    it('returns 200 with valid email', async () => {
      const res = await app.request('/v1/auth/password-reset-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com' }),
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toBe(
        'If an account exists, a reset email has been sent'
      );
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
    it('returns 200 with valid token and new password', async () => {
      const res = await app.request('/v1/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'reset-token-abc',
          newPassword: 'newSecurePass456',
        }),
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toBe('Password has been reset');
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
