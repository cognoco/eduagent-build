import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  feedbackSubmissionSchema,
  feedbackResponseSchema,
  ERROR_CODES,
} from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import type { Database } from '@eduagent/database';
import { sendEmail } from '../services/notifications';
import { inngest } from '../inngest/client';
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
const FEEDBACK_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const FEEDBACK_RATE_LIMIT_MAX = 5;
const FEEDBACK_MAP_MAX_ENTRIES = 10_000;
const feedbackTimestamps = new Map<string, number[]>();

function isFeedbackRateLimited(userId: string): boolean {
  const now = Date.now();
  const cutoff = now - FEEDBACK_RATE_LIMIT_WINDOW_MS;
  const timestamps = (feedbackTimestamps.get(userId) ?? []).filter(
    (t) => t > cutoff
  );
  // Prune stale Map entry to prevent unbounded growth in long-lived isolates
  if (timestamps.length === 0 && feedbackTimestamps.has(userId)) {
    feedbackTimestamps.delete(userId);
  }
  // Evict oldest entries if the Map exceeds the size cap. Maps iterate in
  // insertion order, so the first key is the oldest.
  if (feedbackTimestamps.size >= FEEDBACK_MAP_MAX_ENTRIES) {
    const oldest = feedbackTimestamps.keys().next().value;
    if (oldest !== undefined) feedbackTimestamps.delete(oldest);
  }
  if (timestamps.length >= FEEDBACK_RATE_LIMIT_MAX) {
    feedbackTimestamps.set(userId, timestamps);
    return true;
  }
  timestamps.push(now);
  feedbackTimestamps.set(userId, timestamps);
  return false;
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
        'Too many submissions. Please try again later.'
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

    const metaLines = [
      `Profile ID: ${profileId}`,
      `User ID: ${userId}`,
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
      }
    );

    if (!emailResult.sent) {
      // [A-1] Awaited per CLAUDE.md — no silent fire-and-forget from route handlers.
      await inngest.send({
        name: 'app/feedback.delivery_failed',
        data: { profileId, category: body.category },
      });
      return c.json(
        feedbackResponseSchema.parse({ success: true, queued: true })
      );
    }

    return c.json(
      feedbackResponseSchema.parse({ success: true, queued: false })
    );
  }
);
