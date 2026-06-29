// @inngest-admin: cross-profile (reconciles two RevenueCat subscriber identities; no single profile scope)
// ---------------------------------------------------------------------------
// Billing Alias Merge — consumes app/billing.alias_received [BUG-783 / BUG-449]
//
// RevenueCat fires SUBSCRIBER_ALIAS when it merges two subscriber records. When
// the `transferred_from` identity still held an active subscription (the
// revenue-loss scenario), the webhook handler downgrades the from-side row
// synchronously (BUG-833) and dispatches app/billing.alias_received carrying a
// PRE-DOWNGRADE snapshot. This worker is the missing remediation half: it
// reconciles the surviving (transferred_to) identity so the user keeps the
// tier + credits they paid for.
//
// The merge is atomic (single db.transaction) and idempotent (keyed on the
// RevenueCat event id via the shared webhook_idempotency_keys table) — a
// redelivered webhook or a retried run short-circuits as a replay. All of that
// lives in services/billing/alias-merge.ts; this function is the thin Inngest
// wrapper that validates the payload and invokes the service.
// ---------------------------------------------------------------------------

import {
  billingAliasReceivedEventSchema,
  summarizeRawPayload,
} from '@eduagent/schemas';

import { inngest } from '../client';
import { getStepDatabase, isIdentityV2EnabledInStep } from '../helpers';
import { mergeAliasedSubscription } from '../../services/billing/alias-merge';
import { mergeAliasedSubscriptionV2 } from '../../services/billing/billing-v2';
import { createLogger } from '../../services/logger';

const logger = createLogger();

export const billingAliasMerge = inngest.createFunction(
  {
    id: 'billing-alias-merge',
    name: 'Reconcile RevenueCat SUBSCRIBER_ALIAS subscription merge',
    retries: 3,
    // Idempotency at the Inngest layer too — a re-fired event with the same
    // RevenueCat event id collapses to one run. The service's DB-level claim
    // is the hard guarantee; this is belt-and-braces.
    idempotency: 'event.data.eventId',
    // Serialize per RevenueCat event so two deliveries never race the merge.
    concurrency: { key: 'event.data.eventId', limit: 1 },
  },
  { event: 'app/billing.alias_received' },
  async ({ event, step }) => {
    const parsed = billingAliasReceivedEventSchema.safeParse(event.data);
    if (!parsed.success) {
      // Schema drift is a structured error, not a silent drop (billing rule).
      logger.error('billing.alias_received.schema_drift', {
        issues: parsed.error.issues,
        rawData: summarizeRawPayload(event.data),
      });
      return { status: 'schema_error' as const };
    }

    const result = await step.run('merge-aliased-subscription', async () => {
      const db = getStepDatabase();
      // [WI-1057] flag-on routes to the v2 merge twin (reconciles the
      // `subscription` table); flag-off stays on the legacy `subscriptions`
      // path and is byte-identical to today. Same split pattern as
      // quota-reset's resetExpiredQuotaCyclesV2.
      return isIdentityV2EnabledInStep()
        ? mergeAliasedSubscriptionV2(db, parsed.data)
        : mergeAliasedSubscription(db, parsed.data);
    });

    return {
      status: result.status,
      survivorSubscriptionId: result.survivorSubscriptionId ?? null,
      upgraded: result.decision?.upgradeSurvivor ?? false,
      topUpDeltaGranted: result.decision?.topUpDeltaToGrant ?? 0,
    };
  },
);
