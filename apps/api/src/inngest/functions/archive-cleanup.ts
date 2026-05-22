import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import {
  getConsentStatus,
  getProfileForConsentRevocation,
} from '../../services/consent';
import { deleteProfile } from '../../services/deletion';

const ARCHIVE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export const archiveCleanup = inngest.createFunction(
  {
    id: 'archive-cleanup',
    name: 'Hard-delete archived profile after retention window',
    retries: 5,
    // Idempotency dedupes within 24h so a duplicate `app/profile.archived`
    // event (operator re-fire, step.sendEvent replay after a network blip)
    // cannot start a second 30-day timer and later run deleteProfile twice.
    // concurrency(limit:1) serialises any concurrent runs that slip through
    // before Inngest can deduplicate them.
    idempotency: 'event.data.profileId',
    concurrency: { key: 'event.data.profileId', limit: 1 },
  },
  { event: 'app/profile.archived' },
  async ({ event, step }) => {
    const { profileId } = event.data;

    await step.sleep('archive-window', '30d');

    await step.run('hard-delete-archived-profile', async () => {
      const db = getStepDatabase();

      // Defence-in-depth (C1): if consent was restored after archive was
      // scheduled, bail. The restoreConsent() transaction already cleared
      // archivedAt, so the profile-existence check below would also catch
      // this — but an explicit consent-status guard is clearer and cheaper.
      const consentStatus = await getConsentStatus(db, profileId);
      if (consentStatus === 'CONSENTED') {
        return { deleted: false, reason: 'consent_restored' };
      }

      const profile = await getProfileForConsentRevocation(db, profileId);
      if (!profile?.archivedAt) {
        return { deleted: false, reason: 'not_archived' };
      }
      if (Date.now() - profile.archivedAt.getTime() < ARCHIVE_RETENTION_MS) {
        return { deleted: false, reason: 'retention_window_not_elapsed' };
      }

      await deleteProfile(db, profileId);
      return { deleted: true };
    });

    return { status: 'complete', profileId };
  },
);
