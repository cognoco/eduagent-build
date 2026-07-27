// @inngest-admin: event-profile (profileId from event; feedback retry scoped by profileId)
// ---------------------------------------------------------------------------
// feedback-delivery-failed — retry failed feedback email deliveries
// [A-24] The POST /feedback route dispatches app/feedback.delivery_failed
// when sendEmail returns { sent: false }. This function picks up that event
// and retries delivery via Resend with up to 2 additional attempts.
//
// PII egress: the event carries only an opaque retryId reference — the
// feedback free-text lives in the first-party feedback_retry_queue row
// (written by the route in the same failure path) and is rehydrated here,
// then the row is deleted after a successful send. The support address is
// re-derived from config (getStepSupportEmail), never carried in the event.
// ---------------------------------------------------------------------------

import { feedbackDeliveryFailedEventSchema } from '@eduagent/schemas';
import { inngest } from '../client';
import {
  getStepDatabase,
  getStepResendApiKey,
  getStepEmailFrom,
  getStepSupportEmail,
} from '../helpers';
import {
  deleteFeedbackRetry,
  getFeedbackRetry,
} from '../../services/feedback-retry';
import { sendEmail } from '../../services/notifications';
import { captureException } from '../../services/sentry';
import { createLogger } from '../../services/logger';
import { buildEmailIdempotencyKey } from '../../services/dedupe-key';

const logger = createLogger();

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
    const validated = feedbackDeliveryFailedEventSchema.safeParse(event.data);
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
          tags: { surface: 'feedback', signal: 'schema-drift' },
          extra: {
            surface: 'feedback-delivery-failed',
            reason: 'invalid_payload',
            issues,
          },
        },
      );
      return { status: 'skipped' as const, reason: 'invalid_payload', issues };
    }
    const { retryId, profileId, clerkUserId } = validated.data;

    return step.run('retry-delivery', async () => {
      const db = getStepDatabase();

      // Rehydrate the parked feedback payload by its opaque id, scoped by
      // profileId so a forged retry id cannot read another user's text.
      const queued = await getFeedbackRetry(db, profileId, retryId);
      if (!queued) {
        // Row already consumed (replay after a successful send) or the
        // enqueue never landed. Nothing to retry — observable skip per the
        // global "no silent recovery" rule.
        logger.warn('[feedback-delivery-failed] retry row missing — skipping', {
          surface: 'feedback-delivery-failed',
          reason: 'retry_row_missing',
          profileId,
          clerkUserId,
        });
        return { status: 'skipped' as const, reason: 'retry_row_missing' };
      }

      const categoryLabel =
        queued.category === 'bug'
          ? 'Bug Report'
          : queued.category === 'suggestion'
            ? 'Suggestion'
            : 'Feedback';

      const resendApiKey = getStepResendApiKey();
      const emailFrom = getStepEmailFrom();

      // [BUG-699-FOLLOWUP] Pass a deterministic idempotency key so Inngest
      // step retries (retries: 2) cannot deliver the same support email
      // twice. Resend dedupes calls with matching `Idempotency-Key` within
      // 24h.
      //
      // [CR-IDEMP-FALLBACK-08] When event.id is missing, key on the retryId
      // instead — it is unique per delivery failure (no cross-event
      // collision) and stable across retries of the same event.
      //
      // [CR-MISSING-EVENT-ID-VISIBILITY] Per global "no silent recovery"
      // rule, the fallback path must be observable so ops can count
      // occurrences: logger.warn for log aggregation, captureException for
      // Sentry alerting at volume.
      let idempotencyKey: string;
      if (event.id) {
        idempotencyKey = buildEmailIdempotencyKey(
          'feedback-delivery-failed',
          profileId,
          event.id,
          'retry-delivery',
        );
      } else {
        idempotencyKey = buildEmailIdempotencyKey(
          'feedback-delivery-failed',
          profileId,
          retryId,
          'retry-delivery',
        );
        logger.warn(
          '[feedback-delivery-failed] event.id missing — falling back to retryId idempotency key',
          {
            surface: 'feedback-delivery-failed',
            reason: 'missing_event_id',
            profileId,
            clerkUserId,
            category: queued.category,
          },
        );
        captureException(
          new Error(
            'feedback-delivery-failed: missing event.id — using retryId idempotency key',
          ),
          {
            tags: { surface: 'feedback', signal: 'idempotency-fallback' },
            extra: {
              surface: 'feedback-delivery-failed',
              reason: 'missing_event_id',
              profileId,
              clerkUserId,
              category: queued.category,
            },
          },
        );
      }

      const result = await sendEmail(
        {
          // Re-derived from config — identical chain + default as the
          // route's supportTo resolution.
          to: getStepSupportEmail(),
          subject: `[MentoMate ${categoryLabel}] delivery-retry for ${profileId.slice(
            0,
            8,
          )}`,
          body: `${queued.message}\n\n---\n${queued.metaLines}`,
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
          tags: { surface: 'feedback', signal: 'delivery-failed' },
          extra: { category: queued.category, reason: result.reason },
        });
        logger.warn('[feedback-delivery-failed] retry still failed', {
          profileId,
          reason: result.reason,
        });
        // Re-throw so Inngest retries up to the configured retry limit
        throw err;
      }

      // PII hygiene: the row's purpose is fulfilled — delete it. If this
      // delete fails the step retries; the re-send is deduped by Resend via
      // the idempotency key above, then the delete is retried.
      await deleteFeedbackRetry(db, profileId, retryId);

      return { ok: true, profileId };
    });
  },
);
