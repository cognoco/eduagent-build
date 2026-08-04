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
import { TRANSFER_GATE_SERVING_REGION } from '../services/llm/transfer-evidence-gate';

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
