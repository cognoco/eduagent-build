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

const eventDataSchema = z.object({
  profileId: z.string(),
  category: z.enum(['bug', 'suggestion', 'general']),
});

export const feedbackDeliveryFailed = inngest.createFunction(
  {
    id: 'feedback-delivery-failed',
    name: 'Retry failed feedback email delivery',
    retries: 2,
  },
  { event: 'app/feedback.delivery_failed' },
  async ({ event, step }) => {
    const { profileId, category } = eventDataSchema.parse(event.data);

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
