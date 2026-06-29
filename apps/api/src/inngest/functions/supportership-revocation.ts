// @inngest-admin: event-profile (supportershipId from event; visibility notice scoped to that supportership)
import {
  supportershipUnlinkedEventSchema,
  summarizeRawPayload,
} from '@eduagent/schemas';

import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { SUPPORTERSHIP_GRACE_DAYS } from '../../services/supportership-revocation';
import { createVisibilityNotice } from '../../services/visibility-moment-projections';
import { createLogger } from '../../services/logger';
import { captureException } from '../../services/sentry';

const logger = createLogger();

export const supportershipRevocation = inngest.createFunction(
  {
    id: 'supportership-revocation',
    name: 'Process supportership unlink notice',
    retries: 3,
    idempotency: 'event.data.supportershipId + "-" + event.data.revokedAt',
    concurrency: { key: 'event.data.supportershipId', limit: 1 },
  },
  { event: 'app/supportership.unlinked' },
  async ({ event, step }) => {
    const parsedResult = supportershipUnlinkedEventSchema.safeParse(event.data);
    if (!parsedResult.success) {
      captureException(
        new Error(
          `supportership-revocation: invalid payload - ${parsedResult.error.message}`,
        ),
        {
          extra: {
            site: 'supportershipRevocation.invalid_payload',
            issues: parsedResult.error.issues,
            rawData: summarizeRawPayload(event.data),
          },
        },
      );
      logger.warn('supportership_revocation.invalid_payload', {
        issues: parsedResult.error.issues,
      });
      return {
        status: 'invalid_payload' as const,
        error: parsedResult.error.message,
      };
    }

    const parsed = parsedResult.data;
    await step.sleep('grace-window', `${SUPPORTERSHIP_GRACE_DAYS}d`);

    await step.run('record-supporter-link-ended-notice', async () => {
      const db = getStepDatabase();
      await createVisibilityNotice(db, {
        supportershipId: parsed.supportershipId,
        contractId: parsed.contractId,
        noticeType: 'support_link_ended',
        targetAudience: 'supporter',
        targetPersonId: parsed.supporterPersonId,
        payload: {
          supporteePersonId: parsed.supporteePersonId,
          revokedAt: parsed.revokedAt,
          graceDays: SUPPORTERSHIP_GRACE_DAYS,
        },
      });
    });

    return {
      status: 'notice_recorded',
      supportershipId: parsed.supportershipId,
    };
  },
);
