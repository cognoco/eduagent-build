// ---------------------------------------------------------------------------
// Email Bounced Observe handler — Tests [AUDIT-INNGEST-1 / PR-17-P1 / 2026-05-12]
// ---------------------------------------------------------------------------

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
});

afterAll(() => {
  consoleWarnSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

interface EmailBouncedEventData {
  type?: string;
  to?: string;
  emailId?: string | null;
  timestamp?: string;
}

async function invokeHandler(data: EmailBouncedEventData) {
  const handler = ((emailBouncedObserve as unknown as { fn?: unknown }).fn ??
    emailBouncedObserve) as (args: {
    event: { data: EmailBouncedEventData };
  }) => Promise<unknown>;
  return handler({ event: { data } });
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
    const result = await invokeHandler({
      type: 'email.bounced',
      to: 'j***@example.com',
      emailId: 'msg-abc-123',
      timestamp: '2026-05-12T00:00:00.000Z',
    });

    expect(result).toMatchObject({
      status: 'logged',
      type: 'email.bounced',
      emailId: 'msg-abc-123',
      suppressionDeferred: 'pending_email_bounce_suppression_strategy',
    });
  });

  it('returns logged status with complained payload', async () => {
    const result = await invokeHandler({
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
    await invokeHandler({
      type: 'email.bounced',
      to: 'j***@example.com',
      emailId: 'msg-ghi-789',
      timestamp: '2026-05-12T02:00:00.000Z',
    });

    const last = consoleWarnSpy.mock.calls.at(-1)?.[0];
    expect(typeof last).toBe('string');
    const entry = JSON.parse(last as string) as {
      message: string;
      level: string;
      context?: Record<string, unknown>;
    };
    expect(entry.message).toBe('email.bounced.received');
    expect(entry.level).toBe('warn');
    expect(entry.context).toMatchObject({
      type: 'email.bounced',
      emailId: 'msg-ghi-789',
    });
  });

  it('handles null emailId gracefully', async () => {
    const result = await invokeHandler({
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

  it('handles empty payload gracefully (all fields optional)', async () => {
    const result = await invokeHandler({});
    expect(result).toMatchObject({
      status: 'logged',
      type: null,
      emailId: null,
    });
  });
});
