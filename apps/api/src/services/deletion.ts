// ---------------------------------------------------------------------------
// Account Deletion Service — Story 0.6
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

const GRACE_PERIOD_DAYS = 7;

export async function scheduleDeletion(
  accountId: string
): Promise<{ gracePeriodEnds: string }> {
  // TODO: Set deletionScheduledAt on account record
  void accountId;
  const gracePeriodEnds = new Date(
    Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  return { gracePeriodEnds };
}

export async function cancelDeletion(accountId: string): Promise<void> {
  // TODO: Set deletionCancelledAt on account record
  void accountId;
}

export async function isDeletionCancelled(accountId: string): Promise<boolean> {
  // TODO: Check if deletionCancelledAt > deletionScheduledAt
  void accountId;
  return false;
}

export async function executeDeletion(accountId: string): Promise<void> {
  // TODO: Delete account row (cascades to profiles → familyLinks, consentStates, all learning data)
  // Idempotent — no-op if account already deleted
  void accountId;
}
