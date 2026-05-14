// ---------------------------------------------------------------------------
// Ask Gate Observe handlers — Tests [AUDIT-INNGEST-1 / PR-17-P1 / 2026-05-12]
// ---------------------------------------------------------------------------

const consoleLogSpy = jest
  .spyOn(console, 'log')
  .mockImplementation(() => undefined);
const consoleWarnSpy = jest
  .spyOn(console, 'warn')
  .mockImplementation(() => undefined);
const consoleErrorSpy = jest
  .spyOn(console, 'error')
  .mockImplementation(() => undefined);

// prettier-ignore
jest.mock( // gc1-allow: pattern-a conversion
  '../client' /* gc1-allow: observer test requires inngest client mock to expose trigger metadata */,
  () => ({
    ...jest.requireActual('../client'),
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
      reason: 'too_short',
      method: 'heuristic',
    });
  });

  it('handles empty payload gracefully (all fields optional)', async () => {
    const result = await invoke(askGateDecisionObserve, {});
    expect(result).toMatchObject({ status: 'logged', sessionId: null });
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

  it('handles empty payload gracefully (all fields optional)', async () => {
    const result = await invoke(askGateTimeoutObserve, {});
    expect(result).toMatchObject({ status: 'logged', sessionId: null });
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
});
