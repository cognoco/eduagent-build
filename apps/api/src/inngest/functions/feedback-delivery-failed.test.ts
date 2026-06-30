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
//   4. Valid payloads rehydrate the parked feedback row by its opaque
//      retryId (PII egress: the event carries no free-text — F-090), call
//      sendEmail with the configured Resend key, and delete the row after a
//      successful send.
//   5. Re-throws on send failure so Inngest retries up to `retries: 2`.
// ---------------------------------------------------------------------------

const mockSendEmail = jest.fn();
const mockCaptureException = jest.fn();
const mockGetResendApiKey = jest.fn();
const mockGetEmailFrom = jest.fn();
const mockGetStepSupportEmail = jest.fn();
const mockGetStepDatabase = jest.fn();
const mockLoggerWarn = jest.fn();

jest.mock('../../services/notifications', () => {
  const actual = jest.requireActual(
    '../../services/notifications',
  ) as typeof import('../../services/notifications');
  return {
    ...actual,
    sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  };
});

jest.mock('../../services/sentry', () => {
  const actual = jest.requireActual(
    '../../services/sentry',
  ) as typeof import('../../services/sentry');
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  };
});

jest.mock('../../services/logger', () => {
  const actual = jest.requireActual(
    '../../services/logger',
  ) as typeof import('../../services/logger');
  return {
    ...actual,
    createLogger: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: (...args: unknown[]) => mockLoggerWarn(...args),
      error: jest.fn(),
    }),
  };
});

jest.mock('../helpers', () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return {
    ...actual,
    getStepResendApiKey: () => mockGetResendApiKey(),
    getStepEmailFrom: () => mockGetEmailFrom(),
    getStepSupportEmail: () => mockGetStepSupportEmail(),
    getStepDatabase: () => mockGetStepDatabase(),
  };
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInngestTransportCapture } from '../../test-utils/inngest-transport-capture';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';

const mockInngestTransport = createInngestTransportCapture();
jest.mock('../client', () => {
  const actual = jest.requireActual('../client') as typeof import('../client');
  return {
    ...actual,
    ...mockInngestTransport.module,
  };
});

import { feedbackDeliveryFailed } from './feedback-delivery-failed';

const RETRY_ID = '00000000-0000-7000-8000-0000000000aa';
const RETRY_ID_B = '00000000-0000-7000-8000-0000000000bb';

type FeedbackRetryEventData = {
  retryId: string;
  profileId: string;
  // [WI-1066] Renamed from `userId`; Clerk user ID not profile ID.
  clerkUserId: string;
};

function feedbackRetryEvent(
  overrides: Partial<FeedbackRetryEventData> = {},
): FeedbackRetryEventData {
  return {
    retryId: overrides.retryId ?? RETRY_ID,
    profileId: overrides.profileId ?? 'p-1',
    clerkUserId: overrides.clerkUserId ?? 'user_clerk_1',
  };
}

type FeedbackRetryRowStub = {
  id: string;
  profileId: string;
  userId: string;
  category: string;
  message: string;
  metaLines: string;
};

function feedbackRow(
  overrides: Partial<FeedbackRetryRowStub> = {},
): FeedbackRetryRowStub {
  const profileId = overrides.profileId ?? 'p-1';
  const userId = overrides.userId ?? 'user-1';
  return {
    id: overrides.id ?? RETRY_ID,
    profileId,
    userId,
    category: overrides.category ?? 'bug',
    message: overrides.message ?? 'The original feedback message',
    metaLines:
      overrides.metaLines ??
      `Profile ID: ${profileId.slice(0, 8)}…\nUser ID: ${userId.slice(0, 8)}…\nSubmitted: 2026-05-23T00:00:00.000Z`,
  };
}

// The real getFeedbackRetry / deleteFeedbackRetry service functions run
// against this stub (the service itself is NOT mocked).
function stubFeedbackDb(row: FeedbackRetryRowStub | null) {
  const deleteWhere = jest.fn().mockResolvedValue(undefined);
  const db = {
    select: () => {
      const chain = {
        from: () => chain,
        where: () => chain,
        limit: async () => (row ? [row] : []),
      };
      return chain;
    },
    delete: jest.fn(() => ({ where: deleteWhere })),
  };
  mockGetStepDatabase.mockReturnValue(db);
  return { db, deleteWhere };
}

async function executeHandler(eventData: unknown, eventId?: string) {
  const { step } = createInngestStepRunner();
  const handler = (feedbackDeliveryFailed as any).fn;
  const result = await handler({
    event: { id: eventId, data: eventData },
    step,
  });
  return { result };
}

describe('feedback-delivery-failed Inngest function [BUG-767 / A-24]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInngestTransport.clear();
    mockGetResendApiKey.mockReturnValue('test-resend-key');
    mockGetEmailFrom.mockReturnValue('noreply@test.com');
    mockGetStepSupportEmail.mockReturnValue('support@test.com');
    stubFeedbackDb(feedbackRow());
  });

  describe('configuration', () => {
    it('triggers on app/feedback.delivery_failed', () => {
      const trigger = (feedbackDeliveryFailed as any).trigger;
      expect(trigger.event).toBe('app/feedback.delivery_failed');
    });

    it('declares the expected function id and retry budget', () => {
      const config = (feedbackDeliveryFailed as any).opts;
      expect(config.id).toBe('feedback-delivery-failed');
      expect(config.retries).toBe(2);
    });

    it('[WI-84 automated review] validates the event payload with the shared schema contract', () => {
      const source = readFileSync(
        join(__dirname, 'feedback-delivery-failed.ts'),
        'utf8',
      );

      expect(source).toContain("from '@eduagent/schemas'");
      expect(source).toContain('feedbackDeliveryFailedEventSchema');
      expect(source).not.toContain("z.enum(['bug', 'suggestion', 'other'])");
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
        profileId: 'p-1' /* missing retryId */,
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
      await executeHandler({ profileId: 'p-1', retryId: 'not-a-uuid' });

      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      const [err, ctx] = mockCaptureException.mock.calls[0];
      expect(err).toBeInstanceOf(Error);
      expect(ctx.extra.surface).toBe('feedback-delivery-failed');
      expect(ctx.extra.reason).toBe('invalid_payload');
    });

    // PII egress (F-090): the event contract carries the opaque retryId
    // reference only. A legacy-shaped payload that still tries to push the
    // free-text through the event has no retryId and must be skipped.
    it('[F-090] rejects legacy raw-text payloads (message/supportTo, no retryId) as invalid', async () => {
      const { result } = await executeHandler({
        profileId: 'p-1',
        clerkUserId: 'user-1',
        category: 'bug',
        message: 'My name is Milo Janssen and the quiz crashed',
        supportTo: 'support@mentomate.com',
        metaLines: 'Profile ID: p-1',
      });
      expect(result).toMatchObject({ status: 'skipped' });
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    // [WI-1066] Regression: the old ambiguous `userId` field name must be
    // rejected — a payload using the pre-rename field name fails validation
    // and is skipped (the schema now requires `clerkUserId`).
    it('[WI-1066] rejects a payload with old `userId` field (schema now requires `clerkUserId`)', async () => {
      // Payload uses the old field name — missing required `clerkUserId`.
      const oldStylePayload = {
        retryId: RETRY_ID,
        profileId: 'p-1',
        userId: 'clerk_user_abc', // old field name — rejected by schema
      };

      const { result } = await executeHandler(oldStylePayload);

      expect(result).toMatchObject({
        status: 'skipped',
        reason: 'invalid_payload',
      });
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });

  describe('valid payload — happy path', () => {
    it('calls sendEmail with configured Resend key + emailFrom', async () => {
      mockSendEmail.mockResolvedValue({ sent: true });
      stubFeedbackDb(feedbackRow({ category: 'bug' }));

      await executeHandler(
        feedbackRetryEvent({ profileId: 'profile-abc-12345678' }),
      );

      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      const [emailArg, configArg] = mockSendEmail.mock.calls[0];
      expect(emailArg.type).toBe('feedback');
      expect(emailArg.subject).toContain('[MentoMate Bug Report]');
      expect(emailArg.subject).toContain('profile-'); // first 8 chars of profileId
      expect(configArg.resendApiKey).toBe('test-resend-key');
      expect(configArg.emailFrom).toBe('noreply@test.com');
    });

    it('formats subject differently per category (category from the rehydrated row)', async () => {
      mockSendEmail.mockResolvedValue({ sent: true });

      stubFeedbackDb(feedbackRow({ category: 'suggestion' }));
      await executeHandler(feedbackRetryEvent());
      expect(mockSendEmail.mock.calls[0][0].subject).toContain('Suggestion');

      mockSendEmail.mockClear();
      stubFeedbackDb(feedbackRow({ category: 'other' }));
      await executeHandler(feedbackRetryEvent());
      expect(mockSendEmail.mock.calls[0][0].subject).toContain('Feedback');
    });

    it('returns ok on successful retry', async () => {
      mockSendEmail.mockResolvedValue({ sent: true });
      const { result } = await executeHandler(feedbackRetryEvent());
      expect(result).toEqual({ ok: true, profileId: 'p-1' });
    });

    // [WI-84 DS-030] + [F-090]: the retry must deliver the ORIGINAL feedback
    // message and metadata — rehydrated from the first-party
    // feedback_retry_queue row by the event's opaque retryId, never from the
    // event payload (Inngest persists payloads in its third-party store).
    it('[WI-84 DS-030 / F-090] retries the original message and metadata rehydrated from the queue row', async () => {
      mockSendEmail.mockResolvedValue({ sent: true });
      mockGetStepSupportEmail.mockReturnValue('feedback-ops@test.com');
      stubFeedbackDb(
        feedbackRow({
          message: 'Original crash report from the user',
          metaLines: 'Profile ID: profile-…\nUser ID: user-ori…\nPlatform: ios',
        }),
      );

      await executeHandler(
        feedbackRetryEvent({
          profileId: 'profile-original-payload',
          clerkUserId: 'user-original-payload',
        }),
        'evt-original-payload',
      );

      const [emailArg] = mockSendEmail.mock.calls[0] as [
        { to: string; body: string },
      ];
      // supportTo is re-derived from config in the consumer — never carried
      // in the event or the queue row.
      expect(emailArg.to).toBe('feedback-ops@test.com');
      expect(emailArg.body).toContain('Original crash report from the user');
      expect(emailArg.body).toContain('Platform: ios');
      expect(emailArg.body).not.toContain('[Delayed delivery]');
    });

    // PII hygiene: the queue row is the only first-party copy of the
    // feedback text and its purpose is fulfilled after a successful send —
    // it must be deleted, and must NOT be deleted when the send failed.
    it('[F-090] deletes the queue row after a successful send', async () => {
      mockSendEmail.mockResolvedValue({ sent: true });
      const { db } = stubFeedbackDb(feedbackRow());

      await executeHandler(feedbackRetryEvent(), 'evt-delete-1');

      expect(db.delete).toHaveBeenCalledTimes(1);
    });

    it('[F-090] does NOT delete the queue row when the send failed (row still needed for the retry)', async () => {
      mockSendEmail.mockResolvedValue({ sent: false, reason: 'rate_limited' });
      const { db } = stubFeedbackDb(feedbackRow());

      await expect(
        executeHandler(feedbackRetryEvent(), 'evt-delete-2'),
      ).rejects.toThrow();

      expect(db.delete).not.toHaveBeenCalled();
    });

    it('[F-090] skips gracefully (observable) when the queue row is missing — replay after success or enqueue never landed', async () => {
      mockSendEmail.mockResolvedValue({ sent: true });
      stubFeedbackDb(null);

      const { result } = await executeHandler(
        feedbackRetryEvent(),
        'evt-missing-row',
      );

      expect(result).toMatchObject({
        status: 'skipped',
        reason: 'retry_row_missing',
      });
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('retry row missing'),
        expect.objectContaining({
          surface: 'feedback-delivery-failed',
          reason: 'retry_row_missing',
        }),
      );
    });

    // [BUG-699-FOLLOWUP] Inngest step retries (retries: 2) can replay the
    // sendEmail call. A deterministic idempotency key bound to
    // (profileId, eventId) must be forwarded so Resend dedupes within 24h.
    it('[BUG-699-FOLLOWUP] forwards idempotencyKey containing profileId and eventId to sendEmail', async () => {
      mockSendEmail.mockResolvedValue({ sent: true });

      await executeHandler(
        feedbackRetryEvent({ profileId: 'profile-xyz-99999999' }),
        'evt-feedback-123',
      );

      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      const [, optsArg] = mockSendEmail.mock.calls[0] as [
        unknown,
        { idempotencyKey?: string },
      ];
      expect(optsArg.idempotencyKey).toEqual(
        expect.stringContaining('profile-xyz-99999999'),
      );
      expect(optsArg.idempotencyKey).toEqual(
        expect.stringContaining('evt-feedback-123'),
      );
      expect(optsArg.idempotencyKey).toEqual(
        expect.stringContaining('retry-delivery'),
      );
    });

    // [CR-IDEMP-FALLBACK-08] When event.id is undefined, the code must fall
    // back to a deterministic key (now: the retryId — unique per delivery
    // failure, stable across retries of the same event). Two retries of the
    // same event must receive the SAME idempotency key so Resend dedupes.
    it('[CR-IDEMP-FALLBACK-08] two retries with event.id absent receive the same deterministic key', async () => {
      mockSendEmail.mockResolvedValue({ sent: true });

      // Simulate first attempt (no eventId).
      await executeHandler(feedbackRetryEvent({ profileId: 'profile-no-id' }));
      // Simulate second attempt (Inngest retry, same payload, still no eventId).
      await executeHandler(feedbackRetryEvent({ profileId: 'profile-no-id' }));

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

    // [CR-IDEMP-FALLBACK-08] Two distinct delivery failures (distinct
    // retryIds) with no event.id must still produce different keys — no
    // cross-event collision.
    it('[CR-IDEMP-FALLBACK-08] distinct retryIds with no event.id produce distinct keys', async () => {
      mockSendEmail.mockResolvedValue({ sent: true });

      await executeHandler(feedbackRetryEvent({ retryId: RETRY_ID }));
      stubFeedbackDb(feedbackRow({ id: RETRY_ID_B }));
      await executeHandler(feedbackRetryEvent({ retryId: RETRY_ID_B }));

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
    // Per AGENTS.md: "Silent recovery without escalation is banned."
    it('[CR-MISSING-EVENT-ID-VISIBILITY] emits logger.warn and captureException with structured tags when event.id is missing', async () => {
      mockSendEmail.mockResolvedValue({ sent: true });
      stubFeedbackDb(feedbackRow({ category: 'suggestion' }));

      // No eventId — simulates Inngest replay without an event id.
      await executeHandler(
        feedbackRetryEvent({ profileId: 'profile-no-id-visibility' }),
        undefined,
      );

      // logger.warn must fire with the queryable surface + reason tags.
      expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
      const [warnMsg, warnCtx] = mockLoggerWarn.mock.calls[0] as [
        string,
        Record<string, unknown>,
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
        { extra: Record<string, unknown> },
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
        feedbackRetryEvent({ profileId: 'profile-shared' }),
        'evt-A',
      );
      await executeHandler(
        feedbackRetryEvent({ profileId: 'profile-shared' }),
        'evt-B',
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
        executeHandler(feedbackRetryEvent(), 'evt-retry-1'),
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
        executeHandler(feedbackRetryEvent(), 'evt-retry-2'),
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
    mockInngestTransport.clear();
    mockGetResendApiKey.mockReturnValue('test-resend-key');
    mockGetEmailFrom.mockReturnValue('noreply@test.com');
    mockGetStepSupportEmail.mockReturnValue('support@test.com');
    stubFeedbackDb(feedbackRow());
  });
  it('routes the email to the address from getStepSupportEmail()', async () => {
    mockSendEmail.mockResolvedValue({ sent: true });
    mockGetStepSupportEmail.mockReturnValue('ops@company.com');

    await executeHandler(feedbackRetryEvent());

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

    await executeHandler(feedbackRetryEvent());

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
      jest.doMock('../client', () => {
        const actual = jest.requireActual(
          '../client',
        ) as typeof import('../client');

        return {
          ...actual,
          inngest: {
            createFunction: jest.fn((cfg, _trigger, handler) => ({
              fn: handler,
              opts: cfg,
              _config: cfg,
              id: cfg.id,
            })),
            send: jest.fn(),
          },
        };
      });
      const { functions } = require('../index');
      const ids = functions.map(
        (f: { opts?: { id?: string }; _config?: { id?: string } }) =>
          f.opts?.id ?? f._config?.id,
      );
      expect(ids).toContain('feedback-delivery-failed');
    });
  });
});
