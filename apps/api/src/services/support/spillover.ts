import { supportMessages, type Database } from '@eduagent/database';

export interface OutboxSpilloverEntry {
  id: string;
  flow: 'session' | 'interview';
  surfaceKey: string;
  content: string;
  attempts: number;
  firstAttemptedAt: string;
  failureReason?: string;
}

export async function recordOutboxSpillover(
  db: Database,
  profileId: string,
  entries: OutboxSpilloverEntry[]
): Promise<{ written: number }> {
  // Write: explicit profileId on every row + uniqueness on (profileId, clientId)
  // means re-spills from the same device are idempotent and can never insert
  // under another profile's scope.
  const inserted = await db
    .insert(supportMessages)
    .values(
      entries.map((entry) => ({
        profileId,
        clientId: entry.id,
        flow: entry.flow,
        surfaceKey: entry.surfaceKey,
        content: entry.content,
        attempts: entry.attempts,
        firstAttemptedAt: new Date(entry.firstAttemptedAt),
        failureReason: entry.failureReason,
      }))
    )
    .onConflictDoNothing({
      target: [supportMessages.profileId, supportMessages.clientId],
    })
    .returning({ id: supportMessages.id });

  return { written: inserted.length };
}
