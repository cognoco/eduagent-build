// @inngest-admin: no-db (email send only; no DB access)
// ---------------------------------------------------------------------------
// account-security-notification — [CRITICAL-2a]
// Sends an out-of-band security-notification email when an account credential
// changes (login email, password add/change). Dispatched as a non-core event
// (`app/account.security-event`) so a delivery failure never breaks the user's
// credential change, but is still retried + escalated here.
// ---------------------------------------------------------------------------

import { createHash } from 'crypto';
import { z } from 'zod';
import { securityNotificationTypeSchema } from '@eduagent/schemas';
import { inngest } from '../client';
import { getStepResendApiKey, getStepEmailFrom } from '../helpers';
import {
  formatSecurityNotificationEmail,
  sendEmail,
} from '../../services/notifications';
import { captureException } from '../../services/sentry';
import { createLogger } from '../../services/logger';
import { buildEmailIdempotencyKey } from '../../services/dedupe-key';

const logger = createLogger();

const eventDataSchema = z.object({
  type: securityNotificationTypeSchema,
  to: z.string().email(),
  accountId: z.string().min(1),
  // Null for the server-side email_changed dispatch (no profile context);
  // optional so events emitted before this field existed still parse.
  profileId: z.string().nullable().optional(),
  timestamp: z.string().min(1),
});

export const accountSecurityNotification = inngest.createFunction(
  {
    id: 'account-security-notification',
    name: 'Send account security-change notification email',
    retries: 2,
  },
  { event: 'app/account.security-event' },
  async ({ event, step }) => {
    // safeParse so a malformed payload doesn't throw before the first step and
    // burn the retry budget on a permanently-bad event (same class as the
    // feedback-delivery-failed guard).
    const validated = eventDataSchema.safeParse(event.data);
    if (!validated.success) {
      const issues = validated.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      logger.warn(
        '[account-security-notification] invalid payload — skipping',
        { issues },
      );
      captureException(
        new Error('account-security-notification: invalid event payload'),
        {
          extra: {
            surface: 'account-security-notification',
            reason: 'invalid_payload',
            issues,
          },
        },
      );
      return { status: 'skipped' as const, reason: 'invalid_payload', issues };
    }

    const { type, to, accountId } = validated.data;

    return step.run('send-security-email', async () => {
      const resendApiKey = getStepResendApiKey();
      const emailFrom = getStepEmailFrom();

      // Deterministic idempotency key so step retries (and a same-event replay)
      // cannot double-send. Bound to (accountId, type, event.id-or-payload-hash).
      let idempotencyKey: string;
      if (event.id) {
        idempotencyKey = buildEmailIdempotencyKey(
          'account-security-notification',
          accountId,
          event.id,
          type,
        );
      } else {
        const hash = createHash('sha256')
          .update(JSON.stringify(validated.data))
          .digest('hex')
          .slice(0, 16);
        idempotencyKey = buildEmailIdempotencyKey(
          'account-security-notification',
          'hash',
          hash,
          type,
        );
      }

      const result = await sendEmail(
        formatSecurityNotificationEmail(to, type),
        { resendApiKey, emailFrom, idempotencyKey },
      );

      if (!result.sent) {
        // no_api_key is a configuration state, not a transient failure — do not
        // retry forever on it, but still surface it so it is queryable.
        if (result.reason === 'no_api_key') {
          logger.warn(
            '[account-security-notification] RESEND_API_KEY not configured — email not sent',
            { accountId, type },
          );
          return { ok: false as const, reason: 'no_api_key' as const };
        }
        const err = new Error(
          `account-security-notification send failed: ${
            result.reason ?? 'unknown'
          }`,
        );
        captureException(err, {
          extra: { surface: 'account-security-notification', type, accountId },
        });
        logger.warn('[account-security-notification] send failed — retrying', {
          accountId,
          type,
          reason: result.reason,
        });
        throw err;
      }

      return { ok: true as const, accountId, type };
    });
  },
);
