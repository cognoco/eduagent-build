// ---------------------------------------------------------------------------
// Challenge Round grader service — unit tests (T5, 2026-06-26 plan).
//
// External boundaries mocked (GC1-compliant):
//   1. '../llm'          — LLM call (routeAndCall).  gc1-allow: LLM external boundary.
//   2. '../../inngest/client' — Inngest dispatch.  gc1-allow: external boundary.
//
// No internal modules are mocked. safeSend from '../safe-non-core' runs REAL
// code — its internals (logger.warn, setTimeout) are synchronous/inert in the
// Jest environment, so the observable side-effect (inngest.send invocation) is
// asserted via the inngest mock.
//
// RED→GREEN note for case (a): if grader.ts is absent or returns [] regardless,
// case (a) fails at `expect(items).toHaveLength(1)`.
// ---------------------------------------------------------------------------

jest.mock('../llm' /* gc1-allow: LLM external boundary */, () => {
  const actual = jest.requireActual('../llm') as typeof import('../llm');
  return {
    ...actual,
    routeAndCall: jest.fn(),
  };
});

const mockInngestSend = jest.fn();
jest.mock(
  '../../inngest/client' /* gc1-allow: external boundary — Inngest client */,
  () => {
    const actual = jest.requireActual(
      '../../inngest/client',
    ) as typeof import('../../inngest/client');
    return {
      ...actual,
      inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
    };
  },
);

import type { RouteResult } from '../llm';
import { routeAndCall } from '../llm';
import {
  runChallengeRoundGrader,
  type RunChallengeRoundGraderInput,
} from './grader';

const mockRouteAndCall = routeAndCall as jest.MockedFunction<
  typeof routeAndCall
>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function routeResult(response: string): RouteResult {
  return {
    response,
    provider: 'anthropic',
    model: 'test-grader-model',
    latencyMs: 10,
    stopReason: 'stop',
  };
}

// The solid-answer fixture that directly represents the gpt-oss regression.
const SOLID_VERDICT_JSON = JSON.stringify({
  items: [
    {
      concept: 'collision theory / activation energy',
      result: 'solid',
      evidence: 'links speed to collision frequency and energy',
      learnerQuote: 'particles move faster and collide more often',
      questionIdentity: {
        questionText: 'model-supplied text is overwritten',
        minimalLearningClaim:
          'higher temperature raises productive collision frequency',
        cognitiveOperation: 'causal_explanation',
        materialContext: 'most chemical reactions',
      },
    },
  ],
});

const BASE_INPUT: RunChallengeRoundGraderInput = {
  profileId: '00000000-0000-4000-8000-0000000000aa',
  askedQuestion: 'Why does increasing temperature speed up most reactions?',
  learnerAnswer:
    'Because the particles move faster and collide more often with enough energy.',
  answerEventId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  ageBracket: 'adolescent',
  conversationLanguage: 'en',
  sessionId: 'session-123',
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockRouteAndCall.mockReset();
  mockInngestSend.mockReset();
  mockInngestSend.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runChallengeRoundGrader', () => {
  // (a) The regression guard for the gpt-oss bug.
  //
  // The exact failure mode was: gpt-oss returned challenge_round_evaluation:[]
  // from the inline tutor envelope, making mastery silently never verify.
  //
  // RED: without a grader implementation this returns [].
  // GREEN: the grader parses the verdict and injects answerEventId.
  describe('(a) solid-answer regression — gpt-oss bug fix', () => {
    it('[RED→GREEN] solid answer produces one item with answerEventId injected', async () => {
      mockRouteAndCall.mockResolvedValue(routeResult(SOLID_VERDICT_JSON));

      const items = await runChallengeRoundGrader(BASE_INPUT);

      // Non-empty: this is the exact regression — the gpt-oss path produced [].
      expect(items.length).toBeGreaterThan(0);
      expect(items).toHaveLength(1);
      expect(items[0]!.result).toBe('solid');
      // answerEventId is server-injected; the model never saw or supplied it.
      expect(items[0]!.answerEventId).toBe(BASE_INPUT.answerEventId);
      expect(items[0]!.questionIdentity?.questionText).toBe(
        BASE_INPUT.askedQuestion,
      );
    });

    it('maps the concept and evidence fields from the verdict', async () => {
      mockRouteAndCall.mockResolvedValue(routeResult(SOLID_VERDICT_JSON));

      const items = await runChallengeRoundGrader(BASE_INPUT);

      expect(items[0]!.concept).toBe('collision theory / activation energy');
      expect(items[0]!.evidence).toBe(
        'links speed to collision frequency and energy',
      );
      expect(items[0]!.learnerQuote).toBe(
        'particles move faster and collide more often',
      );
    });
  });

  // (b) Other result types map through correctly.
  describe('(b) other result types', () => {
    it('partial verdict maps through with correction and injected answerEventId', async () => {
      mockRouteAndCall.mockResolvedValue(
        routeResult(
          JSON.stringify({
            items: [
              {
                concept: 'activation energy',
                result: 'partial',
                evidence: 'mentions speed but not the energy threshold',
                learnerQuote: 'move faster',
                correction:
                  'Also explain that particles need enough energy to overcome the activation energy barrier.',
              },
            ],
          }),
        ),
      );

      const items = await runChallengeRoundGrader(BASE_INPUT);

      expect(items).toHaveLength(1);
      expect(items[0]!.result).toBe('partial');
      expect(items[0]!.answerEventId).toBe(BASE_INPUT.answerEventId);
      expect(items[0]!.correction).toBeDefined();
    });

    it('missing verdict maps through with injected answerEventId', async () => {
      mockRouteAndCall.mockResolvedValue(
        routeResult(
          JSON.stringify({
            items: [
              {
                concept: 'kinetic molecular theory',
                result: 'missing',
                evidence: 'answer does not address the concept at all',
                learnerQuote: "I don't know",
                correction:
                  'Increasing temperature means particles have more kinetic energy and collide more frequently.',
              },
            ],
          }),
        ),
      );

      const items = await runChallengeRoundGrader(BASE_INPUT);

      expect(items[0]!.result).toBe('missing');
      expect(items[0]!.answerEventId).toBe(BASE_INPUT.answerEventId);
    });

    it('misconception verdict maps through with injected answerEventId', async () => {
      mockRouteAndCall.mockResolvedValue(
        routeResult(
          JSON.stringify({
            items: [
              {
                concept: 'reaction rate',
                result: 'misconception',
                evidence:
                  'incorrectly attributes speed to chemical structure changes',
                learnerQuote: 'the molecules change shape',
                correction:
                  'Temperature affects collision frequency and energy, not molecular structure.',
              },
            ],
          }),
        ),
      );

      const items = await runChallengeRoundGrader(BASE_INPUT);

      expect(items[0]!.result).toBe('misconception');
      expect(items[0]!.answerEventId).toBe(BASE_INPUT.answerEventId);
    });
  });

  // (c) routeAndCall throws → returns [] AND fires the degraded event.
  describe('(c) route error → fail-open + degraded event', () => {
    it('returns [] when routeAndCall throws', async () => {
      mockRouteAndCall.mockRejectedValue(new Error('circuit open'));

      const items = await runChallengeRoundGrader(BASE_INPUT);

      expect(items).toEqual([]);
    });

    it('fires app/challenge-round.grader_degraded with reason:route_error', async () => {
      mockRouteAndCall.mockRejectedValue(new Error('circuit open'));

      await runChallengeRoundGrader(BASE_INPUT);

      expect(mockInngestSend).toHaveBeenCalledTimes(1);
      expect(mockInngestSend).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'app/challenge-round.grader_degraded',
          data: expect.objectContaining({
            reason: 'route_error',
            profileId: BASE_INPUT.profileId,
            timestamp: expect.any(String),
          }),
        }),
      );
    });

    it('never throws into the caller when Inngest dispatch also fails', async () => {
      mockRouteAndCall.mockRejectedValue(new Error('circuit open'));
      mockInngestSend.mockRejectedValue(new Error('inngest down'));

      await expect(runChallengeRoundGrader(BASE_INPUT)).resolves.toEqual([]);
    });
  });

  // (d) model returns {"items":[]} → schema min(1) fail → [] + degraded event.
  describe('(d) empty items array → schema fail → fail-open + degraded event', () => {
    it('returns [] when items array is empty (min(1) guard)', async () => {
      mockRouteAndCall.mockResolvedValue(
        routeResult(JSON.stringify({ items: [] })),
      );

      const items = await runChallengeRoundGrader(BASE_INPUT);

      expect(items).toEqual([]);
    });

    it('fires degraded event with reason:schema_invalid for empty items', async () => {
      mockRouteAndCall.mockResolvedValue(
        routeResult(JSON.stringify({ items: [] })),
      );

      await runChallengeRoundGrader(BASE_INPUT);

      expect(mockInngestSend).toHaveBeenCalledTimes(1);
      expect(mockInngestSend).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'app/challenge-round.grader_degraded',
          data: expect.objectContaining({ reason: 'schema_invalid' }),
        }),
      );
    });
  });

  // Additional failure-mode coverage.
  describe('additional failure modes', () => {
    it('no-JSON response → [] and degraded event with reason:no_json', async () => {
      mockRouteAndCall.mockResolvedValue(
        routeResult('I cannot grade this answer.'),
      );

      const items = await runChallengeRoundGrader(BASE_INPUT);

      expect(items).toEqual([]);
      expect(mockInngestSend).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'app/challenge-round.grader_degraded',
          data: expect.objectContaining({ reason: 'no_json' }),
        }),
      );
    });

    it('malformed JSON (invalid schema shape) → [] and degraded event with reason:schema_invalid', async () => {
      mockRouteAndCall.mockResolvedValue(
        routeResult(JSON.stringify({ wrong_key: 'wrong_value' })),
      );

      const items = await runChallengeRoundGrader(BASE_INPUT);

      expect(items).toEqual([]);
      expect(mockInngestSend).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'app/challenge-round.grader_degraded',
          data: expect.objectContaining({ reason: 'schema_invalid' }),
        }),
      );
    });
  });

  // Routing options are passed correctly.
  describe('routing options', () => {
    it('routes with capability:judge, flow:challenge.grader, and responseFormat:json', async () => {
      mockRouteAndCall.mockResolvedValue(routeResult(SOLID_VERDICT_JSON));

      await runChallengeRoundGrader(BASE_INPUT);

      const [, , options] = mockRouteAndCall.mock.calls[0]!;
      expect(options?.capability).toBe('judge');
      expect(options?.flow).toBe('challenge.grader');
      expect(options?.responseFormat).toBe('json');
    });

    it('threads ageBracket and conversationLanguage into routeAndCall options', async () => {
      mockRouteAndCall.mockResolvedValue(routeResult(SOLID_VERDICT_JSON));

      await runChallengeRoundGrader(BASE_INPUT);

      const [, , options] = mockRouteAndCall.mock.calls[0]!;
      expect(options?.ageBracket).toBe(BASE_INPUT.ageBracket);
      expect(options?.conversationLanguage).toBe(
        BASE_INPUT.conversationLanguage,
      );
    });

    it('threads sessionId into routeAndCall options', async () => {
      mockRouteAndCall.mockResolvedValue(routeResult(SOLID_VERDICT_JSON));

      await runChallengeRoundGrader(BASE_INPUT);

      const [, , options] = mockRouteAndCall.mock.calls[0]!;
      expect(options?.sessionId).toBe(BASE_INPUT.sessionId);
    });

    // [WI-1800] An under-18 Challenge Round grading call must route through
    // capability:'judge' WITH the learner's (minor) ageBracket still threaded
    // through — the router, not this call site, is responsible for exempting
    // judge from the under-18 Gemini-ban gate (see router.test.ts
    // "[WI-1800] judge capability must not be hijacked..." for the actual
    // model-resolution regression coverage).
    //
    // NOTE on red-green-revert: routeAndCall is mocked at the external
    // boundary in this file (GC1-compliant), so this test cannot observe
    // which model config the real router resolves to — it can only assert
    // what grader.ts passes INTO routeAndCall, which is unaffected by the
    // WI-1800 bug (the bug lives entirely inside getModelConfig's internal
    // branch ordering). A true RED for the bug is only expressible in
    // router.test.ts, where getModelConfigForTest is exercised directly
    // against the real (unmocked) routing logic; this test does not go red
    // on current code and is not represented as doing so.
    it('an under-18 grading call still passes capability:judge with the minor ageBracket to routeAndCall', async () => {
      mockRouteAndCall.mockResolvedValue(routeResult(SOLID_VERDICT_JSON));

      const minorInput: RunChallengeRoundGraderInput = {
        ...BASE_INPUT,
        ageBracket: 'adolescent',
      };
      await runChallengeRoundGrader(minorInput);

      const [, , options] = mockRouteAndCall.mock.calls[0]!;
      expect(options?.capability).toBe('judge');
      expect(options?.ageBracket).toBe('adolescent');
    });
  });

  // Degraded event includes the opaque ids (no learner text).
  describe('degraded event payload data minimization', () => {
    it('degraded event carries sessionId and answerEventId (opaque ids) but no learner text', async () => {
      mockRouteAndCall.mockRejectedValue(new Error('circuit open'));

      await runChallengeRoundGrader(BASE_INPUT);

      const call = mockInngestSend.mock.calls[0]!;
      const payload = call[0] as {
        name: string;
        data: Record<string, unknown>;
      };
      expect(payload.data.sessionId).toBe(BASE_INPUT.sessionId);
      expect(payload.data.answerEventId).toBe(BASE_INPUT.answerEventId);
      // No learner text — privacy invariant.
      expect(payload.data.learnerAnswer).toBeUndefined();
      expect(payload.data.askedQuestion).toBeUndefined();
    });
  });
});
