// ---------------------------------------------------------------------------
// Account Deletion Service — Story 0.6
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { accounts, profiles, type Database } from '@eduagent/database';
import type { AccountDeletionStatusResponse } from '@eduagent/schemas';

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

    const existing = await getDeletionStatus(db, accountId);
    if (existing.scheduled && existing.gracePeriodEnds) {
      return { gracePeriodEnds: existing.gracePeriodEnds, scheduledNow: false };
    }
  }

  throw new Error(`account deletion scheduling failed: ${accountId}`);
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
          sql`${accounts.deletionCancelledAt} >= ${accounts.deletionScheduledAt}`,
        ),
      ),
    )
    .returning({ deletionScheduledAt: accounts.deletionScheduledAt });

  return updated?.deletionScheduledAt ?? null;
}

export async function cancelDeletion(
  db: Database,
  accountId: string,
): Promise<void> {
  await db
    .update(accounts)
    .set({ deletionCancelledAt: new Date() })
    .where(eq(accounts.id, accountId));
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
    throw new Error(`account not found: ${accountId}`);
  }

  const scheduledAt = row.deletionScheduledAt ?? null;
  const cancelledAt = row.deletionCancelledAt ?? null;
  const scheduled =
    scheduledAt !== null && (cancelledAt === null || cancelledAt < scheduledAt);

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

export async function executeDeletion(
  db: Database,
  accountId: string,
): Promise<void> {
  // FK cascades handle all child records. Idempotent — no-op if already deleted.
  await db.delete(accounts).where(eq(accounts.id, accountId));
}

export async function deleteProfile(
  db: Database,
  profileId: string,
): Promise<void> {
  // FK cascades handle all child records (subjects, sessions, consent_states, etc.).
  // Idempotent — no-op if already deleted.
  await db.delete(profiles).where(eq(profiles.id, profileId));
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
): Promise<boolean> {
  const result = await db.execute(sql`
    DELETE FROM profiles WHERE id = ${profileId}
    AND NOT EXISTS (
      SELECT 1 FROM consent_states
      WHERE consent_states.profile_id = ${profileId}
      AND consent_states.status IN ('CONSENTED', 'WITHDRAWN')
    )
  `);
  // Drizzle returns rowCount for DELETE operations
  return (result.rowCount ?? 0) > 0;
}
