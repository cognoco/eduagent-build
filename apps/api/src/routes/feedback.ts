import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  feedbackSubmissionSchema,
  feedbackResponseSchema,
  ERROR_CODES,
  type FeedbackDeliveryFailedEvent,
} from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import type { Database } from '@eduagent/database';
import { sendEmail } from '../services/notifications';
import { enqueueFeedbackRetry } from '../services/feedback-retry';
import { inngest } from '../inngest/client';
import { safeSend } from '../services/safe-non-core';
import { createSlidingWindowRateLimiter } from '../services/rate-limit';
import { apiError } from '../errors';

type FeedbackRouteEnv = {
  Bindings: {
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    SUPPORT_EMAIL?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

const DEFAULT_SUPPORT_EMAIL = 'support@mentomate.com';

// SEC-03: In-memory sliding-window rate limit for feedback submissions.
// 5 submissions per hour per user. Resets on worker restart — acceptable
// for a low-volume endpoint; avoids adding a DB/KV dependency.
// NOTE: Each Cloudflare Worker isolate maintains independent Map state. The
// effective limit per user is 5 × N (N = active isolates). For higher-volume
// endpoints, replace with a KV-backed rate limiter for global enforcement.
// Shared windowed-Map implementation now lives in services/rate-limit.ts
// (previously duplicated here and in routes/consent.ts).
const FEEDBACK_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const FEEDBACK_RATE_LIMIT_MAX = 5;
const FEEDBACK_MAP_MAX_ENTRIES = 10_000;
const feedbackLimiter = createSlidingWindowRateLimiter({
  windowMs: FEEDBACK_RATE_LIMIT_WINDOW_MS,
  max: FEEDBACK_RATE_LIMIT_MAX,
  maxEntries: FEEDBACK_MAP_MAX_ENTRIES,
});

function isFeedbackRateLimited(userId: string): boolean {
  return feedbackLimiter.isLimited(userId);
}

export const feedbackRoutes = new Hono<FeedbackRouteEnv>().post(
  '/feedback',
  zValidator('json', feedbackSubmissionSchema),
  async (c) => {
    const userId = c.get('user').userId;
    if (isFeedbackRateLimited(userId)) {
      const retryAfterSecs = Math.ceil(FEEDBACK_RATE_LIMIT_WINDOW_MS / 1000);
      c.header('Retry-After', String(retryAfterSecs));
      return apiError(
        c,
        429,
        ERROR_CODES.RATE_LIMITED,
        'Too many submissions. Please try again later.',
      );
    }

    const body = c.req.valid('json');
    const profileId = c.get('profileId') ?? 'unknown';
    const env = c.env ?? {};
    const supportTo = env.SUPPORT_EMAIL ?? DEFAULT_SUPPORT_EMAIL;

    const categoryLabel =
      body.category === 'bug'
        ? 'Bug Report'
        : body.category === 'suggestion'
          ? 'Suggestion'
          : 'Feedback';

    // FCR-2026-05-23-L2.L2.4: Truncate pseudonymous identifiers to first 8 chars
    // before including them in the email body sent to Resend (data minimisation
    // under GDPR — full UUIDs are persistent identifiers that do not need to be
    // in third-party email provider logs). The Inngest retry payload below still
    // carries full IDs so the delivery-failed consumer can look up the record.
    const metaLines = [
      `Profile ID: ${profileId.slice(0, 8)}…`,
      `User ID: ${userId.slice(0, 8)}…`,
      body.appVersion ? `App Version: ${body.appVersion}` : null,
      body.platform ? `Platform: ${body.platform}` : null,
      body.osVersion ? `OS Version: ${body.osVersion}` : null,
      `Submitted: ${new Date().toISOString()}`,
    ]
      .filter(Boolean)
      .join('\n');

    // D-1: sendEmail never throws — it returns { sent: false, reason } on all
    // failure modes. Check the return value and queue for retry when unsent.
    const emailResult = await sendEmail(
      {
        to: supportTo,
        subject: `[MentoMate ${categoryLabel}] from ${profileId.slice(0, 8)}`,
        body: `${body.message}\n\n---\n${metaLines}`,
        type: 'feedback',
      },
      {
        resendApiKey: env.RESEND_API_KEY,
        emailFrom: env.EMAIL_FROM,
      },
    );

    if (!emailResult.sent) {
      // PII egress: the feedback free-text and the support address must not
      // ride in the Inngest event (third-party event store). Park the payload
      // in the first-party retry queue; the event carries the opaque row id
      // only and the consumer rehydrates by it. An enqueue failure (already
      // captured to Sentry inside the service) loses the retry gracefully —
      // never fall back to placing the message in the event payload.
      const retryId = await enqueueFeedbackRetry(c.get('db'), {
        profileId,
        userId,
        category: body.category,
        message: body.message,
        metaLines,
      });
      if (retryId) {
        await safeSend(
          () =>
            inngest.send({
              name: 'app/feedback.delivery_failed',
              data: {
                retryId,
                profileId,
                userId,
              } satisfies FeedbackDeliveryFailedEvent,
            }),
          'feedback.delivery-failed',
          { profileId },
        );
      }
      return c.json(
        feedbackResponseSchema.parse({
          success: true,
          queued: retryId !== null,
        }),
      );
    }

    return c.json(
      feedbackResponseSchema.parse({ success: true, queued: false }),
    );
  },
);
