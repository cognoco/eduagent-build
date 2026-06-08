import { inngest } from '../client';
import { getStepDatabase, getStepClerkSecretKey } from '../helpers';
import {
  accountExists,
  isDeletionCancelled,
  executeDeletion,
  getAccountClerkUserId,
} from '../../services/deletion';
import { deleteClerkUser } from '../../services/clerk-user';

export const scheduledDeletion = inngest.createFunction(
  {
    id: 'scheduled-account-deletion',
    name: 'Process scheduled account deletion',
    retries: 5,
    // [FIX-INNGEST-2] Idempotency: identical accountId events dedup within 24h
    // so an operator re-fire or network retry cannot start a second 7-day timer
    // and later run executeDeletion twice. concurrency(limit:1) serialises any
    // concurrent executions for the same account that arrive before Inngest
    // can deduplicate them.
    idempotency: 'event.data.accountId',
    concurrency: { key: 'event.data.accountId', limit: 1 },
  },
  { event: 'app/account.deletion-scheduled' },
  async ({ event, step }) => {
    const { accountId } = event.data;

    // Wait 7-day grace period
    await step.sleep('grace-period', '7d');

    // [BUG-844] After a 7-day sleep the account may have been removed by an
    // admin or background GC. isDeletionCancelled and executeDeletion below
    // are both safe in that case (the former returns false, the latter is
    // idempotent), but blindly running them would either re-issue a no-op
    // DELETE or report a misleading 'deleted' status. Surface the
    // already-deleted case as its own terminal status so on-call has clear
    // telemetry for grace-period overruns vs. happy-path completions.
    const exists = await step.run('check-account-exists', async () => {
      const db = getStepDatabase();
      return accountExists(db, accountId);
    });

    if (!exists) {
      return { status: 'already_deleted', accountId };
    }

    // [R1] Capture the Clerk login id BEFORE executeDeletion removes the row,
    // so we can erase the external identity afterwards (GDPR Art 17). Held in
    // its own memoized step so a retry of the Clerk-erasure step below re-uses
    // the captured value rather than reading a now-deleted row.
    const clerkUserId = await step.run('capture-clerk-user-id', async () => {
      const db = getStepDatabase();
      return getAccountClerkUserId(db, accountId);
    });

    // Check if deletion was cancelled
    const cancelled = await step.run('check-cancellation', async () => {
      const db = getStepDatabase();
      return isDeletionCancelled(db, accountId);
    });

    if (cancelled) {
      return { status: 'cancelled' };
    }

    // Permanently delete all data.
    // [Fix Bug #494] executeDeletion now includes an atomic TOCTOU guard:
    // the DELETE carries the same cancellation predicate as isDeletionCancelled(),
    // so a cancel that races with this step cannot delete an account that was
    // just cancelled. The result distinguishes 'deleted', 'cancelled', and
    // 'already_deleted' so telemetry is accurate.
    const deletionResult = await step.run('delete-account-data', async () => {
      const db = getStepDatabase();
      return executeDeletion(db, accountId);
    });

    if (deletionResult === 'cancelled') {
      // Cancellation arrived between the check-cancellation step and the
      // delete step (TOCTOU window now closed by the atomic guard).
      return { status: 'cancelled', accountId };
    }

    // [R1] The DB cascade is done; now erase the external Clerk login identity
    // (email, credentials, OAuth links). Only runs when the account was truly
    // deleted ('deleted'), never on a cancelled run. A throw here (network
    // error, non-404 HTTP error, missing secret) makes Inngest retry the step
    // and ultimately page via Sentry — we never silently leave a login alive.
    // A 404 is idempotent (the user was already gone), so a retry completes.
    if (deletionResult === 'deleted' && clerkUserId) {
      await step.run('delete-clerk-user', async () => {
        return deleteClerkUser({
          userId: clerkUserId,
          clerkSecretKey: getStepClerkSecretKey(),
        });
      });
    }

    return { status: deletionResult, accountId };
  },
);
