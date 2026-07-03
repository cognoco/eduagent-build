import { and, eq, isNull } from 'drizzle-orm';

import {
  supportVisibilityContracts,
  supportership,
  type Database,
} from '@eduagent/database';
import type { RevocationNotice } from '@eduagent/schemas';

import { ForbiddenError, NotFoundError } from '../errors';
import { writeVisibilityAuditEvent } from './linking-ceremony';

export const SUPPORTERSHIP_GRACE_DAYS = 7;

export async function requestSelfUnlink(
  db: Database,
  input: {
    supportershipId: string;
    callerPersonId: string;
    now?: Date;
  },
): Promise<RevocationNotice> {
  const now = input.now ?? new Date();
  const rows = await db
    .select({
      edge: supportership,
      contract: supportVisibilityContracts,
    })
    .from(supportership)
    .leftJoin(
      supportVisibilityContracts,
      eq(supportVisibilityContracts.supportershipId, supportership.id),
    )
    .where(
      and(
        eq(supportership.id, input.supportershipId),
        isNull(supportership.revokedAt),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) throw new NotFoundError('Supportership not found.');
  if (row.edge.supporteePersonId !== input.callerPersonId) {
    throw new ForbiddenError('Only the supportee can end this support link.');
  }

  const graceEndsAt = new Date(
    now.getTime() + SUPPORTERSHIP_GRACE_DAYS * 24 * 60 * 60 * 1000,
  );
  await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;

    await tx
      .update(supportership)
      .set({ revokedAt: now, updatedAt: now })
      .where(eq(supportership.id, input.supportershipId));

    if (row.contract) {
      await tx
        .update(supportVisibilityContracts)
        .set({ status: 'revoked', updatedAt: now })
        .where(eq(supportVisibilityContracts.id, row.contract.id));
    }

    await writeVisibilityAuditEvent(txDb, {
      supportershipId: row.edge.id,
      contractId: row.contract?.id,
      actorPersonId: input.callerPersonId,
      eventType: 'supportership_revoked',
      payload: {
        revokedAt: now.toISOString(),
        graceEndsAt: graceEndsAt.toISOString(),
      },
    });
    // WI-1176: do NOT write a support_link_ended notice here. The Inngest
    // function (inngest/functions/supportership-revocation.ts) is the sole
    // producer, writing the schema-correct {..., graceDays} payload after
    // the grace-window sleep. Writing it here with graceEndsAt fails
    // supportLinkEndedPayloadSchema post-insert and rolls back this tx.
  });

  return {
    supportershipId: row.edge.id,
    supporteePersonId: row.edge.supporteePersonId,
    supporterPersonId: row.edge.supporterPersonId,
    revokedAt: now.toISOString(),
    graceEndsAt: graceEndsAt.toISOString(),
  };
}
