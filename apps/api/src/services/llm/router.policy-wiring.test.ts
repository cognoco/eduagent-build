// ---------------------------------------------------------------------------
// Policy-engine wiring into the V2 LLM call path (WI-581 / WP-W3).
//
// The WP-W1 scaffold (policy-engine/router.ts) documented two W3 obligations:
//   1. `resolveExchangeRouter` becomes the actual model picker in the call
//      path (fail-closed on an empty eligibility set), and
//   2. callers map `NoEligibleModelError` to `CircuitOpenError` so the
//      existing 503 LLM_UNAVAILABLE handlers keep working.
//
// No internal jest.mock() — all implementations are real.
// ---------------------------------------------------------------------------

import { pickThroughExchangeRouter, CircuitOpenError } from './router';
import { NoEligibleModelError } from '../policy-engine';
import type { ModelConfig } from './types';

describe('[WI-581] policy-engine exchange-router wiring', () => {
  it('passes an eligible candidate through unchanged (identity pick)', () => {
    const config: ModelConfig = {
      provider: 'cerebras',
      model: 'gpt-oss-120b',
      maxTokens: 1024,
      reasoningEffort: 'high',
    };
    expect(pickThroughExchangeRouter(config)).toEqual(config);
  });

  it('carries non-routing fields (maxTokens, reasoningEffort) through the pick', () => {
    const config: ModelConfig = {
      provider: 'openai',
      model: 'gpt-5-mini',
      maxTokens: 2048,
      reasoningEffort: 'low',
      responseFormat: 'json',
    };
    const picked = pickThroughExchangeRouter(config);
    expect(picked.maxTokens).toBe(2048);
    expect(picked.reasoningEffort).toBe('low');
    expect(picked.responseFormat).toBe('json');
  });

  // 'vertex' is in FALLBACK_FORBIDDEN but is not (yet) a member of the
  // ModelConfig provider union — no production config can carry it today.
  // The cast exercises the forward-looking ban entry so the FULL forbidden
  // set is locked, not just its currently-constructible half (CodeRabbit
  // PR-915).
  it.each(['gemini', 'vertex'] as const)(
    'fail-closed: a banned vendor (%s) yields CircuitOpenError, never a silent serve',
    (provider) => {
      const config: ModelConfig = {
        provider: provider as ModelConfig['provider'],
        model:
          provider === 'vertex' ? 'vertex-gemini-2.5-pro' : 'gemini-2.5-pro',
        maxTokens: 1024,
      };
      expect(() => pickThroughExchangeRouter(config)).toThrow(CircuitOpenError);
    },
  );

  it('maps the empty-eligibility failure to CircuitOpenError — NoEligibleModelError never escapes', () => {
    const banned: ModelConfig = {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      maxTokens: 1024,
    };
    try {
      pickThroughExchangeRouter(banned);
      throw new Error('expected a throw');
    } catch (err) {
      expect(err).toBeInstanceOf(CircuitOpenError);
      expect(err).not.toBeInstanceOf(NoEligibleModelError);
      // The existing 503 handlers key off CircuitOpenError identity; the
      // circuit key makes the policy origin queryable in logs.
      expect((err as CircuitOpenError).circuitKey).toBe(
        'policy:no-eligible-model',
      );
    }
  });
});
