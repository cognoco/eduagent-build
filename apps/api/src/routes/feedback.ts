import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { feedbackSubmissionSchema } from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import type { Database } from '@eduagent/database';
import { sendEmail } from '../services/notifications';
import { inngest } from '../inngest/client';

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

const DEFAULT_SUPPORT_EMAIL = 'support@mentomate.app';

// SEC-03: In-memory sliding-window rate limit for feedback submissions.
// 5 submissions per hour per user. Resets on worker restart — acceptable
// for a low-volume endpoint; avoids adding a DB/KV dependency.
const FEEDBACK_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const FEEDBACK_RATE_LIMIT_MAX = 5;
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
      return c.json(
        {
          success: false,
          error: 'Too many submissions. Please try again later.',
        },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfterSecs) },
        }
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
      return c.json({ success: true, queued: true });
    }

    return c.json({ success: true, queued: false });
  }
);
