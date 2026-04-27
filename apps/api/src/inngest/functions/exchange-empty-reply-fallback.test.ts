// ---------------------------------------------------------------------------
// Exchange empty-reply fallback handler — Tests (BUG-851 / F-SVC-022)
// ---------------------------------------------------------------------------

const consoleWarnSpy = jest
  .spyOn(console, 'warn')
  .mockImplementation(() => undefined);

jest.mock('../client', () => ({
  inngest: {
    createFunction: jest.fn(
      (_opts: unknown, _trigger: unknown, fn: unknown) => {
        return Object.assign(fn as object, {
          opts: _opts,
          trigger: _trigger,
          fn,
        });
      }
    ),
  },
}));

import { exchangeEmptyReplyFallback } from './exchange-empty-reply-fallback';

beforeEach(() => {
  consoleWarnSpy.mockClear();
});

afterAll(() => {
  consoleWarnSpy.mockRestore();
});

interface FallbackEventData {
  sessionId?: string;
  profileId?: string;
  flow?: string;
  exchangeCount?: number;
  reason?: string;
  rawResponsePreview?: string;
}

async function invokeHandler(data: FallbackEventData) {
  const handler = ((exchangeEmptyReplyFallback as any).fn ??
    exchangeEmptyReplyFallback) as (args: {
    event: { data: FallbackEventData };
  }) => Promise<unknown>;
  return handler({ event: { data } });
}

describe('exchangeEmptyReplyFallback (BUG-851 / F-SVC-022)', () => {
  it('is registered as the listener for app/exchange.empty_reply_fallback', () => {
    // streamInterviewExchange fans out to this exact event. Drift = silent
    // drop = the bug recurs.
    const trigger = (exchangeEmptyReplyFallback as any).trigger;
    expect(trigger).toEqual({
      event: 'app/exchange.empty_reply_fallback',
    });
  });

  it('returns logged status with session metadata and escalation-deferred marker', async () => {
    const result = await invokeHandler({
      sessionId: 'sess-1',
      profileId: 'p-1',
      flow: 'streamInterviewExchange',
      exchangeCount: 2,
      reason: 'empty_reply',
      rawResponsePreview: '   ',
    });

    expect(result).toEqual({
      status: 'logged',
      sessionId: 'sess-1',
      reason: 'empty_reply',
      escalationDeferred: 'pending_llm_drift_alerting',
    });
  });

  it('emits a structured warn log with the fallback metadata (observability guarantee)', async () => {
    await invokeHandler({
      sessionId: 'sess-2',
      profileId: 'p-2',
      flow: 'streamInterviewExchange',
      exchangeCount: 5,
      reason: 'malformed_envelope',
      rawResponsePreview: 'invalid json...',
    });

    expect(consoleWarnSpy).toHaveBeenCalled();
    const lastCall = consoleWarnSpy.mock.calls.at(-1)?.[0];
    expect(typeof lastCall).toBe('string');
    const entry = JSON.parse(lastCall as string) as {
      message: string;
      level: string;
      context?: Record<string, unknown>;
    };
    expect(entry.message).toBe('exchange.empty_reply_fallback.received');
    expect(entry.level).toBe('warn');
    expect(entry.context).toMatchObject({
      sessionId: 'sess-2',
      profileId: 'p-2',
      flow: 'streamInterviewExchange',
      exchangeCount: 5,
      reason: 'malformed_envelope',
      rawResponsePreview: 'invalid json...',
    });
  });
});
