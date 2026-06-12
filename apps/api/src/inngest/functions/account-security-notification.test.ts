// ---------------------------------------------------------------------------
// account-security-notification — Tests [CRITICAL-2a]
//
// Pins the contract for the out-of-band security-notification email sent when
// an account credential changes:
//   1. Wired to consume `app/account.security-event`, retries: 2.
//   2. Invalid payloads are skipped via safeParse (no retry loop).
//   3. Each event type sends the right email to the right address — exercised
//      through the REAL sendEmail + formatter against a mocked Resend fetch
//      (the only external boundary).
//   4. Re-throws on send failure so Inngest retries; degrades (no throw) when
//      RESEND_API_KEY is absent.
// ---------------------------------------------------------------------------

import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { createInngestTransportCapture } from '../../test-utils/inngest-transport-capture';

const mockInngestTransport = createInngestTransportCapture();
jest.mock(
  '../client' /* gc1-allow: Inngest framework boundary — the handler is not otherwise invokable; sibling Inngest tests use the same transport capture */,
  () => {
    const actual = jest.requireActual(
      '../client',
    ) as typeof import('../client');
    return {
      ...actual,
      ...mockInngestTransport.module,
    };
  },
);

import { accountSecurityNotification } from './account-security-notification';

const RESEND_API_URL = 'https://api.resend.com/emails';

type SecurityEventData = {
  type: 'email_changed' | 'password_added' | 'password_changed';
  to: string;
  accountId: string;
  timestamp: string;
};

function securityEvent(
  overrides: Partial<SecurityEventData> = {},
): SecurityEventData {
  return {
    type: overrides.type ?? 'email_changed',
    to: overrides.to ?? 'old@example.com',
    accountId: overrides.accountId ?? 'acct-1',
    timestamp: overrides.timestamp ?? '2026-06-09T00:00:00.000Z',
  };
}

async function executeHandler(eventData: unknown, eventId?: string) {
  const { step } = createInngestStepRunner();
  const handler = (
    accountSecurityNotification as unknown as {
      fn: (a: unknown) => Promise<unknown>;
    }
  ).fn;
  const result = await handler({
    event: { id: eventId, data: eventData },
    step,
  });
  return { result };
}

/** Reads the JSON body of the captured Resend fetch call. */
function lastResendBody(): {
  to: string[];
  subject: string;
  text: string;
  from: string;
} {
  const fetchMock = globalThis.fetch as jest.Mock;
  const call = fetchMock.mock.calls.find(([url]) => url === RESEND_API_URL);
  if (!call) throw new Error('Resend fetch was not called');
  return JSON.parse((call[1] as { body: string }).body);
}

describe('account-security-notification Inngest function [CRITICAL-2a]', () => {
  let originalFetch: typeof globalThis.fetch;
  let originalResendApiKey: string | undefined;
  let originalEmailFrom: string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockInngestTransport.clear();
    // The Resend config getters read AsyncLocalStorage bindings (set by the
    // Inngest middleware in production) with a process.env fallback. Test
    // hooks run in a sibling async context to the test body, so an ALS
    // enterWith here would not reach the handler — use the env fallback.
    originalResendApiKey = process.env['RESEND_API_KEY'];
    originalEmailFrom = process.env['EMAIL_FROM'];
    process.env['RESEND_API_KEY'] = 'test-resend-key';
    process.env['EMAIL_FROM'] = 'noreply@test.com';
    originalFetch = globalThis.fetch;
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'resend-msg-1' }), { status: 200 }),
      );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalResendApiKey !== undefined) {
      process.env['RESEND_API_KEY'] = originalResendApiKey;
    } else {
      delete process.env['RESEND_API_KEY'];
    }
    if (originalEmailFrom !== undefined) {
      process.env['EMAIL_FROM'] = originalEmailFrom;
    } else {
      delete process.env['EMAIL_FROM'];
    }
  });

  describe('configuration', () => {
    it('triggers on app/account.security-event with retries: 2', () => {
      const trigger = (accountSecurityNotification as any).trigger;
      const opts = (accountSecurityNotification as any).opts;
      expect(trigger.event).toBe('app/account.security-event');
      expect(opts.id).toBe('account-security-notification');
      expect(opts.retries).toBe(2);
    });
  });

  describe('payload validation', () => {
    it('does NOT throw on malformed payload — uses safeParse', async () => {
      await expect(executeHandler({})).resolves.toBeTruthy();
    });

    it('returns skipped and sends no email on malformed payload', async () => {
      const { result } = await executeHandler({
        type: 'email_changed' /* missing to/accountId */,
      });
      expect(result).toMatchObject({
        status: 'skipped',
        reason: 'invalid_payload',
      });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('rejects an unknown event type', async () => {
      const { result } = await executeHandler(
        securityEvent({ type: 'account_deleted' as never }),
      );
      expect(result).toMatchObject({ status: 'skipped' });
    });

    it('rejects a non-email "to" field', async () => {
      const { result } = await executeHandler(
        securityEvent({ to: 'not-an-email' }),
      );
      expect(result).toMatchObject({ status: 'skipped' });
    });
  });

  describe('happy path — sends the right email per type', () => {
    it('email_changed → alerts the OLD address', async () => {
      await executeHandler(
        securityEvent({ type: 'email_changed', to: 'old@example.com' }),
      );
      const body = lastResendBody();
      expect(body.to).toEqual(['old@example.com']);
      expect(body.subject).toMatch(/login email was changed/i);
      expect(body.text).toMatch(/contact support@mentomate\.com/i);
      expect(body.from).toBe('noreply@test.com');
    });

    it('password_added → notifies the current address', async () => {
      await executeHandler(
        securityEvent({ type: 'password_added', to: 'me@example.com' }),
      );
      const body = lastResendBody();
      expect(body.to).toEqual(['me@example.com']);
      expect(body.subject).toMatch(/password was added/i);
    });

    it('password_changed → notifies the current address', async () => {
      await executeHandler(
        securityEvent({ type: 'password_changed', to: 'me@example.com' }),
      );
      expect(lastResendBody().subject).toMatch(/password was changed/i);
    });

    it('returns ok on a successful send', async () => {
      const { result } = await executeHandler(securityEvent());
      expect(result).toMatchObject({ ok: true, type: 'email_changed' });
    });

    it('forwards an idempotency key bound to accountId + type', async () => {
      await executeHandler(
        securityEvent({ accountId: 'acct-xyz', type: 'password_changed' }),
        'evt-abc',
      );
      const fetchMock = globalThis.fetch as jest.Mock;
      const call = fetchMock.mock.calls.find(([url]) => url === RESEND_API_URL);
      const headers = (call?.[1] as { headers: Record<string, string> })
        .headers;
      expect(headers['Idempotency-Key']).toEqual(
        expect.stringContaining('acct-xyz'),
      );
      expect(headers['Idempotency-Key']).toEqual(
        expect.stringContaining('password_changed'),
      );
    });
  });

  describe('failure behavior', () => {
    it('throws when Resend returns an error so Inngest retries', async () => {
      globalThis.fetch = jest
        .fn()
        .mockResolvedValue(new Response('nope', { status: 500 }));
      await expect(executeHandler(securityEvent(), 'evt-1')).rejects.toThrow(
        /account-security-notification send failed/,
      );
    });

    it('degrades without throwing when RESEND_API_KEY is absent', async () => {
      delete process.env['RESEND_API_KEY'];

      const { result } = await executeHandler(securityEvent(), 'evt-2');
      expect(result).toMatchObject({ ok: false, reason: 'no_api_key' });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });
});
