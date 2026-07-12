// @inngest-admin: event-profile (teenPersonId is the recipient profile.id)
// ---------------------------------------------------------------------------
// [WI-1753] AC-6 — durable self-cancel nudge for a family-join teen.
//
// When an existing teen joins a parent's family (family-join-v2.ts), the teen
// keeps their own ACTIVE store subscription while the parent now pays the family
// seat — a real-money double-charge with NO server-side refund (store-delegated
// billing). The accept path captures the store ref BEFORE tearing down the
// org-of-one subscription and dispatches this event post-commit (WI-885 pattern).
// This handler delivers the nudge to self-cancel over push AND email:
//   - push alone is insufficient — a teen with no push token would get ZERO
//     warning of an ongoing charge, and this is the feature's #1 money risk;
//   - email resolves off `login.email` (one-step lookup by person id) and is the
//     durable channel that survives a missing push token.
//
// Deliberately lighter than payment-failed-observe: there is no billing-alert
// table for this path (WI-1753 schema is strictly additive — no new tables), so
// idempotency rides the Inngest function key, not a persisted row, and there is
// no delivery-outcome recording or escalation fan-out.
// ---------------------------------------------------------------------------

import { eq } from 'drizzle-orm';
import {
  familyJoinStoreCancelNudgeRequestedEventSchema,
  summarizeRawPayload,
} from '@eduagent/schemas';
import { login } from '@eduagent/database';

import { createLogger } from '../../services/logger';
import {
  formatFamilyJoinStoreCancelEmail,
  sendEmail,
  sendPushNotification,
} from '../../services/notifications';
import { inngest } from '../client';
import {
  getStepDatabase,
  getStepEmailFrom,
  getStepResendApiKey,
} from '../helpers';

const logger = createLogger();

export const familyJoinStoreCancelNudge = inngest.createFunction(
  {
    id: 'family-join-store-cancel-nudge',
    name: 'Nudge family-join teen to cancel their store subscription',
    // Belt-and-braces: a single successful accept dispatches exactly once (a
    // repeated accept hits the alreadyMember branch with no store ref). Keying on
    // teen+family still collapses any accidental duplicate dispatch for the same
    // join into one delivery.
    idempotency: 'event.data.teenPersonId + "-" + event.data.familyOrgId',
  },
  { event: 'app/family_join.store_cancel_nudge_requested' },
  async ({ event, step }) => {
    const parsed = familyJoinStoreCancelNudgeRequestedEventSchema.safeParse(
      event.data,
    );
    if (!parsed.success) {
      logger.error('family_join.store_cancel_nudge.schema_drift', {
        issues: parsed.error.issues,
        rawData: summarizeRawPayload(event.data),
      });
      return { status: 'schema_error' as const };
    }

    const { teenPersonId } = parsed.data;

    // Push channel. bypassPreferenceCheck + skipDailyCap: this is a transactional
    // billing/regulatory notice (an ongoing real-money charge the teen must act on),
    // not a reminder — it must always deliver.
    // TODO(WI-1753 operator gate: AC-6 disclosure copy) — placeholder title/body.
    const push = await step.run('send-store-cancel-push', async () => {
      const db = getStepDatabase();
      return sendPushNotification(
        db,
        {
          profileId: teenPersonId,
          title: 'Cancel your old subscription',
          body: "You're on a family plan now — cancel your own MentoMate subscription in the App Store or Google Play to avoid being charged twice.",
          type: 'store_cancel_nudge',
        },
        { skipDailyCap: true, bypassPreferenceCheck: true },
      );
    });

    // Email channel — the durable backstop when there is no push token. Resolve
    // the teen's address off their login row; skip cleanly if absent.
    const email = await step.run('send-store-cancel-email', async () => {
      const db = getStepDatabase();
      const loginRow = await db.query.login.findFirst({
        where: eq(login.personId, teenPersonId),
        columns: { email: true },
      });
      if (!loginRow?.email) {
        return { sent: false, reason: 'no_email' as const };
      }
      return sendEmail(formatFamilyJoinStoreCancelEmail(loginRow.email), {
        db,
        resendApiKey: getStepResendApiKey(),
        emailFrom: getStepEmailFrom(),
        idempotencyKey: `family-join-store-cancel:${teenPersonId}`,
      });
    });

    if (!push.sent && !email.sent) {
      logger.error('family_join.store_cancel_nudge.undelivered', {
        teenPersonId,
        pushReason: push.reason ?? 'unknown',
        emailReason: email.reason ?? 'unknown',
      });
    }

    return { status: 'processed' as const, push, email };
  },
);
