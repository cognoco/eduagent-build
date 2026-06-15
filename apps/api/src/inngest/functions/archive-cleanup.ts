import { inngest } from '../client';
import { getStepDatabase, isIdentityV2EnabledInStep } from '../helpers';
import {
  getConsentStatus,
  getProfileForConsentRevocation,
} from '../../services/consent';
import { deleteArchivedProfileIfStillEligible } from '../../services/deletion';
import { resolveLatestConsentStatusAnyBasis } from '../../services/identity-v2/consent-status-v2';
import { getPersonForConsentRevocationV2 } from '../../services/identity-v2/consent-v2';
import { deleteArchivedPersonIfStillEligibleV2 } from '../../services/identity-v2/deletion-v2';
import { resolveOrgIdForPerson } from '../../services/identity-v2/family-v2';

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

      // Cheap early-outs for observability (these read-then-return reasons let
      // the dashboard distinguish WHY a run was a no-op). They do NOT guard the
      // delete on their own — a restoreConsent() landing after these reads but
      // before the delete is the F-122 TOCTOU.

      // [CUT-B2] Dispatch to v2 consent model when flag is enabled.
      if (isIdentityV2EnabledInStep()) {
        const orgId = await resolveOrgIdForPerson(db, profileId);
        if (orgId !== null) {
          const consentStatus = await resolveLatestConsentStatusAnyBasis(
            db,
            profileId,
            orgId,
          );
          if (consentStatus === 'CONSENTED') {
            return { deleted: false, reason: 'consent_restored' };
          }
        }

        const person = await getPersonForConsentRevocationV2(db, profileId);
        if (!person?.archivedAt) {
          return { deleted: false, reason: 'not_archived' };
        }
        if (Date.now() - person.archivedAt.getTime() < ARCHIVE_RETENTION_MS) {
          return { deleted: false, reason: 'retention_window_not_elapsed' };
        }

        const retentionCutoff = new Date(Date.now() - ARCHIVE_RETENTION_MS);
        const deleted = await deleteArchivedPersonIfStillEligibleV2(
          db,
          profileId,
          retentionCutoff,
        );
        return deleted
          ? { deleted: true }
          : { deleted: false, reason: 'consent_restored_or_unarchived' };
      }

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

      // [F-122] The terminal delete is ATOMIC: the eligibility predicate
      // (still archived, past retention, not CONSENTED) is folded into the
      // DELETE's WHERE so a concurrent restoreConsent() between the reads above
      // and this statement cannot lose a restored profile.
      const retentionCutoff = new Date(Date.now() - ARCHIVE_RETENTION_MS);
      const deleted = await deleteArchivedProfileIfStillEligible(
        db,
        profileId,
        retentionCutoff,
      );
      return deleted
        ? { deleted: true }
        : { deleted: false, reason: 'consent_restored_or_unarchived' };
    });

    return { status: 'complete', profileId };
  },
);
