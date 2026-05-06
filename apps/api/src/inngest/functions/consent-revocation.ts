import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { and, eq, isNull } from 'drizzle-orm';
import { profiles } from '@eduagent/database';
import {
  calculateAge,
  getFamilyOwnerProfileId,
  getConsentStatus,
  getProfileForConsentRevocation,
  getProfileDisplayName,
} from '../../services/consent';
import { deleteProfile } from '../../services/deletion';
import { sendPushNotification } from '../../services/notifications';
import {
  getRecentNotificationCount,
  getWithdrawalArchivePreference,
} from '../../services/settings';
import { recordPendingNotice } from '../../services/notices';

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
    // not trigger a second cascade delete. idempotency dedupes within 24h;
    // concurrency(limit:1) serialises any concurrent runs for the same child.
    idempotency: 'event.data.childProfileId',
    concurrency: { key: 'event.data.childProfileId', limit: 1 },
  },
  { event: 'app/consent.revoked' },
  async ({ event, step }) => {
    const { childProfileId, parentProfileId } = event.data;

    await step.sleep('warning-mark', '6d');

    await step.run('send-warning-push', async () => {
      const db = getStepDatabase();
      const status = await getConsentStatus(db, childProfileId);
      if (status !== 'WITHDRAWN') {
        return { sent: false, reason: 'restored' };
      }

      const recentCount = await getRecentNotificationCount(
        db,
        parentProfileId,
        'consent_warning',
        24
      );
      if (recentCount > 0) {
        return { sent: false, reason: 'dedup_24h' };
      }

      const childName =
        (await getProfileDisplayName(db, childProfileId)) ?? 'Your child';
      await sendPushNotification(db, {
        profileId: parentProfileId,
        title: 'Account closing tomorrow',
        body: `${childName}'s account closes tomorrow. You can still reverse.`,
        type: 'consent_warning',
      });
      return { sent: true };
    });

    await step.sleep('grace-end', '1d');

    // Check if consent was restored during grace period
    const restored = await step.run('check-restoration', async () => {
      const db = getStepDatabase();
      const status = await getConsentStatus(db, childProfileId);
      return status === 'CONSENTED';
    });

    if (restored) {
      return { status: 'restored', childProfileId };
    }

    const childProfile = await step.run('load-child-profile', async () => {
      const db = getStepDatabase();
      return getProfileForConsentRevocation(db, childProfileId);
    });

    if (!childProfile) {
      return { status: 'already_deleted', childProfileId };
    }

    const archiveDecision = await step.run('choose-final-action', async () => {
      const db = getStepDatabase();
      const ownerProfileId = await getFamilyOwnerProfileId(
        db,
        childProfileId,
        parentProfileId
      );
      const preference = await getWithdrawalArchivePreference(
        db,
        ownerProfileId
      );
      const age = calculateAge(childProfile.birthYear);
      return {
        ownerProfileId,
        preference,
        // 'never' = never archive, so it always hard-deletes. With only
        // birthYear granularity, age 13 is treated conservatively as under
        // the COPPA boundary because the birthday may not have happened yet.
        action:
          age <= 13 || preference === 'never'
            ? ('delete' as const)
            : ('archive' as const),
      };
    });

    if (archiveDecision.action === 'archive') {
      const archiveResult = await step.run(
        'archive-child-profile',
        async () => {
          const db = getStepDatabase();
          const status = await getConsentStatus(db, childProfileId);
          if (status !== 'WITHDRAWN') {
            return { archived: false, reason: 'consent_restored' };
          }
          await db
            .update(profiles)
            .set({ archivedAt: new Date() })
            .where(
              and(eq(profiles.id, childProfileId), isNull(profiles.archivedAt))
            );
          return { archived: true };
        }
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
        name: 'app/profile.archived',
        data: { profileId: childProfileId, parentProfileId },
      });

      await step.run('notify-parent-archived', async () => {
        const db = getStepDatabase();
        const recentCount = await getRecentNotificationCount(
          db,
          parentProfileId,
          'consent_archived',
          24
        );
        if (recentCount > 0) {
          return { sent: false, reason: 'dedup_24h' };
        }
        await sendPushNotification(db, {
          profileId: parentProfileId,
          title: 'Account archived',
          body: `${childProfile.displayName}'s account is archived for 30 days, then deleted.`,
          type: 'consent_archived',
        });
        return { sent: true };
      });

      await step.run('record-parent-archive-notice', async () => {
        const db = getStepDatabase();
        await recordPendingNotice(db, {
          ownerProfileId: archiveDecision.ownerProfileId,
          type: 'consent_archived',
          childName: childProfile.displayName,
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
      const recentCount = await getRecentNotificationCount(
        db,
        childProfileId,
        'consent_expired',
        24
      );
      if (recentCount > 0) {
        return { sent: false, reason: 'dedup_24h' };
      }
      await sendPushNotification(db, {
        profileId: childProfileId,
        title: 'Account deletion',
        body: 'Your account is being deleted as your parent withdrew consent.',
        type: 'consent_expired',
      });
      return { sent: true };
    });

    // Delete child profile (FK cascades handle all data)
    await step.run('delete-child-profile', async () => {
      const db = getStepDatabase();
      await deleteProfile(db, childProfileId);
    });

    // Notify parent of completion. [BUG-699-FOLLOWUP] same 24h dedup as the
    // child-side notify above — duplicate revocation events would otherwise
    // surface "data deleted" twice to the parent.
    await step.run('notify-parent', async () => {
      const db = getStepDatabase();
      const recentCount = await getRecentNotificationCount(
        db,
        parentProfileId,
        'consent_expired',
        24
      );
      if (recentCount > 0) {
        return { sent: false, reason: 'dedup_24h' };
      }
      await sendPushNotification(db, {
        profileId: parentProfileId,
        title: 'Data deleted',
        body: `${childProfile.displayName}'s account has been permanently deleted as requested.`,
        type: 'consent_expired',
      });
      return { sent: true };
    });

    await step.run('record-parent-delete-notice', async () => {
      const db = getStepDatabase();
      const ownerProfileId = await getFamilyOwnerProfileId(
        db,
        childProfileId,
        parentProfileId
      );
      await recordPendingNotice(db, {
        ownerProfileId,
        type: 'consent_deleted',
        childName: childProfile.displayName,
      });
    });

    return { status: 'deleted', childProfileId };
  }
);
