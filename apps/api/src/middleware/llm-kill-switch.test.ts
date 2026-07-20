// ---------------------------------------------------------------------------
// WI-1505 — Aggregate LLM traffic kill switch — integration test.
//
// Exercises the REAL llmMiddleware + REAL router.ts routeAndCall together,
// backed by a real in-memory KV, proving the request-local lazy KV read
// (services/kv.ts readLlmKillSwitch) takes effect on the very NEXT request
// with no mobile release and no Worker redeploy. The only faked boundary is
// the LLM provider network call
// itself, via the sanctioned createMockProvider test fixture
// (services/llm/providers/mock.ts) registered through the real
// registerProvider() — no internal module is jest.mock'd (GC1).
// ---------------------------------------------------------------------------

// KVNamespace is a global ambient interface from @cloudflare/workers-types,
// intentionally omitted from tsconfig.spec.json (see services/kv.test.ts for
// the full rationale). This structural stand-in mirrors the real get/put/
// delete surface kv.ts and middleware/llm.ts actually use.
type KVNamespaceListResult<Key extends string = string> = {
  keys: Array<{ name: Key; expiration?: number; metadata?: unknown }>;
  list_complete: boolean;
  cursor?: string;
};

type KVNamespace = {
  put: (
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: {
      expirationTtl?: number;
      expiration?: number;
      metadata?: unknown;
    },
  ) => Promise<void>;
  get: (key: string) => Promise<string | null>;
  delete: (key: string) => Promise<void>;
  list: (options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }) => Promise<KVNamespaceListResult>;
  getWithMetadata: (
    key: string,
  ) => Promise<{ value: string | null; metadata: unknown }>;
};

/** Real in-memory KV — not a jest.fn mock — so writes/reads actually round-trip. */
function createInMemoryKV(
  onGet: (key: string) => void = () => undefined,
): KVNamespace {
  const store = new Map<string, string>();
  return {
    put: async (key, value) => {
      store.set(key, String(value));
    },
    get: async (key) => {
      onGet(key);
      return store.get(key) ?? null;
    },
    delete: async (key) => {
      store.delete(key);
    },
    list: async () => ({ keys: [], list_complete: true }),
    getWithMetadata: async () => ({ value: null, metadata: null }),
  };
}

import { Hono } from 'hono';
import { llmMiddleware, resetLlmMiddleware } from './llm';
import {
  routeAndCall,
  routeAndStream,
  registerProvider,
  setLlmEnvironment,
  _clearProviders,
  _resetCircuits,
  CircuitOpenError,
} from '../services/llm';
import {
  createMockProvider,
  _getLlmRoutingV2Enabled,
  _resetVolumeCounters,
} from '../services/llm/test-utils';
// Real production constant — assert against the actual threshold, never a
// hardcoded guess, so a threshold change forces the test to track it.
import { LLM_DAILY_VOLUME_ALERT_THRESHOLD } from '../services/llm/router';
import { writeLlmKillSwitch, LLM_KILL_SWITCH_KEY } from '../services/kv';

type LlmTestEnv = {
  Bindings: {
    GEMINI_API_KEY?: string;
    OPENAI_API_KEY?: string;
    ANTHROPIC_API_KEY?: string;
    CEREBRAS_API_KEY?: string;
    MISTRAL_API_KEY?: string;
    LLM_ROUTING_V2_ENABLED?: string;
    ENVIRONMENT?: string;
    SUBSCRIPTION_KV?: KVNamespace;
  };
};

function createDeferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createMockContext(env: Record<string, unknown>) {
  return { env } as unknown as Parameters<typeof llmMiddleware>[0];
}

/**
 * Simulates one HTTP request reaching llmMiddleware and executes the LLM
 * operation inside its request context. Calling this again after a KV write
 * proves "next request, no redeploy".
 */
async function simulateRequest<T>(
  kv: KVNamespace,
  operation: () => Promise<T>,
): Promise<T> {
  const c = createMockContext({ ENVIRONMENT: 'test', SUBSCRIPTION_KV: kv });
  let result!: T;
  const next = async () => {
    result = await operation();
  };
  await llmMiddleware(c, next);
  return result;
}

describe('LLM kill switch (WI-1505)', () => {
  let kv: KVNamespace;

  beforeEach(() => {
    resetLlmMiddleware();
    _clearProviders();
    _resetCircuits();
    _resetVolumeCounters();
    kv = createInMemoryKV();
    // Registered directly (not via llmMiddleware's key-based registration,
    // which we deliberately skip by using ENVIRONMENT: 'test' with no API
    // keys) so routeAndCall has a real provider to select without making a
    // real network call.
    registerProvider(createMockProvider('openai'));
  });

  it('[WI-1566] does not read kill-switch KV for a non-LLM Hono request', async () => {
    let getCalls = 0;
    kv = createInMemoryKV(() => {
      getCalls += 1;
    });
    const app = new Hono<LlmTestEnv>();
    app.use('*', llmMiddleware);
    app.get('/health', (c) => c.json({ status: 'ok' }));

    const response = await app.request(
      '/health',
      {},
      { ENVIRONMENT: 'test', SUBSCRIPTION_KV: kv },
    );

    expect(response.status).toBe(200);
    expect(getCalls).toBe(0);
  });

  it('[WI-1566] shares one in-flight lazy KV read across concurrent LLM calls in one request', async () => {
    let getCalls = 0;
    let callsBeforeFirstLlm = -1;
    let callsWhileReadInFlight = -1;
    const releaseKvRead = createDeferred();
    const backingKv = createInMemoryKV();
    kv = {
      ...backingKv,
      get: async (key) => {
        getCalls += 1;
        await releaseKvRead.promise;
        return backingKv.get(key);
      },
    };
    const app = new Hono<LlmTestEnv>();
    app.use('*', llmMiddleware);
    app.post('/llm', async (c) => {
      callsBeforeFirstLlm = getCalls;
      const firstCall = routeAndCall([{ role: 'user', content: 'first' }]);
      const secondCall = routeAndCall([{ role: 'user', content: 'second' }]);
      await Promise.resolve();
      callsWhileReadInFlight = getCalls;
      releaseKvRead.resolve();
      await Promise.all([firstCall, secondCall]);
      return c.json({ ok: true });
    });

    const response = await app.request(
      '/llm',
      { method: 'POST' },
      { ENVIRONMENT: 'test', SUBSCRIPTION_KV: kv },
    );

    expect(response.status).toBe(200);
    expect(callsBeforeFirstLlm).toBe(0);
    expect(callsWhileReadInFlight).toBe(1);
    expect(getCalls).toBe(1);
  });

  it('[WI-1566] isolates overlapping kill-switch decisions without a fail-open race', async () => {
    const activeKv = createInMemoryKV();
    const inactiveKv = createInMemoryKV();
    await writeLlmKillSwitch(activeKv, true);

    const activeEnteredHandler = createDeferred();
    const releaseActiveHandler = createDeferred();
    const app = new Hono<LlmTestEnv>();
    app.use('*', llmMiddleware);
    app.post('/llm', async (c) => {
      if (c.req.header('x-request-id') === 'active') {
        activeEnteredHandler.resolve();
        await releaseActiveHandler.promise;
      }
      try {
        const result = await routeAndCall([{ role: 'user', content: 'hello' }]);
        return c.json({ blocked: false, provider: result.provider });
      } catch (error) {
        if (error instanceof CircuitOpenError) {
          return c.json({ blocked: true }, 503);
        }
        throw error;
      }
    });

    const activeRequest = app.request(
      '/llm',
      { method: 'POST', headers: { 'x-request-id': 'active' } },
      { ENVIRONMENT: 'test', SUBSCRIPTION_KV: activeKv },
    );
    await activeEnteredHandler.promise;

    const inactiveResponse = await app.request(
      '/llm',
      { method: 'POST', headers: { 'x-request-id': 'inactive' } },
      { ENVIRONMENT: 'test', SUBSCRIPTION_KV: inactiveKv },
    );
    releaseActiveHandler.resolve();
    const activeResponse = await activeRequest;

    expect(inactiveResponse.status).toBe(200);
    expect(await inactiveResponse.json()).toMatchObject({ blocked: false });
    expect(activeResponse.status).toBe(503);
    expect(await activeResponse.json()).toEqual({ blocked: true });
  });

  it('[WI-1566] isolates routing-V2 values across overlapping requests', async () => {
    const enabledEnteredHandler = createDeferred();
    const releaseEnabledHandler = createDeferred();
    const app = new Hono<LlmTestEnv>();
    app.use('*', llmMiddleware);
    app.get('/routing', async (c) => {
      if (c.req.header('x-request-id') === 'enabled') {
        enabledEnteredHandler.resolve();
        await releaseEnabledHandler.promise;
      }
      return c.json({ routingV2: _getLlmRoutingV2Enabled() });
    });

    const enabledRequest = app.request(
      '/routing',
      { headers: { 'x-request-id': 'enabled' } },
      { ENVIRONMENT: 'test', LLM_ROUTING_V2_ENABLED: 'true' },
    );
    await enabledEnteredHandler.promise;

    const disabledResponse = await app.request(
      '/routing',
      { headers: { 'x-request-id': 'disabled' } },
      { ENVIRONMENT: 'test', LLM_ROUTING_V2_ENABLED: 'false' },
    );
    releaseEnabledHandler.resolve();
    const enabledResponse = await enabledRequest;

    expect(await disabledResponse.json()).toEqual({ routingV2: false });
    expect(await enabledResponse.json()).toEqual({ routingV2: true });
  });

  it('[WI-1566] isolates volume-metric environment tags across overlapping requests', async () => {
    const firstEnteredHandler = createDeferred();
    const releaseFirstHandler = createDeferred();
    const app = new Hono<LlmTestEnv>();
    app.use('*', llmMiddleware);
    app.post('/environment', async (c) => {
      if (c.req.header('x-request-id') === 'first') {
        firstEnteredHandler.resolve();
        await releaseFirstHandler.promise;
      }
      await routeAndCall([{ role: 'user', content: 'hello' }]);
      return c.json({ ok: true });
    });
    const logSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);

    let environments: string[] = [];
    try {
      const firstRequest = app.request(
        '/environment',
        { method: 'POST', headers: { 'x-request-id': 'first' } },
        { ENVIRONMENT: 'environment-a' },
      );
      await firstEnteredHandler.promise;

      const secondResponse = await app.request(
        '/environment',
        { method: 'POST', headers: { 'x-request-id': 'second' } },
        { ENVIRONMENT: 'environment-b' },
      );
      releaseFirstHandler.resolve();
      const firstResponse = await firstRequest;
      expect(firstResponse.status).toBe(200);
      expect(secondResponse.status).toBe(200);

      environments = logSpy.mock.calls
        .map(
          ([line]) =>
            JSON.parse(String(line)) as {
              message?: string;
              context?: { environment?: string };
            },
        )
        .filter((entry) => entry.message === 'llm.stop_reason')
        .map((entry) => entry.context?.environment)
        .filter((value): value is string => value !== undefined)
        .sort();
    } finally {
      logSpy.mockRestore();
    }

    expect(environments).toEqual(['environment-a', 'environment-b']);
  });

  it('(a) switch OFF (no key in KV) — routeAndCall behaves unchanged', async () => {
    const result = await simulateRequest(kv, () =>
      routeAndCall([{ role: 'user', content: 'hello' }]),
    );

    expect(result.response).toContain('Mock response to');
    expect(result.provider).toBe('openai');
  });

  it('(b) switch ON — the NEXT request blocks before any provider is touched, no redeploy', async () => {
    const before = await simulateRequest(kv, () =>
      routeAndCall([{ role: 'user', content: 'hello' }]),
    ); // request #1 — switch off
    expect(before.provider).toBe('openai');

    // Operator flips the switch — a real KV write via the real kv.ts helper.
    await writeLlmKillSwitch(kv, true);
    expect(await kv.get(LLM_KILL_SWITCH_KEY)).toBe('1');

    await expect(
      simulateRequest(kv, () =>
        routeAndCall([{ role: 'user', content: 'hello' }]),
      ),
    ).rejects.toThrow(CircuitOpenError);
  });

  it('(b2) switch ON — routeAndStream (streaming choke point) also blocks on the next request', async () => {
    // routeAndStream is the highest-traffic path (learner chat SSE) and a
    // SEPARATE entry point from routeAndCall, so the switch must be proven on
    // it independently.
    const ok = await simulateRequest(kv, () =>
      routeAndStream([{ role: 'user', content: 'hello' }]),
    ); // switch off — streaming works
    expect(ok.provider).toBe('openai');

    await writeLlmKillSwitch(kv, true);

    let caught: unknown;
    try {
      await simulateRequest(kv, () =>
        routeAndStream([{ role: 'user', content: 'hello' }]),
      ); // next request re-reads KV, no redeploy
    } catch (err) {
      caught = err;
    }
    // Not just any CircuitOpenError — specifically the kill-switch one, so a
    // real provider circuit-trip can't masquerade as switch coverage.
    expect(caught).toBeInstanceOf(CircuitOpenError);
    expect((caught as CircuitOpenError).provider).toBe('kill-switch');
  });

  it('(c) switch OFF again — traffic resumes on the next request', async () => {
    await writeLlmKillSwitch(kv, true);
    await expect(
      simulateRequest(kv, () =>
        routeAndCall([{ role: 'user', content: 'hello' }]),
      ),
    ).rejects.toThrow(CircuitOpenError);

    // Operator flips the switch back off.
    await writeLlmKillSwitch(kv, false);
    expect(await kv.get(LLM_KILL_SWITCH_KEY)).toBeNull();

    const result = await simulateRequest(kv, () =>
      routeAndCall([{ role: 'user', content: 'hello' }]),
    ); // next request
    expect(result.response).toContain('Mock response to');
    expect(result.provider).toBe('openai');
  });

  it('degraded mode is a user-safe, already-handled 503 error — no raw provider error, no hang', async () => {
    await writeLlmKillSwitch(kv, true);

    let caught: unknown;
    try {
      await simulateRequest(kv, () =>
        routeAndCall([{ role: 'user', content: 'hello' }]),
      );
    } catch (err) {
      caught = err;
    }

    // Reuses CircuitOpenError — the exact type index.ts's error handler and
    // routes/sessions.ts already map to a 503 LLM_UNAVAILABLE response with
    // safe copy, so every one of the ~20 callers degrades identically.
    expect(caught).toBeInstanceOf(CircuitOpenError);
    expect((caught as CircuitOpenError).message).toMatch(
      /temporarily unavailable/i,
    );
    expect((caught as CircuitOpenError).provider).toBe('kill-switch');
  });
});

// ---------------------------------------------------------------------------
// WI-1505 — Aggregate LLM volume-alert observability.
//
// Drives the REAL recordVolumeMetric via REAL routeAndCall (mock provider
// registered through real registerProvider — no internal jest.mock, GC1). The
// per-isolate counter emits ONE structured `logger.warn` line
// (`event: llm.volume.daily_threshold_exceeded`) when a (provider, environment)
// pair crosses LLM_DAILY_VOLUME_ALERT_THRESHOLD within a UTC day. logger.warn
// writes `console.warn(JSON.stringify({ ..., context }))` (services/logger.ts),
// so we spy on console.warn and count/inspect the alert line.
// ---------------------------------------------------------------------------
describe('LLM aggregate volume alert (WI-1505)', () => {
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    // resetLlmMiddleware() clears providers, the V2 flag, AND the kill-switch
    // flag — the latter matters because the kill-switch suite above leaves it
    // ON; without this reset every routeAndCall here would throw
    // CircuitOpenError instead of succeeding.
    resetLlmMiddleware();
    _resetCircuits();
    _resetVolumeCounters();
    setLlmEnvironment('test');
    registerProvider(createMockProvider('openai'));
    // Silence + capture structured log output. Mock console.log too so the
    // multi-thousand-call loops don't spew logStopReason JSON and stay fast.
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
    jest.useRealTimers();
  });

  /** Count only the volume-alert warn lines (ignore any other warns). */
  function volumeAlertCount(): number {
    return warnSpy.mock.calls.filter((c) =>
      String(c[0]).includes('llm.volume.daily_threshold_exceeded'),
    ).length;
  }

  /** Drive N successful routeAndCall invocations (each increments the counter). */
  async function drive(n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      await routeAndCall([{ role: 'user', content: 'x' }]);
    }
  }

  it('(vol-a) fires the threshold warn EXACTLY ONCE per isolate/day/(provider, environment)', async () => {
    await drive(LLM_DAILY_VOLUME_ALERT_THRESHOLD - 1);
    expect(volumeAlertCount()).toBe(0); // one below threshold → no alert yet

    await drive(1); // crosses the >= threshold
    expect(volumeAlertCount()).toBe(1);

    // Inspect the single alert line's shape (message + structured context).
    const alertCall = warnSpy.mock.calls.find((c) =>
      String(c[0]).includes('llm.volume.daily_threshold_exceeded'),
    );
    const entry = JSON.parse(String(alertCall![0]));
    expect(entry.level).toBe('warn');
    expect(entry.message).toBe('llm.volume.daily_threshold_exceeded');
    expect(entry.context).toMatchObject({
      event: 'llm.volume.daily_threshold_exceeded',
      surface: 'llm_volume_alert',
      provider: 'openai',
      environment: 'test',
      threshold: LLM_DAILY_VOLUME_ALERT_THRESHOLD,
      count: LLM_DAILY_VOLUME_ALERT_THRESHOLD,
    });

    // Further calls the SAME day must NOT re-alert (the `alerted` latch).
    await drive(5);
    expect(volumeAlertCount()).toBe(1);
  }, 30000);

  it('(vol-b) resets the counter on UTC-day rollover and re-alerts the next day', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-04T08:00:00.000Z'));

    await drive(LLM_DAILY_VOLUME_ALERT_THRESHOLD);
    expect(volumeAlertCount()).toBe(1);

    // Advance to the next UTC day. The (provider, environment) counter's
    // utcDate no longer matches, so the next call resets it to count=1 (well
    // below threshold → no immediate alert)...
    jest.setSystemTime(new Date('2026-07-05T08:00:00.000Z'));
    await drive(1);
    expect(volumeAlertCount()).toBe(1);

    // ...and crossing the fresh day's threshold re-alerts.
    await drive(LLM_DAILY_VOLUME_ALERT_THRESHOLD - 1);
    expect(volumeAlertCount()).toBe(2);
  }, 60000);

  it('(vol-c) _resetVolumeCounters() clears all state so the threshold re-alerts', async () => {
    await drive(LLM_DAILY_VOLUME_ALERT_THRESHOLD);
    expect(volumeAlertCount()).toBe(1);

    _resetVolumeCounters();

    await drive(LLM_DAILY_VOLUME_ALERT_THRESHOLD);
    expect(volumeAlertCount()).toBe(2);
  }, 60000);
});
