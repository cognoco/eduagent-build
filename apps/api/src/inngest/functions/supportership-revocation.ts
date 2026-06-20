import { supportershipUnlinkedEventSchema } from '@eduagent/schemas';

import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { SUPPORTERSHIP_GRACE_DAYS } from '../../services/supportership-revocation';
import { createVisibilityNotice } from '../../services/visibility-moment-projections';

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
    const parsed = supportershipUnlinkedEventSchema.parse(event.data);
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
