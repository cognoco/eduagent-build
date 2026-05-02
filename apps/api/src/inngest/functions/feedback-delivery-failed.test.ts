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
const mockGetStepSupportEmail = jest.fn();
const mockLoggerWarn = jest.fn();

jest.mock('../../services/notifications', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

jest.mock('../../services/sentry', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

jest.mock('../../services/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
    error: jest.fn(),
  }),
}));

jest.mock('../helpers', () => ({
  getStepResendApiKey: () => mockGetResendApiKey(),
  getStepEmailFrom: () => mockGetEmailFrom(),
  getStepSupportEmail: () => mockGetStepSupportEmail(),
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

async function executeHandler(eventData: unknown, eventId?: string) {
  const mockStep = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: jest.fn().mockResolvedValue(undefined),
    sleep: jest.fn(),
    waitForEvent: jest.fn().mockResolvedValue(null),
  };
  const handler = (feedbackDeliveryFailed as any).fn;
  const result = await handler({
    event: { id: eventId, data: eventData },
    step: mockStep,
  });
  return { result, mockStep };
}

describe('feedback-delivery-failed Inngest function [BUG-767 / A-24]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetResendApiKey.mockReturnValue('test-resend-key');
    mockGetEmailFrom.mockReturnValue('noreply@test.com');
    mockGetStepSupportEmail.mockReturnValue('support@test.com');
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
      await expect(executeHandler({})).resolves.toBeTruthy();
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

    // [BUG-699-FOLLOWUP] Inngest step retries (retries: 2) can replay the
    // sendEmail call. A deterministic idempotency key bound to
    // (profileId, eventId) must be forwarded so Resend dedupes within 24h.
    it('[BUG-699-FOLLOWUP] forwards idempotencyKey containing profileId and eventId to sendEmail', async () => {
      mockSendEmail.mockResolvedValue({ sent: true });

      await executeHandler(
        { profileId: 'profile-xyz-99999999', category: 'bug' },
        'evt-feedback-123'
      );

      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      const [, optsArg] = mockSendEmail.mock.calls[0] as [
        unknown,
        { idempotencyKey?: string }
      ];
      expect(optsArg.idempotencyKey).toEqual(
        expect.stringContaining('profile-xyz-99999999')
      );
      expect(optsArg.idempotencyKey).toEqual(
        expect.stringContaining('evt-feedback-123')
      );
      expect(optsArg.idempotencyKey).toEqual(
        expect.stringContaining('retry-delivery')
      );
    });

    // [CR-IDEMP-FALLBACK-08] When event.id is undefined, the code must fall
    // back to a deterministic payload-hash key rather than `undefined`.
    // Two retries of the same event (same profileId + category, no event.id)
    // must receive the SAME idempotency key so Resend dedupes them.
    it('[CR-IDEMP-FALLBACK-08] two retries with event.id absent receive the same deterministic hash key', async () => {
      mockSendEmail.mockResolvedValue({ sent: true });

      // Simulate first attempt (no eventId).
      await executeHandler({ profileId: 'profile-no-id', category: 'bug' });
      // Simulate second attempt (Inngest retry, same payload, still no eventId).
      await executeHandler({ profileId: 'profile-no-id', category: 'bug' });

      expect(mockSendEmail).toHaveBeenCalledTimes(2);
      const keyFirst = (
        mockSendEmail.mock.calls[0] as [unknown, { idempotencyKey?: string }]
      )[1].idempotencyKey;
      const keySecond = (
        mockSendEmail.mock.calls[1] as [unknown, { idempotencyKey?: string }]
      )[1].idempotencyKey;

      // Both retries must produce the same non-undefined key.
      expect(typeof keyFirst).toBe('string');
      expect(typeof keySecond).toBe('string');
      expect(keyFirst).toEqual(keySecond);

      // Must NOT be the old collision fallback.
      expect(keyFirst).not.toContain('no-event');
    });

    // [CR-IDEMP-FALLBACK-08] Two distinct payloads (different profileId) with
    // no event.id must still produce different hash keys — no cross-event
    // collision.
    it('[CR-IDEMP-FALLBACK-08] distinct payloads with no event.id produce distinct hash keys', async () => {
      mockSendEmail.mockResolvedValue({ sent: true });

      await executeHandler({ profileId: 'profile-A', category: 'bug' });
      await executeHandler({ profileId: 'profile-B', category: 'bug' });

      expect(mockSendEmail).toHaveBeenCalledTimes(2);
      const keyA = (
        mockSendEmail.mock.calls[0] as [unknown, { idempotencyKey?: string }]
      )[1].idempotencyKey;
      const keyB = (
        mockSendEmail.mock.calls[1] as [unknown, { idempotencyKey?: string }]
      )[1].idempotencyKey;

      expect(typeof keyA).toBe('string');
      expect(typeof keyB).toBe('string');
      expect(keyA).not.toEqual(keyB);
    });

    // [CR-MISSING-EVENT-ID-VISIBILITY] Break test: when event.id is absent the
    // fallback path must emit a structured logger.warn and captureException so
    // ops can count occurrences in log aggregation and Sentry dashboards.
    // Per CLAUDE.md: "Silent recovery without escalation is banned."
    it('[CR-MISSING-EVENT-ID-VISIBILITY] emits logger.warn and captureException with structured tags when event.id is missing', async () => {
      mockSendEmail.mockResolvedValue({ sent: true });

      // No eventId — simulates Inngest replay without an event id.
      await executeHandler(
        { profileId: 'profile-no-id-visibility', category: 'suggestion' },
        undefined
      );

      // logger.warn must fire with the queryable surface + reason tags.
      expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
      const [warnMsg, warnCtx] = mockLoggerWarn.mock.calls[0] as [
        string,
        Record<string, unknown>
      ];
      expect(warnMsg).toContain('event.id missing');
      expect(warnCtx.surface).toBe('feedback-delivery-failed');
      expect(warnCtx.reason).toBe('missing_event_id');
      expect(warnCtx.profileId).toBe('profile-no-id-visibility');
      expect(warnCtx.category).toBe('suggestion');

      // captureException must also fire so Sentry can alert at volume.
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      const [sentryErr, sentryCtx] = mockCaptureException.mock.calls[0] as [
        Error,
        { extra: Record<string, unknown> }
      ];
      expect(sentryErr).toBeInstanceOf(Error);
      expect(sentryCtx.extra.surface).toBe('feedback-delivery-failed');
      expect(sentryCtx.extra.reason).toBe('missing_event_id');

      // Delivery still proceeds (no silent drop).
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
    });

    // [CR-IDEMP-FALLBACK-08] Two distinct delivery failures for the same
    // profile with distinct event IDs must produce distinct idempotency
    // keys — pin the (profileId, eventId) coupling so a future refactor
    // that drops eventId from the key can't silently collapse them.
    it('[CR-IDEMP-FALLBACK-08] distinct event IDs produce distinct idempotency keys', async () => {
      mockSendEmail.mockResolvedValue({ sent: true });

      await executeHandler(
        { profileId: 'profile-shared', category: 'bug' },
        'evt-A'
      );
      await executeHandler(
        { profileId: 'profile-shared', category: 'bug' },
        'evt-B'
      );

      expect(mockSendEmail).toHaveBeenCalledTimes(2);
      const keyA = (
        mockSendEmail.mock.calls[0] as [unknown, { idempotencyKey?: string }]
      )[1].idempotencyKey;
      const keyB = (
        mockSendEmail.mock.calls[1] as [unknown, { idempotencyKey?: string }]
      )[1].idempotencyKey;
      expect(typeof keyA).toBe('string');
      expect(typeof keyB).toBe('string');
      expect(keyA).not.toEqual(keyB);
    });
  });

  describe('valid payload — retry behavior', () => {
    it('throws when sendEmail returns sent:false so Inngest retries', async () => {
      mockSendEmail.mockResolvedValue({ sent: false, reason: 'rate_limited' });

      await expect(
        // Pass an eventId so the missing-event-id visibility path doesn't fire.
        executeHandler({ profileId: 'p-1', category: 'bug' }, 'evt-retry-1')
      ).rejects.toThrow(/feedback-delivery-failed retry unsuccessful/);
    });

    it('captures exception when retry still fails', async () => {
      mockSendEmail.mockResolvedValue({
        sent: false,
        reason: 'network_error',
      });

      await expect(
        // Pass an eventId so the missing-event-id visibility path doesn't fire,
        // keeping captureException call count at exactly 1 (the retry failure).
        executeHandler({ profileId: 'p-1', category: 'bug' }, 'evt-retry-2')
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
// [FIX-INNGEST-5] getStepSupportEmail break test
// Previously used process.env['SUPPORT_EMAIL'] directly — CF Workers bindings
// are not available via process.env inside Inngest step functions. The fix
// uses getStepSupportEmail() which is populated by the CF env middleware.
// ---------------------------------------------------------------------------

describe('[FIX-INNGEST-5] uses getStepSupportEmail() not process.env', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetResendApiKey.mockReturnValue('test-resend-key');
    mockGetEmailFrom.mockReturnValue('noreply@test.com');
    mockGetStepSupportEmail.mockReturnValue('support@test.com');
  });
  it('routes the email to the address from getStepSupportEmail()', async () => {
    mockSendEmail.mockResolvedValue({ sent: true });
    mockGetStepSupportEmail.mockReturnValue('ops@company.com');

    await executeHandler({ profileId: 'p-1', category: 'bug' });

    expect(mockGetStepSupportEmail).toHaveBeenCalled();
    const [emailArg] = mockSendEmail.mock.calls[0] as [{ to: string }];
    expect(emailArg.to).toBe('ops@company.com');
  });

  it('does NOT read process.env["SUPPORT_EMAIL"] directly', async () => {
    // Confirm the old pattern is gone — getStepSupportEmail is called,
    // not process.env. This test pins the indirection so CF Workers get the
    // binding-injected value, not the (absent) Node.js env var.
    mockSendEmail.mockResolvedValue({ sent: true });
    const originalEnv = process.env['SUPPORT_EMAIL'];
    delete process.env['SUPPORT_EMAIL'];
    mockGetStepSupportEmail.mockReturnValue('support@mentomate.com');

    await executeHandler({ profileId: 'p-1', category: 'bug' });

    // Even with no process.env value, email was sent to the injected address
    const [emailArg] = mockSendEmail.mock.calls[0] as [{ to: string }];
    expect(emailArg.to).toBe('support@mentomate.com');

    if (originalEnv !== undefined) process.env['SUPPORT_EMAIL'] = originalEnv;
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
