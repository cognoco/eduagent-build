// @inngest-admin: parent-chain (profiles updated with explicit childProfileId + archivedAt guard)
import { NonRetriableError } from 'inngest';
import { z } from 'zod';
import { inngest } from '../client';
import { getStepDatabase, isIdentityV2EnabledInStep } from '../helpers';
import { sql } from 'drizzle-orm';
import {
  calculateAge,
  getFamilyOwnerProfileId,
  isConsentRevocationGenerationCurrent,
  getProfileForConsentRevocation,
  getProfileDisplayName,
} from '../../services/consent';
import {
  isConsentRevocationGenerationCurrentV2,
  getPersonForConsentRevocationV2,
  getPersonDisplayNameV2,
  archivePersonOnRevocationV2,
} from '../../services/identity-v2/consent-v2';
import { getFamilyOwnerPersonIdV2 } from '../../services/identity-v2/family-v2';
import { deletePersonIfConsentWithdrawnV2 } from '../../services/identity-v2/deletion-v2';
import { deleteProfileIfConsentWithdrawn } from '../../services/deletion';
import { markAllNudgesRead } from '../../services/nudge';
import { sendPushNotification } from '../../services/notifications';
import {
  getRecentNotificationCount,
  getWithdrawalArchivePreference,
} from '../../services/settings';
import {
  getPendingNoticeChildName,
  recordPendingNotice,
} from '../../services/notices';
import { captureException, captureMessage } from '../../services/sentry';
import { safeSend } from '../../services/safe-non-core';

// [WI-973] Schema for the app/consent.revoked event payload.
// Both childProfileId and revokedAt are required — a missing revokedAt
// would allow the generation guard to vacuously authorize cascade deletion.
const consentRevokedEventSchema = z.object({
  childProfileId: z.string().min(1),
  parentProfileId: z.string().min(1),
  revokedAt: z.string().min(1),
});

/**
 * Scheduled consent revocation — 7-day grace period then cascade delete.
 *
 * Mirrors the account-deletion pattern:
 * 1. Sleep 6 days
 * 2. Warn the parent 24h before closure, if consent is still withdrawn
 * 3. Sleep 1 more day
 * 4. Check if consent was restored (status changed back to CONSENTED)
 * 5. If still WITHDRAWN, delete the child profile (FK cascades handle all data)
 * 6. Notify parent of completion
 */
export const consentRevocation = inngest.createFunction(
  {
    id: 'consent-revocation',
    name: 'Process consent revocation with grace period',
    retries: 5,
    // [FIX-INNGEST-3] Operator re-fires or replay after a 7-day sleep jump must
    // not trigger a second cascade delete. idempotency dedupes within 24h.
    // Include revokedAt so a restore + new withdrawal gets a fresh grace run.
    // concurrency(limit:1) serialises any concurrent runs for the same child.
    idempotency: 'event.data.childProfileId + "-" + event.data.revokedAt',
    concurrency: { key: 'event.data.childProfileId', limit: 1 },
    // [WI-997] GDPR cascade-delete dead-letter handler.
    // Inngest calls onFailure once after all retries are exhausted. Without it,
    // a terminally-failed revocation run (e.g. sustained DB outage after a
    // partial cascade) produces no queryable signal — ops cannot detect a child
    // profile that is still alive past the 7-day grace period.
    // captureMessage (not captureException) is used because onFailure runs
    // outside the original Sentry async context — captureMessage scopes
    // cleanly; captureException would require a live scope.
    // safeSend (not bare inngest.send) because the dead-letter dispatch is
    // non-core: the original run has already terminally failed; a failure of
    // this dispatch must not surface as a second crash.
    onFailure: async ({
      event,
      error,
    }: {
      event: { data: { event?: { data?: unknown }; run_id?: string } };
      error: unknown;
    }) => {
      const originalData = event.data.event?.data as
        | { childProfileId?: string; parentProfileId?: string }
        | undefined;
      const childProfileId = originalData?.childProfileId ?? null;
      const parentProfileId = originalData?.parentProfileId ?? null;

      captureMessage(
        `consent-revocation: all retries exhausted — GDPR cascade delete may not have completed for childProfileId=${childProfileId ?? 'unknown'}`,
        {
          level: 'error',
          extra: {
            surface: 'consent-revocation.terminal_failure',
            childProfileId,
            parentProfileId,
            runId: event.data.run_id ?? null,
            errorName: error instanceof Error ? error.name : typeof error,
            errorMessage:
              error instanceof Error ? error.message : String(error),
            hint: 'Check if the child profile still exists past the 7-day grace window and complete the deletion manually if so.',
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
            name: 'app/consent.revocation.failed',
            data: {
              childProfileId,
              parentProfileId,
              error: error instanceof Error ? error.message : String(error),
              timestamp: new Date().toISOString(),
            },
          }),
        'consent-revocation.terminal_failure',
        { childProfileId, parentProfileId },
      );
    },
  },
  { event: 'app/consent.revoked' },
  async ({ event, step }) => {
    // [WI-973] Validate the event payload before touching any DB state.
    // NonRetriableError prevents Inngest from re-queuing malformed events.
    const parsed = consentRevokedEventSchema.safeParse(event.data);
    if (!parsed.success) {
      throw new NonRetriableError(
        `consent-revocation: invalid event payload — ${parsed.error.message}`,
      );
    }
    const { childProfileId, parentProfileId, revokedAt } = parsed.data;
    const revokedAtDate =
      typeof revokedAt === 'string' ? new Date(revokedAt) : undefined;
    const revocationRespondedAt =
      revokedAtDate && !Number.isNaN(revokedAtDate.getTime())
        ? revokedAtDate
        : undefined;

    // [CUT-B2] Per-call flag dispatch to the v2 (consent_grant / person) or
    // legacy (consent_states / profiles) revocation reads. The flag is read
    // inside each step via isIdentityV2EnabledInStep() (the env binding the
    // Inngest middleware sets per invocation).
    type DB = ReturnType<typeof getStepDatabase>;
    const isRevocationCurrent = (db: DB) =>
      isIdentityV2EnabledInStep()
        ? isConsentRevocationGenerationCurrentV2(
            db,
            childProfileId,
            revocationRespondedAt,
          )
        : isConsentRevocationGenerationCurrent(
            db,
            childProfileId,
            revocationRespondedAt,
          );
    const childDisplayName = (db: DB) =>
      isIdentityV2EnabledInStep()
        ? getPersonDisplayNameV2(db, childProfileId)
        : getProfileDisplayName(db, childProfileId);
    const loadChildForRevocation = (db: DB) =>
      isIdentityV2EnabledInStep()
        ? getPersonForConsentRevocationV2(db, childProfileId)
        : getProfileForConsentRevocation(db, childProfileId);

    // Immediately soft-clear all unread nudges to the child so they don't
    // see stale encouragements during the 7-day grace period.
    await step.run('clear-unread-nudges', async () => {
      const db = getStepDatabase();
      const cleared = await markAllNudgesRead(db, childProfileId);
      return { cleared };
    });

    await step.sleep('warning-mark', '6d');

    await step.run('send-warning-push', async () => {
      const db = getStepDatabase();
      const isCurrentRevocation = await isRevocationCurrent(db);
      if (!isCurrentRevocation) {
        return { sent: false, reason: 'restored' };
      }

      const recentCount = await getRecentNotificationCount(
        db,
        parentProfileId,
        'consent_warning',
        24,
      );
      if (recentCount > 0) {
        return { sent: false, reason: 'dedup_24h' };
      }

      const childName = (await childDisplayName(db)) ?? 'Your child';
      await sendPushNotification(
        db,
        {
          profileId: parentProfileId,
          title: 'Account closing tomorrow',
          body: `${childName}'s account closes tomorrow. You can still reverse.`,
          type: 'consent_warning',
        },
        // [WI-369] GDPR regulatory notice — must always deliver regardless of
        // the recipient's push preference.
        { bypassPreferenceCheck: true },
      );
      return { sent: true };
    });

    await step.sleep('grace-end', '1d');

    // Check if consent was restored during grace period
    const restored = await step.run('check-restoration', async () => {
      const db = getStepDatabase();
      return !(await isRevocationCurrent(db));
    });

    if (restored) {
      return { status: 'restored', childProfileId };
    }

    // Minor-PII discipline: step returns are memoized into Inngest's
    // third-party state store, so this carries an existence marker only —
    // the display name and birth year are rehydrated from the DB inside the
    // steps that consume them.
    const childProfile = await step.run('load-child-profile', async () => {
      const db = getStepDatabase();
      const profile = await loadChildForRevocation(db);
      return profile ? { found: true as const } : null;
    });

    if (!childProfile) {
      return { status: 'already_deleted', childProfileId };
    }

    const archiveDecision = await step.run('choose-final-action', async () => {
      const db = getStepDatabase();
      const ownerProfileId = isIdentityV2EnabledInStep()
        ? await getFamilyOwnerPersonIdV2(db, childProfileId, parentProfileId)
        : await getFamilyOwnerProfileId(db, childProfileId, parentProfileId);
      const preference = await getWithdrawalArchivePreference(
        db,
        ownerProfileId,
      );
      // Rehydrated here instead of riding the load-child-profile step return.
      // A vanished profile (deleted between steps) conservatively routes to
      // the delete branch, where the consent-generation guard no-ops safely.
      const profile = await loadChildForRevocation(db);
      const age = profile ? calculateAge(profile.birthYear) : null;
      return {
        ownerProfileId,
        preference,
        // 'never' = never archive, so it always hard-deletes. With only
        // birthYear granularity, age 13 is treated conservatively as under
        // the COPPA boundary because the birthday may not have happened yet.
        action:
          age === null || age <= 13 || preference === 'never'
            ? ('delete' as const)
            : ('archive' as const),
      };
    });

    if (archiveDecision.action === 'archive') {
      const archiveResult = await step.run(
        'archive-child-profile',
        async () => {
          const db = getStepDatabase();
          const archivedAt = new Date();
          if (isIdentityV2EnabledInStep()) {
            // [CUT-B2] v2 archive: stamp person.archived_at atomically when the
            // current GDPR grant is withdrawn (at the matching timestamp) and
            // the guardian holds an active edge — the guardianship-edge guard
            // replaces the legacy account_id parent-chain guard (BUG-662).
            const archived = await archivePersonOnRevocationV2(
              db,
              childProfileId,
              archiveDecision.ownerProfileId,
              archivedAt,
              revocationRespondedAt,
            );
            return archived
              ? { archived: true }
              : { archived: false, reason: 'consent_restored' };
          }
          const isCurrentRevocation =
            await isConsentRevocationGenerationCurrent(
              db,
              childProfileId,
              revocationRespondedAt,
            );
          if (!isCurrentRevocation) {
            return { archived: false, reason: 'consent_restored' };
          }
          // [BUG-662 / FCR-2026-05-23-L3.L3.3] Defense-in-depth parent-chain
          // guard: in addition to the consent_states scoping inside the CTE,
          // require the child profile's account_id to match the parent's
          // account_id. Without this, a corrupted/replayed Inngest event with
          // mismatched (childProfileId, parentProfileId) — where both happen
          // to share a GDPR-WITHDRAWN consent row — could in principle archive
          // a profile that does not belong to the event's parent account.
          const archiveResult = await db.execute(sql`
            WITH locked_consent AS (
              SELECT 1 FROM consent_states
              WHERE consent_states.profile_id = ${childProfileId}
              AND consent_states.consent_type = 'GDPR'
              AND consent_states.status = 'WITHDRAWN'
              ${revocationRespondedAt ? sql`AND consent_states.responded_at = ${revocationRespondedAt}` : sql``}
              FOR UPDATE
            )
            UPDATE profiles
            SET archived_at = ${archivedAt}
            WHERE id = ${childProfileId}
            AND archived_at IS NULL
            AND account_id = (SELECT account_id FROM profiles WHERE id = ${parentProfileId})
            AND EXISTS (SELECT 1 FROM locked_consent)
          `);
          if ((archiveResult.rowCount ?? 0) === 0) {
            return { archived: false, reason: 'consent_restored' };
          }
          return { archived: true };
        },
      );
      if (
        archiveResult &&
        typeof archiveResult === 'object' &&
        'archived' in archiveResult &&
        archiveResult.archived === false
      ) {
        return { status: 'restored', childProfileId };
      }

      await step.sendEvent('schedule-archive-cleanup', {
        // [CR-026] Deterministic event id so a step.sendEvent replay (network
        // blip, Inngest retry after the 30d sleep) deduplicates at the event
        // layer and never starts a second archive-cleanup run for the same
        // profile. The archive-cleanup function also carries idempotency +
        // concurrency(limit:1) as defence-in-depth.
        id: `archive-cleanup-${childProfileId}`,
        name: 'app/profile.archived',
        data: { profileId: childProfileId, parentProfileId },
      });

      await step.run('notify-parent-archived', async () => {
        const db = getStepDatabase();
        const recentCount = await getRecentNotificationCount(
          db,
          parentProfileId,
          'consent_archived',
          24,
        );
        if (recentCount > 0) {
          return { sent: false, reason: 'dedup_24h' };
        }
        // Rehydrated in-step: the archived profile row still exists.
        const childName = (await childDisplayName(db)) ?? 'Your child';
        await sendPushNotification(
          db,
          {
            profileId: parentProfileId,
            title: 'Account archived',
            body: `${childName}'s account is archived for 30 days, then deleted.`,
            type: 'consent_archived',
          },
          // [WI-369] GDPR regulatory notice — must always deliver regardless of
          // the recipient's push preference.
          { bypassPreferenceCheck: true },
        );
        return { sent: true };
      });

      await step.run('record-parent-archive-notice', async () => {
        const db = getStepDatabase();
        const childName = (await childDisplayName(db)) ?? 'Your child';
        await recordPendingNotice(db, {
          ownerProfileId: archiveDecision.ownerProfileId,
          type: 'consent_archived',
          childName,
        });
      });

      return { status: 'archived', childProfileId };
    }

    // Notify child before deletion (best effort).
    //
    // [BUG-699-FOLLOWUP] 24h notification-log dedup. Step.run memoizes within
    // a single run, but a duplicate `app/consent.revoked` event (operator
    // re-fire, retry past the 7-day sleep) would create a fresh run that
    // would re-push the child without this guard. Once the child profile is
    // deleted the next iteration would also have no pushToken and silently
    // no-op, so dedup is belt-and-suspenders here — but it makes the
    // observability story consistent across cron-driven push paths.
    await step.run('notify-child', async () => {
      const db = getStepDatabase();
      const isCurrentRevocation = await isRevocationCurrent(db);
      if (!isCurrentRevocation) {
        return { sent: false, reason: 'consent_restored' };
      }
      const recentCount = await getRecentNotificationCount(
        db,
        childProfileId,
        'consent_expired',
        24,
      );
      if (recentCount > 0) {
        return { sent: false, reason: 'dedup_24h' };
      }
      await sendPushNotification(
        db,
        {
          profileId: childProfileId,
          title: 'Account deletion',
          body: 'Your account is being deleted as your parent withdrew consent.',
          type: 'consent_expired',
        },
        // [WI-369] GDPR regulatory notice — must always deliver regardless of
        // the recipient's push preference.
        { bypassPreferenceCheck: true },
      );
      return { sent: true };
    });

    // Delete child profile (FK cascades handle all data).
    // [F-093] Pass parentProfileId so deleteProfileIfConsentWithdrawn enforces
    // the parent-chain account guard — same defence-in-depth as the archive
    // branch (BUG-662 / FCR-2026-05-23-L3.L3.3). The ownerProfileId was
    // resolved before deletion in `choose-final-action` and is safe to reuse.
    //
    // The pending delete notice is recorded in this step too: the child name
    // must be captured BEFORE the row is gone, and it must reach later steps
    // without riding memoized Inngest step state. The notice row (first-party
    // DB) is that carrier — this step memoizes only the opaque notice id, and
    // notify-parent rehydrates the name from it.
    //
    // [CR-2026-05-19-H19] Uses the ownerProfileId resolved in
    // `choose-final-action` BEFORE deletion: after the delete, FK ON DELETE
    // CASCADE has removed the child's `family_links` rows, so re-running
    // getFamilyOwnerProfileId would fall back to the event-sender
    // parentProfileId and could land the notice on the wrong account in
    // multi-parent families.
    const deleteResult = await step.run('delete-child-profile', async () => {
      const db = getStepDatabase();
      const childName = (await childDisplayName(db)) ?? 'Your child';
      const deleted = isIdentityV2EnabledInStep()
        ? await deletePersonIfConsentWithdrawnV2(
            db,
            childProfileId,
            revocationRespondedAt,
          )
        : await deleteProfileIfConsentWithdrawn(
            db,
            childProfileId,
            revocationRespondedAt,
            archiveDecision.ownerProfileId,
          );
      if (!deleted) {
        return { deleted: false as const, noticeId: null };
      }
      // The delete has already happened; a notice-insert failure must NOT
      // throw, or the step retry would re-run the (now no-op) delete, read
      // `deleted: false`, and mislabel the run as `restored` — silently
      // dropping the parent's completion push. Escalate and degrade to the
      // name-less fallback copy instead.
      let noticeId: string | null = null;
      try {
        noticeId = await recordPendingNotice(db, {
          ownerProfileId: archiveDecision.ownerProfileId,
          type: 'consent_deleted',
          childName,
        });
      } catch (err) {
        captureException(err, {
          extra: {
            childProfileId,
            ownerProfileId: archiveDecision.ownerProfileId,
            context: 'consent-revocation-delete-notice',
          },
        });
      }
      return { deleted: true as const, noticeId };
    });
    // Tolerate the pre-restructure memoized shape (a bare boolean) for runs
    // that were in flight across the deploy — this function sleeps for days.
    const deleted =
      typeof deleteResult === 'object' && deleteResult !== null
        ? deleteResult.deleted
        : Boolean(deleteResult);
    const deleteNoticeId =
      typeof deleteResult === 'object' && deleteResult !== null
        ? deleteResult.noticeId
        : null;
    if (!deleted) {
      return { status: 'restored', childProfileId };
    }

    // Notify parent of completion. [BUG-699-FOLLOWUP] same 24h dedup as the
    // child-side notify above — duplicate revocation events would otherwise
    // surface "data deleted" twice to the parent.
    await step.run('notify-parent', async () => {
      const db = getStepDatabase();
      const recentCount = await getRecentNotificationCount(
        db,
        parentProfileId,
        'consent_expired',
        24,
      );
      if (recentCount > 0) {
        return { sent: false, reason: 'dedup_24h' };
      }
      // The profile row is gone; rehydrate the name from the pending-notice
      // row recorded in the delete step (opaque-id reference, scoped to the
      // owner resolved before deletion).
      const childName = deleteNoticeId
        ? ((await getPendingNoticeChildName(
            db,
            archiveDecision.ownerProfileId,
            deleteNoticeId,
          )) ?? 'Your child')
        : 'Your child';
      await sendPushNotification(
        db,
        {
          profileId: parentProfileId,
          title: 'Data deleted',
          body: `${childName}'s account has been permanently deleted as requested.`,
          type: 'consent_expired',
        },
        // [WI-369] GDPR regulatory notice — must always deliver regardless of
        // the recipient's push preference.
        { bypassPreferenceCheck: true },
      );
      return { sent: true };
    });

    return { status: 'deleted', childProfileId };
  },
);
