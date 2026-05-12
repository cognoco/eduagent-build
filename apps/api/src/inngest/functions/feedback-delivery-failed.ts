// ---------------------------------------------------------------------------
// feedback-delivery-failed — retry failed feedback email deliveries
// [A-24] The POST /feedback route dispatches app/feedback.delivery_failed
// when sendEmail returns { sent: false }. This function picks up that event
// and retries delivery via Resend with up to 2 additional attempts.
// ---------------------------------------------------------------------------

import { createHash } from 'crypto';
import { z } from 'zod';
import { inngest } from '../client';
import {
  getStepResendApiKey,
  getStepEmailFrom,
  getStepSupportEmail,
} from '../helpers';
import { sendEmail } from '../../services/notifications';
import { captureException } from '../../services/sentry';
import { createLogger } from '../../services/logger';

const logger = createLogger();

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
        },
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
        },
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

      // [BUG-699-FOLLOWUP] Pass a deterministic idempotency key so Inngest
      // step retries (retries: 2) cannot deliver the same support email twice.
      // Resend dedupes calls with matching `Idempotency-Key` within 24h.
      // The key is bound to (profileId, eventId) so a genuinely new delivery
      // failure for the same profile in a new run produces a fresh key.
      //
      // [CR-IDEMP-FALLBACK-08] When event.id is missing, fall back to a
      // deterministic per-payload hash so Inngest retries of the *same* event
      // are still idempotent without colliding across distinct events.
      // The previous `event.id ?? 'no-event'` fallback collapsed every distinct
      // delivery failure for the same profile within Resend's 24h dedup window
      // onto a single key (silently discarding emails 2..N). The previous fix
      // dropped the key entirely (risking double-sends on replay). A hash of
      // stable payload fields satisfies both constraints: no cross-event
      // collision AND idempotent across retries of the same event.
      //
      // [CR-MISSING-EVENT-ID-VISIBILITY] Per global "no silent recovery" rule,
      // the hash-fallback path must be observable so ops can count occurrences.
      // logger.warn makes it queryable in log aggregation; captureException
      // surfaces it in Sentry alerts if the rate becomes significant.
      let idempotencyKey: string;
      if (event.id) {
        idempotencyKey = `feedback-delivery-failed:${profileId}:${event.id}:retry-delivery`;
      } else {
        const hashInput = JSON.stringify({ profileId, category });
        const hash = createHash('sha256')
          .update(hashInput)
          .digest('hex')
          .slice(0, 16);
        idempotencyKey = `feedback-delivery-failed:hash:${hash}:retry-delivery`;
        logger.warn(
          '[feedback-delivery-failed] event.id missing — falling back to payload hash idempotency key',
          {
            surface: 'feedback-delivery-failed',
            reason: 'missing_event_id',
            profileId,
            category,
          },
        );
        captureException(
          new Error(
            'feedback-delivery-failed: missing event.id — using payload hash idempotency key',
          ),
          {
            extra: {
              surface: 'feedback-delivery-failed',
              reason: 'missing_event_id',
              profileId,
              category,
            },
          },
        );
      }

      const result = await sendEmail(
        {
          to: getStepSupportEmail(),
          subject: `[MentoMate ${categoryLabel}] delivery-retry for ${profileId.slice(
            0,
            8,
          )}`,
          body: `[Delayed delivery] Category: ${category}\nProfile: ${profileId}\nOriginal delivery failed — this is a retry from the Inngest queue.`,
          type: 'feedback',
        },
        { resendApiKey, emailFrom, idempotencyKey },
      );

      if (!result.sent) {
        const err = new Error(
          `feedback-delivery-failed retry unsuccessful: ${
            result.reason ?? 'unknown'
          }`,
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
  },
);
