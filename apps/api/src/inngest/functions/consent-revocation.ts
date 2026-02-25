import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { getConsentStatus } from '../../services/consent';
import { deleteProfile } from '../../services/deletion';
import { sendPushNotification } from '../../services/notifications';

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

    // Notify child before deletion (best effort)
    await step.run('notify-child', async () => {
      const db = getStepDatabase();
      await sendPushNotification(db, {
        profileId: childProfileId,
        title: 'Account deletion',
        body: 'Your account is being deleted as your parent withdrew consent.',
        type: 'consent_expired',
      });
    });

    // Delete child profile (FK cascades handle all data)
    await step.run('delete-child-profile', async () => {
      const db = getStepDatabase();
      await deleteProfile(db, childProfileId);
    });

    // Notify parent of completion
    await step.run('notify-parent', async () => {
      const db = getStepDatabase();
      await sendPushNotification(db, {
        profileId: parentProfileId,
        title: 'Data deleted',
        body: "Your child's data has been permanently deleted as requested.",
        type: 'consent_expired',
      });
    });

    return { status: 'deleted', childProfileId };
  }
);
