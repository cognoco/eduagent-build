import { asc, eq, inArray } from 'drizzle-orm';
import {
  terminalDeletionFailureOutbox,
  type Database,
} from '@eduagent/database';
import type { TerminalFailureErrorName } from '@eduagent/schemas';

export type TerminalDeletionFailureEventName =
  | 'app/account.deletion_teardown.failed'
  | 'app/billing.subscription_store_teardown.failed';

export interface TerminalDeletionFailureRecord {
  signalId: string;
  eventName: TerminalDeletionFailureEventName;
  accountId: string | null;
  runId: string | null;
  errorName: TerminalFailureErrorName;
  occurredAt: Date;
}

/**
 * Idempotently persists the terminal signal before its best-effort direct
 * dispatch. The deterministic signal id lets the original failure handler,
 * the platform failure observer, and the recovery sweep converge on one row.
 */
export async function persistTerminalDeletionFailure(
  db: Database,
  record: TerminalDeletionFailureRecord,
): Promise<void> {
  await db
    .insert(terminalDeletionFailureOutbox)
    .values(record)
    .onConflictDoNothing({ target: terminalDeletionFailureOutbox.signalId });
}

export async function listTerminalDeletionFailures(
  db: Database,
  limit: number,
): Promise<TerminalDeletionFailureRecord[]> {
  return db
    .select({
      signalId: terminalDeletionFailureOutbox.signalId,
      eventName: terminalDeletionFailureOutbox.eventName,
      accountId: terminalDeletionFailureOutbox.accountId,
      runId: terminalDeletionFailureOutbox.runId,
      errorName: terminalDeletionFailureOutbox.errorName,
      occurredAt: terminalDeletionFailureOutbox.occurredAt,
    })
    .from(terminalDeletionFailureOutbox)
    .orderBy(asc(terminalDeletionFailureOutbox.createdAt))
    .limit(limit) as Promise<TerminalDeletionFailureRecord[]>;
}

export async function deleteTerminalDeletionFailure(
  db: Database,
  signalId: string,
): Promise<void> {
  await db
    .delete(terminalDeletionFailureOutbox)
    .where(eq(terminalDeletionFailureOutbox.signalId, signalId));
}

export async function deleteTerminalDeletionFailures(
  db: Database,
  signalIds: string[],
): Promise<void> {
  if (signalIds.length === 0) return;
  await db
    .delete(terminalDeletionFailureOutbox)
    .where(inArray(terminalDeletionFailureOutbox.signalId, signalIds));
}
