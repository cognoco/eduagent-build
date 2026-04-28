// ---------------------------------------------------------------------------
// feedback-delivery-failed — retry failed feedback email deliveries
// [A-24] The POST /feedback route dispatches app/feedback.delivery_failed
// when sendEmail returns { sent: false }. This function picks up that event
// and retries delivery via Resend with up to 2 additional attempts.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { inngest } from '../client';
import { getStepResendApiKey, getStepEmailFrom } from '../helpers';
import { sendEmail } from '../../services/notifications';
import { captureException } from '../../services/sentry';
import { createLogger } from '../../services/logger';

const logger = createLogger();

const DEFAULT_SUPPORT_EMAIL = 'support@mentomate.com';

// [BUG-767 / A-24] Category enum must match the route's submission schema
// (`feedbackCategorySchema` in `@eduagent/schemas`). The route persists
// `body.category` directly into the event payload, so a mismatch here would
// silently safeParse-fail every event the route fires — exactly the
// "wired-but-untriggered" anti-pattern A-24 was filed to prevent.
const eventDataSchema = z.object({
  profileId: z.string(),
  category: z.enum(['bug', 'suggestion', 'other']),
});

export const feedbackDeliveryFailed = inngest.createFunction(
  {
    id: 'feedback-delivery-failed',
    name: 'Retry failed feedback email delivery',
    retries: 2,
  },
  { event: 'app/feedback.delivery_failed' },
  async ({ event, step }) => {
    // [SWEEP-J8] safeParse so a malformed event payload doesn't throw before
    // the first step.run — bare .parse() would surface as a transient
    // function failure and Inngest would retry (configured retries: 2) on a
    // permanently-bad payload. Same class as BUG-697/J-8.
    const validated = eventDataSchema.safeParse(event.data);
    if (!validated.success) {
      const issues = validated.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      logger.warn(
        '[feedback-delivery-failed] invalid payload — skipping retries',
        {
          issues,
        }
      );
      // Structured escalation per global "no silent recovery" rule —
      // captureException keeps the case in Sentry for queryable counts.
      captureException(
        new Error('feedback-delivery-failed: invalid event payload'),
        {
          extra: {
            surface: 'feedback-delivery-failed',
            reason: 'invalid_payload',
            issues,
          },
        }
      );
      return { status: 'skipped' as const, reason: 'invalid_payload', issues };
    }
    const { profileId, category } = validated.data;

    const categoryLabel =
      category === 'bug'
        ? 'Bug Report'
        : category === 'suggestion'
        ? 'Suggestion'
        : 'Feedback';

    return step.run('retry-delivery', async () => {
      const resendApiKey = getStepResendApiKey();
      const emailFrom = getStepEmailFrom();

      const result = await sendEmail(
        {
          to: process.env['SUPPORT_EMAIL'] ?? DEFAULT_SUPPORT_EMAIL,
          subject: `[MentoMate ${categoryLabel}] delivery-retry for ${profileId.slice(
            0,
            8
          )}`,
          body: `[Delayed delivery] Category: ${category}\nProfile: ${profileId}\nOriginal delivery failed — this is a retry from the Inngest queue.`,
          type: 'feedback',
        },
        { resendApiKey, emailFrom }
      );

      if (!result.sent) {
        const err = new Error(
          `feedback-delivery-failed retry unsuccessful: ${
            result.reason ?? 'unknown'
          }`
        );
        captureException(err, {
          profileId,
          extra: { category, reason: result.reason },
        });
        logger.warn('[feedback-delivery-failed] retry still failed', {
          profileId,
          reason: result.reason,
        });
        // Re-throw so Inngest retries up to the configured retry limit
        throw err;
      }

      return { ok: true, profileId };
    });
  }
);
