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
  _clearProviders,
  _resetCircuits,
  CircuitOpenError,
} from '../services/llm';
import {
  createMockProvider,
  _resetVolumeCounters,
} from '../services/llm/test-utils';
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
    registerProvider(createMockProvider('gemini'));
  });

  it('(a) switch OFF (no key in KV) — routeAndCall behaves unchanged', async () => {
    await simulateRequest(kv);

    const result = await routeAndCall([{ role: 'user', content: 'hello' }]);

    expect(result.response).toContain('Mock response to');
    expect(result.provider).toBe('gemini');
  });

  it('(b) switch ON — the NEXT request blocks before any provider is touched, no redeploy', async () => {
    await simulateRequest(kv); // request #1 — switch off
    const before = await routeAndCall([{ role: 'user', content: 'hello' }]);
    expect(before.provider).toBe('gemini');

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
    expect(ok.provider).toBe('gemini');

    await writeLlmKillSwitch(kv, true);
    await simulateRequest(kv); // next request re-reads KV, no redeploy

    await expect(
      routeAndStream([{ role: 'user', content: 'hello' }]),
    ).rejects.toThrow(CircuitOpenError);
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
    expect(result.provider).toBe('gemini');
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
