// ---------------------------------------------------------------------------
// Account Deletion Service — Story 0.6
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { eq } from 'drizzle-orm';
import { accounts, profiles, type Database } from '@eduagent/database';

const GRACE_PERIOD_DAYS = 7;

export async function scheduleDeletion(
  db: Database,
  accountId: string
): Promise<{ gracePeriodEnds: string }> {
  const now = new Date();
  await db
    .update(accounts)
    .set({ deletionScheduledAt: now })
    .where(eq(accounts.id, accountId));

  const gracePeriodEnds = new Date(
    now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  return { gracePeriodEnds };
}

export async function cancelDeletion(
  db: Database,
  accountId: string
): Promise<void> {
  await db
    .update(accounts)
    .set({ deletionCancelledAt: new Date() })
    .where(eq(accounts.id, accountId));
}

export async function isDeletionCancelled(
  db: Database,
  accountId: string
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

export async function getProfileIdsForAccount(
  db: Database,
  accountId: string
): Promise<string[]> {
  const rows = await db.query.profiles.findMany({
    where: eq(profiles.accountId, accountId),
  });
  return rows.map((p) => p.id);
}

export async function executeDeletion(
  db: Database,
  accountId: string
): Promise<void> {
  // FK cascades handle all child records. Idempotent — no-op if already deleted.
  await db.delete(accounts).where(eq(accounts.id, accountId));
}

export async function deleteProfile(
  db: Database,
  profileId: string
): Promise<void> {
  // FK cascades handle all child records (subjects, sessions, consent_states, etc.).
  // Idempotent — no-op if already deleted.
  await db.delete(profiles).where(eq(profiles.id, profileId));
}
