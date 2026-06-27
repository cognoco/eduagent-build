/**
 * Email-parent consent revocation — 7-day grace → hard-delete.
 *
 * This is the **edge-free** variant of the managed-child grace→delete cascade.
 * The existing `consentRevocation` function (`consent-revocation.ts`) cannot be
 * reused here because it (a) requires `parentProfileId` in its event schema,
 * (b) runs an archive branch gated by `archivePersonOnRevocationV2` →
 * `isGuardianOf(ownerProfileId, child)` (which fails — there is no guardianship
 * edge for the email-parent), and (c) pushes warnings/completions to a parent
 * person that does not exist. This function is intentionally isolated so there
 * is zero regression risk to the live managed-child cascade.
 *
 * Spec: docs/specs/2026-06-26-p0-email-consent-withdrawal-design.md §5.4
 */
import { NonRetriableError } from 'inngest';
import { z } from 'zod';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import {
  isConsentRevocationGenerationCurrentV2,
  getPersonDisplayNameV2,
} from '../../services/identity-v2/consent-v2';
import { deletePersonIfConsentWithdrawnV2 } from '../../services/identity-v2/deletion-v2';
import { markAllNudgesRead } from '../../services/nudge';
import { sendPushNotification } from '../../services/notifications';
import { getRecentNotificationCount } from '../../services/settings';
import { captureMessage } from '../../services/sentry';
import { safeSend } from '../../services/safe-non-core';

// Schema for the app/consent.email-revoked event payload.
// Both chargePersonId and revokedAt are required — a missing revokedAt
// would allow the generation guard to vacuously authorize cascade deletion.
// revokedAt must be a valid ISO-8601 datetime: a non-ISO string (e.g. "bad")
// parses to an Invalid Date, which would null out revocationRespondedAt and
// make the generation guard vacuously report "restored" — silently aborting
// the GDPR cascade delete. Rejecting at the schema boundary makes that a
// NonRetriableError instead of a silent data-integrity failure.
const consentEmailRevokedEventSchema = z.object({
  chargePersonId: z.string().min(1),
  revokedAt: z.string().datetime(),
});

export const consentEmailRevocation = inngest.createFunction(
  {
    id: 'consent-email-revocation',
    name: 'Process email-parent consent revocation with grace period',
    retries: 5,
    // Operator re-fires or replay after a 7-day sleep jump must not trigger a
    // second cascade delete. idempotency dedupes within 24h. Include revokedAt
    // so a restore + new withdrawal gets a fresh grace run.
    // concurrency(limit:1) serialises any concurrent runs for the same charge.
    idempotency: 'event.data.chargePersonId + "-" + event.data.revokedAt',
    concurrency: { key: 'event.data.chargePersonId', limit: 1 },
    // GDPR cascade-delete dead-letter handler. Inngest calls onFailure once after
    // all retries are exhausted. Without it, a terminally-failed revocation run
    // (e.g. sustained DB outage after a partial cascade) produces no queryable
    // signal — ops cannot detect a person that is still alive past the 7-day
    // grace period.
    // captureMessage (not captureException) is used because onFailure runs
    // outside the original Sentry async context — captureMessage scopes cleanly.
    // safeSend (not bare inngest.send) because the dead-letter dispatch is
    // non-core: the original run has already terminally failed; a failure of this
    // dispatch must not surface as a second crash.
    onFailure: async ({
      event,
      error,
    }: {
      event: { data: { event?: { data?: unknown }; run_id?: string } };
      error: unknown;
    }) => {
      const originalData = event.data.event?.data as
        | { chargePersonId?: string }
        | undefined;
      const chargePersonId = originalData?.chargePersonId ?? null;

      captureMessage(
        `consent-email-revocation: all retries exhausted — GDPR cascade delete may not have completed for chargePersonId=${chargePersonId ?? 'unknown'}`,
        {
          level: 'error',
          extra: {
            surface: 'consent-email-revocation.terminal_failure',
            chargePersonId,
            runId: event.data.run_id ?? null,
            errorName: error instanceof Error ? error.name : typeof error,
            errorMessage:
              error instanceof Error ? error.message : String(error),
            hint: 'Check if the person still exists past the 7-day grace window and complete the deletion manually if so.',
          },
        },
      );

      await safeSend(
        () =>
          inngest.send({
            // orphan-allow: observability-only dead-letter signal (no handler
            // needed); consumed out-of-band by ops alerting and queryable via
            // the Inngest dashboard. Paired with the explicit captureMessage
            // (above) which carries the escalation signal.
            name: 'app/consent.email-revocation.failed',
            data: {
              chargePersonId,
              error: error instanceof Error ? error.message : String(error),
              timestamp: new Date().toISOString(),
            },
          }),
        'consent-email-revocation.terminal_failure',
        { chargePersonId },
      );
    },
  },
  { event: 'app/consent.email-revoked' },
  async ({ event, step }) => {
    // Validate the event payload before touching any DB state.
    // NonRetriableError prevents Inngest from re-queuing malformed events.
    const parsed = consentEmailRevokedEventSchema.safeParse(event.data);
    if (!parsed.success) {
      throw new NonRetriableError(
        `consent-email-revocation: invalid event payload — ${parsed.error.message}`,
      );
    }
    const { chargePersonId, revokedAt } = parsed.data;
    // revokedAt is schema-validated as ISO-8601 above, so new Date() is always
    // a valid Date here — no NaN guard needed.
    const revocationRespondedAt = new Date(revokedAt);

    // This path is identity-v2 ONLY — no legacy/v1 branch. The email-parent
    // consent flow only exists in the v2 (consent_grants / persons) world.

    // Immediately soft-clear all unread nudges to the child so they don't
    // see stale encouragements during the 7-day grace period.
    await step.run('clear-unread-nudges', async () => {
      const db = getStepDatabase();
      const cleared = await markAllNudgesRead(db, chargePersonId);
      return { cleared };
    });

    await step.sleep('warning-mark', '6d');

    await step.run('send-warning-push', async () => {
      const db = getStepDatabase();
      const isCurrent = await isConsentRevocationGenerationCurrentV2(
        db,
        chargePersonId,
        revocationRespondedAt,
      );
      if (!isCurrent) {
        return { sent: false, reason: 'restored' };
      }

      // 24h dedup keyed on the child (no parent person exists).
      const recentCount = await getRecentNotificationCount(
        db,
        chargePersonId,
        'consent_warning',
        24,
      );
      if (recentCount > 0) {
        return { sent: false, reason: 'dedup_24h' };
      }

      const childName =
        (await getPersonDisplayNameV2(db, chargePersonId)) ?? 'Your child';
      await sendPushNotification(
        db,
        {
          profileId: chargePersonId,
          title: 'Account closing tomorrow',
          body: `Your parent withdrew consent — your account closes tomorrow. It can still be restored.`,
          type: 'consent_warning',
        },
        { bypassPreferenceCheck: true },
      );
      // childName is used only for log context; it is NOT memoized into Inngest
      // step state (the return value is opaque).
      return { sent: true, _hint: childName.length > 0 ? 'named' : 'fallback' };
    });

    await step.sleep('grace-end', '1d');

    // Check if consent was restored during grace period.
    const restored = await step.run('check-restoration', async () => {
      const db = getStepDatabase();
      return !(await isConsentRevocationGenerationCurrentV2(
        db,
        chargePersonId,
        revocationRespondedAt,
      ));
    });

    if (restored) {
      return { status: 'restored', chargePersonId };
    }

    // Notify child before deletion (best effort).
    // 24h dedup: a duplicate `app/consent.email-revoked` event (operator
    // re-fire, retry past the 7-day sleep) would create a fresh run that
    // would re-push the child without this guard.
    await step.run('notify-child', async () => {
      const db = getStepDatabase();
      const isCurrentRevocation = await isConsentRevocationGenerationCurrentV2(
        db,
        chargePersonId,
        revocationRespondedAt,
      );
      if (!isCurrentRevocation) {
        return { sent: false, reason: 'consent_restored' };
      }
      const recentCount = await getRecentNotificationCount(
        db,
        chargePersonId,
        'consent_expired',
        24,
      );
      if (recentCount > 0) {
        return { sent: false, reason: 'dedup_24h' };
      }
      await sendPushNotification(
        db,
        {
          profileId: chargePersonId,
          title: 'Account deletion',
          body: 'Your account is being deleted as your parent withdrew consent.',
          type: 'consent_expired',
        },
        { bypassPreferenceCheck: true },
      );
      return { sent: true };
    });

    // Delete the charge person. Edge-free 3-arg overload: keys on the
    // withdrawn grant + timestamp; no guardianship edge required.
    // FK cascades remove all associated data.
    // No archive branch: the email-parent restores via the undo link within
    // grace, and after grace there is no in-app parent to archive for.
    const deleted = await step.run('delete-charge-person', async () => {
      const db = getStepDatabase();
      return deletePersonIfConsentWithdrawnV2(
        db,
        chargePersonId,
        revocationRespondedAt,
      );
    });

    if (!deleted) {
      return { status: 'restored', chargePersonId };
    }

    return { status: 'deleted', chargePersonId };
  },
);
