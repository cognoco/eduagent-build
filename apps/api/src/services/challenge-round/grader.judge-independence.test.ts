// ---------------------------------------------------------------------------
// [WI-2670] Challenge Round grader — real-router judge independence.
//
// grader.test.ts mocks `routeAndCall` at the external boundary (GC1-
// compliant), so it can only assert what grader.ts PASSES INTO routeAndCall —
// it cannot observe whether the router actually excludes the producer vendor
// (the same caveat router.judge-independence.test.ts notes about
// judge-suitability.test.ts). This file exercises the REAL router
// (`registerProvider` + real `routeAndCall`, no mock) to prove the exclusion
// actually happens.
//
// RED on pre-fix code: grader.ts declared `judgeIndependence: { mode:
// 'not-applicable' }` unconditionally, so the router applied NO producer
// exclusion — with only anthropic/openai registered, the router's plain
// preference order picks anthropic first, so a same-vendor producer=anthropic
// case is graded by anthropic itself. GREEN on the fix: grader.ts declares
// `mode: 'model-output'` with the real producerVendor, so the router excludes
// it and the OTHER vendor is always called.
// ---------------------------------------------------------------------------

import {
  registerProvider,
  _clearProviders,
  _resetCircuits,
  setLlmRoutingV2Enabled,
} from '../llm/router';
import type { ChatMessage, ChatResult, LLMProvider } from '../llm/types';
import {
  runChallengeRoundGrader,
  type RunChallengeRoundGraderInput,
} from './grader';

const VERDICT_JSON = JSON.stringify({
  items: [
    {
      concept: 'collision theory / activation energy',
      result: 'solid',
      evidence: 'links speed to collision frequency and energy',
      learnerQuote: 'particles move faster and collide more often',
    },
  ],
});

let calledProviders: string[];

function createTrackingProvider(id: string): LLMProvider {
  return {
    id,
    async chat(_messages: ChatMessage[]): Promise<ChatResult> {
      calledProviders.push(id);
      return { content: VERDICT_JSON, stopReason: 'stop' };
    },
    chatStream() {
      throw new Error('not exercised — grader uses routeAndCall (non-stream)');
    },
  };
}

function registerBaseline(): void {
  registerProvider(createTrackingProvider('anthropic'));
  registerProvider(createTrackingProvider('openai'));
}

const BASE_INPUT: Omit<RunChallengeRoundGraderInput, 'producerVendor'> = {
  profileId: '00000000-0000-4000-8000-0000000000aa',
  askedQuestion: 'Why does increasing temperature speed up most reactions?',
  learnerAnswer:
    'Because the particles move faster and collide more often with enough energy.',
  answerEventId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  ageBracket: 'adolescent',
  conversationLanguage: 'en',
  sessionId: 'session-123',
};

beforeEach(() => {
  calledProviders = [];
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

describe.each([false, true])(
  '[RED -> GREEN] Challenge Round grader never resolves to the real producer (LLM_ROUTING_V2_ENABLED=%s)',
  (v2) => {
    beforeEach(() => setLlmRoutingV2Enabled(v2));

    it('production-default same-vendor case: producer=anthropic → grader is graded by a DIFFERENT vendor, never anthropic', async () => {
      await runChallengeRoundGrader({
        ...BASE_INPUT,
        producerVendor: 'anthropic',
      });

      expect(calledProviders).toHaveLength(1);
      expect(calledProviders[0]).not.toBe('anthropic');
      expect(calledProviders[0]).toBe('openai');
    });

    it('producer=openai → grader is graded by a DIFFERENT vendor, never openai', async () => {
      await runChallengeRoundGrader({
        ...BASE_INPUT,
        producerVendor: 'openai',
      });

      expect(calledProviders).toHaveLength(1);
      expect(calledProviders[0]).not.toBe('openai');
      expect(calledProviders[0]).toBe('anthropic');
    });
  },
);

// ---------------------------------------------------------------------------
// [AC-4 fallback-divergence] The grader must exclude the vendor RECORDED at
// production time for the graded question — not whatever the router would
// otherwise pick if independence were mis-declared. This is proven at the
// session-exchange.ts layer (resolveAskedQuestion picks the LAST assistant
// turn's persisted producerVendor, never an earlier turn's) — see
// session-exchange.test.ts "[WI-2670] resolveAskedQuestion". Here we confirm
// the grader itself always honors whatever producerVendor it is given,
// including a value that differs from routing's own current-turn preference
// order (i.e. it never re-derives or ignores the passed-in vendor).
// ---------------------------------------------------------------------------
describe('[WI-2670] grader honors the exact producerVendor it is given', () => {
  it('excludes the given vendor even when it differs from the default preference order', async () => {
    // Default preference order would pick anthropic first when nothing is
    // excluded (see the not-applicable-mode assertions in
    // router.judge-independence.test.ts). Passing producerVendor:'anthropic'
    // must still force openai — proving the grader does not fall back to the
    // router's default preference regardless of which vendor is excluded.
    await runChallengeRoundGrader({
      ...BASE_INPUT,
      producerVendor: 'anthropic',
    });
    expect(calledProviders).toEqual(['openai']);
  });
});
