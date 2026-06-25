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
import { runSuitabilityJudge, selectJudgeProvider } from './judge-suitability';

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

describe('selectJudgeProvider — vendor-independence (MMT-ADR-0016 §2)', () => {
  it('uses OpenAI when the tutor is Anthropic (cannot share the tutor vendor)', () => {
    expect(selectJudgeProvider('anthropic')).toBe('openai');
  });

  it('uses Anthropic when the tutor is OpenAI', () => {
    expect(selectJudgeProvider('openai')).toBe('anthropic');
  });

  it('defaults to Anthropic for a non-Anthropic tutor (cerebras/google)', () => {
    expect(selectJudgeProvider('cerebras')).toBe('anthropic');
    expect(selectJudgeProvider('google')).toBe('anthropic');
  });

  it('never returns gemini (under-18 + judge-vendor constraint)', () => {
    for (const vendor of [
      'anthropic',
      'openai',
      'cerebras',
      'google',
      'gemini',
    ]) {
      expect(selectJudgeProvider(vendor)).not.toBe('gemini');
    }
  });
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

  it('routes with the judge flow, JSON format, and vendor-independent provider', async () => {
    mockRouteAndCall.mockResolvedValue(routeResult(VALID_VERDICT_JSON));
    await runSuitabilityJudge(baseInput); // cerebras tutor → anthropic judge
    expect(mockRouteAndCall).toHaveBeenCalledTimes(1);
    const [, , options] = mockRouteAndCall.mock.calls[0]!;
    expect(options?.flow).toBe('judge.suitability');
    expect(options?.responseFormat).toBe('json');
    expect(options?.preferredProvider).toBe('anthropic');
    expect(options?.ageBracket).toBe('adolescent');
  });

  it('routes the judge to OpenAI when the tutor itself is Anthropic', async () => {
    mockRouteAndCall.mockResolvedValue(routeResult(VALID_VERDICT_JSON));
    await runSuitabilityJudge({ ...baseInput, tutorVendor: 'anthropic' });
    const [, , options] = mockRouteAndCall.mock.calls[0]!;
    expect(options?.preferredProvider).toBe('openai');
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
