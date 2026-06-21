import { and, eq, isNull } from 'drizzle-orm';

import {
  supportVisibilityContracts,
  supportership,
  type Database,
} from '@eduagent/database';
import type { RevocationNotice } from '@eduagent/schemas';

import { ForbiddenError, NotFoundError } from '../errors';
import { createVisibilityNotice } from './visibility-moment-projections';
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

  await db
    .update(supportership)
    .set({ revokedAt: now, updatedAt: now })
    .where(eq(supportership.id, input.supportershipId));

  if (row.contract) {
    await db
      .update(supportVisibilityContracts)
      .set({ status: 'revoked', updatedAt: now })
      .where(eq(supportVisibilityContracts.id, row.contract.id));
  }

  const graceEndsAt = new Date(
    now.getTime() + SUPPORTERSHIP_GRACE_DAYS * 24 * 60 * 60 * 1000,
  );
  await writeVisibilityAuditEvent(db, {
    supportershipId: row.edge.id,
    contractId: row.contract?.id,
    actorPersonId: input.callerPersonId,
    eventType: 'supportership_revoked',
    payload: {
      revokedAt: now.toISOString(),
      graceEndsAt: graceEndsAt.toISOString(),
    },
  });
  await createVisibilityNotice(db, {
    supportershipId: row.edge.id,
    contractId: row.contract?.id,
    noticeType: 'support_link_ended',
    targetAudience: 'supporter',
    targetPersonId: row.edge.supporterPersonId,
    payload: {
      supporteePersonId: row.edge.supporteePersonId,
      revokedAt: now.toISOString(),
      graceEndsAt: graceEndsAt.toISOString(),
    },
  });

  return {
    supportershipId: row.edge.id,
    supporteePersonId: row.edge.supporteePersonId,
    supporterPersonId: row.edge.supporterPersonId,
    revokedAt: now.toISOString(),
    graceEndsAt: graceEndsAt.toISOString(),
  };
}
