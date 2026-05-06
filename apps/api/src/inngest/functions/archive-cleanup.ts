import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { getProfileForConsentRevocation } from '../../services/consent';
import { deleteProfile } from '../../services/deletion';

export const archiveCleanup = inngest.createFunction(
  {
    id: 'archive-cleanup',
    name: 'Hard-delete archived profile after retention window',
    retries: 5,
    concurrency: { key: 'event.data.profileId', limit: 1 },
  },
  { event: 'app/profile.archived' },
  async ({ event, step }) => {
    const { profileId } = event.data;

    await step.sleep('archive-window', '30d');

    await step.run('hard-delete-archived-profile', async () => {
      const db = getStepDatabase();
      const profile = await getProfileForConsentRevocation(db, profileId);
      if (!profile?.archivedAt) {
        return { deleted: false, reason: 'not_archived' };
      }

      await deleteProfile(db, profileId);
      return { deleted: true };
    });

    return { status: 'complete', profileId };
  }
);
