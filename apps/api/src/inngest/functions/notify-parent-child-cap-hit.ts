// @inngest-admin: event-profile (childProfileId + subscriptionId from event; cap notification scoped to those)
import {
  billingProfileQuotaExhaustedEventSchema,
  type BillingProfileQuotaExhaustedEvent,
} from '@eduagent/schemas';
import { inngest } from '../client';
import { getStepDatabase, isIdentityV2EnabledInStep } from '../helpers';
import { recordChildCapNotificationForSubscription } from '../../services/child-cap-notifications';
// [CUT-B3 / WI-693] v2 owner/child resolution (person × membership) selected by
// the cutover flag. Legacy (flag-off) is byte-identical.
import { recordChildCapNotificationForSubscriptionV2 } from '../../services/billing/billing-v2';

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
      const payload = {
        subscriptionId: data.subscriptionId,
        childProfileId: data.profileId,
        kind: data.kind,
        resetsAt: data.resetsAt,
        occurredAt: data.occurredAt,
      };
      return isIdentityV2EnabledInStep()
        ? recordChildCapNotificationForSubscriptionV2(db, payload)
        : recordChildCapNotificationForSubscription(db, payload);
    });

    return { status: 'recorded' as const, inserted: result.inserted };
  },
);
