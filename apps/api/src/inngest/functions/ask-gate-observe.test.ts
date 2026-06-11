// ---------------------------------------------------------------------------
// Ask Gate Observe handlers — Tests [AUDIT-INNGEST-1 / PR-17-P1 / 2026-05-12]
// ---------------------------------------------------------------------------

const mockCaptureException = jest.fn();
jest.mock(
  '../../services/sentry' /* gc1-allow: observer test asserts captureException escalation on schema drift */,
  () => {
    const actual = jest.requireActual(
      '../../services/sentry',
    ) as typeof import('../../services/sentry');
    return {
      ...actual,
      captureException: (...args: unknown[]) => mockCaptureException(...args),
    };
  },
);

const consoleLogSpy = jest
  .spyOn(console, 'log')
  .mockImplementation(() => undefined);
const consoleWarnSpy = jest
  .spyOn(console, 'warn')
  .mockImplementation(() => undefined);
const consoleErrorSpy = jest
  .spyOn(console, 'error')
  .mockImplementation(() => undefined);

jest.mock(
  '../client' /* gc1-allow: observer test requires inngest client mock to expose trigger metadata */,
  () => ({
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
  }),
);

import {
  askGateDecisionObserve,
  askGateTimeoutObserve,
} from './ask-gate-observe';
import { functions } from '../index';

beforeEach(() => {
  consoleLogSpy.mockClear();
  consoleWarnSpy.mockClear();
  consoleErrorSpy.mockClear();
  mockCaptureException.mockClear();
});

afterAll(() => {
  consoleLogSpy.mockRestore();
  consoleWarnSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

async function invoke<T extends Record<string, unknown>>(
  handler: unknown,
  data: T,
) {
  const fn = ((handler as { fn?: unknown }).fn ?? handler) as (args: {
    event: { data: T };
  }) => Promise<unknown>;
  return fn({ event: { data } });
}

function lastJsonLine(spy: jest.SpyInstance): Record<string, unknown> | null {
  const last = spy.mock.calls.at(-1)?.[0];
  if (typeof last !== 'string') return null;
  try {
    return JSON.parse(last) as Record<string, unknown>;
  } catch {
    return null;
  }
}

describe('askGateDecisionObserve [PR-17-P1]', () => {
  it('is registered as the listener for app/ask.gate_decision', () => {
    const trigger = (askGateDecisionObserve as unknown as { trigger: unknown })
      .trigger;
    expect(trigger).toEqual({ event: 'app/ask.gate_decision' });
  });

  it('is included in the exported functions array', () => {
    expect(functions).toContain(askGateDecisionObserve);
  });

  it('returns logged status with full gate decision payload', async () => {
    const result = await invoke(askGateDecisionObserve, {
      sessionId: 'sess-1',
      meaningful: true,
      reason: 'sufficient_depth',
      method: 'llm',
      exchangeCount: 5,
      learnerWordCount: 120,
      topicCount: 2,
    });

    expect(result).toMatchObject({
      status: 'logged',
      sessionId: 'sess-1',
      meaningful: true,
      method: 'llm',
    });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('[BREAK] emits a structured info log with gate decision context (observability terminus)', async () => {
    await invoke(askGateDecisionObserve, {
      sessionId: 'sess-2',
      meaningful: false,
      reason: 'too_short',
      method: 'heuristic',
      exchangeCount: 1,
      learnerWordCount: 3,
      topicCount: 0,
    });

    const entry = lastJsonLine(consoleLogSpy);
    expect(entry?.message).toBe('ask.gate_decision.received');
    expect(entry?.level).toBe('info');
    expect(entry?.context).toMatchObject({
      sessionId: 'sess-2',
      meaningful: false,
      reasonPresent: true,
      reasonLength: 'too_short'.length,
      method: 'heuristic',
    });
  });

  it('[BREAK / WI-83] does not log raw gate decision reason text', async () => {
    const reason = 'The learner said email=parent@example.com token=secret';

    await invoke(askGateDecisionObserve, {
      sessionId: 'sess-sensitive',
      meaningful: true,
      reason,
      method: 'llm',
      exchangeCount: 2,
      learnerWordCount: 9,
      topicCount: 1,
    });

    const entry = lastJsonLine(consoleLogSpy);
    const serializedEntry = JSON.stringify(entry);
    expect(serializedEntry).not.toContain('parent@example.com');
    expect(serializedEntry).not.toContain('token=secret');
    expect(entry?.context).toMatchObject({
      sessionId: 'sess-sensitive',
      reasonPresent: true,
      reasonLength: reason.length,
    });
    expect(entry?.context).not.toHaveProperty('reason');
  });

  it('[CR-2026-05-21-175 / BUG-580] empty payload escalates as schema_drift (every field is now required)', async () => {
    // Pre-fix: every field on askGateDecisionEventSchema was optional, so an
    // empty payload silently parsed and the observer logged 'unknown' for
    // every dimension — defeating the purpose of the observe terminus.
    // Post-fix: missing required fields are schema_drift, surface to Sentry.
    const result = await invoke(askGateDecisionObserve, {});
    expect(result).toEqual({ status: 'schema_error' });
    const entry = lastJsonLine(consoleErrorSpy);
    expect(entry?.message).toBe('ask.gate_decision.schema_drift');
    expect(entry?.level).toBe('error');
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('[BREAK] returns schema_error and logs schema_drift on type-mismatched payload', async () => {
    const result = await invoke(askGateDecisionObserve, {
      sessionId: 123,
      meaningful: 'yes',
      exchangeCount: 'many',
    } as unknown as Record<string, unknown>);

    expect(result).toEqual({ status: 'schema_error' });
    const entry = lastJsonLine(consoleErrorSpy);
    expect(entry?.message).toBe('ask.gate_decision.schema_drift');
    expect(entry?.level).toBe('error');
  });

  it('[BREAK / WI-83] does not log or capture raw reason text on schema drift', async () => {
    await invoke(askGateDecisionObserve, {
      sessionId: 123,
      reason: 'contains email=parent@example.com token=secret',
    } as unknown as Record<string, unknown>);

    const entry = lastJsonLine(consoleErrorSpy);
    const serializedLog = JSON.stringify(entry);
    const serializedCapture = JSON.stringify(mockCaptureException.mock.calls);

    expect(serializedLog).not.toContain('parent@example.com');
    expect(serializedLog).not.toContain('token=secret');
    expect(serializedCapture).not.toContain('parent@example.com');
    expect(serializedCapture).not.toContain('token=secret');
    expect(entry?.context).toMatchObject({
      rawData: {
        reasonPresent: true,
        reasonLength: 'contains email=parent@example.com token=secret'.length,
      },
    });
  });

  it('[BREAK / WI-83] does not log or capture arbitrary schema-drift fields', async () => {
    await invoke(askGateDecisionObserve, {
      sessionId: 123,
      reason: 'contains email=parent@example.com token=secret',
      debug: 'learner=student@example.com bearer=secret-token',
    } as unknown as Record<string, unknown>);

    const entry = lastJsonLine(consoleErrorSpy);
    const serializedLog = JSON.stringify(entry);
    const serializedCapture = JSON.stringify(mockCaptureException.mock.calls);

    expect(serializedLog).not.toContain('student@example.com');
    expect(serializedLog).not.toContain('secret-token');
    expect(serializedCapture).not.toContain('student@example.com');
    expect(serializedCapture).not.toContain('secret-token');
    expect(entry?.context).toMatchObject({
      rawData: {
        payloadType: 'object',
        fieldCount: 3,
        reasonPresent: true,
        reasonLength: 'contains email=parent@example.com token=secret'.length,
      },
    });
  });

  // [BREAK / BUG-312] Schema drift must escalate to Sentry — silent
  // logger.error alone fails the AGENTS.md "Silent recovery without
  // escalation" rule. Pinned to "called exactly once" so a future refactor
  // can't downgrade the signal.
  it('[BREAK / BUG-312] captures schema drift to Sentry exactly once with payload context', async () => {
    await invoke(askGateDecisionObserve, {
      sessionId: 123,
      meaningful: 'yes',
    } as unknown as Record<string, unknown>);

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('invalid event payload'),
      }),
      expect.objectContaining({
        extra: expect.objectContaining({
          issues: expect.any(Array),
        }),
      }),
    );
  });
});

describe('askGateTimeoutObserve [PR-17-P1]', () => {
  it('is registered as the listener for app/ask.gate_timeout', () => {
    const trigger = (askGateTimeoutObserve as unknown as { trigger: unknown })
      .trigger;
    expect(trigger).toEqual({ event: 'app/ask.gate_timeout' });
  });

  it('is included in the exported functions array', () => {
    expect(functions).toContain(askGateTimeoutObserve);
  });

  it('returns logged status with timeout payload', async () => {
    const result = await invoke(askGateTimeoutObserve, {
      sessionId: 'sess-3',
      exchangeCount: 4,
    });

    expect(result).toMatchObject({
      status: 'logged',
      sessionId: 'sess-3',
      exchangeCount: 4,
    });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('[BREAK] emits a warn-level structured log for gate timeouts (fail_open path observability)', async () => {
    await invoke(askGateTimeoutObserve, {
      sessionId: 'sess-4',
      exchangeCount: 6,
    });

    const entry = lastJsonLine(consoleWarnSpy);
    expect(entry?.message).toBe('ask.gate_timeout.received');
    expect(entry?.level).toBe('warn');
    expect(entry?.context).toMatchObject({
      sessionId: 'sess-4',
      exchangeCount: 6,
    });
  });

  it('[CR-2026-05-21-175 / BUG-580] empty payload escalates as schema_drift (every field is now required)', async () => {
    const result = await invoke(askGateTimeoutObserve, {});
    expect(result).toEqual({ status: 'schema_error' });
    const entry = lastJsonLine(consoleErrorSpy);
    expect(entry?.message).toBe('ask.gate_timeout.schema_drift');
    expect(entry?.level).toBe('error');
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('[BREAK] returns schema_error and logs schema_drift on type-mismatched payload', async () => {
    const result = await invoke(askGateTimeoutObserve, {
      exchangeCount: 'many',
    } as unknown as Record<string, unknown>);

    expect(result).toEqual({ status: 'schema_error' });
    const entry = lastJsonLine(consoleErrorSpy);
    expect(entry?.message).toBe('ask.gate_timeout.schema_drift');
    expect(entry?.level).toBe('error');
  });

  it('[BREAK / WI-83] does not log or capture arbitrary timeout schema-drift fields', async () => {
    await invoke(askGateTimeoutObserve, {
      sessionId: 123,
      exchangeCount: 'many',
      debug: 'learner=student@example.com bearer=secret-token',
    } as unknown as Record<string, unknown>);

    const entry = lastJsonLine(consoleErrorSpy);
    const serializedLog = JSON.stringify(entry);
    const serializedCapture = JSON.stringify(mockCaptureException.mock.calls);

    expect(serializedLog).not.toContain('student@example.com');
    expect(serializedLog).not.toContain('secret-token');
    expect(serializedCapture).not.toContain('student@example.com');
    expect(serializedCapture).not.toContain('secret-token');
    expect(entry?.context).toMatchObject({
      rawData: {
        payloadType: 'object',
        fieldCount: 3,
      },
    });
  });

  // [BREAK / BUG-312] Same Sentry-escalation contract for the timeout
  // observer; without this the schema-drift signal lives only in console logs.
  it('[BREAK / BUG-312] captures schema drift to Sentry exactly once with payload context', async () => {
    await invoke(askGateTimeoutObserve, {
      exchangeCount: 'many',
    } as unknown as Record<string, unknown>);

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('invalid event payload'),
      }),
      expect.objectContaining({
        extra: expect.objectContaining({
          issues: expect.any(Array),
        }),
      }),
    );
  });
});
