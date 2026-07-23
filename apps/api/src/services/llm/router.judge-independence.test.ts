// ---------------------------------------------------------------------------
// WI-2624 — Judge vendor-independence enforcement (MMT-ADR-0016 §2).
//
// The bug: an LLM "judge" grading a tutor model's output could resolve to the
// SAME vendor that produced the output, via a double-flip:
//   1. judge-suitability.ts's `selectJudgeProvider` preselected the OPPOSITE
//      vendor and passed it into `routeAndCall` as `preferredProvider`.
//   2. The legacy `getModelConfig` judge branch re-derived its own "tutor
//      vendor" via a recursive `getModelConfig(..., 'text')` call — but that
//      recursive call received the ALREADY-FLIPPED `preferredProvider` as
//      its own preference hint, so it resolved the flipped vendor, not the
//      real producer.
//   3. `resolveGraderConfig` then excluded THAT (flipped) vendor — flipping
//      back onto the REAL PRODUCER. Independence defeated.
//
// The fix: callers declare a typed `JudgeIndependence` (model-output +
// producerVendor, or not-applicable) instead of preselecting a provider. The
// router excludes the declared producer (normalized) directly — no
// re-derivation, no double-flip. This file exercises the REAL router
// (`getModelConfigForTest` / `getFallbackConfigForTest`), not a mocked
// `routeAndCall` — the mocked-boundary tests in judge-suitability.test.ts
// cannot see this internal re-flip, which is exactly the hole that shipped
// the bug.
// ---------------------------------------------------------------------------

import {
  registerProvider,
  _clearProviders,
  _resetCircuits,
  setLlmRoutingV2Enabled,
  getModelConfigForTest,
  getFallbackConfigForTest,
  GRADER_MODEL,
  CircuitOpenError,
  routeAndCall,
} from './router';
import { createMockProvider } from './providers/mock';
import type { JudgeIndependence } from './router';
import type {
  ChatMessage,
  ChatResult,
  LLMProvider,
  ModelConfig,
} from './types';

function registerBaseline(): void {
  registerProvider(createMockProvider('anthropic'));
  registerProvider(createMockProvider('openai'));
  registerProvider(createMockProvider('gemini'));
  registerProvider(createMockProvider('cerebras'));
}

beforeEach(() => {
  _clearProviders();
  _resetCircuits();
  registerBaseline();
});

afterEach(() => {
  _clearProviders();
  _resetCircuits();
  setLlmRoutingV2Enabled(false);
  registerBaseline();
});

// ---------------------------------------------------------------------------
// THE decisive case — fallback exhaustion.
//
// producer=Anthropic → primary judge is OpenAI (the only non-producer,
// non-Gemini candidate). If OpenAI's circuit trips, the ONLY other candidate
// is Anthropic — the excluded producer. There is no safe fallback: the
// router must raise CircuitOpen via the SAME mapping
// `pickThroughExchangeRouter` uses for an emptied eligible set
// (`CircuitOpenError('policy-engine', 'policy:no-eligible-model')`), and must
// NEVER silently fail back onto the producer. Most naive fixes get the
// happy-path flip right and leak exactly here.
// ---------------------------------------------------------------------------
describe('[DECISIVE] judge fallback exhaustion never leaks back to the producer', () => {
  it.each([false, true])(
    'producer=Anthropic, primary=OpenAI tripped → CircuitOpen via policy:no-eligible-model (V2=%s)',
    (v2) => {
      setLlmRoutingV2Enabled(v2);
      const independence: JudgeIndependence = {
        mode: 'model-output',
        producerVendor: 'anthropic',
      };

      const primary = getModelConfigForTest(1, {
        capability: 'judge',
        judgeIndependence: independence,
      });
      expect(primary.provider).toBe('openai');

      expect(() =>
        getFallbackConfigForTest(primary, 1, {
          capability: 'judge',
          judgeIndependence: independence,
        }),
      ).toThrow(CircuitOpenError);

      try {
        getFallbackConfigForTest(primary, 1, {
          capability: 'judge',
          judgeIndependence: independence,
        });
        throw new Error('expected getFallbackConfigForTest to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(CircuitOpenError);
        expect((err as CircuitOpenError).provider).toBe('policy-engine');
        expect((err as CircuitOpenError).circuitKey).toBe(
          'policy:no-eligible-model',
        );
      }

      // NEVER the producer, under any circumstance.
      expect(primary.provider).not.toBe('anthropic');
    },
  );

  it.each([false, true])(
    'producer=OpenAI, primary=Anthropic tripped → CircuitOpen via policy:no-eligible-model (V2=%s)',
    (v2) => {
      setLlmRoutingV2Enabled(v2);
      const independence: JudgeIndependence = {
        mode: 'model-output',
        producerVendor: 'openai',
      };

      const primary = getModelConfigForTest(1, {
        capability: 'judge',
        judgeIndependence: independence,
      });
      expect(primary.provider).toBe('anthropic');

      expect(() =>
        getFallbackConfigForTest(primary, 1, {
          capability: 'judge',
          judgeIndependence: independence,
        }),
      ).toThrow(CircuitOpenError);
    },
  );
});

// ---------------------------------------------------------------------------
// Full matrix: producerVendor x mode x {primary, fallback} x V2 on/off.
// Every model-output case must resolve a FINAL judge vendor != producer, for
// both the primary pick and (when a fallback exists) the fallback pick.
// ---------------------------------------------------------------------------
type ProducerCase = { producer: string; normalizedToNonJudgeVendor: boolean };

const PRODUCERS: ProducerCase[] = [
  { producer: 'anthropic', normalizedToNonJudgeVendor: false },
  { producer: 'openai', normalizedToNonJudgeVendor: false },
  { producer: 'google', normalizedToNonJudgeVendor: true }, // Gemini family
  { producer: 'cerebras', normalizedToNonJudgeVendor: true },
];

describe.each([false, true])(
  'full matrix — LLM_ROUTING_V2_ENABLED=%s',
  (v2) => {
    beforeEach(() => setLlmRoutingV2Enabled(v2));

    describe.each(PRODUCERS)(
      'mode=model-output, producer=$producer',
      ({ producer, normalizedToNonJudgeVendor }) => {
        it('primary judge vendor != producer', () => {
          const cfg = getModelConfigForTest(1, {
            capability: 'judge',
            judgeIndependence: {
              mode: 'model-output',
              producerVendor: producer,
            },
          });
          expect(cfg.provider).not.toBe(producer);
          expect(cfg.provider).not.toBe('gemini');
          expect(cfg.provider).not.toBe('vertex');
          expect(cfg.reasoningEffort).toBeUndefined();
          // When the producer isn't a real judge candidate (Gemini/Cerebras/
          // etc.), the preference order (Anthropic first) applies unaffected.
          if (normalizedToNonJudgeVendor) {
            expect(cfg.provider).toBe('anthropic');
            expect(cfg.model).toBe(GRADER_MODEL);
          }
        });

        it('fallback judge vendor != producer (when a fallback exists)', () => {
          const independence: JudgeIndependence = {
            mode: 'model-output',
            producerVendor: producer,
          };
          const primary = getModelConfigForTest(1, {
            capability: 'judge',
            judgeIndependence: independence,
          });

          if (normalizedToNonJudgeVendor) {
            // Both anthropic and openai remain eligible → a fallback exists.
            const fb = getFallbackConfigForTest(primary, 1, {
              capability: 'judge',
              judgeIndependence: independence,
            });
            expect(fb).not.toBeNull();
            expect(fb?.provider).not.toBe(producer);
            expect(fb?.provider).not.toBe(primary.provider);
            expect(fb?.provider).not.toBe('gemini');
          } else {
            // producer IS anthropic or openai → only 1 eligible vendor total →
            // primary consumes it → no eligible fallback → CircuitOpen.
            expect(() =>
              getFallbackConfigForTest(primary, 1, {
                capability: 'judge',
                judgeIndependence: independence,
              }),
            ).toThrow(CircuitOpenError);
          }
        });
      },
    );

    describe('mode=not-applicable', () => {
      it('never routes to Gemini/Vertex; resolves anthropic by preference order', () => {
        const cfg = getModelConfigForTest(1, {
          capability: 'judge',
          judgeIndependence: { mode: 'not-applicable' },
        });
        expect(cfg.provider).not.toBe('gemini');
        expect(cfg.provider).not.toBe('vertex');
        expect(cfg.provider).toBe('anthropic');
        expect(cfg.model).toBe(GRADER_MODEL);
      });

      it('has a fallback (anthropic <-> openai) with no producer exclusion', () => {
        const independence: JudgeIndependence = { mode: 'not-applicable' };
        const primary = getModelConfigForTest(1, {
          capability: 'judge',
          judgeIndependence: independence,
        });
        const fb = getFallbackConfigForTest(primary, 1, {
          capability: 'judge',
          judgeIndependence: independence,
        });
        expect(fb).not.toBeNull();
        expect(fb?.provider).not.toBe(primary.provider);
        expect(fb?.provider).not.toBe('gemini');
      });
    });
  },
);

// ---------------------------------------------------------------------------
// RED -> GREEN: exercises the REAL end-to-end path (routeAndCall, real
// getModelConfig/getFallbackConfig resolution) with the producer declared
// exactly the way judge-suitability.ts declares it — a model-output judge for
// an Anthropic-produced tutor reply must NEVER resolve to Anthropic.
//
// RED on the pre-fix code: judge-suitability.ts's old `selectJudgeProvider`
// preselected 'openai' (the opposite of 'anthropic') and passed it as
// `preferredProvider`; the legacy `getModelConfig` judge branch then
// re-derived a "tutorConfig" via a recursive `getModelConfig(..., 'text')`
// call THAT ALSO received `preferredProvider: 'openai'` — resolving
// tutorConfig.provider to 'openai' (the flipped vendor, not the real
// producer) — `resolveGraderConfig` then excluded 'openai', flipping the
// judge BACK to 'anthropic': the double-flip. This test fails on that code
// (`result.provider === 'anthropic'`) and passes on the fix.
// Verified by hand: `git stash` the router.ts/judge-suitability.ts diff,
// re-run this test (fails), `git stash pop` (passes) — see WI-2624 report.
// ---------------------------------------------------------------------------
describe('[RED -> GREEN] end-to-end: model-output judge never resolves to the real producer', () => {
  function createCapturingProvider(id: string): LLMProvider & {
    lastConfig: ModelConfig | null;
  } {
    let captured: ModelConfig | null = null;
    const base = createMockProvider(id);
    return {
      ...base,
      get lastConfig() {
        return captured;
      },
      async chat(
        messages: ChatMessage[],
        config: ModelConfig,
      ): Promise<ChatResult> {
        captured = config;
        return base.chat(messages, config);
      },
    };
  }

  it('producer=anthropic, legacy path (V2 off, production default) → judge resolves to openai, never anthropic', async () => {
    setLlmRoutingV2Enabled(false);
    const anthropicSpy = createCapturingProvider('anthropic');
    registerProvider(anthropicSpy);
    registerProvider(createMockProvider('openai'));

    const result = await routeAndCall(
      [{ role: 'user', content: 'Grade this tutor reply.' }],
      1,
      {
        capability: 'judge',
        judgeIndependence: {
          mode: 'model-output',
          producerVendor: 'anthropic',
        },
        flow: 'judge.suitability',
      },
    );

    expect(result.provider).not.toBe('anthropic');
    expect(result.provider).toBe('openai');
  });

  it('producer=anthropic, V2 on → judge resolves to openai, never anthropic', async () => {
    setLlmRoutingV2Enabled(true);
    registerProvider(createMockProvider('anthropic'));
    registerProvider(createMockProvider('openai'));

    const result = await routeAndCall(
      [{ role: 'user', content: 'Grade this tutor reply.' }],
      1,
      {
        capability: 'judge',
        judgeIndependence: {
          mode: 'model-output',
          producerVendor: 'anthropic',
        },
        flow: 'judge.suitability',
      },
    );

    expect(result.provider).not.toBe('anthropic');
    expect(result.provider).toBe('openai');
  });
});
