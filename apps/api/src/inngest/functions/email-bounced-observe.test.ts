// ---------------------------------------------------------------------------
// Email Bounced Observe handler — Tests [AUDIT-INNGEST-1 / PR-17-P1 / 2026-05-12]
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

import { emailBouncedObserve } from './email-bounced-observe';
import { functions } from '../index';

beforeEach(() => {
  consoleWarnSpy.mockClear();
  consoleErrorSpy.mockClear();
  mockCaptureException.mockClear();
});

afterAll(() => {
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

describe('emailBouncedObserve [PR-17-P1]', () => {
  it('is registered as the listener for app/email.bounced', () => {
    const trigger = (emailBouncedObserve as unknown as { trigger: unknown })
      .trigger;
    expect(trigger).toEqual({ event: 'app/email.bounced' });
  });

  it('is included in the exported functions array', () => {
    expect(functions).toContain(emailBouncedObserve);
  });

  it('returns logged status with bounce payload', async () => {
    const result = await invoke(emailBouncedObserve, {
      type: 'email.bounced',
      to: 'j***@example.com',
      emailId: 'msg-abc-123',
      timestamp: '2026-05-12T00:00:00.000Z',
    });

    expect(result).toMatchObject({
      status: 'logged',
      type: 'email.bounced',
      emailId: 'msg-abc-123',
    });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('returns logged status with complained payload', async () => {
    const result = await invoke(emailBouncedObserve, {
      type: 'email.complained',
      to: 'u***@example.com',
      emailId: 'msg-def-456',
      timestamp: '2026-05-12T01:00:00.000Z',
    });

    expect(result).toMatchObject({
      status: 'logged',
      type: 'email.complained',
      emailId: 'msg-def-456',
    });
  });

  it('[BREAK] emits a warn-level structured log so bounce events are queryable', async () => {
    await invoke(emailBouncedObserve, {
      type: 'email.bounced',
      to: 'j***@example.com',
      emailId: 'msg-ghi-789',
      timestamp: '2026-05-12T02:00:00.000Z',
    });

    const entry = lastJsonLine(consoleWarnSpy);
    expect(entry?.message).toBe('email.bounced.received');
    expect(entry?.level).toBe('warn');
    expect(entry?.context).toMatchObject({
      type: 'email.bounced',
      emailId: 'msg-ghi-789',
    });
  });

  // [BREAK / BUG-314] Resend complaints multiplex onto the same Inngest
  // event as bounces; before this fix the log message was hardcoded to
  // `email.bounced.received`, so a dashboard filter on
  // `message="email.complained.received"` returned zero hits and the
  // complaint signal was effectively dropped at the observability layer.
  it('[BREAK / BUG-314] emits email.complained.received message for complained events', async () => {
    await invoke(emailBouncedObserve, {
      type: 'email.complained',
      to: 'c***@example.com',
      emailId: 'msg-cmp-001',
      timestamp: '2026-05-12T04:00:00.000Z',
    });

    const entry = lastJsonLine(consoleWarnSpy);
    expect(entry?.message).toBe('email.complained.received');
    expect(entry?.level).toBe('warn');
    expect(entry?.context).toMatchObject({
      type: 'email.complained',
      emailId: 'msg-cmp-001',
    });
  });

  it('handles null emailId gracefully', async () => {
    const result = await invoke(emailBouncedObserve, {
      type: 'email.bounced',
      to: 'x***@example.com',
      emailId: null,
      timestamp: '2026-05-12T03:00:00.000Z',
    });

    expect(result).toMatchObject({
      status: 'logged',
      emailId: null,
    });
  });

  it('[BREAK] rejects empty payload — type and to are required', async () => {
    const result = await invoke(emailBouncedObserve, {});
    expect(result).toEqual({ status: 'schema_error' });
  });

  it('[BREAK] returns schema_error and logs schema_drift on type-mismatched payload', async () => {
    const result = await invoke(emailBouncedObserve, {
      type: 'email.unsubscribed',
      emailId: 123,
    } as unknown as Record<string, unknown>);

    expect(result).toEqual({ status: 'schema_error' });
    const entry = lastJsonLine(consoleErrorSpy);
    expect(entry?.message).toBe('email.bounced.schema_drift');
    expect(entry?.level).toBe('error');
  });

  // [BREAK / BUG-313] Schema drift must escalate to Sentry so on-call sees
  // a spike in malformed Resend payloads. Pinned to "called exactly once" so
  // a future refactor can't downgrade the signal.
  it('[BREAK / BUG-313] captures schema drift to Sentry exactly once with payload context', async () => {
    await invoke(emailBouncedObserve, {
      type: 'email.unsubscribed',
      emailId: 123,
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
