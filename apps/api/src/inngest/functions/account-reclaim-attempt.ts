// @inngest-admin: event-profile (existingClerkUserId from event scopes the accounts query; no profileId)
// ---------------------------------------------------------------------------
// account-reclaim-attempt — [BUG-784]
//
// findOrCreateAccount blocks email-reuse reclaim attempts fail-closed, then
// emits app/account.reclaim_attempt. This handler is the out-of-band recovery
// workflow terminus: notify the existing account owner at their verified email
// and direct them to support, without automatically rewiring ownership to the
// incoming Clerk identity.
// ---------------------------------------------------------------------------

import { createHash } from 'crypto';
import { z } from 'zod';
import { inngest } from '../client';
import {
  closeStepDatabases,
  getStepDatabase,
  getStepEmailFrom,
  getStepResendApiKey,
  getStepSupportEmail,
  runWithStepDatabaseScope,
} from '../helpers';
import {
  formatAccountReclaimAttemptEmail,
  sendEmail,
} from '../../services/notifications';
import { findAccountByClerkId } from '../../services/account';
import { buildEmailIdempotencyKey } from '../../services/dedupe-key';
import { captureException } from '../../services/sentry';
import { createLogger } from '../../services/logger';
import { summarizeRawPayload } from '@eduagent/schemas';

const logger = createLogger();

const reclaimAttemptEventSchema = z.object({
  incomingClerkUserId: z.string().min(1),
  existingClerkUserId: z.string().min(1),
  emailHash: z.string().regex(/^[0-9a-f]{64}$/),
  timestamp: z.string().min(1),
});

export const accountReclaimAttempt = inngest.createFunction(
  {
    id: 'account-reclaim-attempt',
    name: 'Notify original owner about blocked account reclaim attempt',
    retries: 2,
    idempotency: 'event.data.emailHash',
    concurrency: { key: 'event.data.emailHash', limit: 1 },
  },
  { event: 'app/account.reclaim_attempt' },
  async ({ event, step }) =>
    runWithStepDatabaseScope(async () => {
      try {
        const parsed = reclaimAttemptEventSchema.safeParse(event.data);
        if (!parsed.success) {
          const issues = parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          }));
          logger.warn('[account-reclaim-attempt] invalid payload — skipping', {
            issues,
          });
          captureException(
            new Error('account-reclaim-attempt: invalid event payload'),
            {
              extra: {
                surface: 'account-reclaim-attempt.invalid_payload',
                issues,
                rawData: summarizeRawPayload(event.data),
              },
            },
          );
          return {
            status: 'skipped' as const,
            reason: 'invalid_payload' as const,
            issues,
          };
        }

        const data = parsed.data;

        const account = await step.run('lookup-existing-account', async () => {
          const db = getStepDatabase();
          return findAccountByClerkId(db, data.existingClerkUserId);
        });

        if (!account) {
          logger.warn('[account-reclaim-attempt] existing account not found', {
            existingClerkUserIdHash: createHash('sha256')
              .update(data.existingClerkUserId)
              .digest('hex'),
            emailHash: data.emailHash,
          });
          return {
            status: 'skipped' as const,
            reason: 'account_not_found' as const,
          };
        }

        return step.run('send-reclaim-email', async () => {
          const supportEmail = getStepSupportEmail();
          const result = await sendEmail(
            formatAccountReclaimAttemptEmail(account.email, supportEmail),
            {
              resendApiKey: getStepResendApiKey(),
              emailFrom: getStepEmailFrom(),
              idempotencyKey: buildEmailIdempotencyKey(
                'account-reclaim-attempt',
                account.id,
                event.id ?? data.emailHash,
              ),
            },
          );

          if (!result.sent) {
            if (result.reason === 'no_api_key') {
              logger.warn(
                '[account-reclaim-attempt] RESEND_API_KEY not configured — email not sent',
                { accountId: account.id },
              );
              return {
                status: 'not_sent' as const,
                reason: 'no_api_key' as const,
                accountId: account.id,
              };
            }

            const error = new Error(
              `account-reclaim-attempt send failed: ${
                result.reason ?? 'unknown'
              }`,
            );
            captureException(error, {
              extra: {
                surface: 'account-reclaim-attempt',
                accountId: account.id,
                reason: result.reason,
              },
            });
            logger.warn('[account-reclaim-attempt] send failed — retrying', {
              accountId: account.id,
              reason: result.reason,
            });
            throw error;
          }

          return {
            status: 'sent' as const,
            accountId: account.id,
          };
        });
      } finally {
        await closeStepDatabases();
      }
    }),
);
