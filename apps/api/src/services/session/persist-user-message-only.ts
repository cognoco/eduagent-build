import { eq, and } from 'drizzle-orm';
import {
  sessionEvents,
  learningSessions,
  type Database,
} from '@eduagent/database';
import type { OrphanReason } from '@eduagent/schemas';
import { BadRequestError, ForbiddenError } from '@eduagent/schemas';

interface Options {
  clientId: string;
  orphanReason: OrphanReason;
}

export async function persistUserMessageOnly(
  db: Database,
  profileId: string,
  sessionId: string,
  message: string,
  options: Options
): Promise<void> {
  if (!options.clientId || options.clientId.length === 0) {
    throw new BadRequestError(
      'persistUserMessageOnly: Idempotency-Key required for orphan persistence ' +
        '(missing clientId would defeat Layer 1 retry dedup)'
    );
  }

  const owningSession = await db.query.learningSessions.findFirst({
    where: and(
      eq(learningSessions.id, sessionId),
      eq(learningSessions.profileId, profileId)
    ),
    columns: { id: true, profileId: true, subjectId: true },
  });
  if (!owningSession || owningSession.profileId !== profileId) {
    throw new ForbiddenError(
      'persistUserMessageOnly: session does not belong to profile'
    );
  }

  await db
    .insert(sessionEvents)
    .values({
      sessionId,
      profileId,
      subjectId: owningSession.subjectId,
      eventType: 'user_message' as const,
      content: message,
      clientId: options.clientId,
      orphanReason: options.orphanReason,
    })
    .onConflictDoNothing({
      target: [sessionEvents.sessionId, sessionEvents.clientId],
    });
}
