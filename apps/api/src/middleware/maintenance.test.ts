// ---------------------------------------------------------------------------
// Maintenance gate middleware tests (CUT-B1 §2.1 / WI-586 runbook §4 step 1).
//
// Verifies the two-stage freeze gate:
//   - inert when both flags off (normal deploy)
//   - stage 1 (READONLY): 503s everything except /v1/health and /v1/inngest
//   - stage 2 (BLOCK_INNGEST): also 503s /v1/inngest
// Uses a real Hono app mounting the real middleware — no internal mocks.
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import { maintenanceGateMiddleware } from './maintenance';

function buildApp(env: {
  MAINTENANCE_READONLY?: string;
  MAINTENANCE_BLOCK_INNGEST?: string;
}) {
  const app = new Hono().basePath('/v1');
  app.use('*', maintenanceGateMiddleware);
  app.get('/health', (c) => c.json({ ok: true }));
  app.all('/inngest', (c) => c.json({ inngest: true }));
  app.get('/profiles', (c) => c.json({ profiles: [] }));
  app.post('/profiles', (c) => c.json({ created: true }, 201));

  // Routes are registered under basePath('/v1'); the request path must include
  // it (matching how the gate reads `c.req.path` post-basePath).
  const call = (path: string, method = 'GET') =>
    app.request(`/v1${path}`, { method }, env);
  return { call };
}

describe('maintenanceGateMiddleware', () => {
  describe('inert when both flags off (normal deploy)', () => {
    it('passes every request through', async () => {
      const { call } = buildApp({});
      expect((await call('/profiles')).status).toBe(200);
      expect((await call('/profiles', 'POST')).status).toBe(201);
      expect((await call('/health')).status).toBe(200);
      expect((await call('/inngest', 'POST')).status).toBe(200);
    });

    it('passes through when flags explicitly "false"', async () => {
      const { call } = buildApp({
        MAINTENANCE_READONLY: 'false',
        MAINTENANCE_BLOCK_INNGEST: 'false',
      });
      expect((await call('/profiles')).status).toBe(200);
    });
  });

  describe('stage 1 — MAINTENANCE_READONLY', () => {
    const env = { MAINTENANCE_READONLY: 'true' };

    it('503s ordinary user/API traffic (GET and POST alike)', async () => {
      const { call } = buildApp(env);
      const get = await call('/profiles');
      expect(get.status).toBe(503);
      expect(get.headers.get('Retry-After')).toBe('120');
      const body = await get.json();
      expect(body.code).toBe('SERVICE_UNAVAILABLE');

      // A GET that would JIT-provision a legacy account must be blocked too.
      expect((await call('/profiles', 'POST')).status).toBe(503);
    });

    it('exempts the health check', async () => {
      const { call } = buildApp(env);
      expect((await call('/health')).status).toBe(200);
    });

    it('KEEPS /v1/inngest deliverable so the drain can complete', async () => {
      const { call } = buildApp(env);
      expect((await call('/inngest', 'POST')).status).toBe(200);
    });
  });

  describe('stage 2 — MAINTENANCE_BLOCK_INNGEST', () => {
    const env = {
      MAINTENANCE_READONLY: 'true',
      MAINTENANCE_BLOCK_INNGEST: 'true',
    };

    it('hard-blocks /v1/inngest once stage 2 is set', async () => {
      const { call } = buildApp(env);
      expect((await call('/inngest', 'POST')).status).toBe(503);
    });

    it('still exempts the health check', async () => {
      const { call } = buildApp(env);
      expect((await call('/health')).status).toBe(200);
    });

    it('BLOCK_INNGEST alone (without READONLY) is inert — stage 2 needs stage 1', async () => {
      // Defensive: an operator must set READONLY first; BLOCK_INNGEST without
      // it is a no-op rather than a partial gate.
      const { call } = buildApp({ MAINTENANCE_BLOCK_INNGEST: 'true' });
      expect((await call('/profiles')).status).toBe(200);
      expect((await call('/inngest', 'POST')).status).toBe(200);
    });
  });
});
