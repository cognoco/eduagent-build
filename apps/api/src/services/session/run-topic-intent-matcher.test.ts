// Focused break-test for the timer-leak fix in runTopicIntentMatcher.
//
// Before the fix, the happy path (routeAndCall wins the Promise.race) left the
// timeout setTimeout uncleared. The dangling timer (a) keeps the worker event
// loop alive for up to MATCHER_TIMEOUT_MS after the request resolved and (b)
// later rejects a handler-less Promise<never> -> unhandled rejection. This test
// drives the happy path under fake timers and asserts no pending timer remains.

// External LLM boundary mock (bare-specifier-equivalent via requireActual for
// the rest of the barrel). routeAndCall is the only LLM call in this path.
jest.mock(
  '../llm' /* gc1-allow: external LLM boundary (routeAndCall) */,
  () => {
    const actual = jest.requireActual('../llm');
    return {
      ...actual,
      routeAndCall: jest.fn(),
    };
  },
);

import { routeAndCall } from '../llm';
import { runTopicIntentMatcher } from './session-topic-matcher';

const mockRouteAndCall = routeAndCall as jest.MockedFunction<
  typeof routeAndCall
>;

describe('runTopicIntentMatcher — timeout timer cleanup', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockRouteAndCall.mockReset();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('clears the timeout timer when routeAndCall wins the race (no dangling timer)', async () => {
    const topicId = '00000000-0000-7000-8000-0000000000aa';
    mockRouteAndCall.mockResolvedValue({
      response: JSON.stringify({ matchTopicId: topicId, confidence: 0.9 }),
    } as never);

    const result = await runTopicIntentMatcher('learn fractions', [
      { id: topicId, title: 'Fractions' },
    ]);

    expect(result).toEqual({ matchTopicId: topicId, confidence: 0.9 });
    // The core assertion: the timeout timer must have been cleared on the
    // happy path. Pre-fix this is 1 (the uncleared setTimeout); post-fix 0.
    expect(jest.getTimerCount()).toBe(0);
  });
});
