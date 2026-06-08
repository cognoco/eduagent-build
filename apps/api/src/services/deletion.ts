// ---------------------------------------------------------------------------
// Account Deletion Service — Story 0.6
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { and, eq, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { accounts, profiles, type Database } from '@eduagent/database';
import type { AccountDeletionStatusResponse } from '@eduagent/schemas';
import { ConflictError, NotFoundError } from '../errors';
import { captureException } from './sentry';

const GRACE_PERIOD_DAYS = 7;
const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

export async function scheduleDeletion(
  db: Database,
  accountId: string,
): Promise<{ gracePeriodEnds: string; scheduledNow: boolean }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const scheduledAt = await tryScheduleDeletion(db, accountId);
    if (scheduledAt) {
      return {
        gracePeriodEnds: new Date(
          scheduledAt.getTime() + GRACE_PERIOD_MS,
        ).toISOString(),
        scheduledNow: true,
      };
    }

    // [CR-2026-05-21-100] If the account row disappears between the failed
    // tryScheduleDeletion update (0 rows) and this status read — e.g. a
    // concurrent GC or admin delete — getDeletionStatus throws NotFoundError.
    // From the requesting user's perspective the account is gone, which is
    // exactly what they asked for. Treat it as a successful scheduling so
    // the caller receives a sensible response instead of a raw 404.
    let existing: Awaited<ReturnType<typeof getDeletionStatus>>;
    try {
      existing = await getDeletionStatus(db, accountId);
    } catch (e) {
      if (e instanceof NotFoundError) {
        const gracePeriodEnds = new Date(
          Date.now() + GRACE_PERIOD_MS,
        ).toISOString();
        return { gracePeriodEnds, scheduledNow: false };
      }
      throw e;
    }
    if (existing.scheduled && existing.gracePeriodEnds) {
      return { gracePeriodEnds: existing.gracePeriodEnds, scheduledNow: false };
    }
  }

  const error = new ConflictError('Account deletion scheduling conflict');
  captureException(error, {
    extra: {
      surface: 'account.deletion',
      reason: 'schedule-retry-exhausted',
      accountId,
    },
  });
  throw error;
}

async function tryScheduleDeletion(
  db: Database,
  accountId: string,
): Promise<Date | null> {
  const scheduledAt = new Date();
  const [updated] = await db
    .update(accounts)
    .set({ deletionScheduledAt: scheduledAt })
    .where(
      and(
        eq(accounts.id, accountId),
        or(
          isNull(accounts.deletionScheduledAt),
          sql`${accounts.deletionCancelledAt} > ${accounts.deletionScheduledAt}`,
        ),
      ),
    )
    .returning({ deletionScheduledAt: accounts.deletionScheduledAt });

  return updated?.deletionScheduledAt ?? null;
}

export type CancelDeletionResult = 'cancelled' | 'no_active_deletion';

/**
 * Cancels a pending account deletion.
 *
 * [BUG-412] Previously performed an unconditional UPDATE with no predicate
 * on deletionScheduledAt, meaning it silently "succeeded" even when no
 * deletion was active. This masked bugs at the route layer (always 200) and
 * allowed duplicate cancel calls to go undetected.
 *
 * Fix: WHERE predicate now requires:
 *   - deletionScheduledAt IS NOT NULL   (a deletion was ever scheduled)
 *   - deletionCancelledAt IS NULL       (not yet cancelled)
 *     OR deletionCancelledAt <= deletionScheduledAt  (last cancel pre-dates
 *        the current schedule, i.e. it was overridden by a re-schedule)
 *
 * Returns 'cancelled' when a row was updated, 'no_active_deletion' otherwise.
 */
export async function cancelDeletion(
  db: Database,
  accountId: string,
): Promise<CancelDeletionResult> {
  const rows = await db
    .update(accounts)
    .set({ deletionCancelledAt: new Date() })
    .where(
      and(
        eq(accounts.id, accountId),
        isNotNull(accounts.deletionScheduledAt),
        or(
          isNull(accounts.deletionCancelledAt),
          lte(accounts.deletionCancelledAt, accounts.deletionScheduledAt),
        ),
      ),
    )
    .returning({ id: accounts.id });

  return rows.length > 0 ? 'cancelled' : 'no_active_deletion';
}

export async function isDeletionCancelled(
  db: Database,
  accountId: string,
): Promise<boolean> {
  const row = await db.query.accounts.findFirst({
    where: eq(accounts.id, accountId),
  });
  if (!row) return false;
  return !!(
    row.deletionCancelledAt &&
    row.deletionScheduledAt &&
    row.deletionCancelledAt > row.deletionScheduledAt
  );
}

export async function getDeletionStatus(
  db: Database,
  accountId: string,
): Promise<AccountDeletionStatusResponse> {
  const row = await db.query.accounts.findFirst({
    where: eq(accounts.id, accountId),
  });
  if (!row) {
    throw new NotFoundError('Account');
  }

  const scheduledAt = row.deletionScheduledAt ?? null;
  const cancelledAt = row.deletionCancelledAt ?? null;
  // Deletion stays active when no later cancellation supersedes the schedule.
  // Equal timestamps are treated as scheduled, mirroring isDeletionCancelled().
  const scheduled =
    scheduledAt !== null &&
    (cancelledAt === null || cancelledAt <= scheduledAt);

  if (!scheduled || scheduledAt === null) {
    return {
      scheduled: false,
      deletionScheduledAt: null,
      gracePeriodEnds: null,
    };
  }

  return {
    scheduled: true,
    deletionScheduledAt: scheduledAt.toISOString(),
    gracePeriodEnds: new Date(
      scheduledAt.getTime() + GRACE_PERIOD_MS,
    ).toISOString(),
  };
}

// [BUG-844] Tells the scheduled-deletion Inngest function whether the
// account still exists after the 7-day sleep. The grace-period flow assumes
// the account is queryable on resume; if an admin or GC removed it during
// the sleep, both isDeletionCancelled() and executeDeletion() are still
// safe (the former returns false, the latter is idempotent), but the
// caller should NOT enter the delete branch — return early as
// 'already_deleted' so telemetry distinguishes it from a normal completion.
export async function accountExists(
  db: Database,
  accountId: string,
): Promise<boolean> {
  const row = await db.query.accounts.findFirst({
    where: eq(accounts.id, accountId),
  });
  return !!row;
}

export async function getProfileIdsForAccount(
  db: Database,
  accountId: string,
): Promise<string[]> {
  const rows = await db.query.profiles.findMany({
    where: eq(profiles.accountId, accountId),
  });
  return rows.map((p) => p.id);
}

/**
 * [R1] Reads the Clerk login id for an account so the scheduled-deletion job
 * can erase the external identity AFTER the DB cascade. Captured in its own
 * Inngest step (before executeDeletion removes the row) so the id survives the
 * delete and a retry of the Clerk-erasure step re-uses the memoized value.
 * Returns null if the account is gone or somehow has no credential.
 */
export async function getAccountClerkUserId(
  db: Database,
  accountId: string,
): Promise<string | null> {
  const row = await db.query.accounts.findFirst({
    where: eq(accounts.id, accountId),
    columns: { clerkUserId: true },
  });
  return row?.clerkUserId ?? null;
}

/**
 * Result of an executeDeletion call.
 * - 'deleted': account row was deleted (happy path).
 * - 'cancelled': the cancellation flag is set and later than the schedule,
 *   meaning the user cancelled during the grace period — do NOT delete.
 *   The Inngest caller must handle this as a no-op and return early.
 * - 'already_deleted': account row was not found (idempotent no-op).
 */
export type DeletionResult = 'deleted' | 'cancelled' | 'already_deleted';

export async function executeDeletion(
  db: Database,
  accountId: string,
): Promise<DeletionResult> {
  // [Fix Bug #494] Atomic TOCTOU guard: DELETE only when the account still has
  // an active (non-cancelled) deletion schedule. The WHERE expression mirrors
  // the isDeletionCancelled() check but executes atomically with the DELETE,
  // closing the race between cancelDeletion() and the post-grace-period
  // Inngest step.
  //
  // Conditions for deletion:
  //   1. id matches
  //   2. deletionScheduledAt IS NOT NULL  — deletion was actually scheduled
  //   3. deletionCancelledAt IS NULL      — never cancelled
  //      OR deletionCancelledAt <= deletionScheduledAt  — cancelled before the
  //         current schedule was created (i.e. cancel pre-dates this schedule)
  //
  // If 0 rows are deleted the account either never had a pending deletion,
  // was cancelled during the grace period, or was already removed.
  const result = await db
    .delete(accounts)
    .where(
      and(
        eq(accounts.id, accountId),
        isNotNull(accounts.deletionScheduledAt),
        or(
          isNull(accounts.deletionCancelledAt),
          lte(accounts.deletionCancelledAt, accounts.deletionScheduledAt),
        ),
      ),
    )
    .returning({ id: accounts.id });

  if (result.length > 0) {
    return 'deleted';
  }

  // Distinguish cancelled from already-deleted so callers get accurate telemetry.
  // Race-acceptable: if a concurrent process deletes the row between the UPDATE returning 0 rows and this SELECT, we'll report 'already_deleted' instead of 'cancelled' — telemetry-only impact.
  const existingRow = await db.query.accounts.findFirst({
    where: eq(accounts.id, accountId),
    columns: { id: true },
  });

  if (!existingRow) {
    // [CR-2026-05-21-009] rowCount=0 AND no account row — the account was
    // removed outside the normal grace-period flow (admin delete, concurrent
    // GC, or double-fire). This is always unexpected at this stage of the
    // deletion pipeline and must be surfaced, not silently swallowed.
    captureException(
      new Error('executeDeletion: account row missing before scheduled delete'),
      {
        extra: {
          surface: 'account.deletion',
          reason: 'row-missing-on-execute',
          accountId,
        },
      },
    );
    return 'already_deleted';
  }

  return 'cancelled';
}

export async function deleteProfile(
  db: Database,
  profileId: string,
): Promise<void> {
  // FK cascades handle all child records (subjects, sessions, consent_states, etc.).
  // Idempotent — no-op if already deleted.
  await db.delete(profiles).where(eq(profiles.id, profileId));
}

export async function deleteProfileIfConsentWithdrawn(
  db: Database,
  profileId: string,
  revokedAt?: Date | string,
): Promise<boolean> {
  const revokedAtDate =
    revokedAt instanceof Date
      ? revokedAt
      : revokedAt
        ? new Date(revokedAt)
        : undefined;
  if (revokedAtDate && Number.isNaN(revokedAtDate.getTime())) return false;

  const result = await db.execute(sql`
    WITH locked_consent AS (
      SELECT 1 FROM consent_states
      WHERE consent_states.profile_id = ${profileId}
      AND consent_states.consent_type = 'GDPR'
      AND consent_states.status = 'WITHDRAWN'
      ${revokedAtDate ? sql`AND consent_states.responded_at = ${revokedAtDate}` : sql``}
      FOR UPDATE
    )
    DELETE FROM profiles
    WHERE id = ${profileId}
    AND EXISTS (SELECT 1 FROM locked_consent)
  `);
  return (result.rowCount ?? 0) > 0;
}

/**
 * CI-11: Atomically deletes a profile only if no CONSENTED or WITHDRAWN
 * consent state exists. Used by the consent-reminder Inngest function
 * for GDPR auto-delete after the 30-day window.
 *
 * The atomic WHERE + NOT EXISTS eliminates the TOCTOU race where a parent
 * could approve consent between a status check and the deletion.
 * FK cascades remove all child records (subjects, sessions, consent_states, etc.).
 *
 * Returns true if the profile was deleted, false if it was retained
 * (consent was granted or profile already removed).
 */
export async function deleteProfileIfNoConsent(
  db: Database,
  profileId: string,
  requestedAt?: Date,
): Promise<boolean> {
  const requestedAtUpperBound = requestedAt
    ? new Date(requestedAt.getTime() + 1)
    : undefined;
  const requestGenerationPredicate = requestedAt
    ? sql`
      AND EXISTS (
        SELECT 1 FROM consent_states
        WHERE consent_states.profile_id = ${profileId}
        AND consent_states.consent_type = 'GDPR'
        AND consent_states.requested_at >= ${requestedAt}
        AND consent_states.requested_at < ${requestedAtUpperBound}
        AND consent_states.status NOT IN ('CONSENTED', 'WITHDRAWN')
      )
    `
    : sql``;

  const result = await db.execute(sql`
    DELETE FROM profiles WHERE id = ${profileId}
    AND NOT EXISTS (
      SELECT 1 FROM consent_states
      WHERE consent_states.profile_id = ${profileId}
      AND consent_states.consent_type = 'GDPR'
      AND consent_states.status IN ('CONSENTED', 'WITHDRAWN')
    )
    ${requestGenerationPredicate}
  `);
  // Drizzle returns rowCount for DELETE operations
  return (result.rowCount ?? 0) > 0;
}
