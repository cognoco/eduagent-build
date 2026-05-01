import { sql, eq, and } from 'drizzle-orm';
import { onboardingDrafts, type Database } from '@eduagent/database';
import type { OrphanReason } from '@eduagent/schemas';
import { BadRequestError, NotFoundError } from '@eduagent/schemas';

interface Options {
  clientId: string;
  orphanReason: OrphanReason;
}

export async function appendOrphanInterviewTurn(
  db: Database,
  profileId: string,
  draftId: string,
  message: string,
  options: Options
): Promise<void> {
  if (!options.clientId || options.clientId.length === 0) {
    throw new BadRequestError(
      'appendOrphanInterviewTurn: Idempotency-Key required for orphan persistence'
    );
  }

  const newEntry = {
    role: 'user' as const,
    content: message,
    client_id: options.clientId,
    orphan_reason: options.orphanReason,
  };

  // Single-statement atomic dedup-and-append. The @> probe checks whether
  // any existing array element already contains this client_id. If so, zero
  // rows update — true no-op, no race.
  const result = await db
    .update(onboardingDrafts)
    .set({
      exchangeHistory: sql`COALESCE(${
        onboardingDrafts.exchangeHistory
      }, '[]'::jsonb) || ${JSON.stringify([newEntry])}::jsonb`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(onboardingDrafts.id, draftId),
        eq(onboardingDrafts.profileId, profileId),
        sql`NOT (COALESCE(${
          onboardingDrafts.exchangeHistory
        }, '[]'::jsonb) @> ${JSON.stringify([
          { client_id: options.clientId },
        ])}::jsonb)`
      )
    )
    .returning({ id: onboardingDrafts.id });

  // result is empty in two cases:
  //   1. dedup hit (clientId already in array) — desired no-op
  //   2. draft does not exist or profileId mismatch — error
  if (result.length === 0) {
    const exists = await db.query.onboardingDrafts.findFirst({
      where: and(
        eq(onboardingDrafts.id, draftId),
        eq(onboardingDrafts.profileId, profileId)
      ),
      columns: { id: true },
    });
    if (!exists) throw new NotFoundError('Draft');
  }
}
