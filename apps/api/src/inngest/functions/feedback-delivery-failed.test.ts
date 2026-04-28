// ---------------------------------------------------------------------------
// feedback-delivery-failed — Tests [BUG-767 / A-24]
//
// The route at POST /feedback dispatches `app/feedback.delivery_failed` when
// the synchronous send fails. The audit caught that the consumer of this
// event was missing — meaning every failed feedback queue was a black hole.
// The handler now exists; these tests pin the contract:
//
//   1. The function is wired to consume `app/feedback.delivery_failed`.
//   2. It is registered in the Inngest functions array (so `serve()` actually
//      invokes it). Verified separately via the index registration test.
//   3. Invalid payloads are skipped via safeParse (no retry loop on a
//      permanently-bad input — same J-8 anti-pattern).
//   4. Valid payloads call sendEmail with the configured Resend key.
//   5. Re-throws on send failure so Inngest retries up to `retries: 2`.
// ---------------------------------------------------------------------------

const mockSendEmail = jest.fn();
const mockCaptureException = jest.fn();
const mockGetResendApiKey = jest.fn();
const mockGetEmailFrom = jest.fn();

jest.mock('../../services/notifications', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

jest.mock('../../services/sentry', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

jest.mock('../helpers', () => ({
  getStepResendApiKey: () => mockGetResendApiKey(),
  getStepEmailFrom: () => mockGetEmailFrom(),
}));

jest.mock('../client', () => ({
  inngest: {
    createFunction: jest.fn((_config, _trigger, handler) => {
      return { fn: handler, _config, _trigger };
    }),
    send: jest.fn().mockResolvedValue(undefined),
  },
}));

import { feedbackDeliveryFailed } from './feedback-delivery-failed';

async function executeHandler(eventData: unknown) {
  const mockStep = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: jest.fn().mockResolvedValue(undefined),
    sleep: jest.fn(),
    waitForEvent: jest.fn().mockResolvedValue(null),
  };
  const handler = (feedbackDeliveryFailed as any).fn;
  const result = await handler({ event: { data: eventData }, step: mockStep });
  return { result, mockStep };
}

describe('feedback-delivery-failed Inngest function [BUG-767 / A-24]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetResendApiKey.mockReturnValue('test-resend-key');
    mockGetEmailFrom.mockReturnValue('noreply@test.com');
  });

  describe('configuration', () => {
    it('triggers on app/feedback.delivery_failed', () => {
      const trigger = (feedbackDeliveryFailed as any)._trigger;
      expect(trigger.event).toBe('app/feedback.delivery_failed');
    });

    it('declares the expected function id and retry budget', () => {
      const config = (feedbackDeliveryFailed as any)._config;
      expect(config.id).toBe('feedback-delivery-failed');
      expect(config.retries).toBe(2);
    });
  });

  describe('payload validation', () => {
    // SWEEP-J8 hardening — same class as BUG-697. A malformed payload at the
    // outer .parse() would throw before any step.run, causing Inngest to retry
    // a permanently-bad input.
    it('does NOT throw on malformed payload — uses safeParse', async () => {
      await expect(executeHandler({})).resolves.toBeDefined();
    });

    it('returns skipped on malformed payload and does NOT call sendEmail', async () => {
      const { result } = await executeHandler({
        profileId: 'p-1' /* missing category */,
      });

      expect(result).toMatchObject({
        status: 'skipped',
        reason: 'invalid_payload',
      });
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('captures exception on malformed payload for queryable observability', async () => {
      // Per global "Silent Recovery Without Escalation is Banned" rule, the
      // skip path must still be observable so we can count it in dashboards.
      await executeHandler({ profileId: 'p-1', category: 'invalid-cat' });

      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      const [err, ctx] = mockCaptureException.mock.calls[0];
      expect(err).toBeInstanceOf(Error);
      expect(ctx.extra.surface).toBe('feedback-delivery-failed');
      expect(ctx.extra.reason).toBe('invalid_payload');
    });

    it('rejects unknown category values', async () => {
      const { result } = await executeHandler({
        profileId: 'p-1',
        category: 'rant', // not one of bug|suggestion|general
      });
      expect(result).toMatchObject({ status: 'skipped' });
    });
  });

  describe('valid payload — happy path', () => {
    it('calls sendEmail with configured Resend key + emailFrom', async () => {
      mockSendEmail.mockResolvedValue({ sent: true });

      await executeHandler({
        profileId: 'profile-abc-12345678',
        category: 'bug',
      });

      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      const [emailArg, configArg] = mockSendEmail.mock.calls[0];
      expect(emailArg.type).toBe('feedback');
      expect(emailArg.subject).toContain('[MentoMate Bug Report]');
      expect(emailArg.subject).toContain('profile-'); // first 8 chars of profileId
      expect(configArg.resendApiKey).toBe('test-resend-key');
      expect(configArg.emailFrom).toBe('noreply@test.com');
    });

    it('formats subject differently per category', async () => {
      mockSendEmail.mockResolvedValue({ sent: true });

      await executeHandler({ profileId: 'p-1', category: 'suggestion' });
      expect(mockSendEmail.mock.calls[0][0].subject).toContain('Suggestion');

      mockSendEmail.mockClear();
      await executeHandler({ profileId: 'p-1', category: 'other' });
      expect(mockSendEmail.mock.calls[0][0].subject).toContain('Feedback');
    });

    it('returns ok on successful retry', async () => {
      mockSendEmail.mockResolvedValue({ sent: true });
      const { result } = await executeHandler({
        profileId: 'p-1',
        category: 'bug',
      });
      expect(result).toEqual({ ok: true, profileId: 'p-1' });
    });
  });

  describe('valid payload — retry behavior', () => {
    it('throws when sendEmail returns sent:false so Inngest retries', async () => {
      mockSendEmail.mockResolvedValue({ sent: false, reason: 'rate_limited' });

      await expect(
        executeHandler({ profileId: 'p-1', category: 'bug' })
      ).rejects.toThrow(/feedback-delivery-failed retry unsuccessful/);
    });

    it('captures exception when retry still fails', async () => {
      mockSendEmail.mockResolvedValue({
        sent: false,
        reason: 'network_error',
      });

      await expect(
        executeHandler({ profileId: 'p-1', category: 'bug' })
      ).rejects.toThrow();

      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      const [err, ctx] = mockCaptureException.mock.calls[0];
      expect(err).toBeInstanceOf(Error);
      expect(ctx.profileId).toBe('p-1');
      expect(ctx.extra.reason).toBe('network_error');
    });
  });
});

// ---------------------------------------------------------------------------
// Registration check — guards against the original BUG-767 root cause where
// the route dispatched an event but no consumer was wired into `serve()`.
// ---------------------------------------------------------------------------

describe('[BUG-767 / A-24] handler is registered with serve()', () => {
  it('is included in the Inngest functions array', () => {
    // Mock client/createFunction once for this isolated import so we don't
    // collide with the test module's mocks above.
    jest.isolateModules(() => {
      jest.doMock('../client', () => ({
        inngest: {
          createFunction: jest.fn((cfg, _trigger, handler) => ({
            fn: handler,
            _config: cfg,
            id: cfg.id,
          })),
          send: jest.fn(),
        },
      }));
      const { functions } = require('../index');
      const ids = functions.map(
        (f: { _config?: { id?: string } }) => f._config?.id
      );
      expect(ids).toContain('feedback-delivery-failed');
    });
  });
});
