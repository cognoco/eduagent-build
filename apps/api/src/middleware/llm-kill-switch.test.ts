// ---------------------------------------------------------------------------
// WI-1505 — Aggregate LLM traffic kill switch — integration test.
//
// Exercises the REAL llmMiddleware + REAL router.ts routeAndCall together,
// backed by a real in-memory KV, proving the per-request KV read
// (services/kv.ts readLlmKillSwitch) takes effect on the very NEXT
// "request" (a fresh llmMiddleware invocation) with no mobile release and no
// Worker redeploy. The only faked boundary is the LLM provider network call
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
function createInMemoryKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    put: async (key, value) => {
      store.set(key, String(value));
    },
    get: async (key) => store.get(key) ?? null,
    delete: async (key) => {
      store.delete(key);
    },
    list: async () => ({ keys: [], list_complete: true }),
    getWithMetadata: async () => ({ value: null, metadata: null }),
  };
}

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
  _resetVolumeCounters,
} from '../services/llm/test-utils';
// Real production constant — assert against the actual threshold, never a
// hardcoded guess, so a threshold change forces the test to track it.
import { LLM_DAILY_VOLUME_ALERT_THRESHOLD } from '../services/llm/router';
import { writeLlmKillSwitch, LLM_KILL_SWITCH_KEY } from '../services/kv';

function createMockContext(env: Record<string, unknown>) {
  return { env } as unknown as Parameters<typeof llmMiddleware>[0];
}

/**
 * Simulates one HTTP request reaching llmMiddleware — the same per-request
 * KV read a real Worker request performs. Calling this again after a KV
 * write is what proves "next request, no redeploy".
 */
async function simulateRequest(kv: KVNamespace): Promise<void> {
  const c = createMockContext({ ENVIRONMENT: 'test', SUBSCRIPTION_KV: kv });
  const next = jest.fn().mockResolvedValue(undefined);
  await llmMiddleware(c, next);
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

  it('(a) switch OFF (no key in KV) — routeAndCall behaves unchanged', async () => {
    await simulateRequest(kv);

    const result = await routeAndCall([{ role: 'user', content: 'hello' }]);

    expect(result.response).toContain('Mock response to');
    expect(result.provider).toBe('openai');
  });

  it('(b) switch ON — the NEXT request blocks before any provider is touched, no redeploy', async () => {
    await simulateRequest(kv); // request #1 — switch off
    const before = await routeAndCall([{ role: 'user', content: 'hello' }]);
    expect(before.provider).toBe('openai');

    // Operator flips the switch — a real KV write via the real kv.ts helper.
    await writeLlmKillSwitch(kv, true);
    expect(await kv.get(LLM_KILL_SWITCH_KEY)).toBe('1');

    // Request #2 re-reads KV via llmMiddleware (no code change, no restart).
    await simulateRequest(kv);

    await expect(
      routeAndCall([{ role: 'user', content: 'hello' }]),
    ).rejects.toThrow(CircuitOpenError);
  });

  it('(b2) switch ON — routeAndStream (streaming choke point) also blocks on the next request', async () => {
    // routeAndStream is the highest-traffic path (learner chat SSE) and a
    // SEPARATE entry point from routeAndCall, so the switch must be proven on
    // it independently.
    await simulateRequest(kv); // switch off — streaming works
    const ok = await routeAndStream([{ role: 'user', content: 'hello' }]);
    expect(ok.provider).toBe('openai');

    await writeLlmKillSwitch(kv, true);
    await simulateRequest(kv); // next request re-reads KV, no redeploy

    let caught: unknown;
    try {
      await routeAndStream([{ role: 'user', content: 'hello' }]);
    } catch (err) {
      caught = err;
    }
    // Not just any CircuitOpenError — specifically the kill-switch one, so a
    // real provider circuit-trip can't masquerade as switch coverage.
    expect(caught).toBeInstanceOf(CircuitOpenError);
    expect((caught as CircuitOpenError).provider).toBe('kill-switch');
  });

  it('(c) switch OFF again — traffic resumes on the next request', async () => {
    await simulateRequest(kv);
    await writeLlmKillSwitch(kv, true);
    await simulateRequest(kv);
    await expect(
      routeAndCall([{ role: 'user', content: 'hello' }]),
    ).rejects.toThrow(CircuitOpenError);

    // Operator flips the switch back off.
    await writeLlmKillSwitch(kv, false);
    expect(await kv.get(LLM_KILL_SWITCH_KEY)).toBeNull();

    await simulateRequest(kv); // request #3
    const result = await routeAndCall([{ role: 'user', content: 'hello' }]);
    expect(result.response).toContain('Mock response to');
    expect(result.provider).toBe('openai');
  });

  it('degraded mode is a user-safe, already-handled 503 error — no raw provider error, no hang', async () => {
    await writeLlmKillSwitch(kv, true);
    await simulateRequest(kv);

    let caught: unknown;
    try {
      await routeAndCall([{ role: 'user', content: 'hello' }]);
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
