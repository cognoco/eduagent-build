jest.mock(/* gc1-allow: Inngest boundary */ '../client', () => ({
  inngest: {
    createFunction: jest.fn(
      (opts: Record<string, unknown>, triggers: unknown, fn: unknown) =>
        Object.assign(fn as object, {
          opts: {
            ...opts,
            triggers: Array.isArray(triggers) ? triggers : [triggers],
          },
        }),
    ),
    send: jest.fn(),
  },
}));

import type { JudgeFlagCategory } from '@eduagent/schemas';
import {
  handleSuitabilityJudge,
  type SuitabilityJudgeDependencies,
} from './judge-suitability';

// ---------------------------------------------------------------------------
// [WI-1900] Adult-path escalation on the POST-DISPLAY suitability judge.
//
// Before WI-1900 this handler judged adult replies (10% sampled) and recorded a
// calibration log line — a violation escalated to nobody. The operator ruling
// (2026-08-04) put adults on this async rail and reused the existing structured
// escalation events. These tests pin the two things that can go wrong:
//   1. an adult violation must actually raise the alarm, and
//   2. the MINOR path must stay untouched — minors are covered by the separate
//      synchronous enforcing gate, which raises these same events itself, so
//      emitting here for a minor would double-alarm AND change a path the
//      ruling holds fixed.
//
// The step runner returns a canned outcome instead of executing the closure, so
// these exercise the real decision logic without reaching the database.
// ---------------------------------------------------------------------------

type Outcome =
  | { status: 'judged'; overall: string; flags: JudgeFlagCategory[] }
  | { status: 'reply_not_found' }
  | { status: 'degraded' };

function stepReturning(outcome: Outcome) {
  return {
    run: (async () => outcome) as <T>(
      name: string,
      fn: () => Promise<T> | T,
    ) => Promise<T>,
  };
}

function deps(): SuitabilityJudgeDependencies & {
  emitBlocked: jest.Mock;
  emitUnavailable: jest.Mock;
} {
  return {
    emitBlocked: jest.fn().mockResolvedValue(undefined),
    emitUnavailable: jest.fn().mockResolvedValue(undefined),
  } as never;
}

function payload(ageBracket: 'adult' | 'adolescent' | 'child') {
  return {
    profileId: '11111111-1111-4111-8111-111111111111',
    sessionId: '22222222-2222-4222-8222-222222222222',
    replyEventId: '33333333-3333-4333-8333-333333333333',
    precedingLearnerMessageEventId: '44444444-4444-4444-8444-444444444444',
    ageBracket,
    // An APPROVED vendor on purpose. The neighbouring judge-dispatch fixtures
    // still say gemini and are baselined, but Gemini is an excluded vendor
    // (docs/registers/llm-models/master.md) and the no-gemini-runtime ratchet
    // correctly rejects a NEW coupling — including one in a test fixture.
    tutorVendor: 'openai',
    tutorModel: 'gpt-5-mini',
    flow: 'exchange',
    conversationLanguage: 'en',
    timestamp: '2026-08-07T00:00:00.000Z',
  };
}

const violation = {
  status: 'judged' as const,
  overall: 'violation',
  flags: ['harassment'] as JudgeFlagCategory[],
};

describe('[WI-1900] adult-path escalation', () => {
  it('raises the blocked alarm in OBSERVED mode for an adult violation', async () => {
    const d = deps();

    await handleSuitabilityJudge(
      { event: { data: payload('adult') }, step: stepReturning(violation) },
      d,
    );

    expect(d.emitBlocked).toHaveBeenCalledTimes(1);
    const arg = d.emitBlocked.mock.calls[0][0];
    // 'observed' is what keeps this out of the operator blocked-count digest —
    // the reply was already displayed, so no learner was protected.
    expect(arg.mode).toBe('observed');
    expect(arg.flags).toEqual(['harassment']);
    expect(d.emitUnavailable).not.toHaveBeenCalled();
  });

  it('does NOT alarm for a minor violation — the minor path is untouched', async () => {
    // The synchronous enforcing gate owns minors and emits its own event.
    for (const bracket of ['adolescent', 'child'] as const) {
      const d = deps();
      await handleSuitabilityJudge(
        { event: { data: payload(bracket) }, step: stepReturning(violation) },
        d,
      );
      expect(d.emitBlocked).not.toHaveBeenCalled();
      expect(d.emitUnavailable).not.toHaveBeenCalled();
    }
  });

  it('inherits the over-block allowlist — an over_blocking-only violation never alarms', async () => {
    // Same controls as the minor gate: blocking on `over_blocking` would
    // suppress a reply the judge flagged as WRONGLY refused (MMT-ADR-0016 §1).
    const d = deps();

    await handleSuitabilityJudge(
      {
        event: { data: payload('adult') },
        step: stepReturning({
          status: 'judged',
          overall: 'violation',
          flags: ['over_blocking', 'topic_drift'] as JudgeFlagCategory[],
        }),
      },
      d,
    );

    expect(d.emitBlocked).not.toHaveBeenCalled();
  });

  it("never alarms on a 'concern' verdict (observe-only, not a violation)", async () => {
    const d = deps();

    await handleSuitabilityJudge(
      {
        event: { data: payload('adult') },
        step: stepReturning({
          status: 'judged',
          overall: 'concern',
          flags: ['harassment'] as JudgeFlagCategory[],
        }),
      },
      d,
    );

    expect(d.emitBlocked).not.toHaveBeenCalled();
  });

  it('raises the unavailable alarm when the adult judge is degraded', async () => {
    // Fail-open with alarm: the reply passed, but a degraded safety judge must
    // never be silent (the silent-recovery ban on safety paths).
    const d = deps();

    const result = await handleSuitabilityJudge(
      {
        event: { data: payload('adult') },
        step: stepReturning({ status: 'degraded' }),
      },
      d,
    );

    expect(result).toEqual({ degraded: true });
    expect(d.emitUnavailable).toHaveBeenCalledTimes(1);
    expect(d.emitBlocked).not.toHaveBeenCalled();
  });

  it('does NOT raise the unavailable alarm for a degraded MINOR judge', async () => {
    const d = deps();

    await handleSuitabilityJudge(
      {
        event: { data: payload('adolescent') },
        step: stepReturning({ status: 'degraded' }),
      },
      d,
    );

    expect(d.emitUnavailable).not.toHaveBeenCalled();
  });

  it('skips cleanly on an invalid payload without alarming', async () => {
    const d = deps();

    const result = await handleSuitabilityJudge(
      { event: { data: { nonsense: true } }, step: stepReturning(violation) },
      d,
    );

    expect(result).toEqual({ skipped: 'invalid_payload' });
    expect(d.emitBlocked).not.toHaveBeenCalled();
    expect(d.emitUnavailable).not.toHaveBeenCalled();
  });
});
