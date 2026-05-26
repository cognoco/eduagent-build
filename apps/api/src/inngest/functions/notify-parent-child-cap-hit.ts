import {
  billingProfileQuotaExhaustedEventSchema,
  type BillingProfileQuotaExhaustedEvent,
} from '@eduagent/schemas';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { recordChildCapNotificationForSubscription } from '../../services/child-cap-notifications';

type ProfileQuotaExhaustedEvent = {
  data: BillingProfileQuotaExhaustedEvent;
};

export const notifyParentChildCapHit = inngest.createFunction(
  { id: 'notify-parent-child-cap-hit', name: 'Notify Parent Child Cap Hit' },
  { event: 'app/billing.profile_quota.exhausted' },
  async ({ event, step }) => {
    const data = billingProfileQuotaExhaustedEventSchema.parse(
      (event as ProfileQuotaExhaustedEvent).data,
    );
    const result = await step.run('record-child-cap-notification', async () => {
      const db = getStepDatabase();
      return recordChildCapNotificationForSubscription(db, {
        subscriptionId: data.subscriptionId,
        childProfileId: data.profileId,
        kind: data.kind,
        resetsAt: data.resetsAt,
        occurredAt: data.occurredAt,
      });
    });

    return { status: 'recorded' as const, inserted: result.inserted };
  },
);
