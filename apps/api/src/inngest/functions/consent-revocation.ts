import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { getConsentStatus } from '../../services/consent';
import { deleteProfile } from '../../services/deletion';
import { sendPushNotification } from '../../services/notifications';
import { getRecentNotificationCount } from '../../services/settings';

/**
 * Scheduled consent revocation — 7-day grace period then cascade delete.
 *
 * Mirrors the account-deletion pattern:
 * 1. Sleep 7 days
 * 2. Check if consent was restored (status changed back to CONSENTED)
 * 3. If still WITHDRAWN, delete the child profile (FK cascades handle all data)
 * 4. Notify parent of completion
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

    // Wait 7-day grace period
    await step.sleep('revocation-grace-period', '7d');

    // Check if consent was restored during grace period
    const restored = await step.run('check-restoration', async () => {
      const db = getStepDatabase();
      const status = await getConsentStatus(db, childProfileId);
      return status === 'CONSENTED';
    });

    if (restored) {
      return { status: 'restored', childProfileId };
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
        body: "Your child's data has been permanently deleted as requested.",
        type: 'consent_expired',
      });
      return { sent: true };
    });

    return { status: 'deleted', childProfileId };
  }
);
