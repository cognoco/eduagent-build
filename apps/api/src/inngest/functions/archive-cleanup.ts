// @inngest-admin: event-profile (profileId from event; consent check + hard delete scoped by that profileId)
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import {
  attemptArchivedPersonErasureV2,
  getPersonErasureSnapshotV2,
} from '../../services/identity-v2/deletion-v2';
import { captureMessage } from '../../services/sentry';
import { safeSend } from '../../services/safe-non-core';
import {
  completePersonErasureExternalWork,
  runStablePersonErasure,
} from './person-erasure-steps';

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
    onFailure: async ({ event, error }) => {
      const profileId = (
        event.data.event?.data as { profileId?: string } | undefined
      )?.profileId;
      captureMessage(
        'archive-cleanup: all retries exhausted during person erasure',
        {
          level: 'error',
          extra: {
            surface: 'archive-cleanup.terminal_failure',
            profileId: profileId ?? null,
            runId: event.data.run_id ?? null,
            errorClass: error instanceof Error ? 'error' : 'non_error',
          },
        },
      );
      await safeSend(
        () =>
          inngest.send({
            // orphan-allow: observability-only erasure dead-letter signal.
            name: 'app/profile.archive_cleanup.failed',
            data: {
              profileId: profileId ?? null,
              runId: event.data.run_id ?? null,
              errorClass: error instanceof Error ? 'error' : 'non_error',
              timestamp: new Date().toISOString(),
            },
          }),
        'archive-cleanup.terminal_failure',
        { profileId: profileId ?? null },
      );
    },
  },
  { event: 'app/profile.archived' },
  async ({ event, step }) => {
    const { profileId } = event.data;

    await step.sleep('archive-window', '30d');

    const deletionResult = await runStablePersonErasure({
      step,
      stepPrefix: 'archive-person-erasure',
      capture: () => getPersonErasureSnapshotV2(getStepDatabase(), profileId),
      erase: (snapshot) =>
        attemptArchivedPersonErasureV2(
          getStepDatabase(),
          profileId,
          snapshot,
          new Date(Date.now() - ARCHIVE_RETENTION_MS),
        ),
    });
    if (deletionResult.status === 'admin_transfer_required') {
      return {
        status: 'reroute_required',
        reason: 'admin_transfer_required',
        profileId,
      };
    }
    await completePersonErasureExternalWork({
      step,
      stepPrefix: 'archive-person-erasure',
      result: deletionResult,
    });

    return { status: deletionResult.status, profileId };
  },
);
