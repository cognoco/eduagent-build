// ---------------------------------------------------------------------------
// Mentor-notice re-check judge — unit tests (WI-2625).
//
// routeAndCall is the LLM boundary — the one allowed external-boundary mock
// (AGENTS.md), mirroring policy-engine/judge-suitability.test.ts. The DB is a
// plain findFirst stub mirroring mentor-notices/evidence.test.ts.
// ---------------------------------------------------------------------------

jest.mock(
  '../llm' /* gc1-allow: mocks the routeAndCall LLM boundary — routeAndCall cannot be exercised without a provider registration; real-router coverage lives elsewhere in the llm/router test suite. */,
  () => {
    const actual = jest.requireActual('../llm') as typeof import('../llm');
    return {
      ...actual,
      routeAndCall: jest.fn(),
    };
  },
);

import type { Database } from '@eduagent/database';
import type { RouteResult } from '../llm';
import { routeAndCall } from '../llm';
import {
  evaluateMentorNoticeRecheck,
  JUDGE_MENTOR_NOTICE_RECHECK_FLOW,
} from './recheck-judge';

const mockRouteAndCall = routeAndCall as jest.MockedFunction<
  typeof routeAndCall
>;

const PROFILE_ID = '00000000-0000-4000-8000-000000000001';
const SESSION_ID = '00000000-0000-4000-8000-000000000002';
const ANSWER_EVENT_ID = '00000000-0000-4000-8000-000000000003';

function makeDb(row: { id: string; content: string } | null) {
  return {
    query: {
      sessionEvents: {
        findFirst: jest.fn().mockResolvedValue(row),
      },
    },
  } as unknown as Database;
}

const routeResult = (response: string): RouteResult => ({
  response,
  provider: 'anthropic',
  model: 'judge-test-model',
  latencyMs: 12,
  stopReason: 'stop',
});

const baseInput = {
  profileId: PROFILE_ID,
  sessionId: SESSION_ID,
  notice: {
    concept: 'Changing signs across the equals sign',
    correctionHint: 'Apply the inverse operation to both sides.' as
      | string
      | null,
    exchangeNumber: 1,
  },
  answerEventId: ANSWER_EVENT_ID,
  conversationLanguage: 'en' as const,
  tutorVendor: 'cerebras',
};

beforeEach(() => {
  mockRouteAndCall.mockReset();
});

describe('evaluateMentorNoticeRecheck', () => {
  const db = () =>
    makeDb({ id: ANSWER_EVENT_ID, content: 'x minus 3 becomes x plus 3' });

  it.each([
    ['locked_in', 'demonstrated'],
    ['not_yet', 'insufficient'],
    ['dismissed', 'explicit_stop'],
    ['deferred', 'explicit_not_now'],
  ] as const)(
    'accepts the %s/%s pair and resolves that outcome',
    async (verdict, reason) => {
      mockRouteAndCall.mockResolvedValue(
        routeResult(JSON.stringify({ verdict, reason })),
      );
      const outcome = await evaluateMentorNoticeRecheck(db(), baseInput);
      expect(outcome).toBe(verdict);
    },
  );

  it('resolves "continue"/"unclear" to null (no transition)', async () => {
    mockRouteAndCall.mockResolvedValue(
      routeResult(JSON.stringify({ verdict: 'continue', reason: 'unclear' })),
    );
    const outcome = await evaluateMentorNoticeRecheck(db(), baseInput);
    expect(outcome).toBeNull();
  });

  it('rejects a mismatched verdict/reason pair as malformed (fail-open null)', async () => {
    mockRouteAndCall.mockResolvedValue(
      routeResult(
        JSON.stringify({ verdict: 'locked_in', reason: 'insufficient' }),
      ),
    );
    const outcome = await evaluateMentorNoticeRecheck(db(), baseInput);
    expect(outcome).toBeNull();
  });

  it('fails open (null) when the judge route call throws', async () => {
    mockRouteAndCall.mockRejectedValue(new Error('circuit open'));
    const outcome = await evaluateMentorNoticeRecheck(db(), baseInput);
    expect(outcome).toBeNull();
  });

  it('fails open (null) when the response has no JSON object', async () => {
    mockRouteAndCall.mockResolvedValue(routeResult('I cannot decide.'));
    const outcome = await evaluateMentorNoticeRecheck(db(), baseInput);
    expect(outcome).toBeNull();
  });

  it('fails open (null) when the JSON fails schema validation', async () => {
    mockRouteAndCall.mockResolvedValue(
      routeResult(JSON.stringify({ verdict: 'maybe', reason: 'unsure' })),
    );
    const outcome = await evaluateMentorNoticeRecheck(db(), baseInput);
    expect(outcome).toBeNull();
  });

  it('fails open (null) without calling the judge when the answer event is not found', async () => {
    const outcome = await evaluateMentorNoticeRecheck(makeDb(null), baseInput);
    expect(outcome).toBeNull();
    expect(mockRouteAndCall).not.toHaveBeenCalled();
  });

  it('routes with the judge flow, JSON format, and a model-output judgeIndependence naming the real tutor producer', async () => {
    mockRouteAndCall.mockResolvedValue(
      routeResult(
        JSON.stringify({ verdict: 'not_yet', reason: 'insufficient' }),
      ),
    );
    await evaluateMentorNoticeRecheck(db(), baseInput); // tutorVendor: 'cerebras'
    expect(mockRouteAndCall).toHaveBeenCalledTimes(1);
    const [, rung, options] = mockRouteAndCall.mock.calls[0]!;
    expect(rung).toBe(1);
    expect(options).toMatchObject({
      capability: 'judge',
      flow: JUDGE_MENTOR_NOTICE_RECHECK_FLOW,
      responseFormat: 'json',
      judgeIndependence: { mode: 'model-output', producerVendor: 'cerebras' },
    });
  });

  it("sends the learner's current persisted answer content, not any caller-supplied text", async () => {
    mockRouteAndCall.mockResolvedValue(
      routeResult(
        JSON.stringify({ verdict: 'not_yet', reason: 'insufficient' }),
      ),
    );
    await evaluateMentorNoticeRecheck(
      makeDb({ id: ANSWER_EVENT_ID, content: 'the durable DB answer text' }),
      baseInput,
    );
    const [messages] = mockRouteAndCall.mock.calls[0]!;
    const userMessage = messages.find((m) => m.role === 'user');
    expect(String(userMessage?.content)).toContain(
      'the durable DB answer text',
    );
  });

  it("never returns the judge's raw JSON — only the resolved enum outcome", async () => {
    mockRouteAndCall.mockResolvedValue(
      routeResult(
        JSON.stringify({
          verdict: 'locked_in',
          reason: 'demonstrated',
          // A malicious/verbose judge could append extra fields; the
          // evaluator's return type only ever carries the enum outcome.
          confidence: 0.99,
          rationale: 'learner nailed it',
        }),
      ),
    );
    const outcome = await evaluateMentorNoticeRecheck(db(), baseInput);
    expect(outcome).toBe('locked_in');
    expect(typeof outcome).toBe('string');
  });
});
