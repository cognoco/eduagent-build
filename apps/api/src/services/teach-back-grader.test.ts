// ---------------------------------------------------------------------------
// Teach-back grader service — unit tests (WI-1155 B2).
//
// External boundaries mocked (GC1-compliant):
//   1. './llm'          — LLM call (routeAndCall).  gc1-allow: LLM external boundary.
//   2. '../inngest/client' — Inngest dispatch.  gc1-allow: external boundary.
//
// No internal modules are mocked. safeSend from './safe-non-core' runs REAL
// code — its internals (logger.warn) are inert in Jest, so the observable
// side-effect (inngest.send invocation) is asserted via the inngest mock.
//
// RED→GREEN note for case (a): the grader is the server-side hard cap that fills
// signals.teach_back_assessment when the tutor model dropped it (proven 4/4 on
// the live model). Without a grader that parses the verdict, case (a) fails at
// `expect(rubric).toBeDefined()`.
// ---------------------------------------------------------------------------

jest.mock('./llm' /* gc1-allow: LLM external boundary */, () => {
  const actual = jest.requireActual('./llm') as typeof import('./llm');
  return {
    ...actual,
    routeAndCall: jest.fn(),
  };
});

const mockInngestSend = jest.fn();
jest.mock(
  '../inngest/client' /* gc1-allow: external boundary — Inngest client */,
  () => {
    const actual = jest.requireActual(
      '../inngest/client',
    ) as typeof import('../inngest/client');
    return {
      ...actual,
      inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
    };
  },
);

import type { RouteResult } from './llm';
import { routeAndCall } from './llm';
import {
  runTeachBackGrader,
  type RunTeachBackGraderInput,
} from './teach-back-grader';

const mockRouteAndCall = routeAndCall as jest.MockedFunction<
  typeof routeAndCall
>;

function routeResult(response: string): RouteResult {
  return {
    response,
    provider: 'anthropic',
    model: 'test-grader-model',
    latencyMs: 10,
    stopReason: 'stop',
  };
}

const VALID_VERDICT_JSON = JSON.stringify({
  completeness: 4,
  accuracy: 5,
  clarity: 3,
  overall_quality: 4,
  weakest_area: 'clarity',
  gap_identified: 'did not mention rapid burial preventing decay',
});

const BASE_INPUT: RunTeachBackGraderInput = {
  topic: 'fossilization',
  learnerExplanation:
    'Fossilization is when an animal dies and gets buried, then minerals replace the bones over millions of years.',
  ageBracket: 'child',
  conversationLanguage: 'en',
  sessionId: 'session-123',
};

beforeEach(() => {
  mockRouteAndCall.mockReset();
  mockInngestSend.mockReset();
  mockInngestSend.mockResolvedValue(undefined);
});

describe('runTeachBackGrader', () => {
  // (a) The core regression guard: the model dropped the rubric, so the server
  //     fallback must produce a numeric teach_back_assessment.
  describe('(a) fires when signal absent — produces numeric rubric', () => {
    it('[RED→GREEN] valid verdict returns a defined rubric with all four numeric scores', async () => {
      mockRouteAndCall.mockResolvedValue(routeResult(VALID_VERDICT_JSON));

      const rubric = await runTeachBackGrader(BASE_INPUT);

      expect(rubric).toBeDefined();
      expect(rubric!.completeness).toBe(4);
      expect(rubric!.accuracy).toBe(5);
      expect(rubric!.clarity).toBe(3);
      expect(rubric!.overall_quality).toBe(4);
      expect(rubric!.weakest_area).toBe('clarity');
      expect(rubric!.gap_identified).toBe(
        'did not mention rapid burial preventing decay',
      );
    });

    it('accepts a null gap_identified', async () => {
      mockRouteAndCall.mockResolvedValue(
        routeResult(
          JSON.stringify({
            completeness: 5,
            accuracy: 5,
            clarity: 5,
            overall_quality: 5,
            weakest_area: 'accuracy',
            gap_identified: null,
          }),
        ),
      );

      const rubric = await runTeachBackGrader(BASE_INPUT);

      expect(rubric).toBeDefined();
      expect(rubric!.gap_identified).toBeNull();
    });
  });

  // (b) Fail-open: any failure returns undefined (leaving the field absent) AND
  //     fires the degraded observability event.
  describe('(b) route error → fail-open + degraded event', () => {
    it('returns undefined when routeAndCall throws', async () => {
      mockRouteAndCall.mockRejectedValue(new Error('circuit open'));

      const rubric = await runTeachBackGrader(BASE_INPUT);

      expect(rubric).toBeUndefined();
    });

    it('fires app/teach-back.grader_degraded with reason:route_error', async () => {
      mockRouteAndCall.mockRejectedValue(new Error('circuit open'));

      await runTeachBackGrader(BASE_INPUT);

      expect(mockInngestSend).toHaveBeenCalledTimes(1);
      expect(mockInngestSend).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'app/teach-back.grader_degraded',
          data: expect.objectContaining({ reason: 'route_error' }),
        }),
      );
    });

    it('never throws into the caller when Inngest dispatch also fails', async () => {
      mockRouteAndCall.mockRejectedValue(new Error('circuit open'));
      mockInngestSend.mockRejectedValue(new Error('inngest down'));

      await expect(runTeachBackGrader(BASE_INPUT)).resolves.toBeUndefined();
    });
  });

  // (c) Schema-invalid: missing a required numeric score → undefined + event.
  describe('(c) schema-invalid → fail-open + degraded event', () => {
    it('returns undefined when a required numeric score is missing', async () => {
      mockRouteAndCall.mockResolvedValue(
        routeResult(
          JSON.stringify({
            completeness: 4,
            accuracy: 5,
            clarity: 3,
            // overall_quality missing
            weakest_area: 'clarity',
          }),
        ),
      );

      const rubric = await runTeachBackGrader(BASE_INPUT);

      expect(rubric).toBeUndefined();
      expect(mockInngestSend).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'app/teach-back.grader_degraded',
          data: expect.objectContaining({ reason: 'schema_invalid' }),
        }),
      );
    });

    it('wrong-shape JSON → undefined + degraded event with reason:schema_invalid', async () => {
      mockRouteAndCall.mockResolvedValue(
        routeResult(JSON.stringify({ wrong_key: 'wrong_value' })),
      );

      const rubric = await runTeachBackGrader(BASE_INPUT);

      expect(rubric).toBeUndefined();
      expect(mockInngestSend).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'app/teach-back.grader_degraded',
          data: expect.objectContaining({ reason: 'schema_invalid' }),
        }),
      );
    });
  });

  // (d) No JSON at all in the response.
  describe('(d) no-JSON response → fail-open + degraded event', () => {
    it('returns undefined and fires reason:no_json', async () => {
      mockRouteAndCall.mockResolvedValue(
        routeResult('I cannot grade this explanation.'),
      );

      const rubric = await runTeachBackGrader(BASE_INPUT);

      expect(rubric).toBeUndefined();
      expect(mockInngestSend).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'app/teach-back.grader_degraded',
          data: expect.objectContaining({ reason: 'no_json' }),
        }),
      );
    });
  });
});
