// ---------------------------------------------------------------------------
// Exchange empty-reply fallback handler — Tests (BUG-851 / F-SVC-022)
// ---------------------------------------------------------------------------

const consoleWarnSpy = jest
  .spyOn(console, 'warn')
  .mockImplementation(() => undefined);

jest.mock('../client', () => {
  const actual = jest.requireActual('../client') as typeof import('../client');
  return {
    ...actual,
    inngest: {
      createFunction: jest.fn(
        (_opts: unknown, _trigger: unknown, fn: unknown) => {
          return Object.assign(fn as object, {
            opts: _opts,
            trigger: _trigger,
            fn,
          });
        },
      ),
    },
  };
});

import { exchangeEmptyReplyFallback } from './exchange-empty-reply-fallback';

beforeEach(() => {
  consoleWarnSpy.mockClear();
});

afterAll(() => {
  consoleWarnSpy.mockRestore();
});

interface FallbackEventData {
  sessionId?: unknown;
  profileId?: unknown;
  flow?: unknown;
  exchangeCount?: unknown;
  reason?: unknown;
  rawResponsePreview?: unknown;
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

  it('rejects a malformed payload with a structured warning and does NOT log the fallback event (CR-2026-05-21-025)', async () => {
    // Payload with sessionId as a number — the bug that was silently coerced
    // to 'unknown'. The handler must reject it, emit a parse-error warn, and
    // return { status: 'invalid_payload' } without reaching the main log path.
    const result = await invokeHandler({
      sessionId: 42 as unknown as string,
      profileId: undefined,
      // flow, exchangeCount, reason intentionally missing
    });

    expect(result).toEqual({ status: 'invalid_payload' });

    // The rejection warn must be present …
    const calls = consoleWarnSpy.mock.calls;
    const rejectionCall = calls.find((c) => {
      try {
        const entry = JSON.parse(c[0] as string) as { message: string };
        return (
          entry.message === 'exchange.empty_reply_fallback.invalid_payload'
        );
      } catch {
        return false;
      }
    });
    expect(rejectionCall).toBeDefined();

    // … and the main observability log must NOT have been emitted.
    const mainCall = calls.find((c) => {
      try {
        const entry = JSON.parse(c[0] as string) as { message: string };
        return entry.message === 'exchange.empty_reply_fallback.received';
      } catch {
        return false;
      }
    });
    expect(mainCall).toBeUndefined();
  });
});
