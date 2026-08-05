// ---------------------------------------------------------------------------
// WI-3020 — International-routing launch-stop — integration test.
//
// Exercises the REAL llmMiddleware + REAL router.ts routeAndCall/routeAndStream
// together, so what is proven is "production learner-data routing is blocked",
// not "a predicate returns true". The only faked boundary is the LLM provider
// network call itself, via the sanctioned createMockProvider test fixture
// (services/llm/providers/mock.ts) registered through the real
// registerProvider() — no internal module is jest.mock'd (GC1).
//
// Three directions, because AC-2's inertness needs its own row:
//   (1) production + evidence pending  → blocked  (both entry points)
//   (2) production + evidence verified → proceeds (release lever works)
//   (3) development / staging + pending → proceeds (control is inert)
// ---------------------------------------------------------------------------

import { llmMiddleware, resetLlmMiddleware } from './llm';
import {
  routeAndCall,
  routeAndStream,
  registerProvider,
  _clearProviders,
  _resetCircuits,
  CircuitOpenError,
} from '../services/llm';
import { createMockProvider } from '../services/llm/test-utils';
// Real production constant — asserted against, never re-hardcoded, so a change
// to the documented seam forces this test to track it.
import {
  TRANSFER_GATE_SERVING_REGION,
  InternationalTransferBlockedError,
  assertLearnerDataEgressAllowed,
} from '../services/llm/transfer-evidence-gate';
import { generateEmbedding } from '../services/embeddings';

function createMockContext(env: Record<string, unknown>) {
  return { env } as unknown as Parameters<typeof llmMiddleware>[0];
}

/**
 * Simulates one HTTP request reaching llmMiddleware with the given Worker
 * bindings, and executes the LLM operation inside its request context — the
 * same path a production request takes.
 */
async function simulateRequest<T>(
  env: Record<string, unknown>,
  operation: () => Promise<T>,
): Promise<T> {
  const c = createMockContext(env);
  let result!: T;
  const next = async () => {
    result = await operation();
  };
  await llmMiddleware(c, next);
  return result;
}

/** Production bindings with the OPQ-110 lever in the given state. */
function productionEnv(
  lever: 'unset' | 'false' | 'true',
): Record<string, unknown> {
  return {
    ENVIRONMENT: 'production',
    ...(lever === 'unset'
      ? {}
      : { INTERNATIONAL_TRANSFER_EVIDENCE_VERIFIED: lever }),
  };
}

async function captureError(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (err) {
    return err;
  }
  return undefined;
}

describe('international-routing launch-stop (WI-3020)', () => {
  beforeEach(() => {
    resetLlmMiddleware();
    _clearProviders();
    _resetCircuits();
    // Registered directly so the router has a real provider to select without
    // making a network call. Its presence is what makes the "blocked" rows
    // meaningful: routing WOULD succeed if the gate let it through.
    registerProvider(createMockProvider('openai'));
  });

  describe('(1) production + OPQ-110 evidence pending → routing blocked', () => {
    it('blocks routeAndCall when the lever is unset (fail-closed on absence)', async () => {
      const caught = await captureError(() =>
        simulateRequest(productionEnv('unset'), () =>
          routeAndCall([{ role: 'user', content: 'hello' }]),
        ),
      );

      // Not just any CircuitOpenError — specifically the launch-stop one, so a
      // provider circuit trip cannot masquerade as compliance coverage.
      expect(caught).toBeInstanceOf(CircuitOpenError);
      expect((caught as CircuitOpenError).provider).toBe('transfer-evidence');
      expect((caught as CircuitOpenError).circuitKey).toBe(
        'policy:transfer-evidence-pending',
      );
    });

    it("blocks routeAndCall when the lever is explicitly 'false'", async () => {
      const caught = await captureError(() =>
        simulateRequest(productionEnv('false'), () =>
          routeAndCall([{ role: 'user', content: 'hello' }]),
        ),
      );

      expect(caught).toBeInstanceOf(CircuitOpenError);
      expect((caught as CircuitOpenError).provider).toBe('transfer-evidence');
    });

    it('blocks routeAndStream — the separate streaming entry point', async () => {
      const caught = await captureError(() =>
        simulateRequest(productionEnv('unset'), () =>
          routeAndStream([{ role: 'user', content: 'hello' }]),
        ),
      );

      expect(caught).toBeInstanceOf(CircuitOpenError);
      expect((caught as CircuitOpenError).provider).toBe('transfer-evidence');
    });

    it('degrades as an already-handled 503 LLM_UNAVAILABLE, not a raw provider error', async () => {
      const caught = await captureError(() =>
        simulateRequest(productionEnv('unset'), () =>
          routeAndCall([{ role: 'user', content: 'hello' }]),
        ),
      );

      // CircuitOpenError is the exact type index.ts's error handler already
      // maps to a 503 with safe copy, so every routeAndCall caller degrades
      // identically without new per-call-site plumbing.
      expect(caught).toBeInstanceOf(CircuitOpenError);
      expect((caught as CircuitOpenError).message).toMatch(
        /temporarily unavailable/i,
      );
    });

    it('emits a structured block line naming the refused serving region', async () => {
      const warnSpy = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      try {
        await captureError(() =>
          simulateRequest(productionEnv('unset'), () =>
            routeAndCall([{ role: 'user', content: 'hello' }]),
          ),
        );

        const line = warnSpy.mock.calls.find((call) =>
          String(call[0]).includes('llm.transfer_evidence.blocked'),
        );
        expect(line).toBeDefined();
        expect(JSON.parse(String(line![0])).context).toMatchObject({
          event: 'llm.transfer_evidence.blocked',
          surface: 'international_routing_launch_stop',
          environment: 'production',
          serving_region: TRANSFER_GATE_SERVING_REGION,
        });
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('(2) production + evidence lever satisfied → routing proceeds', () => {
    it('routes normally once the lever is flipped to true (the OPQ-110 release path)', async () => {
      const result = await simulateRequest(productionEnv('true'), () =>
        routeAndCall([{ role: 'user', content: 'hello' }]),
      );

      expect(result.provider).toBe('openai');
      expect(result.response).toContain('Mock response to');
    });

    it('routes routeAndStream normally once the lever is flipped to true', async () => {
      const result = await simulateRequest(productionEnv('true'), () =>
        routeAndStream([{ role: 'user', content: 'hello' }]),
      );

      expect(result.provider).toBe('openai');
    });

    it('blocks again when the lever goes back to false — no isolate-sticky state', async () => {
      const allowed = await simulateRequest(productionEnv('true'), () =>
        routeAndCall([{ role: 'user', content: 'hello' }]),
      );
      expect(allowed.provider).toBe('openai');

      const caught = await captureError(() =>
        simulateRequest(productionEnv('false'), () =>
          routeAndCall([{ role: 'user', content: 'hello' }]),
        ),
      );
      expect(caught).toBeInstanceOf(CircuitOpenError);
      expect((caught as CircuitOpenError).provider).toBe('transfer-evidence');
    });
  });

  describe('(3) outside production the control is inert (AC-2)', () => {
    it.each(['development', 'staging', 'test'])(
      'routes normally in %s with the evidence still pending',
      async (environment) => {
        const result = await simulateRequest({ ENVIRONMENT: environment }, () =>
          routeAndCall([{ role: 'user', content: 'hello' }]),
        );

        expect(result.provider).toBe('openai');
        expect(result.response).toContain('Mock response to');
      },
    );

    it('routes normally when no ENVIRONMENT binding is present at all', async () => {
      const result = await simulateRequest({}, () =>
        routeAndCall([{ role: 'user', content: 'hello' }]),
      );

      expect(result.provider).toBe('openai');
    });
  });
});

// ---------------------------------------------------------------------------
// [WI-3020 rework] The Voyage embedding boundary.
//
// The first cut of this launch-stop guarded routeAndCall/routeAndStream only,
// and `services/embeddings.ts` reaches Voyage AI with its own `fetch` — so
// production learner message text still egressed while the evidence was
// pending. These rows exist to make that regression impossible to reintroduce.
//
// They assert on the ABSENCE of the outbound call, not merely on a thrown
// error: an error raised AFTER the fetch would still have leaked the learner's
// text to an international provider, and would satisfy a rejects-toThrow test.
// `globalThis.fetch` is a true external boundary, so spying on it is GC1-clean
// — no internal module is mocked here.
// ---------------------------------------------------------------------------

const LEARNER_TEXT = 'my name is Ada and I live on Baker Street';

describe('international-routing launch-stop — Voyage embedding egress (WI-3020 rework)', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    resetLlmMiddleware();
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [{ embedding: new Array(1024).fill(0.1) }],
          model: 'voyage-3.5',
          usage: { total_tokens: 42 },
        }),
    } as unknown as Response);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('production + OPQ-110 evidence pending → NO request reaches Voyage', () => {
    it.each(['unset', 'false'] as const)(
      'makes no outbound call at all when the lever is %s',
      async (lever) => {
        const caught = await captureError(() =>
          simulateRequest(productionEnv(lever), () =>
            generateEmbedding(LEARNER_TEXT, 'pa-test-key'),
          ),
        );

        // The load-bearing assertion: the learner's text never left.
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(caught).toBeInstanceOf(InternationalTransferBlockedError);
        expect((caught as InternationalTransferBlockedError).surface).toBe(
          'voyage_embeddings',
        );
      },
    );

    it('emits the same structured block line as the router choke point', async () => {
      const warnSpy = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      try {
        await captureError(() =>
          simulateRequest(productionEnv('false'), () =>
            generateEmbedding(LEARNER_TEXT, 'pa-test-key'),
          ),
        );

        const line = warnSpy.mock.calls.find((call) =>
          String(call[0]).includes('llm.transfer_evidence.blocked'),
        );
        expect(line).toBeDefined();
        expect(JSON.parse(String(line![0])).context).toMatchObject({
          event: 'llm.transfer_evidence.blocked',
          surface: 'voyage_embeddings',
          destination: 'https://api.voyageai.com/v1/embeddings',
          environment: 'production',
          serving_region: TRANSFER_GATE_SERVING_REGION,
        });
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('the release lever and the inert states behave as for the router', () => {
    it('reaches Voyage once the lever is flipped to true (OPQ-110 release path)', async () => {
      const result = await simulateRequest(productionEnv('true'), () =>
        generateEmbedding(LEARNER_TEXT, 'pa-test-key'),
      );

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0]?.[0]).toBe(
        'https://api.voyageai.com/v1/embeddings',
      );
      expect(result.dimensions).toBe(1024);
    });

    it.each(['development', 'staging'])(
      'is inert in %s with the evidence still pending',
      async (environment) => {
        await simulateRequest({ ENVIRONMENT: environment }, () =>
          generateEmbedding(LEARNER_TEXT, 'pa-test-key'),
        );

        expect(fetchSpy).toHaveBeenCalledTimes(1);
      },
    );

    it('blocks again when the lever goes back to false — no isolate-sticky state', async () => {
      await simulateRequest(productionEnv('true'), () =>
        generateEmbedding(LEARNER_TEXT, 'pa-test-key'),
      );
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const caught = await captureError(() =>
        simulateRequest(productionEnv('false'), () =>
          generateEmbedding(LEARNER_TEXT, 'pa-test-key'),
        ),
      );

      expect(fetchSpy).toHaveBeenCalledTimes(1); // still the one released call
      expect(caught).toBeInstanceOf(InternationalTransferBlockedError);
    });
  });

  // The no-request-context posture cannot be driven through generateEmbedding
  // under Jest — NODE_ENV=test is exactly the exemption that keeps unit tests
  // runnable — so it is asserted on the shared gate function directly, which is
  // the same code path production takes with nodeTestEnv false.
  describe('a MISSING request context fails closed, not open', () => {
    it('blocks when no LLM request context is established outside a Node test env', () => {
      expect(() =>
        assertLearnerDataEgressAllowed({
          surface: 'voyage_embeddings',
          destination: 'https://api.voyageai.com/v1/embeddings',
          nodeTestEnv: false,
        }),
      ).toThrow(InternationalTransferBlockedError);
    });

    it('permits the same call inside a Node test env, so unit tests stay runnable', () => {
      expect(() =>
        assertLearnerDataEgressAllowed({
          surface: 'voyage_embeddings',
          destination: 'https://api.voyageai.com/v1/embeddings',
          nodeTestEnv: true,
        }),
      ).not.toThrow();
    });
  });
});
