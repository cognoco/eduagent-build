// ---------------------------------------------------------------------------
// [H2/H7 — 2026-06-05 safety audit] Crisis-redirect observability.
//
// Before this fix, the prompt-level crisis redirect (learner expresses
// distress / self-harm ideation / bullying / abuse → empathize + helpline)
// fired with ZERO logging: no metric, no event, no way to answer "how many
// learners mentioned self-harm last month?". These tests pin the structured
// safety event and the envelope plumbing that feeds it.
// ---------------------------------------------------------------------------

import { parseExchangeEnvelope, emitCrisisRedirectEvent } from './exchanges';

// Inngest dispatch surface — external boundary, mocked so tests can assert
// escalation without a real Inngest client (same pattern as account.test.ts).
const mockInngestSend = jest.fn().mockResolvedValue(undefined);
jest.mock('../inngest/client', () => {
  const actual = jest.requireActual(
    '../inngest/client',
  ) as typeof import('../inngest/client');
  return {
    ...actual,
    inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
  };
});

beforeEach(() => {
  mockInngestSend.mockClear();
});

function envelope(signals: Record<string, unknown>): string {
  return JSON.stringify({
    reply:
      "I'm really sorry you're going through this. This is something to talk about with a parent, guardian, or trusted adult.",
    signals,
    confidence: 'high',
  });
}

describe('parseExchangeEnvelope — crisis_redirect plumbing', () => {
  it('maps signals.crisis_redirect true → crisisRedirect true', () => {
    const parsed = parseExchangeEnvelope(envelope({ crisis_redirect: true }));
    expect(parsed.crisisRedirect).toBe(true);
  });

  it('defaults crisisRedirect to false when signal absent', () => {
    const parsed = parseExchangeEnvelope(envelope({}));
    expect(parsed.crisisRedirect).toBe(false);
  });

  it('defaults crisisRedirect to false on envelope parse failure', () => {
    const parsed = parseExchangeEnvelope('plain prose, not an envelope');
    expect(parsed.envelopeParseFailed).toBe(true);
    expect(parsed.crisisRedirect).toBe(false);
  });
});

describe('emitCrisisRedirectEvent', () => {
  it('[BREAK] dispatches app/safety.crisis_redirect_fired via safeSend', async () => {
    // [BREAK] Without the fix: crisis redirects fired with no event at all —
    // the highest-stakes path in the app was invisible. (Reverting the
    // emitCrisisRedirectEvent call in services/exchanges.ts makes the
    // integration of this event unreachable; deleting the dispatch below
    // makes this test fail.)
    await emitCrisisRedirectEvent({
      sessionId: 'sess-123',
      profileId: 'prof-456',
      flow: 'exchange.process',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
    });

    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app/safety.crisis_redirect_fired',
        data: expect.objectContaining({
          sessionId: 'sess-123',
          profileId: 'prof-456',
          flow: 'exchange.process',
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        }),
      }),
    );
  });

  it('never includes message content in the event payload (metadata only)', async () => {
    await emitCrisisRedirectEvent({
      sessionId: 'sess-123',
      profileId: 'prof-456',
      flow: 'exchange.process',
    });

    const sent = mockInngestSend.mock.calls[0][0] as { data: object };
    const keys = Object.keys(sent.data);
    // Closed metadata key-set: adding learner text / model reply to this
    // event is a privacy regression — extend ONLY with metadata fields.
    expect(keys.sort()).toEqual(
      [
        'flow',
        'model',
        'profileId',
        'provider',
        'sessionId',
        'timestamp',
      ].sort(),
    );
  });

  it('does not throw when the Inngest dispatch fails (safeSend guarantee)', async () => {
    mockInngestSend.mockRejectedValueOnce(new Error('inngest down'));

    await expect(
      emitCrisisRedirectEvent({
        sessionId: 'sess-123',
        profileId: 'prof-456',
        flow: 'exchange.process',
      }),
    ).resolves.toBeUndefined();
  });
});
