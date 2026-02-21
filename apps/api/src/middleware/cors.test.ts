import { app } from '../index';

describe('CORS middleware', () => {
  const LOCALHOST_ORIGINS = [
    'http://localhost:8081',
    'http://localhost:19006',
    'http://localhost:3000',
    'http://127.0.0.1:8081',
  ];

  const PRODUCTION_ORIGINS = [
    'https://eduagent.app',
    'https://app.eduagent.app',
  ];

  const BLOCKED_ORIGINS = [
    'https://evil.com',
    'https://localhost.evil.com',
    'https://eduagent.app.evil.com',
  ];

  const REQUIRED_HEADERS = ['Authorization', 'Content-Type', 'X-Profile-Id'];

  describe('preflight OPTIONS requests', () => {
    it.each(LOCALHOST_ORIGINS)('allows preflight from %s', async (origin) => {
      const res = await app.request('/v1/health', {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': REQUIRED_HEADERS.join(', '),
        },
      });

      expect(res.status).toBeLessThan(400);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    });

    it.each(PRODUCTION_ORIGINS)('allows preflight from %s', async (origin) => {
      const res = await app.request('/v1/health', {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': REQUIRED_HEADERS.join(', '),
        },
      });

      expect(res.status).toBeLessThan(400);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    });

    it.each(BLOCKED_ORIGINS)('rejects preflight from %s', async (origin) => {
      const res = await app.request('/v1/health', {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type',
        },
      });

      const allowOrigin = res.headers.get('Access-Control-Allow-Origin');
      expect(allowOrigin).not.toBe(origin);
    });
  });

  describe('allowed headers', () => {
    it.each(REQUIRED_HEADERS)('allows the %s header', async (header) => {
      const res = await app.request('/v1/health', {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:8081',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': header,
        },
      });

      const allowed = res.headers.get('Access-Control-Allow-Headers') ?? '';
      expect(allowed.toLowerCase()).toContain(header.toLowerCase());
    });
  });

  describe('actual cross-origin requests', () => {
    it('includes CORS headers on a real GET', async () => {
      const res = await app.request('/v1/health', {
        headers: { Origin: 'http://localhost:8081' },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
        'http://localhost:8081'
      );
    });

    it('supports credentials', async () => {
      const res = await app.request('/v1/health', {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:8081',
          'Access-Control-Request-Method': 'POST',
        },
      });

      expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    });
  });

  describe('allowed methods', () => {
    const REQUIRED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

    it('allows all required HTTP methods', async () => {
      const res = await app.request('/v1/health', {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:8081',
          'Access-Control-Request-Method': 'POST',
        },
      });

      const allowed = res.headers.get('Access-Control-Allow-Methods') ?? '';
      for (const method of REQUIRED_METHODS) {
        expect(allowed.toUpperCase()).toContain(method);
      }
    });
  });
});
