/**
 * Step 6 dispatch-seam test (MMT-ADR-0016 §3/§7 phase 4) for the exported
 * `maybeDispatchSuitabilityJudge` wrapper. The gating DECISION is unit-tested
 * exhaustively in `policy-engine/judge-dispatch.test.ts` (the pure resolver);
 * this test pins the wrapper's three remaining responsibilities:
 *   1. flag gating — flag-off sends nothing, even for an under-18 learner;
 *   2. the dispatched payload carries opaque session_events ids only (no reply
 *      / learner text — structurally guaranteed by the event type, asserted
 *      here as a regression guard);
 *   3. `safeSend` isolation — an Inngest send rejection never throws into the
 *      caller's exchange.
 *
 * `jest.spyOn(inngest, 'send')` observes the real Inngest client (the external
 * framework boundary — not an internal jest.mock). `Math.random` is stubbed so
 * the adult-sampling branch is deterministic.
 */
import { inngest } from '../../inngest/client';
import { maybeDispatchSuitabilityJudge } from './session-exchange';

const PROFILE_ID = '00000000-0000-4000-8000-0000000000c1';
const SESSION_ID = '00000000-0000-4000-8000-0000000000c2';
const REPLY_EVENT_ID = '00000000-0000-4000-8000-0000000000c3';
const PRECEDING_EVENT_ID = '00000000-0000-4000-8000-0000000000c4';

const MINOR_BIRTH_YEAR = 2012; // under 18 → full coverage
const ADULT_BIRTH_YEAR = 1990; // 18+ → sampled

function baseInput() {
  return {
    enabled: true,
    profileId: PROFILE_ID,
    sessionId: SESSION_ID,
    replyEventId: REPLY_EVENT_ID,
    precedingLearnerMessageEventId: PRECEDING_EVENT_ID,
    birthYear: MINOR_BIRTH_YEAR,
    tutorVendor: 'gemini',
    tutorModel: 'gemini-2.5-flash',
    flow: 'exchange',
    conversationLanguage: 'en' as const,
  };
}

function judgeSends(spy: jest.SpyInstance) {
  return spy.mock.calls.filter(
    ([arg]) =>
      (arg as { name?: string } | undefined)?.name ===
      'app/judge.suitability_requested',
  );
}

describe('maybeDispatchSuitabilityJudge (dispatch seam)', () => {
  let sendSpy: jest.SpyInstance;
  let randomSpy: jest.SpyInstance;

  beforeEach(() => {
    sendSpy = jest
      .spyOn(inngest, 'send')
      .mockResolvedValue({ ids: [] } as never);
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    sendSpy.mockRestore();
    randomSpy.mockRestore();
  });

  it('sends nothing when the flag is off, even for an under-18 learner', async () => {
    await maybeDispatchSuitabilityJudge({ ...baseInput(), enabled: false });
    expect(judgeSends(sendSpy)).toHaveLength(0);
  });

  it('dispatches exactly one event for an under-18 learner when the flag is on', async () => {
    randomSpy.mockReturnValue(0.99); // minors are judged regardless of the draw
    await maybeDispatchSuitabilityJudge(baseInput());
    expect(judgeSends(sendSpy)).toHaveLength(1);
  });

  it('does not dispatch for an adult drawn outside the sampling rate', async () => {
    randomSpy.mockReturnValue(0.5); // >= 0.1 adult sampling
    await maybeDispatchSuitabilityJudge({
      ...baseInput(),
      birthYear: ADULT_BIRTH_YEAR,
    });
    expect(judgeSends(sendSpy)).toHaveLength(0);
  });

  it('dispatches for an adult drawn within the sampling rate', async () => {
    randomSpy.mockReturnValue(0.05); // < 0.1 adult sampling
    await maybeDispatchSuitabilityJudge({
      ...baseInput(),
      birthYear: ADULT_BIRTH_YEAR,
    });
    expect(judgeSends(sendSpy)).toHaveLength(1);
  });

  it('dispatches a payload of opaque ids only — no reply or learner text fields', async () => {
    await maybeDispatchSuitabilityJudge(baseInput());

    const calls = judgeSends(sendSpy);
    expect(calls).toHaveLength(1);
    const payload = (calls[0]![0] as { data: Record<string, unknown> }).data;

    expect(payload.replyEventId).toBe(REPLY_EVENT_ID);
    expect(payload.precedingLearnerMessageEventId).toBe(PRECEDING_EVENT_ID);
    // No raw-content carriers may exist on the payload.
    expect(payload).not.toHaveProperty('reply');
    expect(payload).not.toHaveProperty('precedingLearnerMessage');
    expect(payload).not.toHaveProperty('text');
  });

  it('does not throw when the Inngest send rejects (safeSend isolation)', async () => {
    sendSpy.mockRejectedValue(new Error('inngest unreachable'));
    await expect(
      maybeDispatchSuitabilityJudge(baseInput()),
    ).resolves.toBeUndefined();
  });
});
