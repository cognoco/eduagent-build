import { app } from '../index';

describe('CORS middleware', () => {
  const LOCALHOST_ORIGINS = [
    'http://localhost:8081',
    'http://localhost:19006',
    'http://localhost:3000',
    'http://127.0.0.1:8081',
  ];

  const PRODUCTION_ORIGINS = [
    'https://mentomate.com',
    'https://app.mentomate.com',
  ];

  const BLOCKED_ORIGINS = [
    'https://evil.com',
    'https://localhost.evil.com',
    'https://mentomate.com.evil.com',
    'http://app.mentomate.com', // http rejected for production
    // [BUG-244] Subdomain-takeover defense: any *.mentomate.com hostname not
    // in the explicit ALLOWED_PRODUCTION_ORIGINS allowlist must be rejected.
    // Previously the policy allowed every .mentomate.com subdomain with
    // credentials:true, which let any compromised vendor / dangling CNAME
    // read authenticated responses.
    'https://attacker.mentomate.com',
    'https://preview-pr-42.mentomate.com',
    'https://anything-not-allowlisted.mentomate.com',
  ];

  const REQUIRED_HEADERS = [
    'Authorization',
    'Content-Type',
    'X-Profile-Id',
    'X-Proxy-Mode',
  ];

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
        'http://localhost:8081',
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

    it('includes CORS headers on protected-route 401 responses', async () => {
      const res = await app.request('/v1/profiles', {
        headers: { Origin: 'http://127.0.0.1:19008' },
      });

      expect(res.status).toBe(401);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
        'http://127.0.0.1:19008',
      );
    });
  });

  // [BUG-245] Global hono/secure-headers middleware — the JSON API must
  // emit the standard defensive header set on every response. We assert the
  // load-bearing ones (nosniff blocks MIME sniffing, X-Frame-Options blocks
  // clickjacking of any HTML response, Referrer-Policy keeps tokens out of
  // outbound Referer). The headers are global, so any route is a fine probe.
  describe('global security headers (BUG-245)', () => {
    it('sets X-Content-Type-Options: nosniff', async () => {
      const res = await app.request('/v1/health');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('sets X-Frame-Options: DENY', async () => {
      const res = await app.request('/v1/health');
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    });

    it('sets Referrer-Policy: strict-origin-when-cross-origin', async () => {
      const res = await app.request('/v1/health');
      expect(res.headers.get('Referrer-Policy')).toBe(
        'strict-origin-when-cross-origin',
      );
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
