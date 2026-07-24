const { createInngestTransportCapture } =
  require('../test-utils/inngest-transport-capture') as typeof import('../test-utils/inngest-transport-capture');

const mockInngestTransport = createInngestTransportCapture();
const mockCaptureException = jest.fn();

jest.mock('../inngest/client', () => {
  const actual = jest.requireActual(
    '../inngest/client',
  ) as typeof import('../inngest/client');
  return { ...actual, ...mockInngestTransport.module };
});

jest.mock(
  '../services/sentry' /* gc1-allow: Sentry service is the external observability boundary for this route test */,
  () => ({
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  }),
);

import { Hono } from 'hono';
import { ERROR_CODES } from '@eduagent/schemas';
import { maintenanceRoutes } from './maintenance';

type TestEnv = {
  Bindings: {
    ENVIRONMENT?: string;
    MAINTENANCE_SECRET?: string;
    MAINTENANCE_PRODUCTION_ENABLED?: string;
    SENTRY_DSN?: string;
  };
};

function createTestApp(bindings: TestEnv['Bindings']) {
  const app = new Hono<TestEnv>();
  app.use('*', async (c, next) => {
    c.env = bindings;
    await next();
  });
  app.route('/', maintenanceRoutes);
  return app;
}

describe('maintenanceRoutes', () => {
  beforeEach(() => {
    mockInngestTransport.clear();
    mockCaptureException.mockClear();
  });

  // ----- Break-test for length-leak timing oracle ------------------------
  // The previous implementation of constantTimeEqual short-circuited on
  // `left.length !== right.length`, letting an attacker distinguish "wrong
  // length" from "right length, wrong bytes" by observing response timing.
  // The fix hashes both inputs with SHA-256 HMAC before comparing, so the
  // XOR loop always runs over fixed-length 32-byte digests.
  //
  // We can't measure wall-clock timing reliably in unit tests, so we
  // instead assert that `crypto.subtle.sign` is called the same number of
  // times in BOTH the equal-length and unequal-length cases. If a future
  // refactor reintroduces an early-exit on length mismatch, the call count
  // for the unequal-length case will drop and this test will fail.
  describe('constantTimeEqual length-leak break-test', () => {
    it('runs the HMAC digest in both equal- and unequal-length cases (no early-exit)', async () => {
      const realSubtle = globalThis.crypto.subtle;
      const signSpy = jest.spyOn(realSubtle, 'sign');

      try {
        // Unequal-length attempt: header is 1 char, secret is 2 chars.
        const appUnequal = createTestApp({ MAINTENANCE_SECRET: 'ab' });
        const resUnequal = await appUnequal.request(
          '/maintenance/sentry-smoke',
          {
            method: 'POST',
            headers: { 'X-Maintenance-Secret': 'a' },
          },
        );
        expect(resUnequal.status).toBe(403);
        const signCallsUnequal = signSpy.mock.calls.length;

        signSpy.mockClear();

        // Equal-length attempt: both 2 chars, wrong bytes.
        const appEqual = createTestApp({ MAINTENANCE_SECRET: 'ab' });
        const resEqual = await appEqual.request('/maintenance/sentry-smoke', {
          method: 'POST',
          headers: { 'X-Maintenance-Secret': 'xy' },
        });
        expect(resEqual.status).toBe(403);
        const signCallsEqual = signSpy.mock.calls.length;

        // Both code paths must call HMAC sign the same number of times.
        // If the length-leak short-circuit returns, signCallsUnequal drops to 0.
        expect(signCallsUnequal).toBeGreaterThanOrEqual(2);
        expect(signCallsUnequal).toBe(signCallsEqual);
      } finally {
        signSpy.mockRestore();
      }
    });
  });

  it('rejects sentry smoke without the maintenance secret', async () => {
    const app = createTestApp({ MAINTENANCE_SECRET: 'secret' });

    const res = await app.request('/maintenance/sentry-smoke', {
      method: 'POST',
    });

    expect(res.status).toBe(403);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('captures a sentry smoke exception with a valid secret', async () => {
    const app = createTestApp({
      ENVIRONMENT: 'production',
      MAINTENANCE_SECRET: 'secret',
      SENTRY_DSN: 'https://example@sentry.io/123',
    });

    const res = await app.request('/maintenance/sentry-smoke', {
      method: 'POST',
      headers: { 'X-Maintenance-Secret': 'secret' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      captured: boolean;
      smokeId: string;
      sentryConfigured: boolean;
    };
    expect(body).toEqual({
      captured: true,
      smokeId: expect.any(String),
      sentryConfigured: true,
    });
    expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error), {
      requestPath: '/maintenance/sentry-smoke',
      extra: {
        surface: 'maintenance.sentry-smoke',
        smokeId: body.smokeId,
        environment: 'production',
        sentryConfigured: true,
      },
    });
  });

  it('rejects the LLM volume alert probe without the maintenance secret', async () => {
    const app = createTestApp({ MAINTENANCE_SECRET: 'secret' });
    const warnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    try {
      const res = await app.request('/maintenance/llm-volume-alert-probe', {
        method: 'POST',
      });

      expect(res.status).toBe(403);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('emits one bounded LLM volume alert probe with a valid secret', async () => {
    const app = createTestApp({
      ENVIRONMENT: 'production',
      MAINTENANCE_SECRET: 'secret',
    });
    const warnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    try {
      const res = await app.request('/maintenance/llm-volume-alert-probe', {
        method: 'POST',
        headers: { 'X-Maintenance-Secret': 'secret' },
      });
      const body = (await res.json()) as {
        emitted: boolean;
        provider: string;
        emittedAt: string;
        utcDate: string;
      };

      expect(res.status).toBe(200);
      expect(body).toEqual({
        emitted: true,
        provider: 'synthetic-operator-probe',
        emittedAt: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
        ),
        utcDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
      expect(body.emittedAt.slice(0, 10)).toBe(body.utcDate);
      expect(warnSpy).toHaveBeenCalledTimes(1);

      const entry = JSON.parse(String(warnSpy.mock.calls[0]?.[0])) as {
        level: string;
        message: string;
        context: Record<string, unknown>;
      };
      expect(entry).toMatchObject({
        level: 'warn',
        message: 'llm.volume.daily_threshold_exceeded',
        context: {
          event: 'llm.volume.daily_threshold_exceeded',
          surface: 'llm_volume_alert',
          provider: 'synthetic-operator-probe',
          environment: 'production',
          count: 1,
          threshold: 1,
          utc_date: body.utcDate,
        },
      });
      expect(Object.keys(entry.context).sort()).toEqual([
        'count',
        'environment',
        'event',
        'provider',
        'surface',
        'threshold',
        'utc_date',
      ]);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('rejects memory facts backfill without the maintenance secret', async () => {
    const app = createTestApp({ MAINTENANCE_SECRET: 'secret' });

    const res = await app.request('/maintenance/memory-facts-backfill', {
      method: 'POST',
    });

    expect(res.status).toBe(403);
    expect(mockInngestTransport.sentEvents).toHaveLength(0);
  });

  it('dispatches the memory facts backfill event with a valid secret', async () => {
    const app = createTestApp({
      ENVIRONMENT: 'staging',
      MAINTENANCE_SECRET: 'secret',
    });

    const res = await app.request('/maintenance/memory-facts-backfill', {
      method: 'POST',
      headers: { 'X-Maintenance-Secret': 'secret' },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ queued: true });
    expect(mockInngestTransport.sentPayloads()).toEqual([
      {
        name: 'admin/memory-facts-backfill.requested',
        data: {
          requestedAt: expect.any(String),
          environment: 'staging',
        },
      },
    ]);
  });

  it('[WI-158] reports memory facts backfill dispatch failure as a typed API error', async () => {
    mockInngestTransport.setSendError(new Error('transport down'));
    const app = createTestApp({
      ENVIRONMENT: 'staging',
      MAINTENANCE_SECRET: 'secret',
    });

    const res = await app.request('/maintenance/memory-facts-backfill', {
      method: 'POST',
      headers: { 'X-Maintenance-Secret': 'secret' },
    });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Failed to queue maintenance backfill',
    });
    expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error), {
      requestPath: '/maintenance/memory-facts-backfill',
      extra: {
        surface: 'maintenance.memory-facts-backfill',
        environment: 'staging',
      },
    });
  });

  it('rejects self progress backfill without the maintenance secret', async () => {
    const app = createTestApp({ MAINTENANCE_SECRET: 'secret' });

    const res = await app.request(
      '/maintenance/progress-self-reports-backfill',
      {
        method: 'POST',
      },
    );

    expect(res.status).toBe(403);
    expect(mockInngestTransport.sentEvents).toHaveLength(0);
  });

  it('dispatches the self progress backfill event with a valid secret', async () => {
    const app = createTestApp({
      ENVIRONMENT: 'staging',
      MAINTENANCE_SECRET: 'secret',
    });

    const res = await app.request(
      '/maintenance/progress-self-reports-backfill',
      {
        method: 'POST',
        headers: { 'X-Maintenance-Secret': 'secret' },
      },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ queued: true });
    expect(mockInngestTransport.sentPayloads()).toEqual([
      {
        name: 'admin/progress-self-reports-backfill.requested',
        data: {
          requestedAt: expect.any(String),
          environment: 'staging',
        },
      },
    ]);
  });

  it('[WI-158] reports self progress backfill dispatch failure as a typed API error', async () => {
    mockInngestTransport.setSendError(new Error('transport down'));
    const app = createTestApp({
      ENVIRONMENT: 'staging',
      MAINTENANCE_SECRET: 'secret',
    });

    const res = await app.request(
      '/maintenance/progress-self-reports-backfill',
      {
        method: 'POST',
        headers: { 'X-Maintenance-Secret': 'secret' },
      },
    );

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Failed to queue maintenance backfill',
    });
    expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error), {
      requestPath: '/maintenance/progress-self-reports-backfill',
      extra: {
        surface: 'maintenance.progress-self-reports-backfill',
        environment: 'staging',
      },
    });
  });

  // ----- [BUG-875] Environment gate on backfill routes -------------------
  // Backfill routes (memory-facts / progress-self-reports) were gated ONLY by
  // MAINTENANCE_SECRET, with no ENVIRONMENT check. Because Doppler pushes
  // secrets everywhere by default, MAINTENANCE_SECRET is configured in
  // production — so anyone with the secret could fire a full-table-scan +
  // Inngest re-emission backfill in prod (LLM token burn, queue flood,
  // possible data corruption). The fix mirrors the test-seed.ts fail-closed
  // pattern: fail-closed on production by default, with an explicit
  // MAINTENANCE_PRODUCTION_ENABLED='true' opt-in for the rare intentional
  // prod backfill. development/staging remain unaffected.
  describe('[BUG-875] backfill environment gate', () => {
    const BACKFILL_ROUTES = [
      '/maintenance/memory-facts-backfill',
      '/maintenance/progress-self-reports-backfill',
    ] as const;

    for (const route of BACKFILL_ROUTES) {
      it(`[break-test] refuses ${route} in production even WITH a valid secret (no opt-in)`, async () => {
        const app = createTestApp({
          ENVIRONMENT: 'production',
          MAINTENANCE_SECRET: 'secret',
        });

        const res = await app.request(route, {
          method: 'POST',
          headers: { 'X-Maintenance-Secret': 'secret' },
        });

        expect(res.status).toBe(403);
        // The unauthorized backfill must never reach the Inngest transport.
        expect(mockInngestTransport.sentEvents).toHaveLength(0);
      });

      it(`[break-test] refuses ${route} for unrecognised/undefined ENVIRONMENT (fail-closed)`, async () => {
        const app = createTestApp({
          // ENVIRONMENT unset — e.g. a partial Doppler sync. Must be treated
          // as production (deny), not silently allowed.
          MAINTENANCE_SECRET: 'secret',
        });

        const res = await app.request(route, {
          method: 'POST',
          headers: { 'X-Maintenance-Secret': 'secret' },
        });

        expect(res.status).toBe(403);
        expect(mockInngestTransport.sentEvents).toHaveLength(0);
      });

      it(`allows ${route} in production with MAINTENANCE_PRODUCTION_ENABLED='true' opt-in`, async () => {
        const app = createTestApp({
          ENVIRONMENT: 'production',
          MAINTENANCE_SECRET: 'secret',
          MAINTENANCE_PRODUCTION_ENABLED: 'true',
        });

        const res = await app.request(route, {
          method: 'POST',
          headers: { 'X-Maintenance-Secret': 'secret' },
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ queued: true });
        expect(mockInngestTransport.sentEvents).toHaveLength(1);
      });

      it(`refuses ${route} in production when MAINTENANCE_PRODUCTION_ENABLED is a non-"true" value`, async () => {
        const app = createTestApp({
          ENVIRONMENT: 'production',
          MAINTENANCE_SECRET: 'secret',
          MAINTENANCE_PRODUCTION_ENABLED: 'yes',
        });

        const res = await app.request(route, {
          method: 'POST',
          headers: { 'X-Maintenance-Secret': 'secret' },
        });

        expect(res.status).toBe(403);
        expect(mockInngestTransport.sentEvents).toHaveLength(0);
      });

      it(`still dispatches ${route} in development without any opt-in`, async () => {
        const app = createTestApp({
          ENVIRONMENT: 'development',
          MAINTENANCE_SECRET: 'secret',
        });

        const res = await app.request(route, {
          method: 'POST',
          headers: { 'X-Maintenance-Secret': 'secret' },
        });

        expect(res.status).toBe(200);
        expect(mockInngestTransport.sentEvents).toHaveLength(1);
      });
    }
  });
});
