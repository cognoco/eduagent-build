// ---------------------------------------------------------------------------
// Suitability-judge service — unit tests (MMT-ADR-0016 §2, judge framework
// phase 4 increment 1).
//
// routeAndCall is the LLM boundary — the one allowed external-boundary mock
// (AGENTS.md). Mocked via the ../llm barrel with jest.requireActual + a single
// fn override so every other export stays real.
// ---------------------------------------------------------------------------

// gc1-allow: LLM boundary — routeAndCall cannot be exercised without a provider registration (pattern-a conversion)
jest.mock('../llm', () => {
  const actual = jest.requireActual('../llm') as typeof import('../llm');
  return {
    ...actual,
    routeAndCall: jest.fn(),
  };
});

import type { RouteResult } from '../llm';
import { routeAndCall } from '../llm';
import { runSuitabilityJudge } from './judge-suitability';

const mockRouteAndCall = routeAndCall as jest.MockedFunction<
  typeof routeAndCall
>;

const routeResult = (response: string): RouteResult => ({
  response,
  provider: 'anthropic',
  model: 'judge-test-model',
  latencyMs: 12,
  stopReason: 'stop',
});

const VALID_VERDICT_JSON = JSON.stringify({
  overall: 'concern',
  flags: ['topic_drift'],
  rationale: 'The reply wandered off the asked question.',
});

const baseInput = {
  reply: 'Plants use sunlight to make food.',
  precedingLearnerMessage: 'How do plants eat?',
  ageBracket: 'adolescent' as const,
  conversationLanguage: 'en' as const,
  tutorVendor: 'cerebras',
  sessionId: 'sess-1',
};

beforeEach(() => {
  mockRouteAndCall.mockReset();
});

describe('runSuitabilityJudge', () => {
  it('parses a valid verdict from the LLM response', async () => {
    mockRouteAndCall.mockResolvedValue(routeResult(VALID_VERDICT_JSON));
    const verdict = await runSuitabilityJudge(baseInput);
    expect(verdict).toEqual({
      overall: 'concern',
      flags: ['topic_drift'],
      rationale: 'The reply wandered off the asked question.',
    });
  });

  it('parses a verdict even when wrapped in a code fence and prose', async () => {
    mockRouteAndCall.mockResolvedValue(
      routeResult(
        'Here is my assessment:\n```json\n' + VALID_VERDICT_JSON + '\n```',
      ),
    );
    const verdict = await runSuitabilityJudge(baseInput);
    expect(verdict?.overall).toBe('concern');
  });

  it('routes with the judge flow, JSON format, and a model-output judgeIndependence naming the real producer', async () => {
    mockRouteAndCall.mockResolvedValue(routeResult(VALID_VERDICT_JSON));
    await runSuitabilityJudge(baseInput); // producerVendor: 'cerebras'
    expect(mockRouteAndCall).toHaveBeenCalledTimes(1);
    const [, , options] = mockRouteAndCall.mock.calls[0]!;
    expect(options?.flow).toBe('judge.suitability');
    expect(options?.responseFormat).toBe('json');
    expect(options?.capability).toBe('judge');
    expect(options?.judgeIndependence).toEqual({
      mode: 'model-output',
      producerVendor: 'cerebras',
    });
    expect(options?.ageBracket).toBe('adolescent');
  });

  // WI-1826 — the suitability judge must resolve the vetted judge/grader
  // routing path (resolveGraderConfig via router.ts's capability==='judge'
  // branch), not the generic text-tier V2 matrix, mirroring the live
  // Challenge-Round grader (challenge-round/grader.ts, capability:'judge').
  // routeAndCall is mocked at the external boundary here (GC1-compliant), so
  // this test asserts what runSuitabilityJudge passes INTO routeAndCall; the
  // router-side proof that capability:'judge' resolves the judge-capability
  // model/provider set (not the text-tier default) lives in
  // llm/router.test.ts ("judge capability routing" / "[WI-1800]" suites).
  it('routes through the judge-capability path (capability:judge), not the text-tier default', async () => {
    mockRouteAndCall.mockResolvedValue(routeResult(VALID_VERDICT_JSON));
    await runSuitabilityJudge(baseInput);
    const [, , options] = mockRouteAndCall.mock.calls[0]!;
    expect(options?.capability).toBe('judge');
  });

  it('declares the real tutor vendor as the producer to exclude, even when the tutor is Anthropic', async () => {
    // WI-2624 regression: this must NOT preselect the opposite vendor (the
    // old selectJudgeProvider/preferredProvider hack) — it must declare the
    // REAL producer so the router can exclude it once, not twice.
    mockRouteAndCall.mockResolvedValue(routeResult(VALID_VERDICT_JSON));
    await runSuitabilityJudge({ ...baseInput, tutorVendor: 'anthropic' });
    const [, , options] = mockRouteAndCall.mock.calls[0]!;
    expect(options?.judgeIndependence).toEqual({
      mode: 'model-output',
      producerVendor: 'anthropic',
    });
  });

  it('fails open (returns null, does not throw) when the route throws', async () => {
    mockRouteAndCall.mockRejectedValue(new Error('circuit open'));
    await expect(runSuitabilityJudge(baseInput)).resolves.toBeNull();
  });

  it('returns null when the response carries no JSON object', async () => {
    mockRouteAndCall.mockResolvedValue(routeResult('I cannot comply.'));
    await expect(runSuitabilityJudge(baseInput)).resolves.toBeNull();
  });

  it('returns null when the JSON fails the verdict schema (ok + flags)', async () => {
    mockRouteAndCall.mockResolvedValue(
      routeResult(
        JSON.stringify({
          overall: 'ok',
          flags: ['topic_drift'],
          rationale: 'x',
        }),
      ),
    );
    await expect(runSuitabilityJudge(baseInput)).resolves.toBeNull();
  });
});
