// @inngest-admin: event-profile (accountId from event; all deletion DB ops scoped to that account)
import { inngest } from '../client';
import { getStepDatabase, getStepClerkSecretKey } from '../helpers';
import {
  accountExists,
  isDeletionCancelled,
  executeDeletion,
  getAccountClerkUserId,
} from '../../services/deletion';
import {
  organizationExistsV2,
  isDeletionCancelledV2,
  executeDeletionV2,
  getOrganizationOwnerClerkUserIdV2,
  getOrganizationOwnerEmailV2,
  getSubscriptionStoreTeardownTargetsV2,
} from '../../services/identity-v2/deletion-v2';
import { deleteClerkUser } from '../../services/clerk-user';
import { createLogger } from '../../services/logger';
import { captureException } from '../../services/sentry';

const logger = createLogger();

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
    // [INNGEST-DELETION-ONFAILURE] GDPR Art 17 erasure-completeness guard.
    // Inngest calls onFailure once, after all `retries` are exhausted. Without
    // it, a terminally-failed run (sustained Clerk outage, persistent non-404
    // 5xx, missing CLERK_SECRET_KEY) can leave the DB cascade complete but the
    // external Clerk login identity (email/credentials/OAuth) alive, with no
    // queryable, GDPR-relevant terminal signal — only a generic dashboard
    // failure. This handler escalates to Sentry with a dedicated surface tag so
    // ops can query "how many erasures terminally failed?" and recover the
    // half-completed deletion manually. Mirrors the terminal-failure handlers on
    // auto-file-session.ts and topic-probe-extract.ts.
    onFailure: async ({
      event,
      error,
    }: {
      event: { data: { event?: { data?: unknown }; run_id?: string } };
      error: unknown;
    }) => {
      const accountId =
        (event.data.event?.data as { accountId?: string } | undefined)
          ?.accountId ?? null;

      logger.error('account_deletion.terminal_failure', {
        event: 'account_deletion.terminal_failure',
        accountId,
        runId: event.data.run_id ?? null,
        reason: 'handler_retries_exhausted',
        errorName: error instanceof Error ? error.name : typeof error,
      });

      captureException(
        error instanceof Error
          ? error
          : new Error(
              `scheduled-account-deletion: all retries exhausted${
                accountId ? ` for account ${accountId}` : ''
              }`,
            ),
        {
          extra: {
            surface: 'account-deletion.terminal_failure',
            accountId,
            runId: event.data.run_id ?? null,
            hint: 'DB cascade may have completed while external erasure work survives (Clerk login identity and/or subscription provider teardown) — GDPR Art 17 erasure half-completed. Inspect the Inngest run to determine which step failed and finish the erasure manually.',
          },
        },
      );

      return { status: 'terminal_failure', accountId };
    },
  },
  { event: 'app/account.deletion-scheduled' },
  async ({ event, step }) => {
    const { accountId } = event.data;

    // [CUT-B2] Identity mode is PINNED at schedule time, not re-read here. The
    // schedule handler (POST /account/delete) wrote the deletion stamp into the
    // v1 (accounts) or v2 (organization) store and stamped the matching
    // `identityVersion` onto this event. Reading the live flag at execution
    // time would let a mid-grace-period flip (cutover or rollback) route every
    // step below at the WRONG store: the resume would miss the active-deletion
    // stamp and return cancelled/already_deleted WITHOUT erasing — a silently
    // skipped GDPR/COPPA deletion. We therefore branch on the pinned version
    // for EVERY step. Fallback to the live flag only when the field is absent
    // (an in-flight event dispatched before this field existed).
    const identityVersion = (event.data as { identityVersion?: 'v1' | 'v2' })
      .identityVersion;
    const useV2 =
      identityVersion === 'v2' ? true : identityVersion === 'v1' ? false : true; // flag always-on post-cutover; absent-field events drain as v2

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
      if (useV2) {
        return organizationExistsV2(db, accountId);
      }
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
      if (useV2) {
        return getOrganizationOwnerClerkUserIdV2(db, accountId);
      }
      return getAccountClerkUserId(db, accountId);
    });

    // [CUT-B2] v2 also pre-reads the owner email for the byok_waitlist erase
    // (D2 GDPR Art-17 leg in executeDeletionV2). Captured separately so the
    // value survives the person cascade and a retry of delete-account-data
    // re-uses the memoized value. Null when no login exists (pre-graph edge
    // case) — executeDeletionV2 handles null ownerEmail as a no-op on that leg.
    const ownerEmail = await step.run('capture-owner-email', async () => {
      // v1 has no owner-email pre-read leg — short-circuit before acquiring a
      // DB connection so a legacy deletion does not open one needlessly.
      if (!useV2) {
        return null;
      }
      const db = getStepDatabase();
      return getOrganizationOwnerEmailV2(db, accountId);
    });

    // Check if deletion was cancelled
    const cancelled = await step.run('check-cancellation', async () => {
      const db = getStepDatabase();
      if (useV2) {
        return isDeletionCancelledV2(db, accountId);
      }
      return isDeletionCancelled(db, accountId);
    });

    if (cancelled) {
      return { status: 'cancelled' };
    }

    // [WI-885] Capture store provider teardown targets BEFORE executeDeletionV2
    // removes the subscription rows. The captured identifiers are then used
    // after the DB erasure commits to emit a durable teardown event. This keeps
    // provider work out of the DB transaction and avoids a lost-ID retry hole if
    // dispatch fails after the subscription rows are gone.
    const subscriptionStoreTeardownTargets = await step.run(
      'capture-subscription-store-teardown-targets',
      async () => {
        if (!useV2) {
          return [];
        }
        const db = getStepDatabase();
        return getSubscriptionStoreTeardownTargetsV2(db, accountId);
      },
    );

    // Permanently delete all data.
    // [Fix Bug #494] executeDeletion now includes an atomic TOCTOU guard:
    // the DELETE carries the same cancellation predicate as isDeletionCancelled(),
    // so a cancel that races with this step cannot delete an account that was
    // just cancelled. The result distinguishes 'deleted', 'cancelled', and
    // 'already_deleted' so telemetry is accurate.
    const deletionResult = await step.run('delete-account-data', async () => {
      const db = getStepDatabase();
      if (useV2) {
        return executeDeletionV2(db, {
          organizationId: accountId,
          ownerEmail,
          reason: 'user_initiated',
          deletedBy: null,
        });
      }
      return executeDeletion(db, accountId);
    });

    if (deletionResult === 'cancelled') {
      // Cancellation arrived between the check-cancellation step and the
      // delete step (TOCTOU window now closed by the atomic guard).
      return { status: 'cancelled', accountId };
    }

    if (
      deletionResult === 'deleted' &&
      useV2 &&
      subscriptionStoreTeardownTargets.length > 0
    ) {
      await step.sendEvent('request-subscription-store-teardown', {
        name: 'app/billing.subscription_store_teardown_requested',
        data: {
          accountId,
          identityVersion: 'v2',
          reason: 'whole_org_erasure',
          requestedAt: new Date().toISOString(),
          subscriptions: subscriptionStoreTeardownTargets,
        },
      });
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
